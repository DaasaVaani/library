import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { LyricItem } from "../shared/types/lyrics.js";
import { hostingByteLimit, hostingSettings, preflightCanonicalSnapshot } from "./hosted-preflight.js";
import { beginPublicationDeployment, emptyPublicationLedger, publicationLedgerFingerprint as fingerprint } from "./publication-ledger.js";
import { bindCanonicalSnapshot, prepareCanonicalSnapshot, readSnapshotSettings, reserveCanonicalSnapshot } from "./snapshot-producer.js";

const { policy, bounds } = await readSnapshotSettings(), hosting = await hostingSettings();
const items: LyricItem[] = [1, 2].map(n => {
  const id = `10000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
  return { format: "daasavaani-lyric", formatVersion: 1, lyricId: id, canonicalScript: "kn",
    title: `Synthetic staged hosting ${n}`, tags: ["synthetic"],
    lines: [{ kind: "line", lineId: id, text: `Synthetic permitted fixture ${n}  ` }, { kind: "layout", text: " \t" }] };
});
async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "daasavaani-snapshot-hosted-"));
  t.after(() => rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 }));
  const site = join(root, "site"), snapshots = join(site, "data", "canonical");
  const empty = emptyPublicationLedger();
  const prepared = prepareCanonicalSnapshot(empty, fingerprint(empty),
    { items, sourceCommit: "c".repeat(40), publishedAt: "2026-01-01T00:00:00.000Z" }, policy, bounds);
  const state = reserveCanonicalSnapshot(empty, fingerprint(empty), prepared, bounds).state;
  const bound = bindCanonicalSnapshot(state, fingerprint(state), prepared, bounds);
  const files = new Map(bound.artifacts);
  files.set("latest.json", bound.descriptorBytes);
  for (const [path, bytes] of files) {
    const absolute = join(snapshots, ...path.split("/"));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);
  }
  return { root, site, snapshots, prepared, state, bound, files,
    check: (limits = hosting, safety = bounds) =>
      preflightCanonicalSnapshot(site, snapshots, state, fingerprint(state), prepared, safety, limits) };
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

test("bound snapshot files include every original and duplicate ZIP byte at exact whole-site headroom/+1", async t => {
  const fixture = await setup(t), before = await inventory(fixture.site), stateBefore = structuredClone(fixture.state);
  const preparedBefore = bindCanonicalSnapshot(fixture.state, fingerprint(fixture.state), fixture.prepared, bounds);
  const bytes = [...before.values()].reduce((total, value) => total + value.length, 0);
  const exact = { ...hosting, maxHostedBytes: Math.ceil(bytes * 100 / 80), maxUtilizationPercent: 80 };
  const below = { ...exact, maxHostedBytes: Math.ceil((bytes - 1) * 100 / 80) };
  assert.equal(hostingByteLimit(exact), bytes);
  assert.equal(hostingByteLimit(below), bytes - 1);
  const bundleFiles = [...fixture.files].filter(([path]) => path.endsWith(".zip"));
  assert.equal(bundleFiles.length, 1);
  assert.ok(bundleFiles[0]![1].length > 0);
  assert.deepEqual(await fixture.check(exact), {
    stage: "staged-snapshot", sequence: fixture.bound.descriptor.sequence, fileCount: fixture.files.size,
    artifactCount: fixture.bound.artifacts.size, totalHostedBytes: bytes, headroomLimitBytes: bytes,
    manifestSha256: fixture.prepared.manifest.sha256
  });
  await assert.rejects(fixture.check(below), /headroom/);
  assert.deepEqual(await inventory(fixture.site), before);
  assert.deepEqual(fixture.state, stateBefore);
  assert.deepEqual(bindCanonicalSnapshot(fixture.state, fingerprint(fixture.state), fixture.prepared, bounds), preparedBefore);
});

test("every expected descriptor, manifest, policy, item and ZIP must exist and match actual bytes", async t => {
  const fixture = await setup(t);
  for (const [path, bytes] of fixture.files) {
    const absolute = join(fixture.snapshots, ...path.split("/"));
    await rm(absolute);
    await assert.rejects(fixture.check(), /missing/);
    const corrupt = Buffer.from(bytes);
    corrupt[0] = corrupt[0]! ^ 1;
    await writeFile(absolute, corrupt);
    await assert.rejects(fixture.check(), /bound snapshot bytes/);
    await writeFile(absolute, bytes.subarray(0, bytes.length - 1));
    await assert.rejects(fixture.check(), /bound snapshot bytes/);
    await writeFile(absolute, Buffer.concat([bytes, Buffer.from([0])]));
    await assert.rejects(fixture.check(), /encoded byte bound/);
    await writeFile(absolute, bytes);
  }
  assert.equal((await fixture.check()).fileCount, fixture.files.size);
});

test("a schema-valid descriptor with another sequence or missing canonical LF cannot substitute for the reservation", async t => {
  const fixture = await setup(t), path = join(fixture.snapshots, "latest.json");
  const bytes = fixture.bound.descriptorBytes;
  const wrong = Buffer.from(bytes.toString("utf8").replace('"sequence":1', '"sequence":2'));
  assert.notDeepEqual(wrong, bytes);
  await writeFile(path, wrong);
  await assert.rejects(fixture.check(), /bound snapshot bytes/);
  await writeFile(path, bytes.subarray(0, -1));
  await assert.rejects(fixture.check(), /bound snapshot bytes/);
});

test("a complete-looking filesystem never bypasses fresh ledger, plan or actual prepared-artifact validation", async t => {
  const fixture = await setup(t), { site, snapshots, state, prepared } = fixture;
  await assert.rejects(preflightCanonicalSnapshot(site, snapshots, state, "0".repeat(64), prepared, bounds, hosting), /Stale/);
  const empty = emptyPublicationLedger();
  await assert.rejects(preflightCanonicalSnapshot(site, snapshots, empty, fingerprint(empty), prepared, bounds, hosting), /reservation/);
  const wrong = { ...prepared, plan: { ...prepared.plan, sourceCommit: "e".repeat(40) } };
  await assert.rejects(preflightCanonicalSnapshot(site, snapshots, state, fingerprint(state), wrong, bounds, hosting), /match reservation/);
  const badArtifacts = new Map([...prepared.artifacts].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  badArtifacts.get(prepared.manifest.path)!.fill(0);
  await assert.rejects(preflightCanonicalSnapshot(site, snapshots, state, fingerprint(state),
    { ...prepared, artifacts: badArtifacts }, bounds, hosting));
  const deploying = beginPublicationDeployment(state, fingerprint(state));
  assert.equal((await preflightCanonicalSnapshot(site, snapshots, deploying, fingerprint(deploying), prepared, bounds, hosting)).sequence, 1);
});

test("unexpected files and empty directories are refused, including retained valid objects outside the exact snapshot", async t => {
  const fixture = await setup(t);
  const empty = emptyPublicationLedger();
  const retained = prepareCanonicalSnapshot(empty, fingerprint(empty), {
    items: [{ ...items[0]!, title: "Synthetic retained item" }], sourceCommit: "d".repeat(40),
    publishedAt: "2026-01-01T00:00:00.000Z"
  }, policy, bounds);
  const [retainedPath, retainedBytes] = [...retained.artifacts].find(([path]) => !fixture.bound.artifacts.has(path))!;
  const retainedFile = join(fixture.snapshots, ...retainedPath.split("/"));
  await writeFile(retainedFile, retainedBytes);
  await assert.rejects(fixture.check(), /Unexpected hosted file/);
  await rm(retainedFile);
  for (const path of ["private.md", ".nojekyll", "data/canonical/latest.pending",
    `data/canonical/objects/${"a".repeat(64)}.json.gz`, "data/canonical/receipt.json"]) {
    const absolute = join(fixture.site, ...path.split("/"));
    await writeFile(absolute, fixture.bound.artifacts.get(fixture.prepared.manifest.path)!);
    await assert.rejects(fixture.check(), /Unexpected hosted file/);
    await rm(absolute);
  }
  for (const path of ["images", "data/canonical/unused"]) {
    const absolute = join(fixture.site, ...path.split("/"));
    await mkdir(absolute);
    await assert.rejects(fixture.check(), /Unexpected hosted directory/);
    await rm(absolute, { recursive: true });
  }
});

test("site, parent, nested snapshot, object and bundle junctions cannot hide or replace the inventory", async t => {
  for (const name of ["site", "data", "snapshots", "objects", "bundles"]) {
    const fixture = await setup(t);
    const path = name === "site" ? fixture.site : name === "data" ? join(fixture.site, "data") :
      name === "snapshots" ? fixture.snapshots : join(fixture.snapshots, name);
    const target = join(fixture.root, "retired");
    await rename(path, target);
    await symlink(target, path, "junction");
    await assert.rejects(fixture.check(), /regular directory|links/);
  }
});

test("absolute strictly nested paths, validated policies/bounds and a complete nonempty root are mandatory", async t => {
  const fixture = await setup(t), { site, snapshots, state, prepared } = fixture;
  for (const directory of [site, join(fixture.root, "outside")]) {
    await assert.rejects(preflightCanonicalSnapshot(site, directory, state, fingerprint(state), prepared, bounds, hosting), /strictly inside/);
  }
  await assert.rejects(preflightCanonicalSnapshot("relative", snapshots, state, fingerprint(state), prepared, bounds, hosting), /absolute/);
  await assert.rejects(fixture.check({ ...hosting, maxHostedBytes: 0 }), /policy/);
  await assert.rejects(fixture.check(hosting, { ...bounds, maxDescriptorBytes: 0 }), /safety bound/);
  const empty = join(fixture.root, "empty");
  await mkdir(empty);
  await assert.rejects(preflightCanonicalSnapshot(empty, join(empty, "snapshots"), state, fingerprint(state), prepared, bounds, hosting), /missing/);
  await assert.rejects(preflightCanonicalSnapshot(join(empty, "absent"), join(empty, "absent", "snapshots"),
    state, fingerprint(state), prepared, bounds, hosting), /ENOENT/);
});

test("expected bytes are captured before filesystem awaits and cannot be changed through caller-owned buffers", async t => {
  const fixture = await setup(t);
  const checking = fixture.check();
  fixture.prepared.artifacts.get(fixture.prepared.manifest.path)!.fill(0);
  assert.equal((await checking).manifestSha256, fixture.bound.descriptor.manifest.sha256);
  await assert.rejects(fixture.check());
});
