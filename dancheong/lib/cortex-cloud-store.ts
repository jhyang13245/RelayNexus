import { database } from "./simulation-store";

export type CortexCloudSessionRow = {
  id: string;
  owner_key: string;
  project_id: string;
  source_project_id: string;
  name: string;
  snapshot_json: string;
  snapshot_r2_key: string | null;
  snapshot_sha256: string | null;
  snapshot_byte_length: number | null;
  turn: number;
  location: string;
  preview: string;
  revision: number;
  last_writer_id: string;
  created_at: string;
  updated_at: string;
};

export type CortexCloudSessionSummary = {
  id: string;
  projectId: string;
  sourceProjectId?: string;
  name: string;
  turn: number;
  location: string;
  preview: string;
  revision: number;
  updatedAt: string;
};

export const cortexCloudSummary = (row: CortexCloudSessionRow): CortexCloudSessionSummary => ({
  id: row.id,
  projectId: row.project_id,
  sourceProjectId: row.source_project_id || undefined,
  name: row.name,
  turn: Number(row.turn || 0),
  location: row.location || "",
  preview: row.preview || "",
  revision: Number(row.revision || 1),
  updatedAt: row.updated_at,
});

export async function getCortexCloudSession(ownerKey: string, sessionId: string) {
  return (await database()).prepare(
    "SELECT * FROM cortex_cloud_sessions WHERE id = ? AND owner_key = ? AND last_writer_id <> 'mp-deleted'",
  ).bind(sessionId, ownerKey).first<CortexCloudSessionRow>();
}

export async function getCortexCloudSummary(ownerKey:string,sessionId:string){
  const row=await (await database()).prepare(
    "SELECT id,project_id,source_project_id,name,turn,location,preview,revision,updated_at FROM cortex_cloud_sessions WHERE id = ? AND owner_key = ? AND last_writer_id <> 'mp-deleted'",
  ).bind(sessionId,ownerKey).first<CortexCloudSessionRow>();
  return row?cortexCloudSummary(row):null;
}

export async function listCortexCloudSessions(ownerKey: string) {
  const result = await (await database()).prepare(
    "SELECT id,project_id,source_project_id,name,turn,location,preview,revision,updated_at FROM cortex_cloud_sessions WHERE owner_key = ? AND last_writer_id <> 'mp-deleted' ORDER BY updated_at ASC",
  ).bind(ownerKey).all<CortexCloudSessionRow>();
  return (result.results ?? []).map(cortexCloudSummary);
}
