// Typecast character voices with the visitor's own Typecast API key.
// Request shape from the official SDK (neosapience/typecast-sdk,
// typecast-python models/tts.py and client.py): POST /v1/text-to-speech with
// X-API-KEY; body { voice_id, text, model, language, prompt, output }.
// ssfm-v30 prompts are either { emotion_type:'preset', emotion_preset,
// emotion_intensity } or { emotion_type:'smart', previous_text, next_text }.
// The response body is the audio itself (Content-Type audio/mpeg or wav).
const ENDPOINT = 'https://api.typecast.ai/v1/text-to-speech';
const MODELS = new Set(['ssfm-v30', 'ssfm-v21']);
const PRESETS: Record<string, Set<string>> = {
  'ssfm-v30': new Set(['normal', 'happy', 'sad', 'angry', 'whisper', 'toneup', 'tonedown']),
  'ssfm-v21': new Set(['normal', 'happy', 'sad', 'angry']),
};
const VOICE_ID = /^[a-z]{2,4}_[A-Za-z0-9]{6,64}$/u;
const MAX_REQUEST = 16000;
const MAX_AUDIO = 8 * 1024 * 1024;
const headers = { 'Cache-Control': 'no-store' };
// Identify the integration like the official SDKs do (they always send a User-Agent).
const USER_AGENT = 'dancheong-light-novel/13.17 (platform=server; transport=rest; runtime=cloudflare-workers)';
const fail = (message: string, status: number, model = '', code = '') => Response.json({ error: { message, ...(code ? { code } : {}) }, model }, { status, headers });

function statusMessage(status: number) {
  // Typecast's error text is not echoed: it can repeat the submitted line.
  if (status === 401) return 'Typecast API 키 인증에 실패했습니다. 음성·음악 설정에서 API용 키를 확인해 주세요.';
  if (status === 403) return 'Typecast API 사용 권한이 없습니다. Typecast API 대시보드의 계정·이용 권한을 확인해 주세요.';
  if (status === 402) return 'Typecast 크레딧이 부족합니다. Typecast 요금제와 남은 크레딧을 확인해 주세요.';
  if (status === 404) return '선택한 Typecast 캐릭터를 찾지 못했습니다. 캐릭터 목록을 다시 불러와 주세요.';
  if (status === 422 || status === 400) return 'Typecast가 이 대사나 캐릭터 설정을 거부했습니다. 다른 캐릭터나 감정으로 다시 시도해 주세요.';
  if (status === 429) return 'Typecast 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.';
  return `Typecast 음성 오류 (${status}). 본문은 계속 읽을 수 있습니다.`;
}
const clip = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
async function permissionDetail(response: Response, privateValues: string[]) {
  // A 403 may be a model/account restriction or a gateway block. Preserve a
  // short structured explanation, never the raw response body or request data.
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    await response.body?.cancel().catch(() => {});
    return { suffix: ' (403 · 서버 접근 차단 또는 API 권한 제한)', code: '' };
  }
  try {
    const data = await response.json() as { message?: unknown; error?: { message?: unknown }; detail?: unknown; error_code?: unknown } | null;
    let message = [data?.message, data?.error?.message, data?.detail].find(value => typeof value === 'string') || '';
    for (const value of privateValues.filter(Boolean)) message = message.split(value).join('[보호됨]');
    message = message.replace(/Bearer\s+\S+|(?:__plt|sk-)[A-Za-z0-9_-]+/giu, '[보호됨]').replace(/[\x00-\x1f\x7f]/gu, ' ').trim().slice(0, 180);
    const code = typeof data?.error_code === 'string' && /^[A-Z0-9_-]{1,64}$/iu.test(data.error_code) ? data.error_code : '';
    return { suffix: message || code ? ` (Typecast: ${[code, message].filter(Boolean).join(' · ')})` : ' (403)', code };
  } catch { return { suffix: ' (403)', code: '' }; }
}
function base64Of(bytes: Uint8Array) { let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary); }

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer \S{1,512}$/u.test(authorization)) return fail('Typecast 음성에는 Typecast API 키가 필요합니다.', 401);
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) return fail('잘못된 요청 형식입니다.', 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_REQUEST) return fail('음성 요청이 너무 깁니다.', 413);
  let model = '';
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_REQUEST) return fail('음성 요청이 너무 깁니다.', 413);
    const body = JSON.parse(new TextDecoder().decode(raw));
    model = typeof body?.model === 'string' ? body.model : '';
    if (!MODELS.has(model)) return fail('지원하지 않는 Typecast 모델입니다.', 400);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 900 || typeof body.voice !== 'string' || !VOICE_ID.test(body.voice)) return fail('대사 또는 Typecast 캐릭터 설정을 확인해 주세요.', 400);
    const acting = body.typecast && typeof body.typecast === 'object' ? body.typecast : {};
    let prompt: Record<string, unknown>;
    if (acting.mode === 'preset' && PRESETS[model].has(acting.preset)) {
      const intensity = Math.max(0, Math.min(2, Number(acting.intensity) || 1));
      prompt = model === 'ssfm-v30' ? { emotion_type: 'preset', emotion_preset: acting.preset, emotion_intensity: intensity } : { emotion_preset: acting.preset, emotion_intensity: intensity };
    } else if (model === 'ssfm-v30') {
      // Context-aware delivery from the neighbouring published lines.
      prompt = { emotion_type: 'smart', ...(clip(acting.previous, 2000) ? { previous_text: clip(acting.previous, 2000) } : {}), ...(clip(acting.next, 2000) ? { next_text: clip(acting.next, 2000) } : {}) };
    } else prompt = { emotion_preset: 'normal', emotion_intensity: 1 };
    const tempo = Math.max(0.5, Math.min(2, Number(acting.tempo) || 1));
    const upstream = await fetch(ENDPOINT, {
      method: 'POST', signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
      headers: { 'X-API-KEY': authorization.slice(7), 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ voice_id: body.voice, text, model, language: 'kor', prompt, output: { audio_format: 'mp3', audio_tempo: tempo } }),
    });
    if (!upstream.ok) {
      const detail = upstream.status === 403 ? await permissionDetail(upstream, [authorization.slice(7), text, clip(acting.previous, 2000), clip(acting.next, 2000)]) : null;
      if (!detail) await upstream.body?.cancel().catch(() => {});
      const message = detail?.code === 'UNUSUAL_ACTIVITY_DETECTED'
        ? 'Typecast가 서버 중계 요청을 이상 활동으로 차단했습니다. 무료 플랜은 여러 사용자가 함께 쓰는 클라우드 주소의 요청을 막을 수 있습니다. 브라우저 직접 연결이 허용되지 않은 환경이라 Typecast 고객지원 문의나 유료 API 플랜이 필요합니다. 자동 음성 요청은 중단되며 저장된 음성은 계속 재생됩니다.'
        : statusMessage(upstream.status) + (detail?.suffix || '');
      return fail(message, upstream.status, model, detail?.code);
    }
    const type = (upstream.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('audio/')) { await upstream.body?.cancel().catch(() => {}); return fail('Typecast 응답 형식을 확인하지 못했습니다.', 502, model); }
    const audio = new Uint8Array(await upstream.arrayBuffer());
    if (!audio.length || audio.length > MAX_AUDIO) return fail('Typecast가 음성을 반환하지 않았습니다.', 502, model);
    const mime = /mpeg|mp3/u.test(type) ? 'audio/mpeg' : 'audio/wav';
    const duration = Number(upstream.headers.get('x-audio-duration')) || null;
    return Response.json({ audioUrl: `data:${mime};base64,${base64Of(audio)}`, model, duration, characters: text.length }, { headers });
  } catch { return fail('Typecast 음성 연결에 실패했습니다. 본문은 계속 읽을 수 있습니다.', 502, model); }
}
