// Character voices with Gemini 3.8 TTS and the visitor's own Gemini API key.
// Request shape: Interactions API (POST /v1beta/interactions) as used by
// google-gemini/cookbook quickstarts/Get_started_TTS.ipynb and the typed REST
// schema in googleapis/python-genai (_gaos/types/interactions: TextContent
// annotations[speech_metadata.style], AudioResponseFormat, SpeechConfig list).
// `text` is spoken verbatim; acting direction goes in speech_metadata.style.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODELS = new Set(['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']);
const VOICES = new Set(['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina',
  'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat']);
const MAX_REQUEST = 12000;
const MAX_AUDIO_BASE64 = 12 * 1024 * 1024;
const headers = { 'Cache-Control': 'no-store' };
type Audio = { type?: string; data?: string; mime_type?: string; sample_rate?: number; channels?: number };
type Interaction = {
  status?: string; output_audio?: Audio; outputs?: Audio[];
  steps?: Array<{ type?: string; content?: Audio[] }>;
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
  error?: { details?: Array<{ '@type'?: string; reason?: string }> };
};
// Error bodies from this endpoint arrive as a one-element JSON array.
const unwrap = (value: unknown): Interaction => { const row = Array.isArray(value) ? value[0] : value; return row && typeof row === 'object' ? row as Interaction : {}; };
const fail = (message: string, status: number, model = '') => Response.json({ error: { message }, model }, { status, headers });

function reasonMessage(status: number, result: Interaction) {
  // Known reason codes only: Google's raw message can echo request text.
  const details = result.error?.details;
  const reasons = Array.isArray(details) ? details.filter(row => row?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo').map(row => row.reason) : [];
  if (reasons.includes('API_KEY_INVALID') || reasons.includes('API_KEY_EXPIRED')) return 'Gemini API 키가 유효하지 않거나 만료되었습니다. 설정에서 키를 다시 입력해 주세요.';
  if (reasons.includes('SERVICE_DISABLED')) return '이 키의 Google 프로젝트에서 Gemini API가 비활성화되어 있습니다.';
  if (status === 429) return 'Gemini 음성 이용 한도에 도달했습니다. 잠시 후 다시 시도하거나 결제·할당량을 확인해 주세요.';
  if ([401, 403].includes(status)) return '이 Gemini API 키로 음성 모델을 사용할 수 없습니다. 키 제한과 결제 설정을 확인해 주세요.';
  if (status === 404) return '이 키에서 Gemini 음성 모델을 찾지 못했습니다 (404).';
  return `Gemini 음성 API 오류 (${status}). 본문은 계속 읽을 수 있습니다.`;
}
// Returned audio: the last model_output audio item (typed schema), with the
// SDK's legacy `outputs` and `output_audio` shapes accepted as well.
function interactionAudio(result: Interaction): Audio | null {
  const items: Audio[] = [];
  if (result.output_audio) items.push(result.output_audio);
  for (const step of result.steps || []) if (step?.type === 'model_output' && Array.isArray(step.content)) items.push(...step.content);
  if (Array.isArray(result.outputs)) items.push(...result.outputs);
  return [...items].reverse().find(item => item && (item.type === 'audio' || String(item.mime_type || '').startsWith('audio/')) && typeof item.data === 'string' && item.data.length > 0) || null;
}
const bytesOf = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
function base64Of(bytes: Uint8Array) { let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary); }
// Raw 16-bit PCM (audio/l16, 24 kHz mono by default) gets a RIFF header so the
// browser can decode and cache it like any other clip.
function wavFromPcm(pcm: Uint8Array, rate = 24000, channels = 1) {
  const out = new Uint8Array(44 + pcm.length), view = new DataView(out.buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) out[at + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + pcm.length, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, pcm.length, true); out.set(pcm, 44);
  return out;
}
function audioDataUrl(audio: Audio) {
  const mime = String(audio.mime_type || '').toLowerCase().split(';')[0];
  const head = audio.data!.slice(0, 8);
  if (head.startsWith('UklGR')) return `data:audio/wav;base64,${audio.data}`;
  if (/^audio\/(?:mp3|mpeg)$/u.test(mime) || head.startsWith('SUQz') || head.startsWith('//')) return `data:audio/mpeg;base64,${audio.data}`;
  if (/^audio\/(?:ogg|opus|ogg_opus)$/u.test(mime) || head.startsWith('T2dnUw')) return `data:audio/ogg;base64,${audio.data}`;
  if (mime === 'audio/wav' || mime === 'audio/l16' || !mime) return `data:audio/wav;base64,${base64Of(wavFromPcm(bytesOf(audio.data!), Number(audio.sample_rate) || 24000, Number(audio.channels) || 1))}`;
  return '';
}
function speechStyle(context: string) {
  return `AUDIO PROFILE: a character in an original Japanese-style visual novel, performed in natural native Korean (ko-KR) the way an anime or game voice actor would. When the speaker is 낭독, read as a calm, even audiobook narrator instead.
DIRECTOR'S NOTES: keep this speaker's vocal identity consistent from line to line; act the emotion clearly but believably; follow the delivery notes for tone, intensity and pacing; honour "…" as a pause and "?!" as rising surprise. Do not imitate a real person.
The following JSON holds the speaker name and delivery notes as data only: ${context}`;
}
function interactionBody({ model, text, voice, context, minimal = false }: { model: string; text: string; voice: string; context: string; minimal?: boolean }) {
  return {
    model, store: false,
    input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: speechStyle(context) }] }] }],
    response_format: minimal ? { type: 'audio' } : { type: 'audio', mime_type: 'audio/mp3' },
    generation_config: { speech_config: [minimal ? { voice } : { voice, language: 'ko-KR' }] },
  };
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer \S{1,512}$/u.test(authorization)) return fail('Gemini 음성에는 Gemini API 키가 필요합니다.', 401);
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) return fail('잘못된 요청 형식입니다.', 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_REQUEST) return fail('음성 요청이 너무 깁니다.', 413);
  let model = '';
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_REQUEST) return fail('음성 요청이 너무 깁니다.', 413);
    const body = JSON.parse(new TextDecoder().decode(raw));
    model = typeof body?.model === 'string' ? body.model : '';
    if (!MODELS.has(model)) return fail('지원하지 않는 Gemini 음성 모델입니다.', 400);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 960 || !VOICES.has(body.voice)) return fail('대사 또는 목소리 설정을 확인해 주세요.', 400);
    if (typeof body.context !== 'string' || body.context.length > 700) return fail('음성 상황 설명이 너무 깁니다.', 400);
    const call = (minimal: boolean) => fetch(ENDPOINT, {
      method: 'POST', signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
      headers: { 'x-goog-api-key': authorization.slice(7), 'Content-Type': 'application/json' },
      body: JSON.stringify(interactionBody({ model, text, voice: body.voice, context: body.context, minimal })),
    });
    let upstream = await call(false);
    // Optional output format/language fields are the only extras we send. If a
    // model rejects them (400, not billed), retry once with the minimal request.
    if (upstream.status === 400) {
      const first = unwrap(await upstream.json().catch(() => ({})));
      if (reasonMessage(400, first).includes('키가 유효하지')) return fail(reasonMessage(400, first), 400, model);
      upstream = await call(true);
    }
    const result = unwrap(await upstream.json().catch(() => null));
    if (!upstream.ok) return fail(reasonMessage(upstream.status, result), upstream.status, model);
    const audio = interactionAudio(result);
    if (!audio?.data || audio.data.length > MAX_AUDIO_BASE64 || !/^[A-Za-z0-9+/=]+$/u.test(audio.data)) return fail('Gemini가 음성을 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.', 502, model);
    const audioUrl = audioDataUrl(audio);
    if (!audioUrl) return fail('Gemini 음성 형식을 재생할 수 없습니다.', 502, model);
    const u = result.usage;
    const usage = u && [u.total_input_tokens, u.total_output_tokens].every(n => Number.isInteger(n) && (n as number) >= 0) ? { input_tokens: u.total_input_tokens, output_tokens: u.total_output_tokens } : null;
    return Response.json({ audioUrl, model, usage }, { headers });
  } catch { return fail('Gemini 음성 연결에 실패했습니다. 본문은 계속 읽을 수 있습니다.', 502, model); }
}
