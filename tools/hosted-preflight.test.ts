import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import type { LyricItem, LyricManifest, LyricObjectReference } from "../shared/types/lyrics.js";
import { hostingByteLimit, hostingSettings, preflightHostedLyrics, type HostingPolicy } from "./hosted-preflight.js";
import { lyricPublicationBounds, publishLyrics } from "./lyric-publisher.js";
import { importSources } from "./source-import.js";
import { canonical, deterministicGzip, yaml } from "./publisher.js";

const policy: HostingPolicy = { maxHostedBytes: 1000000000, maxUtilizationPercent: 80 };
const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const item: LyricItem = { format: "daasavaani-lyric", formatVersion: 1, lyricId: first, canonicalScript: "kn",
  title: "Synthetic hosting record", tags: ["synthetic"], lines: [
    { kind: "line", lineId: second, text: "Synthetic permitted fixture text" }, { kind: "layout", text: "" }
  ] };
const manifest = (reference: LyricObjectReference, value = item): LyricManifest => ({
  format: "daasavaani-lyric-catalog", formatVersion: 1, stage: "prelaunch", requiredCapabilities: ["lyric-preview-v1"],
  catalog: [{ lyricId: value.lyricId, title: value.title, tags: value.tags, item: reference }]
});
async function temporary(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "daasavaani-hosted-"));
  t.after(() => rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 }));
  return root;
}
async function setup(t: TestContext) {
  const root = await temporary(t), site = join(root, "site"), lyrics = join(site, "lyrics");
  await mkdir(join(lyrics, "objects"), { recursive: true });
  async function put(value: unknown, encoded = deterministicGzip(Buffer.from(canonical(value)))) {
    const sha256 = hash(encoded), path = `objects/${sha256}.json.gz`;
    await writeFile(join(lyrics, path), encoded);
    return { sha256, path, encodedBytes: encoded.length, decodedBytes: Buffer.byteLength(canonical(value)) };
  }
  async function activate(value: unknown) {
    const reference = await put(value);
    await writeFile(join(lyrics, "latest.json"), canonical({ format: "daasavaani-lyrics", formatVersion: 1, manifest: reference }) + "\n");
    return reference;
  }
  const itemReference = await put(item), catalog = manifest(itemReference), manifestReference = await activate(catalog);
  const bounds = await lyricPublicationBounds();
  return { root, site, lyrics, put, activate, itemReference, manifestReference, catalog, bounds,
    check: (limits = bounds, hosting = policy) => preflightHostedLyrics(site, lyrics, limits, hosting) };
}
async function inventory(root: string, prefix = ""): Promise<[string, Buffer][]> {
  const result: [string, Buffer][] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name), name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await inventory(path, name + "/"));
    else result.push([name, await readFile(path)]);
  }
  return result.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}

test("owning settings implement exact decimal host/headroom policy with integer floor and strict shape", async () => {
  const settings = await hostingSettings();
  assert.deepEqual(settings, { formatVersion: 1, siteDirectory: "dist/site", ...policy });
  assert.equal(hostingByteLimit(settings), 800000000);
  assert.equal(hostingByteLimit({ maxHostedBytes: 9, maxUtilizationPercent: 80 }), 7);
  assert.equal(hostingByteLimit({ maxHostedBytes: Number.MAX_SAFE_INTEGER, maxUtilizationPercent: 80 }), 7205759403792792);
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    assert.throws(() => hostingByteLimit({ ...policy, maxHostedBytes: value }), /policy/);
    assert.throws(() => hostingByteLimit({ ...policy, maxUtilizationPercent: value }), /policy/);
  }
  assert.throws(() => hostingByteLimit({ ...policy, maxUtilizationPercent: 101 }), /policy/);
  const schema = JSON.parse(await readFile(new URL("../settings/hosting.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020.default({ strict: true }).compile(schema);
  for (const changes of [{ extra: true }, { formatVersion: 2 }, { siteDirectory: "dist/../library" },
    { siteDirectory: "../private" }, { maxUtilizationPercent: 101 }, { maxHostedBytes: 0 }]) {
    assert.equal(validate({ ...settings, ...changes }), false);
  }
});

test("complete actual inventory includes retained unreferenced objects/catalogs and is read-only at exact byte/+1 headroom", async t => {
  const fixture = await setup(t);
  const other = { ...item, lyricId: second, title: "Synthetic retained record" };
  const orphan = await fixture.put(other);
  await fixture.put(manifest(orphan, other));
  const before = await inventory(fixture.site), bytes = before.reduce((sum, [, value]) => sum + value.length, 0);
  const exact = { maxHostedBytes: Math.ceil(bytes * 100 / 80), maxUtilizationPercent: 80 };
  const below = { ...exact, maxHostedBytes: Math.ceil((bytes - 1) * 100 / 80) };
  assert.equal(hostingByteLimit(exact), bytes);
  assert.equal(hostingByteLimit(below), bytes - 1);
  assert.deepEqual(await fixture.check(fixture.bounds, exact), {
    stage: "prelaunch", fileCount: 5, objectCount: 4, catalogItems: 1, totalHostedBytes: bytes,
    headroomLimitBytes: bytes, manifestSha256: fixture.manifestReference.sha256
  });
  await assert.rejects(fixture.check(fixture.bounds, below), /headroom/);
  assert.deepEqual(await inventory(fixture.site), before);
});

test("the actual canonical publisher's synthetic output passes without publishing sources or touching their bytes", async t => {
  const root = await temporary(t), originals = join(root, "originals"), sources = join(root, "sources");
  const site = join(root, "site"), lyrics = join(site, "lyrics");
  await mkdir(originals);
  await writeFile(join(originals, "permitted.txt"), "ಕನ್ನಡ\n");
  const safety = { maxSourceFileBytes: 8388608, maxTotalSourceBytes: 67108864 };
  await importSources(originals, sources, { ...safety, reviewHoldReason: "source-import-review" });
  const filename = (await readdir(sources)).find(name => name.endsWith(".md"));
  assert.ok(filename);
  const path = join(sources, filename), held = await readFile(path, "utf8");
  const approved = held.replace("holdReasons:\n    - source-import-review", "holdReasons: []");
  assert.notEqual(approved, held);
  await writeFile(path, approved);
  const bounds = await lyricPublicationBounds(), result = await publishLyrics(lyrics, sources, bounds, safety);
  const before = await inventory(sources), report = await preflightHostedLyrics(site, lyrics, bounds, policy);
  assert.equal(report.catalogItems, result.manifest.catalog.length);
  assert.equal(report.manifestSha256, result.descriptor.manifest.sha256);
  assert.equal(report.fileCount, 3);
  assert.equal(report.totalHostedBytes, (await inventory(site)).reduce((sum, [, bytes]) => sum + bytes.length, 0));
  assert.deepEqual(await inventory(sources), before);
});

test("explicit nested lyric layout is supported without hard-coded root or lyric directory names", async t => {
  const fixture = await setup(t), nested = join(fixture.site, "data", "canonical");
  await mkdir(join(fixture.site, "data"));
  await rename(fixture.lyrics, nested);
  const report = await preflightHostedLyrics(fixture.site, nested, fixture.bounds, policy);
  assert.equal(report.fileCount, 3);
  assert.equal(report.manifestSha256, fixture.manifestReference.sha256);
  assert.equal(report.totalHostedBytes, (await inventory(fixture.site)).reduce((sum, [, bytes]) => sum + bytes.length, 0));
});

test("post-merge workflow gates upload on preflight and consumes only its validated root output", async () => {
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
  const workflow = yaml(await readFile(new URL("../.github/workflows/publish-lyrics.yml", import.meta.url), "utf8"));
  assert.ok(object(workflow) && object(workflow.jobs) && object(workflow.jobs.build) && Array.isArray(workflow.jobs.build.steps));
  const steps: unknown[] = workflow.jobs.build.steps;
  const generate = steps.findIndex(step => object(step) && step.run === "npm run publish:lyrics");
  const preflight = steps.findIndex(step => object(step) && step.id === "preflight");
  const upload = steps.findIndex(step => object(step) && typeof step.uses === "string" && step.uses.startsWith("actions/upload-pages-artifact@"));
  assert.ok(generate >= 0 && preflight > generate && upload > preflight);
  const gate = steps[preflight], artifact = steps[upload];
  assert.ok(object(gate) && object(artifact) && object(artifact.with));
  assert.equal(gate.run, "npm run publication:preflight");
  assert.equal(gate["continue-on-error"], undefined);
  assert.equal(gate.if, undefined);
  assert.equal(artifact.with.path, "${{ steps.preflight.outputs.site-directory }}");
});

test("actual descriptor/item/manifest encoded and decoded bounds accept equality and reject one byte below", async t => {
  const fixture = await setup(t), descriptorBytes = (await readFile(join(fixture.lyrics, "latest.json"))).length;
  const exact = { maxDescriptorBytes: descriptorBytes, maxItemEncodedBytes: fixture.itemReference.encodedBytes,
    maxItemDecodedBytes: fixture.itemReference.decodedBytes, maxManifestEncodedBytes: fixture.manifestReference.encodedBytes,
    maxManifestDecodedBytes: fixture.manifestReference.decodedBytes };
  assert.equal((await fixture.check(exact)).fileCount, 3);
  for (const key of Object.keys(exact) as (keyof typeof exact)[]) {
    await assert.rejects(fixture.check({ ...exact, [key]: exact[key] - 1 }));
    await assert.rejects(fixture.check({ ...exact, [key]: 0 }), /bounds/);
  }
});

test("descriptor canonical bytes, supported schema and exact manifest binding are mandatory", async t => {
  for (const variant of ["missing", "no-lf", "crlf", "spaces", "future", "missing-object", "wrong-path", "encoded", "decoded"]) {
    const fixture = await setup(t), path = join(fixture.lyrics, "latest.json");
    const value = { format: "daasavaani-lyrics", formatVersion: 1, manifest: { ...fixture.manifestReference } };
    let suffix = "\n";
    if (variant === "missing") { await rm(path); await assert.rejects(fixture.check(), /missing/); continue; }
    if (variant === "no-lf") suffix = "";
    if (variant === "crlf") suffix = "\r\n";
    if (variant === "future") value.formatVersion = 2;
    if (variant === "missing-object") value.manifest.sha256 = "a".repeat(64);
    if (variant === "wrong-path") value.manifest.path = `objects/${"a".repeat(64)}.json.gz`;
    if (variant === "encoded") value.manifest.encodedBytes++;
    if (variant === "decoded") value.manifest.decodedBytes++;
    await writeFile(path, (variant === "spaces" ? JSON.stringify(value, null, 2) : canonical(value)) + suffix);
    await assert.rejects(fixture.check(), Error, variant);
  }
});

test("every retained object is validated, including orphan corruption, noncanonical JSON and non-profile/trailing gzip", async t => {
  for (const variant of ["corrupt", "orphan-raw", "private-field", "future", "noncanonical", "trailing", "recompressed", "bad-catalog"]) {
    const fixture = await setup(t);
    if (variant === "corrupt") await writeFile(join(fixture.lyrics, fixture.itemReference.path), "damaged");
    if (variant === "orphan-raw") await fixture.put({}, Buffer.from("not gzip"));
    if (variant === "private-field") await fixture.put({ ...item, sourceFile: "never-public.txt" });
    if (variant === "future") await fixture.put({ ...item, formatVersion: 2 });
    if (variant === "noncanonical") await fixture.put(item, deterministicGzip(Buffer.from(JSON.stringify(item))));
    if (variant === "trailing") await fixture.put(item, Buffer.concat([deterministicGzip(Buffer.from(canonical(item))), Buffer.from([0])]));
    if (variant === "recompressed") await fixture.put(item, gzipSync(Buffer.from(canonical(item)), { level: 0 }));
    if (variant === "bad-catalog") await fixture.put({ ...fixture.catalog, requiredCapabilities: ["unknown"] });
    await assert.rejects(fixture.check(), Error, variant);
  }
});

test("all current and retained catalog references bind role, exact sizes, identity, title and ordered tags", async t => {
  for (const variant of ["missing-item", "role", "path", "encoded", "decoded", "identity", "title", "tags", "duplicate"]) {
    const fixture = await setup(t), catalog = structuredClone(fixture.catalog), entry = catalog.catalog[0]!;
    if (variant === "missing-item") await rm(join(fixture.lyrics, fixture.itemReference.path));
    if (variant === "role") entry.item = fixture.manifestReference;
    if (variant === "path") entry.item.path = `objects/${"a".repeat(64)}.json.gz`;
    if (variant === "encoded") entry.item.encodedBytes++;
    if (variant === "decoded") entry.item.decodedBytes++;
    if (variant === "identity") entry.lyricId = second;
    if (variant === "title") entry.title += " changed";
    if (variant === "tags") entry.tags = ["different"];
    if (variant === "duplicate") catalog.catalog.push(structuredClone(entry));
    // This catalog is not the current descriptor's manifest.
    await fixture.put(catalog);
    await assert.rejects(fixture.check(), Error, variant);
  }
});

test("whole-site allowlist rejects source/hidden/temporary/media/bundle files and unknown directories", async t => {
  for (const name of ["private.md", ".nojekyll", "lyrics.publish.lock", "lyrics/.source-import.json",
    "lyrics/latest.pending", `lyrics/objects/${"a".repeat(64)}.zip`, `lyrics/objects/${"A".repeat(64)}.json.gz`]) {
    const fixture = await setup(t);
    await writeFile(join(fixture.site, name), "not public output");
    await assert.rejects(fixture.check(), /Unexpected hosted file/, name);
  }
  const fixture = await setup(t);
  await mkdir(join(fixture.site, "images"));
  await assert.rejects(fixture.check(), /Unexpected hosted directory/);
});

test("site, lyric and object directory links cannot escape inventory or produce a success-shaped result", async t => {
  for (const directory of ["site", "lyrics", "objects"]) {
    const fixture = await setup(t);
    const path = directory === "site" ? fixture.site : directory === "lyrics" ? fixture.lyrics : join(fixture.lyrics, "objects");
    const target = join(fixture.root, "retired");
    await rename(path, target);
    await symlink(target, path, "junction");
    await assert.rejects(fixture.check(), /regular directory|links/);
  }
});

test("missing/empty roots and invalid path/bounds/policy fail explicitly", async t => {
  const fixture = await setup(t);
  for (const lyrics of [fixture.site, join(fixture.root, "outside")]) {
    await assert.rejects(preflightHostedLyrics(fixture.site, lyrics, fixture.bounds, policy), /strictly inside/);
  }
  await assert.rejects(preflightHostedLyrics("relative", fixture.lyrics, fixture.bounds, policy), /absolute/);
  await assert.rejects(fixture.check(fixture.bounds, { ...policy, maxHostedBytes: 0 }), /policy/);
  const empty = join(fixture.root, "empty");
  await mkdir(empty);
  await assert.rejects(preflightHostedLyrics(empty, join(empty, "lyrics"), fixture.bounds, policy), /missing/);
  await assert.rejects(preflightHostedLyrics(join(empty, "absent"), join(empty, "absent", "lyrics"), fixture.bounds, policy), /ENOENT/);
});
