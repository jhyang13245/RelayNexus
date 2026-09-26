const MODEL = 'gemini-3.1-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent`;
const MAX_BYTES = 26 * 1024 * 1024;
const REFERENCE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/u;
const mattes: Record<string, string> = { green: '#00ff00', magenta: '#ff00ff', blue: '#0000ff' };
type Usage = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; candidatesTokensDetails?: Array<{ modality?: string; tokenCount?: number }> };
type GeminiResult = { error?: { status?: string; details?: Array<{ '@type'?: string; reason?: string }> }; usageMetadata?: Usage; candidates?: Array<{ content?: { parts?: Array<{ thought?: boolean; inlineData?: { mimeType: string; data: string } }> } }> };
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
function upstreamFailure(status: number, result: GeminiResult) {
  // Classify only known reason codes. Never return Google's raw message/details:
  // they can echo request data, project identifiers or credentials.
  const details = result.error?.details;
  const reasons = Array.isArray(details) ? details.filter(row => row?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo').map(row => row.reason) : [];
  if (reasons.includes('API_KEY_INVALID') || reasons.includes('API_KEY_EXPIRED')) return 'Gemini API 키가 유효하지 않거나 만료되었습니다. Google AI Studio의 키를 설정에서 다시 입력해 주세요.';
  if (reasons.includes('SERVICE_DISABLED')) return '이 키의 Google 프로젝트에서 Gemini API가 비활성화되어 있습니다. Google AI Studio의 프로젝트 설정을 확인해 주세요.';
  if (status === 429) return 'Gemini 이용 한도에 도달했습니다. Google AI Studio의 할당량과 결제를 확인해 주세요.';
  if ([401, 403].includes(status)) return 'Gemini API 키의 이미지 모델 권한, 키 제한 및 결제 설정을 확인해 주세요.';
  if (status === 400) return 'Nano Banana 2 요청 형식 또는 참조 이미지가 거부되었습니다 (400). 사이트를 새로고침한 뒤 다시 시도해 주세요. 반복되면 개발자에게 알려 주세요.';
  if (status === 404) return '이 Gemini API 키에서 Nano Banana 2 모델을 찾을 수 없습니다 (404). 모델 지원 여부와 프로젝트를 확인해 주세요.';
  return `Nano Banana 2 API 오류 (${status}). 잠시 후 직접 재시도해 주세요.`;
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
    if (body.maskImage !== undefined) return failure('픽셀 마스크 눈·입 편집은 OpenAI 인물 모델에서만 지원합니다.', 400);
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
    const instructions = portrait ? `${prompt.replace(/(?:fully )?transparent background/giu, 'solid chroma-key background').replace(/, colored backdrop/giu, '')}\nOUTPUT BACKGROUND REQUIREMENT: Fill every pixel outside the person, including gaps between limbs, with perfectly uniform ${mattes[matte]} (${matte}), for later removal. No gradient, shadows, texture, checkerboard or transparency grid. The matte is a flat separation layer, not a light source: no reflected matte colour, coloured rim light, glow, outline or colour spill on hair, skin, clothes or fine strands. Use the character's own natural lineart colours right up to the silhouette, with clean fine detail and a crisp separation from the matte. Do not use this matte color on the person. Preserve the target character identity and requested framing. Follow the current wardrobe specified in the prompt; default reference clothes must not override an explicitly requested outfit change. For an expression-only image, preserve the matching outfit shown in its reference. Output one image.` : prompt;
    parts.push({ text: instructions });
    // Spend detail on faces and event art; environment plates can be smaller.
    const imageSize = body.quality === 'medium' ? '2K' : body.purpose === 'background' ? '0.5K' : '1K';
    const upstream = await fetch(ENDPOINT, { method: 'POST', signal: request.signal,
      headers: { 'x-goog-api-key': authorization.slice(7), 'Content-Type': 'application/json' },
      // responseFormat uses REST enum names, unlike legacy imageConfig strings.
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: {
        candidateCount: 1, responseModalities: ['IMAGE'], thinkingConfig: { thinkingLevel: 'MINIMAL', includeThoughts: false },
        responseFormat: { image: { aspectRatio: portrait ? 'ASPECT_RATIO_THREE_BY_FOUR' : 'ASPECT_RATIO_SIXTEEN_BY_NINE',
          imageSize: imageSize === '2K' ? 'IMAGE_SIZE_TWO_K' : imageSize === '0.5K' ? 'IMAGE_SIZE_FIVE_TWELVE' : 'IMAGE_SIZE_ONE_K' } },
      } }) });
    const payload = await upstream.json().catch(() => null);
    const result: GeminiResult = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const usage = normalizeUsage(result.usageMetadata);
    if (!upstream.ok) {
      return failure(upstreamFailure(upstream.status, result), upstream.status, usage);
    }
    const image = result.candidates?.[0]?.content?.parts?.find((part: { thought?: boolean; inlineData?: { mimeType?: string; data?: string } }) => !part.thought && part.inlineData?.data)?.inlineData;
    if (!image || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) || typeof image.data !== 'string' || !/^[A-Za-z0-9+/=]+$/u.test(image.data)) return failure('Nano Banana 2가 이미지를 반환하지 않았습니다. 장면 내용 또는 참조 이미지를 확인해 주세요.', 502, usage);
    return Response.json({ imageUrl: `data:${image.mimeType};base64,${image.data}`, model: MODEL, usage, referenceCount: references.length, imageSize, ...(portrait ? { matteColor: matte } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return failure('Nano Banana 2 이미지 생성 연결에 실패했습니다.', 502); }
}
