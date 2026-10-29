import test from "node:test";
import assert from "node:assert/strict";
import { auditGitHubSourceRun, type GitHubApiReader, type GitHubSourceRunOptions } from "./github-source-run.js";

const options: GitHubSourceRunOptions = {
  repository: "SyntheticOwner/synthetic-library", repositoryId: 101, workflowId: 202,
  workflowPath: ".github/workflows/hygiene.yml", branch: "main", sourceCommit: "a".repeat(40),
  runId: 303, runAttempt: 2, requestTimeoutMs: 10000, maxResponseBytes: 65536
};
function fixture(input = options) {
  const ref = { ref: `refs/heads/${input.branch}`, object: { type: "commit", sha: input.sourceCommit },
    url: "https://api.github.com/synthetic-extra-field" };
  const identity = { id: input.repositoryId, full_name: input.repository };
  const run = {
    id: input.runId, run_attempt: input.runAttempt, workflow_id: input.workflowId, path: input.workflowPath,
    head_branch: input.branch, head_sha: input.sourceCommit, event: "push", status: "completed", conclusion: "success",
    repository: { ...identity }, head_repository: { ...identity }, display_title: "Synthetic private text excluded"
  };
  return { ref, run };
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
function reader(f = fixture(), calls: string[] = []): GitHubApiReader {
  return async endpoint => { calls.push(endpoint); return encode(endpoint.includes("/git/ref/") ? f.ref : f.run); };
}

test("exact current successful source push run is bracketed by matching branch observations with payload-free independent output", async () => {
  const f = fixture(), before = structuredClone(f), input = { ...options }, calls: string[] = [];
  const observe: GitHubApiReader = async (endpoint, limits) => {
    assert.deepEqual(limits, { requestTimeoutMs: options.requestTimeoutMs, maxResponseBytes: options.maxResponseBytes });
    assert.equal(Object.isFrozen(limits), true);
    return reader(f, calls)(endpoint, limits);
  };
  const report = await auditGitHubSourceRun(input, observe);
  assert.deepEqual(report, { stage: "github-source-run", repository: input.repository, repositoryId: input.repositoryId,
    workflowId: input.workflowId, workflowPath: input.workflowPath, branch: input.branch, sourceCommit: input.sourceCommit,
    runId: input.runId, runAttempt: input.runAttempt, requestCount: 3 });
  assert.deepEqual(calls, [`repos/${input.repository}/git/ref/heads/main`,
    `repos/${input.repository}/actions/runs/${input.runId}`, `repos/${input.repository}/git/ref/heads/main`]);
  assert.equal(JSON.stringify(report).includes("Synthetic private"), false);
  assert.deepEqual(input, options);
  assert.deepEqual(f, before);
  report.sourceCommit = "b".repeat(40);
  assert.equal(input.sourceCommit, options.sourceCommit);
});

test("invalid identities, unsafe paths and missing or impossible bounds fail before any API call", async () => {
  for (const [field, values] of Object.entries({
    repository: ["owner/../target", "https://github.com/owner/repo", "-owner/repo", "owner/repo?x=1", "owner/{repo}", "owner/repo/extra"],
    workflowPath: [".github/workflows/../hygiene.yml", "hygiene.yml", ".github/workflows/a.yml@main"],
    branch: ["../main", "main?x=1", "main#fragment", "main//other", "main/../other", "-main", "main\\other"],
    sourceCommit: ["HEAD", "a".repeat(39), "A".repeat(40)],
    repositoryId: [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1], workflowId: [0], runId: [0], runAttempt: [0],
    requestTimeoutMs: [0, 2147483648, NaN, Infinity], maxResponseBytes: [0, -1, 2147483648]
  })) for (const value of values) {
    let calls = 0;
    await assert.rejects(auditGitHubSourceRun({ ...options, [field]: value }, async () => { calls++; return encode({}); }), /options/);
    assert.equal(calls, 0);
  }
  const unexpected = { ...options, unexpected: true };
  await assert.rejects(auditGitHubSourceRun(unexpected), /options/);
});

test("wrong repository, fork, source, workflow, branch, run or latest attempt never produce source-run observations", async () => {
  for (const mutation of [
    { id: 304 }, { run_attempt: 3 }, { workflow_id: 203 }, { path: ".github/workflows/publish.yml" },
    { head_branch: "review" }, { head_sha: "b".repeat(40) }, { event: "pull_request" }, { event: "workflow_run" },
    { status: "in_progress", conclusion: null }, { status: "queued", conclusion: null }, { conclusion: "failure" },
    { conclusion: "cancelled" }, { conclusion: "skipped" }, { conclusion: "neutral" },
    { repository: { id: 102, full_name: options.repository } },
    { repository: { id: options.repositoryId, full_name: "OtherOwner/synthetic-library" } },
    { head_repository: { id: 102, full_name: options.repository } },
    { head_repository: { id: options.repositoryId, full_name: "ForkOwner/synthetic-library" } },
    { head_repository: null }, { run_attempt: "2" }, { workflow_id: Number.MAX_SAFE_INTEGER + 1 }
  ]) {
    const f = fixture(), calls: string[] = [];
    Object.assign(f.run, mutation);
    await assert.rejects(auditGitHubSourceRun(options, reader(f, calls)), /expected successful push workflow/);
    assert.equal(calls.length, 2);
  }
});

test("superseded sources and branch changes during observation stop without switching targets or retrying", async () => {
  for (const step of [1, 3]) for (const replacement of [
    { ref: "refs/tags/main", object: { type: "commit", sha: options.sourceCommit } },
    { ref: "refs/heads/main", object: { type: "commit", sha: "b".repeat(40) } },
    { ref: "refs/heads/main", object: { type: "tag", sha: options.sourceCommit } }
  ]) {
    const f = fixture();
    let calls = 0;
    const observe: GitHubApiReader = async endpoint => {
      calls++;
      return calls === step ? encode(replacement) : reader(f)(endpoint, { requestTimeoutMs: 1, maxResponseBytes: 65536 });
    };
    await assert.rejects(auditGitHubSourceRun(options, observe), /branch tip/);
    assert.equal(calls, step);
  }
});

test("explicit exact response ceiling is accepted and overrun or empty bodies are rejected at every read", async () => {
  const f = fixture(), encoded = [encode(f.ref), encode(f.run), encode(f.ref)], ceiling = Math.max(...encoded.map(bytes => bytes.length));
  const input = { ...options, maxResponseBytes: ceiling };
  await auditGitHubSourceRun(input, reader(f));
  for (const step of [1, 2, 3]) for (const bytes of [Buffer.alloc(ceiling + 1, 32), Buffer.alloc(0)]) {
    let calls = 0;
    const observe: GitHubApiReader = async () => { calls++; return calls === step ? bytes : encoded[calls - 1]!; };
    await assert.rejects(auditGitHubSourceRun(input, observe), /byte bounds/);
    assert.equal(calls, step);
  }
});

test("malformed, duplicate-key, BOM and invalid UTF8 JSON fail without leaking response excerpts", async () => {
  const f = fixture();
  for (const step of [1, 2, 3]) for (const bytes of [
    Buffer.from('{"Synthetic private text":'), Buffer.from('{"ref":"first","ref":"second"}'),
    Buffer.from('{"repository":{"id":1,"id":2}}'), Buffer.from('{"\\u0072ef":"first","ref":"second"}'),
    Buffer.from("\uFEFF{}"), Buffer.from([0xff])
  ]) {
    let calls = 0;
    const observe: GitHubApiReader = async endpoint => {
      calls++;
      return calls === step ? bytes : reader(f)(endpoint, { requestTimeoutMs: 1, maxResponseBytes: 65536 });
    };
    await assert.rejects(auditGitHubSourceRun(options, observe), error =>
      error instanceof Error && error.message === "Invalid GitHub source-run API JSON");
    assert.equal(calls, step);
  }
});

test("all API failures propagate as explicit redacted errors with no partial result or follow-up reads", async () => {
  for (const step of [1, 2, 3]) {
    let calls = 0;
    const observe: GitHubApiReader = async endpoint => {
      calls++;
      if (calls === step) throw new Error("Synthetic token and private response diagnostics");
      return reader()(endpoint, { requestTimeoutMs: 1, maxResponseBytes: 65536 });
    };
    await assert.rejects(auditGitHubSourceRun(options, observe), error =>
      error instanceof Error && error.message ===
        "GitHub source-run API read failed; verify authentication, availability and explicit limits");
    assert.equal(calls, step);
  }
});

test("caller mutation during the first await cannot change captured authority, source, attempt, branch or limits", async () => {
  const input = { ...options, branch: "release/canonical" }, f = fixture(input), before = { ...input }, calls: string[] = [];
  const observe: GitHubApiReader = async (endpoint, limits) => {
    if (!calls.length) {
      await Promise.resolve();
      input.repository = "OtherOwner/other-repo"; input.repositoryId++;
      input.workflowId++; input.workflowPath = ".github/workflows/other.yml";
      input.branch = "other"; input.sourceCommit = "b".repeat(40);
      input.runId++; input.runAttempt++; input.maxResponseBytes = 1; input.requestTimeoutMs = 1;
    }
    assert.deepEqual(limits, { requestTimeoutMs: before.requestTimeoutMs, maxResponseBytes: before.maxResponseBytes });
    return reader(f, calls)(endpoint, limits);
  };
  const report = await auditGitHubSourceRun(input, observe);
  assert.deepEqual(report, { stage: "github-source-run", repository: before.repository, repositoryId: before.repositoryId,
    workflowId: before.workflowId, workflowPath: before.workflowPath, branch: before.branch,
    sourceCommit: before.sourceCommit, runId: before.runId, runAttempt: before.runAttempt, requestCount: 3 });
  assert.deepEqual(calls, [`repos/${before.repository}/git/ref/heads/release/canonical`,
    `repos/${before.repository}/actions/runs/${before.runId}`, `repos/${before.repository}/git/ref/heads/release/canonical`]);
});
