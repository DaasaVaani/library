import test from "node:test";
import assert from "node:assert/strict";
import { withGitHubAppWriterToken, type GitHubAppWriterTokenOptions } from "./github-app-token.js";
import { requestGitHubApp } from "./github-app-reader.js";

const jwt = "synthetic-app-not-a-credential", token = "synthetic-installation-not-a-credential";
const options: GitHubAppWriterTokenOptions = { repository: "SyntheticOwner/synthetic-library", repositoryId: 101,
  organizationId: 202, appId: 303, appSlug: "synthetic-app", installationId: 404,
  requestTimeoutMs: 1000, maxResponseBytes: 65536, minRemainingMs: 60000, maxRemainingMs: 3600000 };
const now = () => "2026-11-13T10:00:00.000Z";
function fixture() {
  const account = { id: 202, login: "SyntheticOwner", type: "Organization" };
  const repositories = [{ id: 101, full_name: options.repository, owner: account }];
  const installation = { id: 404, app_id: 303, app_slug: "synthetic-app", target_id: 202, target_type: "Organization",
    account, repository_selection: "selected", permissions: { contents: "write", metadata: "read" }, events: [], suspended_at: null };
  const minted: Record<string, unknown> = { token, expires_at: "2026-11-13T11:00:00Z",
    permissions: installation.permissions, repository_selection: "selected", repositories };
  return { minted, installation, repositories };
}
function response(url: string, value: unknown, status = 200) {
  const result = new Response(status === 204 ? null : JSON.stringify(value), { status });
  Object.defineProperty(result, "url", { value: url });
  return result;
}
function scenario() {
  const data = fixture(), calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (init?.method === "POST") return response(url, data.minted, 201);
    if (init?.method === "DELETE") return response(url, null, 204);
    return response(url, url.endsWith("/repositories") ? { total_count: 1, repositories: data.repositories } : data.installation);
  };
  return { ...data, calls, fetcher };
}

test("one narrowed mint four independent identity reads and one revoke surround the admitted callback", async () => {
  const f = scenario();
  const result = await withGitHubAppWriterToken(options, jwt, async lease => {
    assert.equal(f.calls.length, 5);
    assert.equal(lease.token, token);
    assert.equal(Object.isFrozen(lease), true);
    assert.equal(Object.isFrozen(lease.metadata), true);
    assert.equal(lease.metadata.stage, "github-app-writer-token-metadata");
    assert.equal(lease.metadata.remainingMs, 3600000);
    assert.equal("token" in lease.metadata, false);
    return { committed: false, synthetic: true };
  }, now, f.fetcher);
  assert.deepEqual(result, { committed: false, synthetic: true });
  assert.equal(f.calls.length, 6);
  assert.deepEqual(f.calls.map(call => call.init?.method), ["POST", "GET", "GET", "GET", "GET", "DELETE"]);
  const mint = f.calls[0];
  assert(mint);
  assert.equal(mint.url, "https://api.github.com/app/installations/404/access_tokens");
  assert.deepEqual(JSON.parse(String(mint.init?.body)), {
    repository_ids: [101], permissions: { contents: "write", metadata: "read" }
  });
  assert.equal(new Headers(mint.init?.headers).get("content-type"), "application/json");
  for (const [index, call] of f.calls.entries()) {
    assert.equal(new Headers(call.init?.headers).get("authorization"),
      `Bearer ${[0, 1, 3].includes(index) ? jwt : token}`);
    assert.equal(call.init?.redirect, "error");
    assert.equal(call.init?.credentials, "omit");
    assert.equal(call.init?.signal?.aborted, true);
  }
  assert.equal(f.calls.at(-1)?.url, "https://api.github.com/installation/token");
  assert.equal(f.calls.at(-1)?.init?.body, undefined);
});
test("unsafe lifecycle options fail before any mint and captured bounds and identities cannot change during await", async () => {
  const f = scenario();
  for (const patch of [{ repositoryId: 0 }, { minRemainingMs: 0 }, { maxRemainingMs: 3600001 },
    { minRemainingMs: 1000, maxRemainingMs: 999 }, { requestTimeoutMs: 0 }, { maxResponseBytes: 0 }]) {
    await assert.rejects(withGitHubAppWriterToken({ ...options, ...patch }, jwt, async () => 1, now, f.fetcher), /options/);
  }
  const extra = { ...options, arbitrary: true };
  await assert.rejects(withGitHubAppWriterToken(extra, jwt, async () => 1, now, f.fetcher), /inputs/);
  const rememberedClock = { ...options, observedAt: now() };
  await assert.rejects(withGitHubAppWriterToken(rememberedClock, jwt, async () => 1, now, f.fetcher), /inputs/);
  for (const value of ["", "unsafe\ncredential"]) {
    await assert.rejects(withGitHubAppWriterToken(options, value, async () => 1, now, f.fetcher), /inputs/);
  }
  assert.equal(f.calls.length, 0);
  const mutable = { ...options };
  const fetcher: typeof fetch = async (url, init) => {
    mutable.installationId = 999;
    mutable.repositoryId = 999;
    mutable.maxResponseBytes = 1;
    return f.fetcher(url, init);
  };
  assert.equal(await withGitHubAppWriterToken(mutable, jwt, async () => 7, now, fetcher), 7);
  assert(f.calls.every(call => !call.url.includes("999")));
});
test("every metadata rejection revokes the safely captured token without running user work", async () => {
  for (const patch of [
    { permissions: { contents: "read", metadata: "read" } }, { permissions: { contents: "write", metadata: "read", issues: "write" } },
    { repository_selection: "all" }, { repositories: [] }, { expires_at: "2026-11-13T10:00:59.999Z" },
    { expires_at: "2026-11-13T22:00:00Z" }, { expires_at: "2026-02-30T11:00:00Z" },
  ]) {
    const f = scenario(); Object.assign(f.minted, patch);
    let executed = false;
    await assert.rejects(withGitHubAppWriterToken(options, jwt, async () => { executed = true; }, now, f.fetcher),
      /admission or operation failed; token revocation confirmed/);
    assert.equal(executed, false);
    assert.deepEqual(f.calls.map(call => call.init?.method), ["POST", "DELETE"]);
  }
});
test("wrong App or changed bracketed installation evidence fails before work and still revokes", async () => {
  for (const stage of [1, 2, 3, 4]) {
    const f = scenario();
    const fetcher: typeof fetch = async (url, init) => {
      if (f.calls.length === stage) {
        if (stage === 1 || stage === 3) f.installation.app_id = 999;
        else {
          const repository = f.repositories[0];
          assert(repository);
          repository.id = 999;
        }
      }
      return f.fetcher(url, init);
    };
    let executed = false;
    await assert.rejects(withGitHubAppWriterToken(options, jwt, async () => { executed = true; }, now, fetcher), /revocation confirmed/);
    assert.equal(executed, false);
    assert.equal(f.calls.at(-1)?.init?.method, "DELETE");
    assert.equal(f.calls.length, stage + 2);
  }
});
test("expiry is checked again after identity reads and callback errors are sanitized only after revocation", async () => {
  const f = scenario();
  let ticks = 0, executed = false;
  const clock = () => ++ticks === 3 ? "2026-11-13T10:59:01.000Z" : now();
  await assert.rejects(withGitHubAppWriterToken(options, jwt, async () => { executed = true; }, clock, f.fetcher), /revocation confirmed/);
  assert.equal(executed, false);
  assert.equal(f.calls.length, 6);
  const failure = scenario();
  await assert.rejects(withGitHubAppWriterToken(options, jwt, async () => { throw new Error(token); }, now, failure.fetcher),
    error => error instanceof Error && error.message === "GitHub App writer admission or operation failed; token revocation confirmed");
  assert.equal(failure.calls.at(-1)?.init?.method, "DELETE");
});
test("successful or failed operations cannot hide unconfirmed token revocation", async () => {
  for (const failOperation of [false, true]) {
    const f = scenario();
    const fetcher: typeof fetch = async (url, init) => {
      if (init?.method === "DELETE") { f.calls.push({ url: String(url), init }); return response(String(url), null, 401); }
      return f.fetcher(url, init);
    };
    await assert.rejects(withGitHubAppWriterToken(options, jwt, async () => {
      if (failOperation) throw new Error("Synthetic private work error");
      return "not-a-success";
    }, now, fetcher), failOperation ? /operation and token revocation failed/ : /revocation not confirmed/);
    assert.equal(f.calls.filter(call => call.init?.method === "DELETE").length, 1);
  }
});
test("unconfirmed issuance never retries or guesses credentials from malformed provider bytes", async () => {
  for (const mode of ["http", "transport", "json", "duplicate", "unsafe", "same", "missing"]) {
    let calls = 0, executed = false;
    const fetcher: typeof fetch = async url => {
      calls++;
      if (mode === "transport") throw new Error(jwt);
      if (mode === "http") return response(String(url), { private: jwt }, 503);
      if (mode === "json" || mode === "duplicate") {
        const result = new Response(mode === "json" ? "not-json" : '{"token":"synthetic","token":"duplicate"}', { status: 201 });
        Object.defineProperty(result, "url", { value: String(url) });
        return result;
      }
      return response(String(url), mode === "missing" ? {} : { token: mode === "same" ? jwt : "unsafe\ncredential" }, 201);
    };
    await assert.rejects(withGitHubAppWriterToken(options, jwt, async () => { executed = true; }, now, fetcher), error =>
      error instanceof Error && error.message.includes("operator reconciliation required") &&
      !error.message.includes(jwt) && !error.message.includes(token));
    assert.equal(calls, 1);
    assert.equal(executed, false);
  }
});
test("callback result stays pending until the exact revoke response completes", async () => {
  const f = scenario();
  let complete: (() => void) | undefined, callbackDone: (() => void) | undefined;
  const reached = new Promise<void>(resolve => { callbackDone = resolve; });
  const revokeReady = new Promise<void>(resolve => { complete = resolve; });
  const fetcher: typeof fetch = async (url, init) => {
    if (init?.method === "DELETE") { callbackDone?.(); await revokeReady; }
    return f.fetcher(url, init);
  };
  let returned = false;
  const promise = withGitHubAppWriterToken(options, jwt, async () => 17, now, fetcher).then(value => { returned = true; return value; });
  await reached;
  assert.equal(returned, false);
  complete?.();
  assert.equal(await promise, 17);
});
test("mint response bounds deadline and exact address/status fail closed using shared native transport", async () => {
  const request = { kind: "mint" as const, installationId: 404, repositoryId: 101, credential: jwt };
  const json = JSON.stringify({ synthetic: true }), bytes = Buffer.byteLength(json);
  const fetcher: typeof fetch = async url => {
    const result = response(String(url), { synthetic: true }, 201);
    result.headers.set("content-length", String(bytes));
    return result;
  };
  assert.equal(Buffer.from(await requestGitHubApp(request, { ...options, maxResponseBytes: bytes }, fetcher)).toString(), json);
  await assert.rejects(requestGitHubApp(request, { ...options, maxResponseBytes: bytes - 1 }, fetcher), /byte bounds/);
  await assert.rejects(requestGitHubApp(request, { ...options, requestTimeoutMs: 20 },
    async () => new Promise<Response>(() => {})), /deadline exceeded/);
  await assert.rejects(requestGitHubApp(request, options, async () => response("https://untrusted.invalid/", {}, 201)), /status or URL/);
  await assert.rejects(requestGitHubApp(request, options, async url => response(String(url), {}, 200)), /status or URL/);
  await assert.rejects(requestGitHubApp({ kind: "revoke", credential: token }, options,
    async url => response(String(url), {}, 200)), /status or URL/);
});
test("unsupported scoped request shapes and identities are refused before native Fetch", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async url => { calls++; return response(String(url), {}, 201); };
  for (const repositoryId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(requestGitHubApp({ kind: "mint", installationId: 404, repositoryId, credential: jwt }, options, fetcher), /scoped/);
  }
  const extra = { kind: "mint" as const, installationId: 404, repositoryId: 101, credential: jwt, endpoint: "arbitrary" };
  await assert.rejects(requestGitHubApp(extra, options, fetcher), /scoped/);
  assert.equal(calls, 0);
});
test("clock failures before mint are sanitized and failures after mint require confirmed revocation", async () => {
  for (const stage of [1, 2, 3]) {
    const f = scenario();
    let ticks = 0, executed = false;
    const clock = () => {
      if (++ticks === stage) throw new Error(jwt);
      return now();
    };
    await assert.rejects(withGitHubAppWriterToken(options, jwt, async () => { executed = true; }, clock, f.fetcher),
      error => error instanceof Error && !error.message.includes(jwt) &&
        (stage === 1 ? error.message.includes("clock failed") : error.message.includes("revocation confirmed")));
    assert.equal(executed, false);
    if (stage === 1) assert.equal(f.calls.length, 0);
    else assert.equal(f.calls.at(-1)?.init?.method, "DELETE");
  }
});
