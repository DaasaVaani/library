import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import type { TransferPlanningPolicy } from "../shared/types/download-plan.js";
import { yaml } from "./publisher.js";
import { encodeZipStore, zipStoreMemberSize, type ZipStoreLimits, type ZipStoreObject } from "./zip-store.js";

export interface CohortObject extends ZipStoreObject {
  changedAt: string;
}
export interface PackedBundle {
  changedAt: string;
  sha256: string;
  bytes: Buffer;
  members: string[];
}
export interface CohortPacking {
  bundles: PackedBundle[];
  unbundled: string[];
}

const schema = JSON.parse(await readFile(new URL("../shared/schemas/publication-policy-settings.schema.json", import.meta.url), "utf8"));
const validatePolicy = new Ajv2020.default({ strict: true }).compile<{ transferPlanning: TransferPlanningPolicy }>(schema);

export function packingLimits(policy: unknown): ZipStoreLimits {
  if (!validatePolicy(policy)) throw new Error("Invalid publication packing policy: " + JSON.stringify(validatePolicy.errors));
  const limits = {
    maxMembers: policy.transferPlanning.maxBundleMembers,
    maxArchiveBytes: policy.transferPlanning.maxBundleEncodedBytes
  };
  encodeZipStore([], limits);
  return limits;
}

export async function readPackingLimits(): Promise<ZipStoreLimits> {
  return packingLimits(yaml(await readFile(new URL("../shared/settings/publication-policy.yml", import.meta.url), "utf8")));
}

export function packChangedAtCohorts(objects: readonly CohortObject[], limits: ZipStoreLimits): CohortPacking {
  const emptySize = encodeZipStore([], limits).length;
  const seen = new Set<string>();
  const sorted = objects.map(object => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(object.changedAt) ||
        !Number.isFinite(Date.parse(object.changedAt)) || new Date(object.changedAt).toISOString() !== object.changedAt) {
      throw new Error("Packing requires canonical UTC millisecond changedAt values");
    }
    if (seen.has(object.path)) throw new Error("Duplicate packing object path");
    seen.add(object.path);
    return { object, size: zipStoreMemberSize(object) };
  }).sort((a, b) => a.object.changedAt < b.object.changedAt ? -1 : a.object.changedAt > b.object.changedAt ? 1 :
    a.object.path < b.object.path ? -1 : a.object.path > b.object.path ? 1 : 0);
  const bundles: PackedBundle[] = [], bundled = new Set<string>();
  let pending: CohortObject[] = [], size = emptySize, changedAt: string | undefined;
  function flush() {
    if (pending.length > 1) {
      const bytes = encodeZipStore(pending, limits);
      bundles.push({ changedAt: pending[0]!.changedAt, sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes, members: pending.map(object => object.path) });
      pending.forEach(object => bundled.add(object.path));
    }
    pending = [];
    size = emptySize;
  }
  for (const entry of sorted) {
    const object = entry.object;
    if (object.changedAt !== changedAt) {
      flush();
      changedAt = object.changedAt;
    }
    if (emptySize + entry.size > limits.maxArchiveBytes) continue;
    if (pending.length === limits.maxMembers || size + entry.size > limits.maxArchiveBytes) flush();
    pending.push(object);
    size += entry.size;
  }
  flush();
  return { bundles, unbundled: sorted.filter(entry => !bundled.has(entry.object.path)).map(entry => entry.object.path) };
}
