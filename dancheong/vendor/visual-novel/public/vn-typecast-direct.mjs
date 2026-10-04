// Optional browser transport for an authorized Typecast account. The relay
// remains the default. A rejected/uncertain synthesis is never resent through
// another route: fetch cannot distinguish a refused preflight from a dropped
// response after successful, billable synthesis. Provider restrictions must
// be resolved with Typecast, not by changing transport automatically.
export const TYPECAST_TTS = 'https://api.typecast.ai/v1/text-to-speech';
const MAX_AUDIO = 8 * 1024 * 1024;
export const TYPECAST_UNCONFIRMED = 'TYPECAST_REQUEST_UNCONFIRMED';
const PRESETS = {
  'ssfm-v30': ['normal', 'happy', 'sad', 'angry', 'whisper', 'toneup', 'tonedown'],
  'ssfm-v21': ['normal', 'happy', 'sad', 'angry'],
};
const clip = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

// Same body as app/api/typecast/voice (official SDK field names).
export function typecastBody({ model, text, voice, typecast = {} }) {
  const acting = typecast && typeof typecast === 'object' ? typecast : {};
  let prompt;
  if (acting.mode === 'preset' && PRESETS[model]?.includes(acting.preset)) {
    const intensity = Math.max(0, Math.min(2, Number(acting.intensity) || 1));
    prompt = model === 'ssfm-v30' ? { emotion_type: 'preset', emotion_preset: acting.preset, emotion_intensity: intensity } : { emotion_preset: acting.preset, emotion_intensity: intensity };
  } else if (model === 'ssfm-v30') {
    prompt = { emotion_type: 'smart', ...(clip(acting.previous, 2000) ? { previous_text: clip(acting.previous, 2000) } : {}), ...(clip(acting.next, 2000) ? { next_text: clip(acting.next, 2000) } : {}) };
  } else prompt = { emotion_preset: 'normal', emotion_intensity: 1 };
  const tempo = Math.max(0.5, Math.min(2, Number(acting.tempo) || 1));
  return { voice_id: voice, text: String(text || '').trim(), model, language: 'kor', prompt, output: { audio_format: 'mp3', audio_tempo: tempo } };
}

export function typecastMessage(status, code = '') {
  if (code === 'UNUSUAL_ACTIVITY_DETECTED') {
    return 'Typecast가 이상 활동을 감지해 음성 생성을 차단했습니다. Typecast 고객지원에서 API 이용 제한을 확인해 주세요. 자동 음성 요청은 중단되며 저장된 음성은 계속 재생됩니다.';
  }
  if (status === 401) return 'Typecast API 키 인증에 실패했습니다. 음성·음악 설정에서 API용 키를 확인해 주세요.';
  if (status === 402) return 'Typecast 크레딧이 부족합니다. Typecast 요금제와 남은 크레딧을 확인해 주세요.';
  if (status === 403) return `Typecast API 사용 권한이 없습니다${code ? ` (${code})` : ''}. Typecast API 대시보드의 계정·이용 권한을 확인해 주세요.`;
  if (status === 404) return '선택한 Typecast 캐릭터를 찾지 못했습니다. 캐릭터 목록을 다시 불러와 주세요.';
  if (status === 400 || status === 422) return 'Typecast가 이 대사나 캐릭터 설정을 거부했습니다. 다른 캐릭터나 감정으로 다시 시도해 주세요.';
  if (status === 429) return 'Typecast 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.';
  return `Typecast 음성 오류 (${status}). 본문은 계속 읽을 수 있습니다.`;
}

async function dataUrl(response) {
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (Number(response.headers.get('content-length')) > MAX_AUDIO) { await response.body?.cancel(); throw Error('Audio too large'); }
  const reader = response.body?.getReader(), chunks = []; let size = 0;
  if (!reader) throw Error('No audio');
  try {
    for (;;) {
      const {value, done} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO) { await reader.cancel(); throw Error('Audio too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { url: `data:${/mpeg|mp3/u.test(type) ? 'audio/mpeg' : 'audio/wav'};base64,${btoa(binary)}`, size: bytes.length };
}
async function errorCode(response) {
  try {
    if (!(response.headers.get('content-type') || '').includes('json')) return '';
    const data = await response.json();
    const code = data?.error_code ?? data?.error?.code ?? data?.code ?? data?.detail?.error_code;
    return typeof code === 'string' && /^[A-Z0-9_-]{1,64}$/iu.test(code) ? code : '';
  } catch { return ''; }
}

// fetchVoice wrapper for createVoice: '/api/typecast/voice' requests are sent
// directly only when selected, answered in the route's JSON format.
export function createTypecastTransport({ fetchImpl = (...args) => fetch(...args), mode = () => 'relay' } = {}) {
  let direct = 'unknown';
  const fail = (message, status, model = '', code = '') => Response.json({ error: {message, ...(code ? {code} : {})}, model, transport: 'direct' }, {status, headers: {'Cache-Control': 'no-store'}});
  const uncertain = model => fail('Typecast 음성의 처리 결과를 확인하지 못했습니다. 연결·브라우저 요청 허용 여부와 API 사용량을 확인해 주세요. 중복 과금을 막기 위해 자동 재요청은 중단했습니다.', 502, model, TYPECAST_UNCONFIRMED);
  async function send(url, init = {}) {
    if (url !== '/api/typecast/voice' || mode() !== 'direct') return fetchImpl(url, init);
    let body; try { body = JSON.parse(init.body); } catch { return fail('잘못된 음성 요청 형식입니다.', 400); }
    const authorization = new Headers(init.headers).get('authorization') || '';
    if (!/^Bearer \S{1,512}$/u.test(authorization)) return fail('Typecast 음성에는 Typecast API 키가 필요합니다.', 401);
    if (!body || !Object.hasOwn(PRESETS, body.model) || typeof body.text !== 'string' || !body.text.trim() || body.text.trim().length > 900 || typeof body.voice !== 'string' || !/^[a-z]{2,4}_[A-Za-z0-9]{6,64}$/u.test(body.voice)) return fail('대사 또는 Typecast 캐릭터 설정을 확인해 주세요.', 400);
    if (new TextEncoder().encode(init.body).length > 16000) return fail('음성 요청이 너무 깁니다.', 413);
    const key = authorization.slice(7);
    let response;
    try {
      response = await fetchImpl(TYPECAST_TTS, { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: init.signal,
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify(typecastBody(body)) });
    } catch {
      direct = 'uncertain';
      return uncertain(body.model);
    }
    direct = 'ok';
    if (!response.ok) {
      const code = response.status === 403 ? await errorCode(response) : '';
      if (response.status !== 403) await response.body?.cancel().catch(() => {});
      return fail(typecastMessage(response.status, code), response.status, body.model, code);
    }
    if (!(response.headers.get('content-type') || '').toLowerCase().startsWith('audio/')) { await response.body?.cancel().catch(() => {}); return uncertain(body.model); }
    try {
      const audio = await dataUrl(response);
      if (!audio.size) return uncertain(body.model);
      return Response.json({ audioUrl: audio.url, model: body.model, duration: Number(response.headers.get('x-audio-duration')) || null, characters: body.text.trim().length, transport: 'direct' }, {headers: {'Cache-Control': 'no-store'}});
    } catch { direct = 'uncertain'; return uncertain(body.model); }
  }
  return { fetch: send, get state() { return direct; } };
}
