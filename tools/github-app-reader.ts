import { captureGitHubApiReadLimits, type GitHubApiReader, type GitHubApiReadLimits } from "./github-api.js";

export interface GitHubAppInstallationCredentials {
  installationId: number;
  appJwt: string;
  installationToken: string;
}
export interface GitHubAppInstallationReaders {
  readonly readApp: GitHubApiReader;
  readonly readInstallation: GitHubApiReader;
}
class AppReadError extends Error {}

export const isGitHubAppCredential = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && !/[\x00-\x20\x7f-\uffff]/.test(value);
export type GitHubAppRequest =
  | { kind: "installation"; installationId: number; credential: string }
  | { kind: "repositories" | "revoke"; credential: string }
  | { kind: "mint"; installationId: number; repositoryId: number; credential: string };

export async function requestGitHubApp(requested: GitHubAppRequest, requestedLimits: Readonly<GitHubApiReadLimits>,
  fetcher: typeof fetch): Promise<Uint8Array> {
  const request = { ...requested }, limits = captureGitHubApiReadLimits(requestedLimits);
  const expectedKeys = request.kind === "mint" ? ["kind", "installationId", "repositoryId", "credential"] :
    request.kind === "installation" ? ["kind", "installationId", "credential"] : ["kind", "credential"];
  if (!["installation", "repositories", "mint", "revoke"].includes(request.kind) ||
      Reflect.ownKeys(request).length !== expectedKeys.length ||
      !expectedKeys.every(key => Object.hasOwn(request, key)) || !isGitHubAppCredential(request.credential) ||
      typeof fetcher !== "function" ||
      ("installationId" in request && (!Number.isSafeInteger(request.installationId) || request.installationId < 1)) ||
      ("repositoryId" in request && (!Number.isSafeInteger(request.repositoryId) || request.repositoryId < 1))) {
    throw new AppReadError("Invalid scoped GitHub App request");
  }
  const endpoint = request.kind === "installation" ? `app/installations/${request.installationId}` :
    request.kind === "mint" ? `app/installations/${request.installationId}/access_tokens` :
      request.kind === "revoke" ? "installation/token" : "installation/repositories";
  const method = request.kind === "mint" ? "POST" : request.kind === "revoke" ? "DELETE" : "GET";
  const expectedStatus = request.kind === "mint" ? 201 : request.kind === "revoke" ? 204 : 200;
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new AppReadError("GitHub App API requires TLS certificate verification");
  const url = `https://api.github.com/${endpoint}`, controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AppReadError("GitHub App API request deadline exceeded"));
      controller.abort();
    }, limits.requestTimeoutMs);
  });
  const read = async () => {
    const response = await fetcher(url, {
      method, redirect: "error", credentials: "omit", signal: controller.signal,
      headers: { Authorization: `Bearer ${request.credential}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "Accept-Encoding": "identity",
        "Cache-Control": "no-cache, no-store",
        ...(request.kind === "mint" ? { "Content-Type": "application/json" } : {}) },
      ...(request.kind === "mint" ? { body: JSON.stringify({ repository_ids: [request.repositoryId],
        permissions: { contents: "write", metadata: "read" } }) } : {})
    });
    const reader = response.body?.getReader();
    try {
      if (response.status !== expectedStatus || response.redirected || response.url !== url) {
        throw new AppReadError("GitHub App API response status or URL mismatch");
      }
      const encoding = response.headers.get("content-encoding"), length = response.headers.get("content-length");
      if (encoding && encoding.toLowerCase() !== "identity") throw new AppReadError("GitHub App API content encoding is unsupported");
      if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || BigInt(length) > BigInt(limits.maxResponseBytes))) {
        throw new AppReadError("GitHub App API response exceeds byte bounds");
      }
      if (!reader && expectedStatus !== 204) throw new AppReadError("GitHub App API response body is missing");
      const chunks: Buffer[] = [];
      let size = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.length > limits.maxResponseBytes - size) throw new AppReadError("GitHub App API response exceeds byte bounds");
        size += value.length;
        chunks.push(Buffer.from(value));
      }
      if ((expectedStatus === 204 ? size !== 0 : size === 0) || (length !== null && BigInt(length) !== BigInt(size))) {
        throw new AppReadError("GitHub App API response is empty or truncated");
      }
      return Buffer.concat(chunks, size);
    } finally {
      if (reader) {
        try { await reader.cancel(); }
        finally { reader.releaseLock(); }
      }
    }
  };
  try { return await Promise.race([read(), deadline]); }
  catch (error) {
    if (error instanceof AppReadError) throw error;
    throw new AppReadError("GitHub App API transport or response stream failed");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}

export function createGitHubAppInstallationReaders(requested: GitHubAppInstallationCredentials,
  fetcher: typeof fetch = fetch): GitHubAppInstallationReaders {
  const options = { ...requested };
  if (Object.keys(options).length !== 3 || !Number.isSafeInteger(options.installationId) || options.installationId < 1 ||
      !isGitHubAppCredential(options.appJwt) || !isGitHubAppCredential(options.installationToken) ||
      options.appJwt === options.installationToken || typeof fetcher !== "function") {
    throw new AppReadError("Invalid GitHub App installation reader credentials or options");
  }
  const appEndpoint = `app/installations/${options.installationId}`;
  const reader = (allowed: string, token: string): GitHubApiReader => async (endpoint, requestedLimits) => {
    const limits = captureGitHubApiReadLimits(requestedLimits);
    if (endpoint !== allowed) throw new AppReadError("GitHub App API endpoint is outside the captured credential scope");
    return requestGitHubApp(allowed === appEndpoint ? { kind: "installation", installationId: options.installationId,
      credential: token } : { kind: "repositories", credential: token }, limits, fetcher);
  };
  return Object.freeze({ readApp: reader(appEndpoint, options.appJwt),
    readInstallation: reader("installation/repositories", options.installationToken) });
}
