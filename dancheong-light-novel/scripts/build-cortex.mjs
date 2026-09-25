import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../vendor/Cortex_v1.42.0.html', import.meta.url);
const output = new URL('../public/cortex.html', import.meta.url);
const expectedSha256 = '1e5fbc6ac09532852a3492b2821efd99d7b16961bff23cc52693d05bdfc77a43';
const bytes = await readFile(source);
const actualSha256 = createHash('sha256').update(bytes).digest('hex');
if (actualSha256 !== expectedSha256) throw new Error('Cortex source changed; review the new runtime before building.');

const original = bytes.toString('utf8');
const bootHead = await readFile(new URL('../public/vn-boot.html', import.meta.url), 'utf8');
if (!original.includes('</head>') || !original.includes('</body>')) throw new Error('Unexpected Cortex HTML structure.');
const modules = ['vn-core.mjs', 'vn-key-vault.mjs', 'vn-scene.mjs', 'vn-cast.mjs', 'vn-stage-timing.mjs', 'vn-reader.mjs', 'vn-direction.mjs', 'vn-chroma.mjs', 'vn-assets.mjs', 'vn-cost-core.mjs', 'vn-costs.mjs', 'vn.js'];
const shellHash = createHash('sha256').update(await readFile(new URL('../public/vn.css', import.meta.url)));
shellHash.update(bootHead);
shellHash.update(await readFile(new URL('../public/vn-reader.css', import.meta.url)));
for (const name of modules) shellHash.update(await readFile(new URL(`../public/${name}`, import.meta.url)));
const shellVersion = shellHash.digest('hex').slice(0, 12);
function replaceExactly(sourceText, before, after) {
  if (sourceText.split(before).length !== 2) throw new Error(`Cortex adapter target changed: ${before.slice(0, 70)}`);
  return sourceText.replace(before, after);
}
let shell = original;
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
  .replace('</head>', `<meta name="description" content="너름의 단청 작품을 비주얼노벨 화면에서 이어가는 라이트노벨 시뮬레이터"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link id="vn-style-main" rel="stylesheet" href="/vn.css?v=${shellVersion}"><link id="vn-style-reader" rel="stylesheet" href="/vn-reader.css?v=${shellVersion}"></head>`)
  .replace('</body>', `<script id="vn-entry" type="module" src="/vn-runtime/vn.js?v=${shellVersion}"></script></body>`);
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
// Version every module dependency, including imports further down the graph.
await mkdir(new URL('../public/vn-runtime/', import.meta.url), { recursive: true });
for (const name of modules) {
  const code = (await readFile(new URL(`../public/${name}`, import.meta.url), 'utf8')).replace(/from '(\.\/vn-[^']+\.mjs)'/gu, `from '$1?v=${shellVersion}'`);
  await writeFile(new URL(`../public/vn-runtime/${name}`, import.meta.url), code);
}
await writeFile(output, adapted);
console.log(`Built visual novel shell from Cortex ${actualSha256.slice(0, 12)}.`);
