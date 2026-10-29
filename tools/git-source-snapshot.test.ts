import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importSources } from "./source-import.js";
import { parseLyricSource } from "./lyric-source.js";
import { prepareGitCanonicalSourceSnapshot, type GitSourceOptions } from "./git-source-snapshot.js";
import { auditGitHubSourceRun, type GitHubApiReader } from "./github-source-run.js";
import { emptyPublicationLedger, publicationLedgerFingerprint as fingerprint } from "./publication-ledger.js";
import { prepareCanonicalSourceSnapshot, readSnapshotSettings } from "./snapshot-producer.js";

const sourceBounds = { maxSourceFileBytes: 8388608, maxTotalSourceBytes: 67108864 };
const { policy, bounds } = await readSnapshotSettings();
function git(directory: string, args: string[], input?: string): string {
  return execFileSync("git", ["-C", directory, "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], {
    encoding: "utf8", input, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "Synthetic fixture", GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Synthetic fixture", GIT_COMMITTER_EMAIL: "test@example.invalid" }
  }).trim();
}
async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "daasavaani-git-source-test-"));
  t.after(() => rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 }));
  const repository = join(root, "repository"), originals = join(root, "originals");
  await mkdir(repository); await mkdir(originals);
  git(repository, ["init", "--initial-branch=synthetic"]);
  const sources = join(repository, "library");
  await writeFile(join(originals, "permitted.txt"), "ಕನ್ನಡ  \n \t \nಅಕ್ಷರ\n\nkannaDa\n");
  await writeFile(join(originals, "held.txt"), "ಅಕ್ಷರ\n");
  await writeFile(join(originals, "exception.txt"), "Synthetic missing initial Kannada\n");
  await importSources(originals, sources, { ...sourceBounds, reviewHoldReason: "source-import-review" });
  let permitted = "";
  for (const name of (await readdir(sources)).filter(name => name.endsWith(".md"))) {
    const path = join(sources, name), text = await readFile(path, "utf8");
    if (parseLyricSource(text).header.provenance.sourceFile === "permitted.txt") {
      permitted = path;
      await writeFile(path, text.replace("holdReasons:\n    - source-import-review", "holdReasons: []"));
    }
  }
  function commit() {
    git(repository, ["add", "--", "library"]);
    git(repository, ["commit", "--quiet", "-m", "Synthetic source fixture"]);
    return git(repository, ["rev-parse", "HEAD"]);
  }
  const sourceCommit = commit(), state = emptyPublicationLedger();
  const input = { publishedAt: "2026-01-01T00:00:00.000Z", sourceCommit };
  const options: GitSourceOptions = { repositoryDirectory: repository, sourcePath: "library", trustedSourceTip: sourceCommit, gitTimeoutMs: 30000 };
  return { root, repository, sources, permitted, state, input, options, commit,
    prepare: () => prepareGitCanonicalSourceSnapshot(options, sourceBounds, state, fingerprint(state), input, policy, bounds) };
}

test("exact committed receipt/source bytes produce the same canonical artifacts and private counts without modifying checkout", async t => {
  const f = await setup(t), before = git(f.repository, ["status", "--porcelain"]);
  const expected = await prepareCanonicalSourceSnapshot(f.sources, sourceBounds, f.state, fingerprint(f.state), f.input, policy, bounds);
  assert.deepEqual(await f.prepare(), expected);
  assert.equal(expected.held, 1);
  assert.equal(expected.extractionExceptions, 1);
  assert.equal(expected.prepared.plan.sourceCommit, f.input.sourceCommit);
  assert.equal(git(f.repository, ["status", "--porcelain"]), before);
});

test("dirty worktree, staged edits, moved HEAD and untracked files cannot substitute for declared committed sources", async t => {
  const f = await setup(t), expected = await f.prepare();
  const original = await readFile(f.permitted, "utf8");
  await writeFile(f.permitted, original.replace("ಕನ್ನಡ", "ಕನ್ನಡ ಕನ್ನಡ"));
  f.commit();
  await writeFile(f.permitted, "Synthetic invalid dirty source");
  git(f.repository, ["add", "--", "library"]);
  await writeFile(join(f.sources, "untracked.txt"), "Synthetic irrelevant worktree file");
  const status = git(f.repository, ["status", "--porcelain"]), head = git(f.repository, ["rev-parse", "HEAD"]);
  assert.notEqual(head, f.input.sourceCommit);
  git(f.repository, ["replace", f.input.sourceCommit, head]);
  assert.deepEqual(await f.prepare(), expected);
  assert.equal(git(f.repository, ["status", "--porcelain"]), status);
  assert.equal(git(f.repository, ["rev-parse", "HEAD"]), head);
  assert.equal(git(f.repository, ["replace", "-l"]), f.input.sourceCommit);
});

test("explicit commit bytes also work from an isolated bare clone with no checkout", async t => {
  const f = await setup(t), expected = await f.prepare(), bare = join(f.root, "bare.git");
  git(f.repository, ["clone", "--bare", "--quiet", "--no-hardlinks", f.repository, bare]);
  assert.deepEqual(await prepareGitCanonicalSourceSnapshot({ ...f.options, repositoryDirectory: bare },
    sourceBounds, f.state, fingerprint(f.state), f.input, policy, bounds), expected);
});

test("observed source CI tip admits only contained exact committed bytes and hosted mismatches stop before preparation", async t => {
  const f = await setup(t), expected = await f.prepare(), stateBefore = structuredClone(f.state);
  const original = await readFile(f.permitted, "utf8");
  await writeFile(f.permitted, original.replace("ಕನ್ನಡ", "ಕನ್ನಡ ಕನ್ನಡ"));
  const trustedTip = f.commit(), sourceCommit = f.input.sourceCommit;
  assert.notEqual(trustedTip, sourceCommit);
  const authority = {
    repository: "SyntheticOwner/synthetic-library", repositoryId: 101, workflowId: 202,
    workflowPath: ".github/workflows/hygiene.yml", branch: "synthetic", sourceCommit: trustedTip,
    runId: 303, runAttempt: 1, requestTimeoutMs: 10000, maxResponseBytes: 65536
  };
  const ref = { ref: "refs/heads/synthetic", object: { type: "commit", sha: trustedTip } };
  const identity = { id: authority.repositoryId, full_name: authority.repository };
  const run = { id: authority.runId, run_attempt: authority.runAttempt, workflow_id: authority.workflowId,
    path: authority.workflowPath, head_branch: authority.branch, head_sha: trustedTip, event: "push",
    status: "completed", conclusion: "success", repository: { ...identity }, head_repository: { ...identity } };
  const requests: string[] = [];
  const reader = (observedRef = ref, observedRun: unknown = run): GitHubApiReader => async endpoint => {
    requests.push(endpoint);
    return Buffer.from(JSON.stringify(endpoint.includes("/git/ref/") ? observedRef : observedRun));
  };
  let preparationAttempts = 0;
  const observeAndPrepare = async (read: GitHubApiReader, candidate = sourceCommit) => {
    const observed = await auditGitHubSourceRun(authority, read);
    preparationAttempts++;
    return prepareGitCanonicalSourceSnapshot({ ...f.options, trustedSourceTip: observed.sourceCommit },
      sourceBounds, f.state, fingerprint(f.state), { ...f.input, sourceCommit: candidate }, policy, bounds);
  };
  const headBefore = git(f.repository, ["rev-parse", "HEAD"]), statusBefore = git(f.repository, ["status", "--porcelain"]);
  const prepared = await observeAndPrepare(reader());
  assert.deepEqual(prepared, expected);
  assert.equal(prepared.prepared.plan.sourceCommit, sourceCommit);
  assert.equal(preparationAttempts, 1);
  assert.equal(requests.length, 3);
  assert.equal(git(f.repository, ["rev-parse", "HEAD"]), headBefore);
  assert.equal(git(f.repository, ["status", "--porcelain"]), statusBefore);

  requests.length = 0;
  await assert.rejects(observeAndPrepare(reader({ ...ref, object: { ...ref.object, sha: sourceCommit } })), /branch tip/);
  assert.equal(requests.length, 1);
  assert.equal(preparationAttempts, 1);
  for (const mismatch of [
    { head_sha: sourceCommit }, { run_attempt: 2 }, { conclusion: "failure" },
    { head_repository: { id: 102, full_name: "ForkOwner/synthetic-library" } }
  ]) {
    requests.length = 0;
    await assert.rejects(observeAndPrepare(reader(ref, { ...run, ...mismatch })), /expected successful push workflow/);
    assert.equal(requests.length, 2);
    assert.equal(preparationAttempts, 1);
  }

  await writeFile(f.permitted, original.replace("ಕನ್ನಡ", "ಕನ್ನಡ ಕನ್ನಡ ಕನ್ನಡ"));
  const descendant = f.commit();
  requests.length = 0;
  await assert.rejects(observeAndPrepare(reader(), descendant), /Git source snapshot read failed/);
  assert.equal(preparationAttempts, 2);
  assert.equal(requests.length, 3);
  assert.equal(git(f.repository, ["rev-parse", "HEAD"]), descendant);
  assert.equal(git(f.repository, ["status", "--porcelain"]), statusBefore);
  assert.equal(f.input.sourceCommit, sourceCommit);
  assert.deepEqual(f.state, stateBefore);
});

test("committed unexpected files, nested directories, executable blobs, symlinks and missing receipts fail explicitly", async t => {
  for (const kind of ["extra", "nested", "executable", "symlink", "receipt"]) {
    const f = await setup(t);
    if (kind === "extra") await writeFile(join(f.sources, "private.txt"), "Synthetic not public");
    if (kind === "nested") { await mkdir(join(f.sources, "nested")); await writeFile(join(f.sources, "nested", "file"), "Synthetic"); }
    if (kind === "receipt") await rm(join(f.sources, ".source-import.json"));
    if (kind === "executable" || kind === "symlink") {
      const path = `library/${f.permitted.split(/[\\/]/).at(-1)!}`;
      const blob = git(f.repository, ["hash-object", "-w", "--stdin"], "Synthetic blob");
      git(f.repository, ["update-index", "--cacheinfo", `${kind === "executable" ? "100755" : "120000"},${blob},${path}`]);
      git(f.repository, ["commit", "--quiet", "-m", "Synthetic unsupported mode"]);
      f.input.sourceCommit = git(f.repository, ["rev-parse", "HEAD"]);
    } else f.input.sourceCommit = f.commit();
    f.options.trustedSourceTip = f.input.sourceCommit;
    await assert.rejects(f.prepare(), /permits only|receipt is missing/);
  }
});

test("exact actual committed source byte ceilings pass and one byte less fails before blob materialization", async t => {
  const f = await setup(t);
  const sizes = await Promise.all((await readdir(f.sources)).map(async name => (await readFile(join(f.sources, name))).length));
  const maximum = Math.max(...sizes), total = sizes.reduce((a, b) => a + b, 0);
  const prepare = (maxSourceFileBytes: number, maxTotalSourceBytes: number) => prepareGitCanonicalSourceSnapshot(f.options,
    { maxSourceFileBytes, maxTotalSourceBytes }, f.state, fingerprint(f.state), f.input, policy, bounds);
  assert.equal((await prepare(maximum, total)).held, 1);
  await assert.rejects(prepare(maximum - 1, total), /source byte bounds/);
  await assert.rejects(prepare(maximum, total - 1), /source byte bounds/);
});

test("committed malformed held records and receipt mismatches cannot disappear behind hold filtering", async t => {
  const f = await setup(t);
  const original = await readFile(f.permitted, "utf8");
  await writeFile(f.permitted, original.replace(/sha256: [a-f0-9]{64}/, `sha256: ${"e".repeat(64)}`));
  f.input.sourceCommit = f.commit();
  f.options.trustedSourceTip = f.input.sourceCommit;
  await assert.rejects(f.prepare(), /disagrees/);
  await writeFile(f.permitted, original);
  for (const name of (await readdir(f.sources)).filter(name => name.endsWith(".md"))) {
    const path = join(f.sources, name), text = await readFile(path, "utf8");
    if (text.includes("sourceFile: held.txt")) await writeFile(path, text.replace("sourceFormat: 2", "sourceFormat: 99"));
  }
  f.input.sourceCommit = f.commit();
  f.options.trustedSourceTip = f.input.sourceCommit;
  await assert.rejects(f.prepare(), /Invalid draft header/);
});

test("full object identities, safe relative Git paths and explicit positive process/source bounds are mandatory", async t => {
  const f = await setup(t);
  for (const sourceCommit of ["HEAD", f.input.sourceCommit.slice(0, 7), `${f.input.sourceCommit}^{commit}`, "f".repeat(40)]) {
    await assert.rejects(prepareGitCanonicalSourceSnapshot(f.options, sourceBounds, f.state, fingerprint(f.state),
      { ...f.input, sourceCommit }, policy, bounds), /Invalid Git|Git source snapshot read failed/);
  }
  for (const sourcePath of ["../library", "/library", "library/../library", "library\\x", ".", "--help", "library:other"]) {
    await assert.rejects(prepareGitCanonicalSourceSnapshot({ ...f.options, sourcePath }, sourceBounds,
      f.state, fingerprint(f.state), f.input, policy, bounds), /Invalid Git/);
  }
  for (const gitTimeoutMs of [0, -1, 1.5, Infinity, 2147483648]) {
    await assert.rejects(prepareGitCanonicalSourceSnapshot({ ...f.options, gitTimeoutMs }, sourceBounds,
      f.state, fingerprint(f.state), f.input, policy, bounds), /Invalid Git/);
  }
  for (const maximum of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(prepareGitCanonicalSourceSnapshot(f.options, { ...sourceBounds, maxSourceFileBytes: maximum },
      f.state, fingerprint(f.state), f.input, policy, bounds), /source byte bounds/);
  }
  const injected = { ...f.input, items: [] };
  await assert.rejects(prepareGitCanonicalSourceSnapshot(f.options, sourceBounds, f.state, fingerprint(f.state), injected, policy, bounds), /Invalid Git/);
  const blob = git(f.repository, ["rev-parse", `${f.input.sourceCommit}:library/.source-import.json`]);
  await assert.rejects(prepareGitCanonicalSourceSnapshot(f.options, sourceBounds, f.state, fingerprint(f.state),
    { ...f.input, sourceCommit: blob }, policy, bounds), /commit object/);
});

test("caller state/date/path/bound mutations after entry cannot alter the captured source commit or candidate", async t => {
  const f = await setup(t), expected = await f.prepare();
  const options = { ...f.options }, dates = { ...f.input }, limits = { ...sourceBounds };
  const ledger = structuredClone(f.state), snapshotPolicy = structuredClone(policy), safety = { ...bounds };
  const preparing = prepareGitCanonicalSourceSnapshot(options, limits, ledger, fingerprint(ledger), dates, snapshotPolicy, safety);
  options.sourcePath = "missing"; options.trustedSourceTip = "f".repeat(40);
  dates.sourceCommit = "f".repeat(40); limits.maxSourceFileBytes = 1;
  ledger.lastSequence = 99; snapshotPolicy.transferPlanning.maxBundleMembers = 0; safety.maxItemEncodedBytes = 0;
  assert.deepEqual(await preparing, expected);
});

test("source commits equal to or older than the trusted tip pass without taking source bytes from that newer tip", async t => {
  const f = await setup(t), expected = await f.prepare();
  const original = await readFile(f.permitted, "utf8");
  await writeFile(f.permitted, original.replace("ಕನ್ನಡ", "ಕನ್ನಡ ಕನ್ನಡ"));
  f.options.trustedSourceTip = f.commit();
  assert.notEqual(f.options.trustedSourceTip, f.input.sourceCommit);
  assert.deepEqual(await f.prepare(), expected);
  assert.equal((await f.prepare()).prepared.plan.sourceCommit, f.input.sourceCommit);
});

test("unapproved descendants and divergent commits fail even if their source trees are valid or identical", async t => {
  const f = await setup(t), initial = f.input.sourceCommit;
  const tree = git(f.repository, ["rev-parse", `${initial}^{tree}`]);
  const descendant = git(f.repository, ["commit-tree", tree, "-p", initial], "Synthetic unapproved descendant\n");
  f.input.sourceCommit = descendant;
  await assert.rejects(f.prepare(), /Git source snapshot read failed/);
  const divergent = git(f.repository, ["commit-tree", tree], "Synthetic unrelated root\n");
  f.input.sourceCommit = divergent;
  await assert.rejects(f.prepare(), /Git source snapshot read failed/);
  assert.equal(git(f.repository, ["rev-parse", "HEAD"]), initial);
  f.options.trustedSourceTip = descendant;
  f.input.sourceCommit = initial;
  assert.equal((await f.prepare()).prepared.plan.sourceCommit, initial);
});

test("a genuinely merged source commit passes but a replacement-ref fabricated ancestry does not", async t => {
  const f = await setup(t), initial = f.input.sourceCommit;
  const tree = git(f.repository, ["rev-parse", `${initial}^{tree}`]);
  const side = git(f.repository, ["commit-tree", tree, "-p", initial], "Synthetic side commit\n");
  const tip = git(f.repository, ["commit-tree", tree, "-p", initial, "-p", side], "Synthetic approved merge\n");
  f.input.sourceCommit = side; f.options.trustedSourceTip = initial;
  git(f.repository, ["replace", initial, tip]);
  await assert.rejects(f.prepare(), /Git source snapshot read failed/);
  f.options.trustedSourceTip = tip;
  assert.equal((await f.prepare()).prepared.plan.sourceCommit, side);
  assert.equal(git(f.repository, ["replace", "-l"]), initial);
});

test("trusted tips must be explicit full local commit objects, not refs, blobs, tags or unavailable IDs", async t => {
  const f = await setup(t);
  const blob = git(f.repository, ["rev-parse", `${f.input.sourceCommit}:library/.source-import.json`]);
  git(f.repository, ["tag", "-a", "synthetic-trusted", "-m", "Synthetic annotated tag", f.input.sourceCommit]);
  const tag = git(f.repository, ["rev-parse", "synthetic-trusted"]);
  for (const trustedSourceTip of ["", "HEAD", f.input.sourceCommit.slice(0, 7), `${f.input.sourceCommit}^{commit}`,
    "f".repeat(40), blob, tag]) {
    await assert.rejects(prepareGitCanonicalSourceSnapshot({ ...f.options, trustedSourceTip }, sourceBounds,
      f.state, fingerprint(f.state), f.input, policy, bounds), /Invalid Git|commit object|Git source snapshot read failed/);
  }
});
