import { isAbsolute, relative, resolve, sep } from "node:path";
import { readGitHubApi, type GitHubApiReader } from "./github-api.js";
import { auditGitHubSnapshotArtifact, type GitHubSnapshotArtifactObservation, type GitHubSnapshotArtifactOptions } from "./github-snapshot-artifact.js";
import { preflightCanonicalSnapshot, stageCanonicalSnapshot, type HostingPolicy, type SnapshotPreflightReport } from "./hosted-preflight.js";
import { publicationLedgerFingerprint, type PendingPublication, type PublicationReceipt } from "./publication-ledger.js";
import { type LedgerGitSnapshot, PublicationLedgerGitStore } from "./publication-ledger-git.js";
import { reserveCanonicalSnapshot, type PreparedCanonicalSnapshot, type SnapshotBounds } from "./snapshot-producer.js";

export interface StagedSnapshotDeployment {
  siteDirectory: string;
  snapshotDirectory: string;
  candidate: PendingPublication;
  preflight: SnapshotPreflightReport;
}

export type SnapshotArtifactAuthority = Omit<GitHubSnapshotArtifactOptions, "artifactId" | "artifactSha256" | "snapshotPrefix">;
export interface UploadedSnapshotArtifact {
  artifactId: number;
  artifactSha256: string;
}
export interface AdmittedSnapshotDeployment extends StagedSnapshotDeployment {
  artifact: Readonly<GitHubSnapshotArtifactObservation>;
}

function capturePrepared(prepared: PreparedCanonicalSnapshot): PreparedCanonicalSnapshot {
  return {
    plan: structuredClone(prepared.plan), manifest: structuredClone(prepared.manifest),
    artifacts: new Map([...prepared.artifacts].map(([path, bytes]) => [path, Buffer.from(bytes)]))
  };
}

export async function reserveCanonicalSnapshotInGit(store: PublicationLedgerGitStore, current: LedgerGitSnapshot,
  prepared: PreparedCanonicalSnapshot, bounds: SnapshotBounds): Promise<LedgerGitSnapshot> {
  const snapshot = structuredClone(current), candidate = capturePrepared(prepared), safety = { ...bounds };
  reserveCanonicalSnapshot(snapshot.state, publicationLedgerFingerprint(snapshot.state), candidate, safety);
  return store.update(snapshot, { kind: "reserve", plan: candidate.plan, manifestSha256: candidate.manifest.sha256 });
}

export async function deployCanonicalSnapshot(store: PublicationLedgerGitStore, reserved: LedgerGitSnapshot,
  prepared: PreparedCanonicalSnapshot, bounds: SnapshotBounds, siteDirectory: string, snapshotDirectory: string,
  hostingPolicy: HostingPolicy, deployAndVerify: (staged: StagedSnapshotDeployment) => Promise<PublicationReceipt>):
  Promise<LedgerGitSnapshot> {
  const snapshot = structuredClone(reserved);
  const candidate = capturePrepared(prepared);
  const safety = { ...bounds }, hosting = { ...hostingPolicy };
  if (snapshot.state.pending?.phase !== "reserved") throw new Error("A fresh reserved snapshot is required; reconcile any started deployment");
  if (typeof deployAndVerify !== "function") throw new Error("An explicit deployment and receipt verifier is required");
  const stateHash = publicationLedgerFingerprint(snapshot.state);
  await stageCanonicalSnapshot(siteDirectory, snapshotDirectory, snapshot.state, stateHash, candidate, safety, hosting);
  const site = resolve(siteDirectory), snapshots = resolve(snapshotDirectory);
  return store.deployReserved(snapshot, async pending => {
    const preflight = await preflightCanonicalSnapshot(site, snapshots, snapshot.state, stateHash, candidate, safety, hosting);
    return deployAndVerify({ siteDirectory: site, snapshotDirectory: snapshots, candidate: pending, preflight });
  });
}

// An isolated handoff, not an upload/Pages adapter or authenticated receipt constructor.
export async function deployCanonicalSnapshotWithArtifact(store: PublicationLedgerGitStore, reserved: LedgerGitSnapshot,
  prepared: PreparedCanonicalSnapshot, bounds: SnapshotBounds, siteDirectory: string, snapshotDirectory: string,
  hostingPolicy: HostingPolicy, authority: SnapshotArtifactAuthority,
  upload: (staged: StagedSnapshotDeployment) => Promise<UploadedSnapshotArtifact>,
  exposeAndVerify: (admitted: AdmittedSnapshotDeployment) => Promise<PublicationReceipt>,
  read: GitHubApiReader = readGitHubApi): Promise<LedgerGitSnapshot> {
  const snapshot = structuredClone(reserved), candidate = capturePrepared(prepared);
  const safety = { ...bounds }, hosting = { ...hostingPolicy }, pins = Object.freeze({ ...authority });
  const site = resolve(siteDirectory), snapshots = resolve(snapshotDirectory);
  const path = relative(site, snapshots), snapshotPrefix = path.split(sep).join("/");
  const positive = (value: number) => Number.isSafeInteger(value) && value >= 1;
  const bounded = (value: number) => positive(value) && value <= 2147483647;
  const keys = ["repository", "repositoryId", "artifactName", "publisherRunId", "publisherHeadCommit",
    "publisherBranch", "requestTimeoutMs", "maxMetadataBytes", "maxArchiveBytes", "maxTarBytes", "maxFiles"];
  if (Reflect.ownKeys(pins).length !== keys.length || keys.some(key => !Object.hasOwn(pins, key)) ||
      typeof pins.repository !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(pins.repository) ||
      !positive(pins.repositoryId) || !positive(pins.publisherRunId) ||
      typeof pins.artifactName !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(pins.artifactName) ||
      typeof pins.publisherHeadCommit !== "string" || !/^[0-9a-f]{40}$/.test(pins.publisherHeadCommit) ||
      typeof pins.publisherBranch !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/.test(pins.publisherBranch) ||
      !bounded(pins.requestTimeoutMs) || !bounded(pins.maxMetadataBytes) || !bounded(pins.maxArchiveBytes) ||
      !bounded(pins.maxTarBytes) || !bounded(pins.maxFiles) ||
      typeof upload !== "function" || typeof exposeAndVerify !== "function" || typeof read !== "function") {
    throw new Error("Invalid snapshot artifact authority, bounds or callbacks");
  }
  if (!isAbsolute(siteDirectory) || !isAbsolute(snapshotDirectory) || !path || isAbsolute(path) ||
      snapshotPrefix.length > 98 || !/^[A-Za-z0-9._/-]+$/.test(snapshotPrefix) ||
      snapshotPrefix.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Snapshot artifact requires a safe nested staging prefix");
  }
  const stateHash = publicationLedgerFingerprint(snapshot.state);
  return deployCanonicalSnapshot(store, snapshot, candidate, safety, site, snapshots, hosting, async staged => {
    // The uploader may retain/mutate its argument, but never sees the audit's captured inputs.
    const returned: unknown = await upload(structuredClone(staged));
    if (!returned || typeof returned !== "object" || Reflect.ownKeys(returned).length !== 2) {
      throw new Error("Upload must return only the observed artifact ID and SHA256");
    }
    const id = Object.getOwnPropertyDescriptor(returned, "artifactId");
    const sha = Object.getOwnPropertyDescriptor(returned, "artifactSha256");
    if (!id || !sha || !Object.hasOwn(id, "value") || !Object.hasOwn(sha, "value") ||
        typeof id.value !== "number" || !positive(id.value) ||
        typeof sha.value !== "string" || !/^[0-9a-f]{64}$/.test(sha.value)) {
      throw new Error("Upload must return only the observed artifact ID and SHA256");
    }
    const identity = Object.freeze({ artifactId: id.value as number, artifactSha256: sha.value as string });
    const observation = await auditGitHubSnapshotArtifact({ ...pins, ...identity, snapshotPrefix },
      snapshot.state, stateHash, candidate, safety, hosting, read);
    const artifact = Object.freeze({ ...observation, artifact: Object.freeze({ ...observation.artifact }),
      contents: Object.freeze({ ...observation.contents }) });
    const receipt = structuredClone(await exposeAndVerify({ ...structuredClone(staged), artifact }));
    if (receipt.artifactId !== identity.artifactId || receipt.artifactZipSha256 !== identity.artifactSha256 ||
        receipt.runId !== pins.publisherRunId) {
      throw new Error("Publication receipt does not match the admitted artifact and publisher run");
    }
    return receipt;
  });
}
