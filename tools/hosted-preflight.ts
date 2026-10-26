import { createHash } from "node:crypto";
import { appendFile, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import type { LyricItem, LyricDescriptor } from "../shared/types/lyrics.js";
import { assertCanonicalLyricItem } from "./lyric-logical.js";
import { lyricPublicationBounds, lyricPublicationSettings, type LyricBounds } from "./lyric-publisher.js";
import { assertPublicationCatalog } from "./publication-history.js";
import type { PublicationLedger } from "./publication-ledger.js";
import { bindCanonicalSnapshot, type PreparedCanonicalSnapshot, type SnapshotBounds } from "./snapshot-producer.js";
import { canonical, deterministicGzip, parseCanonicalJson, yaml } from "./publisher.js";

export interface HostingPolicy {
  maxHostedBytes: number;
  maxUtilizationPercent: number;
}
export interface HostingSettings extends HostingPolicy {
  formatVersion: 1;
  siteDirectory: string;
}
export interface HostedPreflightReport {
  stage: "prelaunch";
  fileCount: number;
  objectCount: number;
  catalogItems: number;
  totalHostedBytes: number;
  headroomLimitBytes: number;
  manifestSha256: string;
}
export interface SnapshotPreflightReport {
  stage: "staged-snapshot";
  sequence: number;
  fileCount: number;
  artifactCount: number;
  totalHostedBytes: number;
  headroomLimitBytes: number;
  manifestSha256: string;
}
type Summary = Pick<LyricItem, "lyricId" | "title" | "tags">;
type ObjectRecord = { encodedBytes: number; decodedBytes: number } &
  ({ role: "item"; summary: Summary } | { role: "manifest" });
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ajv = new Ajv2020.default({ strict: true });
const settingsSchema = JSON.parse(await readFile(new URL("../settings/hosting.schema.json", import.meta.url), "utf8"));
const publicationSchema = JSON.parse(await readFile(new URL("../shared/schemas/lyric-publication.schema.json", import.meta.url), "utf8"));
const settingsShape = ajv.compile<HostingSettings>(settingsSchema), descriptorShape = ajv.compile<LyricDescriptor>(publicationSchema);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function hostingSettings(): Promise<HostingSettings> {
  const value: unknown = yaml(await readFile(new URL("../settings/hosting.yml", import.meta.url), "utf8"));
  if (!settingsShape(value)) throw new Error("Invalid hosting settings");
  return value;
}
export function hostingByteLimit(policy: HostingPolicy): number {
  if (!Number.isSafeInteger(policy.maxHostedBytes) || policy.maxHostedBytes < 1 ||
      !Number.isSafeInteger(policy.maxUtilizationPercent) || policy.maxUtilizationPercent < 1 ||
      policy.maxUtilizationPercent > 100) throw new Error("Invalid hosting byte policy");
  return Number(BigInt(policy.maxHostedBytes) * BigInt(policy.maxUtilizationPercent) / 100n);
}
function nested(parent: string, child: string): string {
  const path = relative(parent, child);
  if (!path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error("Hosted lyric directory must be strictly inside the site root");
  }
  return path.split(sep).join("/");
}
function summary(item: Summary): Summary {
  return { lyricId: item.lyricId, title: item.title, tags: item.tags };
}
function decodedObject(bytes: Buffer, sha256: string, bounds: LyricBounds): { value: unknown; decodedBytes: number } {
  if (hash(bytes) !== sha256) throw new Error("Hosted object encoded hash mismatch");
  const decoded = gunzipSync(bytes, { maxOutputLength: Math.max(bounds.maxItemDecodedBytes, bounds.maxManifestDecodedBytes) });
  if (!deterministicGzip(decoded).equals(bytes)) throw new Error("Hosted object is not exact deterministic gzip");
  return { value: parseCanonicalJson(decoded, "hosted object"), decodedBytes: decoded.length };
}

async function inspectHostedOutput(site: string, allowedDirectories: ReadonlySet<string>, byteLimit: number,
  maximum: (path: string) => number, inspect: (path: string, absolute: string, bytes: Buffer) => void) {
  const rootStat = await lstat(site);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Hosted site must be a regular directory");
  let total = 0n, fileCount = 0;
  const directories = [{ absolute: site, path: "" }];
  while (directories.length) {
    const directory = directories.pop()!;
    for (const entry of (await readdir(directory.absolute, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = directory.path ? `${directory.path}/${entry.name}` : entry.name;
      const absolute = join(directory.absolute, entry.name), stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error("Hosted output cannot contain links");
      if (stat.isDirectory()) {
        if (!allowedDirectories.has(path)) throw new Error("Unexpected hosted directory");
        directories.push({ absolute, path });
        continue;
      }
      if (!stat.isFile()) throw new Error("Hosted output must contain only regular files");
      const limit = maximum(path);
      if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > limit) throw new Error("Hosted artifact exceeds encoded byte bound");
      total += BigInt(stat.size);
      if (total > BigInt(byteLimit)) throw new Error("Complete hosted output exceeds configured headroom");
      const bytes = await readFile(absolute);
      if (bytes.length !== stat.size) throw new Error("Hosted file changed during preflight");
      inspect(path, absolute, bytes);
      fileCount++;
    }
  }
  return { fileCount, totalHostedBytes: Number(total) };
}

export async function preflightHostedLyrics(siteDirectory: string, lyricDirectory: string,
  bounds: LyricBounds, policy: HostingPolicy): Promise<HostedPreflightReport> {
  if (!isAbsolute(siteDirectory) || !isAbsolute(lyricDirectory)) throw new Error("Hosted preflight requires absolute staging paths");
  const site = resolve(siteDirectory), lyrics = resolve(lyricDirectory), prefix = nested(site, lyrics);
  const byteLimit = hostingByteLimit(policy);
  for (const value of [bounds.maxDescriptorBytes, bounds.maxManifestEncodedBytes, bounds.maxManifestDecodedBytes,
    bounds.maxItemEncodedBytes, bounds.maxItemDecodedBytes]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid hosted artifact bounds");
  }
  const allowedDirectories = new Set<string>();
  const parts = prefix.split("/");
  for (let i = 1; i <= parts.length; i++) allowedDirectories.add(parts.slice(0, i).join("/"));
  allowedDirectories.add(`${prefix}/objects`);
  const objects = new Map<string, ObjectRecord>(), manifestPaths: { sha256: string; path: string }[] = [];
  let descriptor: LyricDescriptor | undefined;
  const inventory = await inspectHostedOutput(site, allowedDirectories, byteLimit, path => {
    const isDescriptor = path === `${prefix}/latest.json`;
    const objectName = path.startsWith(`${prefix}/objects/`) ? path.slice(`${prefix}/objects/`.length) : "";
    const match = /^[0-9a-f]{64}\.json\.gz$/.test(objectName);
    if (!isDescriptor && !match) throw new Error("Unexpected hosted file");
    return isDescriptor ? bounds.maxDescriptorBytes : Math.max(bounds.maxItemEncodedBytes, bounds.maxManifestEncodedBytes);
  }, (path, absolute, bytes) => {
    if (path === `${prefix}/latest.json`) {
      if (bytes.at(-1) !== 10) throw new Error("Hosted descriptor requires canonical JSON plus LF");
      const value = parseCanonicalJson(bytes.subarray(0, -1), "hosted descriptor");
      if (!descriptorShape(value)) throw new Error("Invalid hosted descriptor");
      descriptor = value;
      return;
    }
    const sha256 = path.slice(`${prefix}/objects/`.length, -".json.gz".length), decoded = decodedObject(bytes, sha256, bounds);
    if (decoded.value !== null && typeof decoded.value === "object" && "format" in decoded.value &&
        decoded.value.format === "daasavaani-lyric") {
      assertCanonicalLyricItem(decoded.value);
      if (bytes.length > bounds.maxItemEncodedBytes || decoded.decodedBytes > bounds.maxItemDecodedBytes) {
        throw new Error("Hosted item exceeds role byte bound");
      }
      objects.set(sha256, { role: "item", encodedBytes: bytes.length, decodedBytes: decoded.decodedBytes, summary: summary(decoded.value) });
    } else {
      assertPublicationCatalog(decoded.value);
      if (bytes.length > bounds.maxManifestEncodedBytes || decoded.decodedBytes > bounds.maxManifestDecodedBytes) {
        throw new Error("Hosted manifest exceeds role byte bound");
      }
      objects.set(sha256, { role: "manifest", encodedBytes: bytes.length, decodedBytes: decoded.decodedBytes });
      manifestPaths.push({ sha256, path: absolute });
    }
  });
  if (!descriptor) throw new Error("Hosted descriptor is missing");
  const reference = descriptor.manifest, current = objects.get(reference.sha256);
  if (reference.path !== `objects/${reference.sha256}.json.gz` || current?.role !== "manifest" ||
      current.encodedBytes !== reference.encodedBytes || current.decodedBytes !== reference.decodedBytes) {
    throw new Error("Hosted descriptor/manifest binding mismatch");
  }
  let catalogItems = 0;
  for (const manifest of manifestPaths) {
    const record = objects.get(manifest.sha256)!;
    const encoded = await readFile(manifest.path);
    if (encoded.length !== record.encodedBytes) throw new Error("Hosted manifest changed during preflight");
    const decoded = decodedObject(encoded, manifest.sha256, bounds);
    assertPublicationCatalog(decoded.value);
    for (const entry of decoded.value.catalog) {
      const item = objects.get(entry.item.sha256);
      if (entry.item.path !== `objects/${entry.item.sha256}.json.gz` || item?.role !== "item" ||
          item.encodedBytes !== entry.item.encodedBytes || item.decodedBytes !== entry.item.decodedBytes ||
          canonical(item.summary) !== canonical(summary(entry))) throw new Error("Hosted catalog/item binding mismatch");
    }
    if (manifest.sha256 === reference.sha256) catalogItems = decoded.value.catalog.length;
  }
  return { stage: "prelaunch", fileCount: inventory.fileCount, objectCount: objects.size, catalogItems,
    totalHostedBytes: inventory.totalHostedBytes, headroomLimitBytes: byteLimit, manifestSha256: reference.sha256 };
}

export async function preflightCanonicalSnapshot(siteDirectory: string, snapshotDirectory: string,
  state: PublicationLedger, expectedStateSha256: string, prepared: PreparedCanonicalSnapshot,
  bounds: SnapshotBounds, policy: HostingPolicy): Promise<SnapshotPreflightReport> {
  if (!isAbsolute(siteDirectory) || !isAbsolute(snapshotDirectory)) throw new Error("Hosted preflight requires absolute staging paths");
  const site = resolve(siteDirectory), prefix = nested(site, resolve(snapshotDirectory)), byteLimit = hostingByteLimit(policy);
  const bound = bindCanonicalSnapshot(state, expectedStateSha256, prepared, bounds);
  const expected = new Map([...bound.artifacts].map(([path, bytes]) => [`${prefix}/${path}`, bytes]));
  expected.set(`${prefix}/latest.json`, bound.descriptorBytes);
  const allowedDirectories = new Set<string>();
  for (const path of expected.keys()) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) allowedDirectories.add(parts.slice(0, i).join("/"));
  }
  const inventory = await inspectHostedOutput(site, allowedDirectories, byteLimit, path => {
    const bytes = expected.get(path);
    if (!bytes) throw new Error("Unexpected hosted file");
    return bytes.length;
  }, (path, _absolute, bytes) => {
    if (!bytes.equals(expected.get(path)!)) throw new Error("Hosted file does not match bound snapshot bytes");
  });
  if (inventory.fileCount !== expected.size) throw new Error("Hosted snapshot artifact is missing");
  return { stage: "staged-snapshot", sequence: bound.descriptor.sequence, ...inventory,
    artifactCount: bound.artifacts.size, headroomLimitBytes: byteLimit, manifestSha256: bound.descriptor.manifest.sha256 };
}

async function main() {
  if (process.argv.length !== 2) throw new Error("Hosted preflight paths are owned by settings");
  const hosting = await hostingSettings(), lyrics = await lyricPublicationSettings();
  const site = resolve(root, hosting.siteDirectory);
  nested(root, site);
  nested(await realpath(root), await realpath(site));
  const report = await preflightHostedLyrics(site, resolve(root, lyrics.outputDirectory), await lyricPublicationBounds(), hosting);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `site-directory=${hosting.siteDirectory}\n`);
  console.log(JSON.stringify(report));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
