import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PublicationLedgerGitStore, type LedgerGitCommand, type LedgerGitOptions, type LedgerGitSnapshot } from "./publication-ledger-git.js";
import { deployCanonicalSnapshot, reserveCanonicalSnapshotInGit } from "./snapshot-deployment.js";
import { hostingSettings } from "./hosted-preflight.js";
import { canonical, deterministicGzip } from "./publisher.js";
import { prepareBaselineInitializationReview } from "./semantic-baseline.js";
import { prepareCanonicalSnapshot, reserveCanonicalSnapshot, bindCanonicalSnapshot, readSnapshotSettings } from "./snapshot-producer.js";
import {
  emptyPublicationLedger, encodePublicationLedger, initializePublicationLedger, preparePublication, publicationLedgerFingerprint,
  type PendingPublication, type PublicationReceipt
} from "./publication-ledger.js";

const stateRef = "refs/heads/publication-state", sourceCommit = "c".repeat(40), manifest = "a".repeat(64);
const early = "2026-10-25T01:00:00.000Z", later = "2026-10-25T02:00:00.000Z";
const logical = { lyricId: "11111111-1111-4111-8111-111111111111", logicalSha256: "1".repeat(64) };
const trailer = "\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>\n";
function git(directory: string, args: string[], input?: Uint8Array | string): string {
  return execFileSync("git", [`--git-dir=${directory}`, "-c", "commit.gpgsign=false", ...args], {
    input, encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "Synthetic ledger test", GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Synthetic ledger test", GIT_COMMITTER_EMAIL: "test@example.invalid" }
  }).trim();
}
function commitBlob(directory: string, encoded: Uint8Array, parent?: string, mode = "100644", name = "ledger.json") {
  const blob = git(directory, ["hash-object", "-w", "--stdin"], encoded);
  const tree = git(directory, ["mktree"], `${mode} blob ${blob}\t${name}\n`);
  return git(directory, ["commit-tree", tree, ...(parent ? ["-p", parent] : [])], "Synthetic state fixture" + trailer);
}
async function fixture(t: TestContext, initialState = emptyPublicationLedger()) {
  const root = await mkdtemp(join(tmpdir(), "daasavaani-ledger-git-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const remote = join(root, "remote.git"), client = join(root, "client.git"), other = join(root, "other.git");
  for (const directory of [remote, client, other]) git(directory, ["init", "--bare", "--initial-branch=fixture-unused"]);
  for (const directory of [client, other]) git(directory, ["remote", "add", "origin", remote]);
  const initial = commitBlob(remote, encodePublicationLedger(initialState));
  git(remote, ["update-ref", stateRef, initial, "0".repeat(40)]);
  const options: LedgerGitOptions = {
    repositoryDirectory: client, remoteName: "origin", stateRef, maxEncodedBytes: 1048576, gitTimeoutMs: 30000
  };
  return {
    remote, client, other, initial, options, store: new PublicationLedgerGitStore(options),
    peer: new PublicationLedgerGitStore({ ...options, repositoryDirectory: other })
  };
}
function plan(snapshot: LedgerGitSnapshot, publishedAt = early) {
  return preparePublication(snapshot.state, publicationLedgerFingerprint(snapshot.state), {
    logicalProjection: snapshot.state.logicalProjection, items: [logical], publishedAt, sourceCommit
  });
}
function proof(candidate: PendingPublication): PublicationReceipt {
  return {
    sequence: candidate.sequence, manifestSha256: candidate.manifestSha256, sourceCommit: candidate.sourceCommit,
    publishedAt: candidate.publishedAt, confirmedAt: later, runId: 1, runAttempt: 1,
    deploymentId: 2, statusId: 3, artifactId: 4, artifactZipSha256: "d".repeat(64)
  };
}
async function rejectPush(remote: string) {
  const path = join(remote, "hooks", "pre-receive");
  await writeFile(path, "#!/bin/sh\necho 'synthetic-sensitive-diagnostic' >&2\nexit 1\n", { mode: 0o755 });
  return path;
}

async function snapshotFixture(t: TestContext) {
  const f = await fixture(t), base = await f.store.load(f.initial), { policy, bounds } = await readSnapshotSettings();
  const prepared = prepareCanonicalSnapshot(base.state, publicationLedgerFingerprint(base.state), {
    sourceCommit, publishedAt: early, items: [{
      format: "daasavaani-lyric", formatVersion: 1, lyricId: logical.lyricId, canonicalScript: "kn",
      title: "Synthetic staged deployment", tags: [], lines: [{ kind: "line", lineId: logical.lyricId, text: "Synthetic permitted fixture" }]
    }]
  }, policy, bounds);
  const site = join(f.client, "candidate"), snapshots = join(site, "snapshots"), hosting = await hostingSettings();
  return { ...f, base, prepared, bounds, site, snapshots, hosting };
}
async function stagedFixture(t: TestContext) {
  const f = await snapshotFixture(t);
  const reserved = await reserveCanonicalSnapshotInGit(f.store, f.base, f.prepared, f.bounds);
  return { ...f, reserved };
}

test("durable reservation admits only fully verified descriptor/artifact bytes before consuming sequence or writing Git state", async t => {
  const f = await snapshotFixture(t);
  await assert.rejects(reserveCanonicalSnapshotInGit(f.store, f.base, f.prepared, { ...f.bounds, maxDescriptorBytes: 1 }), /Descriptor/);
  const damaged = { ...f.prepared, artifacts: new Map(f.prepared.artifacts) };
  damaged.artifacts.set(f.prepared.manifest.path, Buffer.alloc(damaged.artifacts.get(f.prepared.manifest.path)!.length));
  await assert.rejects(reserveCanonicalSnapshotInGit(f.store, f.base, damaged, f.bounds), /identity\/size/);
  assert.deepEqual(await f.peer.load(f.initial), f.base);
  assert.equal(git(f.remote, ["rev-list", "--count", stateRef]), "1");
  assert.equal(f.base.state.lastSequence, 0);
  const admitted = reserveCanonicalSnapshot(f.base.state, publicationLedgerFingerprint(f.base.state), f.prepared, f.bounds).state;
  const bound = bindCanonicalSnapshot(admitted, publicationLedgerFingerprint(admitted), f.prepared, f.bounds);
  const exact = { ...f.bounds, maxDescriptorBytes: bound.descriptorBytes.length };
  const reserved = await reserveCanonicalSnapshotInGit(f.store, f.base, f.prepared, exact);
  assert.equal(reserved.state.pending?.sequence, 1);
  assert.equal(reserved.state.lastSequence, 1);
  assert.deepEqual(await reserveCanonicalSnapshotInGit(f.store, reserved, f.prepared, exact), reserved);
  assert.equal(git(f.remote, ["rev-list", "--count", stateRef]), "2");
});

test("durable snapshot reservation rejects stale/server-blocked writes and never retries or rebases", async t => {
  for (const outcome of ["stale", "rejected"]) {
    const f = await snapshotFixture(t);
    if (outcome === "stale") await f.peer.update(f.base, { kind: "reserve", plan: f.prepared.plan, manifestSha256: f.prepared.manifest.sha256 });
    else await rejectPush(f.remote);
    await assert.rejects(reserveCanonicalSnapshotInGit(f.store, f.base, f.prepared, f.bounds), /Stale|Git conditional push failed/);
    assert.equal(git(f.remote, ["rev-list", "--count", stateRef]), outcome === "stale" ? "2" : "1");
  }
});

test("verified transport-identical snapshot no-op consumes no sequence or Git commit after genuine synthetic confirmation", async t => {
  const f = await stagedFixture(t);
  const confirmed = await f.store.deployReserved(f.reserved, async pending => proof(pending));
  const next = prepareCanonicalSnapshot(confirmed.state, publicationLedgerFingerprint(confirmed.state), {
    sourceCommit, publishedAt: later, items: [{
      format: "daasavaani-lyric", formatVersion: 1, lyricId: logical.lyricId, canonicalScript: "kn",
      title: "Synthetic staged deployment", tags: [], lines: [{ kind: "line", lineId: logical.lyricId, text: "Synthetic permitted fixture" }]
    }]
  }, (await readSnapshotSettings()).policy, f.bounds);
  const count = git(f.remote, ["rev-list", "--count", stateRef]);
  assert.deepEqual(await reserveCanonicalSnapshotInGit(f.store, confirmed, next, f.bounds), confirmed);
  assert.equal(git(f.remote, ["rev-list", "--count", stateRef]), count);
  assert.equal(confirmed.state.lastSequence, 1);
});

test("durable reservation captures validated plan/artifact bytes before asynchronous Git work", async t => {
  const f = await snapshotFixture(t), digest = f.prepared.manifest.sha256;
  const expectedPlan = canonical(f.prepared.plan), limits = { ...f.bounds };
  const reserving = reserveCanonicalSnapshotInGit(f.store, f.base, f.prepared, limits);
  f.prepared.artifacts.get(f.prepared.manifest.path)!.fill(0);
  f.prepared.plan.sourceCommit = "e".repeat(40);
  f.base.state.lastSequence = 99;
  limits.maxDescriptorBytes = 0;
  const result = await reserving;
  assert.equal(result.state.pending?.manifestSha256, digest);
  assert.equal(result.state.pending?.sourceCommit, sourceCommit);
  assert.equal(result.state.lastSequence, 1);
  const { phase: _phase, sequence: _sequence, manifestSha256: _manifest, ...plan } = result.state.pending!;
  assert.equal(canonical(plan), expectedPlan);
});

test("staged deployment handoff independently proves durable phase before exposing exact filesystem bytes and confirming receipt", async t => {
  const f = await stagedFixture(t), before = canonical(f.prepared.plan);
  const expectedArtifacts = new Map([...f.prepared.artifacts].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  let calls = 0;
  const confirmed = await deployCanonicalSnapshot(f.store, f.reserved, f.prepared, f.bounds, f.site, f.snapshots, f.hosting, async staged => {
    calls++;
    const durable = await f.peer.load(f.initial);
    assert.equal(durable.state.pending?.phase, "deploying");
    assert.deepEqual(staged.candidate, durable.state.pending);
    assert.equal(staged.siteDirectory, f.site);
    assert.equal(staged.snapshotDirectory, f.snapshots);
    assert.equal(staged.preflight.stage, "staged-snapshot");
    assert.equal(staged.preflight.manifestSha256, f.prepared.manifest.sha256);
    assert.equal(staged.preflight.sequence, staged.candidate.sequence);
    const descriptor = JSON.parse((await readFile(join(staged.snapshotDirectory, "latest.json"))).toString("utf8"));
    assert.equal(descriptor.sequence, staged.candidate.sequence);
    for (const [path, bytes] of f.prepared.artifacts) {
      assert.deepEqual(await readFile(join(staged.snapshotDirectory, ...path.split("/"))), bytes);
    }
    return proof(staged.candidate);
  });
  assert.equal(calls, 1);
  assert.equal(confirmed.state.pending, null);
  assert.equal(confirmed.state.confirmed?.manifestSha256, f.prepared.manifest.sha256);
  assert.equal(canonical(f.prepared.plan), before);
  assert.deepEqual(f.prepared.artifacts, expectedArtifacts);
  assert.deepEqual((await f.peer.load(f.initial)).state, confirmed.state);
});

test("staging failure leaves the reservation cancellable and never enters a deployment callback", async t => {
  const f = await stagedFixture(t);
  let calls = 0;
  await assert.rejects(deployCanonicalSnapshot(f.store, f.reserved, f.prepared, f.bounds, f.site, f.snapshots,
    { ...f.hosting, maxHostedBytes: 1 }, async staged => { calls++; return proof(staged.candidate); }), /headroom/);
  assert.equal(calls, 0);
  assert.deepEqual(await f.peer.load(f.initial), f.reserved);
  await assert.rejects(lstat(f.site), { code: "ENOENT" });
  assert.equal((await f.store.update(f.reserved, { kind: "cancel" })).state.pending, null);
});

test("stale or server-rejected deployment boundaries cannot invoke exposure even after successful local staging", async t => {
  for (const outcome of ["stale", "rejected"]) {
    const f = await stagedFixture(t);
    if (outcome === "stale") await f.peer.update(f.reserved, { kind: "cancel" });
    else await rejectPush(f.remote);
    let calls = 0;
    await assert.rejects(deployCanonicalSnapshot(f.store, f.reserved, f.prepared, f.bounds, f.site, f.snapshots, f.hosting,
      async staged => { calls++; return proof(staged.candidate); }), /Stale|Git conditional push failed/);
    assert.equal(calls, 0);
    assert.ok((await readdir(f.site)).length > 0);
    const durable = await f.peer.load(f.initial);
    assert.equal(durable.state.pending?.phase ?? null, outcome === "stale" ? null : "reserved");
  }
});

test("callback failure leaves durable started state uncertain and forbids replay while preserving staged bytes", async t => {
  const f = await stagedFixture(t);
  let calls = 0;
  await assert.rejects(deployCanonicalSnapshot(f.store, f.reserved, f.prepared, f.bounds, f.site, f.snapshots, f.hosting,
    async () => { calls++; throw new Error("Synthetic exposure outcome unknown"); }), /outcome unknown/);
  const durable = await f.peer.load(f.initial);
  assert.equal(durable.state.pending?.phase, "deploying");
  const bytes = await readFile(join(f.snapshots, "latest.json"));
  const retrySite = join(f.client, "retry-candidate");
  await assert.rejects(deployCanonicalSnapshot(f.store, durable, f.prepared, f.bounds, retrySite,
    join(retrySite, "snapshots"), f.hosting, async staged => { calls++; return proof(staged.candidate); }), /reconcile/);
  await assert.rejects(lstat(retrySite), { code: "ENOENT" });
  assert.deepEqual(await readFile(join(f.snapshots, "latest.json")), bytes);
  assert.equal(calls, 1);
});

test("failed confirmation after a valid exposure callback remains pending for explicit evidence reconciliation", async t => {
  const f = await stagedFixture(t);
  let receipt: PublicationReceipt | undefined;
  await assert.rejects(deployCanonicalSnapshot(f.store, f.reserved, f.prepared, f.bounds, f.site, f.snapshots, f.hosting,
    async staged => {
      receipt = proof(staged.candidate);
      await rejectPush(f.remote);
      return receipt;
    }), /Git conditional push failed/);
  const durable = await f.peer.load(f.initial);
  assert.equal(durable.state.pending?.phase, "deploying");
  assert.equal(durable.state.confirmed, null);
  await rm(join(f.remote, "hooks", "pre-receive"));
  assert.ok(receipt);
  const confirmed = await f.store.update(durable, { kind: "confirm", receipt });
  assert.equal(confirmed.state.pending, null);
});

test("post-boundary filesystem corruption fails final preflight before callback and conservatively remains started", async t => {
  const f = await stagedFixture(t);
  class CorruptingStore extends PublicationLedgerGitStore {
    override async update(snapshot: LedgerGitSnapshot, command: LedgerGitCommand): Promise<LedgerGitSnapshot> {
      const result = await super.update(snapshot, command);
      if (command.kind === "begin-deployment") await writeFile(join(f.snapshots, "latest.json"), "Synthetic corrupted descriptor");
      return result;
    }
  }
  let calls = 0;
  await assert.rejects(deployCanonicalSnapshot(new CorruptingStore(f.options), f.reserved, f.prepared, f.bounds,
    f.site, f.snapshots, f.hosting, async staged => { calls++; return proof(staged.candidate); }), /bound snapshot bytes/);
  assert.equal(calls, 0);
  const durable = await f.peer.load(f.initial);
  assert.equal(durable.state.pending?.phase, "deploying");
  await assert.rejects(f.store.update(durable, { kind: "cancel" }), /started|deploy/i);
});

test("handoff captures caller buffers and state before awaits so later mutation cannot change exposure", async t => {
  const f = await stagedFixture(t), digest = f.prepared.manifest.sha256;
  const safety = { ...f.bounds }, hosting = { ...f.hosting };
  const deployment = deployCanonicalSnapshot(f.store, f.reserved, f.prepared, safety, f.site, f.snapshots, hosting,
    async staged => {
      assert.equal(staged.candidate.manifestSha256, digest);
      assert.equal(staged.preflight.sequence, 1);
      return proof(staged.candidate);
    });
  f.prepared.artifacts.get(f.prepared.manifest.path)!.fill(0);
  f.prepared.plan.sourceCommit = "e".repeat(40);
  f.reserved.state.pending!.sequence++;
  safety.maxDescriptorBytes = 0;
  hosting.maxHostedBytes = 0;
  assert.equal((await deployment).state.confirmed?.manifestSha256, digest);
});

test("real Git persistence creates one-file direct-child commits and writes nothing for exact retries/no-ops", async t => {
  const f = await fixture(t), base = await f.store.load(f.initial), candidate = plan(base);
  const reserved = await f.store.update(base, { kind: "reserve", plan: candidate, manifestSha256: manifest });
  assert.equal(git(f.remote, ["rev-parse", stateRef]), reserved.gitTip);
  assert.equal(git(f.remote, ["rev-parse", `${reserved.gitTip}^`]), base.gitTip);
  assert.equal(git(f.remote, ["ls-tree", "--name-only", reserved.gitTip]), "ledger.json");
  assert.equal(git(f.remote, ["log", "-1", "--format=%B", reserved.gitTip]).endsWith(trailer.trim()), true);
  assert.deepEqual((await f.peer.load(f.initial)).state, reserved.state);
  assert.deepEqual(await f.store.update(reserved, { kind: "reserve", plan: candidate, manifestSha256: manifest }), reserved);
  let calls = 0;
  const confirmed = await f.store.deployReserved(reserved, async pending => {
    calls++;
    const durable = await f.peer.load(reserved.gitTip);
    assert.equal(durable.state.pending?.phase, "deploying");
    assert.equal(durable.state.items.length, 0);
    assert.equal(git(f.remote, ["rev-parse", `${durable.gitTip}^`]), reserved.gitTip);
    return proof(pending);
  });
  assert.equal(calls, 1);
  assert.equal(confirmed.state.pending, null);
  assert.equal(confirmed.state.items[0]?.firstPublishedAt, early);
  assert.ok(confirmed.state.confirmed);
  assert.deepEqual(await f.store.update(confirmed, { kind: "confirm", receipt: confirmed.state.confirmed }), confirmed);
  const noOp = await f.store.update(confirmed, { kind: "reserve", plan: plan(confirmed, later), manifestSha256: manifest });
  assert.deepEqual(noOp, confirmed);
  assert.equal(git(f.remote, ["rev-list", "--count", stateRef]), "4");
  assert.equal(git(f.remote, ["for-each-ref", "--format=%(refname)"]), stateRef);
  assert.equal(git(f.client, ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/tags"]), "");
});

test("actual generated snapshot binds independently read durable reservation before a synthetic exposure callback", async t => {
  const f = await fixture(t), base = await f.store.load(f.initial), { policy, bounds } = await readSnapshotSettings();
  const prepared = prepareCanonicalSnapshot(base.state, publicationLedgerFingerprint(base.state), {
    sourceCommit, publishedAt: early, items: [{
      format: "daasavaani-lyric", formatVersion: 1, lyricId: logical.lyricId, canonicalScript: "kn",
      title: "Synthetic snapshot", tags: [], lines: [{ kind: "line", lineId: logical.lyricId, text: "Synthetic snapshot" }]
    }]
  }, policy, bounds);
  const checked = reserveCanonicalSnapshot(base.state, publicationLedgerFingerprint(base.state), prepared, bounds);
  const reserved = await f.store.update(base, { kind: "reserve", plan: prepared.plan, manifestSha256: prepared.manifest.sha256 });
  assert.deepEqual(reserved.state, checked.state);
  const confirmed = await f.store.deployReserved(reserved, async pending => {
    const durable = await f.peer.load(reserved.gitTip);
    assert.equal(durable.state.pending?.phase, "deploying");
    const bound = bindCanonicalSnapshot(durable.state, publicationLedgerFingerprint(durable.state), prepared, bounds);
    assert.equal(bound.descriptor.sequence, pending.sequence);
    assert.equal(bound.descriptor.manifest.sha256, pending.manifestSha256);
    assert.equal(createHash("sha256").update(bound.artifacts.get(bound.descriptor.manifest.path)!).digest("hex"), pending.manifestSha256);
    return proof(pending);
  });
  const next = prepareCanonicalSnapshot(confirmed.state, publicationLedgerFingerprint(confirmed.state), {
    sourceCommit, publishedAt: later, items: [{
      format: "daasavaani-lyric", formatVersion: 1, lyricId: logical.lyricId, canonicalScript: "kn",
      title: "Synthetic snapshot", tags: [], lines: [{ kind: "line", lineId: logical.lyricId, text: "Synthetic snapshot" }]
    }]
  }, policy, bounds);
  assert.equal(reserveCanonicalSnapshot(confirmed.state, publicationLedgerFingerprint(confirmed.state), next, bounds).outcome, "noop");
  assert.equal((await f.peer.load(confirmed.gitTip)).state.confirmed?.manifestSha256, prepared.manifest.sha256);
});

test("competing independent Git writers cannot overwrite or consume the same reservation twice", async t => {
  const f = await fixture(t), base = await f.store.load(f.initial), peerBase = await f.peer.load(f.initial);
  const outcomes = await Promise.allSettled([
    f.store.update(base, { kind: "reserve", plan: plan(base), manifestSha256: manifest }),
    f.peer.update(peerBase, { kind: "reserve", plan: plan(peerBase), manifestSha256: "b".repeat(64) })
  ]);
  assert.equal(outcomes.filter(value => value.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(value => value.status === "rejected").length, 1);
  const durable = await f.store.load(f.initial);
  assert.equal(durable.state.lastSequence, 1);
  assert.equal(git(f.remote, ["rev-list", "--count", stateRef]), "2");
  assert.ok(durable.state.pending);
  const { manifestSha256, sequence: _sequence, phase: _phase, ...pendingPlan } = durable.state.pending;
  assert.deepEqual(await f.peer.update(durable, { kind: "reserve", plan: pendingPlan, manifestSha256 }), durable);
});

test("durably recorded never-started cancellation preserves a gap across independent process state", async t => {
  const f = await fixture(t), base = await f.store.load(f.initial);
  const reserved = await f.store.update(base, { kind: "reserve", plan: plan(base), manifestSha256: manifest });
  const cancelled = await f.peer.update(await f.peer.load(reserved.gitTip), { kind: "cancel" });
  assert.equal(cancelled.state.lastSequence, 1);
  assert.deepEqual(cancelled.state.items, []);
  const reloaded = await f.store.load(cancelled.gitTip);
  const retried = await f.store.update(reloaded, { kind: "reserve", plan: plan(reloaded, later), manifestSha256: manifest });
  assert.equal(retried.state.lastSequence, 2);
  assert.equal(retried.state.pending?.items[0]?.firstPublishedAt, later);
});

test("crash after deployment boundary leaves durable uncertainty and restart cannot repeat the side effect", async t => {
  const f = await fixture(t), base = await f.store.load(f.initial);
  const reserved = await f.store.update(base, { kind: "reserve", plan: plan(base), manifestSha256: manifest });
  let calls = 0;
  await assert.rejects(f.store.deployReserved(reserved, async () => {
    calls++;
    throw new Error("Synthetic connection loss after possible exposure");
  }), /connection loss/);
  const restored = await f.peer.load(reserved.gitTip);
  assert.equal(restored.state.pending?.phase, "deploying");
  assert.equal(restored.state.lastSequence, 1);
  await assert.rejects(f.peer.deployReserved(restored, async pending => { calls++; return proof(pending); }), /reconcile/);
  await assert.rejects(f.peer.update(restored, { kind: "cancel" }), /never-started/);
  await assert.rejects(f.store.deployReserved(reserved, async pending => { calls++; return proof(pending); }), /Stale/);
  assert.equal(calls, 1);
  assert.ok(restored.state.pending);
  const confirmed = await f.peer.update(restored, { kind: "confirm", receipt: proof(restored.state.pending) });
  assert.equal(confirmed.state.pending, null);
  assert.equal(confirmed.state.lastSequence, 1);
});

test("a server-rejected boundary write stops before deployment and redacts remote diagnostics", async t => {
  const f = await fixture(t), base = await f.store.load(f.initial);
  const reserved = await f.store.update(base, { kind: "reserve", plan: plan(base), manifestSha256: manifest });
  await rejectPush(f.remote);
  let calls = 0;
  await assert.rejects(f.store.deployReserved(reserved, async pending => { calls++; return proof(pending); }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /conditional push failed/);
    assert.equal(error.message.includes("synthetic-sensitive-diagnostic"), false);
    assert.equal(error.message.includes(f.remote), false);
    return true;
  });
  assert.equal(calls, 0);
  assert.equal(git(f.remote, ["rev-parse", stateRef]), reserved.gitTip);
  assert.equal((await f.peer.load(reserved.gitTip)).state.pending?.phase, "reserved");
});

test("failed confirmation write preserves started candidate for explicit receipt reconciliation", async t => {
  const f = await fixture(t), base = await f.store.load(f.initial);
  const reserved = await f.store.update(base, { kind: "reserve", plan: plan(base), manifestSha256: manifest });
  let saved: PublicationReceipt | undefined, hook: string | undefined;
  await assert.rejects(f.store.deployReserved(reserved, async pending => {
    saved = proof(pending);
    hook = await rejectPush(f.remote);
    return saved;
  }), /conditional push/);
  const uncertain = await f.peer.load(reserved.gitTip);
  assert.equal(uncertain.state.pending?.phase, "deploying");
  assert.deepEqual(uncertain.state.items, []);
  assert.ok(saved);
  assert.ok(hook);
  await rm(hook);
  const confirmed = await f.peer.update(uncertain, { kind: "confirm", receipt: saved });
  assert.equal(confirmed.state.pending, null);
});

test("deleted and rewritten remote refs are refused, never recreated or adopted from a new root", async t => {
  const f = await fixture(t);
  await f.store.load(f.initial);
  git(f.remote, ["update-ref", "-d", stateRef, f.initial]);
  await assert.rejects(f.store.load(f.initial), /missing/);
  assert.equal(git(f.remote, ["for-each-ref", "--format=%(refname)"]), "");
  const unrelated = commitBlob(f.remote, encodePublicationLedger({ ...emptyPublicationLedger(), lastSequence: 1 }));
  git(f.remote, ["update-ref", stateRef, unrelated, "0".repeat(40)]);
  await assert.rejects(f.store.load(f.initial), /trusted-history/);
  assert.equal(git(f.remote, ["rev-parse", stateRef]), unrelated);
});

test("snapshot tampering and stale tips cannot authorize deployment or an arbitrary state replacement", async t => {
  const f = await fixture(t), base = await f.store.load(f.initial);
  const reserved = await f.store.update(base, { kind: "reserve", plan: plan(base), manifestSha256: manifest });
  const tampered = structuredClone(reserved);
  assert.ok(tampered.state.pending);
  tampered.state.pending.sourceCommit = "e".repeat(40);
  let calls = 0;
  await assert.rejects(f.store.deployReserved(tampered, async pending => { calls++; return proof(pending); }), /does not match/);
  await assert.rejects(f.peer.update(base, { kind: "reserve", plan: plan(base), manifestSha256: manifest }), /Stale/);
  assert.equal(calls, 0);
  assert.equal(git(f.remote, ["rev-parse", stateRef]), reserved.gitTip);
});

test("actual state-byte bounds are checked on read and before any transition is pushed", async t => {
  const f = await fixture(t), encoded = encodePublicationLedger(emptyPublicationLedger());
  const exact = new PublicationLedgerGitStore({ ...f.options, maxEncodedBytes: encoded.length });
  const base = await exact.load(f.initial);
  await assert.rejects(exact.update(base, { kind: "reserve", plan: plan(base), manifestSha256: manifest }), /transition exceeds/);
  assert.equal(git(f.remote, ["rev-parse", stateRef]), f.initial);
  const tooSmall = new PublicationLedgerGitStore({ ...f.options, maxEncodedBytes: encoded.length - 1 });
  await assert.rejects(tooSmall.load(f.initial), /blob exceeds/);
});

test("unexpected trees and noncanonical state blobs fail without remote writes", async t => {
  const f = await fixture(t), encoded = encodePublicationLedger(emptyPublicationLedger());
  let previous = f.initial;
  for (const [bytes, mode, name] of [
    [Buffer.concat([Buffer.from(" "), encoded]), "100644", "ledger.json"],
    [Buffer.from([0xff]), "100644", "ledger.json"],
    [encoded, "100755", "ledger.json"], [encoded, "120000", "ledger.json"], [encoded, "100644", "unexpected.json"]
  ] as const) {
    const next = commitBlob(f.remote, bytes, previous, mode, name);
    git(f.remote, ["update-ref", stateRef, next, previous]);
    previous = next;
    await assert.rejects(f.store.load(f.initial));
    assert.equal(git(f.remote, ["rev-parse", stateRef]), next);
  }
});

test("source branches, unsafe options, non-bare worktrees and split push destinations are rejected", async t => {
  const f = await fixture(t);
  for (const change of [
    { stateRef: "refs/heads/main" }, { stateRef: "refs/heads/validation/test" }, { remoteName: "--mirror" },
    { repositoryDirectory: "relative" }, { maxEncodedBytes: 0 }, { maxEncodedBytes: 1.5 },
    { gitTimeoutMs: 0 }, { gitTimeoutMs: 2147483648 }
  ]) assert.throws(() => new PublicationLedgerGitStore({ ...f.options, ...change }), /options/);
  await assert.rejects(f.store.load("not-a-commit"), /identity/);
  git(f.client, ["config", "core.bare", "false"]);
  await assert.rejects(f.store.load(f.initial), /isolated/);
  git(f.client, ["config", "core.bare", "true"]);
  git(f.client, ["remote", "set-url", "--push", "origin", f.other]);
  await assert.rejects(f.store.load(f.initial), /same single remote/);
  assert.equal(git(f.remote, ["rev-parse", stateRef]), f.initial);
});

test("verified unsequenced baseline persists across real Git writers and first new publication reserves one", async t => {
  const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
  const decoded = Buffer.from(canonical({
    format: "daasavaani-lyric", formatVersion: 1, lyricId: logical.lyricId, canonicalScript: "kn",
    title: "Synthetic bootstrap", tags: [], lines: [{
      kind: "line", lineId: "22222222-2222-4222-8222-222222222222", text: "ಕನ್ನಡ"
    }]
  }));
  const bytes = deterministicGzip(decoded), sha256 = hash(bytes);
  const manifestBytes = deterministicGzip(Buffer.from(canonical({
    format: "daasavaani-lyric-catalog", formatVersion: 1, stage: "prelaunch", requiredCapabilities: ["lyric-preview-v1"],
    catalog: [{ lyricId: logical.lyricId, title: "Synthetic bootstrap", tags: [], item: {
      sha256, path: `objects/${sha256}.json.gz`, encodedBytes: bytes.length, decodedBytes: decoded.length
    } }]
  })));
  const publication = {
    manifestBytes, manifestSha256: hash(manifestBytes), sourceCommit, confirmedAt: early,
    runId: 1, runAttempt: 1, deploymentId: 2, statusId: 3, artifactId: 4, artifactZipSha256: "d".repeat(64)
  };
  const { review } = await prepareBaselineInitializationReview(publication, [publication], async () => bytes, {
    maxManifestEncodedBytes: 8192, maxManifestDecodedBytes: 32768, maxItemEncodedBytes: 4096, maxItemDecodedBytes: 8192
  });
  const baseline = initializePublicationLedger(review, hash(canonical(review) + "\n"));
  const f = await fixture(t, baseline), base = await f.store.load(f.initial);
  assert.equal(base.state.confirmed, null);
  assert.equal(base.state.lastSequence, 0);
  const candidate = preparePublication(base.state, publicationLedgerFingerprint(base.state), {
    logicalProjection: base.state.logicalProjection,
    items: base.state.items.map(({ lyricId, logicalSha256 }) => ({ lyricId, logicalSha256 })),
    publishedAt: later, sourceCommit
  });
  const reserved = await f.store.update(base, { kind: "reserve", plan: candidate, manifestSha256: manifest });
  const confirmed = await f.peer.deployReserved(await f.peer.load(reserved.gitTip), async pending => proof(pending));
  assert.equal(confirmed.state.confirmed?.sequence, 1);
  assert.equal(confirmed.state.baseline?.review.sequence, null);
  assert.deepEqual(confirmed.state.items, baseline.items);
  assert.deepEqual(confirmed.state.baseline, baseline.baseline);
  assert.deepEqual((await f.store.load(f.initial)).state, confirmed.state);
});
