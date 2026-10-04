import { requireAccountContext } from '../../../../lib/account-store';
import { prepareGoResponsesRequest, TEXT_PROVIDERS } from '../../../../lib/text-provider';

export const runtime = 'nodejs';
// Fixed upstream only. Never accept a caller-supplied URL or fall back to a server key.
export async function POST(request: Request) {
  try {
    await requireAccountContext();
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer \S{1,512}$/.test(authorization)) return Response.json({ error: { message: 'OpenCode Go API 키를 입력해 주세요.' } }, { status: 400 });
    let body;
    try { body = prepareGoResponsesRequest(await request.json()); }
    catch { return Response.json({ error: { message: '지원하지 않는 OpenCode Go 모델 또는 요청 형식입니다.' } }, { status: 400 }); }
    const upstream = await fetch(`${TEXT_PROVIDERS['opencode-go'].baseUrl}/responses`, {
      method: 'POST', signal: request.signal,
      headers: { authorization, 'content-type': 'application/json', 'user-agent': 'dancheong/1.21',
        'x-opencode-session': (request.headers.get('x-opencode-session') || 'dancheong').slice(0, 160) },
      body: JSON.stringify(body),
    });
    return new Response(upstream.body, { status: upstream.status, headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no',
    } });
  } catch {
    return Response.json({ error: { message: 'OpenCode Go 연결을 확인해 주세요. 로그인·네트워크·Go 이용 한도를 확인해 주세요.' } }, { status: 502 });
  }
}
