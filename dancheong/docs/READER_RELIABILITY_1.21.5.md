# Reader reliability 1.21.5

## User-facing changes

- Multiplayer distinguishes offline/reconnecting from applying the latest story. Existing revision-based incremental restore remains the normal path; a rejected base still falls back to a full restore. Resume and completed restores wake the existing serialized poller.
- Each beat's action row opens a diagnostic export dialog. Prose is excluded by default and the choice resets on each opening. Download is a local JSON file, not an automatic report upload. A field allowlist excludes settings, prompts, raw responses, snapshots, asset URLs and account identifiers. Known credentials and credential-shaped strings are redacted even in optional prose; users should still inspect files before sharing.
- Single-player cloud receipts show acknowledged beat counts only after a server response. Pending/failing saves report unsaved beats or same-beat changes and provide retry. Successful notices still disappear after five seconds. A reserved status row keeps retry away from story text.

## Bounded performance work

- Coalesce export requests while exporting, writing, or generating; record the change sequence at export start so later mutations cannot receive a false acknowledgement.
- Remove the 1.5-second delay on an already queued follow-up save. Consume the duplicate delayed durable notification after a cloud-authorized action; later independent image/recommendation persistence still notifies normally.
- Send the newest pending live frame immediately when the prior upload completes. Preserve one upload plus one replaceable pending frame and existing retry cadence; no per-character backlog.
- Avoid redundant parent rerenders for unchanged multiplayer room polls and chat clock samples, while immediately rendering changes to revision/generation state.
- Cache legacy portrait cleanup by turn and image-array identity/length. Unchanged idle ticks skip DOM rescans and portrait refresh. Changed/restored turns are still processed.

No event rules, author prompts, audit rules, account ownership, revision compare-and-swap, turn claims, chat semantics or image-generation calls were removed. Safety checks before input and server save acknowledgement remain required; network/model latency is not eliminated.

## Verification

Added executable tests cover save acknowledgement ordering, export coalescing, failed-save retry, pending beat labels, credential redaction, optional prose reset, connection/catch-up phases, and immediate latest-frame delivery. Existing single/multiplayer storage, live delta, restore, reader, image and account tests are retained.

Visual review uses real dialog/control code with synthetic fixtures in desktop and 390px light/dark layouts. This is not physical iPhone/Android or simultaneous production-account gameplay testing. No paid model request or private play-log transmission is part of this validation.
