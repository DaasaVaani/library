# Owner-authorized prelaunch lyric publication

## Authority and limits

The owner has reviewed and approved the prepared owner-supplied text and permits
prelaunch publication. This releases only the
`source-import-review` hold on explicitly authorized prepared records. Preserve
all other holds and extraction exceptions; never interpret this as a blanket
approval of future sources, rights metadata, linguistic correctness or launch.
Original text files remain local-only, ignored and never committed.

Use [the Shared source/public contract](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md#2-publication-eligibility-and-provenance).
`sourceFormat: 2` permits an empty hold list after explicit authorization.
New imports still use the stricter draft header and nonempty holds. Source
corrections/title edits and later media retain lyric/line UUIDs. Supplied Latin
stays literal source evidence, not generated or certified reading text.

Source changes go through normal PRs. Full tests/validation on a source PR use
synthetic publication tests plus source validation, never actual generated real
variants/previews. Actual canonical artifact generation is post-merge only.
Owner text review does not waive remaining implementation/release gates or
separate Source Latin eligibility/alignment assessment.

## Commands and settings

From a validated merged Library checkout:

```powershell
npm run check
npm run publish:lyrics
```

`settings/lyric-publication.yml` and its strict schema own source/output
directories, source byte limits and fixed prelaunch capability/stage.
Shared publication-policy settings own descriptor/item/manifest byte bounds.
Paths cannot nest/overwrite sources; defaults are explicit settings, not hidden
CLI fallbacks. The command accepts no path overrides.

Publication excludes every nonempty hold. Bad source/header/identity/receipt is a
validation error even on a held record; no malformed file is silently skipped.
Output reports published records, held source records and extraction exceptions
separately. No unheld records is an explicit failure, not an empty successful feed.

## Public allowlist and integrity

Output is independent of `fixture-catalog-v1`:

- `latest.json`: versioned `daasavaani-lyrics` descriptor with encoded manifest
  SHA256/path/sizes.
- `objects/<sha256>.json.gz`: deterministic canonical-JSON manifest/items.
  Manifest declares `prelaunch`, `lyric-preview-v1` and exact title/tag/item lookup
  by permanent lyric UUID.
- Items contain only format/version, lyric UUID, canonical script `kn`,
  title/tags, stable line UUID/text records and literal UUID-free layout.

Never emit source basename/hash/encoding, private evidence, unreviewed supplied
Latin, generated variants, invented verses, images/videos or fake video IDs.
Missing media does not block canonical reading. Source/public/index/date/media
and lifecycle families beyond this preview still need their owning production
schemas and acceptance evidence. No persistent offline/search/personal migration
support is implied by this feed.

All approved source metadata fields are exposed for later completion using
[the Shared inventory](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md#author-editable-fields).
Empty optional fields do not change public object bytes or identities. Source-only
rights/provenance remains excluded. Populated classification, context, verse,
media or positively eligible Source Latin requires its owning public adapter;
this canonical-only publisher fails explicitly rather than silently dropping it.
Registry resolution, asset existence/rights and public metadata consumers are
not implemented by accepting empty authoring fields.
The [provisional verse review ledger](verse-proposals.md) is source-only tooling
outside `library/`; this publisher does not consume it. Candidate generation or
owner edits never approve public verse metadata or bypass this adapter gate.

All source/role/descriptor limits and schemas validate before activation.
Content-addressed objects are written without replacing existing bytes; damaged
existing objects fail explicitly. One exclusive publication lock prevents
cooperative concurrent writers. The pointer activates via same-directory rename
only after all writes. Identical output preserves pointer bytes/write time.
Errors leave the previous pointer unchanged; this does not repair externally
corrupted existing objects or implement the production journal/ledger protocol.
After an interrupted local process, inspect the exact lock/pending files before
manual recovery; never broadly delete output/source trees or force lock takeover.

## Deployment and review gate

The post-merge `Publish prelaunch lyrics` workflow runs only after successful
main Repository hygiene from this repository, checks out that exact SHA, reruns
full checks, generates and uploads only generated `dist/site` data to Library
GitHub Pages. It refuses a superseded main before deployment. Failure does not
deploy a partial artifact. No PR variant generation, main-writing publisher bot,
secret signing key or provider API is involved.

The feed is separate from Website root at
`https://daasavaani.github.io/library/lyrics/latest.json`. Consumers fetch public
artifacts, never source Markdown. Fetch/decode/schema/hash/size/capability and
item-summary checks remain mandatory. A successful deployment needs actual live
HTTPS validation, not merely a push or workflow preflight.

This is a publicly accessible **prelaunch preview**, not the public product launch.
Owner review of prepared text is complete. Production ledger/receipts,
semantic dates, transliteration, ZIP/planner, persistent offline lifecycle,
complete reference migration/native parity, signing/platform and release gates
remain open. API ingestion remains independently blocked.
