# Cloud resume and conflict handling

## Changed behavior

- Lease expiration and narrative divergence are separate. An expired renewal reports `CORTEX_LEASE_EXPIRED`; a rejected save never automatically creates a recovery session.
- Visibility return, BFCache return, reconnect, and expired heartbeats share a coalesced lease check. Exports wait for it. Recovered ownership reconciles cloud state before unlocking input.
- The reader fingerprints its actual durable record, excluding save timestamps, storage counters, recovery-location metadata and device presentation/API preferences. The parent stores only this acknowledged identity and revision as device sync metadata. No narrative is stored in that metadata.
- A clean device follows a newer cloud revision. Identical exported content can acknowledge a lost response. Different or unproven local state requires a choice; turn counts and wall clocks never establish ancestry.
- The user may preserve and continue the local branch, or preserve it first and then follow the original cloud session. Preservation uses the existing owner-scoped, create-only, idempotent endpoint. Existing branches are not merged or deleted.
- Restore/export generation tags discard late exports from before a cloud restore. Changes arriving during reconciliation prevent an older comparison from overwriting them.
- Device identity is stable for the page lifetime even if browser storage temporarily fails.

## Preserved safety

Account checks, atomic expected revision checks, device/epoch fencing, full backups, media persistence, and local IndexedDB conflict isolation remain. No schema migration or production save-data rewrite is needed. Multiplayer turn semantics and incremental updates are unchanged.

## Checks

Added deterministic SQL, compiled-client, React/JSDOM and real-engine coverage for expiry, simultaneous renew/export, same content with different save times, desktop continuation on re-entry, lost acknowledgements, actual divergent progress, choice-only preservation, late old exports, and changes during reconciliation. Content identity is checked against real persisted engine state, including a HUD mutation.

Existing UI, multiplayer, storage, and engine regression suites are also exercised. Actual iPhone/Android sleep and cross-device network behavior are not physically tested. Older saves without acknowledged content identities conservatively retain the prior provenance check and may request a one-time choice instead of guessing. Failed identity computation falls back safely; it does not authorize overwriting unknown local changes.
