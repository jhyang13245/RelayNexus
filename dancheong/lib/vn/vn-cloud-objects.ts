import { cloudAccountKey } from './vn-cloud-service';
const MAX = 8 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/u;
type ObjectRow = { digest: string; bytes: number };
type Dependencies = { getUser: () => Promise<{ userId: string; displayName: string } | null>; getBindings: () => { db?: D1Database; bucket?: R2Bucket } };
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
export function objectRows(value: unknown): ObjectRow[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Invalid object list');
  const seen = new Set<string>(); let total = 0;
  for (const row of value) {
    if (!row || !HASH.test(row.hash) || seen.has(row.hash) || !Number.isInteger(row.bytes) || row.bytes <= 0 || row.bytes > MAX) throw new Error('Invalid object');
    seen.add(row.hash); total += row.bytes;
  }
  if (total > 1024 * 1024 * 1024) throw new Error('Object size limit');
  return value.map(row => ({ digest: row.hash, bytes: row.bytes }));
}
export async function missingObjects(db: D1Database, owner: string, rows: ObjectRow[]) {
  const missing: string[] = [];
  for (let i = 0; i < rows.length; i += 80) {
    const batch = rows.slice(i, i + 80);
    const found = await db.prepare(`SELECT digest,bytes FROM vn_cloud_objects WHERE owner=? AND digest IN (${batch.map(() => '?').join(',')})`).bind(owner, ...batch.map(row => row.digest)).all<ObjectRow>();
    const sizes = new Map(found.results.map(row => [row.digest, row.bytes]));
    for (const row of batch) if (sizes.get(row.digest) !== row.bytes) missing.push(row.digest);
  }
  return missing;
}
export function createCloudObjects({ getUser, getBindings }: Dependencies) {
  return async (request: Request, digest?: string): Promise<Response> => {
    try {
      const user = await getUser();
      if (!user) return json({ error: '로그인이 필요합니다.', code: 'AUTH' }, 401);
      const owner = await cloudAccountKey(user.userId);
      if (request.headers.get('X-VN-Account') !== owner) return json({ error: '로그인 계정이 바뀌었습니다.', code: 'ACCOUNT_CHANGED' }, 409);
      const { db, bucket } = getBindings();
      if (!db || !bucket) return json({ error: '클라우드 저장소를 준비하지 못했습니다.' }, 503);
      if (digest && !HASH.test(digest)) return json({ error: '잘못된 파일 주소입니다.' }, 400);
      if (request.method !== 'GET' && (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('X-VN-Cloud') !== '1')) return json({ error: '저장 요청의 출처를 확인하지 못했습니다.' }, 403);
      if (!digest && request.method === 'POST') {
        if (Number(request.headers.get('Content-Length')) > 32000) return json({ error: '파일 목록이 너무 큽니다.' }, 413);
        const input = await request.text();
        if (input.length > 32000) return json({ error: '파일 목록이 너무 큽니다.' }, 413);
        const rows = objectRows(JSON.parse(input));
        if (rows.length > 128) return json({ error: '한 번에 128개까지 조회할 수 있습니다.' }, 400);
        return json({ account: owner, missing: await missingObjects(db, owner, rows) });
      }
      if (!digest) return json({ error: '파일 주소가 필요합니다.' }, 400);
      const key = `vn-cloud/v2/${owner}/objects/${digest}`;
      const row = await db.prepare('SELECT digest,bytes FROM vn_cloud_objects WHERE owner=? AND digest=?').bind(owner, digest).first<ObjectRow>();
      if (request.method === 'GET') {
        if (!row) return json({ error: '클라우드 파일이 없습니다.' }, 404);
        const object = await bucket.get(key);
        if (!object) return json({ error: '클라우드 파일을 읽지 못했습니다.' }, 503);
        return new Response(object.body, { headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': String(row.bytes) } });
      }
      if (request.method !== 'PUT') return json({ error: '지원하지 않는 요청입니다.' }, 405);
      const bytes = Number(request.headers.get('Content-Length'));
      if (!request.body || !Number.isInteger(bytes) || bytes <= 0 || bytes > MAX) return json({ error: '파일 조각은 최대 8 MB입니다.' }, 413);
      if (row) return row.bytes === bytes ? json({ account: owner, stored: true }) : json({ error: '파일 크기가 일치하지 않습니다.' }, 409);
      // R2 checks the hash before the object becomes visible. Registration is
      // last, so interrupted uploads can never complete a save manifest.
      await bucket.put(key, request.body, { sha256: digest, httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'private, no-store' } });
      await db.prepare('INSERT INTO vn_cloud_objects(owner,digest,bytes,created_at) VALUES(?,?,?,?) ON CONFLICT(owner,digest) DO NOTHING').bind(owner, digest, bytes, new Date().toISOString()).run();
      return json({ account: owner, stored: true });
    } catch { return json({ error: '미디어 전송을 완료하지 못했습니다. 이미 전송한 파일은 재사용됩니다.', code: 'UNAVAILABLE' }, 503); }
  };
}
