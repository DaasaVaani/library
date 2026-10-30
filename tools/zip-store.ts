import { createHash } from "node:crypto";
import { crc32 } from "./crc32.js";

export interface ZipStoreLimits {
  maxMembers: number;
  maxArchiveBytes: number;
}
export interface ZipStoreObject {
  path: string;
  bytes: Uint8Array;
}

const localSize = 30, directorySize = 46, endSize = 22;
const zip32Max = 0xffffffff;
const objectPath = /^objects\/[0-9a-f]{64}\.json\.gz$/;

function limits(value: ZipStoreLimits) {
  if (!Number.isSafeInteger(value.maxMembers) || value.maxMembers < 1 || value.maxMembers >= 0xffff ||
      !Number.isSafeInteger(value.maxArchiveBytes) || value.maxArchiveBytes < endSize ||
      value.maxArchiveBytes >= zip32Max) throw new Error("Invalid classic ZIP limits; ZIP64 is not supported");
}

function header(path: string, bytes: Uint8Array, offset?: number): Buffer {
  const central = offset !== undefined;
  const name = Buffer.from(path, "ascii");
  const result = Buffer.alloc((central ? directorySize : localSize) + name.length);
  result.writeUInt32LE(central ? 0x02014b50 : 0x04034b50, 0);
  if (central) result.writeUInt16LE(20, 4); // Fixed DOS creator; no host-specific attributes.
  const base = central ? 6 : 4;
  result.writeUInt16LE(20, base);
  result.writeUInt16LE(0x21, base + 8); // 1980-01-01, midnight.
  result.writeUInt32LE(crc32(bytes), base + 10);
  result.writeUInt32LE(bytes.length, base + 14);
  result.writeUInt32LE(bytes.length, base + 18);
  result.writeUInt16LE(name.length, base + 22);
  if (central) result.writeUInt32LE(offset, 42);
  name.copy(result, central ? directorySize : localSize);
  return result;
}

export function zipStoreMemberSize(object: ZipStoreObject): number {
  if (!objectPath.test(object.path)) throw new Error("Unsafe ZIP object path");
  if (!(object.bytes instanceof Uint8Array) || object.bytes.length >= zip32Max) throw new Error("Invalid ZIP object bytes");
  if (object.path !== `objects/${createHash("sha256").update(object.bytes).digest("hex")}.json.gz`) {
    throw new Error("ZIP object path does not match original encoded bytes");
  }
  return localSize + directorySize + 2 * object.path.length + object.bytes.length;
}

/** Packages already validated gzip objects without inflating or recompressing them. */
export function encodeZipStore(objects: readonly ZipStoreObject[], bounds: ZipStoreLimits): Buffer {
  limits(bounds);
  if (objects.length > bounds.maxMembers) throw new Error("ZIP member limit exceeded");
  const seen = new Set<string>();
  let size = endSize;
  for (const object of objects) {
    if (seen.has(object.path)) throw new Error("Unsafe or duplicate ZIP object path");
    seen.add(object.path);
    size += zipStoreMemberSize(object);
    if (size > bounds.maxArchiveBytes) throw new Error("ZIP archive byte limit exceeded");
  }
  const sorted = [...objects].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const parts: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0, directoryBytes = 0;
  for (const object of sorted) {
    const local = header(object.path, object.bytes);
    const central = header(object.path, object.bytes, offset);
    parts.push(local, object.bytes);
    directory.push(central);
    offset += local.length + object.bytes.length;
    directoryBytes += central.length;
  }
  const end = Buffer.alloc(endSize);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(directoryBytes, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...directory, end], size);
}

/** Strictly verifies this producer's deterministic classic STORE profile, not arbitrary ZIPs. */
export function decodeZipStore(archive: Uint8Array, bounds: ZipStoreLimits): ZipStoreObject[] {
  limits(bounds);
  if (archive.length < endSize || archive.length > bounds.maxArchiveBytes) throw new Error("Invalid ZIP archive byte length");
  const bytes = Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = bytes.length - endSize;
  if (bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt32LE(end + 4) !== 0 ||
      bytes.readUInt16LE(end + 20) !== 0) throw new Error("Invalid ZIP end record");
  const count = bytes.readUInt16LE(end + 10);
  const directory = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || count > bounds.maxMembers || bytes.readUInt16LE(end + 8) !== count ||
      directory === zip32Max || directory > end || bytes.readUInt32LE(end + 12) !== end - directory) {
    throw new Error("Invalid ZIP directory or member count; ZIP64 is not supported");
  }
  const objects: ZipStoreObject[] = [];
  let offset = 0;
  for (let index = 0; index < count; index++) {
    if (offset + localSize > directory || bytes.readUInt32LE(offset) !== 0x04034b50) throw new Error("Invalid ZIP local header");
    const size = bytes.readUInt32LE(offset + 18);
    const nameSize = bytes.readUInt16LE(offset + 26);
    const start = offset + localSize + nameSize;
    if (size === zip32Max || bytes.readUInt16LE(offset + 28) !== 0 || start + size > directory) {
      throw new Error("Invalid ZIP member extent or extra field");
    }
    const name = bytes.subarray(offset + localSize, start);
    if (name.some(byte => byte > 0x7f)) throw new Error("Invalid ZIP object path encoding");
    objects.push({ path: name.toString("ascii"), bytes: bytes.subarray(start, start + size) });
    offset = start + size;
  }
  // Exact reconstruction verifies CRC, STORE-only flags/method, both headers,
  // order, offsets, timestamps, attributes, no extras/comments/trailing records.
  if (offset !== directory || !encodeZipStore(objects, bounds).equals(bytes)) throw new Error("Noncanonical or corrupt ZIP STORE archive");
  return objects.map(object => ({ path: object.path, bytes: Buffer.from(object.bytes) }));
}
