import {createCuePlayer,createPortraitContinuity} from '../cortex-vn-cue-player.mjs?v=e0d140d50b0f';
import {createStageBlocking,lightingGrade,deliveryNotes} from '../cortex-vn-performance.mjs?v=e0d140d50b0f';
import {createFoley} from '../cortex-vn-foley.mjs?v=e0d140d50b0f';
import {createPlaybackContext as createFoleyContext} from './vn-media-session.mjs?v=e0d140d50b0f';
import { updateStoryClock } from '../cortex-vn-clock.mjs?v=e0d140d50b0f';
import { createQualityReferenceLoader, readWorkArt, writeWorkArt, workPortrait, readPortraitReplacement, writePortraitReplacement } from './vn-character-art.mjs?v=e0d140d50b0f';
import { backgroundFor, pagesForTurn, createPageCollector } from './vn-core.mjs?v=e0d140d50b0f';
import { loadDeviceKeys, storeDeviceKeys, changedDeviceKeys } from './vn-key-vault.mjs?v=e0d140d50b0f';
import { imageRoutingKey, readImageRouting, imageProviderFor } from './vn-image-routing.mjs?v=e0d140d50b0f';
import { storageProblem, submitEngineTurn, pendingAdjudication, retryAdjudication } from './vn-progress.mjs?v=e0d140d50b0f';
import { createAutoRecovery, retryVerdict } from './vn-recovery.mjs?v=e0d140d50b0f';
import { optimizeWorkImages } from './vn-image-storage.mjs?v=e0d140d50b0f';
import { captureScene, sceneVersion } from './vn-scene.mjs?v=e0d140d50b0f';
import { continueEnvironment, createEnvironmentContinuity } from './vn-environment.mjs?v=e0d140d50b0f';
const environmentContinuity = createEnvironmentContinuity();
import { loadWorkPresentation } from './vn-public-cast.mjs?v=e0d140d50b0f';
import { createStageAssets, readAsset, writeAsset, imageProviders, imageNotice, eventSceneSetting } from './vn-assets.mjs?v=e0d140d50b0f';
import { installCostMeter } from './vn-costs.mjs?v=e0d140d50b0f';
import { createCastDirector } from './vn-cast.mjs?v=e0d140d50b0f';
import { publishedUnit, dialogueWait, createDialogueGrace, resolvedSpeaker, preparationPages, createPreparationQueue, prepareAhead, preparationTier } from './vn-stage-timing.mjs?v=e0d140d50b0f';
import { pageKey, pageText, readingFrame, reconcileCursor, reconcileReadThrough, nextPlaybackStep, createTextRevealer, createTextWaitTracker, readDelay } from './vn-reader.mjs?v=e0d140d50b0f';
import { fullAutoStep, fullAutoVisuals, storyComplete, createContinuationGate } from './vn-autoplay.mjs?v=e0d140d50b0f';
import { directionAt, transitionFor, createSound } from './vn-direction.mjs?v=e0d140d50b0f';
import { stageOrder, stagePositions, slotWidth, speakerHue, weatherFor, lightFor, mergeDirection, recordMet } from './vn-stage.mjs?v=e0d140d50b0f';
import { projectStature } from './vn-stature.mjs?v=e0d140d50b0f';
import { useMediaPlayback } from './vn-media-session.mjs?v=e0d140d50b0f';
import { displaySprite, clearSpriteMemory } from './vn-sprite.mjs?v=e0d140d50b0f';
import { setDisplayImage, holdDisplay } from './vn-display-memory.mjs?v=e0d140d50b0f';
import { createAmbience, ambienceFor } from './vn-audio.mjs?v=e0d140d50b0f';
import { createScore } from './vn-music.mjs?v=e0d140d50b0f';
import { createMusicDirection, musicSeed } from './vn-music-direction.mjs?v=e0d140d50b0f';
import { createVoice, voiceLine, readingVoiceLine, voiceOptions, narratorOptions, castVoices, ttsProvider, TTS_PROVIDERS, GEMINI_VOICES, voiceFamily, defaultNarrator, setTypecastVoices, typecastVoices } from './vn-voice.mjs?v=e0d140d50b0f';
import { createVoicePlayer } from './vn-voice-post.mjs?v=e0d140d50b0f';
import { fetchTypecastCatalog } from './vn-typecast-connection.mjs?v=e0d140d50b0f';
import { createTypecastTransport } from './vn-typecast-direct.mjs?v=e0d140d50b0f';
import { createVoiceCredits, TYPECAST_CREDIT, TYPECAST_URL } from './vn-voice-credits.mjs?v=e0d140d50b0f';
import { prepareMotionFrames } from './vn-motion.mjs?v=e0d140d50b0f';
import { motionFrameFor } from './vn-motion-playback.mjs?v=e0d140d50b0f';
import { createBlinker, createMouth, breathDelay } from './vn-actor-life.mjs?v=e0d140d50b0f';
import { faceComposite } from './vn-face-compose.mjs?v=e0d140d50b0f';
import { typeset, renderTypeset, TYPEFACES, loadTypeface } from './vn-typeset.mjs?v=e0d140d50b0f';
import { createCinema } from './vn-cinema.mjs?v=e0d140d50b0f';
import { compositionFor, createCueWindow, createArtContinuity, createCompositionContinuity } from './vn-storyboard.mjs?v=e0d140d50b0f';
import { createWorkMusic, createMusicSettings, musicKey, musicMoods, licensedTrack } from './vn-work-music.mjs?v=e0d140d50b0f';
import { createSlotStore, makeSlot, capturePresentation, applyPresentation, activateSlot, recoverSlotLoad, withSlotLock, QUICK_SLOT } from './vn-saves.mjs?v=e0d140d50b0f';
import { createGalleryDialog, galleryImages } from './vn-gallery.mjs?v=e0d140d50b0f';
import { createSaveDialog } from './vn-save-ui.mjs?v=e0d140d50b0f';
import { requestDurableStorage, withMediaTask, withMediaMaintenance, setMediaPaused, mediaPaused, removeWorkMedia, isMediaStorageEvent, workAssets } from './vn-storage.mjs?v=e0d140d50b0f';
import { createStoragePanel } from './vn-storage-ui.mjs?v=e0d140d50b0f';
import { readBackup, exportSlotFile, storeImportedSlot, restoreSlotMedia } from './vn-backup.mjs?v=e0d140d50b0f';
import { readEventProgress } from './vn-event-progress.mjs?v=e0d140d50b0f';
import { createEventProgressDialog } from './vn-event-progress-ui.mjs?v=e0d140d50b0f';
import { prepareNewGame, createNewGameDialog } from './vn-new-game.mjs?v=e0d140d50b0f';
import { createEditionStore, catalogRevision } from './vn-editions.mjs?v=e0d140d50b0f';
import { editionScope, snapshotEdition, editionId } from './vn-edition-key.mjs?v=e0d140d50b0f';
import { createEditionDialog } from './vn-edition-ui.mjs?v=e0d140d50b0f';
import { createAccountMenu } from './vn-account.mjs?v=e0d140d50b0f';
import { createCloudDialog } from './vn-cloud-ui.mjs?v=e0d140d50b0f';
import { inspectWork, createHealthDialog } from './vn-health.mjs?v=e0d140d50b0f';
import { diagnostics } from './vn-diagnostics.mjs?v=e0d140d50b0f';
import { framingFor, framingControls } from './vn-framing.mjs?v=e0d140d50b0f';

const activeKey = 'dancheong-ln-active-work-v1';
const nexusBase = location.origin;
const host = window.NexusVNHostBridge;
const apiBase = `${location.origin}/api/vn/openai`;
const providerKey = 'dancheong-ln-text-provider-v1';
const effortKey = 'dancheong-ln-muse-effort-v1';
const providerModels = { openai: 'gpt-6-luna', muse: 'muse-spark-1.3-contributor', 'go-luna': 'gpt-6-luna' };
const root = document.createElement('div');
root.id = 'vn-root';
root.innerHTML = `
  <header class="vn-topbar">
    <button class="vn-brand" id="vn-home" type="button"><span class="vn-brand-mark">丹</span><span><strong>단청</strong><small>LIGHT NOVEL SIMULATOR</small></span><span class="vn-home-label">← 메인화면</span></button>
    <div id="vn-story-clock" class="vn-story-clock" role="timer" aria-live="off" aria-label="작중 시간"><span>작중 시간</span><strong>시간 미정</strong></div>
    <span class="vn-top-title" id="vn-top-title">작품을 선택하세요</span>
    <div id="vn-account"></div>
    <button id="vn-menu-toggle" class="vn-menu-toggle" type="button" aria-label="메뉴 열기" aria-expanded="false"><span></span><span></span><span></span></button>
    <nav aria-label="주 메뉴"><a href="${nexusBase}/neoreum" target="_blank" rel="noopener noreferrer">너름</a><a href="${nexusBase}/jieum" target="_blank" rel="noopener noreferrer">지음</a><button id="vn-history-toggle" type="button">기록</button><button id="vn-settings" type="button">설정</button></nav>
  </header>
  <main>
    <section id="vn-library" class="vn-library" aria-labelledby="vn-library-title">
      <div class="vn-library-hero"><span class="vn-kicker">DANCHEONG · LIGHT NOVEL</span><h1 id="vn-library-title">작품 선택</h1><p>너름에 출간된 작품을 골라 장면 속에서 이어가세요.</p><span class="vn-library-count" id="vn-library-count">작품을 불러오는 중…</span></div>
      <button id="vn-library-slots" class="vn-slot-open" type="button">저장·불러오기</button>
      <div class="vn-library-grid" id="vn-library-grid"></div>
      <footer class="vn-library-footer"><a href="/downloads/dancheong-light-novel-source.zip" download>전체 소스코드 ZIP 다운로드 <span aria-hidden="true">↓</span></a><span>v13.19.0 · 실행 안내 포함</span></footer>
    </section>
    <section id="vn-title" class="vn-title" aria-labelledby="vn-title-name" hidden>
      <div class="vn-title-art" id="vn-title-art"></div><div class="vn-title-shade"></div>
      <div class="vn-title-body"><span class="vn-kicker" id="vn-title-kicker">DANCHEONG · LIGHT NOVEL</span><h1 id="vn-title-name">작품</h1><p id="vn-title-sub"></p>
        <div class="vn-title-menu"><button id="vn-title-start" type="button">이어하기</button><button id="vn-title-new" type="button">새로하기</button><button id="vn-title-slots" type="button">저장·불러오기</button><button id="vn-title-cast" type="button">만난 인물</button><button id="vn-title-settings" type="button">설정</button><button id="vn-title-library" type="button">작품 목록</button></div></div>
      <div class="vn-title-cast" id="vn-title-cast-panel" hidden><div class="vn-title-cast-head"><strong>만난 인물</strong><button id="vn-title-cast-close" type="button">닫기 ×</button></div><div id="vn-title-cast-list" class="vn-title-cast-list"></div></div>
    </section>
    <section id="vn-stage" class="vn-stage" aria-label="비주얼노벨 플레이" hidden>
      <div class="vn-background vn-background-a is-active" id="vn-background-a"></div><div class="vn-background vn-background-b" id="vn-background-b"></div><div class="vn-background-shade"></div><div class="vn-scene-cut" id="vn-scene-cut" aria-hidden="true"></div>
      <div class="vn-scene-head"><span class="vn-kicker" id="vn-work-label">DANCHEONG</span><div><strong id="vn-scene-title">현재 장면</strong><small id="vn-scene-place">—</small></div><span class="vn-scene-counter" id="vn-scene-counter">OPENING</span></div>
      <div id="vn-characters" class="vn-characters" aria-label="현장 인물"></div>
      <div class="vn-play-area">
        <div class="vn-dialogue-box" id="vn-dialogue-box" tabindex="0" aria-label="다음 문장으로 진행">
          <div class="vn-dialogue-head"><span id="vn-speaker">이야기</span><span id="vn-page-count">01 / 01</span></div>
          <p id="vn-dialogue-text"></p>
          <div id="vn-dialogue-wait" class="vn-dialogue-wait" role="status" hidden><span>대사에 등장할 인물을 준비하고 있습니다…</span><button id="vn-dialogue-bypass" type="button">이미지 없이 읽기</button></div>
          <div class="vn-dialogue-bottom"><button id="vn-prev" type="button" aria-label="이전 문장">← 이전</button><span id="vn-image-status">장면 준비 중</span><button id="vn-next" type="button">다음 →</button></div>
        </div>
        <div class="vn-action-panel" id="vn-actions" hidden><div class="vn-choice-title"><span>선택</span><h2>다음 행동</h2></div><div id="vn-suggestions" class="vn-suggestions"></div><button id="vn-custom-toggle" class="vn-custom-toggle" type="button">직접 행동이나 대사 입력 <span>＋</span></button><div class="vn-compose" id="vn-compose" hidden><textarea id="vn-input" rows="2" maxlength="4000" placeholder="주인공의 행동이나 대사를 입력하세요"></textarea><button id="vn-send" type="button">진행</button></div><div class="vn-action-footer"><button id="vn-continue" type="button">장면 이어가기</button><button id="vn-retry-image" type="button" hidden>배경 다시 생성</button></div></div>
      </div>
    </section>
  </main>
  <aside class="vn-history" id="vn-history" hidden aria-label="읽은 기록"><div class="vn-history-head"><strong>읽은 기록</strong><button id="vn-history-close" type="button">닫기 ×</button></div><div id="vn-history-list"></div></aside>
  <dialog id="vn-settings-dialog" class="vn-settings-dialog" aria-labelledby="vn-settings-title"><form method="dialog"><header><span class="vn-kicker">CONNECTION</span><h2 id="vn-settings-title">연결 설정</h2><button id="vn-settings-close" type="button" aria-label="설정 닫기">×</button></header><fieldset class="vn-provider-grid"><legend>본문 생성 모델</legend><label><input type="radio" name="vn-provider" value="openai"><strong>GPT 6 Luna</strong><span>OpenAI API 키</span></label><label><input type="radio" name="vn-provider" value="muse"><strong>Muse Spark 1.3 Contributor</strong><span>OpenCode Go</span></label><label><input type="radio" name="vn-provider" value="go-luna"><strong>GPT 6 Luna</strong><span>OpenCode Go</span></label></fieldset><div class="vn-settings-fields"><label>OpenAI API 키 <small>장면 배경 생성 · OpenAI 본문 모드</small><input id="vn-openai-key" type="password" autocomplete="off" placeholder="OpenAI API 키"></label><label>OpenCode Go API 키 <small>Muse / Go Luna 본문 모드</small><input id="vn-go-key" type="password" autocomplete="off" placeholder="OpenCode Go API 키"></label><label> Muse 추론 강도 <select id="vn-muse-effort"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>문체 지침 <textarea id="vn-style-guide" rows="3" placeholder="작품에 적용할 추가 문체 지침"></textarea></label><div class="vn-settings-row"><label>본문 표시 속도 <select id="vn-typing-speed"><option value="natural">자연스럽게</option><option value="slow">천천히</option><option value="fast">빠르게</option><option value="instant">즉시</option></select></label><label>이미지 품질 <select id="vn-image-quality"><option value="low">Low</option><option value="medium">Medium</option></select></label></div></div><p class="vn-settings-help">도입 장면과 확정된 새 장면마다 배경 이미지를 자동 생성합니다. 이미지에는 OpenAI API 사용료가 발생합니다. 키는 이 브라우저 기기에 암호화해 보관합니다.</p><div class="vn-settings-footer"><button id="vn-settings-cancel" type="button">취소</button><button id="vn-settings-save" type="button">저장</button></div></form></dialog>
  <div class="vn-toast" id="vn-toast" role="status" aria-live="polite"></div>`;
root.hidden = true; document.body.prepend(root);
const textSurface = document.createElement('div'); textSurface.id = 'vn-dialogue-text';
document.getElementById('vn-dialogue-text').replaceWith(textSurface);
const visual = document.createElement('div'); visual.id = 'vn-scene-visual'; visual.className = 'vn-scene-visual';
// Backdrop zoom (camera) and the slow background drift are separate layers so
// neither transition overrides the other.
const backdrop = document.createElement('div'); backdrop.className = 'vn-backdrop';
backdrop.append(root.querySelector('#vn-background-a'), root.querySelector('#vn-background-b'));
const weatherLayer = document.createElement('div'); weatherLayer.className = 'vn-weather'; weatherLayer.setAttribute('aria-hidden', 'true');
visual.append(backdrop, root.querySelector('.vn-background-shade'), root.querySelector('#vn-characters'), weatherLayer);
root.querySelector('#vn-stage').prepend(visual);
const flashLayer = document.createElement('div'); flashLayer.className = 'vn-flash'; flashLayer.setAttribute('aria-hidden', 'true');
root.querySelector('#vn-scene-cut').after(flashLayer);
const stageTools = document.createElement('div'); stageTools.className = 'vn-stage-tools';
stageTools.innerHTML = '<div id="vn-scene-label" class="vn-scene-label" aria-hidden="true"></div><div id="vn-loading" class="vn-loading" role="status" hidden><span></span><strong>다음 장면을 준비하고 있습니다</strong><small>완성되면 첫 문장부터 표시됩니다</small></div><button type="button" id="vn-show-text" class="vn-show-text" hidden>본문 표시 · H</button><div class="vn-reading-controls" role="toolbar" aria-label="읽기 제어"><span id="vn-reader-position"></span><button type="button" id="vn-reader-log" title="읽은 기록 (L)">기록</button><button type="button" id="vn-auto" aria-pressed="false" title="자동 읽기 (A)">자동</button><button type="button" id="vn-skip" aria-pressed="false" title="읽은 부분만 건너뛰기 (S)">읽은 부분</button><button type="button" id="vn-hide-text" title="본문 숨기기 (H)">글 숨김</button><button type="button" id="vn-fullscreen" title="전체 화면 (F)">전체 화면</button><button type="button" id="vn-reader-settings">설정</button></div>';
root.querySelector('#vn-stage').append(stageTools);
const eyecatch = document.createElement('div'); eyecatch.className = 'vn-eyecatch'; eyecatch.hidden = true; eyecatch.setAttribute('aria-hidden', 'true');
eyecatch.innerHTML = '<span></span><strong></strong><small></small>';
root.querySelector('#vn-stage').append(eyecatch);
const slotButton = document.createElement('button'); slotButton.type = 'button'; slotButton.id = 'vn-reader-slots'; slotButton.setAttribute('aria-label', '저장·불러오기');
slotButton.innerHTML = '<span class="vn-slots-label-full">저장·불러오기</span><span class="vn-slots-label-short">저장</span>';
root.querySelector('#vn-reader-log').after(slotButton);
const quickSaveButton = document.createElement('button'); quickSaveButton.type = 'button'; quickSaveButton.id = 'vn-quick-save'; quickSaveButton.className = 'vn-quick'; quickSaveButton.textContent = 'Q.저장'; quickSaveButton.title = '퀵 세이브 (F5)';
const quickLoadButton = document.createElement('button'); quickLoadButton.type = 'button'; quickLoadButton.id = 'vn-quick-load'; quickLoadButton.className = 'vn-quick'; quickLoadButton.textContent = 'Q.불러오기'; quickLoadButton.title = '퀵 로드 (F9)';
slotButton.after(quickSaveButton, quickLoadButton);
const menuSlotButton = document.createElement('button'); menuSlotButton.type = 'button'; menuSlotButton.id = 'vn-menu-slots'; menuSlotButton.textContent = '저장·불러오기';
root.querySelector('#vn-history-toggle').after(menuSlotButton);
const progressButton = document.createElement('button'); progressButton.type = 'button'; progressButton.id = 'vn-reader-progress'; progressButton.textContent = '진행'; progressButton.setAttribute('aria-label', '사건·비트 진행상황');
slotButton.after(progressButton);
const menuProgressButton = document.createElement('button'); menuProgressButton.type = 'button'; menuProgressButton.id = 'vn-menu-progress'; menuProgressButton.textContent = '진행상황'; menuSlotButton.after(menuProgressButton);
for (const button of [progressButton, menuProgressButton]) { button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'vn-event-progress'); button.addEventListener('click', () => progressDialog.open()); }
const visualStatus = document.createElement('button'); visualStatus.type = 'button'; visualStatus.id = 'vn-visual-status'; visualStatus.className = 'vn-visual-status'; visualStatus.hidden = true;
visualStatus.append(root.querySelector('#vn-image-status')); stageTools.append(visualStatus);
visualStatus.setAttribute('aria-live', 'polite');
const choiceBack = document.createElement('button'); choiceBack.type = 'button'; choiceBack.id = 'vn-choice-back'; choiceBack.textContent = '본문으로 돌아가기'; root.querySelector('.vn-action-footer').prepend(choiceBack);
document.querySelector('.app')?.setAttribute('aria-hidden', 'true');
const settingsForm = document.querySelector('#vn-settings-dialog form');
settingsForm.querySelector('h2').textContent = '설정';
settingsForm.querySelector('.vn-kicker').textContent = 'PREFERENCES';
const settingsTabs = document.createElement('div');
settingsTabs.className = 'vn-settings-tabs'; settingsTabs.setAttribute('role', 'tablist');
// Settings tabs: connection keys and models, presentation, voice and music,
// usage and storage. Save/cancel is shared by the three editable tabs.
const SETTINGS_TABS = [['connection', '연결'], ['direction', '연출'], ['audio', '음성·음악'], ['cost', '사용량·비용'], ['storage', '저장 공간']];
settingsTabs.innerHTML = SETTINGS_TABS.map(([name, label], index) => `<button type="button" id="vn-${name}-tab" role="tab" aria-controls="vn-${name}-panel" aria-selected="${index === 0}">${label}</button>`).join('');
settingsForm.querySelector('header').after(settingsTabs);
const connectionPanel = document.createElement('div'); connectionPanel.id = 'vn-connection-panel'; connectionPanel.setAttribute('role', 'tabpanel'); connectionPanel.setAttribute('aria-labelledby', 'vn-connection-tab');
for (const selector of ['.vn-provider-grid', '.vn-settings-fields', '.vn-settings-help', '.vn-settings-footer']) connectionPanel.append(settingsForm.querySelector(selector));
connectionPanel.querySelector('.vn-settings-help').textContent = '공개된 문단에서 현장 인물과 다음 대사의 이미지를 미리 준비합니다. 인물이 늦으면 턴당 최대 5초만 기다린 뒤 글을 먼저 보여 주고, 준비되는 대로 인물을 표시합니다. 확인 전 화자 이름은 비워 둡니다. 같은 장소의 시간대 변경은 저장된 배경을 참조해 구조를 유지합니다. 인물 배치 확인에는 GPT 6 Luna(Muse 선택 시 Muse)를 사용합니다. 호출별 비용은 사용량·비용에 기록하고 API 키는 이 기기에 암호화해 보관합니다.';
const imageProviderFields = document.createElement('fieldset');
imageProviderFields.className = 'vn-image-routing';
imageProviderFields.innerHTML = '<legend>이미지 생성 모델</legend><div class="vn-image-routing-grid"><label for="vn-background-provider"><strong>배경</strong><small>장소·풍경·사건</small><select id="vn-background-provider"><option value="openai">OpenAI 2.5 Flare</option><option value="gemini">Nano Banana 2</option></select></label><label for="vn-character-provider"><strong>인물·표정</strong><small>캐릭터·표정 변화</small><select id="vn-character-provider"><option value="openai">OpenAI 2.5 Flare</option><option value="gemini">Nano Banana 2</option></select></label></div><p class="vn-image-routing-help">사건이 담긴 배경도 배경 모델을 사용합니다. 선택은 새로 생성하는 이미지부터 적용되며, 기존 이미지는 재사용합니다.</p>';
connectionPanel.querySelector('.vn-provider-grid').after(imageProviderFields);
const geminiKeyField = document.createElement('label');
geminiKeyField.innerHTML = 'Gemini API 키 <small>Nano Banana 2 이미지 · Lyria 배경음악 · Gemini 3.8 음성에 사용합니다</small><input id="vn-gemini-key" type="password" autocomplete="off" maxlength="512" placeholder="Google AI Studio에서 발급한 API 키"><a class="vn-key-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Gemini API 키 발급 ↗</a>';
connectionPanel.querySelector('#vn-openai-key').closest('label').after(geminiKeyField);
connectionPanel.querySelector('#vn-openai-key').closest('label').querySelector('small').textContent = 'GPT 이미지 · OpenAI 본문 모드';
const imageQualityHelp = document.createElement('small'); imageQualityHelp.id = 'vn-image-quality-help';
connectionPanel.querySelector('#vn-image-quality').after(imageQualityHelp);
const readingFields = document.createElement('fieldset'); readingFields.className = 'vn-reading-settings';
readingFields.innerHTML = '<legend>읽기·연출</legend><div class="vn-settings-fields"><div class="vn-settings-row"><label>본문 배치<select id="vn-reading-layout"><option value="nvl">NVL · 화면 위에 누적</option><option value="adv">ADV · 하단 대화창</option></select></label><label>자동 읽기 간격<select id="vn-auto-pace"><option value="normal">보통</option><option value="slow">여유롭게</option><option value="fast">빠르게</option></select></label></div><div class="vn-settings-row"><label>본문 크기<select id="vn-font-size"><option value="normal">기본</option><option value="large">크게</option></select></label><label>본문 글꼴<select id="vn-typeface">' + Object.entries(TYPEFACES).map(([id, row]) => `<option value="${id}">${row.label}</option>`).join('') + '</select></label><label>화면 움직임<select id="vn-motion"><option value="full">장면에 맞게</option><option value="reduced">최소화</option></select></label></div><div class="vn-settings-row"><label>조작 효과음<select id="vn-sound"><option value="off">끔</option><option value="on">켬</option></select></label><label>환경음·분위기음<select id="vn-ambience"><option value="off">끔</option><option value="on">켬</option></select></label></div><div class="vn-settings-row"><label>사건 장면 연출<select id="vn-cg-setting"><option value="on">자동 · 중요한 동작과 사건</option><option value="off">끔 · 풍경과 인물만</option></select></label></div><label>이 작품의 그림체 지침 <small>비워 두면 기본 그림체를 사용합니다. 입력하면 이 작품의 배경·인물을 새 그림체로 다시 만듭니다(이미지 비용 발생).</small><textarea id="vn-art-style" rows="2" maxlength="600" placeholder="예: 수채화 질감, 가는 선, 채도 낮은 파스텔 톤"></textarea></label></div><p class="vn-settings-help">클릭·Space 다음 / ← 이전 / A 자동 / S 읽은 부분 / L 기록 / H 본문 숨김 / F 전체 화면. 자동 읽기는 선택지와 새 장면 생성 앞에서 멈춥니다. 표정은 뚜렷한 감정 변화 때만 본문 상황을 읽고 자연스럽게 새로 그리며, 풍경은 장소·시간대·날씨가 바뀔 때 재사용 여부를 확인합니다. 같은 인물의 적합한 표정은 저장된 이미지를 먼저 재사용합니다. 인물은 세밀한 선·눈·머리카락·재질 묘사를 글로 지정하며, 다른 작품의 인물 이미지는 보내지 않습니다. 이미 저장된 기본 입상은 유지합니다. 만난 인물에서 기본 입상을 고정할 수 있고, 같은 인물·표정은 재사용합니다. 평소에는 기본 복장을 유지하며, 실제 물놀이·취침·행사 등 본문 상황에 맞춰 복장을 바꿉니다. 복장별 입상과 표정을 저장해 다시 쓰고, 일상으로 돌아오면 기본 복장을 재사용합니다(처음 필요한 복장·표정 생성 시 비용 발생). 중요한 공격·충돌·사물의 변화는 사건 장면으로 보여줍니다. 이미 공개된 가까운 문단에서 미리 준비하며, 해당 순간부터 배경 자체를 사건이 담긴 이미지로 교체합니다. 사건 배경에 그려진 참여 인물의 입상만 숨기고 목격자 입상은 유지합니다. 사건 연출은 기본 꺼짐이며 기존 선택을 유지합니다. 평범한 대화에는 생성하지 않고 문단당 최대 1장만 생성·재사용합니다(이미지 비용 추가).</p>';
connectionPanel.querySelector('.vn-settings-help').before(readingFields);
const guideField = document.createElement('label');
guideField.textContent = '이 작품의 인물 묘사 기준 이미지';
const guideSelect = document.createElement('select'); guideSelect.id = 'vn-quality-guide';
const guideHelp = document.createElement('small'); guideHelp.textContent = '기본은 사용 안 함입니다. 이 작품에서 만난 인물의 저장된 기본 입상만 선택할 수 있습니다. 선택한 이미지는 새 입상의 묘사 참고로 전달되어 입력 비용이 추가될 수 있습니다. 기존 이미지는 다시 만들지 않습니다.';
guideField.append(guideSelect, guideHelp); readingFields.querySelector('.vn-settings-fields').append(guideField);
settingsForm.append(connectionPanel);
const presentationFields = document.createElement('fieldset'); presentationFields.className = 'vn-reading-settings';
presentationFields.innerHTML = `<legend>추가 연출 · 베타</legend><div class="vn-settings-fields"><label>비주얼노벨 화면 연출<select id="vn-cinema-setting"><option value="on">켬 · 무늬 전환 / 무료 컷인 / 강조 / 장면 카드</option><option value="off">끔</option></select></label><small>저장된 입상을 잘라 쓰는 컷인과 화면 효과에는 이미지 생성 비용이 들지 않습니다. 움직임 최소화를 선택하면 전환·떨림·카메라 이동을 생략합니다.</small>
  <div class="vn-settings-row"><label>추가 구도·자세 생성<select id="vn-drawn-shots"><option value="off">끔</option><option value="on">켬 · 구도 / 자세 / 시선 · 추가 비용</option></select></label><label>눈 깜빡임·입 움직임<select id="vn-actor-motion"><option value="off">끔</option><option value="masked">실험 · OpenAI 눈·입 마스크 편집</option></select></label></div>
  <label>표정이 바뀔 때<select id="vn-face-compose"><option value="off">그림 전체 교체 · 기본</option><option value="on">얼굴만 합성 · 실험 (몸·옷이 정확히 겹칠 때만)</option></select></label>
  <small>얼굴만 합성은 새 표정 그림이 기본 입상과 몸·옷·윤곽이 거의 같을 때만 얼굴 부분을 기본 입상 위에 부드럽게 합칩니다. 겹치지 않거나 경계가 드러날 것 같으면 새 그림을 그대로 보여 줍니다. 추가 비용은 없습니다.</small>
  <small>추가 이미지는 기본 꺼짐입니다. 구도는 중요한 순간에 문단당 최대 1장, 움직임은 인물·복장·표정당 최대 2장을 만들고 재사용합니다. 움직임은 OpenAI 인물 모델에서만 실험할 수 있습니다. 눈·입 위치가 불확실하면 생성하지 않으며, 기존 프레임도 정렬을 다시 검사합니다. 움직임 첫 사용 시 윤곽 검사 파일을 내려받습니다. 생성된 이미지 비용은 발생합니다.</small>
  <div class="vn-settings-row"><label>장면 배경음악·효과음<select id="vn-music"><option value="off">끔</option><option value="tracks">켬 · 작품 음원</option><option value="on">켬 · 기기에서 합성</option></select></label><label>음악 크기<input id="vn-music-volume" type="range" min="0" max="100" step="1"></label></div>
  <div class="vn-settings-row"><label>AI 대사 음성<select id="vn-voice-setting"><option value="off">OFF · 끔</option><option value="on">ON · 음성 생성</option></select></label><label>음성 모델<select id="vn-voice-provider">${Object.entries(TTS_PROVIDERS).map(([id, row]) => `<option value="${id}">${row.label}</option>`).join('')}</select></label></div>
  <div class="vn-settings-row"><label>음성 크기<input id="vn-voice-volume" type="range" min="0" max="100" step="1"></label><label>다음 문장으로 넘길 때<select id="vn-voice-continue"><option value="off">음성 멈춤</option><option value="on">끝까지 재생 · 다음 음성이 나오면 교체</option></select></label></div>
  <label>낭독 목소리 · 완전 자동의 서술<select id="vn-narrator-voice"></select></label>
  <label id="vn-typecast-field" hidden>Typecast API 키 <small>Typecast 캐릭터 보이스에 사용 · 이 기기에 암호화해 보관</small><input id="vn-typecast-key" type="password" autocomplete="off" maxlength="512" placeholder="Typecast API 키"><a class="vn-key-link" href="https://typecast.ai/developers/api" target="_blank" rel="noopener noreferrer">Typecast API 키 발급 ↗</a></label>
  <div class="vn-typecast-tools" id="vn-typecast-tools" hidden><button type="button" id="vn-typecast-load">키 저장·연결 확인</button><span id="vn-typecast-status" role="status"></span><label>Typecast 연결 방식<select id="vn-typecast-transport"><option value="relay">서버 중계 · 기본</option><option value="direct">브라우저 직접 연결 · 실험</option></select></label><small>직접 연결은 음성 합성 키와 대사를 이 브라우저에서 Typecast로 보냅니다. Typecast가 브라우저 요청을 허용해야 하며, 실패해도 다른 경로로 자동 재전송하지 않습니다. 이용 제한은 Typecast에서 해제해야 합니다.</small><small>키를 이 기기에 보관하고 캐릭터 목록을 불러옵니다. 음성 생성 비용은 들지 않습니다. AI 대사 음성을 ON으로 선택한 뒤 아래 저장을 누르면 적용됩니다.</small></div>
  <section id="vn-typecast-credit" class="vn-voice-credit" aria-label="Typecast 음성 출처" hidden><strong>Typecast 음성 출처</strong><p>${TYPECAST_CREDIT}</p><p id="vn-typecast-credit-names"></p><a href="${TYPECAST_URL}" target="_blank" rel="noopener noreferrer">typecast.ai ↗</a><small>무료 플랜으로 만든 음성을 녹화·공유할 때는 이 문구와 사용한 Typecast 캐릭터 이름을 함께 남겨 주세요. <a href="https://typecast.ai/kr/guideline/" target="_blank" rel="noopener noreferrer">출처 표기 안내 ↗</a></small></section>
  <small id="vn-voice-help">AI가 생성한 음성입니다. OpenAI는 OpenAI API 키, Gemini 3.8 TTS는 연결 탭의 Gemini API 키, Typecast는 이 탭의 Typecast API 키를 사용하며 대사별 음성 비용(Typecast는 요금제 크레딧)이 추가됩니다. Gemini와 Typecast는 인물마다 서로 다른 목소리를 자동으로 배정합니다. Typecast는 목록을 불러온 뒤 인물별 캐릭터를 고를 수 있고, 표정·속삭임·외침 같은 연출은 감정 프리셋으로, 그 밖의 대사는 앞뒤 문장을 읽는 스마트 감정으로 연기합니다. 같은 대사는 한 번만 생성해 저장하고, 다시 듣기와 되돌아가기는 추가 비용 없이 재생합니다. 모델을 바꾸면 이후 대사부터 새 목소리로 생성합니다. 전문 성우와 같은 연기 품질은 보장하지 않으며 음성 없이도 글은 바로 진행합니다.</small>
  <div id="vn-voice-actors"></div></div>`;
// 연출 tab: reading and presentation. 음성·음악 tab: voices, sound, music.
const settingsPanel = name => { const node = document.createElement('div'); node.id = `vn-${name}-panel`; node.hidden = true; node.setAttribute('role', 'tabpanel'); node.setAttribute('aria-labelledby', `vn-${name}-tab`); return node; };
const directionPanel = settingsPanel('direction'), audioPanel = settingsPanel('audio');
const fieldset = legend => { const node = document.createElement('fieldset'); node.className = 'vn-reading-settings'; node.innerHTML = `<legend>${legend}</legend><div class="vn-settings-fields"></div>`; return node; };
const voiceFields = fieldset('AI 대사 음성'), soundFields = fieldset('효과음·배경음악');
const moveTo = (target, ...nodes) => target.querySelector('.vn-settings-fields').append(...nodes);
const rowOf = (source, id) => source.querySelector(`#${id}`).closest('.vn-settings-row') || source.querySelector(`#${id}`).closest('label');
moveTo(voiceFields, rowOf(presentationFields, 'vn-voice-setting'), presentationFields.querySelector('#vn-typecast-field'), presentationFields.querySelector('#vn-typecast-tools'),
  presentationFields.querySelector('#vn-typecast-credit'),
  rowOf(presentationFields, 'vn-voice-volume'), rowOf(presentationFields, 'vn-narrator-voice'), presentationFields.querySelector('#vn-voice-help'), presentationFields.querySelector('#vn-voice-actors'));
moveTo(soundFields, rowOf(readingFields, 'vn-sound'), rowOf(presentationFields, 'vn-music'));
presentationFields.querySelector('legend').textContent = '추가 연출 · 베타';
directionPanel.append(readingFields, presentationFields); audioPanel.append(voiceFields, soundFields);
connectionPanel.after(directionPanel, audioPanel);
const costPanel = document.createElement('div'); costPanel.id = 'vn-cost-panel'; costPanel.hidden = true; costPanel.setAttribute('role', 'tabpanel'); costPanel.setAttribute('aria-labelledby', 'vn-cost-tab'); settingsForm.append(costPanel);
const storagePanel = document.createElement('div'); storagePanel.id = 'vn-storage-panel'; storagePanel.hidden = true; storagePanel.setAttribute('role', 'tabpanel'); storagePanel.setAttribute('aria-labelledby', 'vn-storage-tab'); settingsForm.append(storagePanel);
const settingsFooter = connectionPanel.querySelector('.vn-settings-footer'); settingsForm.append(settingsFooter);

const $ = (id) => document.getElementById(id);
const accountMenu = createAccountMenu($('vn-account'));
$('vn-account').addEventListener('click', closeMenu);
// Keep the engine's original recovery controls and their handlers, but put them
// inside the visible VN shell. The legacy app is intentionally hidden.
const recoveryPanel = document.createElement('aside');
recoveryPanel.className = 'vn-engine-recovery'; recoveryPanel.hidden = true;
recoveryPanel.setAttribute('aria-label', '진행 안내');
const recoveryHeading = document.createElement('strong'); recoveryHeading.textContent = '진행 안내';
const recoveryDetail = document.createElement('p'); recoveryDetail.className = 'vn-recovery-detail';
recoveryPanel.append(recoveryHeading, recoveryDetail);
const engineNotice = $('recoveryNotice');
if (engineNotice) recoveryPanel.append(engineNotice);
const adjudicationRetry = document.createElement('button');
adjudicationRetry.id = 'vn-retry-adjudication'; adjudicationRetry.type = 'button'; adjudicationRetry.hidden = true;
adjudicationRetry.textContent = '판정 보완 다시 시도';
recoveryPanel.append(adjudicationRetry);
const progressDialog = createEventProgressDialog({ root, recovery: recoveryPanel,
  read: () => readEventProgress(state.api, { requirementDisplay: globalThis.CortexProseMemory?.requirementDisplay }),
  beforeOpen: () => { stopPlayback(); voice.stop(); saveReadingPosition(); closeMenu(); syncRecovery(); },
});
function syncRecovery() {
  if(host.multiplayer)return null;
  const automatic = autoRecovery.tick(state.api, { scope: state.api?._recoveryScope?.(),
    enabled: !state.switching && !state.slotTask && !state.slotRecoveryNeeded && !state.retryingAdjudication && !state.submitting,
    online: navigator.onLine !== false, canJudge: Boolean(textKey()) });
  state.autoRecovery = automatic;
  const recovering = automatic.waiting || Boolean(state.judgeRecovery);
  const problem = storageProblem(state.api);
  const pending = pendingAdjudication(state.api);
  adjudicationRetry.hidden = !pending;
  // Cortex's original send button reflects its actual request lock. A parked
  // ADJUDICATION_PENDING beat is resumable, although VN busy() blocks new turns.
  adjudicationRetry.disabled = Boolean(problem || recovering || state.retryingAdjudication || state.awaitingTurn || $('send')?.disabled);
  adjudicationRetry.textContent = state.retryingAdjudication ? '판정 보완 중…' : '판정 보완 다시 시도';
  recoveryPanel.hidden = !recovering && !problem && !pending && (!engineNotice || engineNotice.hidden);
  recoveryHeading.textContent = recovering ? '자동 복구 중' : problem ? '현재 진행을 저장하지 못했습니다' : '진행 안내';
  const recovery = state.judgeRecovery || automatic;
  const detail = recovering ? recovery.phase === 'offline' ? '연결이 돌아오면 같은 비트의 판정을 자동으로 재시도합니다.'
    : `${recovery.kind === 'storage' ? '현재 진행을 다시 저장' : '같은 본문의 판정을 다시 처리'}하고 있습니다 · ${recovery.attempt || 0}/${recovery.max}. 복구되면 이어서 진행합니다.`
    : problem ? `${problem.reason} 자동 복구로 해결되지 않았습니다. 아래에서 현재 진행을 백업하거나 저장 공간을 확보한 뒤 다시 저장해 주세요.` : '';
  if (recoveryDetail.textContent !== detail) recoveryDetail.textContent = detail;
  recoveryDetail.hidden = !detail;
  // Reuse the toolbar entry instead of drawing a floating notice over the story.
  // Keep the actual engine recovery nodes (and their backup handlers) in the dialog.
  const retryReady = Boolean(pending && !adjudicationRetry.disabled);
  const attention = !recovering && Boolean(problem || retryReady || (!recoveryPanel.hidden && engineNotice?.querySelector('button')));
  const label = recovering ? recovery.kind === 'storage' ? '저장 복구 중' : '판정 재시도 중' : problem ? '저장 오류' : retryReady ? '판정 재시도' : pending ? '판정 중' : !recoveryPanel.hidden ? '진행 안내' : '진행';
  if (progressButton.textContent !== label) progressButton.textContent = label;
  progressButton.dataset.attention = String(attention); menuProgressButton.dataset.attention = String(attention);
  progressButton.setAttribute('aria-label', `사건·비트 진행상황${label === '진행' ? '' : ` · ${label}`}`);
  const menuLabel = label === '진행' ? '진행상황' : `진행상황 · ${label}`;
  if (menuProgressButton.textContent !== menuLabel) menuProgressButton.textContent = menuLabel;
  return problem;
}
const state = { api: null, catalog: [], activeSlug: localStorage.getItem(activeKey) || '', pages: [], cursor: 0, following: true, startAtFirst: false, actions: false, customInputOpen: false, screen: 'library', renderKey: '', backgroundUrl: '', backgroundSide: 'a', media: [], openingArt: '', switching: false, provider: localStorage.getItem(providerKey) || 'openai', effort: localStorage.getItem(effortKey) || 'low', keys: { openai: '', go: '' }, reveal: { key: '', text: '', length: 0, timer: 0 } };
const autoRecovery = createAutoRecovery({ changed: () => sync(true) });
globalThis.NexusVNRetryVerdict = (attempt, options) => retryVerdict(attempt, { ...options,
  onStatus: status => { state.judgeRecovery = status; },
});
globalThis.NexusVNHandlesTextReveal = false;
const textWait = createTextWaitTracker();
state.reveal = createTextRevealer({
  write: text => {
    // Ruby and emphasis dots are rendered from the typeset layout; the
    // revealer only counts visible glyphs.
    const count = Array.from(text).length, element = state.reveal.element;
    if (element && (element.vnCount !== count || element.vnLayout !== state.reveal.layout)) {
      element.vnCount = count; element.vnLayout = state.reveal.layout;
      if (state.reveal.layout) renderTypeset(element, state.reveal.layout, count); else element.textContent = text;
      textWait.progress(state.reveal.key, state.reveal.length);
      setInlineBuffer('');
      performancePlayer.progress(count,{voicePhase:voice.phase});
    }
  },
  onComplete: revealComplete,
  isPaused: () => cinema.blocked || performancePlayer.blocked || state.screen !== 'stage' || state.dialogueWaiting || document.hidden || Boolean(document.querySelector('dialog[open]')) || !$('vn-history').hidden || state.hideText || root.classList.contains('vn-menu-open'),
});
state.openingScene = null;
state.preparedScenePage = '';
state.stageScenes = new Map(); state.preparedBeats = new Set(); state.dialogueBypass = new Set(); state.dialogueWaiting = false;
state.imageRouting = readImageRouting(localStorage);
const readingPrefsKey = 'dancheong-vn-reading-prefs-v1';
let storedReading = {}; try { storedReading = JSON.parse(localStorage.getItem(readingPrefsKey) || '{}'); } catch { /* Defaults remain usable. */ }
state.reading = { layout: storedReading?.layout === 'adv' ? 'adv' : 'nvl', pace: ['slow', 'fast'].includes(storedReading?.pace) ? storedReading.pace : 'normal', font: storedReading?.font === 'large' ? 'large' : 'normal', typeface: TYPEFACES[storedReading?.typeface] ? storedReading.typeface : 'auto', motion: storedReading?.motion === 'reduced' ? 'reduced' : 'full', sound: storedReading?.sound === 'on' ? 'on' : 'off',
  ambience: storedReading?.ambience === 'on' ? 'on' : 'off', cg: eventSceneSetting(storedReading),
  shots: storedReading?.shots === 'on' ? 'on' : 'off', cinema: storedReading?.cinema === 'off' ? 'off' : 'on', actorMotion: storedReading?.actorMotion === 'masked' ? 'masked' : 'off', faceCompose: storedReading?.faceCompose === 'on' ? 'on' : 'off', music: ['on', 'tracks'].includes(storedReading?.music) ? storedReading.music : 'off', voice: storedReading?.voice === 'on' ? 'on' : 'off', voiceProvider: TTS_PROVIDERS[storedReading?.voiceProvider] ? storedReading.voiceProvider : 'openai', narratorVoice: typeof storedReading?.narratorVoice === 'string' ? storedReading.narratorVoice.slice(0, 40) : '', voiceContinue: storedReading?.voiceContinue === 'on' ? 'on' : 'off', typecastTransport: storedReading?.typecastTransport === 'direct' ? 'direct' : 'relay', voiceVolume: Number.isFinite(storedReading?.voiceVolume) ? Math.max(0, Math.min(1, storedReading.voiceVolume)) : 1, musicVolume: Number.isFinite(storedReading?.musicVolume) ? Math.max(0, Math.min(1, storedReading.musicVolume)) : .22 };
const artStyleKey = slug => `dancheong-vn-art-style-v1:${slug}`;
function loadArtStyle(slug) { try { return localStorage.getItem(artStyleKey(slug)) || ''; } catch { return ''; } }
state.artStyle = loadArtStyle(state.activeSlug);
Object.assign(state, { playback: 'manual', playbackTimer: 0, readThrough: -1, bookmark: null, awaitingTurn: false, submittedTurnId: '', readerWork: '', lastDirectionKey: '', lastScene: null, hideText: false, backdropSequence: 0, generationStarted: 0 });
const autoContinuation = createContinuationGate();
state.fullAutoVoice = null;
const fullAutoButton = document.createElement('button'); fullAutoButton.id = 'vn-full-auto'; fullAutoButton.type = 'button';
fullAutoButton.textContent = '완전 자동'; fullAutoButton.setAttribute('aria-pressed', 'false');
fullAutoButton.title = '문장·AI 음성·장면 이어가기 자동 진행 (Shift+A) · API 사용료 발생';
$('vn-auto').after(fullAutoButton);
const fullAutoHelp = document.createElement('p'); fullAutoHelp.className = 'vn-settings-help';
fullAutoHelp.textContent = '완전 자동은 서술·대사를 AI 음성으로 읽고, 현재 장면의 인물이 화면에 표시된 뒤 다음 문장으로 넘어갑니다. 대사는 화자 확인이 끝난 뒤 그 인물의 목소리로 읽고, 서술은 인물과 겹치지 않는 낭독 목소리로 읽습니다. 입력 차례마다 장면 이어가기를 실행합니다. 본문·이미지·음성 API 사용료가 계속 발생합니다. 선택한 음성 모델의 API 키가 필요하며, 자동 중지·화면 이동·탭 전환·오류 시 멈춥니다. 새로고침 후에는 직접 다시 켜 주세요.';
readingFields.append(fullAutoHelp);
const sound = createSound(() => state.reading.sound === 'on');
const ambience = createAmbience(() => state.reading.ambience === 'on' && state.screen === 'stage' && !document.hidden);
const musicDirection = createMusicDirection();
const score = createScore(() => state.reading.music === 'on' && state.screen === 'stage' && !document.hidden, { getVolume: () => state.reading.musicVolume * (voiceBusy() ? .3 : 1) });
// Trim, level, EQ and a room matched to the current environment on the device.
const voicePlayer = createVoicePlayer({ getRoom: () => ({ bed: state.ambienceTarget?.bed || '', mood: $('vn-stage')?.dataset.mood || '' }),
  getVolume: speakerId => state.reading.voiceVolume * (readVoiceVolumes()[speakerId] ?? 1) });
const voiceKey = (provider = state.reading.voiceProvider) => embeddedMediaKey(ttsProvider(provider).keyName);
const voiceCredits = createVoiceCredits({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
// The user chooses one transport before synthesis; there is no automatic rerouting.
const typecastTransport = createTypecastTransport({ mode: () => state.reading.typecastTransport });
const voice = createVoice({ fetchVoice: (...args) => typecastTransport.fetch(...args), getEnabled: () => (state.reading.voice === 'on' || state.playback === 'full') && !mediaPaused(state.activeSlug, 'voice') && state.screen === 'stage' && !document.hidden && !document.querySelector('dialog[open]') && (state.backlogVoice || $('vn-history').hidden) && state.playback !== 'skip', getKey: voiceKey, read: readAsset, write: writeAsset,
  onState: phase => { queueMicrotask(()=>performancePlayer.progress(state.reveal.length,{voicePhase:phase})); if (['preparing', 'playing'].includes(phase)) stopReleasedVoice(); if (phase === 'playing') voiceCredits.record(state.activeSlug, voice.speaking, typecastVoices()); updateVoiceControls(); queueMicrotask(schedulePlayback); },
  makeAudio: voicePlayer });
// "Voice continues on click": the previous line may finish under the next
// page until another voice starts.
function stopReleasedVoice() { const held = state.releasedVoice; state.releasedVoice = null; try { held?.pause(); } catch { /* ended */ } }
const voiceBusy = () => voice.phase === 'playing' || Boolean(state.releasedVoice);
const workMusic = createWorkMusic({ enabled: () => state.reading.music === 'tracks' && state.screen === 'stage' && !document.hidden, volume: () => state.reading.musicVolume * (voiceBusy() ? .3 : 1), onStatus: text => musicSettings.status(text) });
const musicSettings = createMusicSettings({ parent: soundFields.querySelector('.vn-settings-fields'), getWork: () => state.activeSlug, onChange: () => workMusic.invalidate(),
  getGeminiKey: () => state.keys.gemini || '',
  getWorkInfo: () => { const work = currentWork(), scenario = state.api?._scenario(); return { title: work?.title || scenario?.title || '', subtitle: work?.subtitle || '', genre: work?.genre || '', summary: scenario?.summary || '', location: scenario?.world?.location || '' }; } });
state.voiceLine = null;
Object.assign(state, { stageOrder: [], speakerNames: new Map(), firedEffects: new Set(), focusId: '', ambienceTarget: null, met: [], metKey: '' });
root.dataset.motion = state.reading.motion;
function applyTypeface() { root.dataset.typeface = state.reading.typeface; loadTypeface(state.reading.typeface); }
applyTypeface();
const meter = installCostMeter({ enabled: () => host.active, notify: toast, context: () => ({ slug: state.activeSlug, title: currentWork()?.title || '' }), onChange: () => { if ($('vn-settings-dialog').open && !$('vn-cost-panel').hidden) void renderCosts(); } });
const castDirector = createCastDirector({ getConnection: () => ({ key: textKey(), model: state.provider === 'muse' ? providerModels.muse : 'gpt-6-luna', endpoint: state.provider === 'openai' ? '/api/vn/openai/responses' : '/api/vn/go/responses' }), read: readAsset, write: writeAsset,
  onChange: requestRender, onError: toast });
const assets = createStageAssets({ castDirector, getQualityReference: createQualityReferenceLoader({ read: readAsset, getSelection: scope => readWorkArt(localStorage, scope).guideKey }), getLockedPortraitKey: (scope, id) => readWorkArt(localStorage, scope).locks[id] || '', getKey: imageKey, getProvider: purpose => imageProviderFor(state.imageRouting, purpose), getStyle: () => state.artStyle, getCgEnabled: () => state.reading.cg === 'on', getQuality: () => state.api?._settings()?.imageQuality === 'medium' ? 'medium' : 'low',
  getShotsEnabled: () => state.reading.shots === 'on', getMotionEnabled: () => state.reading.actorMotion === 'masked' && state.reading.motion !== 'reduced',
  getPortraitReplacement: (scope, id) => readPortraitReplacement(localStorage, scope, id),
  getReferences: person => window.CortexTurnExperience.selectImageReferences({ visualReferences: [{ characterId: person.id, name: person.name, mode: person.referenceMode, allowedAssetRefs: person.allowedAssetRefs, primaryAssetRef: person.primaryAssetRef }] }, state.media).map(row => row.dataUrl),
  onChange: requestRender, onSpriteReady: displaySprite, onError: toast, maxConcurrent: 2 });
let cinematicFrame=null;
const portraitContinuity=createPortraitContinuity();
const sceneBlocking=createStageBlocking();
const foley=createFoley({createContext:createFoleyContext,enabled:()=>state.reading.sound==='on'&&state.screen==='stage'&&!document.hidden&&!document.querySelector('dialog[open]'),speaking:()=>voiceBusy()});
const performancePlayer=createCuePlayer({release:()=>{if(state.screen==='stage'){requestRender();schedulePlayback();}},fire:(cue,frame)=>{
  if(cue.sound!=='none')foley.play(cue.sound,frame.key+cue.at);
  if(cue.kind==='impact'&&!motionReduced())playEffect(frame.direction.fx&&frame.direction.fx!=='none'?frame.direction.fx:'shake');
  if(['cutin','emphasis'].includes(cue.kind)&&cinematicFrame&&!motionReduced())cinema.update({...cinematicFrame,fresh:true,waiting:false,cueOpen:true,cueReady:cue.kind});
}});
const cinema = createCinema({ stage: $('vn-stage'), visual, reduced: motionReduced, onRelease: () => { queueMicrotask(() => { if (state.screen === 'stage') { renderPage(); schedulePlayback(); } }); } });
const preparationQueue = createPreparationQueue({ concurrency: 3, onError: error => toast(error?.message || '장면 준비 오류') });
const slotStore = createSlotStore();
const saveDialog = createSaveDialog({ root, store: slotStore, canSave: slotSaveProblem,
  onOpen: () => { stopPlayback(); voice.stop(); saveReadingPosition(); root.classList.remove('vn-menu-open'); $('vn-menu-toggle').setAttribute('aria-expanded', 'false'); },
  save: saveManualSlot, load: loadManualSlot, readFile: readBackup,
  importFile: (backup, slot, revision) => withSlotLock(async () => { void requestDurableStorage(); return storeImportedSlot({ backup, slot, revision, store: slotStore }); }),
  exportFile: (slot, revision) => withSlotLock(async () => { const record = await slotStore.get(slot); if (!record || record.revision !== revision) throw new Error('슬롯이 변경되었습니다. 목록을 다시 확인해 주세요.'); return exportSlotFile(record); }) });
const syncStatus = document.createElement('p'); syncStatus.className = 'vn-saves-help'; syncStatus.setAttribute('role', 'status');
$('vn-saves-dialog').querySelector('header').after(syncStatus);
const cloudDialog = createCloudDialog({ root, localStore: slotStore, currentSlug: () => state.activeSlug, onStatus: text => { syncStatus.textContent = text; },
  canSave: slotSaveProblem, capture: captureCloudSlot, load: record => loadSavedRecord(record), notify: toast,
  onOpen: () => { stopPlayback(); voice.stop(); saveReadingPosition(); closeMenu(); } });
$('vn-account').addEventListener('vn-cloud-open', () => void cloudDialog.show());
const cloudButton = document.createElement('button'); cloudButton.type = 'button'; cloudButton.textContent = '계정 클라우드';
$('vn-saves-dialog').querySelector('header').append(cloudButton);
cloudButton.onclick = () => { $('vn-saves-dialog').close(); void cloudDialog.show(); };
const storageManager = createStoragePanel({ parent: storagePanel, works: () => state.catalog, slots: slotStore,
  optimize: (slug, progress) => withSlotLock(() => withMediaMaintenance(async () => {
    if (state.switching || state.slotTask || busy() || assets.isBusy() || voice.busy) throw new Error('현재 작업이 끝난 뒤 이미지를 최적화해 주세요.');
    const result = await optimizeWorkImages(slug, { progress }); invalidateMediaMemory(); return result;
  })),
  clear: (slug, kind) => withSlotLock(() => withMediaMaintenance(async () => {
    if (state.switching || state.slotTask || busy() || assets.isBusy() || voice.busy) throw new Error('현재 작업이 끝난 뒤 캐시를 정리해 주세요.');
    // Persist the pause first, so closing the tab cannot repurchase deleted art.
    setMediaPaused(slug, kind, true);
    const count = await removeWorkMedia(slug, kind); invalidateMediaMemory(); return count;
  })),
  resume: async (slug, kind) => { setMediaPaused(slug, kind, false); invalidateMediaMemory(); },
  openSaves: () => { $('vn-settings-dialog').close(); void saveDialog.show(); } });
for (const id of ['vn-reader-slots', 'vn-library-slots', 'vn-title-slots', 'vn-menu-slots']) $(id).onclick = () => void saveDialog.show();
const healthDialog = createHealthDialog({ root, diagnostics, report: () => inspectWork({ scenario: state.api?._scenario(), scope: sceneScope(), turns: state.api?._turns() || [], experience: window.CortexTurnExperience, media: state.media }) });
const healthButton = document.createElement('button'); healthButton.type = 'button'; healthButton.textContent = '작품·성능 점검';
$('vn-title-cast').after(healthButton); healthButton.onclick = () => healthDialog.show();
const healthSettingsButton = healthButton.cloneNode(true); healthSettingsButton.onclick = () => { $('vn-settings-dialog').close(); healthDialog.show(); }; storagePanel.append(healthSettingsButton);
const newGameDialog = createNewGameDialog({ root, getTitle: () => currentWork()?.title || state.api?._scenario()?.title || '작품', start: startNewGame, openSaves: () => saveDialog.show() });
const editionStore = createEditionStore();
const editionDialog = createEditionDialog({ root, getWork: currentWorkForEdition, getCurrent: () => state.api?._scenario()?.runtime?.vnEdition || null,
  list: slug => editionStore.list(slug), install: revision => switchEdition({ revision }), restore: id => switchEdition({ id }),
  exportRecord: id => withSlotLock(async () => {
    if (id === editionId(state.api?._scenario()?.runtime?.vnEdition, state.activeSlug)) {
      const problem = slotSaveProblem(); if (problem) throw new Error(problem);
      saveReadingPosition(); await saveActiveWork();
    }
    const record = await editionStore.get(state.activeSlug, id);
    if (!record) throw new Error('보관된 이야기를 찾지 못했습니다.');
    return exportSlotFile(record);
  }) });
function currentWorkForEdition() { return state.catalog.find(work => work.slug === state.activeSlug); }
const editionButton = document.createElement('button'); editionButton.id = 'vn-title-editions'; editionButton.type = 'button'; editionButton.textContent = '덧칠 관리';
$('vn-title-new').after(editionButton); editionButton.onclick = () => void editionDialog.show();
const galleryButton = document.createElement('button'); galleryButton.id = 'vn-title-gallery'; galleryButton.type = 'button'; galleryButton.textContent = '갤러리 · 음악 감상';
$('vn-title-cast').after(galleryButton);
// Only media already stored on this device for the current story.
const gallery = createGalleryDialog({ root, onOpen: () => { stopPlayback(); voice.stop(); },
  listImages: async () => galleryImages(await workAssets(sceneScope())),
  listMusic: async () => {
    const tracks = [], packaged = state.api?._scenario()?.runtime?.packageContract?.presentation?.music || {};
    for (const [mood, label] of Object.entries(musicMoods)) {
      const local = await readAsset(musicKey(state.activeSlug, mood)).catch(() => null);
      if (local?.blob instanceof Blob && !local.disabled) tracks.push({ label, title: local.title || '', credit: local.credit || '', blob: local.blob });
      else { const linked = licensedTrack(local) || licensedTrack(packaged[mood]); if (linked) tracks.push({ label, title: linked.title, credit: linked.credit, url: linked.url }); }
    }
    return tracks;
  } });
galleryButton.onclick = () => void gallery.show();
const dialogueGrace = createDialogueGrace();
const cueWindow = createCueWindow(), artContinuity = createArtContinuity(), compositionContinuity = createCompositionContinuity();
const eventDecodes = new Map();
function eventDecoded(url) {
  if (!url || state.backgroundDisplayedUrl === url) return true;
  if (!eventDecodes.has(url)) {
    eventDecodes.set(url, false);
    const image = new Image();
    image.onload = () => { if (eventDecodes.has(url)) eventDecodes.set(url, true); requestRender(); };
    image.onerror = () => { /* Optional broken artwork cannot interrupt reading. */ };
    image.src = url;
    if (eventDecodes.size > 8) eventDecodes.delete(eventDecodes.keys().next().value);
  }
  return eventDecodes.get(url) === true;
}
let dialogueGraceTimer = 0;
let toastTimer = 0;
const voiceControls = document.createElement('div'); voiceControls.className = 'vn-voice-controls';
voiceControls.innerHTML = '<button type="button" id="vn-voice-toggle">AI 음성 OFF</button><button type="button" id="vn-voice-replay" hidden>다시 듣기</button><span id="vn-voice-status" role="status"></span><button type="button" id="vn-voice-credit-open" hidden>Typecast · 음성 출처</button>';
$('vn-stage').append(voiceControls);
$('vn-voice-credit-open').onclick = event => { event.stopPropagation(); settingsTab('audio'); openSettings(); $('vn-typecast-credit').scrollIntoView({ block: 'nearest' }); };
const familyOf = (provider = state.reading.voiceProvider) => voiceFamily(provider);
const voiceChoicesKey = (provider = state.reading.voiceProvider) => familyOf(provider) === 'openai' ? `dancheong-vn-voices-v1:${state.activeSlug}` : `dancheong-vn-voices-${familyOf(provider)}-v1:${state.activeSlug}`;
// The Typecast character list belongs to the visitor's account, not a work.
const typecastCatalogKey = 'dancheong-vn-typecast-voices-v1';
try { setTypecastVoices(JSON.parse(localStorage.getItem(typecastCatalogKey) || '{}').voices); } catch { /* Load again in settings. */ }
const TYPECAST_AGE = { child: '어린이', teenager: '10대', young_adult: '청년', middle_age: '중년', elder: '노년' };
function voiceLabel(name, provider) {
  if (familyOf(provider) === 'gemini') return `${name} · ${GEMINI_VOICES[name] || ''}`;
  if (familyOf(provider) !== 'typecast') return name;
  const row = typecastVoices().find(item => item.id === name);
  return row ? [row.name, [row.gender === 'male' ? '남' : row.gender === 'female' ? '여' : '', TYPECAST_AGE[row.age] || ''].filter(Boolean).join('·'), (row.useCases || []).slice(0, 2).join('/')].filter(Boolean).join(' · ') : name;
}
function readVoiceChoices(provider) { try { return JSON.parse(localStorage.getItem(voiceChoicesKey(provider)) || '{}'); } catch { return {}; } }
function readVoiceVolumes() { try { return JSON.parse(localStorage.getItem(`dancheong-vn-voice-volume-v1:${state.activeSlug}`) || '{}'); } catch { return {}; } }
// Gemini casting is stored per story, so a person keeps the voice they were
// first given and two people do not share one while the pool allows.
function speakerVoice(view) {
  const id = view?.speakerId; if (!id) return '';
  const chosen = readVoiceChoices()[id];
  if (voiceOptions(state.reading.voiceProvider).includes(chosen)) return chosen;
  const family = familyOf();
  if (family === 'openai') return '';
  const key = `dancheong-vn-voice-cast-v1:${family}:${sceneScope()}`;
  let cast = {}; try { cast = JSON.parse(localStorage.getItem(key) || '{}'); } catch { cast = {}; }
  if (voiceOptions(state.reading.voiceProvider).includes(cast[id])) return cast[id];
  // Assignments to voices that are no longer offered are dropped, not reused.
  cast = Object.fromEntries(Object.entries(cast).filter(([, name]) => voiceOptions(state.reading.voiceProvider).includes(name)));
  const person = view.portraits?.find(row => row.id === id);
  cast = castVoices([{ id, profile: view.speakerProfile || person?.profile || '' }], state.reading.voiceProvider, cast);
  if (!cast[id]) return '';
  try { localStorage.setItem(key, JSON.stringify(cast)); } catch { /* This tab keeps the choice. */ }
  return cast[id];
}
function updateVoiceCredit(provider = state.reading.voiceProvider) {
  const names = voiceCredits.names(state.activeSlug), selected = familyOf(provider) === 'typecast';
  $('vn-typecast-credit').hidden = !selected && !names.length;
  $('vn-typecast-credit-names').textContent = names.length ? `출연진 · ${names.join(', ')}` : '이 작품에서 재생한 Typecast 캐릭터가 아직 없습니다. 재생되면 이름이 여기에 자동으로 기록됩니다.';
  $('vn-voice-credit-open').hidden = familyOf() !== 'typecast' && !names.length;
}
function updateVoiceControls() {
  if (!$('vn-voice-toggle')) return;
  updateVoiceCredit();
  const on = state.reading.voice === 'on' || state.playback === 'full';
  $('vn-voice-toggle').textContent = `AI 음성 ${on ? 'ON' : 'OFF'}`; $('vn-voice-toggle').setAttribute('aria-pressed', String(on));
  $('vn-voice-replay').hidden = !on || !state.voiceLine;
  $('vn-voice-replay').textContent = voice.phase === 'playing' || voice.phase === 'preparing' ? '음성 중지' : voice.phase === 'error' ? '음성 다시 시도' : '다시 듣기';
  if (on && familyOf() === 'typecast' && !typecastVoices().length) { $('vn-voice-status').textContent = 'Typecast 캐릭터 목록을 설정에서 불러와 주세요'; return; }
  $('vn-voice-status').textContent = on && voice.phase === 'error' ? (voice.error || '음성 생성 실패 · 다시 시도를 눌러 주세요') : state.playback === 'full' ? (state.fullAutoArt?.action === 'wait' ? `완전 자동 · ${state.fullAutoArt.reason}` : ({ preparing: '완전 자동 · 음성 준비 중', playing: '완전 자동 · 읽는 중', done: '완전 자동 · 다음 문장으로' }[voice.phase] || '완전 자동 · 장면 이어가기')) : on ? ({ preparing: '음성 준비 중 · 글은 계속 읽을 수 있습니다', playing: 'AI 음성 재생 중', blocked: '다시 듣기를 눌러 재생', 'needs-key': `${ttsProvider(state.reading.voiceProvider).keyLabel} API 키 필요` }[voice.phase] || '') : '';
}
$('vn-voice-toggle').onclick = event => {
  event.stopPropagation();
  if (state.playback === 'full') { stopPlayback(); return; }
  if (state.reading.voice !== 'on') { settingsTab('audio'); openSettings(); $('vn-voice-setting').focus(); return; }
  state.reading.voice = 'off'; voice.reset(); stopReleasedVoice();
  localStorage.setItem(readingPrefsKey, JSON.stringify({ ...state.reading, eventScenes: state.reading.cg })); updateVoiceControls();
};
$('vn-voice-replay').onclick = event => { event.stopPropagation(); const line = state.voiceLine, wasPlaying = ['playing', 'preparing'].includes(voice.phase); if (state.playback === 'full') stopPlayback(); if (wasPlaying) voice.stop(); else voice.replay(line); };

function toast(message) {
  $('vn-toast').textContent = message;
  $('vn-toast').classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('vn-toast').classList.remove('is-visible'), 4500);
}

function textKey() { return host.settings?.apiKey || ''; }
function imageKey(purpose = 'background') { return mediaPaused(state.activeSlug, 'image') ? '' : embeddedMediaKey(imageProviderFor(state.imageRouting, purpose)); }

function invalidateMediaMemory() {
  clearSpriteMemory();
  voice.clearMemory(); assets.clearMemory(); preparationQueue.clear(); state.preparedBeats.clear(); preparationPlan = null;
  state.renderKey = ''; state.backgroundUrl = null; state.backgroundDisplayedUrl = '';
  $('vn-characters').replaceChildren();
  for (const side of ['a', 'b']) { $(`vn-background-${side}`).style.backgroundImage = ''; $(`vn-background-${side}`).classList.remove('has-image'); }
  applyProvider();
}
window.addEventListener('storage', event => { if (isMediaStorageEvent(event.key)) invalidateMediaMemory(); });
function hasImageKey() { return host.multiplayer || Boolean(imageKey('background') || imageKey('portrait')); }
function applyProvider() {
  const connection=host.settings||{};
  state.provider=connection.provider==='opencode-go'?'muse':connection.provider==='opencode-go-luna'?'go-luna':'openai';
  state.effort=connection.museReasoningEffort||'low';
  if(host.active)state.api?._setSettings({imageEvery:0});
}

const busy = () => autoRecovery.running || state.api?._isBusy?.() || state.api?._turns().some(turn => ['STREAMING', 'ADJUDICATION_PENDING'].includes(turn.status) || turn.imageStatus === 'GENERATING' || turn.metrics?.lifecycle?.stage === 'PERSISTING');
const currentWork = () => state.catalog.find(work => work.slug === state.activeSlug);
const currentCover = () => state.activeSlug ? `/api/work/${encodeURIComponent(state.activeSlug)}/cover` : '';

function slotSaveProblem() {
  if(host.multiplayer)return '공유 이야기는 방에 자동 저장됩니다.';
  if (!state.api || !state.activeSlug || state.api._scenario()?.runtime?.storyId === 'unconfigured') return '작품을 시작하면 현재 진행을 슬롯에 저장할 수 있습니다.';
  if (state.slotRecoveryNeeded) return '불러오기 마무리가 필요합니다. 브라우저 저장 공간을 확인한 뒤 새로고침해 주세요.';
  if (state.switching || state.awaitingTurn || busy() || state.retryingAdjudication) return '현재 비트의 본문과 판정이 완료된 뒤 저장·불러오기를 할 수 있습니다.';
  if (assets.isBusy() || state.repairingPortrait) return '이미지를 저장하는 중입니다. 준비가 끝나면 저장·불러오기를 할 수 있습니다.';
  return storageProblem(state.api)?.message || '';
}
function slotPresentation() {
  const page = state.pages[state.cursor];
  return capturePresentation(localStorage, { slug: state.activeSlug, storyId: state.api._scenario().runtime.storyId,
    edition: state.api._scenario().runtime.vnEdition,
    bookmark: page ? { cursor: pageKey(page), read: pageKey(state.pages[state.readThrough]) } : null,
    met: state.met, openingArt: state.openingArt, actions: state.actions });
}
async function slotThumbnail() {
  const url = state.backgroundDisplayedUrl || state.openingArt;
  if (!url) return '';
  try {
    const image = new Image(); image.src = url;
    await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('thumbnail timeout')), 2000))]);
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const ctx = canvas.getContext('2d'), scale = Math.max(320 / image.naturalWidth, 180 / image.naturalHeight);
    ctx.drawImage(image, (320 - image.naturalWidth * scale) / 2, (180 - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
    return canvas.toDataURL('image/jpeg', .65);
  } catch { return ''; }
}
async function captureCloudSlot(slot) { return captureSave(slot); }
async function saveManualSlot(slot, revision) { const saved = await captureSave(slot, record => slotStore.put(record, revision)); cloudDialog.localSaved(); return saved; }
async function captureSave(slot, persist = record => record) {
  void requestDurableStorage();
  return withSlotLock(async () => {
    const problem = slotSaveProblem(); if (problem) throw new Error(problem);
    state.slotTask = true;
    try {
      saveReadingPosition();
      const snapshot = await state.api._fullExport();
      const page = state.pages[state.cursor];
      const record = makeSlot({ slot, slug: state.activeSlug, title: currentWork()?.title || state.api._scenario().title,
        snapshot, presentation: slotPresentation(), excerpt: pageText(page), scene: $('vn-scene-place').textContent,
        page: page ? state.cursor + 1 : 1, pageCount: state.pages.length || 1, thumbnail: await slotThumbnail() });
      return await persist(record);
    } finally { state.slotTask = false; }
  });
}
async function applySlotPresentation(record) {
  applyPresentation(localStorage, record);
  const db = await openSaves();
  try { await new Promise((resolve, reject) => {
    const tx = db.transaction('openingArt', 'readwrite');
    tx.objectStore('openingArt').put({ slug: record.slug, url: record.presentation.openingArt || '' });
    tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('도입 장면 저장 실패'));
  }); } finally { db.close(); }
}
const rememberSlot = async record => { await storeSnapshot(record.slug, record.snapshot); await editionStore.put(record); };
async function loadManualSlot(slot, revision) {
  return loadSavedRecord(null, async () => {
    const record = await slotStore.get(slot);
    if (!record || record.revision !== revision) throw new Error('이 슬롯이 다른 탭에서 변경되었습니다. 목록을 다시 확인해 주세요.');
    return record;
  });
}
async function loadSavedRecord(record, resolve = async () => record) {
  return host.write(async () => loadEmbeddedRecord(record, resolve));
}
async function loadEmbeddedRecord(record, resolve = async () => record) {
  return withSlotLock(async () => {
    // An empty library has no active work to save, but can still load a slot.
    if (state.switching || state.slotRecoveryNeeded || busy() || state.awaitingTurn || assets.isBusy() || state.repairingPortrait || storageProblem(state.api)) throw new Error(slotSaveProblem() || '현재 작업이 끝난 뒤 불러와 주세요.');
    record = await resolve();
    if (record.slug !== state.activeSlug || record.storyId !== state.api._scenario()?.runtime?.storyId) throw Error("이 세션과 같은 작품의 저장 슬롯을 선택해 주세요.");
    state.slotTask = true; state.switching = true;
    stopPlayback(); voice.reset(); preparationQueue.clear();
    try {
      await saveActiveWork();
      if (record.cacheBackup?.length || record.costBackup?.length) await withMediaTask(() => restoreSlotMedia(record));
      await activateSlot({ record, store: slotStore, api: state.api, apply: applySlotPresentation, remember: rememberSlot });
      embeddedStory = state.api._scenario();
      assets.clearMemory();
      state.activeSlug = record.slug; state.artStyle = loadArtStyle(record.slug);
      applyProvider();
      await loadMedia(); await loadPresentation();
      state.openingArt = record.presentation.openingArt || '';
      state.actions = Boolean(record.presentation.actions); state.customInputOpen = false; $('vn-input').value = '';
      state.following = false; state.startAtFirst = false; state.renderKey = '';
      state.backgroundUrl = ''; state.backgroundDisplayedUrl = ''; state.backdropSequence++;
      $('vn-characters').replaceChildren();
      showScreen('stage');
    } catch (error) {
      // The engine import commits atomically. If subsequent VN storage fails,
      // leave its durable intent for boot rather than advancing the mixed state.
      state.slotRecoveryNeeded = Boolean(await slotStore.pending());
      if (state.slotRecoveryNeeded) throw new Error('불러온 진행은 보존되어 있지만 화면 저장을 마치지 못했습니다. 브라우저 저장 공간을 확인한 뒤 새로고침하면 마무리합니다.');
      throw error;
    } finally {
      state.slotTask = false; state.switching = Boolean(state.slotRecoveryNeeded);
      if (!state.switching) sync(true);
    }
  });
}

async function quickSave() {
  if (state.screen !== 'stage') return;
  try {
    const current = await slotStore.get(QUICK_SLOT);
    await saveManualSlot(QUICK_SLOT, current?.revision || '');
    toast('퀵 세이브했습니다 · F9로 불러옵니다.');
  } catch (error) { toast(error?.message || '퀵 세이브하지 못했습니다.'); }
}
async function quickLoad() {
  try {
    const current = await slotStore.get(QUICK_SLOT);
    if (!current) return toast('퀵 세이브가 없습니다. 플레이 중 F5로 먼저 저장해 주세요.');
    stopPlayback(); voice.stop();
    const when = new Date(current.savedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (!confirm(`퀵 세이브 「${current.title}」 (${when})를 불러올까요? 같은 작품이면 이어하기도 불러온 시점으로 바뀝니다. 현재 분기를 보존하려면 먼저 다른 슬롯에 저장해 주세요.`)) return;
    await loadManualSlot(QUICK_SLOT, current.revision);
    toast('퀵 세이브를 불러왔습니다.');
  } catch (error) { toast(error?.message || '퀵 세이브를 불러오지 못했습니다.'); }
}

async function startNewGame() {
  return withSlotLock(async () => {
    const problem = slotSaveProblem(); if (problem) throw new Error(problem);
    const slug = state.activeSlug;
    state.slotTask = true; state.switching = true;
    stopPlayback(); voice.reset(); preparationQueue.clear();
    try {
      // Validate/download first; a network or package error leaves play intact.
      const activeEdition = state.api._scenario()?.runtime?.vnEdition;
      const revision = activeEdition ? { revision: activeEdition.revision, sha256: activeEdition.sha256 } : catalogRevision(currentWork());
      const record = await prepareNewGame({ slug, title: currentWork()?.title, api: state.api, storage: localStorage, revision });
      saveReadingPosition(); await saveActiveWork();
      // Reuse the durable activation journal, never overwrite a numbered slot.
      await activateSlot({ record, store: slotStore, api: state.api, apply: applySlotPresentation, remember: rememberSlot });
      applyProvider(); await loadMedia();
      state.savedReaderWork = ''; state.savedReaderValue = '';
      await loadPresentation({ fresh: true });
      state.openingArt = ''; state.actions = false; state.customInputOpen = false; $('vn-input').value = ''; state.api._setInput('');
      state.following = false; state.startAtFirst = true; state.renderKey = '';
      state.backgroundUrl = null; state.backgroundDisplayedUrl = ''; state.backdropSequence++;
      for (const side of ['a', 'b']) { $(`vn-background-${side}`).style.backgroundImage = ''; $(`vn-background-${side}`).classList.remove('has-image'); }
      clearTimeout(state.eventFadeTimer);
      state.eventCharacterIds = []; state.fadingEventIds = [];
      $('vn-characters').replaceChildren();
      showScreen('stage');
    } catch (error) {
      state.slotRecoveryNeeded = Boolean(await slotStore.pending());
      if (state.slotRecoveryNeeded) throw new Error('새 진행은 보존되어 있지만 화면 저장을 마치지 못했습니다. 브라우저 저장 공간을 확인한 뒤 새로고침하면 마무리합니다.');
      throw error;
    } finally { state.slotTask = false; state.switching = Boolean(state.slotRecoveryNeeded); if (!state.switching) sync(true); }
  });
}

function openSaves() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dancheong-ln-saves-v1', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('works')) request.result.createObjectStore('works', { keyPath: 'slug' });
      if (!request.result.objectStoreNames.contains('openingArt')) request.result.createObjectStore('openingArt', { keyPath: 'slug' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 탭이 저장소를 사용 중입니다.'));
  });
}

async function savedOpeningArt(slug) {
  const db = await openSaves();
  try { return await new Promise((resolve, reject) => { const tx = db.transaction('openingArt'); const request = tx.objectStore('openingArt').get(slug); request.onsuccess = () => resolve(request.result?.url || ''); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}

async function savedSnapshot(slug) {
  const db = await openSaves();
  try { return await new Promise((resolve, reject) => { const tx = db.transaction('works'); const request = tx.objectStore('works').get(slug); request.onsuccess = () => resolve(request.result?.snapshot || null); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}

async function storeSnapshot(slug, snapshot) {
  const db = await openSaves();
  try { await new Promise((resolve, reject) => { const tx = db.transaction('works', 'readwrite'); tx.objectStore('works').put({ slug, snapshot, savedAt: new Date().toISOString() }); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('작품 저장에 실패했습니다.')); }); }
  finally { db.close(); }
}

async function saveActiveWork() {
  if (!state.activeSlug || state.api?._scenario()?.runtime?.storyId === 'unconfigured') return;
  if (busy()) throw new Error('현재 장면 처리가 끝난 뒤 작품을 바꿀 수 있습니다.');
  const saved = await state.api.persist();
  if (!saved?.ok) throw new Error('현재 작품 저장에 실패했습니다. 작품 전환을 중단합니다.');
  const snapshot = await state.api._fullExport();
  await storeSnapshot(state.activeSlug, snapshot);
  const record = makeSlot({ slot: 1, slug: state.activeSlug, title: currentWork()?.title || snapshot.scenario.title, snapshot, presentation: slotPresentation(),
    excerpt: pageText(state.pages[state.cursor]), page: state.cursor + 1, pageCount: state.pages.length });
  await editionStore.put(record);
}

async function switchEdition({ revision, id }) {
  return withSlotLock(async () => {
    const problem = slotSaveProblem(); if (problem) throw new Error(problem);
    const slug = state.activeSlug;
    state.slotTask = true; state.switching = true;
    stopPlayback(); voice.reset(); preparationQueue.clear(); void requestDurableStorage();
    try {
      const record = id ? await editionStore.get(slug, id) : await prepareNewGame({ slug, title: currentWork()?.title, api: state.api, storage: localStorage, revision });
      if (!record || record.slug !== slug || (id && editionId(snapshotEdition(record.snapshot), slug) !== id)) throw new Error('보관된 덧칠의 작품 정보가 일치하지 않습니다.');
      saveReadingPosition(); await saveActiveWork();
      await activateSlot({ record, store: slotStore, api: state.api, apply: applySlotPresentation, remember: rememberSlot });
      invalidateMediaMemory(); applyProvider(); await loadMedia(); await loadPresentation({ fresh: !id });
      state.openingArt = record.presentation.openingArt || ''; state.actions = false; state.customInputOpen = false; $('vn-input').value = '';
      state.startAtFirst = !id; state.following = false; showTitle(!id);
    } catch (error) {
      state.slotRecoveryNeeded = Boolean(await slotStore.pending());
      if (state.slotRecoveryNeeded) throw new Error('덧칠 진행은 보존되어 있습니다. 새로고침하면 전환을 마무리합니다.');
      throw error;
    } finally { state.slotTask = false; state.switching = Boolean(state.slotRecoveryNeeded); }
  });
}

function waitUntil(check, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const began = performance.now();
    const timer = setInterval(() => {
      try { const result = check(); if (result) { clearInterval(timer); resolve(result); } else if (performance.now() - began > timeout) { clearInterval(timer); reject(new Error('작품 처리 시간이 초과됐습니다.')); } }
      catch (error) { clearInterval(timer); reject(error); }
    }, 100);
  });
}

async function importPackage(slug) {
  const work = state.catalog.find(row => row.slug === slug);
  const revision = catalogRevision(work);
  const record = await prepareNewGame({ slug, title: work.title, api: state.api, storage: localStorage, revision });
  await withSlotLock(() => activateSlot({ record, store: slotStore, api: state.api, apply: applySlotPresentation, remember: rememberSlot }));
}

async function loadMedia() {
  await loadWorkPresentation();
  try { state.media = await state.api._packageMedia(); }
  catch { state.media = []; }
}

function sceneScope(scenario = state.api?._scenario()) { return editionScope(state.activeSlug, scenario?.runtime?.storyId || 'story', scenario?.runtime?.vnEdition); }
function captureLatest(scenario, turns, force = false) {
  const last = turns.at(-1);
  if (!last || last.status !== 'COMMITTED' || last.vnScene?.version >= sceneVersion || !state.activeSlug || (state.switching && !force)) return false;
  last.vnScene = captureScene({ scope: sceneScope(scenario), scenario, turn: last, priorTurns: turns.slice(0, -1), previous: turns.at(-2)?.vnScene || state.openingScene, experience: window.CortexTurnExperience });
  return true;
}
async function loadPresentation({ fresh = false } = {}) {
  state.preparedScenePage = '';
  state.openingScene = null;
  resetReader();
  const scenario = state.api._scenario(), turns = state.api._turns();
  // Old sprite lists are only candidates. Give the cast check their original
  // published passage, without rebuilding past world state from the latest turn.
  for (const [index, turn] of turns.entries()) if (turn.vnScene && turn.vnScene.version < sceneVersion) {
    turn.vnScene.publicText = String(turn.text || '');
    turn.vnScene.previousText = String(turns[index - 1]?.text || '');
  }
  const key = `${sceneScope(scenario)}:opening`;
  try { if (!fresh) state.openingScene = (await readAsset(key))?.scene || null; } catch { /* Readable without storage. */ }
  if (!turns.length && (!state.openingScene || state.openingScene.version < sceneVersion)) {
    const text = openingText();
    state.openingScene = captureScene({ scope: sceneScope(scenario), scenario, turn: { id: 'opening', status: 'COMMITTED', text }, experience: window.CortexTurnExperience });
    try { await writeAsset({ key, scene: state.openingScene }); } catch { toast('장면 정보를 현재 탭에만 보관합니다.'); }
  }
  captureLatest(scenario, turns, true);
  queueHistoryImport(turns);
  state.workHealth = inspectWork({ scenario, scope: sceneScope(), turns, experience: window.CortexTurnExperience, media: state.media });
  healthButton.textContent = '작품·성능 점검' + (state.workHealth.issues.length ? ' · 확인 필요' : '');
}

async function openWork(slug) {
  if (state.switching) return;
  // Returning to the same running work changes only the view. Keep its writer,
  // images, current page and reveal clock; never import or bootstrap it again.
  if (slug === state.activeSlug && state.pages.length && state.api?._scenario()?.runtime?.storyId !== 'unconfigured') {
    showTitle(); return;
  }
  if (busy() || assets.isBusy() || storageProblem(state.api)) return toast('현재 장면과 저장이 완료된 뒤 작품을 바꿔 주세요.');
  const work = state.catalog.find(row => row.slug === slug);
  if (!work) return toast('목록에서 작품을 찾지 못했습니다.');
  state.switching = true;
  $('vn-library-count').textContent = `${work.title} 준비 중…`;
  try {
    let fresh = false;
    if (slug !== state.activeSlug) {
      await saveActiveWork();
      const snapshot = await savedSnapshot(slug);
      if (snapshot) await state.api._importFull(snapshot);
      else { await importPackage(slug); fresh = true; }
      state.activeSlug = slug;
      localStorage.setItem(activeKey, slug);
    } else if (state.api._scenario()?.runtime?.storyId === 'unconfigured') {
      const snapshot = await savedSnapshot(slug);
      if (snapshot) await state.api._importFull(snapshot);
      else { await importPackage(slug); fresh = true; }
    }
    applyProvider();
    state.artStyle = loadArtStyle(slug);
    await loadMedia();
    await loadPresentation();
    state.openingArt = await savedOpeningArt(slug);
    state.following = !fresh;
    state.startAtFirst = fresh;
    state.actions = false;
    state.renderKey = '';
    showTitle(fresh);
  } catch (error) {
    toast(error instanceof Error ? error.message : '작품을 열지 못했습니다.');
    state.slotRecoveryNeeded = Boolean(await slotStore.pending());
  } finally { state.switching = Boolean(state.slotRecoveryNeeded); $('vn-library-count').textContent = `${state.catalog.length}개 공개 항목`; }
}

function showScreen(screen) {
  stopPlayback();
  state.screen = screen;
  accountMenu.setVisible(screen !== 'stage');
  if (screen !== 'stage') { performancePlayer.reset();portraitContinuity.reset();sceneBlocking.reset();foley.stop();cueWindow.reset(); artContinuity.reset(); state.presentedView = null; clearTimeout(state.eyecatchTimer); eyecatch.hidden = true; cinema.reset(); workMusic.stop(); ambience.stop(); score.stop(); voice.reset(); stopReleasedVoice(); }
  root.classList.toggle('is-playing', screen !== 'library');
  root.classList.toggle('is-title', screen === 'title');
  $('vn-title').hidden = screen !== 'title';
  $('vn-home').setAttribute('aria-label', screen === 'stage' ? '메인화면으로 돌아가기' : '단청 메인화면');
  root.classList.remove('vn-menu-open');
  $('vn-menu-toggle').setAttribute('aria-expanded', 'false');
  $('vn-library').hidden = screen !== 'library';
  $('vn-stage').hidden = screen !== 'stage';
  $('vn-history-toggle').hidden = screen !== 'stage';
  $('vn-top-title').textContent = screen !== 'library' ? currentWork()?.title || state.api?._scenario()?.title || '작품' : '작품을 선택하세요';
  $('vn-history').hidden = true;
}

function closeMenu() {
  root.classList.remove('vn-menu-open');
  $('vn-menu-toggle').setAttribute('aria-expanded', 'false');
}

// Each work opens on its own title screen: key art, name, and a short menu.
function showTitle(fresh = false) {
  const work = currentWork(), scenario = state.api?._scenario();
  const art = state.openingArt || currentCover();
  $('vn-title-art').style.backgroundImage = art ? `url("${art.replaceAll('"', '%22')}")` : '';
  $('vn-title-kicker').textContent = String(work?.runtime || 'DANCHEONG · LIGHT NOVEL');
  $('vn-title-name').textContent = work?.title || scenario?.title || '작품';
  $('vn-title-sub').textContent = String(work?.subtitle || work?.genre || scenario?.summary || '').slice(0, 160);
  const edition = scenario?.runtime?.vnEdition, latest = work?.currentRevision;
  editionButton.textContent = latest && (!edition || latest > edition.revision) ? `${edition ? '새 덧칠' : '덧칠 확인'} · v${latest}` : edition ? `덧칠 관리 · v${edition.revision}` : '덧칠 관리';
  const started = !fresh && (state.api?._turns().length > 0 || Boolean(state.bookmark));
  $('vn-title-start').textContent = started ? '이어하기' : '시작하기';
  $('vn-title-cast-panel').hidden = true;
  showScreen('title');
  $('vn-title-start').focus({ preventScroll: true });
}
function startFromTitle() { showScreen('stage'); sync(true); }
async function renderMetCast() {
  const list = $('vn-title-cast-list'); list.replaceChildren();
  const scope = sceneScope();
  const met = await assets.metPortraits(state.met, scope).catch(() => []);
  if (scope !== sceneScope()) return;
  if (!met.length) { const empty = document.createElement('p'); empty.className = 'vn-title-cast-empty'; empty.textContent = '아직 무대에서 만난 인물이 없습니다. 이야기를 진행하면 이곳에 기록됩니다.'; list.append(empty); return; }
  const scenario = state.api._scenario(), turns = state.api._turns();
  const last = turns.at(-1) || { id: 'opening', status: 'COMMITTED', text: openingText() };
  const repairScene = captureScene({ scope, scenario, turn: last, priorTurns: turns.slice(0, -1), timeline: true, experience: window.CortexTurnExperience });
  repairScene.portraitPeers = repairScene.candidates.filter(row => state.met.some(met => met.id === row.id));
  for (const person of met) {
    const card = document.createElement('figure'); card.className = 'vn-title-cast-card';
    if (person.url) {
      const image = document.createElement('img'); image.alt = person.name; image.src = person.url;
      void displaySprite(person.url).then(url => { if (image.isConnected) setDisplayImage(image, url); });
      card.append(image);
    } else { const ghost = document.createElement('div'); ghost.className = 'vn-title-cast-ghost'; ghost.setAttribute('aria-hidden', 'true'); card.append(ghost); }
    const name = document.createElement('figcaption'); name.textContent = person.name;
    card.append(name);
    const candidate = repairScene.candidates.find(row => row.id === person.id);
    const preserveBaseKey = !candidate && person.url && workPortrait(person.baseKey, scope, person.id) ? person.baseKey : '';
    const target = candidate || (preserveBaseKey ? { id: person.id, name: person.name, referenceMode: 'PRIMARY', publicProfile: '이미 만난 인물. 제공된 기존 입상의 얼굴, 나이, 체형, 복장을 그대로 유지한다.' } : null);
    if (target) {
      if (target.publicAppearance) { const detail = document.createElement('p'); detail.className = 'vn-cast-appearance'; detail.textContent = target.publicAppearance; card.append(detail); }
      const redraw = document.createElement('button'); redraw.type = 'button'; redraw.className = 'vn-portrait-lock vn-portrait-redraw'; redraw.textContent = '외형 설정으로 다시 그리기 · 유료';
      redraw.addEventListener('click', async () => {
        if (scope !== sceneScope() || busy() || assets.isBusy() || state.repairingPortrait) return toast('현재 이미지 준비가 끝난 뒤 시도해 주세요.');
        state.repairingPortrait = true; redraw.disabled = true; redraw.textContent = '외형 설정으로 그리는 중…';
        try {
          const record = await assets.redrawPortrait(repairScene, target, { preserveBaseKey });
          // The old picture stays intact until the replacement is fully saved.
          writePortraitReplacement(localStorage, scope, person.id, record.key);
          const prefs = readWorkArt(localStorage, scope); delete prefs.locks[person.id]; writeWorkArt(localStorage, scope, prefs);
          if (scope !== sceneScope()) return;
          state.met = state.met.map(row => row.id === person.id ? { ...row, baseKey: record.key } : row);
          localStorage.setItem(state.metKey, JSON.stringify(state.met));
          state.preparedBeats.clear(); state.preparedScenePage = '';
          await renderMetCast(); toast('새 외형을 저장했습니다. 이후 표정도 이 얼굴을 기준으로 만듭니다.');
        } catch (error) { toast(error?.message || '다시 그리기에 실패했습니다.'); }
        finally { state.repairingPortrait = false; redraw.disabled = false; redraw.textContent = '외형 설정으로 다시 그리기 · 유료'; }
      });
      card.append(redraw);
    }
    if (person.url && workPortrait(person.baseKey, scope, person.id)) {
      const lock = document.createElement('button'); lock.type = 'button'; lock.className = 'vn-portrait-lock';
      const update = () => { const locked = readWorkArt(localStorage, scope).locks[person.id] === person.baseKey; lock.textContent = locked ? '기본 입상 고정 해제' : '이 기본 입상 고정'; lock.setAttribute('aria-pressed', String(locked)); };
      update();
      lock.addEventListener('click', () => {
        if (scope !== sceneScope() || busy() || assets.isBusy()) return toast('장면 준비가 끝난 뒤 변경해 주세요.');
        const prefs = readWorkArt(localStorage, scope);
        if (prefs.locks[person.id] === person.baseKey) delete prefs.locks[person.id]; else prefs.locks[person.id] = person.baseKey;
        try { writeWorkArt(localStorage, scope, prefs); update(); state.preparedBeats.clear(); }
        catch { toast('입상 고정 설정을 저장하지 못했습니다.'); }
      });
      card.append(lock);
    }
    if (person.url) framingControls({ card, image: card.querySelector('img'), storage: localStorage, scope, id: person.id, onChange: requestRender });
    list.append(card);
  }
}

function renderCatalog() {
  const grid = $('vn-library-grid');
  grid.replaceChildren();
  for (const work of state.catalog) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'vn-work-card';
    const cover = document.createElement('span'); cover.className = 'vn-work-cover';
    const image = document.createElement('img'); image.src = `/api/work/${encodeURIComponent(work.slug)}/cover`; image.alt = ''; image.loading = 'lazy'; cover.append(image);
    const detail = document.createElement('span'); detail.className = 'vn-work-info';
    const type = document.createElement('small'); type.textContent = String(work.runtime || 'Cortex Engine');
    const title = document.createElement('strong'); title.textContent = String(work.title || '이름 없는 작품');
    const subtitle = document.createElement('span'); subtitle.textContent = String(work.subtitle || work.genre || '새 이야기');
    const action = document.createElement('em'); action.textContent = work.slug === state.activeSlug ? '이어하기 ↗' : '작품 열기 ↗';
    detail.append(type, title, subtitle, action); button.append(cover, detail);
    button.addEventListener('click', () => void openWork(work.slug)); grid.append(button);
  }
  $('vn-library-count').textContent = state.catalog.length ? `${state.catalog.length}개 공개 항목` : '공개 작품이 없습니다.';
}

async function fetchCatalog() {
  try {
    const response = await fetch('/api/catalog', { cache: 'no-store' });
    if (!response.ok) throw new Error('너름의 작품 목록을 읽지 못했습니다.');
    const data = await response.json();
    state.catalog = Array.isArray(data.works) ? data.works.filter(row => /^[a-z0-9-]{3,80}$/u.test(row.slug || '')) : [];
    renderCatalog();
  } catch (error) { $('vn-library-count').textContent = error.message || '작품 목록 오류'; toast(error.message || '작품 목록 오류'); }
}

function openingText() { return $('feed')?.querySelector('.opening-scene .prose')?.textContent?.trim() || $('heroEventSummary')?.textContent?.trim() || state.api._scenario()?.summary || '새로운 이야기가 시작됩니다.'; }
function openingPages() { return pagesForTurn({ id: 'opening', text: openingText() }, -1, 150); }

const collectPublishedPages = createPageCollector();
function schedulePersonalCloud(...args){if(!host.multiplayer)cloudDialog.schedule(...args); }
function collectPages() {
  const turns = state.api._turns();
  const pages = collectPublishedPages(turns);
  if (pages.length) return pages;
  const text = openingText();
  if (state.openingPagesText !== text) { state.openingPagesText = text; state.openingPagesCache = openingPages(); }
  return state.openingPagesCache;
}

function setBackground(url, eventCharacterIds = []) {
  if (state.backgroundUrl === url) return;
  // Asset arrival crossfades; a chapter cut is driven by location, not image loading.
  state.backgroundUrl = url;
  const sequence = ++state.backdropSequence;
  const apply = () => {
  if (sequence !== state.backdropSequence) return;
  const next = state.backgroundSide === 'a' ? 'b' : 'a';
  const incoming = $(`vn-background-${next}`);
  const outgoing = $(`vn-background-${state.backgroundSide}`);
  incoming.style.backgroundImage = url ? `url("${url.replaceAll('"', '%22')}")` : '';
  incoming.classList.toggle('has-image', Boolean(url));
  incoming.classList.add('is-active');
  outgoing.classList.remove('is-active');
  state.backgroundSide = next;
  state.backgroundDisplayedUrl = url;
  const previousIds = state.eventCharacterIds || [];
  state.eventCharacterIds = eventCharacterIds;
  state.fadingEventIds = previousIds.filter(id => !eventCharacterIds.includes(id));
  clearTimeout(state.eventFadeTimer);
  state.eventFadeTimer = setTimeout(() => { state.fadingEventIds = []; if (state.screen === 'stage') renderPage(); }, 700);
  if (state.screen === 'stage') queueMicrotask(renderPage);
  };
  if (url) { const preload = new Image(); preload.onload = apply; preload.onerror = () => { if (sequence === state.backdropSequence) toast('배경을 불러오지 못했습니다.'); }; preload.src = url; }
  else apply();
}

// Actors keep their place while present and slide when the line-up changes.
// Positions, widths and height scale are CSS variables so moves transition.
function setPortraits(view, speakerId) {
  const container = $('vn-characters');
  const portraits = view?.portraits || [];
  const ghosts = view?.status === 'generating' && view.castStatus === 'ready' ? (view.pending || []).map(person => ({ ...person, placeholder: true })) : [];
  const people = [...portraits, ...ghosts.filter(ghost => !portraits.some(person => person.id === ghost.id))];
  const ids = new Set(people.map(person => person.id));
  for (const node of [...container.children]) if (!ids.has(node.dataset.characterId) && !node.classList.contains('is-leaving')) {
    // Leave toward the nearer edge of the stage.
    node.style.setProperty('--exit', Number(node.style.getPropertyValue('--x') || .5) < .5 ? '-34px' : '34px');
    node.classList.add('is-leaving'); setTimeout(() => { if (node.classList.contains('is-leaving')) node.remove(); }, 480);
  }
  state.stageOrder = stageOrder(state.stageOrder, people.map(person => person.id));
  const narrow = innerWidth <= 760, compactLandscape = innerHeight <= 600 && innerWidth > innerHeight;
  const positions = stagePositions(state.stageOrder.length, { layout: state.reading.layout, narrow, compactLandscape }), width = slotWidth(state.stageOrder.length, narrow);
  const performance=view?.direction?.performance;
  const blocking=sceneBlocking.place({sceneKey:String(state.activeSlug)+':'+String(view?.environment||''),actors:performance?.actors,ids:state.stageOrder,positions,focusId:state.focusId||speakerId,requested:performance?.framing});
  container.dataset.count = String(people.length);
  container.classList.toggle('has-speaker', Boolean(speakerId && portraits.some(person => person.id === speakerId)));
  for (const person of people) {
    const index = state.stageOrder.indexOf(person.id);
    let slot = [...container.children].find(node => node.dataset.characterId === person.id && !node.classList.contains('is-leaving'));
    if (!slot) {
      slot = document.createElement('div'); slot.className = 'vn-character is-entering'; slot.dataset.characterId = person.id;
      slot.style.setProperty('--breath-delay', `${breathDelay(person.id).toFixed(2)}s`);
      // Enter from the side the person will stand on.
      slot.style.setProperty('--enter', positions[index] < 0.5 ? '-28px' : '28px');
      container.append(slot); requestAnimationFrame(() => requestAnimationFrame(() => slot.classList.remove('is-entering')));
    }
    const placement=blocking[index];
    slot.style.setProperty('--x',String(placement?.x??positions[index]));
    slot.style.setProperty('--scene-depth',String(placement?.depth||1));
    slot.dataset.pose=person.pose||'standing';
    slot.dataset.facing=placement?.facing||'front';
    slot.style.setProperty('--w', String(width));
    const framing = framingFor(localStorage, sceneScope(), person.id);
    const stature = projectStature(person, view.referenceHeightCm || 178);
    slot.dataset.heightCm = String(stature.heightCm);
    slot.style.setProperty('--hs', String(stature.scale));
    slot.style.setProperty('--stature-lift', String(stature.lift));
    slot.style.setProperty('--frame-scale', String(framing.scale)); slot.style.setProperty('--frame-offset', `${framing.offset * 100}%`);
    // Hide only the people actually drawn in the decoded event background.
    // Keep their slots and portrait images ready for the return to normal play.
    slot.hidden = [...(state.eventCharacterIds || []), ...(state.fadingEventIds || [])].includes(person.id);
    slot.style.zIndex = person.id === speakerId ? '5' : String(1 + index);
    const speaking = person.id === speakerId;
    if (speaking && !slot.classList.contains('is-speaking') && !motionReduced()) slot.querySelector('.vn-character-image.is-visible')?.animate([{ translate: '0 0' }, { translate: '0 -1.2%' }, { translate: '0 0' }], { duration: 260, easing: 'ease-out' });
    slot.classList.toggle('is-speaking', speaking);
    slot.classList.add('is-present');
    slot.classList.toggle('is-focus', person.id === (state.focusId || speakerId));
    slot.classList.toggle('is-placeholder', Boolean(person.placeholder));
    if (person.placeholder) {
      if (!slot.querySelector('.vn-ghost')) { const ghost = document.createElement('div'); ghost.className = 'vn-ghost'; const label = document.createElement('span'); label.textContent = person.name; ghost.append(label); slot.append(ghost); }
      continue;
    }
    // Keep the already visible face while a needed new expression is being made.
    if (person.expressionReady === false && slot.vnReadyUrl && slot.vnBaseKey === person.baseKey) continue;
    slot.vnBaseKey = person.baseKey;
    const url = person.url, displayKey = `${url}|${state.reading.faceCompose}`;
    const motionSources = [url, person.motion?.blink || '', person.motion?.talk || '', person.base || ''];
    if (!slot.vnMotionSources || motionSources.some((src, index) => src !== slot.vnMotionSources[index])) {
      slot.vnMotionSources = motionSources; slot.vnMotion = null; holdDisplay(slot, []);
      if (person.motion?.blink || person.motion?.talk) void prepareMotionFrames(...motionSources).then(frames => {
        if (slot.isConnected && slot.vnMotionSources === motionSources) { slot.vnMotion = frames; holdDisplay(slot, [frames.base, frames.blink, frames.talk, frames.both]); }
      }).catch(() => { /* Original sprite remains visible. */ });
    }
    // Kept as a property: data-URL keys are too large for DOM attributes.
    if (slot.vnDisplayKey === displayKey) continue;
    slot.vnDisplayKey = displayKey; slot.vnFailedUrl = '';
    const displayFailed = () => {
      if (!slot.isConnected || slot.vnDisplayKey !== displayKey) return;
      slot.vnFailedUrl = url; slot.vnReadyUrl = '';
      toast('인물 이미지를 표시하지 못했습니다. 새로고침 후 다시 시도해 주세요.'); requestRender();
    };
    // Optional face-only expression change; never with motion frames, which
    // were cut from the full expression picture.
    const finishDecode = diagnostics.start('decode');
    const compose = state.reading.faceCompose === 'on' && person.base && person.base !== url && person.expression !== 'neutral' && !person.motion?.blink && !person.motion?.talk;
    void (compose ? faceComposite(person.base, url) : Promise.resolve(url)).then(source => displaySprite(source, source, person.base || "")).then(src => {
      if (!slot.isConnected || slot.vnDisplayKey !== displayKey) return;
      const incoming = document.createElement('img'); setDisplayImage(incoming, src); incoming.alt = `${person.name} · ${person.expression}`; incoming.className = 'vn-character-image';
      incoming.vnSource = url; incoming.vnStaticSrc = src;
      const previous = [...slot.children];
      incoming.onload = () => {
        finishDecode();
        if (!slot.isConnected || slot.vnDisplayKey !== displayKey) return incoming.remove();
        incoming.onload = null;
        incoming.classList.add('is-visible'); slot.vnReadyUrl = url;
        // The new expression fades in over the old one; the old face is only
        // removed once covered, so the figure never turns see-through.
        setTimeout(() => { for (const node of previous) node.classList.remove('is-visible'); setTimeout(() => previous.forEach(node => node.remove()), 200); }, 240);
        requestRender();
      };
      incoming.onerror = displayFailed;
      slot.append(incoming);
    }).catch(displayFailed);
  }
}

function pageScene(page) {
  if (!page) return null;
  const turns = state.api._turns(), turn = page.turnIndex < 0 ? { id: 'opening', status: 'COMMITTED', text: openingText() } : turns[page.turnIndex];
  if (!turn) return null;
  const priorTurns = turns.slice(0, Math.max(0, page.turnIndex));
  const unit = publishedUnit(turn, page, priorTurns.at(-1)?.text || '');
  const previous = priorTurns.at(-1)?.vnScene || state.openingScene;
  const original = state.api._scenario();
  const priorWorld = environmentContinuity.before(state.openingScene?.world || turns.find(row => row.vnScene?.world)?.vnScene.world || original.world, priorTurns);
  const proposedWorld = turn.vnScene?.world || priorWorld;
  const world = continueEnvironment(priorWorld, proposedWorld, unit.prefix.slice(0, page.end ?? unit.end));
  const annotations = (turn.dialogueAnnotations || []).filter(row => Number(row.offset) < unit.end);
  const key = JSON.stringify([sceneScope(), turn.id, unit.start, unit.prefix, unit.previousText, unit.ready, world, annotations]);
  if (state.stageScenes.has(key)) return state.stageScenes.get(key);
  // Direct published prefixes independently from the final turn snapshot. This
  // releases public appearance gates without inspecting the writer's draft.
  const scene = captureScene({ scope: sceneScope(), scenario: { ...original, world },
    turn: { ...turn, status: 'COMMITTED', text: unit.prefix, displayText: undefined,
      dialogueAnnotations: annotations },
    priorTurns, previous, timeline: true, experience: window.CortexTurnExperience });
  // Only earlier published prose may establish an outfit. Never inspect the
  // rest of the current paragraph/turn to dress an earlier beat in future clothes.
  const wardrobeHistory = [page.turnIndex >= 0 ? openingText() : '', ...priorTurns.slice(0, -1).map(row => row.text || ''), unit.previousText].join('\n');
  Object.assign(scene, { publicText: unit.text, previousText: unit.previousText, wardrobeHistory, castPages: unit.pages, castPending: !unit.ready, unitKey: key });
  state.stageScenes.set(key, scene);
  if (state.stageScenes.size > 256) state.stageScenes.delete(state.stageScenes.keys().next().value);
  return scene;
}
function presentationPage(_scene, page) { return page; }

function publicRecommendations() {
  const turn = state.api._turns().at(-1);
  if (turn?.status !== 'COMMITTED' || turn?.metrics?.authorRecommendations?.status !== 'ACCEPTED') return [];
  return Array.isArray(turn.recommendations) ? turn.recommendations.filter(row => row?.source === 'SAME_TURN_PROSE_WRITER' && String(row?.label || '').trim()).slice(0, 3) : [];
}

function renderActions() {
  if(host.multiplayer&&!multiplayerState.canWrite){$('vn-actions').hidden=true;$('vn-suggestions').replaceChildren();$('vn-compose').hidden=true;return;}
  $('vn-actions').hidden = !state.actions;
  if (!state.actions) return;
  const list = $('vn-suggestions'); list.replaceChildren();
  for (const [index, row] of publicRecommendations().entries()) {
    const button = document.createElement('button'); button.type = 'button';
    button.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span><strong></strong><i>↗</i>`;
    button.querySelector('strong').textContent = row.label;
    button.disabled = (host.multiplayer && !multiplayerState.canWrite) || busy() || state.awaitingTurn || Boolean(storageProblem(state.api));
    button.addEventListener('click', () => { sound.play('choice'); void submit(row.label); }); list.append(button);
  }
  $('vn-compose').hidden = !state.customInputOpen;
  $('vn-custom-toggle').hidden = state.customInputOpen;
  $('vn-custom-toggle').textContent = '직접 행동이나 대사 입력';
  $('vn-continue').disabled = (host.multiplayer && !multiplayerState.canWrite) || busy() || state.awaitingTurn || Boolean(storageProblem(state.api));
  $('vn-send').disabled = $('vn-continue').disabled;
  const page = state.pages[state.cursor], scene = pageScene(page), view = assets.view(scene, page);
  $('vn-retry-image').textContent = '이미지 생성 재시도';
  $('vn-retry-image').hidden = !scene || (view?.status !== 'error' && view?.cgStatus !== 'error');
}

function resetReader() {
  environmentContinuity.reset();
  cueWindow.reset(); artContinuity.reset(); compositionContinuity.reset(); state.presentedView = null;
  musicDirection.reset();
  voice.reset(); state.voiceLine = null;
  dialogueGrace.clear(); clearTimeout(dialogueGraceTimer); dialogueGraceTimer = 0;
  stopPlayback(); state.reveal.reset(); state.reveal.frameKey = '';
  preparationQueue.clear();
  state.stageScenes.clear(); state.preparedBeats.clear(); state.dialogueBypass.clear(); state.dialogueWaiting = false;
  state.pages = []; state.cursor = 0; state.readThrough = -1;
  state.lastDirectionKey = ''; state.lastScene = null; state.awaitingTurn = false;
  state.stageOrder = []; state.speakerNames.clear(); state.firedEffects.clear(); state.focusId = '';
  cinema.reset(); workMusic.stop();
  state.readerWork = `dancheong-vn-position-v1:${sceneScope()}`;
  try { state.bookmark = JSON.parse(localStorage.getItem(state.readerWork) || 'null'); } catch { state.bookmark = null; }
  state.metKey = `dancheong-vn-met-v1:${sceneScope()}`;
  try { const stored = JSON.parse(localStorage.getItem(state.metKey) || '[]'); state.met = Array.isArray(stored) ? stored.filter(row => row?.id) : []; } catch { state.met = []; }
  setTextHidden(false);
}
function saveReadingPosition() {
  if (!state.readerWork || !state.pages[state.cursor]) return;
  const value = JSON.stringify({ cursor: pageKey(state.pages[state.cursor]), read: pageKey(state.pages[state.readThrough]) });
  if (state.savedReaderWork === state.readerWork && state.savedReaderValue === value) return;
  try { localStorage.setItem(state.readerWork, value); state.savedReaderWork = state.readerWork; state.savedReaderValue = value; } catch { /* Playback still works without durable progress. */ }
  if (!state.slotTask && !state.switching) schedulePersonalCloud(120000);
}
function revealComplete() {
  if (state.dialogueWaiting) return;
  if (!state.pages[state.cursor]?.isGrowing) state.readThrough = Math.max(state.readThrough, state.cursor);
  $('vn-stage').classList.remove('is-revealing');
  updateNextBuffer();
  saveReadingPosition(); schedulePlayback();
}
function finishReveal() {
  if (state.dialogueWaiting) return false;
  return state.reveal.finish();
}
function renderRevealedText(page) {
  const reveal = state.reveal, nvl = state.reading.layout === 'nvl';
  const compactLandscape = innerHeight <= 600 && innerWidth > innerHeight;
  const columns = Math.max(14, Math.floor((compactLandscape ? innerWidth * .54 : innerWidth < 760 ? innerWidth - 48 : Math.min(innerWidth * 0.72, 980)) / (compactLandscape ? 18 : innerWidth < 760 ? 20 : 27) / (state.reading.font === 'large' ? 1.18 : 1)));
  const frame = nvl ? readingFrame(state.pages, state.cursor, { columns, lineBudget: innerHeight < 500 ? 5 : 8 }) : [{ page, index: state.cursor, text: page.text }];
  const layout = typeset(String(frame.at(-1)?.text || '…'),state.presentedView?.direction?.emphasis?.text||''), full = layout.visible || '…';
  const key = pageKey(page), frameKey = `${key}:${state.reading.layout}:${columns}:${frame[0]?.index}`;
  if (key !== reveal.key || full !== reveal.text) { clearTimeout(state.playbackTimer); state.playbackTimer = 0; }
  const surface = $('vn-dialogue-text');
  // NVL keeps each line's speaker: a small label above spoken lines, in a
  // stable per-person accent, remembered once the cast check names them.
  const remember = (rowKey, resolved) => { if (resolved.speakerResolved) state.speakerNames.set(rowKey, resolved.speaker ? { name: resolved.speaker, id: resolved.characterId || resolved.speaker, tentative: Boolean(resolved.speakerTentative) } : null); };
  remember(key, page);
  // Earlier lines of the frame may not have been current in this session (for
  // example after a reload). Resolve them from their own verified cast view.
  const speakerOf = row => {
    if (row.page.kind !== 'dialogue' && !row.page.quoted) return null;
    const rowKey = pageKey(row.page);
    if (!state.speakerNames.has(rowKey) || state.speakerNames.get(rowKey)?.tentative) {
      const rowScene = pageScene(row.page);
      const rowView = rowScene ? assets.view(rowScene, row.page) : null;
      remember(rowKey, resolvedSpeaker(row.page, rowView));
      // The forward preparation window does not load paragraphs behind the
      // bookmark. Restore cached cast for earlier visible lines after reload.
      // Queue this after rendering to avoid a synchronous onChange re-entry.
      const restoreKey = rowScene && `restore-speaker:${rowScene.unitKey}`;
      if (rowScene && rowView?.castStatus !== 'ready' && row.index < state.cursor && rowScene.unitKey !== pageScene(page)?.unitKey && !state.preparedBeats.has(restoreKey)) {
        state.preparedBeats.add(restoreKey);
        queueMicrotask(() => { void castDirector.prepare(rowScene, { generate: false, page: row.page }).catch(() => {}); });
      }
    }
    return state.speakerNames.get(rowKey) || null;
  };
  if (frameKey !== reveal.frameKey) {
    surface.replaceChildren(); reveal.frameKey = frameKey;
    for (const [index, row] of frame.entries()) {
      const line = document.createElement('p');
      line.className = index === frame.length - 1 ? 'vn-current-line' : 'vn-read-line';
      const label = document.createElement('span'); label.className = 'vn-line-speaker'; label.hidden = true;
      const copy = document.createElement('span'); copy.className = 'vn-line-text';
      if (index < frame.length - 1) { renderTypeset(copy, typeset(row.text)); copy.vnSource = row.text; }
      line.append(label, copy); surface.append(line);
      if (index === frame.length - 1) {
        reveal.element = copy;
        const buffer = document.createElement('span'); buffer.className = 'vn-inline-buffer'; buffer.hidden = true;
        reveal.indicator = buffer;
        buffer.setAttribute('role', 'status'); buffer.setAttribute('aria-label', '다음 문장 준비 중');
        for (let dot = 0; dot < 3; dot++) { const item = document.createElement('i'); item.setAttribute('aria-hidden', 'true'); buffer.append(item); }
        line.append(buffer);
      }
    }
  }
  for (const [index, row] of frame.entries()) {
    const line = surface.children[index], speaker = speakerOf(row);
    line.classList.toggle('is-spoken', Boolean(speaker) || row.page.kind === 'dialogue');
    const label = line.firstElementChild, copy = line.querySelector('.vn-line-text');
    label.hidden = !speaker;
    label.classList.toggle('is-tentative', Boolean(speaker?.tentative));
    label.title = speaker?.tentative ? '작가 주석 기준 · 현장 인물 확인 전' : '';
    if (speaker && label.textContent !== speaker.name) label.textContent = speaker.name;
    if (speaker) line.style.setProperty('--speaker-hue', String(speakerHue(speaker.id)));
    if (index < frame.length - 1 && copy.vnSource !== row.text) { renderTypeset(copy, typeset(row.text)); copy.vnSource = row.text; }
  }
  if (!reveal.layout || reveal.layout.visible !== layout.visible || JSON.stringify(reveal.layout.segments) !== JSON.stringify(layout.segments)) reveal.layout = layout;
  if(host.multiplayer)renderMultiplayerText({key,text:full});
  else reveal.update({ key, text: state.dialogueWaiting ? '' : full, speed: state.api._settings()?.typingSpeed,
    immediate: !state.dialogueWaiting && (state.cursor <= state.readThrough || state.playback === 'skip') });
  $('vn-stage').classList.toggle('is-revealing', reveal.length < reveal.glyphs.length);
  updateNextBuffer();
}
function updateNextBuffer() {
  if (!state.reveal.indicator || !state.api) return;
  const reason = textWait.reason({ key: state.reveal.key, length: state.reveal.length, total: state.reveal.glyphs.length,
    paused: cinema.blocked || state.actions || state.screen !== 'stage' || document.hidden || state.hideText || Boolean(document.querySelector('dialog[open]')) || !$('vn-history').hidden || root.classList.contains('vn-menu-open'),
    growing: Boolean(state.pages[state.cursor]?.isGrowing), loading: state.awaitingTurn || busy(),
    hasNext: Boolean(state.pages[state.cursor + 1]), waitingImages: state.dialogueWaiting });
  setInlineBuffer(reason);
}
function setInlineBuffer(reason) {
  const indicator = state.reveal.indicator;
  if (!indicator) return;
  indicator.hidden = !reason;
  indicator.setAttribute('aria-label', reason || '다음 문장 준비 중');
  indicator.title = reason;
  $('vn-stage').classList.toggle('is-buffering-next', Boolean(reason));
}
// Narration attached to a spoken line ("…라고 속삭였다") and whether the
// director marked it as the paragraph's key line; both shape the acting.
function voiceDelivery(page, view) {
  const at = state.pages.indexOf(state.pages[state.cursor]);
  const near = [state.pages[at - 1], state.pages[at + 1]].filter(row => row && row.turnId === page.turnId && !row.quoted && row.kind !== 'dialogue' && Math.min(Math.abs(row.start - page.end), Math.abs(page.start - row.end)) <= 3);
  const emphasis = view?.direction?.emphasis;
  const spoken = String(page.rawText || page.text || '');
  // Neighbouring published lines, for Typecast's context-aware ("smart") emotion.
  const around = (from, to) => state.pages.slice(Math.max(0, from), Math.max(0, to)).filter(row => row?.turnId === page.turnId && !row.isGrowing).map(row => String(row.rawText || row.text || '')).join(' ');
  return { cue: [near.map(row => String(row.rawText || row.text || '')).join(' '),deliveryNotes[view?.direction?.performance?.delivery]||''].filter(Boolean).join(' ').slice(0, 240), before: around(at - 3, at).slice(-600), after: around(at + 1, at + 3).slice(0, 600),
    emphasis: Boolean(emphasis?.kind && emphasis.kind !== 'none' && emphasis.text && spoken.includes(emphasis.text)) };
}
function stopPlayback() {
  const full = state.playback === 'full';
  clearTimeout(state.playbackTimer); state.playbackTimer = 0; state.playback = 'manual';
  state.fullAutoVoice = null;
  state.fullAutoArt = null; state.fullAutoArtWaitPage = '';
  for (const id of ['vn-auto', 'vn-skip', 'vn-full-auto']) $(id)?.setAttribute('aria-pressed', 'false');
  if ($('vn-full-auto')) $('vn-full-auto').textContent = '완전 자동';
  if (full) { voice.reset(); updateVoiceControls(); }
}
function playbackBlocked(full = false) { return cinema.blocked || performancePlayer.blocked || state.dialogueWaiting || state.screen !== 'stage' || (!full && (state.actions || state.awaitingTurn)) || document.hidden || state.hideText || Boolean(document.querySelector('dialog[open]')) || !$('vn-history').hidden || root.classList.contains('vn-menu-open'); }
function fullPlaybackStep() {
  // Hold the existing autoplay mode across recovery. No continuation request
  // may bypass the save barrier or allocate a second copy of a pending beat.
  if (state.autoRecovery?.waiting || state.judgeRecovery) return { action: 'wait' };
  const last = state.api?._turns().at(-1), scenario = state.api?._scenario();
  const page = state.pages[state.cursor], scene = pageScene(page); let view = state.presentedPageKey === pageKey(page) ? state.presentedView : assets.view(scene, presentationPage(scene, page));
  if (view?.identityIssue && state.recheckedIdentityPage !== pageKey(page)) {
    state.recheckedIdentityPage = pageKey(page);
    castDirector.recheck(scene, presentationPage(scene, page));
    view = assets.view(scene, presentationPage(scene, page));
  }
  state.fullAutoArt = fullAutoVisuals(view, {
    offCamera: ['thought', 'scenery'].includes($('vn-stage').dataset.composition),
    displayed: [...$('vn-characters').children].map(slot => ({ id: slot.dataset.characterId, url: slot.vnReadyUrl, baseKey: slot.vnBaseKey, failedUrl: slot.vnFailedUrl, hidden: slot.hidden || slot.classList.contains('is-leaving') })),
    eventDecoded: Boolean(view?.eventBackground && state.backgroundDisplayedUrl === view.eventBackground), canPrepare: hasImageKey(),
  });
  if (state.fullAutoArt.action === 'wait') state.fullAutoArtWaitPage = pageKey(page);
  const ended = storyComplete(scenario), locked = Boolean($('send')?.disabled);
  const problem = storageProblem(state.api)?.message || (state.api?._pendingRecovery?.() ? '먼저 진행상황에서 복구를 완료해 주세요.' : '')
    || (pendingAdjudication(state.api) && !locked && !state.awaitingTurn && !autoContinuation.running ? '판정 보완이 필요해 완전 자동을 멈췄습니다. 진행상황을 확인해 주세요.' : '')
    || (!textKey() || !voiceKey() ? `본문 생성과 AI 음성(${ttsProvider(state.reading.voiceProvider).keyLabel})을 위한 API 키를 확인해 주세요.` : '')
    || (familyOf() === 'typecast' && !typecastVoices().length ? '음성·음악 설정에서 Typecast 캐릭터 목록을 먼저 불러와 주세요.' : '')
    || (mediaPaused(state.activeSlug, 'voice') ? '저장 공간 관리에서 음성 생성을 다시 켜 주세요.' : '');
  return fullAutoStep({ problem, visual: state.fullAutoArt, ended, tailStatus: last?.status, hasPage: Boolean(state.pages[state.cursor]), hasNext: state.cursor < state.pages.length - 1,
    blocked: playbackBlocked(true), revealing: Boolean(state.reveal.timer), growing: state.pages[state.cursor]?.isGrowing,
    voicePhase: voice.phase, hasVoice: Boolean(state.voiceLine), busy: busy(), awaiting: state.awaitingTurn || autoContinuation.running,
    engineLocked: locked && !ended, draft: Boolean($('vn-input').value.trim() || $('input')?.value.trim()) });
}
function stopFullAuto(reason) { stopPlayback(); if (reason) toast(reason); }
function scheduleFullPlayback() {
  const step = fullPlaybackStep();
  if (step.action === 'stop') { stopFullAuto(step.reason); return; }
  updateVoiceControls();
  if (step.action === 'wait') { clearTimeout(state.playbackTimer); state.playbackTimer = 0; return; }
  if (state.playbackTimer) return;
  const current = pageKey(state.pages[state.cursor]), scope = sceneScope();
  state.playbackTimer = setTimeout(() => {
    state.playbackTimer = 0;
    if (state.playback !== 'full' || sceneScope() !== scope || pageKey(state.pages[state.cursor]) !== current) return;
    const next = fullPlaybackStep();
    if (next.action === 'stop') stopFullAuto(next.reason);
    else if (next.action === 'advance') nextPage(true);
    else if (next.action === 'continue') {
      const turnKey = `${scope}:${state.api._turns().at(-1)?.id || 'opening'}`;
      void autoContinuation.run(turnKey, () => submit('', true, { automated: true })).catch(error => stopFullAuto(error?.message || '자동 진행을 완료하지 못했습니다.'));
    }
  }, Math.max(state.fullAutoArtWaitPage === current ? 1500 : 0,
    state.voiceLine ? (step.action === 'continue' ? 1400 : 700) : readDelay(state.pages[state.cursor]?.text, state.reading.pace)));
}
function schedulePlayback() {
  if(host.multiplayer){scheduleMultiplayerPlayback();return;}
  if (state.playback === 'full') { scheduleFullPlayback(); return; }
  if (state.playback === 'manual' || state.playbackTimer || state.reveal.timer || state.pages[state.cursor]?.isGrowing || playbackBlocked()) return;
  const mode = state.playback, current = pageKey(state.pages[state.cursor]);
  state.playbackTimer = setTimeout(() => {
    state.playbackTimer = 0;
    if (state.playback !== mode || current !== pageKey(state.pages[state.cursor])) return;
    const action = nextPlaybackStep({ mode, cursor: state.cursor, length: state.pages.length, readThrough: state.readThrough, blocked: playbackBlocked(), revealing: Boolean(state.reveal.timer), streaming: busy() });
    if (action === 'advance') nextPage(true);
    else if (action === 'stop') {
      stopPlayback();
      if (state.cursor === state.pages.length - 1) { state.actions = true; state.customInputOpen = false; renderPage(); }
    }
  }, mode === 'skip' ? 120 : readDelay(state.pages[state.cursor]?.text, state.reading.pace));
}
function togglePlayback(mode) {
  if(host.multiplayer)return;
  const next = state.playback === mode ? 'manual' : mode; stopPlayback();
  if (next === 'manual') return;
  if (playbackBlocked()) return toast('장면을 읽는 화면에서 사용할 수 있습니다.');
  if (next === 'skip' && state.cursor >= state.readThrough) return toast('여기까지 읽었습니다.');
  state.playback = next; $(next === 'auto' ? 'vn-auto' : 'vn-skip').setAttribute('aria-pressed', 'true');
  schedulePlayback();
}
function toggleFullPlayback() {
  if(host.multiplayer)return;
  if (state.playback === 'full') { stopPlayback(); return; }
  if (state.screen !== 'stage' || document.hidden || document.querySelector('dialog[open]')) return;
  if (!$('vn-history').hidden || root.classList.contains('vn-menu-open')) return toast('기록이나 메뉴를 닫고 완전 자동을 켜 주세요.');
  if (!textKey() || !voiceKey()) { openSettings(); toast(`완전 자동에는 본문 생성 키와 AI 음성용 ${ttsProvider(state.reading.voiceProvider).keyLabel} API 키가 필요합니다.`); return; }
  if (familyOf() === 'typecast' && !typecastVoices().length) { settingsTab('audio'); openSettings(); return toast('Typecast 캐릭터 목록을 먼저 불러와 주세요.'); }
  if (autoContinuation.running || state.awaitingTurn) return toast('현재 요청이 끝난 뒤 완전 자동을 켜 주세요.');
  if ($('vn-input').value.trim() || $('input')?.value.trim()) return toast('입력 중인 내용을 먼저 전송하거나 지워 주세요.');
  const issue = storageProblem(state.api)?.message;
  if (issue || mediaPaused(state.activeSlug, 'voice')) return toast(issue || '저장 공간 관리에서 음성 생성을 다시 켜 주세요.');
  stopPlayback(); voice.reset(); voice.resume(); autoContinuation.reset();
  state.playback = 'full'; state.actions = false; state.customInputOpen = false; state.hideText = false;
  $('vn-stage').classList.remove('is-text-hidden'); $('vn-show-text').hidden = true;
  $('vn-full-auto').setAttribute('aria-pressed', 'true'); $('vn-full-auto').textContent = '자동 중지';
  toast('완전 자동 시작 · AI 음성과 장면 이어가기 · API 사용료가 발생합니다.');
  renderPage();
}
function setTextHidden(hidden) {
  stopPlayback(); state.hideText = hidden;
  $('vn-stage').classList.toggle('is-text-hidden', hidden); $('vn-show-text').hidden = !hidden;
}
function openHistory() {
  voice.stop();
  stopPlayback(); closeMenu(); finishReveal(); renderHistory(); $('vn-history').hidden = false;
  $('vn-history-list').lastElementChild?.scrollIntoView({ block: 'end' });
  $('vn-history-close').focus();
}
function motionReduced() { return state.reading.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches; }
function flash(color, duration, peak) {
  flashLayer.style.background = color;
  flashLayer.animate([{ opacity: 0 }, { opacity: peak, offset: 0.12 }, { opacity: 0 }], { duration, easing: 'ease-out' });
}
function playTransition(kind) {
  if (state.reading.cinema === 'on' && cinema.transition(kind)) return;
  const cut = $('vn-scene-cut');
  if (kind === 'fade') cut.animate([{ opacity: 0 }, { opacity: 0.92, offset: 0.35 }, { opacity: 0 }], { duration: 950 });
  if (kind === 'wipe') cut.animate([{ opacity: 1, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)', offset: 0.45 }, { opacity: 1, clipPath: 'inset(0 0 0 100%)' }], { duration: 1050, easing: 'ease-in-out' });
  if (kind === 'blur') visual.animate([{ filter: 'blur(14px) brightness(.55)' }, { filter: 'blur(0) brightness(1)' }], { duration: 1400, easing: 'ease-out' });
  if (kind === 'flash') flash('#ffffff', 560, 0.85);
}
function playEffect(kind) {
  if (state.reading.cinema === 'on') cinema.impact();
  if (kind === 'shake') visual.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-5px,1px)', offset: 0.2 }, { transform: 'translate(4px,-1px)', offset: 0.45 }, { transform: 'translate(-2px,0)', offset: 0.7 }, { transform: 'translate(0,0)' }], { duration: 280 });
  if (kind === 'heavy_shake') visual.animate([{ transform: 'translate(0,0) scale(1.02)' }, { transform: 'translate(-12px,6px) scale(1.02)', offset: 0.15 }, { transform: 'translate(10px,-7px) scale(1.02)', offset: 0.35 }, { transform: 'translate(-7px,4px) scale(1.01)', offset: 0.55 }, { transform: 'translate(4px,-2px)', offset: 0.75 }, { transform: 'translate(0,0)' }], { duration: 480 });
  if (kind === 'flash_white') { flash('#ffffff', 420, 0.95); playEffect('shake'); }
  if (kind === 'flash_red') { flash('radial-gradient(circle,#b3121b55 30%,#6d0008 100%)', 760, 0.8); playEffect('shake'); }
}
const EYECATCH_LABEL = { dawn: 'DAWN', day: 'DAY', dusk: 'EVENING', night: 'NIGHT' };
function showEyecatch(world) {
  eyecatch.querySelector('span').textContent = EYECATCH_LABEL[lightFor(world.time)] || '';
  eyecatch.querySelector('strong').textContent = String(world.time || '').slice(0, 40);
  eyecatch.querySelector('small').textContent = String(world.location || '').slice(0, 60);
  eyecatch.hidden = false; eyecatch.classList.remove('is-playing'); void eyecatch.offsetWidth; eyecatch.classList.add('is-playing');
  clearTimeout(state.eyecatchTimer); state.eyecatchTimer = setTimeout(() => { eyecatch.hidden = true; eyecatch.classList.remove('is-playing'); }, 2300);
}
function applyDirection(page, scene, view) {
  const stage = $('vn-stage');
  // Environment grading works on every beat, including streaming ones.
  stage.dataset.light = lightFor(scene?.world?.time || '');
  stage.dataset.weather = weatherFor(scene?.world);
  const grade=lightingGrade(stage.dataset.light,stage.dataset.weather,view?.direction?.performance?.lighting);
  stage.dataset.backlit=String(grade.backlit);
  stage.style.setProperty('--actor-brightness',String((grade.red+grade.green+grade.blue)/3*grade.brightness));
  stage.style.setProperty('--actor-warmth',String(Math.max(0,grade.warm)));
  stage.style.setProperty('--actor-saturation',String(grade.saturation));
  if (page.isLive) return;
  const model = view?.direction || null, key = pageKey(page), directionKey = `${key}:${model ? JSON.stringify(model) : ''}`;
  // Effects are checked again after decoding/waiting, without replaying cuts.
  // A model decision can arrive after a narration beat is shown. Then only the
  // framing updates; location cuts belong to the first arrival on the beat.
  const refresh = state.lastDirectionKey.startsWith(`${key}:`);
  const transition = refresh ? 'none' : transitionFor(state.lastScene, scene);
  const previousLight = state.lastScene?.world?.time ? lightFor(state.lastScene.world.time) : '';
  state.lastDirectionKey = directionKey; state.lastScene = scene;
  // Eyecatch: a short full-screen time card when the story moves to another
  // part of the day, the first time it is read.
  if (transition !== 'none' && previousLight && scene?.world?.time && previousLight !== lightFor(scene.world.time) && state.cursor > state.readThrough && state.reading.cinema === 'on' && !motionReduced()) showEyecatch(scene.world);
  const direction = mergeDirection(directionAt(state.pages, state.cursor, scene), model);
  state.focusId = direction.focusId;
  stage.dataset.shot = direction.shot;
  stage.dataset.mood = direction.mood;
  stage.classList.toggle('is-memory', direction.memory);
  state.ambienceTarget = ambienceFor(scene?.world, { mood: direction.mood, memory: direction.memory, light: stage.dataset.light, weather: stage.dataset.weather });
  const reduced = motionReduced();
  if (transition !== 'none') {
    const label = $('vn-scene-label');
    label.textContent = [scene?.world?.location, scene?.world?.time].filter(Boolean).join('  /  ');
    label.getAnimations().forEach(animation => animation.cancel());
    if (!reduced) label.animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .68 }, { opacity: 0 }], { duration: 2100 });
    if (!reduced) playTransition(direction.transition === 'none' ? transition === 'location' ? 'fade' : 'wipe' : direction.transition);
  }
  // One-shot effects play once, on the first reading of a beat.
  if (reduced || state.cursor <= state.readThrough || !state.cueOpen || view?.eventBackground && state.backgroundDisplayedUrl !== view.eventBackground) return;
  if (transition === 'none' && direction.transition !== 'none' && !state.firedEffects.has(`${key}:t`)) { state.firedEffects.add(`${key}:t`); playTransition(direction.transition); }
  // Impact is dispatched at its text anchor by performancePlayer.
  if (state.firedEffects.size > 400) state.firedEffects.clear();
}

// Asset/cache notifications often arrive in one burst. Paint once per frame,
// while direct reader gestures still render immediately.
let renderFrame = 0;
function requestRender() {
  if (renderFrame || !state.api || state.screen !== 'stage' || document.hidden) return;
  renderFrame = requestAnimationFrame(() => { renderFrame = 0; if (state.screen === 'stage' && !document.hidden) renderPage(); });
}
function renderPage() {
  if (!host.active || !host.isReady()) return;
  if(host.multiplayer&&!alignMultiplayerPlayback())return;
  if (renderFrame) { cancelAnimationFrame(renderFrame); renderFrame = 0; }
  if (document.hidden) return;
  if (state.slotTask || state.slotRecoveryNeeded) return;
  let page = state.pages[state.cursor];
  updateStoryClock($('vn-story-clock'), {page, turns:state.api._turns(), scenario:state.api._scenario(), openingWorld:state.openingScene?.world});
  if (!page) return;
  const turns = state.api._turns();
  const scenario = state.api._scenario();
  const scene = pageScene(page), visualPage = presentationPage(scene, page), rawView = assets.view(scene, visualPage);
  const proposedComposition = compositionFor(page, rawView?.direction);
  const revealed = state.reveal.key === pageKey(page) ? state.reveal.length : 0;
  const initialWait = revealed === 0 && dialogueGrace.remaining(`${sceneScope()}:${page.turnId}`) > 0 && dialogueWait(page, rawView, { enabled: Boolean(imageKey('portrait')), decoded: Boolean(rawView?.portraits?.some(person => person.id === rawView.speakerId && [...$('vn-characters').children].some(slot => slot.dataset.characterId === person.id && slot.vnReadyUrl === person.url))), eventDecoded: Boolean(rawView?.eventBackground && state.backgroundDisplayedUrl === rawView.eventBackground), bypass: state.dialogueBypass.has(pageKey(page)) });
  state.cueOpen = cueWindow.open(pageKey(page), { waiting: initialWait, revealed });
  const composition = state.reading.cinema === 'on' ? compositionContinuity.select(pageKey(page), proposedComposition, state.cueOpen || initialWait) : 'stage';
  const composedView = artContinuity.select(rawView, { scope: sceneScope(), pageKey: pageKey(page), start: visualPage?.start, cueOpen: state.cueOpen || initialWait, revisiting: state.cursor <= state.readThrough, composition, decoded: eventDecoded(rawView?.eventBackground) });
  const view=portraitContinuity.select(composedView,{pageKey:pageKey(page),open:state.cueOpen||initialWait});
  state.presentedView = view; state.presentedPageKey = pageKey(page);
  $('vn-stage').dataset.composition = composition;
  page = resolvedSpeaker(page, view);
  root.dataset.font = state.reading.font; root.dataset.motion = state.reading.motion;
  $('vn-stage').classList.toggle('is-nvl', state.reading.layout === 'nvl');
  $('vn-stage').classList.toggle('is-adv', state.reading.layout === 'adv');
  applyDirection(page, scene, view);
  let previousEnvironment = '';
  if (!view?.background) {
    for (let index = page.turnIndex - 1; index >= 0 && !previousEnvironment; index--) previousEnvironment = assets.view(turns[index].vnScene, {})?.environment || '';
    previousEnvironment ||= assets.view(state.openingScene, {})?.background;
  }
  const background = view?.background || previousEnvironment ? { url: view?.background || previousEnvironment, source: 'generated' } : backgroundFor(turns, page.turnIndex, currentCover(), state.openingArt);
  setBackground(background.url, view?.eventCharacterIds || []);
  // Background and sprites finish independently. Ready characters remain visible
  // even when a new background is pending, failed, or not generated yet.
  setPortraits(view, page.characterId);
  const met = recordMet(state.met, view);
  if (met !== state.met) { state.met = met; try { localStorage.setItem(state.metKey, JSON.stringify(met)); } catch { /* Kept for this tab. */ } }
  ambience.update(state.ambienceTarget);
  const music = musicDirection.update({ scope: sceneScope(), scene: String(scene?.world?.location || ''), pageKey: pageKey(page), index: state.cursor,
    mood: view?.direction?.mood || $('vn-stage').dataset.mood || 'normal', music: view?.direction?.music,
    dramatic: ['heavy_shake', 'flash_red', 'flash_white'].includes(view?.direction?.fx),
    // Only read on the first beat after a reset (load, new story).
    seed: () => musicSeed(state.cursor, index => { const row = state.pages[index], rowScene = pageScene(row), rowView = rowScene ? assets.view(rowScene, row) : null; return rowView?.direction ? { music: rowView.direction.music, mood: rowView.direction.mood } : null; }, { limit: 40 }),
    provisional: page.isLive || ['publishing', 'checking', 'pending'].includes(view?.castStatus) });
  score.update(music);
  void workMusic.update(state.activeSlug, music, scenario?.runtime?.packageContract?.presentation?.music);
  $('vn-stage').dataset.drawnShot = view?.shotKind || '';
  const voiceChoice = speakerVoice(view);
  const tts = { provider: state.reading.voiceProvider, narrator: state.reading.narratorVoice };
  const speakingPortrait = view?.portraits.find(person => person.id === view.speakerId);
  const decoded = Boolean(speakingPortrait && [...$('vn-characters').children].some(slot => slot.dataset.characterId === speakingPortrait.id && (slot.vnReadyUrl === speakingPortrait.url || speakingPortrait.expressionReady === false && slot.vnReadyUrl && slot.vnBaseKey === speakingPortrait.baseKey)));
  // Start the deadline on the first published page, even if it is narration.
  // Slow cast checks/images continue in parallel without withholding the prose.
  const graceRemaining = dialogueGrace.remaining(`${sceneScope()}:${page.turnId}`);
  const readingStarted = state.reveal.key === pageKey(page) && state.reveal.length > 0;
  state.dialogueWaiting = !readingStarted && graceRemaining > 0 && dialogueWait(page, view, { enabled: host.multiplayer || Boolean(imageKey('portrait')), decoded, eventDecoded: Boolean(view?.eventBackground && state.backgroundDisplayedUrl === view.eventBackground), bypass: state.dialogueBypass.has(pageKey(page)) });
  clearTimeout(dialogueGraceTimer); dialogueGraceTimer = 0;
  if (state.dialogueWaiting) dialogueGraceTimer = setTimeout(() => { dialogueGraceTimer = 0; if (state.screen === 'stage') renderPage(); }, graceRemaining + 1);
  if(host.multiplayer&&roomPageStarted(page))state.dialogueWaiting=false;
  $('vn-dialogue-wait').hidden = !state.dialogueWaiting;
  if (state.playback === 'full') {
    // Re-evaluated when the speaker check settles: a quotation is never read
    // in the narrator's voice just because its speaker was not known yet.
    const key = JSON.stringify([sceneScope(), pageKey(page), page.rawText || page.text, view?.castStatus || '', view?.speakerId || '', voiceChoice, tts.provider, tts.narrator]);
    if (page.isGrowing || state.dialogueWaiting) state.fullAutoVoice = null;
    else if (state.fullAutoVoice?.key !== key) state.fullAutoVoice = { key, line: readingVoiceLine(page, view, sceneScope(), voiceChoice, voiceDelivery(page, view), tts) };
    state.voiceLine = state.fullAutoVoice?.line || null;
  } else state.voiceLine = voiceLine(page, view, sceneScope(), voiceChoice, voiceDelivery(page, view), tts);
  if ($('vn-history').hidden) voice.update(state.voiceLine);
  updateVoiceControls();
  performancePlayer.update({key:pageKey(page),text:typeset(page.rawText||page.text).visible,direction:view?.direction||{},waiting:state.dialogueWaiting,
    fresh:state.cursor>state.readThrough&&!page.isLive&&state.playback!=='skip',enabled:state.reading.cinema==='on',multiplayer:host.multiplayer,
    paused:document.hidden||!$('vn-history').hidden||state.hideText||Boolean(document.querySelector('dialog[open]'))});
  cinematicFrame={ pageKey: pageKey(page), sceneKey: JSON.stringify([sceneScope(), scene?.world?.location, lightFor(scene?.world?.time || '')]), cueOpen: state.cueOpen, composition, background: view?.environment || '', turnId: page.turnId, turnIndex: page.turnIndex, title: scene?.world?.location || scenario?.event?.title, direction: view?.direction || {}, portraits: view?.portraits || [], fresh: state.cursor > state.readThrough && !page.isLive && state.playback !== 'skip', enabled: state.reading.cinema === 'on' && state.screen === 'stage', waiting: state.dialogueWaiting, eventArt: Boolean(view?.eventBackground || view?.shotKind) };
  cinema.update(cinematicFrame);
  const selectedTurn = turns[page.turnIndex];
  $('vn-stage').dataset.dramatic=String(Boolean(view?.direction?.emphasis));
  renderRevealedText(page, selectedTurn);
  $('vn-reader-position').textContent = `${state.cursor + 1} / ${state.pages.length}`;
  const loading = state.awaitingTurn || busy();
  $('vn-loading').hidden = !loading;
  const liveReading = loading && state.pages.some(row => row.isLive);
  $('vn-loading').classList.toggle('is-streaming', liveReading);
  $('vn-loading').querySelector('strong').textContent = liveReading ? '다음 문장을 이어 쓰고 있습니다' : '첫 문장을 기다리고 있습니다';
  $('vn-loading').querySelector('small').textContent = '도착하는 문장부터 바로 표시됩니다';
  $('vn-stage').classList.toggle('is-generating', loading);
  $('vn-speaker').textContent = page.kind === 'dialogue' ? page.speaker || '대화' : '이야기';
  $('vn-speaker').classList.toggle('is-tentative', Boolean(page.speakerTentative));
  $('vn-page-count').textContent = `${String(state.cursor + 1).padStart(2, '0')} / ${String(state.pages.length).padStart(2, '0')}`;
  $('vn-prev').disabled = state.cursor === 0;
  $('vn-next').textContent = state.cursor < state.pages.length - 1 ? '다음 →' : state.actions ? '입력 중' : '선택하기 →';
  $('vn-next').disabled = state.actions || state.dialogueWaiting;
  $('vn-work-label').textContent = currentWork()?.title || scenario?.title || 'DANCHEONG';
  $('vn-scene-title').textContent = scenario?.event?.title || '현재 장면';
  $('vn-scene-place').textContent = [scene?.world?.location || scenario?.world?.location, scene?.world?.time || $('worldClock')?.textContent].filter(Boolean).join(' · ');
  $('vn-scene-counter').textContent = page.turnIndex < 0 ? 'OPENING' : `BEAT ${String(page.turnIndex + 1).padStart(2, '0')}`;
  const notice = mediaPaused(state.activeSlug, 'image') ? { text: '이미지 자동 생성 일시 중지 · 저장 공간 관리', action: 'storage' } : imageNotice(view, hasImageKey());
  visualStatus.hidden = !notice; visualStatus.disabled = notice?.action === 'wait';
  visualStatus.dataset.action = notice?.action || '';
  visualStatus.dataset.keyKind = notice?.keyKind || 'image';
  $('vn-image-status').textContent = notice?.text || '';
  $('vn-stage').classList.toggle('has-image-notice', Boolean(notice));
  $('vn-stage').classList.toggle('is-narration', page.kind !== 'dialogue');
  $('vn-stage').classList.toggle('is-dialogue', page.kind === 'dialogue');
  $('vn-stage').classList.toggle('has-actions', state.actions && (!host.multiplayer || multiplayerState.canWrite));
  $('vn-stage').classList.toggle('has-cover', background.source === 'cover');
  renderActions();
  saveReadingPosition(); schedulePlayback();
}

let preparationPlan = null;
function maybeAutoGenerate() {
  if (document.hidden || state.screen !== 'stage' || state.switching || state.slotTask || saveDialog.open || $('vn-settings-dialog').open) { preparationPlan = null; return; }
  const context = [sceneScope(), state.imageRouting.background, state.imageRouting.character, Boolean(imageKey('background')), Boolean(imageKey('portrait')), Boolean(textKey()), state.artStyle, state.reading.cg, state.reading.shots, state.reading.actorMotion].join('|');
  if (preparationPlan?.pages === state.pages && preparationPlan.cursor === state.cursor && preparationPlan.count === state.preparedBeats.size && preparationPlan.context === context) return;
  const units = new Map();
  for (const page of preparationPages(state.pages, state.cursor)) {
    const scene = pageScene(page);
    if (!scene || scene.castPending) continue;
    if (!units.has(scene.unitKey)) units.set(scene.unitKey, { scene, pages: [] });
    units.get(scene.unitKey).pages.push(page);
  }
  // Cast checks cover the whole published incoming turn; paid images stay near
  // the reader (see preparationTier). Writer drafts are never used.
  for (const [unitIndex, { scene, pages }] of [...units.values()].entries()) {
    const tier = preparationTier(unitIndex);
    const key = `${scene.unitKey}:${tier}:${state.imageRouting.background}:${state.imageRouting.character}:${Boolean(imageKey('background'))}:${Boolean(imageKey('portrait'))}:${Boolean(textKey())}`;
    if (state.preparedBeats.has(key)) continue;
    state.preparedBeats.add(key);
    const scope = sceneScope();
    preparationQueue.add(key, async current => {
      const active = () => current() && !document.hidden && state.screen === 'stage' && !state.switching && !saveDialog.open && !$('vn-settings-dialog').open && sceneScope() === scope;
      try {
        if (!active()) return;
        const { completion } = await prepareAhead({ scene, pages, castDirector, assets, active, generate: hasImageKey(), preload: displaySprite, tier });
        void completion.catch(error => toast(error?.message || '장면 준비 오류')).finally(() => { if (!active()) state.preparedBeats.delete(key); });
      } finally { if (!active()) state.preparedBeats.delete(key); }
    });
  }
  preparationPlan = { pages: state.pages, cursor: state.cursor, count: state.preparedBeats.size, context };
}

function sync(force = false) {
  if (!host.active || !host.isReady()) return;
  if(force)collectPublishedPages.invalidate?.();
  if (document.hidden) return;
  if (state.slotTask || state.slotRecoveryNeeded) return;
  const storage = syncRecovery();
  if (!state.api || state.screen !== 'stage') return;
  const turns = state.api._turns();
  const last = turns.at(-1);
  const key = [turns.length, last?.id, last?.status, last?.displayText?.length, last?.text?.length, last?.imageStatus, Boolean(last?.imageUrl), last?.displayTyping, state.actions, state.awaitingTurn, busy(), Boolean(storage)].join('|');
  const next = collectPages();
  if (force || key !== state.renderKey || next !== state.pages) {
    const previous = state.pages;
    const arrived = state.awaitingTurn && next.at(-1)?.turnId !== state.submittedTurnId && next.at(-1)?.turnId !== 'opening';
    state.cursor = reconcileCursor(previous, next, state.cursor, { first: state.startAtFirst, awaiting: arrived, bookmark: state.bookmark?.cursor });
    // Opening pages disappear when the first committed turn arrives. Do not carry
    // their numeric read limit over to new, unread story pages.
    state.readThrough = reconcileReadThrough(previous, next, state.readThrough, state.bookmark?.read);
    state.pages = next;
    if(host.multiplayer&&next.length&&(state.cursor<next.length-1||next.at(-1)?.isGrowing))state.actions=false;
    if (state.startAtFirst || arrived) { state.actions = false; state.startAtFirst = false; }
    if (arrived) state.awaitingTurn = false;
    state.renderKey = key;
    renderPage();
  }
  // A silent stream has no new render key. Still update its lightweight inline
  // wait hint, without rebuilding the stage or inspecting image caches.
  updateNextBuffer();
  maybeAutoGenerate();
  if (host.multiplayer || state.playback === 'full') schedulePlayback();
}

function nextPage(fromPlayback = false) {
  if(host.multiplayer){if(!fromPlayback)multiplayerTouch();return;}
  if (!fromPlayback) stopPlayback();
  if (state.hideText) return setTextHidden(false);
  if (cinema.dismiss()) return;
  if (state.actions) return;
  if (state.dialogueWaiting) return;
  if (finishReveal()) return;
  if (state.cursor < state.pages.length - 1) {
    if (!fromPlayback) sound.play();
    if (state.reading.voiceContinue === 'on' && voice.phase === 'playing') { stopReleasedVoice(); state.releasedVoice = voice.release(); if (state.releasedVoice) state.releasedVoice.onended = () => { state.releasedVoice = null; }; }
    state.cursor += 1; state.following = false; renderPage(); return;
  }
  if (state.awaitingTurn || busy()) return;
  const last = state.api._turns().at(-1);
  if (last && ['STREAMING', 'ADJUDICATION_PENDING'].includes(last.status)) return toast('장면이 완성되는 중입니다.');
  state.actions = true; state.customInputOpen = false; renderPage();
}

function prevPage() {
  if(host.multiplayer)return;
  stopPlayback(); stopReleasedVoice();
  if (state.hideText) return setTextHidden(false);
  if (state.actions) { state.actions = false; renderPage(); return; }
  if (state.cursor > 0) { state.cursor -= 1; state.following = false; renderPage(); }
}

async function submit(value, auto = false, { automated = false } = {}) {
  if(host.multiplayer){if(!multiplayerState.canWrite||!state.actions)return;const input=String(value||'').trim();if(!auto&&!input)return; if(host.requestTurn?.(input,auto)){state.actions=false;state.submittedTurnId=state.pages.at(-1)?.turnId||'opening';state.awaitingTurn=true;state.generationStarted=Date.now();$('vn-input').value='';renderPage();}return;}
  const problem = syncRecovery();
  if (problem) return toast(state.autoRecovery?.waiting ? '저장을 자동으로 복구하고 있습니다. 완료되면 이어서 진행할 수 있습니다.' : problem.message);
  if (busy() || state.awaitingTurn) return toast('장면이 완성된 뒤 진행해 주세요.');
  if (!textKey()) { openSettings(); return toast('본문 생성을 위한 API 키를 설정해 주세요.'); }
  const text = String(value || '').trim();
  if (!auto && !text) return toast('행동이나 대사를 입력해 주세요.');
  if (!auto) $('vn-input').value = text;
  if (!automated) stopPlayback();
  state.submittedTurnId = state.pages.at(-1)?.turnId || 'opening';
  state.awaitingTurn = true; state.submitting = true; state.generationStarted = Date.now(); state.finishPersistTiming = diagnostics.start('persist');
  state.actions = false; state.following = false; renderPage();
  try {
    await submitEngineTurn(state.api, { input: text, auto, notice: () => engineNotice && !engineNotice.hidden ? engineNotice.textContent : '' });
    $('vn-input').value = '';
    sync(true);
  } catch (error) {
    const recoverable = storageProblem(state.api) || pendingAdjudication(state.api);
    const accepted = state.api._turns().at(-1)?.id !== state.submittedTurnId;
    if (recoverable && accepted) $('vn-input').value = '';
    if (!recoverable) { if (automated) stopPlayback(); state.actions = true; toast(error?.message || '이야기를 진행하지 못했습니다.'); }
  }
  finally { state.submitting = false; state.awaitingTurn = false; sync(true); }
}

async function retryPendingAdjudication() {
  if(host.multiplayer)return;
  const problem = syncRecovery();
  if (problem) return toast(problem.message);
  if (adjudicationRetry.hidden || adjudicationRetry.disabled) return;
  if (!textKey()) { openSettings(); return toast('판정 보완을 위한 본문 API 키를 설정해 주세요.'); }
  stopPlayback();
  state.retryingAdjudication = true; syncRecovery();
  try {
    const completed = await retryAdjudication(state.api, {
      enabled: () => !$('send')?.disabled,
      notice: () => engineNotice && !engineNotice.hidden ? engineNotice.textContent : '',
    });
    if (completed) toast('현재 비트의 판정 보완을 완료했습니다.');
  } catch (error) { toast(error?.message || '판정 보완을 완료하지 못했습니다. 다시 시도해 주세요.'); }
  finally { state.retryingAdjudication = false; sync(true); }
}

let settingsKeySnapshot = {};
function openSettings() {
  settingsKeySnapshot = {...state.keys};
  voice.stop();
  stopPlayback();
  const dialog = $('vn-settings-dialog');
  (dialog.querySelector(`input[name="vn-provider"][value="${state.provider}"]`) || dialog.querySelector('input[name="vn-provider"][value="openai"]')).checked = true;
  $('vn-openai-key').value = state.keys.openai;
  $('vn-go-key').value = state.keys.go;
  $('vn-gemini-key').value = state.keys.gemini || '';
  $('vn-typecast-key').value = state.keys.typecast || '';
  $('vn-background-provider').value = state.imageRouting.background;
  $('vn-character-provider').value = state.imageRouting.character;
  updateImageProviderFields();
  $('vn-muse-effort').value = state.effort;
  $('vn-style-guide').value = state.api?._settings()?.styleGuide || '';
  $('vn-typing-speed').value = state.api?._settings()?.typingSpeed || 'natural';
  $('vn-image-quality').value = state.api?._settings()?.imageQuality || 'low';
  $('vn-reading-layout').value = state.reading.layout;
  $('vn-auto-pace').value = state.reading.pace;
  $('vn-font-size').value = state.reading.font;
  $('vn-typeface').value = state.reading.typeface;
  $('vn-motion').value = state.reading.motion;
  $('vn-sound').value = state.reading.sound;
  $('vn-ambience').value = state.reading.ambience;
  $('vn-cg-setting').value = state.reading.cg;
  $('vn-drawn-shots').value = state.reading.shots;
  $('vn-cinema-setting').value = state.reading.cinema;
  $('vn-actor-motion').value = state.reading.actorMotion;
  $('vn-face-compose').value = state.reading.faceCompose;
  $('vn-music').value = state.reading.music;
  void musicSettings.refresh();
  $('vn-music-volume').value = String(state.reading.musicVolume * 100);
  $('vn-voice-setting').value = state.reading.voice;
  $('vn-voice-provider').value = state.reading.voiceProvider;
  $('vn-voice-continue').value = state.reading.voiceContinue;
  $('vn-typecast-transport').value = state.reading.typecastTransport;
  $('vn-voice-volume').value = String(Math.round(state.reading.voiceVolume * 100));
  renderVoiceActors(state.reading.voiceProvider, state.reading.narratorVoice);
  $('vn-art-style').value = state.artStyle;
  $('vn-art-style').disabled = !state.activeSlug;
  const artPrefs = readWorkArt(localStorage, sceneScope());
  guideSelect.replaceChildren(new Option('사용 안 함 · 글로 된 묘사 기준만', ''));
  for (const person of state.met) if (workPortrait(person.baseKey, sceneScope())) guideSelect.add(new Option(person.name, person.baseKey));
  if (artPrefs.guideKey && ![...guideSelect.options].some(option => option.value === artPrefs.guideKey)) guideSelect.add(new Option('이 작품의 저장된 기준 이미지', artPrefs.guideKey));
  guideSelect.value = artPrefs.guideKey; guideSelect.disabled = !state.activeSlug;
  if (!dialog.open) dialog.showModal();
  if (!$('vn-cost-panel').hidden) void renderCosts();
  if (!storagePanel.hidden) void storageManager.refresh();
}

// Per-person voice and volume for the provider selected in the dialog.
function renderVoiceActors(provider, narrator) {
  const choices = readVoiceChoices(provider), volumes = readVoiceVolumes(), list = $('vn-voice-actors');
  list.replaceChildren();
  const typecast = familyOf(provider) === 'typecast';
  $('vn-typecast-field').hidden = !typecast; $('vn-typecast-tools').hidden = !typecast;
  updateVoiceCredit(provider);
  if (typecast) $('vn-typecast-status').textContent = typecastVoices().length ? `캐릭터 ${typecastVoices().length}명 · 인물마다 다른 캐릭터를 자동 배정합니다` : 'API 키를 입력하고 목록을 불러와 주세요.';
  const narratorSelect = $('vn-narrator-voice'); narratorSelect.replaceChildren(new Option(defaultNarrator(provider) ? `자동 · ${voiceLabel(defaultNarrator(provider), provider)}` : '자동 · 목록을 불러온 뒤 선택', ''));
  for (const name of narratorOptions(provider)) narratorSelect.add(new Option(voiceLabel(name, provider), name));
  narratorSelect.value = narratorOptions(provider).includes(narrator) ? narrator : '';
  for (const person of state.met) {
    const row = document.createElement('div'); row.className = 'vn-voice-actor';
    const label = document.createElement('label'); label.textContent = `${person.name} · 목소리`;
    const select = document.createElement('select'); select.dataset.voiceId = person.id;
    select.add(new Option(familyOf(provider) === 'openai' ? '자동 · 인물별 고정' : '자동 · 인물마다 다른 목소리', ''));
    for (const name of voiceOptions(provider)) select.add(new Option(voiceLabel(name, provider), name));
    select.value = voiceOptions(provider).includes(choices[person.id]) ? choices[person.id] : '';
    const volumeLabel = document.createElement('label'); volumeLabel.textContent = '크기';
    const volume = document.createElement('input'); volume.type = 'range'; volume.min = '0'; volume.max = '100'; volume.step = '5'; volume.dataset.volumeId = person.id;
    volume.value = String(Math.round((volumes[person.id] ?? 1) * 100)); volume.setAttribute('aria-label', `${person.name} 음성 크기`);
    label.append(select); volumeLabel.append(volume); row.append(label, volumeLabel);
    if (typecast) {
      // Typecast's own sample of the chosen character (no credits used).
      const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'vn-voice-preview'; preview.textContent = '샘플 ▶';
      preview.setAttribute('aria-label', `${person.name} 캐릭터 샘플 듣기`);
      preview.addEventListener('click', () => {
        const url = typecastVoices().find(item => item.id === select.value)?.preview;
        if (!url) { toast(select.value ? '이 캐릭터는 샘플이 없습니다.' : '캐릭터를 먼저 골라 주세요.'); return; }
        useMediaPlayback(); state.previewAudio?.pause(); state.previewAudio = new Audio(url); void state.previewAudio.play().catch(() => toast('샘플을 재생하지 못했습니다.'));
      });
      row.append(preview);
    }
    list.append(row);
  }
}

function updateImageProviderFields() {
  const gemini = $('vn-background-provider').value === 'gemini' || $('vn-character-provider').value === 'gemini';
  const mixed = $('vn-background-provider').value !== $('vn-character-provider').value;
  const options = $('vn-image-quality').options;
  options[0].textContent = gemini ? '절약·빠르게' : 'Low';
  options[1].textContent = mixed ? '고해상도 · Medium / 2K' : gemini ? '2K · 고해상도' : 'Medium';
  $('vn-image-quality-help').textContent = gemini ? 'Nano Banana 2 절약 설정: 배경 0.5K, 인물·표정·사건 CG 1K. 고해상도는 2K입니다. OpenAI는 Low / Medium을 사용합니다. 실제 모델별 사용량·예상 비용은 비용 탭에서 확인하세요.' : '';
}

async function renderCosts() { if (document.activeElement?.closest('.vn-budget')) return; await meter.render($('vn-cost-panel'), state.activeSlug); }
function settingsTab(target) {
  // Legacy calls: false = connection, true = costs.
  const selected = target === true ? 'cost' : typeof target === 'string' && SETTINGS_TABS.some(([name]) => name === target) ? target : 'connection';
  for (const [name] of SETTINGS_TABS) { $(`vn-${name}-panel`).hidden = name !== selected; $(`vn-${name}-tab`).setAttribute('aria-selected', String(name === selected)); }
  settingsFooter.hidden = ['cost', 'storage'].includes(selected);
  if (selected === 'cost') void renderCosts();
  if (selected === 'storage') void storageManager.refresh();
}

async function saveSettings() {
  if (busy() || assets.isBusy()) return toast('현재 장면이 완료된 뒤 설정을 바꿔 주세요.');
  const provider = state.provider;
  const openai = $('vn-openai-key').value.trim();
  const go = $('vn-go-key').value.trim();
  const gemini = $('vn-gemini-key').value.trim();
  const typecast = $('vn-typecast-key').value.trim();
  const typecastChanged = typecast !== (state.keys.typecast || '');
  const typecastSelected = $('vn-voice-provider').value === 'typecast';
  if (typecastSelected && $('vn-voice-setting').value === 'on' && !typecast) { settingsTab('audio'); $('vn-typecast-key').focus(); return toast('Typecast API 키를 입력해 주세요.'); }
  if (typecastLoading) return toast('Typecast 연결 확인이 끝난 뒤 저장해 주세요.');
  const imageRouting = { background: $('vn-background-provider').value === 'gemini' ? 'gemini' : 'openai', character: $('vn-character-provider').value === 'gemini' ? 'gemini' : 'openai' };
  if ([openai, go, gemini, typecast].some(key => key && !/^\S{1,512}$/u.test(key))) return toast('API 키에 공백이 있거나 길이가 너무 깁니다.');
  $('vn-settings-save').disabled = true;
  try {
    await storeDeviceKeys(changedDeviceKeys({ openai, go, gemini, typecast }, settingsKeySnapshot));
    if (JSON.stringify(state.imageRouting) !== JSON.stringify(imageRouting) || state.keys.openai !== openai || state.keys.gemini !== gemini) assets.resetFailures();
    state.keys = { openai, go, gemini, typecast };
    if (typecastChanged) { setTypecastVoices([]); localStorage.removeItem(typecastCatalogKey); voice.reset({ retryFailed: true }); }
    if (typecastSelected && typecast && (typecastChanged || !typecastVoices().length)) {
      if (!await connectTypecast()) { settingsTab('audio'); return; }
    }
    state.imageRouting = imageRouting;
    localStorage.setItem(imageRoutingKey, JSON.stringify(state.imageRouting));
    state.provider = provider in providerModels ? provider : 'openai';
    state.effort = $('vn-muse-effort').value;
    localStorage.setItem(providerKey, state.provider);
    localStorage.setItem(effortKey, state.effort);
    const voiceProvider = TTS_PROVIDERS[$('vn-voice-provider').value] ? $('vn-voice-provider').value : 'openai';
    state.reading = { ...state.reading, layout: $('vn-reading-layout').value, pace: $('vn-auto-pace').value, font: $('vn-font-size').value, typeface: TYPEFACES[$('vn-typeface').value] ? $('vn-typeface').value : 'auto', motion: $('vn-motion').value, sound: $('vn-sound').value,
      ambience: $('vn-ambience').value, cg: $('vn-cg-setting').value, cinema: $('vn-cinema-setting').value, shots: $('vn-drawn-shots').value, actorMotion: $('vn-actor-motion').value, faceCompose: $('vn-face-compose').value === 'on' ? 'on' : 'off', music: $('vn-music').value, musicVolume: Number($('vn-music-volume').value) / 100, voice: $('vn-voice-setting').value,
      voiceProvider, narratorVoice: $('vn-narrator-voice').value, voiceContinue: $('vn-voice-continue').value === 'on' ? 'on' : 'off', typecastTransport: $('vn-typecast-transport').value === 'direct' ? 'direct' : 'relay', voiceVolume: Number($('vn-voice-volume').value) / 100 };
    const voiceChoices = Object.fromEntries([...$('vn-voice-actors').querySelectorAll('select')].map(select => [select.dataset.voiceId, select.value]));
    localStorage.setItem(voiceChoicesKey(voiceProvider), JSON.stringify(voiceChoices));
    const volumes = Object.fromEntries([...$('vn-voice-actors').querySelectorAll('input[data-volume-id]')].map(input => [input.dataset.volumeId, Number(input.value) / 100]));
    if (state.activeSlug) localStorage.setItem(`dancheong-vn-voice-volume-v1:${state.activeSlug}`, JSON.stringify(volumes));
    voice.reset({ retryFailed: true }); stopReleasedVoice();
    if (state.activeSlug) {
      writeWorkArt(localStorage, sceneScope(), { ...readWorkArt(localStorage, sceneScope()), guideKey: guideSelect.value });
      state.artStyle = $('vn-art-style').value.trim().slice(0, 600);
      try { if (state.artStyle) localStorage.setItem(artStyleKey(state.activeSlug), state.artStyle); else localStorage.removeItem(artStyleKey(state.activeSlug)); } catch { /* Style stays for this tab. */ }
    }
    localStorage.setItem(readingPrefsKey, JSON.stringify({ ...state.reading, eventScenes: state.reading.cg }));
    root.dataset.motion = state.reading.motion; applyTypeface();
    state.reveal.key = ''; state.lastDirectionKey = '';
    applyProvider();
    state.api._setSettings({ styleGuide: $('vn-style-guide').value.trim() });
    const saved = await state.api.persist();
    if (!saved?.ok) { $('vn-settings-dialog').close(); sync(true); throw new Error('연결 키는 보관했지만 작품 설정을 저장하지 못했습니다. 진행 안내에서 현재 기록을 보존해 주세요.'); }
    $('vn-settings-dialog').close();
    state.preparedScenePage = ''; state.preparedBeats.clear(); assets.resetFailures();
    sync(true);
    toast('연결 설정을 저장했습니다.');
  } catch (error) { toast(error?.message || '연결 설정을 저장하지 못했습니다.'); }
  finally { $('vn-settings-save').disabled = false; }
}

// Backlog voice: replays a stored take only, never a new paid request.
async function replayBacklogVoice(page, control) {
  if (state.reading.voice !== 'on') { toast('설정에서 AI 대사 음성을 켜면 기록에서 다시 들을 수 있습니다.'); return; }
  const scene = pageScene(page), view = scene ? assets.view(scene, page) : null, tts = { provider: state.reading.voiceProvider, narrator: state.reading.narratorVoice };
  const resolved = resolvedSpeaker(page, view);
  const lines = [voiceLine(resolved, view, sceneScope(), speakerVoice(view), {}, tts), readingVoiceLine(resolved, view, sceneScope(), speakerVoice(view), {}, tts)];
  state.backlogVoice = true; control.disabled = true;
  try { if (!await voice.replayStored(lines)) toast('이 문장은 저장된 음성이 없습니다. 장면에서 음성을 켠 상태로 읽은 문장만 다시 들을 수 있습니다.'); }
  finally { control.disabled = false; }
}
function renderHistory() {
  const list = $('vn-history-list'); list.replaceChildren();
  for (const [index, page] of state.pages.entries()) {
    if (index > state.readThrough) break;
    const row = document.createElement('div'); row.className = 'vn-history-row';
    const button = document.createElement('button'); button.type = 'button'; button.title = '이 문장으로 돌아가기';
    const title = document.createElement('strong'); title.textContent = `${String(index + 1).padStart(2, '0')} · ${page.kind === 'dialogue' ? page.speaker || '대화' : '이야기'}`;
    const copy = document.createElement('span'); renderTypeset(copy, typeset(pageText(page)));
    button.append(title, copy); if(host.multiplayer){button.disabled=true;button.title='읽은 기록';} button.addEventListener('click', () => { if(host.multiplayer)return; voice.stop(); state.backlogVoice = false; state.cursor = index; state.following = index === state.pages.length - 1; state.actions = false; $('vn-history').hidden = true; renderPage(); });
    row.append(button);
    if (page.kind === 'dialogue' || page.quoted) {
      const replay = document.createElement('button'); replay.type = 'button'; replay.className = 'vn-history-voice'; replay.textContent = '▶'; replay.setAttribute('aria-label', '이 대사 음성 다시 듣기');
      replay.addEventListener('click', event => { event.stopPropagation(); void replayBacklogVoice(page, replay); });
      row.append(replay);
    }
    list.append(row);
  }
  list.lastElementChild?.scrollIntoView({ block: 'nearest' });
}

$('vn-home').addEventListener('click', () => { saveReadingPosition(); host.emit('HOME'); });
$('vn-stage').addEventListener('click', event => {
  if (!host.multiplayer && cinema.blocked && !event.target.closest('button,input,select,textarea,a,dialog')) {
    event.preventDefault(); event.stopPropagation(); cinema.dismiss();
  }
}, true);
window.addEventListener('beforeunload', event => {
  if (storageProblem(state.api)) { event.preventDefault(); event.returnValue = ''; }
});
$('vn-title-start').addEventListener('click', startFromTitle);
$('vn-title-new').addEventListener('click', () => newGameDialog.show());
$('vn-title-settings').addEventListener('click', openSettings);
$('vn-title-library').addEventListener('click', () => { showScreen('library'); renderCatalog(); });
$('vn-title-cast').addEventListener('click', () => { $('vn-title-cast-panel').hidden = false; void renderMetCast(); $('vn-title-cast-close').focus({ preventScroll: true }); });
$('vn-title-cast-close').addEventListener('click', () => { $('vn-title-cast-panel').hidden = true; $('vn-title-cast').focus({ preventScroll: true }); });
// Browsers start audio only after a gesture; resume the ambience on the next one.
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => {
  if (!host.active) return;
  void ambience.resume(); void score.resume(); workMusic.resume();
  // Unlock voice synchronously while a user gesture is active, before TTS fetch.
  if (state.screen === 'stage' && (state.reading.voice === 'on' || state.playback === 'full') && !mediaPaused(state.activeSlug, 'voice')) voice.resume();
}, { passive: true });
$('vn-menu-toggle').addEventListener('click', () => { stopPlayback(); accountMenu.close(); const open = root.classList.toggle('vn-menu-open'); $('vn-menu-toggle').setAttribute('aria-expanded', String(open)); });
$('vn-settings').addEventListener('click', () => { closeMenu(); openSettings(); });
for (const [name] of SETTINGS_TABS) $(`vn-${name}-tab`).addEventListener('click', () => settingsTab(name));
settingsTabs.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const tabs = [...settingsTabs.querySelectorAll('[role="tab"]')], index = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'), next = (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; settingsTab(SETTINGS_TABS[next][0]); tabs[next].focus(); } });
$('vn-settings-close').addEventListener('click', () => $('vn-settings-dialog').close());
$('vn-settings-cancel').addEventListener('click', () => $('vn-settings-dialog').close());
$('vn-settings-save').addEventListener('click', () => void saveSettings());
imageProviderFields.addEventListener('change', updateImageProviderFields);
$('vn-voice-provider').addEventListener('change', () => renderVoiceActors($('vn-voice-provider').value, ''));
let typecastLoading = false;
async function connectTypecast({ rememberKey = false } = {}) {
  const key = $('vn-typecast-key').value.trim(), status = $('vn-typecast-status');
  if (typecastLoading) return false;
  if (!key) { status.textContent = 'Typecast API 키를 먼저 입력해 주세요.'; $('vn-typecast-key').focus(); return false; }
  if (!/^\S{1,512}$/u.test(key)) { status.textContent = 'Typecast API 키의 공백과 길이를 확인해 주세요.'; return false; }
  typecastLoading = true;
  $('vn-typecast-load').disabled = true; status.textContent = '불러오는 중…';
  let keySaved = false;
  try {
    if (rememberKey) {
      await storeDeviceKeys({ typecast: key }); keySaved = true;
      if (state.keys.typecast !== key) { setTypecastVoices([]); localStorage.removeItem(typecastCatalogKey); }
      state.keys.typecast = key;
    }
    const voices = await fetchTypecastCatalog(key);
    if ($('vn-typecast-key').value.trim() !== key) { status.textContent = '입력한 키가 바뀌었습니다. 연결 확인을 다시 눌러 주세요.'; return false; }
    setTypecastVoices(voices); voice.reset({ retryFailed: true });
    try { localStorage.setItem(typecastCatalogKey, JSON.stringify({ at: Date.now(), voices })); } catch { /* Kept for this tab. */ }
    renderVoiceActors($('vn-voice-provider').value, $('vn-narrator-voice').value);
    status.textContent = `연결 확인 완료 · 캐릭터 ${voices.length}명${keySaved ? ' · 키 저장됨' : ''}. 아래 저장을 누르면 음성 설정이 적용됩니다.`;
    return true;
  } catch (error) { status.textContent = `${keySaved || state.keys.typecast === key ? '키는 이 기기에 보관했습니다. ' : ''}${error?.message || '캐릭터 목록을 불러오지 못했습니다.'}`; return false; }
  finally { typecastLoading = false; $('vn-typecast-load').disabled = false; }
}
$('vn-typecast-load').addEventListener('click', () => void connectTypecast({ rememberKey: true }));
$('vn-settings-dialog').addEventListener('close', () => { state.previewAudio?.pause(); state.previewAudio = null; });
$('vn-settings-dialog').querySelector('form').addEventListener('submit', event => { event.preventDefault(); void saveSettings(); });
$('vn-history-toggle').addEventListener('click', openHistory);
$('vn-dialogue-bypass').addEventListener('click', () => { state.dialogueBypass.add(pageKey(state.pages[state.cursor])); state.dialogueWaiting = false; renderPage(); });
$('vn-history-close').addEventListener('click', () => { $('vn-history').hidden = true; voice.stop(); state.backlogVoice = false; });
$('vn-reader-log').addEventListener('click', openHistory);
$('vn-reader-settings').addEventListener('click', openSettings);
visualStatus.addEventListener('click', () => {
  if (visualStatus.dataset.action === 'info') { healthDialog.show(); return; }
  if (visualStatus.dataset.action === 'storage') { settingsTab('storage'); openSettings(); return; }
  if (visualStatus.dataset.action === 'settings') { openSettings(); $(visualStatus.dataset.keyKind === 'text' ? state.provider === 'openai' ? 'vn-openai-key' : 'vn-go-key' : visualStatus.dataset.keyKind === 'gemini' ? 'vn-gemini-key' : 'vn-openai-key').focus(); }
  else if (visualStatus.dataset.action === 'retry') {
    const page = state.pages[state.cursor], scene = pageScene(page);
    if (scene) void assets.retry(scene, page);
  }
});
$('vn-auto').addEventListener('click', () => togglePlayback('auto'));
quickSaveButton.addEventListener('click', () => void quickSave());
quickLoadButton.addEventListener('click', () => void quickLoad());
$('vn-full-auto').addEventListener('click', toggleFullPlayback);
$('vn-skip').addEventListener('click', () => togglePlayback('skip'));
$('vn-hide-text').addEventListener('click', () => setTextHidden(true));
$('vn-show-text').addEventListener('click', () => setTextHidden(false));
$('vn-choice-back').addEventListener('click', prevPage);
async function toggleFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.requestFullscreen(); }
  catch { toast('이 브라우저에서는 전체 화면을 사용할 수 없습니다.'); }
}
$('vn-fullscreen').addEventListener('click', () => void toggleFullscreen());
document.addEventListener('fullscreenchange', () => { $('vn-fullscreen').textContent = document.fullscreenElement ? '화면 복귀' : '전체 화면'; });
$('vn-stage').addEventListener('click', event => {
  if (event.target.closest('button, a, textarea, input, select, #vn-dialogue-box, #vn-actions')) return;
  nextPage();
});
$('vn-stage').addEventListener('contextmenu', event => { if (!event.target.closest('input, textarea')) { event.preventDefault(); setTextHidden(!state.hideText); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { performancePlayer.reset();foley.stop(); stopPlayback(); cinema.reset(); workMusic.stop(); ambience.stop(); score.stop(); voice.stop(); stopReleasedVoice(); } else if (state.screen === 'stage') { ambience.update(state.ambienceTarget); renderPage(); } });

// Blink and mouth frames (when prepared): irregular blinks, and a mouth that
// follows the level of the voice actually playing for this person.
setInterval(() => {
  const enabled = state.reading.actorMotion === 'masked' && !motionReduced() && state.screen === 'stage' && !document.hidden && !$('vn-settings-dialog').open;
  const time = performance.now(), voiced = voicePlayer.speaker(), level = voiced ? voicePlayer.level() : 0;
  for (const slot of $('vn-characters').children) {
    const frames = slot.vnMotion, img = [...slot.querySelectorAll('.vn-character-image.is-visible')].at(-1);
    if (!img || slot.hidden) continue;
    if (!frames) { if (img.vnStaticSrc && img.src !== img.vnStaticSrc) img.src = img.vnStaticSrc; continue; }
    const id = slot.dataset.characterId || '';
    slot.vnBlink ||= createBlinker(id, { now: time }); slot.vnMouth ||= createMouth();
    const page = state.pages[state.cursor], dialogue = page?.quoted || page?.kind === 'dialogue';
    const byVoice = voiced === id, typing = !voiced && dialogue && slot.classList.contains('is-speaking') && $('vn-stage').classList.contains('is-revealing');
    const mouth = slot.vnMouth.update(time, { speaking: byVoice || typing, level: byVoice ? level : null });
    const src = motionFrameFor({ source: slot.vnMotionSources?.[0], readySource: img.vnSource === slot.vnReadyUrl ? img.vnSource : '', frames,
      enabled, blink: slot.vnBlink.closed(time), mouth }) || img.vnStaticSrc;
    if (src && img.src !== src) img.src = src;
  }
}, 50);
let resizeTimer;
root.addEventListener('pointerdown',()=>foley.resume(),{passive:true});
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (state.screen === 'stage') renderPage(); }, 120); });
$('vn-prev').addEventListener('click', prevPage);
$('vn-next').addEventListener('click', () => nextPage());
$('vn-dialogue-box').addEventListener('click', event => { if (!event.target.closest('button')) nextPage(); });
$('vn-send').addEventListener('click', () => void submit($('vn-input').value));
adjudicationRetry.addEventListener('click', () => void retryPendingAdjudication());
$('vn-continue').addEventListener('click', () => void submit('', true));
$('vn-custom-toggle').addEventListener('click', () => { stopPlayback(); state.customInputOpen = true; renderActions(); $('vn-input').focus(); });
$('vn-retry-image').addEventListener('click', () => {
  if (!hasImageKey()) return openSettings();
  const page = state.pages[state.cursor], scene = pageScene(page);
  if (scene) void assets.retry(scene, page);
});
$('vn-input').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submit($('vn-input').value); } });
document.addEventListener('keydown', event => {
  if (state.screen !== 'stage' || document.querySelector('dialog[open]') || ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') {
    event.preventDefault(); stopPlayback();
    if (!$('vn-history').hidden) { $('vn-history').hidden = true; voice.stop(); state.backlogVoice = false; }
    else if (state.hideText) setTextHidden(false);
    else if (state.actions) prevPage();
    else $('vn-menu-toggle').click();
    return;
  }
  if (event.key === 'F5' || event.key === 'F9') { event.preventDefault(); if (event.key === 'F5') void quickSave(); else void quickLoad(); return; }
  if (!$('vn-history').hidden) return;
  const shortcut = String(event.key || '').toLowerCase();
  if (['a', 's', 'h', 'l', 'f'].includes(shortcut)) {
    event.preventDefault();
    if (shortcut === 'a') { if (event.shiftKey) toggleFullPlayback(); else togglePlayback('auto'); }
    if (shortcut === 's') togglePlayback('skip');
    if (shortcut === 'h') setTextHidden(!state.hideText);
    if (shortcut === 'l') openHistory();
    if (shortcut === 'f') void toggleFullscreen();
    return;
  }
  if (state.actions && /^[1-3]$/u.test(event.key)) { $('vn-suggestions').children[Number(event.key) - 1]?.click(); return; }
  if ([' ', 'Enter'].includes(event.key) && document.activeElement?.closest('button,a')) return;
  if (event.key === 'ArrowLeft' || event.key === 'Backspace') { event.preventDefault(); prevPage(); }
  if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') { event.preventDefault(); nextPage(); }
});

let multiplayerProjection=null,multiplayerProxy=null,multiplayerState={canWrite:false},multiplayerReadStep;
let roomTimeline=null,roomGlyphSchedule,roomRevealCount,roomHold,roomFrame=null,roomRequestAt=0,roomRequestPending=false,roomPaintTimer=0,roomPaintSchedule=null,roomPainting=false,roomAligned=false;
let roomReadyTurn='',roomReadySince=0,roomAutoAttempt='',roomAutoRetry=0;
function multiplayerApi(api){
  if(!multiplayerProxy)multiplayerProxy=new Proxy(api,{get(target,key){
    if(key==='_turns')return ()=>multiplayerProjection.turns();
    if(['_rewind','_restoreBackup','_importFull','_reset','_import'].includes(key))return async()=>{throw Error('공유 기록은 방에서 관리합니다.');};
    return Reflect.get(target,key);
  }});
  return multiplayerProxy;
}
async function setupMultiplayer(){
  const [{createSharedAssets},multiplayer,timeline]=await Promise.all([
    import('../cortex-vn-shared.mjs?v=e0d140d50b0f'),import('../cortex-vn-multiplayer.mjs?v=e0d140d50b0f'),import('../cortex-vn-timeline.mjs?v=e0d140d50b0f')]);
  roomTimeline=timeline.createRoomTimeline();roomGlyphSchedule=timeline.glyphSchedule;roomRevealCount=timeline.revealCount;roomHold=timeline.paragraphHold;
  const {createMultiplayerProjection,createInputNotice}=multiplayer;multiplayerReadStep=multiplayer.multiplayerReadStep;
  multiplayerProjection=createMultiplayerProjection(host.api());
  const code=new URLSearchParams(location.search).get('room');
  globalThis.NexusVNSharedAssets=createSharedAssets({notice:toast,request:async body=>{
    const response=await fetch(`/api/multiplayer/rooms/${encodeURIComponent(code)}/visual`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'공유 자산 연결 오류');return result;
  }});
  const notice=document.createElement('aside');notice.className='vn-mp-input-notice';notice.hidden=true;notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');root.append(notice);
  let clockOffset=0;
  const showInput=createInputNotice(notice,{now:()=>Date.now()+clockOffset});
  window.addEventListener('nexus-mp-live',event=>{event.detail?multiplayerProjection.receive(event.detail):multiplayerProjection.clear();sync(true);});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='NEXUS_CORTEX_HOST_V1')return;
    const data=event.data;
    if(data.type==='MP_PLAYBACK'){roomTimeline.receive(data);if(host.active){sync();scheduleMultiplayerPlayback();}}
    if(data.type==='MP_PLAYBACK_ACK'){roomRequestPending=false;}
    if(data.type==='MP_SUBMITTED_INPUT'){clockOffset=Number(data.serverNow||Date.now())-Date.now();showInput(data.submission);}
    if(data.type==='MP_STATE'){
      const changed=multiplayerState.canWrite!==Boolean(data.canWrite);multiplayerState=data;
      $('vn-input').readOnly=!data.canWrite;
      if(!data.canWrite){$('vn-input').value='';state.customInputOpen=false;}
      if(data.canWrite)state.awaitingTurn=false;
      if(changed)sync(true);
    }
    if(data.type==='MP_EXECUTE'){state.awaitingTurn=true;state.generationStarted=Date.now();}
    if(['MP_COMMITTED','MP_LIVE_CLEAR'].includes(data.type))state.awaitingTurn=false;
  });
}
function installMultiplayerUI(){
  $('vn-dialogue-box').setAttribute('aria-label','함께 읽는 본문 · 판정 완료 후 터치로 전체 표시, 다시 터치로 다음 문단');
  const tools=host.multiplayer&&window.NexusMultiplayerControls;
  if(tools){root.append(tools.chat.closest('.nexus-multiplayer-tools'));}
  for(const node of [slotButton,menuSlotButton,quickSaveButton,quickLoadButton,fullAutoButton,...root.querySelectorAll('#vn-account')])if(node)node.hidden=true;
  const nav=root.querySelector('.vn-topbar nav'),settings=document.createElement('button');settings.type='button';settings.textContent='방 설정';settings.onclick=()=>host.emit('MP_SETTINGS');nav.append(settings);
  const guard=event=>{
    if(event.target.closest?.('#vn-quick-save,#vn-quick-load,#vn-full-auto,#vn-auto,#vn-skip,#vn-next,#vn-prev,#vn-choice-back,#vn-dialogue-bypass,[data-slot-action]')){event.preventDefault();event.stopImmediatePropagation();}
  };root.addEventListener('click',guard,true);
  // Status text can wrap, disappear or grow a retry button on narrow screens.
  // Measure only when its size/visibility changes, never on the story poll.
  let layoutFrame=0;
  const lift=()=>{if(!layoutFrame)layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;root.style.setProperty('--vn-mp-status-height',`${visualStatus.hidden?0:Math.ceil(visualStatus.getBoundingClientRect().height)}px`);});};
  const resize=new ResizeObserver(lift);resize.observe(visualStatus);
  new MutationObserver(lift).observe(visualStatus,{attributes:true,attributeFilter:['hidden']});lift();
  // Draft sharing uses the existing coalesced, composition-aware parent queue.
  let composing=false;const input=$('vn-input'),share=()=>{if(multiplayerState.canWrite&&!composing)host.emit('MP_INPUT_CHANGED',{text:input.value.slice(0,12000)});};
  input.addEventListener('compositionstart',()=>{composing=true});input.addEventListener('compositionend',()=>{composing=false;share()});input.addEventListener('input',share);
  // This is the room cache's art direction. Personal style edits must not buy divergent sprites.
  state.artStyle='';
  $('vn-art-style').disabled=true;$('vn-art-style').closest('label').hidden=true;
  $('vn-style-guide').disabled=true;$('vn-style-guide').closest('label').hidden=true;
}

function multiplayerPlaybackStep(){
  return multiplayerReadStep({hasPage:Boolean(state.pages[state.cursor]),blocked:playbackBlocked(true),
    revealing:Boolean(state.reveal.timer),growing:state.pages[state.cursor]?.isGrowing,
    voicePhase:voice.phase,hasNext:state.cursor<state.pages.length-1,busy:busy(),awaiting:state.awaitingTurn,
    tailStatus:state.api?._turns().at(-1)?.status,actions:state.actions});
}
function roomRequest(action,turnId){
  const now=performance.now();
  // At most one request and no backlog. A lost acknowledgment is retried only
  // against the same current sequence, so it cannot replay a touch on a new page.
  if(roomRequestPending&&now-roomRequestAt<22000||['ready','auto'].includes(action)&&now-roomRequestAt<900)return;
  roomRequestPending=true;roomRequestAt=now;
  host.emit('MP_PLAYBACK_REQUEST',{action,turnId,expected:roomTimeline?.frame?.seq||0});
}
function alignMultiplayerPlayback(){
  if(!host.multiplayer||!roomTimeline)return true;
  const pending=roomTimeline.frame;
  if(pending&&roomTimeline.now()>=pending.startsAt)roomFrame=pending;
  if(!roomFrame)return true;
  const matches=p=>p?.turnId===roomFrame.turnId&&p.start===roomFrame.start;
  const index=matches(state.pages[state.cursor])?state.cursor:state.pages.findIndex(matches);
  // A live preview may disappear briefly during canonical import. Keep the
  // painted surface until that exact paragraph is restored, never rewind to
  // the start of the latest turn (often ten paragraphs earlier).
  if(index<0){roomAligned=false;return false;}
  roomAligned=true;
  if(state.cursor!==index){voice.stop();stopReleasedVoice();state.cursor=index;state.following=false;}
  const choices=roomFrame.phase==='choices';
  if(state.actions!==choices){state.actions=choices;state.customInputOpen=false;}
  return true;
}
function roomPageStarted(page){return roomAligned&&roomFrame?.turnId===page?.turnId&&roomFrame.start===page?.start&&roomTimeline.now()>=roomFrame.startsAt;}
function renderMultiplayerText({key,text}){
  clearTimeout(roomPaintTimer);roomPaintTimer=0;
  const reveal=state.reveal,page=state.pages[state.cursor];
  if(!roomPaintSchedule||roomPaintSchedule.text!==text)roomPaintSchedule={text,...roomGlyphSchedule(text)};
  // Reuse the original typesetter's DOM paint, but own its clock in multiplayer.
  reveal.key=key;reveal.text=text;reveal.glyphs=roomPaintSchedule.glyphs;
  function paint(){
    roomPaintTimer=0;if(!host.active||document.hidden||key!==pageKey(state.pages[state.cursor]))return;
    const now=roomTimeline.now(),started=roomPageStarted(page);
    const count=started?roomRevealCount(roomPaintSchedule,now-roomFrame.startsAt,Boolean(roomFrame.revealAt&&now>=roomFrame.revealAt)):0;
    reveal.length=count;const element=reveal.element;
    if(element&&(element.vnCount!==count||element.vnLayout!==reveal.layout)){
      element.vnCount=count;element.vnLayout=reveal.layout;renderTypeset(element,reveal.layout,count);
      textWait.progress(key,count);
      performancePlayer.progress(count,{voicePhase:voice.phase});
    }
    $('vn-stage').classList.toggle('is-revealing',count<reveal.glyphs.length);
    if(count===reveal.glyphs.length&&started){state.readThrough=Math.max(state.readThrough,state.cursor);reveal.timer=0;}
    else {roomPaintTimer=setTimeout(paint,32);reveal.timer=roomPaintTimer;}
  }
  paint();
}
function multiplayerTouch(){
  if(!host.active||!roomAligned||!roomFrame||roomTimeline.frame?.seq!==roomFrame.seq||roomFrame.phase!=='reading')return;
  if(state.hideText)return setTextHidden(false);
  const page=state.pages[state.cursor],turn=page?.turnIndex>=0?state.api._turns()[page.turnIndex]:{status:'COMMITTED'};
  if(!page||page.isLive||page.isGrowing||turn?.status!=='COMMITTED')return;
  roomRequest(state.reveal.length<state.reveal.glyphs.length?'reveal':'advance',page.turnId);
}
function scheduleMultiplayerPlayback(){
  if(!host.active||!roomTimeline||document.hidden||roomPainting)return;
  state.playback='auto';clearTimeout(state.playbackTimer);state.playbackTimer=0;
  const latest=state.pages.at(-1),frame=roomTimeline.frame;
  if(frame&&roomTimeline.now()<frame.startsAt)state.playbackTimer=setTimeout(()=>{state.playbackTimer=0;scheduleMultiplayerPlayback();},Math.max(1,frame.startsAt-roomTimeline.now()));
  if(latest&&(!frame||frame.turnId!==latest.turnId)){
    if(roomReadyTurn!==latest.turnId){roomReadyTurn=latest.turnId;roomReadySince=performance.now();}
    const first=state.pages.find(p=>p.turnId===latest.turnId),view=assets.view(pageScene(first),first);
    const ready=view?.castStatus==='ready'&&!dialogueWait(first,view,{enabled:true,decoded:Boolean(view.portraits?.some(p=>p.id===view.speakerId&&p.url)),eventDecoded:Boolean(view.eventBackground),bypass:false});
    if(ready||performance.now()-roomReadySince>=5000)roomRequest('ready',latest.turnId);
  }
  const oldCursor=state.cursor,oldActions=state.actions,oldSeq=roomFrame?.seq;
  if(!alignMultiplayerPlayback())return;
  if(oldCursor!==state.cursor||oldActions!==state.actions||oldSeq!==roomFrame?.seq){
    roomPainting=true;try{cinema.dismiss();renderPage();}finally{roomPainting=false;}
  }
  const page=state.pages[state.cursor];if(!page)return;
  if(!frame||frame.turnId!==latest?.turnId)return;
  if(frame.seq!==roomFrame?.seq||frame.phase!=='reading'||page.isGrowing)return;
  if(page.isLive&&page===latest)return;
  const text=typeset(page.rawText||page.text).visible,schedule=roomGlyphSchedule(text);
  const end=frame.revealAt||frame.startsAt+schedule.duration;
  if(roomTimeline.now()>=end+roomHold(text)-1200){
    // Transient failures retry at a bounded rate. Active reading has one state
    // poll; no extra per-character/per-asset presentation polls are installed.
    if(roomAutoAttempt!==String(frame.seq)||performance.now()>=roomAutoRetry){roomAutoAttempt=String(frame.seq);roomAutoRetry=performance.now()+2400;roomRequest('auto',frame.turnId);}
  }
  // Derived renderer caches have no authority over saves or paid assets.
  // Bound them during long rooms; old entries can be reconstructed on demand.
  for(const cache of [state.speakerNames,state.preparedBeats,state.dialogueBypass])while(cache?.size>512)cache.delete(cache.keys().next().value);
  while(state.stageScenes.size>32)state.stageScenes.delete(state.stageScenes.keys().next().value);
}

// Main-site lifecycle adapter. The engine and canonical session are owned by
// cortex-host; entering a renderer never imports, resets, or bootstraps a save.
let embeddedStory = null;
function queueHistoryImport(turns) {
  // Shared turns contain other players' text receipts. Only locally observed
  // paid calls belong in this device's VN meter; the room keeps its own ledger.
  if (host.multiplayer) return;
  // Yield until after activation; keep each job's work identity even if the
  // reader changes mode while IndexedDB is busy. No paid call is made here.
  const context = { slug:state.activeSlug, title:state.api?._scenario()?.title || '' };
  void meter.importHistory(turns, context).catch(()=>{});
}
function embeddedSnapshot(scenario, turns) {
  if (!state.api || !state.activeSlug || scenario !== embeddedStory) return;
  if(host.multiplayer){if(host.active)captureLatest(scenario,turns);return;}
  if (host.active) captureLatest(scenario, turns);
  scenario.runtime.vnPresentation = { schema: 'DANCHEONG_MAIN_VN_V1', slug: state.activeSlug,
    presentation: slotPresentation() };
}
function embeddedMediaKey(provider) {
  // An explicitly saved VN key has priority. The common key is a live
  // fallback, not a value to overwrite the account vault on every refresh.
  return state.keys[provider] || (provider === 'openai' ? host.settings?.imageApiKey || '' : '');
}
function embeddedSettings() {
  $('vn-openai-key').placeholder = host.settings?.imageApiKey ? '공통 OpenAI 키 사용 가능 · 별도 키 입력' : 'OpenAI API 키';
  applyProvider();
}
function embeddedAnchor() {
  const page = state.pages[state.cursor];
  return page ? { turn: page.turnId, offset: page.start || 0 } : null;
}
async function embeddedActivate(anchor) {
  state.api = host.multiplayer ? multiplayerApi(host.api()) : host.api();
  const scenario = state.api._scenario();
  const continuing = host.multiplayer && state.screen === 'stage' && embeddedStory?.runtime?.storyId === scenario?.runtime?.storyId;
  if (scenario !== embeddedStory) {
    embeddedStory = scenario;
    state.activeSlug = await host.workSlug();
    state.catalog = [{ slug: state.activeSlug, title: scenario.title || host.title || '작품', genre: scenario.genre || '', runtime: 'CORTEX' }];
    state.artStyle = host.multiplayer ? '' : loadArtStyle(state.activeSlug);
    const saved = scenario.runtime?.vnPresentation;
    if (!host.multiplayer && saved?.schema === 'DANCHEONG_MAIN_VN_V1' && saved.slug === state.activeSlug && saved.presentation) {
      applyPresentation(localStorage, { slug: state.activeSlug, storyId: scenario.runtime.storyId, snapshot:{scenario}, presentation: saved.presentation });
    }
    if(continuing)captureLatest(scenario,state.api._turns(),true);
    else { await loadMedia(); await loadPresentation(); }
  }
  embeddedSettings();
  globalThis.NexusVNBeforePersist = embeddedSnapshot;
  state.screen = 'stage';
  if(!continuing){state.reveal.key='';state.reveal.frameKey='';}
  const pages = collectPages();
  if(host.multiplayer&&!continuing){
    // A joining reader starts this room's latest turn, not an old personal bookmark.
    state.bookmark=null;state.cursor=Math.max(0,pages.findIndex(page=>page.turnId===pages.at(-1)?.turnId));
    state.readThrough=state.cursor-1;state.actions=false;state.startAtFirst=false;state.following=false;
    anchor=null;
  }
  if (anchor?.turn) {
    const index = pages.findIndex(p => p.turnId === anchor.turn && (p.start || 0) <= anchor.offset && (p.end || (p.start + p.text.length)) > anchor.offset);
    const sameTurn = pages.findIndex(p => p.turnId === anchor.turn);
    if (index >= 0 || sameTurn >= 0) {
      state.cursor = index >= 0 ? index : sameTurn;
      state.bookmark = { cursor: pageKey(pages[state.cursor]), read: pageKey(pages[Math.max(state.readThrough, state.cursor - 1)]) };
      state.actions = false;
    }
  }
  state.pages = pages;
  $('vn-input').value = document.getElementById('input')?.value || '';
  if ($('vn-input').value) state.customInputOpen = true;
  showScreen('stage');
  root.hidden = false; state.renderKey = '';
  sync(true);
}
function embeddedDeactivate() {
  clearTimeout(roomPaintTimer);roomPaintTimer=0;
  saveReadingPosition();
  const anchor = embeddedAnchor();
  const input = document.getElementById('input'); if (input) input.value = $('vn-input').value;
  stopPlayback(); voice.reset(); stopReleasedVoice(); workMusic.stop(); ambience.stop(); score.stop(); cinema.reset();
  preparationQueue.clear(); state.preparedBeats.clear(); preparationPlan = null;
  state.reveal.reset(); state.reveal.frameKey = '';
  for (const dialog of root.querySelectorAll('dialog[open]')) dialog.close();
  showScreen('inactive'); root.hidden = true;
  return anchor;
}
async function bootEmbedded() {
  if(host.multiplayer)await setupMultiplayer();
  state.api = host.multiplayer ? multiplayerApi(host.api()) : host.api();
  state.keys = await loadDeviceKeys({ onError: () => toast('일부 API 키를 불러오지 못했습니다. 저장된 키는 보존되어 있습니다. 새로고침해 다시 불러올 수 있습니다.') });
  embeddedSettings();
  globalThis.NexusVNBeforePersist=embeddedSnapshot;
  // Main controls writer credentials and text settings in both renderers.
  const common = document.createElement('button'); common.type = 'button'; common.className = 'vn-common-settings';
  common.textContent = '단청 공통 설정 · 본문 모델 / API 키 / 표시 속도';
  common.onclick = () => { $('vn-settings-dialog').close(); host.emit('NEXUS_SETTINGS', {tab:'connection'}); };
  $('vn-connection-panel').prepend(common);
  root.querySelector('.vn-provider-grid').hidden = true;
  for (const id of ['vn-go-key', 'vn-muse-effort', 'vn-typing-speed', 'vn-image-quality']) $(id).closest('label').hidden = true;
  $('vn-openai-key').closest('label').querySelector('small').textContent = '이 계정·브라우저에 암호화 저장하여 업데이트 후에도 유지합니다. 비워 두면 공통 OpenAI 키를 사용합니다. 본문 연결은 단청 공통 설정';
  // Title-screen tools remain accessible inside the game menu; the standalone
  // library and title screens are never shown in the main-site journey.
  const nav = root.querySelector('.vn-topbar nav');
  const switcher = document.createElement('button'); switcher.id='vn-switch-novel'; switcher.type='button'; switcher.textContent='소설 모드';
  switcher.onclick=()=>host.emit('VIEW_MODE_REQUEST',{mode:'novel'}); if(!host.multiplayer)nav.prepend(switcher);
  const castPanel=$('vn-title-cast-panel'); root.append(castPanel);
  for (const button of [$('vn-title-cast'), galleryButton, healthButton]) nav.append(button);
  const libraryButton=document.createElement('button'); libraryButton.type='button'; libraryButton.textContent=host.multiplayer?'방으로':'작품·덧칠 / 새로 시작'; libraryButton.onclick=()=>host.emit('HOME'); nav.append(libraryButton);
  const commonMenu=common.cloneNode(true);commonMenu.textContent='단청 공통 설정';commonMenu.onclick=()=>host.emit('NEXUS_SETTINGS',{tab:'connection'});nav.append(commonMenu);
  for(const link of nav.querySelectorAll('a'))link.target='_top';
  window.addEventListener('nexus-vn-settings', embeddedSettings);
  window.addEventListener('cortex-turn-display',()=>sync(true));
  window.addEventListener('nexus-cortex-persisted',()=>{sync(true);if(host.active&&!host.multiplayer){cloudDialog.localSaved();cloudDialog.schedule();}});
  setInterval(()=>sync(),300);
  // The existing journal is local to this main-site session. Recovery is a
  // mutation and runs only after main cloud preflight grants the write lease.
  const pending=await slotStore.pending();
  if(pending&&!host.multiplayer)await host.write(()=>withSlotLock(()=>recoverSlotLoad({store:slotStore,api:state.api,apply:applySlotPresentation,remember:rememberSlot})));
  if(!host.multiplayer)void cloudDialog.connect();
  else installMultiplayerUI();
}
await bootEmbedded();
export const renderer = { activate:embeddedActivate, deactivate:embeddedDeactivate, anchor:embeddedAnchor };
