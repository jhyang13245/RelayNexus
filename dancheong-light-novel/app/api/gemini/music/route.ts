// Lyria background-music generation with the visitor's own Gemini API key.
// Request shape: Gemini generateContent with AUDIO+TEXT response modalities
// (google-gemini/cookbook quickstarts/Get_started_Lyria, generate-content
// archive branch). Billing is per generated song, not per token.
const MODELS = new Set(['lyria-3.5', 'lyria-3-clip-preview']);
const endpoint = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const MAX_REQUEST = 16 * 1024;
const MAX_AUDIO_BASE64 = 40 * 1024 * 1024;
type Part = { text?: string; thought?: boolean; inlineData?: { mimeType?: string; data?: string } };
type LyriaResult = { error?: { details?: Array<{ '@type'?: string; reason?: string }> }; promptFeedback?: { blockReason?: string }; candidates?: Array<{ finishReason?: string; content?: { parts?: Part[] } }> };

function failure(message: string, status: number, model = '') {
  return Response.json({ error: { message }, model }, { status, headers: { 'Cache-Control': 'no-store' } });
}
function upstreamFailure(status: number, result: LyriaResult) {
  // Only known reason codes; Google's raw message can echo request data.
  const details = result.error?.details;
  const reasons = Array.isArray(details) ? details.filter(row => row?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo').map(row => row.reason) : [];
  if (reasons.includes('API_KEY_INVALID') || reasons.includes('API_KEY_EXPIRED')) return 'Gemini API 키가 유효하지 않거나 만료되었습니다. 설정에서 키를 다시 입력해 주세요.';
  if (reasons.includes('SERVICE_DISABLED')) return '이 키의 Google 프로젝트에서 Gemini API가 비활성화되어 있습니다.';
  if (status === 429) return 'Gemini 이용 한도에 도달했습니다. Lyria는 무료 등급이 없으므로 결제 설정과 할당량을 확인해 주세요.';
  if ([401, 403].includes(status)) return '이 Gemini API 키로 Lyria 음악 모델을 사용할 수 없습니다. 결제(유료 등급)와 키 제한을 확인해 주세요.';
  if (status === 404) return '이 키에서 Lyria 모델을 찾을 수 없습니다 (404). 지역·프로젝트의 모델 지원 여부를 확인해 주세요.';
  if (status === 400) return 'Lyria 요청이 거부되었습니다 (400). 음악 방향 문구를 줄이거나 바꿔 다시 시도해 주세요.';
  return `Lyria API 오류 (${status}). 잠시 후 직접 다시 시도해 주세요.`;
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer \S{1,512}$/u.test(authorization)) return failure('AI 배경음악에는 Gemini API 키가 필요합니다.', 401);
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) return failure('요청 형식이 올바르지 않습니다.', 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_REQUEST) return failure('요청이 너무 깁니다.', 413);
  let model = '';
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_REQUEST) return failure('요청이 너무 깁니다.', 413);
    const body = JSON.parse(new TextDecoder().decode(bytes));
    model = typeof body?.model === 'string' ? body.model : '';
    if (!MODELS.has(model)) return failure('지원하지 않는 음악 모델입니다.', 400);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < 20 || prompt.length > 6000) return failure('음악 설명은 20~6,000자여야 합니다.', 400);
    const upstream = await fetch(endpoint(model), {
      method: 'POST', signal: AbortSignal.any([request.signal, AbortSignal.timeout(300000)]),
      headers: { 'x-goog-api-key': authorization.slice(7), 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO', 'TEXT'] } }),
    });
    const payload = await upstream.json().catch(() => null);
    const result: LyriaResult = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    if (!upstream.ok) return failure(upstreamFailure(upstream.status, result), upstream.status, model);
    if (result.promptFeedback?.blockReason) return failure('음악 설명이 안전 정책으로 거부되었습니다. 표현을 바꿔 다시 시도해 주세요.', 422, model);
    const parts = result.candidates?.[0]?.content?.parts || [];
    const audio = parts.find(part => !part.thought && part.inlineData?.data && String(part.inlineData.mimeType || '').startsWith('audio/'))?.inlineData;
    if (!audio?.data || !/^audio\/(?:mpeg|mp3|wav|x-wav|ogg|mp4|aac)$/u.test(String(audio.mimeType)) || audio.data.length > MAX_AUDIO_BASE64 || !/^[A-Za-z0-9+/=]+$/u.test(audio.data)) {
      return failure('Lyria가 음원을 반환하지 않았습니다. 설명을 바꿔 다시 시도해 주세요.', 502, model);
    }
    const text = parts.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('\n').slice(0, 4000);
    return Response.json({ audioUrl: `data:${audio.mimeType};base64,${audio.data}`, mimeType: audio.mimeType, model, text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return failure('Lyria 음악 생성 연결에 실패했습니다.', 502, model); }
}
