// Typecast voice catalog (GET /v3/voices, official SDK voices_v3) for the
// settings picker. Only display metadata is returned; nothing is stored here.
const ENDPOINT = 'https://api.typecast.ai/v3/voices';
const headers = { 'Cache-Control': 'no-store' };
const fail = (message: string, status: number) => Response.json({ error: { message } }, { status, headers });
type Voice = { voice_id?: unknown; voice_name?: { kor?: unknown; eng?: unknown } | unknown; models?: Array<{ version?: unknown; emotions?: unknown }>; gender?: unknown; age?: unknown; use_cases?: unknown; preview_url?: unknown };
const text = (value: unknown, max = 80) => typeof value === 'string' ? value.slice(0, max) : '';

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer \S{1,512}$/u.test(authorization)) return fail('Typecast API 키를 먼저 입력해 주세요.', 401);
  const model = new URL(request.url).searchParams.get('model') === 'ssfm-v21' ? 'ssfm-v21' : 'ssfm-v30';
  try {
    const upstream = await fetch(`${ENDPOINT}?model=${model}`, { headers: { 'X-API-KEY': authorization.slice(7) }, signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]) });
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      return fail(upstream.status === 401 ? 'Typecast API 키 인증에 실패했습니다. API 대시보드에서 발급한 키를 확인해 주세요.'
        : upstream.status === 403 ? 'Typecast API 사용 권한이 없습니다. API 대시보드에서 계정·이용 권한을 확인해 주세요.'
        : `Typecast 캐릭터 목록 오류 (${upstream.status}).`, upstream.status);
    }
    const payload = (await upstream.json().catch(() => null)) as { voices?: Voice[] } | Voice[] | null;
    const rows: Voice[] = Array.isArray(payload) ? payload : Array.isArray(payload?.voices) ? payload.voices : [];
    const voices = rows.flatMap(row => {
      const id = text(row.voice_id, 80);
      if (!/^[a-z]{2,4}_[A-Za-z0-9]{6,64}$/u.test(id)) return [];
      const name = row.voice_name && typeof row.voice_name === 'object' ? row.voice_name as { kor?: unknown; eng?: unknown } : { kor: row.voice_name };
      const info = (row.models || []).find(item => item?.version === model);
      let preview = text(row.preview_url, 400);
      try { if (preview && new URL(preview).protocol !== 'https:') preview = ''; } catch { preview = ''; }
      return [{ id, name: text(name.kor) || text(name.eng) || id, nameEn: text(name.eng), gender: text(row.gender, 12), age: text(row.age, 20),
        useCases: Array.isArray(row.use_cases) ? row.use_cases.map(value => text(value, 30)).filter(Boolean).slice(0, 6) : [],
        emotions: Array.isArray(info?.emotions) ? info.emotions.map(value => text(value, 20)).filter(Boolean) : [], preview }];
    }).slice(0, 2000);
    return Response.json({ model, voices }, { headers });
  } catch { return fail('Typecast 캐릭터 목록을 불러오지 못했습니다.', 502); }
}
