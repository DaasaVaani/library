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
The [source-run observer](github-source-run.md) separately checks one expected
successful source push-CI identity and before/after source branch tip using
bounded authenticated CLI reads. This is not the publisher's `workflow_run`
identity or artifact/deployment/status/receipt verification. Neither its report
nor a positive hosted byte audit authorizes confirmation.
The [artifact byte observer](github-artifact.md) additionally checks pinned
artifact/publisher-head metadata before and after an exact bounded body digest/
size observation. It does not verify run attempts, archive members, candidate
contents, deployment/status facts or a receipt, and cannot authorize confirmation.

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
Its separate `reserveCanonicalSnapshotInGit` helper now performs full snapshot
byte and descriptor-limit admission before invoking this store's conditional
reserve command. The ledger reducer alone intentionally accepts logical plans/
manifest hashes rather than artifact bytes; snapshot-producing callers should
use that stronger owning admission path, not infer artifact validity from the
generic store API.

Git subprocesses have bounded time/output, no shell interpolation or interactive
prompt, and explicit errors that omit raw Git stderr, URLs and credential-bearing
diagnostics. Callback errors propagate to the owning caller. There are no new
credentials, network services, CLI auto-run entrypoint or workflow permissions.
Server-side force/deletion protection and least-privilege job credentials remain
required: ancestry checks cannot detect delete/recreate-at-the-same-tip (ABA),
and trusted Git history alone cannot authenticate deployment evidence or prevent
an independently authorized writer from appending fabricated state.

### Approved infrastructure setup

The owner authorizes setup of a dedicated publication-state infrastructure
namespace, separate from source/development branches. Source implementation
continues only on `main`; its existing protections are not weakened.

| State namespace protection | Ruleset | Bypass |
| --- | --- | --- |
| No deletion or non-fast-forward history replacement | 26756014 | None, including administrators |
| Restrict creation and updates during setup | 26756015 | Repository-admin role5 only |

Both active rulesets include `refs/heads/publication-state` and
`refs/heads/publication-state/**`, with no exclusions. The creation/update
exception is setup authority, not baseline approval or a publisher-bot exemption.
No automation actor is authorized by these rules. Do not weaken the independent
no-bypass history guard when adding a separately reviewed least-privilege writer.
Verify actual rule applicability to the chosen root/nested ref before any write.
Current configuration does not create a state branch, initialize a ledger,
select production Git bounds/ref/remote or activate either publisher.

The owner-approved initial trust inputs are:

| Input | Approved identity |
| --- | --- |
| Closed-window baseline review SHA256 | `dc82248fdccfa4142b205e8ea2d89af78be5304bdafe1661e37ef71409cb61ac` |
| Independently prepared initial root Git commit | `13abbdf05569050c6a3953bd8e85aaf0a3d6ffd9` |
| Inactive initial ledger canonical-byte SHA256 | `14fcec667b39519b9e468b910076dbedc6896b44769179271011d5f9eda8f533` |

These are independently approved authorization inputs, not a fetched-tip default
or permission to expose a new feed. Retain the exact closed historical evidence
scope in the immutable baseline. Later byte-identical legacy republications are
not instructions to replace the approved review, advance its dates or invent a
sequence. Before first real initialization, independently verify that the served
legacy catalog and logical item table still match the approved baseline, as well
as the actual source/hosting evidence. A semantic/catalog change or changed
approved historical evidence requires renewed baseline/anchor review; never
silently import a replacement into an existing active ledger.

Before actual initialization, the owner must separately approve the refreshed
complete pinned baseline review and independently trusted initial commit anchor.
Authenticate the available successful publication history, retained original
catalog/item evidence and latest live catalog after current main checks/
deployment settle. Never substitute a freshly fetched remote tip for an anchor.
The review remains `review-required` even when its pin verifies; preserve the
explicit approval outside generated data. A changed admitted catalog, evidence
scope, receipt, date, projection or item invalidates the review pin. Recheck the
approved evidence at the initialization boundary and stop on changes, rather than
silently regenerate or approve a replacement. Hosted deployment/job wiring,
whole-publication validation and genuine confirmation remain separate gates.

### Selected App writer and credential setup

The selected ongoing writer is a dedicated GitHub App owned by DaasaVaani,
installed only on Library. It needs repository **Contents: read and write** and
the mandatory **Metadata: read-only**, with no other permissions, OAuth user
authorization, callbacks or webhook delivery. State operations must stay in the
admitted namespace; the App receives no main-protection bypass. Metadata/run/
artifact observation should use the separately bounded read-only job token rather
than add unnecessary App permissions.

The dedicated `library-snapshot-publisher` GitHub environment allows exactly the
`main` **branch** (not tags or other refs), with administrative protection bypass
disabled. Existing `github-pages` and main rules remain unchanged. An empty
credential environment does not install an App, mint a token, authorize a state
writer or activate publication.

Secure operator setup:

1. [Register an organization-owned App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app).
   Suggested name: `DaasaVaani Library Publisher`; use this repository URL as its
   homepage, disable active webhooks, select only the permissions above, and choose
   **Only on this account**. Install it with **Only select repositories: library**.
2. [Generate/manage its private key](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps).
   Keep the PEM outside Git and logs. Add it directly as the environment secret
   `LIBRARY_PUBLISHER_APP_PRIVATE_KEY`; never send it in chat or commit it.
   Record the non-secret App ID as environment variable `LIBRARY_PUBLISHER_APP_ID`.
   Private keys do not expire: rotate/revoke deliberately after verifying a new
   key, without assuming short-lived installation tokens expire the key.
3. Supply the non-secret App ID/slug and installation identity for verification.
   Job wiring must prove the actual identity, Contents permission and Library-only
   scope, mint short-lived repository-restricted tokens only in that main
   environment, and revoke them on completion. Credential presence is not successful
   authentication or permission proof.
4. Before authorizing the verified App's state updates, keep branch creation
   restricted to the approved setup operator separately from App updates. Preserve
   the independent no-bypass force/delete guard; missing state is never an App
   instruction to recreate it. No actor is currently granted automated state access.

Actual App provisioning/authentication, owning producer/client configuration,
bounded initialization and a safe publication handoff remain open. Prepare and
validate the complete handoff before real initialization: independent legacy
publication must not continue exposing untracked semantic changes after ledger
activation. Keep existing readers usable; do not disable the current publisher or
enable a new feed without the separately authorized handoff/deployment boundary.

### Isolated installation evidence admission

`auditGitHubAppInstallation(options, installation, accessibleRepositories)` in
[the installation adapter](../tools/github-app-installation.ts) is a pure,
non-writing prerequisite for ALG-07/GEN-02/05 and QUAL-06. It takes explicitly
trusted repository/full numeric organization/App/installation identities and App
slug, plus unknown original API observations. Options are exact, without defaults
or coercion. The installation must bind the expected organization account/target,
selected-repository mode, unsuspended state, no subscribed events and **exactly**
Contents:write/Metadata:read. Extra permissions are errors, not inert metadata.
The repository response must have total_count1 and exactly one matching numeric/
named Library identity owned by that organization; incomplete pagination,
additional entries or owner/type mismatches fail.

Returned evidence projects only stage and trusted identities, never account/
repository descriptions, URLs, credentials or payloads. Other non-authority API
fields remain inert. Input objects are unchanged and output is independent.
Cost is bounded by the owning input schema traversal; selected scope is exactly
one repository. The caller owns original response byte/time ceilings, strict JSON
admission and authentication. This helper performs no network call, accepts no
token/key, and supplies no authentication or authorization from shape alone.

Authenticate the installation record with appropriate GitHub authority and the
accessible-repositories observation with the actual restricted installation token.
An owner user's repository list or a manually assembled response cannot prove
token scope. A repository-restricted token's one-repository response proves only
that observed token's accessible scope, not that the underlying installation
has no additional selected repositories. Verify the Library-only installation
selection separately through trusted operator/administrative evidence; never
infer it solely from an intentionally narrowed token response.
This does not prove App ownership/private-key possession, webhook
configuration, environment eligibility, current state protections, or write/
deployment permission. Observe those independently at the owning boundary;
there is no cached success, native credential reader or live workflow integration.

`observeGitHubAppInstallation(options, readApp, readInstallation)` additionally
captures exact identity/positive safe byte/time bounds before awaits and requires
two explicitly supplied authenticated reader contexts. With immutable read
limits it reads `app/installations/<expected-id>` through the App context, then
`installation/repositories` through the installation context, and repeats both
observations. Each decoded installation is admitted before the next repository
request; a wrong App/target/scope stops immediately. Each repository response
must independently pass the pure exact admission. Unknown optional fields do not
become authority or require byte-identical response bodies across observations.

The shared strict bounded API JSON decoder rejects empty/over-limit bodies,
malformed JSON, duplicate keys and invalid UTF8. Explicit reader failures are
sanitized without returning partial evidence, defaulting readers to user credentials
or retrying. Four awaited reads is the maximum; caller-enforced deadlines and
actual byte ceilings remain reader responsibilities. Memory includes bounded
encoded/decoded original observations and strict-parser/schema allocations, not
a streaming or global heap claim. Reobservation detects supplied scope changes
but is not an atomic permission lease: revocation/change after observation remains
possible and real write errors must propagate.

There is no default/native reader for these credential-separated endpoints;
the existing source/artifact `readGitHubApi` does not silently acquire App/token
authority. Supplying the same user-token reader twice or forged injected bytes
does not establish authentication. Token mint/revocation, environment/actual
identity proof, App provisioning and state permission/activation remain gates.

### Isolated writer token metadata admission

`auditGitHubAppWriterTokenMetadata(options, metadata)` in
[the installation adapter](../tools/github-app-installation.ts) separately admits
the non-secret grant metadata from an authenticated installation-token creation
response. Coverage remains ALG-07/GEN-02/05/QUAL-06. A correct App installation's
configured permissions are not proof that a subsequently narrowed token can write.

The caller must explicitly select only `permissions`, `repository_selection`,
`repositories` and `expires_at`; raw token responses, private-key fields and other
top-level fields are rejected. No token is read, matched by prefix/length, copied,
hashed, returned or logged. GitHub token formats can change; this API never uses
credential formatting to infer identity. Nested optional repository metadata is
inert and does not enter output. The caller still owns authenticated issuance,
bounded strict JSON admission, HTTP status, secret handling and token revocation.

Exact shared identity/permission/repository checks require only Contents:write/
Metadata:read, selected mode and exactly one matching Library repository owned by
the expected organization. Identity options remain explicitly trusted inputs:
the issuance endpoint/App authentication must independently bind App/installation
identity, and actual token repository observation remains necessary. Grant-shaped
metadata alone authenticates neither the caller nor a token.

`observedAt` must be a canonical UTC-millisecond instant. Explicit inclusive
`minRemainingMs`/`maxRemainingMs` are positive safe integers, ordered and no greater
than GitHub's one-hour installation-token lifetime. They are not production
defaults. Expiry accepts strict UTC seconds or exactly three fractional digits,
rejects impossible dates/leap seconds/offsets, and is projected to UTC milliseconds.
Exact lower/upper remaining-lifetime bounds pass; expired/not-yet-affordable or
too-long-lived grants fail explicitly. The owning operation must recheck its clock/
budget at use; this admission neither renews a token nor reserves validity for a
long-running publication. Twelve-hour automation needs fresh short-lived tokens,
not an invented twelve-hour installation-token lifetime.

Output contains only known trusted identities, stage, observed/expiry instants
and measured remaining milliseconds; input metadata is unchanged. Work is fixed
identity/date validation plus bounded metadata schema traversal, with no network,
credential allocation, writer permission or publication side effect. Secure App/
key provisioning and the actual authenticated mint/use/revoke boundary stay open.
Tests use synthetic credential markers only and explicitly prove raw credential
fields are rejected without accessing their values.

Incremental validation:

```powershell
npm run build
node --import tsx --test tools\github-app-installation.test.ts
```

Synthetic tests cover independent payload-free output, exact trusted options,
wrong/missing/unsafe App/account/target IDs, suspension/all-repository selection,
subscribed events, extra/weaker permissions, incomplete/multiple repositories
and wrong repository owner/type. Bounded observer cases additionally cover exact
four-reader routing, captured configuration, malformed/duplicate/UTF8 bodies at
each read, exact ceiling/+1, final scope changes and sanitized failures with no
retry. Full finalization still uses all configured
[checks](../README.md#validation).
The same suite covers token effective-permission narrowing, raw-secret refusal,
exact lifetime bounds/+1, UTC normalization/impossible dates, expired/twelve-hour
grants, single selected repository identity, copied known output and unchanged
caller inputs.

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
