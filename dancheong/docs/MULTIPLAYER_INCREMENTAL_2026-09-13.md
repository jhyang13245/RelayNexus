# Multiplayer incremental refresh — phase 1

Normal, consecutive multiplayer revisions can transfer a bounded transport-only update instead of importing the complete shared backup. This does not introduce narrative Turn Delta or Commit Graph semantics.

## Safety boundaries

- The server continues to store a complete authoritative snapshot for every revision.
- Incremental delivery requires matching base revision, snapshot hash, and media version. Missing packets, unsupported changes, stale clients, and application failures fall back to full restoration.
- The reader persists the complete next state before acknowledging it or allowing the next input. Canonical activation, HUD, memory, undo, recovery, and personal settings retain full-import behavior.
- Unchanged turn objects and DOM/image nodes are reused. Changed older turns (including late images) are refreshed in place, and a new turn is appended once.
- Duplicate delivery is idempotent. Author commit acknowledgements advance the local wire baseline, supporting alternating players.
- No database migration, room-rule change, model change, or single-player import change.

## Validation

- Unit suite: 784 tests, 783 passed, 1 existing skip.
- Rendered HTML and Jieum regression suites: 61 passed.
- Cortex suite: 109 tests, 106 passed, 3 existing skips.
- Cortex replay: 20 turns and 10 assertions passed.
- TypeScript check and production build passed.
- A real compiled-engine/headless 100-turn case checks unchanged article/image node identity, a late image in turn 98, append 101, duplicate delivery, invalid base rejection, and storage failure without activating incoming state.
- Incremental and full-import exported states are deeply equal, excluding export time, storage diagnostics, and device-local media-generation preference.

Synthetic snapshot transport measurements (bytes; not live-device latency):

| Existing turns | Full snapshot | Incremental update |
| --- | ---: | ---: |
| 10 | 142901 | 4821 |
| 50 | 313381 | 4822 |
| 100 | 526483 | 4827 |
| 250 | 1166083 | 4828 |

## Deliberate limits

This phase reduces recipient transfer, restoration, image lookup, and DOM replacement. Full author export/upload, server snapshot persistence, canonical validation, and local complete-state persistence remain. Clients retain one extra media-free wire baseline; total memory reduction is not claimed. Actual iPhone/Android simultaneous play, maximum-size snapshots, and production paid generation were not exercised. Exceptional updates can still incur the original full-restore cost.
