# Dancheong 1.20.0 — Cortex shared rooms

## User flow

- Lobby separates **방 찾기·참가** and **방 만들기** into accessible tabs. Switching preserves form inputs. Mobile uses the full available width.
- Creating a Cortex room copies an owned cloud session into an independent shared snapshot. The source single-player save remains unchanged.
- Existing Lotus rules remain: 2–4 participants control one protagonist in seat order; all participants must be ready with their own API key; the current participant pays for their turn. Deadline continuation executes in the current participant's open reader. It does not run unattended on the server.
- Invalid-key recovery retains the 90-second grace period and host retry/skip/host-funded continuation. A single remaining participant continues in SOLO mode.
- A rectangular **대화** control above recommendations opens participant-only chat. Chat is separate from prose and model input, supports unread counts, and does not render user HTML.
- Participants see the committed shared beat after saving. The active writer streams locally; spectator live-token mirroring is not part of this release.

## Integrity and storage

- `multiplayer_cortex_state` stores one authoritative revision/pointer and a renewable generation claim. Room-control mutations serialize against generation. A commit advances the shared snapshot, room turn, event, and cost ledger atomically.
- Repeated commit tokens and chat client IDs are idempotent. A dropped commit response must not advance the story twice.
- Unsaved completed output stays available for retry while the page is open. Closing an active writer warns the user; a forcibly terminated browser cannot guarantee delivery of a yet-uncommitted beat. Expired claims allow recovery from the last server commit.
- API keys remain in the device vault and generation client, not room records. Shared snapshot export strips the key. Remote users must have current membership for snapshots/chat. Left or removed users lose access.
- Shared readers do not expose single-player reset, rewind, image generation, or dialogue-repair controls. These mutations require a separately coordinated multiplayer workflow.
- Prior R2 snapshot objects are retained for in-flight readers. A future retention policy must account for active readers before pruning.

## Image restoration

Generated scene images attach using each mounted article's absolute `data-turn-index`, not its offset inside the five-beat visible window. Loading earlier history decorates the newly mounted beats as well.

## Verification

- Real SQLite tests exercise room creation, turn claims, atomic commit/idempotency, source-save isolation, costs and chat authorization.
- Headless Cortex tests exercise the actual host adapter, blocked spectator controls, generation/export, and historical image placement.
- Local browser QA uses isolated mocked HTTP transports with the real UI/reader: 390/768/1280px lobby views, preserved tab inputs, keyboard tabs, two-client chat/unread, shared restore, turn lock, and dialog bounds.
- Browser screenshots were visually inspected. These checks do not assert physical iPhone/Android keyboard behavior or live paid-model quality.
- Repository-wide TypeScript checking has existing untyped database/build-fixture errors; a clean full typecheck is not claimed.
