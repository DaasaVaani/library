import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { LyricItem } from "../shared/types/lyrics.js";
import type { SnapshotManifest } from "../shared/types/snapshot.js";
import { assertSnapshotManifest } from "../shared/tools/snapshot-reference.mjs";
import { canonical, deterministicGzip, parseCanonicalJson } from "./publisher.js";
import { emptyPublicationLedger, publicationLedgerFingerprint as fingerprint, beginPublicationDeployment,
  confirmPublication, cancelPublicationReservation, type PublicationLedger } from "./publication-ledger.js";
import { bindCanonicalSnapshot, prepareCanonicalSnapshot, readSnapshotSettings, reserveCanonicalSnapshot,
  planCanonicalSnapshotDownload, type PreparedCanonicalSnapshot, type SnapshotBounds } from "./snapshot-producer.js";
import { decodeZipStore } from "./zip-store.js";

const { policy, bounds } = await readSnapshotSettings();
const time = "2026-01-01T00:00:00.000Z", later = "2026-01-02T00:00:00.000Z";
const sourceCommit = "c".repeat(40);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function item(n: number): LyricItem {
  const id = `10000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
  return { format: "daasavaani-lyric", formatVersion: 1, lyricId: id, canonicalScript: "kn",
    title: `Synthetic ${n}`, tags: ["Synthetic"], lines: [{ kind: "line", lineId: id, text: `Synthetic ${n}  ` },
      { kind: "layout", text: " \t" }] };
}
const items = [item(1), item(2)];
function prepare(state = emptyPublicationLedger(), values: readonly unknown[] = items, publishedAt = time,
  limits: SnapshotBounds = bounds, snapshotPolicy = policy) {
  return prepareCanonicalSnapshot(state, fingerprint(state), { items: values, publishedAt, sourceCommit }, snapshotPolicy, limits);
}
function manifest(prepared: PreparedCanonicalSnapshot): SnapshotManifest {
  const value = parseCanonicalJson(gunzipSync(prepared.artifacts.get(prepared.manifest.path)!));
  assertSnapshotManifest(value, policy);
  return value;
}
function confirm(state: PublicationLedger, prepared: PreparedCanonicalSnapshot) {
  const reserved = reserveCanonicalSnapshot(state, fingerprint(state), prepared, bounds).state;
  const started = beginPublicationDeployment(reserved, fingerprint(reserved)), pending = started.pending!;
  return confirmPublication(started, fingerprint(started), {
    sequence: pending.sequence, manifestSha256: pending.manifestSha256, sourceCommit: pending.sourceCommit,
    publishedAt: pending.publishedAt, confirmedAt: pending.publishedAt, runId: 1, runAttempt: 1,
    deploymentId: 1, statusId: 1, artifactId: 1, artifactZipSha256: "d".repeat(64)
  });
}
function rewriteManifest(prepared: PreparedCanonicalSnapshot, value: SnapshotManifest) {
  const decoded = Buffer.from(canonical(value)), bytes = deterministicGzip(decoded), sha256 = hash(bytes);
  prepared.artifacts.delete(prepared.manifest.path);
  prepared.manifest = { sha256, path: `objects/${sha256}.json.gz`, encodedBytes: bytes.length, decodedBytes: decoded.length };
  prepared.artifacts.set(prepared.manifest.path, bytes);
}

test("staged producer verifies exact gzip, canonical JSON, policy and original STORE members without mutating inputs", () => {
  const state = emptyPublicationLedger(), before = structuredClone({ state, items, policy, bounds });
  const prepared = prepare(state), value = manifest(prepared);
  assert.deepEqual({ state, items, policy, bounds }, before);
  assert.equal(state.pending, null);
  assert.deepEqual(value.catalog.map(entry => [entry.firstPublishedAt, entry.changedAt]), [[time, time], [time, time]]);
  assert.equal(Object.keys(value.bundles).length, 1);
  for (const [sha256, bundle] of Object.entries(value.bundles)) {
    const bytes = prepared.artifacts.get(bundle.path)!;
    assert.equal(hash(bytes), sha256);
    const original = decodeZipStore(bytes, { maxMembers: 100, maxArchiveBytes: 33554432 });
    assert.deepEqual(original.map(member => hash(member.bytes)), bundle.members);
    for (const member of original) assert.deepEqual(member.bytes, prepared.artifacts.get(member.path));
  }
  const policyObject = value.objects[value.policy]!;
  assert.deepEqual(parseCanonicalJson(gunzipSync(prepared.artifacts.get(policyObject.path)!)), policy);
  assert.deepEqual(value.requiredCapabilities, ["snapshot-envelope-v1", "lyric-preview-v1", "snapshot-policy-v1"]);
  assert.equal(canonical(value).includes(sourceCommit), false);
});
test("generation is deterministic across input order and does not normalize literal layout or item bytes", () => {
  const a = prepare(), b = prepare(emptyPublicationLedger(), [...items].reverse());
  assert.equal(a.manifest.sha256, b.manifest.sha256);
  assert.deepEqual(a.artifacts, b.artifacts);
  const value = manifest(a), record = value.objects[value.catalog[0]!.item]!;
  assert.deepEqual(parseCanonicalJson(gunzipSync(a.artifacts.get(record.path)!)), items[0]);
});
test("only a matching reservation binds a sequence; retries and deploying phase retain exact descriptor bytes", () => {
  const state = emptyPublicationLedger(), prepared = prepare(state);
  assert.throws(() => bindCanonicalSnapshot(state, fingerprint(state), prepared, bounds), /No snapshot reservation/);
  const result = reserveCanonicalSnapshot(state, fingerprint(state), prepared, bounds);
  assert.equal(result.outcome, "reserved");
  const bound = bindCanonicalSnapshot(result.state, fingerprint(result.state), prepared, bounds);
  assert.equal(bound.descriptor.sequence, 1);
  assert.equal(bound.descriptor.manifest.sha256, prepared.manifest.sha256);
  assert.deepEqual(bound.descriptorBytes, Buffer.from(canonical(bound.descriptor) + "\n"));
  const retried = reserveCanonicalSnapshot(result.state, fingerprint(result.state), prepared, bounds);
  assert.equal(retried.outcome, "retry");
  const started = beginPublicationDeployment(result.state, fingerprint(result.state));
  assert.deepEqual(bindCanonicalSnapshot(started, fingerprint(started), prepared, bounds).descriptorBytes, bound.descriptorBytes);
  assert.throws(() => bindCanonicalSnapshot(result.state, fingerprint(state), prepared, bounds), /Stale/);
  const changed = structuredClone(prepared);
  changed.plan.sourceCommit = "e".repeat(40);
  assert.throws(() => bindCanonicalSnapshot(result.state, fingerprint(result.state), changed, bounds), /match reservation/);
  bound.artifacts.get(prepared.manifest.path)!.fill(0);
  assert.notEqual(hash(prepared.artifacts.get(prepared.manifest.path)!), hash(bound.artifacts.get(prepared.manifest.path)!));
});
test("true no-op retains manifest, dates and sequence even with a later generation marker or exhausted counter", () => {
  const first = prepare(), state = confirm(emptyPublicationLedger(), first);
  const next = prepare(state, items, later);
  assert.equal(next.manifest.sha256, first.manifest.sha256);
  assert.deepEqual(next.artifacts, first.artifacts);
  const exhausted = { ...state, lastSequence: Number.MAX_SAFE_INTEGER };
  const atLimit = prepare(exhausted, items, later);
  const result = reserveCanonicalSnapshot(exhausted, fingerprint(exhausted), atLimit, bounds);
  assert.equal(result.outcome, "noop");
  assert.deepEqual(result.state, exhausted);
});
test("semantic edits split exact cohorts while removal and same-content reintroduction retain historical dates", () => {
  const original = prepare(), state = confirm(emptyPublicationLedger(), original);
  const changed = structuredClone(items);
  changed[0]!.lines[0]!.text += " edited";
  const edited = prepare(state, changed, later), value = manifest(edited);
  assert.equal(value.catalog[0]!.firstPublishedAt, time);
  assert.equal(value.catalog[0]!.changedAt, later);
  assert.equal(value.catalog[1]!.changedAt, time);
  assert.equal(Object.keys(value.bundles).length, 0);
  assert.equal(value.catalog[1]!.item, manifest(original).catalog[1]!.item);
  const removed = confirm(state, prepare(state, [items[1]], later));
  assert.equal(removed.items[0]!.present, false);
  const returned = manifest(prepare(removed, items, "2026-01-03T00:00:00.000Z"));
  assert.equal(returned.catalog[0]!.firstPublishedAt, time);
  assert.equal(returned.catalog[0]!.changedAt, time);
});
test("transport policy changes create a new snapshot without semantic-date or original-item changes", () => {
  const first = prepare(), state = confirm(emptyPublicationLedger(), first);
  const changedPolicy = structuredClone(policy);
  changedPolicy.transferPlanning.maxExtraBytes--;
  const next = prepare(state, items, later, bounds, changedPolicy), before = manifest(first);
  const after = manifest(next);
  assert.notEqual(next.manifest.sha256, first.manifest.sha256);
  assert.notEqual(after.policy, before.policy);
  assert.deepEqual(after.catalog, before.catalog);
  assert.equal(reserveCanonicalSnapshot(state, fingerprint(state), next, bounds).state.pending!.sequence, 2);
});
test("cancellation leaves gaps and failed descriptor admission cannot consume a sequence", () => {
  const state = emptyPublicationLedger(), prepared = prepare(state);
  const reserved = reserveCanonicalSnapshot(state, fingerprint(state), prepared, bounds).state;
  const cancelled = cancelPublicationReservation(reserved, fingerprint(reserved));
  const next = prepare(cancelled);
  assert.equal(reserveCanonicalSnapshot(cancelled, fingerprint(cancelled), next, bounds).state.pending!.sequence, 2);
  assert.throws(() => reserveCanonicalSnapshot(state, fingerprint(state), prepared, { ...bounds, maxDescriptorBytes: 1 }), /Descriptor/);
  assert.equal(state.lastSequence, 0);
  assert.equal(state.pending, null);
});
test("all actual encoded and decoded role ceilings and descriptor equality/+1 are enforced", () => {
  const state = emptyPublicationLedger(), prepared = prepare(state), value = manifest(prepared);
  const records = Object.values(value.objects), itemRecords = records.filter(record => record.role === "item");
  const exact: SnapshotBounds = {
    maxDescriptorBytes: bounds.maxDescriptorBytes, maxManifestEncodedBytes: prepared.manifest.encodedBytes,
    maxManifestDecodedBytes: prepared.manifest.decodedBytes,
    maxItemEncodedBytes: Math.max(...itemRecords.map(record => record.encodedBytes)),
    maxItemDecodedBytes: Math.max(...itemRecords.map(record => record.decodedBytes)),
    maxPolicyEncodedBytes: value.objects[value.policy]!.encodedBytes,
    maxPolicyDecodedBytes: value.objects[value.policy]!.decodedBytes
  };
  assert.equal(prepare(state, items, time, exact).manifest.sha256, prepared.manifest.sha256);
  for (const key of ["maxManifestEncodedBytes", "maxManifestDecodedBytes", "maxItemEncodedBytes",
    "maxItemDecodedBytes", "maxPolicyEncodedBytes", "maxPolicyDecodedBytes"] as const) {
    assert.throws(() => prepare(state, items, time, { ...exact, [key]: exact[key] - 1 }), /byte limit/);
  }
  const reserved = reserveCanonicalSnapshot(state, fingerprint(state), prepared, bounds).state;
  const size = bindCanonicalSnapshot(reserved, fingerprint(reserved), prepared, bounds).descriptorBytes.length;
  reserveCanonicalSnapshot(state, fingerprint(state), prepared, { ...exact, maxDescriptorBytes: size });
  assert.throws(() => reserveCanonicalSnapshot(state, fingerprint(state), prepared, { ...exact, maxDescriptorBytes: size - 1 }), /Descriptor/);
  assert.throws(() => prepare(state, items, time, { ...bounds, maxPolicyEncodedBytes: Number.NaN }), /safety bound/);
});
test("forged original bytes, missing/extraneous artifacts and corrupt STORE bytes fail before reservation", () => {
  const state = emptyPublicationLedger(), original = prepare(state), value = manifest(original);
  for (const change of [
    (p: PreparedCanonicalSnapshot) => { p.artifacts.get(value.objects[value.catalog[0]!.item]!.path)!.fill(0); },
    (p: PreparedCanonicalSnapshot) => { p.artifacts.delete(value.objects[value.policy]!.path); },
    (p: PreparedCanonicalSnapshot) => { p.artifacts.set("private.json", Buffer.from("{}")); },
    (p: PreparedCanonicalSnapshot) => { p.artifacts.get(Object.values(value.bundles)[0]!.path)!.fill(0); },
    (p: PreparedCanonicalSnapshot) => { p.manifest.decodedBytes++; },
  ]) {
    const prepared = structuredClone(original);
    // structuredClone copies Node buffers as Uint8Arrays; preserve the API's Buffer representation.
    prepared.artifacts = new Map([...original.artifacts].map(([path, bytes]) => [path, Buffer.from(bytes)]));
    change(prepared);
    assert.throws(() => reserveCanonicalSnapshot(state, fingerprint(state), prepared, bounds));
    assert.equal(state.pending, null);
  }
});
test("validly rehashed but semantically forged catalog dates, metadata and plan cannot pass", () => {
  const state = emptyPublicationLedger();
  for (const change of [
    (m: SnapshotManifest) => { m.catalog[0]!.title = "Changed metadata"; },
    (m: SnapshotManifest) => { m.catalog[0]!.firstPublishedAt = "2025-01-01T00:00:00.000Z"; },
    (m: SnapshotManifest) => { m.catalog[0]!.tags = []; },
  ]) {
    const prepared = prepare(state), value = manifest(prepared);
    change(value);
    rewriteManifest(prepared, value);
    assert.throws(() => reserveCanonicalSnapshot(state, fingerprint(state), prepared, bounds), /binding mismatch/);
  }
  const forged = prepare(state);
  forged.plan.items[0]!.logicalSha256 = "f".repeat(64);
  assert.throws(() => reserveCanonicalSnapshot(state, fingerprint(state), forged, bounds), /binding mismatch/);
});
test("rehashing corrupt archive bytes does not bypass physical STORE verification", () => {
  const state = emptyPublicationLedger(), prepared = prepare(state), value = manifest(prepared);
  const [oldHash, bundle] = Object.entries(value.bundles)[0]!, bytes = Buffer.from(prepared.artifacts.get(bundle.path)!);
  bytes[0] = 0;
  const sha256 = hash(bytes), path = `bundles/${sha256}.zip`;
  prepared.artifacts.delete(bundle.path);
  prepared.artifacts.set(path, bytes);
  delete value.bundles[oldHash];
  value.bundles[sha256] = { ...bundle, path };
  rewriteManifest(prepared, value);
  assert.throws(() => reserveCanonicalSnapshot(state, fingerprint(state), prepared, bounds), /ZIP/);
});
test("unsupported populated metadata, duplicate identities, fixture objects and hidden input fields reject explicitly", () => {
  for (const values of [[], [items[0], items[0]], [{ ...item(1), verses: [] }],
    [{ ...item(1), sourceLatin: "unreviewed" }], [{ ...item(1), fixture: true }], [{ ...item(1), lines: [] }]]) {
    assert.throws(() => prepare(emptyPublicationLedger(), values));
  }
  const state = emptyPublicationLedger();
  assert.throws(() => prepareCanonicalSnapshot(state, fingerprint(state),
    { items, publishedAt: time, sourceCommit, ...{ privateSource: true } }, policy, bounds), /snapshot input/);
});

test("actual snapshot planning covers every missing original and policy once with measured selected request bytes", () => {
  const large = structuredClone(items);
  for (let i = 0; i < large.length; i++) {
    large[i]!.lines[0]!.text = Array.from({ length: 128 }, (_, n) => hash(Buffer.from(`synthetic-${i}-${n}`))).join(" ");
  }
  const prepared = prepare(emptyPublicationLedger(), large), value = manifest(prepared);
  const plan = planCanonicalSnapshotDownload(prepared, bounds, []), covered: string[] = [];
  let bytes = 0;
  assert.equal(plan.requests.filter(request => request.kind === "bundle").length, 1);
  assert.equal(plan.requestCount, 2);
  for (const request of plan.requests) {
    const record = request.kind === "object" ? value.objects[request.sha256]! : value.bundles[request.sha256]!;
    const actual = prepared.artifacts.get(record.path)!;
    bytes += actual.length;
    assert.equal(request.encodedBytes, actual.length);
    assert.equal(hash(actual), request.sha256);
    if (request.kind === "bundle") {
      const original = decodeZipStore(actual, { maxMembers: 100, maxArchiveBytes: 33554432 });
      assert.deepEqual(original.map(member => hash(member.bytes)).sort(), request.covers);
    }
    covered.push(...request.covers);
  }
  assert.deepEqual(covered.sort(), Object.keys(value.objects).sort());
  assert.equal(new Set(covered).size, covered.length);
  assert.equal(plan.transferEncodedBytes, bytes);
  assert.equal(plan.missingEncodedBytes, Object.values(value.objects).reduce((sum, object) => sum + object.encodedBytes, 0));
  assert.equal(plan.extraEncodedBytes, bytes - plan.missingEncodedBytes);
  assert.equal(plan.costBytes, bytes + plan.requestCount * policy.transferPlanning.requestCostBytes);
  assert.equal(plan.baselineCostBytes, plan.missingEncodedBytes + covered.length * policy.transferPlanning.requestCostBytes);
  assert.equal(plan.savedCostBytes, plan.baselineCostBytes - plan.costBytes);
  assert.ok(plan.extraEncodedBytes <= plan.extraBudgetBytes);
  assert.ok(plan.savedCostBytes > 0);
  const policyFetched = planCanonicalSnapshotDownload(prepared, bounds, [value.policy]);
  assert.equal(policyFetched.requestCount, 1);
  assert.equal(policyFetched.requests[0]!.kind, "bundle");
  const none = planCanonicalSnapshotDownload(prepared, bounds, Object.keys(value.objects));
  assert.equal(none.requestCount, 0);
  assert.equal(none.transferEncodedBytes, 0);
});

test("planner binds verified artifact bytes and old original reuse to the exact changed policy, not newer settings", () => {
  const first = prepare(), old = manifest(first), verified = Object.keys(old.objects);
  const state = confirm(emptyPublicationLedger(), first), changedPolicy = structuredClone(policy);
  changedPolicy.transferPlanning.requestCostBytes = 0;
  const next = prepare(state, items, later, bounds, changedPolicy), value = manifest(next);
  const plan = planCanonicalSnapshotDownload(next, bounds, verified);
  assert.deepEqual(plan.requests, [{ kind: "object", sha256: value.policy,
    encodedBytes: value.objects[value.policy]!.encodedBytes, covers: [value.policy] }]);
  assert.equal(plan.costBytes, plan.transferEncodedBytes);
  assert.throws(() => planCanonicalSnapshotDownload(first, bounds, [old.policy, old.policy]));
  assert.throws(() => planCanonicalSnapshotDownload(first, bounds, ["invalid"]));
  first.artifacts.get(old.objects[old.policy]!.path)!.fill(0);
  assert.throws(() => planCanonicalSnapshotDownload(first, bounds, verified), /identity\/size mismatch/);
});
