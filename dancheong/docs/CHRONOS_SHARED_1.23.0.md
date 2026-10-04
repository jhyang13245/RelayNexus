# Shared authoring and HUD update

Nexus 1.23.0 · Jieum 1.3.0 · Cortex 1.42.0 · extension 1.3.0.

## Preservation

Existing Package 1.5 loops, flags, chapters, routes, compound predicates and multiple terminal endings no longer auto-activate the incompatible simplified canon compiler. Their original story/direction editors and additional loop/branch tools remain available. New projects retain the modern canon editor. Retired event schedules are not revived.

## Additive HUD contract

Projects without canonDesign may opt into canonHud:

```ts
{
  revision: 1,
  stats: [{ id, label, characterId, mode: 'event' | 'resource',
    initial, minimum, maximum, unit, visible, revealWhenChanged,
    increaseWhen, decreaseWhen }],
  effects: [{ id, eventId, criterion, statId, amount }],
  timeline?: { startDate: 'YYYY-MM-DD', cycleStatId: string }
}
```

The official exporter writes runtime/jieum_canon.json with mode=hud_only, routes=[], stats, hudEffects and optional timeline. It does not recompile original flags, events, route links, loops or endings. Stat IDs cannot collide with original branch flags. Packages declare minimum Nexus 1.23.0 / extension 1.3.0.

Event effects are checked in the existing final verdict, not a new request or writer duty. Only CURRENT_ACTUAL plus a literal quote from the current approved beat can update the independent hudEventValues/hudEffectLedger. Each effect is applied once per authored event condition. Negative original flags remain independent. Resource deltas retain the existing atomic transfer behavior.

The optional calendar accepts explicit current dates, not chapter numbers. A RESET requires a same-commit +1 effect on cycleStatId. A reset without a reliable date clears the previous calendar rather than retaining a misleading old day. A later RESET_DATE verdict may identify that reset's arrival date only while its reset ledger is still awaiting a start date; this never increments the cycle again. An ordinary later CURRENT date alone cannot establish the reset's first day. Unknown dates/days display 확인 전. No model-provided time is invented. HUD disclosure never grants character knowledge. Semantic identification still depends on the verdict model; tests do not promise perfect model judgments.

First-change disclosure latches after a committed change. The HUD remains within the reader's status tab; cloud, multiplayer and APK persist it as part of the existing scenario. Rewind restores the previous complete scenario. Existing saves without an actual reset ledger are not assigned a cycle based on the chapter or a device observation number.

## Verification

- Actual Chronos v1/v2: official import → normalization → UI activation → export → engine load preserves 75 events, four original image byte sequences, loop policy and two endings.
- With additive HUD enabled: all 32 score/plan combinations, negative scores, unknown fallback, serialized restore and both exclusive endpoints pass.
- Synthetic real host: one verdict applies a reset, persists/restores it and rewinds; no extra model call. Additional tests cover repeated commits, off-POV/recollection/observation verdicts, missing evidence, invalid dates and contract references.
- Browser: imported v2, edited stats/effects/date, autosaved, zero-error export screen; mobile 390px and desktop rendering inspected. Browser automation needed native date-key events. A transient development HMR/SSR hook error did not recur in the production Workers preview; the saved 75-event/four-image draft restored successfully there.
- Neoreum fixes raw-byte extraction storage independently. Workers R2 requires a known-length stream; FixedLengthStream preserves bounded streaming plus SHA/length verification. APK Node storage keeps its supported ordinary stream path. Duplicate ZIP entries are rejected; verified cache has a new versioned namespace.

No paid 40-beat model playthrough, pacing measurement or physical Android installation is implied by these checks. Basic event beat limits, story prose and published Chronos v2 are not changed by this shared release.
