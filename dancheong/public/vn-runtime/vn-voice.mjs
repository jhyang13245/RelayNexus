import {deliveryNotes} from '../cortex-vn-performance.mjs?v=88af24489d44';
import { withMediaTask } from './vn-storage.mjs?v=88af24489d44';
import { createByteLru } from './vn-byte-lru.mjs?v=88af24489d44';
import { speakableKorean, actingNotes } from './vn-speech-ko.mjs?v=88af24489d44';
export const VOICE_MODEL = 'gpt-4o-mini-tts-2025-12-15';
export const VOICE_CACHE_LIMIT = 48;
export const voices = ['marin', 'cedar', 'coral', 'sage', 'ash', 'verse'];

// Speech providers. Gemini TTS uses the visitor's Gemini key through
// /api/vn/gemini/voice (Interactions API, speech_metadata style direction).
export const TTS_PROVIDERS = {
  openai: { label: 'OpenAI · gpt-4o-mini-tts', model: VOICE_MODEL, endpoint: '/api/vn/voice', keyName: 'openai', keyLabel: 'OpenAI' },
  'gemini-3.8-flash-tts': { label: 'Gemini 3.8 Flash TTS', model: 'gemini-3.8-flash-tts', endpoint: '/api/vn/gemini/voice', keyName: 'gemini', keyLabel: 'Gemini' },
  'gemini-3.8-flash-lite-tts': { label: 'Gemini 3.8 Flash-Lite TTS · 절약', model: 'gemini-3.8-flash-lite-tts', endpoint: '/api/vn/gemini/voice', keyName: 'gemini', keyLabel: 'Gemini' },
  typecast: { label: 'Typecast · 캐릭터 보이스 (ssfm-v30)', model: 'ssfm-v30', endpoint: '/api/vn/typecast/voice', keyName: 'typecast', keyLabel: 'Typecast' },
};
export const ttsProvider = id => TTS_PROVIDERS[id] ? { id, ...TTS_PROVIDERS[id] } : { id: 'openai', ...TTS_PROVIDERS.openai };
// Voice families share voice names: both Gemini models, OpenAI, Typecast.
export const voiceFamily = provider => ttsProvider(provider).keyName === 'go' ? 'openai' : ttsProvider(provider).keyName;
const isGemini = provider => voiceFamily(provider) === 'gemini';

// Typecast characters come from the visitor's own account (GET /v3/voices),
// loaded in settings and kept on the device. Rows: { id, name, gender, age, useCases, emotions, preview }.
let typecastCatalog = [];
export function setTypecastVoices(list) { typecastCatalog = Array.isArray(list) ? list.filter(row => typeof row?.id === 'string') : []; }
export const typecastVoices = () => typecastCatalog;
export function typecastNarrator() {
  return (typecastCatalog.find(row => (row.useCases || []).some(use => /audiobook|documentary|news/iu.test(use))) || typecastCatalog[0])?.id || '';
}
const typecastPool = (male, elder) => {
  const narrator = typecastNarrator(), rows = typecastCatalog.filter(row => row.id !== narrator);
  const ages = elder ? ['middle_age', 'elder'] : ['teenager', 'young_adult', 'child'];
  const gendered = rows.filter(row => row.gender === (male ? 'male' : 'female'));
  const aged = gendered.filter(row => ages.includes(row.age));
  const acting = aged.filter(row => (row.useCases || []).some(use => /anime|game/iu.test(use)));
  return [acting, aged, gendered, rows].find(list => list.length)?.map(row => row.id) || [];
};

// Prebuilt Gemini voices with Google's one-word character notes. The narrator
// voice is reserved so narration never sounds like a cast member.
export const GEMINI_VOICES = {
  Zephyr: 'Bright', Puck: 'Upbeat', Charon: 'Informative', Kore: 'Firm', Fenrir: 'Excitable', Leda: 'Youthful', Orus: 'Firm', Aoede: 'Breezy',
  Callirrhoe: 'Easy-going', Autonoe: 'Bright', Enceladus: 'Breathy', Iapetus: 'Clear', Umbriel: 'Easy-going', Algieba: 'Smooth', Despina: 'Smooth',
  Erinome: 'Clear', Algenib: 'Gravelly', Rasalgethi: 'Informative', Laomedeia: 'Upbeat', Achernar: 'Soft', Alnilam: 'Firm', Schedar: 'Even',
  Gacrux: 'Mature', Pulcherrima: 'Forward', Achird: 'Friendly', Zubenelgenubi: 'Casual', Vindemiatrix: 'Gentle', Sadachbia: 'Lively', Sadaltager: 'Knowledgeable', Sulafat: 'Warm',
};
export const NARRATOR_VOICE = { openai: 'alloy', gemini: 'Schedar' };
const POOLS = {
  openai: { female: ['marin', 'coral', 'sage'], male: ['cedar', 'ash', 'verse'] },
  gemini: {
    female: ['Leda', 'Zephyr', 'Kore', 'Aoede', 'Autonoe', 'Despina', 'Laomedeia', 'Achernar', 'Erinome', 'Vindemiatrix', 'Sulafat', 'Pulcherrima', 'Callirrhoe'],
    male: ['Puck', 'Fenrir', 'Achird', 'Iapetus', 'Umbriel', 'Algieba', 'Orus', 'Enceladus', 'Zubenelgenubi', 'Sadachbia', 'Alnilam'],
    elderF: ['Gacrux', 'Sulafat', 'Vindemiatrix'], elderM: ['Algenib', 'Charon', 'Rasalgethi', 'Sadaltager'],
  },
};
export const voiceOptions = provider => voiceFamily(provider) === 'typecast' ? typecastCatalog.map(row => row.id) : isGemini(provider) ? Object.keys(GEMINI_VOICES).filter(name => name !== NARRATOR_VOICE.gemini) : voices;
export const narratorOptions = provider => voiceFamily(provider) === 'typecast' ? typecastCatalog.map(row => row.id) : isGemini(provider) ? Object.keys(GEMINI_VOICES) : ['alloy', 'ballad', ...voices];
export const defaultNarrator = provider => voiceFamily(provider) === 'typecast' ? typecastNarrator() : NARRATOR_VOICE[isGemini(provider) ? 'gemini' : 'openai'];
const MALE = /남성|남자|남학생|남고생|남동생|소년|아버지|할아버지|오빠|형님|아저씨|청년|\bmale\b|\bman\b|\bboy\b/iu;
const ELDER = /노인|할아버지|할머니|노파|노년|중년|[5-9]\d\s*(?:세|살)|\belder|\bold\b/iu;
function hash(text) { let h = 0; for (const c of String(text)) h = (Math.imul(h, 31) + c.codePointAt(0)) >>> 0; return h; }
function poolFor(profile, provider) {
  // OpenAI keeps its original rule so voices of lines already cached never change.
  if (voiceFamily(provider) === 'openai') return POOLS.openai[/남성|남자|아버지|할아버지|\bmale\b/iu.test(profile) ? 'male' : 'female'];
  const male = MALE.test(profile), elder = ELDER.test(profile);
  if (voiceFamily(provider) === 'typecast') return typecastPool(male, elder);
  return elder ? POOLS.gemini[male ? 'elderM' : 'elderF'] : POOLS.gemini[male ? 'male' : 'female'];
}
export function defaultVoice(id, profile = '', provider = 'openai') {
  const pool = poolFor(profile, provider);
  return pool.length ? pool[hash(id) % pool.length] : '';
}
// Automatic casting for a work: stable per person, and distinct people get
// distinct voices while the pool allows (first come keeps its voice).
export function castVoices(people = [], provider = 'openai', assigned = {}) {
  const out = { ...assigned }, taken = new Set(Object.values(out));
  for (const person of people) {
    if (!person?.id || out[person.id]) continue;
    const pool = poolFor(`${person.profile || ''} ${person.gender || ''} ${person.age || ''}`, provider), start = hash(person.id) % pool.length;
    if (!pool.length) continue;
    let chosen = pool[start];
    for (let i = 0; i < pool.length; i++) { const name = pool[(start + i) % pool.length]; if (!taken.has(name)) { chosen = name; break; } }
    taken.add(chosen); out[person.id] = chosen;
  }
  return out;
}
export function validVoice(voice, provider) { return voiceOptions(provider).includes(voice) || voice === defaultNarrator(provider); }

// Typecast acts from emotion presets (ssfm-v30: normal, happy, sad, angry,
// whisper, toneup, tonedown) or infers it from the neighbouring lines
// ("smart"). Explicit narration cues and the director's expression win;
// otherwise the model reads the surrounding published prose.
const TYPECAST_EMOTION = { smile: ['happy', 1], blush: ['happy', 0.7], angry: ['angry', 1.2], sad: ['sad', 1], surprised: ['toneup', 1.2], worried: ['tonedown', 1], closed: ['tonedown', 0.8] };
export function typecastActing({ emotion = 'neutral', cue = '', emphasis = false, before = '', after = '' } = {}) {
  let preset = null;
  if (/속삭|귓속말|소곤/u.test(cue)) preset = ['whisper', 1];
  else if (/외쳤|외치|외침|소리쳤|소리치|고함|절규/u.test(cue)) preset = ['toneup', 1.5];
  else if (/흐느|울먹|울면서|울음|눈물|떨리는|떨며/u.test(cue)) preset = ['sad', 1.3];
  else if (/중얼|웅얼|혼잣말|한숨/u.test(cue)) preset = ['tonedown', 1];
  else if (TYPECAST_EMOTION[emotion]) preset = TYPECAST_EMOTION[emotion];
  if (!preset) return { mode: 'smart', previous: String(before).slice(-600), next: String(after).slice(0, 600) };
  return { mode: 'preset', preset: preset[0], intensity: Math.min(2, Math.round(preset[1] * (emphasis ? 1.2 : 1) * 100) / 100) };
}

// Gemini 3.8 TTS reads angle-bracket vocal tags from the transcript. Add only
// what the published narration states outright (a sigh, a laugh).
export function vocalTags(text, cue = '') {
  if (/한숨/u.test(cue) && !/^<sigh>/u.test(text)) return `<sigh> ${text}`;
  if (/킥킥|키득|깔깔|웃음을 터뜨|웃으며/u.test(cue) && !/<(?:laugh|chuckle)>/u.test(text)) return `<chuckle> ${text}`;
  return text;
}

function lineKeys({ scope, speakerId, voice, text, provider, page }) {
  const spec = ttsProvider(provider);
  // One take per spoken position. Acting notes that stream in later refine the
  // request but never make a second paid take of the same line.
  return JSON.stringify(['vn-voice-3', scope, speakerId, voice, text, `${spec.id}:${spec.model}`, String(page.turnId ?? ''), Number(page.start) || 0]);
}

// cue: narration attached to the line ("…라고 속삭였다"); emphasis: a key line.
export function voiceLine(page, view, scope, voice = '', { cue = '', emphasis = false, before = '', after = '' } = {}, { provider = 'openai' } = {}) {
  // Do not speak a growing sentence, unknown attribution, quotation memory or
  // unverified writer annotation. Voice never gates text or character display.
  if (!page || page.isGrowing || view?.castStatus !== 'ready' || !view.speakerId || (!page.quoted && page.kind !== 'dialogue')) return null;
  const spec = ttsProvider(provider);
  const written = String(page.rawText || page.text || '').trim().replace(/^[“「『"]|[”」』"]$/gu, '').trim();
  const spoken = speakableKorean(written);
  if (!spoken || spoken.length > 900) return null;
  const person = view.portraits?.find(p => p.id === view.speakerId);
  const selectedVoice = voiceOptions(spec.id).includes(voice) ? voice : defaultVoice(view.speakerId, view.speakerProfile || person?.profile, spec.id);
  if (!selectedVoice) return null;
  const mood = view.direction?.mood || 'normal', emotion = view.direction?.expressions?.[view.speakerId] || 'neutral';
  const delivery = actingNotes({ text: spoken, emotion, mood, cue: String(cue).slice(0, 240), emphasis });
  const context = JSON.stringify({ speaker: view.speakerName, intention:deliveryNotes[view.direction?.performance?.delivery]||'', delivery, preceding:String(before).slice(-120), following:String(after).slice(0,80) }).slice(0, 700);
  const text = isGemini(spec.id) ? vocalTags(spoken, String(cue)) : spoken;
  // Vocal tags are delivery metadata too: a late sigh must not buy a new take.
  const key = lineKeys({ scope, speakerId: view.speakerId, voice: selectedVoice, text: spoken, provider: spec.id, page });
  // Lines voiced before v13.14 stay playable for free under their old keys.
  const fallbackKeys = spec.id === 'openai' ? [
    JSON.stringify(['vn-voice-2', scope, view.speakerId, selectedVoice, spoken, context]),
    JSON.stringify(['vn-voice-1', scope, view.speakerId, selectedVoice, written, JSON.stringify({ speaker: view.speakerName, mood, emotion }).slice(0, 700)]),
  ] : isGemini(spec.id) ? ['<sigh> ', '<chuckle> '].map(tag => lineKeys({ scope, speakerId: view.speakerId, voice: selectedVoice, text: tag + spoken, provider: spec.id, page })) : [];
  const typecast = voiceFamily(spec.id) === 'typecast' ? typecastActing({ emotion, cue: String(cue), emphasis, before, after }) : undefined;
  return { key, fallbackKeys, legacyKey: fallbackKeys[1], playbackKey: JSON.stringify([scope, page.turnId, page.start]), mediaTurn: Number.isInteger(page.turnIndex) ? page.turnIndex + 1 : undefined, text, context, voice: selectedVoice, speakerId: view.speakerId, provider: spec.id, model: spec.model, ...(typecast ? { typecast } : {}) };
}
// Explicit full-autoplay mode also reads narration and unassigned dialogue.
// Unverified quotations use a neutral reader, never an invented character voice.
// A quotation whose speaker check is still running waits for it instead.
export function readingVoiceLine(page, view, scope, voice = '', delivery = {}, { provider = 'openai', narrator = '' } = {}) {
  const character = voiceLine(page, view, scope, voice, delivery, { provider });
  if (character) return character;
  if (!page || page.isGrowing) return null;
  if ((page.quoted || page.kind === 'dialogue') && view && !['ready', 'error', 'needs-key', 'skipped', 'none'].includes(view.castStatus)) return null;
  const spec = ttsProvider(provider);
  const text = speakableKorean(String(page.rawText || page.text || '').trim());
  if (!text || text.length > 900) return null;
  const speakerId = '@vn/narrator', selectedVoice = narratorOptions(spec.id).includes(narrator) ? narrator : defaultNarrator(spec.id);
  if (!selectedVoice) return null;
  const context = JSON.stringify({ speaker: '낭독', delivery: '차분하고 자연스러운 한국어 서술 낭독. 인물의 신원을 추측하거나 다른 인물을 흉내 내지 않는다. 본문만 읽고 설명을 덧붙이지 않는다.' });
  const key = lineKeys({ scope, speakerId, voice: selectedVoice, text, provider: spec.id, page });
  const typecast = voiceFamily(spec.id) === 'typecast' ? { mode: 'preset', preset: 'normal', intensity: 1 } : undefined;
  const fallbackKeys = spec.id === 'openai' && !narrator ? [JSON.stringify(['vn-voice-2', scope, speakerId, 'marin', text, context])] : [];
  return { key, fallbackKeys, playbackKey: JSON.stringify([scope, page.turnId, page.start]), mediaTurn: Number.isInteger(page.turnIndex) ? page.turnIndex + 1 : undefined, text, context, voice: selectedVoice, speakerId, provider: spec.id, model: spec.model, narrator: true, ...(typecast ? { typecast } : {}) };
}
const AUDIO_URL = /^data:audio\/(?:mpeg|mp3|wav|x-wav|ogg|opus|webm|aac|mp4);base64,/u;
export function createVoice({ getEnabled, getKey, read, write, fetchVoice = (...args) => fetch(...args), makeAudio = url => new Audio(url), onState = () => {} }) {
  const cache = createByteLru({ maxBytes: 12 * 1024 * 1024, maxEntries: VOICE_CACHE_LIMIT }), jobs = new Map(), failed = new Map(), blockedProviders = new Map();
  const remember = record => { cache.set(record.key, record, record.url.length * 2 + record.key.length * 2); return record; };
  let current = '', generation = 0, requestEpoch = 0, audio = null, phase = 'idle', playing = null, errorMessage = '';
  let lastJob = Promise.resolve();
  // The take key already excludes acting notes: later streamed cues neither
  // interrupt the current delivery nor buy another take. Replay is free.
  const playKey = line => JSON.stringify([line.key, line.playbackKey || '']);
  const set = value => { phase = value; onState(value); };
  const halt = () => { if (audio) { audio.pause(); audio.currentTime = 0; audio = null; } playing = null; };
  function stop() { generation++; halt(); set('idle'); }
  async function prepare(line, active, options = {}) {
    const shared=globalThis.NexusVNSharedAssets;
    if(!shared||options.cachedOnly)return prepareLocal(line,active,options);
    // A listener's provider/voice preference cannot fork a paid room recording.
    let sharedText=line.text;try{sharedText=JSON.parse(line.key)[4]||sharedText;}catch{}
    const sharedKey=JSON.stringify(['vn-room-voice-1',line.playbackKey,line.speakerId,sharedText]);
    if(shared.isShared('voice',sharedKey)&&cache.has(line.key))return remember(cache.get(line.key));
    const record=await shared.record('voice',sharedKey,async()=>{const value=await prepareLocal({...line,sharedKey},active,options);return value?{...value,key:sharedKey,voice:line.voice,voiceName:typecastVoices().find(row=>row.id===line.voice)?.name||''}:null;},{canProduce:Boolean(getKey(line.provider)),turn:line.mediaTurn});
    if(record){const local={...record,key:line.key};void write(local).catch(()=>{});return remember(local);}return null;
  }
  async function prepareLocal(line, active, { cachedOnly = false } = {}) {
    const epoch = requestEpoch;
    if (cache.has(line.key)) return remember(cache.get(line.key));
    if (jobs.get(line.key)?.epoch === epoch && !cachedOnly) return jobs.get(line.key).task;
    if (failed.has(line.key) && !cachedOnly) return null;
    const key = getKey(line.provider);
    const preceding = lastJob;
    const job = withMediaTask(async () => {
      try {
        let record; try { record = await read(line.key); } catch { /* Memory works. */ }
        for (const old of [line.legacyKey && !line.fallbackKeys?.includes(line.legacyKey) ? line.legacyKey : '', ...(line.fallbackKeys || [])].filter(Boolean)) {
          if (record) break;
          try { const found = await read(old); if (found) record = { ...found, key: line.key }; } catch { /* Legacy lookup is best-effort. */ }
        }
        if (AUDIO_URL.test(record?.url || '')) return remember(record);
        if (cachedOnly) return null;
        await preceding;
        if (cache.has(line.key)) return remember(cache.get(line.key));
        if (blockedProviders.has(line.provider)) return null;
        if (!getEnabled() || !active() || !key) return null;
        const spec = ttsProvider(line.provider);
        globalThis.NexusVNSharedAssets?.started("voice",line.sharedKey||line.key);
        const response = await fetchVoice(spec.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Dancheong-Purpose': 'voice' }, signal: AbortSignal.timeout(95000), body: JSON.stringify({ model: line.model || spec.model, text: line.text, voice: line.voice, context: line.context, ...(line.typecast ? { typecast: line.typecast } : {}) }) });
        globalThis.NexusVNSharedAssets?.response("voice",line.sharedKey||line.key,response);
        const result = await response.json().catch(() => null);
        if (!response.ok || !AUDIO_URL.test(result?.audioUrl || '')) {
          // Only our route's public error message is retained. Never expose a
          // raw HTTP body, submitted key, or native network exception.
          const message = typeof result?.error?.message === 'string' ? result.error.message.split(key).join('[보호됨]').slice(0, 240)
            : `음성 서버 응답 오류 (${response.status}). 잠시 후 다시 시도해 주세요.`;
          const error = new Error(message); error.publicVoiceError = true;
          error.blockProvider = line.provider === 'typecast' && (response.status === 403 || result?.error?.code === 'TYPECAST_REQUEST_UNCONFIRMED');
          throw error;
        }
        record = { key: line.key, url: result.audioUrl, savedAt: Date.now(), speakerId: line.speakerId, provider: line.provider };
        remember(record);
        try { await write(record); } catch { /* Replays in this tab remain free. */ }
        return record;
      } catch (error) { if (cachedOnly) return null; if (epoch === requestEpoch) { if (error?.blockProvider) blockedProviders.set(line.provider, error.message); failed.set(line.key, error?.publicVoiceError ? error.message : '음성 서버에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.'); while (failed.size > VOICE_CACHE_LIMIT) failed.delete(failed.keys().next().value); } return null; }
      finally { if (!cachedOnly && jobs.get(line.key)?.task === job) jobs.delete(line.key); }
    });
    // A cache lookup never becomes the job a paid request would join.
    if (cachedOnly) return job;
    jobs.set(line.key, { epoch, task: job }); lastJob = job; return job;
  }
  async function play(line, token, { cachedOnly = false } = {}) {
    const active = () => token === generation && getEnabled() && current === playKey(line);
    errorMessage = ''; set('preparing');
    const record = await prepare(line, active, { cachedOnly });
    if (!active()) return false;
    if (!record) { errorMessage = failed.get(line.key) || blockedProviders.get(line.provider) || ''; set(cachedOnly ? 'idle' : getKey(line.provider) ? 'error' : 'needs-key'); return false; }
    audio = makeAudio(record.url, { speakerId: line.speakerId }); const instance = audio;
    instance.onended = () => { if (active()) { audio = null; playing = null; set('done'); } };
    instance.onerror = () => { if (active()) { errorMessage = '생성된 음성을 재생하지 못했습니다. 다시 듣기를 눌러 주세요.'; halt(); set('error'); } };
    try { await instance.play(); if (active() && audio === instance) { playing = { ...line, provider: record.provider || line.provider, voice: record.voice || line.voice, voiceName: record.voiceName || '' }; set('playing'); } else instance.pause(); }
    catch { if (active()) { halt(); set('blocked'); } }
    return true;
  }
  return {
    update(line) {
      if (!getEnabled() || !line) { if (current || phase !== 'idle') { stop(); current = ''; } return; }
      if (current === playKey(line)) return;
      stop(); current = playKey(line); void play(line, generation);
    },
    replay(line) { if (!line || !getEnabled()) return; stop(); current = playKey(line); failed.delete(line.key); blockedProviders.delete(line.provider); void play(line, generation); },
    // Backlog: play a stored take only; resolves false when none exists.
    async replayStored(lines) {
      for (const line of [lines].flat().filter(Boolean)) {
        if (!getEnabled()) return false;
        stop(); current = playKey(line);
        if (await play(line, generation, { cachedOnly: true })) return true;
      }
      return false;
    },
    // Keep a line that is still being spoken when the reader advances
    // ("voice continues on click"); the next line interrupts it as usual.
    release() { if (phase === 'playing' && audio) { const keep = audio; generation++; audio = null; playing = null; current = ''; phase = 'idle'; keep.onended = null; keep.onerror = null; return keep; } return null; },
    stop,
    resume() { makeAudio.resume?.(); },
    reset({ retryFailed = false } = {}) { if (retryFailed) { requestEpoch++; failed.clear(); blockedProviders.clear(); } errorMessage = ''; stop(); current = ''; },
    clearMemory() { stop(); current = ''; cache.clear(); failed.clear(); },
    get busy() { return jobs.size > 0; },
    get memory() { return { entries: cache.size, bytes: cache.bytes }; },
    get phase() { return phase; },
    get speaking() { return playing; },
    get error() { return errorMessage; },
  };
}
