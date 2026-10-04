# Dancheong

Current release: **v1.25.11** (source version; deployment status is tracked by Sites)

1.25.11 anchors VN cues to displayed phrases and voice completion, adds evidence-bound reusable pose art, stable scene framing, lighting, foley and voice delivery context. Existing optional generation preferences, artwork, keys and saves remain compatible. Real API checks used about $0.01905 under the user's $2 cap. See `docs/VN_PERFORMANCE_1.25.11.md` for verification and limitations.

1.25.9 shares the prose writer’s exact dialogue identity with VN portraits, keeping public aliases separate from registered names. Anonymous speakers no longer wait for a second identity inference. Existing artwork and saves remain compatible. See `docs/vn-writer-speakers-1.25.9.md`.

1.25.8 calibrates portrait cameras from a stable cheek region so exposed skin between bangs, cropped bodies and detector timing do not exaggerate relative stature. Authored heights, the shared virtual floor and existing paid artwork are preserved; only local framing metadata is recalculated. The rule is shared by all works and both raster paths. See `docs/vn-camera-1.25.8.md`.

1.25.7 upgrades all active GPT 5.6 Luna text roles to GPT 6 Luna on OpenAI and OpenCode Go, including pinned judges, memory, recovery, VN cast direction and studio drafts. Old request/settings model IDs upgrade without changing encrypted device keys, provider selection, game saves or historical costs. See `docs/v1.25.7-luna6-all-roles.md`.

1.25.6 adds a shared multiplayer VN reading clock, finalized-only synchronized taps, stable paragraph anchors across turn handoff, and bounded renderer caches. See `docs/v1.25.6-vn-shared-reading.md`.

1.25.5 also recovers legacy image/voice reservations that the same account gate rejected before a provider call. New uncertain paid jobs remain fenced.

1.25.4 repairs multiplayer VN account fences and shared key lookup, preserves media payer ownership, enables automatic reading with current-player-only inputs, and separates the turn notice from image status. See `docs/v1.25.4-vn-multiplayer.md`.

1.25.3 resolves reviewed event-scoped portrait aliases under the main site's hashed work namespace using exact package character/event fingerprints. Authored overrides and disclosure gates remain authoritative, and the identity status button opens diagnostics. See `docs/vn-work-identity-1.25.3.md`.

1.25.2 preserves encrypted API keys across refreshes and updates. Restoring saved keys no longer makes a paid connection probe or deletes keys on transient failures. Concurrent first saves share a stable wrapping key; VN updates preserve other providers and separately saved media credentials. See `docs/api-key-persistence-1.25.2.md`.

1.25.1 bundles the VN entry to avoid the module request waterfall and batches deferred cost-history imports without bypassing paid budget checks. Sprite framing now distinguishes exposed foreheads from bangs while preserving authored height. Multiplayer cast/image/voice generation is server-fenced to the originating turn writer; shared voice recordings do not fork by listener settings. See `docs/vn-1.25.1.md` and `docs/vn-multiplayer-plan.md`.

1.24.6 keeps the story clock visible in the VN top bar, independent of the background-lighting cache. Saved scene times are used during history reading; missing historical dates are not borrowed from the latest state. Pending turns retain the last confirmed clock, and mobile safe-area layout is preserved. No new API or timer is added. `docs/vn-multiplayer-plan.md` records the proposed shared direction/media architecture and beta gates; VN multiplayer itself is not enabled by this release.

1.24.5 compacts the VN cast/directing response by sharing verbatim evidence and omitting default cues, then restores the original shape before unchanged identity/presence validation. Validated cast preparation no longer waits for local cache writes, and API timing excludes subsequent accounting writes. Models, reasoning effort, cache keys and existing saves are preserved. The eight-beat fixture uses 84% fewer JSON bytes; this is not a live latency result. See `docs/vn-cast-performance-1.24.5.md` for checks and limits.

1.24.4 separates idle verdict/persistence checkpoints from the engine's live busy state, allowing the preserved beat to save and retry. A single retry waits for an outstanding cloud save before admission; timed-out exports recover with bounded retries and request IDs reject late responses. Account leases, revision checks and conflict preservation remain enforced. The embedded VN inherits top-level safe-area insets and visual viewport height, with measured portrait footer/voice/status spacing and keyboard-aware input space. Regression checks cover idle pending verdicts, save-then-retry, missing/late export responses, mode continuity and viewport lifecycle. Synthetic 390×844, 390×667 and 844×390 rendering was inspected; physical iPhone Safari and live paid generation remain unverified.

1.24.3 restores the standalone VN stylesheet cascade instead of alphabetically loading its base CSS last. Mobile typography, camera and controls therefore use the original reader rules. The root layout emits one explicit viewport tag with viewport-fit=cover because the pinned Vinext renderer omits that field, preventing iOS landscape side gutters without disabling zoom. Regression checks cover both the original stylesheet order and the actual framework viewport renderer. Local synthetic landscape (844×390) and portrait (390×844) rendering was inspected; physical iPhone Safari behavior remains unverified. No provider calls or saved-game migrations are required.

1.24.2 enters visual novel mode through one main-site preparation surface and reveals only the ready VN stage. The selected mode is available on the player's first render; CSS and module downloads overlap cloud checks without executing the renderer early. Request IDs reject stale completion/error messages; view retries and mode switches retain the same engine. Tests cover delayed activation, retries, stale acknowledgements and cloud-save continuity. Local synthetic desktop and mobile-landscape entry held the module download and recorded no visible novel/library frames; no paid provider calls or physical-phone tests were used.

1.24.1 places the novel/visual-novel choice inside the selected session with two icon cards, clear selected states and a mobile layout. The main site's portrait-only cover now follows the active reading mode, allowing the VN landscape stage. Mode switching, TypeScript and local desktop/mobile rendering were checked; landscape verification used a synthetic session with the coarse-pointer CSS condition emulated, not a physical phone.

1.24.0 integrates the independent visual novel 13.19.0 runtime into Dancheong. The existing library selects novel or visual novel, and the player switches modes over the same engine and account session. Generated media, cinematic presentation, voice, automatic reading and ten save slots run on the main origin. Independent-site saves and keys are not imported. See `docs/visual-novel-integration.md` for the adapter and validation boundaries.

1.23.1 switches the gameplay writer to GPT 6 Luna on OpenAI and OpenCode Go, preserving Cortex low reasoning and pinned 5.6 judges/memory. Both Luna generations remain accepted by the Go proxy for older clients. Token pricing and multiplayer billing recognize the new writer. See `docs/LUNA6_1.23.1.md`.

1.23.0 ships Jieum 1.3.0 with lossless editing of legacy loop/multiple-ending contracts and an independent, opt-in stat HUD. Actual reset effects use the existing verdict and a once-per-event ledger; optional calendar dates require literal present-scene evidence. No event pacing or approved prose is rewritten. See `docs/CHRONOS_SHARED_1.23.0.md` for the contract and validation boundaries.

1.22.0 reduces reader/inspector rendering work, offloads exact durable-content hashing to a local worker, combines admission metadata with the existing fenced lease, and avoids redundant multiplayer payload/chat requests. The pinned Cortex runtime and narrative rules are unchanged. Local 1,000-beat mobile/desktop fixtures cover history anchors, tabs, image popup, reload and hash parity; they are not a production concurrency guarantee. See `docs/performance-1.22.0.md` for measurements and limitations.

1.21.9 binds each selected image to its public owner, aliases and locally extracted final-paragraph action. Published unregistered speaker names remain separate identities without borrowing another face. Images focus on the final paragraph instead of replaying a preceding farewell; shared voices beyond a barrier are excluded. The same single image request serves solo and multiplayer, with no new writer duty or scene-check API. Existing prose and generated images are preserved.

1.21.8 narrows scene-image references: explicitly offscreen or departed people no longer lend their embedded appearance to a different current participant. Actual co-presence, silent characters, arrivals and public-image restrictions remain supported. Stale image intentions rebuild locally; there is still only one image request, no scene-check model call or extra writer work. Approved prose, dialogue cards and existing generated images are unchanged.

1.21.7 unifies canon/Instant author dialogue under inline public names. The name written with each utterance is the card label; public identity lookup only supplies optional images. New turns do not run post-commit automatic speaker recovery. Legacy markers/manual recovery remain compatible, with mismatched IDs unable to rename a speaker. Single/multiplayer cards preserve short names while streaming and after restore; missing/ambiguous identity stays image-free. No extra model call, storage migration or narrative rewrite.

1.21.5 distinguishes multiplayer reconnection from story catch-up, adds local per-beat diagnostics with opt-in prose, and shows cloud-acknowledged beat counts with retry. Redundant exports and idle portrait rescans are coalesced; queued live frames no longer wait for a retry tick. Existing server-authorized turns, incremental recovery and conflict protection remain intact. See `docs/READER_RELIABILITY_1.21.5.md` for verification boundaries.

1.21.2 keeps the Muse credential outside imported Cortex snapshots so every paragraph review and final verdict retains authorization. Muse prose uses the supported low-reasoning variant to reduce its long pre-token delay while preserving explicit structured-review effort.

1.21.1 increases light-settings text contrast, compacts the text-model selector and Go disclosure, adds separate official Go overview and workspace subscription/billing actions, and gives Muse enough response budget to reach visible prose instead of ending incomplete before its first token.

1.21.0 adds per-device Cortex text provider selection (OpenAI Luna or OpenCode Go Muse Spark Contributor), isolated encrypted keys and provider-specific setup guidance. Go text requests use a fixed authenticated streaming proxy; OpenAI-only image/Studio/legacy calls never receive the Go key. Multiplayer creation now selects a work and an existing session or a clean package opening. Instant readers omit the Events tab; manually reaching the bottom resumes stream follow without allowing layout restoration to seize it. Real Muse subscription credentials have not been used for live long-form verification; users should review Go's coding-agent usage conditions and Contributor data policy before connecting.

1.20.3 makes multiplayer readiness react immediately, confirms the saved state with persistent Korean status chips, and removes redundant Cortex locks and room re-queries from ready/cancel. Room membership reads are batched, recent-room loading no longer performs an N+1 query, hidden tabs stop polling, and slow API-key validation no longer blocks the lobby or requested room from rendering.

1.20.1 collapses repeated embedded pictures in the inspector gallery only. Per-beat speaker portraits and separately generated scene images retain their existing behavior. Image-generation character selection is unchanged by this presentation fix.

1.20.0 adds Cortex shared multiplayer rooms, preserves the existing Lotus relay rules, separates join/create into mobile-friendly lobby tabs, and provides participant-only chat above recommendations. Revision claims and atomic commits protect the shared story while leaving the source personal save unchanged. Restored generated images now stay attached to their original beat, including when older history is loaded. See `docs/MULTIPLAYER_1.20.0.md` for verification and operational limits.

1.19.11 reserves a slim cloud-status row below the reader world bar, cancels completed lookup timeouts, checks lightweight metadata before downloading full backups, and retries failed mobile uploads on reconnect/resume and with bounded backoff. Real-device background completion is not guaranteed.

1.19.10 adds a quiet, in-reader cloud-sync indicator on mobile and desktop. Cortex now exports every committed beat immediately, shows checking/syncing/completed/retry states, clears successful completion after five seconds, and requests a final page-exit-safe upload when a phone or tablet backgrounds the site. Jieum remains 1.2.2.

1.19.9 keeps every cloud-saved Cortex session visible on every signed-in device. The Cortex library now merges the account session catalog when the library opens, the app regains focus or connectivity, and periodically while visible, so parallel phone and PC sessions remain separate selectable sessions under the same work. Jieum remains 1.2.2.

1.19.7 opens each Neoreum book with the highest revision already installed on the current device, while preserving explicit selection of older installed revisions and their separate sessions. It never downloads or installs a revision automatically. The public catalog is now labeled Neoreum throughout the home screen and no longer advertises the bundled Giseong Academy demo; existing demo installs and recovery remain available. Jieum remains 1.2.2.

1.19.6 prevents two devices from silently editing the same Cortex session. A live account-scoped lease blocks the second entry and offers two explicit paths: fork the latest cloud snapshot into an independent session, or request a safe takeover. Safe takeover locks the old reader, waits for an active beat to finish, uploads its complete backup, releases the lease only after that upload succeeds, and then restores the same session on the new device. If the old device is unreachable, the new device resumes from the last completed cloud save after lease expiry. Jieum remains 1.2.2.

1.19.5 prioritizes the Cortex reader document before large cloud snapshots and local package reads. The restored prose mounts and reports ready before optional embedded portrait priming begins, with portrait work deferred until after the first paint. This removes the entry-screen delay that was most visible on image-heavy Fate/Seoul sessions while preserving the complete save, cloud arbitration, and embedded media behavior. Jieum remains 1.2.2.

1.19.4 keeps every saved turn and the full engine memory while mounting only the latest five turns on entry. Older prose is prepended in ten-turn batches when the reader deliberately scrolls upward or uses the history control, with a text anchor that preserves the line being read. Portrait and dialogue decoration now runs only over mounted turns; entry image priming follows the same five-turn window. A 100-turn mobile restore reached a ready reader with five mounted turns in the local browser fixture, and the first history batch held its anchor within one pixel.

1.19.3 starts the reader on DOM readiness instead of waiting for every image request. Restored sessions prime at most three public image resources within a six-second total entry budget, then prepare remaining artwork inside the reader. A visible entry/retry/home surface replaces blank waits; retry retains the same session and saved data. Bootstrap and restore-ready signals are deduplicated. Jieum remains 1.2.2.

1.19.2 ships Jieum 1.2.2 with contain-first 1088×608 framing: portrait images start fully visible with side margins, wide images start fully visible with top and bottom margins, and zoom unlocks drag positioning. Cortex now reuses embedded portraits for each beat's verified non-protagonist speaker, shows the protagonist image once above the prologue, and waits at most six seconds for display without delaying generation or auditing. Missing portraits never trigger paid image generation. See `docs/jieum-renewal.md` for the wider Jieum 1.2 authoring renewal.

1.18.2 primes embedded character images before the reader mounts and gives visible cast portraits eager decode priority, so packaged artwork appears without waiting for an image-model call. Reader-side status and cast cards continue to show character names only. Jieum 1.1.0 provides the compact Instant authoring flow described in `docs/JIEUM_INSTANT_AUTHORING_1.1.0.md`.

1.17.2 preserves authored opening/prologue line breaks, blank lines and repeated spaces in the reader. Package/save data and normal turn rendering are unchanged.

1.17.1 prevents paragraph reviewers from demanding missing recommendations, strips non-diegetic choice lists before publication, stops replaying opening goals/examples after progress, restores the user writer style guide, and supports grounded location-only HUD updates. See `docs/INSTANT_PROSE_REPAIR_1.17.1.md`.

Nexus 1.17.0 separates Instant free prose from HUD updates. The shared ordered paragraph pipeline publishes the opening, reviews unpublished paragraphs with a narrow scope and preserves public prose on interruption. HUD failure asks the writer once, then retains previous values. No event FSM, closure judge or scheduled ending runs in the new Instant reader. Existing package/save/image keys and the 1.16.4 memory policy remain compatible. See `docs/INSTANT_FREE_1.17.0.md`.

Nexus 1.16.4 gives Instant a ten-bit raw memory window, 1,200-character summaries per ten committed bits and independent approximately 5,000-character archives per twenty summaries. Canon keeps its three-event summaries without producing new archives. Original prose and source-validated summaries survive save/restart and rewind. This release changes memory only, not Instant publication or HUD failure handling. See `docs/PROSE_MEMORY_1.16.4.md`.

Nexus 1.16.3 groups installed Neoreum revisions under one library cover. A compact single-line revision badge and title-side overflow menu replace the large update button. Revision selection preserves independent package/session keys. Browser fixtures cover 320/390/768/1440px, selection, catalog refresh, download failure and preserved prior sessions; no real user works were modified.

Nexus 1.16.2 quarantines malformed private spacetime envelopes before streaming publication and restores contaminated saved prose with diagnostic originals preserved. JSON-derived quote annotations are discarded; surviving dialogue anchors are relocated. Only two uncalled legacy writer-context helpers were removed; image, identity and save keys remain intact. See `docs/CORTEX_PROTOCOL_FIX_1.16.2.md`.

Nexus 1.16.1 floats the reader page-end arrow over the reading viewport without extending the recommendation background or consuming a separate layout row.

Nexus 1.16.0 restores an owner-only cover-led Neoreum home and fixes mobile form minimum-width overflow. Shelf revision ribbons install immutable, validated packages under separate revision keys; existing packages and sessions are preserved. Engine copy and diagnostics now describe the public-prose/event-verdict path. See `docs/CORTEX_RUNTIME_USAGE_1.16.0.md` for the bounded unused-helper removal and retained compatibility paths. Local browser fixtures cover 320/390/430/768/1440px layouts and revision-session selection; they do not publish real user works. Global `tsc` still reports pre-existing repository errors, including archived source trees; product builds and regression tests are checked separately.

Nexus 1.15.3 prefetches the top-level destinations and uses client-side routing across Home, Jieum, Neoreum, and Multiplayer. Jieum still flushes its draft before leaving, while the full-page reload is removed and a slim Dancheong progress signal covers the remaining transition time. The 1.15.2 account-owned Neoreum console and mobile portrait layout remain intact.

Instant Story 1.14.5 removes duplicate opening and UI-only context without changing authored rules or configured budgets. Jieum checks context sizing before download, and Cortex reports actionable budget errors. See `docs/INSTANT_CONTEXT_1.14.5.md`. Includes the Jieum 1.0.1 authoring improvements from Nexus 1.14.4.

Reader 1.14.3 places the page-end control above recommendations and hides it whenever the reader manually reaches the true bottom, without reclaiming scroll control. It retains the 1.14.2 disclosure, cast, portrait, seal, inspector, and scroll-anchor improvements. See `docs/READER_TAIL_1.14.3.md`.

Native **단청 지음 1.0.0** at `/jieum` integrates Studio 2.3.2 authoring, a scoped Dancheong design, isolated durable local drafts, conflict-safe saves and reviewed home blueprints. Studio V1/V2 files and original-image ZIPs remain compatible. See `docs/JIEUM_1.0.0.md` for boundaries and validation.

Dialogue cards now consume writer-owned quote bindings, including literal public names for unregistered extras, without nearby-name or alternating-speaker inference. Transport labels remain outside visible prose. Reader follow pauses on manual scrolling and resumes only through the latest-text button; text anchors preserve the reading position through commitment and delayed image layout. See `docs/READER_PRECISION_1.13.1.md` for validation and limits.

Adds the Dancheong Instant V2 runtime extension, source/cache validation, bounded keyword/stat/ending context, validated SSE commits and symmetric save/rewind. Natural-language occurrence conditions select candidates without completing skipped events. Public character gender/age/kinship facts are carried into writer and safety checks; leaked recommendation menus are quarantined. Studio draft generation no longer sends unsupported `uniqueItems`. See `docs/CORTEX_STUDIO_HANDOFF_1.13.0.md` for exact scope and validation limits.

Reference-matched hardcover binding: the spine stays within the front cover height, with a lower edge that rises toward the outside. Short corner curves, a flatter charcoal face, fine cloth grain, a narrow hinge groove, a dark board edge, and a compact contact shadow replace the rolled spine silhouette. Original artwork proportions, title-free spines and shelf controls are preserved.

iOS text autosizing is pinned to the authored scale in both the Nexus shell and Cortex reader so portrait-landscape-portrait rotation cannot leave prose enlarged.

The cloth and highlighted binding groove now come from a reusable reference-guided raster material, with the work's cover art layered independently. The material is shared across books and delivered as WebP; the silhouette samples only its opaque spine interior. A 16:25 front frame matches the slender reference, with a constant 1:7 spine/front width ratio on mobile and desktop. Artwork fills that frame with proportional center cropping (object-fit: cover); no nonuniform scaling or projection is applied to the image.

Spine and front cover share the same thin lower finishing edge without a protruding front-board step. Shelf tracks are centered with symmetric outer margins on mobile, tablet and desktop; books fill these fixed slots from the left, including incomplete final rows. Existing responsive book sizes and the three-column phone layout are preserved.

Library binding refinement: the spine uses continuous charcoal shading instead of repeated stripes, with short corner curves and a rising lower edge that meets the cover bottom. Cover art fills an explicit frame without a pale backing border; a close silhouette shadow replaces the wide rectangular shadow. The shelf plank, standard cover ratio, and title-free spine are retained.

The prose frame now uses genuine-alpha quarter-corner ornaments at prose width, with no baked background rectangle and substantially lower contrast. Library books keep the Chronos cover ratio and center-crop unlike-sized art into one consistent front-cover frame. The paper stack under the cover is removed; a rounded, upward-rising charcoal cloth spine and restrained hinge shading provide the depth without covering the artwork. Spine titles remain removed.

The event inspector presents each incident as a warm hanji ledger card with Joseon-book binding details. Active completion requirements are always visible and re-evaluated after every beat with the exact same evidence functions used by event closure; empty boxes turn into stable SVG checks without adding new persisted state. The redundant scene-progress disclosure and public “overdue” wording are removed. The backup/recovery action panel now exposes only common-session export, pre-reset/rewind recovery, and copying the last public writer request; the separate top-bar tool menu retains scenario import/save, settings, and session reset.

Conditional character identities are withheld from speaker metadata, dialogue labels, primary portraits and writer-side public catalogs until an explicit disclosure receipt permits them. Legacy “first appearance, then public” profile conditions are included in the existing private-entity review ledger. Unsupported speaker IDs never fall back to exposing their supplied names. The reader rechecks restored annotations without rewriting committed prose.

Primary portraits use existing package assets first. An advertised but not-yet-restored image, or a media-store read failure, no longer triggers a paid replacement. New portrait requests use only public profile fields, prefer Flare, and allow the existing GPT-Image-2 compatibility path on model-access denial. Actual model usage remains metered. If both models deny access, automatic portrait retries stop for that connection; a compact reader notice offers retry, and changing the API key resets the hold. These changes cannot grant image-model access to an unverified API organization and do not introduce a shared server key.

Library covers use the Chronos ratio as their shared physical frame; unlike-sized source art is proportionally center-cropped rather than stretched. A separate charcoal-gray cloth spine sits outside the front image instead of covering its left edge. The shelf plank and progress indicators are preserved.

The event inspector uses a single ruled paper surface, filled vermilion completion seals and retained struck-through completed titles. Long criteria remain accessible in disclosures. Ornaments sit at the reading viewport corners, outside the prose, and scene labels sit above a fine ornament-centered rule.

The library adds slim book spines and volume/progress labels while retaining its shelf plank. The wider desktop inspector uses compact paper cards and a visible vermilion seal only for successfully completed events. Significant recorded date/location transitions gain quiet separators; prose corners carry faint grayscale Dancheong motifs. The composer removes its inner green rule, aligns button heights and adds a reduced-motion-aware continue hover. PWA icons use a new vector lotus mark rendered at 32, 180, 192 and 512 pixels. These are presentation changes; Cortex canon, adjudication, event progression and persistence contracts remain unchanged.

The input-card corner motif is slightly broader and more visible, retaining its soft grayscale fade.

User-input cards use bold text with a subtle grayscale Dancheong motif in the corner. Text size and reading layout remain unchanged; opening cards and hidden automatic-continuation directives are unaffected.

Recommendations use bold two-line risk labels and a fixed 980px maximum strip independent of prose width. Duplicate standalone image controls are hidden; per-beat controls remain. 너름 installation updates the library without entering a session. Cloud lookup starts alongside Cortex bootstrap; restored sessions avoid redundant ZIP transfer.

Session readers provide a jump-to-bottom arrow and compact hanji-style notices above the composer. Mobile Enter inserts a newline; only the send button submits typed input. Desktop Enter and Shift+Enter retain their existing behavior, with IME composition protected.

Public site: <https://relay-novel-nexus.juno12345.chatgpt.site>

Dancheong is an interactive Korean novel reader and runtime. It combines the Lotus experience with the integrated **Cortex 1.42.0** engine, account-based libraries and session recovery, 너름 packages, and Dancheong's responsive reading interface.

## Current runtime

The UI uses locally hosted NAVER Maru Buri, with Nanum Myeongjo YetHangul for the single-line Studio heading. Missing next-move recommendations are recovered separately by the prose model and never appended to story text. Session tools are limited to common-session export, pre-reset/rewind recovery, and copying the last public writer request.

The reader keeps automatic-continuation directives out of the story, places eligible first-appearance portraits after their paragraphs, and generates missing public profile portraits once. Written quotations are displayed separately without speaker cards. Portrait generation uses the existing image quality and fixed landscape size; access failures appear in a compact notice, not a large provider-error card inside prose.

- Cortex 1.42.0 event, beat, canon, seal, memory, and recovery contracts
- GPT-6 Luna prose streaming with live speaker metadata and dialogue cards
- Same-turn `LOW → MEDIUM → HIGH` next-move recommendations kept outside canon prose
- Per-beat rewind, copy, scene-image generation, and Instant Story continuation
- GPT-Image 2.5 Flare scene images at the fixed landscape frame, using up to two package character references with high input fidelity
- Opening prose and package primary character images shown without a second manual ZIP prompt
- Device persistence plus account-scoped Cortex session synchronization
- 너름 discovery, verified ZIP installation, stable work identity, and WebP cover handling
- Separate text, planning/judging, repair/review, character-image, and scene-image API cost metering

An OpenAI API key is required for live generation. User keys are kept in the device key vault and are excluded from story data, account data, backups, logs, and source exports.

## Run locally

Requirements: Node.js **22.13.0 or newer**.

On Windows, run `Start.bat`. For manual development:

```bash
npm install
npm run dev
```

The Windows launcher uses <http://127.0.0.1:4173>. Copy `.env.example` to `.env.local` only for local server configuration, and never commit a real API key.

## Verify and build

```bash
npm test
npm run build
```

`npm run build` verifies and reconstructs the adapted Cortex artifact, creates the matching `Dancheong_v<version>_Source.zip`, builds the Sites worker, and validates the deployment artifact.

## Storage

- D1 stores account-owned project, session, audit, and cost metadata.
- R2 stores packages, snapshots, thumbnails, and other binary assets.
- IndexedDB retains device-local Cortex packages and media for immediate reuse.
- Local storage is limited to device-local runtime catalog and preferences.

The source archive excludes API keys, environment secrets, dependencies, build output, runtime caches, and previously generated source archives. Its `SOURCE_EXPORT_MANIFEST.json` records the exact release version, file count, generation time, and source hash.

## Important paths

- `app/`: Dancheong UI and API routes
- `lib/`: runtime, storage, package, account, and cost logic
- `public/`: browser assets and the generated Cortex entry artifact
- `vendor/cortex/`: pinned Cortex source parts and integrity manifest
- `tests/`: unit, rendered artifact, replay, and Cortex host tests
- `drizzle/`: production schema migrations

See [README_KO.md](README_KO.md) for the Korean guide.
