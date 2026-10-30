import test, { after, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { importSources } from "./source-import.js";
import { parseLyricSource } from "./lyric-source.js";
import { emptyPublicationLedger, publicationLedgerFingerprint as fingerprint } from "./publication-ledger.js";
import { prepareCanonicalSourceSnapshot, readSnapshotSettings } from "./snapshot-producer.js";
import { prepareGitHubCanonicalSourceSnapshot, type GitHubSourceSnapshotOptions } from "./github-source-snapshot.js";
import type { GitHubApiReader } from "./github-api.js";

const workspace = await mkdtemp(join(process.cwd(), ".github-source-snapshot-tests-"));
const previous = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR };
process.env.TEMP = workspace; process.env.TMP = workspace; process.env.TMPDIR = workspace;
after(async () => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await rm(workspace, { recursive: true, maxRetries: 5, retryDelay: 100 });
});
const sourceBounds = { maxSourceFileBytes: 8388608, maxTotalSourceBytes: 67108864 };
const settings = await readSnapshotSettings();
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
function git(directory: string, args: string[], input?: string): string {
  return execFileSync("git", ["-C", directory, "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], {
    encoding: "utf8", input, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "Synthetic fixture", GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Synthetic fixture", GIT_COMMITTER_EMAIL: "test@example.invalid" }
  }).trim();
}
async function setup(t: TestContext) {
  const root = await mkdtemp(join(workspace, "case-"));
  t.after(() => rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 }));
  const repository = join(root, "repository"), originals = join(root, "originals"), sources = join(repository, "library");
  await mkdir(repository); await mkdir(originals);
  git(repository, ["init", "--initial-branch=synthetic"]);
  await writeFile(join(originals, "permitted.txt"), "ಕನ್ನಡ  \n \t \nಅಕ್ಷರ\n\nkannaDa\n");
  await writeFile(join(originals, "held.txt"), "ಅಕ್ಷರ\n");
  await writeFile(join(originals, "exception.txt"), "Synthetic missing initial Kannada\n");
  await importSources(originals, sources, { ...sourceBounds, reviewHoldReason: "source-import-review" });
  let permitted = "", held = "";
  for (const name of (await readdir(sources)).filter(name => name.endsWith(".md"))) {
    const path = join(sources, name), text = await readFile(path, "utf8");
    const parsed = parseLyricSource(text);
    if (parsed.header.provenance.sourceFile === "permitted.txt") {
      permitted = path;
      await writeFile(path, text.replace("holdReasons:\n    - source-import-review", "holdReasons: []"));
    } else if (parsed.header.provenance.sourceFile === "held.txt") held = path;
  }
  function commit() {
    git(repository, ["add", "--", "library"]);
    git(repository, ["commit", "--quiet", "-m", "Synthetic source fixture"]);
    return git(repository, ["rev-parse", "HEAD"]);
  }
  const sourceCommit = commit(), state = emptyPublicationLedger(), limits = { ...sourceBounds };
  const input = { publishedAt: "2026-01-01T00:00:00.000Z", sourceCommit };
  const options: GitHubSourceSnapshotOptions = {
    sourceRun: { repository: "SyntheticOwner/synthetic-library", repositoryId: 101, workflowId: 202,
      workflowPath: ".github/workflows/hygiene.yml", branch: "synthetic", sourceCommit,
      runId: 303, runAttempt: 2, requestTimeoutMs: 10000, maxResponseBytes: 65536 },
    git: { repositoryDirectory: repository, sourcePath: "library", gitTimeoutMs: 30000 }
  };
  const policy = structuredClone(settings.policy), bounds = { ...settings.bounds };
  const identity = { id: 101, full_name: options.sourceRun.repository };
  const api = {
    ref: { ref: "refs/heads/synthetic", object: { type: "commit", sha: sourceCommit } },
    run: { id: 303, run_attempt: 2, workflow_id: 202, path: ".github/workflows/hygiene.yml",
      head_branch: "synthetic", head_sha: sourceCommit, event: "push", status: "completed", conclusion: "success",
      repository: { ...identity }, head_repository: { ...identity }, display_title: "Synthetic private payload" }
  };
  const calls: string[] = [];
  const reader: GitHubApiReader = async (endpoint, safety) => {
    calls.push(endpoint);
    assert.deepEqual(safety, { requestTimeoutMs: 10000, maxResponseBytes: 65536 });
    assert.equal(Object.isFrozen(safety), true);
    if (endpoint === `repos/${identity.full_name}/git/ref/heads/synthetic`) return encode(api.ref);
    assert.equal(endpoint, `repos/${identity.full_name}/actions/runs/303`);
    return encode(api.run);
  };
  return { root, repository, originals, sources, permitted, held, commit, state, limits, input, options, policy, bounds, api, calls,
    reader, prepare: (read = reader) => prepareGitHubCanonicalSourceSnapshot(options, limits, state, fingerprint(state),
      input, policy, bounds, read),
    expected: () => prepareCanonicalSourceSnapshot(sources, limits, state, fingerprint(state), input, policy, bounds) };
}

test("two exact successful push observations bracket identical committed source bytes, IDs and layout without writes", async t => {
  const f = await setup(t), before = structuredClone({ options: f.options, state: f.state, input: f.input,
    policy: f.policy, bounds: f.bounds, limits: f.limits, api: f.api });
  const sourceFiles = await Promise.all((await readdir(f.sources)).map(async name => [name, await readFile(join(f.sources, name))]));
  const expected = await f.expected(), result = await f.prepare();
  const { stage, sourceBefore, sourceAfter, ...candidate } = result;
  assert.equal(stage, "github-source-snapshot");
  assert.deepEqual(candidate, expected);
  assert.equal(result.held, 1); assert.equal(result.extractionExceptions, 1);
  assert.equal(result.prepared.plan.sourceCommit, f.input.sourceCommit);
  assert.equal(result.prepared.plan.items.length, 1);
  const parsed = parseLyricSource(await readFile(f.permitted, "utf8"));
  const itemBytes = [...result.prepared.artifacts.values()].map(bytes => {
    try { return gunzipSync(bytes).toString("utf8"); } catch { return ""; }
  }).find(text => text.includes('"format":"daasavaani-lyric"'));
  assert.ok(itemBytes);
  const item: unknown = JSON.parse(itemBytes);
  assert.deepEqual(item, { format: "daasavaani-lyric", formatVersion: 1, lyricId: parsed.header.lyricId,
    canonicalScript: "kn", title: parsed.header.public.title, tags: parsed.header.public.tags,
    lines: parsed.canonical.map(line => "id" in line ? { kind: "line", lineId: line.id, text: line.text }
      : { kind: "layout", text: line.text }) });
  const observation = { stage: "github-source-run", ...f.options.sourceRun, requestCount: 3 };
  const { requestTimeoutMs: _timeout, maxResponseBytes: _bytes, ...expectedObservation } = observation;
  assert.deepEqual(sourceBefore, expectedObservation); assert.deepEqual(sourceAfter, expectedObservation);
  assert.notEqual(sourceBefore, sourceAfter);
  assert.equal(JSON.stringify([sourceBefore, sourceAfter]).includes("Synthetic private"), false);
  const sequence = [`repos/${f.options.sourceRun.repository}/git/ref/heads/synthetic`,
    `repos/${f.options.sourceRun.repository}/actions/runs/303`,
    `repos/${f.options.sourceRun.repository}/git/ref/heads/synthetic`];
  assert.deepEqual(f.calls, [...sequence, ...sequence]);
  assert.deepEqual({ options: f.options, state: f.state, input: f.input, policy: f.policy,
    bounds: f.bounds, limits: f.limits, api: f.api }, before);
  assert.deepEqual(await Promise.all((await readdir(f.sources)).map(async name =>
    [name, await readFile(join(f.sources, name))])), sourceFiles);
  assert.deepEqual((await readdir(f.root)).sort(), ["originals", "repository"]);
  assert.deepEqual((await readdir(f.repository)).sort(), [".git", "library"]);
  assert.equal(git(f.repository, ["status", "--porcelain"]), "");
  assert.deepEqual(f.state, emptyPublicationLedger());
});

test("checkout, index, replacement refs and moved HEAD never replace the exact admitted commit or change caller state", async t => {
  const f = await setup(t), expected = await f.expected(), admitted = f.input.sourceCommit;
  const original = await readFile(f.permitted, "utf8");
  await writeFile(f.permitted, original.replace("ಕನ್ನಡ", "ಕನ್ನಡ ಕನ್ನಡ"));
  const newer = f.commit();
  await writeFile(f.permitted, "Synthetic invalid staged bytes");
  git(f.repository, ["add", "--", "library"]);
  await writeFile(f.permitted, "Synthetic invalid unstaged bytes");
  await writeFile(join(f.sources, "untracked.txt"), "Synthetic untracked");
  git(f.repository, ["replace", admitted, newer]);
  const status = git(f.repository, ["status", "--porcelain"]), refs = git(f.repository, ["show-ref"]);
  const index = await readFile(join(f.repository, ".git", "index")), state = structuredClone(f.state);
  const result = await f.prepare();
  assert.deepEqual(result.prepared, expected.prepared);
  assert.equal(result.prepared.plan.sourceCommit, admitted);
  assert.equal(git(f.repository, ["rev-parse", "HEAD"]), newer);
  assert.equal(git(f.repository, ["status", "--porcelain"]), status);
  assert.equal(git(f.repository, ["show-ref"]), refs);
  assert.deepEqual(await readFile(join(f.repository, ".git", "index")), index);
  assert.deepEqual(f.state, state);
});

test("an isolated bare repository supports exact authenticated committed preparation", async t => {
  const f = await setup(t), expected = await f.expected(), bare = join(f.root, "bare.git");
  git(f.repository, ["clone", "--bare", "--quiet", "--no-hardlinks", f.repository, bare]);
  f.options.git.repositoryDirectory = bare;
  assert.deepEqual((await f.prepare()).prepared, expected.prepared);
});

test("all caller configuration, state, input, nested policy and bounds are captured before the first API await", async t => {
  const f = await setup(t), expected = await f.expected(), admitted = structuredClone(f.options.sourceRun);
  const read: GitHubApiReader = async (endpoint, limits) => {
    const bytes = await f.reader(endpoint, limits);
    if (f.calls.length === 1) {
      Object.assign(f.options.sourceRun, { repository: "OtherOwner/other", sourceCommit: "f".repeat(40),
        repositoryId: 999, workflowId: 999, workflowPath: ".github/workflows/other.yml",
        branch: "other", runId: 999, runAttempt: 99, requestTimeoutMs: 1, maxResponseBytes: 1 });
      f.options.git.repositoryDirectory = join(f.root, "missing");
      f.options.git.sourcePath = "missing"; f.options.git.gitTimeoutMs = 0;
      f.input.sourceCommit = "f".repeat(40); f.input.publishedAt = "invalid";
      f.state.lastSequence = 99; f.state.items.push({ lyricId: "invalid", logicalSha256: "invalid",
        firstPublishedAt: "invalid", changedAt: "invalid", present: true });
      f.limits.maxSourceFileBytes = 1; f.limits.maxTotalSourceBytes = 1;
      f.policy.transferPlanning.maxBundleMembers = 0; f.bounds.maxItemEncodedBytes = 0;
    }
    return bytes;
  };
  const result = await f.prepare(read);
  assert.deepEqual(result.prepared, expected.prepared);
  assert.equal(result.sourceBefore.sourceCommit, admitted.sourceCommit);
  assert.deepEqual(result.sourceBefore, result.sourceAfter);
  assert.equal(f.calls.length, 6);
});

test("source commit must equal the explicit CI tip: no contained ancestor, descendant or target switching", async t => {
  const f = await setup(t), original = f.input.sourceCommit;
  await writeFile(f.permitted, (await readFile(f.permitted, "utf8")).replace("ಕನ್ನಡ", "ಕನ್ನಡ ಕನ್ನಡ"));
  const newer = f.commit();
  for (const [candidate, tip] of [[original, newer], [newer, original]]) {
    f.input.sourceCommit = candidate!; f.options.sourceRun.sourceCommit = tip!;
    f.options.git.repositoryDirectory = join(f.root, "missing");
    await assert.rejects(f.prepare(), /exact admitted source CI commit/);
    assert.equal(f.calls.length, 0);
  }
});

test("fork, event, workflow, run, attempt and ref tampering fail before even opening an invalid local repository", async t => {
  const f = await setup(t), original = structuredClone(f.api);
  f.options.git.repositoryDirectory = join(f.root, "missing");
  for (const mutation of [
    { id: 304 }, { run_attempt: 3 }, { workflow_id: 203 }, { path: ".github/workflows/other.yml" },
    { head_branch: "other" }, { head_sha: "f".repeat(40) }, { event: "pull_request" }, { event: "workflow_run" },
    { status: "in_progress", conclusion: null }, { conclusion: "failure" }, { conclusion: "cancelled" },
    { conclusion: "skipped" }, { conclusion: "neutral" },
    { repository: { id: 102, full_name: f.options.sourceRun.repository } },
    { repository: { id: 101, full_name: "OtherOwner/other" } },
    { head_repository: { id: 102, full_name: f.options.sourceRun.repository } },
    { head_repository: { id: 101, full_name: "ForkOwner/synthetic-library" } }, { head_repository: null }
  ]) {
    Object.assign(f.api, structuredClone(original)); Object.assign(f.api.run, mutation); f.calls.length = 0;
    await assert.rejects(f.prepare(), /expected successful push workflow/);
    assert.equal(f.calls.length, 2);
  }
  for (const step of [1, 3]) for (const ref of [
    { ref: "refs/tags/synthetic", object: { type: "commit", sha: original.ref.object.sha } },
    { ref: original.ref.ref, object: { type: "commit", sha: "f".repeat(40) } },
    { ref: original.ref.ref, object: { type: "tag", sha: original.ref.object.sha } }
  ]) {
    Object.assign(f.api, structuredClone(original)); f.calls.length = 0;
    await assert.rejects(f.prepare(async (endpoint, limits) => {
      const bytes = await f.reader(endpoint, limits);
      return f.calls.length === step ? encode(ref) : bytes;
    }), /branch tip/);
    assert.equal(f.calls.length, step);
  }
});

test("unknown envelopes, invalid ledger/hash/dates/policy/options and missing bounds fail before API or Git work", async t => {
  const f = await setup(t);
  const args = (): unknown[] => [structuredClone(f.options), { ...f.limits }, structuredClone(f.state), fingerprint(f.state),
    { ...f.input }, structuredClone(f.policy), { ...f.bounds }, f.reader];
  for (const [position, value] of [
    [0, null], [0, []], [0, { ...f.options, unexpected: true }],
    [0, { ...f.options, sourceRun: null }], [0, { ...f.options, sourceRun: [] }],
    [0, { ...f.options, git: { ...f.options.git, trustedSourceTip: f.input.sourceCommit } }],
    [0, { ...f.options, git: { ...f.options.git, sourcePath: "../library" } }],
    [0, { ...f.options, git: { ...f.options.git, repositoryDirectory: "relative" } }],
    [0, { ...f.options, git: { ...f.options.git, gitTimeoutMs: 0 } }],
    [0, { ...f.options, sourceRun: { ...f.options.sourceRun, unexpected: true } }],
    [0, { ...f.options, sourceRun: { ...f.options.sourceRun, requestTimeoutMs: 0 } }],
    [1, null], [1, { ...f.limits, unexpected: true }], [1, { ...f.limits, maxSourceFileBytes: 0 }],
    [1, { ...f.limits, maxTotalSourceBytes: 1 }], [2, null], [2, { ...f.state, unexpected: true }],
    [3, "f".repeat(64)], [3, null], [4, null], [4, []], [4, { ...f.input, items: [] }],
    [4, { sourceCommit: f.input.sourceCommit }], [4, { ...f.input, publishedAt: "invalid" }],
    [4, { ...f.input, sourceCommit: "HEAD" }], [5, null], [5, { ...f.policy, unexpected: true }],
    [6, null], [6, { ...f.bounds, unexpected: true }], [6, { ...f.bounds, maxItemEncodedBytes: 0 }], [7, null]
  ] satisfies [number, unknown][]) {
    const requested = args(); requested[position] = value;
    await assert.rejects(Reflect.apply(prepareGitHubCanonicalSourceSnapshot, undefined, requested));
    assert.equal(f.calls.length, 0);
  }
});

test("re-audit refuses post-preparation source supersession, ref tampering and stale or advanced CI without retry", async t => {
  const f = await setup(t), original = structuredClone(f.api);
  for (const [step, response, error] of [
    [4, { ...original.ref, object: { type: "commit", sha: "f".repeat(40) } }, /branch tip/],
    [6, { ...original.ref, object: { type: "commit", sha: "f".repeat(40) } }, /branch tip/],
    [4, { ...original.ref, ref: "refs/tags/synthetic" }, /branch tip/],
    [5, { ...original.run, run_attempt: 3 }, /expected successful push workflow/],
    [5, { ...original.run, status: "in_progress", conclusion: null }, /expected successful push workflow/],
    [5, { ...original.run, head_sha: "f".repeat(40) }, /expected successful push workflow/]
  ] satisfies [number, unknown, RegExp][]) {
    f.calls.length = 0;
    let result: unknown;
    await assert.rejects(async () => {
      result = await f.prepare(async (endpoint, limits) => {
        const bytes = await f.reader(endpoint, limits);
        return f.calls.length === step ? encode(response) : bytes;
      });
    }, error);
    assert.equal(result, undefined);
    assert.equal(f.calls.length, step);
    assert.deepEqual(f.state, emptyPublicationLedger());
    assert.equal(git(f.repository, ["status", "--porcelain"]), "");
  }
});

test("a remote tip advancing across the asynchronous preparation boundary is never silently adopted", async t => {
  const f = await setup(t), admitted = f.input.sourceCommit;
  await assert.rejects(f.prepare(async (endpoint, limits) => {
    const bytes = await f.reader(endpoint, limits);
    if (f.calls.length === 3) f.api.ref.object.sha = "f".repeat(40);
    return bytes;
  }), /branch tip/);
  assert.equal(f.calls.length, 4);
  assert.equal(f.options.sourceRun.sourceCommit, admitted);
  assert.equal(f.input.sourceCommit, admitted);
  assert.deepEqual(f.state, emptyPublicationLedger());
});

test("malformed and failing hosted evidence stays redacted at either audit and returns no candidate", async t => {
  const f = await setup(t);
  for (const step of [1, 2, 3, 4, 5, 6]) for (const bytes of [
    Buffer.from('{"Synthetic private text":'), Buffer.from('{"id":303,"id":303}'),
    Buffer.from([0xff]), Buffer.alloc(65537, 32), Buffer.alloc(0)
  ]) {
    f.calls.length = 0;
    await assert.rejects(f.prepare(async (endpoint, limits) => {
      const valid = await f.reader(endpoint, limits);
      return f.calls.length === step ? bytes : valid;
    }), error => error instanceof Error && !error.message.includes("Synthetic private"));
    assert.equal(f.calls.length, step);
  }
  for (const step of [1, 4, 5, 6]) {
    f.calls.length = 0;
    await assert.rejects(f.prepare(async (endpoint, limits) => {
      const bytes = await f.reader(endpoint, limits);
      if (f.calls.length === step) throw new Error("Synthetic private credentials");
      return bytes;
    }), /GitHub source-run API read failed/);
    assert.equal(f.calls.length, step);
  }
});

test("committed tampered receipts, malformed held sources and unsupported metadata cannot yield a prepared candidate", async t => {
  const f = await setup(t), permitted = await readFile(f.permitted, "utf8"), held = await readFile(f.held, "utf8");
  for (const [path, original, replacement, error] of [
    [f.permitted, permitted, permitted.replace(/sha256: [a-f0-9]{64}/, `sha256: ${"e".repeat(64)}`), /disagrees/],
    [f.held, held, held.replace("sourceFormat: 2", "sourceFormat: 99"), /Invalid draft header/],
    [f.permitted, permitted, permitted.replace('contextDescription: ""', 'contextDescription: "Synthetic populated context"'),
      /needs registry/]
  ] satisfies [string, string, string, RegExp][]) {
    assert.notEqual(replacement, original);
    await writeFile(path, replacement);
    const commit = f.commit();
    f.input.sourceCommit = commit; f.options.sourceRun.sourceCommit = commit;
    f.api.ref.object.sha = commit; f.api.run.head_sha = commit; f.calls.length = 0;
    await assert.rejects(f.prepare(), error);
    assert.equal(f.calls.length, 3);
    assert.deepEqual(f.state, emptyPublicationLedger());
    await writeFile(path, original);
  }
});

test("source byte ceilings, missing local commits and Git failures prevent the second audit and preserve refs/index", async t => {
  const f = await setup(t), sizes = await Promise.all((await readdir(f.sources)).map(async name =>
    (await readFile(join(f.sources, name))).length));
  const maximum = Math.max(...sizes), total = sizes.reduce((a, b) => a + b, 0);
  f.limits.maxSourceFileBytes = maximum; f.limits.maxTotalSourceBytes = total;
  assert.equal((await f.prepare()).held, 1);
  const refs = git(f.repository, ["show-ref"]), index = await readFile(join(f.repository, ".git", "index"));
  for (const limits of [{ maxSourceFileBytes: maximum - 1, maxTotalSourceBytes: total },
    { maxSourceFileBytes: maximum, maxTotalSourceBytes: total - 1 }]) {
    Object.assign(f.limits, limits); f.calls.length = 0;
    await assert.rejects(f.prepare(), /source byte bounds/);
    assert.equal(f.calls.length, 3);
  }
  Object.assign(f.limits, sourceBounds);
  f.input.sourceCommit = "f".repeat(40); f.options.sourceRun.sourceCommit = f.input.sourceCommit;
  f.api.run.head_sha = f.input.sourceCommit; f.api.ref.object.sha = f.input.sourceCommit; f.calls.length = 0;
  await assert.rejects(f.prepare(), /Git source snapshot read failed/);
  assert.equal(f.calls.length, 3);
  assert.equal(git(f.repository, ["show-ref"]), refs);
  assert.deepEqual(await readFile(join(f.repository, ".git", "index")), index);
  assert.deepEqual(f.state, emptyPublicationLedger());
});
