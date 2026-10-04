# Instant Story context compatibility — Nexus 1.14.5

## Evidence and ownership

The supplied local backup contained eight rejected turns, all failing local context construction with `INSTANT_PACKAGE_REJECTED:CONTEXT_BUDGET_EXCEEDED`, before a model request. The package correctly selected the exclusive Instant V2 runtime; this was not an unsupported-mode failure.

Cortex owns the immediate defect: identical opening prose was included twice, and public character rendering metadata was sent to the prose writer. Jieum owns preventative export sizing and guidance. Both fixes are included in this release; no separate Studio deployment is required for the integrated `/jieum` authoring surface.

The first input previously required 10,971 characters against its authored 10,000-character cap. It now requires 9,878. All eight original inputs pass the original cap. The backup, package source, authored rules, and cap are unchanged. Existing backups do not need re-export for this fix.

## Changes

- Clone context fields before omitting duplicate opening text, UI recommended replies, and visual asset metadata.
- After a committed turn, avoid replaying the opening prologue; retain authored setting and rules.
- Under budget pressure, discard optional example scenes before actual memories and recent turns. Never truncate serialized JSON or the current input.
- On genuine overflow, preserve input/state and report required versus allowed characters. Do not tell users that retrying identical input alone will fix it.
- Jieum runs the shipped context builder over each start profile, empty input, recommended inputs and example inputs. Include the advisory report in the exported ZIP. Block browser download if baseline context cannot fit; warn when input headroom is small.
- The preflight is conservative and advisory: actual disclosure, later history and user input can change size. A passing export is not a guarantee that every future input fits.

## Validation boundaries

Regression tests cover context/source preservation, preflight sizing, no provider request on overflow, Jieum demo ZIP import and mocked committed playback, backup resumption, save/restart and rewind. No real paid model generation is required or claimed by these checks. Private backup data is not committed or included in the public release.
