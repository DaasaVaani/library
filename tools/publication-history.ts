import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import type { LyricManifest } from "../shared/types/lyrics.js";
import type { LyricBounds } from "./lyric-publisher.js";
import { isUtcMillisecondInstant, parseCanonicalJson } from "./publisher.js";

export interface CatalogEvidence {
  manifestSha256: string;
  manifestBytes: Uint8Array;
}
export interface PublicationEvidence extends CatalogEvidence {
  sourceCommit: string;
  runId: number;
  runAttempt: number;
  deploymentId: number;
  statusId: number;
  artifactId: number;
  artifactZipSha256: string;
  confirmedAt: string;
}
export interface PublicationDateAudit {
  format: "daasavaani-publication-date-audit";
  formatVersion: 1;
  currentManifestSha256: string;
  publications: {
    sourceCommit: string; runId: number; runAttempt: number; deploymentId: number;
    statusId: number; artifactId: number; artifactZipSha256: string;
    confirmedAt: string; manifestSha256: string; catalogCount: number;
  }[];
  candidates: {
    lyricId: string; firstVerifiedPublishedAt: string; publicationRunId: number;
    publicationRunAttempt: number; currentlyPublished: boolean;
  }[];
  unresolvedLyricIds: string[];
}

const schema = JSON.parse(await readFile(new URL("../shared/schemas/lyric-publication.schema.json", import.meta.url), "utf8"));
const validateManifest = new Ajv2020.default({ strict: true }).compile<LyricManifest>({ ...schema, $ref: "#/$defs/manifest" });
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;
const hashPattern = /^[0-9a-f]{64}$/;
export type CatalogBounds = Pick<LyricBounds, "maxManifestEncodedBytes" | "maxManifestDecodedBytes">;

export function decodePublicationCatalog(evidence: CatalogEvidence, bounds: CatalogBounds): LyricManifest {
  if (!positiveInteger(bounds.maxManifestEncodedBytes) || !positiveInteger(bounds.maxManifestDecodedBytes)) {
    throw new Error("Invalid publication audit bounds");
  }
  if (!hashPattern.test(evidence.manifestSha256) || !(evidence.manifestBytes instanceof Uint8Array) ||
      evidence.manifestBytes.length === 0 || evidence.manifestBytes.length > bounds.maxManifestEncodedBytes ||
      digest(evidence.manifestBytes) !== evidence.manifestSha256) throw new Error("Invalid historical manifest encoded identity or size");
  const decoded = gunzipSync(evidence.manifestBytes, { maxOutputLength: bounds.maxManifestDecodedBytes });
  const value = parseCanonicalJson(decoded, "historical manifest");
  if (!validateManifest(value)) throw new Error("Invalid historical manifest");
  const ids = new Set(value.catalog.map(entry => entry.lyricId));
  if (ids.size !== value.catalog.length) throw new Error("Duplicate historical lyric identity");
  return value;
}

export function auditPublicationDates(current: CatalogEvidence, publications: readonly PublicationEvidence[], bounds: CatalogBounds): PublicationDateAudit {
  if (!positiveInteger(bounds.maxManifestEncodedBytes) || !positiveInteger(bounds.maxManifestDecodedBytes)) {
    throw new Error("Invalid publication audit bounds");
  }
  const currentIds = new Set(decodePublicationCatalog(current, bounds).catalog.map(entry => entry.lyricId)), attempts = new Set<string>();
  const deployments = new Set<number>(), statuses = new Set<number>();
  const ordered = [...publications].sort((a, b) => a.confirmedAt < b.confirmedAt ? -1 : a.confirmedAt > b.confirmedAt ? 1 :
    a.deploymentId - b.deploymentId);
  const summaries: PublicationDateAudit["publications"] = [];
  const dates = new Map<string, PublicationDateAudit["candidates"][number]>();
  for (const publication of ordered) {
    const attempt = `${publication.runId}/${publication.runAttempt}`;
    if (!isUtcMillisecondInstant(publication.confirmedAt) || !/^[0-9a-f]{40}$/.test(publication.sourceCommit) ||
        ![publication.runId, publication.runAttempt, publication.deploymentId, publication.statusId, publication.artifactId].every(positiveInteger) ||
        !hashPattern.test(publication.artifactZipSha256)) throw new Error("Invalid publication receipt metadata");
    if (attempts.has(attempt) || deployments.has(publication.deploymentId) || statuses.has(publication.statusId)) {
      throw new Error("Duplicate publication receipt");
    }
    attempts.add(attempt); deployments.add(publication.deploymentId); statuses.add(publication.statusId);
    const ids = new Set(decodePublicationCatalog(publication, bounds).catalog.map(entry => entry.lyricId));
    summaries.push({
      sourceCommit: publication.sourceCommit, runId: publication.runId, runAttempt: publication.runAttempt,
      deploymentId: publication.deploymentId, statusId: publication.statusId, artifactId: publication.artifactId,
      artifactZipSha256: publication.artifactZipSha256, confirmedAt: publication.confirmedAt,
      manifestSha256: publication.manifestSha256, catalogCount: ids.size
    });
    for (const lyricId of ids) if (!dates.has(lyricId)) dates.set(lyricId, {
      lyricId, firstVerifiedPublishedAt: publication.confirmedAt, publicationRunId: publication.runId,
      publicationRunAttempt: publication.runAttempt, currentlyPublished: currentIds.has(lyricId)
    });
  }
  return {
    format: "daasavaani-publication-date-audit", formatVersion: 1,
    currentManifestSha256: current.manifestSha256, publications: summaries,
    candidates: [...dates.values()].sort((a, b) => a.lyricId < b.lyricId ? -1 : a.lyricId > b.lyricId ? 1 : 0),
    unresolvedLyricIds: [...currentIds].filter(id => !dates.has(id)).sort()
  };
}
