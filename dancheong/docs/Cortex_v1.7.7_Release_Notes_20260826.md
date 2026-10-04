# Cortex 1.7.7 Release Notes

Date: 2026-08-26  
Target: independent Cortex HTML

## Legacy package ZIP compatibility

- Added device-local import for Legacy ScenarioPack and InstantStoryPack ZIP files.
- Embedded the ZIP runtime directly in the standalone HTML, so no CDN or auxiliary parser file is required.
- Supports `manifest.json`, `project.json`, split character/world/event/opening/style documents, nested envelopes, and packages stored under a top-level folder.
- Converts up to 24 package events into Cortex's absolute day/time event chain, including beats, completion requirements, participants, locations, and source contracts.
- Imported stories appear in the existing story selector and retain independent turns and canon state.
- Imported package records and image bytes are stored in IndexedDB on the current device; ordinary Cortex localStorage and exported logs keep only safe references.

## First-appearance package images

- Reads declared character images from character records, `assets/manifest.json`, `media/manifest.json`, `characters/media.json`, and `characters/character_image_manifest.json`.
- Falls back to image-folder discovery for PNG, JPEG, WebP, GIF, and AVIF assets.
- Selects the package primary/canonical/default image first.
- Displays an image exactly once, immediately after the first committed prose or dialogue block that publicly establishes the character.
- Honors `imageOnFirstAppearance: false`; hidden or GM-only characters default to no automatic image unless explicitly enabled.
- Image data URLs never enter exported validation logs or ordinary turn snapshots.

## Disclosure and package safety

- GM-only and hidden future events are normalized without their canonical title, summary, participants, requirements, or anchors entering writer state.
- Hidden character names and `hiddenInfo` are excluded from public Cortex character state; a public alias is used when supplied.
- Package images are read only from the selected ZIP. External image URLs are not fetched.
- Rejects path traversal, ZIPs over 80MB compressed, more than 2,000 entries, more than 180MB extracted data, and individual images over 20MB.

## Verification

- Parsed the real `기성학원_첫_번째_공명_ScenarioPack.zip` fixture.
- Parsed the real Instant Story Runtime v1.5 fixture and generated a bounded opening event where no fixed event list exists.
- Verified a package-contained PNG is bound to the correct character, emitted once at the correct block, and restored by asset reference.
- Verified hidden future-event text and character `hiddenInfo` do not enter normalized writer state.
- Full project suite passed: 515 unit tests, 57 rendered Cortex checks, and the existing deterministic 20-turn replay.
- No 100/200-run simulation was performed.

## Compatibility

- Existing Cortex 1.7.6 state migrates into the 1.7.7 store.
- Relay and Chronos built-in stories are unchanged.
- Device-local API-key storage is unchanged.
- Dancheong's legacy writing engine is unchanged.

