import type { RelayAccountContext } from "./account-store";
import { validateNewSharedStory } from './multiplayer-new-story';
import { getCortexCloudSession } from "./cortex-cloud-store";
import { readRuntimeJsonText } from "./runtime-json-store";
import {readSharedSnapshot,storeSharedSnapshot} from './multiplayer-snapshot';
import {readMultiplayerChat} from './multiplayer-chat-read';
import {readInputDraft} from './multiplayer-input-draft';
import {readLivePresentation} from './multiplayer-live';
import {readVNPlayback,VN_PLAYBACK_SCHEMA} from './multiplayer-vn-playback';
import {roomPresentation,readSubmittedInput} from './multiplayer-presentation';
import {ensurePersonalCopies,readCortexSnapshot} from './multiplayer-personal';
import {
  activeMembers,
  canStartRoom,
  hasDeadlineExpired,
  keyRecoveryDeadline,
  nextTurnMember,
  payerAccountIdForCall,
  roomStatusForMemberCount,
  type MultiplayerCallCause,
  type MultiplayerMemberStatus,
  type MultiplayerRoomStatus,
  type TurnMember,
} from "./multiplayer-policy";
import {
  database,
  ensureSimulationSchema,
  getOwnedProject,
  getOwnedSession,
  toProjectSummary,
  toSessionSummary,
} from "./simulation-store";
import { readSessionSnapshotText } from "./runtime-json-store";
import {
  deleteRuntimeObject,
  R2_JSON_POINTER,
  storeRuntimeJson,
} from "./runtime-json-store";
import { optimizeConversationSnapshot } from "./conversation-memory";
import { compactPreview, safeJsonText } from "./simulation-store";

export type MultiplayerSettings = {
  presentation?: 'novel' | 'visual';
  engine?: "cortex" | "lotus";
  textModel: string;
  imageModel: string;
  baseUrl: string;
  outputContract: string;
};

export type MultiplayerMemberView = {
  id: string;
  displayName: string;
  seat: number;
  role: "HOST" | "PLAYER";
  status: MultiplayerMemberStatus;
  apiKeyReady: boolean;
  isSelf: boolean;
  lastSeenAt: string;
};

export type MultiplayerRoomView = {
  id: string;
  code: string;
  name: string;
  status: MultiplayerRoomStatus;
  visibility: "PUBLIC" | "PRIVATE";
  maxPlayers: number;
  turnLimitSeconds: number;
  currentMemberId: string | null;
  turnDeadlineAt: string | null;
  keyRecoveryDeadlineAt: string | null;
  pausedReason: string;
  revision: number;
  settings: MultiplayerSettings;
  isHost: boolean;
  members: MultiplayerMemberView[];
  createdAt: string;
  updatedAt: string;
};

export type PublicMultiplayerRoomView = {
  presentation: 'novel' | 'visual';
  code: string;
  name: string;
  status: MultiplayerRoomStatus;
  visibility: "PUBLIC";
  maxPlayers: number;
  memberCount: number;
  turnLimitSeconds: number;
  hostDisplayName: string;
  projectTitle: string;
  createdAt: string;
  updatedAt: string;
};

type RoomRow = Record<string, unknown>;
type MemberRow = Record<string, unknown>;

const DEFAULT_SETTINGS: MultiplayerSettings = {
  textModel: "gpt-6-luna",
  imageModel: "gpt-image-2.5-flare",
  baseUrl: "https://api.openai.com/v1",
  outputContract: "relay-nexus-live-v31",
};

let multiplayerSchemaPromise: Promise<void> | null = null;

export async function ensureMultiplayerSchema() {
  if (process.env.NODE_ENV === "production") return;
  if (multiplayerSchemaPromise) return multiplayerSchemaPromise;
  multiplayerSchemaPromise = (async () => {
    await ensureSimulationSchema();
    const db = await database();
    await db.batch([
      db.prepare(VN_PLAYBACK_SCHEMA),
      db.prepare(`CREATE TABLE IF NOT EXISTS multiplayer_rooms (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        host_account_id TEXT NOT NULL,
        host_owner_key TEXT NOT NULL,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'WAITING',
        visibility TEXT NOT NULL DEFAULT 'PRIVATE',
        max_players REAL NOT NULL DEFAULT 4,
        turn_limit_seconds REAL NOT NULL DEFAULT 120,
        current_member_id TEXT,
        turn_deadline_at TEXT,
        key_recovery_deadline_at TEXT,
        paused_reason TEXT NOT NULL DEFAULT '',
        settings_json TEXT NOT NULL DEFAULT '{}',
        revision REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS multiplayer_members (
        id TEXT PRIMARY KEY NOT NULL,
        room_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        owner_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        seat REAL NOT NULL,
        role TEXT NOT NULL DEFAULT 'PLAYER',
        status TEXT NOT NULL DEFAULT 'JOINED',
        api_key_ready REAL NOT NULL DEFAULT 0,
        joined_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS multiplayer_cost_ledger (
        id TEXT PRIMARY KEY NOT NULL,
        room_id TEXT NOT NULL,
        story_turn REAL NOT NULL,
        payer_account_id TEXT NOT NULL,
        payer_display_name TEXT NOT NULL,
        cause TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        base_url TEXT NOT NULL DEFAULT '',
        input_tokens REAL NOT NULL DEFAULT 0,
        cached_input_tokens REAL NOT NULL DEFAULT 0,
        output_tokens REAL NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        success REAL NOT NULL DEFAULT 1,
        recorded_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS multiplayer_room_events (
        id TEXT PRIMARY KEY NOT NULL,
        room_id TEXT NOT NULL,
        actor_account_id TEXT NOT NULL,
        actor_display_name TEXT NOT NULL,
        type TEXT NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS multiplayer_rooms_host_updated_idx ON multiplayer_rooms (host_account_id, updated_at)"),
      db.prepare("CREATE TABLE IF NOT EXISTS `multiplayer_chat_messages` (\n\t`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`room_id` text NOT NULL,\n\t`account_id` text NOT NULL,\n\t`client_id` text NOT NULL,\n\t`display_name` text NOT NULL,\n\t`body` text NOT NULL,\n\t`created_at` text NOT NULL\n);"),
      db.prepare("CREATE INDEX IF NOT EXISTS `multiplayer_chat_room_seq_idx` ON `multiplayer_chat_messages` (`room_id`,`seq`);"),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS `multiplayer_chat_sender_nonce_idx` ON `multiplayer_chat_messages` (`room_id`,`account_id`,`client_id`);"),
      db.prepare("CREATE TABLE IF NOT EXISTS `multiplayer_cortex_state` (\n\t`room_id` text PRIMARY KEY NOT NULL,\n\t`snapshot_json` text NOT NULL,\n\t`snapshot_r2_key` text,\n\t`snapshot_sha256` text,\n\t`snapshot_byte_length` integer,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`turn` integer DEFAULT 0 NOT NULL,\n\t`claim_token` text,\n\t`claim_account_id` text,\n\t`claim_expires_at` text,\n\t`claim_room_revision` integer,\n\t`claim_cause` text,\n\t`last_commit_token` text,\n\t`updated_at` text NOT NULL\n);"),
      db.prepare("CREATE INDEX IF NOT EXISTS multiplayer_rooms_session_idx ON multiplayer_rooms (session_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS multiplayer_rooms_visibility_updated_idx ON multiplayer_rooms (visibility, updated_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS multiplayer_members_room_seat_idx ON multiplayer_members (room_id, seat)"),
      db.prepare("CREATE INDEX IF NOT EXISTS multiplayer_members_account_idx ON multiplayer_members (account_id, last_seen_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS multiplayer_cost_room_turn_idx ON multiplayer_cost_ledger (room_id, story_turn)"),
      db.prepare("CREATE INDEX IF NOT EXISTS multiplayer_cost_payer_idx ON multiplayer_cost_ledger (payer_account_id, recorded_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS multiplayer_events_room_created_idx ON multiplayer_room_events (room_id, created_at)"),
    ]);
  })().catch((error) => {
    multiplayerSchemaPromise = null;
    throw error;
  });
  return multiplayerSchemaPromise;
}

const roomCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
};

const boundedSettings = (value?: Partial<MultiplayerSettings>): MultiplayerSettings => ({
  presentation: roomPresentation(value?.engine,value?.presentation),
  engine: value?.engine === "cortex" ? "cortex" : "lotus",
  textModel: String(value?.textModel || DEFAULT_SETTINGS.textModel).slice(0, 120),
  imageModel: String(value?.imageModel || DEFAULT_SETTINGS.imageModel).slice(0, 120),
  baseUrl: String(value?.baseUrl || DEFAULT_SETTINGS.baseUrl).slice(0, 500),
  outputContract: String(value?.outputContract || DEFAULT_SETTINGS.outputContract).slice(0, 160),
});

const parseSettings = (value: unknown) => {
  try {
    return boundedSettings(JSON.parse(String(value || "{}")) as Partial<MultiplayerSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const asTurnMember = (row: MemberRow): TurnMember => ({
  id: String(row.id),
  accountId: String(row.account_id),
  seat: Number(row.seat),
  status: String(row.status) as MultiplayerMemberStatus,
});

const roomView = (
  room: RoomRow,
  rows: MemberRow[],
  account: RelayAccountContext,
): MultiplayerRoomView => ({
  id: String(room.id),
  code: String(room.code),
  name: String(room.name),
  status: String(room.status) as MultiplayerRoomStatus,
  visibility: room.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
  maxPlayers: Number(room.max_players),
  turnLimitSeconds: Number(room.turn_limit_seconds),
  currentMemberId: room.current_member_id ? String(room.current_member_id) : null,
  turnDeadlineAt: room.turn_deadline_at ? String(room.turn_deadline_at) : null,
  keyRecoveryDeadlineAt: room.key_recovery_deadline_at ? String(room.key_recovery_deadline_at) : null,
  pausedReason: String(room.paused_reason || ""),
  revision: Number(room.revision || 1),
  settings: parseSettings(room.settings_json),
  isHost: String(room.host_account_id) === account.id,
  members: rows.map((row) => ({
    id: String(row.id),
    displayName: String(row.display_name),
    seat: Number(row.seat),
    role: row.role === "HOST" ? "HOST" : "PLAYER",
    status: String(row.status) as MultiplayerMemberStatus,
    apiKeyReady: Boolean(row.api_key_ready),
    isSelf: String(row.account_id) === account.id,
    lastSeenAt: String(row.last_seen_at),
  })),
  createdAt: String(room.created_at),
  updatedAt: String(room.updated_at),
});

const getRows = async (code: string) => {
  await ensureMultiplayerSchema();
  const db = await database();
  const normalized = code.toUpperCase();
  const [roomResult, memberResult] = await db.batch([
    db.prepare("SELECT * FROM multiplayer_rooms WHERE code = ?").bind(normalized),
    db.prepare(`SELECT m.* FROM multiplayer_members m
      JOIN multiplayer_rooms r ON r.id = m.room_id
      WHERE r.code = ? ORDER BY m.seat ASC`).bind(normalized),
  ]);
  const room = roomResult.results?.[0] as RoomRow | undefined;
  if (!room) return null;
  return { room, members: (memberResult.results ?? []) as MemberRow[] };
};

export const requireMultiplayerMembership = async (account: RelayAccountContext, code: string) => {
  const rows = await getRows(code);
  if (!rows) throw new Error("멀티플레이 방을 찾지 못했습니다.");
  const member = rows.members.find((row) =>
    String(row.account_id) === account.id && !["KICKED", "LEFT"].includes(String(row.status))
  );
  if (!member) throw new Error("이 방에 참가하고 있지 않습니다.");
  return { ...rows, member };
};
const requireMembership = requireMultiplayerMembership;

const event = async (
  roomId: string,
  account: RelayAccountContext,
  type: string,
  detail: Record<string, unknown> = {},
) => (await database()).prepare(`INSERT INTO multiplayer_room_events (
  id, room_id, actor_account_id, actor_display_name, type, detail_json, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
  crypto.randomUUID(), roomId, account.id, account.displayName.slice(0, 160),
  type.slice(0, 80), JSON.stringify(detail).slice(0, 8000), new Date().toISOString(),
).run();

export async function createMultiplayerRoom(account: RelayAccountContext, input: {
  presentation?: 'novel' | 'visual';
  engine?: "cortex" | "lotus";
  sessionId: string;
  projectId?: string;
  startMode?: 'existing' | 'new';
  initialSnapshot?: unknown;
  summaryOnly?: boolean;
  name?: string;
  maxPlayers?: number;
  turnLimitSeconds?: number;
  visibility?: "PUBLIC" | "PRIVATE";
  settings?: Partial<MultiplayerSettings>;
}) {
  await ensureMultiplayerSchema();
  const cortex = input.engine === "cortex";
  const fresh = cortex && input.startMode === 'new';
  const initial = fresh ? validateNewSharedStory(input.initialSnapshot) : null;
  const freshSourceSession = fresh && input.sessionId
    ? await getCortexCloudSession(account.ownerKey, input.sessionId)
    : null;
  const session = fresh ? {project_id:String(input.projectId||''),turn:0} : cortex ? await getCortexCloudSession(account.ownerKey,input.sessionId) : await getOwnedSession(account.ownerKey, input.sessionId);
  if (!session) throw new Error("방에서 사용할 이야기 세션을 찾지 못했습니다.");
  const project = await getOwnedProject(account.ownerKey, String(session.project_id));
  const ownsFreshCortexSource = Boolean(freshSourceSession && String(freshSourceSession.project_id) === String(session.project_id));
  if (!project && (!cortex || (fresh && !ownsFreshCortexSource))) throw new Error("방에서 사용할 작품을 찾지 못했습니다.");
  const db = await database();
  const id = crypto.randomUUID(), memberId = crypto.randomUUID(), now = new Date().toISOString();
  let code = roomCode();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const collision = await db.prepare("SELECT id FROM multiplayer_rooms WHERE code = ?").bind(code).first();
    if (!collision) break;
    code = roomCode();
  }
  const maxPlayers = Math.min(4, Math.max(2, Math.floor(input.maxPlayers || 4)));
  const turnLimitSeconds = Math.min(600, Math.max(30, Math.floor(input.turnLimitSeconds || 120)));
  const settings = boundedSettings({...input.settings,presentation:input.presentation,engine:cortex ? "cortex" : "lotus",...(cortex ? {outputContract:"CORTEX_1.42.0"} : {})});
  const snapshotJson = fresh ? JSON.stringify(initial) : cortex ? JSON.stringify(await readCortexSnapshot(session as Record<string,unknown>)) : null;
  const shared = snapshotJson ? await storeSharedSnapshot(JSON.parse(snapshotJson),{ownerKey:account.ownerKey,projectId:String(session.project_id),sessionId:`multiplayer-${id}`,revision:1}) : null;
  const visibility = input.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE";
  await db.batch([
    db.prepare(`INSERT INTO multiplayer_rooms (
      id, code, name, host_account_id, host_owner_key, project_id, session_id,
      status, visibility, max_players, turn_limit_seconds, current_member_id, settings_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, code, String(input.name || `${account.displayName}의 릴레이 방`).slice(0, 100),
        account.id, account.ownerKey, String(session.project_id), fresh ? `multiplayer-new-${id}` : input.sessionId,
        visibility, maxPlayers, turnLimitSeconds, memberId, JSON.stringify(settings), now, now),
    db.prepare(`INSERT INTO multiplayer_members (
      id, room_id, account_id, owner_key, display_name, seat, role, status,
      api_key_ready, joined_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, 1, 'HOST', 'JOINED', 0, ?, ?)`)
      .bind(memberId, id, account.id, account.ownerKey, account.displayName.slice(0, 160), now, now),
    ...(shared ? [db.prepare(`INSERT INTO multiplayer_cortex_state (room_id,snapshot_json,snapshot_r2_key,snapshot_sha256,snapshot_byte_length,revision,turn,updated_at) VALUES (?,?,?,?,?,1,?,?)`).bind(id,shared.inline,shared.key,shared.sha256,shared.byteLength,Number(session.turn||0),now)] : []),
  ]);
  await event(id, account, "ROOM_CREATED", { code, sessionId: input.sessionId, visibility });
  if(cortex)await ensurePersonalCopies(account.ownerKey,id);
  return getMultiplayerRoom(account, code, !input.summaryOnly);
}

export async function joinMultiplayerRoom(account: RelayAccountContext, code: string, includeStory=true) {
  const access=await getRows(code);
  if(!access || parseSettings(access.room.settings_json).engine!=="cortex")return joinMultiplayerRoomUnlocked(account,code,includeStory);
  const db=await database(),token=crypto.randomUUID(),roomId=String(access.room.id);
  const lock=await db.prepare("UPDATE multiplayer_cortex_state SET claim_token=?,claim_expires_at=? WHERE room_id=? AND (claim_token IS NULL OR claim_expires_at<?)").bind(token,new Date(Date.now()+30000).toISOString(),roomId,new Date().toISOString()).run();
  if(!lock.meta.changes)throw new Error("방 상태를 갱신 중입니다. 잠시 후 다시 참가해 주세요.");
  try{return await joinMultiplayerRoomUnlocked(account,code,includeStory);}finally{await db.prepare("UPDATE multiplayer_cortex_state SET claim_token=NULL,claim_expires_at=NULL WHERE room_id=? AND claim_token=?").bind(roomId,token).run();}
}
async function joinMultiplayerRoomUnlocked(account: RelayAccountContext, code: string, includeStory=true) {
  const rows = await getRows(code);
  if (!rows) throw new Error("참가 코드를 확인해 주세요.");
  const existing = rows.members.find((row) => String(row.account_id) === account.id);
  if (existing && !["KICKED", "LEFT"].includes(String(existing.status))) {
    return getMultiplayerRoom(account, code, includeStory);
  }
  if (String(rows.room.status) !== "WAITING") {
    throw new Error("이야기가 시작된 뒤에는 새로 참가할 수 없습니다. 기존 참가자는 같은 Relay ID로 다시 접속할 수 있습니다.");
  }
  const present = activeMembers(rows.members.map(asTurnMember));
  if (present.length >= Number(rows.room.max_players)) throw new Error("방의 정원이 가득 찼습니다.");
  const now = new Date().toISOString();
  const seat = Math.max(0, ...rows.members.map((row) => Number(row.seat))) + 1;
  const id = existing ? String(existing.id) : crypto.randomUUID();
  const db = await database();
  if (existing) {
    await db.prepare(`UPDATE multiplayer_members SET owner_key = ?, display_name = ?, seat = ?,
      role = 'PLAYER', status = 'JOINED', api_key_ready = 0, joined_at = ?, last_seen_at = ? WHERE id = ?`)
      .bind(account.ownerKey, account.displayName.slice(0, 160), seat, now, now, id).run();
  } else {
    await db.prepare(`INSERT INTO multiplayer_members (
      id, room_id, account_id, owner_key, display_name, seat, role, status,
      api_key_ready, joined_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'PLAYER', 'JOINED', 0, ?, ?)`)
      .bind(id, String(rows.room.id), account.id, account.ownerKey,
        account.displayName.slice(0, 160), seat, now, now).run();
  }
  await event(String(rows.room.id), account, "MEMBER_JOINED", { seat });
  if(parseSettings(rows.room.settings_json).engine==='cortex')await ensurePersonalCopies(account.ownerKey,String(rows.room.id));
  return getMultiplayerRoom(account, code, includeStory);
}

async function expireBlockedMember(account: RelayAccountContext, rows: Awaited<ReturnType<typeof requireMembership>>) {
  if (String(rows.room.status) !== "PAUSED_KEY" ||
      !hasDeadlineExpired(String(rows.room.key_recovery_deadline_at || ""), Date.now())) return;
  const blocked = rows.members.find((row) => String(row.id) === String(rows.room.current_member_id));
  if (!blocked || String(blocked.status) !== "KEY_BLOCKED") return;
  const db = await database(), now = new Date().toISOString();
  await db.prepare("UPDATE multiplayer_members SET status = 'KICKED', api_key_ready = 0, last_seen_at = ? WHERE id = ?")
    .bind(now, String(blocked.id)).run();
  const remaining = activeMembers(rows.members.filter((row) => String(row.id) !== String(blocked.id)).map(asTurnMember));
  const next = remaining[0];
  const status = roomStatusForMemberCount(remaining.length);
  const nextHost = String(rows.room.host_account_id) === String(blocked.account_id) ? next : undefined;
  const deadline = next && status !== "SOLO"
    ? new Date(Date.now() + Number(rows.room.turn_limit_seconds) * 1000).toISOString()
    : null;
  await db.prepare(`UPDATE multiplayer_rooms SET status = ?, current_member_id = ?,
      turn_deadline_at = ?, key_recovery_deadline_at = NULL, paused_reason = '',
      host_account_id = ?, host_owner_key = ?, revision = revision + 1, updated_at = ? WHERE id = ?`)
    .bind(status, next?.id ?? null, deadline,
      nextHost?.accountId ?? String(rows.room.host_account_id),
      nextHost ? String(rows.members.find((row) => String(row.account_id) === nextHost.accountId)?.owner_key || rows.room.host_owner_key) : String(rows.room.host_owner_key),
      now, String(rows.room.id)).run();
  if (nextHost) {
    await db.prepare("UPDATE multiplayer_members SET role = 'HOST' WHERE id = ?")
      .bind(nextHost.id).run();
  }
  await event(String(rows.room.id), account, "KEY_TIMEOUT_KICK", {
    kickedAccountId: String(blocked.account_id), status,
  });
}

export async function getMultiplayerRoom(account: RelayAccountContext, code: string, includeStory = false, options:{after?:number;media?:string;liveAfter?:number;liveId?:string;liveBasis?:unknown;draftAfter?:number;draftRevision?:number;updateBase?:{revision:number;version:string}}={}) {
  let rows = await requireMembership(account, code.toUpperCase());
  let shouldReload = false;
  if(parseSettings(rows.room.settings_json).engine==='cortex'){
    if(rows.room.status==='PAUSED_KEY'&&hasDeadlineExpired(String(rows.room.key_recovery_deadline_at||''),Date.now())){
      const db=await database(),token=crypto.randomUUID(),roomId=String(rows.room.id),now=new Date().toISOString();
      const lock=await db.prepare("UPDATE multiplayer_cortex_state SET claim_token=?,claim_expires_at=? WHERE room_id=? AND (claim_token IS NULL OR claim_expires_at<?)").bind(token,new Date(Date.now()+30000).toISOString(),roomId,now).run();
      if(lock.meta.changes)try{await expireBlockedMember(account,rows);shouldReload=true;}finally{await db.prepare("UPDATE multiplayer_cortex_state SET claim_token=NULL,claim_expires_at=NULL WHERE room_id=? AND claim_token=?").bind(roomId,token).run();}
    }
  }else if(rows.room.status==='PAUSED_KEY'&&hasDeadlineExpired(String(rows.room.key_recovery_deadline_at||''),Date.now())){
    await expireBlockedMember(account, rows);
    shouldReload=true;
  }
  if (shouldReload) rows = await requireMembership(account, code.toUpperCase());
  const db = await database(), now = new Date().toISOString();
  const liveMembers = rows.members.map((member) => String(member.id) === String(rows.member.id)
    ? { ...member, last_seen_at: now }
    : member);
  const view = roomView(rows.room, liveMembers, account);
  if (view.settings.engine === "cortex") {
    const [state,messages,,playback] = await Promise.all([
      db.prepare(includeStory?"SELECT * FROM multiplayer_cortex_state WHERE room_id = ?":"SELECT revision,turn,claim_token,claim_expires_at,claim_room_revision,updated_at FROM multiplayer_cortex_state WHERE room_id = ?").bind(String(rows.room.id)).first() as Promise<Record<string,unknown> | null>,
      options.after!==undefined?readMultiplayerChat(db,String(rows.room.id),account.id,options.after):undefined,
      Date.now()-Date.parse(String(rows.member.last_seen_at||''))>=30000?db.prepare("UPDATE multiplayer_members SET last_seen_at = ? WHERE id = ?").bind(now,String(rows.member.id)).run():undefined,
      view.settings.presentation==='visual'?readVNPlayback(db,String(rows.room.id)):undefined,
    ]);
    if (!state) throw new Error("공유 Cortex 기록을 찾지 못했습니다.");
    const live=options.liveAfter!==undefined?await readLivePresentation(db,String(rows.room.id),state,rows.room,options.liveAfter,options.liveId||'',options.liveBasis):undefined;
    const draft=options.draftAfter!==undefined?await readInputDraft(db,rows.room,state,options.draftAfter,options.draftRevision||0):undefined;
    return {room:view,submission:await readSubmittedInput(db,String(rows.room.id)),cortex:{revision:Number(state.revision),turn:Number(state.turn),generating:Boolean(state.claim_token && String(state.claim_expires_at)>now),updatedAt:String(state.updated_at)},...(playback!==undefined?{playback}:{}),...(live!==undefined?{live}:{}),...(draft!==undefined?{draft}:{}),...(includeStory ? await readSharedSnapshot(state,options.media,options.updateBase) : {}),...(messages?{messages}:{})};
  }
  await db.prepare("UPDATE multiplayer_members SET last_seen_at = ? WHERE id = ?").bind(now, String(rows.member.id)).run();
  if (!includeStory) return { room: view };
  const session = await db.prepare("SELECT * FROM simulation_sessions WHERE id = ?")
    .bind(String(rows.room.session_id)).first<Record<string, unknown>>();
  const project = await db.prepare("SELECT * FROM scenario_projects WHERE id = ?")
    .bind(String(rows.room.project_id)).first<Record<string, unknown>>();
  if (!session || !project) throw new Error("방의 공유 이야기를 찾지 못했습니다.");
  return {
    room: view,
    session: toSessionSummary(session),
    project: toProjectSummary({ ...project, session_count: 1 }),
    snapshot: JSON.parse(await readSessionSnapshotText(session)),
  };
}

export async function listMultiplayerRooms(account: RelayAccountContext) {
  await ensureMultiplayerSchema();
  const db = await database();
  const [roomResult, memberResult] = await db.batch([
    db.prepare(`SELECT r.* FROM multiplayer_rooms r
      JOIN multiplayer_members own ON own.room_id = r.id
      WHERE own.account_id = ? AND own.status NOT IN ('KICKED', 'LEFT')
      ORDER BY r.updated_at DESC LIMIT 20`).bind(account.id),
    db.prepare(`SELECT member.* FROM multiplayer_members member
      WHERE member.room_id IN (
        SELECT r.id FROM multiplayer_rooms r
        JOIN multiplayer_members own ON own.room_id = r.id
        WHERE own.account_id = ? AND own.status NOT IN ('KICKED', 'LEFT')
        ORDER BY r.updated_at DESC LIMIT 20
      ) ORDER BY member.room_id, member.seat`).bind(account.id),
  ]);
  const membersByRoom = new Map<string, MemberRow[]>();
  for (const member of (memberResult.results ?? []) as MemberRow[]) {
    const roomId = String(member.room_id);
    membersByRoom.set(roomId, [...(membersByRoom.get(roomId) ?? []), member]);
  }
  return ((roomResult.results ?? []) as RoomRow[]).map((room) => roomView(room, membersByRoom.get(String(room.id)) ?? [], account));
}

export async function listPublicMultiplayerRooms(): Promise<PublicMultiplayerRoomView[]> {
  await ensureMultiplayerSchema();
  const result = await (await database()).prepare(`SELECT
      r.code, r.name, r.status, r.visibility, r.max_players, r.turn_limit_seconds, r.settings_json,
      r.created_at, r.updated_at, a.display_name AS host_display_name,
      p.title AS project_title,
      SUM(CASE WHEN m.status NOT IN ('KICKED', 'LEFT') THEN 1 ELSE 0 END) AS member_count
    FROM multiplayer_rooms r
    LEFT JOIN relay_accounts a ON a.id = r.host_account_id
    LEFT JOIN scenario_projects p ON p.id = r.project_id
    LEFT JOIN multiplayer_members m ON m.room_id = r.id
    WHERE r.visibility = 'PUBLIC' AND r.status = 'WAITING'
    GROUP BY r.id
    HAVING member_count < r.max_players
    ORDER BY r.updated_at DESC
    LIMIT 50`).all<Record<string, unknown>>();
  return (result.results ?? []).map((row) => ({
    presentation: parseSettings(row.settings_json).presentation || 'novel',
    code: String(row.code),
    name: String(row.name),
    status: String(row.status) as MultiplayerRoomStatus,
    visibility: "PUBLIC" as const,
    maxPlayers: Number(row.max_players),
    memberCount: Number(row.member_count || 0),
    turnLimitSeconds: Number(row.turn_limit_seconds),
    hostDisplayName: String(row.host_display_name || "Relay 플레이어"),
    projectTitle: String(row.project_title || "Relay Novel"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function updateMultiplayerRoom(account: RelayAccountContext, code: string, action: string, body: Record<string, unknown>) {
  const access = await requireMembership(account,code.toUpperCase());
  if (action === 'turn_limit') {
    const seconds = Number(body.turnLimitSeconds);
    if (String(access.room.host_account_id) !== account.id) throw new Error('방장만 멀티 설정을 바꿀 수 있습니다.');
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 600) throw new Error('턴 제한시간은 30~600초로 설정해 주세요.');
    // This changes only the policy for the next deadline, not today's claim or
    // current countdown. Do not bump room revision and invalidate a writer.
    const result = await (await database()).prepare("UPDATE multiplayer_rooms SET turn_limit_seconds=?,updated_at=? WHERE id=? AND host_account_id=? AND status<>'CLOSED'")
      .bind(seconds,new Date().toISOString(),String(access.room.id),account.id).run();
    if (!result.meta.changes) throw new Error('종료된 방의 설정은 바꿀 수 없습니다.');
    return { room: roomView({...access.room,turn_limit_seconds:seconds},access.members,account) };
  }
  if (action === "ready") {
    if (String(access.room.status) !== "WAITING") throw new Error("준비 상태는 대기실에서만 변경할 수 있습니다.");
    const db = await database(), now = new Date().toISOString();
    const ready = body.ready !== false;
    const status = ready ? "READY" : "JOINED";
    const eventId = crypto.randomUUID();
    const [update] = await db.batch([
      db.prepare(`UPDATE multiplayer_members SET status = ?, api_key_ready = ?, last_seen_at = ?
        WHERE id = ? AND EXISTS (
          SELECT 1 FROM multiplayer_rooms WHERE id = ? AND status = 'WAITING'
        )`).bind(status, body.apiKeyReady ? 1 : 0, now, String(access.member.id), String(access.room.id)),
      db.prepare(`INSERT INTO multiplayer_room_events (
        id, room_id, actor_account_id, actor_display_name, type, detail_json, created_at
      ) SELECT ?, ?, ?, ?, 'READY', ?, ? WHERE EXISTS (
        SELECT 1 FROM multiplayer_rooms WHERE id = ? AND status = 'WAITING'
      )`).bind(eventId, String(access.room.id), account.id, account.displayName.slice(0, 160), JSON.stringify(body).slice(0, 8000), now, String(access.room.id)),
    ]);
    if (!update.meta.changes) throw new Error("이야기가 이미 시작되어 준비 상태를 바꿀 수 없습니다.");
    const members = access.members.map((member) => String(member.id) === String(access.member.id)
      ? { ...member, status, api_key_ready: body.apiKeyReady ? 1 : 0, last_seen_at: now }
      : member);
    return { room: roomView(access.room, members, account), ready };
  }
  if (parseSettings(access.room.settings_json).engine !== "cortex" || action === "presence") return updateMultiplayerRoomUnlocked(account,code,action,body,access);
  const db=await database(),token=crypto.randomUUID(),now=new Date().toISOString();
  const lock=await db.prepare(`UPDATE multiplayer_cortex_state SET claim_token=?,claim_account_id=?,claim_expires_at=? WHERE room_id=? AND (claim_token IS NULL OR claim_expires_at < ?)`)
    .bind(token,account.id,new Date(Date.now()+30000).toISOString(),String(access.room.id),now).run();
  if(!lock.meta.changes)throw new Error("현재 비트를 생성·저장 중입니다. 완료 후 다시 시도해 주세요.");
  try{return await updateMultiplayerRoomUnlocked(account,code,action,body,access);}finally{await db.prepare("UPDATE multiplayer_cortex_state SET claim_token=NULL,claim_account_id=NULL,claim_expires_at=NULL WHERE room_id=? AND claim_token=?").bind(String(access.room.id),token).run();}
}

async function updateMultiplayerRoomUnlocked(account: RelayAccountContext, code: string, action: string, body: Record<string, unknown>, prefetched?: Awaited<ReturnType<typeof requireMembership>>) {
  const rows = prefetched ?? await requireMembership(account, code.toUpperCase());
  const roomId = String(rows.room.id), memberId = String(rows.member.id);
  const isHost = String(rows.room.host_account_id) === account.id;
  const db = await database(), now = new Date().toISOString();
  if (action === "presence") {
    await db.prepare("UPDATE multiplayer_members SET api_key_ready = ?, last_seen_at = ? WHERE id = ?")
      .bind(body.apiKeyReady ? 1 : 0, now, memberId).run();
  } else if (action === "ready") {
    if(String(rows.room.status)!=="WAITING")throw new Error("준비 상태는 대기실에서만 변경할 수 있습니다.");
    await db.prepare("UPDATE multiplayer_members SET status = ?, api_key_ready = ?, last_seen_at = ? WHERE id = ?")
      .bind(body.ready === false ? "JOINED" : "READY", body.apiKeyReady ? 1 : 0, now, memberId).run();
  } else if (action === "settings") {
    if(parseSettings(rows.room.settings_json).engine==='cortex')throw new Error("Cortex 방은 패키지의 엔진 설정을 유지합니다.");
    if (!isHost || String(rows.room.status) !== "WAITING") throw new Error("대기 중인 방의 방장만 설정을 바꿀 수 있습니다.");
    const settings = boundedSettings({...body.settings as Partial<MultiplayerSettings>,engine:"lotus"});
    const turnLimitSeconds = Math.min(600, Math.max(30, Math.floor(Number(body.turnLimitSeconds || rows.room.turn_limit_seconds))));
    await db.prepare("UPDATE multiplayer_rooms SET settings_json = ?, turn_limit_seconds = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(settings), turnLimitSeconds, now, roomId).run();
  } else if (action === "start") {
    if(String(rows.room.status)!=="WAITING")throw new Error("이미 시작된 방입니다.");
    if (!isHost) throw new Error("방장만 이야기를 시작할 수 있습니다.");
    const refreshed = await requireMembership(account, code.toUpperCase());
    const members = refreshed.members.map((row) => ({ ...asTurnMember(row), apiKeyReady: Boolean(row.api_key_ready) }));
    if (!canStartRoom(members)) throw new Error("2명 이상이 API 키 연결과 준비를 마쳐야 시작할 수 있습니다.");
    const first = activeMembers(members)[0];
    await db.prepare(`UPDATE multiplayer_rooms SET status = 'ACTIVE', current_member_id = ?,
      turn_deadline_at = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND status = 'WAITING'
      AND (SELECT COUNT(*) FROM multiplayer_members WHERE room_id = ? AND status = 'READY' AND api_key_ready = 1) >= 2
      AND NOT EXISTS (SELECT 1 FROM multiplayer_members WHERE room_id = ? AND status NOT IN ('LEFT','KICKED') AND (status <> 'READY' OR api_key_ready <> 1))`)
      .bind(first.id, new Date(Date.now() + Number(rows.room.turn_limit_seconds) * 1000).toISOString(), now, roomId, roomId, roomId).run().then(result=>{if(!result.meta.changes)throw new Error('참가자의 준비 상태가 변경되었습니다. 모두 준비한 뒤 다시 시작해 주세요.');});
  } else if (action === "key_failed") {
    if (String(rows.room.current_member_id) !== memberId) throw new Error("현재 턴 플레이어만 키 오류 복구를 시작할 수 있습니다.");
    await db.batch([
      db.prepare("UPDATE multiplayer_members SET status = 'KEY_BLOCKED', api_key_ready = 0, last_seen_at = ? WHERE id = ?").bind(now, memberId),
      db.prepare(`UPDATE multiplayer_rooms SET status = 'PAUSED_KEY', turn_deadline_at = NULL,
        key_recovery_deadline_at = ?, paused_reason = 'API_KEY_INVALID', revision = revision + 1, updated_at = ? WHERE id = ?`)
        .bind(keyRecoveryDeadline(Date.now()), now, roomId),
    ]);
  } else if (action === "retry") {
    if (!isHost) throw new Error("방장만 키 복구 재시도를 승인할 수 있습니다.");
    const current = rows.members.find((row) => String(row.id) === String(rows.room.current_member_id));
    if (!current) throw new Error("복구할 현재 플레이어가 없습니다.");
    if (!Boolean(current.api_key_ready)) throw new Error("현재 플레이어가 새 API 키 연결을 완료하지 않았습니다.");
    await db.batch([
      db.prepare("UPDATE multiplayer_members SET status = 'READY', api_key_ready = 1, last_seen_at = ? WHERE id = ?").bind(now, String(current.id)),
      db.prepare(`UPDATE multiplayer_rooms SET status = 'ACTIVE', turn_deadline_at = ?,
        key_recovery_deadline_at = NULL, paused_reason = '', revision = revision + 1, updated_at = ? WHERE id = ?`)
        .bind(new Date(Date.now() + Number(rows.room.turn_limit_seconds) * 1000).toISOString(), now, roomId),
    ]);
  } else if (action === "skip") {
    if (!isHost) throw new Error("방장만 해당 플레이어를 건너뛸 수 있습니다.");
    const next = nextTurnMember(rows.members.map(asTurnMember), String(rows.room.current_member_id));
    if (!next) throw new Error("다음 참가자가 없습니다.");
    await db.prepare(`UPDATE multiplayer_rooms SET status = ?, current_member_id = ?, turn_deadline_at = ?,
      key_recovery_deadline_at = NULL, paused_reason = '', revision = revision + 1, updated_at = ? WHERE id = ?`)
      .bind(roomStatusForMemberCount(activeMembers(rows.members.map(asTurnMember)).length), next.id,
        new Date(Date.now() + Number(rows.room.turn_limit_seconds) * 1000).toISOString(), now, roomId).run();
  } else if (action === "kick") {
    if (!isHost) throw new Error("방장만 참가자를 내보낼 수 있습니다.");
    const targetId = String(body.memberId || "");
    const target = rows.members.find((row) => String(row.id) === targetId);
    if (!target || ["KICKED", "LEFT"].includes(String(target.status))) throw new Error("내보낼 참가자를 찾지 못했습니다.");
    if (String(target.account_id) === String(rows.room.host_account_id)) throw new Error("방장은 자신을 강퇴할 수 없습니다. 방 나가기를 사용해 주세요.");
    await db.prepare("UPDATE multiplayer_members SET status = 'KICKED', api_key_ready = 0, last_seen_at = ? WHERE id = ?")
      .bind(now, targetId).run();
    const remaining = activeMembers(rows.members.filter((row) => String(row.id) !== targetId).map(asTurnMember));
    const targetWasCurrent = targetId === String(rows.room.current_member_id);
    const next = targetWasCurrent
      ? nextTurnMember(remaining, targetId) ?? remaining[0]
      : remaining.find((member) => member.id === String(rows.room.current_member_id)) ?? remaining[0];
    const status = String(rows.room.status) === "WAITING"
      ? "WAITING"
      : roomStatusForMemberCount(remaining.length);
    await db.prepare(`UPDATE multiplayer_rooms SET status = ?, current_member_id = ?,
      turn_deadline_at = ?, key_recovery_deadline_at = NULL, paused_reason = '',
      revision = revision + 1, updated_at = ? WHERE id = ?`)
      .bind(status, next?.id ?? null,
        status === "ACTIVE" ? new Date(Date.now() + Number(rows.room.turn_limit_seconds) * 1000).toISOString() : null,
        now, roomId).run();
  } else if (action === "close") {
    if (!isHost) throw new Error("방장만 방을 종료할 수 있습니다.");
    await db.prepare(`UPDATE multiplayer_rooms SET status = 'CLOSED', current_member_id = NULL,
      turn_deadline_at = NULL, key_recovery_deadline_at = NULL, paused_reason = '',
      revision = revision + 1, updated_at = ? WHERE id = ?`).bind(now, roomId).run();
  } else if (action === "leave") {
    await db.prepare("UPDATE multiplayer_members SET status = 'LEFT', api_key_ready = 0, last_seen_at = ? WHERE id = ?").bind(now, memberId).run();
    const remaining = activeMembers(rows.members.filter((row) => String(row.id) !== memberId).map(asTurnMember));
    const status = roomStatusForMemberCount(remaining.length), next = remaining[0];
    const promoted = isHost && next
      ? rows.members.find((row) => String(row.id) === next.id)
      : undefined;
    await db.prepare(`UPDATE multiplayer_rooms SET status = ?, current_member_id = ?, turn_deadline_at = ?,
      host_account_id = ?, host_owner_key = ?, revision = revision + 1, updated_at = ? WHERE id = ?`).bind(status, next?.id ?? null,
      status === "ACTIVE" ? new Date(Date.now() + Number(rows.room.turn_limit_seconds) * 1000).toISOString() : null,
      promoted ? String(promoted.account_id) : String(rows.room.host_account_id),
      promoted ? String(promoted.owner_key) : String(rows.room.host_owner_key),
      now, roomId).run();
    if (promoted) {
      await db.prepare("UPDATE multiplayer_members SET role = 'HOST' WHERE id = ?")
        .bind(String(promoted.id)).run();
    }
  } else {
    throw new Error("지원하지 않는 방 작업입니다.");
  }
  await event(roomId, account, action.toUpperCase(), body);
  if(action==="leave")return {room:roomView(rows.room,rows.members,account),left:true};
  return getMultiplayerRoom(account, code.toUpperCase(), false);
}

export async function assertMultiplayerTurn(account: RelayAccountContext, code: string, cause: MultiplayerCallCause) {
  const rows = await requireMembership(account, code.toUpperCase());
  const current = rows.members.find((row) => String(row.id) === String(rows.room.current_member_id));
  if (!current) throw new Error("현재 턴 플레이어를 찾지 못했습니다.");
  if (!["ACTIVE", "SOLO", "PAUSED_KEY"].includes(String(rows.room.status))) throw new Error("아직 시작되지 않은 방입니다.");
  const payerId = payerAccountIdForCall({ cause, currentPlayerAccountId: String(current.account_id), hostAccountId: String(rows.room.host_account_id) });
  if (cause === "HOST_FORCE") {
    if (String(rows.room.host_account_id) !== account.id) throw new Error("방장만 방장 비용 강제 진행을 실행할 수 있습니다.");
  } else if (String(current.account_id) !== account.id) {
    throw new Error("현재는 다른 참가자의 차례입니다.");
  }
  if (payerId !== account.id) throw new Error("현재 호출 비용을 부담할 계정과 요청 계정이 다릅니다.");
  return { room: rows.room, current, member: rows.member, payerAccountId: payerId };
}

export async function recordMultiplayerTurn(account: RelayAccountContext, code: string, input: {
  cause: MultiplayerCallCause;
  storyTurn: number;
  usage?: Record<string, unknown>;
}) {
  const access = await assertMultiplayerTurn(account, code, input.cause);
  const rows = await requireMembership(account, code.toUpperCase());
  const next = nextTurnMember(rows.members.map(asTurnMember), String(rows.room.current_member_id));
  const present = activeMembers(rows.members.map(asTurnMember));
  const status = roomStatusForMemberCount(present.length);
  const now = new Date().toISOString(), settings = parseSettings(rows.room.settings_json);
  const usage = input.usage ?? {};
  await (await database()).batch([
    (await database()).prepare(`INSERT INTO multiplayer_cost_ledger (
      id, room_id, story_turn, payer_account_id, payer_display_name, cause,
      model, base_url, input_tokens, cached_input_tokens, output_tokens,
      estimated_cost_usd, success, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .bind(crypto.randomUUID(), String(rows.room.id), input.storyTurn, account.id,
        account.displayName.slice(0, 160), input.cause, settings.textModel, settings.baseUrl,
        Number(usage.inputTokens ?? 0), Number(usage.cachedInputTokens ?? 0),
        Number(usage.outputTokens ?? 0), Number(usage.estimatedCostUsd ?? 0), now),
    (await database()).prepare(`UPDATE multiplayer_rooms SET status = ?, current_member_id = ?,
      turn_deadline_at = ?, key_recovery_deadline_at = NULL, paused_reason = '',
      revision = revision + 1, updated_at = ? WHERE id = ?`)
      .bind(status, next?.id ?? String(rows.room.current_member_id),
        status === "ACTIVE" ? new Date(Date.now() + Number(rows.room.turn_limit_seconds) * 1000).toISOString() : null,
        now, String(rows.room.id)),
  ]);
  await event(String(rows.room.id), account, "TURN_COMMITTED", {
    storyTurn: input.storyTurn, cause: input.cause, payerAccountId: access.payerAccountId,
  });
  return getMultiplayerRoom(account, code.toUpperCase(), false);
}

export async function saveMultiplayerTurn(account: RelayAccountContext, code: string, input: {
  cause: MultiplayerCallCause;
  expectedRevision: number;
  snapshot: Record<string, unknown>;
  usage?: Record<string, unknown>;
}) {
  const access = await assertMultiplayerTurn(account, code, input.cause);
  const sessionId = String(access.room.session_id);
  const db = await database();
  const existing = await db.prepare("SELECT * FROM simulation_sessions WHERE id = ?")
    .bind(sessionId).first<Record<string, unknown>>();
  if (!existing) throw new Error("방의 공유 세션을 찾지 못했습니다.");
  if (Number(existing.revision ?? 1) !== input.expectedRevision) {
    return {
      conflict: true as const,
      serverRevision: Number(existing.revision ?? 1),
      session: toSessionSummary(existing),
    };
  }
  const state = input.snapshot.state as Record<string, unknown> | undefined;
  if (!state || !Array.isArray(input.snapshot.turns)) throw new Error("공유 세션 상태 형식이 올바르지 않습니다.");
  const snapshot = optimizeConversationSnapshot(input.snapshot as never) as unknown as Record<string, unknown>;
  const snapshotJson = safeJsonText(snapshot, 48 * 1024 * 1024);
  const nextRevision = input.expectedRevision + 1;
  const pointer = await storeRuntimeJson({
    ownerKey: String(access.room.host_owner_key),
    projectId: String(access.room.project_id),
    sessionId,
    category: "revision",
    revision: nextRevision,
    value: snapshotJson,
  });
  const now = new Date().toISOString();
  const update = await db.prepare(`UPDATE simulation_sessions SET
    snapshot_json = ?, snapshot_r2_key = ?, snapshot_sha256 = ?, snapshot_byte_length = ?,
    turn = ?, day = ?, location = ?, preview = ?, total_cost_usd = ?, last_mode = ?,
    revision = revision + 1, last_writer_id = ?, updated_at = ?, last_played_at = ?
    WHERE id = ? AND revision = ?`).bind(
      R2_JSON_POINTER, pointer.key, pointer.sha256, pointer.byteLength,
      Number(state.turn ?? 0), Number(state.day ?? 0), String(state.location ?? "").slice(0, 240),
      compactPreview(snapshot), Number(snapshot.totalCostUsd ?? 0), snapshot.lastMode === "luna" ? "luna" : "mock",
      `multiplayer:${account.id}`, now, now, sessionId, input.expectedRevision,
    ).run();
  if (!update.meta.changes) {
    await deleteRuntimeObject(pointer.key).catch(() => undefined);
    const current = await db.prepare("SELECT * FROM simulation_sessions WHERE id = ?").bind(sessionId).first<Record<string, unknown>>();
    return { conflict: true as const, serverRevision: Number(current?.revision ?? nextRevision), session: current ? toSessionSummary(current) : null };
  }
  await deleteRuntimeObject(String(existing.snapshot_r2_key ?? "")).catch(() => undefined);
  const advancedStoryTurn = Number(state.turn ?? 0) > Number(existing.turn ?? 0);
  const roomResult = advancedStoryTurn
    ? await recordMultiplayerTurn(account, code, {
        cause: input.cause,
        storyTurn: Number(state.turn ?? 0),
        usage: input.usage,
      })
    : await getMultiplayerRoom(account, code.toUpperCase(), false);
  const updated = await db.prepare("SELECT * FROM simulation_sessions WHERE id = ?").bind(sessionId).first<Record<string, unknown>>();
  return { conflict: false as const, session: updated ? toSessionSummary(updated) : null, ...roomResult };
}

export async function listMultiplayerCosts(account: RelayAccountContext, code: string) {
  const rows = await requireMembership(account, code.toUpperCase());
  const result = await (await database()).prepare(`SELECT * FROM multiplayer_cost_ledger
    WHERE room_id = ? ORDER BY recorded_at DESC LIMIT 100`).bind(String(rows.room.id)).all<Record<string, unknown>>();
  return (result.results ?? []).map((row) => ({
    id: String(row.id), storyTurn: Number(row.story_turn), payerAccountId: String(row.payer_account_id),
    payerDisplayName: String(row.payer_display_name), cause: String(row.cause), model: String(row.model),
    baseUrl: String(row.base_url), inputTokens: Number(row.input_tokens), cachedInputTokens: Number(row.cached_input_tokens),
    outputTokens: Number(row.output_tokens), estimatedCostUsd: Number(row.estimated_cost_usd),
    success: Boolean(row.success), recordedAt: String(row.recorded_at),
  }));
}
