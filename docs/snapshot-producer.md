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
   fields fail instead of being discarded. A future source adapter must reuse
   current source validation and explicitly reject every unsupported populated
   field before constructing these public items. This helper does not grant
   source publication/rights approval.
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
node --import tsx --test tools\snapshot-staging.test.ts tools\snapshot-preflight.test.ts tools\snapshot-producer.test.ts tools\publication-ledger-git.test.ts
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

Full finalization uses [all configured checks](../README.md#validation).
Remaining gates include full production item/index/policy/profile contracts,
reviewed source-to-snapshot adaptation and full-production output/headroom adapters,
consumer consent/storage/lifecycle integration, actual baseline approval,
protected state initialization/anchor permissions, authenticated deployment/
descriptor sequence binding and recovery/release/device evidence.
