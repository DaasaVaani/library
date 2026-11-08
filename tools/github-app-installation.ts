import Ajv2020 from "ajv/dist/2020.js";
import { decodeGitHubApiJson, type GitHubApiReader } from "./github-api.js";

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
  repositories: [{ id: number; full_name: string; owner: { id: number; login: string; type: "Organization" } }];
}
const positive = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const organization = {
  type: "object", required: ["id", "login", "type"],
  properties: { id: positive, login: { type: "string" }, type: { const: "Organization" } }
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
    permissions: { type: "object", additionalProperties: false, required: ["contents", "metadata"],
      properties: { contents: { const: "write" }, metadata: { const: "read" } } },
    events: { type: "array", maxItems: 0 }, suspended_at: { type: "null" }
  }
});
const validateRepositories = ajv.compile<Repositories>({
  type: "object", required: ["total_count", "repositories"], properties: {
    total_count: { const: 1 }, repositories: {
      type: "array", minItems: 1, maxItems: 1, items: {
        type: "object", required: ["id", "full_name", "owner"],
        properties: { id: positive, full_name: { type: "string" }, owner: organization }
      }
    }
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
  const owner = options.repository.split("/")[0];
  assertInstallation(options, installation);
  if (!validateRepositories(accessibleRepositories)) {
    throw new Error("GitHub App repository evidence must contain exactly one accessible repository");
  }
  const repository = accessibleRepositories.repositories[0];
  if (repository.id !== options.repositoryId || repository.full_name !== options.repository ||
      repository.owner.id !== options.organizationId || repository.owner.login !== owner) {
    throw new Error("GitHub App accessible repository does not match the expected Library identity");
  }
  return { stage: "github-app-installation", repository: options.repository, repositoryId: options.repositoryId,
    organizationId: options.organizationId, appId: options.appId, appSlug: options.appSlug,
    installationId: options.installationId };
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
