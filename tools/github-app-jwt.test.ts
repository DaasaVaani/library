import test from "node:test";
import assert from "node:assert/strict";
import { constants, createHash, createSecretKey, generateKeyPairSync, verify } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createGitHubAppJwt } from "./github-app-jwt.js";
import { createGitHubAppInstallationReaders } from "./github-app-reader.js";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const options = { appId: 303, observedAt: "2026-11-08T12:00:00.999Z", clockSkewSeconds: 60, validForSeconds: 600 };
function decode(jwt: string) {
  const [header, payload, signature, extra] = jwt.split(".");
  assert.equal(extra, undefined);
  assert(header && payload && signature);
  for (const segment of [header, payload, signature]) {
    assert.equal(segment.includes("="), false);
    assert.equal(Buffer.from(segment, "base64url").toString("base64url") === segment, true);
  }
  const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert(claims !== null && typeof claims === "object" &&
    "iat" in claims && typeof claims.iat === "number" &&
    "exp" in claims && typeof claims.exp === "number" &&
    "iss" in claims && typeof claims.iss === "string");
  return { header: JSON.parse(Buffer.from(header, "base64url").toString("utf8")), payload: claims,
    signature: Buffer.from(signature, "base64url"), unsigned: `${header}.${payload}` };
}
test("exact unpadded RS256 claims verify independently with an ephemeral RSA public key", () => {
  const actual = decode(createGitHubAppJwt(options, keys.privateKey));
  const now = Math.floor(Date.parse(options.observedAt) / 1000);
  assert.deepEqual(actual.header, { alg: "RS256", typ: "JWT" });
  assert.deepEqual(actual.payload, { iat: now - 60, exp: now + 600, iss: "303" });
  assert.equal(verify("RSA-SHA256", Buffer.from(actual.unsigned, "ascii"),
    { key: keys.publicKey, padding: constants.RSA_PKCS1_PADDING }, actual.signature), true);
  assert.equal(verify("RSA-SHA256", Buffer.from(actual.unsigned + "x", "ascii"),
    { key: keys.publicKey, padding: constants.RSA_PKCS1_PADDING }, actual.signature), false);
  const changed = Buffer.from(actual.signature);
  const first = changed[0];
  assert(first !== undefined);
  changed[0] = first ^ 1;
  assert.equal(verify("RSA-SHA256", Buffer.from(actual.unsigned, "ascii"),
    { key: keys.publicKey, padding: constants.RSA_PKCS1_PADDING }, changed), false);
});
test("explicit valid lifetime and clock skew inclusive endpoints pass without twelve-hour credentials", () => {
  for (const clockSkewSeconds of [0, 60]) for (const validForSeconds of [1, 600]) {
    const actual = decode(createGitHubAppJwt({ ...options, clockSkewSeconds, validForSeconds }, keys.privateKey));
    const now = Math.floor(Date.parse(options.observedAt) / 1000);
    assert.equal(actual.payload.iat, now - clockSkewSeconds);
    assert.equal(actual.payload.exp, now + validForSeconds);
    assert(actual.payload.exp * 1000 - Date.parse(options.observedAt) <= 600000);
  }
});
test("unsafe app identity lifetime and skew bounds are explicitly rejected", () => {
  for (const appId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    assert.throws(() => createGitHubAppJwt({ ...options, appId }, keys.privateKey), /JWT options/);
  }
  for (const clockSkewSeconds of [-1, 61, 0.5, Infinity]) {
    assert.throws(() => createGitHubAppJwt({ ...options, clockSkewSeconds }, keys.privateKey), /JWT options/);
  }
  for (const validForSeconds of [0, -1, 601, 43200, 1.5, NaN]) {
    assert.throws(() => createGitHubAppJwt({ ...options, validForSeconds }, keys.privateKey), /JWT options/);
  }
});
test("invalid UTC instants and derived date bounds fail without wall-clock fallback", () => {
  for (const observedAt of ["", "2026-02-30T12:00:00.000Z", "2026-11-08T12:00:00Z",
    "2026-11-08T12:00:00.000+00:00", "2026-11-08T12:00:60.000Z"]) {
    assert.throws(() => createGitHubAppJwt({ ...options, observedAt }, keys.privateKey), /JWT options/);
  }
  for (const observedAt of ["1970-01-01T00:00:00.000Z", "9999-12-31T23:59:59.999Z"]) {
    assert.throws(() => createGitHubAppJwt({ ...options, observedAt }, keys.privateKey), /UTC bounds/);
  }
});
test("unknown option fields are rejected before raw secret getters are accessed", () => {
  let reads = 0;
  const extra = { ...options };
  Object.defineProperty(extra, "privateKey", { get() { reads++; throw new Error("Synthetic private diagnostic"); } });
  assert.throws(() => createGitHubAppJwt(extra, keys.privateKey), /JWT options/);
  assert.equal(reads, 0);
  const symbolic = { ...options, [Symbol("unknown")]: true };
  assert.throws(() => createGitHubAppJwt(symbolic, keys.privateKey), /JWT options/);
});
test("public symmetric EC RSA-PSS and weak RSA keys are refused before signing", () => {
  assert.throws(() => createGitHubAppJwt(options, keys.publicKey), /RSA private KeyObject/);
  assert.throws(() => createGitHubAppJwt(options, createSecretKey(Buffer.alloc(32))), /RSA private KeyObject/);
  const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  assert.throws(() => createGitHubAppJwt(options, ec.privateKey), /RSA private KeyObject/);
  const pss = generateKeyPairSync("rsa-pss", { modulusLength: 2048 });
  assert.throws(() => createGitHubAppJwt(options, pss.privateKey), /RSA private KeyObject/);
  const weak = generateKeyPairSync("rsa", { modulusLength: 1024 });
  assert.throws(() => createGitHubAppJwt(options, weak.privateKey), /at least 2048 bits/);
});
test("RS256 signing is deterministic for captured input without retaining or refreshing credentials", () => {
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  assert.equal(digest(createGitHubAppJwt(options, keys.privateKey)), digest(createGitHubAppJwt({ ...options }, keys.privateKey)));
  const later = { ...options, observedAt: "2026-11-08T12:00:01.999Z" };
  assert.notEqual(digest(createGitHubAppJwt(options, keys.privateKey)), digest(createGitHubAppJwt(later, keys.privateKey)));
  assert.equal(options.observedAt, "2026-11-08T12:00:00.999Z");
});
test("explicit signed App JWT feeds only the native App reader context without networking", async () => {
  const jwt = createGitHubAppJwt(options, keys.privateKey);
  let calls = 0;
  const readers = createGitHubAppInstallationReaders({ installationId: 404, appJwt: jwt,
    installationToken: "synthetic-installation-not-a-credential" }, async (url, init) => {
    calls++;
    const header = new Headers(init?.headers).get("authorization");
    assert.equal(header === `Bearer ${jwt}`, true);
    const value = new Response('{"synthetic":true}');
    Object.defineProperty(value, "url", { value: String(url) });
    return value;
  });
  await readers.readApp("app/installations/404", { requestTimeoutMs: 1000, maxResponseBytes: 1024 });
  assert.equal(calls, 1);
});
test("native signing errors are sanitized in an isolated process without exposing the original diagnostic", async () => {
  const script = `
    import assert from 'node:assert/strict';
    import crypto from 'node:crypto';
    import {syncBuiltinESMExports} from 'node:module';
    const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
    crypto.sign=()=>{throw new Error('Synthetic private signing diagnostic');};
    syncBuiltinESMExports();
    const {createGitHubAppJwt}=await import(process.env.APP_JWT_MODULE);
    assert.throws(()=>createGitHubAppJwt({appId:303,observedAt:'2026-11-08T12:00:00.000Z',
      clockSkewSeconds:60,validForSeconds:600},keys.privateKey),
      error=>error instanceof Error && error.message==='GitHub App JWT signing failed');
    console.log('Native signing failure sanitized without key export or network');
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    env: { ...process.env, APP_JWT_MODULE: new URL("./github-app-jwt.ts", import.meta.url).href },
    timeout: 30000, windowsHide: true
  });
  assert.equal(stdout.trim(), "Native signing failure sanitized without key export or network");
});
