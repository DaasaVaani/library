# Read-only GitHub source-run admission

Coverage: CI-01/03/06, GEN-02/05 and ALG-07 prerequisites.
[auditGitHubSourceRun](../tools/github-source-run.ts) observes one explicitly
identified successful source CI run against the current source branch. It does
not select a run, infer approval from a workflow name, execute source code,
generate content, reserve state, publish, or produce a deployment receipt.
Neither current publisher workflow invokes it.

## Explicit authority and observations

The caller supplies `GitHubSourceRunOptions` from independently trusted runner
configuration/review, not copied from an untrusted PR, event payload or the
response being checked:

- `repository`: exact case-sensitive ASCII `owner/repo`, with safe non-option,
  non-dot path segments; numeric `repositoryId` additionally pins its identity.
- `workflowId` and `workflowPath`: the expected source-validation workflow's
  positive safe-integer identity and `.github/workflows/<name>.yml` or `.yaml`.
  The ID and path must both match; a similar display name is not sufficient.
- `branch`: short branch path made of nonempty safe ASCII segments, not
  `refs/heads/...`, a URL, query, revision expression or arbitrary API path.
- `sourceCommit`: full lowercase 40-hex source commit.
- `runId` and `runAttempt`: explicit positive safe integers. The run endpoint's
  current attempt must match; an older successful attempt cannot be substituted
  for a newer attempt observed there.
- `requestTimeoutMs` and `maxResponseBytes`: positive safe integers no larger
  than 2,147,483,647, applied to each CLI invocation/response. There are no
  selected production bounds, workflow/repository pins or branch defaults.

The serial, single-attempt sequence is:

1. Read `repos/<repository>/git/ref/heads/<branch>` and require exact ref,
   `object.type: commit` and the expected source SHA.
2. Read `repos/<repository>/actions/runs/<runId>`. Require exact run/attempt,
   workflow ID/path, source SHA/branch and both repository/head-repository IDs
   and full names. Require `event: push`, `status: completed` and
   `conclusion: success`. Forks, PR runs, workflow-run events, missing/deleted
   head repositories, queued/running/failed/cancelled/skipped/neutral runs and
   unknown mismatching states fail.
3. Read the same branch ref again, requiring the same expected source SHA.

An initially superseded source or observed branch advance fails without changing
target, retrying or returning partial success. These are point-in-time
observations, not a branch lock, global freshness guarantee or ABA detector.
A run can be rerun and a ref can move after observation. The owning writer must
still enforce currentness at its exposure boundary and reconcile uncertainty.

The returned payload-free `stage: github-source-run` report carries the exact
repository/workflow/branch/source/run/attempt identities and `requestCount: 3`.
It contains no payloads, names/titles from the run, token, approval flag or
receipt. The report is not signed or independently verifiable once detached
from its trusted caller.

## Why this is not publisher-run evidence

This observer is for **successful push CI on the source branch**. The current
prelaunch publisher is triggered by `workflow_run` and checks out the triggering
CI run's `head_sha`; its own workflow head SHA need not identify those checked-out
source bytes. Do not feed that publishing run to this function, weaken the event
check, or assume successful source CI authenticates a publishing run/artifact.
Likewise, requiring the still-running publishing workflow itself to finish
successfully inside its deployment callback would be an invalid lifecycle gate.

The source-run observation can support the caller's independent authentication
of `trustedSourceTip` for the
[Git-bound source adapter](snapshot-producer.md#git-bound-source-preparation).
The adapter still proves exact commit/tree/blob identity and ancestry separately.
One successful workflow is not proof of all required checks, merged review,
branch protections, authorized workflow contents, rights, linguistic truth,
latest deployment, artifacts/statuses or publication permission. Source and
publication approval remain distinct.

## Transport, bounds and errors

The default reader uses the already installed authenticated
[`gh api`](https://cli.github.com/manual/gh_api), with explicit public
`--hostname github.com`, `--method GET`, JSON Accept, REST API version2022-11-28
and no-cache/no-store request headers. It uses no shell, current-repository
placeholders, query fields, pagination, CLI cache, log download or writes.
The [workflow-run](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run)
and [Git-ref](https://docs.github.com/en/rest/git/refs#get-a-reference)
REST endpoints own their provider response definitions.

CLI executable/configuration, authentication and surrounding proxy/TLS environment
must be runner-owned and trusted; this is not a sandbox or a new credential
store. Credentials stay in the normal external CLI environment/configuration,
never function arguments, source, output or logs. Prompts/update notifications
are disabled in a copied child environment; debug/forced-terminal/local-socket
overrides are removed. The parent environment is unchanged.

Each child has an explicit deadline and stdout/stderr ceiling. Successful raw
response bodies are independently checked against the byte ceiling before
fatal UTF8/JSON decoding. BOM, invalid/duplicate-key JSON, unsafe identity numbers,
wrong shapes and mismatched evidence fail. GitHub's additional response fields
are permitted but never copied into the report. Provider JSON is not the
canonical publication wire format. Raw parser, CLI, transport and injected-reader
diagnostics are replaced by explicit payload-free errors.

The optional `GitHubApiReader` is a trusted test/integration seam. It must
authenticate its own transport and enforce limits during I/O; a fabricated
well-shaped response is not proof. The observer copies options before its first
await and freezes per-read limits. Custom readers can allocate/hang before
returning; they do not inherit CLI process bounds by merely receiving the limits.
There is no outer timeout/retry or claim to bound GitHub/CLI internal buffering.

Three serial requests require bounded total raw response bytes B, with one raw
response and its parsed representations at a time plus bounded metadata.
Identity comparisons are bounded independently of optional provider fields;
JSON syntax/duplicate checking additionally incurs the owning parsers' costs,
without a claimed linear-time proof. The response limit does not establish an
upstream network, CPU or peak-process-memory measurement.

## Validation

```powershell
node_modules\.bin\tsc.cmd --noEmit
node_modules\.bin\tsx.cmd --test tools\github-source-run.test.ts
```

The registered synthetic suite uses injected byte responses, needs no GitHub
credentials/network and never contacts the live repository. It covers exact
request order/identities/report shape, every authority mismatch, fork/event/
attempt/outcome refusal, before/after branch changes, exact byte ceiling/+1,
invalid JSON/UTF8/duplicate keys, redaction and asynchronous caller isolation.
A separate [Git-source integration](../tools/git-source-snapshot.test.ts) composes
the observer with real disposable local Git history: the observed tip becomes
the explicit `trustedSourceTip`, while an older contained candidate still reads
only its own committed receipt/Markdown bytes. Hosted ref/run/fork/attempt/outcome
mismatches stop the caller-style composition before any preparation attempt;
an unapproved local descendant fails the adapter's independent ancestry check.
Artifacts, held/exception counts, source commit, ledger and checkout are checked,
not inferred from a successful observation flag. This uses synthetic hosted
responses, not live approval or an activated production orchestration helper.
Accepting contained bytes still does not waive the caller's separate latest-source
and exposure-currentness policy.
Default-reader use separately requires installed/authenticated GitHub CLI;
missing authentication/tooling/permissions, unavailable evidence and exceeded
limits are failures, not permission to skip validation or fabricate success.
Finalization/push still requires [all Library checks](../README.md#validation).

Protected job wiring/settings, trusted anchors, complete required-check/review
verification, publisher-run/artifact/deployment/status/receipt binding and live
publication recovery remain separate unresolved gates. No production activation
or state-branch initialization is supplied here.
