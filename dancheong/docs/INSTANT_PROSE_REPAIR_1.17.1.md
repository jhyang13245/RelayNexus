# Instant prose repair — Nexus 1.17.1

## Changes

- Intermediate paragraph reviews are explicitly non-final windows. Missing choices, dialogue continuation, turn structure, length and dramatic pacing cannot trigger edits. The reviewer no longer receives package core-prompt instructions. A factual repair needs exact current and opposing public quotations; unsupported proposals are logged and ignored.
- Opening, paragraph and editor output remove bare non-diegetic action-menu blocks before release. In-world lists/quoted lists remain. Choice-only windows are skipped without stalling the prose queue. Recommendations still use the existing hidden channel. Custom pipeline edits now increment repair metrics.
- Free writer context excludes demonstration scenes and progressed opening goals/situations. Package originals remain intact. Current input, latest ten bits, setting rules and memory remain available. Clear historical choice-menu blocks are removed only from writer-context copies, never from saved prose or backup files.
- The configured user style guide reaches the writer and editor. Writer instructions prioritize meaningful progress on the selected action, allow ordinary movement/preparation to flow together and prevent unresolved props from becoming compulsory repeated checkpoints. This does not introduce an event FSM or author decisions for the player.
- HUD world fields can be individually null (retain previous value). Location-only changes no longer require invented time. Normalized public evidence can come from current prose or the immediately previous bit to recover stale location. Invalid values reject atomically; HUD → writer fallback → previous values remains unchanged.

## Validation and limitations

Regression fixtures cover rejected missing-choice advice, editor-injected untitled choices, choice-only windows, in-world lists, immutable history/package copies, style forwarding, location-only updates, stale-location recovery, invalid clock/evidence atomicity and existing tail regeneration/fallback behavior. The supplied private three-bit backup was read locally: twelve choice lines are excluded from subsequent context, originals remain byte-identical. Private content is not included in source or deployment.

Browser QA exercises the active reader at 390 px and 1440 px with deterministic Responses fixtures, injected editor choices and a location-only HUD. Existing unit, rendered-page and host suites protect canonical execution and integration. These tests do not certify live model narrative quality: wording, interpretation and pacing still depend on the selected model. Existing saved prose is intentionally not retroactively rewritten; reload the reader for the new pipeline on subsequent input.
