import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
import type { LyricSourceHeader } from "../shared/types/lyrics.js";

export type DraftHeader = LyricSourceHeader;
export type SourceEncoding = "utf-8" | "utf-16le" | "utf-16be";
export interface DraftSource {
  header: DraftHeader;
  canonical: ({ id: string; text: string } | { text: string })[];
  sourceLatin?: string;
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const schema = JSON.parse(await readFile(new URL("../shared/schemas/lyric-source-draft.schema.json", import.meta.url), "utf8"));
const sourceSchema = JSON.parse(await readFile(new URL("../shared/schemas/lyric-source.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020.default({ strict: true }).addSchema(sourceSchema, "lyric-source.schema.json");
const validateHeader = ajv.compile<DraftHeader>(sourceSchema);
const validateDraft = ajv.compile<DraftHeader>(schema);
const parser = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]);
export function completeSourceHeader(header: DraftHeader): DraftHeader {
  return {
    ...header,
    public: {
      classification: { composerIds: [], ankitaIds: [], deityIds: [], formIds: [], categoryIds: [], contextIds: [] },
      contextDescription: "", verses: [], youtube: [], images: [], ...header.public,
    },
    provenance: {
      sourceUrls: [], description: "", rights: { license: "", attribution: "", evidenceUrls: [] },
      videos: [], images: [], ...header.provenance,
    },
    review: { sourceLatin: { readable: null, searchable: null, alignment: [] }, ...header.review },
  };
}
function validateStrings(value: unknown): void {
  if (typeof value === "string" && (!value.isWellFormed() || /[\r\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u.test(value))) {
    throw new Error("Metadata contains unsupported controls or malformed Unicode");
  }
  if (Array.isArray(value)) value.forEach(validateStrings);
  else if (value !== null && typeof value === "object") Object.values(value).forEach(validateStrings);
}
function httpsUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("Source URLs must be absolute credential-free HTTPS");
  }
  return url;
}
function associatedVideo(value: string) {
  const url = httpsUrl(value);
  if (url.port) throw new Error("YouTube association has an unsupported port");
  const host = url.hostname;
  if (host === "youtu.be") return /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  if (!["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "www.youtube-nocookie.com"].includes(host)) {
    throw new Error("Association is not a supported YouTube URL");
  }
  if (url.pathname === "/watch" && host !== "www.youtube-nocookie.com") {
    const ids = url.searchParams.getAll("v");
    return ids.length === 1 ? ids[0] : undefined;
  }
  return /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
}
function validateMetadata(source: DraftSource, seen: Set<string>) {
  const { header, canonical, sourceLatin } = source;
  validateStrings(header);
  const lines = canonical.flatMap(line => "id" in line ? [line.id] : []);
  let previous = -1;
  for (const verse of header.public.verses ?? []) {
    const end = lines.indexOf(verse.endsAt);
    if (seen.has(verse.id) || end <= previous) throw new Error("Invalid verse identity, order or canonical ending reference");
    seen.add(verse.id); previous = end;
  }
  if (header.public.verses?.length && previous !== lines.length - 1) throw new Error("Declared verses must cover all canonical lines");
  const videoIds = new Set<string>();
  for (const video of header.public.youtube ?? []) {
    if (videoIds.has(video.videoId) || (video.url && associatedVideo(video.url) !== video.videoId)) {
      throw new Error("Duplicate or mismatched YouTube association");
    }
    videoIds.add(video.videoId);
  }
  const videoEvidence = new Set<string>();
  for (const video of header.provenance.videos ?? []) {
    if (!videoIds.has(video.videoId) || videoEvidence.has(video.videoId)) throw new Error("Unassociated or duplicate video provenance");
    videoEvidence.add(video.videoId);
    if (video.uploadedOn) {
      const date = new Date(`${video.uploadedOn}T00:00:00Z`);
      if (!Number.isFinite(date.getTime()) || video.uploadedOn.startsWith("0000-") || date.toISOString().slice(0, 10) !== video.uploadedOn) {
        throw new Error("Video upload date must be an actual YYYY-MM-DD calendar date or empty");
      }
    }
  }
  const assets = new Set<string>();
  for (const image of header.public.images ?? []) {
    if (assets.has(image.asset)) throw new Error("Duplicate image association");
    assets.add(image.asset);
  }
  const imageEvidence = new Set<string>();
  for (const image of header.provenance.images ?? []) {
    if (!assets.has(image.asset) || imageEvidence.has(image.asset)) throw new Error("Unassociated or duplicate image provenance");
    imageEvidence.add(image.asset);
    if (image.sourceUrl) httpsUrl(image.sourceUrl);
  }
  for (const url of [...header.provenance.sourceUrls ?? [], ...header.provenance.rights?.evidenceUrls ?? []]) httpsUrl(url);
  const latin = header.review.sourceLatin;
  if (!latin) return;
  if (latin.searchable === true && latin.readable !== true) throw new Error("Searchable Source Latin must also be readable");
  if (!sourceLatin && (latin.readable === true || latin.searchable === true || latin.alignment.length)) {
    throw new Error("Source Latin review requires actual supplied text");
  }
  let previousLine = -1, previousEnd = 0;
  const length = [...sourceLatin ?? ""].length;
  for (const mapping of latin.alignment) {
    const line = lines.indexOf(mapping.lineId);
    if (line <= previousLine) throw new Error("Source Latin mapping has an unknown, duplicated or unordered canonical line");
    previousLine = line;
    for (const [start, end] of mapping.ranges) {
      if (start < previousEnd || start >= end || end > length) throw new Error("Invalid or overlapping Source Latin code-point range");
      previousEnd = end;
    }
  }
  if (latin.searchable === true && latin.alignment.length !== lines.length) throw new Error("Searchable Source Latin needs complete canonical line mapping");
}
export function parseLyricSource(text: string, requireHold = false): DraftSource {
  if (!text.isWellFormed() || /\r(?!\n)|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u.test(text)) {
    throw new Error("Draft contains unsupported controls or malformed Unicode");
  }
  const normalized = text.replace(/\r\n/g, "\n");
  const tree = parser.parse(normalized);
  const [frontmatter, canonical, latin] = tree.children;
  if (tree.children.length < 2 || tree.children.length > 3 || frontmatter?.type !== "yaml" ||
      canonical?.type !== "code" || canonical.lang !== "kannada" || canonical.meta ||
      (latin && (latin.type !== "code" || latin.lang !== "source-latin" || latin.meta))) {
    throw new Error("Draft requires grouped frontmatter, one Kannada fence and optional literal source-latin fence only");
  }
  const header: unknown = strictYaml(frontmatter.value);
  const validate = requireHold ? validateDraft : validateHeader;
  if (!validate(header)) throw new Error("Invalid draft header: " + JSON.stringify(validate.errors));
  const seen = new Set<string>([header.lyricId]);
  let lyricLines = 0;
  const lines = canonical.value.split("\n").map(line => {
    if (/^[ \t]*$/u.test(line)) return { text: line };
    const match = /^\[([^\]]+)\] (.*)$/u.exec(line);
    if (!match?.[1] || match[2] === undefined || !uuidPattern.test(match[1]) ||
        seen.has(match[1]) || /^[ \t]*$/u.test(match[2])) throw new Error("Invalid, duplicated or layout-only canonical line identity");
    seen.add(match[1]); lyricLines++;
    return { id: match[1], text: match[2] };
  });
  if (!lyricLines || !lines.some(line => /\p{Script=Kannada}/u.test(line.text))) throw new Error("Draft has no canonical Kannada lyric lines");
  const source = { header, canonical: lines, ...(latin?.type === "code" ? { sourceLatin: latin.value } : {}) };
  validateMetadata(source, seen);
  return source;
}
export const parseDraft = (text: string) => parseLyricSource(text, true);
