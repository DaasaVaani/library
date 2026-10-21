import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { importSources } from "./source-import.js";
import { parseLyricSource } from "./lyric-source.js";
import { publishLyrics, lyricPublicationBounds, lyricPublicationSettings } from "./lyric-publisher.js";

const safety = { maxSourceFileBytes: 8388608, maxTotalSourceBytes: 67108864 };
async function setup(run: (root: string, sources: string, output: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "daasavaani-lyrics-"));
  try {
    const originals = join(root, "originals"), sources = join(root, "sources"), output = join(root, "published");
    await mkdir(originals);
    await writeFile(join(originals, "permitted.txt"), "ಕನ್ನಡ  \n \t \nಅಕ್ಷರ\n\nkannaDa\n");
    await writeFile(join(originals, "held.txt"), "ಅಕ್ಷರ\n");
    await importSources(originals, sources, { ...safety, reviewHoldReason: "source-import-review" });
    await run(root, sources, output);
  } finally { await rm(root, { recursive: true }); }
}
async function release(sources: string) {
  const candidates = await Promise.all((await readdir(sources)).filter(name => name.endsWith(".md")).map(async name => {
    const path = join(sources, name), text = await readFile(path, "utf8");
    return { path, text, parsed: parseLyricSource(text) };
  }));
  const candidate = candidates.find(value => value.parsed.header.provenance.sourceFile === "permitted.txt");
  assert.ok(candidate);
  const { path, text } = candidate;
  const released = text.replace("holdReasons:\n    - source-import-review", "holdReasons: []");
  assert.notEqual(released, text);
  await writeFile(path, released);
  return { path, parsed: parseLyricSource(released) };
}
test("real lyric publication requires explicit hold release and never uses fixture/video identities or leaks supplied Latin/provenance", async () => {
  await setup(async (_root, sources, output) => {
    const bounds = await lyricPublicationBounds();
    await assert.rejects(publishLyrics(output, sources, bounds, safety), /No unheld/);
    const { parsed } = await release(sources);
    const result = await publishLyrics(output, sources, bounds, safety);
    assert.equal(result.held, 1);
    assert.equal(result.manifest.catalog.length, 1);
    assert.equal(result.manifest.stage, "prelaunch");
    assert.deepEqual(result.manifest.requiredCapabilities, ["lyric-preview-v1"]);
    const summary = result.manifest.catalog[0]; assert.ok(summary);
    assert.equal(summary.lyricId, parsed.header.lyricId);
    const encoded = await readFile(join(output, summary.item.path));
    assert.equal(createHash("sha256").update(encoded).digest("hex"), summary.item.sha256);
    assert.equal(encoded.length, summary.item.encodedBytes);
    const decoded = gunzipSync(encoded); assert.equal(decoded.length, summary.item.decodedBytes);
    const item = JSON.parse(decoded.toString("utf8"));
    assert.deepEqual(Object.keys(item).sort(), ["canonicalScript", "format", "formatVersion", "lines", "lyricId", "tags", "title"]);
    assert.deepEqual(item.lines.map((line: { text: string }) => line.text), parsed.canonical.map(line => line.text));
    assert.deepEqual(item.lines.filter((line: { kind: string }) => line.kind === "line").map((line: { lineId: string }) => line.lineId),
      parsed.canonical.flatMap(line => "id" in line ? [line.id] : []));
    const manifestBytes = await readFile(join(output, result.descriptor.manifest.path));
    assert.equal(createHash("sha256").update(manifestBytes).digest("hex"), result.descriptor.manifest.sha256);
    assert.deepEqual(JSON.parse(gunzipSync(manifestBytes).toString("utf8")), result.manifest);
    assert.equal(JSON.stringify(result.manifest).includes("sourceFile"), false);
  });
});
test("identical publication is byte stable/no-write and every failed validation preserves the previous descriptor", async () => {
  await setup(async (_root, sources, output) => {
    const { path } = await release(sources), bounds = await lyricPublicationBounds();
    const first = await publishLyrics(output, sources, bounds, safety);
    const pointer = join(output, "latest.json"), before = await readFile(pointer), timestamp = (await stat(pointer)).mtimeMs;
    const second = await publishLyrics(output, sources, bounds, safety);
    assert.equal(second.unchanged, true); assert.deepEqual(second.descriptor, first.descriptor);
    assert.equal((await stat(pointer)).mtimeMs, timestamp);
    const valid = await readFile(path, "utf8");
    await writeFile(path, valid.replace("holdReasons: []", "holdReasons:\n    - other-review"));
    await assert.rejects(publishLyrics(output, sources, bounds, safety), /No unheld/);
    assert.deepEqual(await readFile(pointer), before);
    await writeFile(path, valid.replace("sourceFormat: 2", "sourceFormat: 9"));
    await assert.rejects(publishLyrics(output, sources, bounds, safety), /Invalid draft header/);
    assert.deepEqual(await readFile(pointer), before);
    await writeFile(path, valid);
    const summary = first.manifest.catalog[0]; assert.ok(summary);
    await writeFile(join(output, summary.item.path), "damaged");
    await assert.rejects(publishLyrics(output, sources, bounds, safety), /object is damaged/);
    assert.deepEqual(await readFile(pointer), before);
  });
});
test("exact artifact byte ceilings accept the boundary and reject one byte below before activation", async () => {
  await setup(async (_root, sources, output) => {
    await release(sources); const bounds = await lyricPublicationBounds();
    const first = await publishLyrics(output, sources, bounds, safety);
    const summary = first.manifest.catalog[0]; assert.ok(summary);
    const limits = { ...bounds, maxDescriptorBytes: (await readFile(join(output, "latest.json"))).length,
      maxManifestEncodedBytes: first.descriptor.manifest.encodedBytes, maxManifestDecodedBytes: first.descriptor.manifest.decodedBytes,
      maxItemEncodedBytes: summary.item.encodedBytes, maxItemDecodedBytes: summary.item.decodedBytes };
    assert.equal((await publishLyrics(output, sources, limits, safety)).unchanged, true);
    const before = await readFile(join(output, "latest.json"));
    for (const key of ["maxDescriptorBytes", "maxManifestEncodedBytes", "maxManifestDecodedBytes", "maxItemEncodedBytes", "maxItemDecodedBytes"] as const) {
      await assert.rejects(publishLyrics(output, sources, { ...limits, [key]: limits[key] - 1 }, safety), /bounds/);
      assert.deepEqual(await readFile(join(output, "latest.json")), before);
    }
  });
});
test("invalid source/output, byte settings and existing publication locks fail explicitly without writing sources", async () => {
  await setup(async (root, sources, output) => {
    await release(sources); const bounds = await lyricPublicationBounds();
    await assert.rejects(publishLyrics(sources, sources, bounds, safety), /overwrite/);
    await assert.rejects(publishLyrics(output, sources, bounds, { ...safety, maxSourceFileBytes: 1 }), /byte limit/);
    await assert.rejects(publishLyrics(output, sources, { ...bounds, maxDescriptorBytes: 0 }, safety), /Invalid publication bound/);
    await writeFile(`${output}.publish.lock`, "another operation");
    await assert.rejects(publishLyrics(output, sources, bounds, safety), { code: "EEXIST" });
    assert.equal(await readFile(`${output}.publish.lock`, "utf8"), "another operation");
    assert.equal((await readdir(root)).includes("published"), false);
    const settings = await lyricPublicationSettings();
    assert.equal(settings.stage, "prelaunch"); assert.equal(settings.requiredCapability, "lyric-preview-v1");
  });
});
