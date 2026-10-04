# Runtime usage audit — Nexus 1.16.0 / Cortex 1.42.0

## Current default execution

- `parts/10.part` starts the paragraph pipeline with `deferSemanticExtraction:true`.
- `requestUnifiedAdjudicationV1360` (`parts/09.part`) sends cumulative public prose to `CortexProseMemory.judgeTransport` and receives event requirement verdicts, not Turn Delta.
- The commit path preserves visible prose, takes time/location from the author's narrative track, creates an empty graph compatibility shape and marks its audit `RETIRED`. Event progress uses requirement verdicts.
- Names such as `advanceEventFromCommitGraphV190` remain historical names: this function also handles actual event transitions and cannot be deleted by a text search.

## Removed

- `CortexQuality.quarantineHandles`: an uncalled Turn Delta transport helper. Repository-wide references were only its declaration/export and the immutable 1.41.6 fixture; no application or test invokes it. Historical fixtures are intentionally unchanged.
- Dead window-scroll bookkeeping in the previously unmounted Neoreum catalog. The actual scroller is `.neoreum-site`, not `window`; the restored owner catalog retains only search/filter view preferences.
- Stale engine-introduction claims that Turn Delta and Commit Graph author current prose.

## Retained deliberately

- `CortexCommitGraph` shared helpers: public identity matching, private-entity guards, reveal ledgers, image capsule compatibility, graph shape/normalization and saved-record recovery still have consumers.
- `CortexQuality.migrate`, `recoverReferences`, and state-key recovery preserve imported old saves. Old saves and diagnostic fixtures are not rewritten or deleted.
- Compatibility extraction branches and graph normalization remain in the paragraph pipeline; this release does not remove an entire compatibility subsystem without independent integration coverage.

## Revision storage

- New Neoreum installations use `cortex-import-neoreum:<encoded slug>:r<revision>` as project ID. Format version `1.5` is not a content revision.
- Project IDs survive existing cloud-session summary round trips. Session selection, cache retrieval and deletion remain exact-project-scoped; no database migration is required.
- Revision-keyed package cache entries are immutable. Validated downloads use an explicit revision endpoint; existing packages with a different digest are rejected, never silently replaced.
- Legacy installations retain their original keys/sessions. Actual cached ZIP hashes can identify historical revisions. Missing or unmatched bytes are reported as unverified; no revision number is invented.
- A new revision starts new sessions. This intentionally does not migrate a running story across versions.
