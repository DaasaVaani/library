# Complete hosting preflight

## Scope and authority

This is the Library-owned CI-01/03/06 hosting safety slice for the existing
[canonical prelaunch publisher](lyric-publication.md), not production snapshot
activation or proof of release readiness. The
[Shared hosting contract](../shared/docs/implementation-specification.md#8-publication-transport-and-compatibility)
defines the approved whole-output ceiling/headroom direction.

`settings/hosting.yml`, validated by `hosting.schema.json`, owns the complete
generated site root, decimal hosting ceiling and allowed utilization percent.
The initial ceiling is 1,000,000,000 bytes; at 80% the inclusive limit is exactly
800,000,000 bytes. Compute `floor(ceiling * percent / 100)` using exact integers,
not floating-point percentage comparisons or binary GiB. Reject unsafe/nonpositive
ceilings and percentages outside integer 1..100.
The lyric publisher's existing settings still own its nested output directory;
it must be strictly inside this site root.

## Command and complete inventory

From a validated merged checkout, after canonical generation:

```powershell
npm run publication:preflight
```

There are no path overrides or implicit settings fallbacks. The command verifies
that the resolved site is physically inside Library and inventories the **entire
site root**, not just the current manifest's selected objects. It does not generate
source variants or change artifact bytes. The pure filesystem API
`preflightHostedLyrics(siteDirectory, lyricDirectory, bounds, policy)` takes
explicit absolute staging paths, positive role bounds and explicit hosting limits.
Its caller owns those staging paths; the CLI additionally binds owning settings
to this checkout. The command emits counts, actual hosted bytes, computed limit
and current manifest hash, never source text, private evidence or payload dumps.

Every actual regular file contributes its complete encoded file length, including
the plain descriptor and all retained unreferenced objects/catalogs. Equality at
the limit passes; one additional byte fails. Declared manifest sizes, song counts,
selected download costs and a single snapshot subtotal are not substitutes.
No inode/content deduplication discount is applied. The Pages upload archive and
HTTP/deployment overhead are not files hosted under this root and are not counted.

The current allowlist contains only the configured lyric directory's `latest.json`
and `objects/<lowercase-sha256>.json.gz`, plus their containing directories.
Unexpected roots/files/directories, source Markdown/import receipts, hidden files,
temporary/lock files, images, videos and ZIP bundles fail explicitly. Links/junctions
and nonregular files also fail. Unsupported future artifacts are rejected, not
ignored or counted as validated. Extending this gate to the staged snapshot,
bundles or online images requires their actual public adapters and validation;
all resulting files, including duplicate bundle member bytes, must then count.

## Integrity before upload

- Descriptor: bounded canonical JSON plus one LF, strict current schema and exact
  manifest role/path/hash/encoded/decoded-size binding.
- Every object, referenced or not: bounded actual encoded bytes, filename SHA256,
  bounded decompression, this producer's exact deterministic gzip bytes,
  fatal UTF-8/canonical JSON and supported strict item/catalog schema.
- Items: existing canonical logical-item validator, including unique readable
  line identities; source-only fields and future formats are rejected.
- Every retained catalog: unique lyric identities and exact actual item role,
  original path, both sizes, lyric UUID, title and ordered tags.

Validation reads one artifact at a time, retaining object-size/role/summary
metadata rather than all lyric bodies. Catalogs are reread and rehashed for
reference checks after inventory. This is not streaming decompression or a proved
production memory budget. It can fail early on excess bytes or invalid data and
never returns a successful partial inventory.

## Workflow and failure/recovery

The post-merge workflow runs this command after `publish:lyrics` and before Pages
artifact upload. On success the CLI writes the validated settings-owned site path
to the step's `GITHUB_OUTPUT`; the upload consumes that exact output, not a second
hard-coded root. Failure to publish the step output is also an error. Normal local
use without that environment variable has no workflow-output side effect.

A failure prevents upload/deploy, so the previously deployed site stays usable.
It may leave failed generated **local staging** in place; inspect the exact error
and paths, correct settings/source/tooling and rerun normal validation/generation
in an isolated merged checkout. Never raise limits merely to hide excess output,
delete source/history broadly, or bypass the failing step.

The API is read-only, not a lock, immutable-artifact seal, deployment receipt or
concurrent-writer fence. Run it in the isolated job after all writers finish, and
do not mutate the tree between preflight and upload. It authenticates neither
source review/rights nor remote Pages contents. Current-only production hosting,
ledger/sequence binding, full multilingual/index/media output, live HTTPS checks,
bandwidth operations and release/device measurements remain separate gates.

## Isolated staged snapshot filesystem API

The separate `preflightCanonicalSnapshot(siteDirectory, snapshotDirectory,
state, expectedStateSha256, prepared, bounds, policy)` covers actual staging of the
[canonical snapshot producer](snapshot-producer.md). Both directories must be
absolute and the snapshot directory strictly inside the complete site root.
`bounds` are the producer's explicit trusted role ceilings; `policy` is the same
explicit `HostingPolicy` used by the existing prelaunch gate. No settings defaults
or second hosting ceiling are introduced.

Before any filesystem await, it calls `bindCanonicalSnapshot`: validate the fresh
ledger fingerprint, exact pending plan/manifest and all actual canonical
JSON/gzip/item/policy/STORE bytes, then capture independent copies of the bound
artifact buffers and descriptor. Caller mutation cannot change those captured
expectations during filesystem reads. Reserved and deploying phases are accepted;
this pure check does not prove reservation durability or deployment permission.

The shared filesystem walker then inventories the entire site root, rejecting
links/junctions, nonregular files and every unexpected file/directory. Only the
exact expected descriptor and artifact paths, plus their containing directories,
are permitted. Unlike the existing prelaunch gate, this isolated API does not
accept retained objects/catalogs or unrelated valid snapshots. Missing files,
shortened/modified bytes, a different sequence/LF or oversized files fail.
Every disk file must equal its independently verified bound bytes, not just match
a declared length or hash-shaped filename. Therefore physical ZIP members and
their corresponding individually hosted gzip objects are both counted in full.
The inclusive whole-site byte limit uses the same exact-integer calculation;
equality passes and one byte over fails. No partial-success report is returned.

The report has `stage: "staged-snapshot"`, exact reserved `sequence`,
`manifestSha256`, `fileCount`, `artifactCount`, `totalHostedBytes` and
`headroomLimitBytes`. Artifact count includes the manifest, policy, originals and
bundles but not the descriptor; file count includes all of them. No ledger,
receipt, source text or payload is emitted.

The API writes no files/state/network and does not materialize an output tree.
Existing `publication:preflight` and the Pages workflow still accept only the
current prelaunch format and still reject bundles/future artifacts. A future
isolated writer must finish before this check and must not mutate staging before
upload; the API is not a lock, seal or TOCTOU/concurrent-writer guarantee.
It does not initialize/approve the real baseline, persist a reservation, confirm
exposure or activate the new feed.

For F files and B retained artifact bytes, filesystem traversal adds per-directory
sorting bounded by O(F log F), plus O(B) byte comparisons. Binding also repeats
the producer's full verification and retains independent expected buffers for the
whole snapshot; reading one disk file at a time does not make this a streaming
writer or a process-wide/peak-memory proof. Full production multilingual/index/
media outputs, source/output adapters, durable deployment and consumer lifecycle
remain separate gates.

## Isolated output materialization

`stageCanonicalSnapshot(siteDirectory, snapshotDirectory, state,
expectedStateSha256, prepared, bounds, policy)` writes an already prepared,
ledger-bound canonical candidate. Paths are explicit absolute caller-owned
staging paths; the snapshot directory must be strictly inside the site root.
A future settings-owned caller must provide them; this API introduces no path
defaults, source adapter, CLI or workflow activation.

Before any filesystem await, capture the ledger, validated plan/manifest,
independent bound artifact/descriptor bytes and explicit safety/hosting limits.
Validate the pending reservation and all actual prepared bytes through the
existing binder. Count descriptor plus every artifact, including duplicated
original/ZIP bytes, using the existing exact hosting limit. Invalid inputs or
one byte beyond that limit fail before creating any output directory.
Later caller mutation cannot change the captured candidate or loosen its limits.

The immediate site parent must already exist as a regular non-link directory.
Create the site root exclusively, never recursively creating its parent or
accepting an existing directory, file or junction. Create only the expected
snapshot subdirectories and write each bound artifact with exclusive `wx`
creation, then the exact canonical descriptor plus LF. No source, private ledger,
receipt or transient lock file is copied into the public tree.
Run the complete staged filesystem preflight over the captured inputs and actual
new site before returning its `SnapshotPreflightReport`. The current producer
requires publishable items; empty catalogs remain rejected before staging.
This writer does not broaden supported publication formats or invent content.

This is local materialization, not atomic publication, a deployment callback or
proof of remote durability. Writing the descriptor after other files establishes
only local operation order, not CDN atomicity or exposure permission. Run only
inside an isolated job-owned staging location; the writer is not an OS sandbox,
ancestor-link audit or defense against an adversarial concurrent filesystem
writer. Existing live output is never an acceptable destination.

Failures throw explicitly, never return a usable candidate or alter an existing
site. A failure after exclusive root creation can leave a partial **new** candidate;
the API deliberately does not recursively delete or repurpose caller paths.
Keep it unexposed, inspect the reported error and exact caller-supplied path,
and retry only with a new absent root. Remove an owned partial candidate only
after explicitly resolving/inspecting that exact path. Do not bypass the
preflight, upload partial output or relax bounds to hide an error.

Successful completion does not fsync a durable journal, reserve/confirm state,
approve the baseline, change dates or activate a feed. The owning future publisher
still needs reviewed source adaptation, protected Git persistence, exposure
fencing and authenticated deployment/reconciliation. The existing prelaunch
publisher, CLI and Pages workflow remain unchanged.

Writing is O(B) for total descriptor/artifact bytes, followed by full verification
and per-directory inventory sorting. Captured buffers and preflight copies add
live allocations beyond the prepared input and current disk buffer; this is not a
streaming or measured peak-memory guarantee.

## Incremental validation

```powershell
node_modules\.bin\tsc.cmd --noEmit
node_modules\.bin\tsx.cmd --test tools\snapshot-staging.test.ts tools\snapshot-preflight.test.ts tools\hosted-preflight.test.ts tools\snapshot-producer.test.ts tools\publication-history.test.ts
```

These cover actual synthetic publisher output, independent whole-directory byte
measurements, exact configured headroom/role boundaries, retained objects/catalogs,
canonical/hash/summary failures, unsupported files, directory junctions and
explicit invalid/missing inputs. Use `npm run check` and the
[full validation gate](../README.md#validation) for finalization/push. Never run
actual owner-source generation on a source/review branch to manufacture evidence.
The staged suite independently measures actual nested files, including bundle
duplication, exact whole-site equality/+1, every missing/corrupt/truncated/extended
artifact, forged sequence/LF, stale reservations, invalid prepared bytes, unexpected
retained files/directories, junctions and captured-buffer/input preservation.
Staging tests additionally compare every actual byte with independent expected
files, decode original ZIP members, preserve empty-catalog refusal, reject existing roots/
parent junctions and pre-write invalid/oversized candidates, preserve previous
output through real filesystem failure, and mutate caller inputs after entry.
