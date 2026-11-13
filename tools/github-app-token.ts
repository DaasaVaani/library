import { captureGitHubApiReadLimits, decodeGitHubApiJson, type GitHubApiReadLimits } from "./github-api.js";
import { auditGitHubAppWriterTokenMetadata, captureGitHubAppWriterTokenOptions, observeGitHubAppInstallation,
  type GitHubAppWriterTokenMetadataObservation, type GitHubAppWriterTokenMetadataOptions } from "./github-app-installation.js";
import { createGitHubAppInstallationReaders, isGitHubAppCredential, requestGitHubApp } from "./github-app-reader.js";

export type GitHubAppWriterTokenOptions = Omit<GitHubAppWriterTokenMetadataOptions, "observedAt"> & GitHubApiReadLimits;
export interface GitHubAppWriterTokenLease {
  readonly token: string;
  readonly metadata: Readonly<GitHubAppWriterTokenMetadataObservation>;
}

export async function withGitHubAppWriterToken<T>(requested: GitHubAppWriterTokenOptions, appJwt: string,
  operation: (lease: GitHubAppWriterTokenLease) => Promise<T>, now: () => string,
  fetcher: typeof fetch = fetch): Promise<T> {
  const { requestTimeoutMs, maxResponseBytes, ...requestedIdentity } = { ...requested };
  const limits = captureGitHubApiReadLimits({ requestTimeoutMs, maxResponseBytes });
  if (Reflect.ownKeys(requested).length !== 10 || "observedAt" in requestedIdentity ||
      !isGitHubAppCredential(appJwt) || typeof operation !== "function" || typeof now !== "function" ||
      typeof fetcher !== "function") throw new Error("Invalid GitHub App writer token lifecycle inputs");
  const time = () => {
    try { return now(); }
    catch { throw new Error("GitHub App writer token clock failed"); }
  };
  const { observedAt: _initialTime, ...identity } = captureGitHubAppWriterTokenOptions({ ...requestedIdentity, observedAt: time() });
  let raw: unknown;
  try {
    const bytes = await requestGitHubApp({ kind: "mint", installationId: identity.installationId,
      repositoryId: identity.repositoryId, credential: appJwt }, limits, fetcher);
    raw = decodeGitHubApiJson(bytes, limits.maxResponseBytes, "app-token");
  } catch {
    throw new Error("GitHub App token issuance not confirmed; do not retry automatically; operator reconciliation required");
  }
  if (!raw || typeof raw !== "object" || !("token" in raw) || !isGitHubAppCredential(raw.token) || raw.token === appJwt) {
    throw new Error("GitHub App token response has no safe distinct credential; operator reconciliation required");
  }
  const token = raw.token;
  const suppliedMetadata = {
    permissions: "permissions" in raw ? raw.permissions : undefined,
    repository_selection: "repository_selection" in raw ? raw.repository_selection : undefined,
    repositories: "repositories" in raw ? raw.repositories : undefined,
    expires_at: "expires_at" in raw ? raw.expires_at : undefined,
  };
  let outcome: { ok: true; value: T } | { ok: false } = { ok: false };
  try {
    auditGitHubAppWriterTokenMetadata({ ...identity, observedAt: time() }, suppliedMetadata);
    const readers = createGitHubAppInstallationReaders({ installationId: identity.installationId, appJwt, installationToken: token }, fetcher);
    const { minRemainingMs: _minimum, maxRemainingMs: _maximum, ...installationIdentity } = identity;
    await observeGitHubAppInstallation({ ...installationIdentity, ...limits }, readers.readApp, readers.readInstallation);
    const currentMetadata = auditGitHubAppWriterTokenMetadata({ ...identity, observedAt: time() }, suppliedMetadata);
    outcome = { ok: true, value: await operation(Object.freeze({ token, metadata: Object.freeze(currentMetadata) })) };
  } catch {
    outcome = { ok: false };
  }
  try {
    await requestGitHubApp({ kind: "revoke", credential: token }, limits, fetcher);
  } catch {
    throw new Error(!outcome.ok ? "GitHub App writer operation and token revocation failed; operator reconciliation required" :
      "GitHub App token revocation not confirmed; operator reconciliation required");
  }
  if (!outcome.ok) throw new Error("GitHub App writer admission or operation failed; token revocation confirmed");
  return outcome.value;
}
