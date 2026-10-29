# DaasaVaani Library

Reviewed flat Markdown sources, registries/assets/settings, local ingestion and
Node/TypeScript publisher. The synthetic fixture pipeline and owner-authorized
canonical prelaunch lyric pipeline remain distinct. Strict synthetic
Markdown/settings validation produces deterministic hash-addressed
gzip artifacts, metadata catalog, counted-gram index and policy-bound descriptor.
Staged coding is authorized; production schemas/ledger/ZIP deployment, reviewed
transliteration, general production source migration and live ingestion remain incomplete.
The separate [owner-supplied draft importer](docs/source-import.md) creates held
lyric-UUID sources without images/videos, preserving original text files and
literal supplied Latin. It is authorized only for conservative draft authoring;
the fixture publisher cannot publish these production sources. The importer
adapts approved explicit credit footers into verbatim source-only provenance,
without changing existing identities or the public artifact format.

The distinct [prelaunch lyric publisher](docs/lyric-publication.md) accepts
explicitly authorized unheld sourceFormat2 lyrics with permanent lyric/line UUIDs
and no images/videos. `npm run publish:lyrics` generates only canonical Kannada
public artifacts after merge. It is not the fixture publisher, production
ledger/transliterator or public-launch approval. Owner text review is complete;
remaining production/release gates, other holds and extraction exceptions stay open.
The [complete hosted-output preflight](docs/hosting-preflight.md) validates every
current-prelaunch public file and measures the entire configured Pages root,
including retained objects, before upload. Hosting settings own the inclusive
decimal ceiling/headroom; unsupported future bundles/images fail rather than
being silently omitted from validation or accounting.
Its separate [staged snapshot API](docs/hosting-preflight.md#isolated-staged-snapshot-filesystem-api)
now checks an isolated complete filesystem against freshly verified,
ledger-bound descriptor/original/policy/manifest/ZIP bytes and the same whole-site
headroom policy. It is read-only, accepts no retained extra files, and does not
change the current CLI/workflow, write output or authorize production activation.
The separate [isolated staging writer](docs/hosting-preflight.md#isolated-output-materialization)
now materializes those captured public bytes into an exclusively new site root,
admits whole-site bytes before writing and returns only after complete filesystem
preflight. Existing roots are never reused; failures leave the new candidate for
inspection, not a replacement publication. No live workflow calls this API.

The owner-authorized [provisional verse proposal workflow](docs/verse-proposals.md)
persists uncertain blank-layout candidates separately in `reviews/`, without
copying lyrics or changing source text, IDs, metadata or publication eligibility.
`npm run verses:propose` creates once or validates unchanged; `verses:validate`
preserves owner edits and fails on stale source hashes.

The independent [ZIP STORE byte prerequisite](docs/zip-store.md) constructs and
strictly verifies bounded deterministic archives of original gzip objects.
It takes explicit caller limits, is not wired into either publisher and does not
implement the production ledger, packing/planner or consumer offline lifecycle.
The separate [exact changedAt cohort packer](docs/bundle-packing.md) now uses
the published Shared planning limits to construct disjoint bounded archives
without mixing semantic-change timestamps. It remains a standalone prerequisite;
neither publisher, production ledger/manifest nor consumer lifecycle calls it.
The separate [verified publication-date audit](docs/publication-history.md)
checks historical encoded catalogs and explicit authenticated receipt metadata
to produce earliest-verified date candidates, keeping unknowns unresolved and
preserving removed identities. It does not activate dates or implement the
durable publication ledger; the existing feed remains unchanged.
The standalone [private ledger core](docs/publication-ledger.md) now validates
semantic-date state, sequence reservations, pending/confirmed receipts, exact
no-ops and conservative uncertain-deployment recovery. It uses approved reserved
logical timestamps and records observed confirmation times separately.
It performs no Git/network writes and is not wired to either publisher.
The separate [isolated Git store](docs/publication-ledger.md#isolated-git-persistence)
now conditionally persists direct-child state commits and records the deploying
phase before an explicit callback can expose content. Its real-Git synthetic
tests cover competing writers and crash/rejected-write recovery.
Reviewed initialization, full-production logical projections, protected job wiring and
authenticated deployment/manifest integration remain open.
The standalone [canonical logical item projection](docs/lyric-logical.md) supplies
strict semantic hashes for the current text-only public item version1. Synthetic
tests distinguish real logical edits from actual object/manifest recompression.
Full-production multilingual/metadata projection and projection-family migration
remain open; no real baseline dates or ledger state are initialized.
The read-only [semantic baseline audit and initialization review](docs/semantic-baseline.md)
now verify historical item bytes, compare logical versions, expose unavailable
evidence and pin a complete candidate review without inventing a legacy sequence.
The explicit [unsequenced bootstrap](docs/publication-ledger.md#explicit-unsequenced-bootstrap)
now constructs an inactive private version2 ledger with the complete pinned
baseline and projection identity. Legacy content stays unsequenced; new
reservations start at1, preserving cancellation gaps. Actual review approval,
protected state-branch creation/anchor and hosted activation remain gates.

The pure [staged canonical snapshot producer](docs/snapshot-producer.md) connects
the published Shared descriptor/manifest/transfer-policy contract to real logical
hashes, ledger-derived dates and actual original-gzip STORE bundles. It fully
verifies candidate bytes before reservation and binds descriptor sequence only
to the matching pending plan. It writes no source/output/state/network and
leaves both existing publishers/live feed unchanged. Complete production
multilingual/index contracts, output/deployment and client adapters remain open.
Its transfer-planning API revalidates actual artifacts and delegates their exact
snapshot-pinned policy/maps to Shared's existing planner. Returned remaining
request totals are not full network/storage estimates or client cache proof.
The [source snapshot adapter](docs/snapshot-producer.md#validated-source-preparation)
now shares one strict receipt-bound canonical projection with the prelaunch
publisher. It prepares in-memory snapshot artifacts from unheld supported records,
preserving text/layout/identities and refusing populated unsupported metadata.
It writes no sources/state/output, releases no holds and is not called by either
live workflow. Real-source generation remains post-merge only.
The [isolated staged deployment handoff](docs/snapshot-producer.md#isolated-staged-deployment-handoff)
now connects an explicit existing Git reservation to local staging, durable
`deploying` persistence, a final filesystem preflight and an explicit caller-owned
deployment/receipt-verification callback. Synthetic real-Git checks cover failed
boundaries, uncertain exposure and confirmation recovery. No hosted deployment
adapter, production branch initialization, credentials or live workflow is added.
Its `reserveCanonicalSnapshotInGit` admission helper now fully verifies the
candidate and descriptor limits before requesting any durable sequence change,
then delegates exact-tip conditional persistence to the same Git store. Valid
no-ops/retries remain byte/sequence/commit stable; invalid local bytes cannot
consume a reservation.
The [Git-bound source adapter](docs/snapshot-producer.md#git-bound-source-preparation)
now reads receipt/Markdown blobs from an explicit full commit rather than HEAD,
index or worktree. It reuses canonical validation through disposable local source
staging and binds the plan to those exact committed bytes. This establishes
byte/commit identity and requires containment in an explicitly supplied trusted
source-history tip. The caller must independently authenticate that tip; ancestry
does not establish review/rights approval or live deployment authorization.
No live workflow is changed.
The [hosted snapshot read-back audit](docs/snapshot-producer.md#bounded-hosted-read-back)
now verifies an explicitly started candidate's descriptor and every expected
artifact over bounded single-attempt HTTPS requests, with a final descriptor
recheck. It is read-only and returns byte-observation accounting, not an
authenticated deployment receipt or permission to confirm state.

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
  semantic-change ledger/state branch and monotonic sequence. The private ledger
  core and Git writer are isolated; public schemas/tables, protected job wiring,
  authenticated remote recovery and production integrations remain open.
- Individual gzip objects and ZIP STORE100/32MiB, images online separate; current-
  only hosting, explicit client restart when old targets unavailable. Whole validated
  Pages artifact with host/headroom gate, no source roots/CDN atomicity promise.
- Catalog/import/image/publisher knobs in Library settings, portable profiles/policy
  in Shared. Native manifests/locks own dependency pins; no hidden defaults/secrets.
- `settings/hosting.yml` owns the generated Pages root and hosting ceiling/headroom;
  the post-merge prelaunch workflow uploads only the root returned by successful
  `npm run publication:preflight`. This is not the staged snapshot's host adapter.

## Validation

```powershell
npm ci
npm run check
python tools\check_repository.py
git --no-pager diff --check
git --no-pager diff --cached --check
```

`npm run check` runs strict TypeScript and all fixture-publisher tests.
It also runs source/import metadata and canonical-publication tests and validates
the imported source set/receipt and persisted provisional verse proposals.
The isolated ledger Git suite requires installed Git and uses only disposable
synthetic bare repositories; it does not contact the live Library remote.
The read-back suite also requires installed OpenSSL1.1.1+ (`openssl` on PATH,
or the default Windows Git installation's `usr\bin\openssl.exe`). It generates
a disposable self-signed loopback certificate/key in an owned temporary directory
and runs native Node fetch in child processes. Only the trusted child receives
`NODE_EXTRA_CA_CERTS`; TLS verification stays enabled, and an untrusted child must
fail before an HTTP request. Missing certificate tooling fails the test, not a
skip. No key/certificate is committed or retained; this does not contact Pages
or authenticate production hosting/deployment evidence.
Use `npm run sources:import` only under the authorized
[draft workflow](docs/source-import.md); `npm run sources:validate` is non-writing.
`npm run sources:retry-footers` narrowly retries unchanged eligible held inputs
under the separately approved format rule; it never rewrites existing sources.
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

When Ruby is unavailable locally, the installed YAML dependency can perform the
equivalent workflow/issue-form syntax check (and check current settings):

```powershell
node --input-type=module -e 'import {readdirSync,readFileSync} from "node:fs"; import {join} from "node:path"; import {parseDocument} from "yaml"; for (const root of [".github","settings"]) for (const p of readdirSync(root,{recursive:true}).filter(p=>/\.ya?ml$/.test(p))) {const file=join(root,p); const doc=parseDocument(readFileSync(file,"utf8"),{uniqueKeys:true}); if(doc.errors.length) throw new Error(String(doc.errors)); console.log("Parsed "+file);}'
```

Update current docs/runbooks with changes; past choices and completed validation
records only in [HISTORY.md](HISTORY.md). Respect push authorization/protections,
unrelated work and independent Shared pins. Use issue/PR templates and
[security reporting](SECURITY.md). Project software is [Apache2.0](LICENSE),
not a relicensing of third-party lyrics/descriptions/images/recordings/trademarks.
