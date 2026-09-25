import { backgroundFor, pagesForTurn, readableTurnPages } from './vn-core.mjs';
import { loadDeviceKeys, storeDeviceKeys } from './vn-key-vault.mjs';
import { imageRoutingKey, readImageRouting, imageProviderFor } from './vn-image-routing.mjs';
import { storageProblem, submitEngineTurn } from './vn-progress.mjs';
import { captureScene, sceneVersion } from './vn-scene.mjs';
import { createStageAssets, readAsset, writeAsset, imageProviders, imageNotice } from './vn-assets.mjs';
import { installCostMeter } from './vn-costs.mjs';
import { createCastDirector } from './vn-cast.mjs';
import { publishedUnit, dialogueWait, resolvedSpeaker, preparationPages, nextWaitReason, createPreparationQueue, prepareAhead } from './vn-stage-timing.mjs';
import { pageKey, pageText, readingFrame, reconcileCursor, reconcileReadThrough, nextPlaybackStep, createTextRevealer, readDelay } from './vn-reader.mjs';
import { directionAt, transitionFor, createSound } from './vn-direction.mjs';
import { stageOrder, stagePositions, slotWidth, heightScale, speakerHue, weatherFor, lightFor, mergeDirection, recordMet } from './vn-stage.mjs';
import { displaySprite } from './vn-sprite.mjs';
import { createAmbience, ambienceFor } from './vn-audio.mjs';

const activeKey = 'dancheong-ln-active-work-v1';
const nexusBase = 'https://relay-novel-nexus.juno12345.chatgpt.site';
const apiBase = `${location.origin}/api/openai`;
const providerKey = 'dancheong-ln-text-provider-v1';
const effortKey = 'dancheong-ln-muse-effort-v1';
const providerModels = { openai: 'gpt-5.6-luna', muse: 'muse-spark-1.3-contributor', 'go-luna': 'gpt-5.6-luna' };
const root = document.createElement('div');
root.id = 'vn-root';
root.innerHTML = `
  <header class="vn-topbar">
    <button class="vn-brand" id="vn-home" type="button"><span class="vn-brand-mark">丹</span><span><strong>단청</strong><small>LIGHT NOVEL SIMULATOR</small></span><span class="vn-home-label">← 메인화면</span></button>
    <span class="vn-top-title" id="vn-top-title">작품을 선택하세요</span>
    <button id="vn-menu-toggle" class="vn-menu-toggle" type="button" aria-label="메뉴 열기" aria-expanded="false"><span></span><span></span><span></span></button>
    <nav aria-label="주 메뉴"><a href="${nexusBase}/neoreum" target="_blank" rel="noopener noreferrer">너름</a><a href="${nexusBase}/jieum" target="_blank" rel="noopener noreferrer">지음</a><button id="vn-history-toggle" type="button">기록</button><button id="vn-settings" type="button">설정</button></nav>
  </header>
  <main>
    <section id="vn-library" class="vn-library" aria-labelledby="vn-library-title">
      <div class="vn-library-hero"><span class="vn-kicker">DANCHEONG · LIGHT NOVEL</span><h1 id="vn-library-title">작품 선택</h1><p>너름에 출간된 작품을 골라 장면 속에서 이어가세요.</p><span class="vn-library-count" id="vn-library-count">작품을 불러오는 중…</span></div>
      <div class="vn-library-grid" id="vn-library-grid"></div>
      <footer class="vn-library-footer"><a href="/downloads/dancheong-light-novel-source.zip" download>전체 소스코드 ZIP 다운로드 <span aria-hidden="true">↓</span></a><span>v13.8 · 실행 안내 포함</span></footer>
    </section>
    <section id="vn-title" class="vn-title" aria-labelledby="vn-title-name" hidden>
      <div class="vn-title-art" id="vn-title-art"></div><div class="vn-title-shade"></div>
      <div class="vn-title-body"><span class="vn-kicker" id="vn-title-kicker">DANCHEONG · LIGHT NOVEL</span><h1 id="vn-title-name">작품</h1><p id="vn-title-sub"></p>
        <div class="vn-title-menu"><button id="vn-title-start" type="button">이어하기</button><button id="vn-title-cast" type="button">만난 인물</button><button id="vn-title-settings" type="button">설정</button><button id="vn-title-library" type="button">작품 목록</button></div></div>
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
  <dialog id="vn-settings-dialog" class="vn-settings-dialog" aria-labelledby="vn-settings-title"><form method="dialog"><header><span class="vn-kicker">CONNECTION</span><h2 id="vn-settings-title">연결 설정</h2><button id="vn-settings-close" type="button" aria-label="설정 닫기">×</button></header><fieldset class="vn-provider-grid"><legend>본문 생성 모델</legend><label><input type="radio" name="vn-provider" value="openai"><strong>GPT 5.6 Luna</strong><span>OpenAI API 키</span></label><label><input type="radio" name="vn-provider" value="muse"><strong>Muse Spark 1.3 Contributor</strong><span>OpenCode Go</span></label><label><input type="radio" name="vn-provider" value="go-luna"><strong>GPT 5.6 Luna</strong><span>OpenCode Go</span></label></fieldset><div class="vn-settings-fields"><label>OpenAI API 키 <small>장면 배경 생성 · OpenAI 본문 모드</small><input id="vn-openai-key" type="password" autocomplete="off" placeholder="OpenAI API 키"></label><label>OpenCode Go API 키 <small>Muse / Go Luna 본문 모드</small><input id="vn-go-key" type="password" autocomplete="off" placeholder="OpenCode Go API 키"></label><label> Muse 추론 강도 <select id="vn-muse-effort"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>문체 지침 <textarea id="vn-style-guide" rows="3" placeholder="작품에 적용할 추가 문체 지침"></textarea></label><div class="vn-settings-row"><label>본문 표시 속도 <select id="vn-typing-speed"><option value="natural">자연스럽게</option><option value="slow">천천히</option><option value="fast">빠르게</option><option value="instant">즉시</option></select></label><label>이미지 품질 <select id="vn-image-quality"><option value="low">Low</option><option value="medium">Medium</option></select></label></div></div><p class="vn-settings-help">도입 장면과 확정된 새 장면마다 배경 이미지를 자동 생성합니다. 이미지에는 OpenAI API 사용료가 발생합니다. 키는 이 브라우저 기기에 암호화해 보관합니다.</p><div class="vn-settings-footer"><button id="vn-settings-cancel" type="button">취소</button><button id="vn-settings-save" type="button">저장</button></div></form></dialog>
  <div class="vn-toast" id="vn-toast" role="status" aria-live="polite"></div>`;
document.body.prepend(root);
const textSurface = document.createElement('div'); textSurface.id = 'vn-dialogue-text';
document.getElementById('vn-dialogue-text').replaceWith(textSurface);
const visual = document.createElement('div'); visual.id = 'vn-scene-visual'; visual.className = 'vn-scene-visual';
// Backdrop zoom (camera) and the slow background drift are separate layers so
// neither transition overrides the other.
const backdrop = document.createElement('div'); backdrop.className = 'vn-backdrop';
backdrop.append(root.querySelector('#vn-background-a'), root.querySelector('#vn-background-b'));
const cgLayer = document.createElement('div'); cgLayer.id = 'vn-cg'; cgLayer.className = 'vn-cg'; cgLayer.setAttribute('aria-hidden', 'true');
const weatherLayer = document.createElement('div'); weatherLayer.className = 'vn-weather'; weatherLayer.setAttribute('aria-hidden', 'true');
visual.append(backdrop, root.querySelector('.vn-background-shade'), root.querySelector('#vn-characters'), cgLayer, weatherLayer);
root.querySelector('#vn-stage').prepend(visual);
const flashLayer = document.createElement('div'); flashLayer.className = 'vn-flash'; flashLayer.setAttribute('aria-hidden', 'true');
root.querySelector('#vn-scene-cut').after(flashLayer);
const stageTools = document.createElement('div'); stageTools.className = 'vn-stage-tools';
stageTools.innerHTML = '<div id="vn-scene-label" class="vn-scene-label" aria-hidden="true"></div><div id="vn-loading" class="vn-loading" role="status" hidden><span></span><strong>다음 장면을 준비하고 있습니다</strong><small>완성되면 첫 문장부터 표시됩니다</small></div><button type="button" id="vn-show-text" class="vn-show-text" hidden>본문 표시 · H</button><div class="vn-reading-controls" role="toolbar" aria-label="읽기 제어"><span id="vn-reader-position"></span><button type="button" id="vn-reader-log" title="읽은 기록 (L)">기록</button><button type="button" id="vn-auto" aria-pressed="false" title="자동 읽기 (A)">자동</button><button type="button" id="vn-skip" aria-pressed="false" title="읽은 부분만 건너뛰기 (S)">읽은 부분</button><button type="button" id="vn-hide-text" title="본문 숨기기 (H)">글 숨김</button><button type="button" id="vn-fullscreen" title="전체 화면 (F)">전체 화면</button><button type="button" id="vn-reader-settings">설정</button></div>';
root.querySelector('#vn-stage').append(stageTools);
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
settingsTabs.innerHTML = '<button type="button" id="vn-connection-tab" role="tab" aria-controls="vn-connection-panel" aria-selected="true">연결·화면</button><button type="button" id="vn-cost-tab" role="tab" aria-controls="vn-cost-panel" aria-selected="false">사용량·비용</button>';
settingsForm.querySelector('header').after(settingsTabs);
const connectionPanel = document.createElement('div'); connectionPanel.id = 'vn-connection-panel'; connectionPanel.setAttribute('role', 'tabpanel'); connectionPanel.setAttribute('aria-labelledby', 'vn-connection-tab');
for (const selector of ['.vn-provider-grid', '.vn-settings-fields', '.vn-settings-help', '.vn-settings-footer']) connectionPanel.append(settingsForm.querySelector(selector));
connectionPanel.querySelector('.vn-settings-help').textContent = '공개된 문단에서 실제 현장 인물을 확인하고 다음 대사의 이미지를 미리 준비합니다. 처음 만드는 인물은 준비된 뒤 대사와 함께 표시됩니다. 같은 배경·인물·표정과 확인한 인물 배치는 재사용합니다. 새 인물 배치 확인에는 선택한 본문 모델을, 새 이미지에는 선택한 이미지 모델을 사용하며 호출은 사용량·비용에 기록됩니다. 키는 이 기기에 암호화해 보관합니다.';
const imageProviderFields = document.createElement('fieldset');
imageProviderFields.className = 'vn-image-routing';
imageProviderFields.innerHTML = '<legend>이미지 생성 모델</legend><div class="vn-image-routing-grid"><label for="vn-background-provider"><strong>배경</strong><small>장소·풍경</small><select id="vn-background-provider"><option value="openai">OpenAI 2.5 Flare</option><option value="gemini">Nano Banana 2</option></select></label><label for="vn-character-provider"><strong>인물·표정</strong><small>캐릭터·표정 변화</small><select id="vn-character-provider"><option value="openai">OpenAI 2.5 Flare</option><option value="gemini">Nano Banana 2</option></select></label></div><p class="vn-image-routing-help">사건 CG는 인물 모델을 사용합니다. 선택은 새로 생성하는 이미지부터 적용되며, 기존 이미지는 재사용합니다.</p>';
connectionPanel.querySelector('.vn-provider-grid').after(imageProviderFields);
const geminiKeyField = document.createElement('label');
geminiKeyField.innerHTML = 'Nano Banana 2 · Gemini API 키 <small>위에서 Nano Banana 2를 선택한 이미지에 사용합니다</small><input id="vn-gemini-key" type="password" autocomplete="off" maxlength="512" placeholder="Google AI Studio에서 발급한 API 키"><a class="vn-key-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Gemini API 키 발급 ↗</a>';
connectionPanel.querySelector('#vn-openai-key').closest('label').after(geminiKeyField);
connectionPanel.querySelector('#vn-openai-key').closest('label').querySelector('small').textContent = 'GPT 이미지 · OpenAI 본문 모드';
const imageQualityHelp = document.createElement('small'); imageQualityHelp.id = 'vn-image-quality-help';
connectionPanel.querySelector('#vn-image-quality').after(imageQualityHelp);
const readingFields = document.createElement('fieldset'); readingFields.className = 'vn-reading-settings';
readingFields.innerHTML = '<legend>읽기·연출</legend><div class="vn-settings-fields"><div class="vn-settings-row"><label>본문 배치<select id="vn-reading-layout"><option value="nvl">NVL · 화면 위에 누적</option><option value="adv">ADV · 하단 대화창</option></select></label><label>자동 읽기 간격<select id="vn-auto-pace"><option value="normal">보통</option><option value="slow">여유롭게</option><option value="fast">빠르게</option></select></label></div><div class="vn-settings-row"><label>본문 크기<select id="vn-font-size"><option value="normal">기본</option><option value="large">크게</option></select></label><label>화면 움직임<select id="vn-motion"><option value="full">장면에 맞게</option><option value="reduced">최소화</option></select></label></div><div class="vn-settings-row"><label>조작 효과음<select id="vn-sound"><option value="off">끔</option><option value="on">켬</option></select></label><label>환경음·분위기음<select id="vn-ambience"><option value="off">끔</option><option value="on">켬</option></select></label></div><div class="vn-settings-row"><label>사건 CG<select id="vn-cg-setting"><option value="off">끔</option><option value="on">켬 · 이미지 비용 추가</option></select></label></div><label>이 작품의 그림체 지침 <small>비워 두면 기본 그림체를 사용합니다. 입력하면 이 작품의 배경·인물을 새 그림체로 다시 만듭니다(이미지 비용 발생).</small><textarea id="vn-art-style" rows="2" maxlength="600" placeholder="예: 수채화 질감, 가는 선, 채도 낮은 파스텔 톤"></textarea></label></div><p class="vn-settings-help">클릭·Space 다음 / ← 이전 / A 자동 / S 읽은 부분 / L 기록 / H 본문 숨김 / F 전체 화면. 자동 읽기는 선택지와 새 장면 생성 앞에서 멈춥니다. 표정은 뚜렷한 감정 변화 때만 본문 상황을 읽고 자연스럽게 새로 그리며, 배경은 장소·시간대·날씨가 바뀔 때만 교체합니다. 같은 이미지는 재사용합니다. 기존 표정은 처음 필요할 때 한 번 새 방식으로 생성합니다(이미지 비용 발생). 사건 CG는 절정 장면에만, 문단당 최대 1장 생성합니다.</p>';
connectionPanel.querySelector('.vn-settings-help').before(readingFields);
settingsForm.append(connectionPanel);
const costPanel = document.createElement('div'); costPanel.id = 'vn-cost-panel'; costPanel.hidden = true; costPanel.setAttribute('role', 'tabpanel'); costPanel.setAttribute('aria-labelledby', 'vn-cost-tab'); settingsForm.append(costPanel);

const $ = (id) => document.getElementById(id);
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
root.append(recoveryPanel);
function syncRecovery() {
  const problem = storageProblem(state.api);
  recoveryPanel.hidden = !problem && (!engineNotice || engineNotice.hidden);
  recoveryHeading.textContent = problem ? '현재 진행을 저장하지 못했습니다' : '진행 안내';
  const detail = problem ? `${problem.reason} 새로고침 전에 아래 버튼으로 현재 진행을 보존해 주세요.` : '';
  if (recoveryDetail.textContent !== detail) recoveryDetail.textContent = detail;
  recoveryDetail.hidden = !detail;
  return problem;
}
const state = { api: null, catalog: [], activeSlug: localStorage.getItem(activeKey) || '', pages: [], cursor: 0, following: true, startAtFirst: false, actions: false, customInputOpen: false, screen: 'library', renderKey: '', backgroundUrl: '', backgroundSide: 'a', media: [], openingArt: '', switching: false, provider: localStorage.getItem(providerKey) || 'openai', effort: localStorage.getItem(effortKey) || 'low', keys: { openai: '', go: '' }, reveal: { key: '', text: '', length: 0, timer: 0 } };
globalThis.NexusVNHandlesTextReveal = true;
state.reveal = createTextRevealer({
  write: text => { if (state.reveal.element && state.reveal.element.textContent !== text) state.reveal.element.textContent = text; },
  onComplete: revealComplete,
  isPaused: () => state.screen !== 'stage' || state.dialogueWaiting || document.hidden || $('vn-settings-dialog').open || !$('vn-history').hidden || state.hideText || root.classList.contains('vn-menu-open'),
});
state.openingScene = null;
state.preparedScenePage = '';
state.stageScenes = new Map(); state.preparedBeats = new Set(); state.dialogueBypass = new Set(); state.dialogueWaiting = false;
state.imageRouting = readImageRouting(localStorage);
const readingPrefsKey = 'dancheong-vn-reading-prefs-v1';
let storedReading = {}; try { storedReading = JSON.parse(localStorage.getItem(readingPrefsKey) || '{}'); } catch { /* Defaults remain usable. */ }
state.reading = { layout: storedReading?.layout === 'adv' ? 'adv' : 'nvl', pace: ['slow', 'fast'].includes(storedReading?.pace) ? storedReading.pace : 'normal', font: storedReading?.font === 'large' ? 'large' : 'normal', motion: storedReading?.motion === 'reduced' ? 'reduced' : 'full', sound: storedReading?.sound === 'on' ? 'on' : 'off',
  ambience: storedReading?.ambience === 'on' ? 'on' : 'off', cg: storedReading?.cg === 'on' ? 'on' : 'off' };
const artStyleKey = slug => `dancheong-vn-art-style-v1:${slug}`;
function loadArtStyle(slug) { try { return localStorage.getItem(artStyleKey(slug)) || ''; } catch { return ''; } }
state.artStyle = loadArtStyle(state.activeSlug);
Object.assign(state, { playback: 'manual', playbackTimer: 0, readThrough: -1, bookmark: null, awaitingTurn: false, submittedTurnId: '', readerWork: '', lastDirectionKey: '', lastScene: null, hideText: false, backdropSequence: 0, generationStarted: 0 });
const sound = createSound(() => state.reading.sound === 'on');
const ambience = createAmbience(() => state.reading.ambience === 'on' && state.screen === 'stage' && !document.hidden);
Object.assign(state, { stageOrder: [], speakerNames: new Map(), firedEffects: new Set(), focusId: '', ambienceTarget: null, met: [], metKey: '' });
root.dataset.motion = state.reading.motion;
const meter = installCostMeter({ context: () => ({ slug: state.activeSlug, title: currentWork()?.title || '' }), onChange: () => { if ($('vn-settings-dialog').open && !$('vn-cost-panel').hidden) void renderCosts(); } });
const castDirector = createCastDirector({ getConnection: () => ({ key: textKey(), model: providerModels[state.provider], endpoint: state.provider === 'openai' ? '/api/openai/responses' : '/api/go/responses' }), read: readAsset, write: writeAsset,
  onChange: () => { if (state.api && state.screen === 'stage') renderPage(); }, onError: toast });
const assets = createStageAssets({ castDirector, getKey: imageKey, getProvider: purpose => imageProviderFor(state.imageRouting, purpose), getStyle: () => state.artStyle, getCgEnabled: () => state.reading.cg === 'on', getQuality: () => state.api?._settings()?.imageQuality === 'medium' ? 'medium' : 'low',
  getReferences: person => window.CortexTurnExperience.selectImageReferences({ visualReferences: [{ characterId: person.id, name: person.name, mode: person.referenceMode, allowedAssetRefs: person.allowedAssetRefs, primaryAssetRef: person.primaryAssetRef }] }, state.media).map(row => row.dataUrl),
  onChange: () => { if (state.api && state.screen === 'stage') renderPage(); }, onError: toast });
const preparationQueue = createPreparationQueue({ concurrency: 3, onError: error => toast(error?.message || '장면 준비 오류') });
let toastTimer = 0;

function toast(message) {
  $('vn-toast').textContent = message;
  $('vn-toast').classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('vn-toast').classList.remove('is-visible'), 4500);
}

function textKey() { return state.provider === 'openai' ? state.keys.openai : state.keys.go; }
function imageKey(purpose = 'background') { return state.keys[imageProviderFor(state.imageRouting, purpose)] || ''; }
function hasImageKey() { return Boolean(imageKey('background') || imageKey('portrait')); }
function applyProvider() {
  if (!(state.provider in providerModels)) state.provider = 'openai';
  if (!['low', 'medium', 'high'].includes(state.effort)) state.effort = 'low';
  const isGo = state.provider !== 'openai';
  globalThis.NexusCortexTextProvider = state.provider === 'muse' ? 'opencode-go' : state.provider === 'go-luna' ? 'opencode-go-luna' : 'openai';
  globalThis.NexusCortexTextModel = providerModels[state.provider];
  globalThis.NexusCortexTextApiKey = textKey();
  globalThis.NexusCortexTextEndpoint = '/api/go/responses';
  const sceneProvider = imageProviderFor(state.imageRouting, 'scene');
  globalThis.NexusCortexImageEndpoint = imageProviders[sceneProvider].endpoint;
  globalThis.NexusCortexImageModel = imageProviders[sceneProvider].model;
  globalThis.NexusCortexImageApiKey = imageKey('scene');
  globalThis.NexusRequireImageApiKey = () => {
    if (imageKey('scene')) return true;
    toast(`이미지를 생성하려면 설정에서 ${imageProviders[sceneProvider].label} API 키를 입력해 주세요.`);
    openSettings();
    return false;
  };
  state.api?._setSettings({ apiKey: textKey(), model: providerModels[state.provider], baseUrl: apiBase, writerReasoningEffort: isGo && state.provider === 'muse' ? state.effort : undefined });
}

const busy = () => state.api?._turns().some(turn => ['STREAMING', 'ADJUDICATION_PENDING'].includes(turn.status) || turn.imageStatus === 'GENERATING' || turn.metrics?.lifecycle?.stage === 'PERSISTING');
const currentWork = () => state.catalog.find(work => work.slug === state.activeSlug);
const currentCover = () => state.activeSlug ? `/api/work/${encodeURIComponent(state.activeSlug)}/cover` : '';

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
  await storeSnapshot(state.activeSlug, await state.api._fullExport());
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
  const response = await fetch(`/api/work/${encodeURIComponent(slug)}/download`);
  if (!response.ok) throw new Error(`작품을 내려받지 못했습니다 (${response.status}).`);
  const file = new File([await response.blob()], `${slug}.zip`, { type: 'application/zip' });
  const dialog = $('nexusImportDialog');
  const fileInput = $('nexusPackageFile');
  const apply = $('applyNexusPackage');
  const report = $('nexusImportReport');
  dialog.classList.add('vn-internal-import');
  dialog.showModal();
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await waitUntil(() => { if (report.classList.contains('bad')) throw new Error(report.textContent || '작품 검사 실패'); return report.classList.contains('ok') && !apply.disabled; });
    apply.click();
    await waitUntil(() => { if (report.classList.contains('bad')) throw new Error(report.textContent || '작품 적용 실패'); return !dialog.open; });
  } finally { if (dialog.open) dialog.close(); dialog.classList.remove('vn-internal-import'); }
}

async function loadMedia() {
  try { state.media = await state.api._packageMedia(); }
  catch { state.media = []; }
}

function sceneScope(scenario = state.api?._scenario()) { return `${state.activeSlug}:${scenario?.runtime?.storyId || 'story'}`; }
function captureLatest(scenario, turns, force = false) {
  const last = turns.at(-1);
  if (!last || last.status !== 'COMMITTED' || last.vnScene?.version >= sceneVersion || !state.activeSlug || (state.switching && !force)) return false;
  last.vnScene = captureScene({ scope: sceneScope(scenario), scenario, turn: last, priorTurns: turns.slice(0, -1), previous: turns.at(-2)?.vnScene || state.openingScene, experience: window.CortexTurnExperience });
  return true;
}
async function loadPresentation() {
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
  try { state.openingScene = (await readAsset(key))?.scene || null; } catch { /* Readable without storage. */ }
  if (!turns.length && (!state.openingScene || state.openingScene.version < sceneVersion)) {
    const text = openingText();
    state.openingScene = captureScene({ scope: sceneScope(scenario), scenario, turn: { id: 'opening', status: 'COMMITTED', text }, experience: window.CortexTurnExperience });
    try { await writeAsset({ key, scene: state.openingScene }); } catch { toast('장면 정보를 현재 탭에만 보관합니다.'); }
  }
  if (captureLatest(scenario, turns, true)) await state.api.persist();
  await meter.importHistory(turns);
}

async function openWork(slug) {
  if (state.switching) return;
  // Returning to the same running work changes only the view. Keep its writer,
  // images, current page and reveal clock; never import or bootstrap it again.
  if (slug === state.activeSlug && state.pages.length && state.api?._scenario()?.runtime?.storyId !== 'unconfigured') {
    showTitle(); return;
  }
  if (busy() || assets.isBusy()) return toast('현재 장면이 완료된 뒤 작품을 바꿔 주세요.');
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
  } finally { state.switching = false; $('vn-library-count').textContent = `${state.catalog.length}개 공개 항목`; }
}

function showScreen(screen) {
  stopPlayback();
  state.screen = screen;
  if (screen !== 'stage') ambience.stop();
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
  const started = !fresh && (state.api?._turns().length > 0 || Boolean(state.bookmark));
  $('vn-title-start').textContent = started ? '이어하기' : '시작하기';
  $('vn-title-cast-panel').hidden = true;
  showScreen('title');
  $('vn-title-start').focus({ preventScroll: true });
}
function startFromTitle() { showScreen('stage'); sync(true); }
async function renderMetCast() {
  const list = $('vn-title-cast-list'); list.replaceChildren();
  const met = await assets.metPortraits(state.met).catch(() => []);
  if (!met.length) { const empty = document.createElement('p'); empty.className = 'vn-title-cast-empty'; empty.textContent = '아직 무대에서 만난 인물이 없습니다. 이야기를 진행하면 이곳에 기록됩니다.'; list.append(empty); return; }
  for (const person of met) {
    const card = document.createElement('figure'); card.className = 'vn-title-cast-card';
    if (person.url) {
      const image = document.createElement('img'); image.alt = person.name; image.src = person.url;
      void displaySprite(person.url).then(url => { image.src = url; });
      card.append(image);
    } else { const ghost = document.createElement('div'); ghost.className = 'vn-title-cast-ghost'; ghost.setAttribute('aria-hidden', 'true'); card.append(ghost); }
    const name = document.createElement('figcaption'); name.textContent = person.name;
    card.append(name); list.append(card);
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

function collectPages() {
  const turns = state.api._turns();
  const pages = turns.flatMap((turn, index) => readableTurnPages(turn, index));
  return pages.length ? pages : openingPages();
}

function setBackground(url) {
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
    node.classList.add('is-leaving'); setTimeout(() => { if (node.classList.contains('is-leaving')) node.remove(); }, 480);
  }
  state.stageOrder = stageOrder(state.stageOrder, people.map(person => person.id));
  const narrow = innerWidth <= 760, positions = stagePositions(state.stageOrder.length, { layout: state.reading.layout, narrow }), width = slotWidth(state.stageOrder.length, narrow);
  container.dataset.count = String(people.length);
  container.classList.toggle('has-speaker', Boolean(speakerId && portraits.some(person => person.id === speakerId)));
  for (const person of people) {
    const index = state.stageOrder.indexOf(person.id);
    let slot = [...container.children].find(node => node.dataset.characterId === person.id && !node.classList.contains('is-leaving'));
    if (!slot) {
      slot = document.createElement('div'); slot.className = 'vn-character is-entering'; slot.dataset.characterId = person.id;
      // Enter from the side the person will stand on.
      slot.style.setProperty('--enter', positions[index] < 0.5 ? '-28px' : '28px');
      container.append(slot); requestAnimationFrame(() => requestAnimationFrame(() => slot.classList.remove('is-entering')));
    }
    slot.style.setProperty('--x', String(positions[index]));
    slot.style.setProperty('--w', String(width));
    slot.style.setProperty('--hs', String(heightScale(person.profile)));
    slot.style.zIndex = person.id === speakerId ? '5' : String(1 + index);
    const speaking = person.id === speakerId;
    if (speaking && !slot.classList.contains('is-speaking') && !motionReduced()) slot.querySelector('.vn-character-image.is-visible')?.animate([{ translate: '0 0' }, { translate: '0 -1.2%' }, { translate: '0 0' }], { duration: 260, easing: 'ease-out' });
    slot.classList.toggle('is-speaking', speaking);
    slot.classList.toggle('is-focus', person.id === (state.focusId || speakerId));
    slot.classList.toggle('is-placeholder', Boolean(person.placeholder));
    if (person.placeholder) {
      if (!slot.querySelector('.vn-ghost')) { const ghost = document.createElement('div'); ghost.className = 'vn-ghost'; const label = document.createElement('span'); label.textContent = person.name; ghost.append(label); slot.append(ghost); }
      continue;
    }
    // Keep the already visible face while a needed new expression is being made.
    if (person.expressionReady === false && slot.dataset.ready && slot.vnBaseKey === person.baseKey) continue;
    slot.vnBaseKey = person.baseKey;
    const url = person.url, displayKey = url;
    // Kept as a property: data-URL keys are too large for DOM attributes.
    if (slot.vnDisplayKey === displayKey) continue;
    slot.vnDisplayKey = displayKey;
    void displaySprite(url).then(src => {
      if (slot.vnDisplayKey !== displayKey) return;
      const incoming = document.createElement('img'); incoming.src = src; incoming.alt = `${person.name} · ${person.expression}`; incoming.className = 'vn-character-image';
      const previous = [...slot.children];
      incoming.onload = () => {
        if (slot.vnDisplayKey !== displayKey) return incoming.remove();
        incoming.classList.add('is-visible'); slot.dataset.ready = url;
        for (const node of previous) node.classList.remove('is-visible');
        setTimeout(() => previous.forEach(node => node.remove()), 260);
        queueMicrotask(() => { if (state.screen === 'stage') renderPage(); });
      };
      incoming.onerror = () => { slot.dataset.ready = ''; toast('인물 이미지를 표시하지 못했습니다. 이미지 없이 읽거나 다시 시도해 주세요.'); };
      slot.append(incoming);
    });
  }
}

function setCg(url) {
  if (cgLayer.dataset.url === (url || '')) return;
  cgLayer.dataset.url = url || '';
  if (url) cgLayer.style.backgroundImage = `url("${url.replaceAll('"', '%22')}")`;
  cgLayer.classList.toggle('is-visible', Boolean(url));
  $('vn-stage').classList.toggle('has-cg', Boolean(url));
}

function pageScene(page) {
  if (!page) return null;
  const turns = state.api._turns(), turn = page.turnIndex < 0 ? { id: 'opening', status: 'COMMITTED', text: openingText() } : turns[page.turnIndex];
  if (!turn) return null;
  const priorTurns = turns.slice(0, Math.max(0, page.turnIndex));
  const unit = publishedUnit(turn, page, priorTurns.at(-1)?.text || '');
  const previous = priorTurns.at(-1)?.vnScene || state.openingScene;
  const original = state.api._scenario(), world = turn.vnScene?.world || previous?.world || original.world;
  const annotations = (turn.dialogueAnnotations || []).filter(row => Number(row.offset) < unit.end);
  const key = JSON.stringify([sceneScope(), turn.id, unit.start, unit.prefix, unit.previousText, unit.ready, world, annotations]);
  if (state.stageScenes.has(key)) return state.stageScenes.get(key);
  // Direct published prefixes independently from the final turn snapshot. This
  // releases public appearance gates without inspecting the writer's draft.
  const scene = captureScene({ scope: sceneScope(), scenario: { ...original, world },
    turn: { ...turn, status: 'COMMITTED', text: unit.prefix, displayText: undefined,
      dialogueAnnotations: annotations },
    priorTurns, previous, timeline: true, experience: window.CortexTurnExperience });
  Object.assign(scene, { publicText: unit.text, previousText: unit.previousText, castPages: unit.pages, castPending: !unit.ready, unitKey: key });
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
  $('vn-actions').hidden = !state.actions;
  if (!state.actions) return;
  const list = $('vn-suggestions'); list.replaceChildren();
  for (const [index, row] of publicRecommendations().entries()) {
    const button = document.createElement('button'); button.type = 'button';
    button.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span><strong></strong><i>↗</i>`;
    button.querySelector('strong').textContent = row.label;
    button.disabled = busy() || state.awaitingTurn || Boolean(storageProblem(state.api));
    button.addEventListener('click', () => { sound.play('choice'); void submit(row.label); }); list.append(button);
  }
  $('vn-compose').hidden = !state.customInputOpen;
  $('vn-custom-toggle').hidden = state.customInputOpen;
  $('vn-custom-toggle').textContent = '직접 행동이나 대사 입력';
  $('vn-continue').disabled = busy() || state.awaitingTurn || Boolean(storageProblem(state.api));
  $('vn-send').disabled = $('vn-continue').disabled;
  const page = state.pages[state.cursor], scene = pageScene(page), view = assets.view(scene, page);
  $('vn-retry-image').textContent = '이미지 생성 재시도';
  $('vn-retry-image').hidden = !scene || (view?.status !== 'error' && view?.cgStatus !== 'error');
}

function resetReader() {
  stopPlayback(); state.reveal.reset(); state.reveal.frameKey = '';
  preparationQueue.clear();
  state.stageScenes.clear(); state.preparedBeats.clear(); state.dialogueBypass.clear(); state.dialogueWaiting = false;
  state.pages = []; state.cursor = 0; state.readThrough = -1;
  state.lastDirectionKey = ''; state.lastScene = null; state.awaitingTurn = false;
  state.stageOrder = []; state.speakerNames.clear(); state.firedEffects.clear(); state.focusId = '';
  state.readerWork = `dancheong-vn-position-v1:${sceneScope()}`;
  try { state.bookmark = JSON.parse(localStorage.getItem(state.readerWork) || 'null'); } catch { state.bookmark = null; }
  state.metKey = `dancheong-vn-met-v1:${sceneScope()}`;
  try { const stored = JSON.parse(localStorage.getItem(state.metKey) || '[]'); state.met = Array.isArray(stored) ? stored.filter(row => row?.id) : []; } catch { state.met = []; }
  setTextHidden(false);
}
function saveReadingPosition() {
  if (!state.readerWork || !state.pages[state.cursor]) return;
  try { localStorage.setItem(state.readerWork, JSON.stringify({ cursor: pageKey(state.pages[state.cursor]), read: pageKey(state.pages[state.readThrough]) })); } catch { /* Playback still works without durable progress. */ }
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
  const columns = Math.max(14, Math.floor((innerWidth < 760 ? innerWidth - 48 : Math.min(innerWidth * 0.72, 980)) / (innerWidth < 760 ? 20 : 27) / (state.reading.font === 'large' ? 1.18 : 1)));
  const frame = nvl ? readingFrame(state.pages, state.cursor, { columns, lineBudget: innerHeight < 500 ? 5 : 8 }) : [{ page, index: state.cursor, text: page.text }];
  const full = String(frame.at(-1)?.text || '…');
  const key = pageKey(page), frameKey = `${key}:${state.reading.layout}:${columns}:${frame[0]?.index}`;
  if (key !== reveal.key || full !== reveal.text) { clearTimeout(state.playbackTimer); state.playbackTimer = 0; }
  const surface = $('vn-dialogue-text');
  // NVL keeps each line's speaker: a small label above spoken lines, in a
  // stable per-person accent, remembered once the cast check names them.
  if (page.speakerResolved) state.speakerNames.set(key, page.speaker ? { name: page.speaker, id: page.characterId || page.speaker } : null);
  const speakerOf = row => row.page.kind === 'dialogue' || row.page.quoted ? state.speakerNames.get(pageKey(row.page)) || null : null;
  if (frameKey !== reveal.frameKey) {
    surface.replaceChildren(); reveal.frameKey = frameKey;
    for (const [index, row] of frame.entries()) {
      const line = document.createElement('p');
      line.className = index === frame.length - 1 ? 'vn-current-line' : 'vn-read-line';
      const label = document.createElement('span'); label.className = 'vn-line-speaker'; label.hidden = true;
      const copy = document.createElement('span'); copy.className = 'vn-line-text';
      copy.textContent = index === frame.length - 1 ? '' : row.text;
      line.append(label, copy); surface.append(line);
      if (index === frame.length - 1) {
        reveal.element = copy;
        const buffer = document.createElement('span'); buffer.className = 'vn-inline-buffer'; buffer.hidden = true;
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
    if (speaker && label.textContent !== speaker.name) label.textContent = speaker.name;
    if (speaker) line.style.setProperty('--speaker-hue', String(speakerHue(speaker.id)));
    if (index < frame.length - 1 && copy.textContent !== row.text) copy.textContent = row.text;
  }
  reveal.update({ key, text: state.dialogueWaiting ? '' : full, speed: state.api._settings()?.typingSpeed,
    immediate: !state.dialogueWaiting && (state.cursor <= state.readThrough || state.playback === 'skip') });
  $('vn-stage').classList.toggle('is-revealing', reveal.length < reveal.glyphs.length);
  updateNextBuffer();
}
function updateNextBuffer() {
  const indicator = $('vn-dialogue-text').querySelector('.vn-inline-buffer');
  if (!indicator || !state.api) return;
  const next = state.pages[state.cursor + 1];
  const nextScene = next ? pageScene(next) : null;
  const reason = nextWaitReason({ complete: state.reveal.length >= state.reveal.glyphs.length && state.reveal.length > 0,
    blocked: state.dialogueWaiting || state.actions || state.screen !== 'stage', loading: state.awaitingTurn || busy(),
    nextPage: next, nextView: nextScene ? assets.view(nextScene, next) : null, imagesEnabled: Boolean(imageKey('portrait')) });
  indicator.hidden = !reason;
  indicator.setAttribute('aria-label', reason || '다음 문장 준비 중');
  indicator.title = reason;
  $('vn-stage').classList.toggle('is-buffering-next', Boolean(reason));
}
function stopPlayback() {
  clearTimeout(state.playbackTimer); state.playbackTimer = 0; state.playback = 'manual';
  for (const id of ['vn-auto', 'vn-skip']) $(id)?.setAttribute('aria-pressed', 'false');
}
function playbackBlocked() { return state.dialogueWaiting || state.screen !== 'stage' || state.actions || state.awaitingTurn || document.hidden || state.hideText || $('vn-settings-dialog').open || !$('vn-history').hidden || root.classList.contains('vn-menu-open'); }
function schedulePlayback() {
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
  const next = state.playback === mode ? 'manual' : mode; stopPlayback();
  if (next === 'manual') return;
  if (playbackBlocked()) return toast('장면을 읽는 화면에서 사용할 수 있습니다.');
  if (next === 'skip' && state.cursor >= state.readThrough) return toast('여기까지 읽었습니다.');
  state.playback = next; $(next === 'auto' ? 'vn-auto' : 'vn-skip').setAttribute('aria-pressed', 'true');
  schedulePlayback();
}
function setTextHidden(hidden) {
  stopPlayback(); state.hideText = hidden;
  $('vn-stage').classList.toggle('is-text-hidden', hidden); $('vn-show-text').hidden = !hidden;
}
function openHistory() {
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
  const cut = $('vn-scene-cut');
  if (kind === 'fade') cut.animate([{ opacity: 0 }, { opacity: 0.92, offset: 0.35 }, { opacity: 0 }], { duration: 950 });
  if (kind === 'wipe') cut.animate([{ opacity: 1, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)', offset: 0.45 }, { opacity: 1, clipPath: 'inset(0 0 0 100%)' }], { duration: 1050, easing: 'ease-in-out' });
  if (kind === 'blur') visual.animate([{ filter: 'blur(14px) brightness(.55)' }, { filter: 'blur(0) brightness(1)' }], { duration: 1400, easing: 'ease-out' });
  if (kind === 'flash') flash('#ffffff', 560, 0.85);
}
function playEffect(kind) {
  if (kind === 'shake') visual.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-5px,1px)', offset: 0.2 }, { transform: 'translate(4px,-1px)', offset: 0.45 }, { transform: 'translate(-2px,0)', offset: 0.7 }, { transform: 'translate(0,0)' }], { duration: 280 });
  if (kind === 'heavy_shake') visual.animate([{ transform: 'translate(0,0) scale(1.02)' }, { transform: 'translate(-12px,6px) scale(1.02)', offset: 0.15 }, { transform: 'translate(10px,-7px) scale(1.02)', offset: 0.35 }, { transform: 'translate(-7px,4px) scale(1.01)', offset: 0.55 }, { transform: 'translate(4px,-2px)', offset: 0.75 }, { transform: 'translate(0,0)' }], { duration: 480 });
  if (kind === 'flash_white') { flash('#ffffff', 420, 0.95); playEffect('shake'); }
  if (kind === 'flash_red') { flash('radial-gradient(circle,#b3121b55 30%,#6d0008 100%)', 760, 0.8); playEffect('shake'); }
}
function applyDirection(page, scene, view) {
  const stage = $('vn-stage');
  // Environment grading works on every beat, including streaming ones.
  stage.dataset.light = lightFor(scene?.world?.time || '');
  stage.dataset.weather = weatherFor(scene?.world);
  if (page.isLive) return;
  const model = view?.direction || null, key = pageKey(page), directionKey = `${key}:${model ? JSON.stringify(model) : ''}`;
  if (directionKey === state.lastDirectionKey) return;
  // A model decision can arrive after a narration beat is shown. Then only the
  // framing updates; location cuts belong to the first arrival on the beat.
  const refresh = state.lastDirectionKey.startsWith(`${key}:`);
  const transition = refresh ? 'none' : transitionFor(state.lastScene, scene);
  state.lastDirectionKey = directionKey; state.lastScene = scene;
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
  if (reduced || state.cursor <= state.readThrough) return;
  if (transition === 'none' && direction.transition !== 'none' && !state.firedEffects.has(`${key}:t`)) { state.firedEffects.add(`${key}:t`); playTransition(direction.transition); }
  if (direction.fx !== 'none' && !state.firedEffects.has(`${key}:fx`)) { state.firedEffects.add(`${key}:fx`); playEffect(direction.fx); }
  if (state.firedEffects.size > 400) state.firedEffects.clear();
}

function renderPage() {
  let page = state.pages[state.cursor];
  if (!page) return;
  const turns = state.api._turns();
  const scenario = state.api._scenario();
  const scene = pageScene(page), visualPage = presentationPage(scene, page), view = assets.view(scene, visualPage);
  page = resolvedSpeaker(page, view);
  root.dataset.font = state.reading.font; root.dataset.motion = state.reading.motion;
  $('vn-stage').classList.toggle('is-nvl', state.reading.layout === 'nvl');
  $('vn-stage').classList.toggle('is-adv', state.reading.layout === 'adv');
  applyDirection(page, scene, view);
  const previousEnvironment = turns.slice(0, page.turnIndex).reverse().map(turn => assets.view(turn.vnScene, {})?.background).find(Boolean) || assets.view(state.openingScene, {})?.background;
  const background = view?.background || previousEnvironment ? { url: view?.background || previousEnvironment, source: 'generated' } : backgroundFor(turns, page.turnIndex, currentCover(), state.openingArt);
  setBackground(background.url);
  // Background and sprites finish independently. Ready characters remain visible
  // even when a new background is pending, failed, or not generated yet.
  setPortraits(view, page.characterId);
  setCg(view?.cg || '');
  const met = recordMet(state.met, view);
  if (met !== state.met) { state.met = met; try { localStorage.setItem(state.metKey, JSON.stringify(met)); } catch { /* Kept for this tab. */ } }
  ambience.update(state.ambienceTarget);
  const speakingPortrait = view?.portraits.find(person => person.id === view.speakerId);
  const decoded = Boolean(speakingPortrait && [...$('vn-characters').children].some(slot => slot.dataset.characterId === speakingPortrait.id && (slot.dataset.ready === speakingPortrait.url || speakingPortrait.expressionReady === false && slot.dataset.ready && slot.vnBaseKey === speakingPortrait.baseKey)));
  state.dialogueWaiting = dialogueWait(page, view, { enabled: Boolean(imageKey('portrait')), decoded, bypass: state.dialogueBypass.has(pageKey(page)) });
  $('vn-dialogue-wait').hidden = !state.dialogueWaiting;
  const selectedTurn = turns[page.turnIndex];
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
  $('vn-page-count').textContent = `${String(state.cursor + 1).padStart(2, '0')} / ${String(state.pages.length).padStart(2, '0')}`;
  $('vn-prev').disabled = state.cursor === 0;
  $('vn-next').textContent = state.cursor < state.pages.length - 1 ? '다음 →' : state.actions ? '입력 중' : '선택하기 →';
  $('vn-next').disabled = state.actions || state.dialogueWaiting;
  $('vn-work-label').textContent = currentWork()?.title || scenario?.title || 'DANCHEONG';
  $('vn-scene-title').textContent = scenario?.event?.title || '현재 장면';
  $('vn-scene-place').textContent = [scene?.world?.location || scenario?.world?.location, scene?.world?.time || $('worldClock')?.textContent].filter(Boolean).join(' · ');
  $('vn-scene-counter').textContent = page.turnIndex < 0 ? 'OPENING' : `BEAT ${String(page.turnIndex + 1).padStart(2, '0')}`;
  const notice = imageNotice(view, hasImageKey());
  visualStatus.hidden = !notice; visualStatus.disabled = notice?.action === 'wait';
  visualStatus.dataset.action = notice?.action || '';
  visualStatus.dataset.keyKind = notice?.keyKind || 'image';
  $('vn-image-status').textContent = notice?.text || '';
  $('vn-stage').classList.toggle('has-image-notice', Boolean(notice));
  $('vn-stage').classList.toggle('is-narration', page.kind !== 'dialogue');
  $('vn-stage').classList.toggle('is-dialogue', page.kind === 'dialogue');
  $('vn-stage').classList.toggle('has-actions', state.actions);
  $('vn-stage').classList.toggle('has-cover', background.source === 'cover');
  renderActions();
  saveReadingPosition(); schedulePlayback();
}

function maybeAutoGenerate() {
  if (state.screen !== 'stage' || state.switching) return;
  const units = new Map();
  for (const page of preparationPages(state.pages, state.cursor)) {
    const scene = pageScene(page);
    if (!scene || scene.castPending) continue;
    if (!units.has(scene.unitKey)) units.set(scene.unitKey, { scene, pages: [] });
    units.get(scene.unitKey).pages.push(page);
  }
  // Process the whole published incoming turn from its first narration. A
  // bounded queue avoids flooding the provider; it never uses writer drafts.
  for (const { scene, pages } of units.values()) {
    const key = `${scene.unitKey}:${state.imageRouting.background}:${state.imageRouting.character}:${Boolean(imageKey('background'))}:${Boolean(imageKey('portrait'))}:${Boolean(textKey())}`;
    if (state.preparedBeats.has(key)) continue;
    state.preparedBeats.add(key);
    const scope = sceneScope();
    preparationQueue.add(key, async current => {
      const active = () => current() && state.screen === 'stage' && sceneScope() === scope;
      try {
        if (!active()) return;
        const { completion } = await prepareAhead({ scene, pages, castDirector, assets, active, generate: hasImageKey(), preload: displaySprite });
        void completion.catch(error => toast(error?.message || '장면 준비 오류')).finally(() => { if (!active()) state.preparedBeats.delete(key); });
      } finally { if (!active()) state.preparedBeats.delete(key); }
    });
  }
}

function sync(force = false) {
  const storage = syncRecovery();
  if (!state.api || state.screen !== 'stage') return;
  const turns = state.api._turns();
  const last = turns.at(-1);
  const key = [turns.length, last?.id, last?.status, last?.displayText?.length, last?.text?.length, last?.imageStatus, Boolean(last?.imageUrl), last?.displayTyping, state.actions, state.awaitingTurn, busy(), Boolean(storage)].join('|');
  if (force || key !== state.renderKey) {
    const previous = state.pages, next = collectPages();
    const arrived = state.awaitingTurn && next.at(-1)?.turnId !== state.submittedTurnId && next.at(-1)?.turnId !== 'opening';
    state.cursor = reconcileCursor(previous, next, state.cursor, { first: state.startAtFirst, awaiting: arrived, bookmark: state.bookmark?.cursor });
    // Opening pages disappear when the first committed turn arrives. Do not carry
    // their numeric read limit over to new, unread story pages.
    state.readThrough = reconcileReadThrough(previous, next, state.readThrough, state.bookmark?.read);
    state.pages = next;
    if (state.startAtFirst || arrived) { state.actions = false; state.startAtFirst = false; }
    if (arrived) state.awaitingTurn = false;
    state.renderKey = key;
    renderPage();
  }
  maybeAutoGenerate();
}

function nextPage(fromPlayback = false) {
  if (!fromPlayback) stopPlayback();
  if (state.hideText) return setTextHidden(false);
  if (state.actions) return;
  if (state.dialogueWaiting) return;
  if (finishReveal()) return;
  if (state.cursor < state.pages.length - 1) { if (!fromPlayback) sound.play(); state.cursor += 1; state.following = false; renderPage(); return; }
  if (state.awaitingTurn || busy()) return;
  const last = state.api._turns().at(-1);
  if (last && ['STREAMING', 'ADJUDICATION_PENDING'].includes(last.status)) return toast('장면이 완성되는 중입니다.');
  state.actions = true; state.customInputOpen = false; renderPage();
}

function prevPage() {
  stopPlayback();
  if (state.hideText) return setTextHidden(false);
  if (state.actions) { state.actions = false; renderPage(); return; }
  if (state.cursor > 0) { state.cursor -= 1; state.following = false; renderPage(); }
}

async function submit(value, auto = false) {
  const problem = syncRecovery();
  if (problem) return toast(problem.message);
  if (busy() || state.awaitingTurn) return toast('장면이 완성된 뒤 진행해 주세요.');
  if (!textKey()) { openSettings(); return toast('본문 생성을 위한 API 키를 설정해 주세요.'); }
  const text = String(value || '').trim();
  if (!auto && !text) return toast('행동이나 대사를 입력해 주세요.');
  if (!auto) $('vn-input').value = text;
  stopPlayback();
  state.submittedTurnId = state.pages.at(-1)?.turnId || 'opening';
  state.awaitingTurn = true; state.generationStarted = Date.now();
  state.actions = false; state.following = false; renderPage();
  try {
    await submitEngineTurn(state.api, { input: text, auto, notice: () => engineNotice && !engineNotice.hidden ? engineNotice.textContent : '' });
    $('vn-input').value = '';
    sync(true);
  } catch (error) { state.actions = true; toast(error?.message || '이야기를 진행하지 못했습니다.'); }
  finally { state.awaitingTurn = false; sync(true); }
}

function openSettings() {
  stopPlayback();
  const dialog = $('vn-settings-dialog');
  (dialog.querySelector(`input[name="vn-provider"][value="${state.provider}"]`) || dialog.querySelector('input[name="vn-provider"][value="openai"]')).checked = true;
  $('vn-openai-key').value = state.keys.openai;
  $('vn-go-key').value = state.keys.go;
  $('vn-gemini-key').value = state.keys.gemini || '';
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
  $('vn-motion').value = state.reading.motion;
  $('vn-sound').value = state.reading.sound;
  $('vn-ambience').value = state.reading.ambience;
  $('vn-cg-setting').value = state.reading.cg;
  $('vn-art-style').value = state.artStyle;
  $('vn-art-style').disabled = !state.activeSlug;
  if (!dialog.open) dialog.showModal();
  if (!$('vn-cost-panel').hidden) void renderCosts();
}

function updateImageProviderFields() {
  const gemini = $('vn-background-provider').value === 'gemini' || $('vn-character-provider').value === 'gemini';
  const mixed = $('vn-background-provider').value !== $('vn-character-provider').value;
  const options = $('vn-image-quality').options;
  options[0].textContent = gemini ? '절약·빠르게' : 'Low';
  options[1].textContent = mixed ? '고해상도 · Medium / 2K' : gemini ? '2K · 고해상도' : 'Medium';
  $('vn-image-quality-help').textContent = gemini ? 'Nano Banana 2 절약 설정: 배경 0.5K, 인물·표정·사건 CG 1K. 고해상도는 2K입니다. OpenAI는 Low / Medium을 사용합니다. 실제 모델별 사용량·예상 비용은 비용 탭에서 확인하세요.' : '';
}

async function renderCosts() { await meter.render($('vn-cost-panel'), state.activeSlug); }
function settingsTab(costs) {
  $('vn-connection-panel').hidden = costs; $('vn-cost-panel').hidden = !costs;
  $('vn-connection-tab').setAttribute('aria-selected', String(!costs)); $('vn-cost-tab').setAttribute('aria-selected', String(costs));
  if (costs) void renderCosts();
}

async function saveSettings() {
  if (busy() || assets.isBusy()) return toast('현재 장면이 완료된 뒤 설정을 바꿔 주세요.');
  const provider = $('vn-settings-dialog').querySelector('input[name="vn-provider"]:checked')?.value || 'openai';
  const openai = $('vn-openai-key').value.trim();
  const go = $('vn-go-key').value.trim();
  const gemini = $('vn-gemini-key').value.trim();
  const imageRouting = { background: $('vn-background-provider').value === 'gemini' ? 'gemini' : 'openai', character: $('vn-character-provider').value === 'gemini' ? 'gemini' : 'openai' };
  if ([openai, go, gemini].some(key => key && !/^\S{1,512}$/u.test(key))) return toast('API 키에 공백이 있거나 길이가 너무 깁니다.');
  $('vn-settings-save').disabled = true;
  try {
    await storeDeviceKeys({ openai, go, gemini });
    if (JSON.stringify(state.imageRouting) !== JSON.stringify(imageRouting) || state.keys.openai !== openai || state.keys.gemini !== gemini) assets.resetFailures();
    state.keys = { openai, go, gemini };
    state.imageRouting = imageRouting;
    localStorage.setItem(imageRoutingKey, JSON.stringify(state.imageRouting));
    state.provider = provider in providerModels ? provider : 'openai';
    state.effort = $('vn-muse-effort').value;
    localStorage.setItem(providerKey, state.provider);
    localStorage.setItem(effortKey, state.effort);
    state.reading = { layout: $('vn-reading-layout').value, pace: $('vn-auto-pace').value, font: $('vn-font-size').value, motion: $('vn-motion').value, sound: $('vn-sound').value,
      ambience: $('vn-ambience').value, cg: $('vn-cg-setting').value };
    if (state.activeSlug) {
      state.artStyle = $('vn-art-style').value.trim().slice(0, 600);
      try { if (state.artStyle) localStorage.setItem(artStyleKey(state.activeSlug), state.artStyle); else localStorage.removeItem(artStyleKey(state.activeSlug)); } catch { /* Style stays for this tab. */ }
    }
    localStorage.setItem(readingPrefsKey, JSON.stringify(state.reading));
    root.dataset.motion = state.reading.motion;
    state.reveal.key = ''; state.lastDirectionKey = '';
    applyProvider();
    state.api._setSettings({ styleGuide: $('vn-style-guide').value.trim(), typingSpeed: $('vn-typing-speed').value, imageQuality: $('vn-image-quality').value });
    const saved = await state.api.persist();
    if (!saved?.ok) { $('vn-settings-dialog').close(); sync(true); throw new Error('연결 키는 보관했지만 작품 설정을 저장하지 못했습니다. 진행 안내에서 현재 기록을 보존해 주세요.'); }
    $('vn-settings-dialog').close();
    state.preparedScenePage = ''; state.preparedBeats.clear(); assets.resetFailures();
    sync(true);
    toast('연결 설정을 저장했습니다.');
  } catch (error) { toast(error?.message || '연결 설정을 저장하지 못했습니다.'); }
  finally { $('vn-settings-save').disabled = false; }
}

function renderHistory() {
  const list = $('vn-history-list'); list.replaceChildren();
  for (const [index, page] of state.pages.entries()) {
    if (index > state.readThrough) break;
    const button = document.createElement('button'); button.type = 'button';
    const title = document.createElement('strong'); title.textContent = `${String(index + 1).padStart(2, '0')} · ${page.kind === 'dialogue' ? page.speaker || '대화' : '이야기'}`;
    const copy = document.createElement('span'); copy.textContent = pageText(page);
    button.append(title, copy); button.addEventListener('click', () => { state.cursor = index; state.following = index === state.pages.length - 1; state.actions = false; $('vn-history').hidden = true; renderPage(); });
    list.append(button);
  }
  list.lastElementChild?.scrollIntoView({ block: 'nearest' });
}

$('vn-home').addEventListener('click', () => { saveReadingPosition(); showScreen('library'); renderCatalog(); });
window.addEventListener('beforeunload', event => {
  if (storageProblem(state.api)) { event.preventDefault(); event.returnValue = ''; }
});
$('vn-title-start').addEventListener('click', startFromTitle);
$('vn-title-settings').addEventListener('click', openSettings);
$('vn-title-library').addEventListener('click', () => { showScreen('library'); renderCatalog(); });
$('vn-title-cast').addEventListener('click', () => { $('vn-title-cast-panel').hidden = false; void renderMetCast(); $('vn-title-cast-close').focus({ preventScroll: true }); });
$('vn-title-cast-close').addEventListener('click', () => { $('vn-title-cast-panel').hidden = true; $('vn-title-cast').focus({ preventScroll: true }); });
// Browsers start audio only after a gesture; resume the ambience on the next one.
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => ambience.resume(), { passive: true });
$('vn-menu-toggle').addEventListener('click', () => { stopPlayback(); const open = root.classList.toggle('vn-menu-open'); $('vn-menu-toggle').setAttribute('aria-expanded', String(open)); });
$('vn-settings').addEventListener('click', () => { closeMenu(); openSettings(); });
$('vn-connection-tab').addEventListener('click', () => settingsTab(false));
$('vn-cost-tab').addEventListener('click', () => settingsTab(true));
settingsTabs.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const costs = $('vn-cost-panel').hidden; settingsTab(costs); $(costs ? 'vn-cost-tab' : 'vn-connection-tab').focus(); } });
$('vn-settings-close').addEventListener('click', () => $('vn-settings-dialog').close());
$('vn-settings-cancel').addEventListener('click', () => $('vn-settings-dialog').close());
$('vn-settings-save').addEventListener('click', () => void saveSettings());
imageProviderFields.addEventListener('change', updateImageProviderFields);
$('vn-settings-dialog').querySelector('form').addEventListener('submit', event => { event.preventDefault(); void saveSettings(); });
$('vn-history-toggle').addEventListener('click', openHistory);
$('vn-dialogue-bypass').addEventListener('click', () => { state.dialogueBypass.add(pageKey(state.pages[state.cursor])); state.dialogueWaiting = false; renderPage(); });
$('vn-history-close').addEventListener('click', () => { $('vn-history').hidden = true; });
$('vn-reader-log').addEventListener('click', openHistory);
$('vn-reader-settings').addEventListener('click', openSettings);
visualStatus.addEventListener('click', () => {
  if (visualStatus.dataset.action === 'settings') { openSettings(); $(visualStatus.dataset.keyKind === 'text' ? state.provider === 'openai' ? 'vn-openai-key' : 'vn-go-key' : visualStatus.dataset.keyKind === 'gemini' ? 'vn-gemini-key' : 'vn-openai-key').focus(); }
  else if (visualStatus.dataset.action === 'retry') {
    const page = state.pages[state.cursor], scene = pageScene(page);
    if (scene) void assets.retry(scene, page);
  }
});
$('vn-auto').addEventListener('click', () => togglePlayback('auto'));
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopPlayback(); ambience.stop(); } else if (state.screen === 'stage') ambience.update(state.ambienceTarget); });
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (state.screen === 'stage') renderPage(); }, 120); });
$('vn-prev').addEventListener('click', prevPage);
$('vn-next').addEventListener('click', () => nextPage());
$('vn-dialogue-box').addEventListener('click', event => { if (!event.target.closest('button')) nextPage(); });
$('vn-send').addEventListener('click', () => void submit($('vn-input').value));
$('vn-continue').addEventListener('click', () => void submit('', true));
$('vn-custom-toggle').addEventListener('click', () => { state.customInputOpen = true; renderActions(); $('vn-input').focus(); });
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
    if (!$('vn-history').hidden) $('vn-history').hidden = true;
    else if (state.hideText) setTextHidden(false);
    else if (state.actions) prevPage();
    else $('vn-menu-toggle').click();
    return;
  }
  if (!$('vn-history').hidden) return;
  const shortcut = event.key.toLowerCase();
  if (['a', 's', 'h', 'l', 'f'].includes(shortcut)) {
    event.preventDefault();
    if (shortcut === 'a') togglePlayback('auto');
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

async function boot() {
  await waitUntil(() => window.__DANCHEONG_NEW_ENGINE_TEST__, 30000);
  state.api = window.__DANCHEONG_NEW_ENGINE_TEST__;
  window.NexusVNBeforePersist = captureLatest;
  await state.api._bootstrap();
  state.keys = await loadDeviceKeys();
  applyProvider();
  const baseField = $('baseUrl');
  baseField.value = apiBase;
  baseField.closest('.field').style.display = 'none';
  const scenario = state.api._scenario();
  await fetchCatalog();
  if (state.activeSlug && scenario?.runtime?.storyId !== 'unconfigured') {
    await loadMedia();
    await loadPresentation();
    state.openingArt = await savedOpeningArt(state.activeSlug);
    showTitle();
  } else showScreen('library');
  setInterval(() => sync(), 300);
  window.addEventListener('cortex-turn-display', () => sync(true));
  window.addEventListener('nexus-cortex-persisted', () => sync(true));
  window.NexusVNBoot?.ready();
}

boot().catch(error => { window.NexusVNBoot?.fail(); toast(`시뮬레이터를 시작하지 못했습니다: ${error?.message || error}`); $('vn-library-count').textContent = '시작 오류'; });
