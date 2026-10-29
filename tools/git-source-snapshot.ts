import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { readCanonicalSources, type CanonicalSourceBounds } from "./canonical-sources.js";
import type { PublicationLedger } from "./publication-ledger.js";
import { prepareCanonicalSnapshot, type CanonicalSnapshotInput, type SnapshotBounds } from "./snapshot-producer.js";
import type { SnapshotPolicy } from "../shared/types/snapshot.js";

export interface GitSourceOptions {
  repositoryDirectory: string;
  sourcePath: string;
  gitTimeoutMs: number;
}

export async function prepareGitCanonicalSourceSnapshot(options: GitSourceOptions, sourceBounds: CanonicalSourceBounds,
  state: PublicationLedger, expectedStateSha256: string, input: Omit<CanonicalSnapshotInput, "items">,
  policy: SnapshotPolicy, bounds: SnapshotBounds) {
  const { repositoryDirectory, sourcePath, gitTimeoutMs } = options;
  const limits = { ...sourceBounds }, ledger = structuredClone(state), dates = structuredClone(input);
  const snapshotPolicy = structuredClone(policy), safety = { ...bounds };
  if (!isAbsolute(repositoryDirectory) || !/^[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/.test(sourcePath) ||
      !Number.isSafeInteger(gitTimeoutMs) || gitTimeoutMs < 1 || gitTimeoutMs > 2147483647 ||
      Object.keys(dates).length !== 2 || !Object.hasOwn(dates, "publishedAt") || !Object.hasOwn(dates, "sourceCommit") ||
      !/^[0-9a-f]{40}$/.test(dates.sourceCommit)) throw new Error("Invalid Git source snapshot input");
  if (![limits.maxSourceFileBytes, limits.maxTotalSourceBytes].every(value => Number.isSafeInteger(value) && value > 0) ||
      limits.maxTotalSourceBytes < limits.maxSourceFileBytes) throw new Error("Invalid Git source byte bounds");
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1" };
  for (const key of ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_SHALLOW_FILE", "GIT_NAMESPACE"]) delete env[key];
  const git = (args: string[]): Promise<Buffer> => new Promise((accept, reject) => {
    execFile("git", ["-c", "safe.bareRepository=all", "-C", repositoryDirectory, ...args], {
      env, encoding: "buffer", windowsHide: true, timeout: gitTimeoutMs,
      maxBuffer: Math.max(65536, limits.maxTotalSourceBytes)
    }, (error, stdout) => {
      if (error) reject(new Error("Git source snapshot read failed; verify local commit availability and explicit limits"));
      else accept(stdout);
    });
  });
  if ((await git(["rev-parse", "--show-object-format"])).toString("utf8").trim() !== "sha1" ||
      (await git(["cat-file", "-t", dates.sourceCommit])).toString("utf8").trim() !== "commit") {
    throw new Error("Git source snapshot requires a full SHA1 commit object");
  }
  const tree = `${dates.sourceCommit}:${sourcePath}`;
  if ((await git(["cat-file", "-t", tree])).toString("utf8").trim() !== "tree") throw new Error("Git source path must be a tree");
  const listing = (await git(["ls-tree", "-z", tree])).toString("utf8");
  const entries = listing.split("\0").filter(Boolean).map(row => {
    const match = /^100644 blob ([0-9a-f]{40})\t(\.source-import\.json|[0-9a-f-]{36}\.md)$/.exec(row);
    if (!match) throw new Error("Git source tree permits only regular receipt and UUID Markdown blobs");
    return { oid: match[1]!, name: match[2]!, size: 0 };
  });
  if (!entries.some(entry => entry.name === ".source-import.json")) throw new Error("Git source receipt is missing");
  let total = 0;
  for (const entry of entries) {
    const text = (await git(["cat-file", "-s", entry.oid])).toString("utf8").trim();
    const size = Number(text);
    if (!/^(0|[1-9][0-9]*)$/.test(text) || !Number.isSafeInteger(size) || size > limits.maxSourceFileBytes ||
        size > limits.maxTotalSourceBytes - total) throw new Error("Git source blob exceeds source byte bounds");
    entry.size = size;
    total += size;
  }
  const temporary = await mkdtemp(join(tmpdir(), "daasavaani-git-source-"));
  try {
    for (const entry of entries) {
      const bytes = await git(["cat-file", "blob", entry.oid]);
      if (bytes.length !== entry.size) throw new Error("Git source blob size mismatch");
      await writeFile(join(temporary, entry.name), bytes, { flag: "wx" });
    }
    const { items, held, extractionExceptions } = await readCanonicalSources(temporary, limits);
    return { prepared: prepareCanonicalSnapshot(ledger, expectedStateSha256, { ...dates, items }, snapshotPolicy, safety),
      held, extractionExceptions };
  } finally {
    await rm(temporary, { recursive: true, maxRetries: 5, retryDelay: 100 });
  }
}
