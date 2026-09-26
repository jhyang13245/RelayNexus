import { readAsset, writeAsset } from './vn-assets.mjs';
export const musicMoods = { normal: '평상시', warm: '따뜻함', sad: '슬픔', tense: '긴장·전투', eerie: '불길함·공포', memory: '회상' };
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
  const kind = mood === 'dread' ? 'eerie' : Object.hasOwn(musicMoods, mood) ? mood : 'normal';
  for (const name of [...new Set([kind, 'normal'])]) {
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
export function createWorkMusic({ enabled, volume, onStatus = () => {}, read = readAsset }) {
  let context, current, target = '', request = 0, lastArgs, fadeTimer, disposed = false;
  const retired = new Set();
  function dispose(track) { if (!track) return; track.audio.pause(); track.audio.removeAttribute('src'); track.audio.load(); track.source?.disconnect(); track.gain?.disconnect(); if (track.objectUrl) URL.revokeObjectURL(track.objectUrl); retired.delete(track); }
  function silence(track, seconds = .7) {
    if (!track) return;
    if (track.gain && context) { track.gain.gain.cancelScheduledValues(context.currentTime); track.gain.gain.setTargetAtTime(0, context.currentTime, .16); retired.add(track); setTimeout(() => dispose(track), seconds * 1000); }
    else dispose(track);
  }
  function stop() { request++; target = ''; lastArgs = null; clearInterval(fadeTimer); silence(current); current = null; for (const old of [...retired]) dispose(old); }
  function refreshVolume() { if (current?.gain && context) current.gain.gain.setTargetAtTime(Math.min(1, Math.max(0, volume())), context.currentTime, .12); else if (current) current.audio.volume = Math.min(1, Math.max(0, volume())); }
  function ensureContext() { try { context ||= new AudioContext(); if (context.state === 'suspended') void context.resume().catch(() => {}); } catch { /* HTML audio fallback. */ } }
  async function update(work, mood, packaged) {
    if (disposed || !enabled() || !work) { stop(); return; }
    lastArgs = [work, mood, packaged]; refreshVolume();
    const next = `${work}:${mood}`; if (target === next) return;
    target = next; const ticket = ++request;
    const row = await selectedTrack(work, mood, packaged, read);
    if (request !== ticket || !enabled()) return;
    if (!row) { silence(current); current = null; onStatus('이 분위기에 등록된 음원이 없습니다. 평상시 음원을 등록하면 기본 음악으로 사용합니다.'); return; }
    if (row.id === current?.id) return;
    const audio = new Audio(); audio.loop = true; audio.preload = 'auto'; audio.crossOrigin = 'anonymous';
    const track = { ...row, audio, objectUrl: row.blob ? URL.createObjectURL(row.blob) : '' };
    audio.src = track.objectUrl || row.url;
    ensureContext();
    try {
      if (context) { track.source = context.createMediaElementSource(audio); track.gain = context.createGain(); track.gain.gain.value = 0; track.source.connect(track.gain); track.gain.connect(context.destination); }
    } catch { /* audio.volume still controls non-WebAudio playback. */ }
    if (!track.gain) audio.volume = Math.min(1, Math.max(0, volume()));
    silence(current); current = track;
    audio.onerror = () => { if (current === track) onStatus('음원을 재생하지 못했습니다. 파일 형식 또는 직접 재생 가능한 HTTPS·CORS 주소인지 확인해 주세요.'); };
    try { await audio.play(); if (ticket !== request || current !== track || !enabled()) { dispose(track); return; } refreshVolume(); onStatus(`${row.title} · ${row.credit || '내 음원'}${row.license ? ` · ${row.license}` : ''}`); }
    catch { if (request !== ticket || current !== track) { dispose(track); return; } if (!audio.error) onStatus('화면을 누르면 등록한 음악 재생을 시작합니다.'); }
    clearInterval(fadeTimer); fadeTimer = setInterval(refreshVolume, 200);
  }
  return { update, stop,
    resume() { if (!enabled() || disposed) return; ensureContext(); if (current) void current.audio.play().catch(() => {}); else if (lastArgs) { target = ''; void update(...lastArgs); } },
    invalidate() { target = ''; if (lastArgs) void update(...lastArgs); },
    dispose() { stop(); disposed = true; void context?.close(); },
  };
}

export function createMusicSettings({ parent, getWork, onChange, read = readAsset, write = writeAsset }) {
  const box = document.createElement('section'); box.className = 'vn-work-music-settings';
  box.innerHTML = `<h3>이 작품의 음악</h3><p>MP3·OGG·WAV·M4A 파일은 이 브라우저에 작품별로 저장합니다(슬롯·소스 ZIP에는 포함되지 않음). 사용 권한이 있는 음원만 등록해 주세요.</p><label>분위기<select class="vn-track-mood"></select></label><label>음원 파일 (최대 20MB)<input class="vn-track-file" type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a"></label><label>또는 직접 재생 주소<input class="vn-track-url" type="url" placeholder="https://…/music.mp3"></label><label>곡 제목<input class="vn-track-title" maxlength="120"></label><label>작곡가·출처<input class="vn-track-credit" maxlength="200"></label><label>사용 허락·라이선스<input class="vn-track-license" maxlength="300" placeholder="예: 직접 제작 / CC BY 4.0 / 이용 허락 받음"></label><div><button class="vn-track-save" type="button">이 분위기에 등록</button><button class="vn-track-remove" type="button">연결 해제</button></div><p class="vn-track-status" role="status"></p>`;
  parent.append(box);
  const find = c => box.querySelector(`.vn-track-${c}`), status = message => { find('status').textContent = message; };
  for (const [value, label] of Object.entries(musicMoods)) { const option = document.createElement('option'); option.value = value; option.textContent = label; find('mood').append(option); }
  let generation = 0;
  async function refresh() {
    const work = getWork(), mood = find('mood').value, ticket = ++generation;
    box.querySelectorAll('input,select,button').forEach(el => { el.disabled = !work; });
    if (!work) return status('작품을 먼저 선택해 주세요.');
    const record = await read(musicKey(work, mood)).catch(() => null);
    if (ticket !== generation || work !== getWork()) return;
    for (const field of ['url', 'title', 'credit', 'license']) find(field).value = record?.[field] || '';
    find('file').value = ''; status(record?.title ? `등록됨: ${record.title}` : '이 분위기에 등록한 음원이 없습니다.');
  }
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
