# Reader precision — 1.13.1

## Contract

- The prose writer supplies the speaker at authoring time. Registered speakers use public character IDs; unregistered extras use literal public labels. Labels need not be repeated in narration. Transport markers are stripped before publication, while quote text, context and identity remain in dialogueAnnotations.
- Binding version 2 anchors metadata to the exact quote and preceding context, not a nearby character name. It supports partial streaming quotes and survives whitespace/prefix normalization. Repeated ambiguous quotes, invalid IDs, private identities and unbound historical quotes do not gain guessed cards.
- Instant V2 supplies the same information in a strict dialogue sidecar; the server validates quote membership and public IDs before commitment. This does not introduce another model call.
- Existing non-spoken-quotation safeguards and public-identity gates remain. Narrative meaning is still authored by the model: this release does not claim measured 100% semantic attribution or automatically rewrite historical prose.

## Reader behavior

- Wheel, touch movement, scrollbar/drag movement and reader navigation keys stop follow immediately. Neither rendering nor engine scroll requests nor returning near the bottom can re-enable it. The latest-text button explicitly resumes follow.
- A turn ID, source-text offset and viewport-relative line position anchor the view during commitment, prose rebuilding, portrait arrival and image loading. Browser scroll anchoring is disabled for this scroller to avoid competing adjustments.
- Commitment retains existing prose/image nodes when possible. No session schema, database migration or stored narrative rewrite is required.

## Validation scope

- Synthetic regression cases cover writer IDs, extras not named in narration, repeated quotes, shifted offsets, nested/partial quotations, non-spoken text, manual follow cancellation, commitment and delayed image layout.
- Instant integration covers streamed response validation, invalid binding rejection and metadata survival across a durable restart.
- An isolated real-browser fixture measured the same visible paragraph at the same vertical position after manual scrolling, appended streaming text, commitment and a 360px image appearing above it. Desktop and 390px responsive renderings were inspected.
- No live paid model call or physical iPhone/Safari test was performed. The attached private backup was inspected locally only and is excluded from source and deployment artifacts.
- Validation passed: 571 unit tests, 63 rendered/runtime parity tests, 37 host tests (one optional private fixture skipped in that run), the private fixture plus decoder tests separately, and a 20-turn replay. The pre-existing repository-wide TypeScript backlog remains; this release does not claim a clean global type check.
