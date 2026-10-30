import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { deflateRawSync, gunzipSync } from "node:zlib";
import { crc32 } from "./crc32.js";
import type { GitHubApiReader } from "./github-api.js";
import { hostingSettings } from "./hosted-preflight.js";
import { PublicationLedgerGitStore } from "./publication-ledger-git.js";
import { cancelPublicationReservation, decodePublicationLedger, emptyPublicationLedger, encodePublicationLedger, publicationLedgerFingerprint as fingerprint,
  type PublicationReceipt } from "./publication-ledger.js";
import { deployCanonicalSnapshotWithArtifact,
  type AdmittedSnapshotDeployment, type SnapshotArtifactAuthority, type StagedSnapshotDeployment,
  type UploadedSnapshotArtifact } from "./snapshot-deployment.js";
import { prepareCanonicalSnapshot, readSnapshotSettings, reserveCanonicalSnapshot } from "./snapshot-producer.js";
import { decodeZipStore } from "./zip-store.js";

const stateRef = "refs/heads/publication-state";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const { policy, bounds } = await readSnapshotSettings(), hosting = await hostingSettings();
function git(directory: string, args: string[], input?: string | Uint8Array): string {
  return execFileSync("git", [`--git-dir=${directory}`, "-c", "commit.gpgsign=false", ...args], {
    input, encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "Synthetic artifact test", GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Synthetic artifact test", GIT_COMMITTER_EMAIL: "test@example.invalid" }
  }).trim();
}
async function inventory(directory: string, prefix = ""): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name, absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, bytes] of await inventory(absolute, `${path}/`)) files.set(name, bytes);
    } else files.set(path, await readFile(absolute));
  }
  return files;
}

// Only the current Pages GNUtar/classic DEFLATE ZIP profile is needed here.
function archive(files: Map<string, Buffer>): Buffer {
  const directories = new Set([""]);
  for (const path of files.keys()) {
    const parts = path.split("/");
    for (let n = 1; n < parts.length; n++) directories.add(parts.slice(0, n).join("/"));
  }
  const entries = [
    ...[...directories].map(path => ({ name: path ? `./${path}/` : "./", type: "5", bytes: Buffer.alloc(0) })),
    ...[...files].map(([path, bytes]) => ({ name: `./${path}`, type: "0", bytes }))
  ];
  const body = Buffer.concat([...entries.flatMap(entry => {
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, "ascii");
    for (const [offset, width, value] of [[100, 8, 0o644], [108, 8, 0], [116, 8, 0],
      [124, 12, entry.bytes.length], [136, 12, 0]] as const) {
      header.write(value.toString(8).padStart(width - 1, "0") + "\0", offset, width, "ascii");
    }
    header.write(entry.type, 156, 1, "ascii"); header.write("ustar  \0", 257, 8, "ascii");
    header.fill(32, 148, 156);
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    return [header, entry.bytes, Buffer.alloc((512 - entry.bytes.length % 512) % 512)];
  }), Buffer.alloc(1024)]);
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
function proof(admitted: AdmittedSnapshotDeployment): PublicationReceipt {
  const candidate = admitted.candidate, artifact = admitted.artifact.artifact;
  return { sequence: candidate.sequence, manifestSha256: candidate.manifestSha256,
    sourceCommit: candidate.sourceCommit, publishedAt: candidate.publishedAt,
    confirmedAt: "2026-01-01T01:00:00.000Z", runId: artifact.publisherRunId, runAttempt: 1,
    deploymentId: 17, statusId: 19, artifactId: artifact.artifactId, artifactZipSha256: artifact.artifactSha256 };
}
async function fixture(t: TestContext) {
  const root = await mkdtemp(resolve(".snapshot-artifact-test-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 30, retryDelay: 200 }));
  const remote = join(root, "remote.git"), client = join(root, "client.git"), peerDirectory = join(root, "peer.git");
  for (const directory of [remote, client, peerDirectory]) git(directory, ["init", "--bare", "--initial-branch=fixture-unused"]);
  for (const directory of [client, peerDirectory]) git(directory, ["remote", "add", "origin", remote]);
  const empty = emptyPublicationLedger();
  const options = { repositoryDirectory: client, remoteName: "origin", stateRef, maxEncodedBytes: 1048576, gitTimeoutMs: 30000 };
  const store = new PublicationLedgerGitStore(options);
  const peer = new PublicationLedgerGitStore({ ...options, repositoryDirectory: peerDirectory });
  const prepared = prepareCanonicalSnapshot(empty, fingerprint(empty), {
    sourceCommit: "c".repeat(40), publishedAt: "2026-01-01T00:00:00.000Z",
    items: [1, 2].map(n => {
      const id = `70000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
      return { format: "daasavaani-lyric", formatVersion: 1, lyricId: id, canonicalScript: "kn",
        title: `Synthetic integration ${n}`, tags: [], lines: [{ kind: "line", lineId: id, text: `Synthetic permitted fixture ${n}` }] };
    })
  }, policy, bounds);
  const safety = { ...bounds }, hostingPolicy = { ...hosting };
  const state = reserveCanonicalSnapshot(empty, fingerprint(empty), prepared, safety).state;
  const blob = git(remote, ["hash-object", "-w", "--stdin"], encodePublicationLedger(state));
  const tree = git(remote, ["mktree"], `100644 blob ${blob}\tledger.json\n`);
  const initial = git(remote, ["commit-tree", tree], "Synthetic reserved state\n");
  git(remote, ["update-ref", stateRef, initial, "0".repeat(40)]);
  const reserved = { gitTip: initial, state };
  const durable = () => {
    const gitTip = git(remote, ["rev-parse", stateRef]);
    return { gitTip, state: decodePublicationLedger(Buffer.from(git(remote, ["show", `${gitTip}:ledger.json`]) + "\n"), 1048576) };
  };
  const site = join(root, "candidate"), snapshots = join(site, "data", "canonical");
  const authority: SnapshotArtifactAuthority = {
    repository: "Synthetic/library", repositoryId: 7, artifactName: "snapshot-pages", publisherRunId: 13,
    publisherHeadCommit: "e".repeat(40), publisherBranch: "main", requestTimeoutMs: 1000,
    maxMetadataBytes: 4096, maxArchiveBytes: 1048576, maxTarBytes: 1048576, maxFiles: 100
  };
  const events: string[] = [], responses: Buffer[] = [];
  let uploaded: UploadedSnapshotArtifact | undefined, uploadedFiles: Map<string, Buffer> | undefined;
  const upload = async (staged: StagedSnapshotDeployment) => {
    events.push("upload");
    assert.equal(durable().state.pending?.phase, "deploying");
    uploadedFiles = await inventory(staged.siteDirectory);
    const bytes = archive(uploadedFiles);
    uploaded = { artifactId: 11, artifactSha256: hash(bytes) };
    const metadata = { id: 11, name: "snapshot-pages", digest: `sha256:${hash(bytes)}`, expired: false,
      size_in_bytes: bytes.length, workflow_run: { id: 13, repository_id: 7, head_repository_id: 7,
        head_branch: "main", head_sha: "e".repeat(40) } };
    responses.push(Buffer.from(JSON.stringify(metadata)), bytes, Buffer.from(JSON.stringify(metadata)));
    return uploaded;
  };
  const reader: GitHubApiReader = async (endpoint, limits) => {
    const n = events.filter(event => event.startsWith("read:")).length;
    events.push(`read:${endpoint}`);
    assert.equal(endpoint, `repos/Synthetic/library/actions/artifacts/11${n === 1 ? "/zip" : ""}`);
    assert.equal(limits.requestTimeoutMs, 1000);
    assert.ok(responses[n], "Unexpected API request");
    return responses[n]!;
  };
  const expose = async (admitted: AdmittedSnapshotDeployment) => {
    events.push("expose");
    assert.equal(events.filter(event => event.startsWith("read:")).length, 3);
    assert.equal(admitted.candidate.sourceCommit, "c".repeat(40));
    assert.equal(admitted.artifact.artifact.publisherHeadCommit, "e".repeat(40));
    assert.equal(admitted.artifact.manifestSha256, admitted.candidate.manifestSha256);
    assert.deepEqual(admitted.artifact.artifact.artifactSha256, hash(responses[1]!));
    return proof(admitted);
  };
  const run = (u = upload, e = expose, r = reader) =>
    deployCanonicalSnapshotWithArtifact(store, reserved, prepared, safety, site, snapshots, hostingPolicy, authority, u, e, r);
  const uncertain = async (exposures = 0) => {
    const current = durable();
    assert.equal(current.state.pending?.phase, "deploying"); assert.equal(current.state.confirmed, null);
    assert.equal(events.filter(event => event === "upload").length, 1);
    assert.equal(events.filter(event => event === "expose").length, exposures);
    assert.throws(() => cancelPublicationReservation(current.state, fingerprint(current.state)), /started|deploy/i);
    return current;
  };
  return { store, peer, initial, reserved, prepared, safety, hostingPolicy, authority, site, snapshots,
    remote, events, responses, upload, expose, reader, run, uncertain, durable,
    uploaded: () => uploaded!, files: () => uploadedFiles! };
}
function replaceArchive(f: Awaited<ReturnType<typeof fixture>>, files: Map<string, Buffer>) {
  const bytes = archive(files), metadata = JSON.parse(f.responses[0]!.toString("utf8"));
  f.uploaded().artifactSha256 = hash(bytes);
  metadata.digest = `sha256:${hash(bytes)}`; metadata.size_in_bytes = bytes.length;
  f.responses.splice(0, 3, Buffer.from(JSON.stringify(metadata)), bytes, Buffer.from(JSON.stringify(metadata)));
}
async function scenarios(t: TestContext, kinds: string[], run: (kind: string, t: TestContext) => Promise<void>) {
  await Promise.all(kinds.map(kind => t.test(kind, t => run(kind, t))));
}

test("one durable upload, complete gzip/STORE artifact audit, one exposure and store confirmation", async t => {
  const f = await fixture(t), confirmed = await f.run();
  assert.deepEqual(f.events, ["upload", "read:repos/Synthetic/library/actions/artifacts/11",
    "read:repos/Synthetic/library/actions/artifacts/11/zip", "read:repos/Synthetic/library/actions/artifacts/11", "expose"]);
  assert.equal(confirmed.state.pending, null);
  assert.equal(confirmed.state.confirmed?.artifactId, 11);
  assert.equal(confirmed.state.confirmed?.artifactZipSha256, hash(f.responses[1]!));
  assert.deepEqual(await f.peer.load(f.initial), confirmed);
  let bundles = 0, items = 0;
  for (const [path, bytes] of f.files()) {
    if (path.endsWith(".zip")) {
      bundles++;
      for (const member of decodeZipStore(bytes, {
        maxMembers: policy.transferPlanning.maxBundleMembers, maxArchiveBytes: policy.transferPlanning.maxBundleEncodedBytes
      })) assert.deepEqual(member.bytes, f.files().get(`data/canonical/${member.path}`));
    } else if (path.endsWith(".json.gz") && JSON.parse(gunzipSync(bytes).toString("utf8")).format === "daasavaani-lyric") items++;
  }
  assert.equal(bundles, 1); assert.equal(items, 2);
});

test("entry inputs, retained upload context and returned identity cannot substitute the audit or exposure", async t => {
  const f = await fixture(t), expected = f.prepared.manifest.sha256;
  let retained: StagedSnapshotDeployment | undefined;
  const deployment = f.run(async staged => {
    retained = staged;
    const result = await f.upload(staged);
    staged.candidate.sequence = 99; staged.candidate.manifestSha256 = "0".repeat(64);
    staged.preflight.sequence = 99; staged.preflight.manifestSha256 = "0".repeat(64);
    staged.siteDirectory = "substitute"; staged.snapshotDirectory = "substitute";
    return result;
  }, async admitted => {
    assert.equal(admitted.candidate.sequence, 1);
    assert.equal(admitted.preflight.sequence, 1);
    assert.equal(admitted.candidate.manifestSha256, expected);
    assert.equal(admitted.siteDirectory, f.site);
    assert.equal(admitted.snapshotDirectory, f.snapshots);
    assert.equal(admitted.artifact.artifact.artifactId, 11);
    assert.ok(Object.isFrozen(admitted.artifact.artifact));
    return f.expose(admitted);
  }, async (endpoint, limits) => {
    f.uploaded().artifactId = 999; f.uploaded().artifactSha256 = "0".repeat(64);
    retained!.candidate.sourceCommit = "0".repeat(40);
    return f.reader(endpoint, limits);
  });
  f.reserved.state.pending!.sequence = 44;
  f.prepared.plan.sourceCommit = "0".repeat(40); f.prepared.manifest.sha256 = "0".repeat(64);
  for (const bytes of f.prepared.artifacts.values()) bytes.fill(0);
  f.prepared.artifacts.clear(); f.safety.maxDescriptorBytes = 0; f.hostingPolicy.maxHostedBytes = 0;
  Object.assign(f.authority, { repository: "Substitute/elsewhere", publisherRunId: 999, maxArchiveBytes: 1,
    publisherHeadCommit: "0".repeat(40), publisherBranch: "substitute" });
  assert.equal((await deployment).state.confirmed?.manifestSha256, expected);
});

test("uploaded missing, extra, changed or wrong-prefix contents and broken archive cannot expose", { concurrency: 4 }, async t => {
  await scenarios(t, ["missing", "extra", "changed", "prefix", "archive-hash"], async (kind, t) => {
    const f = await fixture(t);
    await assert.rejects(f.run(async staged => {
      const result = await f.upload(staged), files = f.files(), first = files.keys().next().value!;
      if (kind === "missing") files.delete(first);
      if (kind === "extra") files.set("private.md", Buffer.from("Synthetic forbidden extra"));
      if (kind === "changed") files.set(first, Buffer.from("Synthetic corruption"));
      if (kind === "prefix") {
        for (const [path, bytes] of [...files]) { files.delete(path); files.set(path.replace("data/canonical", "wrong"), bytes); }
      }
      if (kind === "archive-hash") f.responses[1]![0] = f.responses[1]![0]! ^ 1;
      else replaceArchive(f, files);
      return result;
    }));
    await f.uncertain();
  });
});

test("metadata/authority changes and all explicit archive read/contents limits fail closed", { concurrency: 4 }, async t => {
  await scenarios(t, ["id", "name", "digest", "expired", "size_in_bytes", "run", "repository", "head-repository",
    "branch", "head", "after", "archive-limit", "metadata-limit", "tar-limit", "file-limit", "read-failure"], async (kind, t) => {
      const f = await fixture(t);
      if (kind === "metadata-limit") f.authority.maxMetadataBytes = 1;
      if (kind === "archive-limit") f.authority.maxArchiveBytes = 1;
      if (kind === "tar-limit") f.authority.maxTarBytes = 1;
      if (kind === "file-limit") f.authority.maxFiles = 1;
      await assert.rejects(f.run(async staged => {
        const result = await f.upload(staged), metadata = JSON.parse(f.responses[0]!.toString("utf8"));
        if (kind === "id") metadata.id++;
        if (kind === "name") metadata.name = "other";
        if (kind === "digest") metadata.digest = `sha256:${"0".repeat(64)}`;
        if (kind === "expired") metadata.expired = true;
        if (kind === "size_in_bytes") metadata.size_in_bytes++;
        if (kind === "run") metadata.workflow_run.id++;
        if (kind === "repository") metadata.workflow_run.repository_id++;
        if (kind === "head-repository") metadata.workflow_run.head_repository_id++;
        if (kind === "branch") metadata.workflow_run.head_branch = "other";
        if (kind === "head") metadata.workflow_run.head_sha = "0".repeat(40);
        if (kind === "after") metadata.workflow_run.id++;
        f.responses[kind === "after" ? 2 : 0] = Buffer.from(JSON.stringify(metadata));
        return result;
      }, f.expose, kind === "read-failure" ? async () => { throw new Error("Synthetic read failure"); } : f.reader));
      await f.uncertain();
  });
});

test("upload result has a closed data-only ID/SHA schema, never an authority/prefix selector", { concurrency: 4 }, async t => {
  await scenarios(t, ["extra", "missing", "id", "sha", "getter", "symbol"], async (kind, t) => {
    const f = await fixture(t);
    await assert.rejects(f.run(async staged => {
      const result: Record<string | symbol, unknown> = { ...await f.upload(staged) };
      if (kind === "extra") result.repository = "Other/repo";
      if (kind === "missing") delete result.artifactSha256;
      if (kind === "id") result.artifactId = 0;
      if (kind === "sha") result.artifactSha256 = "invalid";
      if (kind === "getter") Object.defineProperty(result, "artifactId", { get() { throw new Error("Must not invoke getter"); } });
      if (kind === "symbol") result[Symbol("prefix")] = "other";
      return result as unknown as UploadedSnapshotArtifact;
    }), /only the observed/);
    assert.equal(f.events.filter(event => event.startsWith("read:")).length, 0);
    await f.uncertain();
  });
});

test("local admission failures never start remotely; stale durable boundary never uploads", { concurrency: 4 }, async t => {
  await scenarios(t, ["bytes", "bounds", "headroom", "prefix", "authority", "stale"], async (kind, t) => {
    const f = await fixture(t);
    if (kind === "bytes") f.prepared.artifacts.get(f.prepared.manifest.path)!.fill(0);
    if (kind === "bounds") f.safety.maxDescriptorBytes = 0;
    if (kind === "headroom") f.hostingPolicy.maxHostedBytes = 1;
    if (kind === "authority") Object.assign(f.authority, { snapshotPrefix: "other" });
    const stale = kind === "stale" ? await f.peer.update(f.reserved, { kind: "cancel" }) : undefined;
    await assert.rejects(kind === "prefix"
      ? deployCanonicalSnapshotWithArtifact(f.store, f.reserved, f.prepared, f.safety, f.site, join(f.site, "..", "outside"),
        f.hostingPolicy, f.authority, f.upload, f.expose, f.reader)
      : f.run());
    assert.deepEqual(f.durable(), stale ?? f.reserved);
    assert.deepEqual(f.events, []);
  });
});

test("upload, exposure, receipt and confirmation failures retain uncertainty without replay", { concurrency: 4 }, async t => {
  await scenarios(t, ["upload", "exposure", "receipt", "receipt-artifact", "receipt-sha", "receipt-run", "confirmation"], async (kind, t) => {
    const f = await fixture(t);
    await assert.rejects(f.run(async staged => {
      const result = await f.upload(staged);
      if (kind === "upload") throw new Error("Synthetic upload outcome unknown");
      return result;
    }, async admitted => {
      const receipt = await f.expose(admitted);
      if (kind === "exposure") throw new Error("Synthetic exposure outcome unknown");
      if (kind === "receipt") receipt.sequence++;
      if (kind === "receipt-artifact") receipt.artifactId++;
      if (kind === "receipt-sha") receipt.artifactZipSha256 = "0".repeat(64);
      if (kind === "receipt-run") receipt.runId++;
      if (kind === "confirmation") await writeFile(join(f.remote, "hooks", "pre-receive"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      return receipt;
    }));
    const current = await f.uncertain(kind === "upload" ? 0 : 1);
    await assert.rejects(deployCanonicalSnapshotWithArtifact(f.store, current, f.prepared, f.safety,
      join(f.site, "retry"), join(f.site, "retry", "data"), f.hostingPolicy, f.authority, f.upload, f.expose, f.reader), /reconcile/);
    assert.equal(f.events.filter(event => event === "upload").length, 1);
  });
});
