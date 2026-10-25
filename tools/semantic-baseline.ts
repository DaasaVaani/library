import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { LyricObjectReference } from "../shared/types/lyrics.js";
import type { LyricBounds } from "./lyric-publisher.js";
import type { LedgerItem, LogicalItem } from "./publication-ledger.js";
import {
  auditPublicationDates, decodePublicationCatalog,
  type CatalogEvidence, type PublicationEvidence, type PublicationDateAudit
} from "./publication-history.js";
import { assertCanonicalLyricItem, canonicalLyricLogicalItem } from "./lyric-logical.js";
import { canonical, parseCanonicalJson } from "./publisher.js";

export type SemanticBaselineBounds = Pick<LyricBounds,
  "maxManifestEncodedBytes" | "maxManifestDecodedBytes" | "maxItemEncodedBytes" | "maxItemDecodedBytes">;
export type HistoricalObjectLoader = (reference: Readonly<LyricObjectReference>) => Promise<Uint8Array | null>;
export interface SemanticBaselineAudit {
  format: "daasavaani-semantic-baseline-audit";
  formatVersion: 1;
  logicalProjection: "canonical-prelaunch-v1";
  currentManifestSha256: string;
  publications: PublicationDateAudit["publications"];
  candidates: {
    lyricId: string;
    firstVerifiedPublishedAt: string;
    logicalSha256: string | null;
    changedAt: string | null;
    currentlyPublished: boolean;
  }[];
  verifiedObjectCount: number;
  unavailableObjectSha256s: string[];
  unresolvedLyricIds: string[];
  complete: boolean;
}
export interface BaselineInitializationReview {
  format: "daasavaani-ledger-baseline-review";
  formatVersion: 1;
  status: "review-required";
  logicalProjection: "canonical-prelaunch-v1";
  auditSha256: string;
  legacyPublication: PublicationDateAudit["publications"][number];
  sequence: null;
  items: LedgerItem[];
}
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const summaryHash = (value: { lyricId: string; title: string; tags: string[] }) =>
  digest(canonical({ lyricId: value.lyricId, title: value.title, tags: value.tags }));

export async function auditSemanticBaseline(
  currentEvidence: CatalogEvidence, publicationEvidence: readonly PublicationEvidence[],
  loadObject: HistoricalObjectLoader, requestedBounds: SemanticBaselineBounds
): Promise<SemanticBaselineAudit> {
  const current = structuredClone(currentEvidence), publications = structuredClone(publicationEvidence), bounds = { ...requestedBounds };
  for (const value of [bounds.maxManifestEncodedBytes, bounds.maxManifestDecodedBytes,
    bounds.maxItemEncodedBytes, bounds.maxItemDecodedBytes]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid semantic baseline bounds");
  }
  if (!publications.length) throw new Error("Semantic baseline requires verified publication history");
  const dates = auditPublicationDates(current, publications, bounds);
  if (dates.publications.at(-1)?.manifestSha256 !== current.manifestSha256) {
    throw new Error("Current catalog is not the latest verified publication");
  }
  const byAttempt = new Map(publications.map(publication => [`${publication.runId}/${publication.runAttempt}`, publication]));
  const firstDates = new Map(dates.candidates.map(candidate => [candidate.lyricId, candidate.firstVerifiedPublishedAt]));
  const currentIds = new Set(dates.candidates.filter(candidate => candidate.currentlyPublished).map(candidate => candidate.lyricId));
  const candidates = new Map<string, SemanticBaselineAudit["candidates"][number]>();
  const objects = new Map<string, { reference: string; summary: string; logical: LogicalItem | null }>();
  for (const receipt of dates.publications) {
    const publication = byAttempt.get(`${receipt.runId}/${receipt.runAttempt}`);
    if (!publication) throw new Error("Missing validated publication attempt");
    const catalog = decodePublicationCatalog(publication, bounds);
    for (const entry of catalog.catalog) {
      const ref = entry.item;
      if (ref.path !== `objects/${ref.sha256}.json.gz` || ref.encodedBytes > bounds.maxItemEncodedBytes ||
          ref.decodedBytes > bounds.maxItemDecodedBytes) throw new Error("Invalid historical item reference or bounds");
      const reference = canonical(ref), summary = summaryHash(entry);
      let cached = objects.get(ref.sha256);
      if (cached && (cached.reference !== reference || cached.summary !== summary)) {
        throw new Error("Inconsistent historical object reference or catalog summary");
      }
      if (!cached) {
        const encoded = await loadObject(Object.freeze({ ...ref }));
        let logical: LogicalItem | null = null;
        if (encoded !== null) {
          if (!(encoded instanceof Uint8Array) || encoded.length !== ref.encodedBytes || digest(encoded) !== ref.sha256) {
            throw new Error("Historical item encoded identity or size mismatch");
          }
          const decoded = gunzipSync(encoded, { maxOutputLength: bounds.maxItemDecodedBytes });
          if (decoded.length !== ref.decodedBytes) throw new Error("Historical item decoded size mismatch");
          const value = parseCanonicalJson(decoded, "historical item");
          assertCanonicalLyricItem(value);
          if (summaryHash(value) !== summary) throw new Error("Historical item does not match catalog identity/title/tags");
          logical = canonicalLyricLogicalItem(value);
        }
        cached = { reference, summary, logical };
        objects.set(ref.sha256, cached);
      }
      const previous = candidates.get(entry.lyricId), logicalSha256 = cached.logical?.logicalSha256 ?? null;
      let changedAt: string | null = null;
      if (logicalSha256 !== null) {
        if (!previous) changedAt = receipt.confirmedAt;
        else if (previous.logicalSha256 !== null) {
          changedAt = previous.logicalSha256 === logicalSha256 ? previous.changedAt : receipt.confirmedAt;
        }
      }
      const firstVerifiedPublishedAt = firstDates.get(entry.lyricId);
      if (!firstVerifiedPublishedAt) throw new Error("Historical item lacks a verified first date");
      candidates.set(entry.lyricId, {
        lyricId: entry.lyricId, firstVerifiedPublishedAt, logicalSha256, changedAt, currentlyPublished: currentIds.has(entry.lyricId)
      });
    }
  }
  const ordered = [...candidates.values()].sort((a, b) => a.lyricId < b.lyricId ? -1 : a.lyricId > b.lyricId ? 1 : 0);
  const unavailableObjectSha256s = [...objects].filter(([, value]) => value.logical === null).map(([hash]) => hash).sort();
  const unresolvedLyricIds = ordered.filter(value => value.logicalSha256 === null || value.changedAt === null).map(value => value.lyricId);
  return {
    format: "daasavaani-semantic-baseline-audit", formatVersion: 1, logicalProjection: "canonical-prelaunch-v1",
    currentManifestSha256: current.manifestSha256, publications: dates.publications, candidates: ordered,
    verifiedObjectCount: objects.size - unavailableObjectSha256s.length,
    unavailableObjectSha256s, unresolvedLyricIds, complete: !unavailableObjectSha256s.length && !unresolvedLyricIds.length
  };
}

export async function prepareBaselineInitializationReview(
  current: CatalogEvidence, publications: readonly PublicationEvidence[],
  loadObject: HistoricalObjectLoader, bounds: SemanticBaselineBounds
): Promise<{ audit: SemanticBaselineAudit; review: BaselineInitializationReview }> {
  const audit = await auditSemanticBaseline(current, publications, loadObject, bounds);
  if (!audit.complete) throw new Error("Cannot prepare initialization review with missing evidence or unresolved semantic dates");
  const latest = audit.publications.at(-1);
  if (!latest) throw new Error("Initialization review lacks a verified publication");
  const items = audit.candidates.map(candidate => {
    if (candidate.logicalSha256 === null || candidate.changedAt === null) throw new Error("Unresolved initialization item");
    return {
      lyricId: candidate.lyricId, logicalSha256: candidate.logicalSha256,
      firstPublishedAt: candidate.firstVerifiedPublishedAt, changedAt: candidate.changedAt, present: candidate.currentlyPublished
    };
  });
  return {
    audit,
    review: {
      format: "daasavaani-ledger-baseline-review", formatVersion: 1, status: "review-required",
      logicalProjection: audit.logicalProjection, auditSha256: digest(canonical(audit) + "\n"),
      legacyPublication: structuredClone(latest), sequence: null, items
    }
  };
}

export async function verifyBaselineReviewPin(
  current: CatalogEvidence, publications: readonly PublicationEvidence[],
  loadObject: HistoricalObjectLoader, bounds: SemanticBaselineBounds, expectedReviewSha256: string
): Promise<{ audit: SemanticBaselineAudit; review: BaselineInitializationReview }> {
  if (!/^[0-9a-f]{64}$/.test(expectedReviewSha256)) throw new Error("Invalid baseline review pin");
  const result = await prepareBaselineInitializationReview(current, publications, loadObject, bounds);
  if (digest(canonical(result.review) + "\n") !== expectedReviewSha256) {
    throw new Error("Baseline review changed; renewed review is required");
  }
  return result;
}
