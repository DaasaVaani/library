# Private publication ledger core

Coverage: ALG-07, GEN-02/05 and EXP-03. The
[Shared publication specification](../shared/docs/implementation-specification.md#8-publication-transport-and-compatibility)
owns cross-repository requirements. This Library-private version2 state/receipt
protocol is a standalone prerequisite, not a public manifest schema, durable
state-branch writer or activated publication pipeline. The separate
[isolated Git store](../tools/publication-ledger-git.ts) implements conditional
remote persistence and the phase-before-side-effect boundary described below.
Neither existing publisher calls these tools. The pure
[staged snapshot producer](snapshot-producer.md) now derives candidate public
dates/artifacts from a plan and binds a descriptor to its exact reservation.
It performs no persistence/deployment and does not initialize the real catalog
or activate public dates.

## Inputs and date meaning

[The reducer](../tools/publication-ledger.ts) takes reviewed permanent lyric UUIDs
and logical SHA256 hashes. The future producer must compute those hashes from
RFC8785 canonical logical item projections, excluding derived dates and transport
representations. The separate
[canonical prelaunch projection](lyric-logical.md) implements this for the current
text-only item schema. It is not wired to a publisher and is not the full
production multilingual/metadata projection. Version2 binds the explicit
`canonical-prelaunch-v1` family in state, plans and preparation input.
Other projection families and migration remain gates.
Hash-shaped input alone does not establish a correct projection, schema, rights
review or whole-publication validation. No lyric text enters this state.

For future publications, `publishedAt` is a canonical UTC-millisecond logical
marker assigned before generation. New identities receive that marker as
`firstPublishedAt` and `changedAt`; logical-hash changes advance only `changedAt`.
Unchanged items retain both dates, including removal/reintroduction. Removed
identities remain tombstones, preserving their hashes and dates. A reintroduced
item with different logical content retains its first date and advances its
change date. Removal alone does not change an item's semantic-content date.

The marker is held only in the candidate until verified publication. Cancelled
never-started candidates do not commit dates. An uncertain candidate keeps its
original marker through reconciliation/retries. `confirmedAt` separately records
the observed successful deployment status, not exact first CDN availability.
The marker cannot precede the previous observed confirmation; a semantic edit
must strictly advance the affected item's change date. Clock rollback fails
explicitly rather than silently changing timestamps.

The [historical audit](publication-history.md) remains unchanged: its candidate
first dates are earliest verified successful deployment observations. Its result
is not automatically converted to ledger state. Reviewed historical first dates,
current logical hashes and a defensible semantic-change baseline are required
before any initialized state can be activated.
The [semantic baseline audit](semantic-baseline.md) supplies a verified,
projection-bound read-only review draft. The explicit unsequenced bootstrap below
can construct an inactive private ledger; real activation and approval remain
separate. Legacy publications have no advertised sequence and must not be given
an invented confirmed sequenced receipt.

## Explicit unsequenced bootstrap

`initializePublicationLedger(review, expectedReviewSha256)` constructs a new
in-memory version2 state from a pinned complete initialization review. The owning
caller must first recompute and verify the review from authenticated original
evidence using [the review-pin verifier](semantic-baseline.md).
Schema/hash matching alone does not grant owner approval or authenticate history.
Do not use this constructor to replace an existing active ledger.

State retains an immutable copy of the entire baseline review and its canonical
JSON-plus-LF SHA256, including projection, audit identity, original items/
tombstones and the genuine unsequenced legacy receipt summary. Its separate
committed item table initially equals that review. The counter starts at zero,
`confirmed` and `pending` are null, and the legacy `sequence` remains null.

An identical legacy manifest/item table is a true no-op: consume no sequence and
leave every byte/date unchanged. A new snapshot reserves1; cancellations may
leave gaps before the first confirmed sequenced publication. Only its genuine
matching started-deployment receipt becomes `confirmed`. Retain the baseline
review unchanged through cancellation, uncertainty and later confirmations.

Clock checks use the legacy confirmation until a sequenced confirmation exists.
Historical first dates and tombstones cannot be dropped or backdated by
transitions; same-content reintroduction/recompression preserves them. A real
semantic edit advances only its change date. New identities cannot predate the
verified baseline. Validate baseline hash, projection, ordered identities/dates
and exact latest catalog count on every read/transition.

Version1 private files and unknown projection families are rejected, never
silently converted or assigned a family. Production readers do not consume this
private format. No real state-branch creation/import/migration or hosted writer
activation is implemented here. Those require reviewed initialization/anchor
management and explicit deployment authorization; the Git store still requires
an existing protected state branch and cannot recreate a deleted one.

## State and transitions

State holds a format/version, projection identity, optional immutable unsequenced
baseline, highest ever reserved `lastSequence`, latest confirmed sequenced receipt
or null, UUID-sorted committed items/tombstones, and at most one pending
publication. Sequence starts at zero; actual snapshots use positive
safe integers. Cancelled reservations leave gaps. Exhaustion fails explicitly;
it never wraps or reuses a value. A true no-op still succeeds at exhaustion.

All operations validate state and require its exact canonical-byte SHA256.
Returned values are independent copies; inputs are not mutated.

1. `preparePublication`: with no pending publication, take an explicit input
   envelope with `logicalProjection`, `items`, `publishedAt` and `sourceCommit`.
   Reject unknown/mismatched families or input fields. Derive candidate item dates
   and bind the candidate to the current state fingerprint and source commit.
   Generate and fully validate artifacts using those exact dates. Preparation
   does not reserve a sequence or commit any dates.
2. `reservePublication`: bind the encoded manifest SHA256 to that plan and reserve
   one sequence. Persist the result durably before proceeding. The descriptor,
   not the manifest, carries the sequence; no manifest hash self-reference is
   introduced. An identical pending plan/hash retry returns the same state and
   sequence in either phase; a different candidate is refused.
3. `beginPublicationDeployment`: move `reserved` to `deploying`. The future
   adapter **must durably persist this phase before any external operation that
   could expose the candidate**. Repeating this transition is idempotent.
4. `confirmPublication`: only a matching started candidate can commit its item
   table and receipt and clear pending state. Evidence binds manifest, sequence,
   source commit and logical marker, with canonical observed confirmation time,
   workflow/attempt, artifact identity/digest, deployment and status identities.
   Replaying the exact latest receipt after confirmation is idempotent.
5. `cancelPublicationReservation`: permitted only in `reserved`, before the
   exposure-capable boundary. Preserve the reservation counter and prior
   confirmed receipt/items. A later attempt prepares again from the new state.

An unchanged confirmed manifest with identical item state is a true no-op:
retain all bytes, receipt, identity, dates and sequence. Different logical items
under the unchanged manifest hash are rejected. A new manifest hash can reserve
a new sequence even when item hashes/dates are unchanged, allowing transport or
other snapshot-level changes without falsely marking lyrics edited.

## Persistence, receipts and uncertain recovery

The core performs no network, Git or filesystem writes. Its expected fingerprint
is an in-memory stale-state guard, **not an atomic Git-tip comparison**. The
separate Git store performs expected-tip remote persistence; production job/
permission wiring remains unimplemented. The future trusted post-merge job must
use the dedicated state branch with force/deletion protection, preserve prior
state, and avoid source-PR writer permissions or bot bypass of main protection.
A failed write must stop before the next side effect. A competing writer must
reload/reconcile, not overwrite.

Receipt fields are strictly validated metadata, not cryptographic proof. The
adapter must authenticate the source/run/attempt/artifact/deployment/status
chain, bind the actual fully validated publication and sequence-bearing
descriptor to the reservation, and obtain the successful status time. This core
cannot detect a caller passing a fabricated but well-shaped receipt or a false
logical hash. Future consumers must not treat this private format as a signed
public contract.

After a crash in `deploying`, retain the exact immutable candidate and reserved
sequence. Inspect authenticated deployment history and reconcile that candidate;
positive matching evidence can confirm it. New candidates, timestamp changes,
cancellation and force-reset are refused. A failed run/status, missing artifact,
HTTP404 or caller-supplied "never exposed" flag is not sufficient negative proof.
There is deliberately no negative-proof/supersession escape hatch. If positive
reconciliation is impossible, remain blocked until a separately reviewed safe
recovery protocol exists; do not regenerate a different candidate under the
same sequence.

The state retains only the latest confirmed receipt, not a complete history.
The future state branch's retained commit history and authenticated deployment
evidence must provide historical provenance; local schema checks cannot prove
that an edited state has not deleted history or that IDs were never reused.

### Isolated Git persistence

`PublicationLedgerGitStore` requires an existing dedicated SHA1 bare repository,
an existing named remote, an explicit state ref in the
`refs/heads/publication-state` namespace, a positive safe-integer state-byte
ceiling and a bounded positive Git-process timeout. The future owning settings/
job must supply these explicitly; there is no selected production ref, remote,
byte ceiling, timeout or automatic initialization here. Source/main refs and
non-bare worktrees are rejected. Git must already be installed. Fetch and push
must resolve to the same single destination; split/multiple destinations fail.
The scratch repository/configuration/remote must be runner-owned and trusted,
not source-controlled executable configuration from an untrusted PR.

`load(trustedTip)` requires an independently trusted existing Git commit anchor.
It fetches the advertised tip and verifies the anchor is an ancestor, then reads
exactly one regular `ledger.json` blob. Check its actual byte size before reading/
decoding. A missing branch is an error, never an instruction to create or reset
it. A divergent/unavailable trusted anchor blocks reads. Do not simply trust a
freshly fetched tip as the initial anchor; reviewed initialization and durable
anchor management are separate gates.

`update(snapshot, command)` reloads and verifies both the exact expected Git tip
and the snapshot bytes before applying a core command. It accepts no arbitrary
replacement state. Unchanged results create no commit or push. Otherwise it
writes one bounded ledger blob/tree and a direct-child commit with exactly the
expected parent, then pushes only that commit/ref with an explicit
`--force-with-lease=<ref>:<expected-tip>` condition. The lease supplies remote
compare-and-swap, **not permission to rewrite history**: the newly constructed
commit is always a fast-forward child of the leased tip. No unconditional force,
deletion, main write or protections bypass is implemented. Normal remote
fast-forward/permission/hook checks still apply.

A rejected/stale write is never rebased or retried automatically. Read back the
remote tip after a successful push; a mismatch stops the caller. On timeout,
lost acknowledgment or any push/read-back error, the commit may already exist:
reload from the last trusted anchor and reconcile the actual durable state,
never assume failure means no write. Local Git objects or remote-tracking refs
are caches, not authority; no source worktree/index is used. Git automatic
maintenance is disabled for these bounded operations.

`deployReserved(snapshot, deployAndVerify)` performs and confirms persistence of
the `deploying` transition before invoking its callback. Only a fresh `reserved`
snapshot may enter; stale snapshots, rejected writes and already-started
deployments cannot invoke the callback. The callback receives a copy of the
immutable candidate and must implement whole-publication validation and
authenticated deployment/receipt verification. The store itself does neither.
After callback success, it conditionally commits the matching receipt. A thrown
callback, invalid receipt or failed confirmation write leaves the durable
started candidate pending; restart requires explicit receipt reconciliation
through `update(..., {kind: "confirm", receipt})`, not repeat deployment.
The separate
[staged snapshot handoff](snapshot-producer.md#isolated-staged-deployment-handoff)
now connects this boundary to the existing isolated writer and final
whole-filesystem preflight before an explicit caller-owned exposure/verification
callback. It accepts an existing reservation, not arbitrary replacement state,
and does not implement a hosted deployment service or authenticate receipt facts.

Git subprocesses have bounded time/output, no shell interpolation or interactive
prompt, and explicit errors that omit raw Git stderr, URLs and credential-bearing
diagnostics. Callback errors propagate to the owning caller. There are no new
credentials, network services, CLI auto-run entrypoint or workflow permissions.
Server-side force/deletion protection and least-privilege job credentials remain
required: ancestry checks cannot detect delete/recreate-at-the-same-tip (ABA),
and trusted Git history alone cannot authenticate deployment evidence or prevent
an independently authorized writer from appending fabricated state.

## Serialization and checks

Encoding is canonical safe-integer JSON plus one LF, hashed over those exact
UTF8 bytes. Decode takes an explicit positive safe-integer encoded-byte ceiling
from the caller, checks actual length before parsing, uses fatal UTF8, rejects
BOM/duplicate keys/noncanonical bytes and requires the exact private schema.
Unknown fields/versions, duplicate or unsorted UUIDs, impossible counters/dates,
pending base mismatch and altered candidate derivation fail explicitly. Reads
do not migrate, repair or silently discard unsupported state.

```powershell
npm run build
node --import tsx --test tools\publication-ledger.test.ts
node --import tsx --test tools\publication-ledger-git.test.ts
```

The synthetic suite is registered in `npm test`. It covers reservation/
confirmation boundaries, clock errors, exact no-ops, transport-only changes,
semantic edits, tombstones/reintroduction, gaps/exhaustion, retries/stale callers,
uncertain restart, forged candidate fields, strict byte ceilings/codec/schema
rejection and nonmutation. Full finalization uses
[all configured checks](../README.md#validation).
The Git suite uses actual independent bare repositories and a local bare remote,
not a mocked success flag: direct-parent history, single-file trees, no-op/retry
stability, competing writers, cancellations/gaps, durable-before-callback reads,
post-boundary crash/restart, server-rejected boundary/confirmation writes,
deletion/divergence refusal, redacted diagnostics, tampered snapshots, actual
byte ceilings, tree/codec rejection and destination isolation. It creates only
synthetic state and removes its own unique temporary fixtures. It does not
exercise GitHub transport acknowledgment loss, branch rules or production CI.

For N retained identities and B serialized state bytes, derivation is
O(N log N + B) time and O(N + B) space, including canonical state hashing/copies.
The pure core performs no history-wide scan. The Git store additionally performs
Git fetch/ancestry/object/conditional-ref operations, whose transfer and ancestry
cost depends on retained Git history; its subprocess output is bounded, not the
total fetched Git object database.
Full-production logical projections/manifest/policy binding, reviewed initialization/
anchor management, protected trusted-job wiring, authenticated deployment
adapter and hosted transport/permission/crash recovery checks remain required
before publisher integration.
