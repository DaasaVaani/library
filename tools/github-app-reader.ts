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

async function readMetadata(endpoint: string, credential: string, limits: Readonly<GitHubApiReadLimits>,
  fetcher: typeof fetch): Promise<Uint8Array> {
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
      method: "GET", redirect: "error", credentials: "omit", signal: controller.signal,
      headers: { Authorization: `Bearer ${credential}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "Accept-Encoding": "identity",
        "Cache-Control": "no-cache, no-store" }
    });
    const reader = response.body?.getReader();
    try {
      if (response.status !== 200 || response.redirected || response.url !== url) {
        throw new AppReadError("GitHub App API response status or URL mismatch");
      }
      const encoding = response.headers.get("content-encoding"), length = response.headers.get("content-length");
      if (encoding && encoding.toLowerCase() !== "identity") throw new AppReadError("GitHub App API content encoding is unsupported");
      if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || BigInt(length) > BigInt(limits.maxResponseBytes))) {
        throw new AppReadError("GitHub App API response exceeds byte bounds");
      }
      if (!reader) throw new AppReadError("GitHub App API response body is missing");
      const chunks: Buffer[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.length > limits.maxResponseBytes - size) throw new AppReadError("GitHub App API response exceeds byte bounds");
        size += value.length;
        chunks.push(Buffer.from(value));
      }
      if (!size || (length !== null && BigInt(length) !== BigInt(size))) {
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
  const credential = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0 && !/[\x00-\x20\x7f-\uffff]/.test(value);
  if (Object.keys(options).length !== 3 || !Number.isSafeInteger(options.installationId) || options.installationId < 1 ||
      !credential(options.appJwt) || !credential(options.installationToken) ||
      options.appJwt === options.installationToken || typeof fetcher !== "function") {
    throw new AppReadError("Invalid GitHub App installation reader credentials or options");
  }
  const appEndpoint = `app/installations/${options.installationId}`;
  const reader = (allowed: string, token: string): GitHubApiReader => async (endpoint, requestedLimits) => {
    const limits = captureGitHubApiReadLimits(requestedLimits);
    if (endpoint !== allowed) throw new AppReadError("GitHub App API endpoint is outside the captured credential scope");
    return readMetadata(endpoint, token, limits, fetcher);
  };
  return Object.freeze({ readApp: reader(appEndpoint, options.appJwt),
    readInstallation: reader("installation/repositories", options.installationToken) });
}
