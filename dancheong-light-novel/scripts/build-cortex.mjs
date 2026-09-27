import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../vendor/Cortex_v1.42.0.html', import.meta.url);
const output = new URL('../public/cortex.html', import.meta.url);
const expectedSha256 = 'e0b43be5f6eee30cf6908cea694545457c0cee48adbe43ac49348c5fd743b394';
const bytes = await readFile(source);
const actualSha256 = createHash('sha256').update(bytes).digest('hex');
if (actualSha256 !== expectedSha256) throw new Error('Cortex source changed; review the new runtime before building.');

const original = bytes.toString('utf8');
const bootHead = await readFile(new URL('../public/vn-boot.html', import.meta.url), 'utf8');
if (!original.includes('</head>') || !original.includes('</body>')) throw new Error('Unexpected Cortex HTML structure.');
const modules = ['vn-core.mjs', 'vn-key-vault.mjs', 'vn-image-routing.mjs', 'vn-progress.mjs', 'vn-public-cast.mjs', 'vn-scene.mjs', 'vn-wardrobe.mjs', 'vn-cast.mjs', 'vn-stage-timing.mjs', 'vn-reader.mjs', 'vn-direction.mjs', 'vn-stage.mjs', 'vn-sprite.mjs', 'vn-audio.mjs', 'vn-chroma.mjs', 'vn-character-art.mjs', 'vn-assets.mjs', 'vn-cost-core.mjs', 'vn-costs.mjs', 'vn.js'];
const shellHash = createHash('sha256').update(await readFile(new URL('../public/vn.css', import.meta.url)));
modules.push('vn-loudness.mjs', 'vn-loop.mjs', 'vn-speech-ko.mjs', 'vn-voice-post.mjs', 'vn-music-ai.mjs', 'vn-music.mjs', 'vn-music-direction.mjs', 'vn-voice.mjs', 'vn-shots.mjs', 'vn-motion.mjs', 'vn-saves.mjs', 'vn-save-ui.mjs', 'vn-cinema.mjs', 'vn-work-music.mjs');
modules.push('vn-raster.mjs', 'vn-raster-worker.mjs');
modules.push('vn-event-progress.mjs', 'vn-event-progress-ui.mjs');
modules.push('vn-new-game.mjs');
modules.push('vn-edition-key.mjs', 'vn-editions.mjs', 'vn-edition-ui.mjs');
modules.push('vn-audio-analysis.mjs', 'vn-audio-task.mjs', 'vn-audio-worker.mjs');
modules.push('vn-storage.mjs', 'vn-storage-ui.mjs', 'vn-backup.mjs');
modules.push('vn-identity.mjs');
modules.push('vn-autoplay.mjs');
modules.push('vn-recovery.mjs');
modules.push('vn-image-codec.mjs');
modules.push('vn-image-storage.mjs');
modules.push('vn-actor-life.mjs', 'vn-typeset.mjs', 'vn-gallery.mjs', 'vn-face-compose.mjs');
modules.push('vn-storyboard.mjs');
modules.push('vn-motion-geometry.mjs', 'vn-motion-landmarks.mjs', 'vn-motion-worker.mjs', 'vn-motion-playback.mjs');
modules.push('vn-typecast-direct.mjs', 'vn-typecast-connection.mjs');
modules.push('vn-voice-credits.mjs');
const storageRecovery = await readFile(new URL('./cortex-storage-recovery.js', import.meta.url), 'utf8');
shellHash.update(storageRecovery);
shellHash.update(bootHead);
shellHash.update(await readFile(new URL('../public/vn-cinema.css', import.meta.url)));
shellHash.update(await readFile(new URL('../public/vn-reader.css', import.meta.url)));
shellHash.update(await readFile(new URL('../public/vn-saves.css', import.meta.url)));
shellHash.update(await readFile(new URL('../public/vn-storage.css', import.meta.url)));
shellHash.update(await readFile(new URL('../public/vn-event-progress.css', import.meta.url)));
for (const name of modules) shellHash.update(await readFile(new URL(`../public/${name}`, import.meta.url)));
const shellVersion = shellHash.digest('hex').slice(0, 12);
function replaceExactly(sourceText, before, after) {
  if (sourceText.split(before).length !== 2) throw new Error(`Cortex adapter target changed: ${before.slice(0, 70)}`);
  return sourceText.replace(before, after);
}
let shell = original;
shell = replaceExactly(shell, '  async function forkStorageV1396(){', `${storageRecovery}\n  async function forkStorageV1396(){`);
shell = replaceExactly(shell, '_forkStorage:forkStorageV1396,', '_forkStorage:forkStorageV1396,_retryStorage:retryStorageVN,_isBusy:()=>busy,_recoveryScope:()=>sessionEpoch,');
// Retry the request before applying branch/resource effects, never the whole
// commit function. Every attempt owns its timer and AbortController.
const judgeStart = shell.indexOf('  async function requestUnifiedAdjudicationV1360(');
const judgeEnd = shell.indexOf('\n  function createContinuityJudgeQueueV240(', judgeStart);
if (judgeStart < 0 || judgeEnd < 0) throw new Error('Cortex verdict adapter target missing.');
const judgeOriginal = shell.slice(judgeStart, judgeEnd);
let judge = replaceExactly(judgeOriginal, ',controller=new AbortController();', ';const recoveryEpoch=sessionEpoch;');
judge = replaceExactly(judge, 'try{result=await Promise.race', "const attempt=async()=>{const controller=new AbortController();let timer;rawResponse=null;rawResponseText='';try{return await Promise.race");
judge = replaceExactly(judge, "catch(error){result={available:false,", "catch(error){return {available:false,");
judge = replaceExactly(judge, 'finally{clearTimeout(timer)}', 'finally{clearTimeout(timer)}};result=await (globalThis.NexusVNRetryVerdict||((request)=>request()))(attempt,{current:()=>recoveryEpoch===sessionEpoch&&turns.includes(turn)});');
judge = replaceExactly(judge, "const json=await response.json();if(json.status", "const json=await response.json();if(controller.signal.aborted)throw Error('VERDICT_TIMEOUT');if(json.status");
judge = replaceExactly(judge, "policy:'ONE_EVENT_VERDICT_60S_DISPLAY_COMMIT_ON_FAILURE',attempts:1,totalMs:result.totalMs", "policy:'EVENT_VERDICT_AUTO_RETRY_MAX_3_DISPLAY_COMMIT_ON_FAILURE',attempts:result.autoRecovery?.attempts||1,history:result.autoRecovery?.history||[],totalMs:result.totalMs");
shell = replaceExactly(shell, judgeOriginal, judge);
// Keep the original publication/media gates, but let the VN reader own pacing.
// Otherwise Cortex's typewriter and the VN typewriter would run in series.
shell = replaceExactly(shell, 'const speed=asText(settings.typingSpeed),readableNatural=', 'const speed=globalThis.NexusVNHandlesTextReveal?"instant":asText(settings.typingSpeed),readableNatural=');
shell = replaceExactly(shell, 'function persist(options={}){let payload,sequence=', 'function persist(options={}){try{window.NexusVNBeforePersist?.(scenario,turns)}catch(error){console.warn("VN scene snapshot failed",error?.message)}let payload,sequence=');
// The visual-novel shell owns encrypted device keys. Cortex must never persist
// its legacy plaintext key alongside that vault.
shell = replaceExactly(shell, "try{localStorage.setItem('dancheong-cortex-device-api-key-v1',settings.apiKey||'')}catch{}", "void 0");
shell = replaceExactly(shell, "try{settings.apiKey=localStorage.getItem('dancheong-cortex-device-api-key-v1')||''}catch{}", "settings.apiKey='';");
// Scene image provider and key are independent from the text provider.
shell = replaceExactly(shell,
  "if(globalThis.NexusCortexImageEndpoint && url===globalThis.NexusCortexImageEndpoint && (settings.model==='muse-spark-1.3-contributor'||globalThis.NexusCortexTextProvider==='opencode-go-luna')) {",
  "if(globalThis.NexusCortexImageEndpoint && url===globalThis.NexusCortexImageEndpoint) {");
shell = replaceExactly(shell,
  "if('apiKey' in body)body.apiKey=globalThis.NexusCortexImageApiKey;",
  "delete body.apiKey;if(globalThis.NexusCortexImageModel)body.model=globalThis.NexusCortexImageModel;");
shell = replaceExactly(shell,
  "'한국 TV 애니메이션 본편의 한 순간 같은 시네마틱 16:9 장면.'",
  "'오리지널 고품질 비주얼노벨 게임의 시네마틱 16:9 한 장면. 장면의 현장 인물과 배경을 자연스럽게 배치하고, 왼쪽에는 흰 본문을 읽을 수 있도록 명암 대비와 여백을 둔다.'");
const adapted = shell
  .replace('<html lang="ko"', '<html lang="ko" data-vn-boot="loading"')
  .replace(/^[ \t]*<meta charset="utf-8">[ \t]*\r?\n/mu, '')
  .replace('<head>', `<head><meta charset="utf-8">${bootHead}`)
  .replace('<body>', '<body><section id="vn-boot" aria-label="단청 시작" role="status" aria-live="polite"><span class="vn-boot-mark" aria-hidden="true">丹</span><h1>단청</h1><span class="vn-boot-line" aria-hidden="true"></span><p class="vn-boot-loading">장면을 준비하고 있습니다</p><p class="vn-boot-error">화면을 불러오지 못했습니다.<br>연결을 확인한 뒤 다시 불러와 주세요.</p><a class="vn-boot-retry" href="/cortex">다시 불러오기</a><noscript><p>플레이하려면 브라우저에서 JavaScript를 켜 주세요.</p><a href="/cortex">다시 불러오기</a></noscript></section>')
  .replace('<div class="app">', '<div class="app" aria-hidden="true">')
  .replace(/<title>[^<]*<\/title>/u, '<title>단청 · 라이트노벨 시뮬레이터</title>')
  .replace('</head>', `<meta name="description" content="너름의 단청 작품을 비주얼노벨 화면에서 이어가는 라이트노벨 시뮬레이터"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link id="vn-style-main" rel="stylesheet" href="/vn.css?v=${shellVersion}"><link id="vn-style-reader" rel="stylesheet" href="/vn-reader.css?v=${shellVersion}"><link rel="stylesheet" href="/vn-saves.css?v=${shellVersion}"><link rel="stylesheet" href="/vn-cinema.css?v=${shellVersion}"><link rel="stylesheet" href="/vn-event-progress.css?v=${shellVersion}"></head>`)
  .replace('</head>', `<link rel="stylesheet" href="/vn-storage.css?v=${shellVersion}"></head>`)
  .replace('</body>', `<script id="vn-entry" type="module" src="/vn-runtime/vn.js?v=${shellVersion}"></script></body>`);
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
// Version every module dependency, including imports further down the graph.
await mkdir(new URL('../public/vn-runtime/', import.meta.url), { recursive: true });
for (const name of modules) {
  const code = (await readFile(new URL(`../public/${name}`, import.meta.url), 'utf8')).replace(/from '(\.\/vn-[^']+\.mjs)'/gu, `from '$1?v=${shellVersion}'`).replace(/new URL\('(\.\/vn-[^']+\.mjs)'/gu, `new URL('$1?v=${shellVersion}'`);
  await writeFile(new URL(`../public/vn-runtime/${name}`, import.meta.url), code);
}
await writeFile(output, adapted);
console.log(`Built visual novel shell from Cortex ${actualSha256.slice(0, 12)}.`);
