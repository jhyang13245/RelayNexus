# Cortex 1.7.6 Release Notes

Date: 2026-08-26  
Target: independent Cortex HTML

## Absolute event clock

- Replaced clock-only beat advancement with one absolute `storyDay × 86400 + time` axis.
- Divided every event window into stable beat milestones. Chronos event 1 now closes its three beats at 11:50, 17:10, and 22:30 instead of sealing the entire day at 06:43.
- Bound leases, prose blocks, corridor limits, guards, end-state patches, and committed world time to the same milestone.
- Commit the story day on every transition, not only on reset events.

## Event handoff and disclosure

- A finished event that precedes the next event crosses the waiting gap in one ordinary-life bridge turn.
- The bridge ends exactly at the next event's start day and time while its unrevealed cast, objects, answers, and locations remain sealed.
- Waiting prose keeps the actual current location unless the narration explicitly performs a move.

## Action and prose integrity

- Recognize concrete contact and visible impact—including a palm striking a cheek—before local repair runs.
- Generate a target-specific fallback only when contact is truly absent; removed the invented generic “held object” construction and its malformed particle.
- Treat prose length and scene-density targets as advisory. A coherent completed scene is preserved instead of being padded with repeated local paragraphs.

## Regression coverage

- Added a deterministic replay of the Cortex 1.7.5 Chronos failure conditions.
- Verifies 06:30–22:30 beat timing, next-day 07:30 handoff, future-disclosure sealing, location preservation, contact deduplication, and soft length auditing.
- Keeps the existing exact 1.7.1–1.7.3 log replays and the full project test suite active; no 100/200-run simulation is required.

## Compatibility

- Existing Cortex 1.7.5 state migrates into the 1.7.6 store.
- Device-local API-key storage is unchanged and remains excluded from logs, session state, and source exports.
- Dancheong's legacy writing engine is unchanged.
