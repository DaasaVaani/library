import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import {
  beginPublicationDeployment, cancelPublicationReservation, confirmPublication, decodePublicationLedger,
  encodePublicationLedger, publicationLedgerFingerprint, reservePublication,
  type PendingPublication, type PublicationLedger, type PublicationPlan, type PublicationReceipt
} from "./publication-ledger.js";

export interface LedgerGitOptions {
  repositoryDirectory: string;
  remoteName: string;
  stateRef: string;
  maxEncodedBytes: number;
  gitTimeoutMs: number;
}
export interface LedgerGitSnapshot {
  gitTip: string;
  state: PublicationLedger;
}
export type LedgerGitCommand =
  | { kind: "reserve"; plan: PublicationPlan; manifestSha256: string }
  | { kind: "begin-deployment" }
  | { kind: "cancel" }
  | { kind: "confirm"; receipt: PublicationReceipt };

function oid(text: string): string {
  if (!/^[0-9a-f]{40}$/.test(text)) throw new Error("Invalid publication-state Git object identity");
  return text;
}

export class PublicationLedgerGitStore {
  private readonly options: LedgerGitOptions;

  constructor(options: LedgerGitOptions) {
    if (!isAbsolute(options.repositoryDirectory) || !/^[A-Za-z][A-Za-z0-9._-]*$/.test(options.remoteName) ||
        !/^refs\/heads\/publication-state(?:\/[A-Za-z0-9._/-]+)?$/.test(options.stateRef) ||
        !Number.isSafeInteger(options.maxEncodedBytes) || options.maxEncodedBytes <= 0 ||
        !Number.isSafeInteger(options.gitTimeoutMs) || options.gitTimeoutMs <= 0 || options.gitTimeoutMs > 2147483647) {
      throw new Error("Invalid isolated publication-state Git options");
    }
    this.options = { ...options };
  }

  private git(operation: string, args: string[], input?: Uint8Array): Promise<Buffer> {
    const env: NodeJS.ProcessEnv = {
      ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_NO_REPLACE_OBJECTS: "1",
      GIT_AUTHOR_NAME: "DaasaVaani publication ledger", GIT_AUTHOR_EMAIL: "publication-ledger@users.noreply.github.com",
      GIT_COMMITTER_NAME: "DaasaVaani publication ledger", GIT_COMMITTER_EMAIL: "publication-ledger@users.noreply.github.com"
    };
    for (const key of ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_SHALLOW_FILE"]) delete env[key];
    return new Promise((resolve, reject) => {
      let inputFailed = false;
      const child = execFile("git", [
        `--git-dir=${this.options.repositoryDirectory}`, "-c", "commit.gpgsign=false",
        "-c", "maintenance.auto=false", "-c", "gc.auto=0",
        "-c", "push.followTags=false", "-c", `remote.${this.options.remoteName}.mirror=false`, ...args
      ], {
        env, encoding: "buffer", maxBuffer: Math.max(65536, this.options.maxEncodedBytes), timeout: this.options.gitTimeoutMs,
        windowsHide: true
      }, (error, stdout) => {
        if (error || inputFailed) {
          reject(new Error(`Publication-state Git ${operation} failed; remote outcome may be unknown. Stop, reload and reconcile.`));
        } else resolve(stdout);
      });
      child.stdin?.on("error", () => { inputFailed = true; });
      child.stdin?.end(input);
    });
  }

  private async checkRepository(): Promise<void> {
    const kind = await this.git("repository check", ["rev-parse", "--is-bare-repository", "--show-object-format"]);
    if (kind.toString("utf8").trim() !== "true\nsha1") throw new Error("Publication-state store requires an isolated SHA1 bare repository");
    await this.git("ref check", ["check-ref-format", this.options.stateRef]);
    const fetchUrl = await this.git("fetch-remote check", ["remote", "get-url", "--all", this.options.remoteName]);
    const pushUrl = await this.git("push-remote check", ["remote", "get-url", "--push", "--all", this.options.remoteName]);
    if (!fetchUrl.equals(pushUrl) || !/^[^\r\n]+\r?\n$/.test(fetchUrl.toString("utf8"))) {
      throw new Error("Publication-state fetch and push must use the same single remote destination");
    }
  }

  private async remoteTip(): Promise<string> {
    const output = await this.git("remote-tip read", ["ls-remote", "--refs", this.options.remoteName, this.options.stateRef]);
    const expectedSuffix = `\t${this.options.stateRef}\n`;
    const text = output.toString("utf8");
    if (!text.endsWith(expectedSuffix)) throw new Error("Publication-state ref is missing or ambiguous; never recreate it automatically");
    return oid(text.slice(0, -expectedSuffix.length));
  }

  private async readCommit(gitTip: string): Promise<LedgerGitSnapshot> {
    const tree = (await this.git("tree read", ["ls-tree", "-z", gitTip])).toString("utf8");
    const match = /^100644 blob ([0-9a-f]{40})\tledger\.json\0$/.exec(tree);
    if (!match?.[1]) throw new Error("Publication-state tree must contain only the regular ledger.json file");
    const sizeText = (await this.git("blob-size read", ["cat-file", "-s", match[1]])).toString("utf8").trim();
    if (!/^[1-9][0-9]*$/.test(sizeText) || !Number.isSafeInteger(Number(sizeText)) ||
        Number(sizeText) > this.options.maxEncodedBytes) throw new Error("Publication-state blob exceeds encoded byte bound");
    const encoded = await this.git("blob read", ["cat-file", "blob", match[1]]);
    return { gitTip, state: decodePublicationLedger(encoded, this.options.maxEncodedBytes) };
  }

  async load(trustedTip: string): Promise<LedgerGitSnapshot> {
    oid(trustedTip);
    await this.checkRepository();
    const gitTip = await this.remoteTip();
    await this.git("fetch", ["fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head",
      this.options.remoteName, gitTip]);
    await this.git("trusted-history check", ["merge-base", "--is-ancestor", trustedTip, gitTip]);
    return this.readCommit(gitTip);
  }

  async update(snapshot: LedgerGitSnapshot, command: LedgerGitCommand): Promise<LedgerGitSnapshot> {
    const expectedTip = oid(snapshot.gitTip), expectedBytes = encodePublicationLedger(snapshot.state);
    const operation = structuredClone(command);
    const current = await this.load(expectedTip);
    if (current.gitTip !== expectedTip) throw new Error("Stale publication-state Git tip; reload and reconcile");
    if (!encodePublicationLedger(current.state).equals(expectedBytes)) throw new Error("Snapshot does not match its publication-state Git commit");
    const stateHash = publicationLedgerFingerprint(current.state);
    let next: PublicationLedger;
    switch (operation.kind) {
      case "reserve": next = reservePublication(current.state, stateHash, operation.plan, operation.manifestSha256).state; break;
      case "begin-deployment": next = beginPublicationDeployment(current.state, stateHash); break;
      case "cancel": next = cancelPublicationReservation(current.state, stateHash); break;
      case "confirm": next = confirmPublication(current.state, stateHash, operation.receipt); break;
      default: throw new Error("Unsupported publication-state command");
    }
    const encoded = encodePublicationLedger(next);
    if (encoded.length > this.options.maxEncodedBytes) throw new Error("Publication-state transition exceeds encoded byte bound");
    if (encoded.equals(expectedBytes)) return current;
    const blob = oid((await this.git("blob write", ["hash-object", "-w", "--stdin"], encoded)).toString("utf8").trim());
    const tree = oid((await this.git("tree write", ["mktree"], Buffer.from(`100644 blob ${blob}\tledger.json\n`))).toString("utf8").trim());
    const message = `Record publication ledger ${operation.kind}\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>\n`;
    const commit = oid((await this.git("commit write", ["commit-tree", tree, "-p", expectedTip], Buffer.from(message))).toString("utf8").trim());
    // The explicit lease supplies remote CAS; the constructed commit is a direct child, never a rewrite.
    await this.git("conditional push", ["push", "--porcelain", "--recurse-submodules=no",
      `--force-with-lease=${this.options.stateRef}:${expectedTip}`, this.options.remoteName, `${commit}:${this.options.stateRef}`]);
    if (await this.remoteTip() !== commit) throw new Error("Publication-state changed after push; stop, reload and reconcile");
    return { gitTip: commit, state: structuredClone(next) };
  }

  async deployReserved(
    snapshot: LedgerGitSnapshot,
    deployAndVerify: (candidate: PendingPublication) => Promise<PublicationReceipt>
  ): Promise<LedgerGitSnapshot> {
    if (snapshot.state.pending?.phase !== "reserved") throw new Error("A fresh reserved publication is required; reconcile any started deployment");
    const started = await this.update(snapshot, { kind: "begin-deployment" });
    if (started.state.pending?.phase !== "deploying") throw new Error("Publication deployment boundary was not persisted");
    const receipt = await deployAndVerify(structuredClone(started.state.pending));
    return this.update(started, { kind: "confirm", receipt });
  }
}
