import { resolve } from "node:path";
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
