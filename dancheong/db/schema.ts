import { index, integer, real, sqliteTable, text, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

export const multiplayerCortexLive = sqliteTable("multiplayer_cortex_live", {
  roomId: text("room_id").primaryKey(),
  token: text("token").notNull(),
  seq: integer("seq").notNull(),
  payloadJson: text("payload_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const multiplayerCortexState = sqliteTable("multiplayer_cortex_state", {
  roomId: text("room_id").primaryKey(),
  snapshotJson: text("snapshot_json").notNull(),
  snapshotR2Key: text("snapshot_r2_key"),
  snapshotSha256: text("snapshot_sha256"),
  snapshotByteLength: integer("snapshot_byte_length"),
  revision: integer("revision").notNull().default(1),
  turn: integer("turn").notNull().default(0),
  claimToken: text("claim_token"),
  claimAccountId: text("claim_account_id"),
  claimExpiresAt: text("claim_expires_at"),
  claimRoomRevision: integer("claim_room_revision"),
  claimCause: text("claim_cause"),
  lastCommitToken: text("last_commit_token"),
  updatedAt: text("updated_at").notNull(),
});

export const multiplayerChatMessages = sqliteTable("multiplayer_chat_messages", {
  seq: integer("seq").primaryKey({autoIncrement:true}),
  roomId: text("room_id").notNull(),
  accountId: text("account_id").notNull(),
  clientId: text("client_id").notNull(),
  displayName: text("display_name").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("multiplayer_chat_room_seq_idx").on(table.roomId,table.seq),uniqueIndex("multiplayer_chat_sender_nonce_idx").on(table.roomId,table.accountId,table.clientId)]);

export const scenarioProjects = sqliteTable(
  "scenario_projects",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    sourceProjectId: text("source_project_id").notNull(),
    title: text("title").notNull(),
    genre: text("genre").notNull().default(""),
    playerName: text("player_name").notNull().default(""),
    packageVersion: text("package_version").notNull().default("unknown"),
    projectRevision: real("project_revision").notNull().default(1),
    packageFingerprint: text("package_fingerprint").notNull().default("legacy"),
    packJson: text("pack_json").notNull(),
    packR2Key: text("pack_r2_key"),
    packSha256: text("pack_sha256"),
    packByteLength: real("pack_byte_length"),
    r2Key: text("r2_key"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("scenario_projects_owner_updated_idx").on(
      table.ownerKey,
      table.updatedAt,
    ),
  ],
);

export const simulationSessions = sqliteTable(
  "simulation_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    ownerKey: text("owner_key").notNull(),
    name: text("name").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    snapshotR2Key: text("snapshot_r2_key"),
    snapshotSha256: text("snapshot_sha256"),
    snapshotByteLength: real("snapshot_byte_length"),
    turn: real("turn").notNull().default(0),
    day: real("day").notNull().default(0),
    location: text("location").notNull().default(""),
    preview: text("preview").notNull().default("아직 시작하지 않은 이야기"),
    totalCostUsd: real("total_cost_usd").notNull().default(0),
    lastMode: text("last_mode").notNull().default("mock"),
    revision: real("revision").notNull().default(1),
    projectRevision: real("project_revision").notNull().default(1),
    packageFingerprint: text("package_fingerprint").notNull().default("legacy"),
    lastWriterId: text("last_writer_id").notNull().default("unknown"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastPlayedAt: text("last_played_at").notNull(),
  },
  (table) => [
    index("simulation_sessions_owner_played_idx").on(
      table.ownerKey,
      table.lastPlayedAt,
    ),
    index("simulation_sessions_project_idx").on(table.projectId),
  ],
);

export const cortexCloudSessions = sqliteTable(
  "cortex_cloud_sessions",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    projectId: text("project_id").notNull(),
    sourceProjectId: text("source_project_id").notNull().default(""),
    name: text("name").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    snapshotR2Key: text("snapshot_r2_key"),
    snapshotSha256: text("snapshot_sha256"),
    snapshotByteLength: real("snapshot_byte_length"),
    turn: real("turn").notNull().default(0),
    location: text("location").notNull().default(""),
    preview: text("preview").notNull().default("아직 시작하지 않은 이야기"),
    revision: real("revision").notNull().default(1),
    lastWriterId: text("last_writer_id").notNull().default("unknown"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("cortex_cloud_sessions_owner_updated_idx").on(table.ownerKey, table.updatedAt),
    index("cortex_cloud_sessions_project_idx").on(table.projectId),
  ],
);

export const cortexSessionLeases = sqliteTable(
  "cortex_session_leases",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    deviceId: text("device_id").notNull().default("unknown"),
    clientId: text("client_id").notNull(),
    epoch: text("epoch").notNull().default(""),
    expiresAt: text("expires_at").notNull(),
    takeoverClientId: text("takeover_client_id").notNull().default(""),
    takeoverRequestedAt: text("takeover_requested_at").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("cortex_session_leases_owner_expiry_idx").on(table.ownerKey, table.expiresAt),
  ],
);

export const sessionCheckpoints = sqliteTable(
  "session_checkpoints",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    sessionId: text("session_id").notNull(),
    projectId: text("project_id").notNull(),
    revision: real("revision").notNull(),
    kind: text("kind").notNull().default("AUTO"),
    label: text("label").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    snapshotR2Key: text("snapshot_r2_key"),
    snapshotSha256: text("snapshot_sha256"),
    snapshotByteLength: real("snapshot_byte_length"),
    turn: real("turn").notNull().default(0),
    sourceDeviceId: text("source_device_id").notNull().default("unknown"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("session_checkpoints_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
    index("session_checkpoints_owner_created_idx").on(
      table.ownerKey,
      table.createdAt,
    ),
  ],
);

export const packageUploads = sqliteTable(
  "package_uploads",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    r2Key: text("r2_key").notNull(),
    r2UploadId: text("r2_upload_id").notNull(),
    originalName: text("original_name").notNull(),
    sizeBytes: real("size_bytes").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("package_uploads_owner_created_idx").on(
      table.ownerKey,
      table.createdAt,
    ),
  ],
);

export const projectThumbnails = sqliteTable(
  "project_thumbnails",
  {
    projectId: text("project_id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    r2Key: text("r2_key").notNull(),
    contentType: text("content_type").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("project_thumbnails_owner_idx").on(table.ownerKey),
  ],
);

export const costMeterTurns = sqliteTable(
  "cost_meter_turns",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    projectId: text("project_id").notNull(),
    sessionId: text("session_id").notNull(),
    turnId: text("turn_id").notNull(),
    appVersion: text("app_version").notNull(),
    telemetryJson: text("telemetry_json").notNull(),
    recordedAt: text("recorded_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("cost_meter_turns_owner_recorded_idx").on(
      table.ownerKey,
      table.recordedAt,
    ),
    index("cost_meter_turns_session_idx").on(table.sessionId),
  ],
);

export const costMeterBackfillState = sqliteTable("cost_meter_backfill_state", {
  ownerKey: text("owner_key").primaryKey(),
  completedAt: text("completed_at").notNull(),
});

export const liveReliabilityAttempts = sqliteTable(
  "live_reliability_attempts",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    projectId: text("project_id").notNull(),
    sessionId: text("session_id").notNull(),
    appVersion: text("app_version").notNull(),
    telemetryJson: text("telemetry_json").notNull(),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [
    index("live_reliability_owner_recorded_idx").on(table.ownerKey, table.recordedAt),
    index("live_reliability_session_idx").on(table.sessionId, table.recordedAt),
  ],
);

export const relayAccounts = sqliteTable(
  "relay_accounts",
  {
    id: text("id").primaryKey(),
    emailKey: text("email_key").notNull().unique(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("USER"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [index("relay_accounts_role_idx").on(table.role, table.lastSeenAt)],
);

export const relayAccountMigrations = sqliteTable("relay_account_migrations", {
  migrationKey: text("migration_key").primaryKey(),
  accountId: text("account_id").notNull(),
  detailJson: text("detail_json").notNull(),
  completedAt: text("completed_at").notNull(),
});

export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    actorAccountId: text("actor_account_id").notNull(),
    actorDisplayName: text("actor_display_name").notNull(),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    detailJson: text("detail_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("admin_audit_logs_created_idx").on(table.createdAt),
    index("admin_audit_logs_actor_idx").on(table.actorAccountId, table.createdAt),
  ],
);

export const multiplayerRooms = sqliteTable(
  "multiplayer_rooms",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    hostAccountId: text("host_account_id").notNull(),
    hostOwnerKey: text("host_owner_key").notNull(),
    projectId: text("project_id").notNull(),
    sessionId: text("session_id").notNull(),
    status: text("status").notNull().default("WAITING"),
    visibility: text("visibility").notNull().default("PRIVATE"),
    maxPlayers: real("max_players").notNull().default(4),
    turnLimitSeconds: real("turn_limit_seconds").notNull().default(120),
    currentMemberId: text("current_member_id"),
    turnDeadlineAt: text("turn_deadline_at"),
    keyRecoveryDeadlineAt: text("key_recovery_deadline_at"),
    pausedReason: text("paused_reason").notNull().default(""),
    settingsJson: text("settings_json").notNull().default("{}"),
    revision: real("revision").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("multiplayer_rooms_host_updated_idx").on(table.hostAccountId, table.updatedAt),
    index("multiplayer_rooms_session_idx").on(table.sessionId),
    index("multiplayer_rooms_visibility_updated_idx").on(table.visibility, table.updatedAt),
  ],
);

export const multiplayerMembers = sqliteTable(
  "multiplayer_members",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    accountId: text("account_id").notNull(),
    ownerKey: text("owner_key").notNull(),
    displayName: text("display_name").notNull(),
    seat: real("seat").notNull(),
    role: text("role").notNull().default("PLAYER"),
    status: text("status").notNull().default("JOINED"),
    apiKeyReady: real("api_key_ready").notNull().default(0),
    joinedAt: text("joined_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    index("multiplayer_members_room_seat_idx").on(table.roomId, table.seat),
    index("multiplayer_members_account_idx").on(table.accountId, table.lastSeenAt),
    index("multiplayer_members_owner_idx").on(table.ownerKey),
  ],
);

export const multiplayerCostLedger = sqliteTable(
  "multiplayer_cost_ledger",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    storyTurn: real("story_turn").notNull(),
    payerAccountId: text("payer_account_id").notNull(),
    payerDisplayName: text("payer_display_name").notNull(),
    cause: text("cause").notNull(),
    model: text("model").notNull().default(""),
    baseUrl: text("base_url").notNull().default(""),
    inputTokens: real("input_tokens").notNull().default(0),
    cachedInputTokens: real("cached_input_tokens").notNull().default(0),
    outputTokens: real("output_tokens").notNull().default(0),
    estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
    success: real("success").notNull().default(1),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [
    index("multiplayer_cost_room_turn_idx").on(table.roomId, table.storyTurn),
    index("multiplayer_cost_payer_idx").on(table.payerAccountId, table.recordedAt),
  ],
);

export const multiplayerRoomEvents = sqliteTable(
  "multiplayer_room_events",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    actorAccountId: text("actor_account_id").notNull(),
    actorDisplayName: text("actor_display_name").notNull(),
    type: text("type").notNull(),
    detailJson: text("detail_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("multiplayer_events_room_created_idx").on(table.roomId, table.createdAt)],
);

// Visual-novel slots are scoped by the main account and session.
export const vnCloudSlots = sqliteTable("vn_cloud_slots", {
  owner: text("owner").notNull(), slot: text("slot").notNull(),
  revision: text("revision").notNull(), mutation: text("mutation").notNull(),
  objectKey: text("object_key").notNull(), previousKey: text("previous_key"),
  summary: text("summary").notNull(), bytes: integer("bytes").notNull(),
  checksum: text("checksum").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [primaryKey({ columns: [table.owner, table.slot] })]);

export const vnCloudObjects = sqliteTable('vn_cloud_objects', {
  owner: text('owner').notNull(), digest: text('digest').notNull(),
  bytes: integer('bytes').notNull(), createdAt: text('created_at').notNull(),
}, table => [primaryKey({ columns: [table.owner, table.digest] })]);

export const multiplayerVisualAssets = sqliteTable('multiplayer_visual_assets', {
  roomId:text('room_id').notNull(), key:text('key').notNull(), kind:text('kind').notNull(), status:text('status').notNull(),
  token:text('token').notNull(), accountId:text('account_id').notNull(), expiresAt:text('expires_at').notNull(),
  objectKey:text('object_key'), bytes:integer('bytes').notNull().default(0), updatedAt:text('updated_at').notNull(),
},table=>[primaryKey({columns:[table.roomId,table.key]})]);

export const multiplayerVNPlayback = sqliteTable('multiplayer_vn_playback', {
  roomId:text('room_id').primaryKey(), seq:integer('seq').notNull(), payloadJson:text('payload_json').notNull(),
});
