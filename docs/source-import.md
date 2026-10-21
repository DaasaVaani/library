# Owner-supplied source draft import

## Scope and current authorization

Local draft conversion of owner-supplied text is authorized. Preserve every
original in `text_files_from_source/`; never edit, rename or delete an input.
Create separate flat `library/<lyricId>.md` drafts and one global receipt
`library/.source-import.json`. These are authoring sources, not generated lyric
variants, public artifacts or permission to publish/merge source changes.

The owner approved the first Kannada lyric line as the public title and will
correct titles manually. The initial Kannada section is canonical; following
Latin is literal supplied Source Latin. Hold exceptions, never guess another
script boundary or infer verse divisions, authorship, classification or media.
The [portable identity contract](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md)
and pinned draft-header schema own the stable identity/header rules.

No YouTube API, video ID, image, channel/upload metadata or generated
transliteration is needed for this draft workflow. First provider API ingestion
remains blocked. Production source/publication schemas, reviewed language rules,
ledger/hosting and consumer identity adapters remain incomplete.

## Commands

From Library:

```powershell
npm run sources:import
npm run sources:validate
npm run check
```

`sources:import` requires the actual input directory. It reports imported draft
and held-exception counts with safe source basenames/reasons, never lyric payloads.
Every created draft retains a nonempty review hold. Exit0 means no extraction
exceptions, not reviewed/publication-ready lyrics. Exit2 means drafts were
prepared but the receipt records explicit exceptions needing review; do not
describe it as a complete successful conversion. Exit1 is an operational/
validation failure. Read failures and unexpected errors are not silently skipped.

`sources:validate` validates every imported draft against the receipt, header,
body grammar, cross-source identities and exact source inventory. Before the
first import an absent draft directory is reported explicitly as no records
validated; unit tests still exercise the parser/importer. Full `npm run check`
includes typecheck, all publisher/import tests and this source validation.
Raw input files are local-only material, ignored by Git and never committed or
uploaded. Only separately reviewed draft Markdown and its batch receipt may enter
the source review workflow.

## Exact conversion and preservation

- Accept strict UTF8 (optional BOM), or UTF16LE/BE only with their explicit BOM.
  Reject unknown/malformed encodings; do not guess Windows code pages or replace
  undecodable bytes. Preserve original byte SHA256/encoding in provenance.
- Parse LF/CRLF to the approved LF source representation. Hold bare CR,
  unsupported controls/line separators and malformed Unicode; never silently
  strip them. Spaces, tabs inside literal text, blank/layout lines and spelling
  remain unchanged.
- First nonblank line must contain Kannada. The first subsequent Latin-only
  line begins Source Latin. Kannada appearing after that boundary is held for
  review. A Kannada-only file is valid; a file without an initial Kannada section
  is held. These are the owner's approved conservative section rules, not a
  linguistic extraction or transliteration algorithm.
- Allocate random cryptographic UUIDv4 lyric and nonblank line IDs once.
  Whitespace-only layout lines receive no UUID; no verse IDs are invented.
  File basename is lyric UUID only. Optional `source-latin` fence contains the
  supplied text without generated variants or claimed alignment/eligibility.
- Output exactly grouped YAML frontmatter, one `kannada` fence and optional
  `source-latin` fence. Each nonblank canonical line is `[line-UUID] ` plus its
  original literal text. Select sufficiently long fences to preserve backticks
  literally. Parse the result and compare decoded text/layout before committing.
- Provenance contains only owner-supplied kind, actual input basename, raw hash
  and explicit encoding. No owner identity, license, attribution or URL is
  manufactured. Review/rights obligations remain separate from schema validity.

## Idempotency, concurrency and failure

The first batch prepares a uniquely named sibling staging directory under a
cooperative exclusive import lock. It validates all drafts/receipt and rechecks
all original hashes before one directory rename makes the new draft set visible.
It never replaces an existing source tree. Failures clean only that run's owned
staging directory; inputs and unrelated destinations remain intact.

An identical rerun validates the existing receipt/drafts and returns unchanged.
It never reallocates IDs or overwrites manual title/text corrections. Changed,
added or removed input files require a separately reviewed incremental import;
this initial-batch tool refuses rather than guessing identity correspondence.
Malformed/future receipts, missing drafts and conflicting provenance fail closed.
Concurrent initial imports require the lock; no forced lock takeover exists.

After an interrupted process, inspect the exact owned `.import.lock` and
UUID-named staging sibling before operator recovery. Do not delete an existing
source directory, broadly clean the workspace or guess whether an unfinished
batch committed. If `library/` already has a valid receipt, unchanged rerun
validation is non-writing. This is an authoring workflow, not the production
offline journal/atomic activation protocol.

## Settings and validation

Requirement coverage: DATA-02 authoring structure, DATA-03 literal layout,
DATA-04 actual owner-supplied provenance/optional media, and DATA-08 once-assigned
lyric/line identities. Mandatory holds support DATA-07 but do not prove production
publication exclusion. Production rights fields, verse review, public schemas,
consumer reference preservation and release conformance remain owning gates.

`settings/source-import.yml` and its strict schema own input/output relative
directories, per-file/aggregate encoded-byte limits and the draft review-hold
label. Paths resolve from Library; source and destination cannot be equal/nested.
Limits apply before conversion and are checked again against actual reads.
Settings changes need compatibility review; personal preferences stay separate.

Tests cover literal text/layout, known BOM encodings, unknown/ambiguous sources,
title correction/idempotency, independent UUIDs, strict headers/fences/duplicates,
no-overwrite failures and actual configured byte ceilings/+1. Full checks and
source PR review remain required. Real source PRs contain canonical/supplied
source only, never generated variants/previews, and are never pushed directly
to main by this importer.

Only `library/*.md` is exempt from generic prose whitespace/link interpretation:
literal lyric spaces/tabs and markup-looking text must survive. Git attributes
scope whitespace exemption to those source files; UTF8/final newline checks and
the strict receipt/header/body/identity validator remain mandatory. All other
documentation, code and workflow hygiene rules remain unchanged.
