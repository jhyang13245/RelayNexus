# Prose memory policy — Nexus 1.16.4

## Instant

- A bit means one committed non-empty prose turn. Rejected drafts and the package opening do not consume this count.
- Always pass the most recent ten bits as raw input/prose. Complete consecutive tens (1–10, 11–20, etc.) produce a prose summary of at most 1,200 Unicode code points.
- Twenty such summaries form an independent 200-bit archive: target 5,000 characters, recommended 4,500–5,500, hard upper bound 5,500. Later groups produce additional archives, never recompress previous archives together.
- A summary/archive replaces raw context only after its entire range is older than the recent-ten window. Partial ranges and failed/missing summaries retain raw prose. Stored originals and child summaries remain available for rewind and recovery.
- Source fingerprints reject changed, rewound, or stale asynchronous results. Context selection also revalidates saved records. Background jobs wait for a running turn to settle before changing memory, check the session epoch, and persist through the existing canonical bridge. Failure does not abort a story turn or loop retries; a later turn can retry the missing job.
- The authored dynamic-setting character budget remains enforced for settings/input. Engine-managed raw history and summaries have a separate fixed policy and are not silently dropped to satisfy the old `recentTurns`/`semanticMemories` package fields. Actual provider context limits still apply; missing summaries can increase request size. Original package configuration is not rewritten.
- The prior selected quote cache remains in old saves for compatibility, but the writer's memory context now comes from the source-validated prose summaries and raw turns.

## Canon

- Keep the existing latest-three-events raw window and at-most-1,000-character summaries for each three closed events.
- Remove the archive-job scheduling branch. Keep accumulating these summaries, including at 250 events; no new event cap or progression rule is introduced.
- Prefer individual three-event summaries over old combined archives. Existing archive records remain read-only compatibility fallbacks until the smaller summaries can cover their sources; no saved originals are erased.

## Validation and scope

Pure policy tests cover 9/10/25/199/200/410 bits, twenty-summary thresholds, multiple independent archives, Unicode length limits, source changes and rewind, plus 250-event canon accumulation. Headless full-app tests exercise ten actual mocked Instant turns, background summary creation, durable restart, writer-context use and rewind. Model requests are mocked; real model summary fidelity or paid long-game generation is not claimed.

The previously discussed Instant paragraph-publication redesign, protected-term-only audit, and HUD-manager/writer fallback are **not** implemented by this memory-only release.
