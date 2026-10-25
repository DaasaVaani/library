import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import type { LyricItem } from "../shared/types/lyrics.js";
import type { LogicalItem } from "./publication-ledger.js";
import { canonical } from "./publisher.js";

const schema = JSON.parse(await readFile(new URL("../shared/schemas/lyric-publication.schema.json", import.meta.url), "utf8"));
const validateItem = new Ajv2020.default({ strict: true }).compile<LyricItem>({ ...schema, $ref: "#/$defs/item" });

export function assertCanonicalLyricItem(value: unknown): asserts value is LyricItem {
  if (!validateItem(value)) throw new Error("Invalid canonical prelaunch logical item");
  const seen = new Set<string>();
  for (const line of value.lines) {
    if (line.kind === "line") {
      if (seen.has(line.lineId) || /^[ \t]*$/.test(line.text)) throw new Error("Invalid or duplicate canonical logical line identity");
      seen.add(line.lineId);
    }
  }
  if (!seen.size) throw new Error("Canonical logical item requires a lyric line");
}

export function canonicalLyricLogicalItem(value: unknown): LogicalItem {
  assertCanonicalLyricItem(value);
  const logical = {
    lyricId: value.lyricId, canonicalScript: value.canonicalScript, title: value.title,
    tags: value.tags, lines: value.lines
  };
  return {
    lyricId: value.lyricId,
    logicalSha256: createHash("sha256").update(canonical(logical), "utf8").digest("hex")
  };
}
