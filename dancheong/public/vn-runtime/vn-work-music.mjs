import { readAsset, writeAsset } from './vn-assets.mjs?v=620ff060ab90';
import { createPlaybackContext, useMediaPlayback, resumePlayback } from './vn-media-session.mjs?v=620ff060ab90';
import { waitForBoundary } from './vn-loop.mjs?v=620ff060ab90';
import { analyzeMusicData, basicMusicAnalysis } from './vn-audio-analysis.mjs?v=620ff060ab90';
import { analyzeInWorker } from './vn-audio-task.mjs?v=620ff060ab90';
import { requestDurableStorage, withMediaTask } from './vn-storage.mjs?v=620ff060ab90';
import { MUSIC_MODELS, moodPrompt, generateMusic, generatedRecord } from './vn-music-ai.mjs?v=620ff060ab90';
export const musicMoods = { normal: '평상시', warm: '따뜻함', sad: '슬픔', tense: '긴장·대치', battle: '전투', eerie: '불길함·공포', memory: '회상' };
export const musicKey = (work, mood) => JSON.stringify(['vn-work-music-1', work, mood]);
export function licensedTrack(value) {
  if (!value || typeof value.url !== 'string' || !String(value.license || '').trim() || !String(value.credit || '').trim()) return null;
  try {
    const url = new URL(value.url);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return { url: url.href, title: String(value.title || '작품 음원').slice(0, 120), credit: String(value.credit).slice(0, 200), license: String(value.license).slice(0, 300) };
  } catch { return null; }
}
export async function selectedTrack(work, mood, packaged = {}, read = readAsset) {
  if (mood === 'silence') return null;
  const kind = mood === 'dread' ? 'eerie' : Object.hasOwn(musicMoods, mood) ? mood : 'normal';
  for (const name of [...new Set([kind, ...(kind === 'battle' ? ['tense'] : []), 'normal'])]) {
    const local = await read(musicKey(work, name)).catch(() => null);
    if (local?.disabled) continue;
    if (local?.blob instanceof Blob && local.blob.type.startsWith('audio/')) return { ...local, id: `${work}:${name}:${local.savedAt}` };
    const linked = licensedTrack(local) || licensedTrack(packaged?.[name]);
    if (linked) return { ...linked, id: `${work}:${linked.url}` };
  }
  return null;
}
// Files are device-local and work-scoped. Only explicit licensed HTTPS links
// from this work's package/settings are fetched; no third-party music ships.
//
// Playback decodes each track once and plays it through Web Audio: every track
// is levelled to one loudness, loops between bar-aligned points with a short
// crossfade (skipping intro and fade-out), and mood changes land on the next
// bar line. Undecodable sources (e.g. a URL without CORS) fall back to <audio>.
export const MUSIC_TARGET_LUFS = -20;
export const MUSIC_ANALYSIS_VERSION = 1;

export async function analyzeMusic(buffer, { bpmHint = 0 } = {}) {
  // Node test runner has no reader thread; browsers always use the worker.
  if (typeof window === 'undefined') return analyzeMusicData(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)), buffer.sampleRate, bpmHint);
  return await analyzeInWorker(buffer, bpmHint) || basicMusicAnalysis(buffer);
}

// Wall-clock schedule for one loop pass: the next pass starts `crossfade`
// before this one reaches loop.end, at loop.start - crossfade, so the bar
// content of both passes coincides while one fades into the other.
export function loopPlan(loop, offset, when) {
  const crossfade = Math.max(0, Math.min(loop.crossfade ?? 1.5, loop.start, (loop.end - loop.start) / 3));
  const end = Math.max(offset + 0.05, loop.end);
  return { crossfade, nextAt: when + (end - offset) - crossfade, nextOffset: loop.start - crossfade, stopAt: when + (end - offset) };
}

export function createWorkMusic({ enabled, volume, onStatus = () => {}, read = readAsset, write = writeAsset, createContext = createPlaybackContext }) {
  let context, master, current, target = '', request = 0, lastArgs, timer, disposed = false;
  const decoded = new Map(), memo = new Map();
  function ensureContext() {
    try {
      useMediaPlayback();
      if (!context) { context = createContext(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination); }
      void resumePlayback(context).catch(() => {});
    } catch { context = null; }
    return context;
  }
  const level = () => Math.min(1, Math.max(0, volume()));
  function refreshVolume() {
    if (master && context) master.gain.setTargetAtTime(level(), context.currentTime, .12);
    for (const track of [current].filter(Boolean)) if (track.audio && !track.gain) track.audio.volume = level();
  }
  async function decode(row) {
    if (decoded.has(row.id)) return decoded.get(row.id);
    const task = (async () => {
      const bytes = row.blob ? await row.blob.arrayBuffer() : await (await fetch(row.url, { mode: 'cors' })).arrayBuffer();
      const buffer = await ensureContext().decodeAudioData(bytes);
      const analysisKey = row.blob && row.key ? JSON.stringify(['vn-music-analysis-1', row.key, row.savedAt, row.blob.size]) : '';
      const saved = analysisKey ? await read(analysisKey).catch(() => null) : null;
      let analysis = saved?.analysis?.version === MUSIC_ANALYSIS_VERSION ? saved.analysis : row.analysis?.version === MUSIC_ANALYSIS_VERSION ? row.analysis : memo.get(row.url || row.id);
      if (!analysis) {
        analysis = await analyzeMusic(buffer, { bpmHint: Number(row.generated?.bpm) || 0 });
        // Analysis owns a separate record. A stale job can never resurrect or replace a song.
        if (analysisKey && analysis.version === MUSIC_ANALYSIS_VERSION) { try { await write({ key: analysisKey, analysis }); } catch { /* Re-analysed next time. */ } }
        else memo.set(row.url || row.id, analysis);
      }
      return { buffer, analysis };
    })();
    decoded.set(row.id, task);
    task.catch(() => decoded.delete(row.id));
    while (decoded.size > 3) decoded.delete(decoded.keys().next().value);
    return task;
  }
  function segment(track, when, offset, fadeIn) {
    const { buffer, analysis } = track.decoded;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.connect(gain); gain.connect(track.bus);
    const plan = loopPlan(analysis.loop, offset, when);
    gain.gain.setValueAtTime(fadeIn ? 0 : 1, when);
    if (fadeIn) gain.gain.linearRampToValueAtTime(1, when + fadeIn);
    if (plan.crossfade > 0) { gain.gain.setValueAtTime(1, plan.nextAt); gain.gain.linearRampToValueAtTime(0, plan.stopAt); }
    source.start(when, offset);
    source.stop(plan.stopAt + 0.02);
    track.sources.push(source);
    source.onended = () => { track.sources = track.sources.filter(item => item !== source); try { source.disconnect(); gain.disconnect(); } catch { /* detached */ } };
    track.anchors.push({ time: when, offset });
    if (track.anchors.length > 4) track.anchors.shift();
    track.next = { at: plan.nextAt, offset: plan.nextOffset, fadeIn: plan.crossfade };
  }
  function pump() {
    if (!context || !current?.decoded || current.stopping) return;
    while (current.next && current.next.at - context.currentTime < 4) segment(current, Math.max(context.currentTime, current.next.at), current.next.offset, current.next.fadeIn);
  }
  // Track time now, from the most recent pass that has started.
  function position(track) {
    const now = context.currentTime, anchor = [...track.anchors].reverse().find(row => row.time <= now) || track.anchors[0];
    return anchor ? anchor.offset + (now - anchor.time) : 0;
  }
  function retire(track, at, fade = 1.5) {
    if (!track) return;
    track.stopping = true;
    if (track.audio) { track.audio.pause(); track.audio.removeAttribute('src'); track.audio.load(); if (track.objectUrl) URL.revokeObjectURL(track.objectUrl); track.bus?.disconnect(); return; }
    if (!context) return;
    const start = Math.max(context.currentTime, at);
    track.bus.gain.cancelScheduledValues(start); track.bus.gain.setValueAtTime(track.bus.gain.value, start); track.bus.gain.linearRampToValueAtTime(0, start + fade);
    for (const source of track.sources) { try { source.stop(start + fade + 0.05); } catch { /* ended */ } }
    setTimeout(() => { try { track.bus.disconnect(); } catch { /* detached */ } }, (start - context.currentTime + fade + 0.3) * 1000);
  }
  function stop() {
    request++; target = ''; lastArgs = null; clearInterval(timer); timer = 0;
    retire(current, context?.currentTime || 0, 0.7); current = null;
  }
  async function elementTrack(row) {
    // Fallback: <audio loop> through the master bus when possible.
    const audio = new Audio(); audio.loop = true; audio.preload = 'auto'; audio.crossOrigin = 'anonymous';
    const track = { ...row, audio, objectUrl: row.blob ? URL.createObjectURL(row.blob) : '' };
    audio.src = track.objectUrl || row.url;
    try { if (ensureContext()) { track.bus = context.createGain(); context.createMediaElementSource(audio).connect(track.bus); track.bus.connect(master); track.gain = track.bus; } } catch { /* volume on element */ }
    if (!track.gain) audio.volume = level();
    return track;
  }
  async function update(work, mood, packaged) {
    if (disposed || !enabled() || !work) { stop(); return; }
    lastArgs = [work, mood, packaged]; refreshVolume();
    const next = `${work}:${mood}`; if (target === next) return;
    target = next; const ticket = ++request;
    if (mood === 'silence') {
      retire(current, context?.currentTime || 0, 1.8); current = null; clearInterval(timer); timer = 0;
      onStatus('무음 연출 · 이 구간은 배경음악을 쉬어갑니다.'); return;
    }
    const row = await selectedTrack(work, mood, packaged, read);
    if (request !== ticket || !enabled()) return;
    if (!row) { retire(current, 0, 0.7); current = null; onStatus('이 분위기에 등록된 음원이 없습니다. 평상시 음원을 등록하면 기본 음악으로 사용합니다.'); return; }
    if (row.id === current?.id) return;
    ensureContext();
    let track;
    try {
      if (!context) throw new Error('no-webaudio');
      const item = await decode(row);
      if (request !== ticket || !enabled()) return;
      track = { ...row, decoded: item, sources: [], anchors: [], bus: context.createGain(), norm: context.createGain() };
      track.norm.gain.value = item.analysis.gain; track.bus.gain.value = 1;
      track.bus.connect(track.norm); track.norm.connect(master);
    } catch {
      if (request !== ticket) return;
      track = await elementTrack(row);
    }
    const previous = current; current = track;
    if (track.decoded) {
      // Land the change on the outgoing track's next bar line (or beat).
      const now = context.currentTime;
      const wait = previous?.decoded && !previous.stopping ? waitForBoundary(position(previous), previous.decoded.analysis.grid) : 0.05;
      const at = now + wait, bar = previous?.decoded?.analysis.grid?.bar || 2;
      retire(previous, at, Math.min(2.5, Math.max(1.2, bar)));
      segment(track, at, 0, previous ? 0.6 : 1.2);
      clearInterval(timer); timer = setInterval(() => { pump(); refreshVolume(); }, 250);
      refreshVolume();
      const bpm = track.decoded.analysis.grid ? ` · ${Math.round(track.decoded.analysis.bpm)} BPM` : '';
      onStatus(`${row.title} · ${row.credit || '내 음원'}${row.license ? ` · ${row.license}` : ''}${bpm}`);
      if (context.state === 'suspended') onStatus('화면을 누르면 등록한 음악 재생을 시작합니다.');
      return;
    }
    retire(previous, 0, 0.7);
    track.audio.onerror = () => { if (current === track) onStatus('음원을 재생하지 못했습니다. 파일 형식 또는 직접 재생 가능한 HTTPS·CORS 주소인지 확인해 주세요.'); };
    try { await track.audio.play(); if (ticket !== request || current !== track || !enabled()) { retire(track, 0); return; } refreshVolume(); onStatus(`${row.title} · ${row.credit || '내 음원'}${row.license ? ` · ${row.license}` : ''}`); }
    catch { if (request !== ticket || current !== track) { retire(track, 0); return; } if (!track.audio.error) onStatus('화면을 누르면 등록한 음악 재생을 시작합니다.'); }
    clearInterval(timer); timer = setInterval(refreshVolume, 200);
  }
  return { update, stop,
    resume() { if (!enabled() || disposed) return; ensureContext(); if (current?.audio) void current.audio.play().catch(() => {}); else if (!current && lastArgs) { target = ''; void update(...lastArgs); } },
    invalidate() { target = ''; decoded.clear(); memo.clear(); if (lastArgs) void update(...lastArgs); },
    dispose() { stop(); disposed = true; void context?.close(); },
  };
}

export function createMusicSettings({ parent, getWork, onChange, getGeminiKey = () => '', getWorkInfo = () => ({}), read = readAsset, write = writeAsset, generate = generateMusic }) {
  const box = document.createElement('section'); box.className = 'vn-work-music-settings';
  box.innerHTML = `<h3>이 작품의 음악</h3><p>MP3·OGG·WAV·M4A 파일은 이 브라우저에 작품별로 저장합니다(슬롯·소스 ZIP에는 포함되지 않음). 사용 권한이 있는 음원만 등록해 주세요.</p><label>분위기<select class="vn-track-mood"></select></label><label>음원 파일 (최대 20MB)<input class="vn-track-file" type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a"></label><label>또는 직접 재생 주소<input class="vn-track-url" type="url" placeholder="https://…/music.mp3"></label><label>곡 제목<input class="vn-track-title" maxlength="120"></label><label>작곡가·출처<input class="vn-track-credit" maxlength="200"></label><label>사용 허락·라이선스<input class="vn-track-license" maxlength="300" placeholder="예: 직접 제작 / CC BY 4.0 / 이용 허락 받음"></label><div><button class="vn-track-save" type="button">이 분위기에 등록</button><button class="vn-track-remove" type="button">연결 해제</button></div><p class="vn-track-status" role="status"></p><audio class="vn-track-preview" controls preload="none" hidden></audio><button class="vn-track-revert" type="button" hidden>이전 곡으로 되돌리기</button>
  <section class="vn-ai-music"><h4>AI로 이 작품의 배경음악 만들기 · Google Lyria</h4><p>설정의 Gemini API 키로 분위기별 반주곡을 만들어 이 기기에 저장합니다. 모든 곡에 같은 악기 구성·조성·주제 선율을 요청해 한 작품처럼 들리게 하고, 재생할 때 마디에 맞춰 이어 붙입니다. 무료 등급이 없는 유료 모델이며 곡마다 요금이 듭니다(비용 탭에 기록). 모든 곡에 Google의 SynthID 워터마크가 들어갑니다. 공개·상업 배포 전에는 Gemini API 약관을 확인해 주세요.</p>
  <label>음악 방향 (선택)<textarea class="vn-ai-direction" rows="2" maxlength="400" placeholder="예: 비 오는 서울의 밤, 피아노 중심, 차갑지만 쓸쓸하게"></textarea></label>
  <label>모델<select class="vn-ai-model"></select></label>
  <fieldset class="vn-ai-moods"><legend>만들 분위기</legend></fieldset>
  <div><button class="vn-ai-generate" type="button">선택한 분위기 만들기</button><button class="vn-ai-cancel" type="button" hidden>중지</button></div>
  <p class="vn-ai-status" role="status"></p></section>`;
  parent.append(box);
  const find = c => box.querySelector(`.vn-track-${c}`), status = message => { find('status').textContent = message; };
  for (const [value, label] of Object.entries(musicMoods)) { const option = document.createElement('option'); option.value = value; option.textContent = label; find('mood').append(option); }
  const ai = selector => box.querySelector(`.vn-ai-${selector}`);
  for (const [value, row] of Object.entries(MUSIC_MODELS)) { const option = document.createElement('option'); option.value = value; option.textContent = `${row.label} · 곡당 약 $${row.usd.toFixed(2)}`; ai('model').append(option); }
  for (const [value, label] of Object.entries(musicMoods)) {
    const item = document.createElement('label'); const check = document.createElement('input');
    check.type = 'checkbox'; check.value = value; check.checked = true; item.append(check, ` ${label}`); ai('moods').append(item);
  }
  const chosen = () => [...ai('moods').querySelectorAll('input:checked')].map(input => input.value);
  const estimate = () => { const n = chosen().length, usd = (MUSIC_MODELS[ai('model').value]?.usd || 0) * n; ai('generate').textContent = n ? `선택한 ${n}곡 만들기 · 약 $${usd.toFixed(2)}` : '만들 분위기를 선택해 주세요'; ai('generate').disabled = !n || running; };
  ai('moods').onchange = estimate; ai('model').onchange = estimate;
  let running = null, previewUrl = '';
  let generation = 0;
  async function refresh() {
    const work = getWork(), mood = find('mood').value, ticket = ++generation;
    box.querySelectorAll('input,select,button').forEach(el => { el.disabled = !work; });
    if (!work) return status('작품을 먼저 선택해 주세요.');
    const record = await read(musicKey(work, mood)).catch(() => null);
    if (ticket !== generation || work !== getWork()) return;
    for (const field of ['url', 'title', 'credit', 'license']) find(field).value = record?.[field] || '';
    find('file').value = ''; status(record?.title ? `등록됨: ${record.title}` : '이 분위기에 등록한 음원이 없습니다.');
    // Listen before choosing; generated tracks can be reverted once.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = record?.blob instanceof Blob ? URL.createObjectURL(record.blob) : '';
    const preview = find('preview'); preview.hidden = !previewUrl && !record?.url; preview.src = previewUrl || record?.url || '';
    find('revert').hidden = !record?.previous;
    estimate();
  }
  find('revert').onclick = async () => {
    const work = getWork(), mood = find('mood').value; if (!work) return;
    const record = await read(musicKey(work, mood)).catch(() => null);
    if (!record?.previous) return;
    try { await write({ ...record.previous, key: musicKey(work, mood) }); onChange(); await refresh(); status('이전 곡으로 되돌렸습니다.'); }
    catch { status('되돌리기를 저장하지 못했습니다.'); }
  };
  ai('cancel').onclick = () => running?.abort();
  ai('generate').onclick = async () => {
    const work = getWork(), key = getGeminiKey(), moods = chosen(), model = ai('model').value;
    const info = { ...getWorkInfo(), slug: work }, direction = ai('direction').value.trim();
    if (!work || running || !moods.length) return;
    if (!key) { ai('status').textContent = '설정의 Gemini API 키를 먼저 입력하고 저장해 주세요.'; return; }
    running = new AbortController(); ai('cancel').hidden = false; estimate();
    void requestDurableStorage();
    let done = 0;
    try {
      // One request at a time: each song takes tens of seconds and is billed.
      for (const mood of moods) {
        if (running.signal.aborted) break;
        ai('status').textContent = `${musicMoods[mood]} 만드는 중… (${done + 1}/${moods.length}) · 곡당 30초~2분`;
        const { prompt, bpm } = moodPrompt({ info, mood, direction, model });
        await withMediaTask(async () => {
          const { blob, text } = await generate({ key, model, prompt, signal: running.signal });
          const previous = await read(musicKey(work, mood)).catch(() => null);
          await write(generatedRecord({ key: musicKey(work, mood), mood, moodLabel: musicMoods[mood], model, bpm, prompt, blob, text, previous }));
        });
        done++; onChange();
        if (getWork() !== work) break;
        if (find('mood').value === mood) await refresh();
      }
      ai('status').textContent = done === moods.length ? `${done}곡을 만들었습니다. 위에서 분위기를 골라 들어 보고, 읽기 설정의 음악을 ‘작품 음원’으로 선택해 주세요.` : `${done}/${moods.length}곡을 만들고 중지했습니다.`;
    } catch (error) {
      ai('status').textContent = running?.signal.aborted ? `${done}곡을 만들고 중지했습니다.` : `${done}곡 완료 후 실패: ${error?.message || '음악 생성 실패'} · 이미 만든 곡은 저장되어 있습니다.`;
    } finally { running = null; ai('cancel').hidden = true; estimate(); }
  };
  find('mood').onchange = () => void refresh();
  find('save').onclick = async () => {
    const work = getWork(), mood = find('mood').value, file = find('file').files[0];
    if (!work) return;
    const credit = find('credit').value.trim(), license = find('license').value.trim();
    if (!credit || !license) return status('출처와 사용 허락·라이선스를 적어 주세요.');
    const row = { key: musicKey(work, mood), title: find('title').value.trim() || file?.name || '작품 음원', credit, license, savedAt: Date.now() };
    if (file) {
      if (file.size > 20 * 1024 * 1024 || !file.size || !(file.type.startsWith('audio/') || /\.(mp3|ogg|wav|m4a)$/iu.test(file.name))) return status('20MB 이하의 오디오 파일을 선택해 주세요.');
      const type = file.type.startsWith('audio/') ? file.type : ({ mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4' })[file.name.split('.').at(-1).toLowerCase()];
      row.blob = new Blob([file], { type });
    } else { const track = licensedTrack({ ...row, url: find('url').value.trim() }); if (!track) return status('유효한 HTTPS 직접 음원 주소를 입력해 주세요.'); Object.assign(row, track); }
    try { await write(row); onChange(); if (getWork() === work) status(`등록됨: ${row.title} · 음악을 ‘작품 음원’으로 선택하고 설정을 저장해 주세요.`); }
    catch { status('기기 저장 공간이 부족하거나 음원을 저장하지 못했습니다.'); }
  };
  find('remove').onclick = async () => {
    if (!getWork()) return;
    try { await write({ key: musicKey(getWork(), find('mood').value), disabled: true }); onChange(); await refresh(); }
    catch { status('연결 해제를 저장하지 못했습니다.'); }
  };
  return { refresh, status };
}
