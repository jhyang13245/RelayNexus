# Claude HTML runtime integration map

Relay Nexus treats the user-provided Claude single-file simulator as an
authoritative runtime, not as prompt inspiration. The browser-specific UI and
direct API calls are adapted to the Site's server boundary, while the order and
ownership of the state machine are preserved.

| Claude HTML runtime | Relay Nexus implementation |
| --- | --- |
| `SYSTEM_RULES` output priority | Static prompt `Claude HTML 결정적 런타임` section |
| `buildContext()` | `buildClaudeRuntimePrompt()` + dynamic `claudeRuntime` |
| `inputMode`, `beatAdvanced`, `eventResolved` JSON | Required `claudeSignals` schema |
| `pushHistory()` before state application | HTTP turn transaction: no state is applied before a 200 response; existing undo snapshot remains available |
| `missingMust()` | `missingClaudeContract()` over accumulated event prose and inventory |
| `unmetPrereqs()` | `unmetClaudePrerequisites()` including intermediate required events |
| `syncTarget()` / `fastForward()` | `adjudicateClaudeTurn()` explicit-derailment-only co-seal pass |
| `sealEvent()` / `openEvent()` | Claude hidden authoritative ledger and monotonic next-event selection |
| compound `beatsOf()` | Current-beat-only prompt and server-owned beat index |
| `leakCheck()` and mandatory rewrite | Existing Nexus semantic/disclosure/chronology validators plus Claude signal-contract rewrite gate |
| `persist()` | Hidden Claude ledger stored with the same atomic session state as GPT runtime data |

The following GPT v64 systems run only after Claude adjudication: tolerant
package parsing, NPC autonomy, relationship memories, public/private HUD,
recommendation disclosure filtering, media triggers, and session-history
repair.
