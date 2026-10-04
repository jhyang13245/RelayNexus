# Reader folio 1.14.2

## Boundaries

- All six inspector panes share a scoped hanji surface, section rules, readable type, focus treatment and light/dark colors. Narrow drawers use a 3-by-2 tab layout. Main navigation design is unchanged.
- Portrait names and explicitly public roles/relationships sit inside the image. No technical reference caption. Original image proportions and image DOM identity are preserved.
- Only completed events receive the red closure seal. Diversions receive a blue transition seal, never a completion receipt. Other endings preserve their status.
- The cast panel shows registered characters witnessed in published prose or valid writer-bound speech, using current disclosure and package media. Unregistered extras remain supported in dialogue, but are omitted from the cast panel at the user's request.
- No appearance-similarity search is introduced. Descriptive names remain whole, rather than producing first-word aliases. Legacy `첫 물리 등장 뒤 공개` conditions are guarded. Stored first-appearance photos are checked again against current public identity and the turn's text; invalid links are removed, not their source assets or narrative text. Standalone and hosted image galleries apply the same guard.
- Unique proper-name shorthand remains for legacy names. This is not a guarantee of perfect natural-language identity or physical presence: explicit secret-identity conditions still require their existing disclosure receipts. Ambiguous identities must not borrow private profile images.
- Scroll anchors use the same glyph geometry when captured and restored. No scrollTop write occurs for unchanged geometry or subpixel measurement noise. Existing manual-scroll cancellation and late-image anchoring are retained.

## Design assistance and assets

Muse supplied one bounded non-sensitive design advisory, with no access to user backups or original source and no original edits. The main developer reviewed its output, used the folio palette/spacing direction, raised small text sizes and implemented/integrated the design directly.

Two transparent ink seals were created using the built-in image-generation tool, then copied without alpha conversion:

- `public/dancheong-seal-closed-v1142.png`
- `public/dancheong-seal-transition-v1142.png`

Prompt set: one square hand-carved Korean dojang impression per image, exact Hangul `종결` in vermilion `#ad382b` and `전환` in indigo `#29637c`; thick angular lettering and one irregular square perimeter, rough ink pressure, paper-fiber pores, flat front-facing scan, transparent negative space, no additional text, shadow or mockup. The user's stamp example guided the lettering and texture.

## Verification

- Added an integrated privacy/cast/portrait regression using synthetic public and hidden characters; stale capsule data cannot republish the collector and extras stay out of cast while retaining dialogue.
- Replayed the supplied private backup locally, without publishing it or calling paid models; public portrait restoration, withheld identities, cast synchronization and unchanged prose checked.
- Added a deterministic regression reproducing 8px drift after eight renders before the fix, then 0px and zero scrollTop writes afterwards.
- Existing reader quote ownership, scroll cancellation and late-image anchoring tests retained.
- Browser checks and deployment verification are recorded in the local release record. The Windows Sites build launcher needs the existing direct project build fallback; no dependency changes are made for this environment issue.
