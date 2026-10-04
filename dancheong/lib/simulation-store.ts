export type ProjectSummary = {
  id: string;
  sourceProjectId: string;
  title: string;
  genre: string;
  playerName: string;
  packageVersion: string;
  projectRevision: number;
  packageFingerprint: string;
  sessionCount: number;
  hasPackage: boolean;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionSummary = {
  id: string;
  projectId: string;
  name: string;
  turn: number;
  day: number;
  location: string;
  preview: string;
  totalCostUsd: number;
  lastMode: "mock" | "luna";
  revision: number;
  projectRevision: number;
  packageFingerprint: string;
  lastWriterId: string;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string;
};

export type PackageUploadRow = {
  id: string;
  owner_key: string;
  r2_key: string;
  r2_upload_id: string;
  original_name: string;
  size_bytes: number;
  created_at: string;
};

export const DEVICE_OWNER_COOKIE = "relay-nexus-device-owner";
export const SHARED_TEST_OWNER_KEY = "shared-test-library@relay.invalid";
const DEVICE_OWNER_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type D1Result<T> = { results?: T[] };
let simulationSchemaPromise: Promise<void> | null = null;

const runtimeEnv = async () => (await import("cloudflare:workers")).env;

export const database = async () => {
  const env = await runtimeEnv();
  if (!env.DB) throw new Error("시뮬레이션 저장소가 아직 연결되지 않았습니다.");
  return env.DB;
};

export const objectStorage = async () => {
  const env = await runtimeEnv();
  if (!env.BUCKET) throw new Error("패키지 저장소가 아직 연결되지 않았습니다.");
  return env.BUCKET;
};

export const deviceOwnerKeyFromCookieHeader = (
  cookieHeader: string | null | undefined,
): string | null => {
  if (!cookieHeader) return null;
  for (const rawPart of cookieHeader.split(";")) {
    const separator = rawPart.indexOf("=");
    if (separator < 0) continue;
    const name = rawPart.slice(0, separator).trim();
    if (name !== DEVICE_OWNER_COOKIE) continue;
    let token = rawPart.slice(separator + 1).trim();
    try {
      token = decodeURIComponent(token);
    } catch {
      return null;
    }
    return DEVICE_OWNER_TOKEN.test(token) ? `device:${token.toLowerCase()}` : null;
  }
  return null;
};

export const ownerPathHash = async (ownerKey: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ownerKey),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
};

export const resolveLibraryOwnerKey = () => SHARED_TEST_OWNER_KEY;

export async function requireOwnerKey(request?: Request): Promise<string> {
  const { requireAccountContext } = await import("./account-store");
  const ownerKey=(await requireAccountContext()).ownerKey;
  // A stale tab must not upload the previous account's story after sign-in changed.
  const expected=request?.headers.get('X-Cortex-Account');
  if(expected&&expected!==ownerKey)throw Error('로그인 계정이 변경되었습니다. 서재를 다시 열어 주세요.');
  return ownerKey;
}

export async function ensureSimulationSchema() {
  if (process.env.NODE_ENV === "production") return;
  if (simulationSchemaPromise) return simulationSchemaPromise;
  simulationSchemaPromise = (async () => {
    const db = await database();
    await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS scenario_projects (
      id TEXT PRIMARY KEY NOT NULL,
      owner_key TEXT NOT NULL,
      source_project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      genre TEXT NOT NULL DEFAULT '',
      player_name TEXT NOT NULL DEFAULT '',
      package_version TEXT NOT NULL DEFAULT 'unknown',
      project_revision REAL NOT NULL DEFAULT 1,
      package_fingerprint TEXT NOT NULL DEFAULT 'legacy',
      pack_json TEXT NOT NULL,
      pack_r2_key TEXT,
      pack_sha256 TEXT,
      pack_byte_length REAL,
      r2_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS simulation_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      owner_key TEXT NOT NULL,
      name TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      snapshot_r2_key TEXT,
      snapshot_sha256 TEXT,
      snapshot_byte_length REAL,
      turn REAL NOT NULL DEFAULT 0,
      day REAL NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT '',
      preview TEXT NOT NULL DEFAULT '아직 시작하지 않은 이야기',
      total_cost_usd REAL NOT NULL DEFAULT 0,
      last_mode TEXT NOT NULL DEFAULT 'mock',
      revision REAL NOT NULL DEFAULT 1,
      project_revision REAL NOT NULL DEFAULT 1,
      package_fingerprint TEXT NOT NULL DEFAULT 'legacy',
      last_writer_id TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_played_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cortex_cloud_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      owner_key TEXT NOT NULL,
      project_id TEXT NOT NULL,
      source_project_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      snapshot_r2_key TEXT,
      snapshot_sha256 TEXT,
      snapshot_byte_length REAL,
      turn REAL NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT '',
      preview TEXT NOT NULL DEFAULT '아직 시작하지 않은 이야기',
      revision REAL NOT NULL DEFAULT 1,
      last_writer_id TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cortex_session_leases (
      id TEXT PRIMARY KEY NOT NULL,
      owner_key TEXT NOT NULL,
      device_id TEXT NOT NULL DEFAULT 'unknown',
      client_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      takeover_client_id TEXT NOT NULL DEFAULT '',
      takeover_requested_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS session_checkpoints (
      id TEXT PRIMARY KEY NOT NULL,
      owner_key TEXT NOT NULL,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      revision REAL NOT NULL,
      kind TEXT NOT NULL DEFAULT 'AUTO',
      label TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      snapshot_r2_key TEXT,
      snapshot_sha256 TEXT,
      snapshot_byte_length REAL,
      turn REAL NOT NULL DEFAULT 0,
      source_device_id TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS package_uploads (
      id TEXT PRIMARY KEY NOT NULL,
      owner_key TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      r2_upload_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size_bytes REAL NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS project_thumbnails (
      project_id TEXT PRIMARY KEY NOT NULL,
      owner_key TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      content_type TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cost_meter_turns (
      id TEXT PRIMARY KEY NOT NULL,
      owner_key TEXT NOT NULL,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      app_version TEXT NOT NULL,
      telemetry_json TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cost_meter_backfill_state (
      owner_key TEXT PRIMARY KEY NOT NULL,
      completed_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS live_reliability_attempts (
      id TEXT PRIMARY KEY NOT NULL,
      owner_key TEXT NOT NULL,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      app_version TEXT NOT NULL,
      telemetry_json TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS scenario_projects_owner_updated_idx ON scenario_projects (owner_key, updated_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS simulation_sessions_owner_played_idx ON simulation_sessions (owner_key, last_played_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS simulation_sessions_project_idx ON simulation_sessions (project_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS cortex_cloud_sessions_owner_updated_idx ON cortex_cloud_sessions (owner_key, updated_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS cortex_cloud_sessions_project_idx ON cortex_cloud_sessions (project_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS cortex_session_leases_owner_expiry_idx ON cortex_session_leases (owner_key, expires_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS session_checkpoints_session_created_idx ON session_checkpoints (session_id, created_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS session_checkpoints_owner_created_idx ON session_checkpoints (owner_key, created_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS package_uploads_owner_created_idx ON package_uploads (owner_key, created_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS project_thumbnails_owner_idx ON project_thumbnails (owner_key)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS cost_meter_turns_owner_recorded_idx ON cost_meter_turns (owner_key, recorded_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS cost_meter_turns_session_idx ON cost_meter_turns (session_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS live_reliability_owner_recorded_idx ON live_reliability_attempts (owner_key, recorded_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS live_reliability_session_idx ON live_reliability_attempts (session_id, recorded_at)",
    ),
    ]);
  })().catch((error) => {
    simulationSchemaPromise = null;
    throw error;
  });
  return simulationSchemaPromise;
}

const projectFromRow = (row: Record<string, unknown>): ProjectSummary => {
  const id = String(row.id);
  const thumbnailVersion = String(row.thumbnail_updated_at ?? "");
  return {
    id,
    sourceProjectId: String(row.source_project_id),
    title: String(row.title),
    genre: String(row.genre ?? ""),
    playerName: String(row.player_name ?? ""),
    packageVersion: String(row.package_version ?? "unknown"),
    projectRevision: Number(row.project_revision ?? 1),
    packageFingerprint: String(row.package_fingerprint ?? "legacy"),
    sessionCount: Number(row.session_count ?? 0),
    hasPackage: Boolean(row.r2_key),
    thumbnailUrl: row.thumbnail_r2_key
      ? `/api/projects/${encodeURIComponent(id)}/thumbnail?v=${encodeURIComponent(thumbnailVersion)}`
      : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
};

const sessionFromRow = (row: Record<string, unknown>): SessionSummary => ({
  id: String(row.id),
  projectId: String(row.project_id),
  name: String(row.name),
  turn: Number(row.turn ?? 0),
  day: Number(row.day ?? 0),
  location: String(row.location ?? ""),
  preview: String(row.preview ?? ""),
  totalCostUsd: Number(row.total_cost_usd ?? 0),
  lastMode: row.last_mode === "luna" ? "luna" : "mock",
  revision: Number(row.revision ?? 1),
  projectRevision: Number(row.project_revision ?? 1),
  packageFingerprint: String(row.package_fingerprint ?? "legacy"),
  lastWriterId: String(row.last_writer_id ?? "unknown"),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  lastPlayedAt: String(row.last_played_at),
});

export async function listLibrary(ownerKey: string) {
  await ensureSimulationSchema();
  const db = await database();
  const [projectRows, sessionRows] = await Promise.all([
    db.prepare(`SELECT p.*, COUNT(s.id) AS session_count,
        MAX(t.r2_key) AS thumbnail_r2_key,
        MAX(t.updated_at) AS thumbnail_updated_at
      FROM scenario_projects p
      LEFT JOIN simulation_sessions s
        ON s.project_id = p.id AND s.owner_key = p.owner_key
      LEFT JOIN project_thumbnails t
        ON t.project_id = p.id AND t.owner_key = p.owner_key
      WHERE p.owner_key = ?
      GROUP BY p.id
      ORDER BY p.updated_at DESC`)
      .bind(ownerKey)
      .all() as Promise<D1Result<Record<string, unknown>>>,
    db.prepare(`SELECT * FROM simulation_sessions
      WHERE owner_key = ?
      ORDER BY last_played_at DESC`)
      .bind(ownerKey)
      .all() as Promise<D1Result<Record<string, unknown>>>,
  ]);

  return {
    projects: (projectRows.results ?? []).map(projectFromRow),
    sessions: (sessionRows.results ?? []).map(sessionFromRow),
  };
}

export async function getOwnedProject(ownerKey: string, projectId: string) {
  await ensureSimulationSchema();
  return (await database())
    .prepare("SELECT * FROM scenario_projects WHERE id = ? AND owner_key = ?")
    .bind(projectId, ownerKey)
    .first<Record<string, unknown>>();
}

export async function getOwnedSession(ownerKey: string, sessionId: string) {
  await ensureSimulationSchema();
  return (await database())
    .prepare("SELECT * FROM simulation_sessions WHERE id = ? AND owner_key = ?")
    .bind(sessionId, ownerKey)
    .first<Record<string, unknown>>();
}

export async function getOwnedProjectThumbnail(
  ownerKey: string,
  projectId: string,
) {
  await ensureSimulationSchema();
  return (await database())
    .prepare("SELECT * FROM project_thumbnails WHERE project_id = ? AND owner_key = ?")
    .bind(projectId, ownerKey)
    .first<Record<string, unknown>>();
}

export async function getOwnedPackageUpload(
  ownerKey: string,
  uploadId: string,
) {
  await ensureSimulationSchema();
  return (await database())
    .prepare("SELECT * FROM package_uploads WHERE id = ? AND owner_key = ?")
    .bind(uploadId, ownerKey)
    .first<PackageUploadRow>();
}

export const toProjectSummary = projectFromRow;
export const toSessionSummary = sessionFromRow;

export function safeJsonText(value: unknown, maxLength: number) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (!serialized || serialized.length > maxLength) {
    throw new Error("저장할 시뮬레이션 데이터가 허용 크기를 초과했습니다.");
  }
    if(typeof value === 'string')JSON.parse(serialized);
  return serialized;
}

export function compactPreview(snapshot: Record<string, unknown>) {
  const turns = Array.isArray(snapshot.turns) ? snapshot.turns : [];
  const last = turns.at(-1) as Record<string, unknown> | undefined;
  const blocks = Array.isArray(last?.blocks) ? last.blocks : [];
  const lastBlock = [...blocks].reverse().find((item) => {
    const block = item as Record<string, unknown>;
    return typeof block.text === "string" && block.text.trim();
  }) as Record<string, unknown> | undefined;
  return String(lastBlock?.text ?? "새로운 이야기가 시작되었습니다.")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}
