# DaasaVaani Library

Bootstrap for reviewed, flat per-video Markdown, catalog registries/configuration,
source assets, ingestion/import implementation, source validation and a future
Node/TypeScript content publisher with tests. Planned direct roots are `library/`,
`registries/`, `settings/`, `assets/`, `tools/`, `shared/`, `docs/` and `.github/`.
Content and application files have not been migrated or generated.

[Shared](https://github.com/DaasaVaani/shared) is pinned at `shared/` as a
language-neutral source dependency, not a shared application runtime. Website,
Android and Library update their pins independently; there are no lockstep
updates. Schemas and UI catalog generator ownership remain undecided.

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
Output-retention policy and publication capacity remain open.

## Bootstrap validation

Run `python tools/check_repository.py` and `git diff --check` from this root.
CI also parses YAML syntax. These are repository-hygiene checks, not publisher
tests, source-schema validation or a security audit. Add npm updates and real
publisher checks only when actual manifests and implementation exist.

Project-authored software follows the existing DaasaVaani [Apache 2.0 license](LICENSE).
It does not relicense third-party lyrics, descriptions, images, recordings or
trademarks; preserve applicable rights, attribution and notices.
See [SECURITY.md](SECURITY.md) for private vulnerability reporting.
