# Multiplayer public live presentation

## Authority and privacy

- Only the active claimant generates prose. The added flow makes no model calls.
- The host samples the current beat's **painted** narration, dialogue labels/quotes,
  user input and visible primary portraits. It does not read the writer buffer,
  prompts, private profiles, audit output or unpublished annotations.
- JSON allows only bounded semantic blocks. No remote HTML, script, URLs, image
  bytes, credentials or full-state export are accepted for presentation.
- Server authentication and room membership are required. The write itself is
  fenced by claimant account, token, lease expiry and room revision. Older sequence
  numbers cannot replace newer ones. Readers never receive the claim token.

## Transport and load

- Capture changed presentation every 800 ms while generating. One upload in flight
  and one replaceable latest pending frame; no per-character backlog.
- Current beat only, <=96 KiB and 512 blocks; server limits replacement frequency
  to <=2 writes/second. One bounded replaceable D1 row per room, not a history.
- Existing combined room/chat polling is retained. While a remote author is
  generating, an additional coalesced check shortens the interval to roughly one
  second. Unchanged presentation returns only a small marker.
- No per-update R2 snapshot, image upload, media import, canonical restore or model
  invocation. Primary portraits reuse the recipient's package image cache.
- Polling/capture/network introduce some delay; this is near-real-time batched
  streaming, not exact simultaneous per-glyph delivery. Initial generation
  discovery can take the normal 2.5-second room polling interval.

## Reader and recovery

- The live article is outside the engine's `turns` and normal `.turn` selector.
  HUD, recommendations, memory, undo and costs remain at the last durable revision.
- Unchanged public blocks and decoded image nodes are reused. The existing
  reading-position transaction preserves manual scroll and bottom-follow.
- Canonical incremental application persists first, then removes the ephemeral
  article and paints the committed beat in the same scroll transaction.
- Reconnect retrieves the latest complete current-beat presentation after restoring
  its canonical base. Id + sequence handles new generations independently.
- Abort/expiry/room revision invalidation hides temporary presentation. Abort and
  successful commit remove its row; a stale expired row is unreadable and bounded,
  and is replaced when that room next generates. Existing canonical failure and
  save-retry rules are unchanged.
- Live transport failure does not abort writing or block the final save. The
  author sees a retry status and the latest frame is retried with bounded cadence.

## Validation scope

- Actual SQLite: ownership, membership, lease/revision fencing, sequence ordering,
  duplicate/rate bounds, abort cleanup, restart read, no canonical turn advance.
- React client: public receive/cursors, unchanged frames, wrong-token rejection,
  one in-flight publication, pending-frame coalescing and stop after commit.
- JSDOM public view: painted-only extraction, hidden/private exclusion, safe text
  rendering, unchanged paragraph/image identity, stale-frame rejection.
- Compiled Cortex + host, 100-beat fixture: ephemeral view never enters durable
  turns; final incremental save removes it and retains old DOM/images and full
  restored-state parity.
- Physical iPhone/Android multi-device networking and real paid-model latency are
  not exercised by these automated fixtures.
