import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createGitHubAppInstallationReaders } from "./github-app-reader.js";
import { observeGitHubAppInstallation } from "./github-app-installation.js";

const credentials = { installationId: 404, appJwt: "synthetic-app-not-a-credential", installationToken: "synthetic-installation-not-a-credential" };
const limits = { requestTimeoutMs: 1000, maxResponseBytes: 65536 };
const bytes = Buffer.from('{"synthetic":true}');
const response = (body: ConstructorParameters<typeof Response>[0] = bytes, headers: Record<string, string> = {},
  url = "https://api.github.com/app/installations/404") => {
  const value = new Response(body, { status: 200, headers });
  Object.defineProperty(value, "url", { value: url, configurable: true });
  return value;
};

test("native Fetch profile binds distinct Bearer credentials to exact HTTPS GET routes and bounded independent bytes", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return response(bytes, {}, String(url)); };
  const readers = createGitHubAppInstallationReaders(credentials, fetcher);
  assert.equal(Object.isFrozen(readers), true);
  for (const read of [readers.readApp, readers.readInstallation]) {
    const endpoint = read === readers.readApp ? "app/installations/404" : "installation/repositories";
    const actual = await read(endpoint, { ...limits, maxResponseBytes: bytes.length });
    assert.deepEqual(actual, bytes);
    actual[0] = 0;
    assert.equal(bytes[0], 123);
  }
  for (const [index, call] of calls.entries()) {
    assert.equal(call.url, index === 0 ? "https://api.github.com/app/installations/404" : "https://api.github.com/installation/repositories");
    assert.equal(call.init?.method, "GET");
    assert.equal(call.init?.redirect, "error");
    assert.equal(call.init?.credentials, "omit");
    const headers = new Headers(call.init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${index === 0 ? credentials.appJwt : credentials.installationToken}`);
    assert.equal(headers.get("accept-encoding"), "identity");
    assert.equal(headers.get("x-github-api-version"), "2022-11-28");
    assert.equal(headers.get("cache-control"), "no-cache, no-store");
    assert.equal(call.init?.signal?.aborted, true);
  }
});
test("captured credentials and per-read limits cannot change during an await", async () => {
  const input = { ...credentials }, bounds = { ...limits, maxResponseBytes: bytes.length };
  const fetcher: typeof fetch = async (_url, init) => {
    input.appJwt = "synthetic-replacement";
    input.installationId = 999;
    bounds.maxResponseBytes = 1;
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${credentials.appJwt}`);
    return response();
  };
  const readers = createGitHubAppInstallationReaders(input, fetcher);
  assert.deepEqual(await readers.readApp("app/installations/404", bounds), bytes);
  assert.deepEqual(await readers.readApp("app/installations/404", limits), bytes);
});
test("empty invalid credentials duplicate contexts and unknown options fail without making a request", () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return response(); };
  for (const [field, values] of Object.entries({
    installationId: [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "404"],
    appJwt: ["", "synthetic\nvalue", "synthetic value", 123],
    installationToken: ["", "synthetic\rvalue", "synthetic\u0000value"]
  })) for (const value of values) {
    assert.throws(() => createGitHubAppInstallationReaders({ ...credentials, [field]: value }, fetcher), /reader credentials/);
  }
  assert.throws(() => createGitHubAppInstallationReaders({ ...credentials, installationToken: credentials.appJwt }, fetcher), /reader credentials/);
  const extra = { ...credentials, extra: true };
  assert.throws(() => createGitHubAppInstallationReaders(extra, fetcher), /reader credentials/);
  assert.equal(calls, 0);
});
test("credential route crossing arbitrary URLs query delimiters and unsafe limits are refused before Fetch", async () => {
  let calls = 0;
  const readers = createGitHubAppInstallationReaders(credentials, async () => { calls++; return response(); });
  for (const endpoint of [
    "https://untrusted.invalid/credential", "app/installations/405", "app/installations/404?", "app/installations/404#",
    "app/installations/404/access_tokens", "installation/repositories", "repos/owner/repo", "../installation/repositories"
  ]) await assert.rejects(readers.readApp(endpoint, limits), /credential scope/);
  await assert.rejects(readers.readInstallation("app/installations/404", limits), /credential scope/);
  for (const value of [0, -1, 1.5, 2147483648, NaN]) {
    await assert.rejects(readers.readApp("app/installations/404", { ...limits, maxResponseBytes: value }), /read options/);
    await assert.rejects(readers.readInstallation("installation/repositories", { ...limits, requestTimeoutMs: value }), /read options/);
  }
  assert.equal(calls, 0);
});
test("actual streamed equality passes and declared or streamed overrun empty and truncated bodies fail", async () => {
  for (const [body, headers, ceiling, expected] of [
    [bytes, { "content-length": String(bytes.length) }, bytes.length, true],
    [bytes, {}, bytes.length - 1, false],
    [bytes, { "content-length": String(bytes.length) }, bytes.length - 1, false],
    [bytes, { "content-length": String(bytes.length + 1) }, 65536, false],
    [Buffer.alloc(0), {}, 65536, false],
    [bytes, { "content-length": "01" }, 65536, false]
  ] as const) {
    const readers = createGitHubAppInstallationReaders(credentials, async () => response(body, headers));
    const result = readers.readApp("app/installations/404", { ...limits, maxResponseBytes: ceiling });
    if (expected) assert.deepEqual(await result, bytes);
    else await assert.rejects(result, /byte bounds|empty or truncated/);
  }
});
test("wrong status content encoding redirects and response URLs fail without exposing response text", async () => {
  for (const mode of ["status", "encoding", "redirected", "url", "empty-url", "missing"]) {
    const fetcher: typeof fetch = async () => {
      const value = mode === "missing" ? response(null) : response(Buffer.from("Synthetic private diagnostic"));
      if (mode === "status") Object.defineProperty(value, "status", { value: 401 });
      if (mode === "encoding") value.headers.set("content-encoding", "gzip");
      if (mode === "redirected") Object.defineProperty(value, "redirected", { value: true });
      if (mode === "url") Object.defineProperty(value, "url", { value: "https://untrusted.invalid/response" });
      if (mode === "empty-url") Object.defineProperty(value, "url", { value: "" });
      return value;
    };
    await assert.rejects(createGitHubAppInstallationReaders(credentials, fetcher).readApp("app/installations/404", limits), error => {
      assert(error instanceof Error);
      assert(!error.message.includes("Synthetic private"));
      assert.match(error.message, /status or URL|encoding|body is missing/);
      return true;
    });
  }
});
test("stream overrun cancels the actual stream and transport or cleanup errors are explicitly sanitized", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(bytes); },
    cancel() { cancelled = true; }
  });
  const readers = createGitHubAppInstallationReaders(credentials, async () => response(stream));
  await assert.rejects(readers.readApp("app/installations/404", { ...limits, maxResponseBytes: bytes.length - 1 }), /byte bounds/);
  assert.equal(cancelled, true);
  const failing: typeof fetch = async () => { throw new Error("Synthetic credential diagnostic"); };
  await assert.rejects(createGitHubAppInstallationReaders(credentials, failing).readApp("app/installations/404", limits), error =>
    error instanceof Error && error.message === "GitHub App API transport or response stream failed");
  const cleanup = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(bytes); },
    cancel() { throw new Error("Synthetic private cleanup diagnostic"); }
  });
  await assert.rejects(createGitHubAppInstallationReaders(credentials, async () => response(cleanup))
    .readApp("app/installations/404", { ...limits, maxResponseBytes: bytes.length - 1 }), error =>
    error instanceof Error && error.message === "GitHub App API transport or response stream failed");
});
test("the deadline covers stalled headers and stalled native stream reads and aborts the request", async () => {
  for (const stage of ["headers", "body"]) {
    let signal: AbortSignal | null | undefined;
    const fetcher: typeof fetch = async (_url, init) => {
      signal = init?.signal;
      if (stage === "headers") return new Promise<Response>(() => {});
      const stream = new ReadableStream<Uint8Array>({
        start(controller) { signal?.addEventListener("abort", () => controller.error(new Error("Synthetic aborted body"))); }
      });
      return response(stream);
    };
    await assert.rejects(createGitHubAppInstallationReaders(credentials, fetcher)
      .readApp("app/installations/404", { ...limits, requestTimeoutMs: 20 }), /deadline exceeded/);
    assert.equal(signal?.aborted, true);
  }
});
test("credential-separated native readers connect to full bracketed installation observation without owner credential fallback", async () => {
  const account = { id: 202, login: "SyntheticOwner", type: "Organization" };
  const installation = { id: 404, app_id: 303, app_slug: "synthetic-app", target_id: 202, target_type: "Organization",
    account, repository_selection: "selected", permissions: { contents: "write", metadata: "read" }, events: [], suspended_at: null };
  const repositories = { total_count: 1, repositories: [{ id: 101, full_name: "SyntheticOwner/synthetic-library", owner: account }] };
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    const app = String(url).endsWith("app/installations/404");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${app ? credentials.appJwt : credentials.installationToken}`);
    return response(Buffer.from(JSON.stringify(app ? installation : repositories)), {}, String(url));
  };
  const readers = createGitHubAppInstallationReaders(credentials, fetcher);
  const report = await observeGitHubAppInstallation({ repository: "SyntheticOwner/synthetic-library", repositoryId: 101,
    organizationId: 202, appId: 303, appSlug: "synthetic-app", installationId: 404, ...limits },
  readers.readApp, readers.readInstallation);
  assert.equal(calls, 4);
  assert.equal(report.stage, "github-app-installation");
  assert(!JSON.stringify(report).includes("not-a-credential"));
});

test("default native reader ignores inherited owner credentials and refuses TLS verification bypass in an isolated process", async () => {
  const script = `
    import assert from 'node:assert/strict';
    const calls = [];
    globalThis.fetch = async (url,init) => {
      calls.push({url,init});
      const value = new Response('{"synthetic":true}');
      Object.defineProperty(value,'url',{value:String(url)});
      return value;
    };
    const {createGitHubAppInstallationReaders} = await import(process.env.APP_READER_MODULE);
    const readers = createGitHubAppInstallationReaders({
      installationId:404,appJwt:'synthetic-app',installationToken:'synthetic-installation'
    });
    const limits = {requestTimeoutMs:1000,maxResponseBytes:65536};
    await readers.readApp('app/installations/404',limits);
    await readers.readInstallation('installation/repositories',limits);
    assert.equal(calls.length,2);
    assert.equal(new Headers(calls[0].init.headers).get('authorization'),'Bearer synthetic-app');
    assert.equal(new Headers(calls[1].init.headers).get('authorization'),'Bearer synthetic-installation');
    assert.equal(process.env.GH_TOKEN,'synthetic-owner');
    assert.equal(process.env.GITHUB_TOKEN,'synthetic-owner-alternate');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
    await assert.rejects(readers.readApp('app/installations/404',limits),/requires TLS certificate verification/);
    assert.equal(calls.length,2);
    console.log('Default native context isolation and TLS refusal passed without network');
  `;
  const { stdout } = await promisify(execFile)(process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script], {
      env: { ...process.env, APP_READER_MODULE: new URL("./github-app-reader.ts", import.meta.url).href,
        GH_TOKEN: "synthetic-owner", GITHUB_TOKEN: "synthetic-owner-alternate", NODE_TLS_REJECT_UNAUTHORIZED: "1" },
      timeout: 30000, windowsHide: true
    });
  assert.equal(stdout.trim(), "Default native context isolation and TLS refusal passed without network");
});
