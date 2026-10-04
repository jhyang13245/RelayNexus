import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  MULTIPLAYER_KEY_RECOVERY_SECONDS,
  canStartRoom,
  keyRecoveryDeadline,
  nextTurnMember,
  payerAccountIdForCall,
  roomStatusForMemberCount,
  type TurnMember,
} from "../lib/multiplayer-policy";
import { normalizeModelProvider } from "../lib/model-provider";

const members: TurnMember[] = [
  { id: "m1", accountId: "a1", seat: 1, status: "READY" },
  { id: "m2", accountId: "a2", seat: 2, status: "READY" },
  { id: "m3", accountId: "a3", seat: 3, status: "READY" },
];

test("멀티플레이 순번은 같은 주인공의 다음 조작자에게 순환한다", () => {
  assert.equal(nextTurnMember(members, "m1")?.id, "m2");
  assert.equal(nextTurnMember(members, "m3")?.id, "m1");
});

test("자동 정사 진행은 현재 플레이어, 방장 강제 진행만 방장이 부담한다", () => {
  const input = { currentPlayerAccountId: "player", hostAccountId: "host" };
  assert.equal(payerAccountIdForCall({ ...input, cause: "NORMAL" }), "player");
  assert.equal(payerAccountIdForCall({ ...input, cause: "AUTO_TIMEOUT" }), "player");
  assert.equal(payerAccountIdForCall({ ...input, cause: "HOST_FORCE" }), "host");
});

test("키 복구 유예는 정확히 1분 30초이며 한 명이 남으면 싱글 상태가 된다", () => {
  const start = Date.parse("2026-08-24T00:00:00.000Z");
  assert.equal(MULTIPLAYER_KEY_RECOVERY_SECONDS, 90);
  assert.equal(keyRecoveryDeadline(start), "2026-08-24T00:01:30.000Z");
  assert.equal(roomStatusForMemberCount(1), "SOLO");
  assert.equal(roomStatusForMemberCount(2), "ACTIVE");
});

test("모든 참가자가 자기 키를 연결하고 준비해야 방을 시작한다", () => {
  assert.equal(canStartRoom(members.map((member) => ({ ...member, apiKeyReady: true }))), true);
  assert.equal(canStartRoom(members.map((member, index) => ({ ...member, apiKeyReady: index !== 1 }))), false);
  assert.equal(canStartRoom(members.slice(0, 2).map((member) => ({ ...member, apiKeyReady: true }))), true);
});

test("방 모델 설정은 변경 가능하지만 안전하지 않은 Base URL은 기본값으로 복구한다", () => {
  assert.deepEqual(normalizeModelProvider({ textModel: "custom-story-model", baseUrl: "https://models.example.com/v1" }), {
    textModel: "custom-story-model",
    imageModel: "gpt-image-2.5-flare",
    baseUrl: "https://models.example.com/v1",
    outputContract: "relay-nexus-live-v31",
  });
  assert.equal(normalizeModelProvider({ baseUrl: "http://127.0.0.1:8080/v1" }).baseUrl, "https://api.openai.com/v1");
});

test("멀티플레이 원장과 D1 스키마에는 API 키 원문 저장 칸이 없다", async () => {
  const [schema, store] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/multiplayer-store.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(schema, /apiKey:\s*text|api_key\s+TEXT(?![^\n]*ready)/u);
  assert.doesNotMatch(store, /INSERT INTO multiplayer_(?:rooms|members|cost_ledger|room_events)[\s\S]{0,800}\bapi_key\b(?!_ready)/u);
  assert.match(store, /api_key_ready/u);
});

test("공개방 목록은 대기 중이고 자리가 남은 방만 안전한 요약으로 노출한다", async () => {
  const [schema, store, route] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/multiplayer-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/multiplayer/rooms/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /visibility:\s*text\("visibility"\)\.notNull\(\)\.default\("PRIVATE"\)/u);
  assert.match(store, /WHERE r\.visibility = 'PUBLIC' AND r\.status = 'WAITING'/u);
  assert.match(store, /HAVING member_count < r\.max_players/u);
  assert.match(route, /listPublicMultiplayerRooms/u);
  const publicShape=store.match(/export type PublicMultiplayerRoomView\s*=\s*\{([^}]+)\}/u)?.[1];
  assert.ok(publicShape);
  assert.doesNotMatch(publicShape, /(?:accountId|apiKeyReady|settings)/u);
});

test("v1.9 정식방은 대기실 신규 참가와 방장 관리만 허용하고 계정 ID를 공개하지 않는다", async () => {
  const [store, page] = await Promise.all([
    readFile(new URL("../lib/multiplayer-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/multiplayer/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(store, /if \(String\(rows\.room\.status\) !== "WAITING"\)/u);
  assert.match(store, /action === "kick"/u);
  assert.match(store, /action === "close"/u);
  assert.doesNotMatch(store, /MultiplayerMemberView = \{[\s\S]{0,160}accountId/u);
  assert.match(page, /DANCHEONG · MULTIPLAYER/u);
  assert.match(page, /초대 링크 ⧉/u);
  assert.match(page, /roomAction\("leave"\)/u);
  assert.match(page, /정원은 최대 \{room\.maxPlayers\}명입니다/u);
  assert.match(page, /presentMembers\.length >= 2/u);
  assert.match(page, /\{presentMembers\.length\}\/\{room\.maxPlayers\}명으로 이야기 시작/u);
});

test("모바일 멀티플레이는 줌 없이 자체 세로 스크롤 표면을 가진다", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.multiplayer-page\s*\{[^}]*height:\s*100dvh/u);
  assert.match(css, /\.multiplayer-page\s*\{[^}]*overflow-y:\s*auto/u);
  assert.match(css, /\.multiplayer-page\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/u);
  assert.match(css, /\.multiplayer-page\s*\{[^}]*touch-action:\s*pan-y/u);
});

test("Cortex 기기 원본도 멀티플레이 새 이야기 시작 자격으로 인정한다", async () => {
  const [page, host] = await Promise.all([
    readFile(new URL("../app/multiplayer/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/cortex-host.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /findStorySource\(projectId/u);
  assert.match(page, /loadStorySource\(newStorySource/u);
  assert.match(host, /case 'PREPARE_NEW_FILE'/u);
  assert.match(host, /NEW_PROJECT_SNAPSHOT/u);
});
