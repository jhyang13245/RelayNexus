import assert from "node:assert/strict";
import test from "node:test";

import {
  FULL_CONTEXT_TURN_LIMIT,
  GENERATED_SCENE_IMAGE_LIMIT,
  appendLongTermMemories,
  optimizeConversationSnapshot,
  retainRecentGeneratedSceneImages,
  summarizeTurnForLongTermMemory,
} from "../lib/conversation-memory";
import type { RuntimeState, TurnRecord } from "../lib/scenario";

const turnRecord = (turn: number, withImage = false): TurnRecord => ({
  id: `turn-${turn}`,
  turn,
  role: turn === 0 ? "opening" : "exchange",
  userText: turn ? `${turn}번째 행동을 선택한다.` : undefined,
  blocks: [
    {
      id: `block-${turn}`,
      type: "narration",
      text: `${turn}번째 사건에서 새로운 단서와 인물의 반응이 확인됐다.`,
    },
  ],
  recommendations: [],
  createdAt: `2026-08-15T${String(turn % 24).padStart(2, "0")}:00:00+09:00`,
  imagePrompt: withImage ? `${turn}번째 장면 이미지` : undefined,
  imageUrl: withImage ? `data:image/jpeg;base64,IMAGE_${turn}` : undefined,
  imageQuality: withImage ? "low" : undefined,
  statusSnapshot: {
    turn,
    title: "현재 상태",
    displayMode: "summary",
    defaultExpanded: false,
    day: Math.floor(turn / 10),
    date: "2026-08-15",
    weekday: "토요일",
    time: `${String(turn % 24).padStart(2, "0")}:00`,
    weather: "맑음",
    location: `장소 ${turn}`,
    sections: [],
    relations: [],
    worldTraces: [],
    changedCount: 0,
  },
});

test("최근 15개보다 오래된 대화는 공개 내용만 시간순 장기기억으로 요약한다", () => {
  const turns = Array.from({ length: 20 }, (_, turn) => turnRecord(turn));
  const memories = appendLongTermMemories(turns);

  assert.equal(FULL_CONTEXT_TURN_LIMIT, 15);
  assert.equal(memories.length, 5);
  assert.deepEqual(memories.map((memory) => memory.turn), [0, 1, 2, 3, 4]);
  assert.equal(memories[4]?.location, "장소 4");
  assert.match(memories[4]?.summary ?? "", /4번째 행동|4번째 사건/);

  const repeated = appendLongTermMemories(turns, memories);
  assert.equal(repeated.length, memories.length);
  assert.deepEqual(repeated, memories);
});

test("생성 장면 이미지는 전체 대화 중 최근 5개만 남기고 이전 데이터 URL을 제거한다", () => {
  const turns = Array.from({ length: 12 }, (_, turn) => turnRecord(turn, true));
  const optimized = retainRecentGeneratedSceneImages(turns);
  const retained = optimized.filter((turn) => turn.imageUrl);

  assert.equal(GENERATED_SCENE_IMAGE_LIMIT, 5);
  assert.deepEqual(retained.map((turn) => turn.turn), [7, 8, 9, 10, 11]);
  assert.equal(optimized[6]?.imageUrl, undefined);
  assert.equal(optimized[6]?.imagePrompt, undefined);
  assert.equal(optimized[7]?.imageUrl, "data:image/jpeg;base64,IMAGE_7");
});

test("세션 최적화는 대화 전문을 보존하면서 이미지 정리와 장기기억 생성을 함께 수행한다", () => {
  const turns = Array.from({ length: 22 }, (_, turn) => turnRecord(turn, true));
  const optimized = optimizeConversationSnapshot({ turns, longTermMemories: [] });

  assert.equal(optimized.turns.length, 22);
  assert.equal(optimized.turns.filter((turn) => turn.imageUrl).length, 5);
  assert.equal(optimized.longTermMemories.length, 7);
  assert.deepEqual(
    optimized.longTermMemories.map((memory) => memory.turn),
    [0, 1, 2, 3, 4, 5, 6],
  );
});

test("분기 정사와 플레이어 추측은 전문 압축 뒤에도 종류와 진실 상태를 보존한다", () => {
  const turn = turnRecord(9);
  turn.runtimeSnapshot = {
    sessionCanonLedger: [
      {
        id: "SESSION_CANON_9_0",
        kind: "player_hypothesis",
        statement: "박서연의 정체에 관한 플레이어의 추측은 아직 확인되지 않았다.",
        truth: "unconfirmed",
        origin: "player",
        subjectIds: ["NPC_SEOYEON"],
        evidence: "플레이어가 자신의 추측을 직접 말했다.",
        consequence: "확인되기 전에는 인물 지식이나 정사로 승격하지 않는다.",
        relatedEventIds: [],
        createdTurn: 9,
        updatedTurn: 9,
        active: true,
      },
      {
        id: "SESSION_CANON_9_1",
        kind: "branch_canon",
        statement: "박서연은 예정된 사건보다 먼저 봉인술을 사용했다.",
        truth: "confirmed",
        origin: "scene",
        subjectIds: ["NPC_SEOYEON"],
        evidence: "봉인 문양이 문 위에서 빛났다.",
        consequence: "후속 최초 공개 사건은 여파와 설명 장면으로 바꾼다.",
        relatedEventIds: ["EV_REVEAL"],
        createdTurn: 9,
        updatedTurn: 9,
        active: true,
      },
    ],
  } as RuntimeState;

  const memory = summarizeTurnForLongTermMemory(turn);
  assert.equal(memory.canonEntries?.length, 2);
  assert.equal(memory.canonEntries?.[0]?.truth, "unconfirmed");
  assert.equal(memory.canonEntries?.[1]?.kind, "branch_canon");
  assert.match(memory.summary, /미확인 추측|분기 정사/u);
});
