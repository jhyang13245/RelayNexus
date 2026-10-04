import type { LiveReliabilityEntry } from "./live-reliability";
import { database, ensureSimulationSchema, safeJsonText } from "./simulation-store";

const LIVE_RELIABILITY_JSON_LIMIT = 64 * 1024;

export const recordLiveReliabilityAttempt = async (
  ownerKey: string,
  entry: LiveReliabilityEntry,
): Promise<void> => {
  await ensureSimulationSchema();
  await (await database()).prepare(`INSERT INTO live_reliability_attempts (
      id, owner_key, project_id, session_id, app_version, telemetry_json, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET telemetry_json = excluded.telemetry_json`)
    .bind(
      `${ownerKey}:live:${entry.id}`,
      ownerKey,
      entry.projectId,
      entry.sessionId,
      entry.appVersion,
      safeJsonText(entry, LIVE_RELIABILITY_JSON_LIMIT),
      entry.createdAt,
    )
    .run();
};

export const listLiveReliabilityAttempts = async (
  ownerKey: string,
): Promise<LiveReliabilityEntry[]> => {
  await ensureSimulationSchema();
  const rows = await (await database()).prepare(`SELECT telemetry_json
      FROM live_reliability_attempts
      WHERE owner_key = ?
      ORDER BY recorded_at DESC
      LIMIT 500`)
    .bind(ownerKey)
    .all<{ telemetry_json: string }>();
  return (rows.results ?? []).flatMap((row) => {
    try {
      const entry = JSON.parse(row.telemetry_json) as LiveReliabilityEntry;
      return entry?.id ? [entry] : [];
    } catch {
      return [];
    }
  }).reverse();
};
