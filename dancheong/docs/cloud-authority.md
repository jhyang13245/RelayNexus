# Cloud-authoritative Cortex sessions

The hosted single-player reader treats the authenticated cloud revision as the
official record. IndexedDB/localStorage remain a cache and an unsent recovery
buffer, not a second independently advancing authority. The standalone engine
and multiplayer writer protocol retain their existing behavior.

## Write lifecycle

1. Opening/reading a session requires no writer lease. A matching acknowledged
   cache avoids a full download; newer cloud content is restored before writing.
2. The hosted adapter requests permission before input, continuation, rewind,
   dialogue repair, generated images, backup restore or session reset. The parent
   acquires an exclusive, expiring writer epoch and rechecks the cloud revision.
3. Concurrent writers are denied. Same-device tabs receive a temporary busy
   notice, not a device-fork recommendation. Cross-device explicit takeover and
   user-requested independent copies remain available.
4. The engine runs unchanged. Intermediate exports cannot commit while the
   guarded operation is active. The final save uses revision CAS and lease-epoch
   fencing, including a second lease check in the database write transaction.
5. The lease is released after server acknowledgement. Save failure keeps the
   unsent record and prevents the next input until recovery. True legacy
   divergence requires an explicit choice; sleep/resume alone does not fork.

## Transport and compatibility

Bounded change operations reduce upload size. The server applies them only to
the exact expected revision, with path validation and full-snapshot fallback.
Unchanged embedded/generated media reuse the existing server-owned image pack.
The server still retains a complete hash-validated narrative snapshot; it is not
a per-beat database/event log. Legacy monolithic snapshots remain readable and
migrate on the next successful write. Shared multiplayer copies use the same
media reader; solo writing detaches them from subsequent room updates.

Idle readers check a small revision summary, coalescing overlapping refreshes and
pausing hidden work. Restoring newer content preserves an unsent typed draft.
Account ownership is derived from server authentication, with stale-tab account
fencing and per-account local cache namespaces unchanged.

## Limits and validation

Generation still runs in the browser. Closing/killing it before a completed
upload cannot guarantee cloud persistence; the recovery buffer is deliberately
retained. Server-executed generation is a separate phase. Restoring changed
cloud state may still download a full snapshot; this change primarily reduces
write traffic and unchanged image storage work.

Coverage includes SQLite CAS/lease races, stale epochs, same-device serialization,
image reuse, legacy restoration, malformed deltas, account isolation, simulated
offline failures, takeover/retry and actual engine execution in the headless
reader. Physical iPhone/Android-to-PC concurrent testing is not included in these
automated checks. Existing user records are not deleted or mass-migrated.
