import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "yaml";
import { completeSourceHeader, parseLyricSource, type DraftHeader } from "./lyric-source.js";
import { candidateId, loadSnapshots, propose, runReview, summary, validateReview, type Snapshot } from "./verse-proposals.js";

const lyric = "10000000-0000-4000-8000-000000000001";
const first = "10000000-0000-4000-8000-000000000002";
const second = "10000000-0000-4000-8000-000000000003";
const third = "10000000-0000-4000-8000-000000000004";
const fourth = "10000000-0000-4000-8000-000000000005";
const protectedId = "10000000-0000-4000-8000-000000000006";
const reviewedVerse = "10000000-0000-4000-8000-000000000007";
const options = { maxSourceFileBytes: 4096, maxTotalSourceBytes: 8192, excludedLyricIds: [protectedId] };
const body = ` \t\n[${first}] ಕನ್ನಡ  \n[${second}] ಅಕ್ಷರ\n \t\n\n[${third}] ಕನ್ನಡ\n[${fourth}] ಅಕ್ಷರ\n\n`;
function source(canonical = body, edit: (header: DraftHeader) => void = () => {}) {
  const header = completeSourceHeader({
    sourceFormat: 2, lyricId: lyric, public: { title: "Synthetic", tags: [] },
    provenance: { kind: "owner-supplied", sourceFile: "synthetic.txt", sha256: "a".repeat(64), encoding: "utf-8" },
    review: { holdReasons: [] },
  });
  edit(header);
  return `---\n${stringify(header)}---\n\n\`\`\`kannada\n${canonical}\`\`\`\n\n\`\`\`source-latin\nliteral supplied evidence\n\`\`\`\n`;
}
function snapshot(text = source()): Snapshot {
  const parsed = parseLyricSource(text);
  return { lyricId: parsed.header.lyricId, sourceSha256: createHash("sha256").update(text).digest("hex"), source: parsed };
}
async function fixture(run: (directory: string, output: string) => Promise<void>) {
  const root = join(process.cwd(), ".cache", `verse-tests-${randomUUID()}`);
  const directory = join(root, "library"), output = join(root, "reviews", "proposals.json");
  await mkdir(directory, { recursive: true });
  try { await run(directory, output); }
  finally { await rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 }); }
}
test("blank layout proposes only structural ends with complete UUID references, without copying lyric or provenance text", () => {
  const sources = [snapshot()], before = JSON.stringify(sources);
  const review = propose(sources);
  assert.deepEqual(review.proposals[0]?.verses, [
    { id: candidateId(lyric, second), endsAt: second, evidence: "blank-separator" },
    { id: candidateId(lyric, fourth), endsAt: fourth, evidence: "end-of-source" },
  ]);
  validateReview(review, sources);
  assert.equal(JSON.stringify(sources), before);
  for (const literal of ["ಕನ್ನಡ", "ಅಕ್ಷರ", "synthetic.txt", "literal supplied evidence", "Synthetic"]) {
    assert.equal(JSON.stringify(review).includes(literal), false);
  }
  assert.deepEqual(summary(review), { proposedSources: 1, provisionalUncertainVerses: 2, blankSeparatorEnds: 1,
    sourceEndClosures: 1, ownerEditedEnds: 0, singleSpanUncertainSources: 0 });
});
test("no structural break gives one uncertain span; numbers, pipes and repetition are not approved markers", () => {
  const s = snapshot(source(`[${first}] ಕನ್ನಡ || 1 ||\n[${second}] ಕನ್ನಡ || 2 ||\n`));
  const review = propose([s]);
  assert.equal(review.proposals[0]?.verses.length, 1);
  assert.equal(summary(review).singleSpanUncertainSources, 1);
  validateReview(review, [s]);
});
test("held and reviewed sources are never given proposals or modified", () => {
  for (const edit of [
    (header: DraftHeader) => { header.review.holdReasons = ["review-needed"]; },
    (header: DraftHeader) => { header.public.verses = [{ id: reviewedVerse, endsAt: fourth }]; },
  ]) {
    const s = snapshot(source(body, edit)), before = JSON.stringify(s);
    assert.equal(propose([s]).proposals.length, 0);
    validateReview(propose([s]), [s]);
    assert.equal(JSON.stringify(s), before);
  }
});
test("clean generation is deterministic and endpoint IDs survive unrelated boundary changes", () => {
  assert.equal(JSON.stringify(propose([snapshot()])), JSON.stringify(propose([snapshot()])));
  const changed = snapshot(source(body.replace(`[${third}]`, `\n[${third}]`)));
  assert.equal(propose([changed]).proposals[0]?.verses[0]?.id, candidateId(lyric, second));
  assert.notEqual(candidateId(lyric, first), candidateId(lyric, second));
  const anotherLyric = snapshot(source(body, header => { header.lyricId = protectedId; }));
  assert.deepEqual(propose([anotherLyric, snapshot()]), propose([snapshot(), anotherLyric]));
});
test("manual splits/merges retain existing candidate IDs; validation accepts no fabricated approval", () => {
  const sources = [snapshot()], review = propose(sources);
  const verses = review.proposals[0]!.verses, id = verses[0]!.id;
  verses[0]!.endsAt = first; verses[0]!.evidence = "owner-edit";
  validateReview(review, sources);
  assert.equal(verses[0]!.id, id);
  verses.splice(0, 1);
  validateReview(review, sources);
  (review.proposals[0] as { status: string }).status = "approved";
  assert.throws(() => validateReview(review, sources), /non-provisional/);
});
test("strict validation rejects stale snapshots, unsupported evidence, collisions, gaps and incorrect inventory", () => {
  const sources = [snapshot()];
  const edits: ((review: ReturnType<typeof propose>) => void)[] = [
    r => { r.proposals[0]!.sourceSha256 = "b".repeat(64); },
    r => { r.proposals[0]!.verses[0]!.endsAt = first; },
    r => { r.proposals[0]!.verses[0]!.id = lyric; },
    r => { r.proposals[0]!.verses[0]!.id = first; },
    r => { r.proposals[0]!.verses[0]!.endsAt = protectedId; },
    r => { r.proposals[0]!.verses[1]!.id = r.proposals[0]!.verses[0]!.id; },
    r => { r.proposals[0]!.verses.reverse(); },
    r => { r.proposals[0]!.verses.pop(); },
    r => { r.proposals.push(r.proposals[0]!); },
    r => { r.proposals = []; },
    r => { Object.assign(r.proposals[0]!, { approved: true }); },
    r => { Object.assign(r.proposals[0]!.verses[0]!, { text: "not allowed" }); },
  ];
  for (const edit of edits) {
    const review = propose(sources); edit(review);
    assert.throws(() => validateReview(review, sources));
  }
  assert.throws(() => validateReview({ formatVersion: 2 }, sources), /format/);
  assert.throws(() => validateReview(propose(sources), [snapshot(source(body, h => { h.public.title = "Corrected"; }))]), /stale/);
  const duplicateSources = [...sources, sources[0]!];
  assert.throws(() => validateReview(propose(duplicateSources), duplicateSources), /Duplicate source/);
});
test("persisted proposals are idempotent and preserve owner edits and all canonical bytes; excluded files are not read", async () => {
  await fixture(async (directory, output) => {
    const path = join(directory, `${lyric}.md`), text = source();
    await writeFile(path, text);
    await writeFile(join(directory, `${protectedId}.md`), "must not parse or reinterpret this protected input");
    await assert.rejects(runReview(directory, output, options, false), /Missing persisted/);
    assert.equal((await runReview(directory, output, options, true)).unchanged, false);
    const original = await readFile(output), time = (await stat(output)).mtimeMs;
    assert.equal((await runReview(directory, output, options, true)).unchanged, true);
    assert.deepEqual(await readFile(output), original);
    assert.equal((await stat(output)).mtimeMs, time);
    const review = JSON.parse(original.toString()) as ReturnType<typeof propose>;
    review.proposals[0]!.verses[0]!.endsAt = first;
    review.proposals[0]!.verses[0]!.evidence = "owner-edit";
    const edited = JSON.stringify(review, null, 2) + "\n";
    await writeFile(output, edited);
    assert.equal((await runReview(directory, output, options, true)).ownerEditedEnds, 1);
    assert.equal(await readFile(output, "utf8"), edited);
    assert.equal(await readFile(path, "utf8"), text);
    assert.deepEqual((await readdir(join(output, ".."))).sort(), ["proposals.json"]);
    await writeFile(path, source(body, h => { h.public.title = "Correction"; }));
    await assert.rejects(runReview(directory, output, options, true), /stale/);
    assert.equal(await readFile(output, "utf8"), edited);
  });
});
test("invalid existing review, active locks and source limits fail closed without overwriting files", async () => {
  await fixture(async (directory, output) => {
    await writeFile(join(directory, `${lyric}.md`), source());
    await assert.rejects(loadSnapshots(directory, { ...options, maxSourceFileBytes: 1 }), /size/);
    await assert.rejects(loadSnapshots(directory, { ...options, maxTotalSourceBytes: 1 }), /total byte/);
    await writeFile(`${directory}.import.lock`, "");
    await assert.rejects(loadSnapshots(directory, options), /import active/);
    await rm(`${directory}.import.lock`);
    await mkdir(join(output, ".."), { recursive: true });
    await writeFile(`${output}.lock`, "");
    await assert.rejects(runReview(directory, output, options, true), /writer active/);
    await rm(`${output}.lock`);
    await writeFile(output, "{bad");
    await assert.rejects(runReview(directory, output, options, true), SyntaxError);
    assert.equal(await readFile(output, "utf8"), "{bad");
  });
});
