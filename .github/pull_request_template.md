## Summary

Explain the change, why it is needed and related issues or approved decisions.

## Source review and rights

For content changes, identify video/source, canonical Kannada and supplied Source
Latin/status, reviewer/script, permission and attribution, draft status,
corrections and associated assets/settings. Keep private evidence out of this PR.

- [ ] This source PR contains no generated lyric variants/previews or companion source files.
- [ ] Actual variants will be generated only after merge; PR fixture/tool checks do not generate real content.
- [ ] Reviewed source corrections are preserved; generated-text fixes use global rules/profiles, not item/line overrides or changes to correct Kannada.

Explain why individual content checks are not applicable for tooling-only changes.

## Publisher and Shared compatibility

Describe source/publisher/registry impacts. For a `shared/` pin change, identify
old/new SHAs, contract/fixture compatibility and migration evidence. Do not
require independent consumers to update in lockstep. Do not select output
retention, schemas or UI catalog generator ownership without design approval.

## Validation

List each exact command and actual result, including
`python tools/check_repository.py` and `git diff --check`.
State what was not run and why. Describe source review and fixture/tool tests
only if actually performed; bootstrap hygiene is not publisher testing, source
validation or a security audit.

## Contributor checklist

- [ ] I kept this focused and cited approval for significant design choices.
- [ ] I updated directly related documentation and tests, or explained why not.
- [ ] I checked for secrets/private data and have rights to contributed material.
- [ ] I described material AI assistance, human review and remaining risks below.

## AI assistance and remaining gaps

Describe review, uncertainty and follow-up work, or explain why not applicable.
