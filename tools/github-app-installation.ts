import Ajv2020 from "ajv/dist/2020.js";
import { decodeGitHubApiJson, type GitHubApiReader } from "./github-api.js";
import { isUtcMillisecondInstant } from "./publisher.js";

export interface GitHubAppInstallationOptions {
  repository: string;
  repositoryId: number;
  organizationId: number;
  appId: number;
  appSlug: string;
  installationId: number;
}
export interface GitHubAppInstallationObservation extends GitHubAppInstallationOptions {
  stage: "github-app-installation";
}
export interface GitHubAppInstallationReadOptions extends GitHubAppInstallationOptions {
  requestTimeoutMs: number;
  maxResponseBytes: number;
}
export interface GitHubAppWriterTokenMetadataOptions extends GitHubAppInstallationOptions {
  observedAt: string;
  minRemainingMs: number;
  maxRemainingMs: number;
}
export interface GitHubAppWriterTokenMetadataObservation extends GitHubAppInstallationOptions {
  stage: "github-app-writer-token-metadata";
  observedAt: string;
  expiresAt: string;
  remainingMs: number;
}
interface RepositoryIdentity {
  id: number;
  full_name: string;
  owner: { id: number; login: string; type: "Organization" };
}
interface Installation {
  id: number;
  app_id: number;
  app_slug: string;
  target_id: number;
  target_type: "Organization";
  account: { id: number; login: string; type: "Organization" };
  repository_selection: "selected";
  permissions: { contents: "write"; metadata: "read" };
  events: [];
  suspended_at: null;
}
interface Repositories {
  total_count: 1;
  repositories: [RepositoryIdentity];
}
interface WriterTokenMetadata {
  permissions: Installation["permissions"];
  repository_selection: "selected";
  repositories: [RepositoryIdentity];
  expires_at: string;
}
const positive = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const organization = {
  type: "object", required: ["id", "login", "type"],
  properties: { id: positive, login: { type: "string" }, type: { const: "Organization" } }
};
const writerPermissions = {
  type: "object", additionalProperties: false, required: ["contents", "metadata"],
  properties: { contents: { const: "write" }, metadata: { const: "read" } }
};
const repositoryArray = {
  type: "array", minItems: 1, maxItems: 1, items: {
    type: "object", required: ["id", "full_name", "owner"],
    properties: { id: positive, full_name: { type: "string" }, owner: organization }
  }
};
const optionProperties = {
  repository: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_][A-Za-z0-9._-]*$" },
  repositoryId: positive, organizationId: positive, appId: positive, installationId: positive,
  appSlug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" }
};
const ajv = new Ajv2020.default({ strict: true });
const validateOptions = ajv.compile<GitHubAppInstallationOptions>({
  type: "object", additionalProperties: false, required: Object.keys(optionProperties), properties: optionProperties
});
const readProperties = {
  ...optionProperties,
  requestTimeoutMs: { type: "integer", minimum: 1, maximum: 2147483647 },
  maxResponseBytes: { type: "integer", minimum: 1, maximum: 2147483647 }
};
const validateReadOptions = ajv.compile<GitHubAppInstallationReadOptions>({
  type: "object", additionalProperties: false, required: Object.keys(readProperties), properties: readProperties
});
const validateInstallation = ajv.compile<Installation>({
  type: "object", required: ["id", "app_id", "app_slug", "target_id", "target_type", "account",
    "repository_selection", "permissions", "events", "suspended_at"],
  properties: {
    id: positive, app_id: positive, app_slug: { type: "string" }, target_id: positive,
    target_type: { const: "Organization" }, account: organization, repository_selection: { const: "selected" },
    permissions: writerPermissions,
    events: { type: "array", maxItems: 0 }, suspended_at: { type: "null" }
  }
});
const validateRepositories = ajv.compile<Repositories>({
  type: "object", required: ["total_count", "repositories"], properties: {
    total_count: { const: 1 }, repositories: repositoryArray
  }
});
const tokenOptionProperties = {
  ...optionProperties, observedAt: { type: "string" },
  minRemainingMs: { type: "integer", minimum: 1, maximum: 3600000 },
  maxRemainingMs: { type: "integer", minimum: 1, maximum: 3600000 }
};
const validateTokenOptions = ajv.compile<GitHubAppWriterTokenMetadataOptions>({
  type: "object", additionalProperties: false, required: Object.keys(tokenOptionProperties), properties: tokenOptionProperties
});
const validateTokenMetadata = ajv.compile<WriterTokenMetadata>({
  type: "object", additionalProperties: false,
  required: ["permissions", "repository_selection", "repositories", "expires_at"],
  properties: {
    permissions: writerPermissions, repository_selection: { const: "selected" }, repositories: repositoryArray,
    expires_at: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$" }
  }
});

function assertInstallation(options: GitHubAppInstallationOptions, installation: unknown): asserts installation is Installation {
  const owner = options.repository.split("/")[0];
  if (!validateInstallation(installation) || installation.id !== options.installationId ||
      installation.app_id !== options.appId || installation.app_slug !== options.appSlug ||
      installation.target_id !== options.organizationId || installation.account.id !== options.organizationId ||
      installation.account.login !== owner) {
    throw new Error("GitHub App installation identity, scope or permissions do not match the expected writer");
  }
}

export function auditGitHubAppInstallation(requested: GitHubAppInstallationOptions,
  installation: unknown, accessibleRepositories: unknown): GitHubAppInstallationObservation {
  const options = { ...requested };
  if (!validateOptions(options)) throw new Error("Invalid GitHub App installation options");
  assertInstallation(options, installation);
  if (!validateRepositories(accessibleRepositories)) {
    throw new Error("GitHub App repository evidence must contain exactly one accessible repository");
  }
  assertRepository(options, accessibleRepositories.repositories[0]);
  return { stage: "github-app-installation", repository: options.repository, repositoryId: options.repositoryId,
    organizationId: options.organizationId, appId: options.appId, appSlug: options.appSlug,
    installationId: options.installationId };
}

function assertRepository(options: GitHubAppInstallationOptions, repository: RepositoryIdentity): void {
  const owner = options.repository.split("/")[0];
  if (repository.id !== options.repositoryId || repository.full_name !== options.repository ||
      repository.owner.id !== options.organizationId || repository.owner.login !== owner) {
    throw new Error("GitHub App accessible repository does not match the expected Library identity");
  }
}

export function captureGitHubAppWriterTokenOptions(requested: GitHubAppWriterTokenMetadataOptions): Readonly<GitHubAppWriterTokenMetadataOptions> {
  const options = { ...requested };
  if (!validateTokenOptions(options) || !isUtcMillisecondInstant(options.observedAt) ||
      options.minRemainingMs > options.maxRemainingMs) {
    throw new Error("Invalid GitHub App writer token metadata options");
  }
  return Object.freeze(options);
}

export function auditGitHubAppWriterTokenMetadata(requested: GitHubAppWriterTokenMetadataOptions,
  metadata: unknown): GitHubAppWriterTokenMetadataObservation {
  const options = captureGitHubAppWriterTokenOptions(requested);
  if (!validateTokenMetadata(metadata)) throw new Error("Invalid GitHub App writer token permissions, scope or metadata");
  const expiresAt = metadata.expires_at.includes(".") ? metadata.expires_at : metadata.expires_at.replace("Z", ".000Z");
  if (!isUtcMillisecondInstant(expiresAt)) throw new Error("Invalid GitHub App writer token expiry");
  assertRepository(options, metadata.repositories[0]);
  const remainingMs = Date.parse(expiresAt) - Date.parse(options.observedAt);
  if (remainingMs < options.minRemainingMs || remainingMs > options.maxRemainingMs) {
    throw new Error("GitHub App writer token remaining lifetime is outside the explicit bounds");
  }
  return { stage: "github-app-writer-token-metadata", repository: options.repository, repositoryId: options.repositoryId,
    organizationId: options.organizationId, appId: options.appId, appSlug: options.appSlug,
    installationId: options.installationId, observedAt: options.observedAt, expiresAt, remainingMs };
}

export async function observeGitHubAppInstallation(requested: GitHubAppInstallationReadOptions,
  readApp: GitHubApiReader, readInstallation: GitHubApiReader): Promise<GitHubAppInstallationObservation> {
  const captured = { ...requested };
  if (!validateReadOptions(captured) || typeof readApp !== "function" || typeof readInstallation !== "function") {
    throw new Error("Invalid GitHub App installation read options or authenticated readers");
  }
  const { requestTimeoutMs, maxResponseBytes, ...identity } = captured;
  const limits = Object.freeze({ requestTimeoutMs, maxResponseBytes });
  const installationEndpoint = `app/installations/${identity.installationId}`;
  const load = async (read: GitHubApiReader, endpoint: string): Promise<unknown> => {
    let bytes: Uint8Array;
    try { bytes = await read(endpoint, limits); }
    catch { throw new Error("GitHub App installation API read failed; verify authentication, availability and explicit limits"); }
    return decodeGitHubApiJson(bytes, maxResponseBytes, "app-installation");
  };
  const installation = await load(readApp, installationEndpoint);
  assertInstallation(identity, installation);
  const repositories = await load(readInstallation, "installation/repositories");
  auditGitHubAppInstallation(identity, installation, repositories);
  const finalInstallation = await load(readApp, installationEndpoint);
  assertInstallation(identity, finalInstallation);
  const finalRepositories = await load(readInstallation, "installation/repositories");
  return auditGitHubAppInstallation(identity, finalInstallation, finalRepositories);
}
