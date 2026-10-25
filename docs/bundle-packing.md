# Exact changedAt cohort packing prerequisite

Coverage: ALG-08, GEN-03, OFF-02/04/15 and SET-01/02. This standalone Library
producer prerequisite composes the [ZIP byte profile](zip-store.md) with the
[Shared planning policy](../shared/docs/download-planning.md). Neither publisher
calls it yet. It does not publish source variants or complete production
publication, request planning, consent or offline preparation.

## Inputs and owned policy

[packChangedAtCohorts](../tools/bundle-packing.ts) accepts unique original
`objects/<lowercase encoded SHA256>.json.gz` paths, original gzip bytes and a
canonical UTC millisecond `changedAt` per object. Dates must round-trip exactly;
equivalent noncanonical offsets, missing milliseconds and impossible dates fail.
Duplicate paths, conflicting dates for one path and mismatched encoded hashes
fail without a partial result or input mutation.

The caller supplies already validated public reading objects and authoritative
semantic dates. The packer verifies encoded identities and ZIP paths, not gzip
framing, public schemas, artifact-role limits, rights, capabilities or the
meaning of `changedAt`. It must not be used to infer dates from filenames,
compression, the current clock or unreviewed source material. Image/media paths
are not accepted; a gzip-shaped path alone is not a role/content allowlist.

`readPackingLimits()` strictly validates the pinned Shared
`settings/publication-policy.yml` against its owning schema. `packingLimits()`
exposes the same validation for supplied policy data. The selected
`transferPlanning.maxBundleMembers` and `maxBundleEncodedBytes` values are
currently100 and33554432. No defaults or duplicate Library settings are added.
Classic ZIP's own format ceilings are additionally enforced, never silently
clamped. Callers may supply explicit smaller limits for bounded tooling/tests;
production integration must bind the compatible published snapshot policy.

## Exact deterministic boundaries

1. Validate every input and bound before emitting any result.
2. Sort by exact `changedAt` ascending, then exact ASCII object path ascending.
   Distinct timestamps are hard cohort boundaries, even within the same day.
3. Leave any member that cannot fit an otherwise empty archive individual-only.
   Skip it without closing the pending eligible members of its cohort.
4. Next-fit the remaining ordered members: close the pending archive immediately
   before adding a member would exceed either inclusive bound. Size includes
   the22-byte end record and every local/central header, name and original byte.
   Do not backfill earlier archives or mix cohorts.
5. Emit archives only for groups of at least two members. Singleton ZIPs have
   the same request count plus strictly more bytes than the original object and
   cannot improve the selected planner cost.
6. Emit bundles in cohort/path order, with encoded SHA256, bytes and ordered
   member paths. `unbundled` lists remaining paths in changedAt/path order.
   Every input belongs to exactly one bundle or that remainder.

All original individual gzip objects must still be published by the eventual
adapter, including bundled members. Bundle creation never rewrites their bytes
or identities. Repacking does not invalidate verified original member hashes.
Returned archive buffers do not alias caller payloads. The synchronous caller
must keep supplied bytes stable during packing.

This is deterministic next-fit, not minimum-bin or globally optimal packing.
Hard timestamp cohorts improve change-batch isolation but can create smaller
archives/more initial requests. A different cohort's addition cannot change an
unchanged cohort's archives. Edits within a cohort can repack that cohort.
The [download planner](../shared/docs/download-planning.md), not this producer,
decides which archives are worthwhile for a particular verified-object set.

## Validation, complexity and remaining gates

```powershell
npm run build
node --import tsx --test tools\bundle-packing.test.ts tools\zip-store.test.ts
```

The full `npm test` includes both files. Synthetic tests verify cohort isolation,
input permutations, unchanged-cohort reuse, disjoint exact coverage, original
bytes,100/101/102 members, actual32MiB/+1 archives, header-inclusive next-fit,
oversized individual fallback, singleton omission, invalid dates/paths/hashes
and strict owned-policy/format rejection. No real source outputs are generated.

For N objects and B total input/output bytes, work is O(N log N + B); result and
temporary memory are O(N + B), with one bounded archive being encoded at a time.
The function retains returned archives; it is not a streaming writer or consumer
peak-staging-space admission implementation.

Durable semantic dates/ledger receipts, production object/manifest/capability and
snapshot-policy binding, deployment/headroom accounting, consumer verification,
consent, cancellation/resume, atomic activation, repair and GC remain open.
Full finalization requires all commands in the [validation guide](../README.md#validation),
not only the focused tests. No production capability is enabled by this helper.
