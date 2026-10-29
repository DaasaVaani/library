# Staged canonical snapshot producer

Coverage: ALG-07/08, GEN-02/03/05, EXP-03 and SET-01/02.
[The pure producer](../tools/snapshot-producer.ts) connects the
[Shared canonical envelope](../shared/docs/snapshot-publication.md) to the
[private ledger](publication-ledger.md), [logical item projection](lyric-logical.md)
and [exact-cohort packer](bundle-packing.md). It is not called by either existing
publisher/workflow, does not write files/Git/network, and does not activate the
real baseline or change the live prelaunch feed. Full production multilingual/
metadata/index generation and tolerant consumer support remain open.

## API and exact ordering

1. `readSnapshotSettings()` validates the independently pinned Shared build
   safety settings, then constructs the exact version1 transfer policy from
   its complete `transferPlanning`. Only the seven applicable trusted role/
   descriptor byte ceilings are returned; no duplicated defaults or new remote
   safety overrides. Existing supported-capability settings remain fixture-only:
   this adapter does not claim that either application supports this new feed.
2. `prepareCanonicalSnapshot(state, expectedStateSha256, input, policy, bounds)`
   accepts only `items`, canonical `publishedAt` and `sourceCommit`.
   Each item must be the complete current canonical public v1 shape. Populated
   production metadata, fixture fields, generated variants and unknown item
   fields fail instead of being discarded. The separate source adapter below
   reuses current source validation and rejects unsupported populated public
   fields before constructing these items. Neither helper grants source
   publication/rights approval.
3. Validate all items and derive their exact logical hashes, then call the ledger's
   preparation API. Use only its derived first/change dates, preserving tombstones
   privately. Catalog order is UUID order; literal item values, line order, tags,
   whitespace and Unicode are never normalized/reordered.
4. Encode canonical item/policy JSON without LF with the existing deterministic
   gzip profile. Enforce actual encoded/decoded role bounds. Pack original item
   gzip bytes by exact derived `changedAt`; policy stays individual. Publish every
   original object even when bundled. Manifest maps bind roles/hash/path/sizes,
   dates, capabilities, policy and complete archive metadata.
5. Fully verify the resulting manifest and every actual artifact before returning
   a prepared plan/reference/map. No sequence is injected into manifest bytes,
   no observed receipt is fabricated and no mutable ledger dates are committed.
6. `reserveCanonicalSnapshot` repeats full verification, then invokes the pure
   ledger reservation reducer. For a new reservation/retry, check its actual
   descriptor byte size before returning any candidate state. Failure cannot
   consume a durable sequence. A true no-op returns unchanged ledger state and
   consumes nothing, including at sequence exhaustion.
7. The owning writer must persist the plan/hash reservation using the
   [conditional Git store](publication-ledger.md#isolated-git-persistence).
   `bindCanonicalSnapshot` verifies the fresh ledger fingerprint, exact pending
   plan/hash and all actual artifacts again, then emits the descriptor carrying
   that reservation's exact sequence and a copied artifact map. It accepts
   reserved/deploying retries but does not establish durability or permission.
   Never substitute an arbitrary sequence or persist the pure reducer result as
   proof that remote Git acknowledged it.
8. Before any exposure-capable operation, use the store's durable `deploying`
   boundary; only genuine authenticated matching deployment evidence may confirm
   dates/sequence. Uncertain exposure remains pending. Neither the producer nor
   a successful local byte check supplies that evidence.

Binding creates only descriptor bytes; artifact bytes/manifest hash remain
identical. A later generation marker for unchanged confirmed content is a true
no-op. Policy/repacking changes may create a transport-only new snapshot without
advancing semantic item dates. Moving from the old unsequenced catalog to this
different envelope necessarily creates a new manifest even with unchanged items;
it must use a real new reservation, never assign a sequence to old history.
The separate read-only
[staged filesystem preflight](hosting-preflight.md#isolated-staged-snapshot-filesystem-api)
repeats binding/verification, compares every actual staged file with captured bound
bytes and counts the entire isolated site against the explicit hosting policy.
It includes original-plus-bundle duplication, rejects missing/extra/changed files,
and neither writes staging nor establishes durable reservation/deployment authority.
The separate [isolated staging writer](hosting-preflight.md#isolated-output-materialization)
materializes captured bound bytes only into an absent explicit site root, then
requires that same whole-site preflight. It writes no source/private state and
does not replace the live publisher or grant exposure permission.

## Verification and trust

Full verification independently reads actual manifest/policy/item bytes from the
map, checks encoded SHA256/actual length/path, bounded gzip decode, exact decoded
length, canonical JSON/fatal UTF8 and this producer's exact deterministic gzip
profile. Concatenated/trailing/recompressed non-profile gzip is not silently
accepted as generated output. This is stricter than a general compatible consumer
decoder and does not redefine valid historical evidence.

Schema and semantic metadata validation precede lookups. Each decoded item must
match catalog UUID/title/ordered tags and the plan's exact logical hash and dates.
Actual ZIP bytes must pass the strict deterministic STORE decoder and match
declared members and each original gzip byte-for-byte. Missing/additional paths,
source/media leakage, rehashed but corrupt archives, forged metadata, wrong
reservations and stale state all fail explicitly; no partial success is returned.
Returned bound buffers are copied and cannot mutate the prepared publication.

For N items and B actual item/archive bytes, packing is O(N log N + B); byte
verification and exact recompression are O(B) with retained in-memory artifacts.
This is bounded per artifact, not a streaming writer, total host-headroom check,
process-wide memory guarantee or consumer staging-space admission algorithm.

## Validated source preparation

`prepareCanonicalSourceSnapshot(sourceDirectory, sourceBounds, state,
expectedStateSha256, input, policy, bounds)` connects current strict source
validation to in-memory canonical snapshot preparation. The only `input` fields
are explicit `publishedAt` and `sourceCommit`; runtime extras, including injected
`items`, fail. Source limits remain explicit `maxSourceFileBytes` and
`maxTotalSourceBytes` from the owning lyric-publication settings; snapshot role/
policy limits remain the caller's trusted Shared settings. No new defaults,
configuration, CLI, source generation permission or live workflow is added.

The adapter captures ledger/input/policy/role bounds before filesystem awaits;
the shared loader captures source limits likewise. One shared
`readCanonicalSources` implementation now serves both this adapter and the
existing prelaunch publisher, avoiding divergent hold/metadata/identity rules.
It admits the complete source inventory including the receipt against source
byte ceilings, checks the import receipt/lock and parses every Markdown source
with the existing strict parser and complete identity/provenance checks.
Root/entry links and unexpected files/directories are rejected. Work must run
in a stable isolated checkout; these checks do not lock or authenticate source
Git state, detect all hostile concurrent rewrites or prove `sourceCommit` matches
the current filesystem. The owning protected caller must establish that binding
or use the separate Git-bound adapter below; neither API authenticates review.

Malformed held records fail rather than disappearing. Valid held records remain
excluded; no unheld items is an explicit error. The result is `{prepared, held,
extractionExceptions}`: `held` counts actual held parsed records and
`extractionExceptions` counts unimported receipt entries. Neither count or private
provenance enters public artifacts. Existing receipt truth/hold authorization is
not inferred from these numbers.

Only current text-only items are projected: permanent lyric UUID, literal title/
ordered tags, canonical script and exact ordered line UUID/text/layout records.
Populated classification/context/verses/media or positive Source Latin eligibility
requires another adapter and fails explicitly; no metadata is silently dropped.
Null/false Source Latin eligibility and source-only evidence remain source-only
under the current canonical prelaunch contract, not multilingual publication.
Then the unchanged pure producer derives logical hashes/dates and verifies all
artifact bytes against the captured ledger and exact pending preparation rules.

Preparation writes no output/source/state/network, releases no holds, reserves no
sequence and initializes no real baseline. Consumers still cannot read sources.
Subsequent explicit reservation/binding/staging retain their separate durability/
exposure gates. Real-source generation remains post-merge; synthetic tests alone
exercise source-to-prepared-to-staged bytes here. Complete production metadata,
Source Latin, reviewed transliteration/index generation, source rights review and
protected source-commit/deployment wiring remain open.

For source bytes S and prepared artifact bytes B, parsing/projection adds O(S)
work plus filename sorting and existing parser/receipt validation. It retains
projected items before the existing in-memory producer retains/copies artifacts;
source logical bounds and per-artifact ceilings are not measured peak-heap limits.

## Git-bound source preparation

`prepareGitCanonicalSourceSnapshot(options, sourceBounds, state,
expectedStateSha256, input, policy, bounds)` prepares the same canonical candidate
from exact committed source bytes. `options` explicitly supplies absolute
`repositoryDirectory`, a restricted slash-separated relative Git `sourcePath`
(for example `library`) and positive bounded `gitTimeoutMs`. This Git-tree path
is not an OS filesystem path; no absolute/dot/parent/backslash/revision/option
syntax is accepted. No product defaults, CLI or workflow are introduced.

`input` still contains only `publishedAt` and `sourceCommit`, now requiring a full
lowercase 40-hex SHA1 **commit object**, not HEAD, an abbreviation, tag, tree or
revision expression. Worktree and bare repositories are supported. The adapter
never checks out, executes hooks/source code, changes HEAD/index/refs or fetches
objects. Missing local objects fail; provision the trusted repository separately.
An explicit command-scoped bare-repository allowance permits the caller-selected
bare path even on hosts disabling implicit bare discovery.

Capture caller state, options, dates/policy and bounds before awaits. Git runs
without shell interpolation/interactive prompts, with object replacements and
lazy fetching disabled and inherited repository-location/object redirections
removed. Commands have the explicit per-process timeout and bounded stdout/
stderr (`max(65536, maxTotalSourceBytes)`). Process failure/timeout/output overflow
is an explicit redacted error, never a partial successful source read. These
are per-command limits, not a global wall-clock or Git object-database budget.
The repository/configuration and runner must already be trusted; this is not a
sandbox for malicious Git configuration or object-database mutation.

Inspect only the declared commit's source tree. Its complete flat inventory must
contain a receipt and only regular non-executable `100644` UUID Markdown blobs.
Reject nested trees, symlinks, gitlinks, executable modes and unknown names rather
than following or filtering them. Before reading blob bodies, inspect every
actual blob size and enforce the source file/total limits including receipt.
Read by captured blob object identity and verify returned length. LF/CRLF and all
other source bytes are read literally, with no checkout filters/autocrlf applied.
The unchanged source parser owns its documented CRLF handling and literal layout.

Materialize only these bounded source bytes into a unique OS-temp directory,
then reuse `readCanonicalSources` for receipt/identity/provenance/hold/schema and
unsupported-public-field validation. Cleanup removes only that newly owned
temporary directory on success or failure; cleanup errors also fail explicitly.
No temporary path, receipt/provenance or raw source enters the public artifacts.
The existing pure snapshot producer binds its resulting plan to the exact input
commit and returns the same `{prepared, held, extractionExceptions}` shape.
The original repository/worktree, ledger and caller objects remain unchanged.

Dirty worktrees, staged edits, moved HEAD, untracked worktree files and local
replacement refs cannot substitute for committed source bytes. This closes
byte-to-declared-commit binding, **not** authority: the protected future caller
must separately authenticate the repository/approved commit, successful checks,
trusted-main ancestry, rights/review, tooling/Shared/settings identities and
deployment permission. No real-source generation is authorized on review
branches and no baseline, sequence, protected branch or feed is activated here.

For source bytes S and F entries, Git uses O(F) bounded subprocesses plus bounded
metadata output; temporary disk is O(S), in addition to the existing parser and
in-memory producer allocations. There is no streaming/peak-heap guarantee.

## Isolated staged deployment handoff

`reserveCanonicalSnapshotInGit(store, current, prepared, bounds)` connects pure
snapshot admission to the existing Git store before deployment. It captures the
ledger, plan/reference, original Buffer bytes and trusted role limits, then calls
`reserveCanonicalSnapshot` locally. Full actual-byte/manifest/policy/item/ZIP
verification and exact descriptor admission must succeed before any Git await.
Invalid candidate bytes or an oversized descriptor therefore cannot consume a
durable sequence or create a remote state commit.

After local admission, delegate only `{kind: "reserve", plan, manifestSha256}` to
the store's existing exact-tip conditional update. Do not write the pure reducer's
returned state as arbitrary replacement state. The store reloads/validates current
remote state, checks the expected tip and applies the same reducer before pushing
its direct-child commit. Concurrent/stale/server/acknowledgment failures propagate
with no automatic retry/rebase; reload and reconcile through existing policy.
An identical confirmed snapshot remains a true no-op; an exact pending retry
retains its sequence and bytes, with no new Git commit. Local Git objects do not
prove a rejected reservation did or did not reach the remote.

This helper initializes no state/anchor, creates no real branch, selects no
permissions and grants no baseline/content/deployment approval. Callers must
already supply a trusted store, genuine current snapshot and explicit bounds.
Its output can feed the separate staged handoff below; it does not invoke that
handoff or exposure automatically.

`deployCanonicalSnapshot(store, reserved, prepared, bounds, siteDirectory,
snapshotDirectory, hostingPolicy, deployAndVerify)` is isolated Library tooling
for an **already durably reserved** snapshot. `store` is the existing
`PublicationLedgerGitStore`; `reserved` must be its fresh exact reserved snapshot.
The complete prepared candidate, ledger and limits are copied before awaits,
including Buffer copies rather than structured-clone byte arrays. Paths and
limits are explicit; no CLI, owning settings defaults, live service, credentials
or deployment workflow is added.

1. Reject non-reserved/restarted input or a missing callback.
2. Materialize the exact candidate into a new isolated site through
   `stageCanonicalSnapshot`. Full verification/headroom admission precede writes,
   and whole-filesystem preflight must succeed. Failure here cannot start a
   deployment; the original durable reservation remains reserved/cancellable.
3. Call the store's `deployReserved`, which checks the fresh remote tip/state,
   conditionally persists `deploying` and verifies acknowledgment before invoking
   its callback. Stale input/server rejection cannot invoke exposure even if local
   staging succeeded. An unused local candidate may remain for inspection.
4. Inside that durable boundary, repeat the complete filesystem preflight against
   the captured candidate. Only then call the explicit `deployAndVerify` with
   `{siteDirectory, snapshotDirectory, candidate, preflight}`. `candidate` is the
   store's copied actual started pending record; the report binds the exact
   sequence/manifest and measured whole-site bytes.
5. The callback must deploy **only** that exact isolated tree and return genuine
   authenticated matching deployment evidence as a `PublicationReceipt`. The
   existing store then performs the conditional confirmation. The returned
   `LedgerGitSnapshot` is confirmed only after that persistence succeeds.

Local bytes/preflight, callback resolution and receipt-shaped fields are not
authentication. The future trusted adapter must verify actual deployment
identity/status/artifact/source/manifest binding, preserve tree immutability
through upload and enforce the approved permissions/receipt protocol. This helper
does not upload, poll GitHub, create an artifact or authenticate a caller's proof.
Run only in trusted isolated runner-owned paths/configuration; a final preflight
is not an immutable seal or concurrent-writer defense.

Any failure after the durable boundary, including the final preflight before
exposure, is conservatively started/uncertain. Callback/receipt/confirmation-write
errors propagate; never automatically cancel, retry exposure or regenerate under
that sequence. Reload durable state from the independently trusted anchor and
reconcile genuine evidence through the store's explicit confirmation command.
Already-started input is refused before new staging. A failed confirmation may
have committed remotely; reload rather than assuming it did not. No local
candidate is automatically removed or existing tree reused.

The helper reserves no sequence and initializes no baseline/state branch. It
does not grant deployment permission, remove holds, change production formats,
wire a real publisher or resolve branch protections/source-commit authentication.
It adds another complete filesystem preflight and in-memory candidate copy to
the existing staging/binding/Git costs; it is not a streaming or peak-memory proof.

## Snapshot-pinned transfer planning

`planCanonicalSnapshotDownload(prepared, bounds, verified)` repeats all actual
artifact verification above and passes the decoded exact manifest/policy to
Shared's existing `planSnapshotDownload` bridge and deterministic integer planner.
There is no duplicate greedy implementation or application of newer settings.
Every manifest object, including policy, is required; bundle metadata comes only
from the verified physical ZIPs. Declared request bytes are actual stored bytes,
including ZIP overhead and all reused/unneeded members.

`verified` must come from independently verified reusable client objects. A
hash list is not proof of cache presence/health and this producer tooling cannot
verify a remote client's storage. The function validates hash-list structure,
not that external claim. A client must verify its own cache before supplying it,
including the already-fetched exact policy object to avoid counting it twice.
The returned total covers remaining selected artifact requests only; it excludes
descriptor/manifest acquisition already needed to plan, HTTP headers/retries,
app shell and storage. It is not a complete network/storage cost or permission
to start a transfer without explicit consent.

Synthetic actual-byte tests independently extract selected archives, prove
exactly-once missing original/policy coverage, compare measured request totals,
cost/extra/budget identities and complete reuse, and verify policy-only updates
retain old original reuse while using the new exact policy. Corrupt actual bytes
fail before planning even if every hash is claimed reusable. Client consent,
download/retry/resume and offline activation remain unimplemented here.

## Validation and remaining integration

```powershell
npm run build
node --import tsx --test tools\git-source-snapshot.test.ts tools\canonical-sources.test.ts tools\lyric-publisher.test.ts tools\snapshot-staging.test.ts tools\snapshot-preflight.test.ts tools\snapshot-producer.test.ts tools\publication-ledger-git.test.ts
```

Synthetic tests cover deterministic exact bytes/policy/ZIP, literal preservation,
no input mutation, genuine edits/tombstones/reintroduction, transport-only/no-op
stability, cancellation gaps, retry/deploying descriptor identity, stale/mismatched
reservations, every actual role ceiling at equality/+1, descriptor admission
before reservation, byte/metadata tampering and rehashed corrupt STORE archives.
A real independent-bare-Git integration persists the generated manifest
reservation, reads back `deploying`, binds actual descriptor bytes inside a
synthetic callback, confirms a synthetic receipt and proves the subsequent no-op.
It is not a real deployment, GitHub branch-rule or permission validation.
Additional real-Git handoff checks read back the durable started phase inside a
synthetic exposure callback, compare actual staged bytes, refuse stale/rejected
boundaries, preserve reserved state on staging failure, retain uncertainty after
callback/final-preflight/confirmation failure, explicitly reconcile genuine
synthetic receipts, forbid replay and isolate caller mutation.
Reservation admission tests additionally prove invalid descriptor/corrupt bytes
leave the actual remote counter/history unchanged, exact descriptor equality and
pending retries pass, stale/rejected writes are not retried, confirmed no-ops
create no commits and post-entry caller mutation cannot change the reserved plan.

Full finalization uses [all configured checks](../README.md#validation).
Remaining gates include full production item/index/policy/profile contracts,
full-production source/item/output/headroom adapters,
consumer consent/storage/lifecycle integration, actual baseline approval,
protected state initialization/anchor permissions, authenticated deployment/
descriptor sequence binding and recovery/release/device evidence.
