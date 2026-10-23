# Owner-supplied source draft import

## Scope and current authorization

Local draft conversion of owner-supplied text is authorized. Preserve every
original in `text_files_from_source/`; never edit, rename or delete an input.
Create separate flat `library/<lyricId>.md` drafts and one global receipt
`library/.source-import.json`. These are authoring sources, not generated lyric
variants, public artifacts or permission to publish/merge source changes.

The owner approved the first Kannada lyric line as the public title and will
correct titles manually. The initial Kannada section is canonical; following
Latin is literal supplied Source Latin. An explicitly approved structured credit
footer may be preserved verbatim in source-only provenance. Hold other ambiguous
boundaries; never infer verse divisions, authorship, classification or media.
The separately owner-authorized [verse proposal tool](verse-proposals.md) may
suggest uncertain boundaries outside source Markdown; it does not change this
importer's conservative behavior or supply reviewed public verse declarations.
Separately authorized [prelaunch publication](lyric-publication.md) may release
the import-review hold of prepared sources through review PRs. That does not
waive this importer's hold-on-creation rule. Kannada review alone does not assess
Source Latin eligibility/alignment.
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
npm run sources:retry-footers
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

`sources:retry-footers` is the separately authorized, narrow retry for unchanged
receipt entries held specifically for returning Kannada. It applies the reviewed
footer grammar below, preserves all already-imported Markdown bytes and IDs, and
retains every other exception. It never adds/removes/changes raw inputs or retries
encoding/control problems. A normal `sources:import` rerun remains non-writing;
enabling footer support does not silently reinterpret existing receipt entries.

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
- First nonblank line must contain Kannada. Excluding a recognized terminal
  credit block, the first Latin-only line begins Source Latin. Returning Kannada
  elsewhere remains held. Kannada-only lyrics are valid, including those with
  a credit block but no supplied Latin lyrics. No initial Kannada section is held.
- Footer recognition is enabled only by the owned settings. Require exactly one
  nonempty primary label followed by a nonempty companion label on the next
  nonblank line, each with `:`. Settings declare the actual Kannada/Latin labels.
  Following nonblank lines must be explicitly configured additional labels,
  comma-separated metadata with at least three nonempty components and no pipe,
  or literal numeric dotted ranges separated by a hyphen. Unknown prose, trailing
  verse text, repeated primary labels and incomplete markers remain ambiguous.
  This narrow adapter is a source-format rule, not linguistic inference.
- Preserve the entire recognized block, including spelling/spacing/layout, in
  `provenance.description`. Reconstruct normalized input exactly from canonical,
  supplied Latin and footer segments. Never turn footer names/keywords/timestamps
  into asserted composer IDs, tags, media matches or other reviewed metadata.
- Allocate random cryptographic UUIDv4 lyric and nonblank line IDs once.
  Whitespace-only layout lines receive no UUID; no verse IDs are invented.
  File basename is lyric UUID only. Optional `source-latin` fence contains the
  supplied text without generated variants or claimed alignment/eligibility.
- Output exactly grouped YAML frontmatter, one `kannada` fence and optional
  `source-latin` fence. Each nonblank canonical line is `[line-UUID] ` plus its
  original literal text. Select sufficiently long fences to preserve backticks
  literally. Parse the result and compare decoded text/layout before committing.
- Existing provenance retains owner-supplied kind, actual input basename, raw
  hash and explicit encoding. New sources expose every approved author-editable
  field from the [Shared inventory](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md#author-editable-fields):
  empty text/collections for unknown metadata and null unassessed Source Latin
  booleans. A recognized footer is actual evidence, not an inferred attribution.
  Unknown media uses empty arrays, never blank video/image objects. Publication
  dates and generated variants are not user-filled empty source fields.
  No owner identity, license, date, attribution or URL is manufactured.

## Idempotency, concurrency and failure

The first batch prepares a uniquely named sibling staging directory under a
cooperative exclusive import lock. It validates all drafts/receipt and rechecks
all original hashes before one directory rename makes the new draft set visible.
It never replaces an existing source tree. Failures clean only that run's owned
staging directory; inputs and unrelated destinations remain intact.

An identical rerun validates the existing receipt/drafts and returns unchanged.
It never reallocates IDs, restores an explicitly released hold or overwrites
manual title/text corrections. Changed,
added or removed input files require a separately reviewed incremental import;
this initial-batch tool refuses rather than guessing identity correspondence.
Malformed/future receipts, missing drafts and conflicting provenance fail closed.
Concurrent imports/retries require the lock; no forced lock takeover exists.
Source validation explicitly refuses an active/interrupted import lock.

A footer retry first validates the unchanged raw set and current receipt, then
prepares newly eligible records under the exclusive lock. New records retain
their import-review hold until explicit release through the source review
workflow. It copies existing sources byte-for-byte into a complete validated
staging tree, rechecks inputs and retained bytes, moves the previous tree to an
owned UUID-named backup and activates staging. Failed activation restores the
backup; failed rollback keeps the backup and lock for explicit operator recovery.
The two directory renames are not a crash-atomic exchange. A successful retry
removes only its owned backup. No eligible changes means no staging directory,
source writes or new identities. Filesystem cleanup uses bounded retries for
transient Windows handles; exhausted cleanup errors are reported, never hidden.

After an interrupted process, inspect the exact owned `.import.lock` and
UUID-named staging/previous siblings before operator recovery. A missing active
directory with a preserved previous tree needs explicit restoration before any
new import. Never delete a recovery lock to start a fresh ID assignment.
Do not delete an existing
source directory, broadly clean the workspace or guess whether an unfinished
batch committed. If `library/` already has a valid receipt, unchanged rerun
validation is non-writing. This is an authoring workflow, not the production
offline journal/atomic activation protocol.

## Settings and validation

Requirement coverage: DATA-02 authoring structure, DATA-03 literal layout,
DATA-04 actual owner-supplied provenance/optional media, and DATA-08 once-assigned
lyric/line identities; optional source fields cover DATA-05/06 and reviewed
Source Latin bookkeeping supports LANG-11. Mandatory new-source holds support
DATA-07 but do not prove rights or review. Production rights evaluation, verse
review, public metadata adapters,
consumer reference preservation and release conformance remain owning gates.

`settings/source-import.yml` and its strict schema own input/output relative
directories, per-file/aggregate encoded-byte limits and the draft review-hold
label and explicit credit-footer enablement/labels. Paths resolve from Library;
source and destination cannot be equal/nested.
Limits apply before conversion and are checked again against actual reads.
Settings changes need compatibility review; personal preferences stay separate.

Tests cover literal text/layout, known BOM encodings, unknown/ambiguous sources,
title correction/idempotency, independent UUIDs, strict headers/fences/duplicates,
no-overwrite failures, actual configured byte ceilings/+1, footer preservation/
ambiguity, unchanged-only retry and activation/rollback fault injection. Metadata
checks cover verse coverage/IDs, provider-ID agreement, calendar dates, safe URLs,
provenance references, escaped controls and code-point Source Latin mappings.
Populated unsupported public fields fail canonical publication explicitly rather
than disappearing. Full checks and
source PR review remain required. Real source PRs contain canonical/supplied
source only, never generated variants/previews, and are never pushed directly
to main by this importer.

Only `library/*.md` is exempt from generic prose whitespace/link interpretation:
literal lyric spaces/tabs and markup-looking text must survive. Git attributes
scope whitespace exemption to those source files; UTF8/final newline checks and
the strict receipt/header/body/identity validator remain mandatory. All other
documentation, code and workflow hygiene rules remain unchanged.
