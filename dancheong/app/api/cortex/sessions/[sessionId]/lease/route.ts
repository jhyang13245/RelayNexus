import { NextResponse } from "next/server";

import { database, requireOwnerKey } from "../../../../../../lib/simulation-store";
import { getCortexCloudSummary } from "../../../../../../lib/cortex-cloud-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };
type LeaseAction = "acquire" | "renew" | "release" | "takeover";
type LeaseRow = { device_id?: string; client_id?: string; takeover_client_id?: string; expires_at?: string; epoch?: string };

const LEASE_TTL_MS = 90_000;
const allowedAction = (value: unknown): LeaseAction | null =>
  value === "acquire" || value === "renew" || value === "release" || value === "takeover" ? value : null;
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request, context: RouteContext) {
  let ownerKey = "";
  try {
    ownerKey = await requireOwnerKey(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "계정 로그인이 필요합니다." },
      { status: 401, headers: noStore },
    );
  }

  try {
    const { sessionId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const action = allowedAction(body.action);
    const clientId = String(body.clientId || "").slice(0, 240);
    const deviceId = String(body.deviceId || "unknown").slice(0, 120);
    if (!sessionId || !action || clientId.length < 12) {
      return NextResponse.json({ error: "세션 사용 잠금 요청이 올바르지 않습니다." }, { status: 400 });
    }

    const db = await database();
    // Read after admission, not before: a former writer may finish its save while
    // we are acquiring. The normal write path still fences revision and epoch.
    const reply = async (lease: Record<string, unknown>) => {
      if (body.includeSession !== true) return NextResponse.json({ lease }, { headers: noStore });
      const session = await getCortexCloudSummary(ownerKey, sessionId);
      return NextResponse.json({ lease, session }, { headers: noStore });
    };
    const nowMs = Date.now(), now = new Date(nowMs).toISOString();
    const current = async () => await db.prepare(
      "SELECT device_id, client_id, takeover_client_id, expires_at, epoch FROM cortex_session_leases WHERE id = ? AND owner_key = ?",
    ).bind(sessionId, ownerKey).first() as LeaseRow | null;

    if (action === "release") {
      const handoff = body.handoff === true;
      // Normal exit allows its already-started final save a short grace period.
      // Handoff is released only after the final save acknowledgement.
      await db.prepare(`UPDATE cortex_session_leases SET expires_at = ?
        WHERE id = ? AND owner_key = ? AND device_id = ? AND epoch = ? AND client_id = ?`)
        .bind(new Date(nowMs + (handoff ? 0 : 15000)).toISOString(), sessionId, ownerKey, deviceId, String(body.epoch || ''), clientId).run();
      return NextResponse.json({ released: true }, { headers: noStore });
    }

    if (action === "takeover") {
      const result = await db.prepare(`UPDATE cortex_session_leases SET
        takeover_client_id = ?, takeover_requested_at = ?, updated_at = ?
        WHERE id = ? AND owner_key = ? AND device_id <> ? AND expires_at > ?`)
        .bind(clientId, now, now, sessionId, ownerKey, deviceId, now).run();
      return NextResponse.json(
        { takeoverRequested: Boolean(result.meta.changes), retryAfterMs: result.meta.changes ? 2_000 : 0 },
        { status: result.meta.changes ? 202 : 200, headers: noStore },
      );
    }

    const expiresAt = new Date(nowMs + LEASE_TTL_MS).toISOString();
    if (action === "renew") {
      const lease = await current();
      if (lease?.device_id === deviceId && lease.takeover_client_id && lease.takeover_client_id !== clientId) {
        return NextResponse.json(
          { error: "다른 기기가 이 세션을 이어받으려 합니다.", code: "CORTEX_TAKEOVER_REQUESTED", lease:{epoch:lease.epoch} },
          { status: 409, headers: noStore },
        );
      }
      const renewed = await db.prepare(`UPDATE cortex_session_leases SET
        client_id = ?, expires_at = ?, updated_at = ?
        WHERE id = ? AND owner_key = ? AND device_id = ? AND takeover_client_id = '' AND epoch = ? AND expires_at > ?
        AND (epoch NOT LIKE 'write:%' OR client_id = ?)`)
        .bind(clientId, expiresAt, now, sessionId, ownerKey, deviceId, String(body.epoch || ''), now,clientId).run();
      if (!renewed.meta.changes) {
        const active = await current();
        if (active?.device_id === deviceId && active.takeover_client_id) {
          return NextResponse.json(
            { error: "다른 기기가 이 세션을 이어받으려 합니다.", code: "CORTEX_TAKEOVER_REQUESTED" },
            { status: 409, headers: noStore },
          );
        }
        return NextResponse.json(
          !active || String(active.expires_at||'')<=now
            ? {error:"세션 사용권을 다시 확인합니다.",code:"CORTEX_LEASE_EXPIRED"}
            : { error: "다른 기기에서 이 세션을 사용 중입니다.", code: "CORTEX_SESSION_IN_USE" },
          { status: 409, headers: noStore },
        );
      }
      return await reply({ expiresAt, ttlMs: LEASE_TTL_MS, epoch:lease?.epoch });
    }

    const [acquired] = await db.batch([db.prepare(`INSERT INTO cortex_session_leases (
      id, owner_key, device_id, client_id, expires_at, updated_at, takeover_client_id, takeover_requested_at, epoch
    ) VALUES (?, ?, ?, ?, ?, ?, '', '', ?)
    ON CONFLICT(id) DO UPDATE SET
      owner_key = excluded.owner_key,
      device_id = excluded.device_id,
      client_id = excluded.client_id,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at,
      takeover_client_id = '',
      takeover_requested_at = ''
      ,epoch = CASE WHEN cortex_session_leases.device_id = excluded.device_id AND cortex_session_leases.expires_at > excluded.updated_at AND cortex_session_leases.epoch <> ''
        AND (excluded.epoch NOT LIKE 'write:%' OR cortex_session_leases.epoch LIKE 'write:%') THEN cortex_session_leases.epoch ELSE excluded.epoch END
    WHERE cortex_session_leases.owner_key = excluded.owner_key
      AND (cortex_session_leases.expires_at <= ? OR
        (cortex_session_leases.device_id = excluded.device_id AND cortex_session_leases.takeover_client_id = ''
          AND (cortex_session_leases.epoch NOT LIKE 'write:%' OR cortex_session_leases.client_id = excluded.client_id)))`)
      .bind(sessionId, ownerKey, deviceId, clientId, expiresAt, now, (body.exclusive===true?'write:':'')+crypto.randomUUID(), now),
      // Freeze a multiplayer copy in the same transaction that admits the solo
      // reader. Neither a later room commit nor lease expiry can overwrite it.
      db.prepare(`UPDATE cortex_cloud_sessions SET last_writer_id='mp-detached'
       WHERE id=? AND owner_key=? AND last_writer_id LIKE 'mp-follow:%'
       AND EXISTS(SELECT 1 FROM cortex_session_leases WHERE id=? AND owner_key=? AND device_id=? AND client_id=? AND expires_at=? AND takeover_client_id='')`)
       .bind(sessionId,ownerKey,sessionId,ownerKey,deviceId,clientId,expiresAt),
    ]);

    if (!acquired.meta.changes) {
      const active = await current();
      if (active?.device_id === deviceId && active.takeover_client_id) {
        return NextResponse.json(
          { error: "다른 기기가 이 세션을 이어받으려 합니다.", code: "CORTEX_TAKEOVER_REQUESTED", lease:{epoch:active.epoch} },
          { status: 409, headers: noStore },
        );
      }
      const retryAfterMs = Math.max(1_000, Math.min(LEASE_TTL_MS, Date.parse(String(active?.expires_at || now)) - nowMs));
      return NextResponse.json(
        active?.device_id===deviceId&&String(active.epoch||'').startsWith('write:')
          ? {error:"같은 기기의 다른 창에서 진행을 저장하는 중입니다. 저장이 끝나면 다시 전송해 주세요.",code:"CORTEX_WRITER_BUSY",retryAfterMs}
          : { error: "다른 기기에서 이 세션을 사용 중입니다.", code: "CORTEX_SESSION_IN_USE", retryAfterMs },
        { status: 409, headers: noStore },
      );
    }

    const active = await current();
    return await reply({ expiresAt, ttlMs: LEASE_TTL_MS, epoch:active?.epoch });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "세션 사용 상태를 확인하지 못했습니다." },
      { status: 500, headers: noStore },
    );
  }
}
