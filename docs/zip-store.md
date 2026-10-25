# Bounded ZIP STORE byte prerequisite

`tools/zip-store.ts` is a standalone Library construction/verification prerequisite
for ALG-08/GEN-03, not a publisher entrypoint or consumer offline/runtime adapter.
It does not complete those requirements. Existing fixture and canonical
prelaunch publication remain unchanged.

## API and responsibility

- `encodeZipStore(objects, limits): Buffer` accepts `{path, bytes}` objects.
  Bytes are original, already validated gzip objects, not decoded JSON. No
  inflation, recompression, Unicode/source normalization or filesystem work occurs.
  Paths must match the current published `objects/<lowercase SHA256>.json.gz`
  format and the digest of the supplied encoded bytes. Paths are unique; unsafe,
  absolute, traversal, backslash, encoded-alias and non-ASCII names fail.
- `decodeZipStore(archive, limits): ZipStoreObject[]` verifies only this
  deterministic producer profile and returns independent copies after full
  validation. It is deliberately not a general-purpose ZIP reader. CRC32,
  encoded SHA256/path, local/central consistency, offsets, sizes, order and all
  fixed metadata must agree. Failure throws without exposing partial members.
  This does not independently validate gzip internals or public object schemas;
  the owning artifact validation remains required.
- Both require explicit typed `ZipStoreLimits`:
  positive integer `maxMembers` below65535 and integer `maxArchiveBytes` from22
  through4294967294. These are format limits, not product settings or defaults.
  Count and encoded archive size are inclusive. Size includes every local
  header/name, original payload, central header/name and the22-byte end record:
  `22 + sum(30 + 46 + 2 * ASCII-path-length + encoded-object-length)`.
  Empty archives are supported; any publication-specific nonempty requirement
  belongs to its caller. Oversized input fails before archive allocation.

## Deterministic profile and bounds

Members sort by exact ASCII object path, independent of input order. This is
only byte serialization order, not a changedAt grouping or packing policy.
ZIP uses classic single-disk STORE (method0), version20/DOS creator, zero flags,
1980-01-01 midnight, CRC32 of the original gzip bytes, equal stored/uncompressed
member sizes, zero attributes and no extra fields, comments, data descriptors,
encryption or ZIP64. Names are ASCII; no UTF8 flag is needed. Each returned
archive contains its central directory and end record, with no prefix/trailer.
The verifier bounds the input and member extents before reconstructing the
canonical bytes for exact comparison, rejecting alternative ZIP encodings too.

Construction is O(B + N log N), verification the same, where B is the bounded
encoded archive size and N the member count. Memory is O(B + N), including
verification reconstruction and copied returned payloads; this is not streaming
or a consumer disk-space-admission implementation.

## Checks and remaining gates

```powershell
npm run build
node --import tsx --test tools\zip-store.test.ts
```

Tests use synthetic gzip bytes and the existing deterministic gzip producer.
They cover an independent known CRC vector, stable bytes/metadata/order, exact
overhead/count boundaries, unchanged payloads, duplicate/unsafe paths, hash
mismatch, every single-byte corruption and truncation of a synthetic archive,
STORE-only restrictions and ZIP64 refusal. The focused test is also registered
in `npm test`.

Shared policy/settings remain authoritative and are not copied here. The separate
[exact changedAt cohort packer](bundle-packing.md) consumes the independently
pinned published planning policy and reuses this byte codec. Neither helper is
wired into a publisher. Durable ledger/changedAt semantics, production manifest/
policy binding, transfer selection, space admission, deployment, consumer offline
lifecycle and full release validation remain separate open work.
Finalization requires the complete `npm run check` and owning repository
hygiene/workflow checks; focused checks alone do not establish publication
readiness. Any failing full-suite check blocks completion.
