# Private publication ledger core

Coverage: ALG-07, GEN-02/05 and EXP-03. The
[Shared publication specification](../shared/docs/implementation-specification.md#8-publication-transport-and-compatibility)
owns cross-repository requirements. This Library-private version1 state/receipt
protocol is a standalone prerequisite, not a public manifest schema, durable
state-branch writer or activated publication pipeline. Neither existing publisher
calls it. It does not initialize the real catalog or activate public dates.

## Inputs and date meaning

[The reducer](../tools/publication-ledger.ts) takes reviewed permanent lyric UUIDs
and logical SHA256 hashes. The future producer must compute those hashes from
RFC8785 canonical logical item projections, excluding derived dates and transport
representations. The existing canonical JSON helper supplies safe-integer/string
serialization, but the production logical projection is not implemented here.
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
before a separate initialization/migration protocol can be implemented.

## State and transitions

State holds a format/version, highest ever reserved `lastSequence`, latest
confirmed receipt or null, UUID-sorted committed items/tombstones, and at most
one pending publication. Sequence starts at zero; actual snapshots use positive
safe integers. Cancelled reservations leave gaps. Exhaustion fails explicitly;
it never wraps or reuses a value. A true no-op still succeeds at exhaustion.

All operations validate state and require its exact canonical-byte SHA256.
Returned values are independent copies; inputs are not mutated.

1. `preparePublication`: with no pending publication, derive candidate item dates
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
future trusted post-merge adapter must read the dedicated state branch, compare
its expected Git tip and persist each transition using a conditional update.
It must guard force/deletion, preserve prior state, and avoid source-PR writer
permissions or bot bypass of main protection. A failed write must stop before
the next side effect. A competing writer must reload/reconcile, not overwrite.

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
```

The synthetic suite is registered in `npm test`. It covers reservation/
confirmation boundaries, clock errors, exact no-ops, transport-only changes,
semantic edits, tombstones/reintroduction, gaps/exhaustion, retries/stale callers,
uncertain restart, forged candidate fields, strict byte ceilings/codec/schema
rejection and nonmutation. Full finalization uses
[all configured checks](../README.md#validation).

For N retained identities and B serialized state bytes, derivation is
O(N log N + B) time and O(N + B) space, including canonical state hashing/copies.
No history-wide scan or persistence/remote-durability guarantee is implemented.
Production logical projections/manifest/policy binding, reviewed initialization,
durable state-branch writer, authenticated deployment adapter and real crash/
concurrency recovery tests remain required before publisher integration.
