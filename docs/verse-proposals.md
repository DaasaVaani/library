# Provisional verse-boundary review

## Authority and separation

The owner authorizes best-guess verse-boundary **proposals**, not lyric truth,
approval or publication. `reviews/verse-proposals.json` is the persisted review
surface. It contains only lyric IDs, whole-source byte SHA256 values, provisional
status and candidate `{id, endsAt, evidence}` records. Open the corresponding
`library/<lyricId>.md` beside it for Kannada/layout context; no entire lyric,
Source Latin, title, source basename or provenance text is copied into proposals.

This is an authoring aid for DATA-02/03/08, not completion of DATA-07 review or
the public verse adapter. It does not change canonical text, line IDs, blank
layout, existing metadata, holds, provenance, import receipts or source files.
It never reads raw `text_files_from_source/` inputs, including held exceptions.
The configured protected tagged source is excluded before proposal snapshot
reading. The normal source validator still validates the existing source
inventory without rewriting it.

Nonempty holds and already-declared `public.verses` receive no proposals.
The publisher never reads `reviews/`; accepting/editing a proposal does not
change public artifacts. Populated public verses still require the owning public
adapter and fail the current canonical-only publisher. There is deliberately no
apply/approve/publish command or automatic source metadata replacement.

## Commands

From Library:

```powershell
npm run verses:propose
npm run verses:validate
npm run check
```

`verses:propose` creates the review file only if absent. If present, it validates
and returns unchanged, preserving manual edits, bytes, IDs and write time. It
never recalculates an existing review into a replacement. `verses:validate` is
non-writing and is included in full checks. Missing, stale, malformed or
incomplete proposals fail; they are not silently regenerated. These commands
also validate the normal source receipt/inventory. They perform no provider,
HTTP, browser/device, transliteration or real artifact generation.

`settings/verse-proposals.yml` and its strict schema own source directory,
separate review output path, byte ceilings and protected lyric exclusions.
Paths must remain inside Library; output cannot be inside the source directory.
Do not remove the protected exclusion as part of routine regeneration.

## Deterministic algorithm and uncertainty

`blank-separators-v1` walks existing canonical line/layout records, never edits
them, and closes a candidate at the last nonblank line before an internal run
of blank/space/tab-only layout. Consecutive blanks make one separator. Leading
and trailing blanks make no empty verses. A final candidate closes at the last
canonical line so coverage is complete.

- `blank-separator` means observed layout evidence, **not** reviewed stanza truth.
  Titles, refrains, page spacing and verse breaks can all look alike.
- `end-of-source` is only coverage closure, not evidence of a linguistic verse.
- Without internal blanks, propose one uncertain whole-source span. Never
  manufacture periodic splits. No numbered, punctuation, repeated-text or other
  markers are currently authorized; they remain literal text.
- Every source proposal has immutable `status: provisional`; **every candidate
  remains uncertain**, including structurally supported ones.

Fresh generation sorts sources by lyric UUID and is deterministic for the same
bytes/settings. IDs are SHA256 of
`daasavaani:provisional-verse:v1:<lyricId>:<endsAt>`, rendered using the existing
lowercase source UUID shape (version nibble `4`, variant nibble `8`, first128
hash bits otherwise). These are deterministic **candidate** identifiers, not
claims of random UUID allocation or approved canonical verse identities.
Changing preceding candidates does not change an unchanged endpoint's initial
ID. All candidate IDs are checked against each other and source identities.

The full source byte hash detects any change, including metadata, provenance,
spacing and Source Latin; no semantic normalization hides a stale review.
Validation requires exact eligible-source coverage, ordered distinct existing
line endpoints and final-line coverage. Unknown fields, non-provisional status,
identity collisions and unsupported evidence fail closed.
The algorithm is linear in canonical layout size; validation currently uses
line-ID lookup per candidate. Both are bounded by configured source byte limits.
No linguistic correctness, transliteration or production conformance is inferred.

## Owner inspection and editing

1. Open the candidate record and its canonical source side by side. Inspect every
   proposed group; a valid structural proposal is not necessarily a valid verse.
2. Change `endsAt` only to an existing nonblank canonical line UUID. Preserve the
   candidate `id` when adjusting the same candidate; set `evidence: owner-edit`
   when the endpoint no longer represents its original structural evidence.
   Keep records in canonical order and keep the final canonical endpoint.
3. For a merge, retain the surviving candidate ID and remove the other record.
   For a split, retain the existing ID for the continuing candidate and allocate
   a fresh UUIDv4 for the additional candidate, marking it `owner-edit`.
   Use `node -e "console.log(require('node:crypto').randomUUID())"` for a new
   candidate ID. Ambiguous merges/splits need owner identity review, not ID reuse
   justified only by array position. Never change source line IDs or text to fit.
4. Leave `status` provisional. Run `npm run verses:validate`, inspect the diff and
   perform full checks before committing. Review evidence is not source approval.
5. If source bytes, source eligibility or inventory changes, validation stops.
   Review the actual source diff and explicitly rebase affected entries and byte
   hashes in a separate reviewed edit. Reuse IDs only for the same candidate;
   retain traceability in Git. Never delete the ledger to force a fresh
   successful run or blindly refresh hashes. Newly reviewed public verses must
   be removed from proposal coverage only as part of that explicit reviewed edit.
   Actual canonical verse adoption remains a separate authorization/adapter task.

Writes use an exclusive cooperative `<output>.lock`, an owned UUID `.pending`
file and a same-directory rename after validating and rereading source hashes.
Failures preserve an existing review; an interrupted process can leave the lock
and pending file. Inspect those exact files and source state before manual
recovery; do not force takeover or broadly clean source/review directories.
Locks do not prevent unrelated editors from changing sources afterward; run
validation again when reviewing or committing. Synthetic tests exercise
determinism, uncertainty, layout/source preservation, manual edits, stale hashes,
coverage/identity failures, exclusions, locks and byte ceilings.
