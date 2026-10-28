import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { stringify } from "yaml";
import { readCanonicalSources } from "./canonical-sources.js";
import { stageCanonicalSnapshot, hostingSettings } from "./hosted-preflight.js";
import { parseLyricSource, type DraftHeader } from "./lyric-source.js";
import { publishLyrics, lyricPublicationBounds } from "./lyric-publisher.js";
import { emptyPublicationLedger, publicationLedgerFingerprint as fingerprint } from "./publication-ledger.js";
import { canonical } from "./publisher.js";
import { importSources } from "./source-import.js";
import { prepareCanonicalSnapshot, prepareCanonicalSourceSnapshot, readSnapshotSettings, reserveCanonicalSnapshot } from "./snapshot-producer.js";

const safety = { maxSourceFileBytes: 8388608, maxTotalSourceBytes: 67108864 };
const { policy, bounds } = await readSnapshotSettings(), hosting = await hostingSettings();
const input = { publishedAt: "2026-01-01T00:00:00.000Z", sourceCommit: "c".repeat(40) };
async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "daasavaani-canonical-sources-"));
  t.after(() => rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 }));
  const originals = join(root, "originals"), sources = join(root, "sources");
  await mkdir(originals);
  await writeFile(join(originals, "permitted.txt"), "ಕನ್ನಡ  \n \t \nಅಕ್ಷರ\n\nkannaDa\n");
  await writeFile(join(originals, "held.txt"), "ಅಕ್ಷರ\n");
  await writeFile(join(originals, "exception.txt"), "Synthetic Latin without initial Kannada\n");
  await importSources(originals, sources, { ...safety, reviewHoldReason: "source-import-review" });
  const names = (await readdir(sources)).filter(name => name.endsWith(".md"));
  const records = await Promise.all(names.map(async name => {
    const path = join(sources, name), text = await readFile(path, "utf8"), parsed = parseLyricSource(text);
    return { path, text, parsed };
  }));
  const permitted = records.find(record => record.parsed.header.provenance.sourceFile === "permitted.txt")!;
  const held = records.find(record => record.parsed.header.provenance.sourceFile === "held.txt")!;
  const released = permitted.text.replace("holdReasons:\n    - source-import-review", "holdReasons: []");
  assert.notEqual(released, permitted.text);
  await writeFile(permitted.path, released);
  async function edit(change: (header: DraftHeader) => void) {
    const header = structuredClone(parseLyricSource(released).header);
    change(header);
    const text = `---\n${stringify(header)}---` + released.slice(released.indexOf("\n---", 4) + 4);
    await writeFile(permitted.path, text);
  }
  const state = emptyPublicationLedger();
  return { root, originals, sources, permitted, held, released, edit, state,
    prepare: () => prepareCanonicalSourceSnapshot(sources, safety, state, fingerprint(state), input, policy, bounds) };
}
async function inventory(directory: string): Promise<Map<string, Buffer>> {
  return new Map(await Promise.all((await readdir(directory)).map(async name => [name, await readFile(join(directory, name))] as const)));
}

test("one receipt-bound projection preserves exact public text/layout/UUIDs and keeps holds/exceptions separate without writes", async t => {
  const fixture = await setup(t), before = await inventory(fixture.sources), originals = await inventory(fixture.originals);
  const result = await readCanonicalSources(fixture.sources, safety), source = parseLyricSource(fixture.released);
  assert.equal(result.held, 1);
  assert.equal(result.extractionExceptions, 1);
  assert.deepEqual(result.items, [{
    format: "daasavaani-lyric", formatVersion: 1, lyricId: source.header.lyricId,
    canonicalScript: "kn", title: source.header.public.title, tags: source.header.public.tags,
    lines: source.canonical.map(line => "id" in line ? { kind: "line", lineId: line.id, text: line.text } : { kind: "layout", text: line.text })
  }]);
  assert.deepEqual(await inventory(fixture.sources), before);
  assert.deepEqual(await inventory(fixture.originals), originals);
  result.items[0]!.tags.push("caller mutation");
  assert.deepEqual((await readCanonicalSources(fixture.sources, safety)).items[0]!.tags, []);
});

test("source adapter equals direct canonical preparation and stages only exact verified public artifacts", async t => {
  const fixture = await setup(t), before = await inventory(fixture.sources), stateBefore = structuredClone(fixture.state);
  const result = await fixture.prepare(), loaded = await readCanonicalSources(fixture.sources, safety);
  const direct = prepareCanonicalSnapshot(fixture.state, fingerprint(fixture.state), { ...input, items: loaded.items }, policy, bounds);
  assert.deepEqual(result.prepared, direct);
  assert.equal(result.held, 1);
  assert.equal(result.extractionExceptions, 1);
  const reserved = reserveCanonicalSnapshot(fixture.state, fingerprint(fixture.state), result.prepared, bounds).state;
  const site = join(fixture.root, "candidate"), snapshots = join(site, "snapshots");
  const report = await stageCanonicalSnapshot(site, snapshots, reserved, fingerprint(reserved), result.prepared, bounds, hosting);
  assert.equal(report.manifestSha256, result.prepared.manifest.sha256);
  for (const [path, bytes] of result.prepared.artifacts) {
    assert.deepEqual(await readFile(join(snapshots, ...path.split("/"))), bytes);
    if (path.endsWith(".json.gz")) {
      const text = gunzipSync(bytes).toString("utf8");
      for (const privateField of ["sourceFile", "sourceLatin", "provenance", "holdReasons", "exception.txt", "permitted.txt"]) {
        assert.equal(text.includes(privateField), false);
      }
    }
  }
  assert.deepEqual(fixture.state, stateBefore);
  assert.deepEqual(await inventory(fixture.sources), before);
});

test("existing prelaunch publication consumes identical canonical item bytes and unchanged independent format/hold accounting", async t => {
  const fixture = await setup(t), loaded = await readCanonicalSources(fixture.sources, safety);
  const output = join(fixture.root, "prelaunch");
  const published = await publishLyrics(output, fixture.sources, await lyricPublicationBounds(), safety);
  assert.equal(published.held, 1);
  assert.equal(published.extractionExceptions, 1);
  assert.equal(published.manifest.stage, "prelaunch");
  const reference = published.manifest.catalog[0]!.item;
  assert.deepEqual(gunzipSync(await readFile(join(output, ...reference.path.split("/")))), Buffer.from(canonical(loaded.items[0])));
  assert.equal((await publishLyrics(output, fixture.sources, await lyricPublicationBounds(), safety)).unchanged, true);
});

test("each unsupported populated classification/context/verse/media/eligible Source Latin is refused by both callers", async t => {
  const fixture = await setup(t), source = parseLyricSource(fixture.released);
  const lineIds = source.canonical.flatMap(line => "id" in line ? [line.id] : []), last = lineIds.at(-1)!;
  const changes: ((header: DraftHeader) => void)[] = [
    header => { header.public.contextDescription = "Synthetic context"; },
    header => { header.public.verses = [{ id: "30000000-0000-4000-8000-000000000001", endsAt: last }]; },
    header => { header.public.youtube = [{ videoId: "00000000000", url: "" }]; },
    header => { header.public.images = [{ asset: "assets/synthetic.webp", alt: "Synthetic" }]; },
    header => { header.review.sourceLatin = { readable: true, searchable: null, alignment: [] }; },
    header => { header.review.sourceLatin = { readable: true, searchable: true,
      alignment: lineIds.map((lineId, index) => ({ lineId, ranges: [[index, index + 1]] })) }; },
  ];
  for (const key of ["composerIds", "ankitaIds", "deityIds", "formIds", "categoryIds", "contextIds"] as const) {
    changes.push(header => { header.public.classification![key] = ["synthetic"]; });
  }
  for (const change of changes) {
    await fixture.edit(change);
    const before = await inventory(fixture.sources);
    await assert.rejects(fixture.prepare(), /must not silently discard/);
    await assert.rejects(publishLyrics(join(fixture.root, "output"), fixture.sources, await lyricPublicationBounds(), safety), /must not silently discard/);
    assert.deepEqual(await inventory(fixture.sources), before);
  }
});

test("null/false Source Latin eligibility and source-only evidence do not imply publication or new capabilities", async t => {
  const fixture = await setup(t);
  for (const value of [null, false]) {
    await fixture.edit(header => {
      header.review.sourceLatin = { readable: value, searchable: value, alignment: [] };
      header.provenance.description = "Synthetic source-only evidence";
      header.provenance.rights = { license: "Synthetic assertion, not rights approval", attribution: "Synthetic", evidenceUrls: [] };
    });
    const loaded = await readCanonicalSources(fixture.sources, safety), result = await fixture.prepare();
    assert.equal(loaded.items.length, 1);
    assert.equal(JSON.stringify(loaded.items).includes("Synthetic source-only"), false);
    assert.equal(result.prepared.plan.logicalProjection, "canonical-prelaunch-v1");
  }
});

test("held records remain fully validated and all-held inputs cannot become a successful empty publication", async t => {
  const fixture = await setup(t);
  await fixture.edit(header => { header.review.holdReasons = ["separate-review"]; });
  await assert.rejects(fixture.prepare(), /No unheld/);
  await writeFile(fixture.held.path, fixture.held.text.replace("sourceFormat: 2", "sourceFormat: 99"));
  await assert.rejects(fixture.prepare(), /Invalid draft header/);
});

test("receipt identity/provenance, active import lock and unexpected source entries fail explicitly without source writes", async t => {
  const fixture = await setup(t), receipt = join(fixture.sources, ".source-import.json"), original = await readFile(receipt);
  await fixture.edit(header => { header.provenance.sha256 = "e".repeat(64); });
  await assert.rejects(fixture.prepare(), /disagrees/);
  await writeFile(fixture.permitted.path, fixture.released);
  await writeFile(`${fixture.sources}.import.lock`, "synthetic active import");
  await assert.rejects(fixture.prepare(), /import is active/);
  await rm(`${fixture.sources}.import.lock`);
  await writeFile(join(fixture.sources, "private.txt"), "Synthetic unexpected file");
  await assert.rejects(fixture.prepare(), /Unexpected/);
  await rm(join(fixture.sources, "private.txt"));
  await writeFile(receipt, "{}");
  await assert.rejects(fixture.prepare(), /receipt/);
  await writeFile(receipt, original);
  assert.equal((await fixture.prepare()).held, 1);
});

test("source byte ceilings admit exact complete inventory and reject one below including the receipt", async t => {
  const fixture = await setup(t), files = await inventory(fixture.sources);
  const sizes = [...files.values()].map(bytes => bytes.length), maximum = Math.max(...sizes), total = sizes.reduce((a, b) => a + b, 0);
  assert.equal((await readCanonicalSources(fixture.sources, { maxSourceFileBytes: maximum, maxTotalSourceBytes: total })).items.length, 1);
  await assert.rejects(readCanonicalSources(fixture.sources, { maxSourceFileBytes: maximum - 1, maxTotalSourceBytes: total }), /byte limit/);
  await assert.rejects(readCanonicalSources(fixture.sources, { maxSourceFileBytes: maximum, maxTotalSourceBytes: total - 1 }), /byte limit/);
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(readCanonicalSources(fixture.sources, { ...safety, maxSourceFileBytes: value }), /bound/);
  }
});

test("source directory and member junctions are refused instead of being followed", async t => {
  const fixture = await setup(t), target = join(fixture.root, "retired");
  await rename(fixture.sources, target);
  await symlink(target, fixture.sources, "junction");
  await assert.rejects(fixture.prepare(), /regular directory/);
  await rm(fixture.sources);
  await rename(target, fixture.sources);
  await mkdir(join(fixture.sources, "unexpected"));
  await assert.rejects(fixture.prepare(), /Unexpected/);
  await rm(join(fixture.sources, "unexpected"), { recursive: true });
  const memberTarget = join(fixture.root, "member-target");
  await mkdir(memberTarget);
  await symlink(memberTarget, join(fixture.sources, "30000000-0000-4000-8000-000000000001.md"), "junction");
  await assert.rejects(fixture.prepare(), /Unexpected/);
});

test("adapter captures caller ledger/date/policy/bounds before awaits and never accepts item injection or stale state", async t => {
  const fixture = await setup(t), state = structuredClone(fixture.state), dates = { ...input };
  const copiedPolicy = structuredClone(policy), copiedBounds = { ...bounds }, sourceBounds = { ...safety };
  const preparing = prepareCanonicalSourceSnapshot(fixture.sources, sourceBounds, state, fingerprint(state), dates, copiedPolicy, copiedBounds);
  state.lastSequence++;
  dates.sourceCommit = "e".repeat(40);
  copiedPolicy.transferPlanning.maxBundleMembers = 0;
  copiedBounds.maxItemEncodedBytes = 0;
  sourceBounds.maxTotalSourceBytes = 0;
  assert.equal((await preparing).prepared.plan.sourceCommit, input.sourceCommit);
  await assert.rejects(prepareCanonicalSourceSnapshot(fixture.sources, safety, fixture.state, "0".repeat(64), input, policy, bounds), /Stale/);
  const injected = { ...input, items: [] };
  await assert.rejects(prepareCanonicalSourceSnapshot(fixture.sources, safety, fixture.state, fingerprint(fixture.state),
    injected, policy, bounds), /Invalid source snapshot preparation input/);
});
