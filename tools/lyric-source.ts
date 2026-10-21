import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
import type { LyricSourceHeader } from "../shared/types/lyrics.js";

export type DraftHeader = LyricSourceHeader;
export type SourceEncoding = "utf-8" | "utf-16le" | "utf-16be";
export interface DraftSource {
  header: DraftHeader;
  canonical: ({ id: string; text: string } | { text: string })[];
  sourceLatin?: string;
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const schema = JSON.parse(await readFile(new URL("../shared/schemas/lyric-source-draft.schema.json", import.meta.url), "utf8"));
const sourceSchema = JSON.parse(await readFile(new URL("../shared/schemas/lyric-source.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020.default({ strict: true }).addSchema(sourceSchema, "lyric-source.schema.json");
const validateHeader = ajv.compile<DraftHeader>(sourceSchema);
const validateDraft = ajv.compile<DraftHeader>(schema);
const parser = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]);
export function parseLyricSource(text: string, requireHold = false): DraftSource {
  if (!text.isWellFormed() || /\r(?!\n)|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u.test(text)) {
    throw new Error("Draft contains unsupported controls or malformed Unicode");
  }
  const normalized = text.replace(/\r\n/g, "\n");
  const tree = parser.parse(normalized);
  const [frontmatter, canonical, latin] = tree.children;
  if (tree.children.length < 2 || tree.children.length > 3 || frontmatter?.type !== "yaml" ||
      canonical?.type !== "code" || canonical.lang !== "kannada" || canonical.meta ||
      (latin && (latin.type !== "code" || latin.lang !== "source-latin" || latin.meta))) {
    throw new Error("Draft requires grouped frontmatter, one Kannada fence and optional literal source-latin fence only");
  }
  const header: unknown = strictYaml(frontmatter.value);
  const validate = requireHold ? validateDraft : validateHeader;
  if (!validate(header)) throw new Error("Invalid draft header: " + JSON.stringify(validate.errors));
  const seen = new Set<string>([header.lyricId]);
  let lyricLines = 0;
  const lines = canonical.value.split("\n").map(line => {
    if (/^[ \t]*$/u.test(line)) return { text: line };
    const match = /^\[([^\]]+)\] (.*)$/u.exec(line);
    if (!match?.[1] || match[2] === undefined || !uuidPattern.test(match[1]) ||
        seen.has(match[1]) || /^[ \t]*$/u.test(match[2])) throw new Error("Invalid, duplicated or layout-only canonical line identity");
    seen.add(match[1]); lyricLines++;
    return { id: match[1], text: match[2] };
  });
  if (!lyricLines || !lines.some(line => /\p{Script=Kannada}/u.test(line.text))) throw new Error("Draft has no canonical Kannada lyric lines");
  return { header, canonical: lines, ...(latin?.type === "code" ? { sourceLatin: latin.value } : {}) };
}
export const parseDraft = (text: string) => parseLyricSource(text, true);
