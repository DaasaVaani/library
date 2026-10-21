import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
import { completeSourceHeader, parseDraft, parseLyricSource, uuidPattern, type DraftHeader, type SourceEncoding } from "./lyric-source.js";

interface CreditFooterPolicy {
  enabled: boolean; primaryLabel: string; companionLabel: string; additionalLabels: string[];
}
interface ImportSettings {
  formatVersion: 1; sourceDirectory: string; outputDirectory: string;
  maxSourceFileBytes: number; maxTotalSourceBytes: number; reviewHoldReason: string;
  creditFooter: CreditFooterPolicy;
}
type ImportOptions = Pick<ImportSettings, "maxSourceFileBytes" | "maxTotalSourceBytes" | "reviewHoldReason"> & { creditFooter?: CreditFooterPolicy };
interface Imported {
  sourceFile: string; sha256: string; status: "imported"; lyricId: string; encoding: SourceEncoding;
}
interface Held { sourceFile: string; sha256: string; status: "held"; reason: string }
type ReceiptEntry = Imported | Held;
interface Receipt { format: "daasavaani-source-import"; formatVersion: 1; entries: ReceiptEntry[] }
export interface ImportSummary { imported: number; held: number; unchanged: boolean; exceptions: Held[] }
const receiptName = ".source-import.json";
const root = fileURLToPath(new URL("../", import.meta.url));
const settingsSchema = JSON.parse(await readFile(new URL("../settings/source-import.schema.json", import.meta.url), "utf8"));
const validateSettings = new Ajv2020.default({ strict: true }).compile<ImportSettings>(settingsSchema);
const validateFooterPolicy = new Ajv2020.default({ strict: true }).compile<CreditFooterPolicy>({
  $defs: settingsSchema.$defs, ...settingsSchema.properties.creditFooter,
});
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
// Windows file watchers can briefly retain handles after the last file is removed.
const removeOwnedDirectory = (path: string) => rm(path, { recursive: true, maxRetries: 5, retryDelay: 100 });
class HeldSource extends Error {}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
async function exists(path: string) {
  try { await lstat(path); return true; }
  catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return false; throw error; }
}
function receipt(value: unknown): Receipt {
  if (!object(value) || !keys(value, ["format", "formatVersion", "entries"]) ||
      value.format !== "daasavaani-source-import" || value.formatVersion !== 1 || !Array.isArray(value.entries) || !value.entries.length) {
    throw new Error("Invalid source-import receipt");
  }
  const names = new Set<string>(), ids = new Set<string>();
  const entries: ReceiptEntry[] = value.entries.map((entry: unknown) => {
    if (!object(entry) || typeof entry.sourceFile !== "string" || !/^[^\\/\u0000-\u001f]+\.txt$/u.test(entry.sourceFile) ||
        names.has(entry.sourceFile) || typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw new Error("Invalid or duplicate receipt source");
    }
    names.add(entry.sourceFile);
    if (entry.status === "held" && keys(entry, ["sourceFile", "sha256", "status", "reason"]) &&
        typeof entry.reason === "string" && entry.reason.length) {
      return { sourceFile: entry.sourceFile, sha256: entry.sha256, status: "held", reason: entry.reason };
    }
    if (entry.status !== "imported" || !keys(entry, ["sourceFile", "sha256", "status", "lyricId", "encoding"]) ||
        typeof entry.lyricId !== "string" || !uuidPattern.test(entry.lyricId) || ids.has(entry.lyricId) ||
        (entry.encoding !== "utf-8" && entry.encoding !== "utf-16le" && entry.encoding !== "utf-16be")) {
      throw new Error("Invalid imported receipt identity");
    }
    ids.add(entry.lyricId);
    return { sourceFile: entry.sourceFile, sha256: entry.sha256, status: "imported", lyricId: entry.lyricId, encoding: entry.encoding };
  });
  return { format: "daasavaani-source-import", formatVersion: 1, entries };
}
function decoded(bytes: Uint8Array): { text: string; encoding: SourceEncoding } {
  if ((bytes[0] === 255 && bytes[1] === 254 && bytes[2] === 0 && bytes[3] === 0) ||
      (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 254 && bytes[3] === 255)) throw new HeldSource("unsupported-encoding");
  const encoding: SourceEncoding = bytes[0] === 255 && bytes[1] === 254 ? "utf-16le"
    : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch (error) { if (error instanceof TypeError) throw new HeldSource("unsupported-or-malformed-encoding"); throw error; }
  if (/\r(?!\n)|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u.test(text)) throw new HeldSource("unsupported-control-character");
  return { text: text.replace(/\r\n/g, "\n"), encoding };
}
function footerStart(lines: string[], policy?: CreditFooterPolicy) {
  if (!policy?.enabled) return -1;
  const labelled = (line: string, label: string) => {
    const value = line.trimStart();
    return value.startsWith(label) && /^[ \t]*:[ \t]*\S/u.test(value.slice(label.length));
  };
  const candidates = lines.flatMap((line, index) => labelled(line, policy.primaryLabel) ? [index] : []);
  if (candidates.length !== 1) return -1;
  const start = candidates[0];
  if (start === undefined || !lines.slice(0, start).some(line => /\p{Script=Kannada}/u.test(line))) return -1;
  const tail = lines.slice(start).filter(line => !/^[ \t]*$/u.test(line));
  if (!tail[1] || !labelled(tail[1], policy.companionLabel)) return -1;
  const valid = tail.slice(2).every(line =>
    policy.additionalLabels.some(label => labelled(line, label)) ||
    (!line.includes("|") && line.split(",").filter(part => part.trim()).length >= 3) ||
    /^[ \t]*[0-9]+(?:\.[0-9]+)?[ \t]*-[ \t]*[0-9]+(?:\.[0-9]+)?[ \t]*$/u.test(line));
  return valid ? start : -1;
}
function sections(text: string, policy?: CreditFooterPolicy) {
  const lines = text.split("\n");
  const first = lines.find(line => !/^[ \t]*$/u.test(line));
  if (!first || !/\p{Script=Kannada}/u.test(first)) throw new HeldSource("initial-kannada-section-needs-review");
  const footer = footerStart(lines, policy);
  const body = footer < 0 ? lines : lines.slice(0, footer);
  const boundary = body.findIndex(line => /\p{Script=Latin}/u.test(line) && !/\p{Script=Kannada}/u.test(line));
  const canonical = boundary < 0 ? body : body.slice(0, boundary);
  const latin = boundary < 0 ? undefined : body.slice(boundary).join("\n");
  if (latin !== undefined && /\p{Script=Kannada}/u.test(latin)) throw new HeldSource("kannada-after-latin-boundary");
  return { title: first, canonical, latin, footer: footer < 0 ? "" : lines.slice(footer).join("\n") };
}
function fence(language: string, text: string) {
  let length = 3;
  for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  const marker = "`".repeat(length);
  return `${marker}${language}\n${text}\n${marker}\n`;
}
function draft(sourceFile: string, sha256: string, bytes: Uint8Array, hold: string, policy?: CreditFooterPolicy) {
  const { text, encoding } = decoded(bytes);
  const { title, canonical, latin, footer } = sections(text, policy);
  const lyricId = randomUUID();
  const header = completeSourceHeader({ sourceFormat: 2, lyricId, public: { title, tags: [] },
    provenance: { kind: "owner-supplied", sourceFile, sha256, encoding, description: footer }, review: { holdReasons: [hold] } });
  const content = canonical.map(line => /^[ \t]*$/u.test(line) ? line : `[${randomUUID()}] ${line}`).join("\n");
  const markdown = `---\n${stringify(header, { lineWidth: 0 })}---\n\n${fence("kannada", content)}` +
    (latin === undefined ? "" : `\n${fence("source-latin", latin)}`);
  const parsed = parseDraft(markdown);
  if (parsed.canonical.map(line => line.text).join("\n") !== canonical.join("\n") || parsed.sourceLatin !== latin ||
      parsed.header.provenance.description !== footer) {
    throw new Error("Draft round-trip changed literal source text");
  }
  return { markdown, lyricId, encoding, footer };
}
async function inputs(directory: string, limit: number, totalLimit: number) {
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error("Source root must be a regular directory, not a link");
  const entries = await readdir(directory, { withFileTypes: true });
  const files = new Map<string, { bytes: Uint8Array; sha256: string }>();
  let total = 0;
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (!entry.isFile() || !/^[^\\/\u0000-\u001f]+\.txt$/u.test(entry.name) || !entry.name.isWellFormed()) {
      throw new Error("Source directory must contain only regular, safely named .txt files; no links/subdirectories");
    }
    const file = join(directory, entry.name);
    const size = (await stat(file)).size;
    if (size > limit) throw new Error(`Source exceeds configured byte limit: ${entry.name}`);
    if (total + size > totalLimit) throw new Error("Sources exceed configured total byte limit");
    const bytes = await readFile(file);
    if (bytes.length > limit) throw new Error(`Source grew beyond configured byte limit: ${entry.name}`);
    total += bytes.length;
    if (total > totalLimit) throw new Error("Sources grew beyond configured total byte limit");
    files.set(entry.name, { bytes, sha256: hash(bytes) });
  }
  if (!files.size) throw new Error("Source directory has no text files");
  return files;
}
async function readUtf8File(path: string) {
  if (!(await lstat(path)).isFile()) throw new Error("Draft records must be regular files, not links");
  return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
}
async function readReceipt(directory: string) {
  if (!(await lstat(directory)).isDirectory()) throw new Error("Draft destination must be a regular directory, not a link");
  return receipt(JSON.parse(await readUtf8File(join(directory, receiptName))));
}
async function verify(directory: string, value: Receipt) {
  const expected = new Set(value.entries.flatMap(entry => entry.status === "imported" ? [`${entry.lyricId}.md`] : []));
  const actual = (await readdir(directory)).filter(name => name.endsWith(".md"));
  if (actual.length !== expected.size || actual.some(name => !expected.has(name))) throw new Error("Draft files and receipt differ");
  const ids = new Set<string>();
  for (const entry of value.entries) {
    if (entry.status !== "imported") continue;
    const file = join(directory, `${entry.lyricId}.md`);
    const parsed = parseLyricSource(await readUtf8File(file));
    if (parsed.header.lyricId !== entry.lyricId || parsed.header.provenance.sourceFile !== entry.sourceFile ||
        parsed.header.provenance.sha256 !== entry.sha256 || parsed.header.provenance.encoding !== entry.encoding) {
      throw new Error("Existing draft identity/provenance disagrees with its import receipt; nothing was overwritten");
    }
    for (const id of [parsed.header.lyricId, ...parsed.canonical.flatMap(line => "id" in line ? [line.id] : []),
      ...parsed.header.public.verses?.map(verse => verse.id) ?? []]) {
      if (ids.has(id)) throw new Error("Duplicate identity across draft sources");
      ids.add(id);
    }
  }
}
async function importInputs(sourceDirectory: string, outputDirectory: string, options: ImportOptions) {
  const source = resolve(sourceDirectory), output = resolve(outputDirectory);
  const within = (parent: string, child: string) => {
    const path = relative(parent, child);
    return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  };
  if (within(source, output) || within(output, source)) throw new Error("Original and draft directories must be separate non-nested locations");
  if (!Number.isSafeInteger(options.maxSourceFileBytes) || options.maxSourceFileBytes < 1 ||
      !Number.isSafeInteger(options.maxTotalSourceBytes) || options.maxTotalSourceBytes < options.maxSourceFileBytes ||
      !options.reviewHoldReason) throw new Error("Invalid import safety options");
  if (options.creditFooter && !validateFooterPolicy(options.creditFooter)) throw new Error("Invalid credit-footer policy");
  const original = await inputs(source, options.maxSourceFileBytes, options.maxTotalSourceBytes);
  return { source, output, original };
}
export async function importSources(sourceDirectory: string, outputDirectory: string,
  options: ImportOptions): Promise<ImportSummary> {
  const { source, output, original } = await importInputs(sourceDirectory, outputDirectory, options);
  if (await exists(output)) {
    const old = await readReceipt(output);
    if (old.entries.length !== original.size || old.entries.some(entry => original.get(entry.sourceFile)?.sha256 !== entry.sha256)) {
      throw new Error("Source set changed after import; no IDs were reassigned and no drafts were overwritten. Review a separate incremental import.");
    }
    await verify(output, old);
    const exceptions = old.entries.filter((entry): entry is Held => entry.status === "held");
    return { imported: old.entries.length - exceptions.length, held: exceptions.length, unchanged: true, exceptions };
  }
  await mkdir(dirname(output), { recursive: true });
  const lockPath = `${output}.import.lock`;
  const lock = await open(lockPath, "wx");
  const staging = `${output}.import-${randomUUID()}`;
  let created = false, committed = false;
  try {
    if (await exists(output)) throw new Error("Draft destination appeared concurrently; nothing was overwritten");
    await mkdir(staging); created = true;
    const entries: ReceiptEntry[] = [];
    for (const [sourceFile, value] of original) {
      try {
        const result = draft(sourceFile, value.sha256, value.bytes, options.reviewHoldReason, options.creditFooter);
        await writeFile(join(staging, `${result.lyricId}.md`), result.markdown, { encoding: "utf8", flag: "wx" });
        entries.push({ sourceFile, sha256: value.sha256, status: "imported", lyricId: result.lyricId, encoding: result.encoding });
      } catch (error) {
        if (!(error instanceof HeldSource)) throw error;
        entries.push({ sourceFile, sha256: value.sha256, status: "held", reason: error.message });
      }
    }
    const value: Receipt = { format: "daasavaani-source-import", formatVersion: 1, entries };
    await writeFile(join(staging, receiptName), JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    await verify(staging, value);
    const current = await inputs(source, options.maxSourceFileBytes, options.maxTotalSourceBytes);
    if (current.size !== original.size || [...original].some(([name, entry]) => current.get(name)?.sha256 !== entry.sha256)) {
      throw new Error("Original sources changed during preparation; nothing was committed");
    }
    if (await exists(output)) throw new Error("Draft destination appeared during preparation; nothing was overwritten");
    await rename(staging, output); committed = true;
    const exceptions = entries.filter((entry): entry is Held => entry.status === "held");
    return { imported: entries.length - exceptions.length, held: exceptions.length, unchanged: false, exceptions };
  } finally {
    try { if (created && !committed) await removeOwnedDirectory(staging); }
    finally { await lock.close(); await rm(lockPath); }
  }
}
export async function retryCreditFooters(sourceDirectory: string, outputDirectory: string, options: ImportOptions): Promise<ImportSummary> {
  if (!options.creditFooter?.enabled) throw new Error("Credit-footer retry requires an explicitly enabled policy");
  const { source, output, original } = await importInputs(sourceDirectory, outputDirectory, options);
  const lockPath = `${output}.import.lock`, lock = await open(lockPath, "wx");
  const staging = `${output}.import-${randomUUID()}`, backup = `${output}.previous-${randomUUID()}`;
  let created = false, displaced = false, committed = false;
  try {
    const old = await readReceipt(output);
    if (old.entries.length !== original.size || old.entries.some(entry => original.get(entry.sourceFile)?.sha256 !== entry.sha256)) {
      throw new Error("Source set changed after import; credit-footer retry never updates raw-source correspondence");
    }
    await verify(output, old);
    const retained = new Map<string, Buffer>([[receiptName, await readFile(join(output, receiptName))]]);
    for (const entry of old.entries) {
      if (entry.status !== "imported") continue;
      const name = `${entry.lyricId}.md`, bytes = await readFile(join(output, name));
      retained.set(name, bytes);
    }
    let converted = 0;
    const entries: ReceiptEntry[] = [];
    for (const entry of old.entries) {
      if (entry.status !== "held" || entry.reason !== "kannada-after-latin-boundary") { entries.push(entry); continue; }
      const input = original.get(entry.sourceFile);
      if (!input) throw new Error("Missing original during credit-footer preparation");
      try {
        const result = draft(entry.sourceFile, entry.sha256, input.bytes, options.reviewHoldReason, options.creditFooter);
        if (!result.footer) { entries.push(entry); continue; }
        if (!created) { await mkdir(staging); created = true; }
        await writeFile(join(staging, `${result.lyricId}.md`), result.markdown, { encoding: "utf8", flag: "wx" });
        entries.push({ sourceFile: entry.sourceFile, sha256: entry.sha256, status: "imported", lyricId: result.lyricId, encoding: result.encoding });
        converted++;
      } catch (error) {
        if (!(error instanceof HeldSource)) throw error;
        entries.push(entry);
      }
    }
    const exceptions = entries.filter((entry): entry is Held => entry.status === "held");
    if (!converted) return { imported: entries.length - exceptions.length, held: exceptions.length, unchanged: true, exceptions };
    for (const [name, bytes] of retained) {
      if (name !== receiptName) await writeFile(join(staging, name), bytes, { flag: "wx" });
    }
    const value: Receipt = { format: "daasavaani-source-import", formatVersion: 1, entries };
    await writeFile(join(staging, receiptName), JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    await verify(staging, value);
    const current = await inputs(source, options.maxSourceFileBytes, options.maxTotalSourceBytes);
    if (current.size !== original.size || [...original].some(([name, entry]) => current.get(name)?.sha256 !== entry.sha256)) {
      throw new Error("Original sources changed during credit-footer preparation; nothing was committed");
    }
    await verify(output, old);
    for (const [name, bytes] of retained) {
      if (!(await readFile(join(output, name))).equals(bytes)) throw new Error("Existing sources changed during preparation; nothing was overwritten");
    }
    await rename(output, backup); displaced = true;
    try { await rename(staging, output); committed = true; }
    catch (error) {
      try { await rename(backup, output); displaced = false; }
      catch (rollback) { throw new AggregateError([error, rollback], `Activation and rollback failed; preserved previous sources at ${backup}`); }
      throw error;
    }
    await removeOwnedDirectory(backup); displaced = false;
    return { imported: entries.length - exceptions.length, held: exceptions.length, unchanged: false, exceptions };
  } finally {
    try { if (created && !committed) await removeOwnedDirectory(staging); }
    finally {
      await lock.close();
      if (!displaced) await rm(lockPath);
    }
  }
}
export async function validateSources(outputDirectory: string) {
  if (await exists(`${resolve(outputDirectory)}.import.lock`)) throw new Error("Source import is active or interrupted; inspect its lock before validation");
  const value = await readReceipt(outputDirectory);
  await verify(outputDirectory, value);
  if (await exists(`${resolve(outputDirectory)}.import.lock`)) throw new Error("Source import started during validation; retry after it completes");
  const imported = value.entries.filter(entry => entry.status === "imported").length;
  return { imported, held: value.entries.length - imported };
}
async function main() {
  const settings: unknown = strictYaml(await readFile(join(root, "settings", "source-import.yml"), "utf8"));
  if (!validateSettings(settings)) throw new Error("Invalid source-import settings: " + JSON.stringify(validateSettings.errors));
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--import", "--validate", "--retry-credit-footers"].includes(args[0] ?? "")) {
    throw new Error("Use --import, --validate or --retry-credit-footers");
  }
  const source = resolve(root, settings.sourceDirectory), output = resolve(root, settings.outputDirectory);
  for (const directory of [source, output]) {
    const path = relative(root, directory);
    if (!path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new Error("Import settings require dedicated directories inside Library");
  }
  if (args[0] === "--validate") {
    if (!(await exists(output))) { console.log("No draft source directory present; no source records validated."); return; }
    console.log(JSON.stringify(await validateSources(output))); return;
  }
  const result = await (args[0] === "--retry-credit-footers" ? retryCreditFooters : importSources)(source, output, settings);
  console.log(JSON.stringify(result, null, 2));
  console.log("Review decisions and identities are preserved; no publication, inferred verses or media matching occurred.");
  if (result.held) process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
