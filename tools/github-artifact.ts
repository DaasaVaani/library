import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import { decodeGitHubApiJson, readGitHubApi, type GitHubApiReader } from "./github-api.js";

export interface GitHubArtifactOptions {
  repository: string;
  repositoryId: number;
  artifactId: number;
  artifactName: string;
  artifactSha256: string;
  publisherRunId: number;
  publisherHeadCommit: string;
  publisherBranch: string;
  requestTimeoutMs: number;
  maxMetadataBytes: number;
  maxArchiveBytes: number;
}
export interface GitHubArtifactObservation {
  stage: "github-artifact-bytes";
  repository: string;
  repositoryId: number;
  artifactId: number;
  artifactName: string;
  artifactSha256: string;
  publisherRunId: number;
  publisherHeadCommit: string;
  publisherBranch: string;
  artifactBytes: number;
  requestCount: 3;
}
interface ArtifactMetadata {
  id: number;
  name: string;
  digest: string;
  expired: false;
  size_in_bytes: number;
  workflow_run: { id: number; repository_id: number; head_repository_id: number; head_branch: string; head_sha: string };
}
const positive = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const bounded = { type: "integer", minimum: 1, maximum: 2147483647 };
const commit = { type: "string", pattern: "^[0-9a-f]{40}$" };
const properties = {
  repository: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_][A-Za-z0-9._-]*$" },
  repositoryId: positive, artifactId: positive,
  artifactName: { type: "string", pattern: "^[A-Za-z0-9_][A-Za-z0-9._-]*$" },
  artifactSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
  publisherRunId: positive, publisherHeadCommit: commit,
  publisherBranch: { type: "string", pattern: "^[A-Za-z0-9_][A-Za-z0-9._-]*(/[A-Za-z0-9_][A-Za-z0-9._-]*)*$" },
  requestTimeoutMs: bounded, maxMetadataBytes: bounded, maxArchiveBytes: bounded
};
const ajv = new Ajv2020.default({ strict: true });
const validateOptions = ajv.compile<GitHubArtifactOptions>({
  type: "object", additionalProperties: false, required: Object.keys(properties), properties
});
const validateMetadata = ajv.compile<ArtifactMetadata>({
  type: "object", required: ["id", "name", "digest", "expired", "size_in_bytes", "workflow_run"],
  properties: { id: positive, name: { type: "string" }, digest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
    expired: { const: false }, size_in_bytes: positive,
    workflow_run: { type: "object", required: ["id", "repository_id", "head_repository_id", "head_branch", "head_sha"],
      properties: { id: positive, repository_id: positive, head_repository_id: positive,
        head_branch: { type: "string" }, head_sha: commit } } }
});

export async function auditGitHubArtifact(requested: GitHubArtifactOptions,
  read: GitHubApiReader = readGitHubApi): Promise<GitHubArtifactObservation> {
  const options = { ...requested };
  if (!validateOptions(options) || typeof read !== "function") throw new Error("Invalid GitHub artifact options");
  const endpoint = `repos/${options.repository}/actions/artifacts/${options.artifactId}`;
  const load = async (path: string, maxResponseBytes: number): Promise<Uint8Array> => {
    let bytes: Uint8Array;
    try { bytes = await read(path, Object.freeze({ requestTimeoutMs: options.requestTimeoutMs, maxResponseBytes })); }
    catch { throw new Error("GitHub artifact API read failed; verify authentication, availability and explicit limits"); }
    if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > maxResponseBytes) {
      throw new Error("GitHub artifact API response exceeds byte bounds");
    }
    return bytes;
  };
  const metadata = async () => {
    const value = decodeGitHubApiJson(await load(endpoint, options.maxMetadataBytes), options.maxMetadataBytes, "artifact");
    if (!validateMetadata(value) || value.id !== options.artifactId || value.name !== options.artifactName ||
        value.digest !== `sha256:${options.artifactSha256}` || value.size_in_bytes > options.maxArchiveBytes ||
        value.workflow_run.id !== options.publisherRunId || value.workflow_run.repository_id !== options.repositoryId ||
        value.workflow_run.head_repository_id !== options.repositoryId || value.workflow_run.head_branch !== options.publisherBranch ||
        value.workflow_run.head_sha !== options.publisherHeadCommit) {
      throw new Error("GitHub artifact metadata does not match the expected artifact and publisher identity");
    }
    return value;
  };
  const before = await metadata();
  const bytes = await load(`${endpoint}/zip`, before.size_in_bytes);
  if (bytes.length !== before.size_in_bytes || createHash("sha256").update(bytes).digest("hex") !== options.artifactSha256) {
    throw new Error("GitHub artifact bytes do not match the expected size and digest");
  }
  const after = await metadata();
  if (after.size_in_bytes !== before.size_in_bytes) throw new Error("GitHub artifact metadata changed during observation");
  return { stage: "github-artifact-bytes", repository: options.repository, repositoryId: options.repositoryId,
    artifactId: options.artifactId, artifactName: options.artifactName, artifactSha256: options.artifactSha256,
    publisherRunId: options.publisherRunId, publisherHeadCommit: options.publisherHeadCommit,
    publisherBranch: options.publisherBranch, artifactBytes: bytes.length, requestCount: 3 };
}
