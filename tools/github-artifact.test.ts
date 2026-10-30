import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readGitHubApi, type GitHubApiReader } from "./github-api.js";
import { auditGitHubArtifact, type GitHubArtifactOptions } from "./github-artifact.js";

const archive = Buffer.from([0x50, 0x4b, 3, 4, 0, 0xff, 0x1b, 0x5b, 0x33, 0x31, 0x6d, 0, 0xfe, 0x80]);
const options: GitHubArtifactOptions = {
  repository: "SyntheticOwner/synthetic-library", repositoryId: 101, artifactId: 202,
  artifactName: "synthetic-pages", artifactSha256: createHash("sha256").update(archive).digest("hex"),
  publisherRunId: 303, publisherHeadCommit: "a".repeat(40), publisherBranch: "main",
  requestTimeoutMs: 10000, maxMetadataBytes: 65536, maxArchiveBytes: 1024
};
function fixture() {
  return {
    id: options.artifactId, name: options.artifactName, digest: `sha256:${options.artifactSha256}`,
    expired: false, size_in_bytes: archive.length,
    workflow_run: { id: options.publisherRunId, repository_id: options.repositoryId,
      head_repository_id: options.repositoryId, head_branch: options.publisherBranch, head_sha: options.publisherHeadCommit },
    archive_download_url: "https://untrusted.invalid/Synthetic-private-token",
    url: "https://untrusted.invalid/Synthetic-private-title", run_attempt: 99
  };
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
function reader(metadata: unknown = fixture(), bytes = archive, calls: string[] = []): GitHubApiReader {
  return async endpoint => {
    calls.push(endpoint);
    return endpoint.endsWith("/zip") ? Buffer.from(bytes) : encode(metadata);
  };
}

test("exact binary bytes and pinned artifact/publisher identity are checked between metadata observations without following supplied URLs", async () => {
  const metadata = fixture(), before = structuredClone(metadata), input = { ...options }, calls: string[] = [];
  const observe: GitHubApiReader = async (endpoint, limits) => {
    assert.deepEqual(limits, { requestTimeoutMs: input.requestTimeoutMs,
      maxResponseBytes: endpoint.endsWith("/zip") ? archive.length : input.maxMetadataBytes });
    assert.equal(Object.isFrozen(limits), true);
    return reader(metadata, archive, calls)(endpoint, limits);
  };
  const report = await auditGitHubArtifact(input, observe), root = `repos/${input.repository}/actions/artifacts/${input.artifactId}`;
  assert.deepEqual(report, { stage: "github-artifact-bytes", repository: input.repository, repositoryId: input.repositoryId,
    artifactId: input.artifactId, artifactName: input.artifactName, artifactSha256: input.artifactSha256,
    publisherRunId: input.publisherRunId, publisherHeadCommit: input.publisherHeadCommit,
    publisherBranch: input.publisherBranch, artifactBytes: archive.length, requestCount: 3 });
  assert.deepEqual(calls, [root, `${root}/zip`, root]);
  assert.equal(JSON.stringify(report).includes("Synthetic-private"), false);
  assert.equal(Object.hasOwn(report, "runAttempt"), false);
  assert.deepEqual(metadata, before);
  assert.deepEqual(input, options);
  report.artifactSha256 = "b".repeat(64);
  assert.equal(input.artifactSha256, options.artifactSha256);
});

test("invalid options, implied attempt/source claims and unsafe endpoint paths fail before reading", async () => {
  for (const [field, values] of Object.entries({
    repository: ["owner/../target", "https://github.com/owner/repo", "owner/repo?x=1", "-owner/repo"],
    repositoryId: [0, Number.MAX_SAFE_INTEGER + 1], artifactId: [0, 1.5], publisherRunId: [0],
    artifactName: ["", "private\nname", "../pages"], artifactSha256: ["a".repeat(63), "A".repeat(64)],
    publisherHeadCommit: ["HEAD", "A".repeat(40)], publisherBranch: ["../main", "main?x=1", "main//other"],
    requestTimeoutMs: [0, 2147483648, Infinity], maxMetadataBytes: [0, -1, NaN], maxArchiveBytes: [0, 2147483648]
  })) for (const value of values) {
    let calls = 0;
    await assert.rejects(auditGitHubArtifact({ ...options, [field]: value }, async () => { calls++; return archive; }), /options/);
    assert.equal(calls, 0);
  }
  for (const extra of [{ runAttempt: 1 }, { sourceCommit: "b".repeat(40) }]) {
    let calls = 0;
    await assert.rejects(auditGitHubArtifact({ ...options, ...extra }, async () => { calls++; return archive; }), /options/);
    assert.equal(calls, 0);
  }
});

test("wrong, expired, digest-less, oversized, forked or unrelated artifact metadata fails at either observation", async () => {
  const f = fixture();
  for (const mutation of [
    { id: 203 }, { name: "other-pages" }, { expired: true }, { digest: null }, { digest: `sha256:${"b".repeat(64)}` },
    { size_in_bytes: 0 }, { size_in_bytes: options.maxArchiveBytes + 1 }, { size_in_bytes: Number.MAX_SAFE_INTEGER + 1 },
    { workflow_run: null }, { workflow_run: { ...f.workflow_run, id: 304 } },
    { workflow_run: { ...f.workflow_run, repository_id: 102 } },
    { workflow_run: { ...f.workflow_run, head_repository_id: 102 } },
    { workflow_run: { ...f.workflow_run, head_branch: "other" } },
    { workflow_run: { ...f.workflow_run, head_sha: "b".repeat(40) } }
  ]) for (const step of [1, 3]) {
    let calls = 0;
    const observe: GitHubApiReader = async endpoint => {
      calls++;
      return calls === step ? encode({ ...f, ...mutation }) : reader()(endpoint, { requestTimeoutMs: 1, maxResponseBytes: 65536 });
    };
    await assert.rejects(auditGitHubArtifact(options, observe), /metadata/);
    assert.equal(calls, step);
  }
});

test("exact metadata/archive bounds pass while metadata overrun, empty bodies and over-declared downloads stop immediately", async () => {
  const f = fixture(), exact = { ...options, maxMetadataBytes: encode(f).length, maxArchiveBytes: archive.length };
  await auditGitHubArtifact(exact, reader());
  let calls = 0;
  await assert.rejects(auditGitHubArtifact({ ...exact, maxArchiveBytes: archive.length - 1 },
    async () => { calls++; return encode(f); }), /metadata/);
  assert.equal(calls, 1);
  for (const step of [1, 2, 3]) for (const size of [0, (step === 2 ? archive.length : exact.maxMetadataBytes) + 1]) {
    calls = 0;
    const observe: GitHubApiReader = async endpoint => {
      calls++;
      return calls === step ? Buffer.alloc(size, 32) : reader()(endpoint, { requestTimeoutMs: 1, maxResponseBytes: 65536 });
    };
    await assert.rejects(auditGitHubArtifact(exact, observe), /byte bounds/);
    assert.equal(calls, step);
  }
});

test("truncated or changed binary download never produces partial success or the final metadata read", async () => {
  const changed = Buffer.from(archive); changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
  for (const bytes of [archive.subarray(0, -1), changed]) {
    const calls: string[] = [];
    await assert.rejects(auditGitHubArtifact(options, reader(fixture(), bytes, calls)), /expected size and digest/);
    assert.equal(calls.length, 2);
  }
});

test("a declared size change on final metadata is refused even when the pinned digest and other identities remain unchanged", async () => {
  let calls = 0;
  const observe: GitHubApiReader = async endpoint => {
    calls++;
    return calls === 3 ? encode({ ...fixture(), size_in_bytes: archive.length + 1 }) :
      reader()(endpoint, { requestTimeoutMs: 1, maxResponseBytes: 65536 });
  };
  await assert.rejects(auditGitHubArtifact(options, observe), /metadata changed/);
  assert.equal(calls, 3);
});

test("malformed/duplicate/invalid UTF8 metadata and all read failures are explicit, redacted and never retried", async () => {
  for (const step of [1, 3]) for (const bytes of [
    Buffer.from('{"Synthetic-private-token":'), Buffer.from('{"id":202,"\\u0069d":203}'),
    Buffer.from("\uFEFF{}"), Buffer.from([0xff])
  ]) {
    let calls = 0;
    const observe: GitHubApiReader = async endpoint => {
      calls++;
      return calls === step ? bytes : reader()(endpoint, { requestTimeoutMs: 1, maxResponseBytes: 65536 });
    };
    await assert.rejects(auditGitHubArtifact(options, observe), error =>
      error instanceof Error && error.message === "Invalid GitHub artifact API JSON");
    assert.equal(calls, step);
  }
  for (const step of [1, 2, 3]) {
    let calls = 0;
    const observe: GitHubApiReader = async endpoint => {
      calls++;
      if (calls === step) throw new Error("Synthetic-private-token and archive response");
      return reader()(endpoint, { requestTimeoutMs: 1, maxResponseBytes: 65536 });
    };
    await assert.rejects(auditGitHubArtifact(options, observe), error =>
      error instanceof Error && error.message === "GitHub artifact API read failed; verify authentication, availability and explicit limits");
    assert.equal(calls, step);
  }
});

test("caller mutation during the first read cannot change captured authority, endpoints, digest or limits", async () => {
  const input = { ...options }, before = { ...input }, calls: string[] = [];
  const observe: GitHubApiReader = async (endpoint, limits) => {
    if (!calls.length) {
      await Promise.resolve();
      input.repository = "OtherOwner/other-repo"; input.repositoryId++; input.artifactId++; input.artifactName = "other";
      input.publisherRunId++; input.publisherHeadCommit = "b".repeat(40); input.publisherBranch = "other";
      input.artifactSha256 = "b".repeat(64); input.maxArchiveBytes = 1; input.maxMetadataBytes = 1; input.requestTimeoutMs = 1;
    }
    assert.deepEqual(limits, { requestTimeoutMs: before.requestTimeoutMs,
      maxResponseBytes: endpoint.endsWith("/zip") ? archive.length : before.maxMetadataBytes });
    return reader(fixture(), archive, calls)(endpoint, limits);
  };
  const report = await auditGitHubArtifact(input, observe);
  assert.equal(report.repository, before.repository);
  assert.equal(report.artifactId, before.artifactId);
  assert.equal(report.artifactSha256, before.artifactSha256);
  assert.equal(calls.length, 3);
});

test("shared native reader rejects arbitrary hosts, queries, placeholders and invalid process limits without invoking gh", async () => {
  const limits = { requestTimeoutMs: 1000, maxResponseBytes: 65536 };
  for (const endpoint of ["https://untrusted.invalid/token", "/repos/owner/repo/actions/runs/1",
    "repos/{owner}/repo/actions/runs/1", "repos/owner/repo/../secrets", "repos/owner/repo/actions/runs/1?x=1", "-endpoint"]) {
    await assert.rejects(readGitHubApi(endpoint, limits), /Invalid GitHub API read options/);
  }
  for (const value of [0, -1, 2147483648, NaN]) {
    await assert.rejects(readGitHubApi("repos/owner/repo/actions/runs/1", { ...limits, requestTimeoutMs: value }), /read options/);
    await assert.rejects(readGitHubApi("repos/owner/repo/actions/runs/1", { ...limits, maxResponseBytes: value }), /read options/);
  }
});

test("native command construction preserves opaque bytes and enables raw output only for the exact artifact route in an isolated child", async () => {
  const script = `
    import assert from 'node:assert/strict';
    import childProcess from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    const calls = [], expected = Buffer.from([0,255,27,91,51,49,109,0,254,128]);
    childProcess.execFile = (command,args,options,callback) => {
      calls.push({command,args,options});
      if (calls.length === 4) callback(new Error('Synthetic-private CLI diagnostics'), Buffer.from('Synthetic-private payload'));
      else callback(null,Buffer.from(expected));
      return {};
    };
    syncBuiltinESMExports();
    const {readGitHubApi} = await import(process.env.GITHUB_API_MODULE);
    const endpoints = ['repos/owner/repo/actions/artifacts/123/zip',
      'repos/owner/repo/git/ref/heads/actions/artifacts/123/zip', 'repos/owner/repo/actions/artifacts/123'];
    const limits = Object.freeze({requestTimeoutMs:1234,maxResponseBytes:expected.length});
    for (const endpoint of endpoints) assert.deepEqual(await readGitHubApi(endpoint,limits),expected);
    for (const [index,call] of calls.entries()) {
      assert.equal(call.command,'gh');
      const expectedArgs = ['api','--hostname','github.com','--method','GET',
        '--header','Accept: application/vnd.github+json','--header','X-GitHub-Api-Version: 2022-11-28',
        '--header','Cache-Control: no-cache, no-store'];
      if (index === 0) expectedArgs.push('--allow-escape-sequences');
      expectedArgs.push(endpoints[index]);
      assert.deepEqual(call.args,expectedArgs);
      assert.equal(call.options.timeout,1234);
      assert.equal(call.options.maxBuffer,expected.length);
      assert.equal(call.options.encoding,'buffer');
      assert.equal(call.options.windowsHide,true);
      assert.equal(call.options.env.GH_HOST,'github.com');
      assert.equal(call.options.env.GH_PROMPT_DISABLED,'1');
      assert.equal(call.options.env.GH_PAGER,'');
      assert.equal(call.options.env.GH_DEBUG,undefined);
      assert.equal(call.options.env.GH_FORCE_TTY,undefined);
      assert.equal(call.options.env.GH_HTTP_UNIX_SOCKET,undefined);
      assert.equal(call.options.env.GH_TOKEN,'synthetic-not-a-credential');
    }
    await assert.rejects(readGitHubApi(endpoints[0],limits),error =>
      error instanceof Error && error.message === 'GitHub API read failed; verify authentication, availability and explicit limits');
    assert.equal(process.env.GH_DEBUG,'synthetic-debug');
    assert.equal(process.env.GH_FORCE_TTY,'1');
    assert.equal(process.env.GH_HTTP_UNIX_SOCKET,'synthetic-socket');
    console.log('Exact native command profiles and redaction passed without network');
  `;
  const { stdout } = await promisify(execFile)(process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script], {
      env: { ...process.env, GITHUB_API_MODULE: new URL("./github-api.ts", import.meta.url).href,
        GH_TOKEN: "synthetic-not-a-credential", GH_DEBUG: "synthetic-debug", GH_FORCE_TTY: "1",
        GH_HTTP_UNIX_SOCKET: "synthetic-socket" }, timeout: 30000, windowsHide: true
    });
  assert.equal(stdout.trim(), "Exact native command profiles and redaction passed without network");
});
