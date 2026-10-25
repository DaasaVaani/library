import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { LyricItem, LyricManifest } from "../shared/types/lyrics.js";
import { canonicalLyricLogicalItem } from "./lyric-logical.js";
import { canonical, deterministicGzip } from "./publisher.js";
import {
  emptyPublicationLedger, preparePublication, reservePublication, beginPublicationDeployment,
  confirmPublication, publicationLedgerFingerprint as tip, type PublicationLedger
} from "./publication-ledger.js";

const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
const lyricId = "33333333-3333-4333-8333-333333333333", sourceCommit = "c".repeat(40);
const early = "2026-10-25T01:00:00.000Z", later = "2026-10-25T02:00:00.000Z", latest = "2026-10-25T03:00:00.000Z";
function item(): LyricItem {
  return {
    format: "daasavaani-lyric", formatVersion: 1, lyricId, canonicalScript: "kn",
    title: "Synthetic canonical item", tags: ["Synthetic", "Test"],
    lines: [
      { kind: "line", lineId: first, text: "ಕನ್ನಡ  " }, { kind: "layout", text: " \t " },
      { kind: "line", lineId: second, text: "ಅಕ್ಷರ" }
    ]
  };
}
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

test("canonical logical projection has an exact public-field byte vector and ledger input shape", () => {
  const value = item();
  const expected = String.raw`{"canonicalScript":"kn","lines":[{"kind":"line","lineId":"11111111-1111-4111-8111-111111111111","text":"ಕನ್ನಡ  "},{"kind":"layout","text":" \t "},{"kind":"line","lineId":"22222222-2222-4222-8222-222222222222","text":"ಅಕ್ಷರ"}],"lyricId":"33333333-3333-4333-8333-333333333333","tags":["Synthetic","Test"],"title":"Synthetic canonical item"}`;
  const result = canonicalLyricLogicalItem(value);
  assert.deepEqual(result, { lyricId, logicalSha256: sha(expected) });
  assert.notEqual(result.logicalSha256, sha(expected + "\n"));
  assert.notEqual(result.logicalSha256, sha(canonical(value)));
  assert.deepEqual(Object.keys(result).sort(), ["logicalSha256", "lyricId"]);
});

test("object key insertion order is irrelevant while array order and every current semantic field matter", () => {
  const value = item(), original = canonicalLyricLogicalItem(value);
  const reordered = {
    lines: value.lines.map(line => line.kind === "line" ? { text: line.text, lineId: line.lineId, kind: line.kind } :
      { text: line.text, kind: line.kind }),
    tags: value.tags, title: value.title, canonicalScript: value.canonicalScript,
    lyricId: value.lyricId, formatVersion: value.formatVersion, format: value.format
  };
  assert.deepEqual(canonicalLyricLogicalItem(reordered), original);
  const changes: LyricItem[] = [
    { ...value, lyricId: "44444444-4444-4444-8444-444444444444" },
    { ...value, title: value.title + " edited" }, { ...value, tags: ["Synthetic", "Other"] },
    { ...value, tags: [...value.tags].reverse() }, { ...value, tags: [] },
    { ...value, lines: [...value.lines].reverse() }, { ...value, lines: value.lines.slice(0, 2) },
    { ...value, lines: [...value.lines, { kind: "layout", text: "" }] },
    { ...value, lines: value.lines.map(line => line.kind === "line" && line.lineId === first ?
      { ...line, lineId: "55555555-5555-4555-8555-555555555555" } : line) },
    { ...value, lines: value.lines.map(line => line.kind === "line" && line.lineId === first ? { ...line, text: line.text + "!" } : line) },
    { ...value, lines: value.lines.map(line => line.kind === "layout" ? { ...line, text: "\t " } : line) }
  ];
  for (const changed of changes) assert.notEqual(canonicalLyricLogicalItem(changed).logicalSha256, original.logicalSha256);
});

test("logical hashing does not normalize, trim, collapse whitespace or fold Unicode/case", () => {
  const value = item();
  for (const [left, right] of [
    ["Caf\u00e9", "Cafe\u0301"], ["Synthetic", "synthetic"], ["Synthetic", "Synthetic "],
    ["Synthetic", "Synthetic\u00a0"], ["Synthetic  item", "Synthetic item"]
  ] as const) assert.notEqual(canonicalLyricLogicalItem({ ...value, title: left }).logicalSha256,
    canonicalLyricLogicalItem({ ...value, title: right }).logicalSha256);
  for (const [left, right] of [["ಕನ್ನಡ  ", "ಕನ್ನಡ "], ["ಕನ್ನಡ é", "ಕನ್ನಡ e\u0301"], ["ಕನ್ನಡ \t", "ಕನ್ನಡ  "]] as const) {
    const withText = (text: string) => ({ ...value, lines: [{ kind: "line", lineId: first, text }] });
    assert.notEqual(canonicalLyricLogicalItem(withText(left)).logicalSha256, canonicalLyricLogicalItem(withText(right)).logicalSha256);
  }
});

test("line identity is unique, whitespace remains layout-only and repeated layout records remain significant", () => {
  const value = item();
  for (const lines of [
    [{ kind: "line", lineId: first, text: "ಕನ್ನಡ" }, { kind: "line", lineId: first, text: "ಅಕ್ಷರ" }],
    [{ kind: "line", lineId: first, text: "ಕನ್ನಡ" }, { kind: "line", lineId: first, text: "ಕನ್ನಡ" }],
    [{ kind: "line", lineId: first, text: " \t " }], [{ kind: "layout", text: " \t " }],
    [{ kind: "layout", lineId: first, text: "" }], [{ kind: "layout", text: "not blank" }]
  ]) assert.throws(() => canonicalLyricLogicalItem({ ...value, lines }));
  const repeated = { ...value, lines: [...value.lines, { kind: "layout", text: " \t " }] };
  assert.notEqual(canonicalLyricLogicalItem(repeated).logicalSha256, canonicalLyricLogicalItem(value).logicalSha256);
});

test("unsupported schema, future metadata, source evidence, transport and derived-date fields fail rather than disappear", () => {
  const value = item();
  for (const change of [
    { format: "fixture-catalog-v1" }, { formatVersion: 2 }, { formatVersion: 1.5 }, { canonicalScript: "en" },
    { lyricId: "not-uuid" }, { title: "" }, { title: "multiline\nvalue" }, { tags: ["same", "same"] },
    { lines: [] }, { changedAt: early }, { firstPublishedAt: early }, { publishedAt: early },
    { sourceLatin: "Synthetic supplied text" }, { verses: [] }, { classification: {} }, { youtube: [] }, { images: [] },
    { provenance: { sourceFile: "private-source" } }, { sha256: "a".repeat(64) }, { requiredCapabilities: [] }
  ]) assert.throws(() => canonicalLyricLogicalItem({ ...value, ...change }));
  for (const invalid of [null, [], "item", {}, { public: value, sourceFormat: 2 },
    { ...value, lines: [{ kind: "line", lineId: first, text: "ಕನ್ನಡ", unknown: true }] }]) {
    assert.throws(() => canonicalLyricLogicalItem(invalid));
  }
  for (const title of ["\ud800", "\udfff"]) assert.throws(() => canonicalLyricLogicalItem({ ...value, title }), /Unicode/);
});

test("projection does not mutate or retain mutable input collections and never returns text or transport payloads", () => {
  const value = item(), before = structuredClone(value);
  for (const line of value.lines) Object.freeze(line);
  Object.freeze(value.lines); Object.freeze(value.tags); Object.freeze(value);
  const result = canonicalLyricLogicalItem(value);
  assert.deepEqual(value, before);
  result.lyricId = first;
  assert.equal(value.lyricId, lyricId);
  const text = JSON.stringify(canonicalLyricLogicalItem(value));
  for (const payload of ["Synthetic", "ಕನ್ನಡ", "title", "tags", "lines", "sourceFile", "encodedBytes"]) {
    assert.equal(text.includes(payload), false);
  }
});

function publication(value: LyricItem, level: 1 | 9) {
  const decoded = Buffer.from(canonical(value)), encoded = gzipSync(decoded, { level });
  const hash = sha(encoded);
  const manifestValue: LyricManifest = {
    format: "daasavaani-lyric-catalog", formatVersion: 1, stage: "prelaunch", requiredCapabilities: ["lyric-preview-v1"],
    catalog: [{
      lyricId: value.lyricId, title: value.title, tags: value.tags,
      item: { sha256: hash, path: `objects/${hash}.json.gz`, encodedBytes: encoded.length, decodedBytes: decoded.length }
    }]
  };
  const manifestBytes = deterministicGzip(Buffer.from(canonical(manifestValue)));
  const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(gunzipSync(encoded)));
  return { encoded, manifestBytes, manifestSha256: sha(manifestBytes), logical: canonicalLyricLogicalItem(parsed) };
}
function commit(state: PublicationLedger, published: ReturnType<typeof publication>, publishedAt: string) {
  const plan = preparePublication(state, tip(state), {
    logicalProjection: state.logicalProjection, items: [published.logical], publishedAt, sourceCommit
  });
  const reserved = reservePublication(state, tip(state), plan, published.manifestSha256);
  if (reserved.outcome === "noop") return reserved.state;
  const deploying = beginPublicationDeployment(reserved.state, tip(reserved.state));
  assert.ok(deploying.pending);
  return confirmPublication(deploying, tip(deploying), {
    sequence: deploying.pending.sequence, manifestSha256: deploying.pending.manifestSha256, sourceCommit,
    publishedAt, confirmedAt: publishedAt, runId: deploying.pending.sequence, runAttempt: 1,
    deploymentId: deploying.pending.sequence, statusId: deploying.pending.sequence,
    artifactId: deploying.pending.sequence, artifactZipSha256: "d".repeat(64)
  });
}

test("actual recompression changes object and manifest identities without changing logical hash or semantic dates", () => {
  const value = item(), low = publication(value, 1), high = publication(value, 9);
  assert.notDeepEqual(low.encoded, high.encoded);
  assert.notEqual(sha(low.encoded), sha(high.encoded));
  assert.notDeepEqual(low.manifestBytes, high.manifestBytes);
  assert.notEqual(low.manifestSha256, high.manifestSha256);
  assert.deepEqual(low.logical, high.logical);
  const original = commit(emptyPublicationLedger(), low, early);
  const repacked = commit(original, high, later);
  assert.equal(repacked.lastSequence, 2);
  assert.deepEqual(repacked.items, original.items);
  assert.equal(repacked.items[0]?.firstPublishedAt, early);
  assert.equal(repacked.items[0]?.changedAt, early);
  assert.deepEqual(commit(repacked, high, latest), repacked);
});

test("real logical edits advance changedAt only; derived ledger dates cannot feed back into item hashing", () => {
  const value = item(), originalBytes = publication(value, 9);
  const original = commit(emptyPublicationLedger(), originalBytes, early);
  const edited = publication({ ...value, title: value.title + " edited" }, 9);
  assert.notEqual(edited.logical.logicalSha256, originalBytes.logical.logicalSha256);
  const updated = commit(original, edited, later);
  assert.equal(updated.items[0]?.firstPublishedAt, early);
  assert.equal(updated.items[0]?.changedAt, later);
  assert.equal(updated.items[0]?.logicalSha256, edited.logical.logicalSha256);
  const laterPlan = preparePublication(updated, tip(updated), {
    logicalProjection: updated.logicalProjection, items: [canonicalLyricLogicalItem({ ...value, title: value.title + " edited" })],
    publishedAt: latest, sourceCommit
  });
  assert.deepEqual(laterPlan.items, updated.items);
  assert.deepEqual(canonicalLyricLogicalItem(value), originalBytes.logical);
});
