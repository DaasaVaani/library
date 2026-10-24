import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { deterministicGzip } from "./publisher.js";
import { encodeZipStore, decodeZipStore } from "./zip-store.js";

const bounds = { maxMembers: 4, maxArchiveBytes: 4096 };
const object = (bytes: Uint8Array) => ({
  path: `objects/${createHash("sha256").update(bytes).digest("hex")}.json.gz`, bytes
});
const first = object(deterministicGzip(Buffer.from('{"fixture":"one"}')));
const second = object(deterministicGzip(Buffer.from('{"fixture":"two"}')));
const overhead = (path: string) => 30 + 46 + 2 * path.length;

test("STORE bytes, order and metadata are deterministic; original gzip bytes survive unchanged", () => {
  const input = [second, first], before = input.map(value => Buffer.from(value.bytes));
  const archive = encodeZipStore(input, bounds);
  assert.deepEqual(archive, encodeZipStore([...input].reverse(), bounds));
  const decoded = decodeZipStore(archive, bounds);
  assert.deepEqual(decoded.map(value => value.path), input.map(value => value.path).sort());
  for (const entry of decoded) {
    const original = input.find(value => value.path === entry.path)!;
    assert.deepEqual(entry.bytes, original.bytes);
    assert.deepEqual(gunzipSync(entry.bytes), gunzipSync(original.bytes));
  }
  assert.deepEqual(input.map(value => Buffer.from(value.bytes)), before);
  assert.equal(archive.length, 22 + input.reduce((total, entry) => total + overhead(entry.path) + entry.bytes.length, 0));
  assert.equal(archive.readUInt16LE(4), 20);
  assert.equal(archive.readUInt16LE(6), 0);
  assert.equal(archive.readUInt16LE(8), 0);
  assert.equal(archive.readUInt16LE(10), 0);
  assert.equal(archive.readUInt16LE(12), 0x21);
  const containing = Buffer.concat([Buffer.from([1]), archive, Buffer.from([2])]);
  assert.deepEqual(decodeZipStore(containing.subarray(1, -1), bounds), decoded);
  decoded[0]!.bytes.fill(0);
  assert.deepEqual(encodeZipStore(input, bounds), archive);
});

test("known synthetic empty-gzip CRC32 and central directory agree with ZIP layout", () => {
  const member = object(Buffer.from("1f8b08000000000000ff03000000000000000000", "hex"));
  assert.equal(gunzipSync(member.bytes).length, 0);
  const archive = encodeZipStore([member], bounds);
  const central = 30 + member.path.length + member.bytes.length;
  assert.equal(archive.readUInt32LE(14), 0x45378550);
  assert.equal(archive.readUInt32LE(18), member.bytes.length);
  assert.equal(archive.readUInt32LE(22), member.bytes.length);
  assert.equal(archive.readUInt32LE(central), 0x02014b50);
  assert.equal(archive.readUInt32LE(central + 16), 0x45378550);
  assert.equal(archive.readUInt32LE(central + 42), 0);
  assert.equal(archive.readUInt32LE(archive.length - 6), central);
  assert.deepEqual(decodeZipStore(archive, bounds)[0], member);
});

test("exact archive overhead and member bounds are inclusive; refusal returns no partial result", () => {
  const archive = encodeZipStore([first, second], bounds);
  const exact = { maxMembers: 2, maxArchiveBytes: archive.length };
  assert.deepEqual(encodeZipStore([first, second], exact), archive);
  assert.equal(decodeZipStore(archive, exact).length, 2);
  for (const smaller of [{ ...exact, maxMembers: 1 }, { ...exact, maxArchiveBytes: archive.length - 1 }]) {
    assert.throws(() => encodeZipStore([first, second], smaller), /limit/);
    assert.throws(() => decodeZipStore(archive, smaller));
  }
  assert.throws(() => encodeZipStore([first], { ...bounds, maxArchiveBytes: first.bytes.length + 22 }), /limit/);
  const empty = encodeZipStore([], { maxMembers: 1, maxArchiveBytes: 22 });
  assert.equal(empty.toString("hex"), "504b0506000000000000000000000000000000000000");
  assert.deepEqual(decodeZipStore(empty, bounds), []);
  assert.throws(() => encodeZipStore([first, object(Buffer.alloc(4096))], bounds), /limit/);
});

test("strict object paths, duplicate paths and encoded hash mismatches fail without normalization", () => {
  for (const path of ["../" + first.path, "/" + first.path, first.path.replace("/", "\\"),
    "objects/../" + first.path, first.path + "/", first.path + "\0", first.path.toUpperCase(),
    first.path.replace("objects/", "objects//"), "objects/%2e%2e/a.json.gz", "C:\\" + first.path,
    first.path.replace("objects", "objécts"), "objects/" + "a".repeat(64) + ".json.gz"]) {
    assert.throws(() => encodeZipStore([{ ...first, path }], bounds));
  }
  assert.throws(() => encodeZipStore([first, first], bounds), /duplicate/);
  assert.throws(() => encodeZipStore([{ ...first, bytes: second.bytes }], bounds), /match/);
});

test("invalid limits and ZIP64 sentinel limits fail before construction or decoding", () => {
  for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    for (const limits of [{ ...bounds, maxMembers: invalid }, { ...bounds, maxArchiveBytes: invalid }]) {
      assert.throws(() => encodeZipStore([first], limits), /limits/);
      assert.throws(() => decodeZipStore(Buffer.alloc(22), limits), /limits/);
    }
  }
  for (const limits of [{ ...bounds, maxMembers: 0xffff }, { ...bounds, maxArchiveBytes: 0xffffffff }]) {
    assert.throws(() => encodeZipStore([], limits), /ZIP64/);
    assert.throws(() => decodeZipStore(Buffer.alloc(22), limits), /ZIP64/);
  }
});

test("every altered byte and every truncation is rejected, including local and central CRC/metadata", () => {
  const archive = encodeZipStore([first, second], bounds);
  for (let offset = 0; offset < archive.length; offset++) {
    const corrupt = Buffer.from(archive);
    corrupt[offset] = corrupt[offset]! ^ 1;
    assert.throws(() => decodeZipStore(corrupt, bounds), `corruption at ${offset}`);
    assert.throws(() => decodeZipStore(archive.subarray(0, offset), bounds), `truncation at ${offset}`);
  }
  assert.throws(() => decodeZipStore(Buffer.concat([archive, Buffer.from([0])]), bounds));
  assert.throws(() => decodeZipStore(Buffer.concat([Buffer.from([0]), archive]), bounds));
});

test("non-STORE, encryption, data descriptors, extras, ZIP64 and multi-disk fields are refused", () => {
  const archive = encodeZipStore([first], bounds);
  const end = archive.length - 22;
  for (const [offset, width, value] of [
    [6, 2, 1], [6, 2, 8], [8, 2, 8], [28, 2, 1], [18, 4, 0xffffffff],
    [end + 4, 2, 1], [end + 8, 2, 0xffff], [end + 10, 2, 0xffff],
    [end + 12, 4, 0xffffffff], [end + 16, 4, 0xffffffff], [end + 20, 2, 1]
  ]) {
    const corrupt = Buffer.from(archive);
    if (width === 2) corrupt.writeUInt16LE(value!, offset!);
    else corrupt.writeUInt32LE(value!, offset!);
    assert.throws(() => decodeZipStore(corrupt, bounds));
  }
});
