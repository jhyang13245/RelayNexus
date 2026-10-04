# Relay Nexus ScenarioPack extensions

Relay Nexus keeps the existing ScenarioPack fields compatible. The following
optional fields let a package generator express scene constraints and compound
events without turning them into ordinary route events.

## Scene constraint

```json
{
  "id": "CONSTRAINT_STRANGERS",
  "name": "서로 모르는 사람들",
  "kind": "constraint",
  "appliesTo": ["EVENT_FIRST_MEETING", "EVENT_FIRST_CONVERSATION"],
  "rules": [
    "첫 대면 전에는 서로의 이름을 알지 못한다.",
    "비공개 소속은 관측 가능한 공개 장면 전까지 언급하지 않는다."
  ]
}
```

Constraints may live inside `project.events`, `project.constraints`, or one of
these split-package paths:

- `events/constraints.json`
- `events/scene_constraints.json`
- `rules/scene_constraints.json`
- `constraints/scene_constraints.json`

They are cached with the project but excluded from the event cursor and can
never be completed or sealed. An empty `appliesTo` list, or `"*"`, applies the
constraint to every active event.

## Character aliases

Use one stable `id` for a character and list every public, context-dependent
label in `aliases`. The writer may keep the label visible in prose, but Nexus
normalizes state and media work to the canonical ID.

```json
{
  "id": "NPC_HONGJAE",
  "name": "홍재",
  "preRevealAlias": "소녀 검사",
  "aliases": ["검은 옷의 검사", "현관의 소녀"],
  "referenceImage": "characters/hongjae.webp"
}
```

`aliases`, `preRevealAlias`, and imported public alias fields such as
`alternateNames`, `publicAliases`, `visibleAliases`, `titles`, and `epithets`
are all treated as public-safe labels for the same character. Never put a
protected true name in these fields. Keep it in disclosure-controlled package
data so it can remain excluded from the model context until its reveal.

If a future label cannot be declared ahead of time, Nexus may bind it from an
unambiguous dialogue or visual context and retain that mapping for the session.
Ambiguous generic labels are deliberately left unresolved instead of creating
a duplicate dynamic NPC or replacing canonical artwork.

## Instant Story Runtime

Package 1.5 may advertise the optional `instant_story_runtime_v1` feature and
provide the following Studio-owned documents:

- `rules/instant_story_runtime.json`
- `runtime/context_index.json`
- `runtime/keyword_index.json`
- `runtime/media_lookup.json`
- `runtime/ending_schedule.json`

Nexus activates the fast runtime only when every document has the expected V1
format and the same 64-character `sourcePackageSha256`. A missing, malformed,
or stale derived document causes an optional feature to fall back to standard
Package 1.5 without losing the original story. If the manifest marks the
feature as required, the package is rejected instead of silently running under
different semantics.

On the Fast path, Nexus uses the package limits for recent turns, active
characters, semantic memories, keyword notes, relevant media, dynamic prompt
characters, output tokens, and reasoning effort. Combat or compound input does
not by itself force Deep execution. The final beat and other declared
`deepPathTriggers` still use Deep convergence. Package-authored start profiles
supply the built-in prologue and its three initial recommendations.

When `generation.streamingRequiredForFastPath` is enabled, Nexus uses the
package-declared `/api/simulate/stream` SSE contract. `turn_ack` is sent while
the hidden draft is being generated and checked. Raw upstream model deltas are
never public. Only the accepted final blocks are emitted as grapheme-safe,
sentence-gated `narration_commit` events, followed by one `turn_sidecar` and
one `done`. A `turn_abort` or `error` discards provisional browser prose, so a
failed validation cannot leave a partial turn in the story or session memory.

## Compound event

```json
{
  "id": "EVENT_PARALLEL_NIGHT",
  "name": "두 곳에서 진행되는 밤",
  "kind": "compound",
  "required": true,
  "sequence": 8,
  "completionSignals": "두 사람이 합류했다",
  "beats": [
    {
      "id": "BEAT_A",
      "order": 1,
      "title": "주인공 시점",
      "viewpoint": "PLAYER",
      "content": "주인공이 단서를 따라 지하 통로에 진입한다."
    },
    {
      "id": "BEAT_B",
      "order": 2,
      "title": "동료 시점",
      "viewpoint": "NPC_PARTNER",
      "content": "동료가 반대편 출구를 확보한다."
    },
    {
      "id": "BEAT_JOIN",
      "order": 3,
      "title": "합류",
      "content": "두 시점이 같은 현장에서 합류한다.",
      "requiredSignals": "두 사람이 합류했다"
    }
  ]
}
```

Only one beat is exposed to the model per turn. A model completion flag before
the last beat advances the hidden beat ledger by one and does not complete the
event. The last beat must also satisfy its `requiredSignals` when supplied.

## Generator rules

- Use `kind: "constraint"` for a rule that shapes several scene turns.
- Use `kind: "event"` for one route milestone with its own completion contract.
- Use `kind: "compound"` only when ordered viewpoint/scene beats together form
  one route milestone.
- Keep `requiredItems`, `requiredDialogue`, and `completionSignals` explicit.
  Derailment co-sealing is unavailable until the current event contract is
  visible in the generated prose and inventory.
