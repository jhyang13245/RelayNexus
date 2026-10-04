import { NextResponse } from "next/server";

import { writeAuditLog } from "../../../../../../../lib/account-store";
import { syncCostMeterTurns } from "../../../../../../../lib/cost-meter-store";
import type { TurnRecord } from "../../../../../../../lib/scenario";
import {
  compactPreview,
  database,
  getOwnedSession,
  requireOwnerKey,
  toSessionSummary,
} from "../../../../../../../lib/simulation-store";
import {
  createSessionCheckpoint,
  getOwnedSessionCheckpoint,
} from "../../../../../../../lib/session-checkpoint-store";
import {
  deleteRuntimeObject,
  readCheckpointSnapshotText,
  readSessionSnapshotText,
  R2_JSON_POINTER,
  storeRuntimeJson,
} from "../../../../../../../lib/runtime-json-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string; checkpointId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { sessionId, checkpointId } = await context.params;
    const body = (await request.json()) as { expectedRevision?: number; deviceId?: string };
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return NextResponse.json({ error: "복구 전 최신 리비전을 확인해 주세요." }, { status: 400 });
    }
    const [session, checkpoint] = await Promise.all([
      getOwnedSession(ownerKey, sessionId),
      getOwnedSessionCheckpoint(ownerKey, sessionId, checkpointId),
    ]);
    if (!session || !checkpoint) {
      return NextResponse.json({ error: "세션 또는 복구 기록을 찾지 못했습니다." }, { status: 404 });
    }
    if (Number(session.revision ?? 1) !== expectedRevision) {
      return NextResponse.json(
        {
          error: "다른 기기에서 세션이 변경되어 복구를 중단했습니다.",
          code: "SESSION_CONFLICT",
          serverRevision: Number(session.revision ?? 1),
        },
        { status: 409 },
      );
    }

    const restoredSnapshot = JSON.parse(
      await readCheckpointSnapshotText(checkpoint),
    ) as Record<string, unknown>;
    restoredSnapshot.totalCostUsd = Math.max(
      Number(session.total_cost_usd ?? 0),
      Number(restoredSnapshot.totalCostUsd ?? 0),
    );
    const restoredState = restoredSnapshot.state as Record<string, unknown> | undefined;
    if (!restoredState || !Array.isArray(restoredSnapshot.turns)) {
      return NextResponse.json({ error: "복구 기록의 상태 형식이 손상되었습니다." }, { status: 422 });
    }
    await createSessionCheckpoint({
      ownerKey,
      sessionId,
      projectId: String(session.project_id),
      revision: expectedRevision,
      kind: "RESTORE_BACKUP",
      label: `복구 직전 안전 백업 · 턴 ${Number(session.turn ?? 0)}`,
      snapshot: JSON.parse(await readSessionSnapshotText(session)),
      turn: Number(session.turn ?? 0),
      sourceDeviceId: body.deviceId,
    });

    const now = new Date().toISOString();
    const nextRevision = expectedRevision + 1;
    const pointer = await storeRuntimeJson({
      ownerKey,
      projectId: String(session.project_id),
      sessionId,
      category: "revision",
      revision: nextRevision,
      value: restoredSnapshot,
    });
    const result = await (await database()).prepare(`UPDATE simulation_sessions SET
      snapshot_json = ?, snapshot_r2_key = ?, snapshot_sha256 = ?,
      snapshot_byte_length = ?, turn = ?, day = ?, location = ?, preview = ?,
      total_cost_usd = ?, last_mode = ?, revision = revision + 1,
      last_writer_id = ?, updated_at = ?, last_played_at = ?
      WHERE id = ? AND owner_key = ? AND revision = ?`)
      .bind(
        R2_JSON_POINTER,
        pointer.key,
        pointer.sha256,
        pointer.byteLength,
        Number(restoredState.turn ?? 0),
        Number(restoredState.day ?? 0),
        String(restoredState.location ?? "").slice(0, 240),
        compactPreview(restoredSnapshot),
        Number(restoredSnapshot.totalCostUsd ?? 0),
        restoredSnapshot.lastMode === "luna" ? "luna" : "mock",
        String(body.deviceId ?? "unknown").slice(0, 120),
        now,
        now,
        sessionId,
        ownerKey,
        expectedRevision,
      )
      .run();
    if (!result.meta.changes) {
      await deleteRuntimeObject(pointer.key).catch(() => undefined);
      return NextResponse.json(
        { error: "복구 중 세션이 변경되었습니다. 다시 동기화해 주세요.", code: "SESSION_CONFLICT" },
        { status: 409 },
      );
    }
    const sidecarWarnings: string[] = [];
    await syncCostMeterTurns(
      ownerKey,
      String(session.project_id),
      sessionId,
      restoredSnapshot.turns as TurnRecord[],
    ).catch(() => sidecarWarnings.push("비용 장부 재확인 지연"));
    await writeAuditLog("session.checkpoint.restored", "session", sessionId, {
      checkpointId,
      fromRevision: expectedRevision,
      toRevision: nextRevision,
    }).catch(() => sidecarWarnings.push("감사 기록 반영 지연"));
    await deleteRuntimeObject(String(session.snapshot_r2_key ?? ""))
      .catch(() => undefined);
    const updated = {
      ...session,
      snapshot_json: R2_JSON_POINTER,
      snapshot_r2_key: pointer.key,
      snapshot_sha256: pointer.sha256,
      snapshot_byte_length: pointer.byteLength,
      turn: Number(restoredState.turn ?? 0),
      day: Number(restoredState.day ?? 0),
      location: String(restoredState.location ?? "").slice(0, 240),
      preview: compactPreview(restoredSnapshot),
      total_cost_usd: Number(restoredSnapshot.totalCostUsd ?? 0),
      last_mode: restoredSnapshot.lastMode === "luna" ? "luna" : "mock",
      revision: nextRevision,
      last_writer_id: String(body.deviceId ?? "unknown").slice(0, 120),
      updated_at: now,
      last_played_at: now,
    };
    return NextResponse.json({
      session: toSessionSummary(updated),
      snapshot: restoredSnapshot,
      sidecarWarnings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "복구 기록을 적용하지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
