import { database, safeJsonText } from "./simulation-store";
import {
  deleteRuntimeObject,
  R2_JSON_POINTER,
  storeRuntimeJson,
  type StoredJsonPointer,
} from "./runtime-json-store";

export type SessionCheckpointKind =
  | "INITIAL"
  | "AUTO"
  | "MANUAL"
  | "CONFLICT"
  | "RESTORE_BACKUP";

export type SessionCheckpointSummary = {
  id: string;
  sessionId: string;
  projectId: string;
  revision: number;
  kind: SessionCheckpointKind;
  label: string;
  turn: number;
  sourceDeviceId: string;
  createdAt: string;
};

const rowToSummary = (row: Record<string, unknown>): SessionCheckpointSummary => ({
  id: String(row.id),
  sessionId: String(row.session_id),
  projectId: String(row.project_id),
  revision: Number(row.revision ?? 1),
  kind: String(row.kind ?? "AUTO") as SessionCheckpointKind,
  label: String(row.label ?? "복구 기록"),
  turn: Number(row.turn ?? 0),
  sourceDeviceId: String(row.source_device_id ?? "unknown"),
  createdAt: String(row.created_at),
});

export async function createSessionCheckpoint(input: {
  ownerKey: string;
  sessionId: string;
  projectId: string;
  revision: number;
  kind: SessionCheckpointKind;
  label: string;
  snapshot: unknown;
  turn: number;
  sourceDeviceId?: string;
  snapshotPointer?: StoredJsonPointer;
}) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const snapshotJson = safeJsonText(input.snapshot, 64 * 1024 * 1024);
  const pointer = input.snapshotPointer ?? await storeRuntimeJson({
    ownerKey: input.ownerKey,
    projectId: input.projectId,
    sessionId: input.sessionId,
    category: "checkpoint",
    revision: input.revision,
    value: snapshotJson,
  });
  const db = await database();
  try {
    await db.prepare(`INSERT INTO session_checkpoints (
    id, owner_key, session_id, project_id, revision, kind, label,
    snapshot_json, snapshot_r2_key, snapshot_sha256, snapshot_byte_length,
    turn, source_device_id, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id,
      input.ownerKey,
      input.sessionId,
      input.projectId,
      input.revision,
      input.kind,
      input.label.slice(0, 160),
      R2_JSON_POINTER,
      pointer.key,
      pointer.sha256,
      pointer.byteLength,
      input.turn,
      (input.sourceDeviceId || "unknown").slice(0, 120),
      createdAt,
    )
    .run();
  } catch (error) {
    if (!input.snapshotPointer) await deleteRuntimeObject(pointer.key).catch(() => undefined);
    throw error;
  }

  // 자동 기록만 정리하고 수동·충돌·복구 백업은 보존한다.
  const staleRows = await db.prepare(`SELECT snapshot_r2_key
      FROM session_checkpoints
      WHERE owner_key = ? AND session_id = ? AND kind = 'AUTO'
      ORDER BY created_at DESC LIMIT -1 OFFSET 30`)
    .bind(input.ownerKey, input.sessionId)
    .all<{ snapshot_r2_key?: string }>();
  await db.prepare(`DELETE FROM session_checkpoints
    WHERE id IN (
      SELECT id FROM session_checkpoints
      WHERE owner_key = ? AND session_id = ? AND kind = 'AUTO'
      ORDER BY created_at DESC LIMIT -1 OFFSET 30
    )`)
    .bind(input.ownerKey, input.sessionId)
    .run();
  await Promise.all((staleRows.results ?? []).map((row) =>
    deleteRuntimeObject(row.snapshot_r2_key).catch(() => undefined)
  ));

  return {
    id,
    sessionId: input.sessionId,
    projectId: input.projectId,
    revision: input.revision,
    kind: input.kind,
    label: input.label,
    turn: input.turn,
    sourceDeviceId: input.sourceDeviceId || "unknown",
    createdAt,
  } satisfies SessionCheckpointSummary;
}

export async function listSessionCheckpoints(ownerKey: string, sessionId: string) {
  const rows = await (await database())
    .prepare(`SELECT id, session_id, project_id, revision, kind, label, turn,
      source_device_id, created_at
      FROM session_checkpoints
      WHERE owner_key = ? AND session_id = ?
      ORDER BY created_at DESC LIMIT 80`)
    .bind(ownerKey, sessionId)
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map(rowToSummary);
}

export async function getOwnedSessionCheckpoint(
  ownerKey: string,
  sessionId: string,
  checkpointId: string,
) {
  return (await database())
    .prepare(`SELECT * FROM session_checkpoints
      WHERE id = ? AND session_id = ? AND owner_key = ?`)
    .bind(checkpointId, sessionId, ownerKey)
    .first<Record<string, unknown>>();
}
