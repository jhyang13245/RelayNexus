# Scene identity references and multiplayer feedback

## Reference path

- Rebuild the generation capsule on manual generation, rather than trusting old cached casts.
- Resolve unique public names/aliases in the final narrative excerpt and validate writer quote offsets, quote text, binding version, and name/optional-ID agreement. Appearance words and stale presence/Commit Graph IDs alone do not select characters.
- Preserve disclosure policy: withheld identities are excluded; pre-reveal aliases use only specifically permitted assets and public names.
- Select source.images isPrimary (then representative label/first declared asset). Never take an arbitrary alternative ahead of a declared primary. Missing declared originals stop before provider invocation.
- Send one photo per matched character, ordered name-to-image instructions, and preserve identity while changing composition/action. Maximum 16 references; do not silently truncate. Existing 8 MB per-image / 24 MB total limits remain.
- Preserve Flare and its native fidelity behavior; no unsupported input_fidelity override. Existing generated images are not regenerated or replaced.

## Verification

- Tests cover unique aliases, ambiguous names, invalid writer bindings, quoted mentions, pre-reveal-only media, primary-vs-alternate selection, missing primary, and three-character provider payload order.
- Muse authored the three mechanical route-limit tests in an isolated non-sensitive copy; main reviewed and tightened byte assertions. 3, 16 and 17-reference boundary tests pass with mocked provider.
- User's Fate/Seoul 13-beat backup was restored in isolated local storage: the provider-bound request now includes exact Han Siwoo and Nadia primary bytes with named indices. Prose unchanged; real provider mocked; saved user image untouched.
- Desktop and mobile-emulated browser checks cover populated public rooms, compact recent rooms, no horizontal overflow at 390/768/1280px, hover, touch hold/cancel, reduced motion, tabs preserving input, and two-client reader/chat behavior.
- New paid image output was not generated during these checks. This verifies request construction, not perfect visual identity reproduction by the provider. Appearance can still vary, especially for unregistered characters without an authored reference.

## UI

Design GPT reviewed the existing Dancheong style and proposed compact 1:2 sidebar/public layout. Main implemented and visually inspected it. Mobile uses a separate one-column layout, compact shared back/status row, code entry and button on one row, and initially collapsed recent rooms. The public list's first join action is visible in the 390px/900px viewport. Recent rooms remain expandable. Pointer feedback explicitly clears on release/cancel/scroll/blur so touch browsers that omit :active still show a pressed state without trapping scrolling or clicks.
