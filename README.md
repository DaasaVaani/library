# DaasaVaani Library

Reviewed flat Markdown sources, registries/assets/settings, local ingestion and
Node/TypeScript publisher. **Current implementation is fixture-only.**
Strict synthetic Markdown/settings validation produces deterministic hash-addressed
gzip artifacts, metadata catalog, counted-gram index and policy-bound descriptor.
Staged coding is authorized; production schemas/ledger/ZIP deployment, reviewed
transliteration, source migration and live ingestion are not implemented.

Start with [AGENTS.md](AGENTS.md), [provider/content policy](docs/content-rights.md),
[requirements](https://github.com/DaasaVaani/DaasaVaani.github.io/blob/main/docs/requirements.md)
and [current specification](https://github.com/DaasaVaani/shared/blob/main/docs/implementation-specification.md).
Shared is independently pinned at shared/; clone recursively or initialize it.
Authorized pin updates follow the [Shared-first publication order](https://github.com/DaasaVaani/DaasaVaani.github.io/blob/main/docs/testing-and-release.md#shared-submodule-updates):
publish and validate Shared before committing tested consumer pins.
Planned roots: library, registries, settings, assets, tools, shared, docs and .github.
Generated-only Pages target: https://daasavaani.github.io/library/, independent
from Website. Clients consume artifacts, not Library sources.

## Current boundaries

- **First API ingestion blocked pending retention/refresh clarification.** No
  provisional API design implies provider approval or public redistribution rights.
- Manual local full uploads scan/committed-pending reconciliation; sanitized
  console/machine/PR reports. No scheduled CI/API credential or ingestion direct-main.
- Source PRs: reviewed Kannada, supplied Source Latin, metadata/assets/settings,
  no generated real item variants/previews. Actual generation only post-merge;
  global fixes only, never item overrides or changing correct Kannada to force output.
- One canonical fence, stable line/verse-end metadata, literal layout; valid
  incomplete/held drafts excluded, malformed references fail. Preserve corrections.
- Five Latin/nine non-Latin renderings and raw Source Latin/status, snapshot policy,
  semantic-change ledger/state branch and monotonic sequence. Exact schemas/tables/
  recovery protocols remain open.
- Individual gzip objects and ZIP STORE100/32MiB, images online separate; current-
  only hosting, explicit client restart when old targets unavailable. Whole validated
  Pages artifact with host/headroom gate, no source roots/CDN atomicity promise.
- Catalog/import/image/publisher knobs in Library settings, portable profiles/policy
  in Shared. Native manifests/locks own dependency pins; no hidden defaults/secrets.

## Validation

```powershell
npm ci
npm run check
python tools\check_repository.py
git --no-pager diff --check
git --no-pager diff --cached --check
```

`npm run check` runs strict TypeScript and all fixture-publisher tests.
`npm run publish:demo` generates only the synthetic records in tests/fixtures/sources,
using settings/publication.yml. These are not real sources, generated source-PR
variants or reviewed sahitya. The Website demo tooling invokes this owning publisher;
clients read its artifacts, never its source Markdown.

CI also parses .github YAML. Include new docs and links/fences. Python/whitespace
checks are repository hygiene, not publisher tests. Incremental tests may be focused; finalization/
confirmation and every push require full applicable builds/all suites. Documentation-
only work is not automatically exempt now that executable tooling exists.
Missing required code checks block completion/push; do not fabricate commands.
Full-check policy does not authorize prohibited source-PR variants or live ingestion.

Update current docs/runbooks with changes; past choices and completed validation
records only in [HISTORY.md](HISTORY.md). Respect push authorization/protections,
unrelated work and independent Shared pins. Use issue/PR templates and
[security reporting](SECURITY.md). Project software is [Apache2.0](LICENSE),
not a relicensing of third-party lyrics/descriptions/images/recordings/trademarks.
