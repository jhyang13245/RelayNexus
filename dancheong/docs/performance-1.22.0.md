# Reader performance verification — 1.22.0

Scope: presentation, transport and storage preparation only. No writer, adjudication,
memory, narrative filtering, event state machine or model-pacing changes. The pinned
adapted Cortex runtime remains byte-identical to the previous release, verified by
the existing build hash and engine-parity tests (`vendor/cortex/manifest.json`).

## Implementation

- Coalesce presentation mutations per animation frame and redecorate affected beats.
  Existing history windowing, scroll ownership and semantic refresh paths remain.
- Lazily build inactive inspector panels; idle polls no longer rebuild unchanged
  panels. Preserve backup controls, keyboard navigation, open details and image popup.
- Skip public-roster resolution for beats with no connected, ready portrait. The
  scope check and public-visibility check for actual portraits remain unchanged.
- Fingerprint durable records in a local Worker, caching only the exact storage
  key/revision/savedAt identity. Worker errors use the byte-identical SHA-256 fallback.
- Combine single-player lease admission and metadata receipt in one request.
  Preserve account/device/epoch/revision fencing, takeover and old-server fallback.
- Fetch only summary columns for lists/metadata. Empty deltas acknowledge without
  reading the snapshot object, but only after matching revision and active lease.
- Closed multiplayer chat piggybacks on the status response. Open/stalled chat keeps
  independent polling. Already-acknowledged live/draft frames omit their payload;
  original claim, turn, identity and cursor recovery rules remain. UI updates ignore
  only the current user's changing presence timestamp. Live capture remains bounded.

## Local measurements (2026-09-19)

Chrome on the development PC, isolated synthetic data, no model requests, no user
storage and no live-site load. Mobile means a 390px viewport, not physical iPhone.
Desktop viewport is 1440px. 1,000 beats, 4,000 API log records, 334 scene image entries.

| Measurement | Before | After |
| --- | ---: | ---: |
| Initial inspector descendants | 2,617 | 238 |
| Hidden gallery image nodes | 334 | 0 |
| Inspector update median, 390px | 89.2ms | 1.1ms |
| Inspector update median, 1440px | 92.7ms | 1.1ms |
| Unchanged idle updates in 4.6s | 3 | 0 |

After: local re-entry 722–872ms; worker hashing of the 3.38MB exported record
45.9–48.5ms, exactly matching the original hash algorithm. Initial reader DOM retains
5 beats; requesting older history expands to 15 without moving the reading anchor
(0px in both runs). These are fixture-specific measurements, not network/server
capacity guarantees. Full-size real artwork decoding and physical-device memory
pressure are not represented by the small synthetic pictures.

## Regression coverage

`tests/reader-performance.test.ts` covers worker/fallback equivalence, cache
invalidation, 1,000-beat solo/multiplayer deltas and rewind, no-op portrait lookup,
payload-free receipts, account scoping, wrong epochs/devices/revisions, expiry,
takeover and legacy clients. Existing conflict, multiplayer client, input draft,
dialogue/portrait, scroll, history, engine parity and rendered tests remain required.

`node scripts/qa-reader-performance.mjs 1000` exercises all six tabs, image popup,
local storage reload, history anchor and real browser Worker hashing. Optional local
pre-change copies in `work/` enable A/B comparison; they are not deployed. The regular
300-beat measurement and reader history/jump-overlay checks were also run.

The first parallel whole-engine test run missed a wall-clock typing threshold under
test-process contention; the unmodified pacing test passed in isolation. Final engine
validation uses serial file execution. Optional tests requiring private backups can
remain skipped and do not constitute verification of those private saves.

## Deliberate exclusions

No schema migration or new hosting binding. No WebSocket/Durable Object migration:
the site's declared hosting supports D1/R2, not a verified room socket backend.
No canonical history deletion, unsafe revision/hash shortcuts, AI call changes, or
production stress test. Hundreds of concurrent public rooms still require a separate
capacity test against an approved staging environment.
