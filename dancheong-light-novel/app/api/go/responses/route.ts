const GO_RESPONSES = 'https://opencode.ai/zen/go/v1/responses';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MODELS = new Set(['muse-spark-1.3-contributor', 'gpt-5.6-luna']);

function failure(message: string, status: number) {
  return Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer \S{1,512}$/u.test(authorization)) return failure('OpenCode Go API 키를 입력해 주세요.', 401);
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) return failure('요청 형식이 올바르지 않습니다.', 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) return failure('요청 크기가 너무 큽니다.', 413);

  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return failure('요청 크기가 너무 큽니다.', 413);
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return failure('요청 형식이 올바르지 않습니다.', 400);
    const body = parsed as Record<string, unknown>;
    if (!ALLOWED_MODELS.has(String(body.model || ''))) return failure('지원하지 않는 OpenCode Go 모델입니다.', 400);
    const prepared: Record<string, unknown> = { ...body, store: false };
    if (body.model === 'muse-spark-1.3-contributor') {
      const reasoning = body.reasoning && typeof body.reasoning === 'object' ? body.reasoning as Record<string, unknown> : {};
      const effort = ['minimal', 'low', 'medium', 'high'].includes(String(reasoning.effort || '')) ? reasoning.effort : 'low';
      prepared.reasoning = { effort };
      const requestedTokens = Number(body.max_output_tokens);
      prepared.max_output_tokens = Math.max(16_384, Number.isFinite(requestedTokens) ? Math.min(131_072, requestedTokens) : 0);
    }
    const session = (request.headers.get('x-opencode-session') || 'dancheong-ln').replace(/[^\w.-]/gu, '').slice(0, 160);
    const upstream = await fetch(GO_RESPONSES, {
      method: 'POST', signal: request.signal,
      headers: { authorization, 'content-type': 'application/json', 'user-agent': 'dancheong-light-novel/1.0', 'x-opencode-session': session || 'dancheong-ln' },
      body: JSON.stringify(prepared),
    });
    return new Response(upstream.body, { status: upstream.status, headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no',
    } });
  } catch {
    return failure('OpenCode Go 연결을 확인해 주세요.', 502);
  }
}
