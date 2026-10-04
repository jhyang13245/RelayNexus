import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "../app/chatgpt-auth";
import {
  database,
  ensureSimulationSchema,
  SHARED_TEST_OWNER_KEY,
} from "./simulation-store";

export type RelayAccountRole = "MASTER" | "USER";

export type RelayAccountContext = {
  id: string;
  ownerKey: string;
  email: string;
  displayName: string;
  role: RelayAccountRole;
  createdAt: string;
  lastSeenAt: string;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown>;
  createdAt: string;
  actorAccountId: string;
  actorDisplayName: string;
  actorRole: RelayAccountRole;
};

type AccountRow = {
  status: string;
  id: string;
  email_key: string;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
  last_seen_at: string;
};

type AuditRow = {
  id: string;
  actor_account_id: string;
  actor_display_name: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  detail_json: string;
  created_at: string;
};

let accountSchemaPromise: Promise<void> | null = null;

const LEGACY_CLAIM_MIGRATION = "v1.5.4-master-legacy-library-claim";
const ACCOUNT_OWNER_PREFIX = "account:";

export class AccountAuthenticationError extends Error {
  readonly code = "AUTH_REQUIRED";
  readonly status = 401;
  readonly signInPath = chatGPTSignInPath("/");

  constructor() {
    super("Relay ID 계정으로 로그인한 뒤 이용해 주세요.");
  }
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const masterEmails = () => new Set(
  (process.env.RELAY_MASTER_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean),
);

const toContext = (row: AccountRow): RelayAccountContext => ({
  id: row.id,
  ownerKey: `${ACCOUNT_OWNER_PREFIX}${row.id}`,
  email: row.email,
  displayName: row.display_name || row.email,
  role: row.role === "MASTER" ? "MASTER" : "USER",
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
});

export async function ensureAccountSchema() {
  if (process.env.NODE_ENV === "production") return;
  if (accountSchemaPromise) return accountSchemaPromise;
  accountSchemaPromise = (async () => {
    await ensureSimulationSchema();
    const db = await database();
    await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS relay_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      email_key TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS relay_account_migrations (
      migration_key TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      completed_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      actor_account_id TEXT NOT NULL,
      actor_display_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS relay_accounts_role_idx ON relay_accounts (role, last_seen_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs (created_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx ON admin_audit_logs (actor_account_id, created_at)",
    ),
    ]);
  })().catch((error) => {
    accountSchemaPromise = null;
    throw error;
  });
  return accountSchemaPromise;
}

const writeAuditLogWithContext = async (
  account: RelayAccountContext,
  action: string,
  targetType: string,
  targetId: string,
  detail: Record<string, unknown> = {},
) => {
  await ensureAccountSchema();
  const serialized = JSON.stringify(detail).slice(0, 16_000);
  await (await database()).prepare(`INSERT INTO admin_audit_logs (
      id, actor_account_id, actor_display_name, actor_role, action,
      target_type, target_id, detail_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      account.id,
      account.displayName.slice(0, 160),
      account.role,
      action.slice(0, 120),
      targetType.slice(0, 80),
      targetId.slice(0, 200),
      serialized,
      new Date().toISOString(),
    )
    .run();
};

const claimLegacyLibraryForMaster = async (account: RelayAccountContext) => {
  if (account.role !== "MASTER") return;
  const db = await database();
  const completed = await db.prepare(
    "SELECT migration_key FROM relay_account_migrations WHERE migration_key = ?",
  ).bind(LEGACY_CLAIM_MIGRATION).first<{ migration_key: string }>();
  if (completed) return;

  const now = new Date().toISOString();
  const legacyPredicate = "owner_key = ? OR owner_key LIKE 'device:%' OR owner_key NOT LIKE 'account:%'";
  await db.batch([
    db.prepare(`UPDATE scenario_projects SET owner_key = ? WHERE ${legacyPredicate}`)
      .bind(account.ownerKey, SHARED_TEST_OWNER_KEY),
    db.prepare(`UPDATE simulation_sessions SET owner_key = ? WHERE ${legacyPredicate}`)
      .bind(account.ownerKey, SHARED_TEST_OWNER_KEY),
    db.prepare(`UPDATE package_uploads SET owner_key = ? WHERE ${legacyPredicate}`)
      .bind(account.ownerKey, SHARED_TEST_OWNER_KEY),
    db.prepare(`UPDATE project_thumbnails SET owner_key = ? WHERE ${legacyPredicate}`)
      .bind(account.ownerKey, SHARED_TEST_OWNER_KEY),
    db.prepare(`UPDATE cost_meter_turns SET owner_key = ? WHERE ${legacyPredicate}`)
      .bind(account.ownerKey, SHARED_TEST_OWNER_KEY),
    db.prepare(`INSERT OR IGNORE INTO relay_account_migrations (
      migration_key, account_id, detail_json, completed_at
    ) VALUES (?, ?, ?, ?)`)
      .bind(
        LEGACY_CLAIM_MIGRATION,
        account.id,
        JSON.stringify({ ownerKey: account.ownerKey, source: SHARED_TEST_OWNER_KEY }),
        now,
      ),
  ]);
  await writeAuditLogWithContext(
    account,
    "storage.legacy_claimed",
    "account",
    account.id,
    { migration: LEGACY_CLAIM_MIGRATION },
  );
};

export async function getOptionalAccountContext(): Promise<RelayAccountContext | null> {
  const chatGPTUser = await getChatGPTUser();
  if (!chatGPTUser) return null;

  await ensureAccountSchema();
  const emailKey = normalizeEmail(chatGPTUser.email);
  const shouldBeMaster = masterEmails().has(emailKey);
  const db = await database();
  let row = await db.prepare(
    "SELECT * FROM relay_accounts WHERE email_key = ?",
  ).bind(emailKey).first<AccountRow>();
  const now = new Date().toISOString();

  if (!row) {
    const id = crypto.randomUUID();
    const role: RelayAccountRole = shouldBeMaster ? "MASTER" : "USER";
    await db.prepare(`INSERT INTO relay_accounts (
      id, email_key, email, display_name, role, status,
      created_at, updated_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`)
      .bind(
        id,
        emailKey,
        chatGPTUser.email.slice(0, 320),
        chatGPTUser.displayName.slice(0, 160),
        role,
        now,
        now,
        now,
      )
      .run();
    row = await db.prepare("SELECT * FROM relay_accounts WHERE id = ?")
      .bind(id)
      .first<AccountRow>();
    if (!row) throw new Error("Relay ID 계정을 준비하지 못했습니다.");
    const created = toContext(row);
    await writeAuditLogWithContext(created, "account.created", "account", id, {
      role,
      provider: "chatgpt",
    });
  } else {
    const nextRole = shouldBeMaster ? "MASTER" : row.role;
    // Authentication still runs on every request; unchanged presence is persisted at most once a minute.
    if(row.email!==chatGPTUser.email || row.display_name!==chatGPTUser.displayName || row.role!==nextRole || Date.now()-Date.parse(row.last_seen_at)>=60000)await db.prepare(`UPDATE relay_accounts SET
        email = ?, display_name = ?, role = ?, updated_at = ?, last_seen_at = ?
        WHERE id = ?`)
      .bind(
        chatGPTUser.email.slice(0, 320),
        chatGPTUser.displayName.slice(0, 160),
        nextRole,
        now,
        now,
        row.id,
      )
      .run();
    row = { ...row, email: chatGPTUser.email, display_name: chatGPTUser.displayName, role: nextRole, last_seen_at: now };
  }

  if(row.status !== 'ACTIVE') throw Object.assign(new Error('운영자에 의해 이용이 제한된 계정입니다.'), {status:403,code:'ACCOUNT_SUSPENDED'});
  const account = toContext(row);
  await claimLegacyLibraryForMaster(account);
  return account;
}

export async function requireAccountContext(): Promise<RelayAccountContext> {
  const account = await getOptionalAccountContext();
  if (!account) throw new AccountAuthenticationError();
  return account;
}

export async function writeAuditLog(
  action: string,
  targetType: string,
  targetId: string,
  detail: Record<string, unknown> = {},
) {
  const account = await requireAccountContext();
  await writeAuditLogWithContext(account, action, targetType, targetId, detail);
}

export async function listAuditLogs(limit = 80): Promise<AuditLogEntry[]> {
  const account = await requireAccountContext();
  if (account.role !== "MASTER") {
    throw new Error("마스터 계정만 감사 로그를 열 수 있습니다.");
  }
  const boundedLimit = Math.min(200, Math.max(1, Math.floor(limit)));
  const rows = await (await database()).prepare(`SELECT * FROM admin_audit_logs
      ORDER BY created_at DESC LIMIT ?`)
    .bind(boundedLimit)
    .all<AuditRow>();
  return (rows.results ?? []).map((row) => {
    let detail: Record<string, unknown> = {};
    try {
      detail = JSON.parse(row.detail_json) as Record<string, unknown>;
    } catch {
      detail = {};
    }
    return {
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      detail,
      createdAt: row.created_at,
      actorAccountId: row.actor_account_id,
      actorDisplayName: row.actor_display_name,
      actorRole: row.actor_role === "MASTER" ? "MASTER" : "USER",
    };
  });
}

export const accountPayload = (account: RelayAccountContext) => ({
  authenticated: true as const,
  id: account.id,
  email: account.email,
  displayName: account.displayName,
  role: account.role,
  storageMode: "account" as const,
  createdAt: account.createdAt,
  lastSeenAt: account.lastSeenAt,
  signOutPath: chatGPTSignOutPath("/"),
});

export const anonymousAccountPayload = () => ({
  authenticated: false as const,
  storageMode: "account" as const,
  signInPath: chatGPTSignInPath("/"),
});
