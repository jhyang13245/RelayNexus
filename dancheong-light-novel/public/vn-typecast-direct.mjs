// Typecast synthesis straight from the reader's browser.
//
// Typecast's free-plan abuse check answers 403 UNUSUAL_ACTIVITY_DETECTED when a
// request comes from an address shared by many accounts. Our /api/typecast
// relay runs on Cloudflare Workers, whose outbound addresses are shared by
// every Worker, so a brand-new key can be blocked on its first line while the
// character list (no credits) still loads. Sending the request from the
// player's own connection avoids that shared address, and the key (already
// stored only on this device) no longer passes through our server.
//
// The request needs a CORS preflight (X-API-KEY header, JSON body). If Typecast
// does not allow browser origins the preflight fails, nothing is sent or
// charged, and we fall back to the relay once for the rest of the session.
export const TYPECAST_TTS = 'https://api.typecast.ai/v1/text-to-speech';
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

export function typecastMessage(status, code = '', { direct = false } = {}) {
  if (code === 'UNUSUAL_ACTIVITY_DETECTED') {
    return direct
      ? 'Typecast가 이 계정의 음성 생성을 이상 활동으로 차단했습니다. 브라우저에서 직접 요청해도 차단되어 접속 주소가 아니라 계정 쪽 제한으로 보입니다. Typecast 고객지원에 오류 코드 UNUSUAL_ACTIVITY_DETECTED와 함께 문의하거나 유료 API 플랜을 확인해 주세요. 저장된 음성은 계속 재생됩니다.'
      : 'Typecast가 서버 중계 요청을 이상 활동으로 차단했습니다(무료 플랜은 여러 사용자가 함께 쓰는 클라우드 주소를 차단할 수 있습니다). 브라우저 직접 연결은 Typecast가 허용하지 않았습니다. Typecast 고객지원 문의나 유료 API 플랜이 필요합니다. 저장된 음성은 계속 재생됩니다.';
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
  const bytes = new Uint8Array(await response.arrayBuffer());
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
// directly when possible and answered in the route's JSON format.
export function createTypecastTransport({ fetchImpl = (...args) => fetch(...args), storage = globalThis.sessionStorage, mode = () => 'auto' } = {}) {
  const flag = 'dancheong-vn-typecast-direct-v1';
  let direct = (() => { try { return storage?.getItem(flag) || 'unknown'; } catch { return 'unknown'; } })();
  const remember = value => { direct = value; try { storage?.setItem(flag, value); } catch { /* This tab only. */ } };
  async function send(url, init = {}) {
    if (url !== '/api/typecast/voice' || mode() === 'relay' || direct === 'unavailable') return fetchImpl(url, init);
    let body; try { body = JSON.parse(init.body); } catch { return fetchImpl(url, init); }
    const key = String(init.headers?.Authorization || '').replace(/^Bearer /u, '');
    let response;
    try {
      response = await fetchImpl(TYPECAST_TTS, { method: 'POST', mode: 'cors', credentials: 'omit', signal: init.signal,
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify(typecastBody(body)) });
    } catch (error) {
      // A timeout may already have been processed and billed: never resend.
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return Response.json({ error: { message: 'Typecast 응답이 지연되어 음성을 받지 못했습니다. 다시 듣기를 눌러 주세요.' } }, { status: 504 });
      // Blocked preflight (CORS) or no route from this browser: nothing was
      // sent to the synthesis endpoint. Use the relay from now on.
      remember('unavailable');
      return fetchImpl(url, init);
    }
    remember('ok');
    if (!response.ok) {
      const code = response.status === 403 ? await errorCode(response) : '';
      return Response.json({ error: { message: typecastMessage(response.status, code, { direct: true }), ...(code ? { code } : {}) }, model: body.model, transport: 'direct' }, { status: response.status });
    }
    if (!(response.headers.get('content-type') || '').toLowerCase().startsWith('audio/')) return Response.json({ error: { message: 'Typecast 응답 형식을 확인하지 못했습니다.' } }, { status: 502 });
    const audio = await dataUrl(response);
    if (!audio.size) return Response.json({ error: { message: 'Typecast가 음성을 반환하지 않았습니다.' } }, { status: 502 });
    return Response.json({ audioUrl: audio.url, model: body.model, duration: Number(response.headers.get('x-audio-duration')) || null, transport: 'direct' });
  }
  return { fetch: send, get state() { return direct; }, reset() { remember('unknown'); } };
}
