import Ajv2020 from "ajv/dist/2020.js";
import { decodeGitHubApiJson, readGitHubApi, type GitHubApiReader } from "./github-api.js";

export interface GitHubDeploymentOptions {
  repository: string;
  repositoryId: number;
  deploymentId: number;
  statusId: number;
  deploymentCommit: string;
  deploymentRef: string;
  environment: string;
  environmentUrl: string;
  task: string;
  deploymentCreatorId: number;
  statusCreatorId: number;
  requestTimeoutMs: number;
  maxResponseBytes: number;
}
export interface GitHubDeploymentObservation {
  stage: "github-deployment-status";
  repository: string;
  repositoryId: number;
  deploymentId: number;
  statusId: number;
  deploymentCommit: string;
  deploymentRef: string;
  environment: string;
  task: string;
  deploymentCreatorId: number;
  statusCreatorId: number;
  requestCount: 5;
}
const positive = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const bounded = { type: "integer", minimum: 1, maximum: 2147483647 };
const segment = { type: "string", pattern: "^[A-Za-z0-9_][A-Za-z0-9._-]*(/[A-Za-z0-9_][A-Za-z0-9._-]*)*$" };
const commit = { type: "string", pattern: "^[0-9a-f]{40}$" };
const creator = { type: "object", required: ["id"], properties: { id: positive } };
const properties = {
  repository: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_][A-Za-z0-9._-]*$" },
  repositoryId: positive, deploymentId: positive, statusId: positive, deploymentCommit: commit,
  deploymentRef: segment, environment: segment, environmentUrl: { type: "string" },
  task: { type: "string", pattern: "^[A-Za-z0-9_][A-Za-z0-9._:-]*$" },
  deploymentCreatorId: positive, statusCreatorId: positive,
  requestTimeoutMs: bounded, maxResponseBytes: bounded
};
const ajv = new Ajv2020.default({ strict: true });
const validateOptions = ajv.compile<GitHubDeploymentOptions>({
  type: "object", additionalProperties: false, required: Object.keys(properties), properties
});
const validateRepository = ajv.compile<{ id: number; full_name: string }>({
  type: "object", required: ["id", "full_name"], properties: { id: positive, full_name: { type: "string" } }
});
const validateDeployment = ajv.compile<{ id: number; sha: string; ref: string; task: string; environment: string;
  repository_url: string; creator: { id: number } }>({
  type: "object", required: ["id", "sha", "ref", "task", "environment", "repository_url", "creator"],
  properties: { id: positive, sha: commit, ref: { type: "string" }, task: { type: "string" },
    environment: { type: "string" }, repository_url: { type: "string" }, creator }
});
const validateStatus = ajv.compile<{ id: number; state: "success"; environment: string;
  environment_url: string; creator: { id: number } }>({
  type: "object", required: ["id", "state", "environment", "environment_url", "creator"],
  properties: { id: positive, state: { const: "success" }, environment: { type: "string" },
    environment_url: { type: "string" }, creator }
});

export async function auditGitHubDeployment(requested: GitHubDeploymentOptions,
  read: GitHubApiReader = readGitHubApi): Promise<GitHubDeploymentObservation> {
  const options = { ...requested };
  if (!validateOptions(options) || typeof read !== "function") throw new Error("Invalid GitHub deployment options");
  let environment: URL;
  try { environment = new URL(options.environmentUrl); }
  catch { throw new Error("Invalid GitHub deployment environment URL"); }
  if (environment.protocol !== "https:" || !environment.hostname || environment.username || environment.password ||
      environment.search || environment.hash) throw new Error("Invalid GitHub deployment environment URL");
  const repository = `repos/${options.repository}`, deployment = `${repository}/deployments/${options.deploymentId}`;
  const limits = Object.freeze({ requestTimeoutMs: options.requestTimeoutMs, maxResponseBytes: options.maxResponseBytes });
  const load = async (endpoint: string): Promise<unknown> => {
    let bytes: Uint8Array;
    try { bytes = await read(endpoint, limits); }
    catch { throw new Error("GitHub deployment API read failed; verify authentication, availability and explicit limits"); }
    return decodeGitHubApiJson(bytes, options.maxResponseBytes, "deployment");
  };
  const checkRepository = async () => {
    const value = await load(repository);
    if (!validateRepository(value) || value.id !== options.repositoryId || value.full_name !== options.repository) {
      throw new Error("GitHub deployment repository does not match expected identity");
    }
  };
  const checkDeployment = async () => {
    const value = await load(deployment);
    if (!validateDeployment(value) || value.id !== options.deploymentId || value.sha !== options.deploymentCommit ||
        value.ref !== options.deploymentRef || value.task !== options.task || value.environment !== options.environment ||
        value.repository_url !== `https://api.github.com/repos/${options.repository}` ||
        value.creator.id !== options.deploymentCreatorId) {
      throw new Error("GitHub deployment does not match expected identity");
    }
  };
  await checkRepository();
  await checkDeployment();
  const status = await load(`${deployment}/statuses/${options.statusId}`);
  if (!validateStatus(status) || status.id !== options.statusId || status.environment !== options.environment ||
      status.environment_url !== options.environmentUrl || status.creator.id !== options.statusCreatorId) {
    throw new Error("GitHub deployment status does not match expected successful status");
  }
  await checkDeployment();
  await checkRepository();
  return { stage: "github-deployment-status", repository: options.repository, repositoryId: options.repositoryId,
    deploymentId: options.deploymentId, statusId: options.statusId, deploymentCommit: options.deploymentCommit,
    deploymentRef: options.deploymentRef, environment: options.environment, task: options.task,
    deploymentCreatorId: options.deploymentCreatorId, statusCreatorId: options.statusCreatorId, requestCount: 5 };
}
