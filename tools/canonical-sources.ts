import { lstat, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { LyricItem } from "../shared/types/lyrics.js";
import { assertCanonicalLyricItem } from "./lyric-logical.js";
import { parseLyricSource } from "./lyric-source.js";
import { validateSources } from "./source-import.js";

export interface CanonicalSourceBounds {
  maxSourceFileBytes: number;
  maxTotalSourceBytes: number;
}
export async function readCanonicalSources(sourceDirectory: string, bounds: CanonicalSourceBounds):
  Promise<{ items: LyricItem[]; held: number; extractionExceptions: number }> {
  const { maxSourceFileBytes, maxTotalSourceBytes } = bounds;
  for (const value of [maxSourceFileBytes, maxTotalSourceBytes]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid publication source bound");
  }
  if (maxTotalSourceBytes < maxSourceFileBytes) throw new Error("Invalid publication bound relationship");
  const source = resolve(sourceDirectory), directory = await lstat(source);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("Lyric source must be a regular directory");
  const entries = await readdir(source, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    if (!entry.isFile() || (entry.name !== ".source-import.json" && !/^[0-9a-f-]{36}\.md$/.test(entry.name))) {
      throw new Error("Unexpected file or link in lyric source directory");
    }
    const stat = await lstat(join(source, entry.name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Unexpected file or link in lyric source directory");
    if (!Number.isSafeInteger(stat.size) || stat.size > maxSourceFileBytes ||
        (total += stat.size) > maxTotalSourceBytes) throw new Error("Lyric source byte limit exceeded");
  }
  const validation = await validateSources(source), items: LyricItem[] = [], ids = new Set<string>();
  let held = 0, actualTotal = 0;
  for (const name of entries.map(entry => entry.name).filter(name => name.endsWith(".md")).sort()) {
    const bytes = await readFile(join(source, name));
    actualTotal += bytes.length;
    if (bytes.length > maxSourceFileBytes || actualTotal > maxTotalSourceBytes) throw new Error("Lyric source grew beyond its byte limit");
    const parsed = parseLyricSource(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (name !== `${parsed.header.lyricId}.md` || ids.has(parsed.header.lyricId)) throw new Error("Invalid or duplicate lyric identity");
    ids.add(parsed.header.lyricId);
    if (parsed.header.review.holdReasons.length) { held++; continue; }
    const metadata = parsed.header.public;
    if (metadata.contextDescription || metadata.verses?.length || metadata.youtube?.length || metadata.images?.length ||
        (metadata.classification && Object.values(metadata.classification).some(values => values.length)) ||
        parsed.header.review.sourceLatin?.readable === true || parsed.header.review.sourceLatin?.searchable === true) {
      throw new Error(`Lyric ${parsed.header.lyricId} needs registry/media/verse/Source Latin publication adapters; canonical preview must not silently discard populated public metadata`);
    }
    const item: LyricItem = { format: "daasavaani-lyric", formatVersion: 1, lyricId: parsed.header.lyricId,
      canonicalScript: "kn", title: metadata.title, tags: metadata.tags,
      lines: parsed.canonical.map(line => "id" in line ? { kind: "line", lineId: line.id, text: line.text }
        : { kind: "layout", text: line.text }) };
    assertCanonicalLyricItem(item);
    items.push(item);
  }
  if (!items.length) throw new Error("No unheld owner-authorized lyrics to publish");
  return { items, held, extractionExceptions: validation.held };
}
