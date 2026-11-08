import test from "node:test";
import assert from "node:assert/strict";
import { auditGitHubAppInstallation, type GitHubAppInstallationOptions } from "./github-app-installation.js";

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
