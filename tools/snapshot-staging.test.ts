import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { LyricItem } from "../shared/types/lyrics.js";
import { hostingByteLimit, hostingSettings, stageCanonicalSnapshot } from "./hosted-preflight.js";
import { emptyPublicationLedger, publicationLedgerFingerprint as fingerprint } from "./publication-ledger.js";
import { canonical } from "./publisher.js";
import { prepareCanonicalSnapshot, readSnapshotSettings, reserveCanonicalSnapshot } from "./snapshot-producer.js";
import { decodeZipStore } from "./zip-store.js";

const { policy, bounds } = await readSnapshotSettings(), hosting = await hostingSettings();
const items: LyricItem[] = [1, 2].map(n => {
  const id = `20000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
  return { format: "daasavaani-lyric", formatVersion: 1, lyricId: id, canonicalScript: "kn",
    title: `Synthetic output ${n}`, tags: ["synthetic"],
    lines: [{ kind: "line", lineId: id, text: `Synthetic permitted layout ${n} \t` }, { kind: "layout", text: "" }] };
});
async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "daasavaani-snapshot-stage-"));
  t.after(() => rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 }));
  const site = join(root, "candidate"), snapshots = join(site, "data", "canonical[1]+");
  const empty = emptyPublicationLedger();
  const prepared = prepareCanonicalSnapshot(empty, fingerprint(empty),
    { items, publishedAt: "2026-01-01T00:00:00.000Z", sourceCommit: "c".repeat(40) }, policy, bounds);
  const state = reserveCanonicalSnapshot(empty, fingerprint(empty), prepared, bounds).state;
  const expected = new Map([...prepared.artifacts].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  expected.set("latest.json", Buffer.from(canonical({ format: "daasavaani-snapshot-feed", formatVersion: 1,
    sequence: state.pending!.sequence, manifest: prepared.manifest }) + "\n"));
  return { root, site, snapshots, prepared, state, expected,
    stage: (limits = hosting, safety = bounds) =>
      stageCanonicalSnapshot(site, snapshots, state, fingerprint(state), prepared, safety, limits) };
}
async function inventory(directory: string, prefix = ""): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name), path = prefix + entry.name;
    if (entry.isDirectory()) {
      for (const [name, bytes] of await inventory(absolute, path + "/")) result.set(name, bytes);
    } else result.set(path, await readFile(absolute));
  }
  return result;
}

test("isolated staging writes exact public bytes/layout and full original-plus-ZIP output, then returns complete preflight", async t => {
  const fixture = await setup(t), stateBefore = structuredClone(fixture.state);
  const planBefore = structuredClone(fixture.prepared.plan);
  const report = await fixture.stage(), actual = await inventory(fixture.snapshots);
  assert.deepEqual(actual, fixture.expected);
  const byteCount = [...actual.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  assert.deepEqual(report, {
    stage: "staged-snapshot", sequence: fixture.state.pending!.sequence, fileCount: actual.size,
    totalHostedBytes: byteCount, artifactCount: fixture.prepared.artifacts.size,
    headroomLimitBytes: hostingByteLimit(hosting), manifestSha256: fixture.prepared.manifest.sha256
  });
  let bundleCount = 0;
  for (const [path, bytes] of actual) {
    if (path.endsWith(".zip")) {
      bundleCount++;
      for (const member of decodeZipStore(bytes, {
        maxMembers: policy.transferPlanning.maxBundleMembers, maxArchiveBytes: policy.transferPlanning.maxBundleEncodedBytes
      })) assert.deepEqual(member.bytes, actual.get(member.path));
    }
  }
  assert.equal(bundleCount, 1);
  for (const item of items) {
    assert.ok([...actual].some(([path, bytes]) => path.endsWith(".json.gz") &&
      gunzipSync(bytes).equals(Buffer.from(canonical(item)))));
  }
  assert.deepEqual(fixture.state, stateBefore);
  assert.deepEqual(fixture.prepared.plan, planBefore);
  assert.deepEqual(fixture.prepared.artifacts, new Map([...fixture.expected].filter(([path]) => path !== "latest.json")));
});

test("existing empty/populated roots, regular files and root junctions are never overwritten or reused", async t => {
  for (const kind of ["empty", "populated", "file", "junction"]) {
    const fixture = await setup(t);
    const sentinel = Buffer.from("Synthetic previous usable publication\n");
    if (kind === "file") await writeFile(fixture.site, sentinel);
    else if (kind === "junction") {
      const previous = join(fixture.root, "previous");
      await mkdir(previous);
      await writeFile(join(previous, "sentinel"), sentinel);
      await symlink(previous, fixture.site, "junction");
    } else {
      await mkdir(fixture.site);
      if (kind === "populated") await writeFile(join(fixture.site, "sentinel"), sentinel);
    }
    await assert.rejects(fixture.stage(), { code: "EEXIST" });
    if (kind === "file") assert.deepEqual(await readFile(fixture.site), sentinel);
    else if (kind === "empty") assert.deepEqual(await readdir(fixture.site), []);
    else {
      assert.deepEqual(await readdir(fixture.site), ["sentinel"]);
      assert.deepEqual(await readFile(join(fixture.site, "sentinel")), sentinel);
    }
    if (kind === "junction") assert.equal((await lstat(fixture.site)).isSymbolicLink(), true);
  }
});

test("empty catalogs remain refused by the existing producer before any output can be staged", async t => {
  const fixture = await setup(t), empty = emptyPublicationLedger();
  assert.throws(() => prepareCanonicalSnapshot(empty, fingerprint(empty),
    { items: [], publishedAt: "2026-01-01T00:00:00.000Z", sourceCommit: "c".repeat(40) }, policy, bounds), /requires publishable items/);
  await assert.rejects(lstat(fixture.site), { code: "ENOENT" });
});

test("stale reservations, corrupt/unexpected prepared artifacts and invalid bounds fail before creating output", async t => {
  const fixture = await setup(t), { site, snapshots, state, prepared } = fixture;
  await assert.rejects(stageCanonicalSnapshot(site, snapshots, state, "0".repeat(64), prepared, bounds, hosting), /Stale/);
  const empty = emptyPublicationLedger();
  await assert.rejects(stageCanonicalSnapshot(site, snapshots, empty, fingerprint(empty), prepared, bounds, hosting), /reservation/);
  const corrupt = new Map(prepared.artifacts);
  corrupt.set(prepared.manifest.path, Buffer.alloc(prepared.artifacts.get(prepared.manifest.path)!.length));
  await assert.rejects(stageCanonicalSnapshot(site, snapshots, state, fingerprint(state), { ...prepared, artifacts: corrupt }, bounds, hosting));
  const extra = new Map(prepared.artifacts);
  extra.set("private.md", Buffer.from("not a public artifact"));
  await assert.rejects(stageCanonicalSnapshot(site, snapshots, state, fingerprint(state), { ...prepared, artifacts: extra }, bounds, hosting), /Unexpected/);
  await assert.rejects(fixture.stage(hosting, { ...bounds, maxDescriptorBytes: 0 }), /safety bound/);
  await assert.rejects(fixture.stage({ ...hosting, maxHostedBytes: 0 }), /policy/);
  await assert.rejects(lstat(site), { code: "ENOENT" });
});

test("exact whole-site headroom is admitted and one byte beyond it is rejected before any mkdir", async t => {
  const fixture = await setup(t);
  const bytes = [...fixture.expected.values()].reduce((sum, value) => sum + value.length, 0);
  const exact = { ...hosting, maxHostedBytes: Math.ceil(bytes * 100 / 80), maxUtilizationPercent: 80 };
  const below = { ...exact, maxHostedBytes: Math.ceil((bytes - 1) * 100 / 80) };
  assert.equal(hostingByteLimit(exact), bytes);
  assert.equal(hostingByteLimit(below), bytes - 1);
  await assert.rejects(fixture.stage(below), /headroom/);
  await assert.rejects(lstat(fixture.site), { code: "ENOENT" });
  assert.equal((await fixture.stage(exact)).totalHostedBytes, bytes);
});

test("staging requires explicit absolute nested paths and an already-existing parent", async t => {
  const fixture = await setup(t), { site, snapshots, state, prepared } = fixture;
  await assert.rejects(stageCanonicalSnapshot("relative", snapshots, state, fingerprint(state), prepared, bounds, hosting), /absolute/);
  for (const path of [site, join(fixture.root, "outside")]) {
    await assert.rejects(stageCanonicalSnapshot(site, path, state, fingerprint(state), prepared, bounds, hosting), /strictly inside/);
  }
  const absent = join(fixture.root, "missing", "candidate");
  await assert.rejects(stageCanonicalSnapshot(absent, join(absent, "snapshots"), state, fingerprint(state), prepared, bounds, hosting), /ENOENT/);
  await assert.rejects(lstat(site), { code: "ENOENT" });
  assert.deepEqual(await readdir(fixture.root), []);
});

test("an immediate parent junction is refused without writing through it", async t => {
  const fixture = await setup(t), parent = join(fixture.root, "parent"), target = join(fixture.root, "target");
  await mkdir(target);
  await symlink(target, parent, "junction");
  const site = join(parent, "candidate");
  await assert.rejects(stageCanonicalSnapshot(site, join(site, "snapshots"), fixture.state,
    fingerprint(fixture.state), fixture.prepared, bounds, hosting), /parent must be a regular directory/);
  assert.deepEqual(await readdir(target), []);
});

test("caller mutation after entry cannot alter captured state, plan, artifact bytes or admission limits", async t => {
  const fixture = await setup(t), safety = { ...bounds }, limits = { ...hosting };
  const staging = fixture.stage(limits, safety);
  fixture.prepared.artifacts.get(fixture.prepared.manifest.path)!.fill(0);
  fixture.prepared.plan.sourceCommit = "e".repeat(40);
  fixture.state.pending!.sequence++;
  safety.maxDescriptorBytes = 0;
  limits.maxHostedBytes = 0;
  assert.equal((await staging).sequence, 1);
  assert.deepEqual(await inventory(fixture.snapshots), fixture.expected);
});

test("a filesystem failure returns no success and leaves only the new candidate for inspection, preserving previous output", async t => {
  const fixture = await setup(t), previous = join(fixture.root, "previous");
  await mkdir(previous);
  await writeFile(join(previous, "latest.json"), "Synthetic previous usable publication\n");
  const before = await inventory(previous);
  await assert.rejects(stageCanonicalSnapshot(fixture.site, join(fixture.site, "x".repeat(300)), fixture.state,
    fingerprint(fixture.state), fixture.prepared, bounds, hosting));
  assert.equal((await lstat(fixture.site)).isDirectory(), true);
  assert.deepEqual(await readdir(fixture.site), []);
  assert.deepEqual(await inventory(previous), before);
  await assert.rejects(fixture.stage(), { code: "EEXIST" });
});
