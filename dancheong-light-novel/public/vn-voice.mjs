import { withMediaTask } from './vn-storage.mjs';
import { speakableKorean, actingNotes } from './vn-speech-ko.mjs';
export const VOICE_MODEL = 'gpt-4o-mini-tts-2025-12-15';
export const VOICE_CACHE_LIMIT = 48;
export const voices = ['marin', 'cedar', 'coral', 'sage', 'ash', 'verse'];
export function defaultVoice(id, profile = '') {
  const pool = /남성|남자|아버지|할아버지|\bmale\b/iu.test(profile) ? ['cedar', 'ash', 'verse'] : ['marin', 'coral', 'sage'];
  let hash = 0; for (const c of String(id)) hash = (Math.imul(hash, 31) + c.codePointAt(0)) >>> 0;
  return pool[hash % pool.length];
}
// cue: narration attached to the line ("…라고 속삭였다"); emphasis: a key line.
export function voiceLine(page, view, scope, voice = '', { cue = '', emphasis = false } = {}) {
  // Do not speak a growing sentence, unknown attribution, quotation memory or
  // unverified writer annotation. Voice never gates text or character display.
  if (!page || page.isGrowing || view?.castStatus !== 'ready' || !view.speakerId || (!page.quoted && page.kind !== 'dialogue')) return null;
  const written = String(page.rawText || page.text || '').trim().replace(/^[“「『"]|[”」』"]$/gu, '').trim();
  const text = speakableKorean(written);
  if (!text || text.length > 900) return null;
  const person = view.portraits?.find(p => p.id === view.speakerId);
  const selectedVoice = voices.includes(voice) ? voice : defaultVoice(view.speakerId, view.speakerProfile || person?.profile);
  const mood = view.direction?.mood || 'normal', emotion = view.direction?.expressions?.[view.speakerId] || 'neutral';
  const delivery = actingNotes({ text, emotion, mood, cue: String(cue).slice(0, 240), emphasis });
  const context = JSON.stringify({ speaker: view.speakerName, delivery }).slice(0, 700);
  // Lines voiced before v13.12 stay playable for free under their old key.
  const legacyKey = JSON.stringify(['vn-voice-1', scope, view.speakerId, selectedVoice, written, JSON.stringify({ speaker: view.speakerName, mood, emotion }).slice(0, 700)]);
  return { key: JSON.stringify(['vn-voice-2', scope, view.speakerId, selectedVoice, text, context]), legacyKey, playbackKey: JSON.stringify([scope, page.turnId, page.start]), text, context, voice: selectedVoice, speakerId: view.speakerId };
}
// Explicit full-autoplay mode also reads narration and unassigned dialogue.
// Unverified quotations use a neutral reader, never an invented character voice.
export function readingVoiceLine(page, view, scope, voice = '', delivery = {}) {
  const character = voiceLine(page, view, scope, voice, delivery);
  if (character) return character;
  if (!page || page.isGrowing) return null;
  const text = speakableKorean(String(page.rawText || page.text || '').trim());
  if (!text || text.length > 900) return null;
  const speakerId = '@vn/narrator', selectedVoice = 'marin';
  const context = JSON.stringify({ speaker: '낭독', delivery: '차분하고 자연스러운 한국어 서술 낭독. 인물의 신원을 추측하거나 다른 인물을 흉내 내지 않는다. 본문만 읽고 설명을 덧붙이지 않는다.' });
  return { key: JSON.stringify(['vn-voice-2', scope, speakerId, selectedVoice, text, context]),
    playbackKey: JSON.stringify([scope, page.turnId, page.start]), text, context, voice: selectedVoice, speakerId };
}
export function createVoice({ getEnabled, getKey, read, write, fetchVoice = (...args) => fetch(...args), makeAudio = url => new Audio(url), onState = () => {} }) {
  const cache = new Map(), jobs = new Map(), failed = new Set();
  const remember = record => { cache.delete(record.key); cache.set(record.key, record); while (cache.size > VOICE_CACHE_LIMIT) cache.delete(cache.keys().next().value); return record; };
  let current = '', generation = 0, audio = null, phase = 'idle';
  let lastJob = Promise.resolve();
  // Keep one delivery while this passage is playing. Later streamed acting cues
  // must not interrupt it or create a second paid request. Explicit replay still works.
  const playKey = line => line.playbackKey ? JSON.stringify([line.playbackKey, line.speakerId, line.voice, line.text]) : line.key;
  const set = value => { phase = value; onState(value); };
  const halt = () => { if (audio) { audio.pause(); audio.currentTime = 0; audio = null; } };
  function stop() { generation++; halt(); set('idle'); }
  async function prepare(line, active) {
    if (cache.has(line.key)) return remember(cache.get(line.key));
    if (jobs.has(line.key)) return jobs.get(line.key);
    if (failed.has(line.key)) return null;
    const key = getKey();
    const preceding = lastJob;
    const job = withMediaTask(async () => {
      try {
        let record; try { record = await read(line.key); } catch { /* Memory works. */ }
        if (!record && line.legacyKey) { try { const old = await read(line.legacyKey); if (old) record = { ...old, key: line.key }; } catch { /* Legacy lookup is best-effort. */ } }
        if (record?.url?.startsWith('data:audio/mpeg;base64,')) return remember(record);
        await preceding;
        if (!getEnabled() || !active() || !key) return null;
        const response = await fetchVoice('/api/voice', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Dancheong-Purpose': 'voice' }, signal: AbortSignal.timeout(95000), body: JSON.stringify({ model: VOICE_MODEL, text: line.text, voice: line.voice, context: line.context }) });
        const result = await response.json();
        if (!response.ok || !/^data:audio\/mpeg;base64,/u.test(result.audioUrl || '')) throw new Error('voice');
        record = { key: line.key, url: result.audioUrl, savedAt: Date.now() }; remember(record);
        try { await write(record); } catch { /* Replays in this tab remain free. */ }
        return record;
      } catch { failed.add(line.key); while (failed.size > VOICE_CACHE_LIMIT) failed.delete(failed.values().next().value); return null; }
      finally { jobs.delete(line.key); }
    }); jobs.set(line.key, job); lastJob = job; return job;
  }
  async function play(line, token) {
    const active = () => token === generation && getEnabled() && current === playKey(line);
    set('preparing');
    const record = await prepare(line, active);
    if (!active()) return;
    if (!record) { set(getKey() ? 'error' : 'needs-key'); return; }
    audio = makeAudio(record.url); const instance = audio;
    instance.onended = () => { if (active()) { audio = null; set('done'); } };
    instance.onerror = () => { if (active()) { halt(); set('error'); } };
    try { await instance.play(); if (active() && audio === instance) set('playing'); else instance.pause(); }
    catch { if (active()) { halt(); set('blocked'); } }
  }
  return {
    update(line) {
      if (!getEnabled() || !line) { if (current || phase !== 'idle') { stop(); current = ''; } return; }
      if (current === playKey(line)) return;
      stop(); current = playKey(line); void play(line, generation);
    },
    replay(line) { if (!line || !getEnabled()) return; stop(); current = playKey(line); failed.delete(line.key); void play(line, generation); },
    stop,
    resume() { makeAudio.resume?.(); },
    reset() { stop(); current = ''; },
    clearMemory() { stop(); current = ''; cache.clear(); failed.clear(); },
    get busy() { return jobs.size > 0; },
    get phase() { return phase; },
  };
}
