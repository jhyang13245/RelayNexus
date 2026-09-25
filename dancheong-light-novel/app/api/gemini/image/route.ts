const MODEL = 'gemini-3.1-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent`;
const MAX_BYTES = 26 * 1024 * 1024;
const REFERENCE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/u;
const mattes: Record<string, string> = { green: '#00ff00', magenta: '#ff00ff', blue: '#0000ff' };
type Usage = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; candidatesTokensDetails?: Array<{ modality?: string; tokenCount?: number }> };
type GeminiResult = { usageMetadata?: Usage; candidates?: Array<{ content?: { parts?: Array<{ thought?: boolean; inlineData?: { mimeType: string; data: string } }> } }> };
function numeric(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
export function normalizeUsage(value?: Usage) {
  if (!value || !numeric(value.promptTokenCount) || !numeric(value.candidatesTokenCount)) return null;
  const image = value.candidatesTokensDetails?.filter(row => row.modality === 'IMAGE');
  const imageTokens = image?.length && image.every(row => numeric(row.tokenCount)) ? image.reduce((n, row) => n + row.tokenCount!, 0) : undefined;
  const thinking = numeric(value.thoughtsTokenCount) ? value.thoughtsTokenCount : 0;
  return { input_tokens: value.promptTokenCount, output_tokens: value.candidatesTokenCount + thinking,
    output_tokens_details: { ...(imageTokens !== undefined ? { image_tokens: imageTokens } : {}), reasoning_tokens: thinking } };
}
function failure(message: string, status: number, usage?: unknown) {
  return Response.json({ error: { message }, model: MODEL, usage: usage || null }, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer \S{1,512}$/u.test(authorization)) return failure('Nano Banana 2용 Gemini API 키를 입력해 주세요.', 401);
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) return failure('요청 형식이 올바르지 않습니다.', 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) return failure('요청 크기가 너무 큽니다.', 413);
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return failure('요청 크기가 너무 큽니다.', 413);
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return failure('요청 형식이 올바르지 않습니다.', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return failure('요청 형식이 올바르지 않습니다.', 400);
    if (body.model && body.model !== MODEL) return failure('지원하지 않는 이미지 모델입니다.', 400);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < 10 || prompt.length > 16000) return failure('이미지 프롬프트는 10~16,000자여야 합니다.', 400);
    if (body.quality !== undefined && !['low', 'medium'].includes(body.quality)) return failure('이미지 품질이 올바르지 않습니다.', 400);
    if (body.purpose !== undefined && !['scene', 'background', 'portrait', 'expression'].includes(body.purpose)) return failure('이미지 용도가 올바르지 않습니다.', 400);
    const portrait = body.purpose === 'portrait' || body.purpose === 'expression';
    if (body.aspect !== undefined && body.aspect !== (portrait ? 'portrait' : 'landscape')) return failure('이미지 비율이 올바르지 않습니다.', 400);
    const matte = body.matteColor || 'green';
    if (typeof matte !== 'string' || !Object.hasOwn(mattes, matte)) return failure('인물 배경색이 올바르지 않습니다.', 400);
    const references = body.referenceImages === undefined ? [] : body.referenceImages;
    if (!Array.isArray(references) || references.length > 14) return failure('Nano Banana 2 참조 이미지는 최대 14개입니다.', 400);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    let total = 0;
    for (const url of references) {
      const match = typeof url === 'string' ? url.match(REFERENCE) : null;
      if (!match) return failure('참조 이미지 형식이 올바르지 않습니다.', 400);
      let size; try { size = atob(match[2]).length; } catch { return failure('참조 이미지 형식이 올바르지 않습니다.', 400); }
      total += size;
      if (!size || size > 8 * 1024 * 1024 || total > 18 * 1024 * 1024) return failure('참조 이미지 용량이 너무 큽니다.', 413);
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
    const instructions = portrait ? `${prompt.replace(/(?:fully )?transparent background/giu, 'solid chroma-key background').replace(/, colored backdrop/giu, '')}\nOUTPUT BACKGROUND REQUIREMENT: Fill every pixel outside the person, including gaps between limbs, with perfectly uniform ${mattes[matte]} (${matte}), for later removal. No gradient, shadows, texture, checkerboard or transparency grid. Do not use this matte color on the person. Preserve reference identity, costume and framing. Output one image.` : prompt;
    parts.push({ text: instructions });
    const imageSize = body.quality === 'medium' ? '2K' : '1K';
    const upstream = await fetch(ENDPOINT, { method: 'POST', signal: request.signal,
      headers: { 'x-goog-api-key': authorization.slice(7), 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], responseFormat: { image: { aspectRatio: portrait ? '3:4' : '16:9', imageSize } } } }) });
    const result = await upstream.json() as GeminiResult;
    const usage = normalizeUsage(result.usageMetadata);
    if (!upstream.ok) {
      const message = upstream.status === 429 ? 'Gemini 이용 한도에 도달했습니다. Google AI Studio의 할당량과 결제를 확인해 주세요.' : [401, 403].includes(upstream.status) ? 'Gemini API 키의 이미지 모델 권한과 결제 설정을 확인해 주세요.' : `Nano Banana 2 API 오류 (${upstream.status}). 잠시 후 직접 재시도해 주세요.`;
      return failure(message, upstream.status, usage);
    }
    const image = result.candidates?.[0]?.content?.parts?.find((part: { thought?: boolean; inlineData?: { mimeType?: string; data?: string } }) => !part.thought && part.inlineData?.data)?.inlineData;
    if (!image || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) || typeof image.data !== 'string' || !/^[A-Za-z0-9+/=]+$/u.test(image.data)) return failure('Nano Banana 2가 이미지를 반환하지 않았습니다. 장면 내용 또는 참조 이미지를 확인해 주세요.', 502, usage);
    return Response.json({ imageUrl: `data:${image.mimeType};base64,${image.data}`, model: MODEL, usage, referenceCount: references.length, imageSize, ...(portrait ? { matteColor: matte } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return failure('Nano Banana 2 이미지 생성 연결에 실패했습니다.', 502); }
}
