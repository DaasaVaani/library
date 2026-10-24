# Documentation history

## Owner-authorized review-branch publication validation (2026-10-25)

- The owner now authorizes committing/pushing the six pending Library paths
  only to `source/provisional-verse-proposals-568db957` for review. The parent
  owns staging, commit, push and exact-CI verification; this validation task
  performs none of them and makes no future push/CI success claim.
  Main/reviewed-content status, Shared8bd, deferred667, source bytes/holds,
  all5,108 uncertain proposals and retained diagnostic files remain unchanged.
- Starting HEAD is `568db9579c50ca3de59c45e3dead28a127434c13`, committed tree
  `169deb938c62a24588476bf264b9e18e84030ee4`, with empty staging.
  Exact pending scope: `HISTORY.md`, `README.md`, `package.json`,
  `docs/zip-store.md`, `tools/zip-store.ts`, `tools/zip-store.test.ts`.
- A fresh single full `npm run check` and all applicable repository/YAML/
  actionlint-with-ShellCheck/new-file/documentation/whitespace checks are
  required for this publication handoff. No test weakening, automatic failure
  retry, source generation, repin, installation or host-permission change is
  authorized. Android remains on hold; no other repository/service is touched.
- Fresh `npm run check` passed once at01:32 using repository-local TEMP/TMP:
  strict build/typecheck,44/44 tests (zero failures/cancellations/skips),
  source validation871 imported/125 held, unchanged proposal validation870
  sources/5,108 uncertain candidates. The seven ZIP tests and synthetic
  fixture/canonical artifact integrity/failure tests were included. No real
  source artifacts were generated. Exact output:
  `library-review-branch-final-full-20261025.log`.
- `python tools\check_repository.py` passed917 tracked files; the documented
  Node/YAML parser passed all ten files; installed actionlint1.7.12 with explicit
  ShellCheck0.11.0 passed both workflows using the exact executable command
  recorded below. Zero tracked standalone `.sh`/`.bash` scripts were found.
  `git --no-pager diff --check`, `git --no-pager diff --cached --check`
  and `git --no-pager show --format= --check HEAD` all passed. Evidence:
  `library-review-branch-final-checks-20261025.log`.
- Supplemental non-writing `python -` checked920 tracked/untracked files,
  all six exact pending paths and all three Markdown files: UTF8, newlines,
  whitespace, balanced fences,15 local links and zero local heading-anchor
  references passed. Staging remained empty. Proposal SHA256, six retained
  gzip hashes and baseline source/original/Shared comparison were unchanged.
  Evidence: `library-review-branch-final-newfiles-20261025.log`.
  Only this documentation result was appended after the full pass; executable
  code/settings remain identical. No duplicate full run was needed.
- All applicable executable validation gates pass for parent review-branch
  publication handling. Linguistic review, reviewed-content status, public verse
  activation and broader release gates remain independent; candidates remain
  uncertain. No local staging/commit/push/repin was performed and no remote CI
  outcome is claimed.

## Restart Manager diagnostic correction and filesystem clearance (2026-10-25)

- Correcting the prior chronology explicitly: the directory GetList error5
  was misclassified as an authorization/access barrier and incorrectly used
  to gate later validation. Microsoft's
  [RmGetList documentation](https://learn.microsoft.com/en-us/windows/win32/api/restartmanager/nf-restartmanager-rmgetlist)
  defines this result as a registered path being a directory. Registering that
  directory was an unsupported diagnostic use, not evidence of filesystem
  permissions, a security restriction or the EBUSY cause. Prior entries remain
  above/below as historical records, not valid current diagnostic guidance.
  No further directory Restart Manager calls will be made.
- Ordinary directory metadata/listing had succeeded; six file queries reported
  no affected processes, and the owner's exact/broader Resource Monitor
  searches returned no results. These are limited no-owner observations, not
  proof that no lock ever existed or attribution of the original failure.
- With the owner's explicit correction and authorization, ran one isolated
  lifecycle probe at configured
  `node_modules\.cache\verse-validation`, using installed Node22.15.0 and
  repository-local TEMP/TMP. Probe root was
  `daasavaani-lifecycle-XO0f1J`. Exclusive creation, write, awaited close,
  read, rename, reread and recursive deletion all passed without retry options
  or sleeps. Its owned directory was removed normally; the retained old six
  gzip filenames/SHA256 inventory was identical before and after.
  Evidence: `library-corrected-api-lifecycle-probe-20261025.log`.
- This concrete new filesystem clearance permits the single authorized full
  validation attempt, not a claim of an established lifecycle fix. No product
  code, test assertions, retry settings, permissions or host policy changed.
  Preflight had about3GiB physical memory and480GB disk free. HEAD568/tree169,
  Shared8bd, deferred667, protected sources/holds and proposals were preserved.
- Archived the replaced ZIP guide status sentence: "The existing full-suite
  EBUSY blocker remains unresolved; focused checks do not establish finalization
  or publication readiness." The current guide instead states the enduring
  full-validation gate; dated failure/pass evidence belongs here.
- The one authorized `npm run check` completed successfully at01:26 with
  repository-local TEMP/TMP: strict build/typecheck and all44 tests passed,
  with zero failures/cancellations/skips, including all seven ZIP tests and the
  previously failing deterministic fixture publication/cleanup test. Source
  validation passed871 imported/125 held; persisted proposal validation passed
  unchanged870 eligible sources/5,108 uncertain candidates, including4,238
  blank-separator endpoints and870 final closures. Protected lyric exclusion
  remained in force. Canonical/fixture artifact schema, hashes, bounds and
  failure-preservation assertions ran as synthetic tests; no real source-PR
  artifacts were generated. Evidence:
  `library-corrected-preflight-full-20261025.log`. No code/settings changed
  after this successful run; subsequent edits only record documentation results.
- `python tools\check_repository.py` passed917 tracked files. The documented
  installed-Node/YAML fallback
  `node --input-type=module -e 'import {readdirSync,readFileSync} from "node:fs"; import {join} from "node:path"; import {parseDocument} from "yaml"; for (const root of [".github","settings"]) for (const p of readdirSync(root,{recursive:true}).filter(p=>/\.ya?ml$/.test(p))) {const file=join(root,p); const doc=parseDocument(readFileSync(file,"utf8"),{uniqueKeys:true}); if(doc.errors.length) throw new Error(String(doc.errors)); console.log("Parsed "+file);}'`
  passed all ten workflow/issue-form/settings files (the executed equivalent
  also printed the total). `git --no-pager diff --check`,
  `git --no-pager diff --cached --check` and
  `git --no-pager show --format= --check HEAD` all exited0. Evidence:
  `library-corrected-preflight-hygiene-20261025.log`.
- Parent supplied existing approved lint executable paths; no tool was
  installed. Executed
  `& 'C:\Users\pots\AppData\Local\DaasaVaani\toolchains\actionlint-1.7.12\actionlint.exe' -shellcheck 'C:\Users\pots\AppData\Local\DaasaVaani\toolchains\shellcheck-0.11.0\shellcheck.exe' .github\workflows\hygiene.yml .github\workflows\publish-lyrics.yml`
  successfully, covering both workflows with ShellCheck enabled. Version
  commands confirmed actionlint1.7.12/ShellCheck0.11.0. `git ls-files '*.sh' '*.bash'`
  found zero tracked standalone shell scripts, so no separate standalone
  invocation applies. Evidence: `library-final-actionlint-shellcheck-20261025.log`.
- Supplemental non-writing inline Python (`python -`) enumerated
  `git ls-files --cached --others --exclude-standard -z`, validating UTF8,
  final newlines and scoped whitespace across920 tracked/untracked files.
  It explicitly included all three new ZIP paths. Pending `HISTORY.md`,
  `README.md` and `docs/zip-store.md` passed Markdown-fence and local-link/
  heading-anchor validation:15 local links and zero local heading-anchor
  references. Evidence: `library-final-new-files-docs-anchors-20261025.log`.
- Executable validation and applicable workflow/hygiene gates now pass; no
  proven project lifecycle bug or underlying EBUSY owner is claimed. The prior
  failures and mistaken diagnostic chronology remain archived, not erased.
  ZIP remains an ALG-08/GEN-03 prerequisite, and DATA-02/03/08 authoring aids
  remain distinct from DATA-07 linguistic review/public verse approval.
  All5,108 candidates remain uncertain. No commit/push/repin/real artifact
  generation was authorized here; six pending paths and retained failure data
  remain for parent scope/publication handling.

## Owner-assisted Library preflight, stopped on denial (2026-10-25, 01:23)

- New owner evidence: Resource Monitor CPU/Associated Handles searches for
  both `daasavaani-publisher-9fpEac` and `daasavaani-publisher` returned
  no results. The owner did not authorize Handle download or elevation.
  These observations do not prove absence of a lock at failure time.
- Confirmed expected HEAD568/tree169, Shared8bd, deferred667 and all six pending
  paths before the newly authorized single observation. Normal metadata/listing
  access succeeded for retained
  `node_modules\.cache\verse-validation\daasavaani-publisher-9fpEac\objects`;
  it remained an ordinary directory containing six files. Metadata access is
  not a deletion-lifecycle clearance test.
- Repeated exactly the original Restart Manager directory-ownership observation
  once, without an alternative API/access route. StartSession and
  RegisterResources returned0; GetList again returned Win32 error5 (access
  denied), zero reported count; EndSession returned0. The zero count alongside
  a failed query is not a successful no-owner result. This diagnostic denial
  does not itself prove source/filesystem permissions caused the earlier EBUSY.
- Followed the explicit stop-on-denial condition: no new synthetic lifecycle
  probe, complete validation, cleanup of retained files, code patch, timing/
  retry change, installation, elevation or host-policy change. Current
  authorization therefore does not permit progressing to the full-check gate.
  Further recovery needs an explicit host-authorized diagnostic/remediation
  decision, not another automatic query or suite attempt. No holder was inferred
  and no user/unknown process was stopped.
- Exact preflight evidence is in session file
  `library-owner-assisted-preflight-20261025.log`. The prior36/37 EBUSY full
  result remains blocking; ZIP foundation has no new combined-suite evidence.
  Only this history record changed. Sources, holds,5,108 uncertain proposals,
  all ZIP work, staging, pins and parent services were preserved; no commit,
  push, repin or owned helper was created.

## Installed handle-diagnostic discovery (2026-10-25, 01:10)

- Under the owner's bounded fix request, checked diagnostic command discovery,
  running diagnostic processes, named App Paths registrations and a bounded set
  of conventional Sysinternals/Chocolatey/Scoop/WinGet and Library tool locations.
  No Handle/Process Monitor/Process Explorer executable was found in those
  locations, on PATH or running; no matching uninstall registration was found.
  This is not an exhaustive machine search or proof that none exists elsewhere.
  No tool was installed/downloaded/launched and no denied operation was retried.
- Verified installed `C:\Windows\System32\resmon.exe`, file version
  `10.0.26100.9711`. Resource Monitor offers a host-interactive diagnostic, not
  a verified usable unattended ownership-capture interface in this session.
  It was not launched, and its host UI/access requirements were not assumed
  satisfied. The retained failing `objects` directory still has six gzip files;
  no holder or current lock was inferred from their presence.
- Exact minimal host request: open the already-installed Resource Monitor;
  on CPU expand Associated Handles and search
  `daasavaani-publisher-9fpEac`. Return matching Image/PID/Type/Handle Name rows
  for the retained fixture directory and its `objects` child, or explicitly
  report no matches. Do not terminate a process based on search alone.
  If access is denied or the UI cannot be opened under authorized host access,
  report the precise restriction rather than bypassing it. This request needs
  host interaction; no new installation or elevation is requested or presumed.
  A no-match result alone would not prove the earlier failure cause cleared.
- Discovery evidence is in session file
  `library-installed-handle-diagnostic-discovery-20261025.log`. No verified
  task-owned holder/lifecycle bug was found, so no cleanup, code fix or suite
  retry was performed. The existing full-validation gate remains blocked.
  Only this history addition changed; all six pending paths, source568,
  Shared8bd, deferred workflow branch, holds and uncertain proposals were
  preserved. No commit, push, repin or owned helper was created.

## Library validation gate reassessment (2026-10-25, 00:11)

- Rechecked the same Library blocker under the owner's renewed cross-repository
  completion request. This delegated scope explicitly retained the no-commit/
  no-push/no-repin restriction and required credible new evidence or remediation
  before another full run. HEAD remains
  `568db9579c50ca3de59c45e3dead28a127434c13`, committed tree
  `169deb938c62a24588476bf264b9e18e84030ee4`, with Shared
  `8bd8793afb9f2fd43d52b62bc5436bbd4da1b0ce`.
- Preserved all six pending paths: `HISTORY.md`, `README.md`, `package.json`,
  `docs/zip-store.md`, `tools/zip-store.ts` and `tools/zip-store.test.ts`.
  The existing package test command now includes the seven ZIP foundation
  tests; their earlier focused pass does not validate the combined full suite.
  No diff exists in `tools/publisher.ts` or `tools/publisher.test.ts`, and no
  independent lifecycle fix or confirmed host-side resource clearance was
  supplied. The exact retained
  `node_modules\.cache\verse-validation\daasavaani-publisher-9fpEac\objects`
  directory still contains six files. Its continued existence alone is not
  evidence of a currently held lock or its owner.
- No genuinely new resource-ownership evidence was available beyond the bounded
  prior diagnostics: application-owned leak unproven, Restart Manager file
  query reported no owners, directory query returned access denied. Did not
  repeat denied queries, bypass access, change host settings/retry policy,
  install tools, terminate processes or launch a blind full-suite retry.
  Other-repository/device activity is not evidence that this directory's
  failure cause has been resolved.
- Full validation cannot legitimately resume yet under this bounded scope.
  Required host-owner action: obtain a scoped directory-handle/operation-owner
  capture for that exact path using an already-approved host diagnostic, without
  bypassing denied access. If a holder is verified, resolve its ownership through
  its normal supported lifecycle and provide concrete clearance/remediation
  evidence for a coordinated full run. If capture itself requires unavailable
  access, the host owner must supply the evidence; Library cannot infer it.
  No blanket process termination or antivirus change is proposed.
- No build/test/source/artifact/YAML/actionlint/ShellCheck validation was newly
  attempted or claimed passed. The last authorized complete run remains
  build/typecheck passed,36/37 tests with EBUSY, subsequent source/proposal
  validators not reached. ZIP integration still needs a full combined pass;
  any later run must include it and all owning documented checks without
  suppressing the existing fixture test or generating real source-PR artifacts.
- Only this additional history record was edited. Existing ZIP work/staging,
  canonical sources, originals, holds,5,108 uncertain proposals, deferred
  workflow branch, independent pins and parent-owned services remain untouched.
  No commit, push, PR or owned helper was created.
- History hygiene only: `python tools\check_repository.py` passed917 tracked
  files; `git --no-pager diff --check` and
  `git --no-pager diff --cached --check` exited0. The proposal SHA256 remains
  `c6f624966cf8beed11c213f352edb8f1beabaef55edb88cf65b2ce05d8ca2eea`.
  Evidence is in session file `library-verse-gate-reassessment-20261025.log`;
  these checks do not unblock the full-validation gate.

## Bounded ZIP STORE byte prerequisite (2026-10-24)

- Added standalone `tools/zip-store.ts` construction and strict verification for
  original gzip object bytes (ALG-08/GEN-03 prerequisite only). Reused the existing
  deterministic gzip producer in synthetic tests and the published hash-addressed
  object-path format. No existing ZIP/CRC helper was present. Explicit caller
  limits count all ZIP overhead; no product defaults, Shared pin/settings,
  changedAt/grouping/packing semantics or publisher integration were added.
- `npm run build` passed (configured strict TypeScript build).
  `node --import tsx --test tools\zip-store.test.ts` passed all7 focused pure
  synthetic tests, with no failures/skips. Tests include original-byte preservation,
  deterministic metadata/order, an independent known CRC32 vector, exact count/
  total-size limits, malformed paths/hashes, exhaustive single-byte corruptions/
  truncations and non-STORE/ZIP64 refusal.
- `python tools\check_repository.py` passed (917 tracked files).
  `git --no-pager diff --check` and
  `git --no-pager diff --cached --check` passed. The hygiene script covers tracked
  files; the new untracked TypeScript files were included by the configured build
  and focused tests. New documentation was checked directly.
- Existing dirty HISTORY evidence was preserved. Sources, proposal candidates,
  holds, originals, staging and other repositories were not changed; no real
  generation/publication, server access, commit or push occurred. The known
  full-suite EBUSY blocker was not retried or attributed to a lock owner.
  Full finalization/publication remains BLOCKED until all configured suites can
  complete successfully; the targeted pass is not final release readiness.

## Bounded publisher cleanup root-cause follow-up (2026-10-24, 23:00)

- The owner authorized investigation of the existing EBUSY blocker, not another
  blind validation run or changes to cleanup retry/timing policy. Library HEAD,
  tree, Shared pin and the existing unstaged history record matched the previous
  handoff. No test suite, publication, import or source generation was rerun.
- Inspected `tools/publisher.test.ts`, its `publish` implementation, sibling
  test fixture lifecycles and the installed Node22.15.0 filesystem implementation.
  The publisher awaits every path-based read/write, both complete publications
  and every verification read before its final recursive removal. There is no
  application-managed file handle, directory iterator, stream, watcher, server
  or child process on this path. Sibling fixtures use independently allocated
  `daasavaani-lyrics-*`, `daasavaani-source-import-*` and
  `.cache/verse-tests-<UUID>` roots, not the failing publisher directory.
  Importer fault-injection mocks restore their methods in `finally`; the
  configured Node test runner uses separate test-file processes. Imported YAML
  helpers do not execute their CLI generator when imported. No concrete
  cross-fixture ownership collision or missing application close was found.
- Read the installed Node code through `process.binding('natives')`, without
  editing runtime/dependencies. `internal/fs/promises` path-based `readFile`
  and `writeFile` return `handleFdClose`, which awaits closure on both success
  and failure. `readdir` returns the completed binding result, not a live
  directory iterator. `internal/fs/rimraf` attempts `rmdir` before recursing
  into children; only ENOTEMPTY/EEXIST/EPERM take that recursion branch, not
  EBUSY. Thus six retained gzip files are consistent with an early directory
  removal failure; they do not prove six outstanding file operations.
  This explains the observed cleanup control flow, not the underlying Windows
  lock owner or a proven Node defect.
- Used the existing Windows Restart Manager API for one scoped ownership query
  of the six files in retained
  `node_modules\.cache\verse-validation\daasavaani-publisher-9fpEac\objects`
  and one query of that exact directory. File registration/query succeeded
  with zero reported affected processes. Directory registration succeeded but
  its query returned Win32 error5 (access denied), so directory ownership
  remains unknown. Both diagnostic sessions ended successfully. This was only
  StartSession/RegisterResources/GetList/EndSession: no resource shutdown,
  restart, elevation, permission modification or settings change.
  The directory remains an ordinary directory, not a reparse link; no process
  command line referencing this exact fixture was found. These later
  observations cannot identify the owner at the earlier failure time or rule
  out filesystem/filter-driver interference.
- Additional session evidence is in
  `library-verse-node-cleanup-lifecycle-20261024.log` and
  `library-verse-resource-query-20261024.log`. Existing failure logs and the
  retained fixture were preserved. No application-owned resource bug was
  proven, so no speculative code patch, targeted rerun or full retry was made.
  The prior full result remains36/37 tests and a blocked publication gate.
- Minimal next external step: have the host owner capture the exact directory's
  handle ownership at failure using an already-approved host diagnostic, then
  address only a verified holder through its normal lifecycle and coordinate a
  new full validation window. This investigation neither authorizes installing
  tools/changing host policy nor attributes the failure to antivirus. No
  processes or parent-owned HTTP/server/device resources were disturbed.
- Only `HISTORY.md` changed; no staging, source/original/proposal bytes,
  deferred branch, Shared pin, consumer worktree, commit, push or PR changed.
  The5,108 candidate boundaries remain uncertain DATA-02/03/08 authoring aids,
  not completed DATA-07 review or approved public verse truth.
- Follow-up documentation checks passed: `python tools\check_repository.py`
  (917 tracked files), `git --no-pager diff --check` and
  `git --no-pager diff --cached --check`. The baseline source/original/Shared
  comparison command recorded below again exited0; proposal SHA256 remained
  `c6f624966cf8beed11c213f352edb8f1beabaef55edb88cf65b2ce05d8ca2eea`.
  Evidence is in `library-verse-followup-history-hygiene-20261024.log`;
  none of these checks replaces the failed full suite.

## Bounded provisional verse validation resume (2026-10-24)

- Resumed only Library on clean
  `source/provisional-verse-proposals-568db957`, HEAD
  `568db9579c50ca3de59c45e3dead28a127434c13`, tree
  `169deb938c62a24588476bf264b9e18e84030ee4`; local/remote main remained
  `c2837ccf383b976a1e2d20928ff018256270551c`. The deferred
  `deferred/workflow-validation-support-667a2a7` branch was preserved.
  No workflow/authentication/permissions changes or publication were attempted.
- Before the single newly authorized complete attempt, disk had about481GB free,
  physical memory about2.2GiB free, and no Library Node/test process was active.
  Used installed Node22.15.0/npm10.9.2 without dependency/toolchain installation.
  With `TEMP` and `TMP` set to repository-local
  `node_modules\.cache\verse-validation`, ran exactly `npm run check`.
  Strict build/typecheck passed; the full suite failed36/37, with zero
  cancellations/skips. Source/proposal validators were not reached because the
  configured command stops after test failure.
- The failing test was `fixture publication is deterministic and all artifacts
  verify` in `tools/publisher.test.ts`. Node reported `code: EBUSY`,
  `failureType: testCodeFailure`, location
  `tools/publisher.test.ts:1:1677`, and
  `EBUSY: resource busy or locked, rmdir` for
  `node_modules\.cache\verse-validation\daasavaani-publisher-9fpEac\objects`.
  The TAP output supplied no additional stack. Direct lifecycle inspection found
  both `publish` calls and all artifact reads awaited before the final
  `await rm(output, { recursive: true })`; no concrete code-owned handle leak
  was established. No speculative cleanup retries, timeout changes or code fixes
  were applied, and the full command was not rerun.
- Bounded read-only evidence after failure found that exact `objects` directory
  still present with six gzip files and no Library Node/tsx/esbuild process.
  Existing unrelated Node processes were left untouched. `handle`/`handle64`
  were unavailable; `openfiles /query /fo csv /v` exited1, reporting disabled
  local object tracking and access denied. No tracking setting, elevation,
  antivirus change or process termination was attempted. The locking resource
  owner and root cause remain unproven; the exact failed directory was retained
  for inspection rather than deleted.
- Full output and bounded evidence were saved in session files
  `library-verse-resume-full-20261024.log` and
  `library-verse-resume-evidence-20261024.log`. No targeted result substitutes
  for this failed full gate. Further complete validation requires a newly
  coordinated run; YAML/actionlint/ShellCheck and remaining full validation were
  not claimed as passed by this attempt.
- `git diff c2837ccf383b976a1e2d20928ff018256270551c --exit-code -- library text_files_from_source shared`
  passed. Sources, the protected lyric, receipt, originals and Shared pin were
  not changed. Shared remains
  `8bd8793afb9f2fd43d52b62bc5436bbd4da1b0ce`. The proposal file remains
  1,090,422 bytes, SHA256
  `c6f624966cf8beed11c213f352edb8f1beabaef55edb88cf65b2ce05d8ca2eea`:
  870 eligible sources,16,392 canonical lines and5,108 uncertain candidates,
  with125 raw-input exceptions still held. DATA-02/03/08 authoring support is
  unchanged; DATA-07 review/public verse activation is not completed.
- Only this history record was edited on resume. No commit, push, PR, real
  generated variants, consumer/pin changes, servers or device/browser work was
  performed. Publication readiness remains blocked by the repeated full-suite
  failure, not by missing push authorization alone.
- History-edit hygiene passed: `python tools\check_repository.py` checked917
  tracked files; `git --no-pager diff --check` and
  `git --no-pager diff --cached --check` both exited0. These documentation
  checks do not clear the failed full-suite gate.

## Owner-authorized provisional verse proposals (2026-10-23)

- Starting Library HEAD was `c2837ccf383b976a1e2d20928ff018256270551c`,
  with no staged/unstaged changes. The owner explicitly permitted best-guess
  verse boundaries for later inspection/modification, not fabricated review or
  canonical/public source changes. Only Library changed; no push was authorized.
- Added the separate `reviews/verse-proposals.json` review ledger, strict owned
  settings, deterministic proposal tool, eight synthetic tests and operating
  guide. Commands create once/validate unchanged; manual edits survive reruns.
  Whole-source hashes reject stale reviews. Existing source schema/line endpoints
  are reused without changing source bytes or publication eligibility.
- Actual inventory:871 imported sources and125 held raw-input exceptions.
  Proposals cover870 unheld, undeclared sources and16,392 canonical line IDs.
  The protected tagged source
  `2a9c9cd3-5ade-40cd-b6eb-b8538c35f34c.md` is explicitly excluded before
  proposal reading. No held inputs were retried, interpreted or modified.
  All5,108 candidate verses remain provisional/uncertain:4,238 ends have existing
  blank-separator evidence and870 are final coverage closures. No owner-edited
  endpoints or single-span fallback sources occurred in this batch. No markers,
  linguistic truth, media/classification, variants or approvals were inferred.
- `npm run verses:propose` created1,090,422 bytes with SHA256
  `c6f624966cf8beed11c213f352edb8f1beabaef55edb88cf65b2ce05d8ca2eea`.
  A rerun passed unchanged with identical bytes and write time. A separate
  in-memory fresh-generation comparison matched the persisted bytes exactly.
  `git diff c2837ccf383b976a1e2d20928ff018256270551c --exit-code -- library text_files_from_source shared`
  passed, confirming no tracked source/protected-file/receipt/pin changes.
- Initial focused typecheck found literal-type/narrowing errors; corrected.
  Initial focused tests found two test-construction/assertion mistakes; corrected.
  The final focused command
  `node --import tsx --test tools\verse-proposals.test.ts` passed8/8.
  Full checks initially hit transient Windows `EBUSY` during existing synthetic
  fixture teardown (34/37 twice; serial diagnostic35/37). Added bounded retry
  only to importer/publisher fixture-root cleanup, matching existing production
  cleanup policy; no assertions or suites were removed/skipped. Subsequent
  `npm run check` passed strict build/typecheck,37/37 tests, source validation
  (871 imported/125 held) and persisted proposal validation (870/5,108).
  Test TEMP/TMP were redirected to repository-local `.cache\validation`, not
  the operating-system temporary directory.
- `python tools\check_repository.py`, workflow/issue-form/settings YAML parsing
  using the documented installed-Node/YAML fallback, `git diff --check` and
  `git diff --cached --check` passed. Ruby was unavailable; the installed YAML
  parser checked all ten YAML files instead. No dependencies/toolchains were
  installed. No HTTP/provider/browser/server/device slots or real generated
  artifacts were used. Public verse adapters, human verse review and remaining
  production/release gates remain unproven and blocked as documented.

## Owner-reviewed source metadata and explicit footer adaptation

- The owner confirmed text review and selected all approved author-editable
  source metadata fields, with unknown text/collections empty and review booleans
  unassessed/null. No generated dates, fake media, inferred classifications or
  new existing-record identities are permitted.
- Archived replaced current wording: prepared lyrics could be published while
  offline linguistic review remained a public-launch gate. That review is now
  confirmed complete; other production/release/rights/language gates remain.
  README previously called the entire implementation fixture-only, despite the
  separately implemented canonical prelaunch pipeline.
- The owner explicitly superseded the earlier keep-all-exceptions-for-manual-
  preparation policy for structured labelled credit footers. The old source guide
  required holding returning Kannada even for labelled footer text and prohibited
  automatic provenance separation. The new narrow grammar preserves recognized
  terminal credit/keyword/range blocks verbatim without interpreting authorship.
  Unknown sections and encoding/control exceptions remain held.
- Independently adopted Shared8bd8793afb9f2fd43d52b62bc5436bbd4da1b0ce after exact
  preflight39679248387 and main39679540067 passed the required named job. Shared
  metadata/labels and official Unicode16 resources passed the integrated25 tests.
  Library does not use Unicode data to infer labels or correct lyric text.
- Completed empty metadata on229 prepared records, proving unchanged known header
  values, all5450 existing line IDs, literal bodies/Source Latin and receipt bytes.
  Verified every996 original basename/length/SHA256 against the pre-import snapshot.
- Actual approved footer retry converted642 additional records:871 imported and125
  still held (122 returning-Kannada ambiguity, one malformed/unsupported encoding,
  one unsupported control, one missing initial Kannada section). Every new record
  reconstructed the complete LF-normalized original using canonical/Latin/footer
  segments, with no text deletion, attribution or media inference.
- Existing229 records retained all text/layout, titles, known provenance and
  review decisions. Released only the import-review hold on the642 newly prepared,
  owner-approved records after preservation checks. No source variants/previews
  were generated. Original text files remain ignored and never committed.
- During a verified no-change retry, Windows briefly retained an empty staging
  directory handle and cleanup raised EBUSY. Active sources stayed intact.
  Changed no-op retry to create no staging tree and added bounded owned-directory
  cleanup retries; recovery/failure remains explicit and backups are preserved
  when activation rollback fails.
- Final corpus proof:871 records with16406 canonical line IDs and5164 layout
  records; all229 earlier records' known values/identities/text preserved and all
  642 new records exactly reconstructed their normalized raw inputs. Identical
  retry preserved every source/receipt byte and write timestamp. All996 originals
  again matched the saved basename/length/SHA256 inventory.
- `npm run check` passed strict TypeScript, all29 tests with zero failures/
  cancellations/skips and actual871-source/125-exception validation.
  `python tools\check_repository.py` passed911 staged tracked files.
  Strict YAML parsed all9 files; actionlint1.7.12/ShellCheck0.11.0 and both
  whitespace checks passed. All872 staged source/receipt Git blobs matched working
  bytes exactly; tracked/staged original text files remained zero.

## 2026-10-21: owner-authorized canonical prelaunch publication

- The owner authorized publishing the prepared lyrics now and undertaking
  offline review before public launch. This supersedes this batch's earlier
  no-auto-merge/source-import-review publication gate, not the public launch
  review gate, other holds, provider hold or the instruction never to commit
  originals. All767 extraction exceptions remain held for manual preparation.
- Released only `source-import-review` from229 prepared source headers. Verified
  unchanged public/provenance fields, canonical text/layout, supplied Latin and
  all5450 assigned line UUIDs; no lyric UUID/title was replaced. Original text
  files and the global receipt were not rewritten.
- Independently adopted published Shared
  `26a02b3423060d8efa7897cd92844a79ffdacc9c` after exact preflight39672246397
  and main39672859078 passed the required named job. Shared contains common
  source headers, strict draft specialization and separate canonical-text
  prelaunch publication schemas/types; no consumer pin is updated in lockstep.
- Added a distinct bounded canonical publisher and post-merge-only Pages workflow.
  Reused existing canonical JSON/deterministic gzip helpers; fixture behavior
  remains separate. Source review tests generate only synthetic artifacts.
- Archived replaced AGENTS wording: all automatic source publication was
  unauthorized. Also archived the policy implication that supplied Latin was
  already published with flags: that remains the production target, while this
  prelaunch canonical-only family excludes unreviewed Latin. No owner identity,
  license, rights status, attribution mapping, media or verse was invented.
- Initial `npm run check` after independent pin adoption passed strict TypeScript,
  all19 publisher/import tests with zero failures/skips, and source validation.
  Additional mixed-held-source coverage and final source release followed.
- Final `npm run check` passed strict TypeScript, all19 tests with zero
  failures/skips and actual229-source/767-exception validation.
  `python tools\check_repository.py` passed268 tracked files; strict YAML parsed9
  workflow/form/settings files; actionlint1.7.12/ShellCheck0.11.0 and staged
  whitespace passed. Actual import rerun preserved all230 source/receipt hashes,
  write times and explicitly released holds. All996 originals again matched
  the pre-import length/SHA256 snapshot and remained ignored/uncommitted.
- GitHub initially rejected Library Pages creation because organization Pages
  creation was disabled. After explaining that creation permission cannot be
  scoped to two repositories, the owner explicitly approved permanent public
  Pages creation across the organization, retaining disabled private creation.
  Verified the persisted documented overall/public/private settings, provisioned
  Library's public Actions site, and confirmed Website's existing Actions site
  was unchanged. Site provisioning is not evidence of successful feed deployment.

## 2026-10-21: retain import exceptions for manual preparation

- Presented the explicit credit-footer alternative after local extraction:
  preserve clear trailing credit blocks as provenance notes versus retain all
  exceptions. The owner selected keeping all767 exceptions held for manual
  preparation, with no contract change. No supplied credit was reclassified or
  dropped and no new provenance-note field was added.
- Prepared separate source review for the229 successfully extracted drafts,
  every one still carrying `source-import-review`. The global receipt accounts
  for all996 inputs and767 held exceptions. Original text files remain ignored,
  untracked and absent from source commits; no real variants/previews/media or
  inferred verses were generated.
- Original-input protection commit `d18a7dc437135ce0ff8626ae0b87d46e24dbd0f1`
  passed exact required preflight39669498167 and main39669637524, including
  `Bootstrap files and YAML syntax`. Its three-file change contains no source
  payloads. The completed validation branch was removed only after confirming
  its unchanged tip was contained in main and no open PR referenced it.

## 2026-10-21: keep owner originals local

- The owner explicitly reiterated that original text files must not be committed.
  Verified zero tracked/staged files under `text_files_from_source/`; the importer
  tooling commit contains no original inputs or real drafts. Added a root-scoped
  Git ignore rule for the entire original-input directory and made its local-only
  status explicit in the operating guide. Separate draft review remains distinct
  from committing originals.
- `git check-ignore text_files_from_source`: passed; tracked/staged original
  count remained zero. All996 files matched the pre-import byte lengths/SHA256,
  with no missing/added originals. Local extraction accounted for every file:
  229 held drafts and767 explicit exceptions. Of764 returning-Kannada cases,
  661 begin with an explicit supplied Kannada credit label; no footer was
  silently discarded/reclassified. Other exceptions need review.
- `npm run check`: passed strict TypeScript, all15 tests with zero failures/skips,
  and actual validation of229 drafts/767 receipt exceptions.
  An actual import rerun explicitly returned unchanged/exit2 for retained
  exceptions; all230 draft/receipt files preserved byte hashes and write
  timestamps, including every assigned UUID.
  `python tools\check_repository.py`: passed32 tracked files; `git diff --check`
  passed. All real drafts/receipt remain uncommitted pending source review.
- Importer tooling commit `4c7a8bb50e1a76b8f221c73b7859c17612b2e634`
  passed exact required preflight39668533933 and main39668729205, including the
  named `Bootstrap files and YAML syntax` job in both. The existing authorized
  main exception was used without changing rules; no original payload was pushed.

## 2026-10-21: held source-review batch validation

- Source branch contains229 held canonical draft Markdown files with5450
  once-assigned line UUIDs,1488 preserved layout lines and228 literal supplied
  Latin blocks. One draft is Kannada-only. The global batch receipt is not a
  per-item companion source file. No original text files, media associations or
  generated variants/previews are staged.
- `npm run check`: passed strict TypeScript, all15 publisher/import tests with
  zero failures/skips, and actual source validation reporting229 imported/767
  held exceptions. `npm run sources:import` deliberately returned exit2 for
  those exceptions; it is not a successful full-corpus conversion or linguistic
  review. No holds were cleared.
- `python tools\check_repository.py`: passed262 staged tracked files.
  Working/staged `git diff --check` passed with only literal source-file
  whitespace exempted. Existing Shared `strictYaml` parsed7 configuration YAML
  files; actionlint1.7.12/ShellCheck0.11.0 passed.
- This authoring-only batch does not update consumer pins, public artifacts or
  runtime code. Website/Android suites were not run for it and no new consumer
  compatibility, publication or release-ready claim is made. Source review and
  production gates remain open; the branch must not be auto-merged.

## 2026-10-21: authorized owner-supplied draft authoring

- The owner explicitly authorized separate held Markdown drafts from the supplied
  text files, preserving all originals. Initial Kannada is canonical, following
  Latin is literal supplied Source Latin. The first Kannada lyric line is the
  approved initial title; manual title corrections must survive reruns.
- Superseded blanket AGENTS text: "Source migration is not authorized." The new
  permission is only this bounded draft workflow, not other migration,
  automatic publication, media matching or provider access.
- Archived superseded content-rights guidance: no per-item rights/attribution
  gate or publication prerequisite had been selected; sibling source Markdown
  was unreviewed and items were to be re-ingested from YouTube. It also described
  Website settings as empty and its Library directory as absent. Current approved
  lyric identity permits owner-supplied provenance and optional media; precise
  production rights-evidence/notice fields remain open. No legal permission,
  identity/license declaration or public attribution was manufactured.
- Independently advanced Library's Shared pin to published
  `1d588c3e0b314e3ccbfa4bd15702020a2ba83fbf`, after Shared main CI39667134097
  passed. It supplies the draft-header schema, not completed public item/list-v2
  contracts or consumer adapters.
- Initial focused validation found two test-only defects: YAML title quote-style
  assumption and indexed-value callback narrowing. Corrected those tests.
  `npm run check` then passed strict TypeScript and all15 publisher/import tests;
  no draft directory existed, explicitly no actual source records validated.
  Further fail-closed UTF8/receipt/inventory hardening followed; final-tree
  validation is recorded separately below. Originals were not changed by tests.
- Final importer hardening rejects malformed UTF8 records, future/empty receipts,
  extra/missing drafts, conflicting provenance and concurrent import locks.
  `npm run check`: passed strict TypeScript, all15 tests, zero failures/skips;
  absent real source directory was explicitly reported, not claimed validated.
  `python tools\check_repository.py`: passed32 staged tracked files.
  Existing Shared `strictYaml` parsed all7 workflow/form/settings YAML files.
  actionlint1.7.12 with ShellCheck0.11.0 passed; working/staged `git diff --check`
  passed. Generic whitespace/link exemptions are restricted to literal
  `library/*.md`, backed by mandatory strict source validation.
  No real source conversion, provider access or runtime consumer update was
  included in this tooling validation.

## 2026-10-21: authorized fixture-publisher milestone

- The owner authorized the recommended staged implementation and real desktop,
  mobile and native simulator demos without further choice questions. This
  milestone intentionally used synthetic words/alphabet records, not reviewed
  sahitya, migrated sources or verified video metadata.
- Implemented strict fixture Markdown/YAML parsing, stable line identities,
  held-record exclusion, safe-integer canonical JSON, deterministic gzip with
  platform-independent OS metadata, role bounds, SHA256 object paths, metadata
  catalog and a policy-bound counted-gram index. The descriptor is activated only
  after object writes. Production ledger/receipts/ZIP/deploy and reviewed language
  conversion remain incomplete; live provider ingestion stayed blocked.
- Adopted Shared `b0950e2f01823c471b18fff8abb49ce176d8f26e` only after upstream
  publication and successful exact-revision CI run39585091134.
- `npm run check`: passed TypeScript and all5 publisher tests, including LF/CRLF,
  malformed/duplicate IDs, strict settings, repeated grams, deterministic metadata
  and complete encoded/decoded/hash verification of fixture objects and manifest.
- Expanded hygiene CI to check out pinned Shared and execute the actual publisher
  suite. Local actionlint1.7.12 with ShellCheck0.11.0: passed. Neither fixture tests
  nor this record assert complete product/release readiness.
- Repository checker passed26 staged tracked files; working/staged whitespace
  passed. The four-owner documentation audit passed40 Markdown files, local/
  cross-repository links/anchors/fences and all153 unchanged requirement IDs.

## Archive policy

This is the sole archive for past decisions, superseded guidance, dated
observations and validation records in this repository. It is not current
implementation guidance or evidence of current configuration. Start with
[AGENTS.md](AGENTS.md) and [README.md](README.md) for current instructions.

## 2026-10-21: current-only documentation migration

The owner requested root AI instructions and one history archive per
repository. Incremental checks may be focused; finalization and pushing
require complete applicable builds/tests. Documentation-only changes may
use all available documentation/bootstrap checks while app tooling is absent.
The snapshots below preserve documents before reconciliation, including
then-current approvals and unresolved questions. Their statements may
conflict; consult current documents, never use snapshots as approval.


## 2026-10-21: AI/documentation validation record

- Root AGENTS/HISTORY and current-only README/provider guidance established;
  original snapshots below.
- `python tools\check_repository.py`: passed17 tracked files, including new docs.
  `git --no-pager diff --check` and `git --no-pager diff --cached --check`: passed.
- Cross-repository Markdown audit passed37 files, links/anchors/fences and153
  unchanged Website requirement IDs.
- Ruby/YAML syntax tooling unavailable locally, no workflow YAML changed. No
  publisher/build/source/conformance runner exists; no such pass is claimed.
  The owner approved the documentation-only available-checks exception.
- Provider hold unchanged; no live ingestion/source migration, generated variants,
  dependency/Shared-pin, commit/push or publication/protection change.

## 2026-10-21: direct-main publication authorization

The owner requested committing and pushing all current/staged changes to main
without PRs. Scope: README/provider guidance, AI instructions and history; no source
migration, live API access, generated variants, publisher or Shared-pin update.
Rerun all available documentation/bootstrap checks before publication; provider
hold remains and absent publisher tests are not passes.

## 2026-10-21: coordinated Shared pin correction

- The owner authorized correcting the stale Shared pin from
  `5a2446c31ffb97c9899a7ba3a287e58b2b2eb490` to
  `dbaac0d4c5d255a0c6663d9c21fa2b918761e027`. That target was already published
  and passed Shared Repository hygiene run39576588515 before the consumer
  update. Intervening upstream changes are documentation only.
- Updated the gitlink and linked the Shared-first publication procedure; the
  detached exact-target checkout has no local modifications.
- `python tools\check_repository.py`: passed17 consumer files.
  `python shared\tools\check_repository.py`: passed15 pinned Shared files.
  `git --no-pager diff --check`: passed.
- `python <session-folder>\files\validate-shared-pins.py`: passed58 Markdown files
  including actual pinned checkouts, links/anchors/fences/encoding/whitespace,
  exact clean Shared revisions and153 unchanged Website requirement IDs.
- No publisher/build/source/conformance runner exists; no such success claimed.
  No workflow YAML changed; local YAML tooling is unavailable. Documentation/
  gitlink metadata uses the bootstrap exception, not a code-test waiver.
  Provider hold, source migration and generated-variant restrictions unchanged.

## Snapshot: README.md

# DaasaVaani Library

Bootstrap for reviewed, flat per-video Markdown, catalog registries/configuration,
source assets, ingestion/import implementation, source validation and a future
Node/TypeScript content publisher with tests. Planned direct roots are `library/`,
`registries/`, `settings/`, `assets/`, `tools/`, `shared/`, `docs/` and `.github/`.
Content and application files have not been migrated or generated.

[Shared](https://github.com/DaasaVaani/shared) is pinned at `shared/` as a
language-neutral source dependency, not a shared application runtime. Website,
Android and Library update their pins independently; there are no lockstep
updates. Shared owns schemas/specifications and the UI catalog generator/
committed resources. Exact schemas and implementation remain pending.

The [approved implementation-design record](https://github.com/DaasaVaani/shared/blob/main/docs/implementation-specification.md)
documents the earlier review passes and remaining gates. All configurable
catalog/import/image/publisher values belong in Library settings, portable
profiles/search policy in Shared settings; no hardcoded defaults.

The eventual **generated-only** Pages publication is
<https://daasavaani.github.io/library/>, independently deployed from the
[Website](https://daasavaani.github.io/). Capacity validation is still open.
No deployment is configured here; Website has no Library Git-source dependency.

## Source review and contribution

Clone with `git clone --recurse-submodules https://github.com/DaasaVaani/library.git`,
or run `git submodule update --init` after cloning. Use the issue forms and PR
template; get approval before resolving open design choices.

Source PRs contain canonical Kannada, supplied Source Latin and metadata, not
generated lyric variants/previews or companion source files. Generate actual
variants only after merge. Fixture and tooling checks are allowed in source PRs.
Preserve reviewed corrections, verse structure and identity; transliterate,
never translate. Keep uncertain content as drafts, not fabricated lyrics.
Generated-text fixes belong in global rules/profiles, never item/line overrides
or changes to correct Kannada solely to force conversion.

Review source permissions, attribution and required source assets/settings
together. Public availability is not redistribution permission. Keep private
permission correspondence, secrets and private data out of the repository.
Remote hosting retains only the current publication; safe old-version resume/
repair is not guaranteed. Hosting-limit/headroom preflight is required, with
actual capacity and planner limits still unmeasured.

## Approved publisher and ingestion boundaries

- First API ingestion is blocked pending provider retention/refresh clarification;
  the provisional official-API design is not compliance approval.
- Ingestion remains local/manual, with full uploads pagination, committed/pending
  reconciliation and sanitized console/machine/PR reports. No scheduled CI run,
  API secret in CI or direct-main ingestion.
- Valid incomplete drafts and complete items with publication-hold reasons are
  excluded; malformed sources/references fail validation. Blank separators are
  layout without lyric UUIDs.
- Publish five initial Latin profiles (Hunterian deferred), nine non-Latin
  renderings, raw Source Latin/status and snapshot-pinned policy. Exact reviewed
  mappings/aliases remain pending; no actual generated source-PR previews.
- Maintain first-publication/output-changed-at ledger and no-op identity/dates.
  Individual gzip objects plus common ZIP STORE reading bundles up to100/32MiB;
  images are separately fetched online. Oversized objects may transfer directly
  under their own limits.
- Deploy one complete validated public Pages artifact, not source roots or a
  promised descriptor-last/global-CDN-atomic update.

## Bootstrap validation

Run `python tools/check_repository.py` and `git diff --check` from this root.
CI also parses YAML syntax. These are repository-hygiene checks, not publisher
tests, source-schema validation or a security audit. Add npm updates and real
publisher checks only when actual manifests and implementation exist.

Project-authored software follows the existing DaasaVaani [Apache 2.0 license](LICENSE).
It does not relicense third-party lyrics, descriptions, images, recordings or
trademarks; preserve applicable rights, attribution and notices.
See [SECURITY.md](SECURITY.md) for private vulnerability reporting.


## Snapshot: docs/content-rights.md

# Content rights and attribution

The repository's [Apache 2.0 license](LICENSE) applies to project-authored
software. It does not establish ownership of third-party lyrics, video
descriptions, images, recordings, or trademarks.

## Policy

The project owner decided that **no rights and attribution gate is required**
([`rights-attribution-gate`](https://github.com/DaasaVaani/DaasaVaani.github.io/blob/main/docs/design-decisions.md)). There is no per-item rights
status, no publication prerequisite for rights review and no public
attribution-notice contract. This replaces earlier text that required a lawful
basis, recorded permissions and a publish hold for unclear rights.

Remaining guidance that still applies:

- Respect YouTube API and embedding terms. The product scope does not include
  downloading video media. The provider-terms check for retaining stored YouTube
  metadata is still pending before the first ingestion.
- The user explicitly retained a provisional API design and blocked first
  ingestion pending clarification of retention/refresh applicability to committed
  descriptions, derived text, images and frozen offline snapshots. No compliant
  exemption or provider approval is claimed.
- Raw YouTube descriptions and internal evidence are excluded from public
  artifacts; do not store private correspondence in public repository files.
- Supplied Source Latin is published with its suitability flags even when
  unsuitable for reading; that exception does not authorize publishing private
  material.
- Do not infer legal permission from this policy; the absence of a gate is a
  project decision, not a legal conclusion.

Source/provenance metadata belongs in reviewed Library content. `library/` is
absent and `settings/` is empty in Website. Legacy-looking Markdown in a separate
sibling path is an unreviewed reference; items are re-ingested from YouTube and
unresolved items stay drafts. Content, ingestion and publisher changes belong in
Library source PRs; Shared contract/catalog changes use Shared PRs, with consumer
pin updates made separately. The separate Library publication is planned at
[daasavaani.github.io/library/](https://daasavaani.github.io/library/), distinct
from the Website root.

## Corrections and concerns

For attribution, ownership or correction concerns, open a repository issue with
the affected item/video ID, source, requested correction/removal, and information
you are permitted to share. Do not attach confidential evidence publicly. No
dedicated private contact address is currently published.

Maintainers may correct or remove affected items through source, generated
artifacts, and future offline snapshots. Previously downloaded copies cannot be
remotely guaranteed removed.
