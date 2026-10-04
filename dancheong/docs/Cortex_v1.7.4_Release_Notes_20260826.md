# Cortex 1.7.4 Release Notes

Release date: 2026-08-26  
Target: independent Cortex HTML only  
Engine: Cortex 1.7.4 / Continuity Capsule V3

## Purpose

This revision fixes the causal failure chain reproduced by `dancheong-cortex-v1.7.3-log-1787675455731.json`. The writer had correctly torn up and discarded the note, but the server failed to recognize the Korean completion expression and discarded the whole turn. The preceding turn also stored 11:50 even though both the user request and prose reached 19:00.

## Changes

### Semantic action graph

- Recognizes Korean destruction modifiers and completions including `갈기갈기 찢어`, `잘게 찢어 흩뿌렸다`, fragments, powder, and completed effects.
- Removes subject and route phrases from the destruction target so `은서는 … 올라가서 쪽지를` resolves to the item `쪽지`.
- Preserves the same target identity across acquisition, destruction, inventory removal, and the destroyed ledger.
- Adds pronoun-aware possession extraction for sequences such as `작은 쪽지였다. 그는 그것을 가방 안쪽에 넣었다.`

### Canon absorption

- Destruction of an active clue automatically selects consequence-preserving absorption.
- The requested destruction is completed first and is never silently cancelled or restored.
- Canon continues only through remnants, witnesses, already observed information, and downstream consequences.

### Absolute time contract

- An explicit `until` request can cross a beat deadline without being clamped to that deadline.
- Prose time, server world time, transaction guard, and Capsule V3 world time close on the same absolute time.
- Common scene-duration actions such as a nap receive a realistic minimum duration instead of advancing only a few seconds.
- Capsule V3 rejects prose whose explicit clock is ahead of the committed world clock.

### Beat and cast correctness

- Compound beat goals are evaluated clause by clause. Completing only one phrase no longer completes the whole beat.
- `등교` requires a grounded school arrival rather than merely leaving a house.
- Private locations use scene-local cast membership. Event-wide characters cannot speak inside a home or bedroom without arrival evidence.
- Household characters remain available in domestic scenes.

### Continuity Capsule V3

- Keeps the immediate scene and the short critical tail as different bounded fields instead of duplicating the full prose.
- Removes malformed leading closing quotes from atmosphere, style, cooldown, and motif atoms.
- Verifies physical cast equality, world time, prose clock, capsule freshness, and inventory/destruction consistency before storage.
- Remains deterministic and performs no additional API request.

### Physical-state guard

- A device explicitly powered off cannot vibrate, display an alert, illuminate its screen, or communicate until a powered-on action is shown.
- The writer receives this rule before generation and the final quality gate checks it again.

## Regression coverage

- Exact Cortex 1.7.3 two-turn Chronos log replay.
- Exact Cortex 1.7.2 ten-turn Chronos replay.
- Existing Cortex twenty-turn replay.
- Device-local API key storage and no mock/local generation.
- Future identity sealing and ten-day Chronos event schedule.
- Inventory, destruction, movement, beat, time, and Capsule V3 validation.

No 100-run or 200-run simulation was performed.
