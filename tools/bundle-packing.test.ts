import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { deterministicGzip, yaml } from "./publisher.js";
import { decodeZipStore, encodeZipStore, zipStoreMemberSize } from "./zip-store.js";
import { packChangedAtCohorts, packingLimits, readPackingLimits, type CohortObject } from "./bundle-packing.js";

const firstDate = "2026-10-25T00:00:00.000Z", secondDate = "2026-10-25T00:00:00.001Z";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const object = (bytes: Uint8Array, changedAt = firstDate): CohortObject => ({
  path: `objects/${hash(bytes)}.json.gz`, bytes, changedAt
});
const fixture = (id: number, changedAt = firstDate) =>
  object(deterministicGzip(Buffer.from(JSON.stringify({ synthetic: id }))), changedAt);
const bounds = { maxMembers: 100, maxArchiveBytes: 33554432 };

test("exact timestamps are hard boundaries, even one millisecond apart in the same day", () => {
  const input = [fixture(4, secondDate), fixture(2), fixture(3, secondDate), fixture(1)];
  const before = input.map(value => ({ ...value, bytes: Buffer.from(value.bytes) }));
  const packed = packChangedAtCohorts(input, bounds);
  assert.equal(packed.bundles.length, 2);
  assert.deepEqual(packed.bundles.map(bundle => bundle.changedAt), [firstDate, secondDate]);
  assert.deepEqual(packed.unbundled, []);
  for (const bundle of packed.bundles) {
    const expected = input.filter(value => value.changedAt === bundle.changedAt).map(value => value.path).sort();
    assert.deepEqual(bundle.members, expected);
    assert.equal(bundle.sha256, hash(bundle.bytes));
    const decoded = decodeZipStore(bundle.bytes, bounds);
    assert.deepEqual(decoded.map(value => value.path), expected);
    for (const value of decoded) assert.deepEqual(value.bytes, input.find(original => original.path === value.path)!.bytes);
  }
  for (const permutation of [input.toReversed(), [input[2]!, input[0]!, input[3]!, input[1]!]]) {
    assert.deepEqual(packChangedAtCohorts(permutation, bounds), packed);
  }
  const unrelated = packChangedAtCohorts([...input, fixture(5, "2026-10-26T00:00:00.000Z")], bounds);
  assert.deepEqual(unrelated.bundles, packed.bundles);
  assert.deepEqual(input, before);
  input[0]!.bytes.fill(0);
  assert.doesNotThrow(() => decodeZipStore(packed.bundles[1]!.bytes, bounds));
});

test("100 members fit, 101 retain an individual tail, and 102 create a second useful bundle", () => {
  const input = Array.from({ length: 102 }, (_, index) => fixture(index));
  for (const count of [100, 101, 102]) {
    const result = packChangedAtCohorts(input.slice(0, count).toReversed(), bounds);
    assert.deepEqual(result.bundles.map(bundle => bundle.members.length), count === 102 ? [100, 2] : [100]);
    assert.equal(result.unbundled.length, count === 101 ? 1 : 0);
    const paths = [...result.bundles.flatMap(bundle => bundle.members), ...result.unbundled];
    assert.equal(new Set(paths).size, count);
    assert.deepEqual(paths.sort(), input.slice(0, count).map(value => value.path).sort());
  }
  assert.deepEqual(packChangedAtCohorts(input.slice(0, 3), { ...bounds, maxMembers: 1 }).bundles, []);
});

test("next-fit includes real headers and directories, and skips oversized objects without splitting eligible neighbors", () => {
  const small = [fixture(1), fixture(2)];
  const exact = encodeZipStore(small, bounds).length;
  const limits = { ...bounds, maxArchiveBytes: exact };
  const large = object(gzipSync(Buffer.alloc(4096), { level: 0 }));
  const result = packChangedAtCohorts([small[1]!, large, small[0]!], limits);
  assert.equal(result.bundles.length, 1);
  assert.equal(result.bundles[0]!.bytes.length, exact);
  assert.deepEqual(result.unbundled, [large.path]);
  const split = packChangedAtCohorts(small, { ...limits, maxArchiveBytes: exact - 1 });
  assert.equal(split.bundles.length, 0);
  assert.deepEqual(split.unbundled, small.map(value => value.path).sort());
  assert.equal(exact, 22 + small.reduce((sum, value) => sum + zipStoreMemberSize(value), 0));
});

test("the actual 32MiB archive boundary is inclusive, while one additional encoded byte prevents bundling", () => {
  const small = fixture(1);
  const memberOverhead = zipStoreMemberSize(small) - small.bytes.length;
  const target = bounds.maxArchiveBytes - 22 - 2 * memberOverhead - small.bytes.length;
  function large(encodedBytes: number) {
    const base = gzipSync(Buffer.alloc(encodedBytes - 65536), { level: 0 });
    const extraLength = encodedBytes - base.length - 2;
    assert.ok(extraLength >= 0 && extraLength <= 65535);
    const header = Buffer.from(base.subarray(0, 10)), length = Buffer.alloc(2);
    header[3] = 4;
    length.writeUInt16LE(extraLength);
    const bytes = Buffer.concat([header, length, Buffer.alloc(extraLength), base.subarray(10)]);
    assert.equal(bytes.length, encodedBytes);
    assert.equal(gunzipSync(bytes).length, encodedBytes - 65536);
    return object(bytes);
  }
  const exact = packChangedAtCohorts([small, large(target)], bounds);
  assert.equal(exact.bundles.length, 1);
  assert.equal(exact.bundles[0]!.bytes.length, 33554432);
  assert.equal(decodeZipStore(exact.bundles[0]!.bytes, bounds).length, 2);
  const over = packChangedAtCohorts([small, large(target + 1)], bounds);
  assert.equal(over.bundles.length, 0);
  assert.equal(over.unbundled.length, 2);
});

test("empty and singleton cohorts stay individual; invalid dates, duplicate paths and hashes fail atomically", () => {
  assert.deepEqual(packChangedAtCohorts([], bounds), { bundles: [], unbundled: [] });
  const one = fixture(1), two = fixture(2, secondDate);
  assert.deepEqual(packChangedAtCohorts([two, one], bounds), { bundles: [], unbundled: [one.path, two.path] });
  for (const changedAt of ["2026-02-29T00:00:00.000Z", "2026-10-25", "2026-10-25T00:00:00Z",
    "2026-10-25T00:00:00.000+00:00", "2026-10-25T00:00:00.0000Z", "invalid"]) {
    assert.throws(() => packChangedAtCohorts([one, { ...two, changedAt }], bounds), /changedAt/);
  }
  assert.throws(() => packChangedAtCohorts([one, one], bounds), /Duplicate/);
  assert.throws(() => packChangedAtCohorts([one, { ...one, changedAt: secondDate }], bounds), /Duplicate/);
  assert.throws(() => packChangedAtCohorts([{ ...one, path: "images/example.jpg" }], bounds), /path/);
  assert.throws(() => packChangedAtCohorts([{ ...one, bytes: two.bytes }], bounds), /match/);
  for (const limits of [{ ...bounds, maxMembers: 0 }, { ...bounds, maxMembers: 65535 },
    { ...bounds, maxArchiveBytes: 21 }, { ...bounds, maxArchiveBytes: 0xffffffff }]) {
    assert.throws(() => packChangedAtCohorts([], limits), /limits|ZIP64/);
  }
});

test("owned Shared policy is strict, with no hidden defaults or silent ZIP-format clamping", async () => {
  assert.deepEqual(await readPackingLimits(), bounds);
  const policy = yaml(await readFile(new URL("../shared/settings/publication-policy.yml", import.meta.url), "utf8"));
  assert.ok(policy !== null && typeof policy === "object" && !Array.isArray(policy));
  assert.deepEqual(packingLimits(policy), bounds);
  for (const change of [
    { transferPlanning: {} }, { extraUnknown: true },
    { transferPlanning: { maxBundleMembers: 100, maxBundleEncodedBytes: 33554432 } }
  ]) assert.throws(() => packingLimits({ ...policy, ...change }), /policy/);
  for (const limits of [{ maxBundleMembers: 65535, maxBundleEncodedBytes: 33554432 },
    { maxBundleMembers: 100, maxBundleEncodedBytes: 0xffffffff }]) {
    assert.throws(() => packingLimits({ ...policy, transferPlanning: {
      requestCostBytes: 131072, maxExtraBytes: 8388608, maxExtraPercent: 25, ...limits
    } }), /ZIP64/);
  }
});
