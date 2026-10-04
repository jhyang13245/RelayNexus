import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { build } from 'rolldown';
import {upgradeLunaModel} from '../public/cortex-luna-model.mjs';
import {adaptPerformance} from '../vendor/visual-novel/nexus-performance-adapter.mjs';
const source='vendor/visual-novel/public',destination='public/vn-runtime';
const read=path=>fs.readFileSync(path,'utf8');
function replace(code,before,after){if(code.split(before).length!==2)throw Error('VN integration target changed: '+before.slice(0,90));return code.replace(before,after)}
export function adaptVNEngine(original){
  // Reuse the reviewed standalone adapter against the main engine. Upstream
  // source and main canon/occurrence extensions stay separately reproducible.
  const build=read('vendor/visual-novel/scripts/build-cortex.mjs');
  let body=build.slice(build.indexOf('function replaceExactly'),build.indexOf('const adapted = shell'));
  body=body.replace('let shell = original;', 'let shell = original;');
  // The legacy key is already protected by the main host's encrypted vault.
  let adapted=Function('original','storageRecovery',body+'\nreturn shell;')(original,read('vendor/visual-novel/scripts/cortex-storage-recovery.js'));
  // Keep upstream originals and historical cost rates intact. Upgrade active
  // pinned judges, recovery requests and the metadata for newly made calls.
  adapted=adapted.replaceAll("MODEL='gpt-5.6-luna'", "MODEL='gpt-6-luna'")
    .replaceAll("model:'gpt-5.6-luna'", "model:'gpt-6-luna'");
  adapted=replace(adapted,'  async function apiFetchV1390(url,options={}){',`  const upgradeLunaRequestModel = ${upgradeLunaModel.toString()};
  async function apiFetchV1390(url,options={}){
    if(/\\/responses$/.test(url)&&typeof options.body==='string'){
      const body=JSON.parse(options.body),model=upgradeLunaRequestModel(body.model);
      if(model!==body.model)options={...options,body:JSON.stringify({...body,model})};
    }`);
  adapted=replace(adapted,
    'if(globalThis.NexusCortexImageEndpoint && url===globalThis.NexusCortexImageEndpoint) {',
    "if(globalThis.NexusCortexImageEndpoint && url===globalThis.NexusCortexImageEndpoint && (globalThis.NexusVNHandlesTextReveal || settings.model==='muse-spark-1.3-contributor'||globalThis.NexusCortexTextProvider==='opencode-go-luna')) {");
  adapted=replace(adapted,
    'delete body.apiKey;if(globalThis.NexusCortexImageModel)body.model=globalThis.NexusCortexImageModel;',
    "if(globalThis.NexusVNHandlesTextReveal){delete body.apiKey;if(globalThis.NexusCortexImageModel)body.model=globalThis.NexusCortexImageModel;}else if('apiKey' in body)body.apiKey=globalThis.NexusCortexImageApiKey;");
  return adapted.replace("'오리지널 고품질 비주얼노벨 게임의 시네마틱 16:9 한 장면. 장면의 현장 인물과 배경을 자연스럽게 배치하고, 왼쪽에는 흰 본문을 읽을 수 있도록 명암 대비와 여백을 둔다.'", "(globalThis.NexusVNHandlesTextReveal?'오리지널 고품질 비주얼노벨 게임의 시네마틱 16:9 한 장면. 장면의 현장 인물과 배경을 자연스럽게 배치하고, 왼쪽에는 흰 본문을 읽을 수 있도록 명암 대비와 여백을 둔다.':'한국 TV 애니메이션 본편의 한 순간 같은 시네마틱 16:9 장면.')");
}
export async function buildVN(){
  fs.mkdirSync(destination,{recursive:true});
  const files=fs.readdirSync(source).sort(),manifest={sourceVersion:'13.19.0',sourceCommit:'8e4705f1c6d8e63845547cef0444c9ee073087ca',files:{}};
  // CSS order is part of the original renderer. Alphabetical file order puts
  // vn.css last and overrides the reader's mobile typography and camera rules.
  const styles=[...read('vendor/visual-novel/scripts/build-cortex.mjs').matchAll(/rel="stylesheet" href="\/(vn(?:-[a-z-]+)?\.css)\?/gu)].map(match=>match[1]);
  if(JSON.stringify([...styles].sort())!==JSON.stringify(files.filter(name=>name.endsWith('.css'))))throw Error('VN stylesheet order must match every original stylesheet exactly once');
  for(const name of files)manifest.files[name]=crypto.createHash('sha256').update(fs.readFileSync(source+'/'+name)).digest('hex');
  const adapters=['scripts/port-visual-novel.mjs','public/cortex-vn-host.js','public/cortex-vn-layout.css','public/cortex-vn-layout.mjs','public/cortex-vn-cast-wire.mjs','public/cortex-vn-clock.mjs','public/cortex-vn-shared.mjs','public/cortex-vn-multiplayer.mjs','vendor/visual-novel/nexus-entry.mjs','vendor/visual-novel/nexus-multiplayer-entry.mjs','vendor/visual-novel/scripts/build-cortex.mjs'];
  adapters.push('vendor/visual-novel/nexus-key-vault.mjs');
  adapters.push('public/cortex-vn-presentation.mjs','vendor/visual-novel/nexus-work-identities.json');
  adapters.push('public/cortex-vn-timeline.mjs','public/cortex-vn-page-cache.mjs');
  adapters.push('public/cortex-luna-model.mjs');
  const cameraOverrides=['sprite','motion-landmarks','motion-worker','raster-worker'];
  adapters.push('public/cortex-vn-camera.mjs','public/cortex-vn-registration.mjs',...cameraOverrides.map(name=>'vendor/visual-novel/nexus-'+name+'.mjs'));
  adapters.push('public/cortex-vn-writer-speakers.mjs');
  adapters.push('vendor/visual-novel/nexus-performance-adapter.mjs',...['performance','cue-player','foley','foley-score'].map(name=>'public/cortex-vn-'+name+'.mjs'));
  const hash=crypto.createHash('sha256').update(JSON.stringify(manifest));for(const path of adapters)hash.update(read(path));const version=hash.digest('hex').slice(0,12);
  const cameraHash=crypto.createHash('sha256').update(read('public/cortex-vn-camera.mjs')).update(read('public/cortex-vn-registration.mjs'));for(const part of cameraOverrides)cameraHash.update(read('vendor/visual-novel/nexus-'+part+'.mjs'));
  const cameraVersion='stage-camera-main-body-'+cameraHash.digest('hex').slice(0,12);
  for(const name of files){
    let code=cameraOverrides.some(part=>name==='vn-'+part+'.mjs') ? read('vendor/visual-novel/nexus-'+name.slice(3)) : read(source+'/'+name);
    code=code.replaceAll('../cortex-vn-camera.mjs', '../cortex-vn-camera.mjs?v='+version);
    code=code.replaceAll('../cortex-vn-registration.mjs', '../cortex-vn-registration.mjs?v='+version);
    if(name==='vn-key-vault.mjs')code=read('vendor/visual-novel/nexus-key-vault.mjs');
    // All providers run under the main site's own authenticated routes.
    if(/\.(?:m?js)$/.test(name))code=code.replaceAll('/api/openai','/api/vn/openai').replaceAll('/api/go','/api/vn/go').replaceAll('/api/gemini','/api/vn/gemini').replaceAll('/api/typecast','/api/vn/typecast').replaceAll('/api/voice','/api/vn/voice').replaceAll('/api/image','/api/vn/image').replaceAll('/work-presentation.json','/vn-runtime/work-presentation.json');
    if(name==='vn.js'){
      code=replace(code,"model: state.provider === 'muse' ? providerModels.muse : 'gpt-5.6-luna'", "model: state.provider === 'muse' ? providerModels.muse : 'gpt-6-luna'");
      code=replace(code,'인물 배치 확인에는 GPT 5.6 Luna','인물 배치 확인에는 GPT 6 Luna');
      code=replace(code,'import { loadDeviceKeys, storeDeviceKeys }', 'import { loadDeviceKeys, storeDeviceKeys, changedDeviceKeys }');
      code=replace(code,'function openSettings() {', 'let settingsKeySnapshot = {};\nfunction openSettings() {\n  settingsKeySnapshot = {...state.keys};');
      code=replace(code,'await storeDeviceKeys({ openai, go, gemini, typecast });', 'await storeDeviceKeys(changedDeviceKeys({ openai, go, gemini, typecast }, settingsKeySnapshot));');
      code=replace(code,"state.keys[ttsProvider(provider).keyName] || ''", "embeddedMediaKey(ttsProvider(provider).keyName)");
      code=replace(code,"state.keys[imageProviderFor(state.imageRouting, purpose)] || ''", "embeddedMediaKey(imageProviderFor(state.imageRouting, purpose))");
      code=replace(code,"visualStatus.addEventListener('click', () => {", "visualStatus.addEventListener('click', () => {\n  if (visualStatus.dataset.action === 'info') { healthDialog.show(); return; }");
      code=`import { updateStoryClock } from '../cortex-vn-clock.mjs?v=${version}';\n`+code;
      code=replace(code,'    <span class="vn-top-title" id="vn-top-title">', '    <div id="vn-story-clock" class="vn-story-clock" role="timer" aria-live="off" aria-label="작중 시간"><span>작중 시간</span><strong>시간 미정</strong></div>\n    <span class="vn-top-title" id="vn-top-title">');
      code=replace(code,'  let page = state.pages[state.cursor];','  let page = state.pages[state.cursor];\n  updateStoryClock($(\'vn-story-clock\'), {page, turns:state.api._turns(), scenario:state.api._scenario(), openingWorld:state.openingScene?.world});');
      code=replace(code,"const nexusBase = 'https://relay-novel-nexus.juno12345.chatgpt.site';","const nexusBase = location.origin;\nconst host = window.NexusVNHostBridge;");
      code=replace(code,'document.body.prepend(root);','root.hidden = true; document.body.prepend(root);');
      code=replace(code,'globalThis.NexusVNHandlesTextReveal = true;','globalThis.NexusVNHandlesTextReveal = false;');
      code=replace(code,"function textKey() { return state.provider === 'openai' ? state.keys.openai : state.keys.go; }","function textKey() { return host.settings?.apiKey || ''; }");
      code=replace(code,"function hasImageKey() { return Boolean(imageKey('background') || imageKey('portrait')); }","function hasImageKey() { return host.multiplayer || Boolean(imageKey('background') || imageKey('portrait')); }");
      const applyStart=code.indexOf('function applyProvider() {'),applyEnd=code.indexOf('\nconst busy =',applyStart);
      code=code.slice(0,applyStart)+`function applyProvider() {
  const connection=host.settings||{};
  state.provider=connection.provider==='opencode-go'?'muse':connection.provider==='opencode-go-luna'?'go-luna':'openai';
  state.effort=connection.museReasoningEffort||'low';
  if(host.active)state.api?._setSettings({imageEvery:0});
}
`+code.slice(applyEnd);
      code=replace(code,"function sync(force = false) {","function sync(force = false) {\n  if (!host.active || !host.isReady()) return;\n  if(force)collectPublishedPages.invalidate?.();");
      code=replace(code,'async function submit(value, auto = false, { automated = false } = {}) {', "async function submit(value, auto = false, { automated = false } = {}) {\n  if(host.multiplayer){const input=String(value||'').trim();if(!auto&&!input)return; if(host.requestTurn?.(input,auto)){state.actions=false;state.submittedTurnId=state.pages.at(-1)?.turnId||'opening';state.awaitingTurn=true;state.generationStarted=Date.now();$('vn-input').value='';renderPage();}return;}");
      code=replace(code,'if(host.multiplayer){const input=', 'if(host.multiplayer){if(!multiplayerState.canWrite||!state.actions)return;const input=');
      code=replace(code,'function renderActions() {', `function renderActions() {
  if(host.multiplayer&&!multiplayerState.canWrite){$('vn-actions').hidden=true;$('vn-suggestions').replaceChildren();$('vn-compose').hidden=true;return;}`);
      code=replace(code,"$('vn-stage').classList.toggle('has-actions', state.actions);", "$('vn-stage').classList.toggle('has-actions', state.actions && (!host.multiplayer || multiplayerState.canWrite));");
      code=replace(code,'function schedulePlayback() {', 'function schedulePlayback() {\n  if(host.multiplayer){scheduleMultiplayerPlayback();return;}');
      code=replace(code,"if (state.playback === 'full') schedulePlayback();", "if (host.multiplayer || state.playback === 'full') schedulePlayback();");
      code=replace(code,'function nextPage(fromPlayback = false) {', 'function nextPage(fromPlayback = false) {\n  if(host.multiplayer){if(!fromPlayback)multiplayerTouch();return;}');
      code=replace(code,"  reveal.update({ key, text: state.dialogueWaiting ? '' : full, speed: state.api._settings()?.typingSpeed,", "  if(host.multiplayer)renderMultiplayerText({key,text:full});\n  else reveal.update({ key, text: state.dialogueWaiting ? '' : full, speed: state.api._settings()?.typingSpeed,");
      code=replace(code,"  $('vn-dialogue-wait').hidden = !state.dialogueWaiting;", "  if(host.multiplayer&&roomPageStarted(page))state.dialogueWaiting=false;\n  $('vn-dialogue-wait').hidden = !state.dialogueWaiting;");
      for(const signature of ['function prevPage() {','function togglePlayback(mode) {','function toggleFullPlayback() {'])code=replace(code,signature,signature+'\n  if(host.multiplayer)return;');
      code=replace(code,"button.append(title, copy); button.addEventListener('click', () => { voice.stop();", "button.append(title, copy); if(host.multiplayer){button.disabled=true;button.title='읽은 기록';} button.addEventListener('click', () => { if(host.multiplayer)return; voice.stop();");
      code=replace(code,"enabled: Boolean(imageKey('portrait')), decoded,", "enabled: host.multiplayer || Boolean(imageKey('portrait')), decoded,");
      code=replace(code,"const shortcut = event.key.toLowerCase();", "const shortcut = String(event.key || '').toLowerCase();");
      code=replace(code,"if (cinema.blocked && !event.target.closest('button,input,select,textarea,a,dialog'))", "if (!host.multiplayer && cinema.blocked && !event.target.closest('button,input,select,textarea,a,dialog'))");
      code=replace(code,'    state.pages = next;', `    state.pages = next;
    if(host.multiplayer&&next.length&&(state.cursor<next.length-1||next.at(-1)?.isGrowing))state.actions=false;`);
      code=replace(code,'function slotSaveProblem() {',"function slotSaveProblem() {\n  if(host.multiplayer)return '공유 이야기는 방에 자동 저장됩니다.';");
      code=code.replaceAll('button.disabled = busy() || state.awaitingTurn || Boolean(storageProblem(state.api));','button.disabled = (host.multiplayer && !multiplayerState.canWrite) || busy() || state.awaitingTurn || Boolean(storageProblem(state.api));');
      code=replace(code,"$('vn-continue').disabled = busy() || state.awaitingTurn || Boolean(storageProblem(state.api));","$('vn-continue').disabled = (host.multiplayer && !multiplayerState.canWrite) || busy() || state.awaitingTurn || Boolean(storageProblem(state.api));");
      code=replace(code,'function syncRecovery() {',"function syncRecovery() {\n  if(host.multiplayer)return null;");
      code=replace(code,'async function retryPendingAdjudication() {',"async function retryPendingAdjudication() {\n  if(host.multiplayer)return;");
      code=replace(code,'function collectPages() {',"function schedulePersonalCloud(...args){if(!host.multiplayer)cloudDialog.schedule(...args); }\nfunction collectPages() {");
      code=replace(code,'function renderPage() {','function renderPage() {\n  if (!host.active || !host.isReady()) return;\n  if(host.multiplayer&&!alignMultiplayerPlayback())return;');
      code=replace(code,"  void ambience.resume(); void score.resume(); workMusic.resume();","  if (!host.active) return;\n  void ambience.resume(); void score.resume(); workMusic.resume();");
      code=replace(code,"  if (captureLatest(scenario, turns, true)) await state.api.persist();","  captureLatest(scenario, turns, true);");
      // Historical billing writes are not a prerequisite for displaying a save.
      code=replace(code,'  await meter.importHistory(turns);',"  queueHistoryImport(turns);");
      // Hot-switching is read-only: retain derived scenes in memory until the
      // next canonical save, rather than creating a conflicting cloud revision.
      code=replace(code,'async function loadSavedRecord(record, resolve = async () => record) {','async function loadSavedRecord(record, resolve = async () => record) {\n  return host.write(async () => loadEmbeddedRecord(record, resolve));\n}\nasync function loadEmbeddedRecord(record, resolve = async () => record) {');
      code=replace(code,'    record = await resolve();','    record = await resolve();\n    if (record.slug !== state.activeSlug || record.storyId !== state.api._scenario()?.runtime?.storyId) throw Error("이 세션과 같은 작품의 저장 슬롯을 선택해 주세요.");');
      code=replace(code,'      await activateSlot({ record, store: slotStore, api: state.api, apply: applySlotPresentation, remember: rememberSlot });\n      assets.clearMemory();','      await activateSlot({ record, store: slotStore, api: state.api, apply: applySlotPresentation, remember: rememberSlot });\n      embeddedStory = state.api._scenario();\n      assets.clearMemory();');
      code=replace(code,"$('vn-home').addEventListener('click', () => { saveReadingPosition(); cloudDialog.schedule(1000); showScreen('library'); renderCatalog(); });","$('vn-home').addEventListener('click', () => { saveReadingPosition(); host.emit('HOME'); });");
      code=code.replaceAll('cloudDialog.schedule(', 'schedulePersonalCloud(').replace('if(!host.multiplayer)schedulePersonalCloud(...args);','if(!host.multiplayer)cloudDialog.schedule(...args);');
      code=replace(code,"const meter = installCostMeter({ notify: toast,","const meter = installCostMeter({ enabled: () => host.active, notify: toast,");
      code=replace(code,"  const provider = $('vn-settings-dialog').querySelector('input[name=\"vn-provider\"]:checked')?.value || 'openai';","  const provider = state.provider;");
      code=replace(code,"state.api._setSettings({ styleGuide: $('vn-style-guide').value.trim(), typingSpeed: $('vn-typing-speed').value, imageQuality: $('vn-image-quality').value });","state.api._setSettings({ styleGuide: $('vn-style-guide').value.trim() });");
      code=replace(code,"  const scenario = state.api._scenario(), turns = state.api._turns();\n  // Old sprite", "  const scenario = state.api._scenario(), turns = state.api._turns();\n  // Old sprite");
      const boot=code.indexOf('async function boot() {');if(boot<0)throw Error('VN boot missing');code=code.slice(0,boot)+read('vendor/visual-novel/nexus-multiplayer-entry.mjs').replaceAll('../cortex-vn-shared.mjs', '../cortex-vn-shared.mjs?v='+version).replaceAll('../cortex-vn-multiplayer.mjs','../cortex-vn-multiplayer.mjs?v='+version).replaceAll('../cortex-vn-timeline.mjs','../cortex-vn-timeline.mjs?v='+version)+'\n'+read('vendor/visual-novel/nexus-entry.mjs');
    }
    if(name==='vn-core.mjs'){
      const at=code.indexOf('export function createPageCollector() {');if(at<0)throw Error('VN page collector missing');
      code=`import {createCachedPages} from '../cortex-vn-page-cache.mjs?v=${version}';\n`+code.slice(0,at)+'export function createPageCollector() { return createCachedPages(readableTurnPages); }\n';
    }
    if(name==='vn-scene.mjs')code=replace(code,"  const world = { location: String(scenario?.world?.location || ''),", "  const world = { ...(Number.isFinite(scenario?.world?.day) ? {day:scenario.world.day} : {}), location: String(scenario?.world?.location || ''),");
    if(name==='vn-costs.mjs'){
      code=replace(code,"    const request = row ? tx.objectStore('calls').put(row) : tx.objectStore('calls').getAll();",`    const store = tx.objectStore('calls');
    const request = Array.isArray(row) ? (row.forEach(value => store.put(value)), null) : row ? store.put(row) : store.getAll();`);
      code=replace(code,'  let storageFailed = false;','  let storageFailed = false, historyTask = Promise.resolve();');
      code=replace(code,'      const admission = await budget.admit(row,', '      await historyTask;\n      const admission = await budget.admit(row,');
      code=replace(code,'    async importHistory(turns) {\n      const current = context();',`    importHistory(turns, current = context()) {
      // Rendering proceeds now, but paid admission still awaits accounting.
      const task = async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      const existing = new Set((await records()).map(row => row.id)), batch = [];
`);
      code=replace(code,'        await save(row);\n      }\n    },',`        if (!existing.has(row.id)) { existing.add(row.id); batch.push(row); }
      }
      if (batch.length) { await records(batch); for (const row of batch) memory.set(row.id, row); onChange?.(); }
      };
      historyTask = historyTask.catch(()=>{}).then(task);
      return historyTask;
    },`);
      code=replace(code,'export function installCostMeter({ context, onChange, notify = () => {} })','export function installCostMeter({ context, onChange, notify = () => {}, enabled = () => true })');
      code=replace(code,'  globalThis.fetch = async (input, init) => {','  globalThis.fetch = async (input, init) => {\n    if (!enabled()) return nativeFetch(input, init);');
      code=replace(code,"    // Typecast may also", "    if (url.pathname === '/api/text/responses') url.pathname = globalThis.NexusCortexTextProvider === 'openai' ? '/api/vn/openai/responses' : '/api/vn/go/responses';\n    if (url.origin === 'https://api.openai.com' && url.pathname === '/v1/responses') url = new URL('/api/vn/openai/responses', location.origin);\n    // Typecast may also");
      code=replace(code,'async function observe(response, row) {','async function observe(response, row, received = () => {}) {');
      code=replace(code,'    // Store accounting only.', '    received(); // API elapsed time excludes the subsequent local accounting write.\n    // Store accounting only.');
      code=replace(code,'void observe(receipt, row).finally(end);','void observe(receipt, row, end).finally(end);');
    }
    if(name==='vn-public-cast.mjs'){
      // The compatibility map ships with this exact release. Avoid another
      // network round trip before package media and the opening scene can load.
      const start=code.indexOf('let compatibility = {}, pending;'),end=code.indexOf('\nconst list =',start);
      if(start<0||end<0)throw Error('Public alias initialization missing');
      code=code.slice(0,start)+`const compatibility = ${read(source+'/work-presentation.json')};\nexport async function loadWorkPresentation() {}\n`+code.slice(end);
      code=`import { resolveWorkPresentation, publishedEventTurns } from '../cortex-vn-presentation.mjs?v=${version}';\nconst workIdentities = ${read('vendor/visual-novel/nexus-work-identities.json')};\n`+code;
      code=replace(code,"  const legacy = compatibility[String(scope).split(':')[0]] || {};", "  turns = publishedEventTurns(turns);\n  const legacy = resolveWorkPresentation(scenario, scope, compatibility, workIdentities);");
    }
    if(name==='vn-camera-store.mjs')code=replace(code,"'stage-camera-13.19.0'",JSON.stringify(cameraVersion));
    if(name==='vn.js'){
      code=replace(code,'.then(source => displaySprite(source))','.then(source => displaySprite(source, source, person.base || ""))');
      code=replace(code,"const motionSources = [url, person.motion?.blink || '', person.motion?.talk || ''];","const motionSources = [url, person.motion?.blink || '', person.motion?.talk || '', person.base || ''];");
    }
    if(name==='vn-motion.mjs'){
      code=replace(code,"prepareMotionFrames(source, blink = '', talk = '')","prepareMotionFrames(source, blink = '', talk = '', reference = '')");
      code=replace(code,'JSON.stringify([source, blink, talk])','JSON.stringify([source, blink, talk, reference])');
      code=replace(code,'const base = await displaySprite(source),','const base = await displaySprite(source, source, reference),');
      code=replace(code,'const geometry = await detectMotionGeometry(source);',"if (reference && reference !== source && base === await displaySprite(reference)) return frames;\n      const geometry = await detectMotionGeometry(source);");
      code=replace(code,"displaySprite(variant.canvas.toDataURL('image/png'), source)","displaySprite(variant.canvas.toDataURL('image/png'), source, reference)");
      code=replace(code,"displaySprite(original.canvas.toDataURL('image/png'), source)","displaySprite(original.canvas.toDataURL('image/png'), source, reference)");
    }
    if(name==='vn-character-art.mjs')code=replace(code,"MANDATORY SHARED STAGE FRAMING:","MANDATORY SHARED STAGE FRAMING: Use coherent head, neck, shoulders, ribcage, waist and pelvis anatomy at one camera distance. Include the complete torso, both hip joints and upper thighs. Preserve the individual build and natural shoulder-to-pelvis proportions. Never lengthen the torso to fill the canvas or compensate for missing legs by enlarging a bust. For later expressions and costumes preserve the base head-to-body ratio, shoulder height and hip height. ");
    if(name==='vn-diagnostics.mjs')code=replace(code,"cast: '인물 판정 API'","cast: '인물·연출 판정 API'");
    if(name==='vn-assets.mjs'){
      // Capture origin explicitly at every call; concurrent scene lookahead must
      // never read a mutable "current turn" after an await.
      code=code.replaceAll('ensure(', 'ensure(scene, ');
      code=replace(code,'  async function ensure(scene, key, purpose, request, metadata = {}, processImage = async url => url) {', `  async function ensure(scene, key, purpose, request, metadata = {}, processImage = async url => url) {
    const shared=globalThis.NexusVNSharedAssets;
    if(!shared)return ensureLocal(key,purpose,request,metadata,processImage);
    if(shared.isShared('image',key)&&cache.has(key)&&!cache.get(key)?.rejected)return cache.get(key);
    const record=await shared.record('image',key,()=>ensureLocal(key,purpose,request,metadata,processImage),{canProduce:Boolean(getKey(purpose)),turn:scene?.mediaTurn});
    if(record){cache.set(key,record);known.add(key);reuse.add(key);warmSprite(key,record);onChange();void write(record).catch(()=>{});}return record;
  }
  async function ensureLocal(key, purpose, request, metadata = {}, processImage = async url => url) {`);
      code=replace(code,'        try {\n          response = await fetchImage(', '        try {\n          if (globalThis.NexusVNHostBridge && !globalThis.NexusVNHostBridge.active) return null;\n          globalThis.NexusVNSharedAssets?.started("image",key);\n          response = await fetchImage(');
      code=replace(code,'          result = await response.json();','          globalThis.NexusVNSharedAssets?.response("image",key,response);\n          result = await response.json();');
      code=replace(code,"generate && Boolean(getKey('background') || getKey('portrait'))", "generate && Boolean(globalThis.NexusVNSharedAssets || getKey('background') || getKey('portrait'))");
    }
    if(name==='vn-voice.mjs')code=replace(code,'  async function prepare(line, active, { cachedOnly = false } = {}) {',`  async function prepare(line, active, options = {}) {
    const shared=globalThis.NexusVNSharedAssets;
    if(!shared||options.cachedOnly)return prepareLocal(line,active,options);
    // A listener's provider/voice preference cannot fork a paid room recording.
    let sharedText=line.text;try{sharedText=JSON.parse(line.key)[4]||sharedText;}catch{}
    const sharedKey=JSON.stringify(['vn-room-voice-1',line.playbackKey,line.speakerId,sharedText]);
    if(shared.isShared('voice',sharedKey)&&cache.has(line.key))return remember(cache.get(line.key));
    const record=await shared.record('voice',sharedKey,async()=>{const value=await prepareLocal({...line,sharedKey},active,options);return value?{...value,key:sharedKey,voice:line.voice,voiceName:typecastVoices().find(row=>row.id===line.voice)?.name||''}:null;},{canProduce:Boolean(getKey(line.provider)),turn:line.mediaTurn});
    if(record){const local={...record,key:line.key};void write(local).catch(()=>{});return remember(local);}return null;
  }
  async function prepareLocal(line, active, { cachedOnly = false } = {}) {`);
    if(name==='vn-voice.mjs')code=replace(code,'        const response = await fetchVoice(', '        globalThis.NexusVNSharedAssets?.started("voice",line.sharedKey||line.key);\n        const response = await fetchVoice(');
    if(name==='vn-voice.mjs')code=replace(code,'        const result = await response.json().catch(() => null);','        globalThis.NexusVNSharedAssets?.response("voice",line.sharedKey||line.key,response);\n        const result = await response.json().catch(() => null);');
    if(name==='vn-voice.mjs')code=code.replaceAll('playbackKey: JSON.stringify([scope, page.turnId, page.start]),', 'playbackKey: JSON.stringify([scope, page.turnId, page.start]), mediaTurn: Number.isInteger(page.turnIndex) ? page.turnIndex + 1 : undefined,');
    if(name==='vn-voice.mjs')code=replace(code,"playing = line; set('playing');", "playing = { ...line, provider: record.provider || line.provider, voice: record.voice || line.voice, voiceName: record.voiceName || '' }; set('playing');");
    if(name==='vn-voice-credits.mjs')code=replace(code,"catalog.find(row => row.id === line.voice)?.name?.trim()", "line.voiceName?.trim() || catalog.find(row => row.id === line.voice)?.name?.trim()");
    if(name==='vn-scene.mjs'){
      code=`import { writerBindings } from '../cortex-vn-writer-speakers.mjs?v=${version}';\n`+code;
      code=replace(code,'return { version: sceneVersion, scope, world,', "return { version: sceneVersion, scope, writerText: String(turn.text || ''), writerBindings: writerBindings(turn, scenario, experience), mediaTurn: turn.id === 'opening' ? 0 : priorTurns.length + 1, world,");
    }
    if(name==='vn-cast.mjs'){
      code=`import { applyWriterSpeaker } from '../cortex-vn-writer-speakers.mjs?v=${version}';\n`+code;
      code=replace(code,"    return { ...scene, candidates, characters: beat?.characters || [], speakerId: beat?.speakerId || '', speakerName: beat?.speakerName || '', identityIssue: beat?.identityIssue || null, speakerOffScene: beat?.speakerOffScene === true, direction: beat?.direction || null, castStatus };", "    return applyWriterSpeaker(scene, page || pagesFor(scene)[0], { ...scene, candidates, characters: beat?.characters || [], speakerId: beat?.speakerId || '', speakerName: beat?.speakerName || '', identityIssue: beat?.identityIssue || null, speakerOffScene: beat?.speakerOffScene === true, direction: beat?.direction || null, castStatus });");
      code=replace(code,"!getConnection().key ? 'needs-key'", "!getConnection().key && !globalThis.NexusVNSharedAssets ? 'needs-key'");
      code=replace(code,'          const response = await fetchDecision(', '          globalThis.NexusVNSharedAssets?.started("cast",key);\n          const response = await fetchDecision(');
      code=replace(code,'          const result = await response.json();','          globalThis.NexusVNSharedAssets?.response("cast",key,response);\n          const result = await response.json();');
      code=replace(code,'    prepare: async function prepare(scene, { generate = true, page } = {}) {',`    prepare: async function prepare(scene, { generate = true, page, local = false, writerBackground = false } = {}) {
      const authored=scene&&view(scene,page);
      if(!writerBackground&&authored?.writerSpeakerReady){
        // Optional direction continues independently. A known speaker's portrait
        // does not wait for a second model to rediscover the author's identity.
        void prepare(scene,{generate,page,local,writerBackground:true}).catch(()=>{});
        return authored;
      }
      const shared=globalThis.NexusVNSharedAssets;
      if(shared&&!local&&scene&&!scene.castPending&&generate){
        const key=castKey(scene);if(shared.isShared('cast',key)&&decisions.has(key))return view(scene,page);
        const record=await shared.record('cast',key,async()=>{await prepare(scene,{generate,page,local:true,writerBackground:true});const decision=decisions.get(key);return decision?{key,policy:DIRECTION_POLICY,decision,savedAt:Date.now()}:null;},{canProduce:Boolean(getConnection().key),turn:scene.mediaTurn});
        if(record&&POLICIES.has(record.policy)){validatedTimeline(scene,key,record.decision);decisions.set(key,record.decision);onChange();void write(record).catch(()=>{});}return view(scene,page);
      }
`);
      code=replace(code,'return prepare(scene, { generate, page });','return prepare(scene, { generate, page, local, writerBackground });');
      code=`import { compactCastRequest, expandCastDecision } from '../cortex-vn-cast-wire.mjs?v=${version}';\n`+code;
      code=replace(code,"  if (model === 'muse-spark-1.3-contributor') delete request.text;\n  return request;","  const compact = compactCastRequest(request);\n  if (model === 'muse-spark-1.3-contributor') delete compact.text;\n  return compact;");
      code=replace(code,'const decision = JSON.parse(json);','const decision = expandCastDecision(JSON.parse(json));');
      // Validated characters are ready immediately; an IndexedDB write must
      // not hold the image preparation queue after the paid inference finishes.
      code=replace(code,"          try { await write({ key, policy: DIRECTION_POLICY, decision, savedAt: Date.now() }); } catch { onError('인물 배치를 기기에 저장하지 못했습니다.'); }","          void Promise.resolve().then(() => write({ key, policy: DIRECTION_POLICY, decision, savedAt: Date.now() })).catch(() => onError('인물 배치를 기기에 저장하지 못했습니다.'));");
    }
    code=adaptPerformance(name,code,version);
    if(/\.(?:m?js)$/.test(name))code=code.replace(/from '(\.\/vn-[^']+\.mjs)'/gu,`from '$1?v=${version}'`).replace(/new URL\('(\.\/vn-[^']+\.mjs)'/gu,`new URL('$1?v=${version}'`);
    fs.writeFileSync(destination+'/'+name,code);
  }
  fs.writeFileSync('vendor/visual-novel/manifest.json',JSON.stringify(manifest,null,2)+'\n');
  // One cached entry replaces the cold-start module dependency waterfall.
  // Worker URLs stay beside the bundle and retain their independent lifetimes.
  await build({input:destination+'/vn.js',output:{file:destination+'/reader.mjs',format:'esm',minify:true,codeSplitting:false},
    plugins:[{name:'vn-versioned-imports',resolveId(id,importer){
      if(importer&&id.startsWith('.')&&id.includes('?v='))return path.resolve(path.dirname(importer),id.split('?')[0]);
    }}]});
  fs.writeFileSync(destination+'/manifest.json',JSON.stringify({sourceVersion:manifest.sourceVersion,version,entry:'reader.mjs',styles}));
  return version;
}
