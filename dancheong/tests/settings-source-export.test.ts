import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const eventPanel = await readFile(
  new URL("../app/components/inspector-events.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const libraryHome = await readFile(
  new URL("../app/components/nexus-library-home.tsx", import.meta.url),
  "utf8",
);
const siteNav = await readFile(new URL("../app/components/nexus-site-nav.tsx", import.meta.url), "utf8");
test("library books crop undistorted art into the reference frame, with a smooth rising spine and preserved shelf", () => {
  assert.match(css, /\.dancheong-book-front\{[^}]*aspect-ratio:16\/25/u);
  assert.doesNotMatch(css, /\.dancheong-book-front(?:>img)?\{[^}]*transform:/u);
  assert.match(css, /\.dancheong-book-front>img\{[^}]*height:100%;[^}]*object-fit:cover;[^}]*object-position:center/u);
  assert.match(css, /\.dancheong-book-spine\{[^}]*right:calc\(100% - 1px\);[^}]*preserveAspectRatio='none'/u);
  assert.doesNotMatch(css, /\.dancheong-book-spine\{[^}]*repeating-linear-gradient/u);
  assert.match(css, /\.dancheong-book-spine::before\{[^}]*linear-gradient/u);
  assert.match(css, /\.dancheong-book-front::before\{content:none\}/u);
  assert.doesNotMatch(css, /\.dancheong-book-front::before\{[^}]*repeating-linear-gradient/u);
  assert.match(css, /\.library-book \.book-cover\{[^}]*aspect-ratio:auto;[^}]*overflow:visible/u);
  assert.match(libraryHome, /<span className="dancheong-book-spine" aria-hidden="true"\s*\/>/u);
  assert.doesNotMatch(libraryHome, /dancheong-book-spine[^>]*>\{project\.title\}/u);
});
const multiplayerPage = await readFile(
  new URL("../app/multiplayer/page.tsx", import.meta.url),
  "utf8",
);
const hubCatalogRoute = await readFile(
  new URL("../app/api/hub/works/route.ts", import.meta.url),
  "utf8",
);
const projectImportRoute = await readFile(
  new URL("../app/api/projects/route.ts", import.meta.url),
  "utf8",
);
const runtimeEngineHook = await readFile(
  new URL("../app/hooks/use-runtime-engine.ts", import.meta.url),
  "utf8",
);
const studioDraftRoute = await readFile(
  new URL("../app/api/studio/draft/route.ts", import.meta.url),
  "utf8",
);
const buildScript = await readFile(new URL("../scripts/build-verified.sh", import.meta.url), "utf8");
const exportScript = await readFile(new URL("../scripts/create-source-export.mjs", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const readmeKo = await readFile(new URL("../README_KO.md", import.meta.url), "utf8");
const appVersionSource = await readFile(new URL("../lib/app-version.ts", import.meta.url), "utf8");
const simulateRoute = await readFile(new URL("../app/api/simulate/route.ts", import.meta.url), "utf8");
const narrativeOutputSafety = await readFile(
  new URL("../lib/narrative-output-safety.ts", import.meta.url),
  "utf8",
);
const nexusShellState = await readFile(
  new URL("../app/hooks/use-nexus-shell-state.ts", import.meta.url),
  "utf8",
);
const streamRoute = await readFile(
  new URL("../app/api/simulate/stream/route.ts", import.meta.url),
  "utf8",
);
const liveStreamUi = await readFile(
  new URL("../app/hooks/use-live-stream-ui.ts", import.meta.url),
  "utf8",
);
const storyScrollUi = await readFile(
  new URL("../app/hooks/use-story-scroll-ui.ts", import.meta.url),
  "utf8",
);
const cortexPlayer = await readFile(
  new URL("../app/cortex-player.tsx", import.meta.url),
  "utf8",
);
const cortexHost = await readFile(
  new URL("../public/cortex-host.js", import.meta.url),
  "utf8",
);
const cortexInspector = await readFile(
  new URL("../public/cortex-nexus-inspector.js", import.meta.url),
  "utf8",
);
const cortexView = await readFile(
  new URL("../public/cortex-nexus-view.js", import.meta.url),
  "utf8",
);
const cortexCss = await readFile(
  new URL("../public/cortex-nexus.css", import.meta.url),
  "utf8",
);
const cortexHtml = await readFile(
  new URL("../public/cortex.html", import.meta.url),
  "utf8",
);

test("desktop settings gives its content a bounded scroll area", () => {
  assert.match(css, /\.settings-dialog\s*\{[\s\S]*?grid-template-rows:\s*76px minmax\(0, 1fr\)/u);
  assert.match(css, /\.settings-layout\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden/u);
  assert.match(css, /\.settings-content\s*\{[\s\S]*?overflow-y:\s*auto/u);
});

test("Cortex keeps the Lotus settings shell but hides unsupported image dimensions", () => {
  assert.match(page, /runtimeEngine !== "cortex"[\s\S]*?PLAYBACK RESOLUTION[\s\S]*?FRAME ASPECT/u);
  assert.match(page, /SCENE IMAGE INTERVAL/u);
  assert.match(page, /Cortex 장면 이미지는 고정 가로 프레임으로 생성됩니다/u);
  assert.match(page, /readingWidth=\{readingWidth\}[\s\S]*?fontSize=\{readingFontSize\}[\s\S]*?typingSpeed=\{typingSpeed\}[\s\S]*?imageEvery=\{state\.imageEvery\}/u);
  assert.match(cortexPlayer, /send\("SETTINGS",\{apiKey,provider,museReasoningEffort,imageApiKey:imageApiKey\|\|'',theme,readingWidth,fontSize,typingSpeed,imageQuality,imageEvery\}\)/u);
  assert.match(cortexHost, /\[0,2,5,10,20\]\.includes/u);
  assert.match(cortexHost, /NexusCortexTextApiKey=e\.data\.apiKey\|\|''/u);
  assert.match(cortexHost, /NexusCortexTextModel=e\.data\.provider==='opencode-go'/u);
  assert.match(cortexHost, /data-turn-image/u);
});

test("Cortex uses the shared settings surface and retires its connection dialog", () => {
  assert.match(page, /<strong>본문 표시 속도<\/strong>/u);
  assert.match(page, /\["slow", "natural", "fast", "instant"\]\.includes\(saved\.typingSpeed/u);
  assert.match(cortexHost, /model:isMuse\?'muse-spark-1.3-contributor':'gpt-6-luna',writerReasoningEffort/u);
  assert.ok(cortexHost.includes("baseUrl:['opencode-go','opencode-go-luna'].includes(e.data.provider)?'https://opencode.ai/zen/go/v1':'https://api.openai.com/v1'"));
  assert.match(cortexView, /legacySettings\.remove\(\)/u);
  assert.match(cortexView, /legacyDialog\.showModal=\(\)=>emit\('NEXUS_SETTINGS',\{tab:'connection'\}\)/u);
  assert.match(cortexView, /nexusSettings\.textContent='설정'/u);
  assert.doesNotMatch(cortexView, /Nexus 설정 · 엔진 전환/u);
});

test("Cortex right rail inherits the Lotus Nexus design instead of a parallel skin", () => {
  assert.match(cortexInspector, /root\.className='side right-rail nexus-inspector'/u);
  assert.doesNotMatch(cortexInspector, /lotus-inspector/u);
  assert.match(cortexCss, /The right rail uses Lotus's own Nexus classes and styles/u);
  assert.doesNotMatch(cortexCss, /--inspector-paper/u);
});

test("sealed Cortex events show their authored completion conditions as checked", () => {
  assert.match(cortexInspector, /packageContract\?\.eventGraph\?\.nodes/u);
  assert.match(cortexInspector, /source\?\.requiredFunctions\|\|source\?\.completionSignals/u);
  assert.match(cortexInspector, /sealed-event-checklist/u);
  assert.ok(cortexInspector.includes("completed?'checked':'ended'"));
  assert.match(cortexInspector, /dancheong-closure-seal/u);
  assert.doesNotMatch(cortexInspector, /row\.sealReason/u);
});

test("Cortex reuses embedded assets while the reader owns per-beat speaker portraits", () => {
  assert.match(cortexHost, /CHARACTER_FIRST_APPEARANCE/u);
  assert.match(cortexView, /createNexusSpeakerMedia/u);
  assert.match(cortexView, /waitMs=6000/u);
  assert.match(cortexView, /dataset\.openingPortrait/u);
  assert.match(cortexView, /NexusDialogue\.resolve/u);
  assert.doesNotMatch(cortexHost, /CHARACTER REFERENCE/u);
  assert.match(cortexHost, /packageMedia\(\)/u);
  assert.doesNotMatch(cortexHost, /_builtinCandidate\(\)/u);
  assert.doesNotMatch(cortexHost, /firstAppearanceIds|generatePrimaryPortrait/u);
  assert.match(cortexHost, /api\.persist\(\)/u);
  assert.match(cortexHtml, /form\.append\('image\[\]'/u);
  assert.match(cortexHtml, /images\/edits/u);
  assert.match(cortexHtml, /얼굴 구조·눈 색·머리색·헤어스타일·피부색·체형·고유 특징을 해당 기준 사진대로 유지한다/u);
  assert.match(cortexHtml, /referenceSelectionVersion:6/u);
  assert.match(cortexHost, /image\?\.isPrimary===true/u);
  assert.match(cortexHost, /:!primary:/u);
  assert.match(cortexHost, /NexusCortexPrimaryMedia/u);
});

test("Cortex reader mirrors the Dancheong light prose and dialogue presentation", () => {
  assert.match(cortexCss, /background:#f2f0ea/u);
  assert.match(cortexCss, /font-family:'Noto Serif KR',serif[^}]*font-size:var\(--prose-size\)[^}]*font-weight:400[^}]*line-height:2\.05/u);
  assert.match(cortexCss, /\.nexus-dialogue-body p\{[^}]*font-weight:600[^}]*line-height:1\.85/u);
  assert.match(cortexCss, /\.nexus-narration\{margin:0 0 1\.2em/u);
  assert.match(cortexCss, /\.nexus-dialogue-row\{[^}]*grid-template-columns:38px minmax\(0,1fr\)[^}]*margin:0 0 1\.35em/u);
  assert.match(cortexView, /NexusDialogue\.scan\(paragraph\)/u);
  assert.match(cortexView, /NexusCortexPrimaryMedia\?\.get\(characterId\)/u);
  assert.match(cortexView, /renderLiteraryProse/u);
});

test("settings exposes the matching current-version source archive", () => {
  assert.match(page, /SOURCE_EXPORT_FILE_NAME = `Dancheong_v\$\{APP_VERSION\}_Source\.zip`/u);
  assert.match(exportScript, /path\.join\(root, "lib", "app-version\.ts"\)/u);
  assert.match(exportScript, /exportFileName = `Dancheong_v\$\{appVersion\}_Source\.zip`/u);
  assert.match(exportScript, /siteVersion: appVersion/u);
  assert.match(exportScript, /fileCount: sourceFileCount/u);
  assert.match(exportScript, /sourceContentSha256:/u);
  assert.match(exportScript, /operatingUrl: "https:\/\/relay-novel-nexus\.juno12345\.chatgpt\.site"/u);
  assert.match(page, /소스 코드 ZIP 내보내기/u);
  assert.match(buildScript, /create-source-export\.mjs/u);
  const currentVersion = /APP_VERSION = "([^"]+)"/u.exec(appVersionSource)?.[1];
  assert.ok(currentVersion);
  assert.match(readme, new RegExp(`Current release: \\*\\*v${currentVersion!.replaceAll(".", "\\.")}\\*\\*`, "u"));
  assert.match(readmeKo, new RegExp(`현재 버전: \\*\\*v${currentVersion!.replaceAll(".", "\\.")}\\*\\*`, "u"));
  assert.match(readmeKo, /Cortex 1\.42\.0/u);
  assert.match(readmeKo, /GPT-Image 2\.5 Flare/u);
});

test("Story Hub cover proxy uses a Worker-compatible upstream request and preserves WebP MIME", async () => {
  const coverRoute = await readFile(
    new URL("../app/api/hub/works/[slug]/cover/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(coverRoute, /cache: "no-store"/u);
  assert.doesNotMatch(coverRoute, /cache: "force-cache"/u);
  assert.match(coverRoute, /"Content-Type": "image\/webp"/u);
});

test("Cortex Story Hub install validates and persists the package before opening it", async () => {
  const cortexLibrary = await readFile(new URL("../app/cortex-library.tsx", import.meta.url), "utf8");
  const installer = await readFile(new URL("../app/hub-revision-package.ts", import.meta.url), "utf8");
  assert.match(installer, /await validateHubPackageBytes\(bytes, work\)[\s\S]*?await rememberCortexProjectPackage\(projectId, file\)/u);
  assert.match(cortexLibrary, /await installHubRevisionPackage\(work\)[\s\S]*?onImportFile\(file/u);
  assert.match(cortexLibrary, /hubSourceProjectId\(work\)\|\|work\.slug/u);
});

test("cost meter separates image spend and tracks the 100-turn audit sample", () => {
  assert.match(page, /<span>장면 이미지<\/span>/u);
  assert.match(page, /<span>인물 이미지<\/span>/u);
  assert.match(page, /<span>계획·판정<\/span>/u);
  assert.match(page, /<span>수리·검수<\/span>/u);
  assert.match(page, /JSON 원자료/u);
  assert.match(page, /CSV 분석표/u);
  assert.match(page, /규칙별 비용·지연·채택/u);
  assert.match(page, /국소 수정/u);
  assert.match(page, /turn\.imageCostUsd \?\? 0/u);
  assert.match(page, /imageCostUsd: \(turn\.imageCostUsd \?\? 0\) \+ generatedImageCostUsd/u);
  assert.match(page, /const sampleTarget = 100/u);
  assert.match(page, /품질 권고 · 초안 유지/u);
  assert.match(page, /장면 컨텍스트 컴파일러/u);
  assert.match(page, /Fast \/ Deep/u);
  assert.match(page, /contextProfile/u);
});

test("v1.5.4 keeps writer-authored risk choices and repairs only the recommendation sidecar", () => {
  assert.match(simulateRoute, /narration을 완성한 같은 작가/u);
  assert.match(simulateRoute, /위험도 낮음 → 보통 → 높음/u);
  assert.match(simulateRoute, /validationMode: "hard_only"/u);
  assert.match(simulateRoute, /stage: "recommendation_repair"/u);
  assert.match(simulateRoute, /본문은 절대 다시 쓰지 않고 추천행동 세 줄만 교정/u);
  assert.doesNotMatch(simulateRoute, /writer-recommendation-emergency-fallback/u);
  assert.match(simulateRoute, /writer-recommendation-preserve-valid-subset/u);
});

test("v1.5.4 presentation keeps the server-authoritative writer recommendations losslessly", () => {
  assert.doesNotMatch(page, /sanitizeRecommendedReplies/u);
  assert.match(page, /return latestTurn\.recommendations\.slice\(0, 3\)/u);
  assert.doesNotMatch(
    simulateRoute,
    /sceneFocus\.blockedRecommendationTerms,\s*request\.pack\.player\.name/u,
  );
});

test("v1.5.4 never publishes deterministic recovery prose as a novel turn", () => {
  assert.match(simulateRoute, /stage: EngineCallStage/u);
  assert.match(simulateRoute, /"scene_regeneration"/u);
  assert.match(narrativeOutputSafety, /DETERMINISTIC_RECOVERY_PROSE_PATTERN/u);
  assert.match(simulateRoute, /"NARRATIVE_REWRITE_FAILED"/u);
  assert.match(simulateRoute, /이번 (?:턴|초안)을? 저장하지 않았습니다/u);
  assert.match(page, /failure\.code === "NARRATIVE_REWRITE_FAILED"/u);
  assert.match(page, /if \(advanceMode === "player"\) setInput\(userText\)/u);
});

test("v1.5.4 connects player-origin canon adjudication to every work", () => {
  assert.match(simulateRoute, /deriveUserCanonIntent\([\s\S]*?request\.pack\.npcs,[\s\S]*?clause\.mode === "execution"/u);
  assert.match(simulateRoute, /if \(!canonIntentHandled\) return false/u);
  assert.match(simulateRoute, /sanitizeSessionCanonUpdates\(\{/u);
  assert.match(simulateRoute, /sessionCanonAdd,/u);
  assert.match(simulateRoute, /dynamicContext\.sessionCanonLedger/u);
});

test("current chat can pull the newest cross-device snapshot without reloading the page", () => {
  assert.match(page, /handleRefreshCurrentSession/u);
  assert.match(page, /sessionEnvelopeCacheRef\.current\.clear\(\)/u);
  assert.match(page, /\/api\/sessions\/\$\{encodeURIComponent\(targetSessionId\)\}\?sync=\$\{Date\.now\(\)\}/u);
  assert.match(page, /\{ cache: "no-store" \}/u);
  assert.match(page, /현재 세션 즉시 새로고침/u);
  assert.match(page, /페이지를 다시 열지 않고 다른 기기의 최신 세션을 불러옵니다/u);
  const regularFlow=page.replace(/useEffect\(\(\)=>\{\s*const changed=\(event:Event\)=>\{[\s\S]*?\},\[setAccount,setProjects,setSessions\]\);/,'');
  assert.doesNotMatch(regularFlow, /window\.location\.reload/u);
});

test("every historical turn can restore the complete runtime checkpoint", () => {
  assert.match(page, /handleRollbackToTurn/u);
  assert.match(page, /runtimeCheckpointForTurn/u);
  assert.match(page, /상태·필수 사건·관계·NPC 행동·월드시간/u);
  assert.match(page, /index === turns\.length - 1[\s\S]*?handleRollbackToTurn\(turn, index\)/u);
});

test("dark mode replaces light-only controls with a unified charcoal palette", () => {
  assert.match(css, /--dark-surface-1:\s*#171b21/u);
  assert.match(css, /\.theme-dark :is\([\s\S]*?\.settings-icon-button[\s\S]*?\.api-guide-popup-actions a/u);
  assert.match(css, /\.theme-dark :is\([\s\S]*?\.user-choice[\s\S]*?\.import-progress-card/u);
  assert.match(css, /\.theme-dark \.model-pill\s*\{[\s\S]*?background:\s*#202832/u);
  assert.match(css, /\.theme-dark \.recommendation-risk\.risk-low/u);
  assert.match(css, /\.theme-dark \.situation-button\s*\{/u);
  assert.match(css, /\.theme-dark \.send-button:disabled\s*\{/u);
  assert.match(css, /\.theme-dark \.dialogue-copy p\s*\{[\s\S]*?text-shadow:/u);
  assert.match(css, /\.theme-dark \.speaker-line strong\s*\{[\s\S]*?color:\s*#f4f7fa/u);
});

test("desktop library centers fixed 250px shelf tracks while filling incomplete rows from the left", () => {
  assert.match(css, /\.book-row\s*\{[^}]*--shelf-book-width:\s*250px;[^}]*grid-template-columns:\s*repeat\(auto-fill, var\(--shelf-book-width\)\);[^}]*justify-content:\s*center/u);
  assert.match(css, /\.library-book\s*\{[^}]*max-width:\s*250px/u);
  assert.match(css, /\.empty-book\s*\{[^}]*width:\s*250px/u);
});

test("mobile portrait library always presents three covers per shelf row", () => {
  assert.match(
    css,
    /@media \(max-width: 560px\)\s*\{[\s\S]*?\.book-row\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/u,
  );
  assert.match(css, /@media \(max-width: 560px\)\s*\{[\s\S]*?\.library-book\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none/u);
});

test("library covers stay on one top line even when a title wraps", () => {
  assert.match(css, /\.book-row\s*\{[^}]*align-items:\s*start/u);
  assert.match(css, /\.book-info strong\s*\{[^}]*min-height:\s*2\.4em[^}]*-webkit-line-clamp:\s*2/u);
});

test("library owns work and session selection while the reader rail stays absent", () => {
  assert.match(libraryHome, /YOUR<br \/>SESSIONS/u);
  assert.match(libraryHome, /onClick=\{\(\) => selectProject\(project\.id\)\}/u);
  assert.match(libraryHome, /선택한 세션 입장/u);
  assert.match(libraryHome, /onOpenSession\(selectedSession\.id\)/u);
  assert.match(libraryHome, /onCreateSession\(selectedProject\.id\)/u);
  assert.match(page, /<aside className="left-rail" hidden aria-hidden="true">/u);
  assert.match(css, /\.app-shell\s*\{[\s\S]*?grid-template-columns:\s*minmax\(560px, 1fr\) 310px/u);
});

test("mobile reader is portrait-first except for the expanded image lightbox", () => {
  assert.match(page, /!previewImage && \([\s\S]*?mobile-portrait-lock/u);
  assert.match(css, /@media \(orientation: landscape\) and \(pointer: coarse\) and \(max-height: 600px\)/u);
  assert.match(page, /<ImageLightbox[\s\S]*?image=\{previewImage\}/u);
  assert.doesNotMatch(css, /\.image-lightbox[^{]*\{[^}]*display:\s*none/u);
});

test("mobile reader restores the desktop inspector through a right-edge drawer", () => {
  assert.match(page, /className="mobile-inspector-edge-button"/u);
  assert.match(page, /aria-label="오른쪽 이야기 정보 펼치기"/u);
  for (const tab of ["status", "events", "cast", "images"]) {
    assert.match(page, new RegExp(`openMobileInspector\\("${tab}"\\)`, "u"));
  }
  assert.match(page, /initialTab=\{mobileInspectorTab\}/u);
  assert.match(css, /\.mobile-inspector-edge-button\s*\{[\s\S]*?position:\s*fixed[\s\S]*?right:\s*0/u);
  assert.match(css, /\.mobile-sheet-state\s*\{[\s\S]*?right:\s*0;[\s\S]*?width:\s*min\(88vw, 380px\)/u);
  assert.doesNotMatch(css, /@media \(max-width: 820px\)[\s\S]*?\.mobile-sheet-state\s*\{[^}]*bottom:\s*0;[^}]*left:\s*0;[^}]*width:\s*100%/u);
});

test("mobile reader keeps the full transcript export action visible", () => {
  assert.match(page, /className="export-transcript-button"/u);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.export-transcript-button\s*\{[^}]*display:\s*flex;[^}]*min-width:\s*34px/u);
});

test("home prompt generates a structured blueprint and hands it to native Jieum", () => {
  assert.match(libraryHome, /id="studio-story-prompt"/u);
  assert.match(libraryHome, /사건과 엔딩이 있는 이야기/u);
  assert.match(libraryHome, /설정으로 시작하는 자유로운 이야기/u);
  assert.match(libraryHome, /putJieumHandoff/);
  assert.match(libraryHome, /fetch\("\/api\/studio\/draft"/u);
  assert.match(libraryHome, /role="progressbar"/u);
  assert.match(libraryHome, /aria-label="지음 초안 생성 예상 진행률"/u);
  assert.match(libraryHome, /\/jieum\?transfer=/u);
  assert.doesNotMatch(libraryHome, /target\.hash = `relay-blueprint=/u);
  assert.match(libraryHome, /window\.location\.assign/u);
  assert.doesNotMatch(libraryHome, /window\.open\(target\.toString/u);
  assert.match(studioDraftRoute, /RELAY_NEXUS_STUDIO_BLUEPRINT_V1/u);
  assert.match(studioDraftRoute, /json_schema/u);
  assert.match(studioDraftRoute, /projectFromGeneratedDraft/u);
});

test("home generation uses the current Jieum schema and labels", () => {
  assert.match(studioDraftRoute, /projectFromGeneratedDraft/u);
  assert.match(studioDraftRoute, /jieumDraftSchema\(runtimeMode\)/u);
  assert.match(libraryHome, /사건과 엔딩이 있는 이야기/u);
  assert.match(libraryHome, /설정으로 시작하는 자유로운 이야기/u);
  assert.match(libraryHome, /사건 연결과 필수 설정을 검사/u);
});

test("library sessions expose a guarded delete action", () => {
  assert.match(libraryHome, /onDeleteSession:\s*\(sessionId: string\) => Promise<void>/u);
  assert.match(libraryHome, /className="continue-session-delete"/u);
  assert.match(libraryHome, /selectedProjectSessions\.length <= 1/u);
  assert.match(page, /onDeleteSession=\{async \(sessionId\)/u);
});

test("reader reports real streaming pipeline stages one line at a time", () => {
  assert.match(streamRoute, /요청 수신 완료 · 현재 비트와 공개 문맥을 정리하는 중/u);
  assert.match(streamRoute, /Luna가 1비트 첫 문장을 생성하는 중/u);
  assert.match(page, /도착한 문장을 실시간 공개·안전 검사하는 중/u);
  assert.match(page, /본문 검사 완료 · 상태와 기억을 확정하는 중/u);
  assert.match(liveStreamUi, /setStreamStatusCompleted\(true\)/u);
  assert.match(page, /aria-label="단계 완료">✓/u);
  assert.match(page, /세계가 반응하는 중/u);
  assert.match(css, /@keyframes world-dot-wave/u);
});

test("live reader keeps the final commit stationary and offers an explicit latest jump", () => {
  assert.match(page, /lockScrollForNextLayout\(\)/u);
  assert.match(page, /preserveVisibleStoryAnchorForNextLayout\(\)/u);
  assert.match(page, /data-story-turn-id=\{turn\.id\}/u);
  assert.match(storyScrollUi, /element\.dataset\.storyTurnId === anchor\.turnId/u);
  assert.match(storyScrollUi, /querySelectorAll<HTMLElement>\("\[data-story-block-id\]"\)/u);
  assert.match(storyScrollUi, /anchor\.scrollTop \+ correction/u);
  assert.match(storyScrollUi, /Math\.abs\(correction\) <= Math\.max\(scroller\.clientHeight, 320\)/u);
  assert.match(page, /showLatestButton && \(\s*<button\s*className="latest-story-button"/u);
  assert.match(page, /↓<\/span> 최신으로/u);
  assert.match(page, /useStoryScrollUi\(storyScrollRef, surfaceMode === "reader"\)/u);
  assert.match(storyScrollUi, /if \(!enabled\)/u);
  assert.match(storyScrollUi, /\[enabled, storyScrollRef, updateLatestButton\]/u);
  assert.match(storyScrollUi, /LATEST_BUTTON_DISTANCE = 1/u);
  assert.match(storyScrollUi, /distance > LATEST_BUTTON_DISTANCE/u);
  assert.match(storyScrollUi, /scrollTo\(\{ top: scroller\.scrollHeight, behavior: "smooth" \}\)/u);
  assert.match(css, /bottom:\s*calc\(clamp\(116px, 18vh, 178px\) \+ 12px\)/u);
  assert.doesNotMatch(css, /latest-story-button\.is-current/u);
});

test("engine diagnostics live in the responsive settings sheet", () => {
  assert.match(nexusShellState, /type SettingsTab = [^;]*"connection"[^;]*"engine"/u);
  assert.match(page, /<span>엔진 구성<\/span>/u);
  assert.match(page, /Lotus/u);
  assert.match(page, /<CortexPlayer/u);
  assert.match(page, /Cortex 1\.42\.0/u);
  assert.match(page, /엔진별 기록은 독립적으로 보존/u);
  assert.match(page, /본문 우선 실시간 스트리밍/u);
  assert.match(page, /CORTEX_PROSE_WRITER_V1/u);
  assert.match(page, /누적 원문 → 종결조건 확인/u);
  assert.doesNotMatch(page, /공개 본문 → Turn Delta/u);
  assert.match(page, /요건 판정 · 조기 종결 · 봉인/u);
  assert.match(page, /Cortex ScenarioPack/u);
  assert.match(css, /\.runtime-engine-selector\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /\.engine-settings-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /@media \(max-width: 640px\)\s*\{[\s\S]*?\.runtime-engine-selector\s*\{\s*grid-template-columns:\s*1fr/u);
});

test("focused Dancheong reader keeps primary play visible and folds secondary session tools", () => {
  assert.match(page, /className="reader-tools-menu"/u);
  assert.match(page, /필요할 때만 펼치는 도구/u);
  assert.match(css, /v1\.10\.0 · Focused Dancheong reader/u);
  assert.match(css, /--dancheong-green:\s*#245b4a/u);
  assert.match(css, /\.app-shell \.topbar::before/u);
  assert.match(css, /\.app-shell \.composer-wrap::before/u);
  assert.match(css, /\.app-shell \.user-choice\s*\{[^}]*border-left:\s*4px solid var\(--dancheong-green\)/u);
  assert.match(css, /\.reader-tools-popover\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /\.reader-tools-popover\.reader-tools-portal\s*\{[^}]*position:\s*fixed/u);
  assert.match(css, /\.reader-tools-popover\[hidden\]\s*\{\s*display:\s*none !important/u);
  assert.match(css, /\.app-shell \.topbar\s*\{[^}]*overflow:\s*visible/u);
  assert.match(css, /width:\s*min\(272px, calc\(100vw - 28px\)\)/u);
  assert.match(css, /\.reader-tools-popover \.settings-icon-button\s*\{[^}]*min-height:\s*36px/u);
});

test("failed scene plans expose a struck-through developer diagnostic with exact leak reasons", () => {
  assert.match(page, /실패한 장면 계획 보기/u);
  assert.match(page, /FAILED SCENE PLAN/u);
  assert.match(css, /failed-scene-plan-preview/u);
  assert.match(css, /text-decoration-line:\s*line-through/u);
  assert.match(simulateRoute, /장면 계획에서 공개 전 보호 정보/u);
  assert.match(simulateRoute, /draftKind:\s*"scene_plan"/u);
});

test("실패 본문은 같은 입력을 계획 우선 경로로 다시 집필할 수 있다", () => {
  assert.match(page, /작업계획 구상 후 집필/u);
  assert.match(page, /generationMode:\s*"instant"\s*\|\s*"planned_recovery"/u);
  assert.match(page, /handleAdvance\(retry\.advanceMode,\s*"planned_recovery"/u);
  assert.match(page, /failedDraft\.draftKind !== "scene_plan"/u);
  assert.match(page, /recoveryExhausted/u);
  assert.match(page, /이탈 또는 시간·장소의 큰 도약으로 인해 사건을 정사로 편입하지 못했습니다/u);
  assert.match(page, /직전 턴으로 되돌리기/u);
});

test("event inspector exposes manual beat controls and explanatory sealed cards in both themes", () => {
  assert.match(page, /<InspectorEvents/u);
  assert.match(eventPanel, /현재 비트 \{currentBeat\}\/\{ledger\.beatTotal\}/u);
  assert.match(eventPanel, /종결 전용 연장 비트/u);
  assert.match(eventPanel, /종결 연장/u);
  assert.match(eventPanel, /비트 \+1/u);
  assert.match(eventPanel, /지금 종결/u);
  assert.match(eventPanel, /종결 사유/u);
  assert.match(eventPanel, /sealedClosureNarrative/u);
  assert.match(eventPanel, /이전 장면에서 이어진 일/u);
  assert.match(eventPanel, /첫 종결 거부로 자동 이월/u);
  assert.match(eventPanel, /현재 세계선에서 포기/u);
  assert.match(eventPanel, /sealed\.status === "carried_over"/u);
  assert.match(eventPanel, /연속 종결 잠금/u);
  assert.match(eventPanel, /후속 장면에서 이어진 결과/u);
  assert.match(css, /\.event-manual-controls\s*\{/u);
  assert.match(css, /\.nexus-event-row\.event-sealed\s*\{/u);
  assert.match(css, /\.sealed-event-stamp\s*\{/u);
  assert.match(css, /\.theme-dark \.event-manual-controls button\s*\{/u);
  assert.match(css, /\.theme-dark \.nexus-event-row\.event-sealed\s*\{/u);
  assert.match(css, /\.theme-dark \.sealed-event-explanation\s*\{/u);
  assert.match(css, /\.theme-dark \.event-carryover-card\s*\{/u);
  assert.match(css, /\.theme-dark \.sealed-carryover-resolution\s*\{/u);
});

test("mobile settings becomes a full-width single-column sheet with horizontal tabs", () => {
  assert.match(css, /@media \(max-width: 640px\)\s*\{[\s\S]*?\.settings-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/u);
  assert.match(css, /@media \(max-width: 640px\)\s*\{[\s\S]*?\.settings-tabs\s*\{[\s\S]*?display:\s*flex;[\s\S]*?overflow-x:\s*auto/u);
  assert.match(css, /\.settings-content\s*\{[\s\S]*?-webkit-overflow-scrolling:\s*touch/u);
});

test("the built-in academy demo is restored and autosaved on this device", () => {
  assert.match(page, /DEMO_SESSION_STORAGE_KEY = "relay-nexus-demo-session-instant-v1"/u);
  assert.match(page, /packageFingerprint: "built-in-demo-instant-v1"/u);
  assert.match(page, /localStorage\.setItem\(DEMO_SESSION_STORAGE_KEY, snapshotJson\)/u);
  assert.match(page, /savedDemo[\s\S]*?JSON\.parse\(savedDemo\) as SavedSession/u);
});

test("Story Hub searches Core only on page load or an explicit refresh", () => {
  assert.doesNotMatch(libraryHome, /setInterval\([^)]*refreshHub|setInterval\(refreshHub/u);
  assert.doesNotMatch(libraryHome, /visibilitychange|refreshWhenVisible/u);
  assert.match(libraryHome, /void refreshHub\("initial"\)/u);
  assert.match(libraryHome, /hubWorks\.length > 1 \? "has-multiple" : "has-single"/u);
  assert.match(libraryHome, /목록 새로고침 ↻/u);
  assert.match(css, /\.hub-work-grid\.has-multiple\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /\.hub-work-grid\.has-multiple \.hub-work:first-child\s*\{[^}]*grid-column:\s*1 \/ -1/u);
  assert.match(hubCatalogRoute, /relayCoreRequestHeaders\(\)/u);
  assert.match(hubCatalogRoute, /private, no-store, max-age=0/u);
  assert.doesNotMatch(hubCatalogRoute, /\$\{work\.slug\}\.png/u);
});

test("메인 공개 목록은 너름으로 표시하고 기성학원 데모를 제외한다", () => {
  assert.match(libraryHome, /<p>DANCHEONG NEOREUM<\/p><h2>너름 공개작<\/h2>/u);
  assert.doesNotMatch(libraryHome, /<p>STORY HUB<\/p>/u);
  assert.match(hubCatalogRoute, /HIDDEN_CATALOG_SLUGS\.has\(slug\)/u);
  assert.match(hubCatalogRoute, /source: "bundled-cache", works: \[\]/u);
});

test("메인 화면은 지음 제작 흐름과 기존 Studio 앵커를 제공한다", () => {
  assert.match(libraryHome, /id="studio"/u);
  assert.match(libraryHome, /만들고 싶은 스토리를 설명해 주세요/u);
  assert.match(libraryHome, /href="\/jieum"/u);
  assert.match(libraryHome, /id="jieum"/u);
  assert.match(libraryHome, /세계와 인물을 설계/u);
  assert.match(css, /\.studio-gateway\s*\{/u);
});

test("메인 화면은 단청 스타일의 멀티플레이 진입 영역을 제공한다", () => {
  assert.match(libraryHome, /id="play-together"/u);
  assert.match(libraryHome, /<h2>여럿이서 같이 즐겨요<\/h2>/u);
  assert.match(libraryHome, /한 명의 주인공과 하나의 정사를 공유/u);
  assert.match(libraryHome, /href="\/multiplayer#public-rooms"/u);
  assert.match(libraryHome, /href="\/multiplayer#create-room"/u);
  assert.match(libraryHome, /LIVE RELAY/u);
  assert.match(multiplayerPage, /id="create-room"/u);
  assert.match(multiplayerPage, /id="public-rooms"/u);
  assert.match(css, /\.multiplayer-gateway\s*\{/u);
  assert.match(css, /\.multiplayer-dancheong-band i:nth-child\(2\)[^{]*\{[^}]*#d45638/u);
  assert.match(css, /\.multiplayer-gateway-copy h2\s*\{[^}]*white-space:\s*nowrap/u);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.multiplayer-gateway-copy h2\s*\{[^}]*font-size:\s*clamp\(28px, 8vw, 38px\)/u);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.multiplayer-gateway-actions\s*\{[^}]*grid-template-columns:\s*1fr/u);
});

test("로그인한 메인 화면은 설정 옆에 계정 로그아웃 동작을 제공한다", () => {
  assert.match(page, /signOutHref=\{account\?\.authenticated/);
  assert.match(siteNav, /className="library-signout"[\s\S]*?aria-label="로그아웃"/u);
  assert.match(css, /\.library-settings, \.library-signout[\s\S]*?width: 40px/u);
});

test("Home의 긴 작품 제목은 데스크톱 한 줄 우선 크기로 축소된다", () => {
  assert.match(libraryHome, /extra-long-title/u);
  assert.match(libraryHome, /long-title/u);
  assert.match(css, /\.continue-copy h1\s*\{[^}]*white-space:\s*nowrap/u);
  assert.match(css, /\.continue-copy h1\.long-title\s*\{[^}]*font-size:\s*clamp\(28px, 2\.6vw, 40px\)/u);
});

test("Story Hub 표지는 카드 높이를 채우도록 확대된다", () => {
  assert.match(css, /\.hub-work\s*\{[^}]*grid-template-columns:\s*180px minmax\(0, 1fr\)/u);
  assert.match(css, /\.hub-work-cover\s*\{[^}]*min-height:\s*290px;[^}]*align-self:\s*stretch/u);
});

test("모바일 Story Hub는 작품마다 한 줄을 쓰고 2대3 표지 비율과 부제 아래 장르를 유지한다", () => {
  assert.match(libraryHome, /<h3>\{work\.title\}<small>\{work\.subtitle\}<\/small><\/h3>[\s\S]*?hub-work-genre/u);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.hub-work-grid\.has-multiple\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/u);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.hub-work-cover\s*\{[^}]*aspect-ratio:\s*2 \/ 3/u);
});

test("Story Hub 설치는 표지를 작품과 함께 내 서재에 영구 저장한다", () => {
  assert.match(page, /downloadHubCoverFile\(work\.coverUrl, work\.title\)/u);
  assert.match(page, /toBlob\([\s\S]*?"image\/webp", 0\.84/u);
  assert.match(page, /outputType === "image\/webp"/u);
  assert.match(page, /`work-thumbnail\.\$\{outputExtension\}`/u);
  assert.match(page, /form\.append\("thumbnail", projectThumbnail\)/u);
  assert.match(projectImportRoute, /INSERT INTO project_thumbnails/u);
  assert.match(projectImportRoute, /source: "story-hub"/u);
  assert.match(libraryHome, /!installed \|\| installed\.thumbnailUrl/u);
  assert.match(libraryHome, /onRestoreHubCover\(work, installed\)/u);
});

test("작품 관리 설정은 Story Hub의 기기 Cortex 설치본도 계정 작품과 합쳐 보여준다", () => {
  assert.match(page, /const deviceCortexRows = useCortexCatalog\(\)/u);
  assert.match(runtimeEngineHook, /setRows\(readCortexCatalog\(\)\)/u);
  assert.match(runtimeEngineHook, /window\.addEventListener\(CORTEX_CATALOG_CHANGED, refresh\)/u);
  assert.match(page, /\.\.\.deviceCortexProjects\.map\(\(project\) => \(\{ project, deviceOnly: true \}\)\)/u);
  assert.match(page, /너름 설치 · 이 기기의 원본 ZIP/u);
  assert.match(page, /onDeleteCortexProject\(project\)/u);
});

test("메인 하단 변경 내역은 현재 Cortex와 Flare 구성을 안내한다", () => {
  assert.match(libraryHome, /Cortex 1\.42\.0 · 공개 본문 우선/u);
  assert.match(libraryHome, /실시간 대사 카드와 모바일 도구/u);
  assert.match(libraryHome, /GPT-Image 2\.5 Flare 이미지 경로/u);
  assert.doesNotMatch(libraryHome, /Cortex 1\.7\.0 연속성 그래프/u);
});

test("source export excludes secrets, dependencies, build output, and itself", () => {
  assert.match(exportScript, /baseName\.startsWith\("\.env"\)/u);
  assert.match(exportScript, /"node_modules"/u);
  assert.match(exportScript, /"dist"/u);
  assert.match(exportScript, /public\/downloads/u);
  assert.match(exportScript, /baseName\.endsWith\("\.tsbuildinfo"\)/u);
});
