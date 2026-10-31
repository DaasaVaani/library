# Composer and ankita review handoff

## Scope and authority

The [review checkpoint](../reviews/source-attribution-review.json) is the
authoritative portable record of this unfinished attribution review. It contains
all 995 logical items, separate composer/ankita/translator fields, accepted and
rejected evidence references, the effective 22-group reference graph, approved
decisions, source hashes, preparation decisions and the complete remaining queue.
It is review data, not a new production schema or applied classification.

This supports DATA-04/05 and the evidence-based composer/ankita obligation in
[the product requirements](https://github.com/DaasaVaani/DaasaVaani.github.io/blob/main/docs/requirements.md).
No registry IDs, public classification values, source edits, receipt migrations,
verse approvals or publication eligibility are changed by this checkpoint.
Owner-authorized automation interprets evidence in this review only; it does not
introduce automatic product attribution from signature detection.

Read `done`, `pendingFullPair`, `counts` and `pendingReviewQueueCounts` directly
from the checkpoint for progress. Fully paired means both review fields have
accepted evidence; it does not mean that source metadata has been populated or
that linguistic, rights or release gates have passed. Item-category counts and
queue-reason counts are different views, not interchangeable work totals.

The queue excludes one separately confirmed, unmapped ankita:
`ವರರಂಗ ವಿಠಲ` in `parvati varasuta.txt`. Its composer remains unknown. Do not
ask the owner to reconfirm an already accepted ankita or invent its composer.

## Approved rules and identity safeguards

- Preserve explicit compatible source credits and previously approved decisions.
  Automatically accept clear `ಹಯವದನ` endings as
  `ಶ್ರೀ ವಾದಿರಾಜರು / ಹಯವದನ`; retain genuine contextual doubts for review.
- The broader approved rule accepts one approved, unconflicted ankita in the
  **actual final Kannada charana**. Use its unambiguous approved composer
  association only when compatible with explicit credits. Missing signatures,
  conflicting signatures, uncertain boundaries and incompatible credits remain
  review cases. An earlier deity mention alone is not a conflicting authorship
  signature.
- Use approved NFC/whitespace equivalence and explicit aliases only. Preserve
  spelling, split words, layout and meaningful qualifications. Do not invent
  missing prefixes, lemmatize names or silently remove `ಗುರು`.
- Keep ordinary Jagannatha distinct from Guru Jagannatha/Kosigi, and ordinary
  Mahipati distinct from Guru Mahipati. A generic Sri Krishna occurrence is not
  sufficient to override an explicit different composer.
- `effectiveMasterPairs` revision4 is the effective reference graph.
  `rawComposerForms` and `rawAnkitaForms` retain historical evidence; they are
  **not** automatically accepted aliases. Only the explicit alias fields and
  approved decisions establish name equivalence.
- Review23 corrects the Akka reference composer to
  `ಶ್ರೀ ಗುರು ಮಹಿಪತಿ ದಾಸರು`, using the accepted Jogi evidence. It does **not**
  establish a Kakhandaki Krishna/Guru Mahipati alias. Preserve rejected original
  composer credits and the still-valid ankita.
- Review24 is a real name alias: both `ಶ್ರೀ ಬಾದರಾಯಣ ವಿಠಲ ದಾಸರು` and
  `ಶ್ರೀ ಸವಣೂರು ಬಾದರಾಯಣ ದಾಸರು` remain valid; prefer the latter.
  Do not infer an ankita for `Dasare Gatiyu.txt` from its composer name.
- Keep original Sanskrit composer `ಶ್ರೀ ಮನ್ಮಧ್ವಾಚಾರ್ಯ` (credited alias
  `ಶ್ರೀ ಮದಾನಂದತೀರ್ಥ`) separate from Kannada translator
  `ಶ್ರೀ ಬನ್ನಂಜೆ ಗೋವಿಂದಾಚಾರ್ಯ`. The approved role adaptation covers only the five
  sources with matching explicit Dwadasha Stotra work/translation evidence.

The checkpoint includes the initial eight approvals, fourteen item decisions
(reviews9-22), reference correction23 and name alias24. Its two automatic rules
have separate approval records; do not count rule applications as additional
individual owner decisions. Historical batch counts in the private archive are
immutable snapshots, not the current live queue.

## Next review

Review25 has not been asked or approved. Resume with `neere torele.txt`,
item `a76f1397-9ac9-43db-a5ee-065927393831`.

- Raw SHA256:
  `e614a60b42e401aca00b04269876ef012224f326ef439df7cf087388ef68f78e`.
- Original final charana: lines14-17; explicit composer credit: line37,
  `ಶ್ರೀ ಮಹಿಪತಿಸುತ ದಾಸರು`.
- The qualified ending includes `ಮಹಿಪತಿಸುತಪ್ರಭು ಶ್ರೀಕೃಷ್ಣನ`.
  Do not shorten away the qualification or automatically replace the explicit
  composer with the detector's Vyasaraja association.
- Open the original for the reviewer, explain the conflicting association and
  obtain an item-specific decision before changing the review fields.

The other remaining composer-reference contradiction is `ರಾಮ ಹರೇ.txt`:
explicit `ಶ್ರೀ ವರದೇಶ ವಿಠಲ ದಾಸರು` versus a generic Sri Krishna match.
The remaining queue also contains missing eligible final signatures, one
multiple-signature case and unresolved final-charana/coda/section/alignment
boundaries. Present real ambiguities one by one and report done/pending counts.
Do not turn absence of evidence into a contradiction or require identical
yes/no questions for every partially resolved item.

## Resume on another device

1. Clone or fast-forward Library `main`, preserving unrelated local work. Read
   [the root instructions](../AGENTS.md), this guide and
   [the source-import guide](source-import.md). Install the existing locked
   dependencies with `npm ci` if needed; no new dependency is required.
   Initialize the already-pinned Shared submodule, without changing its pin:

   ```powershell
   git submodule update --init --recursive
   ```
2. Read the committed checkpoint. Its paths are relative to Library; paths
   beginning `private-handoff/` refer to the separately supplied private archive.
   No old user's checkout/session path is needed to interpret it.
3. Obtain the owner's local-only `attribution-handoff.zip` separately and extract
   it to a new directory. Git deliberately excludes originals and private
   reports. Do not upload this archive to Git, CI, Pages or third-party services.
   Without it, the checkpoint and existing canonical Markdown can be inspected,
   but full raw-source verification and held-source review remain blocked.
4. The archive contains all996 unchanged raw originals, immutable review inputs
   and audit snapshots, preparation manifestv3, the full approved checkpoint and
   portable copies of the three analysis helpers. The path adapter rebases
   loaded views only; historical JSON bytes and source hashes are not rewritten.
   Historical protected-item checksums are compared in their original path
   namespace, not discarded to make relocation pass.
5. From any working directory, run the helper against the cloned Library.
   Replace the example paths with the actual extraction and checkout roots:

   ```powershell
   node 'C:\handoff\apply-owner-item-attributions.mjs' owner-item-attribution-decisions-current.json 'C:\work\library'
   ```

   Raw sources default to the archive's `text_files_from_source` directory.
   An optional final argument selects a different unchanged raw-source root:

   ```powershell
   node 'C:\handoff\apply-owner-item-attributions.mjs' owner-item-attribution-decisions-current.json 'C:\work\library' 'C:\owner-inputs'
   ```

   This regenerates only the archive's `attribution-review-current.json`,
   starting from immutable resolved reportv2. It validates all996 raw and871
   canonical Markdown hashes, strict decoding/parsing, the124 prepared canonical
   spans, reference/evidence connectivity and prior approved decisions.
   Missing or changed inputs are blockers, not an invitation to replace hashes.
6. For the normal full Library source validator, the unchanged originals must
   also be present in the checkout's ignored `text_files_from_source` directory.
   Copy only into a new destination, or verify every existing byte hash before
   reconciling. Never overwrite a different original to manufacture a pass.
   Then run the [full documented validation](../README.md#validation).
7. Before each further review, verify the current raw/Markdown hashes and open
   the corresponding original. Record approval scope, evidence IDs, accepted or
   rejected credit disposition and any new preferred alias explicitly. Preserve
   the immutable inputs, prior decisions and unrelated source work.

The committed checkpoint deliberately omits lyric payloads, private conversation
quotes and machine-local absolute paths. Source witnesses retain hashes,
identities and line locations; duplicate identical location records are collapsed.
Repeated supporting-credit lists are stored once in
`supportingCreditEvidenceSets`; an evidence entry's
`supportingCreditEvidenceSetId` resolves to the unchanged ordered list.
An unqualified `witness.line` is scoped by `sourceKind` (for example a line inside
Markdown provenance), not necessarily a physical file line.
`verifiedOriginalLocations` and path-bearing raw witnesses identify original
physical lines. Full literal evidence is preserved in the private archive.

The portable helpers regenerate the private report, not public source metadata
or classifications. After additional approvals and successful regeneration,
deliberately export the metadata-only checkpoint with the archive's exporter:

```powershell
node 'C:\handoff\export-attribution-handoff.mjs' 'C:\handoff' 'C:\work\library'
```

It writes only `reviews/source-attribution-review.json`, retains evidence
connectivity and checks dynamic progress totals and the payload/privacy boundary.
Preserve all remaining decisions, update dated progress in HISTORY and run full
validation before any authorized push.

## Other work and unchanged gates

- The active receipt remains871 imported/125 held. The124 preparation approvals
  and one supplemental association are **not** applied source migrations.
  The preparation ledger is hash-bound; stale entries must not be blindly applied.
- All5,108 provisional verse proposals remain uncertain. Report-level charana
  recognition does not approve permanent product verse identities.
- Reviewed metadata registries, source/publication adapters and production
  classification population remain open. Do not populate them by ad hoc JSON
  edits or allocate IDs from this review report.
- Production language, rights, offline/lifecycle, publication-ledger activation
  and final release evidence remain open. First YouTube API ingestion remains
  blocked pending provider clarification.
- Authorized validated implementation/checkpoint pushes go to `main` under the
  existing temporary owner-approved administrator workflow. No force pushes,
  protection changes, Shared repins, source-review bypass or production
  activation are authorized by this handoff.

Completed decisions, dated progress and validation evidence are archived in
[HISTORY](../HISTORY.md); history is not a replacement for current gates.
