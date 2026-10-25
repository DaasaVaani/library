# Verified publication-date audit prerequisite

Coverage: ALG-07, GEN-02/05 and EXP-03. The owner-selected initial backfill policy
uses verified successful prelaunch publication history, never source/commit
modification times, YouTube upload dates or an invented production-launch date.
The [publication specification](../shared/docs/implementation-specification.md#8-publication-transport-and-compatibility)
still owns the future ledger/receipt protocol. This audit is not that ledger.

## Evidence and trust boundary

[auditPublicationDates](../tools/publication-history.ts) is a read-only, bounded
Node tooling function. It takes the current encoded catalog and historical
encoded catalogs with authenticated publication evidence:

- exact source commit, workflow run and attempt;
- deployment and successful status identities/time;
- uploaded artifact identity/digest and the logged manifest encoded SHA256.

The caller must obtain authentic GitHub metadata/logs, match source/run/artifact/
deployment relationships and establish the available history's scope. Merely
passing hash-shaped strings or a successful run flag does not authenticate
publication. The function does not make network requests, verify a detached
signature, reconstruct missing history or trust filesystem modification times.
It must never be fed fabricated receipts.

For each catalog it checks actual encoded bytes against the supplied identity,
the owning encoded/decoded ceilings, gzip decoding, fatal UTF8, strict prelaunch
manifest schema, canonical JSON bytes and unique lyric identities. Malformed,
future, duplicate-key/noncanonical, oversized or mismatched catalogs fail
without partial results. It does not revalidate every referenced item body or
claim general production artifact/ZIP compatibility.

An expired archive is not treated as available. A retained original encoded
manifest can still establish catalog membership when its actual SHA256 matches
the authentic publication log and that log's upload/deploy chain is verified.
Do not regenerate a manifest from current sources as historical evidence.
Preserve original byte evidence outside disposable build directories.

## Deterministic result and date semantics

The source-only `daasavaani-publication-date-audit` version1 result contains:

- current manifest identity and chronological explicit receipt summaries;
- UUID-ordered candidates with `firstVerifiedPublishedAt`, supporting run/attempt
  and current-publication presence;
- sorted `unresolvedLyricIds` for current records absent from verified history.

Receipt uniqueness uses run/attempt, deployment and status identities; distinct
verified attempts of one workflow run are allowed. Timestamp ties use deployment
identity deterministically. The earliest verified observation wins, regardless
of caller input order. Previously seen, currently absent UUIDs remain in the
result, preserving evidence through later removal/reintroduction.

`firstVerifiedPublishedAt` means the earliest successful deployment-status time
in the supplied verified history, not a claim about the exact first CDN byte or
unrecorded/deleted/manual publications. Dates use canonical UTC milliseconds.
Second-resolution upstream timestamps serialize with `.000`; this does not
claim observed subsecond precision. Unknown dates stay unresolved, never silently
defaulting to the audit clock.

The result contains only identities, dates and provenance, not lyric text,
titles, source provenance or raw artifact payloads. It is a review/backfill
candidate, not an activated public date register or a production wire format.
No source IDs/text/holds, existing feed bytes or consumer pins are changed.

## Validation and remaining work

```powershell
npm run build
node --import tsx --test tools\publication-history.test.ts
```

The tests are also registered in `npm test`. They use synthetic catalogs to
verify chronological/permutation behavior, removal/reintroduction, unresolved
records, repeated attempts, malformed/duplicate receipts, date/identity errors,
actual encoded/decoded equality/+1, canonical/duplicate-key/schema rejection,
payload privacy and nonmutation. Full finalization uses
[all configured checks](../README.md#validation).

Work is O(P log P + N log N + B), where P is publication receipts, N distinct
lyric IDs and B total bounded catalog bytes processed. Memory is O(P + N + M),
where M is one decoded catalog; caller-owned encoded inputs are additional.

The separate [private ledger core](publication-ledger.md) implements local
semantic-date state, pending/confirmed receipt validation, monotonic reservation,
no-op handling and conservative uncertain-state blocking. Future publications
use an assigned logical marker with observed confirmation time stored separately;
the historical audit's verified-observation semantics do not change.
The [isolated Git store](publication-ledger.md#isolated-git-persistence) supplies
expected-tip persistence and the durable deployment boundary, without production
wiring. Reviewed initialization into a dedicated publication-state branch,
production logical projections, protected job/anchor management, authenticated
remote reconciliation and production manifest/policy binding remain unimplemented.
The [current canonical logical projection](lyric-logical.md) can hash verified
decoded text-only items independently of their gzip representation. It does not
reconstruct historical logical versions or assign real baseline dates.
No production publisher or client consumes these candidates yet.
