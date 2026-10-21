# DaasaVaani Library

Reviewed flat Markdown sources, registries/assets/settings, local ingestion and
Node/TypeScript publisher. **Bootstrap only:** no source migration, publisher,
package manifests, app tests or Library Pages deployment is implemented.
Final design/coding authorization remains pending.

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
python tools\check_repository.py
git --no-pager diff --check
git --no-pager diff --cached --check
```

CI also parses .github YAML. Include new docs and links/fences. These are hygiene
checks, not source/publisher tests. Incremental tests may be focused; finalization/
confirmation and every push require full applicable builds/all suites. Documentation-
only work has the all-available-checks exception while app tooling is absent.
Missing required code checks block completion/push; do not fabricate commands.
Full-check policy does not authorize prohibited source-PR variants or live ingestion.

Update current docs/runbooks with changes; past choices and completed validation
records only in [HISTORY.md](HISTORY.md). Respect push authorization/protections,
unrelated work and independent Shared pins. Use issue/PR templates and
[security reporting](SECURITY.md). Project software is [Apache2.0](LICENSE),
not a relicensing of third-party lyrics/descriptions/images/recordings/trademarks.
