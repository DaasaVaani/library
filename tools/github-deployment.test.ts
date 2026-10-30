import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { auditGitHubDeployment, type GitHubDeploymentOptions } from "./github-deployment.js";
import type { GitHubApiReader } from "./github-api.js";

const options: GitHubDeploymentOptions = {
  repository: "SyntheticOwner/synthetic-library", repositoryId: 101, deploymentId: 202, statusId: 303,
  deploymentCommit: "a".repeat(40), deploymentRef: "main", environment: "github-pages",
  environmentUrl: "https://synthetic.invalid/library/", task: "deploy", deploymentCreatorId: 404,
  statusCreatorId: 505, requestTimeoutMs: 1000, maxResponseBytes: 4096
};
const root = `repos/${options.repository}`, deploymentPath = `${root}/deployments/202`;
const endpoints = [root, deploymentPath, `${deploymentPath}/statuses/303`, deploymentPath, root];
const repository = { id: 101, full_name: options.repository };
const deployment = { id: 202, sha: options.deploymentCommit, ref: "main", task: "deploy",
  environment: "github-pages", repository_url: `https://api.github.com/${root}`, creator: { id: 404 } };
const status = { id: 303, state: "success", environment: "github-pages",
  environment_url: options.environmentUrl, creator: { id: 505 } };
const values = () => [structuredClone(repository), structuredClone(deployment), structuredClone(status),
  structuredClone(deployment), structuredClone(repository)];
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
function reader(responses: readonly unknown[], calls: string[] = []): GitHubApiReader {
  return async (endpoint, limits) => {
    const index = calls.length;
    assert.equal(endpoint, endpoints[index]);
    assert.ok(Object.isFrozen(limits));
    calls.push(endpoint);
    return encode(responses[index]);
  };
}

test("explicit successful deployment records have exact five observations and no artifact, run, live-current or receipt claim", async () => {
  const responses = values();
  const calls: string[] = [];
  const before = structuredClone(options);
  const report = await auditGitHubDeployment(options, reader(responses, calls));
  assert.deepEqual(calls, endpoints);
  assert.deepEqual(report, { stage: "github-deployment-status", repository: options.repository, repositoryId: 101,
    deploymentId: 202, statusId: 303, deploymentCommit: options.deploymentCommit, deploymentRef: "main",
    environment: "github-pages", task: "deploy", deploymentCreatorId: 404, statusCreatorId: 505, requestCount: 5 });
  assert.deepEqual(options, before);
  assert.deepEqual(responses, values());
  for (const field of ["sourceCommit", "runId", "runAttempt", "artifactId", "confirmedAt", "manifestSha256", "current"]) {
    assert.equal(Object.hasOwn(report, field), false);
  }
});

test("all invalid authority, unknown fields, unsafe endpoints and environment URLs refuse before reads", async () => {
  const invalid: Array<[string, unknown]> = [
    ["repository", "../other"], ["repository", "owner/repo?secret"], ["repository", "owner/repo/extra"],
    ["repositoryId", 0], ["deploymentId", -1], ["statusId", Number.MAX_SAFE_INTEGER + 1],
    ["deploymentCommit", "HEAD"], ["deploymentRef", "../main"], ["environment", ""], ["task", "-deploy"],
    ["deploymentCreatorId", 0], ["statusCreatorId", 1.5], ["requestTimeoutMs", 0],
    ["requestTimeoutMs", 2147483648], ["maxResponseBytes", NaN], ["maxResponseBytes", 2147483648],
    ["environmentUrl", "http://synthetic.invalid/"], ["environmentUrl", "not a URL"],
    ["environmentUrl", "https://name:secret@synthetic.invalid/"],
    ["environmentUrl", "https://synthetic.invalid/?secret"], ["environmentUrl", "https://synthetic.invalid/#secret"],
    ["sourceCommit", options.deploymentCommit], ["runId", 1], ["artifactId", 1], ["approved", true]
  ];
  for (const [field, value] of invalid) {
    const input = { ...options };
    Reflect.set(input, field, value);
    let reads = 0;
    await assert.rejects(auditGitHubDeployment(input, async () => { reads++; return encode({}); }));
    assert.equal(reads, 0, field);
  }
});

test("repository, deployment and status mismatches fail at every relevant before or after observation", async () => {
  const badRepositories = [{ ...repository, id: 999 }, { ...repository, full_name: "Other/library" }, {},
    { ...repository, id: "101" }];
  const badDeployments = [{ ...deployment, id: 999 }, { ...deployment, sha: "b".repeat(40) },
    { ...deployment, ref: "other" }, { ...deployment, task: "other" }, { ...deployment, environment: "other" },
    { ...deployment, repository_url: "https://untrusted.invalid/token" }, { ...deployment, creator: null },
    { ...deployment, creator: { id: 999 } }, {}];
  const badStatuses = [{ ...status, id: 999 }, { ...status, environment: "other" },
    { ...status, environment_url: "https://untrusted.invalid/token" }, { ...status, creator: null },
    { ...status, creator: { id: 999 } }, {},
    ...["error", "failure", "inactive", "pending", "queued", "in_progress", "neutral", null].map(state => ({ ...status, state }))];
  for (const [indices, bad] of [[[0, 4], badRepositories], [[1, 3], badDeployments], [[2], badStatuses]] as const) {
    for (const index of indices) for (const replacement of bad) {
      const responses: unknown[] = values(), calls: string[] = [];
      responses[index] = replacement;
      await assert.rejects(auditGitHubDeployment(options, reader(responses, calls)));
      assert.equal(calls.length, index + 1);
    }
  }
});

test("required fields cannot be omitted and optional provider payloads never become returned evidence", async () => {
  for (let index = 0; index < endpoints.length; index++) {
    const original = values()[index]!;
    for (const field of Object.keys(original)) {
      const responses: unknown[] = values(), changed = { ...original };
      Reflect.deleteProperty(changed, field);
      responses[index] = changed;
      await assert.rejects(auditGitHubDeployment(options, reader(responses)));
    }
  }
  const responses = values().map(value => ({ ...value, payload: { artifactId: 999, runAttempt: 999,
    private: "synthetic-private-diagnostic" }, statuses_url: "https://untrusted.invalid/token" }));
  const report = await auditGitHubDeployment(options, reader(responses));
  assert.equal(JSON.stringify(report).includes("synthetic-private"), false);
  assert.equal(Object.hasOwn(report, "payload"), false);
});

test("exact actual response ceiling passes while minus-one, malformed bytes and transport errors fail explicitly", async () => {
  const responses = values(), ceiling = Math.max(...responses.map(value => encode(value).length));
  await auditGitHubDeployment({ ...options, maxResponseBytes: ceiling }, reader(responses));
  await assert.rejects(auditGitHubDeployment({ ...options, maxResponseBytes: ceiling - 1 }, reader(responses)), /byte bounds/);
  for (const bytes of [Buffer.alloc(0), Buffer.from([0xff]), Buffer.from("\ufeff{}"), Buffer.from("{"),
    Buffer.from('{"id":101,"id":101,"full_name":"SyntheticOwner/synthetic-library"}')]) {
    await assert.rejects(auditGitHubDeployment(options, async () => bytes), /GitHub deployment/);
  }
  for (let failAt = 0; failAt < 5; failAt++) {
    let index = 0;
    await assert.rejects(auditGitHubDeployment(options, async () => {
      if (index === failAt) throw new Error("synthetic-private-diagnostic");
      return encode(responses[index++]);
    }), error => error instanceof Error && error.message ===
      "GitHub deployment API read failed; verify authentication, availability and explicit limits");
  }
});

test("all caller authority and bounds are captured before the first await", async () => {
  const input = { ...options }, calls: string[] = [], read = reader(values(), calls);
  const report = await auditGitHubDeployment(input, async (endpoint, limits) => {
    if (calls.length === 0) {
      Object.assign(input, { repository: "Other/library", repositoryId: 999, deploymentId: 999, statusId: 999,
        deploymentCommit: "b".repeat(40), deploymentRef: "other", environment: "other", environmentUrl: "http://other/",
        task: "other", deploymentCreatorId: 999, statusCreatorId: 999, requestTimeoutMs: 1, maxResponseBytes: 1 });
    }
    assert.deepEqual(limits, { requestTimeoutMs: options.requestTimeoutMs, maxResponseBytes: options.maxResponseBytes });
    return read(endpoint, limits);
  });
  assert.equal(report.repository, options.repository);
  assert.equal(report.deploymentCommit, options.deploymentCommit);
  assert.equal(report.statusId, options.statusId);
  assert.deepEqual(calls, endpoints);
});

test("native reader admits the canonical repository identity route with bounded authenticated JSON GET only", async () => {
  const script = `
    import assert from 'node:assert/strict';
    import childProcess from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    const expected=Buffer.from('{"id":101}');let calls=0;
    childProcess.execFile=(command,args,options,callback)=>{
      calls++;assert.equal(command,'gh');
      assert.deepEqual(args,['api','--hostname','github.com','--method','GET',
        '--header','Accept: application/vnd.github+json','--header','X-GitHub-Api-Version: 2022-11-28',
        '--header','Cache-Control: no-cache, no-store','repos/owner/repo']);
      assert.equal(options.timeout,1234);assert.equal(options.maxBuffer,12345);
      assert.equal(options.encoding,'buffer');callback(null,Buffer.from(expected));return {};
    };
    syncBuiltinESMExports();
    const {readGitHubApi}=await import(process.env.GITHUB_API_MODULE);
    assert.deepEqual(await readGitHubApi('repos/owner/repo',{requestTimeoutMs:1234,maxResponseBytes:12345}),expected);
    assert.equal(calls,1);console.log('Canonical repository identity read passed without network');
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    env: { ...process.env, GITHUB_API_MODULE: new URL("./github-api.ts", import.meta.url).href },
    timeout: 30000, windowsHide: true
  });
  assert.equal(stdout.trim(), "Canonical repository identity read passed without network");
});
