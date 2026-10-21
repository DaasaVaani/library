# Documentation history

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
