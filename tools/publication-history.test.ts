import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { LyricManifest } from "../shared/types/lyrics.js";
import { auditPublicationDates, type PublicationEvidence } from "./publication-history.js";
import { canonical, deterministicGzip } from "./publisher.js";

const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
const removed = "33333333-3333-4333-8333-333333333333", unknown = "44444444-4444-4444-8444-444444444444";
const early = "2026-10-21T21:08:22.000Z", later = "2026-10-21T21:49:28.000Z";
const bounds = { maxManifestEncodedBytes: 8192, maxManifestDecodedBytes: 32768 };
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function catalog(ids: string[]) {
  const manifest: LyricManifest = {
    format: "daasavaani-lyric-catalog", formatVersion: 1, stage: "prelaunch", requiredCapabilities: ["lyric-preview-v1"],
    catalog: ids.map(lyricId => ({ lyricId, title: "Synthetic audit record", tags: [], item: {
      sha256: "a".repeat(64), path: `objects/${"a".repeat(64)}.json.gz`, encodedBytes: 1, decodedBytes: 1
    } }))
  };
  const manifestBytes = deterministicGzip(Buffer.from(canonical(manifest)));
  return { manifestSha256: hash(manifestBytes), manifestBytes };
}
function publication(ids: string[], confirmedAt = early, runId = 1): PublicationEvidence {
  return { ...catalog(ids), confirmedAt, runId, runAttempt: 1, deploymentId: runId, statusId: runId,
    artifactId: runId, artifactZipSha256: "b".repeat(64), sourceCommit: "c".repeat(40) };
}

test("earliest verified publication wins across updates, removal and reintroduction without input mutation", () => {
  const old = publication([first, removed]), newer = publication([first, second], later, 2);
  const current = catalog([first, second, unknown]);
  const before = Buffer.from(old.manifestBytes);
  const result = auditPublicationDates(current, [newer, old], bounds);
  assert.deepEqual(result.publications.map(value => value.runId), [1, 2]);
  assert.deepEqual(result.candidates.map(value => [value.lyricId, value.firstVerifiedPublishedAt, value.currentlyPublished]), [
    [first, early, true], [second, later, true], [removed, early, false]
  ]);
  assert.deepEqual(result.unresolvedLyricIds, [unknown]);
  assert.deepEqual(auditPublicationDates(current, [old, newer], bounds), result);
  const reintroduced = auditPublicationDates(catalog([removed]), [old, newer], bounds);
  assert.equal(reintroduced.candidates.find(value => value.lyricId === removed)?.firstVerifiedPublishedAt, early);
  assert.equal(reintroduced.candidates.find(value => value.lyricId === removed)?.currentlyPublished, true);
  assert.deepEqual(old.manifestBytes, before);
  assert.equal("manifestBytes" in result.publications[0]!, false);
  assert.equal(JSON.stringify(result).includes("Synthetic audit record"), false);
});

test("missing history stays explicitly unresolved; one run can have distinct verified attempts", () => {
  assert.deepEqual(auditPublicationDates(catalog([first]), [], bounds).unresolvedLyricIds, [first]);
  const old = publication([first]);
  const retry = { ...publication([first, second], later, 2), runId: old.runId, runAttempt: 2 };
  assert.equal(auditPublicationDates(catalog([first, second]), [old, retry], bounds).publications.length, 2);
  for (const duplicate of [old, { ...retry, runAttempt: 1 }, { ...retry, deploymentId: old.deploymentId },
    { ...retry, statusId: old.statusId }]) {
    assert.throws(() => auditPublicationDates(catalog([first]), [old, duplicate], bounds), /Duplicate/);
  }
});

test("malformed receipts, ambiguous dates and unsafe identifiers are refused", () => {
  const old = publication([first]);
  for (const change of [{ confirmedAt: "2026-02-29T00:00:00.000Z" }, { confirmedAt: early.replace(".000Z", "Z") },
    { confirmedAt: early.replace("Z", "+00:00") }, { sourceCommit: "unknown" }, { artifactZipSha256: "bad" },
    { runId: 0 }, { runAttempt: 1.5 }, { deploymentId: Number.MAX_SAFE_INTEGER + 1 }, { statusId: -1 }, { artifactId: 0 }]) {
    assert.throws(() => auditPublicationDates(catalog([first]), [{ ...old, ...change }], bounds), /receipt/);
  }
});

test("actual encoded/decoded bounds and hashes are required, with no partial or future-schema result", () => {
  const current = catalog([first]), old = publication([first]);
  const exact = { maxManifestEncodedBytes: current.manifestBytes.length,
    maxManifestDecodedBytes: gunzipSync(current.manifestBytes).length };
  assert.equal(auditPublicationDates(current, [old], exact).candidates.length, 1);
  assert.throws(() => auditPublicationDates(current, [old], { ...exact, maxManifestEncodedBytes: exact.maxManifestEncodedBytes - 1 }));
  assert.throws(() => auditPublicationDates(current, [old], { ...exact, maxManifestDecodedBytes: exact.maxManifestDecodedBytes - 1 }));
  assert.throws(() => auditPublicationDates(current, [{ ...old, manifestSha256: "f".repeat(64) }], bounds), /identity/);
  assert.throws(() => auditPublicationDates(current, [publication([first, first])], bounds), /Duplicate/);
  const bad = Buffer.from("not gzip");
  assert.throws(() => auditPublicationDates({ manifestBytes: bad, manifestSha256: hash(bad) }, [], bounds));
  const future = deterministicGzip(Buffer.from('{"formatVersion":99}'));
  assert.throws(() => auditPublicationDates({ manifestBytes: future, manifestSha256: hash(future) }, [], bounds), /manifest/);
  const text = gunzipSync(current.manifestBytes).toString("utf8");
  for (const invalid of [" " + text, text.replace('"formatVersion":1', '"formatVersion":1,"formatVersion":1')]) {
    const bytes = deterministicGzip(Buffer.from(invalid));
    assert.throws(() => auditPublicationDates({ manifestBytes: bytes, manifestSha256: hash(bytes) }, [], bounds), /manifest/);
  }
  assert.throws(() => auditPublicationDates(current, [old], { ...bounds, maxManifestDecodedBytes: 0 }), /bounds/);
});
