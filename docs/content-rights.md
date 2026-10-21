# Content rights and attribution

The repository's [Apache 2.0 license](../LICENSE) applies to project-authored
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
