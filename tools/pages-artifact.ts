import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { crc32 } from "./crc32.js";

export interface PagesArtifactFile {
  path: string;
  bytes: Uint8Array;
}
export interface PagesArtifactLimits {
  maxArchiveBytes: number;
  maxTarBytes: number;
  maxFiles: number;
}
export interface PagesArtifactContents {
  stage: "pages-artifact-contents";
  archiveSha256: string;
  archiveBytes: number;
  tarBytes: number;
  fileCount: number;
  directoryCount: number;
  totalFileBytes: number;
}
const archiveName = Buffer.from("artifact.tar", "ascii");
const gnuTar = Buffer.from("ustar  \0", "ascii");
const safePath = (path: string) => path.length > 0 && path.length <= 98 &&
  /^[A-Za-z0-9._/-]+$/.test(path) && path.split("/").every(part => part && part !== "." && part !== "..");
const view = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const bounded = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;

function tarNumber(bytes: Buffer): number {
  const text = bytes.toString("ascii");
  if (bytes.some(byte => byte > 127) || !/^ *[0-7]+[\0 ]*$/.test(text)) throw new Error("Unsupported Pages tar numeric field");
  const value = Number.parseInt(text.trim().replace(/\0.*$/, ""), 8);
  if (!Number.isSafeInteger(value)) throw new Error("Unsafe Pages tar numeric field");
  return value;
}
function tarName(bytes: Buffer, directory: boolean): string {
  const terminator = bytes.indexOf(0), end = terminator < 0 ? bytes.length : terminator;
  if (bytes.subarray(end).some(byte => byte !== 0) || bytes.some(byte => byte > 127)) {
    throw new Error("Unsupported Pages tar member name");
  }
  const name = bytes.subarray(0, end).toString("ascii");
  if (name === "./" && directory) return "";
  const path = name.slice(2, directory ? -1 : undefined);
  if (!name.startsWith("./") || (directory && !name.endsWith("/")) || !safePath(path)) {
    throw new Error("Unsafe Pages tar member path");
  }
  return path;
}

// Current upload-pages-artifact profile: one classic DEFLATE ZIP member with a signed data descriptor, containing GNU tar.
export function verifyPagesArtifactContents(archive: Uint8Array, expectedFiles: readonly PagesArtifactFile[],
  limits: PagesArtifactLimits): PagesArtifactContents {
  if (!limits || !bounded(limits.maxArchiveBytes) || !bounded(limits.maxTarBytes) || !bounded(limits.maxFiles) ||
      !(archive instanceof Uint8Array) || archive.length > limits.maxArchiveBytes ||
      !Array.isArray(expectedFiles) || expectedFiles.length < 1 || expectedFiles.length > limits.maxFiles) {
    throw new Error("Invalid Pages artifact inputs or limits");
  }
  const expected = new Map<string, Buffer>(), directories = new Set([""]);
  let totalFileBytes = 0;
  for (const file of expectedFiles) {
    if (!file || typeof file.path !== "string" || !safePath(file.path) ||
        !(file.bytes instanceof Uint8Array) || expected.has(file.path)) throw new Error("Invalid or duplicate expected Pages file");
    totalFileBytes += file.bytes.length;
    if (totalFileBytes > limits.maxTarBytes) throw new Error("Expected Pages files exceed tar byte limit");
    expected.set(file.path, view(file.bytes));
    const parts = file.path.split("/");
    for (let index = 1; index < parts.length; index++) directories.add(parts.slice(0, index).join("/"));
  }
  if ([...expected.keys()].some(path => directories.has(path))) throw new Error("Expected Pages file and directory paths collide");

  const bytes = view(archive), end = bytes.length - 22;
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt32LE(end + 4) !== 0 ||
      bytes.readUInt16LE(end + 8) !== 1 || bytes.readUInt16LE(end + 10) !== 1 || bytes.readUInt16LE(end + 20) !== 0) {
    throw new Error("Unsupported Pages ZIP end record");
  }
  const central = bytes.readUInt32LE(end + 16), centralSize = 46 + archiveName.length;
  if (central + centralSize !== end || bytes.readUInt32LE(end + 12) !== centralSize ||
      bytes.readUInt32LE(central) !== 0x02014b50 || bytes.readUInt16LE(central + 6) !== 20 ||
      bytes.readUInt16LE(central + 8) !== 8 || bytes.readUInt16LE(central + 10) !== 8 ||
      bytes.readUInt16LE(central + 28) !== archiveName.length || bytes.readUInt16LE(central + 30) !== 0 ||
      bytes.readUInt16LE(central + 32) !== 0 || bytes.readUInt16LE(central + 34) !== 0 ||
      bytes.readUInt32LE(central + 42) !== 0 ||
      !bytes.subarray(central + 46, end).equals(archiveName)) throw new Error("Unsupported Pages ZIP directory");
  const mode = (bytes.readUInt32LE(central + 38) >>> 16) & 0xf000;
  if (mode !== 0 && mode !== 0x8000) throw new Error("Pages ZIP member must be a regular file");
  const checksum = bytes.readUInt32LE(central + 16), compressed = bytes.readUInt32LE(central + 20),
    decoded = bytes.readUInt32LE(central + 24), start = 30 + archiveName.length;
  if (decoded < 1024 || decoded > limits.maxTarBytes || compressed < 1 || start + compressed + 16 !== central ||
      bytes.readUInt32LE(0) !== 0x04034b50 || bytes.readUInt16LE(4) !== 20 ||
      bytes.readUInt16LE(6) !== 8 || bytes.readUInt16LE(8) !== 8 || bytes.readUInt32LE(14) !== 0 ||
      bytes.readUInt32LE(18) !== 0 || bytes.readUInt32LE(22) !== 0 ||
      bytes.readUInt16LE(26) !== archiveName.length || bytes.readUInt16LE(28) !== 0 ||
      !bytes.subarray(30, start).equals(archiveName) ||
      bytes.readUInt32LE(start + compressed) !== 0x08074b50 ||
      bytes.readUInt32LE(start + compressed + 4) !== checksum ||
      bytes.readUInt32LE(start + compressed + 8) !== compressed ||
      bytes.readUInt32LE(start + compressed + 12) !== decoded) throw new Error("Unsupported or inconsistent Pages ZIP member");
  const inflated: unknown = inflateRawSync(bytes.subarray(start, start + compressed), { maxOutputLength: limits.maxTarBytes, info: true });
  if (!inflated || typeof inflated !== "object" || !("buffer" in inflated) || !Buffer.isBuffer(inflated.buffer) ||
      !("engine" in inflated) || !inflated.engine || typeof inflated.engine !== "object" ||
      !("bytesWritten" in inflated.engine) || inflated.engine.bytesWritten !== compressed) {
    throw new Error("Pages ZIP decompression did not consume the exact compressed member");
  }
  const tar = inflated.buffer;
  if (tar.length !== decoded || crc32(tar) !== checksum || tar.length % 512 !== 0) {
    throw new Error("Pages ZIP decoded bytes, size or CRC do not match");
  }

  const seen = new Set<string>(), seenFiles = new Set<string>(), seenDirectories = new Set<string>();
  let offset = 0;
  while (offset + 512 <= tar.length && tar.subarray(offset, offset + 512).some(byte => byte !== 0)) {
    const header = tar.subarray(offset, offset + 512), path = tarName(header.subarray(0, 100), header[156] === 53);
    const size = tarNumber(header.subarray(124, 136));
    const checksum = tarNumber(header.subarray(148, 156));
    let actualChecksum = 0;
    for (let index = 0; index < 512; index++) actualChecksum += index >= 148 && index < 156 ? 32 : header[index]!;
    if (checksum !== actualChecksum || !header.subarray(257, 265).equals(gnuTar) ||
        header.subarray(157, 257).some(byte => byte !== 0) || header.subarray(345).some(byte => byte !== 0) ||
        seen.has(path) || seen.size >= expected.size + directories.size) throw new Error("Unsupported, corrupt or duplicate Pages tar member");
    seen.add(path);
    const start = offset + 512, next = start + Math.ceil(size / 512) * 512;
    if (next > tar.length || tar.subarray(start + size, next).some(byte => byte !== 0)) {
      throw new Error("Pages tar member extent or padding is invalid");
    }
    if (header[156] === 53) {
      if (size !== 0 || !directories.has(path)) throw new Error("Unexpected Pages tar directory");
      seenDirectories.add(path);
    } else {
      const file = expected.get(path);
      if (header[156] !== 48 || !file || file.length !== size || !tar.subarray(start, start + size).equals(file)) {
        throw new Error("Pages tar file does not match the expected file set and bytes");
      }
      seenFiles.add(path);
    }
    offset = next;
  }
  if (tar.length - offset < 1024 || tar.subarray(offset).some(byte => byte !== 0) ||
      seenFiles.size !== expected.size || seenDirectories.size !== directories.size) {
    throw new Error("Pages tar is incomplete or has invalid trailing bytes");
  }
  return { stage: "pages-artifact-contents", archiveSha256: createHash("sha256").update(bytes).digest("hex"),
    archiveBytes: bytes.length, tarBytes: tar.length, fileCount: seenFiles.size,
    directoryCount: seenDirectories.size, totalFileBytes };
}
