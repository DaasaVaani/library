import Ajv2020 from "ajv/dist/2020.js";
import { decodeGitHubApiJson, readGitHubApi, type GitHubApiReader } from "./github-api.js";
export type { GitHubApiReadLimits, GitHubApiReader } from "./github-api.js";

export interface GitHubSourceRunOptions {
  repository: string;
  repositoryId: number;
  workflowId: number;
  workflowPath: string;
  branch: string;
  sourceCommit: string;
  runId: number;
  runAttempt: number;
  requestTimeoutMs: number;
  maxResponseBytes: number;
}
export interface GitHubSourceRunObservation {
  stage: "github-source-run";
  repository: string;
  repositoryId: number;
  workflowId: number;
  workflowPath: string;
  branch: string;
  sourceCommit: string;
  runId: number;
  runAttempt: number;
  requestCount: 3;
}
interface RepositoryIdentity { id: number; full_name: string }
interface SourceRun {
  id: number;
  run_attempt: number;
  workflow_id: number;
  path: string;
  head_branch: string;
  head_sha: string;
  event: "push";
  status: "completed";
  conclusion: "success";
  repository: RepositoryIdentity;
  head_repository: RepositoryIdentity;
}
interface SourceRef {
  ref: string;
  object: { type: "commit"; sha: string };
}
const positive = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const bounded = { type: "integer", minimum: 1, maximum: 2147483647 };
const commit = { type: "string", pattern: "^[0-9a-f]{40}$" };
const optionProperties = {
  repository: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_][A-Za-z0-9._-]*$" },
  repositoryId: positive, workflowId: positive,
  workflowPath: { type: "string", pattern: "^\\.github/workflows/[A-Za-z0-9_][A-Za-z0-9._-]*\\.ya?ml$" },
  branch: { type: "string", pattern: "^[A-Za-z0-9_][A-Za-z0-9._-]*(/[A-Za-z0-9_][A-Za-z0-9._-]*)*$" },
  sourceCommit: commit, runId: positive, runAttempt: positive, requestTimeoutMs: bounded, maxResponseBytes: bounded
};
const identity = { type: "object", required: ["id", "full_name"], properties: { id: positive, full_name: { type: "string" } } };
const ajv = new Ajv2020.default({ strict: true });
const validateOptions = ajv.compile<GitHubSourceRunOptions>({
  type: "object", additionalProperties: false, required: Object.keys(optionProperties), properties: optionProperties
});
const validateRun = ajv.compile<SourceRun>({
  type: "object", required: ["id", "run_attempt", "workflow_id", "path", "head_branch", "head_sha",
    "event", "status", "conclusion", "repository", "head_repository"],
  properties: { id: positive, run_attempt: positive, workflow_id: positive, path: { type: "string" },
    head_branch: { type: "string" }, head_sha: commit, event: { const: "push" },
    status: { const: "completed" }, conclusion: { const: "success" }, repository: identity, head_repository: identity }
});
const validateRef = ajv.compile<SourceRef>({
  type: "object", required: ["ref", "object"], properties: {
    ref: { type: "string" }, object: { type: "object", required: ["type", "sha"],
      properties: { type: { const: "commit" }, sha: commit } }
  }
});

export async function auditGitHubSourceRun(requested: GitHubSourceRunOptions,
  read: GitHubApiReader = readGitHubApi): Promise<GitHubSourceRunObservation> {
  const options = { ...requested };
  if (!validateOptions(options) || typeof read !== "function") throw new Error("Invalid GitHub source-run options");
  const limits = Object.freeze({ requestTimeoutMs: options.requestTimeoutMs, maxResponseBytes: options.maxResponseBytes });
  const root = `repos/${options.repository}`, ref = `${root}/git/ref/heads/${options.branch}`;
  const load = async (endpoint: string): Promise<unknown> => {
    let bytes: Uint8Array;
    try { bytes = await read(endpoint, limits); }
    catch { throw new Error("GitHub source-run API read failed; verify authentication, availability and explicit limits"); }
    return decodeGitHubApiJson(bytes, limits.maxResponseBytes, "source-run");
  };
  const verifyRef = async () => {
    const value = await load(ref);
    if (!validateRef(value) || value.ref !== `refs/heads/${options.branch}` || value.object.sha !== options.sourceCommit) {
      throw new Error("GitHub source-run branch tip does not match the expected source");
    }
  };
  await verifyRef();
  const run = await load(`${root}/actions/runs/${options.runId}`);
  if (!validateRun(run) || run.id !== options.runId || run.run_attempt !== options.runAttempt ||
      run.workflow_id !== options.workflowId || run.path !== options.workflowPath ||
      run.head_branch !== options.branch || run.head_sha !== options.sourceCommit ||
      [run.repository, run.head_repository].some(repository =>
        repository.id !== options.repositoryId || repository.full_name !== options.repository)) {
    throw new Error("GitHub source-run does not match the expected successful push workflow");
  }
  await verifyRef();
  return { stage: "github-source-run", repository: options.repository, repositoryId: options.repositoryId,
    workflowId: options.workflowId, workflowPath: options.workflowPath, branch: options.branch,
    sourceCommit: options.sourceCommit, runId: options.runId, runAttempt: options.runAttempt, requestCount: 3 };
}
