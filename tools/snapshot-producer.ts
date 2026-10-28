import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import type { LyricObjectReference } from "../shared/types/lyrics.js";
import type { SnapshotDescriptor, SnapshotManifest, SnapshotObject, SnapshotPolicy } from "../shared/types/snapshot.js";
import type { DownloadPlan } from "../shared/types/download-plan.js";
import { assertSnapshotDescriptor, assertSnapshotManifest, assertSnapshotPolicy, planSnapshotDownload } from "../shared/tools/snapshot-reference.mjs";
import { packChangedAtCohorts } from "./bundle-packing.js";
import { canonicalLyricLogicalItem, assertCanonicalLyricItem } from "./lyric-logical.js";
import { assertPublicationLedger, publicationLedgerFingerprint, preparePublication, reservePublication,
  type PublicationLedger, type PublicationPlan } from "./publication-ledger.js";
import { canonical, deterministicGzip, parseCanonicalJson, yaml } from "./publisher.js";
import { decodeZipStore, type ZipStoreLimits } from "./zip-store.js";
import { readCanonicalSources, type CanonicalSourceBounds } from "./canonical-sources.js";

export interface SnapshotBounds {
  maxDescriptorBytes: number;
  maxManifestEncodedBytes: number;
  maxManifestDecodedBytes: number;
  maxItemEncodedBytes: number;
  maxItemDecodedBytes: number;
  maxPolicyEncodedBytes: number;
  maxPolicyDecodedBytes: number;
}
export interface PreparedCanonicalSnapshot {
  plan: PublicationPlan;
  manifest: LyricObjectReference;
  artifacts: Map<string, Buffer>;
}
export interface CanonicalSnapshotInput {
  items: readonly unknown[];
  publishedAt: string;
  sourceCommit: string;
}
export async function prepareCanonicalSourceSnapshot(sourceDirectory: string, sourceBounds: CanonicalSourceBounds,
  state: PublicationLedger, expectedStateSha256: string, input: Omit<CanonicalSnapshotInput, "items">,
  policy: SnapshotPolicy, bounds: SnapshotBounds):
  Promise<{ prepared: PreparedCanonicalSnapshot; held: number; extractionExceptions: number }> {
  const capturedState = structuredClone(state), capturedInput = structuredClone(input);
  if (Object.keys(capturedInput).length !== 2 || !Object.hasOwn(capturedInput, "publishedAt") ||
      !Object.hasOwn(capturedInput, "sourceCommit")) throw new Error("Invalid source snapshot preparation input");
  const capturedPolicy = structuredClone(policy), capturedBounds = { ...bounds };
  const { items, held, extractionExceptions } = await readCanonicalSources(sourceDirectory, sourceBounds);
  const prepared = prepareCanonicalSnapshot(capturedState, expectedStateSha256, { ...capturedInput, items }, capturedPolicy, capturedBounds);
  return { prepared, held, extractionExceptions };
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const schema = JSON.parse(await readFile(new URL("../shared/schemas/publication-policy-settings.schema.json", import.meta.url), "utf8"));
const settings = new Ajv2020.default({ strict: true }).compile<SnapshotBounds & { transferPlanning: SnapshotPolicy["transferPlanning"] }>(schema);
const snapshotSchema = JSON.parse(await readFile(new URL("../shared/schemas/snapshot-publication.schema.json", import.meta.url), "utf8"));
const lyricSchema = JSON.parse(await readFile(new URL("../shared/schemas/lyric-publication.schema.json", import.meta.url), "utf8"));
const manifestShape = new Ajv2020.default({ strict: true }).addSchema(schema, "publication-policy")
  .addSchema(lyricSchema, "lyric-publication").compile<SnapshotManifest>({ ...snapshotSchema, $ref: "#/$defs/manifest" });

export async function readSnapshotSettings(): Promise<{ policy: SnapshotPolicy; bounds: SnapshotBounds }> {
  const value: unknown = yaml(await readFile(new URL("../shared/settings/publication-policy.yml", import.meta.url), "utf8"));
  if (!settings(value)) throw new Error("Invalid snapshot publication settings");
  const { maxDescriptorBytes, maxManifestEncodedBytes, maxManifestDecodedBytes, maxItemEncodedBytes,
    maxItemDecodedBytes, maxPolicyEncodedBytes, maxPolicyDecodedBytes } = value;
  return {
    policy: { format: "daasavaani-snapshot-policy", formatVersion: 1, logicalProjection: "canonical-prelaunch-v1",
      transferPlanning: structuredClone(value.transferPlanning) },
    bounds: { maxDescriptorBytes, maxManifestEncodedBytes, maxManifestDecodedBytes, maxItemEncodedBytes,
      maxItemDecodedBytes, maxPolicyEncodedBytes, maxPolicyDecodedBytes }
  };
}

function checkBounds(bounds: SnapshotBounds): void {
  for (const key of ["maxDescriptorBytes", "maxManifestEncodedBytes", "maxManifestDecodedBytes",
    "maxItemEncodedBytes", "maxItemDecodedBytes", "maxPolicyEncodedBytes", "maxPolicyDecodedBytes"] as const) {
    if (!Number.isSafeInteger(bounds[key]) || bounds[key] < 1) throw new Error("Invalid snapshot safety bound");
  }
}
function roleBounds(bounds: SnapshotBounds, role: "Item" | "Policy" | "Manifest") {
  return { encoded: bounds[`max${role}EncodedBytes`], decoded: bounds[`max${role}DecodedBytes`] };
}
function within(bytes: Uint8Array, maximum: number, role: string): void {
  if (bytes.length > maximum) throw new Error(`${role} exceeds snapshot byte limit`);
}
function zipLimits(policy: SnapshotPolicy): ZipStoreLimits {
  return { maxMembers: policy.transferPlanning.maxBundleMembers, maxArchiveBytes: policy.transferPlanning.maxBundleEncodedBytes };
}
function artifact(value: unknown, role: "Item" | "Policy" | "Manifest", bounds: SnapshotBounds,
  artifacts: Map<string, Buffer>): LyricObjectReference {
  const decoded = Buffer.from(canonical(value)), limit = roleBounds(bounds, role);
  within(decoded, limit.decoded, role);
  const encoded = deterministicGzip(decoded);
  within(encoded, limit.encoded, role);
  const sha256 = hash(encoded), path = `objects/${sha256}.json.gz`;
  artifacts.set(path, encoded);
  return { sha256, path, encodedBytes: encoded.length, decodedBytes: decoded.length };
}
function readArtifact(reference: LyricObjectReference, role: "Item" | "Policy" | "Manifest",
  bounds: SnapshotBounds, artifacts: ReadonlyMap<string, Buffer>): unknown {
  const bytes = artifacts.get(reference.path), limit = roleBounds(bounds, role);
  if (!bytes || reference.path !== `objects/${reference.sha256}.json.gz` ||
      bytes.length !== reference.encodedBytes || hash(bytes) !== reference.sha256 ||
      !Number.isSafeInteger(reference.decodedBytes) || reference.decodedBytes < 1 ||
      reference.decodedBytes > limit.decoded) throw new Error("Snapshot artifact identity/size mismatch");
  within(bytes, limit.encoded, role);
  const decoded = gunzipSync(bytes, { maxOutputLength: limit.decoded });
  if (decoded.length !== reference.decodedBytes || !deterministicGzip(decoded).equals(bytes)) {
    throw new Error("Snapshot artifact is not exact deterministic gzip");
  }
  return parseCanonicalJson(decoded, "snapshot");
}

function verifyPrepared(prepared: PreparedCanonicalSnapshot, bounds: SnapshotBounds): { manifest: SnapshotManifest; policy: SnapshotPolicy } {
  checkBounds(bounds);
  assertSnapshotDescriptor({ format: "daasavaani-snapshot-feed", formatVersion: 1, sequence: 1, manifest: prepared.manifest });
  const manifest = readArtifact(prepared.manifest, "Manifest", bounds, prepared.artifacts);
  if (!manifestShape(manifest)) throw new Error("Invalid snapshot manifest schema");
  const policyRecord = manifest.objects[manifest.policy];
  if (!policyRecord) throw new Error("Snapshot policy object is missing");
  const policy = readArtifact({ sha256: manifest.policy, ...policyRecord }, "Policy", bounds, prepared.artifacts);
  assertSnapshotPolicy(policy);
  assertSnapshotManifest(manifest, policy);
  if (prepared.plan.logicalProjection !== manifest.logicalProjection) throw new Error("Snapshot plan projection mismatch");
  const present = prepared.plan.items.filter(item => item.present);
  if (present.length !== manifest.catalog.length) throw new Error("Snapshot plan catalog count mismatch");
  const expectedPaths = new Set([prepared.manifest.path]);
  for (const object of Object.values(manifest.objects)) expectedPaths.add(object.path);
  for (let i = 0; i < manifest.catalog.length; i++) {
    const entry = manifest.catalog[i]!, planned = present[i]!, record = manifest.objects[entry.item]!;
    const item = readArtifact({ sha256: entry.item, ...record }, "Item", bounds, prepared.artifacts);
    assertCanonicalLyricItem(item);
    const logical = canonicalLyricLogicalItem(item);
    if (logical.lyricId !== entry.lyricId || logical.lyricId !== planned.lyricId ||
        logical.logicalSha256 !== planned.logicalSha256 || item.title !== entry.title || !same(item.tags, entry.tags) ||
        planned.firstPublishedAt !== entry.firstPublishedAt || planned.changedAt !== entry.changedAt ||
        planned.changedAt > prepared.plan.publishedAt) throw new Error("Snapshot item/catalog/ledger binding mismatch");
  }
  for (const [sha256, bundle] of Object.entries(manifest.bundles)) {
    expectedPaths.add(bundle.path);
    const bytes = prepared.artifacts.get(bundle.path);
    if (!bytes || bytes.length !== bundle.encodedBytes || hash(bytes) !== sha256) throw new Error("Snapshot bundle identity/size mismatch");
    const members = decodeZipStore(bytes, zipLimits(policy));
    if (!same(members.map(member => hash(member.bytes)), bundle.members) ||
        members.some(member => !prepared.artifacts.get(member.path)?.equals(member.bytes))) {
      throw new Error("Snapshot bundle does not preserve original objects");
    }
  }
  if (expectedPaths.size !== prepared.artifacts.size ||
      [...prepared.artifacts.keys()].some(path => !expectedPaths.has(path))) throw new Error("Unexpected or missing snapshot artifact");
  return { manifest, policy };
}

export function prepareCanonicalSnapshot(state: PublicationLedger, expectedStateSha256: string,
  input: CanonicalSnapshotInput, policy: SnapshotPolicy, bounds: SnapshotBounds): PreparedCanonicalSnapshot {
  checkBounds(bounds);
  assertSnapshotPolicy(policy);
  if (Object.keys(input).sort().join(",") !== "items,publishedAt,sourceCommit" || !Array.isArray(input.items)) {
    throw new Error("Invalid canonical snapshot input");
  }
  const items = input.items.map(value => {
    assertCanonicalLyricItem(value);
    return structuredClone(value);
  }).sort((a, b) => a.lyricId < b.lyricId ? -1 : a.lyricId > b.lyricId ? 1 : 0);
  if (!items.length) throw new Error("Canonical snapshot requires publishable items");
  const plan = preparePublication(state, expectedStateSha256, { logicalProjection: policy.logicalProjection,
    items: items.map(canonicalLyricLogicalItem), publishedAt: input.publishedAt, sourceCommit: input.sourceCommit });
  const artifacts = new Map<string, Buffer>(), policyRef = artifact(policy, "Policy", bounds, artifacts);
  const objects: Record<string, SnapshotObject> = {
    [policyRef.sha256]: { role: "policy", path: policyRef.path, encodedBytes: policyRef.encodedBytes,
      decodedBytes: policyRef.decodedBytes, requiredCapabilities: ["snapshot-policy-v1"] }
  };
  const manifest: SnapshotManifest = { format: "daasavaani-snapshot", formatVersion: 1, stage: "prelaunch",
    logicalProjection: policy.logicalProjection, requiredCapabilities: ["snapshot-envelope-v1", "lyric-preview-v1", "snapshot-policy-v1"],
    policy: policyRef.sha256, objects, catalog: [], bundles: {} };
  const dates = new Map(plan.items.filter(item => item.present).map(item => [item.lyricId, item]));
  const cohorts = items.map(item => {
    const reference = artifact(item, "Item", bounds, artifacts), date = dates.get(item.lyricId)!;
    objects[reference.sha256] = { role: "item", path: reference.path, encodedBytes: reference.encodedBytes,
      decodedBytes: reference.decodedBytes, requiredCapabilities: ["lyric-preview-v1"] };
    manifest.catalog.push({ lyricId: item.lyricId, title: item.title, tags: [...item.tags], item: reference.sha256,
      firstPublishedAt: date.firstPublishedAt, changedAt: date.changedAt });
    return { path: reference.path, bytes: artifacts.get(reference.path)!, changedAt: date.changedAt };
  });
  const packed = packChangedAtCohorts(cohorts, zipLimits(policy));
  for (const bundle of packed.bundles) {
    const path = `bundles/${bundle.sha256}.zip`;
    artifacts.set(path, bundle.bytes);
    manifest.bundles[bundle.sha256] = { path, encodedBytes: bundle.bytes.length, changedAt: bundle.changedAt,
      members: bundle.members.map(member => member.slice("objects/".length, -".json.gz".length)) };
  }
  assertSnapshotManifest(manifest, policy);
  const prepared = { plan, manifest: artifact(manifest, "Manifest", bounds, artifacts), artifacts };
  verifyPrepared(prepared, bounds);
  return prepared;
}

export function reserveCanonicalSnapshot(state: PublicationLedger, expectedStateSha256: string,
  prepared: PreparedCanonicalSnapshot, bounds: SnapshotBounds) {
  verifyPrepared(prepared, bounds);
  const result = reservePublication(state, expectedStateSha256, prepared.plan, prepared.manifest.sha256);
  if (result.outcome !== "noop") bindCanonicalSnapshot(result.state, publicationLedgerFingerprint(result.state), prepared, bounds);
  return result;
}

export function planCanonicalSnapshotDownload(prepared: PreparedCanonicalSnapshot, bounds: SnapshotBounds,
  verified: readonly string[]): DownloadPlan {
  const { manifest, policy } = verifyPrepared(prepared, bounds);
  return planSnapshotDownload(manifest, policy, verified);
}

export function bindCanonicalSnapshot(state: PublicationLedger, expectedStateSha256: string,
  prepared: PreparedCanonicalSnapshot, bounds: SnapshotBounds): { descriptor: SnapshotDescriptor; descriptorBytes: Buffer; artifacts: Map<string, Buffer> } {
  assertPublicationLedger(state);
  if (publicationLedgerFingerprint(state) !== expectedStateSha256) throw new Error("Stale snapshot ledger state");
  const pending = state.pending;
  if (!pending) throw new Error("No snapshot reservation to bind");
  const { sequence, manifestSha256, phase: _phase, ...plan } = pending;
  if (manifestSha256 !== prepared.manifest.sha256 || !same(plan, prepared.plan)) throw new Error("Snapshot does not match reservation");
  verifyPrepared(prepared, bounds);
  const descriptor: SnapshotDescriptor = { format: "daasavaani-snapshot-feed", formatVersion: 1,
    sequence, manifest: structuredClone(prepared.manifest) };
  assertSnapshotDescriptor(descriptor);
  const descriptorBytes = Buffer.from(canonical(descriptor) + "\n");
  within(descriptorBytes, bounds.maxDescriptorBytes, "Descriptor");
  return { descriptor, descriptorBytes,
    artifacts: new Map([...prepared.artifacts].map(([path, bytes]) => [path, Buffer.from(bytes)])) };
}
