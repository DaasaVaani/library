# Canonical prelaunch logical item projection

Coverage: ALG-07, GEN-02/05 and EXP-03. The
[Shared publication specification](../shared/docs/implementation-specification.md#8-publication-transport-and-compatibility)
requires semantic change dates independent of transport encoding. The standalone
[canonicalLyricLogicalItem](../tools/lyric-logical.ts) implements a private
projection for the **existing canonical text-only prelaunch item version1**.
This is not the full production multilingual/metadata logical contract.
Neither publisher calls it; it writes no artifact, source, ledger or date.

## Exact projection and identity

Input is one decoded item, not source Markdown, an encoded-object reference,
catalog, descriptor, ledger record or fixture item. Validate against the pinned
[Shared item schema](../shared/schemas/lyric-publication.schema.json), reject
duplicate canonical line UUIDs, whitespace-only identified lyric lines and an
item containing no identified lyric line. Layout records remain UUID-free.

Project exactly these current public fields:

- `lyricId` and `canonicalScript`;
- `title` and the ordered `tags` array;
- the ordered `lines` array, preserving every line's `kind`, `lineId` and `text`,
  and every layout record's `kind` and literal whitespace `text`.

The fixed accepted `format`/`formatVersion` frame is validated but not hashed.
Serialize the projection using the existing safe-integer RFC8785 canonical
JSON helper, UTF8 with **no trailing LF**, then compute lowercase SHA256.
Object key insertion order has no effect. Array ordering, stable identities,
line/layout count, text/case/whitespace and normalization differences remain
significant. Do not sort tags/lines, trim, translate, transliterate, normalize
Unicode or rewrite layout to obtain a desired hash.

Return exactly `{lyricId, logicalSha256}` for the
[private ledger core](publication-ledger.md), never lyric text or provenance.
The logical digest is not the complete public JSON hash or its gzip object's
network identity. Recompression may change both object and referencing manifest
hashes while preserving this logical digest and all committed item dates.
Actual public title/tag/text/layout/identity changes affect the logical digest.

Current version1 items have no derived dates, source-only provenance, transport
references or extended production metadata. Such fields are **rejected if
injected into the item**, not accepted and silently discarded. Derived ledger
dates stay outside this input. Future versions/fields need explicit schema and
projection review before use; do not reuse this helper to drop Source Latin,
script profiles, verses, classification or media from a production item.

## Trust boundary and initialization gates

The function validates an already materialized object, not encoded bytes. The
owning caller must first enforce encoded/decoded role limits and verify actual
object identity, UTF8/JSON/canonical wire bytes, catalog binding and complete
publication compatibility. It performs no fetching, gzip decoding, source
eligibility, linguistic/rights review or publication-evidence authentication.
Schema-valid strings do not prove reviewed Kannada or legal permission.

There is no real catalog initialization, baseline-date assignment or automatic
historical-source reconstruction. The
[verified publication-date audit](publication-history.md) provides reviewed
first-date candidates, not historical logical hashes or a current semantic
change baseline. The [semantic baseline audit](semantic-baseline.md) now verifies
historical item evidence to produce change-date candidates and a pinned read-only
initialization review; it performs no active state import.
Future full-production projections, projection/version binding,
safe migration between projection families and a reviewed initialization/
trusted-anchor protocol remain gates before production ledger activation.
Do not mix hashes from different projection contracts in one ledger as if they
were directly comparable.

## Validation and cost

```powershell
npm run build
node --import tsx --test tools\lyric-logical.test.ts
```

The synthetic tests are registered in `npm test`. They verify an exact canonical
byte vector/output shape, key-order stability, semantic-field and array-order
changes, literal Unicode/layout preservation, malformed/future/input-surface
rejection, duplicate line identities, nonmutation and payload-free results.
Actual differently compressed item bytes and referencing manifests feed the
ledger tests: transport-only changes advance snapshot sequence without changing
item dates, a true no-op preserves the entire state, and real logical edits
advance only `changedAt`, preserving first publication.
Full finalization uses [all configured checks](../README.md#validation).

For B projected UTF8 bytes and L line identities, projection/serialization/hash
uses O(B + L) memory. UUID uniqueness checking is O(L); schema/canonicalization
cost also depends on input collections (including the pinned schema's unique
tag validation). No unbounded network/materialization safety guarantee is
claimed by this in-memory helper.
