import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import type { FixtureItem, Manifest, Descriptor, SearchIndex, SearchPolicy, ObjectRecord, SearchToken } from "../shared/types/publication.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function deterministicGzip(bytes: Uint8Array): Buffer {
  const encoded = gzipSync(bytes, { level: 9 });
  // The gzip OS byte must not make identical publications platform-dependent.
  encoded[9] = 255;
  return encoded;
}

export function yaml(text: string): unknown {
  return strictYaml(text);
}

export function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Only safe integer JSON numbers are supported");
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (!value.isWellFormed()) throw new Error("Ill-formed Unicode is not permitted");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (object(value)) return "{" + Object.keys(value).sort().map(key => canonical(key) + ":" + canonical(value[key])).join(",") + "}";
  throw new Error("Non-JSON value");
}

export function source(text: string): FixtureItem | null {
  const tree = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).parse(text);
  const first = tree.children[0];
  if (!first || first.type !== "yaml") throw new Error("Source requires leading YAML frontmatter");
  const metadata = yaml(first.value);
  if (!object(metadata) || metadata.sourceFormat !== 1 || !object(metadata.public) ||
      !object(metadata.provenance) || metadata.provenance.syntheticFixture !== true ||
      !object(metadata.review) || !Array.isArray(metadata.review.holdReasons) ||
      metadata.review.holdReasons.some(reason => typeof reason !== "string" || !reason)) {
    throw new Error("Invalid fixture source metadata; production ingestion is not implemented");
  }
  const blocks = tree.children.filter(node => node.type === "code");
  if (blocks.length !== 1 || blocks[0]?.lang !== "kannada") throw new Error("Require exactly one canonical Kannada fence");
  const seen = new Set<string>();
  const lines = blocks[0].value.replace(/\r\n/g, "\n").split("\n").map(line => {
    const match = /^\[([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\] (.*)$/u.exec(line);
    if (!match?.[1] || match[2] === undefined || seen.has(match[1])) throw new Error("Missing, duplicate or invalid canonical line UUID");
    seen.add(match[1]);
    return { id: match[1], text: match[2] };
  });
  const candidate = { formatVersion: 1, fixture: true, videoId: metadata.videoId,
    title: metadata.public.title,
    ...(metadata.public.description === undefined ? {} : { description: metadata.public.description }),
    tags: metadata.public.tags, lines };
  const validate = new Ajv2020.default({ strict: true }).compile<FixtureItem>(itemSchema);
  if (!validate(candidate)) throw new Error("Invalid public fixture item: " + JSON.stringify(validate.errors));
  if (metadata.review.holdReasons.length) return null;
  return candidate;
}
const itemSchema = JSON.parse(await readFile(resolve(root, "shared/schemas/fixture-item.schema.json"), "utf8"));

export const tokens = (text: string) => text.normalize("NFC").replace(/[A-Z]/g, letter => letter.toLowerCase())
  .match(/[\p{L}\p{M}\p{Nd}]+/gu) ?? [];

export function index(items: FixtureItem[], policyHash: string): SearchIndex {
  const records: SearchToken[] = [];
  for (const item of items) {
    for (const [field, text] of [["title", item.title], ["tags", item.tags.join(" ")],
      ["description", item.description ?? ""]]) {
      for (const value of tokens(text!)) records.push({ value, itemId: item.videoId, field: field! });
    }
    for (const line of item.lines) {
      for (const value of tokens(line.text)) records.push({ value, itemId: item.videoId, field: "lyrics", lineId: line.id });
    }
  }
  const postings: SearchIndex["postings"] = Object.create(null);
  records.forEach((record, tokenId) => {
    const chars = [...record.value];
    for (const length of [1, 2, 3]) {
      const counts = new Map<string, number>();
      for (let start = 0; start + length <= chars.length; start++) {
        const gram = chars.slice(start, start + length).join("");
        counts.set(gram, (counts.get(gram) ?? 0) + 1);
      }
      for (const [gram, count] of counts) (postings[`${length}:${gram}`] ??= []).push([tokenId, count]);
    }
  });
  return { formatVersion: 1, policyHash, tokens: records, postings };
}

export async function publish(output: string, sourceDirectory = resolve(root, "tests/fixtures/sources")) {
  const publication = yaml(await readFile(resolve(root, "settings/publication.yml"), "utf8"));
  if (!object(publication) || publication.fixtureOnly !== true ||
      !Array.isArray(publication.requiredCapabilities) ||
      publication.requiredCapabilities.some(value => typeof value !== "string")) throw new Error("Invalid fixture publication settings");
  const search = yaml(await readFile(resolve(root, "shared/settings/search.yml"), "utf8"));
  const searchSchema = JSON.parse(await readFile(resolve(root, "shared/schemas/search-policy.schema.json"), "utf8"));
  const validateSearch = new Ajv2020.default({ strict: true }).compile<SearchPolicy>(searchSchema);
  if (!validateSearch(search)) throw new Error("Invalid search settings: " + JSON.stringify(validateSearch.errors));
  const rawBounds = yaml(await readFile(resolve(root, "shared/settings/publication-policy.yml"), "utf8"));
  if (!object(rawBounds)) throw new Error("Invalid publication bounds");
  const bounds: Record<string, unknown> = rawBounds;
  const items: FixtureItem[] = [];
  const ids = new Set<string>();
  for (const name of (await readdir(sourceDirectory)).filter(name => name.endsWith(".md")).sort()) {
    const item = source(await readFile(resolve(sourceDirectory, name), "utf8"));
    if (!item) continue;
    if (ids.has(item.videoId)) throw new Error(`Duplicate video ID: ${item.videoId}`);
    ids.add(item.videoId);
    items.push(item);
  }
  if (!items.length) throw new Error("No publishable fixture items");
  await mkdir(resolve(output, "objects"), { recursive: true });
  const objects: Manifest["objects"] = Object.create(null);
  async function artifact(value: unknown, role: ObjectRecord["role"]) {
    const decoded = Buffer.from(canonical(value));
    const encoded = deterministicGzip(decoded);
    const label = role[0]!.toUpperCase() + role.slice(1);
    const encodedLimit = bounds[`max${label}EncodedBytes`];
    const decodedLimit = bounds[`max${label}DecodedBytes`];
    if (typeof encodedLimit !== "number" || typeof decodedLimit !== "number" ||
        encoded.length > encodedLimit || decoded.length > decodedLimit) throw new Error(`Artifact exceeds ${role} bounds`);
    const digest = hash(encoded);
    const path = `objects/${digest}.json.gz`;
    await writeFile(resolve(output, path), encoded);
    objects[digest] = { role, path, encodedBytes: encoded.length, decodedBytes: decoded.length };
    return digest;
  }
  const policyHash = await artifact(search, "policy");
  const indexHash = await artifact(index(items, policyHash), "index");
  const itemMap: Record<string, string> = Object.create(null);
  for (const item of items) itemMap[item.videoId] = await artifact(item, "item");
  const manifest: Manifest = { formatVersion: 1, fixture: true,
    requiredCapabilities: publication.requiredCapabilities, objects, items: itemMap,
    named: { index: indexHash, policy: policyHash },
    catalog: items.map(({ videoId, title, description, tags }) => ({
      videoId, title, ...(description === undefined ? {} : { description }), tags })) };
  const decoded = Buffer.from(canonical(manifest));
  const encoded = deterministicGzip(decoded);
  if (typeof bounds.maxManifestEncodedBytes !== "number" || typeof bounds.maxManifestDecodedBytes !== "number" ||
      encoded.length > bounds.maxManifestEncodedBytes || decoded.length > bounds.maxManifestDecodedBytes) throw new Error("Manifest exceeds bounds");
  const digest = hash(encoded);
  const path = `objects/${digest}.json.gz`;
  await writeFile(resolve(output, path), encoded);
  const descriptor: Descriptor = { formatVersion: 1, fixture: true,
    manifest: { path, sha256: digest, encodedBytes: encoded.length, decodedBytes: decoded.length } };
  const descriptorBytes = canonical(descriptor);
  if (typeof bounds.maxDescriptorBytes !== "number" || Buffer.byteLength(descriptorBytes) > bounds.maxDescriptorBytes) throw new Error("Descriptor exceeds bounds");
  await writeFile(resolve(output, "latest.pending.json"), descriptorBytes + "\n");
  await rename(resolve(output, "latest.pending.json"), resolve(output, "latest.json"));
  return { descriptor, manifest, items };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--fixtures")) throw new Error("Only explicitly labeled fixture publication is available");
  const position = process.argv.indexOf("--out");
  const config = yaml(await readFile(resolve(root, "settings/publication.yml"), "utf8"));
  if (!object(config) || typeof config.outputDirectory !== "string" || typeof config.sourceDirectory !== "string") throw new Error("Missing publication paths");
  const output = position >= 0 ? process.argv[position + 1] : resolve(root, config.outputDirectory);
  if (!output) throw new Error("--out requires a path");
  const result = await publish(resolve(output), resolve(root, config.sourceDirectory));
  console.log(`Published ${result.items.length} synthetic fixtures; manifest ${result.descriptor.manifest.sha256}`);
}
