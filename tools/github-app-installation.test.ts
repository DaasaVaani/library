import test from "node:test";
import assert from "node:assert/strict";
import { auditGitHubAppInstallation, observeGitHubAppInstallation, type GitHubAppInstallationOptions } from "./github-app-installation.js";
import type { GitHubApiReader } from "./github-api.js";

const options: GitHubAppInstallationOptions = {
  repository: "SyntheticOwner/synthetic-library", repositoryId: 101, organizationId: 202,
  appId: 303, appSlug: "synthetic-library-publisher", installationId: 404
};
function fixture() {
  const account = { id: options.organizationId, login: "SyntheticOwner", type: "Organization" };
  return {
    installation: { id: options.installationId, app_id: options.appId, app_slug: options.appSlug,
      target_id: options.organizationId, target_type: "Organization", account,
      repository_selection: "selected", permissions: { contents: "write", metadata: "read" },
      events: [], suspended_at: null, html_url: "Synthetic inert field" },
    repositories: { total_count: 1, repositories: [{ id: options.repositoryId, full_name: options.repository,
      owner: { ...account }, description: "Synthetic private text must not enter output" }] }
  };
}
test("exact organization installation with least permissions and single Library scope returns independent payload-free evidence", () => {
  const f = fixture(), before = structuredClone(f), input = { ...options };
  const result = auditGitHubAppInstallation(input, f.installation, f.repositories);
  assert.deepEqual(result, { stage: "github-app-installation", ...options });
  assert.deepEqual(f, before);
  assert.deepEqual(input, options);
  assert(!JSON.stringify(result).includes("Synthetic private"));
  result.repository = "OtherOwner/other";
  assert.equal(input.repository, options.repository);
  assert.equal(f.repositories.repositories[0]?.full_name, options.repository);
});
test("malformed or additional trusted options are refused without coercion", () => {
  const f = fixture();
  for (const [field, values] of Object.entries({
    repository: ["owner/../other", "owner/repo?x", "owner/repo/extra", "-owner/repo"],
    appSlug: ["BadSlug", "slug/path", "", "-slug"],
    repositoryId: [0, -1, 1.5, "101", Number.MAX_SAFE_INTEGER + 1],
    organizationId: [0], appId: [0], installationId: [0]
  })) for (const value of values) {
    assert.throws(() => auditGitHubAppInstallation({ ...options, [field]: value }, f.installation, f.repositories), /options/);
  }
  const extra = { ...options, extra: true };
  assert.throws(() => auditGitHubAppInstallation(extra, f.installation, f.repositories), /options/);
});
test("wrong App installation target or organization identities are refused", () => {
  for (const mutation of [
    { id: 405 }, { app_id: 304 }, { app_slug: "other-app" }, { target_id: 203 }, { target_type: "User" },
    { account: { id: 203, login: "SyntheticOwner", type: "Organization" } },
    { account: { id: 202, login: "OtherOwner", type: "Organization" } },
    { account: { id: 202, login: "SyntheticOwner", type: "User" } }
  ]) {
    const f = fixture();
    assert.throws(() => auditGitHubAppInstallation(options, { ...f.installation, ...mutation }, f.repositories), /installation identity/);
  }
});
test("all-repository selection suspension subscriptions and extra or weaker permissions never imply least privilege", () => {
  for (const mutation of [
    { repository_selection: "all" }, { suspended_at: "2026-11-07T00:00:00Z" }, { events: ["push"] },
    { permissions: { contents: "read", metadata: "read" } },
    { permissions: { contents: "write", metadata: "write" } },
    { permissions: { contents: "write", metadata: "read", administration: "read" } },
    { permissions: { contents: "write", metadata: "read", actions: "write" } },
    { permissions: { contents: "write", metadata: "read", workflows: "write" } }
  ]) {
    const f = fixture();
    assert.throws(() => auditGitHubAppInstallation(options, { ...f.installation, ...mutation }, f.repositories), /installation identity/);
  }
});
test("missing unsafe or wrong-type installation fields are not accepted as defaults", () => {
  const f = fixture();
  for (const field of Object.keys(f.installation).filter(key => key !== "html_url")) {
    const incomplete: Record<string, unknown> = { ...f.installation };
    delete incomplete[field];
    assert.throws(() => auditGitHubAppInstallation(options, incomplete, f.repositories), /installation identity/);
  }
  for (const value of [null, [], {}, { ...f.installation, id: "404" }, { ...f.installation, app_id: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => auditGitHubAppInstallation(options, value, f.repositories), /installation identity/);
  }
});
test("empty incomplete paginated and multi-repository scopes fail explicitly", () => {
  const f = fixture();
  for (const value of [
    null, {}, { repositories: f.repositories.repositories },
    { total_count: 0, repositories: [] }, { total_count: 2, repositories: f.repositories.repositories },
    { total_count: 1, repositories: [] },
    { total_count: 1, repositories: [...f.repositories.repositories, ...f.repositories.repositories] },
    { total_count: "1", repositories: f.repositories.repositories }
  ]) assert.throws(() => auditGitHubAppInstallation(options, f.installation, value), /exactly one/);
});
test("repository name numeric identity owner and organization type must all bind", () => {
  const f = fixture();
  for (const mutation of [
    { id: 102 }, { full_name: "SyntheticOwner/other" }, { full_name: "OtherOwner/synthetic-library" },
    { owner: { id: 203, login: "SyntheticOwner", type: "Organization" } },
    { owner: { id: 202, login: "OtherOwner", type: "Organization" } },
    { owner: { id: 202, login: "SyntheticOwner", type: "User" } }
  ]) {
    assert.throws(() => auditGitHubAppInstallation(options, f.installation, {
      total_count: 1, repositories: [{ ...f.repositories.repositories[0], ...mutation }]
    }), /repository/);
  }
});

const readOptions = { ...options, requestTimeoutMs: 10000, maxResponseBytes: 65536 };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
test("bounded observations use distinct App and installation readers twice with immutable explicit limits", async () => {
  const f = fixture(), calls: string[] = [];
  const makeReader = (role: string, value: unknown): GitHubApiReader => async (endpoint, limits) => {
    calls.push(`${role}:${endpoint}`);
    assert.equal(Object.isFrozen(limits), true);
    assert.deepEqual(limits, { requestTimeoutMs: 10000, maxResponseBytes: 65536 });
    return encode(value);
  };
  const report = await observeGitHubAppInstallation(readOptions,
    makeReader("app", f.installation), makeReader("installation", f.repositories));
  assert.deepEqual(report, { stage: "github-app-installation", ...options });
  assert.deepEqual(calls, ["app:app/installations/404", "installation:installation/repositories",
    "app:app/installations/404", "installation:installation/repositories"]);
});
test("captured identities and bounds cannot be replaced during asynchronous API observation", async () => {
  const f = fixture(), input = { ...readOptions };
  const readApp: GitHubApiReader = async (endpoint, limits) => {
    assert.equal(endpoint, "app/installations/404");
    assert.equal(limits.maxResponseBytes, 65536);
    input.installationId = 999;
    input.repository = "OtherOwner/other";
    input.maxResponseBytes = 1;
    return encode(f.installation);
  };
  assert.deepEqual(await observeGitHubAppInstallation(input, readApp, async () => encode(f.repositories)),
    { stage: "github-app-installation", ...options });
});
test("invalid reader options fail before authenticated readers are invoked", async () => {
  const f = fixture();
  let calls = 0;
  const read: GitHubApiReader = async () => { calls++; return encode(f); };
  const mutations: Record<string, unknown>[] = [
    { installationId: 0 }, { appSlug: "../other" }, { requestTimeoutMs: 0 }, { requestTimeoutMs: 2147483648 },
    { maxResponseBytes: 0 }, { maxResponseBytes: Infinity }, { maxResponseBytes: "65536" }, { extra: true }
  ];
  for (const mutation of mutations) {
    await assert.rejects(observeGitHubAppInstallation({ ...readOptions, ...mutation }, read, read), /read options/);
  }
  assert.equal(calls, 0);
});
test("each observation refuses empty over-limit malformed duplicate-key and invalid UTF8 bytes", async () => {
  for (const step of [1, 2, 3, 4]) for (const bytes of [
    Buffer.alloc(0), Buffer.alloc(65537, 32), Buffer.from("{"), Buffer.from('{"id":1,"id":2}'),
    Buffer.from([0xc3, 0x28])
  ]) {
    const f = fixture();
    let calls = 0;
    const makeReader = (value: unknown): GitHubApiReader => async () => {
      calls++;
      return calls === step ? bytes : encode(value);
    };
    await assert.rejects(observeGitHubAppInstallation(readOptions,
      makeReader(f.installation), makeReader(f.repositories)), /byte bounds|API JSON/);
    assert.equal(calls, step);
  }
});
test("exact API response ceiling passes while one byte less fails explicitly", async () => {
  const f = fixture(), installation = encode(f.installation), repositories = encode(f.repositories);
  const ceiling = Math.max(installation.length, repositories.length);
  const readApp: GitHubApiReader = async () => installation;
  const readInstallation: GitHubApiReader = async () => repositories;
  assert.deepEqual(await observeGitHubAppInstallation({ ...readOptions, maxResponseBytes: ceiling }, readApp, readInstallation),
    { stage: "github-app-installation", ...options });
  await assert.rejects(observeGitHubAppInstallation({ ...readOptions, maxResponseBytes: ceiling - 1 },
    readApp, readInstallation), /byte bounds/);
});
test("installation or repository scope changes on final observation fail without switching or retrying", async () => {
  for (const step of [1, 2, 3, 4]) {
    const f = fixture();
    let calls = 0;
    const readApp: GitHubApiReader = async () => {
      calls++;
      return encode(calls === step ? { ...f.installation, repository_selection: "all" } : f.installation);
    };
    const readInstallation: GitHubApiReader = async () => {
      calls++;
      return encode(calls === step ? { total_count: 2, repositories: f.repositories.repositories } : f.repositories);
    };
    await assert.rejects(observeGitHubAppInstallation(readOptions, readApp, readInstallation), /identity|exactly one/);
    assert.equal(calls, step);
  }
});
test("reader failures at each step are explicit sanitized errors rather than credential-bearing diagnostics or fallback", async () => {
  for (const step of [1, 2, 3, 4]) {
    const f = fixture();
    let calls = 0;
    const makeReader = (value: unknown): GitHubApiReader => async () => {
      calls++;
      if (calls === step) throw new Error("Synthetic private diagnostic");
      return encode(value);
    };
    await assert.rejects(observeGitHubAppInstallation(readOptions,
      makeReader(f.installation), makeReader(f.repositories)), error => {
      assert(error instanceof Error);
      assert.match(error.message, /API read failed/);
      assert(!error.message.includes("Synthetic private"));
      return true;
    });
    assert.equal(calls, step);
  }
});
