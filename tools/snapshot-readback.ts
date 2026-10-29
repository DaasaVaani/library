import { bindCanonicalSnapshot, type PreparedCanonicalSnapshot, type SnapshotBounds } from "./snapshot-producer.js";
import type { PublicationLedger } from "./publication-ledger.js";

export interface SnapshotReadbackOptions {
  baseUrl: string;
  requestTimeoutMs: number;
}
export interface SnapshotReadbackReport {
  stage: "hosted-readback";
  sequence: number;
  manifestSha256: string;
  artifactCount: number;
  requestCount: number;
  observedBytes: number;
}
class ReadbackError extends Error {}

async function observe(url: URL, expected: Buffer, timeoutMs: number, fetcher: typeof fetch): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ReadbackError("Hosted snapshot request deadline exceeded"));
      controller.abort();
    }, timeoutMs);
  });
  const read = async () => {
    const response = await fetcher(url, { signal: controller.signal, redirect: "error",
      credentials: "omit", headers: { "cache-control": "no-cache, no-store", pragma: "no-cache" } });
    const reader = response.body?.getReader();
    try {
      if (response.status !== 200 || response.redirected || (response.url && response.url !== url.href)) {
        throw new ReadbackError("Hosted snapshot response status or URL mismatch");
      }
      const encoding = response.headers.get("content-encoding"), length = response.headers.get("content-length");
      if (encoding && encoding.toLowerCase() !== "identity") throw new ReadbackError("Hosted snapshot HTTP content encoding is unsupported");
      if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || BigInt(length) !== BigInt(expected.length))) {
        throw new ReadbackError("Hosted snapshot content length mismatch");
      }
      if (!reader) throw new ReadbackError("Hosted snapshot response body is missing");
      let offset = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.length > expected.length - offset ||
            !expected.subarray(offset, offset + value.length).equals(value)) {
          throw new ReadbackError("Hosted snapshot bytes do not match bound candidate");
        }
        offset += value.length;
      }
      if (offset !== expected.length) throw new ReadbackError("Hosted snapshot response is truncated");
    } finally {
      if (reader) {
        try { await reader.cancel(); }
        finally { reader.releaseLock(); }
      }
    }
  };
  try {
    await Promise.race([read(), deadline]);
  } catch (error) {
    if (error instanceof ReadbackError) throw error;
    throw new ReadbackError("Hosted snapshot transport or response stream failed");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}

export async function auditHostedCanonicalSnapshot(options: SnapshotReadbackOptions, state: PublicationLedger,
  expectedStateSha256: string, prepared: PreparedCanonicalSnapshot, bounds: SnapshotBounds,
  fetcher: typeof fetch = fetch): Promise<SnapshotReadbackReport> {
  const { baseUrl, requestTimeoutMs } = options;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 2147483647) {
    throw new ReadbackError("Invalid hosted snapshot request timeout");
  }
  let base: URL;
  try { base = new URL(baseUrl); }
  catch { throw new ReadbackError("Invalid hosted snapshot base URL"); }
  if (base.protocol !== "https:" || !base.hostname || base.username || base.password || base.search || base.hash ||
      !base.pathname.endsWith("/")) throw new ReadbackError("Invalid hosted snapshot base URL");
  if (state.pending?.phase !== "deploying") throw new ReadbackError("Hosted snapshot audit requires a started deployment");
  const bound = bindCanonicalSnapshot(state, expectedStateSha256, prepared, bounds);
  let observed = 0n;
  const expectedBytes = [...bound.artifacts.values()].reduce((sum, bytes) => sum + BigInt(bytes.length),
    2n * BigInt(bound.descriptorBytes.length));
  if (expectedBytes > BigInt(Number.MAX_SAFE_INTEGER)) throw new ReadbackError("Hosted snapshot audit byte accounting exceeds safe integer");
  const descriptorUrl = new URL("latest.json", base);
  await observe(descriptorUrl, bound.descriptorBytes, requestTimeoutMs, fetcher);
  observed += BigInt(bound.descriptorBytes.length);
  for (const [path, bytes] of [...bound.artifacts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    await observe(new URL(path, base), bytes, requestTimeoutMs, fetcher);
    observed += BigInt(bytes.length);
  }
  await observe(descriptorUrl, bound.descriptorBytes, requestTimeoutMs, fetcher);
  observed += BigInt(bound.descriptorBytes.length);
  return { stage: "hosted-readback", sequence: bound.descriptor.sequence, manifestSha256: bound.descriptor.manifest.sha256,
    artifactCount: bound.artifacts.size, requestCount: bound.artifacts.size + 2, observedBytes: Number(observed) };
}
