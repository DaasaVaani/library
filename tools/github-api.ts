import { execFile } from "node:child_process";
import { parseDocument } from "yaml";

export interface GitHubApiReadLimits {
  requestTimeoutMs: number;
  maxResponseBytes: number;
}
export type GitHubApiReader = (endpoint: string, limits: Readonly<GitHubApiReadLimits>) => Promise<Uint8Array>;
const bounded = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;

export const readGitHubApi: GitHubApiReader = async (endpoint, limits) => {
  const { requestTimeoutMs, maxResponseBytes } = limits;
  if (!/^repos\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/.test(endpoint) ||
      !bounded(requestTimeoutMs) || !bounded(maxResponseBytes)) throw new Error("Invalid GitHub API read options");
  return new Promise((accept, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1",
      GH_PAGER: "", GH_NO_UPDATE_NOTIFIER: "1", GH_NO_EXTENSION_UPDATE_NOTIFIER: "1" };
    for (const key of ["GH_DEBUG", "GH_FORCE_TTY", "GH_HTTP_UNIX_SOCKET"]) delete env[key];
    const args = ["api", "--hostname", "github.com", "--method", "GET",
      "--header", "Accept: application/vnd.github+json", "--header", "X-GitHub-Api-Version: 2022-11-28",
      "--header", "Cache-Control: no-cache, no-store"];
    // Archive stdout is captured as bytes, never displayed or terminal-filtered.
    if (/^repos\/[^/]+\/[^/]+\/actions\/artifacts\/[1-9][0-9]*\/zip$/.test(endpoint)) args.push("--allow-escape-sequences");
    args.push(endpoint);
    execFile("gh", args, {
      env, encoding: "buffer", windowsHide: true, timeout: requestTimeoutMs, maxBuffer: maxResponseBytes
    }, (error, stdout) => {
      if (error) reject(new Error("GitHub API read failed; verify authentication, availability and explicit limits"));
      else accept(stdout);
    });
  });
};

export function decodeGitHubApiJson(bytes: Uint8Array, limit: number, label: "source-run" | "artifact" | "publisher-run" | "deployment"): unknown {
  if (!bounded(limit) || !(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > limit) {
    throw new Error(`GitHub ${label} API response exceeds byte bounds`);
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    const value: unknown = JSON.parse(text);
    if (parseDocument(text, { schema: "json", uniqueKeys: true }).errors.length) throw new Error("Duplicate JSON keys");
    return value;
  } catch {
    throw new Error(`Invalid GitHub ${label} API JSON`);
  }
}
