import { isAbsolute } from "node:path";
import type { SnapshotPolicy } from "../shared/types/snapshot.js";
import type { CanonicalSourceBounds } from "./canonical-sources.js";
import { prepareGitCanonicalSourceSnapshot, type GitSourceOptions } from "./git-source-snapshot.js";
import { readGitHubApi, type GitHubApiReader } from "./github-api.js";
import { auditGitHubSourceRun, type GitHubSourceRunObservation, type GitHubSourceRunOptions } from "./github-source-run.js";
import { preparePublication, type PublicationLedger } from "./publication-ledger.js";
import type { CanonicalSnapshotInput, PreparedCanonicalSnapshot, SnapshotBounds } from "./snapshot-producer.js";
import { assertSnapshotPolicy } from "../shared/tools/snapshot-reference.mjs";

export interface GitHubSourceSnapshotOptions {
  sourceRun: GitHubSourceRunOptions;
  git: Omit<GitSourceOptions, "trustedSourceTip">;
}
export interface GitHubSourceSnapshotObservation {
  stage: "github-source-snapshot";
  sourceBefore: GitHubSourceRunObservation;
  sourceAfter: GitHubSourceRunObservation;
  prepared: PreparedCanonicalSnapshot;
  held: number;
  extractionExceptions: number;
}
const safetyKeys = ["maxDescriptorBytes", "maxManifestEncodedBytes", "maxManifestDecodedBytes",
  "maxItemEncodedBytes", "maxItemDecodedBytes", "maxPolicyEncodedBytes", "maxPolicyDecodedBytes"] as const;
function exactObject(value: unknown, keys: readonly string[]): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

// Two observations bracket preparation; they are not an exposure lock or publication permission.
export async function prepareGitHubCanonicalSourceSnapshot(requested: GitHubSourceSnapshotOptions,
  sourceBounds: CanonicalSourceBounds, state: PublicationLedger, expectedStateSha256: string,
  input: Omit<CanonicalSnapshotInput, "items">, policy: SnapshotPolicy, bounds: SnapshotBounds,
  read: GitHubApiReader = readGitHubApi): Promise<GitHubSourceSnapshotObservation> {
  if (!exactObject(requested, ["sourceRun", "git"]) ||
      !exactObject(requested.git, ["repositoryDirectory", "sourcePath", "gitTimeoutMs"]) ||
      !exactObject(input, ["publishedAt", "sourceCommit"]) ||
      !exactObject(sourceBounds, ["maxSourceFileBytes", "maxTotalSourceBytes"]) ||
      !exactObject(bounds, safetyKeys) || typeof read !== "function" ||
      requested.sourceRun === null || typeof requested.sourceRun !== "object" || Array.isArray(requested.sourceRun)) {
    throw new Error("Invalid GitHub source snapshot input");
  }
  const options = structuredClone(requested), limits = structuredClone(sourceBounds);
  const ledger = structuredClone(state), dates = structuredClone(input);
  const snapshotPolicy = structuredClone(policy), safety = structuredClone(bounds);
  const git = options.git;
  if (typeof git.repositoryDirectory !== "string" || !isAbsolute(git.repositoryDirectory) ||
      typeof git.sourcePath !== "string" ||
      !/^[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/.test(git.sourcePath) ||
      !Number.isSafeInteger(git.gitTimeoutMs) || git.gitTimeoutMs < 1 || git.gitTimeoutMs > 2147483647 ||
      ![limits.maxSourceFileBytes, limits.maxTotalSourceBytes].every(value => Number.isSafeInteger(value) && value > 0) ||
      limits.maxTotalSourceBytes < limits.maxSourceFileBytes ||
      !safetyKeys.every(key => Number.isSafeInteger(safety[key]) && safety[key] > 0)) {
    throw new Error("Invalid GitHub source snapshot options or bounds");
  }
  assertSnapshotPolicy(snapshotPolicy);
  // Validate ledger/hash/date/projection without inventing source items or generating candidate bytes.
  preparePublication(ledger, expectedStateSha256, {
    logicalProjection: snapshotPolicy.logicalProjection, ...dates, items: []
  });
  if (dates.sourceCommit !== options.sourceRun.sourceCommit) {
    throw new Error("GitHub source snapshot requires the exact admitted source CI commit");
  }
  const sourceBefore = await auditGitHubSourceRun(options.sourceRun, read);
  const candidate = await prepareGitCanonicalSourceSnapshot({
    ...git, trustedSourceTip: sourceBefore.sourceCommit
  }, limits, ledger, expectedStateSha256, dates, snapshotPolicy, safety);
  const sourceAfter = await auditGitHubSourceRun(options.sourceRun, read);
  return { stage: "github-source-snapshot", sourceBefore, sourceAfter, ...candidate };
}
