# Read-only GitHub artifact byte admission

Coverage: CI-01/03/06 and ALG-07/08 publication-integrity prerequisites.
[auditGitHubArtifact](../tools/github-artifact.ts) checks one explicitly pinned
artifact's metadata and actual downloaded bytes. It does not publish, write files,
extract archives, inspect source, update a ledger or produce a deployment receipt.
Neither current publisher workflow invokes it.

## Explicit identity and bounds

The caller supplies `GitHubArtifactOptions` from independently trusted runner
configuration/evidence, not by accepting untrusted returned fields as approval:

- Exact case-sensitive ASCII `repository` (`owner/repo`) and positive safe-integer
  `repositoryId`.
- Positive safe-integer `artifactId`, safe ASCII `artifactName` and independently
  expected lowercase 64-hex `artifactSha256`. Names allow alphanumeric/underscore
  starts followed by alphanumeric, underscore, dot or hyphen.
- Positive safe-integer `publisherRunId`, lowercase 40-hex `publisherHeadCommit`
  and safe slash-separated ASCII `publisherBranch`. These are the artifact API's
  workflow-run identities, not an assertion about generated canonical sources.
- Positive safe-integer `requestTimeoutMs`, `maxMetadataBytes` and
  `maxArchiveBytes`, each at most 2,147,483,647. No production values, artifact
  selection rule, writer setting or default bound is selected here.

The serial, single-attempt sequence is:

1. Read `repos/<repository>/actions/artifacts/<artifactId>`. Require exact
   ID/name, non-null `digest: sha256:<expected hash>`, `expired: false`, positive
   safe-integer `size_in_bytes` within the archive ceiling, and matching
   `workflow_run.id`, repository/head-repository IDs, head SHA and branch.
2. Read the derived canonical endpoint's `/zip` body. Do **not** follow the
   metadata's `url` or `archive_download_url`. The download's process/output
   ceiling is tightened to the admitted declared size. Check actual nonempty
   byte count against that exact size and SHA256 against the independently
   expected digest. Truncation, changes and overrun fail, never warn-and-continue.
3. Reread the same metadata endpoint. Recheck every pinned identity/digest/
   non-expired/bound condition and the exact original declared size before
   returning any result.

Missing/expired/legacy digest-less evidence, API errors, inconsistent metadata
or changed bytes fail explicitly with no retry, fallback source, target switch
or partial success. No failure proves an artifact/candidate was never exposed;
it cannot authorize cancellation, redeployment or forced state recovery.

The payload-free `stage: github-artifact-bytes` result contains the pinned
repository/artifact/publisher identities, `artifactSha256`, actual `artifactBytes`
and `requestCount: 3`. It returns no bytes, URLs, credentials, timestamps, approval
flag, source identity, attempt or receipt. Inputs are copied before any await;
per-read limits are frozen. Optional unrelated API fields are not copied.

## What this does not establish

The owning [REST artifact schema](https://docs.github.com/en/rest/actions/artifacts#get-an-artifact)
does not supply a run-attempt field. Do not infer the publishing attempt from the
artifact name, run ID, head SHA, creation time or an extra caller-supplied field.
Unknown options such as `runAttempt` and `sourceCommit` are rejected. The
publisher's workflow-run head can differ from its checked-out canonical source;
see the [source/publisher distinction](github-source-run.md#why-this-is-not-publisher-run-evidence).

Digest/size binding follows the uploaded byte stream, not logical site contents.
The [official uploader](https://github.com/actions/toolkit/blob/main/packages/artifact/src/internal/upload/upload-artifact.ts)
finalizes the stream size/hash; the
[artifact validation guide](https://docs.github.com/en/actions/tutorials/store-and-share-data#validating-artifacts)
describes the uploaded/downloaded SHA256 relationship. This observer's strict
profile requires a supported digest and exact returned-body size; incompatible
provider/legacy formats fail rather than being silently normalized.

The `/zip` endpoint is requested, but **no ZIP/TAR/container or member validation
is performed**. Even arbitrary opaque bytes can satisfy a matching digest.
This is not the Library's strict STORE bundle codec, proof of a Pages artifact
layout, or proof that an archive contains the reserved descriptor and exact
allowlisted staged snapshot. The separate
[staging/read-back gates](snapshot-producer.md) remain necessary.

Metadata rereads are observations, not an immutable seal or a guarantee against
later expiry/deletion, transient changes/ABA or global CDN freshness. A report
is not signed evidence when detached from its trusted caller. Publisher workflow/
attempt/outcome, triggering-source linkage, whole-artifact contents, deployment/
successful-status identities and time, and explicit receipt reconciliation remain
separate gates. Never cast this result into a private ledger receipt.

## Transport and failure ownership

The source observer and this observer reuse
[one bounded GitHub CLI reader/JSON decoder](../tools/github-api.ts). Existing
source-module reader/limit type imports remain available by re-export.
The [shared transport rules](github-source-run.md#transport-bounds-and-errors)
still apply: existing authenticated runner-owned `gh`, explicit public host/GET/
API version/cache directives, safe relative endpoints only, copied noninteractive
environment, deadline/stdout/stderr ceilings and payload-free errors.

Metadata receives bounded fatal UTF8, JSON/duplicate-key and typed identity
validation. The archive is opaque binary and is never passed through UTF8/JSON.
For the numeric artifact `/zip` endpoint only, the native CLI uses
`--allow-escape-sequences` because current CLI raw-output guarding can otherwise
refuse escape-containing bytes. Stdout is captured directly into a bounded
Buffer, never displayed in a terminal; no decoding, formatting, payload logging
or escape stripping is permitted. An installed CLI supporting that flag is a
native-reader prerequisite; missing tooling/flags/authentication fail explicitly.
Provider download redirects are handled by trusted `gh`, not by consuming an
arbitrary URL from artifact metadata; this helper does not implement its own
redirect/status/header verifier.

Trusted injected `GitHubApiReader` implementations must authenticate transport
and bound their own I/O before returning. Receiving a limit is not proof they
obey it, and fabricated matching metadata is not authentic evidence. There is
no outer deadline or peak-process/network memory guarantee for arbitrary readers.

Three requests require two bounded metadata responses plus one bounded archive.
SHA256/count comparison is O(B) in actual archive bytes; JSON/duplicate/schema
parsing additionally incurs the owning parsers' costs. Captured raw/parsed
responses, child/transport buffering and garbage-collection timing are additional
memory costs, not a measured hosting/storage/network budget.

## Validation and remaining evidence

```powershell
node_modules\.bin\tsc.cmd --noEmit
node_modules\.bin\tsx.cmd --test tools\github-source-run.test.ts tools\github-artifact.test.ts
```

The registered synthetic suite requires no GitHub account/network. It checks
exact requests/report/limits, binary NUL/non-UTF8/escape bytes, metadata identity/
expiry/digest/size/role refusals at both observations, exact ceiling/+1, truncation,
corruption, final-size changes, malformed/duplicate/BOM/invalid UTF8 metadata,
redaction, caller isolation and shared native endpoint/limit guards.
An isolated child also executes the default reader with mocked process execution,
checking exact command flags, byte-return ownership, process limits/environment,
parent-environment preservation and callback-error redaction without network.
Only the exact numeric artifact route enables raw output; a Git branch whose
suffix resembles `actions/artifacts/<id>/zip` must remain a normal JSON read.
Synthetic opaque bytes are not a real GitHub/Pages archive conformance fixture.

Live provider downloads, retained authentic artifact evidence, archive/member
binding to the actual candidate, publisher attempt and authenticated hosted
deployment/status/receipt verification remain unresolved integration gates.
Absence of evidence is not a pass. Full finalization/push still requires
[all Library checks](../README.md#validation).
