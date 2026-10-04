import { NextResponse } from "next/server";

import {
  compactPreview,
  database,
  getOwnedProject,
  listLibrary,
  requireOwnerKey,
  safeJsonText,
} from "../../../lib/simulation-store";
import {
  createInitialState,
  createOpeningTurn,
  defaultAutonomyRuntime,
  defaultRelationshipMemoryRuntime,
  defaultStatusWindow,
  type ScenarioPack,
} from "../../../lib/scenario";
import { buildPublicStatusSnapshot } from "../../../lib/status-window";
import { writeAuditLog } from "../../../lib/account-store";
import { createSessionCheckpoint } from "../../../lib/session-checkpoint-store";
import {
  deleteRuntimeObject,
  readProjectPackText,
  R2_JSON_POINTER,
  storeRuntimeJson,
} from "../../../lib/runtime-json-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ownerKey = await requireOwnerKey();
    const body = (await request.json()) as { projectId?: string; name?: string };
    const projectId = body.projectId?.trim() ?? "";
    const project = await getOwnedProject(ownerKey, projectId);
    if (!project) {
      return NextResponse.json(
        { error: "새 세션을 만들 작품을 찾지 못했습니다." },
        { status: 404 },
      );
    }
    const rawPack = JSON.parse(await readProjectPackText(project)) as ScenarioPack;
    const pack: ScenarioPack = {
      ...rawPack,
      startTime: rawPack.startTime || "00:00",
      constraints: rawPack.constraints ?? [],
      statusWindow: rawPack.statusWindow ?? defaultStatusWindow(),
      initialStatusLedger: rawPack.initialStatusLedger ?? [],
      factions: rawPack.factions ?? [],
      autonomyActors: rawPack.autonomyActors ?? [],
      autonomyRuntime: rawPack.autonomyRuntime ?? defaultAutonomyRuntime(),
      initialRelationshipMemories:
        rawPack.initialRelationshipMemories ?? [],
      relationshipMemoryRuntime:
        rawPack.relationshipMemoryRuntime ??
        defaultRelationshipMemoryRuntime(),
    };
    const state = createInitialState(pack);
    const openingTurn = createOpeningTurn(pack);
    const snapshot = {
      pack,
      state,
      turns: [
        {
          ...openingTurn,
          statusSnapshot: buildPublicStatusSnapshot(pack, state),
        },
      ],
      longTermMemories: [],
      totalCostUsd: 0,
      lastMode: "mock" as const,
    };
    const snapshotJson = safeJsonText(snapshot, 48 * 1024 * 1024);
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = await database();

    const count = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM simulation_sessions WHERE project_id = ? AND owner_key = ?",
      )
      .bind(projectId, ownerKey)
      .first<{ count: number }>();
    const defaultName = `새 이야기 ${Number(count?.count ?? 0) + 1}`;
    const name = (body.name?.trim() || defaultName).slice(0, 80);

    const snapshotPointer = await storeRuntimeJson({
      ownerKey,
      projectId,
      sessionId,
      category: "revision",
      revision: 1,
      value: snapshotJson,
    });
    try {
      await db
        .prepare(`INSERT INTO simulation_sessions (
        id, project_id, owner_key, name, snapshot_json,
        snapshot_r2_key, snapshot_sha256, snapshot_byte_length, turn, day,
        location, preview, total_cost_usd, last_mode, created_at,
        revision, project_revision, package_fingerprint, last_writer_id,
        updated_at, last_played_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
        sessionId,
        projectId,
        ownerKey,
        name,
        R2_JSON_POINTER,
        snapshotPointer.key,
        snapshotPointer.sha256,
        snapshotPointer.byteLength,
        state.turn,
        state.day,
        state.location,
        compactPreview(snapshot),
        0,
        "mock",
        now,
        1,
        Number(project.project_revision ?? 1),
        String(project.package_fingerprint ?? "legacy"),
        "session-create",
        now,
        now,
        )
        .run();
      await createSessionCheckpoint({
        ownerKey,
        sessionId,
        projectId,
        revision: 1,
        kind: "INITIAL",
        label: "새 이야기의 최초 상태",
        snapshot,
        turn: state.turn,
        sourceDeviceId: "session-create",
      });
    } catch (error) {
      await db.prepare("DELETE FROM simulation_sessions WHERE id = ? AND owner_key = ?")
        .bind(sessionId, ownerKey)
        .run()
        .catch(() => undefined);
      await deleteRuntimeObject(snapshotPointer.key).catch(() => undefined);
      throw error;
    }
    await db
      .prepare("UPDATE scenario_projects SET updated_at = ? WHERE id = ? AND owner_key = ?")
      .bind(now, projectId, ownerKey)
      .run();

    const library = await listLibrary(ownerKey);
    await writeAuditLog("session.created", "session", sessionId, {
      projectId,
      name,
    });
    return NextResponse.json(
      { session: library.sessions.find((item) => item.id === sessionId), snapshot },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "새 세션을 만들지 못했습니다.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
