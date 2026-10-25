import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonical } from "./publisher.js";
import type { BaselineInitializationReview } from "./semantic-baseline.js";
import {
  assertPublicationLedger, emptyPublicationLedger, encodePublicationLedger, decodePublicationLedger,
  publicationLedgerFingerprint as tip, preparePublication, reservePublication, beginPublicationDeployment,
  cancelPublicationReservation, confirmPublication, initializePublicationLedger,
  type LogicalItem, type PublicationLedger, type PublicationReceipt
} from "./publication-ledger.js";

const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
const early = "2026-10-25T01:00:00.000Z", later = "2026-10-25T02:00:00.000Z", latest = "2026-10-25T03:00:00.000Z";
const sourceCommit = "c".repeat(40), manifestA = "a".repeat(64), manifestB = "b".repeat(64);
const logicalA: LogicalItem = { lyricId: first, logicalSha256: "1".repeat(64) };
const logicalB: LogicalItem = { lyricId: second, logicalSha256: "2".repeat(64) };

function reserve(state = emptyPublicationLedger(), items: LogicalItem[] = [logicalA], publishedAt = early, manifest = manifestA) {
  const plan = preparePublication(state, tip(state), { logicalProjection: state.logicalProjection, items, publishedAt, sourceCommit });
  return { plan, state: reservePublication(state, tip(state), plan, manifest).state };
}
function receipt(state: PublicationLedger, confirmedAt = state.pending?.publishedAt): PublicationReceipt {
  assert.ok(state.pending);
  assert.ok(confirmedAt);
  return {
    sequence: state.pending.sequence, manifestSha256: state.pending.manifestSha256, sourceCommit: state.pending.sourceCommit,
    publishedAt: state.pending.publishedAt, confirmedAt, runId: state.pending.sequence, runAttempt: 1,
    deploymentId: state.pending.sequence, statusId: state.pending.sequence, artifactId: state.pending.sequence,
    artifactZipSha256: "d".repeat(64)
  };
}
function publish(state = emptyPublicationLedger(), items: LogicalItem[] = [logicalA], publishedAt = early, manifest = manifestA) {
  const reserved = reserve(state, items, publishedAt, manifest).state;
  const deploying = beginPublicationDeployment(reserved, tip(reserved));
  return confirmPublication(deploying, tip(deploying), receipt(deploying));
}

test("reservation assigns candidate dates but commits them only after matching started deployment confirmation", () => {
  const empty = emptyPublicationLedger(), { state, plan } = reserve(empty, [logicalB, logicalA]);
  assert.equal(state.lastSequence, 1);
  assert.equal(state.confirmed, null);
  assert.deepEqual(state.items, []);
  assert.deepEqual(plan.items.map(item => [item.lyricId, item.firstPublishedAt, item.changedAt, item.present]),
    [[first, early, early, true], [second, early, early, true]]);
  assert.throws(() => confirmPublication(state, tip(state), receipt(state)), /started/);
  const deploying = beginPublicationDeployment(state, tip(state)), proof = receipt(deploying, later);
  const confirmed = confirmPublication(deploying, tip(deploying), proof);
  assert.deepEqual(confirmed.items, plan.items);
  assert.equal(confirmed.confirmed?.publishedAt, early);
  assert.equal(confirmed.confirmed?.confirmedAt, later);
  assert.equal(confirmed.pending, null);
  assert.deepEqual(empty, emptyPublicationLedger());
  assert.deepEqual(confirmPublication(confirmed, tip(confirmed), proof), confirmed);
});

test("semantic updates affect only changed items; removals and unchanged reintroductions retain dates and tombstones", () => {
  const original = publish(undefined, [logicalA, logicalB]);
  const edited = { ...logicalA, logicalSha256: "3".repeat(64) };
  const updated = publish(original, [edited, logicalB], later, manifestB);
  assert.deepEqual(updated.items.map(item => [item.firstPublishedAt, item.changedAt]), [[early, later], [early, early]]);
  const removed = publish(updated, [logicalB], latest, "e".repeat(64));
  assert.deepEqual(removed.items[0], { ...updated.items[0], present: false });
  const reintroduced = publish(removed, [logicalB, edited], "2026-10-25T04:00:00.000Z", "f".repeat(64));
  assert.deepEqual(reintroduced.items, updated.items);
  const editedAgain = publish(removed, [logicalA], "2026-10-25T05:00:00.000Z", "9".repeat(64));
  assert.equal(editedAgain.items[0]?.firstPublishedAt, early);
  assert.equal(editedAgain.items[0]?.changedAt, "2026-10-25T05:00:00.000Z");
  assert.equal(editedAgain.items[1]?.present, false);
});

test("true no-op retains complete state; transport-only snapshots advance sequence but not semantic dates", () => {
  const original = publish(), plan = preparePublication(original, tip(original), {
    logicalProjection: original.logicalProjection, items: [logicalA], publishedAt: later, sourceCommit: "e".repeat(40)
  });
  const noop = reservePublication(original, tip(original), plan, manifestA);
  assert.equal(noop.outcome, "noop");
  assert.deepEqual(encodePublicationLedger(noop.state), encodePublicationLedger(original));
  assert.equal(tip(noop.state), tip(original));
  const transport = publish(original, [logicalA], later, manifestB);
  assert.deepEqual(transport.items, original.items);
  assert.equal(transport.lastSequence, 2);
  assert.equal(transport.confirmed?.manifestSha256, manifestB);
  const changed = preparePublication(original, tip(original), {
    logicalProjection: original.logicalProjection, items: [{ ...logicalA, logicalSha256: "4".repeat(64) }], publishedAt: later, sourceCommit
  });
  assert.throws(() => reservePublication(original, tip(original), changed, manifestA), /Unchanged manifest/);
});

test("exact pending retries reserve once in both phases; different candidates and stale callers are refused", () => {
  const empty = emptyPublicationLedger(), { state, plan } = reserve(empty);
  for (const pending of [state, beginPublicationDeployment(state, tip(state))]) {
    const retry = reservePublication(pending, tip(pending), structuredClone(plan), manifestA);
    assert.equal(retry.outcome, "retry");
    assert.deepEqual(retry.state, pending);
    assert.equal(retry.state.lastSequence, 1);
    assert.throws(() => reservePublication(pending, tip(pending), plan, manifestB), /different publication/);
    assert.throws(() => reservePublication(pending, tip(pending), { ...plan, publishedAt: later }, manifestA), /different publication/);
    assert.throws(() => reservePublication(pending, tip(pending), { ...plan, sourceCommit: "e".repeat(40) }, manifestA), /different publication/);
    assert.throws(() => preparePublication(pending, tip(pending), {
      logicalProjection: pending.logicalProjection, items: [logicalA], publishedAt: later, sourceCommit
    }), /Reconcile/);
  }
  assert.throws(() => reservePublication(state, tip(empty), plan, manifestA), /Stale/);
  assert.throws(() => beginPublicationDeployment(state, tip(empty)), /Stale/);
  assert.throws(() => cancelPublicationReservation(state, tip(empty)), /Stale/);
  const cancelled = cancelPublicationReservation(state, tip(state));
  assert.throws(() => reservePublication(cancelled, tip(cancelled), plan, manifestA), /stale base/);
});

test("never-started cancellations keep sequence gaps without committing discarded dates", () => {
  const original = publish(), pending = reserve(original, [logicalA, logicalB], later, manifestB).state;
  const cancelled = cancelPublicationReservation(pending, tip(pending));
  assert.equal(cancelled.lastSequence, 2);
  assert.deepEqual(cancelled.items, original.items);
  assert.deepEqual(cancelled.confirmed, original.confirmed);
  const retry = publish(cancelled, [logicalA, logicalB], latest, manifestB);
  assert.equal(retry.lastSequence, 3);
  assert.equal(retry.items[1]?.firstPublishedAt, latest);
  assert.equal(retry.items[0]?.firstPublishedAt, early);
  const firstCancelled = cancelPublicationReservation(reserve().state, tip(reserve().state));
  assert.equal(firstCancelled.confirmed, null);
  assert.deepEqual(firstCancelled.items, []);
  assert.equal(publish(firstCancelled, [logicalA], later).lastSequence, 2);
});

test("uncertain deployment survives serialization and cannot be cancelled or superseded", () => {
  const { state, plan } = reserve(), deploying = beginPublicationDeployment(state, tip(state));
  const encoded = encodePublicationLedger(deploying);
  const restored = decodePublicationLedger(encoded, encoded.length);
  assert.deepEqual(restored, deploying);
  assert.deepEqual(beginPublicationDeployment(restored, tip(restored)), restored);
  assert.throws(() => cancelPublicationReservation(restored, tip(restored)), /never-started/);
  assert.throws(() => preparePublication(restored, tip(restored), {
    logicalProjection: restored.logicalProjection, items: [], publishedAt: later, sourceCommit
  }), /Reconcile/);
  assert.throws(() => reservePublication(restored, tip(restored), plan, manifestB), /different publication/);
  assert.deepEqual(reservePublication(restored, tip(restored), plan, manifestA).state, restored);
  assert.equal(confirmPublication(restored, tip(restored), receipt(restored, later)).lastSequence, 1);
});

test("confirmation binds candidate identity, sequence, source and logical timestamp; malformed evidence fails", () => {
  const reserved = reserve().state, state = beginPublicationDeployment(reserved, tip(reserved)), proof = receipt(state, later);
  for (const change of [
    { sequence: 2 }, { manifestSha256: manifestB }, { sourceCommit: "e".repeat(40) }, { publishedAt: later },
    { confirmedAt: "2026-10-25T00:00:00.000Z" }, { confirmedAt: later.replace(".000Z", "Z") },
    { runId: 0 }, { runAttempt: 1.5 }, { deploymentId: Number.MAX_SAFE_INTEGER + 1 }, { artifactId: -1 },
    { statusId: 0 }, { artifactZipSha256: "unknown" }, { successful: true }
  ]) assert.throws(() => confirmPublication(state, tip(state), { ...proof, ...change }));
  assert.throws(() => confirmPublication(state, tip(reserved), proof), /Stale/);
  const confirmed = confirmPublication(state, tip(state), proof);
  assert.throws(() => confirmPublication(confirmed, tip(confirmed), { ...proof, statusId: 99 }), /No matching/);
  assert.throws(() => confirmPublication(emptyPublicationLedger(), tip(emptyPublicationLedger()), proof), /No matching/);
});

test("clock rollback, invalid dates, malformed logical hashes and duplicate identities fail before reservation", () => {
  const original = publish(), pending = reserve(original, [logicalA], later, manifestB).state;
  const deploying = beginPublicationDeployment(pending, tip(pending));
  const confirmed = confirmPublication(deploying, tip(deploying), receipt(deploying, latest));
  for (const publishedAt of [early, later, "2026-02-29T00:00:00.000Z", latest.replace(".000Z", "Z"), "now"]) {
    assert.throws(() => preparePublication(confirmed, tip(confirmed), {
      logicalProjection: confirmed.logicalProjection, items: [logicalA], publishedAt, sourceCommit
    }), /timestamp/);
  }
  assert.throws(() => preparePublication(original, tip(original), {
    logicalProjection: original.logicalProjection, items: [{ ...logicalA, logicalSha256: "3".repeat(64) }], publishedAt: early, sourceCommit
  }),
    /advance changedAt/);
  for (const items of [[logicalA, logicalA], [{ ...logicalA, logicalSha256: "bad" }],
    [{ ...logicalA, lyricId: "not-uuid" }], [{ ...logicalA, changedAt: early }]]) {
    assert.throws(() => preparePublication(original, tip(original), {
      logicalProjection: original.logicalProjection, items, publishedAt: later, sourceCommit
    }));
  }
  assert.throws(() => preparePublication(original, tip(original), {
    logicalProjection: original.logicalProjection, items: [logicalA], publishedAt: later, sourceCommit: "bad"
  }), /plan/);
  const empty = emptyPublicationLedger();
  assert.throws(() => beginPublicationDeployment(empty, tip(empty)), /No publication/);
  assert.throws(() => cancelPublicationReservation(empty, tip(empty)), /never-started/);
});

test("sequence exhaustion refuses new snapshots but permits true no-ops and safe pending reconciliation", () => {
  const original = publish(), exhausted = { ...original, lastSequence: Number.MAX_SAFE_INTEGER };
  const plan = preparePublication(exhausted, tip(exhausted), {
    logicalProjection: exhausted.logicalProjection, items: [logicalA], publishedAt: later, sourceCommit
  });
  assert.equal(reservePublication(exhausted, tip(exhausted), plan, manifestA).outcome, "noop");
  assert.throws(() => reservePublication(exhausted, tip(exhausted), plan, manifestB), /exhausted/);
  const lastBase = { ...original, lastSequence: Number.MAX_SAFE_INTEGER - 1 };
  const reserved = reserve(lastBase, [logicalA], later, manifestB).state;
  assert.equal(reserved.lastSequence, Number.MAX_SAFE_INTEGER);
  const deploying = beginPublicationDeployment(reserved, tip(reserved));
  assert.equal(confirmPublication(deploying, tip(deploying), receipt(deploying)).lastSequence, Number.MAX_SAFE_INTEGER);
});

test("strict state codec enforces actual byte limit, UTF8, canonical JSON, version and schema", () => {
  const state = publish(), encoded = encodePublicationLedger(state);
  assert.deepEqual(decodePublicationLedger(encoded, encoded.length), state);
  assert.throws(() => decodePublicationLedger(encoded, encoded.length - 1), /size/);
  for (const limit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => decodePublicationLedger(encoded, limit), /bound/);
  }
  const text = encoded.toString("utf8");
  for (const invalid of [
    text.trim(), " " + text, text.replace("\n", "\r\n"), "\uFEFF" + text,
    text.replace('"formatVersion":2', '"formatVersion":2,"formatVersion":2'),
    text.replace('"formatVersion":2', '"formatVersion":3'), text.replace('"lastSequence":1', '"lastSequence":1.5'),
    text.replace('"lastSequence":1', '"unknown":true,"lastSequence":1'),
    text.replace('"formatVersion":2', '"formatVersion":2,"__proto__":{}')
  ]) assert.throws(() => decodePublicationLedger(Buffer.from(invalid), encoded.length * 2));
  assert.throws(() => decodePublicationLedger(Buffer.from([0xff]), 10));
  assert.throws(() => decodePublicationLedger(Buffer.alloc(0), 10));
});

test("state invariants reject impossible counters, dates, item order and tampered pending derivation", () => {
  const original = publish(undefined, [logicalA, logicalB]), { state } = reserve(original, [logicalA], later, manifestB);
  assert.ok(state.pending);
  const invalid: unknown[] = [
    { ...original, lastSequence: 0 }, { ...original, confirmed: null },
    { ...original, items: [...original.items].reverse() }, { ...original, items: [original.items[0], original.items[0]] },
    { ...original, items: [{ ...original.items[0], firstPublishedAt: later }] },
    { ...original, items: [{ ...original.items[0], changedAt: "2026-02-29T00:00:00.000Z" }] },
    { ...state, pending: { ...state.pending, sequence: 1 } },
    { ...state, pending: { ...state.pending, baseStateSha256: "0".repeat(64) } },
    { ...state, pending: { ...state.pending, manifestSha256: manifestA } },
    { ...state, pending: { ...state.pending, publishedAt: "2026-10-25T00:00:00.000Z" } },
    { ...state, pending: { ...state.pending, items: state.pending.items.slice(0, 1) } },
    { ...state, pending: { ...state.pending, items: state.pending.items.map(item => ({ ...item, firstPublishedAt: later })) } }
  ];
  for (const [index, value] of invalid.entries()) assert.throws(() => assertPublicationLedger(value), `Invalid state case ${index}`);
  const plan = preparePublication(original, tip(original), {
    logicalProjection: original.logicalProjection, items: [logicalA], publishedAt: later, sourceCommit
  });
  assert.throws(() => reservePublication(original, tip(original), { ...plan, items: plan.items.slice(0, 1) }, manifestB), /derivation/);
  assert.throws(() => reservePublication(original, tip(original), plan, "unknown"), /reservation/);
});

test("planning is input-order independent, reducer outputs do not alias inputs and state contains no lyric payloads", () => {
  const empty = emptyPublicationLedger(), incoming = [logicalB, logicalA], before = structuredClone(incoming);
  const plan = preparePublication(empty, tip(empty), {
    logicalProjection: empty.logicalProjection, items: incoming, publishedAt: early, sourceCommit
  });
  assert.deepEqual(plan, preparePublication(empty, tip(empty), {
    logicalProjection: empty.logicalProjection, items: [...incoming].reverse(), publishedAt: early, sourceCommit
  }));
  assert.deepEqual(incoming, before);
  const { state } = reservePublication(empty, tip(empty), plan, manifestA);
  assert.ok(state.pending);
  state.pending.items[0]!.present = false;
  assert.equal(plan.items[0]?.present, true);
  assert.deepEqual(empty, emptyPublicationLedger());
  const confirmed = publish(), next = reserve(confirmed, [logicalB], later, manifestB).state;
  assert.ok(next.pending);
  next.items[0]!.present = false;
  next.pending.items[0]!.changedAt = latest;
  assert.equal(confirmed.items[0]?.present, true);
  assert.equal(confirmed.items[0]?.changedAt, early);
  const text = encodePublicationLedger(confirmed).toString("utf8");
  for (const field of ["title", "lyrics", "provenance", "manifestBytes"]) assert.equal(text.includes(`"${field}"`), false);
});

function baselineReview(): BaselineInitializationReview {
  return {
    format: "daasavaani-ledger-baseline-review", formatVersion: 1, status: "review-required",
    logicalProjection: "canonical-prelaunch-v1", auditSha256: "f".repeat(64), sequence: null,
    legacyPublication: {
      sourceCommit, runId: 1, runAttempt: 1, deploymentId: 2, statusId: 3, artifactId: 4,
      artifactZipSha256: "d".repeat(64), confirmedAt: later, manifestSha256: manifestA, catalogCount: 1
    },
    items: [
      { ...logicalA, firstPublishedAt: early, changedAt: early, present: true },
      { ...logicalB, firstPublishedAt: early, changedAt: early, present: false }
    ]
  };
}
const reviewPin = (review: BaselineInitializationReview) => createHash("sha256").update(canonical(review) + "\n").digest("hex");

test("explicit legacy bootstrap seals the reviewed baseline without inventing a confirmed sequence", () => {
  const review = baselineReview(), state = initializePublicationLedger(review, reviewPin(review));
  assert.equal(state.formatVersion, 2);
  assert.equal(state.logicalProjection, "canonical-prelaunch-v1");
  assert.equal(state.lastSequence, 0);
  assert.equal(state.confirmed, null);
  assert.equal(state.pending, null);
  assert.deepEqual(state.items, review.items);
  assert.equal(state.baseline?.review.sequence, null);
  const encoded = encodePublicationLedger(state);
  assert.deepEqual(decodePublicationLedger(encoded, encoded.length), state);
  review.items[0]!.changedAt = later;
  assert.equal(state.items[0]?.changedAt, early);
  assert.equal(state.baseline?.review.items[0]?.changedAt, early);
});

test("legacy no-op consumes no sequence; first new snapshot reserves one and preserves historical item dates", () => {
  const review = baselineReview(), state = initializePublicationLedger(review, reviewPin(review));
  const unchanged = reserve(state, [logicalA], latest, manifestA).state;
  assert.deepEqual(unchanged, state);
  const firstNew = publish(state, [logicalA], latest, manifestB);
  assert.equal(firstNew.lastSequence, 1);
  assert.equal(firstNew.confirmed?.sequence, 1);
  assert.deepEqual(firstNew.items, review.items);
  assert.deepEqual(firstNew.baseline, state.baseline);
  assert.equal(firstNew.baseline?.review.legacyPublication.manifestSha256, manifestA);
});

test("baseline cancellations leave gaps while historical tombstones and first dates survive later sequenced edits", () => {
  const review = baselineReview(), state = initializePublicationLedger(review, reviewPin(review));
  const reserved = reserve(state, [logicalA], latest, manifestB).state;
  const cancelled = cancelPublicationReservation(reserved, tip(reserved));
  assert.equal(cancelled.lastSequence, 1);
  assert.deepEqual(cancelled.items, state.items);
  assert.equal(cancelled.confirmed, null);
  const edited = { ...logicalA, logicalSha256: "4".repeat(64) };
  const confirmed = publish(cancelled, [logicalB, edited], latest, manifestB);
  assert.equal(confirmed.confirmed?.sequence, 2);
  assert.equal(confirmed.items[0]?.firstPublishedAt, early);
  assert.equal(confirmed.items[0]?.changedAt, latest);
  assert.deepEqual(confirmed.items[1], { ...review.items[1], present: true });
  assert.deepEqual(confirmed.baseline, state.baseline);
});

test("baseline admission rejects altered pins, dates, counts, schemas and projection mixing", () => {
  const review = baselineReview(), state = initializePublicationLedger(review, reviewPin(review));
  assert.throws(() => initializePublicationLedger(review, "0".repeat(64)), /identity/);
  const badDate = structuredClone(review); badDate.items[0]!.firstPublishedAt = latest;
  assert.throws(() => initializePublicationLedger(badDate, reviewPin(badDate)), /dates/);
  const badCount = structuredClone(review); badCount.legacyPublication.catalogCount = 2;
  assert.throws(() => initializePublicationLedger(badCount, reviewPin(badCount)), /count/);
  for (const value of [
    { ...state, logicalProjection: "future-projection" },
    { ...state, baseline: { ...state.baseline, review: { ...review, logicalProjection: "future-projection" } } },
    { ...state, baseline: { ...state.baseline, review: { ...review, sequence: 1 } } },
    { ...state, baseline: { ...state.baseline, review: { ...review, status: "approved" } } },
    { ...state, items: state.items.slice(0, 1) },
    { ...state, items: state.items.map(item => ({ ...item, firstPublishedAt: later })) }
  ]) assert.throws(() => assertPublicationLedger(value));
  assert.throws(() => reserve(state, [logicalA], early, manifestB), /timestamp/);
});

test("private v1 is not silently migrated and sequenced states cannot erase or backdate their baseline", () => {
  const review = baselineReview(), state = initializePublicationLedger(review, reviewPin(review));
  const text = encodePublicationLedger(emptyPublicationLedger()).toString("utf8").replace('"formatVersion":2', '"formatVersion":1');
  assert.throws(() => decodePublicationLedger(Buffer.from(text), text.length), /schema/);
  const confirmed = publish(state, [logicalA], latest, manifestB);
  assert.throws(() => assertPublicationLedger({ ...confirmed, items: confirmed.items.slice(0, 1) }), /identities/);
  assert.throws(() => assertPublicationLedger({
    ...confirmed, confirmed: { ...confirmed.confirmed, publishedAt: early }
  }), /predates/);
  const mutated = structuredClone(confirmed);
  assert.ok(mutated.baseline);
  mutated.baseline.review.legacyPublication.runId = 9;
  assert.throws(() => assertPublicationLedger(mutated), /identity/);
});
