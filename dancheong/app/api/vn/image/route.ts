import {vnAccess} from '../../../../lib/vn/access';
const OPENAI = 'https://api.openai.com/v1';
const PRIMARY = 'gpt-image-2.5-flare';
const FALLBACK = 'gpt-image-2';
const MAX_BYTES = 34 * 1024 * 1024;
const REFERENCE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/u;

function failure(message: string, status: number) {
  return Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

type ImageRequest = { model?: unknown; prompt?: unknown; purpose?: unknown; quality?: unknown; aspect?: unknown; referenceImages?: unknown; strictModel?: unknown; maskImage?: unknown };
type ImageResult = { data?: Array<{ b64_json?: string }>; usage?: unknown; error?: { code?: string; message?: string } };

function modelUnavailable(status: number, result: ImageResult) {
  const code = String(result.error?.code || '').toLowerCase();
  const message = String(result.error?.message || '').toLowerCase();
  return ['model_not_allowed', 'model_not_found', 'organization_verification_required', 'unsupported_model'].includes(code)
    || ([400, 403, 404].includes(status) && /(?:organization must be verified|not (?:allowed|authorized) to use|does not have access to|model .* (?:unavailable|not found))/u.test(message));
}

export async function POST(request: Request) {
  const denied=await vnAccess(request);if(denied)return denied;
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer \S{1,512}$/u.test(authorization)) return failure('이미지 생성용 OpenAI API 키를 입력해 주세요.', 401);
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) return failure('요청 형식이 올바르지 않습니다.', 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) return failure('요청 크기가 너무 큽니다.', 413);
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return failure('요청 크기가 너무 큽니다.', 413);
    const body = JSON.parse(new TextDecoder().decode(bytes)) as ImageRequest;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return failure('요청 형식이 올바르지 않습니다.', 400);
    if (body.model && body.model !== PRIMARY) return failure('지원하지 않는 이미지 모델입니다.', 400);
    if (body.strictModel !== undefined && typeof body.strictModel !== 'boolean') return failure('모델 고정 설정이 올바르지 않습니다.', 400);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < 10 || prompt.length > 16000) return failure('이미지 프롬프트는 10~16,000자여야 합니다.', 400);
    if (body.quality !== undefined && !['low', 'medium'].includes(String(body.quality))) return failure('이미지 품질이 올바르지 않습니다.', 400);
    if (body.purpose !== undefined && !['scene', 'background', 'portrait', 'expression'].includes(String(body.purpose))) return failure('이미지 용도가 올바르지 않습니다.', 400);
    const portrait = body.purpose === 'portrait' || body.purpose === 'expression';
    if (body.aspect !== undefined && body.aspect !== (portrait ? 'portrait' : 'landscape')) return failure('이미지 비율이 올바르지 않습니다.', 400);
    const imageOptions = portrait
      ? { size: '768x1024', output_format: 'png', background: 'transparent' }
      : { size: '1088x608', output_format: 'jpeg', output_compression: 82, background: 'opaque' };
    const quality = body.quality === 'medium' ? 'medium' : 'low';
    const references = body.referenceImages === undefined ? [] : body.referenceImages;
    if (!Array.isArray(references) || references.length > 16) return failure('참조 이미지는 최대 16개까지 사용할 수 있습니다.', 400);
    const imageParts: Array<{ blob: Blob; filename: string }> = [];
    let total = 0;
    for (const [index, dataUrl] of references.entries()) {
      const match = typeof dataUrl === 'string' ? dataUrl.match(REFERENCE) : null;
      if (!match) return failure('참조 이미지 형식이 올바르지 않습니다.', 400);
      const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
      total += bytes.byteLength;
      if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024 || total > 24 * 1024 * 1024) return failure('참조 이미지 용량이 너무 큽니다.', 413);
      imageParts.push({ blob: new Blob([bytes], { type: match[1] }), filename: `reference-${index + 1}.${match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1]}` });
    }
    let maskBlob: Blob | undefined;
    if (body.maskImage !== undefined) {
      const mask = typeof body.maskImage === 'string' ? body.maskImage.match(REFERENCE) : null;
      if (body.purpose !== 'expression' || imageParts.length !== 1 || !mask || mask[1] !== 'image/png' || imageParts[0].blob.type !== 'image/png') return failure('눈·입 마스크 편집에는 PNG 원본 1장과 PNG 마스크가 필요합니다.', 400);
      const data = Uint8Array.from(atob(mask[2]), char => char.charCodeAt(0));
      if (!data.length || data.length > 8 * 1024 * 1024) return failure('마스크 용량이 올바르지 않습니다.', 413);
      const dimensions = (bytes: Uint8Array) => {
        if (bytes.length < 26 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 || bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) return null;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return [view.getUint32(16), view.getUint32(20), bytes[25]];
      };
      const size = dimensions(data), original = dimensions(new Uint8Array(await imageParts[0].blob.arrayBuffer()));
      if (!size || !original || size[0] !== 768 || size[1] !== 1024 || original[0] !== size[0] || original[1] !== size[1] || ![4, 6].includes(size[2])) return failure('원본과 알파 마스크는 768×1024 PNG여야 합니다.', 400);
      maskBlob = new Blob([data], { type: 'image/png' });
    }
    const send = async (model: string) => {
      if (imageParts.length) {
        const form = new FormData();
        for (const [name, value] of Object.entries({ model, prompt, ...imageOptions, quality, moderation: 'auto', n: 1 })) form.append(name, String(value));
        for (const part of imageParts) form.append('image[]', part.blob, part.filename);
        if (maskBlob) form.append('mask', maskBlob, 'face-mask.png');
        return fetch(`${OPENAI}/images/edits`, { method: 'POST', headers: { Authorization: authorization }, body: form, signal: request.signal });
      }
      return fetch(`${OPENAI}/images/generations`, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, ...imageOptions, quality, moderation: 'auto', n: 1 }), signal: request.signal });
    };
    let model = PRIMARY;
    let upstream = await send(model);
    let result = await upstream.json() as ImageResult;
    if (!upstream.ok && body.strictModel !== true && modelUnavailable(upstream.status, result)) {
      model = FALLBACK;
      upstream = await send(model);
      result = await upstream.json() as ImageResult;
    }
    if (!upstream.ok) return failure(result.error?.message || `이미지 API 오류 (${upstream.status})`, upstream.status);
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) return failure('생성된 이미지 데이터를 받지 못했습니다.', 502);
    return Response.json({ imageUrl: `data:image/${portrait ? 'png' : 'jpeg'};base64,${b64}`, model, modelFallback: model !== PRIMARY, usage: result.usage || null, referenceCount: imageParts.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return failure('이미지 생성 연결에 실패했습니다.', 502);
  }
}
