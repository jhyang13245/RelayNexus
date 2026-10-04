# Instant Story world-state recovery — Nexus 1.14.7

## Reproduced failure

The supplied post-1.14.6 backup contains one rejected first turn with `INSTANT_WORLD_INVALID`. Its package opening says 12:18, while the canonical world clock is 08:00:00 because no explicit `openingTime` field was exported. The writer response schema previously accepted any time string, but the post-response validator accepted only `HH:MM:SS`. A reasonable `12:18` response could therefore cancel the complete turn.

This is a separate failure from the context-budget defect corrected in 1.14.5.

## Changes

- When Instant packages omit `openingTime`, infer the initial clock from the selected start profile or current-situation prose. Both digital `HH:MM` and Korean `시/분` forms are accepted and normalized to `HH:MM:SS`.
- Apply the same inference to a first-turn context restored from an older backup whose untouched fallback clock is 08:00:00. The stored backup is not rewritten before a successful commit.
- The writer schema now requests either `HH:MM` or `HH:MM:SS`. A grounded minute-precision time is normalized by the server.
- If time/location metadata has no exact narration evidence, retain the previous world state instead of rejecting otherwise valid prose.
- Truly malformed grounded time/location changes still fail atomically with a specific reader notice. Input and previous state remain intact.

## Validation boundary

Tests cover the supplied backup, initial clock inference, minute-precision normalization, ungrounded metadata fallback, malformed grounded rejection, package import, commit, restart and rewind. Provider output from the rejected turn was not stored in the backup, so the exact invalid string cannot be recovered; the fix covers every path that could produce the observed `INSTANT_WORLD_INVALID` under the strict response schema. No paid model call is claimed.
