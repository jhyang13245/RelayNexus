// Host-neutral service: authentication and storage bindings are injected by the
// site's adapter. No dependency on Cortex, a hostname, or the Sites auth module.
import { missingObjects, objectRows } from './vn-cloud-objects';
export const CLOUD_MAX_BYTES = 64 * 1024 * 1024;
const SLOT = /^(?:slot-(?:[1-9]|10|11)|continue-[a-z0-9-]{3,80})$/u;
const UUID = /^[a-f0-9-]{36}$/iu;
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
type User = { userId: string; displayName: string };
type Row = { owner: string; slot: string; revision: string; mutation: string; object_key: string; previous_key: string | null; summary: string; bytes: number; checksum: string; updated_at: string };
type Dependencies = { getUser: () => Promise<User | null>; getBindings: () => { db?: D1Database; bucket?: R2Bucket } };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: privateHeaders });
export async function cloudAccountKey(userId: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vn-cloud-v1:${userId}`));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
function publicRow(row: Row) {
  return { slot: row.slot, revision: row.revision, bytes: row.bytes, checksum: row.checksum, updatedAt: row.updated_at, ...JSON.parse(row.summary) };
}
export function cloudSummary(value: unknown) {
  const s = value as Record<string, unknown>;
  if (!s || typeof s !== "object" || !/^[a-z0-9-]{3,80}$/u.test(String(s.slug || ""))) throw new Error("저장할 작품 정보가 올바르지 않습니다.");
  const cut = (key: string, max: number) => String(s[key] || "").slice(0, max);
  return { slug: cut("slug", 80), title: cut("title", 120), scene: cut("scene", 120), excerpt: cut("excerpt", 180),
    savedAt: cut("savedAt", 40), page: Math.max(0, Math.min(1e7, Number(s.page) || 0)), pageCount: Math.max(0, Math.min(1e7, Number(s.pageCount) || 0)),
    mediaIncluded: s.mediaIncluded === true, format: s.format === 'manifest-v2' ? 'manifest-v2' : s.format === "gzip" ? "gzip" : "json",
    mediaBytes: Math.max(0, Math.min(1024 ** 3, Number(s.mediaBytes) || 0)) };
}
export function createCloudService({ getUser, getBindings }: Dependencies) {
  return async function handle(request: Request, slot?: string): Promise<Response> {
    try {
      const user = await getUser();
      if (!user) return json({ error: "로그인 후 클라우드 저장을 사용할 수 있습니다.", code: "AUTH" }, 401);
      const account = await cloudAccountKey(user.userId), expectedAccount = request.headers.get("X-VN-Account");
      // Reject an operation begun under a different account, including GET/load.
      if ((slot || request.method !== "GET") && expectedAccount !== account) return json({ error: "로그인 계정이 바뀌었습니다. 클라우드 목록을 다시 확인해 주세요.", code: "ACCOUNT_CHANGED" }, 409);
      const { db, bucket } = getBindings();
      if (!db || !bucket) return json({ error: "클라우드 저장소를 준비하지 못했습니다. 기기 저장은 사용할 수 있습니다.", code: "UNAVAILABLE" }, 503);
      if (slot && !SLOT.test(slot)) return json({ error: "잘못된 클라우드 슬롯입니다." }, 400);
      if (request.method === "GET" && !slot) {
        const rows = await db.prepare("SELECT * FROM vn_cloud_slots WHERE owner = ? ORDER BY updated_at DESC").bind(account).all<Row>();
        return json({ account, displayName: user.displayName, slots: rows.results.map(publicRow), maxBytes: CLOUD_MAX_BYTES });
      }
      if (!slot) return json({ error: "슬롯이 필요합니다." }, 400);
      const current = await db.prepare("SELECT * FROM vn_cloud_slots WHERE owner = ? AND slot = ?").bind(account, slot).first<Row>();
      if (request.method === "GET") {
        if (!current) return json({ error: "비어 있는 슬롯입니다." }, 404);
        if (request.headers.get("If-Match") !== current.revision) return json({ error: "다른 기기에서 저장이 바뀌었습니다. 목록을 다시 확인해 주세요.", code: "CONFLICT" }, 409);
        const object = await bucket.get(current.object_key);
        if (!object) return json({ error: "저장 파일을 읽지 못했습니다. 기존 기기 저장은 유지됩니다." }, 503);
        return new Response(object.body, { headers: { ...privateHeaders, "Content-Type": "application/octet-stream", "Content-Length": String(current.bytes), "X-VN-Checksum": current.checksum, "X-VN-Revision": current.revision } });
      }
      if (request.method !== "PUT") return json({ error: "지원하지 않는 요청입니다." }, 405);
      // A same-origin custom header and Origin check prevent form-based CSRF.
      if (request.headers.get("Origin") !== new URL(request.url).origin || request.headers.get("X-VN-Cloud") !== "1") return json({ error: "저장 요청의 출처를 확인하지 못했습니다." }, 403);
      const mutation = request.headers.get("Idempotency-Key") || "", expected = request.headers.get("If-Match");
      if (!UUID.test(mutation) || !expected) return json({ error: "저장 변경 정보가 없습니다." }, 400);
      if (current?.mutation === mutation) return json({ account, slot: publicRow(current), repeated: true });
      if ((current?.revision || "0") !== expected) return json({ error: "다른 기기에서 먼저 저장했습니다. 기존 저장은 덮어쓰지 않았습니다.", code: "CONFLICT", remote: current ? publicRow(current) : null }, 409);
      const bytes = Number(request.headers.get("Content-Length"));
      const checksum = request.headers.get("X-VN-Checksum") || "";
      if (!request.body || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > CLOUD_MAX_BYTES || !/^[a-f0-9]{64}$/u.test(checksum)) return json({ error: "클라우드 파일은 최대 64 MB입니다. 파일 백업을 사용하거나 생성 미디어 포함을 꺼 주세요." }, 413);
      let summary;
      try { summary = cloudSummary(JSON.parse(decodeURIComponent(request.headers.get("X-VN-Summary") || ""))); }
      catch { return json({ error: "저장 요약 정보가 올바르지 않습니다." }, 400); }
      let body: ReadableStream | ArrayBuffer = request.body;
      if (summary.format === 'manifest-v2') {
        if (bytes > 4 * 1024 * 1024) return json({ error: '클라우드 목차가 너무 큽니다.' }, 413);
        body = await request.arrayBuffer();
        const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)), n => n.toString(16).padStart(2, '0')).join('');
        if (body.byteLength !== bytes || actual !== checksum) return json({ error: '클라우드 목차가 손상되었습니다.' }, 400);
        try {
          const manifest = JSON.parse(new TextDecoder().decode(body));
          if (manifest.schema !== 'DANCHEONG_VN_CLOUD_V2' || !manifest.record || !manifest.costs || !Array.isArray(manifest.assets)) throw new Error('manifest');
          const rows = objectRows(manifest.objects);
          if ((await missingObjects(db, account, rows)).length) return json({ error: '미디어 전송이 아직 끝나지 않았습니다. 이전 저장은 유지됩니다.', code: 'MISSING_OBJECTS' }, 409);
          summary.mediaBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
        } catch { return json({ error: '클라우드 목차가 올바르지 않습니다.' }, 400); }
      }
      // Bound automatic continue records without restricting the ten save slots.
      if (!current && slot.startsWith("continue-")) {
        const count = await db.prepare("SELECT count(*) AS n FROM vn_cloud_slots WHERE owner = ? AND slot LIKE 'continue-%'").bind(account).first<{ n: number }>();
        if ((count?.n || 0) >= 40) return json({ error: "클라우드 이어하기는 최대 40개 작품입니다. 번호 슬롯을 이용해 주세요." }, 409);
      }
      const revision = crypto.randomUUID(), key = `vn-cloud/v1/${account}/${slot}/${revision}`, updatedAt = new Date().toISOString();
      // Stream directly into private storage. R2 validates the SHA-256; no large
      // compressed/uncompressed archive is materialized in Worker memory.
      await bucket.put(key, body, { sha256: checksum, httpMetadata: { contentType: "application/octet-stream", cacheControl: "private, no-store" } });
      let saved: Row | null;
      try {
        saved = await db.prepare(`INSERT INTO vn_cloud_slots (owner,slot,revision,mutation,object_key,previous_key,summary,bytes,checksum,updated_at)
          VALUES (?,?,?,?,?,NULL,?,?,?,?) ON CONFLICT(owner,slot) DO UPDATE SET
          previous_key=vn_cloud_slots.object_key, object_key=excluded.object_key, revision=excluded.revision,
          mutation=excluded.mutation, summary=excluded.summary, bytes=excluded.bytes, checksum=excluded.checksum, updated_at=excluded.updated_at
          WHERE vn_cloud_slots.revision = ? RETURNING *`).bind(account, slot, revision, mutation, key, JSON.stringify(summary), bytes, checksum, updatedAt, expected).first<Row>();
      } catch (error) {
        // The commit may have succeeded even if its response was lost. Retain
        // the immutable payload until the committed revision is known.
        const latest = await db.prepare("SELECT * FROM vn_cloud_slots WHERE owner = ? AND slot = ?").bind(account, slot).first<Row>().catch(() => null);
        if (latest?.mutation === mutation) return json({ account, slot: publicRow(latest), repeated: true });
        throw error;
      }
      if (!saved) {
        await bucket.delete(key).catch(() => {});
        const latest = await db.prepare("SELECT * FROM vn_cloud_slots WHERE owner = ? AND slot = ?").bind(account, slot).first<Row>();
        if (latest?.mutation === mutation) return json({ account, slot: publicRow(latest), repeated: true });
        return json({ error: "다른 기기에서 먼저 저장했습니다. 목록을 다시 확인해 주세요.", code: "CONFLICT" }, 409);
      }
      // Retain the immediately previous payload; retire only the older backup.
      if (current?.previous_key) await bucket.delete(current.previous_key).catch(() => {});
      return json({ account, slot: publicRow(saved) });
    } catch { return json({ error: "클라우드 요청을 완료하지 못했습니다. 기기 저장은 유지됩니다. 목록에서 저장 결과를 확인한 뒤 다시 시도해 주세요.", code: "UNAVAILABLE" }, 503); }
  };
}
