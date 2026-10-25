import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import { canonical, isUtcMillisecondInstant } from "./publisher.js";

export interface LogicalItem {
  lyricId: string;
  logicalSha256: string;
}
export interface LedgerItem extends LogicalItem {
  firstPublishedAt: string;
  changedAt: string;
  present: boolean;
}
export interface PublicationPlan {
  baseStateSha256: string;
  sourceCommit: string;
  publishedAt: string;
  items: LedgerItem[];
}
export interface PendingPublication extends PublicationPlan {
  sequence: number;
  manifestSha256: string;
  phase: "reserved" | "deploying";
}
export interface PublicationReceipt {
  sequence: number;
  manifestSha256: string;
  sourceCommit: string;
  publishedAt: string;
  confirmedAt: string;
  runId: number;
  runAttempt: number;
  deploymentId: number;
  statusId: number;
  artifactId: number;
  artifactZipSha256: string;
}
export interface PublicationLedger {
  format: "daasavaani-publication-ledger";
  formatVersion: 1;
  lastSequence: number;
  confirmed: PublicationReceipt | null;
  items: LedgerItem[];
  pending: PendingPublication | null;
}

const hash = { type: "string", pattern: "^[0-9a-f]{64}$" };
const commit = { type: "string", pattern: "^[0-9a-f]{40}$" };
const uuid = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" };
const integer = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const instant = { type: "string" };
const logicalProperties = { lyricId: uuid, logicalSha256: hash };
const itemProperties = { ...logicalProperties, firstPublishedAt: instant, changedAt: instant, present: { type: "boolean" } };
const itemSchema = { type: "object", additionalProperties: false, required: Object.keys(itemProperties), properties: itemProperties };
const itemsSchema = { type: "array", items: itemSchema };
const planProperties = { baseStateSha256: hash, sourceCommit: commit, publishedAt: instant, items: itemsSchema };
const planSchema = { type: "object", additionalProperties: false, required: Object.keys(planProperties), properties: planProperties };
const pendingProperties = {
  ...planProperties, sequence: integer, manifestSha256: hash, phase: { enum: ["reserved", "deploying"] }
};
const receiptProperties = {
  sequence: integer, manifestSha256: hash, sourceCommit: commit, publishedAt: instant, confirmedAt: instant,
  runId: integer, runAttempt: integer, deploymentId: integer, statusId: integer, artifactId: integer, artifactZipSha256: hash
};
const receiptSchema = {
  type: "object", additionalProperties: false, required: Object.keys(receiptProperties), properties: receiptProperties
};
const ajv = new Ajv2020.default({ strict: true });
const validatePlan = ajv.compile<PublicationPlan>(planSchema);
const validateReceipt = ajv.compile<PublicationReceipt>(receiptSchema);
const validateLogicalItems = ajv.compile<LogicalItem[]>({
  type: "array", items: {
    type: "object", additionalProperties: false, required: Object.keys(logicalProperties), properties: logicalProperties
  }
});
const validateLedger = ajv.compile<PublicationLedger>({
  type: "object", additionalProperties: false,
  required: ["format", "formatVersion", "lastSequence", "confirmed", "items", "pending"],
  properties: {
    format: { const: "daasavaani-publication-ledger" }, formatVersion: { const: 1 },
    lastSequence: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    confirmed: { anyOf: [{ type: "null" }, receiptSchema] }, items: itemsSchema,
    pending: { anyOf: [{ type: "null" }, {
      type: "object", additionalProperties: false, required: Object.keys(pendingProperties), properties: pendingProperties
    }] }
  }
});
const bytes = (value: unknown) => Buffer.from(canonical(value) + "\n", "utf8");
const fingerprint = (state: PublicationLedger) => createHash("sha256").update(bytes(state)).digest("hex");
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

function receiptDates(receipt: PublicationReceipt): void {
  if (!isUtcMillisecondInstant(receipt.publishedAt) || !isUtcMillisecondInstant(receipt.confirmedAt) ||
      receipt.confirmedAt < receipt.publishedAt) throw new Error("Invalid publication receipt dates");
}

function orderedItems(items: LedgerItem[], latest: string): void {
  let previous = "";
  for (const item of items) {
    if (item.lyricId <= previous) throw new Error("Ledger identities must be unique and sorted");
    if (!isUtcMillisecondInstant(item.firstPublishedAt) || !isUtcMillisecondInstant(item.changedAt) ||
        item.firstPublishedAt > item.changedAt || item.changedAt > latest) throw new Error("Invalid ledger item dates");
    previous = item.lyricId;
  }
}

function deriveItems(state: PublicationLedger, incoming: LogicalItem[], publishedAt: string): LedgerItem[] {
  if (!isUtcMillisecondInstant(publishedAt) ||
      (state.confirmed !== null && publishedAt < state.confirmed.confirmedAt)) {
    throw new Error("Publication timestamp must not precede the last confirmation");
  }
  const items = new Map(state.items.map(item => [item.lyricId, { ...item, present: false }]));
  const seen = new Set<string>();
  for (const logical of incoming) {
    if (seen.has(logical.lyricId)) throw new Error("Duplicate logical lyric identity");
    seen.add(logical.lyricId);
    const prior = items.get(logical.lyricId);
    if (prior && prior.logicalSha256 !== logical.logicalSha256 && publishedAt <= prior.changedAt) {
      throw new Error("A semantic change must advance changedAt");
    }
    items.set(logical.lyricId, {
      ...logical, firstPublishedAt: prior?.firstPublishedAt ?? publishedAt,
      changedAt: prior && prior.logicalSha256 === logical.logicalSha256 ? prior.changedAt : publishedAt,
      present: true
    });
  }
  return [...items.values()].sort((a, b) => a.lyricId < b.lyricId ? -1 : a.lyricId > b.lyricId ? 1 : 0);
}

export function assertPublicationLedger(value: unknown): asserts value is PublicationLedger {
  if (!validateLedger(value)) throw new Error("Invalid publication ledger schema: " + ajv.errorsText(validateLedger.errors));
  const state = value;
  if (state.confirmed === null) {
    if (state.items.length !== 0) throw new Error("Unconfirmed ledger cannot contain committed items");
  } else {
    receiptDates(state.confirmed);
    if (state.confirmed.sequence > state.lastSequence) throw new Error("Confirmed sequence exceeds reservation counter");
    orderedItems(state.items, state.confirmed.publishedAt);
  }
  const pending = state.pending;
  if (pending !== null) {
    if (pending.sequence !== state.lastSequence ||
        (state.confirmed !== null && pending.sequence <= state.confirmed.sequence)) throw new Error("Invalid pending sequence");
    const base = { ...state, lastSequence: pending.sequence - 1, pending: null };
    if (pending.baseStateSha256 !== fingerprint(base)) throw new Error("Pending publication has a different base state");
    orderedItems(pending.items, pending.publishedAt);
    const logical = pending.items.filter(item => item.present).map(({ lyricId, logicalSha256 }) => ({ lyricId, logicalSha256 }));
    if (!same(pending.items, deriveItems(base, logical, pending.publishedAt))) throw new Error("Invalid pending item derivation");
    if (pending.manifestSha256 === state.confirmed?.manifestSha256) throw new Error("A no-op must not reserve a sequence");
  }
}

export function emptyPublicationLedger(): PublicationLedger {
  return { format: "daasavaani-publication-ledger", formatVersion: 1, lastSequence: 0, confirmed: null, items: [], pending: null };
}

export function encodePublicationLedger(state: PublicationLedger): Buffer {
  assertPublicationLedger(state);
  return bytes(state);
}

export function decodePublicationLedger(encoded: Uint8Array, maxEncodedBytes: number): PublicationLedger {
  if (!Number.isSafeInteger(maxEncodedBytes) || maxEncodedBytes <= 0 || !(encoded instanceof Uint8Array) ||
      encoded.length === 0 || encoded.length > maxEncodedBytes) throw new Error("Invalid ledger encoded size or bound");
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(encoded));
  assertPublicationLedger(value);
  if (!bytes(value).equals(encoded)) throw new Error("Noncanonical publication ledger bytes");
  return value;
}

export function publicationLedgerFingerprint(state: PublicationLedger): string {
  assertPublicationLedger(state);
  return fingerprint(state);
}

function expectState(state: PublicationLedger, expectedStateSha256: string): void {
  assertPublicationLedger(state);
  if (fingerprint(state) !== expectedStateSha256) throw new Error("Stale publication ledger state");
}

export function preparePublication(
  state: PublicationLedger, expectedStateSha256: string, logicalItems: readonly LogicalItem[], publishedAt: string, sourceCommit: string
): PublicationPlan {
  expectState(state, expectedStateSha256);
  if (state.pending !== null) throw new Error("Reconcile the pending publication before preparing another");
  if (!validateLogicalItems(logicalItems)) throw new Error("Invalid logical publication items");
  const plan = {
    baseStateSha256: expectedStateSha256, sourceCommit, publishedAt,
    items: deriveItems(state, logicalItems, publishedAt)
  };
  if (!validatePlan(plan)) throw new Error("Invalid publication plan");
  return structuredClone(plan);
}

export function reservePublication(
  state: PublicationLedger, expectedStateSha256: string, plan: PublicationPlan, manifestSha256: string
): { outcome: "reserved" | "retry" | "noop"; state: PublicationLedger } {
  expectState(state, expectedStateSha256);
  if (!validatePlan(plan) || !/^[0-9a-f]{64}$/.test(manifestSha256)) throw new Error("Invalid publication reservation");
  if (state.pending !== null) {
    const { sequence: _sequence, phase: _phase, manifestSha256: pendingHash, ...pendingPlan } = state.pending;
    if (pendingHash !== manifestSha256 || !same(plan, pendingPlan)) throw new Error("A different publication is already pending");
    return { outcome: "retry", state: structuredClone(state) };
  }
  if (plan.baseStateSha256 !== expectedStateSha256) throw new Error("Publication plan has a stale base state");
  const logical = plan.items.filter(item => item.present).map(({ lyricId, logicalSha256 }) => ({ lyricId, logicalSha256 }));
  if (!same(plan.items, deriveItems(state, logical, plan.publishedAt))) throw new Error("Invalid publication plan item derivation");
  if (manifestSha256 === state.confirmed?.manifestSha256) {
    if (!same(plan.items, state.items)) throw new Error("Unchanged manifest cannot describe different logical items");
    return { outcome: "noop", state: structuredClone(state) };
  }
  if (state.lastSequence === Number.MAX_SAFE_INTEGER) throw new Error("Publication sequence exhausted");
  const sequence = state.lastSequence + 1;
  const next: PublicationLedger = {
    ...structuredClone(state), lastSequence: sequence,
    pending: { ...structuredClone(plan), manifestSha256, sequence, phase: "reserved" }
  };
  assertPublicationLedger(next);
  return { outcome: "reserved", state: next };
}

export function beginPublicationDeployment(state: PublicationLedger, expectedStateSha256: string): PublicationLedger {
  expectState(state, expectedStateSha256);
  if (state.pending === null) throw new Error("No publication is reserved");
  const next = structuredClone(state);
  next.pending = { ...state.pending, items: structuredClone(state.pending.items), phase: "deploying" };
  return next;
}

export function cancelPublicationReservation(state: PublicationLedger, expectedStateSha256: string): PublicationLedger {
  expectState(state, expectedStateSha256);
  if (state.pending?.phase !== "reserved") throw new Error("Only a never-started reservation can be cancelled");
  return { ...structuredClone(state), pending: null };
}

export function confirmPublication(
  state: PublicationLedger, expectedStateSha256: string, receipt: PublicationReceipt
): PublicationLedger {
  expectState(state, expectedStateSha256);
  if (!validateReceipt(receipt)) throw new Error("Invalid publication receipt");
  receiptDates(receipt);
  if (state.pending === null) {
    if (same(receipt, state.confirmed)) return structuredClone(state);
    throw new Error("No matching deployment is pending");
  }
  const pending = state.pending;
  if (pending.phase !== "deploying" || receipt.sequence !== pending.sequence ||
      receipt.manifestSha256 !== pending.manifestSha256 || receipt.sourceCommit !== pending.sourceCommit ||
      receipt.publishedAt !== pending.publishedAt) throw new Error("Receipt does not match the started publication");
  const next: PublicationLedger = {
    ...structuredClone(state), confirmed: structuredClone(receipt), items: structuredClone(pending.items), pending: null
  };
  assertPublicationLedger(next);
  return next;
}
