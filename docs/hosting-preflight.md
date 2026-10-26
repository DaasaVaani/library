# Complete prelaunch hosting preflight

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

## Incremental validation

```powershell
node_modules\.bin\tsc.cmd --noEmit
node_modules\.bin\tsx.cmd --test tools\hosted-preflight.test.ts tools\publication-history.test.ts
```

These cover actual synthetic publisher output, independent whole-directory byte
measurements, exact configured headroom/role boundaries, retained objects/catalogs,
canonical/hash/summary failures, unsupported files, directory junctions and
explicit invalid/missing inputs. Use `npm run check` and the
[full validation gate](../README.md#validation) for finalization/push. Never run
actual owner-source generation on a source/review branch to manufacture evidence.
