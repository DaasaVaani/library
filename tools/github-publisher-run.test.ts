import test from "node:test";
import assert from "node:assert/strict";
import { auditGitHubPublisherRun, type GitHubApiReader, type GitHubPublisherRunOptions } from "./github-publisher-run.js";
import { auditGitHubSourceRun } from "./github-source-run.js";

const options: GitHubPublisherRunOptions = {
  repository: "SyntheticOwner/synthetic-library", repositoryId: 101, workflowId: 202,
  workflowPath: ".github/workflows/publish.yml", publisherBranch: "main", publisherHeadCommit: "a".repeat(40),
  publisherRunId: 303, publisherRunAttempt: 2, expectedPhase: "in_progress",
  requestTimeoutMs: 10000, maxResponseBytes: 65536
};
function fixture(input = options) {
  const identity = { id: input.repositoryId, full_name: input.repository };
  return { id: input.publisherRunId, run_attempt: input.publisherRunAttempt, workflow_id: input.workflowId,
    path: input.workflowPath, head_branch: input.publisherBranch, head_sha: input.publisherHeadCommit,
    event: "workflow_run", status: input.expectedPhase, conclusion: input.expectedPhase === "completed" ? "success" : null,
    repository: { ...identity }, head_repository: { ...identity },
    display_title: "Synthetic-private-title", sourceCommit: "b".repeat(40), artifact_id: 999,
    url: "https://untrusted.invalid/Synthetic-private-token" };
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
function reader(value: unknown = fixture(), calls: string[] = []): GitHubApiReader {
  return async endpoint => { calls.push(endpoint); return encode(value); };
}
function report(input = options) {
  return { stage: "github-publisher-run", repository: input.repository, repositoryId: input.repositoryId,
    workflowId: input.workflowId, workflowPath: input.workflowPath, publisherBranch: input.publisherBranch,
    publisherHeadCommit: input.publisherHeadCommit, publisherRunId: input.publisherRunId,
    publisherRunAttempt: input.publisherRunAttempt, expectedPhase: input.expectedPhase, requestCount: 3 };
}

test("exact latest -> specific attempt -> latest order admits each explicit phase with independent payload-free output and frozen limits", async () => {
  for (const expectedPhase of ["in_progress", "completed"] as const) {
    const input = { ...options, expectedPhase }, before = { ...input }, f = fixture(input), saved = structuredClone(f), calls: string[] = [];
    const observe: GitHubApiReader = async (endpoint, limits) => {
      assert.deepEqual(limits, { requestTimeoutMs: input.requestTimeoutMs, maxResponseBytes: input.maxResponseBytes });
      assert.equal(Object.isFrozen(limits), true);
      return reader(f, calls)(endpoint, limits);
    };
    const result = await auditGitHubPublisherRun(input, observe), root = `repos/${input.repository}/actions/runs/${input.publisherRunId}`;
    assert.deepEqual(result, report(input));
    assert.deepEqual(calls, [root, `${root}/attempts/${input.publisherRunAttempt}`, root]);
    assert.equal(JSON.stringify(result).includes("Synthetic-private"), false);
    for (const field of ["sourceCommit", "triggeringSourceRun", "artifact_id", "approval", "receipt", "credentials"]) {
      assert.equal(Object.hasOwn(result, field), false);
    }
    assert.deepEqual(input, before);
    assert.deepEqual(f, saved);
    result.publisherHeadCommit = "c".repeat(40);
    assert.equal(input.publisherHeadCommit, before.publisherHeadCommit);
  }
});

test("unknown inputs, omitted pins, unsafe identities, paths, phases and limits fail before transport", async () => {
  const invalid: unknown[] = [null, undefined, true, "options", [], 1, new Date(), { ...options, sourceCommit: "b".repeat(40) },
    { ...options, artifactId: 99 }, { ...options, event: "workflow_run" }, { ...options, token: "Synthetic-private-token" }];
  for (const key of Object.keys(options)) {
    const missing: Record<string, unknown> = { ...options }; delete missing[key]; invalid.push(missing);
  }
  for (const [field, values] of Object.entries({
    repository: ["owner/../target", "https://github.com/owner/repo", "-owner/repo", "owner/repo?x=1", "owner/{repo}", "owner/repo/extra"],
    workflowPath: ["publish.yml", ".github/workflows/../publish.yml", ".github/workflows/a.yml@main", ".github\\workflows\\a.yml"],
    publisherBranch: ["../main", "main?x=1", "main#fragment", "main//other", "main/../other", "-main", "main\\other"],
    publisherHeadCommit: ["HEAD", "a".repeat(39), "A".repeat(40)],
    repositoryId: [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "101"], workflowId: [0, null], publisherRunId: [0],
    publisherRunAttempt: [0, 1.5], expectedPhase: ["queued", "success", "failure", null],
    requestTimeoutMs: [0, 2147483648, NaN, Infinity], maxResponseBytes: [0, -1, 2147483648]
  })) for (const value of values) invalid.push({ ...options, [field]: value });
  for (const [field, value] of Object.entries(options)) if (typeof value === "string") {
    for (const suffix of ["\n", "\r", "\r\n"]) invalid.push({ ...options, [field]: value + suffix });
  }
  invalid.push({ ...options, [Symbol("unknown")]: true });
  invalid.push(Object.defineProperty({ ...options }, "hidden", { value: true }));
  invalid.push(Object.defineProperty({ ...options }, "repository", { get() { throw new Error("Synthetic-private-token"); }, enumerable: true }));
  for (const value of invalid) {
    let calls = 0;
    await assert.rejects(auditGitHubPublisherRun(value as GitHubPublisherRunOptions, async () => { calls++; return encode({}); }), /options/);
    assert.equal(calls, 0);
  }
  await assert.rejects(auditGitHubPublisherRun(options, null as unknown as GitHubApiReader), /options/);
});

test("identity, event, fork, head, attempt advancement/regression and phase mismatches fail at every observation without retry or target movement", async () => {
  const f = fixture();
  for (const mutation of [
    { id: 304 }, { run_attempt: 1 }, { run_attempt: 3 }, { workflow_id: 203 }, { path: ".github/workflows/other.yml" },
    { head_branch: "other" }, { head_sha: "b".repeat(40) }, { event: "push" }, { event: "pull_request" },
    { status: "completed", conclusion: "success" }, { status: "queued" }, { status: "waiting" },
    { conclusion: "failure" }, { conclusion: "cancelled" }, { conclusion: "skipped" }, { conclusion: "neutral" },
    { conclusion: "success" }, { status: null }, { head_branch: null }, { run_attempt: "2" },
    { repository: { ...f.repository, id: 102 } }, { repository: { ...f.repository, full_name: "OtherOwner/synthetic-library" } },
    { head_repository: { ...f.head_repository, id: 102 } },
    { head_repository: { ...f.head_repository, full_name: "ForkOwner/synthetic-library" } },
    { head_repository: null }, { workflow_id: Number.MAX_SAFE_INTEGER + 1 }
  ]) for (const step of [1, 2, 3]) {
    const calls: string[] = [];
    await assert.rejects(auditGitHubPublisherRun(options, async endpoint => {
      calls.push(endpoint);
      return encode(calls.length === step ? { ...f, ...mutation } : f);
    }), /expected workflow_run identity and phase/);
    assert.equal(calls.length, step);
    assert.equal(calls.some(endpoint => endpoint.includes("/git/") || endpoint.includes("/artifacts/")), false);
  }
});

test("completed phase requires success and rejects regression or non-success at all three reads", async () => {
  const input = { ...options, expectedPhase: "completed" as const }, f = fixture(input);
  for (const mutation of [{ status: "in_progress", conclusion: null }, { conclusion: null },
    ...["failure", "cancelled", "neutral", "skipped", "timed_out", "action_required", "stale"].map(conclusion => ({ conclusion }))]) {
    for (const step of [1, 2, 3]) {
      let calls = 0;
      await assert.rejects(auditGitHubPublisherRun(input, async () => encode(++calls === step ? { ...f, ...mutation } : f)),
        /expected workflow_run identity and phase/);
      assert.equal(calls, step);
    }
  }
});

test("every required run and repository field must be supplied at every observation; attempt identity is never inferred from its URL", async () => {
  const f = fixture();
  const invalid: unknown[] = [null, [], true, {}, { ...f, repository: [] }, { ...f, head_repository: "repository" }];
  for (const key of ["id", "run_attempt", "workflow_id", "path", "head_branch", "head_sha", "event", "status", "conclusion", "repository", "head_repository"]) {
    const missing: Record<string, unknown> = { ...f }; delete missing[key]; invalid.push(missing);
  }
  for (const field of ["repository", "head_repository"] as const) for (const key of ["id", "full_name"]) {
    const missing: Record<string, unknown> = { ...f[field] }; delete missing[key]; invalid.push({ ...f, [field]: missing });
  }
  for (const value of invalid) for (const step of [1, 2, 3]) {
    let calls = 0;
    await assert.rejects(auditGitHubPublisherRun(options, async () => encode(++calls === step ? value : f)),
      /expected workflow_run identity and phase/);
    assert.equal(calls, step);
  }
});

test("exact byte ceilings pass; malformed, duplicate-key, BOM, invalid UTF8 and out-of-bounds responses fail with redacted errors", async () => {
  const bytes = encode(fixture()), input = { ...options, maxResponseBytes: bytes.length };
  await auditGitHubPublisherRun(input, async () => bytes);
  for (const invalid of [
    Buffer.alloc(bytes.length + 1, 32), Buffer.alloc(0), Buffer.from('{"Synthetic-private-token":'),
    Buffer.from('{"id":303,"id":304}'), Buffer.from('{"id":303,"\\u0069d":304}'),
    Buffer.from('{"repository":{"id":101,"id":102}}'), Buffer.from("\uFEFF{}"), Buffer.from([0xff]),
    Buffer.from([0xc3, 0x28]), "Synthetic-private-token", null
  ]) for (const step of [1, 2, 3]) {
    let calls = 0;
    await assert.rejects(auditGitHubPublisherRun(input, async () => (++calls === step ? invalid : bytes) as Uint8Array),
      error => error instanceof Error && error.message === "Invalid or out-of-bounds GitHub publisher-run API JSON");
    assert.equal(calls, step);
  }
});

test("transport errors including timeout/size diagnostics are redacted at every read without retries or partial success", async () => {
  for (const step of [1, 2, 3]) for (const failure of [new Error("Synthetic-private-token timeout maxBuffer"), "Synthetic-private-token", null]) {
    let calls = 0;
    await assert.rejects(auditGitHubPublisherRun(options, async () => {
      calls++;
      if (calls === step) throw failure;
      return encode(fixture());
    }), error => error instanceof Error && error.message ===
      "GitHub publisher-run API read failed; verify authentication, availability and explicit limits");
    assert.equal(calls, step);
  }
});

test("caller mutation during the first await cannot change authority, explicit phase, attempt endpoint or limits", async () => {
  const input = { ...options, publisherBranch: "release/canonical" }, before = { ...input }, f = fixture(input), calls: string[] = [];
  const observe: GitHubApiReader = async (endpoint, limits) => {
    if (!calls.length) {
      await Promise.resolve();
      input.repository = "OtherOwner/other-repo"; input.repositoryId++; input.workflowId++;
      input.workflowPath = ".github/workflows/other.yml"; input.publisherBranch = "other";
      input.publisherHeadCommit = "b".repeat(40); input.publisherRunId++; input.publisherRunAttempt++;
      input.expectedPhase = "completed"; input.requestTimeoutMs = 1; input.maxResponseBytes = 1;
    }
    assert.equal(Object.isFrozen(limits), true);
    assert.deepEqual(limits, { requestTimeoutMs: before.requestTimeoutMs, maxResponseBytes: before.maxResponseBytes });
    return reader(f, calls)(endpoint, limits);
  };
  assert.deepEqual(await auditGitHubPublisherRun(input, observe), report(before));
  const root = `repos/${before.repository}/actions/runs/${before.publisherRunId}`;
  assert.deepEqual(calls, [root, `${root}/attempts/${before.publisherRunAttempt}`, root]);
});

test("publisher workflow_run admission never weakens successful push source-CI semantics", async () => {
  const source = { repository: options.repository, repositoryId: options.repositoryId, workflowId: options.workflowId,
    workflowPath: options.workflowPath, branch: options.publisherBranch, sourceCommit: options.publisherHeadCommit,
    runId: options.publisherRunId, runAttempt: options.publisherRunAttempt,
    requestTimeoutMs: options.requestTimeoutMs, maxResponseBytes: options.maxResponseBytes };
  const ref = { ref: `refs/heads/${source.branch}`, object: { type: "commit", sha: source.sourceCommit } };
  for (const expectedPhase of ["in_progress", "completed"] as const) {
    const f = fixture({ ...options, expectedPhase });
    await auditGitHubPublisherRun({ ...options, expectedPhase }, reader(f));
    let calls = 0;
    await assert.rejects(auditGitHubSourceRun(source, async endpoint => {
      calls++; return encode(endpoint.includes("/git/ref/") ? ref : f);
    }), /expected successful push workflow/);
    assert.equal(calls, 2);
  }
  const successfulPush = { ...fixture({ ...options, expectedPhase: "completed" }), event: "push" };
  const result = await auditGitHubSourceRun(source, async endpoint => encode(endpoint.includes("/git/ref/") ? ref : successfulPush));
  assert.equal(result.stage, "github-source-run");
  assert.equal(result.requestCount, 3);
  await assert.rejects(auditGitHubPublisherRun({ ...options, expectedPhase: "completed" }, reader(successfulPush)),
    /expected workflow_run identity and phase/);
});
