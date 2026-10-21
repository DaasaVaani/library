import test from "node:test";
import assert from "node:assert/strict";
import { stringify } from "yaml";
import { completeSourceHeader, parseLyricSource, type DraftHeader } from "./lyric-source.js";

const lyric = "10000000-0000-4000-8000-000000000001";
const first = "10000000-0000-4000-8000-000000000002";
const second = "10000000-0000-4000-8000-000000000003";
const verse = "10000000-0000-4000-8000-000000000004";
function source(edit: (header: DraftHeader) => void = () => {}) {
  const header = completeSourceHeader({
    sourceFormat: 2, lyricId: lyric, public: { title: "Synthetic", tags: [] },
    provenance: { kind: "owner-supplied", sourceFile: "synthetic.txt", sha256: "a".repeat(64), encoding: "utf-8" },
    review: { holdReasons: [] },
  });
  edit(header);
  return `---\n${stringify(header)}---\n\n\`\`\`kannada\n[${first}] ಕನ್ನಡ\n[${second}] ಅಕ್ಷರ\n\`\`\`\n\n\`\`\`source-latin\na😀b\n\`\`\`\n`;
}
test("authoring completion preserves known metadata and independently allocates empty collections without inventing facts", () => {
  const parsed = parseLyricSource(source());
  assert.deepEqual(completeSourceHeader(parsed.header), parsed.header);
  const another = parseLyricSource(source());
  parsed.header.public.youtube?.push({ videoId: "00000000000", url: "" });
  assert.deepEqual(another.header.public.youtube, []);
  assert.equal(another.header.provenance.rights?.license, "");
});
test("declared verse UUIDs and endsAt references must be independent, ordered and cover canonical lines", () => {
  assert.doesNotThrow(() => parseLyricSource(source(header => { header.public.verses = [{ id: verse, endsAt: second }]; })));
  for (const verses of [
    [{ id: first, endsAt: second }], [{ id: verse, endsAt: lyric }], [{ id: verse, endsAt: first }],
    [{ id: verse, endsAt: second }, { id: lyric, endsAt: first }],
  ]) assert.throws(() => parseLyricSource(source(header => { header.public.verses = verses; })), /verse/i);
});
test("media provenance requires real associations, exact provider IDs, safe URLs and actual calendar dates", () => {
  const video = { videoId: "00000000000", url: "https://youtu.be/00000000000" };
  const evidence = { videoId: video.videoId, originalTitle: "", channelId: "", channelName: "", uploadedOn: "", description: "" };
  assert.doesNotThrow(() => parseLyricSource(source(header => {
    header.public.youtube = [video]; header.provenance.videos = [{ ...evidence, uploadedOn: "2024-02-29" }];
  })));
  for (const url of ["https://youtu.be/11111111111", "https://example.test/watch?v=00000000000",
    "https://user:password@youtu.be/00000000000", "https://youtube.com/watch?v=00000000000&v=11111111111"]) {
    assert.throws(() => parseLyricSource(source(header => { header.public.youtube = [{ ...video, url }]; })));
  }
  assert.throws(() => parseLyricSource(source(header => { header.public.youtube = [video, { ...video }]; })), /Duplicate/);
  assert.throws(() => parseLyricSource(source(header => { header.provenance.videos = [evidence]; })), /Unassociated/);
  assert.throws(() => parseLyricSource(source(header => {
    header.public.youtube = [video]; header.provenance.videos = [{ ...evidence, uploadedOn: "2023-02-29" }];
  })), /calendar date/);
  assert.throws(() => parseLyricSource(source(header => { header.provenance.sourceUrls = ["https://user:password@example.test"]; })), /credential-free/);
  assert.throws(() => parseLyricSource(source(header => {
    header.provenance.images = [{ asset: "assets/synthetic.webp", sourceUrl: "", creator: "", license: "", attribution: "" }];
  })), /Unassociated/);
});
test("Source Latin review uses exact Unicode code-point ranges and complete mappings only after separate assessment", () => {
  assert.doesNotThrow(() => parseLyricSource(source(header => {
    header.review.sourceLatin = { readable: true, searchable: true,
      alignment: [{ lineId: first, ranges: [[0, 2]] }, { lineId: second, ranges: [[2, 3]] }] };
  })));
  const invalid: NonNullable<DraftHeader["review"]["sourceLatin"]>["alignment"][] = [
    [{ lineId: first, ranges: [[0, 4]] }],
    [{ lineId: first, ranges: [[1, 1]] }],
    [{ lineId: first, ranges: [[0, 2]] }, { lineId: second, ranges: [[1, 3]] }],
    [{ lineId: lyric, ranges: [[0, 2]] }],
    [{ lineId: second, ranges: [[0, 1]] }, { lineId: first, ranges: [[1, 3]] }],
  ];
  for (const alignment of invalid) assert.throws(() => parseLyricSource(source(header => {
    header.review.sourceLatin = { readable: null, searchable: null, alignment };
  })), /range|mapping/);
  assert.throws(() => parseLyricSource(source(header => {
    header.review.sourceLatin = { readable: null, searchable: true, alignment: [] };
  })), /readable/);
  assert.throws(() => parseLyricSource(source(header => {
    header.review.sourceLatin = { readable: true, searchable: true, alignment: [] };
  })), /complete/);
});
test("escaped YAML metadata controls cannot bypass literal-source Unicode validation", () => {
  assert.throws(() => parseLyricSource(source(header => { header.provenance.description = "\u0000"; })), /controls/);
});
