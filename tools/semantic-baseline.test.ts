import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { LyricItem, LyricManifest, LyricObjectReference } from "../shared/types/lyrics.js";
import { auditSemanticBaseline, prepareBaselineInitializationReview, verifyBaselineReviewPin, type SemanticBaselineBounds } from "./semantic-baseline.js";
import { decodePublicationCatalog, type PublicationEvidence } from "./publication-history.js";
import { canonical, deterministicGzip, parseCanonicalJson } from "./publisher.js";
import { canonicalLyricLogicalItem } from "./lyric-logical.js";

const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
const third = "33333333-3333-4333-8333-333333333333", lineId = "44444444-4444-4444-8444-444444444444";
const early = "2026-10-21T01:00:00.000Z", later = "2026-10-21T02:00:00.000Z", latest = "2026-10-21T03:00:00.000Z";
const bounds: SemanticBaselineBounds = {
  maxManifestEncodedBytes: 8192, maxManifestDecodedBytes: 32768, maxItemEncodedBytes: 4096, maxItemDecodedBytes: 8192
};
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function item(lyricId = first, title = "Synthetic baseline"): LyricItem {
  return { format: "daasavaani-lyric", formatVersion: 1, lyricId, canonicalScript: "kn", title, tags: ["Synthetic"],
    lines: [{ kind: "line", lineId, text: "ಕನ್ನಡ" }, { kind: "layout", text: " \t " }] };
}
function object(value: LyricItem, level: 1 | 9 = 9) {
  const decoded = Buffer.from(canonical(value)), bytes = gzipSync(decoded, { level });
  const sha256 = hash(bytes);
  const reference: LyricObjectReference = {
    sha256, path: `objects/${sha256}.json.gz`, encodedBytes: bytes.length, decodedBytes: decoded.length
  };
  return { bytes, entry: { lyricId: value.lyricId, title: value.title, tags: value.tags, item: reference } };
}
function publication(catalog: LyricManifest["catalog"], confirmedAt = early, runId = 1): PublicationEvidence {
  const value: LyricManifest = {
    format: "daasavaani-lyric-catalog", formatVersion: 1, stage: "prelaunch",
    requiredCapabilities: ["lyric-preview-v1"], catalog
  };
  const manifestBytes = deterministicGzip(Buffer.from(canonical(value)));
  return { manifestBytes, manifestSha256: hash(manifestBytes), confirmedAt, sourceCommit: "c".repeat(40),
    runId, runAttempt: 1, deploymentId: runId, statusId: runId, artifactId: runId, artifactZipSha256: "d".repeat(64) };
}
function loader(...objects: ReturnType<typeof object>[]) {
  const bytes = new Map(objects.map(value => [value.entry.item.sha256, value.bytes]));
  const calls: string[] = [];
  return { calls, load: async (ref: Readonly<LyricObjectReference>) => {
    calls.push(ref.sha256);
    assert.equal(Object.isFrozen(ref), true);
    return bytes.get(ref.sha256) ?? null;
  } };
}

test("verified semantic dates survive edits/removal/reintroduction; input order and object reuse are deterministic", async () => {
  const a = object(item()), b = object(item(second)), edited = object(item(first, "Synthetic edited")), c = object(item(third));
  const old = publication([a.entry, b.entry]), middle = publication([edited.entry, c.entry], later, 2);
  const current = publication([b.entry, edited.entry, c.entry], latest, 3), source = loader(a, b, edited, c);
  const result = await auditSemanticBaseline(current, [current, old, middle], source.load, bounds);
  assert.equal(result.complete, true);
  assert.equal(result.verifiedObjectCount, 4);
  assert.equal(source.calls.length, 4);
  assert.deepEqual(result.candidates.map(value => [value.lyricId, value.firstVerifiedPublishedAt, value.changedAt, value.currentlyPublished]), [
    [first, early, later, true], [second, early, early, true], [third, later, later, true]
  ]);
  assert.deepEqual(result.unresolvedLyricIds, []);
  assert.deepEqual(await auditSemanticBaseline(current, [old, middle, current], loader(a, b, edited, c).load, bounds), result);
  assert.equal(result.candidates[0]?.logicalSha256, canonicalLyricLogicalItem(item(first, "Synthetic edited")).logicalSha256);
});

test("recompression preserves dates, removed identities remain tombstones and reversion records the latest verified change", async () => {
  const a = object(item(), 1), repacked = object(item(), 9), b = object(item(second));
  const old = publication([a.entry, b.entry]), current = publication([repacked.entry], later, 2);
  const result = await auditSemanticBaseline(current, [old, current], loader(a, repacked, b).load, bounds);
  assert.notEqual(a.entry.item.sha256, repacked.entry.item.sha256);
  assert.equal(result.candidates[0]?.changedAt, early);
  assert.equal(result.candidates[1]?.currentlyPublished, false);
  assert.equal(result.candidates[1]?.changedAt, early);
  const changed = object(item(first, "Synthetic changed"));
  const middle = publication([changed.entry], later, 2), reverted = publication([a.entry], latest, 3);
  const reversion = await auditSemanticBaseline(reverted, [old, middle, reverted], loader(a, b, changed).load, bounds);
  assert.equal(reversion.candidates[0]?.changedAt, latest);
  assert.equal(reversion.candidates[0]?.firstVerifiedPublishedAt, early);
});

test("missing evidence stays explicit and cannot produce an initialization review or invented later baseline", async () => {
  const a = object(item()), changed = object(item(first, "Synthetic changed"));
  const old = publication([a.entry]), current = publication([changed.entry], later, 2), source = loader(changed);
  const result = await auditSemanticBaseline(current, [old, current], source.load, bounds);
  assert.equal(result.complete, false);
  assert.deepEqual(result.unavailableObjectSha256s, [a.entry.item.sha256]);
  assert.deepEqual(result.unresolvedLyricIds, [first]);
  assert.equal(result.candidates[0]?.firstVerifiedPublishedAt, early);
  assert.equal(result.candidates[0]?.changedAt, null);
  assert.equal(result.candidates[0]?.logicalSha256, canonicalLyricLogicalItem(item(first, "Synthetic changed")).logicalSha256);
  await assert.rejects(prepareBaselineInitializationReview(current, [old, current], source.load, bounds), /missing evidence/);
  const missingCurrent = await auditSemanticBaseline(current, [old, current], loader(a).load, bounds);
  assert.equal(missingCurrent.candidates[0]?.logicalSha256, null);
  assert.equal(missingCurrent.candidates[0]?.changedAt, null);
  const changedAgain = object(item(first, "Synthetic changed again")), thirdPublication = publication([changedAgain.entry], latest, 3);
  const recoveredTransition = await auditSemanticBaseline(thirdPublication, [old, current, thirdPublication], loader(changed, changedAgain).load, bounds);
  assert.equal(recoveredTransition.candidates[0]?.changedAt, latest);
  assert.equal(recoveredTransition.complete, false);
});

test("initialization review binds the complete audit, preserves dates and has no invented legacy sequence", async () => {
  const a = object(item()), b = object(item(second)), old = publication([a.entry, b.entry]);
  const current = publication([a.entry], later, 2);
  const { audit, review } = await prepareBaselineInitializationReview(current, [old, current], loader(a, b).load, bounds);
  assert.equal(review.status, "review-required");
  assert.equal(review.sequence, null);
  assert.equal(review.logicalProjection, "canonical-prelaunch-v1");
  assert.equal(review.auditSha256, hash(canonical(audit) + "\n"));
  assert.deepEqual(review.legacyPublication, audit.publications[1]);
  assert.deepEqual(review.items.map(value => [value.firstPublishedAt, value.changedAt, value.present]), [
    [early, early, true], [early, early, false]
  ]);
  audit.publications[1]!.runId = 99;
  audit.candidates[0]!.changedAt = latest;
  assert.equal(review.legacyPublication.runId, 2);
  assert.equal(review.items[0]?.changedAt, early);
  for (const secret of ["ಕನ್ನಡ", "Synthetic", "title", "tags", "manifestBytes", "sourceFile"]) {
    assert.equal(JSON.stringify(review).includes(secret), false);
  }
});

test("actual item encoded/decoded byte boundaries are enforced before a review can be prepared", async () => {
  const a = object(item()), current = publication([a.entry]);
  const exact = { ...bounds, maxItemEncodedBytes: a.bytes.length, maxItemDecodedBytes: a.entry.item.decodedBytes };
  assert.equal((await auditSemanticBaseline(current, [current], loader(a).load, exact)).complete, true);
  for (const limits of [{ ...exact, maxItemEncodedBytes: exact.maxItemEncodedBytes - 1 },
    { ...exact, maxItemDecodedBytes: exact.maxItemDecodedBytes - 1 }]) {
    const source = loader(a);
    await assert.rejects(auditSemanticBaseline(current, [current], source.load, limits), /bounds/);
    assert.equal(source.calls.length, 0);
  }
  const badSize = publication([{ ...a.entry, item: { ...a.entry.item, decodedBytes: a.entry.item.decodedBytes + 1 } }]);
  await assert.rejects(auditSemanticBaseline(badSize, [badSize], loader(a).load, bounds), /decoded size/);
  const wrongEncoded = publication([{ ...a.entry, item: { ...a.entry.item, encodedBytes: a.bytes.length + 1 } }]);
  await assert.rejects(auditSemanticBaseline(wrongEncoded, [wrongEncoded], loader(a).load, bounds), /encoded identity/);
});

test("reference/hash/catalog binding errors never become a missing-object success-shaped fallback", async () => {
  const a = object(item()), current = publication([a.entry]), source = loader(a);
  for (const entry of [
    { ...a.entry, item: { ...a.entry.item, path: `objects/${"f".repeat(64)}.json.gz` } },
    { ...a.entry, title: "Mismatched catalog title" }, { ...a.entry, tags: ["Other"] },
    { ...a.entry, lyricId: second }
  ]) {
    const bad = publication([entry]);
    await assert.rejects(auditSemanticBaseline(bad, [bad], source.load, bounds));
  }
  await assert.rejects(auditSemanticBaseline(current, [current], async () => Buffer.from("wrong bytes"), bounds), /encoded identity/);
  const sameLength = Buffer.from(a.bytes); sameLength[0] = sameLength[0]! ^ 1;
  await assert.rejects(auditSemanticBaseline(current, [current], async () => sameLength, bounds), /encoded identity/);
  await assert.rejects(auditSemanticBaseline(current, [current], async () => { throw new Error("Synthetic I/O failure"); }, bounds), /I\/O failure/);
  const badSummary = publication([{ ...a.entry, title: "Conflicting repeated summary" }], later, 2);
  await assert.rejects(auditSemanticBaseline(badSummary, [current, badSummary], source.load, bounds), /Inconsistent/);
});

test("canonical item decode rejects malformed/future/duplicate JSON, UTF8, BOM and line-identity errors", async () => {
  const a = object(item()), text = gunzipSync(a.bytes).toString("utf8");
  for (const decoded of [
    Buffer.from(" " + text), Buffer.from(text + "\n"), Buffer.from("\uFEFF" + text), Buffer.from([0xff]),
    Buffer.from(text.replace('"formatVersion":1', '"formatVersion":2')),
    Buffer.from(text.replace('"formatVersion":1', '"formatVersion":1,"formatVersion":1')),
    Buffer.from(text.replace('"formatVersion":1', '"formatVersion":1,"changedAt":"'+ early +'"')),
    Buffer.from(canonical({ ...item(), lines: [{ kind: "line", lineId, text: "ಕನ್ನಡ" }, { kind: "line", lineId, text: "ಅಕ್ಷರ" }] }))
  ]) {
    const bytes = deterministicGzip(decoded), sha256 = hash(bytes);
    const malformed = publication([{ ...a.entry, item: { sha256, path: `objects/${sha256}.json.gz`,
      encodedBytes: bytes.length, decodedBytes: decoded.length } }]);
    await assert.rejects(auditSemanticBaseline(malformed, [malformed], async () => bytes, bounds));
  }
  assert.throws(() => parseCanonicalJson(Buffer.from("private-payload-that-must-not-appear")), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message.includes("private-payload"), false);
    return true;
  });
});

test("history/current/bounds validation precedes object I/O and rejects stale history or malformed receipts", async () => {
  const a = object(item()), old = publication([a.entry]), current = publication([object(item(first, "Edited")).entry], later, 2);
  const source = loader(a);
  await assert.rejects(auditSemanticBaseline(old, [], source.load, bounds), /requires verified/);
  await assert.rejects(auditSemanticBaseline(old, [old, current], source.load, bounds), /latest verified/);
  await assert.rejects(auditSemanticBaseline(old, [{ ...old, runId: 0 }], source.load, bounds), /receipt/);
  for (const limit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(auditSemanticBaseline(old, [old], source.load, { ...bounds, maxItemDecodedBytes: limit }), /bounds/);
  }
  assert.equal(source.calls.length, 0);
  assert.throws(() => decodePublicationCatalog(old, { ...bounds, maxManifestDecodedBytes: 0 }), /bounds/);
});

test("review pin verification recomputes the complete evidence-bound draft and refuses stale or malformed pins", async () => {
  const a = object(item()), current = publication([a.entry]);
  const prepared = await prepareBaselineInitializationReview(current, [current], loader(a).load, bounds);
  const pin = hash(canonical(prepared.review) + "\n");
  assert.deepEqual(await verifyBaselineReviewPin(current, [current], loader(a).load, bounds, pin), prepared);
  await assert.rejects(verifyBaselineReviewPin(current, [current], loader(a).load, bounds, "f".repeat(64)), /renewed review/);
  const source = loader(a);
  await assert.rejects(verifyBaselineReviewPin(current, [current], source.load, bounds, "unknown"), /Invalid baseline/);
  assert.equal(source.calls.length, 0);
  const newer = publication([a.entry], later, 2);
  await assert.rejects(verifyBaselineReviewPin(newer, [current, newer], loader(a).load, bounds, pin), /renewed review/);
  const edited = object(item(first, "Edited")), changed = publication([edited.entry], later, 2);
  await assert.rejects(verifyBaselineReviewPin(changed, [current, changed], loader(a, edited).load, bounds, pin), /renewed review/);
});

test("async audit snapshots evidence/bounds and does not mutate caller-owned manifests or metadata", async () => {
  const a = object(item()), old = publication([a.entry]), current = publication([a.entry], later, 2);
  const mutableBounds = { ...bounds }, before = Buffer.from(current.manifestBytes);
  const result = await auditSemanticBaseline(current, [old, current], async () => {
    current.runId = 99;
    current.manifestBytes.fill(0);
    mutableBounds.maxItemDecodedBytes = 1;
    return a.bytes;
  }, mutableBounds);
  assert.equal(result.complete, true);
  assert.equal(result.publications[1]?.runId, 2);
  const untouched = publication([a.entry], later, 2), preserved = Buffer.from(untouched.manifestBytes);
  await auditSemanticBaseline(untouched, [old, untouched], loader(a).load, bounds);
  assert.deepEqual(untouched.manifestBytes, preserved);
  assert.deepEqual(preserved, before);
});
