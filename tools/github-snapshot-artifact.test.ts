import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateRawSync, gunzipSync } from "node:zlib";
import type { LyricItem } from "../shared/types/lyrics.js";
import { crc32 } from "./crc32.js";
import type { GitHubApiReader, GitHubApiReadLimits } from "./github-api.js";
import { auditGitHubSnapshotArtifact, type GitHubSnapshotArtifactOptions } from "./github-snapshot-artifact.js";
import { hostingByteLimit, hostingSettings } from "./hosted-preflight.js";
import { emptyPublicationLedger, publicationLedgerFingerprint as fingerprint } from "./publication-ledger.js";
import { canonical } from "./publisher.js";
import { prepareCanonicalSnapshot, readSnapshotSettings, reserveCanonicalSnapshot } from "./snapshot-producer.js";
import { decodeZipStore } from "./zip-store.js";

interface Entry { name: string; type: string; bytes: Buffer }
const { policy, bounds } = await readSnapshotSettings(), hosting = await hostingSettings();
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const items: LyricItem[] = [1, 2].map(n => {
  const id = `60000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
  return { format: "daasavaani-lyric", formatVersion: 1, lyricId: id, canonicalScript: "kn",
    title: `Synthetic archive ${n}`, tags: ["Synthetic"],
    lines: [{ kind: "line", lineId: id, text: `Synthetic permitted layout ${n} \t` }, { kind: "layout", text: "" }] };
});

function entries(files: Map<string, Buffer>): Entry[] {
  const directories = new Set([""]);
  for (const path of files.keys()) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index++) directories.add(parts.slice(0, index).join("/"));
  }
  return [
    ...[...directories].map(path => ({ name: path ? `./${path}/` : "./", type: "5", bytes: Buffer.alloc(0) })),
    ...[...files].map(([path, bytes]) => ({ name: `./${path}`, type: "0", bytes }))
  ];
}
function tar(input: Entry[]): Buffer {
  return Buffer.concat([...input.flatMap(entry => {
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, "ascii");
    for (const [offset, width, value] of [[100, 8, 0o644], [108, 8, 0], [116, 8, 0],
      [124, 12, entry.bytes.length], [136, 12, 0]]) {
      header.write(value!.toString(8).padStart(width! - 1, "0") + "\0", offset!, width!, "ascii");
    }
    header.write(entry.type, 156, 1, "ascii");
    header.write("ustar  \0", 257, 8, "ascii");
    header.fill(32, 148, 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    return [header, entry.bytes, Buffer.alloc((512 - entry.bytes.length % 512) % 512)];
  }), Buffer.alloc(1024)]);
}
function zip(body: Buffer): Buffer {
  const compressed = deflateRawSync(body), name = Buffer.from("artifact.tar"), checksum = crc32(body);
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(checksum, 4);
  descriptor.writeUInt32LE(compressed.length, 8); descriptor.writeUInt32LE(body.length, 12);
  const central = Buffer.alloc(46 + name.length), offset = local.length + compressed.length + descriptor.length;
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(813, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0x81a40020, 38); name.copy(central, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([local, compressed, descriptor, central, end]);
}
function fixture() {
  const empty = emptyPublicationLedger();
  const prepared = prepareCanonicalSnapshot(empty, fingerprint(empty),
    { items, sourceCommit: "c".repeat(40), publishedAt: "2026-01-01T00:00:00.000Z" }, policy, bounds);
  const state = reserveCanonicalSnapshot(empty, fingerprint(empty), prepared, bounds).state;
  const snapshotPrefix = "data/canonical";
  const files = new Map([...prepared.artifacts].map(([path, bytes]) => [`${snapshotPrefix}/${path}`, Buffer.from(bytes)]));
  files.set(`${snapshotPrefix}/latest.json`, Buffer.from(canonical({
    format: "daasavaani-snapshot-feed", formatVersion: 1, sequence: state.pending!.sequence, manifest: prepared.manifest
  }) + "\n"));
  const body = tar(entries(files)), archive = zip(body);
  const options: GitHubSnapshotArtifactOptions = {
    repository: "Synthetic/library", repositoryId: 7, artifactId: 11, artifactName: "snapshot-pages",
    artifactSha256: hash(archive), publisherRunId: 13, publisherHeadCommit: "c".repeat(40),
    publisherBranch: "main", requestTimeoutMs: 1000, maxMetadataBytes: 4096,
    maxArchiveBytes: 1048576, snapshotPrefix, maxTarBytes: 1048576, maxFiles: 100
  };
  const metadata = { id: options.artifactId, name: options.artifactName, digest: `sha256:${options.artifactSha256}`,
    expired: false, size_in_bytes: archive.length, workflow_run: { id: options.publisherRunId,
      repository_id: options.repositoryId, head_repository_id: options.repositoryId,
      head_branch: options.publisherBranch, head_sha: options.publisherHeadCommit } };
  const calls: { endpoint: string; limits: Readonly<GitHubApiReadLimits> }[] = [];
  const responses: Buffer[] = [Buffer.from(JSON.stringify(metadata)), Buffer.from(archive), Buffer.from(JSON.stringify(metadata))];
  const reader: GitHubApiReader = async (endpoint, limits) => {
    calls.push({ endpoint, limits });
    const response = responses[calls.length - 1];
    assert.ok(response, "No unexpected API read");
    return response;
  };
  const safety = { ...bounds }, hostingPolicy = { ...hosting };
  const stateSha256 = fingerprint(state);
  const observe = (read: GitHubApiReader = reader, requested = options) =>
    auditGitHubSnapshotArtifact(requested, state, stateSha256, prepared, safety, hostingPolicy, read);
  return { prepared, state, stateSha256, files, body, archive, options, metadata, calls, responses,
    reader, safety, hostingPolicy, observe };
}
function useArchive(f: ReturnType<typeof fixture>, archive: Buffer) {
  f.options.artifactSha256 = hash(archive);
  f.responses[1] = archive;
  const metadata = { ...f.metadata, digest: `sha256:${hash(archive)}`, size_in_bytes: archive.length };
  f.responses[0] = Buffer.from(JSON.stringify(metadata));
  f.responses[2] = Buffer.from(JSON.stringify(metadata));
}

test("authenticates actual artifact bytes and complete original gzip/STORE snapshot with exact requests and payload-free reports", async () => {
  const f = fixture();
  const before = {
    state: structuredClone(f.state), plan: structuredClone(f.prepared.plan), manifest: structuredClone(f.prepared.manifest),
    artifacts: new Map([...f.prepared.artifacts].map(([path, bytes]) => [path, Buffer.from(bytes)])),
    options: { ...f.options }, safety: { ...f.safety }, hostingPolicy: { ...f.hostingPolicy }, archive: Buffer.from(f.archive)
  };
  const report = await f.observe();
  const totalFileBytes = [...f.files.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  assert.deepEqual(report, {
    stage: "github-snapshot-artifact", sequence: f.state.pending!.sequence,
    manifestSha256: f.prepared.manifest.sha256, baseStateSha256: f.prepared.plan.baseStateSha256,
    sourceCommit: f.prepared.plan.sourceCommit, publishedAt: f.prepared.plan.publishedAt,
    artifact: { stage: "github-artifact-bytes", repository: "Synthetic/library", repositoryId: 7,
      artifactId: 11, artifactName: "snapshot-pages", artifactSha256: hash(f.archive), publisherRunId: 13,
      publisherHeadCommit: "c".repeat(40), publisherBranch: "main", artifactBytes: f.archive.length, requestCount: 3 },
    contents: { stage: "pages-artifact-contents", archiveSha256: hash(f.archive), archiveBytes: f.archive.length,
      tarBytes: f.body.length, fileCount: f.files.size,
      directoryCount: entries(f.files).filter(entry => entry.type === "5").length, totalFileBytes },
    headroomLimitBytes: hostingByteLimit(hosting)
  });
  const endpoint = "repos/Synthetic/library/actions/artifacts/11";
  assert.deepEqual(f.calls, [
    { endpoint, limits: { requestTimeoutMs: 1000, maxResponseBytes: 4096 } },
    { endpoint: `${endpoint}/zip`, limits: { requestTimeoutMs: 1000, maxResponseBytes: f.archive.length } },
    { endpoint, limits: { requestTimeoutMs: 1000, maxResponseBytes: 4096 } }
  ]);
  assert.ok(f.calls.every(call => Object.isFrozen(call.limits)));
  let bundles = 0;
  for (const [path, bytes] of f.prepared.artifacts) {
    if (!path.endsWith(".zip")) continue;
    bundles++;
    for (const member of decodeZipStore(bytes, { maxMembers: 100, maxArchiveBytes: 33554432 })) {
      assert.deepEqual(member.bytes, f.prepared.artifacts.get(member.path));
    }
  }
  assert.equal(bundles, 1);
  for (const item of items) assert.ok([...f.prepared.artifacts.values()].some(bytes =>
    bytes[0] === 0x1f && gunzipSync(bytes).equals(Buffer.from(canonical(item)))));
  assert.deepEqual(f.state, before.state);
  assert.deepEqual(f.prepared, { plan: before.plan, manifest: before.manifest, artifacts: before.artifacts });
  assert.deepEqual(f.options, before.options);
  assert.deepEqual(f.safety, before.safety);
  assert.deepEqual(f.hostingPolicy, before.hostingPolicy);
  assert.deepEqual(f.archive, before.archive);
  for (const forbidden of ["Synthetic permitted", "items", "logicalSha256", "descriptorBytes", "artifacts", "receipt", "approval"]) {
    assert.equal(JSON.stringify(report).includes(forbidden), false);
  }
});

test("even authenticated archives fail for changed, missing, extra, malformed and nonregular members", async () => {
  for (const kind of ["changed", "missing", "extra", "malformed", "nonregular"]) {
    const f = fixture(), input = entries(f.files);
    if (kind === "changed") input[input.length - 1] = { ...input.at(-1)!, bytes: Buffer.from("private-payload-sentinel") };
    if (kind === "missing") input.pop();
    if (kind === "extra") input.push({ name: "./private.md", type: "0", bytes: Buffer.from("private-payload-sentinel") });
    if (kind === "nonregular") input[input.length - 1] = { ...input.at(-1)!, type: "2" };
    const archive = kind === "malformed" ? Buffer.from("private-payload-sentinel") : zip(tar(input));
    useArchive(f, archive);
    await assert.rejects(f.observe(), error => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes("private-payload-sentinel"), false);
      return true;
    }, kind);
    assert.equal(f.calls.length, 3, kind);
    assert.equal(f.state.pending?.phase, "reserved");
  }
});

test("reservation, state fingerprint and prepared snapshot corruption fail before any API reads", async () => {
  for (const kind of ["none", "deploying", "wrong-plan", "wrong-manifest", "stale", "corrupt", "extra"]) {
    const f = fixture();
    if (kind === "none") f.state.pending = null;
    if (kind === "deploying") f.state.pending!.phase = "deploying";
    if (kind === "wrong-plan") f.prepared.plan.sourceCommit = "d".repeat(40);
    if (kind === "wrong-manifest") f.prepared.manifest.sha256 = "d".repeat(64);
    if (kind === "stale") f.state.lastSequence++;
    if (kind === "corrupt") f.prepared.artifacts.get(f.prepared.manifest.path)!.fill(0);
    if (kind === "extra") f.prepared.artifacts.set("private.md", Buffer.from("private-payload-sentinel"));
    await assert.rejects(f.observe(), Error, kind);
    assert.equal(f.calls.length, 0, kind);
  }
});

test("unsafe prefixes and full paths are rejected before reads, including prefixes that leave insufficient path space", async () => {
  for (const snapshotPrefix of ["", "/", "../data", "data/", "data//canonical", "data/./canonical",
    "data/../canonical", "data\\canonical", "C:/data", "data:canonical", "ಕನ್ನಡ", "a".repeat(99), "a".repeat(20)]) {
    const f = fixture();
    await assert.rejects(f.observe(f.reader, { ...f.options, snapshotPrefix }), /options|path/);
    assert.equal(f.calls.length, 0, snapshotPrefix);
  }
});

test("invalid resource/role bounds and unknown artifact options fail before reads without weakening the audit schema", async () => {
  for (const key of ["maxTarBytes", "maxFiles", "maxArchiveBytes", "maxMetadataBytes", "requestTimeoutMs"] as const) {
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648, Number.MAX_SAFE_INTEGER + 1]) {
      const f = fixture();
      await assert.rejects(f.observe(f.reader, { ...f.options, [key]: value }), /options|bound/);
      assert.equal(f.calls.length, 0, `${key}: ${value}`);
    }
  }
  for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) {
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
      const f = fixture();
      f.safety[key] = value;
      await assert.rejects(f.observe(), /safety bound/);
      assert.equal(f.calls.length, 0);
    }
  }
  const f = fixture(), unknown = { ...f.options, unexpected: true };
  await assert.rejects(f.observe(f.reader, unknown), /Invalid GitHub artifact options/);
  assert.equal(f.calls.length, 0);
});

test("expected byte/file limits and whole-site headroom are checked before reads and exact limits pass", async () => {
  const f = fixture(), total = [...f.files.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  for (const changes of [{ maxTarBytes: total - 1 }, { maxFiles: f.files.size - 1 }]) {
    await assert.rejects(f.observe(f.reader, { ...f.options, ...changes }), /limit|count/);
    assert.equal(f.calls.length, 0);
  }
  Object.assign(f.hostingPolicy, { maxHostedBytes: total - 1, maxUtilizationPercent: 100 });
  await assert.rejects(f.observe(), /headroom/);
  assert.equal(f.calls.length, 0);
  Object.assign(f.hostingPolicy, { maxHostedBytes: total, maxUtilizationPercent: 100 });
  const report = await f.observe(f.reader, {
    ...f.options, maxArchiveBytes: f.archive.length, maxTarBytes: f.body.length, maxFiles: f.files.size
  });
  assert.equal(report.headroomLimitBytes, total);
  assert.equal(report.contents.totalFileBytes, total);
  for (const changes of [{ maxHostedBytes: 0 }, { maxHostedBytes: Infinity }, { maxUtilizationPercent: 0 },
    { maxUtilizationPercent: 101 }, { maxUtilizationPercent: 1.5 }]) {
    const invalid = fixture();
    Object.assign(invalid.hostingPolicy, changes);
    await assert.rejects(invalid.observe(), /policy/);
    assert.equal(invalid.calls.length, 0);
  }
});

test("stale or mismatching metadata and actual unauthenticated archive bytes never become contents success", async () => {
  for (const kind of ["expired", "digest", "run", "branch", "head", "repository", "size", "bytes", "late"]) {
    const f = fixture(), metadata = structuredClone(f.metadata);
    if (kind === "expired") metadata.expired = true;
    if (kind === "digest") metadata.digest = `sha256:${"f".repeat(64)}`;
    if (kind === "run" || kind === "late") metadata.workflow_run.id++;
    if (kind === "branch") metadata.workflow_run.head_branch = "other";
    if (kind === "head") metadata.workflow_run.head_sha = "d".repeat(40);
    if (kind === "repository") metadata.workflow_run.head_repository_id++;
    if (kind === "size") metadata.size_in_bytes++;
    if (kind === "bytes") f.responses[1]!.fill(0);
    else f.responses[kind === "late" ? 2 : 0] = Buffer.from(JSON.stringify(metadata));
    await assert.rejects(f.observe(), /GitHub artifact/);
    assert.equal(f.calls.length, kind === "late" ? 3 : kind === "size" || kind === "bytes" ? 2 : 1, kind);
  }
});

test("all caller state, plan, reference, maps, original buffers, options and policies are captured before awaiting", async () => {
  const f = fixture(), baseline = await fixture().observe();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  const read: GitHubApiReader = async (endpoint, limits) => {
    reads++;
    if (reads === 1) await gate;
    if (reads === 3) {
      f.responses[0]!.fill(0);
      f.responses[1]!.fill(0);
    }
    return f.reader(endpoint, limits);
  };
  const observation = f.observe(read);
  assert.equal(reads, 1);
  f.state.pending!.sourceCommit = "e".repeat(40);
  f.state.pending!.items[0]!.logicalSha256 = "e".repeat(64);
  f.state.pending = null;
  f.state.lastSequence = 999;
  f.prepared.plan.sourceCommit = "e".repeat(40);
  f.prepared.plan.items.length = 0;
  f.prepared.manifest.sha256 = "e".repeat(64);
  f.prepared.manifest.path = "private.md";
  for (const bytes of f.prepared.artifacts.values()) bytes.fill(0);
  f.prepared.artifacts.clear();
  Object.assign(f.options, { repository: "Changed/library", repositoryId: 77, artifactId: 88,
    artifactSha256: "e".repeat(64), publisherRunId: 99, publisherHeadCommit: "e".repeat(40),
    publisherBranch: "other", artifactName: "other", snapshotPrefix: "../bad",
    requestTimeoutMs: 0, maxMetadataBytes: 0, maxArchiveBytes: 0, maxTarBytes: 0, maxFiles: 0 });
  for (const key of Object.keys(f.safety) as (keyof typeof bounds)[]) f.safety[key] = 0;
  Object.assign(f.hostingPolicy, { maxHostedBytes: 0, maxUtilizationPercent: 0 });
  release();
  assert.deepEqual(await observation, baseline);
  assert.equal(f.responses[1]!.every(byte => byte === 0), true);
  assert.equal(f.state.pending, null);
  assert.equal(f.prepared.artifacts.size, 0);
  assert.equal(f.options.artifactId, 88);
});

test("trusted reader failures, wrong types, empty and oversized responses fail explicitly with no payload leak or fallback", async () => {
  for (const response of ["private-payload-sentinel", null, new ArrayBuffer(8), Buffer.alloc(0), Buffer.alloc(4097)]) {
    const f = fixture();
    let reads = 0;
    await assert.rejects(Reflect.apply(auditGitHubSnapshotArtifact, undefined, [
      f.options, f.state, f.stateSha256, f.prepared, f.safety, f.hostingPolicy,
      async () => { reads++; return response; }
    ]), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /API read failed/);
      assert.equal(error.message.includes("private-payload-sentinel"), false);
      return true;
    });
    assert.equal(reads, 1);
  }
  const f = fixture();
  await assert.rejects(f.observe(async () => { throw new Error("private-payload-sentinel"); }), /API read failed/);
  const oversized = fixture();
  await assert.rejects(oversized.observe(async (endpoint, limits) => {
    if (endpoint.endsWith("/zip")) return Buffer.alloc(limits.maxResponseBytes + 1);
    return oversized.reader(endpoint, limits);
  }), /API read failed/);
});
