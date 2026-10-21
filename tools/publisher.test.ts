import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { source, canonical, index, publish, yaml } from "./publisher.js";

const fixture = (await readFile(new URL("../tests/fixtures/sources/666978747572652d6f6e65--test-one.md", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
test("source preserves text and UUID identity for LF and CRLF", () => {
  assert.deepEqual(source(fixture), source(fixture.replace(/\n/g, "\r\n")));
  assert.equal(source(fixture)?.lines[1]?.text, "ರಾಮ ಕೃಷ್ಣ");
});
test("malformed line IDs fail; held valid records are excluded", () => {
  assert.throws(() => source(fixture.replace("10000000-0000-4000-8000-000000000002", "bad")));
  assert.throws(() => source(fixture.replace("10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000001")));
  assert.equal(source(fixture.replace("holdReasons: []", "holdReasons: [review]")), null);
});
test("strict YAML and canonical safe-integer JSON", () => {
  assert.throws(() => yaml("a: 1\na: 2"));
  assert.throws(() => yaml("a: &x text\nb: *x"));
  assert.throws(() => canonical({ value: 1.5 }));
  assert.throws(() => canonical("\ud800"));
  assert.equal(canonical({ z: 2, a: "e\u0301" }), '{"a":"é","z":2}');
});
test("index counts repeated code-point grams", () => {
  const item = source(fixture)!;
  const result = index([{ ...item, title: "aaaa", description: "", tags: [], lines: [] }], "a".repeat(64));
  assert.deepEqual(result.postings["1:a"], [[0, 4]]);
  assert.deepEqual(result.postings["2:aa"], [[0, 3]]);
  assert.deepEqual(result.postings["3:aaa"], [[0, 2]]);
});
test("fixture publication is deterministic and all artifacts verify", async () => {
  const output = await mkdtemp(join(tmpdir(), "daasavaani-publisher-"));
  try {
    const first = await publish(output);
    const second = await publish(output);
    assert.deepEqual(first.descriptor, second.descriptor);
    const references = [...Object.entries(first.manifest.objects).map(([sha256, entry]) => ({ ...entry, sha256 })),
      first.descriptor.manifest];
    for (const entry of references) {
      const bytes = await readFile(join(output, entry.path));
      assert.equal(bytes.length, entry.encodedBytes);
      assert.equal(bytes.subarray(4, 8).readUInt32LE(), 0);
      assert.equal(bytes[9], 255);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
      assert.equal(gunzipSync(bytes).length, entry.decodedBytes);
    }
    assert.equal(first.items.length, 3);
    assert.equal(first.manifest.requiredCapabilities[0], "fixture-catalog-v1");
  } finally {
    await rm(output, { recursive: true });
  }
});
