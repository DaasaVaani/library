import test from "node:test";
import assert from "node:assert/strict";
import { auditHostedCanonicalSnapshot } from "./snapshot-readback.js";
import { emptyPublicationLedger, publicationLedgerFingerprint as fingerprint, beginPublicationDeployment } from "./publication-ledger.js";
import { bindCanonicalSnapshot, prepareCanonicalSnapshot, reserveCanonicalSnapshot, readSnapshotSettings } from "./snapshot-producer.js";

const { policy, bounds } = await readSnapshotSettings();
function fixture() {
  const empty = emptyPublicationLedger();
  const prepared = prepareCanonicalSnapshot(empty, fingerprint(empty), {
    sourceCommit: "c".repeat(40), publishedAt: "2026-01-01T00:00:00.000Z",
    items: [1, 2].map(n => {
      const id = `10000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
      return { format: "daasavaani-lyric", formatVersion: 1, lyricId: id, canonicalScript: "kn",
        title: `Synthetic readback ${n}`, tags: [], lines: [{ kind: "line", lineId: id, text: "Synthetic fixture" }] };
    })
  }, policy, bounds);
  const reserved = reserveCanonicalSnapshot(empty, fingerprint(empty), prepared, bounds).state;
  const state = beginPublicationDeployment(reserved, fingerprint(reserved));
  const bound = bindCanonicalSnapshot(state, fingerprint(state), prepared, bounds);
  const files = new Map(bound.artifacts);
  files.set("latest.json", bound.descriptorBytes);
  const options = { baseUrl: "https://example.invalid/library/snapshots/", requestTimeoutMs: 30000 };
  return { prepared, reserved, state, files, options };
}
function stream(bytes: Buffer, size = 17): Response {
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      const end = Math.min(offset + size, bytes.length);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    }
  }), { headers: { "content-length": String(bytes.length) } });
}

test("readback checks every exact original/ZIP/manifest/policy byte between two descriptors without mutating state", async () => {
  const f = fixture(), stateBefore = structuredClone(f.state), calls: string[] = [];
  const expected = new Map([...f.files].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), path = url.pathname.slice("/library/snapshots/".length);
    calls.push(path);
    assert.equal(url.origin, "https://example.invalid");
    assert.equal(init?.redirect, "error");
    assert.deepEqual(init?.headers, { "cache-control": "no-cache, no-store", pragma: "no-cache" });
    assert.equal(init?.credentials, "omit");
    assert.ok(init?.signal);
    return stream(f.files.get(path)!);
  };
  const result = await auditHostedCanonicalSnapshot(f.options, f.state, fingerprint(f.state), f.prepared, bounds, fetcher);
  assert.deepEqual(calls, ["latest.json", ...[...f.files.keys()].filter(path => path !== "latest.json").sort(), "latest.json"]);
  assert.ok(calls.some(path => path.endsWith(".zip")));
  const bytes = calls.reduce((sum, path) => sum + f.files.get(path)!.length, 0);
  assert.deepEqual(result, { stage: "hosted-readback", sequence: 1, manifestSha256: f.prepared.manifest.sha256,
    artifactCount: f.files.size - 1, requestCount: f.files.size + 1, observedBytes: bytes });
  assert.deepEqual(f.state, stateBefore);
  assert.deepEqual(f.files, expected);
});

test("unsafe URLs, non-started/stale ledgers and corrupt prepared bytes fail before any request", async () => {
  const f = fixture();
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error("Must not fetch"); };
  for (const baseUrl of ["not a url", "http://example.invalid/", "https://user:password@example.invalid/",
    "https://example.invalid/no-trailing-slash", "https://example.invalid/?query", "https://example.invalid/#hash"]) {
    await assert.rejects(auditHostedCanonicalSnapshot({ ...f.options, baseUrl }, f.state, fingerprint(f.state),
      f.prepared, bounds, fetcher), /base URL/);
  }
  for (const requestTimeoutMs of [0, -1, 1.5, Infinity, 2147483648]) {
    await assert.rejects(auditHostedCanonicalSnapshot({ ...f.options, requestTimeoutMs }, f.state, fingerprint(f.state),
      f.prepared, bounds, fetcher), /timeout/);
  }
  await assert.rejects(auditHostedCanonicalSnapshot(f.options, f.reserved, fingerprint(f.reserved), f.prepared, bounds, fetcher), /started deployment/);
  await assert.rejects(auditHostedCanonicalSnapshot(f.options, f.state, "0".repeat(64), f.prepared, bounds, fetcher), /Stale/);
  f.prepared.artifacts.get(f.prepared.manifest.path)!.fill(0);
  await assert.rejects(auditHostedCanonicalSnapshot(f.options, f.state, fingerprint(f.state), f.prepared, bounds, fetcher), /identity\/size/);
  assert.equal(calls, 0);
});

test("status, redirects, HTTP encoding and false content-length never count as successful observations", async () => {
  for (const kind of ["404", "206", "302", "encoding", "length", "null-body", "redirected"]) {
    const f = fixture();
    const fetcher: typeof fetch = async () => {
      if (kind === "null-body") return new Response(null);
      if (kind === "redirected") return Response.redirect("https://example.invalid/elsewhere", 302);
      return new Response(f.files.get("latest.json")!, { status: ["404", "206", "302"].includes(kind) ? Number(kind) : 200,
        headers: kind === "encoding" ? { "content-encoding": "gzip" } : kind === "length" ? { "content-length": "1" } : {} });
    };
    await assert.rejects(auditHostedCanonicalSnapshot(f.options, f.state, fingerprint(f.state), f.prepared, bounds, fetcher),
      /status or URL|encoding|length|body is missing/);
  }
});

test("every artifact refuses truncation, changed bytes and overrun even without a content-length header", async () => {
  const f = fixture();
  for (const target of f.files.keys()) {
    for (const kind of ["short", "changed", "extra"]) {
      const fetcher: typeof fetch = async input => {
        const path = new URL(String(input)).pathname.slice("/library/snapshots/".length), bytes = f.files.get(path)!;
        if (path !== target) return stream(bytes);
        const changed = Buffer.from(bytes);
        changed[0] = changed[0]! ^ 1;
        return new Response(kind === "short" ? bytes.subarray(0, -1) : kind === "extra" ? Buffer.concat([bytes, Buffer.from([0])]) : changed);
      };
      await assert.rejects(auditHostedCanonicalSnapshot(f.options, f.state, fingerprint(f.state), f.prepared, bounds, fetcher),
        /truncated|bytes do not match/);
    }
  }
});

test("descriptor replacement during artifact reads fails the final recheck without a partial report", async () => {
  const f = fixture();
  let descriptors = 0;
  const fetcher: typeof fetch = async input => {
    const path = new URL(String(input)).pathname.slice("/library/snapshots/".length);
    if (path === "latest.json" && ++descriptors === 2) return new Response("A different publication");
    return stream(f.files.get(path)!);
  };
  await assert.rejects(auditHostedCanonicalSnapshot(f.options, f.state, fingerprint(f.state), f.prepared, bounds, fetcher), /bytes do not match/);
  assert.equal(descriptors, 2);
});

test("network/stream failures are explicit and redact transport diagnostics, payloads and URLs", async () => {
  const f = fixture();
  for (const fetcher of [
    async () => { throw new Error("Synthetic secret credential payload URL"); },
    async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("Synthetic private payload")); } }))
  ]) {
    await assert.rejects(auditHostedCanonicalSnapshot(f.options, f.state, fingerprint(f.state), f.prepared, bounds, fetcher),
      error => error instanceof Error && error.message === "Hosted snapshot transport or response stream failed");
  }
});

test("overrun cancels the owned stream immediately rather than draining an unbounded response", async () => {
  const f = fixture();
  let pulls = 0, cancelled = false;
  const fetcher: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(Buffer.alloc(f.files.get("latest.json")!.length + 1));
    },
    cancel() { cancelled = true; }
  }, { highWaterMark: 0 }));
  await assert.rejects(auditHostedCanonicalSnapshot(f.options, f.state, fingerprint(f.state), f.prepared, bounds, fetcher),
    /bytes do not match/);
  assert.equal(pulls, 1);
  assert.equal(cancelled, true);
});

test("deadline bounds headers and stalled body reads, aborts the request and cancels body ownership", async () => {
  const f = fixture();
  let aborted = false, cancelled = false;
  const stalledHeaders: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("Synthetic transport aborted")); }, { once: true });
  });
  await assert.rejects(auditHostedCanonicalSnapshot({ ...f.options, requestTimeoutMs: 20 }, f.state, fingerprint(f.state),
    f.prepared, bounds, stalledHeaders), /deadline/);
  assert.equal(aborted, true);
  const stalledBody: typeof fetch = async (_input, init) => new Response(new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener("abort", () => { cancelled = true; controller.error(new Error("Synthetic body aborted")); }, { once: true });
    }
  }));
  await assert.rejects(auditHostedCanonicalSnapshot({ ...f.options, requestTimeoutMs: 20 }, f.state, fingerprint(f.state),
    f.prepared, bounds, stalledBody), /deadline/);
  assert.equal(cancelled, true);
});

test("caller mutations after the first request cannot change captured expectations, sequence or timeout", async () => {
  const f = fixture(), options = { ...f.options };
  const fetcher: typeof fetch = async input => {
    const path = new URL(String(input)).pathname.slice("/library/snapshots/".length);
    f.prepared.artifacts.get(f.prepared.manifest.path)!.fill(0);
    f.state.pending!.sequence = 99;
    options.baseUrl = "http://unsafe.invalid/"; options.requestTimeoutMs = 0;
    return stream(f.files.get(path)!);
  };
  for (const [path, bytes] of f.files) f.files.set(path, Buffer.from(bytes));
  const result = await auditHostedCanonicalSnapshot(options, f.state, fingerprint(f.state), f.prepared, bounds, fetcher);
  assert.equal(result.sequence, 1);
});
