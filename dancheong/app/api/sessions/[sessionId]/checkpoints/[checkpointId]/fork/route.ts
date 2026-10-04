import { NextResponse } from "next/server";

import { writeAuditLog } from "../../../../../../../lib/account-store";
import {
  compactPreview,
  database,
  getOwnedProject,
  getOwnedSession,
  listLibrary,
  requireOwnerKey,
} from "../../../../../../../lib/simulation-store";
import {
  createSessionCheckpoint,
  getOwnedSessionCheckpoint,
} from "../../../../../../../lib/session-checkpoint-store";
import {
  deleteRuntimeObject,
  readCheckpointSnapshotText,
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
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      deviceId?: string;
    };
    const [sourceSession, checkpoint] = await Promise.all([
      getOwnedSession(ownerKey, sessionId),
      getOwnedSessionCheckpoint(ownerKey, sessionId, checkpointId),
    ]);
    if (!sourceSession || !checkpoint) {
      return NextResponse.json({ error: "분기할 세션 또는 충돌 초안을 찾지 못했습니다." }, { status: 404 });
    }
    const projectId = String(sourceSession.project_id);
    const project = await getOwnedProject(ownerKey, projectId);
    if (!project) {
      return NextResponse.json({ error: "고정된 작품 버전을 찾지 못했습니다." }, { status: 404 });
    }
    const snapshot = JSON.parse(
      await readCheckpointSnapshotText(checkpoint),
    ) as Record<string, unknown>;
    const state = snapshot.state as Record<string, unknown> | undefined;
    if (!state || !Array.isArray(snapshot.turns)) {
      return NextResponse.json({ error: "충돌 초안의 세션 상태가 손상되었습니다." }, { status: 422 });
    }
    const now = new Date().toISOString();
    const forkSessionId = crypto.randomUUID();
    const name = (body.name?.trim() || `${String(sourceSession.name)} · 충돌 보존본`).slice(0, 80);
    const db = await database();
    const snapshotPointer = await storeRuntimeJson({
      ownerKey,
      projectId,
      sessionId: forkSessionId,
      category: "revision",
      revision: 1,
      value: snapshot,
    });
    try {
      await db.prepare(`INSERT INTO simulation_sessions (
      id, project_id, owner_key, name, snapshot_json,
      snapshot_r2_key, snapshot_sha256, snapshot_byte_length, turn, day,
      location, preview, total_cost_usd, last_mode, created_at,
      revision, project_revision, package_fingerprint, last_writer_id,
      updated_at, last_played_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
        forkSessionId,
        projectId,
        ownerKey,
        name,
        R2_JSON_POINTER,
        snapshotPointer.key,
        snapshotPointer.sha256,
        snapshotPointer.byteLength,
        Number(state.turn ?? 0),
        Number(state.day ?? 0),
        String(state.location ?? "").slice(0, 240),
        compactPreview(snapshot),
        Number(snapshot.totalCostUsd ?? 0),
        snapshot.lastMode === "luna" ? "luna" : "mock",
        now,
        1,
        Number(sourceSession.project_revision ?? project.project_revision ?? 1),
        String(sourceSession.package_fingerprint ?? project.package_fingerprint ?? "legacy"),
        String(body.deviceId ?? "checkpoint-fork").slice(0, 120),
        now,
        now,
        )
        .run();
      await createSessionCheckpoint({
        ownerKey,
        sessionId: forkSessionId,
        projectId,
        revision: 1,
        kind: "INITIAL",
        label: `충돌 초안에서 분기 · 원본 턴 ${Number(checkpoint.turn ?? 0)}`,
        snapshot,
        turn: Number(state.turn ?? 0),
        sourceDeviceId: body.deviceId,
      });
    } catch (error) {
      await db.prepare("DELETE FROM simulation_sessions WHERE id = ? AND owner_key = ?")
        .bind(forkSessionId, ownerKey)
        .run()
        .catch(() => undefined);
      await deleteRuntimeObject(snapshotPointer.key).catch(() => undefined);
      throw error;
    }
    await db.prepare("UPDATE scenario_projects SET updated_at = ? WHERE id = ? AND owner_key = ?")
      .bind(now, projectId, ownerKey)
      .run();
    await writeAuditLog("session.conflict.forked", "session", forkSessionId, {
      sourceSessionId: sessionId,
      checkpointId,
      projectId,
    }).catch(() => undefined);
    const library = await listLibrary(ownerKey);
    return NextResponse.json(
      {
        session: library.sessions.find((item) => item.id === forkSessionId),
        project: library.projects.find((item) => item.id === projectId),
        snapshot,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "충돌 초안을 새 세션으로 분기하지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
