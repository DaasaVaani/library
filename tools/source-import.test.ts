import test from "node:test";
import assert from "node:assert/strict";
import type { PathLike } from "node:fs";
import fs, { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importSources, retryCreditFooters, validateSources } from "./source-import.js";
import { parseDraft } from "./lyric-source.js";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";

const options = { maxSourceFileBytes: 4096, maxTotalSourceBytes: 16384, reviewHoldReason: "source-import-review" };
const permitted = "  ಕನ್ನಡ  \n\nಕನ್ನಡ \n\nSource Latin  \n\n";
const creditFooter = { enabled: true, primaryLabel: "ಸಾಹಿತ್ಯ", companionLabel: "Kruti", additionalLabels: ["Singer", "ಗಾಯಕರು"] };
const footer = "ಸಾಹಿತ್ಯ : Synthetic credit  \nKruti: Synthetic credit\nsynthetic, test, metadata,\n\n";
async function setup(run: (root: string, input: string, output: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "daasavaani-source-import-"));
  const input = join(root, "originals"), output = join(root, "drafts");
  try { await mkdir(input); await run(root, input, output); }
  finally { await rm(root, { recursive: true }); }
}
async function onlyDraft(output: string) {
  const file = (await readdir(output)).find(name => name.endsWith(".md"));
  assert.ok(file);
  return join(output, file);
}
async function tree(directory: string) {
  const files = await readdir(directory);
  return Object.fromEntries(await Promise.all(files.map(async name => [name, await readFile(join(directory, name), "utf8")])));
}
test("owner source import preserves exact permitted text/layout, uses first Kannada title and assigns independent persistent UUIDs", async () => {
  await setup(async (_root, input, output) => {
    const original = Buffer.from(permitted.replace(/\n/g, "\r\n"));
    await writeFile(join(input, "permitted.txt"), original);
    const result = await importSources(input, output, options);
    assert.deepEqual({ imported: result.imported, held: result.held, unchanged: result.unchanged }, { imported: 1, held: 0, unchanged: false });
    const source = parseDraft(await readFile(await onlyDraft(output), "utf8"));
    assert.equal(source.header.public.title, "  ಕನ್ನಡ  ");
    assert.deepEqual(source.header.public.tags, []);
    assert.deepEqual(source.header.public.classification, { composerIds: [], ankitaIds: [], deityIds: [], formIds: [], categoryIds: [], contextIds: [] });
    assert.deepEqual(source.header.provenance.rights, { license: "", attribution: "", evidenceUrls: [] });
    assert.deepEqual(source.header.review.sourceLatin, { readable: null, searchable: null, alignment: [] });
    assert.deepEqual(source.header.review.holdReasons, ["source-import-review"]);
    assert.equal(source.canonical.map(line => line.text).join("\n"), "  ಕನ್ನಡ  \n\nಕನ್ನಡ \n");
    assert.equal(source.sourceLatin, "Source Latin  \n\n");
    const ids = [source.header.lyricId, ...source.canonical.flatMap(line => "id" in line ? [line.id] : [])];
    assert.equal(ids.length, 3); assert.equal(new Set(ids).size, 3);
    assert.equal((await readFile(join(input, "permitted.txt"))).equals(original), true);
    const before = await tree(output);
    assert.equal((await importSources(input, output, options)).unchanged, true);
    assert.deepEqual(await tree(output), before);
    assert.deepEqual(await validateSources(output), { imported: 1, held: 0 });
  });
});
test("explicit UTF8/UTF16 BOM encodings preserve the same decoded source without fallback", async () => {
  await setup(async (_root, input, output) => {
    const little = Buffer.from(permitted, "utf16le"), big = Buffer.from(little).swap16();
    const originals = {
      "utf8.txt": Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(permitted)]),
      "le.txt": Buffer.concat([Buffer.from([255, 254]), little]),
      "be.txt": Buffer.concat([Buffer.from([254, 255]), big]),
    };
    for (const [name, bytes] of Object.entries(originals)) await writeFile(join(input, name), bytes);
    assert.equal((await importSources(input, output, options)).imported, 3);
    const encodings: string[] = [];
    for (const file of (await readdir(output)).filter(name => name.endsWith(".md"))) {
      const source = parseDraft(await readFile(join(output, file), "utf8"));
      encodings.push(source.header.provenance.encoding);
      assert.equal(source.sourceLatin, "Source Latin  \n\n");
    }
    assert.deepEqual(encodings.sort(), ["utf-16be", "utf-16le", "utf-8"]);
    for (const [name, bytes] of Object.entries(originals)) assert.equal((await readFile(join(input, name))).equals(bytes), true);
  });
});
test("no-Latin Kannada remains valid; unknown encodings, unsupported controls and section exceptions remain explicit held receipts", async () => {
  await setup(async (_root, input, output) => {
    await writeFile(join(input, "valid.txt"), "ಕನ್ನಡ\n\n");
    await writeFile(join(input, "encoding.txt"), Buffer.from([0xff, 0xff]));
    await writeFile(join(input, "utf32.txt"), Buffer.from([255, 254, 0, 0, 65, 0, 0, 0]));
    await writeFile(join(input, "malformed-utf16.txt"), Buffer.from([255, 254, 0, 216]));
    await writeFile(join(input, "no-kannada.txt"), "Source Latin");
    await writeFile(join(input, "layout.txt"), "ಕನ್ನಡ\nSource Latin\nಕನ್ನಡ");
    await writeFile(join(input, "controls.txt"), "ಕನ್ನಡ\u0000");
    const result = await importSources(input, output, options);
    assert.equal(result.imported, 1); assert.equal(result.held, 6);
    assert.deepEqual(result.exceptions.map(entry => entry.reason).sort(), [
      "initial-kannada-section-needs-review", "kannada-after-latin-boundary",
      "unsupported-control-character", "unsupported-encoding",
      "unsupported-or-malformed-encoding", "unsupported-or-malformed-encoding",
    ]);
    const parsed = parseDraft(await readFile(await onlyDraft(output), "utf8"));
    assert.equal(parsed.sourceLatin, undefined);
    assert.deepEqual(await validateSources(output), { imported: 1, held: 6 });
    assert.equal((await importSources(input, output, options)).unchanged, true);
  });
});
test("manual title corrections and explicit hold release are preserved; originals and existing destinations cannot be overwritten", async () => {
  await setup(async (root, input, output) => {
    await writeFile(join(input, "permitted.txt"), permitted);
    await importSources(input, output, options);
    const file = await onlyDraft(output), initial = await readFile(file, "utf8");
    const corrected = initial.replace(/^  title: .*$/m, "  title: Manually reviewed title")
      .replace("holdReasons:\n    - source-import-review", "holdReasons: []");
    assert.notEqual(corrected, initial);
    assert.ok(corrected.includes("holdReasons: []"));
    await writeFile(file, corrected);
    assert.equal((await importSources(input, output, options)).unchanged, true);
    assert.equal(await readFile(file, "utf8"), corrected);
    await writeFile(join(input, "permitted.txt"), permitted + "changed");
    const before = await tree(output);
    await assert.rejects(importSources(input, output, options), /Source set changed/);
    assert.deepEqual(await tree(output), before);
    const unrelated = join(root, "unrelated"); await mkdir(unrelated); await writeFile(join(unrelated, "keep.txt"), "retain");
    await assert.rejects(importSources(input, unrelated, options));
    assert.equal(await readFile(join(unrelated, "keep.txt"), "utf8"), "retain");
  });
});
test("literal backtick fences and layout spaces round-trip without interpreting markup or creating verse IDs", async () => {
  await setup(async (_root, input, output) => {
    await writeFile(join(input, "permitted.txt"), "ಕನ್ನಡ ```\n \t \nಕನ್ನಡ\nLatin ```` <b>literal</b>\n");
    assert.equal((await importSources(input, output, options)).imported, 1);
    const parsed = parseDraft(await readFile(await onlyDraft(output), "utf8"));
    assert.equal(parsed.canonical[1]?.text, " \t ");
    assert.equal(parsed.sourceLatin, "Latin ```` <b>literal</b>\n");
    assert.deepEqual(parsed.header.public.verses, []);
  });
});
test("duplicate line identities, extra fences, malformed headers and publishable unheld records fail closed", async () => {
  await setup(async (_root, input, output) => {
    await writeFile(join(input, "permitted.txt"), permitted);
    await importSources(input, output, options);
    const original = await readFile(await onlyDraft(output), "utf8");
    const lines = parseDraft(original).canonical.flatMap(line => "id" in line ? [line.id] : []);
    const first = lines[0], second = lines[1];
    assert.ok(first && second);
    assert.throws(() => parseDraft(original.replace(second, first)), /duplicated/);
    assert.throws(() => parseDraft(original + "\n```other\ntext\n```\n"), /fence/);
    assert.throws(() => parseDraft(original.replace("sourceFormat: 2", "sourceFormat: 3")), /header/);
    assert.throws(() => parseDraft(original.replace("holdReasons:\n    - source-import-review", "holdReasons: []")), /header/);
  });
});
test("empty, nested, oversized and contradictory source batches fail without a destination", async () => {
  await setup(async (_root, input, output) => {
    await assert.rejects(importSources(input, output, options), /no text files/);
    await writeFile(join(input, "permitted.txt"), permitted);
    await assert.rejects(importSources(input, join(input, "nested"), options), /non-nested/);
    await assert.rejects(importSources(input, output, { ...options, maxSourceFileBytes: 0 }), /safety/);
    await assert.rejects(importSources(input, output, { ...options, maxTotalSourceBytes: 1 }), /safety/);
    await assert.rejects(importSources(input, output, { ...options, maxSourceFileBytes: 1 }), /byte limit/);
    assert.equal((await readdir(join(input, ".."))).includes("drafts"), false);
  });
});
test("an existing import lock is never taken over or removed and no destination is committed", async () => {
  await setup(async (root, input, output) => {
    const lock = `${output}.import.lock`;
    await writeFile(join(input, "permitted.txt"), "ಕನ್ನಡ\n");
    await writeFile(lock, "another operation");
    await assert.rejects(importSources(input, output, options), { code: "EEXIST" });
    assert.equal(await readFile(lock, "utf8"), "another operation");
    assert.deepEqual((await readdir(root)).sort(), ["drafts.import.lock", "originals"]);
  });
});
test("future receipts and missing sources fail closed without reassigning identities or rewriting records", async () => {
  await setup(async (_root, input, output) => {
    await writeFile(join(input, "permitted.txt"), permitted); await importSources(input, output, options);
    const receiptFile = join(output, ".source-import.json"), original = await readFile(receiptFile, "utf8");
    const future: { formatVersion: number } = JSON.parse(original); future.formatVersion = 2;
    await writeFile(receiptFile, JSON.stringify(future));
    const before = await tree(output);
    await assert.rejects(importSources(input, output, options), /Invalid source-import receipt/);
    assert.deepEqual(await tree(output), before);
    await writeFile(receiptFile, original);
    const draftFile = await onlyDraft(output), valid = await readFile(draftFile);
    await writeFile(draftFile, Buffer.concat([valid, Buffer.from([255])]));
    await assert.rejects(importSources(input, output, options), { code: "ERR_ENCODING_INVALID_ENCODED_DATA" });
    await writeFile(draftFile, valid);
    const extra = join(output, "untracked.md");
    await writeFile(extra, "Unrelated content\n");
    await assert.rejects(importSources(input, output, options), /Draft files and receipt differ/);
    await rm(extra);
    await rm(await onlyDraft(output));
    const missing = await tree(output);
    await assert.rejects(importSources(input, output, options), /Draft files and receipt differ/);
    assert.deepEqual(await tree(output), missing);
  });
});
test("actual configured encoded-file and aggregate byte ceilings reject limit plus one before source changes", async () => {
  const value = strictYaml(await readFile(new URL("../settings/source-import.yml", import.meta.url), "utf8"));
  assert.ok(value && typeof value === "object" && "maxSourceFileBytes" in value && typeof value.maxSourceFileBytes === "number" &&
    "maxTotalSourceBytes" in value && typeof value.maxTotalSourceBytes === "number");
  const fileLimit = value.maxSourceFileBytes, totalLimit = value.maxTotalSourceBytes;
  await setup(async (_root, input, output) => {
    const actual = { ...options, maxSourceFileBytes: fileLimit, maxTotalSourceBytes: totalLimit };
    await writeFile(join(input, "boundary.txt"), Buffer.alloc(fileLimit, 255));
    const acceptedBoundary = await importSources(input, output, actual);
    assert.equal(acceptedBoundary.exceptions[0]?.reason, "unsupported-or-malformed-encoding");
    await rm(output, { recursive: true });
    await writeFile(join(input, "boundary.txt"), Buffer.alloc(fileLimit + 1, 255));
    await assert.rejects(importSources(input, output, actual), /byte limit/);
    await rm(join(input, "boundary.txt"));
    const chunk = Buffer.alloc(fileLimit, 255);
    for (let offset = 0; offset < totalLimit; offset += fileLimit) {
      await writeFile(join(input, `part-${offset}.txt`), chunk.subarray(0, Math.min(fileLimit, totalLimit - offset)));
    }
    assert.equal((await importSources(input, output, actual)).imported, 0);
    await rm(output, { recursive: true });
    await writeFile(join(input, "one-more.txt"), "x");
    await assert.rejects(importSources(input, output, actual), /total byte limit/);
  });
});
  test("explicit credit-footer adaptation preserves canonical/Latin/footer text without inferred metadata, including Kannada-only sources", async () => {
    await setup(async (_root, input, output) => {
      const raw = permitted + footer;
      await writeFile(join(input, "permitted.txt"), raw);
      await writeFile(join(input, "canonical-only.txt"), "ಕನ್ನಡ\n\n" + footer);
      const result = await importSources(input, output, { ...options, creditFooter });
      assert.equal(result.imported, 2); assert.equal(result.held, 0);
      for (const name of (await readdir(output)).filter(name => name.endsWith(".md"))) {
        const source = parseDraft(await readFile(join(output, name), "utf8"));
        assert.equal(source.header.provenance.description, footer);
        assert.deepEqual(source.header.public.classification?.composerIds, []);
        assert.deepEqual(source.header.review.holdReasons, ["source-import-review"]);
        if (source.header.provenance.sourceFile === "permitted.txt") {
          assert.equal(source.canonical.map(line => line.text).join("\n"), "  ಕನ್ನಡ  \n\nಕನ್ನಡ \n");
          assert.equal(source.sourceLatin, "Source Latin  \n");
        } else {
          assert.equal(source.canonical.map(line => line.text).join("\n"), "ಕನ್ನಡ\n");
          assert.equal(source.sourceLatin, undefined);
        }
      }
      assert.equal(await readFile(join(input, "permitted.txt"), "utf8"), raw);
    });
  });
  test("ambiguous post-credit lyrics, incomplete labels and unknown footer content remain held", async () => {
    await setup(async (_root, input, output) => {
      for (const [index, suffix] of [
        "ಸಾಹಿತ್ಯ : Synthetic\nUnknown: Synthetic\n",
        "ಸಾಹಿತ್ಯ : Synthetic\nKruti: Synthetic\nಕನ್ನಡ |೧|\n",
        "ಸಾಹಿತ್ಯ : Synthetic\nKruti: Synthetic\nUnlabelled prose\n",
        "ಸಾಹಿತ್ಯ : \nKruti: Synthetic\n",
        footer + "ಸಾಹಿತ್ಯ : Another\nKruti: Another\n",
      ].entries()) await writeFile(join(input, `${index}.txt`), permitted + suffix);
      const result = await importSources(input, output, { ...options, creditFooter });
      assert.equal(result.imported, 0); assert.equal(result.held, 5);
      assert.ok(result.exceptions.every(entry => entry.reason === "kannada-after-latin-boundary"));
    });
  });
  test("explicit retry converts only unchanged eligible held records and preserves all existing bytes, identities and decisions", async t => {
    await setup(async (root, input, output) => {
      await writeFile(join(input, "existing.txt"), permitted);
      await writeFile(join(input, "footer.txt"), permitted + footer);
      await writeFile(join(input, "ambiguous.txt"), permitted + footer + "ಕನ್ನಡ |೧|\n");
      await writeFile(join(input, "encoding.txt"), Buffer.from([255]));
      assert.equal((await importSources(input, output, options)).held, 3);
      const file = await onlyDraft(output), corrected = (await readFile(file, "utf8"))
        .replace(/^  title: .*$/m, "  title: Corrected title")
        .replace("holdReasons:\n    - source-import-review", "holdReasons: []");
      await writeFile(file, corrected);
      const originals = await tree(input);
      assert.equal((await importSources(input, output, { ...options, creditFooter })).unchanged, true);
      const result = await retryCreditFooters(input, output, { ...options, creditFooter });
      assert.deepEqual({ imported: result.imported, held: result.held, unchanged: result.unchanged }, { imported: 2, held: 2, unchanged: false });
      assert.equal(await readFile(file, "utf8"), corrected);
      assert.deepEqual(await validateSources(output), { imported: 2, held: 2 });
      assert.deepEqual(await tree(input), originals);
      const before = await tree(output);
      const times = Object.fromEntries(await Promise.all((await readdir(output)).map(async name => [name, (await stat(join(output, name))).mtimeMs])));
      const noStaging = t.mock.method(fs, "mkdir", async () => { throw new Error("Unchanged retry must not create staging"); });
      syncBuiltinESMExports();
      try { assert.equal((await retryCreditFooters(input, output, { ...options, creditFooter })).unchanged, true); }
      finally { noStaging.mock.restore(); syncBuiltinESMExports(); }
      assert.deepEqual(await tree(output), before);
      for (const [name, timestamp] of Object.entries(times)) assert.equal((await stat(join(output, name))).mtimeMs, timestamp);
      assert.deepEqual((await readdir(root)).sort(), ["drafts", "originals"]);
      await writeFile(join(input, "footer.txt"), permitted + footer + "changed");
      await assert.rejects(retryCreditFooters(input, output, { ...options, creditFooter }), /Source set changed/);
      assert.deepEqual(await tree(output), before);
      await assert.rejects(retryCreditFooters(input, output, options), /explicitly enabled/);
    });
  });
  test("footer retry activation failure restores previous sources; failed rollback preserves backup and recovery lock", async t => {
    for (const failRollback of [false, true]) await setup(async (root, input, output) => {
      await writeFile(join(input, "existing.txt"), permitted);
      await writeFile(join(input, "footer.txt"), permitted + footer);
      await importSources(input, output, options);
      const before = await tree(output), originalRename = fs.rename;
      const injected = t.mock.method(fs, "rename", async (from: PathLike, to: PathLike) => {
        if (String(from).startsWith(`${output}.import-`) || (failRollback && String(from).startsWith(`${output}.previous-`))) {
          throw new Error("Injected activation failure");
        }
        return originalRename(from, to);
      });
      syncBuiltinESMExports();
      try {
        await assert.rejects(retryCreditFooters(input, output, { ...options, creditFooter }),
          failRollback ? /Activation and rollback failed/ : /Injected activation failure/);
      } finally { injected.mock.restore(); syncBuiltinESMExports(); }
      if (!failRollback) {
        assert.deepEqual(await tree(output), before);
        assert.deepEqual((await readdir(root)).sort(), ["drafts", "originals"]);
      } else {
        const names = await readdir(root), backup = names.find(name => name.startsWith("drafts.previous-"));
        assert.ok(backup);
        assert.deepEqual(await tree(join(root, backup)), before);
        assert.ok(names.includes("drafts.import.lock"));
        await assert.rejects(validateSources(output), /active or interrupted/);
        await assert.rejects(retryCreditFooters(input, output, { ...options, creditFooter }), { code: "EEXIST" });
      }
    });
  });
