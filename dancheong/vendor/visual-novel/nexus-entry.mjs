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
