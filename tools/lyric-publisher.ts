import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { canonical, deterministicGzip, yaml } from "./publisher.js";
import { readCanonicalSources } from "./canonical-sources.js";
import type { LyricDescriptor, LyricManifest, LyricObjectReference } from "../shared/types/lyrics.js";

interface Settings {
  formatVersion: 1; sourceDirectory: string; outputDirectory: string; stage: "prelaunch";
  requiredCapability: "lyric-preview-v1"; maxSourceFileBytes: number; maxTotalSourceBytes: number;
}
export interface LyricBounds {
  maxDescriptorBytes: number; maxManifestEncodedBytes: number; maxManifestDecodedBytes: number;
  maxItemEncodedBytes: number; maxItemDecodedBytes: number;
}
const root = fileURLToPath(new URL("../", import.meta.url));
const schema = JSON.parse(await readFile(new URL("../shared/schemas/lyric-publication.schema.json", import.meta.url), "utf8"));
const boundsSchema = JSON.parse(await readFile(new URL("../shared/schemas/publication-policy-settings.schema.json", import.meta.url), "utf8"));
const settingsSchema = JSON.parse(await readFile(new URL("../settings/lyric-publication.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020.default({ strict: true });
const validateManifest = ajv.compile<LyricManifest>({ ...schema, $ref: "#/$defs/manifest" });
const validateDescriptor = ajv.compile<LyricDescriptor>(schema);
const validateBounds = ajv.compile<LyricBounds>(boundsSchema);
const validateSettings = ajv.compile<Settings>(settingsSchema);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const within = (parent: string, child: string) => {
  const path = relative(parent, child);
  return !path || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};
export async function lyricPublicationSettings() {
  const value: unknown = yaml(await readFile(join(root, "settings", "lyric-publication.yml"), "utf8"));
  if (!validateSettings(value) || value.maxTotalSourceBytes < value.maxSourceFileBytes) throw new Error("Invalid lyric publication settings");
  return value;
}
export async function lyricPublicationBounds() {
  const value: unknown = yaml(await readFile(join(root, "shared", "settings", "publication-policy.yml"), "utf8"));
  if (!validateBounds(value)) throw new Error("Invalid lyric publication safety bounds");
  return value;
}
export async function publishLyrics(outputDirectory: string, sourceDirectory: string, bounds: LyricBounds,
  settings: Pick<Settings, "maxSourceFileBytes" | "maxTotalSourceBytes">) {
  const output = resolve(outputDirectory), source = resolve(sourceDirectory);
  if (within(output, source) || within(source, output)) throw new Error("Publication must not overwrite or contain source files");
  for (const value of [bounds.maxDescriptorBytes, bounds.maxManifestEncodedBytes, bounds.maxManifestDecodedBytes,
    bounds.maxItemEncodedBytes, bounds.maxItemDecodedBytes, settings.maxSourceFileBytes, settings.maxTotalSourceBytes]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid publication bound");
  }
  if (settings.maxTotalSourceBytes < settings.maxSourceFileBytes) throw new Error("Invalid publication bound relationship");
  const sources = await readCanonicalSources(source, settings);
  const artifacts = new Map<string, Buffer>();
  function artifact(value: unknown, role: "Item" | "Manifest"): LyricObjectReference {
    const decoded = Buffer.from(canonical(value)), encoded = deterministicGzip(decoded);
    if (decoded.length > bounds[`max${role}DecodedBytes`] || encoded.length > bounds[`max${role}EncodedBytes`]) {
      throw new Error(`${role} exceeds publication bounds`);
    }
    const sha256 = hash(encoded);
    artifacts.set(sha256, encoded);
    return { sha256, path: `objects/${sha256}.json.gz`, encodedBytes: encoded.length, decodedBytes: decoded.length };
  }
  const manifest: LyricManifest = { format: "daasavaani-lyric-catalog", formatVersion: 1, stage: "prelaunch",
    requiredCapabilities: ["lyric-preview-v1"], catalog: [] };
  for (const item of sources.items) {
    manifest.catalog.push({ lyricId: item.lyricId, title: item.title, tags: item.tags, item: artifact(item, "Item") });
  }
  if (!validateManifest(manifest)) throw new Error("Invalid lyric manifest");
  const descriptor: LyricDescriptor = { format: "daasavaani-lyrics", formatVersion: 1, manifest: artifact(manifest, "Manifest") };
  if (!validateDescriptor(descriptor)) throw new Error("Invalid lyric descriptor");
  const descriptorBytes = Buffer.from(canonical(descriptor) + "\n");
  if (descriptorBytes.length > bounds.maxDescriptorBytes) throw new Error("Descriptor exceeds publication bounds");
  await mkdir(dirname(output), { recursive: true });
  const lockPath = `${output}.publish.lock`, lock = await open(lockPath, "wx");
  const pending = join(output, `latest.${randomUUID()}.pending`);
  let pendingCreated = false;
  try {
    try {
      if (!(await lstat(output)).isDirectory()) throw new Error("Publication destination must be a regular directory");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      await mkdir(output);
    }
    const objects = join(output, "objects");
    try {
      if (!(await lstat(objects)).isDirectory()) throw new Error("Object destination must be a regular directory");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      await mkdir(objects);
    }
    for (const [digest, bytes] of artifacts) {
      const path = join(objects, `${digest}.json.gz`);
      try { await writeFile(path, bytes, { flag: "wx" }); }
      catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
        if (!(await lstat(path)).isFile() || !(await readFile(path)).equals(bytes)) throw new Error("Existing hash-addressed object is damaged");
      }
    }
    try {
      const previous = join(output, "latest.json");
      if (!(await lstat(previous)).isFile()) throw new Error("Descriptor must be a regular file");
      if ((await readFile(previous)).equals(descriptorBytes)) return { descriptor, manifest, held: sources.held, extractionExceptions: sources.extractionExceptions, unchanged: true };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    await writeFile(pending, descriptorBytes, { flag: "wx" }); pendingCreated = true;
    await rename(pending, join(output, "latest.json")); pendingCreated = false;
    return { descriptor, manifest, held: sources.held, extractionExceptions: sources.extractionExceptions, unchanged: false };
  } finally {
    try { if (pendingCreated) await rm(pending); }
    finally { await lock.close(); await rm(lockPath); }
  }
}
async function main() {
  if (process.argv.length !== 2) throw new Error("Publication paths are owned by settings/lyric-publication.yml");
  const settings = await lyricPublicationSettings();
  const source = resolve(root, settings.sourceDirectory), output = resolve(root, settings.outputDirectory);
  if (!within(root, source) || source === root || !within(root, output) || output === root) throw new Error("Publication paths must be inside Library");
  const result = await publishLyrics(output, source, await lyricPublicationBounds(), settings);
  console.log(JSON.stringify({ published: result.manifest.catalog.length, heldSources: result.held, extractionExceptions: result.extractionExceptions,
    manifestSha256: result.descriptor.manifest.sha256, unchanged: result.unchanged, stage: "prelaunch" }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
