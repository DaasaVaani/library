import { resolve } from "node:path";
import { preflightCanonicalSnapshot, stageCanonicalSnapshot, type HostingPolicy, type SnapshotPreflightReport } from "./hosted-preflight.js";
import { publicationLedgerFingerprint, type PendingPublication, type PublicationReceipt } from "./publication-ledger.js";
import { type LedgerGitSnapshot, PublicationLedgerGitStore } from "./publication-ledger-git.js";
import type { PreparedCanonicalSnapshot, SnapshotBounds } from "./snapshot-producer.js";

export interface StagedSnapshotDeployment {
  siteDirectory: string;
  snapshotDirectory: string;
  candidate: PendingPublication;
  preflight: SnapshotPreflightReport;
}

export async function deployCanonicalSnapshot(store: PublicationLedgerGitStore, reserved: LedgerGitSnapshot,
  prepared: PreparedCanonicalSnapshot, bounds: SnapshotBounds, siteDirectory: string, snapshotDirectory: string,
  hostingPolicy: HostingPolicy, deployAndVerify: (staged: StagedSnapshotDeployment) => Promise<PublicationReceipt>):
  Promise<LedgerGitSnapshot> {
  const snapshot = structuredClone(reserved);
  const candidate: PreparedCanonicalSnapshot = {
    plan: structuredClone(prepared.plan), manifest: structuredClone(prepared.manifest),
    artifacts: new Map([...prepared.artifacts].map(([path, bytes]) => [path, Buffer.from(bytes)]))
  };
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
