import { auditGitHubArtifact, type GitHubArtifactObservation, type GitHubArtifactOptions } from "./github-artifact.js";
import { readGitHubApi, type GitHubApiReader } from "./github-api.js";
import { hostingByteLimit, type HostingPolicy } from "./hosted-preflight.js";
import { verifyPagesArtifactContents, type PagesArtifactContents } from "./pages-artifact.js";
import type { PublicationLedger } from "./publication-ledger.js";
import { bindCanonicalSnapshot, type PreparedCanonicalSnapshot, type SnapshotBounds } from "./snapshot-producer.js";

export interface GitHubSnapshotArtifactOptions extends GitHubArtifactOptions {
  snapshotPrefix: string;
  maxTarBytes: number;
  maxFiles: number;
}
export interface GitHubSnapshotArtifactObservation {
  stage: "github-snapshot-artifact";
  sequence: number;
  manifestSha256: string;
  baseStateSha256: string;
  sourceCommit: string;
  publishedAt: string;
  artifact: GitHubArtifactObservation;
  contents: PagesArtifactContents;
  headroomLimitBytes: number;
}
const bounded = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;
const safePath = (path: string) => typeof path === "string" && path.length > 0 && path.length <= 98 &&
  /^[A-Za-z0-9._/-]+$/.test(path) && path.split("/").every(part => part && part !== "." && part !== "..");

// This observes a reserved candidate's artifact, not a deployment, receipt or publisher-attempt proof.
export async function auditGitHubSnapshotArtifact(requested: GitHubSnapshotArtifactOptions,
  state: PublicationLedger, expectedStateSha256: string, prepared: PreparedCanonicalSnapshot,
  bounds: SnapshotBounds, hostingPolicy: HostingPolicy, read: GitHubApiReader = readGitHubApi):
  Promise<GitHubSnapshotArtifactObservation> {
  const { snapshotPrefix, maxTarBytes, maxFiles, ...artifactOptions } = { ...requested };
  const capturedState = structuredClone(state), safety = { ...bounds }, hosting = { ...hostingPolicy };
  if (!safePath(snapshotPrefix) || !bounded(maxTarBytes) || !bounded(maxFiles) ||
      !bounded(artifactOptions.maxArchiveBytes) || typeof read !== "function") {
    throw new Error("Invalid GitHub snapshot artifact options");
  }
  for (const key of ["maxDescriptorBytes", "maxManifestEncodedBytes", "maxManifestDecodedBytes",
    "maxItemEncodedBytes", "maxItemDecodedBytes", "maxPolicyEncodedBytes", "maxPolicyDecodedBytes"] as const) {
    if (!bounded(safety[key])) throw new Error("Invalid snapshot artifact safety bound");
  }
  const headroomLimitBytes = hostingByteLimit(hosting);
  if (capturedState.pending?.phase !== "reserved") throw new Error("GitHub snapshot artifact requires a reserved candidate");
  const bound = bindCanonicalSnapshot(capturedState, expectedStateSha256, prepared, safety);
  const candidate = capturedState.pending;
  const expected = [
    { path: `${snapshotPrefix}/latest.json`, bytes: bound.descriptorBytes },
    ...[...bound.artifacts].map(([path, bytes]) => ({ path: `${snapshotPrefix}/${path}`, bytes }))
  ];
  if (expected.length > maxFiles || expected.some(file => !safePath(file.path))) {
    throw new Error("Snapshot artifact expected file count or path exceeds the Pages profile");
  }
  const total = expected.reduce((sum, file) => sum + BigInt(file.bytes.length), 0n);
  if (total > BigInt(maxTarBytes)) throw new Error("Snapshot artifact expected files exceed tar byte limit");
  if (total > BigInt(headroomLimitBytes)) throw new Error("Complete snapshot artifact exceeds configured hosting headroom");

  const archiveEndpoint = `repos/${artifactOptions.repository}/actions/artifacts/${artifactOptions.artifactId}/zip`;
  let archive: Buffer | undefined;
  const capture: GitHubApiReader = async (endpoint, limits) => {
    const bytes = await read(endpoint, limits);
    if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > limits.maxResponseBytes) {
      throw new Error("GitHub snapshot artifact API response exceeds byte bounds");
    }
    const copy = Buffer.from(bytes);
    if (endpoint === archiveEndpoint) archive = Buffer.from(copy);
    return copy;
  };
  // Keep the audit's closed options schema intact, including rejection of unknown caller fields.
  const artifact = await auditGitHubArtifact(artifactOptions, capture);
  if (!archive) throw new Error("GitHub snapshot artifact archive was not captured");
  const contents = verifyPagesArtifactContents(archive, expected, {
    maxArchiveBytes: artifactOptions.maxArchiveBytes, maxTarBytes, maxFiles
  });
  if (contents.archiveSha256 !== artifact.artifactSha256 || contents.archiveBytes !== artifact.artifactBytes ||
      contents.fileCount !== expected.length || BigInt(contents.totalFileBytes) !== total) {
    throw new Error("GitHub snapshot artifact audit and contents observations disagree");
  }
  return { stage: "github-snapshot-artifact", sequence: bound.descriptor.sequence,
    manifestSha256: bound.descriptor.manifest.sha256, baseStateSha256: candidate.baseStateSha256,
    sourceCommit: candidate.sourceCommit, publishedAt: candidate.publishedAt,
    artifact, contents, headroomLimitBytes };
}
