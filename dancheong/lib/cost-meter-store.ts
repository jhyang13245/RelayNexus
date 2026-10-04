import type { TurnRecord } from "./scenario";
import {
  costMeterEntryFromTurn,
  type CostMeterEntry,
} from "./cost-meter";
import {
  database,
  ensureSimulationSchema,
  safeJsonText,
} from "./simulation-store";

type SessionSnapshotRow = {
  id: string;
  project_id: string;
  snapshot_json: string;
};

type CostMeterRow = {
  telemetry_json: string;
};

const COST_ENTRY_JSON_LIMIT = 512 * 1024;
const D1_ROWS_PER_STATEMENT = 10;

const chunks = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const persistEntries = async (
  ownerKey: string,
  entries: CostMeterEntry[],
  updateExisting: boolean,
) => {
  if (!entries.length) return;
  const db = await database();
  const now = new Date().toISOString();
  for (const group of chunks(entries, D1_ROWS_PER_STATEMENT)) {
    const rowIds = group.map((entry) => `${ownerKey}:call:${entry.turnId}`);
    const placeholders = rowIds.map(() => "?").join(",");
    const existingRows = updateExisting
      ? await db.prepare(`SELECT id, telemetry_json FROM cost_meter_turns
          WHERE id IN (${placeholders})`)
        .bind(...rowIds)
        .all<{ id: string; telemetry_json: string }>()
      : { results: [] as Array<{ id: string; telemetry_json: string }> };
    const existing = new Map((existingRows.results ?? []).map((row) => {
      try {
        return [row.id, JSON.parse(row.telemetry_json) as CostMeterEntry] as const;
      } catch {
        return [row.id, undefined] as const;
      }
    }));
    const values: unknown[] = [];
    const valueSql = group.map((entry, index) => {
      const current = existing.get(rowIds[index]);
      const merged = current
        ? {
            ...current,
            id: `call:${entry.turnId}`,
            imageCostUsd: Math.max(current.imageCostUsd ?? 0, entry.imageCostUsd ?? 0),
            imageCosts: (entry.imageCosts?.length ?? 0) >= (current.imageCosts?.length ?? 0)
              ? entry.imageCosts
              : current.imageCosts,
          }
        : { ...entry, id: `call:${entry.turnId}` };
      values.push(
        rowIds[index],
        ownerKey,
        merged.projectId,
        merged.sessionId,
        merged.turnId,
        merged.appVersion,
        safeJsonText(merged, COST_ENTRY_JSON_LIMIT),
        merged.createdAt || now,
        now,
      );
      return "(?, ?, ?, ?, ?, ?, ?, ?, ?)";
    }).join(",");
    const conflictClause = updateExisting
      ? `DO UPDATE SET telemetry_json = excluded.telemetry_json,
          updated_at = excluded.updated_at`
      : "DO NOTHING";
    await db.prepare(`INSERT INTO cost_meter_turns (
        id, owner_key, project_id, session_id, turn_id, app_version,
        telemetry_json, recorded_at, updated_at
      ) VALUES ${valueSql}
      ON CONFLICT(id) ${conflictClause}`)
      .bind(...values)
      .run();
  }
};

export const syncCostMeterTurns = async (
  ownerKey: string,
  projectId: string,
  sessionId: string,
  turns: TurnRecord[],
) => {
  await ensureSimulationSchema();
  // Only the newest few turns can be new or receive an asynchronous image
  // cost update. Rewriting the full 100+ turn ledger on every autosave caused
  // quadratic D1 traffic.
  const entries = turns.slice(-4)
    .map((turn) => costMeterEntryFromTurn(projectId, sessionId, turn))
    .filter((entry): entry is CostMeterEntry => Boolean(entry));
  await persistEntries(ownerKey, entries, true);
};

const backfillStoredSessions = async (ownerKey: string) => {
  const db = await database();
  const completed = await db.prepare(
    "SELECT owner_key FROM cost_meter_backfill_state WHERE owner_key = ?",
  ).bind(ownerKey).first<{ owner_key: string }>();
  if (completed) return;
  const rows = await db.prepare(`SELECT id, project_id, snapshot_json
      FROM simulation_sessions
      WHERE owner_key = ?`)
    .bind(ownerKey)
    .all<SessionSnapshotRow>();
  const entries: CostMeterEntry[] = [];
  for (const row of rows.results ?? []) {
    try {
      const snapshot = JSON.parse(row.snapshot_json) as { turns?: TurnRecord[] };
      for (const turn of snapshot.turns ?? []) {
        const entry = costMeterEntryFromTurn(row.project_id, row.id, turn);
        if (entry) entries.push(entry);
      }
    } catch {
      // One damaged historical snapshot must not block the cumulative meter.
    }
  }
  await persistEntries(ownerKey, entries, false);
  await db.prepare(`INSERT OR REPLACE INTO cost_meter_backfill_state (
      owner_key, completed_at
    ) VALUES (?, ?)`)
    .bind(ownerKey, new Date().toISOString())
    .run();
};

export const listCumulativeCostMeter = async (
  ownerKey: string,
): Promise<CostMeterEntry[]> => {
  await ensureSimulationSchema();
  await backfillStoredSessions(ownerKey);
  const rows = await (await database()).prepare(`SELECT telemetry_json
      FROM cost_meter_turns
      WHERE owner_key = ?
      ORDER BY recorded_at ASC, id ASC`)
    .bind(ownerKey)
    .all<CostMeterRow>();
  const byCall = new Map<string, CostMeterEntry>();
  for (const row of rows.results ?? []) {
    try {
      const entry = JSON.parse(row.telemetry_json) as CostMeterEntry;
      if (!entry?.turnId || !entry.usage) continue;
      const id = `call:${entry.turnId}`;
      const current = byCall.get(id);
      if (!current) {
        byCall.set(id, { ...entry, id });
        continue;
      }
      byCall.set(id, {
        ...current,
        imageCostUsd: Math.max(current.imageCostUsd ?? 0, entry.imageCostUsd ?? 0),
        imageCosts: (entry.imageCosts?.length ?? 0) >= (current.imageCosts?.length ?? 0)
          ? entry.imageCosts
          : current.imageCosts,
      });
    } catch {
      // One malformed historical row must not hide the rest of the ledger.
    }
  }
  return [...byCall.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
  );
};
