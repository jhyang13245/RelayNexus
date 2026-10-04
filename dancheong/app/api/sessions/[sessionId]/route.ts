import { NextResponse } from "next/server";

import { optimizeConversationSnapshot } from "../../../../lib/conversation-memory";
import { syncCostMeterTurns } from "../../../../lib/cost-meter-store";
import type {
  LongTermMemoryRecord,
  TurnRecord,
} from "../../../../lib/scenario";
import {
  compactPreview,
  database,
  getOwnedProject,
  getOwnedSession,
  requireOwnerKey,
  safeJsonText,
  toProjectSummary,
  toSessionSummary,
} from "../../../../lib/simulation-store";
import { writeAuditLog } from "../../../../lib/account-store";
import { createSessionCheckpoint } from "../../../../lib/session-checkpoint-store";
import {
  deleteSessionRuntimeObjects,
  deleteRuntimeObject,
  readSessionSnapshotText,
  R2_JSON_POINTER,
  runtimeJsonDigest,
  storeRuntimeJson,
} from "../../../../lib/runtime-json-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { sessionId } = await context.params;
    const session = await getOwnedSession(ownerKey, sessionId);
    if (!session) {
      return NextResponse.json({ error: "세션을 찾지 못했습니다." }, { status: 404 });
    }
    const project = await getOwnedProject(ownerKey, String(session.project_id));
    if (!project) {
      return NextResponse.json({ error: "작품을 찾지 못했습니다." }, { status: 404 });
    }
    // PUT/auto-save already stores an optimized snapshot. Re-optimizing a full
    // conversation on every selection delays the first byte of the chat.
    const snapshot = JSON.parse(await readSessionSnapshotText(session)) as {
      turns: TurnRecord[];
      longTermMemories?: LongTermMemoryRecord[];
    };
    return NextResponse.json(
      {
        session: toSessionSummary(session),
        project: toProjectSummary({ ...project, session_count: 0 }),
        snapshot,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "세션을 불러오지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { sessionId } = await context.params;
    const existing = await getOwnedSession(ownerKey, sessionId);
    if (!existing) {
      return NextResponse.json({ error: "세션을 찾지 못했습니다." }, { status: 404 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const expectedRevision = Number(body.expectedRevision);
    const deviceId = String(body.deviceId ?? "unknown").slice(0, 120);
    const rawSnapshot = (body.snapshot ?? body) as Record<string, unknown>;
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return NextResponse.json(
        {
          error: "최신 세션 리비전이 없어 저장을 중단했습니다. 세션을 즉시 새로고침해 주세요.",
          code: "SESSION_REVISION_REQUIRED",
          serverRevision: Number(existing.revision ?? 1),
        },
        { status: 428, headers: { "Cache-Control": "no-store" } },
      );
    }
    const state = rawSnapshot.state as Record<string, unknown> | undefined;
    if (!state || !Array.isArray(rawSnapshot.turns)) {
      return NextResponse.json({ error: "세션 상태 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const snapshot = optimizeConversationSnapshot(rawSnapshot as unknown as {
      turns: TurnRecord[];
      longTermMemories?: LongTermMemoryRecord[];
      state: Record<string, unknown>;
      totalCostUsd?: number;
      lastMode?: "mock" | "luna";
    });
    const snapshotJson = safeJsonText(snapshot, 48 * 1024 * 1024);
    const digest = await runtimeJsonDigest(snapshotJson);
    if (
      String(existing.snapshot_sha256 ?? "") === digest.sha256 &&
      Number(existing.snapshot_byte_length ?? 0) === digest.byteLength
    ) {
      return NextResponse.json(
        { session: toSessionSummary(existing), unchanged: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const now = new Date().toISOString();
    const db = await database();
    const nextRevision = expectedRevision + 1;
    const pointer = await storeRuntimeJson({
      ownerKey,
      projectId: String(existing.project_id),
      sessionId,
      category: "revision",
      revision: nextRevision,
      value: snapshotJson,
    });
    const updateResult = await db.prepare(`UPDATE simulation_sessions SET
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
          Number(state.turn ?? 0),
          Number(state.day ?? 0),
          String(state.location ?? "").slice(0, 240),
          compactPreview(snapshot),
          Number(snapshot.totalCostUsd ?? 0),
          snapshot.lastMode === "luna" ? "luna" : "mock",
          deviceId,
          now,
          now,
          sessionId,
          ownerKey,
          expectedRevision,
        )
        .run();
    if (!updateResult.meta.changes) {
      await deleteRuntimeObject(pointer.key).catch(() => undefined);
      const current = await getOwnedSession(ownerKey, sessionId).catch(() => null);
      let conflictCheckpointId: string | null = null;
      try {
        const conflictCheckpoint = await createSessionCheckpoint({
          ownerKey,
          sessionId,
          projectId: String(existing.project_id),
          revision: expectedRevision,
          kind: "CONFLICT",
          label: `기기 충돌로 보존한 로컬 초안 · 턴 ${Number(state.turn ?? 0)}`,
          snapshot,
          turn: Number(state.turn ?? 0),
          sourceDeviceId: deviceId,
        });
        conflictCheckpointId = conflictCheckpoint.id;
      } catch {
        // The browser still retains the unsaved draft locally. A failed
        // recovery sidecar must not mask the authoritative 409 response.
      }
      await writeAuditLog("session.conflict", "session", sessionId, {
        expectedRevision,
        serverRevision: Number(current?.revision ?? 1),
        deviceId,
      }).catch(() => undefined);
      return NextResponse.json(
        {
          error: "다른 기기에서 이 세션이 먼저 변경되었습니다. 로컬 초안은 복구 기록에 보존했습니다.",
          code: "SESSION_CONFLICT",
          serverRevision: Number(current?.revision ?? 1),
          session: current ? toSessionSummary(current) : null,
          conflictCheckpointId,
          draftPreserved: Boolean(conflictCheckpointId),
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const sidecarWarnings: string[] = [];
    await db.prepare(
      "UPDATE scenario_projects SET updated_at = ? WHERE id = ? AND owner_key = ?",
    ).bind(now, String(existing.project_id), ownerKey).run()
      .catch(() => sidecarWarnings.push("작품 최근 사용 시각 갱신 지연"));
    await syncCostMeterTurns(
      ownerKey,
      String(existing.project_id),
      sessionId,
      snapshot.turns,
    ).catch(() => sidecarWarnings.push("비용 장부 반영 지연"));
    const previousTurn = Number(existing.turn ?? 0);
    const nextTurn = Number(state.turn ?? 0);
    if (nextTurn > previousTurn && (nextTurn % 5 === 0 || previousTurn === 0)) {
      await createSessionCheckpoint({
        ownerKey,
        sessionId,
        projectId: String(existing.project_id),
        revision: nextRevision,
        kind: "AUTO",
        label: `자동 복구 지점 · 턴 ${nextTurn}`,
        snapshot,
        turn: nextTurn,
        sourceDeviceId: deviceId,
      }).catch(() => sidecarWarnings.push("자동 복구 지점 생성 지연"));
    }
    await deleteRuntimeObject(String(existing.snapshot_r2_key ?? ""))
      .catch(() => undefined);
    const updatedRow = {
      ...existing,
      snapshot_json: R2_JSON_POINTER,
      snapshot_r2_key: pointer.key,
      snapshot_sha256: pointer.sha256,
      snapshot_byte_length: pointer.byteLength,
      turn: Number(state.turn ?? 0),
      day: Number(state.day ?? 0),
      location: String(state.location ?? "").slice(0, 240),
      preview: compactPreview(snapshot),
      total_cost_usd: Number(snapshot.totalCostUsd ?? 0),
      last_mode: snapshot.lastMode === "luna" ? "luna" : "mock",
      revision: nextRevision,
      last_writer_id: deviceId,
      updated_at: now,
      last_played_at: now,
    };
    return NextResponse.json(
      {
        session: toSessionSummary(updatedRow),
        sidecarWarnings,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "세션을 저장하지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { sessionId } = await context.params;
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim().slice(0, 80) ?? "";
    if (!name) {
      return NextResponse.json({ error: "세션 이름을 입력해 주세요." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const result = await (await database())
      .prepare(
        "UPDATE simulation_sessions SET name = ?, updated_at = ? WHERE id = ? AND owner_key = ?",
      )
      .bind(name, now, sessionId, ownerKey)
      .run();
    if (!result.meta.changes) {
      return NextResponse.json({ error: "세션을 찾지 못했습니다." }, { status: 404 });
    }
    const updated = await getOwnedSession(ownerKey, sessionId);
    await writeAuditLog("session.renamed", "session", sessionId, { name });
    return NextResponse.json(
      { session: updated ? toSessionSummary(updated) : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "세션 이름을 바꾸지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { sessionId } = await context.params;
    const session = await getOwnedSession(ownerKey, sessionId);
    if (!session) {
      return NextResponse.json({ error: "세션을 찾지 못했습니다." }, { status: 404 });
    }
    const db = await database();
    await db.batch([
      db.prepare("DELETE FROM session_checkpoints WHERE session_id = ? AND owner_key = ?")
        .bind(sessionId, ownerKey),
      db.prepare("DELETE FROM simulation_sessions WHERE id = ? AND owner_key = ?")
        .bind(sessionId, ownerKey),
    ]);
    let runtimeDeleted = true;
    await deleteSessionRuntimeObjects(
      ownerKey,
      String(session.project_id),
      sessionId,
    ).catch(() => {
      runtimeDeleted = false;
    });
    await writeAuditLog("session.deleted", "session", sessionId, {
      projectId: String(session.project_id),
      name: String(session.name ?? ""),
      runtimeDeleted,
    });
    return NextResponse.json(
      { deleted: true, projectId: String(session.project_id), runtimeDeleted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "세션을 삭제하지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
