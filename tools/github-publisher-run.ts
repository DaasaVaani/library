import Ajv2020 from "ajv/dist/2020.js";
import { decodeGitHubApiJson, readGitHubApi, type GitHubApiReader } from "./github-api.js";
export type { GitHubApiReadLimits, GitHubApiReader } from "./github-api.js";

export interface GitHubPublisherRunOptions {
  repository: string;
  repositoryId: number;
  workflowId: number;
  workflowPath: string;
  publisherBranch: string;
  publisherHeadCommit: string;
  publisherRunId: number;
  publisherRunAttempt: number;
  expectedPhase: "in_progress" | "completed";
  requestTimeoutMs: number;
  maxResponseBytes: number;
}
export interface GitHubPublisherRunObservation {
  stage: "github-publisher-run";
  repository: string;
  repositoryId: number;
  workflowId: number;
  workflowPath: string;
  publisherBranch: string;
  publisherHeadCommit: string;
  publisherRunId: number;
  publisherRunAttempt: number;
  expectedPhase: "in_progress" | "completed";
  requestCount: 3;
}
interface RepositoryIdentity { id: number; full_name: string }
interface PublisherRun {
  id: number;
  run_attempt: number;
  workflow_id: number;
  path: string;
  head_branch: string;
  head_sha: string;
  event: "workflow_run";
  status: "in_progress" | "completed";
  conclusion: null | "success";
  repository: RepositoryIdentity;
  head_repository: RepositoryIdentity;
}
const positive = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const bounded = { type: "integer", minimum: 1, maximum: 2147483647 };
const commit = { type: "string", pattern: "^[0-9a-f]{40}$" };
const optionProperties = {
  repository: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_][A-Za-z0-9._-]*$" },
  repositoryId: positive, workflowId: positive,
  workflowPath: { type: "string", pattern: "^\\.github/workflows/[A-Za-z0-9_][A-Za-z0-9._-]*\\.ya?ml$" },
  publisherBranch: { type: "string", pattern: "^[A-Za-z0-9_][A-Za-z0-9._-]*(/[A-Za-z0-9_][A-Za-z0-9._-]*)*$" },
  publisherHeadCommit: commit, publisherRunId: positive, publisherRunAttempt: positive,
  expectedPhase: { enum: ["in_progress", "completed"] },
  requestTimeoutMs: bounded, maxResponseBytes: bounded
};
const identity = { type: "object", required: ["id", "full_name"], properties: { id: positive, full_name: { type: "string" } } };
const ajv = new Ajv2020.default({ strict: true });
const validateOptions = ajv.compile<GitHubPublisherRunOptions>({
  type: "object", additionalProperties: false, required: Object.keys(optionProperties), properties: optionProperties
});
const validateRun = ajv.compile<PublisherRun>({
  type: "object", required: ["id", "run_attempt", "workflow_id", "path", "head_branch", "head_sha",
    "event", "status", "conclusion", "repository", "head_repository"],
  properties: { id: positive, run_attempt: positive, workflow_id: positive, path: { type: "string" },
    head_branch: { type: "string" }, head_sha: commit, event: { const: "workflow_run" },
    status: { enum: ["in_progress", "completed"] }, conclusion: { enum: [null, "success"] },
    repository: identity, head_repository: identity }
});

/**
 * CI-01/03/06, GEN-02/05: point-in-time publisher identity observations only.
 * The workflow-run head is not the checked-out source. This establishes no
 * triggering source run, artifact/attempt binding, approval or deployment receipt.
 * Provider run_attempt is optional; missing evidence fails, never inferred.
 */
export async function auditGitHubPublisherRun(requested: GitHubPublisherRunOptions,
  read: GitHubApiReader = readGitHubApi): Promise<GitHubPublisherRunObservation> {
  if (!requested || typeof requested !== "object" || Array.isArray(requested) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(requested)) ||
      Reflect.ownKeys(requested).length !== Object.keys(requested).length ||
      Object.values(Object.getOwnPropertyDescriptors(requested)).some(value => !("value" in value))) {
    throw new Error("Invalid GitHub publisher-run options");
  }
  const options = { ...requested };
  if (!validateOptions(options) || typeof read !== "function" ||
      Object.values(options).some(value => typeof value === "string" && /[\r\n]/.test(value))) {
    throw new Error("Invalid GitHub publisher-run options");
  }
  const limits = Object.freeze({ requestTimeoutMs: options.requestTimeoutMs, maxResponseBytes: options.maxResponseBytes });
  const latest = `repos/${options.repository}/actions/runs/${options.publisherRunId}`;
  const observe = async (endpoint: string) => {
    let bytes: Uint8Array;
    try { bytes = await read(endpoint, limits); }
    catch { throw new Error("GitHub publisher-run API read failed; verify authentication, availability and explicit limits"); }
    let run: unknown;
    try {
      run = decodeGitHubApiJson(bytes, limits.maxResponseBytes, "publisher-run");
    } catch {
      throw new Error("Invalid or out-of-bounds GitHub publisher-run API JSON");
    }
    if (!validateRun(run) || run.id !== options.publisherRunId || run.run_attempt !== options.publisherRunAttempt ||
        run.workflow_id !== options.workflowId || run.path !== options.workflowPath ||
        run.head_branch !== options.publisherBranch || run.head_sha !== options.publisherHeadCommit ||
        run.status !== options.expectedPhase || run.conclusion !== (options.expectedPhase === "completed" ? "success" : null) ||
        [run.repository, run.head_repository].some(repository =>
          repository.id !== options.repositoryId || repository.full_name !== options.repository)) {
      throw new Error("GitHub publisher-run does not match the expected workflow_run identity and phase");
    }
  };
  await observe(latest);
  await observe(`${latest}/attempts/${options.publisherRunAttempt}`);
  await observe(latest);
  return { stage: "github-publisher-run", repository: options.repository, repositoryId: options.repositoryId,
    workflowId: options.workflowId, workflowPath: options.workflowPath, publisherBranch: options.publisherBranch,
    publisherHeadCommit: options.publisherHeadCommit, publisherRunId: options.publisherRunId,
    publisherRunAttempt: options.publisherRunAttempt, expectedPhase: options.expectedPhase, requestCount: 3 };
}
