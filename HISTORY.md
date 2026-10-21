# Documentation history

## Owner-reviewed source metadata and explicit footer adaptation

- The owner confirmed text review and selected all approved author-editable
  source metadata fields, with unknown text/collections empty and review booleans
  unassessed/null. No generated dates, fake media, inferred classifications or
  new existing-record identities are permitted.
- Archived replaced current wording: prepared lyrics could be published while
  offline linguistic review remained a public-launch gate. That review is now
  confirmed complete; other production/release/rights/language gates remain.
  README previously called the entire implementation fixture-only, despite the
  separately implemented canonical prelaunch pipeline.
- The owner explicitly superseded the earlier keep-all-exceptions-for-manual-
  preparation policy for structured labelled credit footers. The old source guide
  required holding returning Kannada even for labelled footer text and prohibited
  automatic provenance separation. The new narrow grammar preserves recognized
  terminal credit/keyword/range blocks verbatim without interpreting authorship.
  Unknown sections and encoding/control exceptions remain held.
- Independently adopted Shared8bd8793afb9f2fd43d52b62bc5436bbd4da1b0ce after exact
  preflight39679248387 and main39679540067 passed the required named job. Shared
  metadata/labels and official Unicode16 resources passed the integrated25 tests.
  Library does not use Unicode data to infer labels or correct lyric text.
- Completed empty metadata on229 prepared records, proving unchanged known header
  values, all5450 existing line IDs, literal bodies/Source Latin and receipt bytes.
  Verified every996 original basename/length/SHA256 against the pre-import snapshot.
- Actual approved footer retry converted642 additional records:871 imported and125
  still held (122 returning-Kannada ambiguity, one malformed/unsupported encoding,
  one unsupported control, one missing initial Kannada section). Every new record
  reconstructed the complete LF-normalized original using canonical/Latin/footer
  segments, with no text deletion, attribution or media inference.
- Existing229 records retained all text/layout, titles, known provenance and
  review decisions. Released only the import-review hold on the642 newly prepared,
  owner-approved records after preservation checks. No source variants/previews
  were generated. Original text files remain ignored and never committed.
- During a verified no-change retry, Windows briefly retained an empty staging
  directory handle and cleanup raised EBUSY. Active sources stayed intact.
  Changed no-op retry to create no staging tree and added bounded owned-directory
  cleanup retries; recovery/failure remains explicit and backups are preserved
  when activation rollback fails.
- Final corpus proof:871 records with16406 canonical line IDs and5164 layout
  records; all229 earlier records' known values/identities/text preserved and all
  642 new records exactly reconstructed their normalized raw inputs. Identical
  retry preserved every source/receipt byte and write timestamp. All996 originals
  again matched the saved basename/length/SHA256 inventory.
- `npm run check` passed strict TypeScript, all29 tests with zero failures/
  cancellations/skips and actual871-source/125-exception validation.
  `python tools\check_repository.py` passed911 staged tracked files.
  Strict YAML parsed all9 files; actionlint1.7.12/ShellCheck0.11.0 and both
  whitespace checks passed. All872 staged source/receipt Git blobs matched working
  bytes exactly; tracked/staged original text files remained zero.

## 2026-10-21: owner-authorized canonical prelaunch publication

- The owner authorized publishing the prepared lyrics now and undertaking
  offline review before public launch. This supersedes this batch's earlier
  no-auto-merge/source-import-review publication gate, not the public launch
  review gate, other holds, provider hold or the instruction never to commit
  originals. All767 extraction exceptions remain held for manual preparation.
- Released only `source-import-review` from229 prepared source headers. Verified
  unchanged public/provenance fields, canonical text/layout, supplied Latin and
  all5450 assigned line UUIDs; no lyric UUID/title was replaced. Original text
  files and the global receipt were not rewritten.
- Independently adopted published Shared
  `26a02b3423060d8efa7897cd92844a79ffdacc9c` after exact preflight39672246397
  and main39672859078 passed the required named job. Shared contains common
  source headers, strict draft specialization and separate canonical-text
  prelaunch publication schemas/types; no consumer pin is updated in lockstep.
- Added a distinct bounded canonical publisher and post-merge-only Pages workflow.
  Reused existing canonical JSON/deterministic gzip helpers; fixture behavior
  remains separate. Source review tests generate only synthetic artifacts.
- Archived replaced AGENTS wording: all automatic source publication was
  unauthorized. Also archived the policy implication that supplied Latin was
  already published with flags: that remains the production target, while this
  prelaunch canonical-only family excludes unreviewed Latin. No owner identity,
  license, rights status, attribution mapping, media or verse was invented.
- Initial `npm run check` after independent pin adoption passed strict TypeScript,
  all19 publisher/import tests with zero failures/skips, and source validation.
  Additional mixed-held-source coverage and final source release followed.
- Final `npm run check` passed strict TypeScript, all19 tests with zero
  failures/skips and actual229-source/767-exception validation.
  `python tools\check_repository.py` passed268 tracked files; strict YAML parsed9
  workflow/form/settings files; actionlint1.7.12/ShellCheck0.11.0 and staged
  whitespace passed. Actual import rerun preserved all230 source/receipt hashes,
  write times and explicitly released holds. All996 originals again matched
  the pre-import length/SHA256 snapshot and remained ignored/uncommitted.
- GitHub initially rejected Library Pages creation because organization Pages
  creation was disabled. After explaining that creation permission cannot be
  scoped to two repositories, the owner explicitly approved permanent public
  Pages creation across the organization, retaining disabled private creation.
  Verified the persisted documented overall/public/private settings, provisioned
  Library's public Actions site, and confirmed Website's existing Actions site
  was unchanged. Site provisioning is not evidence of successful feed deployment.

## 2026-10-21: retain import exceptions for manual preparation

- Presented the explicit credit-footer alternative after local extraction:
  preserve clear trailing credit blocks as provenance notes versus retain all
  exceptions. The owner selected keeping all767 exceptions held for manual
  preparation, with no contract change. No supplied credit was reclassified or
  dropped and no new provenance-note field was added.
- Prepared separate source review for the229 successfully extracted drafts,
  every one still carrying `source-import-review`. The global receipt accounts
  for all996 inputs and767 held exceptions. Original text files remain ignored,
  untracked and absent from source commits; no real variants/previews/media or
  inferred verses were generated.
- Original-input protection commit `d18a7dc437135ce0ff8626ae0b87d46e24dbd0f1`
  passed exact required preflight39669498167 and main39669637524, including
  `Bootstrap files and YAML syntax`. Its three-file change contains no source
  payloads. The completed validation branch was removed only after confirming
  its unchanged tip was contained in main and no open PR referenced it.

## 2026-10-21: keep owner originals local

- The owner explicitly reiterated that original text files must not be committed.
  Verified zero tracked/staged files under `text_files_from_source/`; the importer
  tooling commit contains no original inputs or real drafts. Added a root-scoped
  Git ignore rule for the entire original-input directory and made its local-only
  status explicit in the operating guide. Separate draft review remains distinct
  from committing originals.
- `git check-ignore text_files_from_source`: passed; tracked/staged original
  count remained zero. All996 files matched the pre-import byte lengths/SHA256,
  with no missing/added originals. Local extraction accounted for every file:
  229 held drafts and767 explicit exceptions. Of764 returning-Kannada cases,
  661 begin with an explicit supplied Kannada credit label; no footer was
  silently discarded/reclassified. Other exceptions need review.
- `npm run check`: passed strict TypeScript, all15 tests with zero failures/skips,
  and actual validation of229 drafts/767 receipt exceptions.
  An actual import rerun explicitly returned unchanged/exit2 for retained
  exceptions; all230 draft/receipt files preserved byte hashes and write
  timestamps, including every assigned UUID.
  `python tools\check_repository.py`: passed32 tracked files; `git diff --check`
  passed. All real drafts/receipt remain uncommitted pending source review.
- Importer tooling commit `4c7a8bb50e1a76b8f221c73b7859c17612b2e634`
  passed exact required preflight39668533933 and main39668729205, including the
  named `Bootstrap files and YAML syntax` job in both. The existing authorized
  main exception was used without changing rules; no original payload was pushed.

## 2026-10-21: held source-review batch validation

- Source branch contains229 held canonical draft Markdown files with5450
  once-assigned line UUIDs,1488 preserved layout lines and228 literal supplied
  Latin blocks. One draft is Kannada-only. The global batch receipt is not a
  per-item companion source file. No original text files, media associations or
  generated variants/previews are staged.
- `npm run check`: passed strict TypeScript, all15 publisher/import tests with
  zero failures/skips, and actual source validation reporting229 imported/767
  held exceptions. `npm run sources:import` deliberately returned exit2 for
  those exceptions; it is not a successful full-corpus conversion or linguistic
  review. No holds were cleared.
- `python tools\check_repository.py`: passed262 staged tracked files.
  Working/staged `git diff --check` passed with only literal source-file
  whitespace exempted. Existing Shared `strictYaml` parsed7 configuration YAML
  files; actionlint1.7.12/ShellCheck0.11.0 passed.
- This authoring-only batch does not update consumer pins, public artifacts or
  runtime code. Website/Android suites were not run for it and no new consumer
  compatibility, publication or release-ready claim is made. Source review and
  production gates remain open; the branch must not be auto-merged.

## 2026-10-21: authorized owner-supplied draft authoring

- The owner explicitly authorized separate held Markdown drafts from the supplied
  text files, preserving all originals. Initial Kannada is canonical, following
  Latin is literal supplied Source Latin. The first Kannada lyric line is the
  approved initial title; manual title corrections must survive reruns.
- Superseded blanket AGENTS text: "Source migration is not authorized." The new
  permission is only this bounded draft workflow, not other migration,
  automatic publication, media matching or provider access.
- Archived superseded content-rights guidance: no per-item rights/attribution
  gate or publication prerequisite had been selected; sibling source Markdown
  was unreviewed and items were to be re-ingested from YouTube. It also described
  Website settings as empty and its Library directory as absent. Current approved
  lyric identity permits owner-supplied provenance and optional media; precise
  production rights-evidence/notice fields remain open. No legal permission,
  identity/license declaration or public attribution was manufactured.
- Independently advanced Library's Shared pin to published
  `1d588c3e0b314e3ccbfa4bd15702020a2ba83fbf`, after Shared main CI39667134097
  passed. It supplies the draft-header schema, not completed public item/list-v2
  contracts or consumer adapters.
- Initial focused validation found two test-only defects: YAML title quote-style
  assumption and indexed-value callback narrowing. Corrected those tests.
  `npm run check` then passed strict TypeScript and all15 publisher/import tests;
  no draft directory existed, explicitly no actual source records validated.
  Further fail-closed UTF8/receipt/inventory hardening followed; final-tree
  validation is recorded separately below. Originals were not changed by tests.
- Final importer hardening rejects malformed UTF8 records, future/empty receipts,
  extra/missing drafts, conflicting provenance and concurrent import locks.
  `npm run check`: passed strict TypeScript, all15 tests, zero failures/skips;
  absent real source directory was explicitly reported, not claimed validated.
  `python tools\check_repository.py`: passed32 staged tracked files.
  Existing Shared `strictYaml` parsed all7 workflow/form/settings YAML files.
  actionlint1.7.12 with ShellCheck0.11.0 passed; working/staged `git diff --check`
  passed. Generic whitespace/link exemptions are restricted to literal
  `library/*.md`, backed by mandatory strict source validation.
  No real source conversion, provider access or runtime consumer update was
  included in this tooling validation.

## 2026-10-21: authorized fixture-publisher milestone

- The owner authorized the recommended staged implementation and real desktop,
  mobile and native simulator demos without further choice questions. This
  milestone intentionally used synthetic words/alphabet records, not reviewed
  sahitya, migrated sources or verified video metadata.
- Implemented strict fixture Markdown/YAML parsing, stable line identities,
  held-record exclusion, safe-integer canonical JSON, deterministic gzip with
  platform-independent OS metadata, role bounds, SHA256 object paths, metadata
  catalog and a policy-bound counted-gram index. The descriptor is activated only
  after object writes. Production ledger/receipts/ZIP/deploy and reviewed language
  conversion remain incomplete; live provider ingestion stayed blocked.
- Adopted Shared `b0950e2f01823c471b18fff8abb49ce176d8f26e` only after upstream
  publication and successful exact-revision CI run39585091134.
- `npm run check`: passed TypeScript and all5 publisher tests, including LF/CRLF,
  malformed/duplicate IDs, strict settings, repeated grams, deterministic metadata
  and complete encoded/decoded/hash verification of fixture objects and manifest.
- Expanded hygiene CI to check out pinned Shared and execute the actual publisher
  suite. Local actionlint1.7.12 with ShellCheck0.11.0: passed. Neither fixture tests
  nor this record assert complete product/release readiness.
- Repository checker passed26 staged tracked files; working/staged whitespace
  passed. The four-owner documentation audit passed40 Markdown files, local/
  cross-repository links/anchors/fences and all153 unchanged requirement IDs.

## Archive policy

This is the sole archive for past decisions, superseded guidance, dated
observations and validation records in this repository. It is not current
implementation guidance or evidence of current configuration. Start with
[AGENTS.md](AGENTS.md) and [README.md](README.md) for current instructions.

## 2026-10-21: current-only documentation migration

The owner requested root AI instructions and one history archive per
repository. Incremental checks may be focused; finalization and pushing
require complete applicable builds/tests. Documentation-only changes may
use all available documentation/bootstrap checks while app tooling is absent.
The snapshots below preserve documents before reconciliation, including
then-current approvals and unresolved questions. Their statements may
conflict; consult current documents, never use snapshots as approval.


## 2026-10-21: AI/documentation validation record

- Root AGENTS/HISTORY and current-only README/provider guidance established;
  original snapshots below.
- `python tools\check_repository.py`: passed17 tracked files, including new docs.
  `git --no-pager diff --check` and `git --no-pager diff --cached --check`: passed.
- Cross-repository Markdown audit passed37 files, links/anchors/fences and153
  unchanged Website requirement IDs.
- Ruby/YAML syntax tooling unavailable locally, no workflow YAML changed. No
  publisher/build/source/conformance runner exists; no such pass is claimed.
  The owner approved the documentation-only available-checks exception.
- Provider hold unchanged; no live ingestion/source migration, generated variants,
  dependency/Shared-pin, commit/push or publication/protection change.

## 2026-10-21: direct-main publication authorization

The owner requested committing and pushing all current/staged changes to main
without PRs. Scope: README/provider guidance, AI instructions and history; no source
migration, live API access, generated variants, publisher or Shared-pin update.
Rerun all available documentation/bootstrap checks before publication; provider
hold remains and absent publisher tests are not passes.

## 2026-10-21: coordinated Shared pin correction

- The owner authorized correcting the stale Shared pin from
  `5a2446c31ffb97c9899a7ba3a287e58b2b2eb490` to
  `dbaac0d4c5d255a0c6663d9c21fa2b918761e027`. That target was already published
  and passed Shared Repository hygiene run39576588515 before the consumer
  update. Intervening upstream changes are documentation only.
- Updated the gitlink and linked the Shared-first publication procedure; the
  detached exact-target checkout has no local modifications.
- `python tools\check_repository.py`: passed17 consumer files.
  `python shared\tools\check_repository.py`: passed15 pinned Shared files.
  `git --no-pager diff --check`: passed.
- `python <session-folder>\files\validate-shared-pins.py`: passed58 Markdown files
  including actual pinned checkouts, links/anchors/fences/encoding/whitespace,
  exact clean Shared revisions and153 unchanged Website requirement IDs.
- No publisher/build/source/conformance runner exists; no such success claimed.
  No workflow YAML changed; local YAML tooling is unavailable. Documentation/
  gitlink metadata uses the bootstrap exception, not a code-test waiver.
  Provider hold, source migration and generated-variant restrictions unchanged.

## Snapshot: README.md

# DaasaVaani Library

Bootstrap for reviewed, flat per-video Markdown, catalog registries/configuration,
source assets, ingestion/import implementation, source validation and a future
Node/TypeScript content publisher with tests. Planned direct roots are `library/`,
`registries/`, `settings/`, `assets/`, `tools/`, `shared/`, `docs/` and `.github/`.
Content and application files have not been migrated or generated.

[Shared](https://github.com/DaasaVaani/shared) is pinned at `shared/` as a
language-neutral source dependency, not a shared application runtime. Website,
Android and Library update their pins independently; there are no lockstep
updates. Shared owns schemas/specifications and the UI catalog generator/
committed resources. Exact schemas and implementation remain pending.

The [approved implementation-design record](https://github.com/DaasaVaani/shared/blob/main/docs/implementation-specification.md)
documents the earlier review passes and remaining gates. All configurable
catalog/import/image/publisher values belong in Library settings, portable
profiles/search policy in Shared settings; no hardcoded defaults.

The eventual **generated-only** Pages publication is
<https://daasavaani.github.io/library/>, independently deployed from the
[Website](https://daasavaani.github.io/). Capacity validation is still open.
No deployment is configured here; Website has no Library Git-source dependency.

## Source review and contribution

Clone with `git clone --recurse-submodules https://github.com/DaasaVaani/library.git`,
or run `git submodule update --init` after cloning. Use the issue forms and PR
template; get approval before resolving open design choices.

Source PRs contain canonical Kannada, supplied Source Latin and metadata, not
generated lyric variants/previews or companion source files. Generate actual
variants only after merge. Fixture and tooling checks are allowed in source PRs.
Preserve reviewed corrections, verse structure and identity; transliterate,
never translate. Keep uncertain content as drafts, not fabricated lyrics.
Generated-text fixes belong in global rules/profiles, never item/line overrides
or changes to correct Kannada solely to force conversion.

Review source permissions, attribution and required source assets/settings
together. Public availability is not redistribution permission. Keep private
permission correspondence, secrets and private data out of the repository.
Remote hosting retains only the current publication; safe old-version resume/
repair is not guaranteed. Hosting-limit/headroom preflight is required, with
actual capacity and planner limits still unmeasured.

## Approved publisher and ingestion boundaries

- First API ingestion is blocked pending provider retention/refresh clarification;
  the provisional official-API design is not compliance approval.
- Ingestion remains local/manual, with full uploads pagination, committed/pending
  reconciliation and sanitized console/machine/PR reports. No scheduled CI run,
  API secret in CI or direct-main ingestion.
- Valid incomplete drafts and complete items with publication-hold reasons are
  excluded; malformed sources/references fail validation. Blank separators are
  layout without lyric UUIDs.
- Publish five initial Latin profiles (Hunterian deferred), nine non-Latin
  renderings, raw Source Latin/status and snapshot-pinned policy. Exact reviewed
  mappings/aliases remain pending; no actual generated source-PR previews.
- Maintain first-publication/output-changed-at ledger and no-op identity/dates.
  Individual gzip objects plus common ZIP STORE reading bundles up to100/32MiB;
  images are separately fetched online. Oversized objects may transfer directly
  under their own limits.
- Deploy one complete validated public Pages artifact, not source roots or a
  promised descriptor-last/global-CDN-atomic update.

## Bootstrap validation

Run `python tools/check_repository.py` and `git diff --check` from this root.
CI also parses YAML syntax. These are repository-hygiene checks, not publisher
tests, source-schema validation or a security audit. Add npm updates and real
publisher checks only when actual manifests and implementation exist.

Project-authored software follows the existing DaasaVaani [Apache 2.0 license](LICENSE).
It does not relicense third-party lyrics, descriptions, images, recordings or
trademarks; preserve applicable rights, attribution and notices.
See [SECURITY.md](SECURITY.md) for private vulnerability reporting.


## Snapshot: docs/content-rights.md

# Content rights and attribution

The repository's [Apache 2.0 license](LICENSE) applies to project-authored
software. It does not establish ownership of third-party lyrics, video
descriptions, images, recordings, or trademarks.

## Policy

The project owner decided that **no rights and attribution gate is required**
([`rights-attribution-gate`](https://github.com/DaasaVaani/DaasaVaani.github.io/blob/main/docs/design-decisions.md)). There is no per-item rights
status, no publication prerequisite for rights review and no public
attribution-notice contract. This replaces earlier text that required a lawful
basis, recorded permissions and a publish hold for unclear rights.

Remaining guidance that still applies:

- Respect YouTube API and embedding terms. The product scope does not include
  downloading video media. The provider-terms check for retaining stored YouTube
  metadata is still pending before the first ingestion.
- The user explicitly retained a provisional API design and blocked first
  ingestion pending clarification of retention/refresh applicability to committed
  descriptions, derived text, images and frozen offline snapshots. No compliant
  exemption or provider approval is claimed.
- Raw YouTube descriptions and internal evidence are excluded from public
  artifacts; do not store private correspondence in public repository files.
- Supplied Source Latin is published with its suitability flags even when
  unsuitable for reading; that exception does not authorize publishing private
  material.
- Do not infer legal permission from this policy; the absence of a gate is a
  project decision, not a legal conclusion.

Source/provenance metadata belongs in reviewed Library content. `library/` is
absent and `settings/` is empty in Website. Legacy-looking Markdown in a separate
sibling path is an unreviewed reference; items are re-ingested from YouTube and
unresolved items stay drafts. Content, ingestion and publisher changes belong in
Library source PRs; Shared contract/catalog changes use Shared PRs, with consumer
pin updates made separately. The separate Library publication is planned at
[daasavaani.github.io/library/](https://daasavaani.github.io/library/), distinct
from the Website root.

## Corrections and concerns

For attribution, ownership or correction concerns, open a repository issue with
the affected item/video ID, source, requested correction/removal, and information
you are permitted to share. Do not attach confidential evidence publicly. No
dedicated private contact address is currently published.

Maintainers may correct or remove affected items through source, generated
artifacts, and future offline snapshots. Previously downloaded copies cannot be
remotely guaranteed removed.
