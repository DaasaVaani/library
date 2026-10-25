# Verified semantic baseline and initialization review

Coverage: ALG-07, GEN-02/05 and EXP-03. This read-only prerequisite extends
the [first-publication-date audit](publication-history.md) using actual encoded
historical item evidence and the
[canonical prelaunch logical projection](lyric-logical.md). It does not
initialize or change a real ledger, reserve a feed sequence, generate content,
publish dates or activate a producer/consumer.

## Evidence and validation

[auditSemanticBaseline](../tools/semantic-baseline.ts) takes the current encoded
catalog, authenticated historical publication evidence, an object loader and
explicit positive encoded/decoded manifest/item bounds. The current catalog
must be the latest verified publication. Receipt chronology/uniqueness, actual
manifest hashes, strict schema/canonical bytes and unique lyric identities reuse
the first-date audit's decoder/validation.

The loader receives a frozen hash-addressed reference, never a title or source
path. Return original encoded bytes, or explicit null when historical evidence
is unavailable. Other I/O failures must throw; corruption is not "unavailable."
The owning adapter must enforce byte ceilings while reading/fetching and avoid
following untrusted paths or regenerating evidence from today's source.
The audit checks every declared item reference and its role bounds before
loading. It then verifies actual encoded SHA256/length, bounded gzip decoding,
exact decoded length, fatal UTF8, canonical JSON and the strict current item/
line-identity rules. Match exact lyric UUID/title/ordered tags to the catalog.
Repeated encoded identities must have identical reference metadata and summary.
Cache verified logical records by encoded identity and load each only once.

Invalid receipts/catalogs/items/references/summaries, future fields, malformed/
duplicate/noncanonical JSON, oversized/corrupt evidence and unexpected I/O
fail explicitly without a partial successful result. Canonical JSON syntax
errors omit raw payload excerpts. Metadata/manifest/bound inputs are snapshotted
before asynchronous object loading, and caller inputs are not mutated.
This does not authenticate a caller's well-shaped receipt by itself. The caller
still owns the genuine source/run/attempt/artifact/deployment/status chain,
available-history scope and whole-publication compatibility.

## Dates and unresolved evidence

For each UUID, preserve the earliest verified first date. In receipt order:

- first observed valid logical content receives that observation's change date;
- identical logical hashes, including recompression and unchanged reintroduction,
  retain that date; absent identities remain tombstones;
- different known consecutive logical versions receive the later verified
  observation's date, including a reversion to an older logical hash;
- unavailable content creates an unknown logical version/change baseline.
  A later known object does not silently convert the gap into a fictitious edit
  at that later time. A subsequent observed transition between known different
  versions can establish a later change observation.

The deterministic UUID-sorted result contains projection identity
`canonical-prelaunch-v1`, receipt summaries, candidate first/change dates,
logical hashes and presence, verified-object count, explicit missing-object
hashes/unresolved UUIDs and `complete`. Missing evidence is not a pass:
`complete` requires all referenced historical objects and candidate baselines.
The report contains no lyric text, titles, source evidence or encoded payloads.

Candidate dates describe observations within the supplied verified history,
not physical edit/CDN times or proof that deleted/unrecorded/manual publications
cannot exist. The retrospective historical convention and future reserved
logical timestamp convention remain distinct as defined by the
[ledger protocol](publication-ledger.md#inputs-and-date-meaning).

## Read-only initialization safeguards

`prepareBaselineInitializationReview` recomputes the audit from raw evidence and
refuses an incomplete result. Its private review draft contains:

- `status: review-required`, explicit projection identity and the SHA256 of
  canonical audit JSON plus one LF;
- the latest verified legacy publication summary;
- UUID-sorted candidate ledger items/tombstones with the reviewed historical
  first/change conventions;
- **`sequence: null`**, because the legacy descriptor never advertised one.

It is not a ledger file and is deliberately incompatible with the active
ledger schema. Do not invent a retrospectively served sequence or confirmed
sequenced receipt for a prelaunch artifact.

`verifyBaselineReviewPin` recomputes the complete draft and compares its canonical
JSON-plus-LF SHA256 with an explicit trusted review pin. A changed catalog,
history, item, date, projection or receipt changes the review identity and
requires renewed review. A pin match alone does not grant permission or prove
who reviewed it; approval/activation authority remains external. The returned
draft remains `review-required`. There is no CLI auto-run, state-branch writer,
force-clear, baseline import or production migration in these functions.
The separate [explicit unsequenced bootstrap](publication-ledger.md#explicit-unsequenced-bootstrap)
can construct an inactive version2 ledger from a verified review pin. It retains
the complete immutable review without inventing a legacy sequence; it does not
create a real state branch or replace an existing ledger.

Before activation, review the actual baseline, define trusted
anchor/branch protection/job permissions and authenticate the deployment adapter.
The selected protocol is an explicit unsequenced baseline with projection/review
binding; the first new reservation starts at1, with gaps retained on cancellation.
Full multilingual/metadata projections and migration remain separate gates.
Preserve original verified catalogs/items outside disposable build output.

## Validation and cost

```powershell
npm run build
node --import tsx --test tools\publication-history.test.ts tools\lyric-logical.test.ts tools\semantic-baseline.test.ts
```

The registered synthetic tests cover edits/reversions/removal/reintroduction,
recompression/reuse/permutations, missing history and unknown propagation,
exact role ceilings, reference/summary/hash/schema/UTF8/canonical errors,
I/O failure propagation, async input isolation, payload-free drafts, legacy
sequence absence and stale/malformed review pins.
Full finalization uses [all configured checks](../README.md#validation).

Work includes O(P log P + N log N + R + B), plus owning schema/projection
validation costs: P receipts, N distinct lyrics, R catalog entries and B
decoded bytes. Memory includes snapshotted bounded manifests, O(P + N + U)
metadata/cache for U distinct objects, and one decoded item. Caller-owned
encoded buffers/loader caches are additional. There is no total-history
network/storage ceiling or remote authentication guarantee in this tooling.
