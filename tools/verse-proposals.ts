import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
import { parseLyricSource, uuidPattern, type DraftSource } from "./lyric-source.js";
import { validateSources } from "./source-import.js";

interface Settings {
  formatVersion: 1; sourceDirectory: string; outputFile: string;
  maxSourceFileBytes: number; maxTotalSourceBytes: number; excludedLyricIds: string[];
}
export interface Snapshot {
  lyricId: string; sourceSha256: string; source: DraftSource;
}
type Evidence = "blank-separator" | "end-of-source" | "owner-edit";
interface Candidate {
  id: string; endsAt: string; evidence: Evidence;
}
interface Proposal {
  lyricId: string; sourceSha256: string; status: "provisional"; verses: Candidate[];
}
interface Review {
  format: "daasavaani-verse-proposals"; formatVersion: 1;
  algorithm: "blank-separators-v1"; proposals: Proposal[];
}
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const root = fileURLToPath(new URL("../", import.meta.url));
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
async function exists(path: string) {
  try { await lstat(path); return true; }
  catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return false; throw error; }
}

// Candidate UUIDs are namespaced hashes in the source UUID shape, not random
// canonical identities. Neither their position nor neighboring candidates enter the key.
export function candidateId(lyricId: string, endsAt: string) {
  const hex = hash(`daasavaani:provisional-verse:v1:${lyricId}:${endsAt}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function boundaries(source: DraftSource): Candidate[] {
  const verses: Candidate[] = [];
  let last: string | undefined, separated = false;
  for (const line of source.canonical) {
    if ("id" in line) {
      if (last && separated) verses.push({
        id: candidateId(source.header.lyricId, last), endsAt: last, evidence: "blank-separator",
      });
      last = line.id; separated = false;
    } else if (last) separated = true;
  }
  if (last) verses.push({ id: candidateId(source.header.lyricId, last), endsAt: last, evidence: "end-of-source" });
  return verses;
}
export function propose(sources: Snapshot[]): Review {
  return {
    format: "daasavaani-verse-proposals", formatVersion: 1, algorithm: "blank-separators-v1",
    proposals: sources.filter(({ source }) =>
      !source.header.review.holdReasons.length && !source.header.public.verses?.length,
    ).map<Proposal>(({ lyricId, sourceSha256, source }) => ({
      lyricId, sourceSha256, status: "provisional", verses: boundaries(source),
    })).sort((a, b) => a.lyricId.localeCompare(b.lyricId, "en")),
  };
}
export function validateReview(value: unknown, sources: Snapshot[]): asserts value is Review {
  if (!object(value) || !keys(value, ["format", "formatVersion", "algorithm", "proposals"]) ||
      value.format !== "daasavaani-verse-proposals" || value.formatVersion !== 1 ||
      value.algorithm !== "blank-separators-v1" || !Array.isArray(value.proposals)) {
    throw new Error("Invalid provisional verse review format");
  }
  const expected = propose(sources);
  if (expected.proposals.length !== value.proposals.length) throw new Error("Proposal coverage differs from eligible sources");
  const byId = new Map(sources.map(source => [source.lyricId, source]));
  const seen = new Set<string>();
  for (const { source } of sources) {
    for (const id of [source.header.lyricId, ...source.canonical.flatMap(line => "id" in line ? [line.id] : []),
      ...source.header.public.verses?.map(verse => verse.id) ?? []]) {
      if (seen.has(id)) throw new Error("Duplicate source identity");
      seen.add(id);
    }
  }
  for (const [index, entry] of value.proposals.entries()) {
    const expectedEntry = expected.proposals[index];
    if (!expectedEntry || !object(entry) || !keys(entry, ["lyricId", "sourceSha256", "status", "verses"]) ||
        entry.lyricId !== expectedEntry.lyricId || entry.sourceSha256 !== expectedEntry.sourceSha256 ||
        entry.status !== "provisional" || !Array.isArray(entry.verses) || !entry.verses.length) {
      throw new Error("Invalid, stale, duplicate, reordered or non-provisional source proposal");
    }
    const snapshot = byId.get(expectedEntry.lyricId)!;
    const lines = snapshot.source.canonical.flatMap(line => "id" in line ? [line.id] : []);
    const structural = new Map(boundaries(snapshot.source).map(verse => [verse.endsAt, verse.evidence]));
    let previous = -1;
    for (const verse of entry.verses) {
      if (!object(verse) || !keys(verse, ["id", "endsAt", "evidence"]) ||
          typeof verse.id !== "string" || !uuidPattern.test(verse.id) || seen.has(verse.id) ||
          typeof verse.endsAt !== "string" ||
          !["blank-separator", "end-of-source", "owner-edit"].includes(String(verse.evidence))) {
        throw new Error("Invalid or colliding candidate identity/evidence");
      }
      const end = lines.indexOf(verse.endsAt);
      if (end <= previous || (verse.evidence !== "owner-edit" && structural.get(verse.endsAt) !== verse.evidence)) {
        throw new Error("Unknown, unordered or unsupported candidate boundary");
      }
      previous = end; seen.add(verse.id);
    }
    if (previous !== lines.length - 1) throw new Error("Candidate verses must cover all canonical lines");
  }
}
export async function loadSnapshots(directory: string, options: Pick<Settings,
  "maxSourceFileBytes" | "maxTotalSourceBytes" | "excludedLyricIds">): Promise<Snapshot[]> {
  if (await exists(`${directory}.import.lock`)) throw new Error("Source import active or interrupted");
  const snapshots: Snapshot[] = [];
  let total = 0;
  for (const name of (await readdir(directory)).sort()) {
    if (!name.endsWith(".md") || options.excludedLyricIds.includes(name.slice(0, -3))) continue;
    const path = join(directory, name), info = await lstat(path);
    if (!info.isFile() || info.size > options.maxSourceFileBytes) throw new Error(`Invalid source file or size: ${name}`);
    total += info.size;
    if (total > options.maxTotalSourceBytes) throw new Error("Source total byte limit exceeded");
    const bytes = await readFile(path);
    if (bytes.length !== info.size) throw new Error("Source changed during snapshot read");
    const source = parseLyricSource(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (name !== `${source.header.lyricId}.md`) throw new Error("Source filename and lyric identity differ");
    snapshots.push({ lyricId: source.header.lyricId, sourceSha256: hash(bytes), source });
  }
  if (await exists(`${directory}.import.lock`)) throw new Error("Source import started during snapshot read");
  return snapshots;
}
const serialize = (review: Review) => JSON.stringify(review, null, 2) + "\n";
export function summary(review: Review) {
  const verses = review.proposals.flatMap(proposal => proposal.verses);
  return {
    proposedSources: review.proposals.length, provisionalUncertainVerses: verses.length,
    blankSeparatorEnds: verses.filter(verse => verse.evidence === "blank-separator").length,
    sourceEndClosures: verses.filter(verse => verse.evidence === "end-of-source").length,
    ownerEditedEnds: verses.filter(verse => verse.evidence === "owner-edit").length,
    singleSpanUncertainSources: review.proposals.filter(proposal => proposal.verses.length === 1).length,
  };
}
export async function runReview(directory: string, output: string, options: Pick<Settings,
  "maxSourceFileBytes" | "maxTotalSourceBytes" | "excludedLyricIds">, generate: boolean) {
  const lockPath = `${output}.lock`;
  if (await exists(lockPath)) throw new Error("Proposal writer active or interrupted; inspect its lock");
  const sources = await loadSnapshots(directory, options);
  if (await exists(output)) {
    const review: unknown = JSON.parse(await readFile(output, "utf8"));
    validateReview(review, sources);
    return { ...summary(review), unchanged: true };
  }
  if (!generate) throw new Error("Missing persisted provisional verse proposals; run verses:propose");
  const review = propose(sources);
  validateReview(review, sources);
  await mkdir(dirname(output), { recursive: true });
  const lock = await open(lockPath, "wx");
  const pending = `${output}.${randomUUID()}.pending`;
  try {
    if (await exists(output)) throw new Error("Proposal file appeared concurrently; rerun without overwriting");
    await writePending(pending, serialize(review));
    const current = await loadSnapshots(directory, options);
    if (JSON.stringify(current.map(({ lyricId, sourceSha256 }) => [lyricId, sourceSha256])) !==
        JSON.stringify(sources.map(({ lyricId, sourceSha256 }) => [lyricId, sourceSha256]))) {
      throw new Error("Sources changed; proposals not activated");
    }
    await rename(pending, output);
    return { ...summary(review), unchanged: false };
  } finally {
    await rm(pending, { force: true });
    await lock.close();
    await rm(lockPath);
  }
}
async function writePending(path: string, text: string) {
  const file = await open(path, "wx");
  try { await file.writeFile(text, "utf8"); await file.sync(); }
  finally { await file.close(); }
}
function inside(path: string) {
  const resolved = resolve(root, path), local = relative(root, resolved);
  if (!local || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error("Paths must stay inside Library");
  return resolved;
}
async function main() {
  const schema = JSON.parse(await readFile(join(root, "settings", "verse-proposals.schema.json"), "utf8"));
  const validate = new Ajv2020.default({ strict: true }).compile<Settings>(schema);
  const settings: unknown = strictYaml(await readFile(join(root, "settings", "verse-proposals.yml"), "utf8"));
  if (!validate(settings)) throw new Error("Invalid verse-proposals settings");
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--generate", "--validate"].includes(args[0] ?? "")) throw new Error("Use --generate or --validate");
  const directory = inside(settings.sourceDirectory), output = inside(settings.outputFile);
  const relation = relative(directory, output);
  if (!relation || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation))) {
    throw new Error("Proposals must remain outside canonical source directory");
  }
  const inventory = await validateSources(directory);
  console.log(JSON.stringify({ ...inventory, excludedLyricIds: settings.excludedLyricIds,
    ...await runReview(directory, output, settings, args[0] === "--generate") }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
