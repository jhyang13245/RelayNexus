import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "./fixtures/legacy-demo-scenario";
import {
  createInitialState,
  createOpeningTurn,
  STORY_ROUTE_PROGRESS_VARIABLE_ID,
  type TurnRecord,
} from "../lib/scenario";
import {
  inspectSessionIntegrity,
  repairNarrativeChronologyHistory,
  repairNarrativeControlLeakHistory,
  repairNarrativeRegressionHistory,
  repairClaudeEventLedgerHistory,
  repairPrematureTriggeredMediaHistory,
  repairRequiredEventHistory,
  repairSaberSummoningHistory,
  resolveChapterTitle,
} from "../lib/session-integrity";
import {
  claudeRuntimeVariable,
  readClaudeRuntime,
} from "../lib/claude-runtime";
import { FATE_SEOUL_ACT_ZERO_EVENT_IDS } from "../lib/work-adapters/fate-seoul";

const fatePack = {
  ...demoScenario,
  projectId: "FATE-SEOUL-TEST",
  title: "Fate/Seoul",
  player: {
    ...demoScenario.player,
    id: "PLAYER_HAN_SIWOO",
    name: "한시우",
    status: "대학교 2학년",
  },
  npcs: [
    {
      ...demoScenario.npcs[0],
      id: "NPC_ADASHINO",
      name: "아다시노 히시리",
      role: "법정과 소속 마술사",
    },
  ],
  opening: {
    ...demoScenario.opening,
    openingCharacters: "한시우, 아다시노 히시리",
    openingEvent: "거짓 왕관의 개막",
    openingLine:
      "서울의 결계가 흔들렸다. 아다시노 히시리가 봉인된 상자를 내려놓았다. “지금부터는 질문 하나도 신중히 고르세요.”",
  },
};

const fateSessionIntegrityPack = {
  ...fatePack,
  events: FATE_SEOUL_ACT_ZERO_EVENT_IDS.map((id, index) => ({
    ...demoScenario.events[0],
    id,
    name: `Fate/Seoul 필수 사건 ${index + 1}`,
    sequence: index + 1,
    required: true,
  })),
};

test("다른 작품의 오프닝에 기성학원 선택지를 넣지 않는다", () => {
  const opening = createOpeningTurn(fatePack);
  const text = opening.recommendations.map((item) => item.label).join(" ");
  const state = createInitialState(fatePack);

  assert.doesNotMatch(text, /공명|파형|원소조작/);
  assert.match(text, /아다시노 히시리/);
  assert.deepEqual(state.status, ["대학교 2학년"]);
});

test("본문에서 택배 계약이 성립한 예전 저장본은 선행 사건과 현재 사건을 봉인하고 소지품을 복구한다", () => {
  const events = [
    {
      ...demoScenario.events[0],
      id: "EV_BEFORE_PARCEL",
      name: "택배 전 일상",
      sequence: 1,
      required: true,
      completionSignals: "일상을 마쳤다",
    },
    {
      ...demoScenario.events[0],
      id: "EV_PARCEL",
      name: "1년 늦은 택배",
      sequence: 2,
      required: true,
      requiredItems: "황동 열쇠, 불탄 고문서 조각",
      completionSignals: "무인택배함을 열어 내용물을 확인하고 챙겼다",
    },
    {
      ...demoScenario.events[0],
      id: "EV_AFTER_PARCEL",
      name: "다음 사건",
      sequence: 3,
      required: true,
      completionSignals: "다음 사건 완료",
    },
  ];
  const pack = { ...demoScenario, events };
  const baseState = createInitialState(pack);
  const oldLedger = readClaudeRuntime(pack, baseState, "EV_BEFORE_PARCEL");
  oldLedger.activeEventId = "EV_PARCEL";
  oldLedger.maxSequence = 2;
  oldLedger.sealed = [];
  oldLedger.eventText = "";
  const state = {
    ...baseState,
    inventory: ["황동 열쇠"],
    variables: [{
      ...claudeRuntimeVariable(oldLedger),
      status: "active" as const,
      createdTurn: 2,
    }],
  };
  const turns: TurnRecord[] = [{
    id: "parcel-complete",
    turn: 2,
    role: "exchange",
    userText: "택배는 무시한다.",
    blocks: [{
      id: "parcel-result",
      type: "narration",
      text: "한시우는 무인택배함을 열어 내용물을 확인하고 챙겼다. 황동 열쇠와 불탄 고문서 조각은 가방에 넣었다.",
    }],
    recommendations: [],
    createdAt: new Date(0).toISOString(),
  }];
  const repaired = repairClaudeEventLedgerHistory(pack, state, turns);
  const ledger = readClaudeRuntime(pack, repaired.state);

  assert.equal(repaired.repaired, true);
  assert.deepEqual(ledger.sealed.map((entry) => entry.id), [
    "EV_BEFORE_PARCEL",
    "EV_PARCEL",
  ]);
  assert.equal(ledger.activeEventId, "EV_AFTER_PARCEL");
  assert.ok(repaired.state.inventory.includes("불탄 고문서 조각"));
  assert.equal(repaired.turns[0]?.runtimeSnapshot?.inventory.includes("불탄 고문서 조각"), true);
});

test("이미 수령한 필수 택배를 다시 배달한 저장본 꼬임은 마지막 정상 시점으로 되돌린다", () => {
  const parcelPack = {
    ...fatePack,
    events: [{
      ...demoScenario.events[0],
      id: "EV_REQUIRED_PARCEL",
      name: "한명진 명의 택배",
      description: "무인택배함에서 필수 물품을 수령한다.",
      effects: "황동열쇠, 불탄 고문서 조각 획득",
    }],
  };
  const snapshot = {
    turn: 2,
    title: "현재 상태",
    displayMode: "full" as const,
    defaultExpanded: false,
    day: 0,
    date: "2018-10-23",
    weekday: "화요일",
    time: "16:08",
    weather: "비",
    location: "한시우의 집",
    sections: [],
    relations: [],
    worldTraces: [],
    changedCount: 0,
  };
  const turn = (
    id: string,
    turnNumber: number,
    text: string,
    statusSnapshot = undefined as TurnRecord["statusSnapshot"],
  ): TurnRecord => ({
    id,
    turn: turnNumber,
    role: "exchange",
    blocks: [{ id: `${id}-block`, type: "narration", text }],
    recommendations: [],
    createdAt: new Date(turnNumber).toISOString(),
    statusSnapshot,
  });
  const turns = [
    turn("parcel", 1, "무인택배함을 열자 황동열쇠와 불탄 고문서 조각이 있었다. 두 물건을 꺼내 가방 안에 챙겼다."),
    turn("home", 2, "상자와 메모를 챙겨 한시우의 집에 도착했다.", snapshot),
    turn("duplicate", 3, "배송 직원이 새 봉투를 건넸다. 실제 수령한 황동열쇠와 불탄 고문서 조각이 다시 들어 있었다."),
    turn("correction", 4, "중복 배송이었다. 새로 온 물건이 아니며 추가 물품은 없었다."),
  ];
  const state = {
    ...createInitialState(parcelPack),
    turn: 4,
    time: "16:18",
    location: "한시우의 집",
    inventory: [],
    memories: ["중복 배송 전산 오류를 확인했다."],
  };

  const repaired = repairNarrativeRegressionHistory(parcelPack, state, turns);

  assert.equal(repaired.repaired, true);
  assert.equal(repaired.removedTurnCount, 2);
  assert.deepEqual(repaired.turns.map((item) => item.id), ["parcel", "home"]);
  assert.equal(repaired.state.time, "16:08");
  assert.equal(repaired.state.location, "한시우의 집");
  assert.ok(repaired.state.inventory.includes("황동열쇠"));
  assert.ok(repaired.state.inventory.includes("불탄 고문서 조각"));
  assert.doesNotMatch(repaired.state.memories.join(" "), /중복 배송/u);
});

test("기존 저장본의 본문 시각과 HUD 스냅샷이 다르면 마지막 상태까지 함께 복구한다", () => {
  const datedPack = {
    ...fatePack,
    startDate: "2018-10-23",
    startTime: "22:40",
  };
  const initial = createInitialState(datedPack);
  const opening = {
    ...createOpeningTurn(fatePack),
    statusSnapshot: {
      turn: 0,
      title: "현재 상태",
      displayMode: "full" as const,
      defaultExpanded: false,
      day: 0,
      date: initial.date,
      weekday: initial.weekday,
      time: initial.time,
      weather: initial.weather,
      location: initial.location,
      sections: [],
      relations: [],
      worldTraces: [],
      changedCount: 0,
    },
  };
  const wrongSnapshot = {
    ...opening.statusSnapshot,
    turn: 1,
    time: "15:30",
    location: "한시우의 집",
  };
  const turn: TurnRecord = {
    id: "next-morning",
    turn: 1,
    role: "exchange",
    blocks: [{
      id: "next-morning-block",
      type: "narration",
      text: "2018년 10월 24일 아침. 한시우의 집 창문으로 햇빛이 들어왔다.",
    }],
    recommendations: [],
    statusSnapshot: wrongSnapshot,
    createdAt: new Date(1).toISOString(),
  };
  const state = {
    ...initial,
    turn: 1,
    time: "15:30",
    location: "한시우의 집",
  };

  const repaired = repairNarrativeChronologyHistory(
    datedPack,
    state,
    [opening, turn],
  );

  assert.equal(repaired.repaired, true);
  assert.equal(repaired.turns[1].statusSnapshot?.time, "08:00");
  assert.equal(repaired.turns[1].statusSnapshot?.day, 1);
  assert.equal(repaired.state.date, "2018-10-24");
  assert.equal(repaired.state.weekday, "수요일");
  assert.equal(repaired.state.time, "08:00");
});

test("마지막 저장 장면에 내부 진행 문구가 노출됐으면 직전 정상 시점으로 되돌린다", () => {
  const initial = createInitialState(fatePack);
  const validSnapshot = {
    turn: 26,
    title: "현재 상태",
    displayMode: "full" as const,
    defaultExpanded: false,
    day: 2,
    date: "2018-10-25",
    weekday: "목요일",
    time: "00:07",
    weather: "가벼운 비",
    location: "한시우의 집 침실",
    sections: [],
    relations: [],
    worldTraces: [],
    changedCount: 0,
  };
  const validTurn: TurnRecord = {
    id: "valid-home-turn",
    turn: 26,
    role: "exchange",
    blocks: [{
      id: "valid-home-block",
      type: "narration",
      text: "빗소리가 침실 창문을 가볍게 두드렸다.",
    }],
    recommendations: [],
    statusSnapshot: validSnapshot,
    createdAt: new Date(1).toISOString(),
  };
  const leakedTurn: TurnRecord = {
    id: "leaked-director-turn",
    turn: 27,
    role: "exchange",
    blocks: [
      {
        id: "leaked-control-block",
        type: "narration",
        text: "사용자의 직접 행동이 끝난 직후 NPC의 독립 행동이 이어졌다.",
      },
      {
        id: "leaked-campus-block",
        type: "narration",
        text: "캠퍼스 안내도 앞의 연구자가 길을 물었다. 다음 판단은 플레이어가 내린다.",
      },
    ],
    recommendations: [],
    statusSnapshot: { ...validSnapshot, turn: 27 },
    createdAt: new Date(2).toISOString(),
  };
  const state = {
    ...initial,
    turn: 27,
    day: 2,
    date: "2018-10-25",
    weekday: "목요일",
    time: "00:10",
    weather: "가벼운 비",
    location: "한시우의 집 침실",
    sceneSummary: "NPC의 독립 행동이 별도로 이어졌다.",
    memories: ["NPC의 독립 행동이 이어졌다."],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: "bad-progress",
      visibility: "hidden" as const,
      reason: "bad turn",
      status: "active" as const,
      createdTurn: 27,
    }],
  };

  const repaired = repairNarrativeControlLeakHistory(
    fateSessionIntegrityPack,
    state,
    [validTurn, leakedTurn],
  );

  assert.equal(repaired.repaired, true);
  assert.equal(repaired.removedTurnCount, 1);
  assert.deepEqual(repaired.turns.map((turn) => turn.id), ["valid-home-turn"]);
  assert.equal(repaired.state.turn, 26);
  assert.equal(repaired.state.time, "00:07");
  assert.equal(repaired.state.location, "한시우의 집 침실");
  assert.equal(repaired.state.variables.length, 0);
  assert.doesNotMatch(repaired.state.memories.join(" "), /NPC의 독립 행동/u);
});

test("집 인터폰으로 강제 등장한 방문 연구자 장면은 직전 정상 시점으로 되돌린다", () => {
  const initial = createInitialState(fatePack);
  const validSnapshot = {
    turn: 33,
    title: "현재 상태",
    displayMode: "full" as const,
    defaultExpanded: false,
    day: 2,
    date: "2018-10-25",
    weekday: "목요일",
    time: "00:07",
    weather: "가벼운 비",
    location: "한시우의 집 침실",
    sections: [],
    relations: [],
    worldTraces: [],
    changedCount: 0,
  };
  const validTurn: TurnRecord = {
    id: "valid-before-forced-visitor",
    turn: 33,
    role: "exchange",
    blocks: [{
      id: "valid-rainy-bedroom",
      type: "narration",
      text: "자정을 넘긴 침실에는 가벼운 빗소리만 남아 있었다.",
    }],
    recommendations: [],
    statusSnapshot: validSnapshot,
    createdAt: new Date(1).toISOString(),
  };
  const forcedTurn: TurnRecord = {
    id: "invalid-home-intercom-nadia",
    turn: 34,
    role: "exchange",
    userText: "어느 정도 상황도 마무리됐고 시간이 많이 흘렀다",
    blocks: [
      {
        id: "invalid-intercom",
        type: "narration",
        text: "08:12, 한시우의 집 침실의 공동현관 인터폰이 울렸다. 젖은 방문 지도를 든 외국인 연구자가 서 있었다.",
      },
      {
        id: "invalid-nadia-dialogue",
        type: "dialogue",
        text: "나디아 알 하다드라고 합니다. 대학박물관 별관을 찾고 있는데 주소가 두 곳이라 모르겠어요.",
        speakerId: "NPC_NADIA",
        speakerName: "나디아 알 하다드",
      },
    ],
    recommendations: [],
    characterVisuals: [{
      blockIndex: 1,
      characterId: "NPC_NADIA",
      characterName: "나디아 알 하다드",
      importance: "major",
      isFirstMajorAppearance: true,
      appearancePrompt: "젖은 방문 지도를 든 연구자",
      reason: "강제 첫 등장",
      canonicalAssetId: "MEDIA_NADIA",
      source: "package",
    }],
    statusSnapshot: { ...validSnapshot, turn: 34, time: "08:12" },
    createdAt: new Date(2).toISOString(),
  };
  const state = {
    ...initial,
    turn: 34,
    day: 2,
    date: "2018-10-25",
    weekday: "목요일",
    time: "08:12",
    weather: "가벼운 비",
    location: "한시우의 집 침실",
    sceneSummary: "집 인터폰으로 나디아를 만났다.",
    memories: ["나디아 알 하다드를 길을 묻는 방문 연구자로 처음 만났다."],
    encounteredCharacterIds: ["NPC_NADIA"],
    characterVisuals: [{
      characterId: "NPC_NADIA",
      characterName: "나디아 알 하다드",
      appearancePrompt: "젖은 방문 지도를 든 연구자",
      assetId: "MEDIA_NADIA",
      source: "package" as const,
      introducedTurn: 34,
    }],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: "bad-nadia-progress",
      visibility: "hidden" as const,
      reason: "invalid forced encounter",
      status: "active" as const,
      createdTurn: 34,
    }],
  };

  const repaired = repairNarrativeControlLeakHistory(
    fateSessionIntegrityPack,
    state,
    [validTurn, forcedTurn],
  );

  assert.equal(repaired.repaired, true);
  assert.deepEqual(repaired.turns.map((turn) => turn.id), [validTurn.id]);
  assert.equal(repaired.state.turn, 33);
  assert.equal(repaired.state.time, "00:07");
  assert.equal(repaired.state.location, "한시우의 집 침실");
  assert.equal(repaired.state.encounteredCharacterIds.includes("NPC_NADIA"), false);
  assert.equal(repaired.state.characterVisuals.length, 0);
  assert.equal(repaired.state.variables.length, 0);
  assert.doesNotMatch(repaired.state.memories.join(" "), /나디아/u);
});

test("비-Fate 작품은 비슷한 방문 연구자 장면을 Fate 전용 복구로 지우지 않는다", () => {
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-HOME-RESEARCHER",
    title: "방문 연구자의 지도",
  };
  const state = {
    ...createInitialState(pack),
    location: "주인공의 집 침실",
  };
  const turn: TurnRecord = {
    id: "generic-home-researcher",
    turn: 1,
    role: "exchange",
    blocks: [{
      id: "generic-visitor",
      type: "narration",
      text: "공동현관 인터폰 너머로 방문 연구자가 대학박물관 별관으로 가는 길을 물었다.",
    }],
    recommendations: [],
    createdAt: new Date(0).toISOString(),
  };

  const repaired = repairNarrativeControlLeakHistory(pack, state, [turn]);

  assert.equal(repaired.repaired, false);
  assert.deepEqual(repaired.turns, [turn]);
});

test("성당 HUD에서 집 준비 장면을 반복한 저장본은 반복 시작 전까지 한꺼번에 복구한다", () => {
  const initial = createInitialState(fatePack);
  const snapshot = (turn: number, time: string) => ({
    turn,
    title: "현재 상태",
    displayMode: "full" as const,
    defaultExpanded: false,
    day: 0,
    date: "2018-10-24",
    weekday: "수요일",
    time,
    weather: "가벼운 비",
    location: "명동성당 부속 비공개 별관 지하 임시 보호실",
    sections: [],
    relations: [],
    worldTraces: [],
    changedCount: 0,
  });
  const validTurn: TurnRecord = {
    id: "church-orientation-complete",
    turn: 37,
    role: "exchange",
    blocks: [{
      id: "church-priest-explanation",
      type: "narration",
      text: "오요한 신부의 성배전쟁 설명이 끝나고 지하 보호실에 잠시 정적이 흘렀다.",
    }],
    recommendations: [],
    statusSnapshot: snapshot(37, "00:55"),
    createdAt: new Date(37).toISOString(),
  };
  const malformedTurns = Array.from({ length: 6 }, (_, offset): TurnRecord => {
    const turn = 38 + offset;
    return {
      id: `malformed-home-prep-${turn}`,
      turn,
      role: "exchange",
      userText: offset === 1
        ? "현재 장소를 떠나 가장 가까운 공개 동선으로 이동한다."
        : "이어서 진행한다.",
      blocks: [{
        id: `malformed-home-prep-block-${turn}`,
        type: "narration",
        text: "밤사이 빗소리가 잦아들고 아침이 밝았다. 휴대전화 알람과 오늘 일정표가 떴다. 아직 집 안이므로 외출 준비를 할 수 있었다.",
      }],
      recommendations: [],
      statusSnapshot: snapshot(turn, `${String(8 + offset).padStart(2, "0")}:12`),
      createdAt: new Date(turn).toISOString(),
    };
  });
  const state = {
    ...initial,
    turn: 43,
    day: 0,
    date: "2018-10-24",
    time: "13:12",
    location: "명동성당 부속 비공개 별관 지하 임시 보호실",
    sceneSummary: "성당 지하인데도 집에서 외출 준비를 반복했다.",
    memories: [
      "오요한 신부의 설명을 들었다.",
      "명동성당 부속 별관에서 아침을 맞아 오늘 일정과 이동 준비를 확인했다.",
    ],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: "bad-loop-progress",
      visibility: "hidden" as const,
      reason: "bad loop",
      status: "active" as const,
      createdTurn: 43,
    }],
  };

  const repaired = repairNarrativeControlLeakHistory(
    fatePack,
    state,
    [validTurn, ...malformedTurns],
  );

  assert.equal(repaired.repaired, true);
  assert.equal(repaired.removedTurnCount, 6);
  assert.deepEqual(repaired.turns.map((turn) => turn.id), [validTurn.id]);
  assert.equal(repaired.state.turn, 37);
  assert.equal(repaired.state.time, "00:55");
  assert.equal(repaired.state.location, snapshot(37, "00:55").location);
  assert.equal(repaired.state.variables.length, 0);
  assert.doesNotMatch(repaired.state.memories.join(" "), /아침을 맞아.*이동 준비/u);
});

test("서버가 완료한 사건 단계에 따라 정적인 프롤로그 제목을 갱신한다", () => {
  const state = {
    ...createInitialState(fateSessionIntegrityPack),
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "FATE_SEOUL_ACT_ZERO",
        phase: "church_orientation",
        eventId: "CHURCH",
        completedEventIds: ["PARCEL", "SUMMONING", "BATTLE", "CHURCH"],
      }),
      visibility: "hidden" as const,
      reason: "server verified",
      status: "active" as const,
      createdTurn: 12,
    }],
  };

  assert.equal(resolveChapterTitle(fateSessionIntegrityPack, state), "제1막 · 성당교회의 감독관");
});

test("기존 세션의 조기 트리거 이미지는 제거하고 실제 사건 장면의 이미지는 유지한다", () => {
  const event = {
    ...demoScenario.events[0],
    id: "EVENT_OPEN_ARCHIVE",
    name: "봉인 서고 개방",
    completionSignals: "봉인문이 열렸다",
    requiredItems: "청동 인장",
    requiredDialogue: "",
  };
  const trigger = {
    id: "TRIGGER_ARCHIVE_OPEN",
    name: "봉인 서고 개방 CG",
    enabled: true,
    visibility: "Hidden",
    triggerType: "event_success",
    sourceId: event.id,
    threshold: 0,
    storyProgress: "",
    customCondition: "",
    mode: "show_trigger_image",
    characterIds: [],
    prompt: "",
    negativePrompt: "",
    once: true,
    priority: 100,
    outputPosition: "after_scene",
  };
  const asset = {
    id: "archive-opening-scene",
    path: "scenes/archive-opening.webp",
    kind: "scene" as const,
    characterId: "",
    characterName: "",
    label: "봉인 서고 개방",
    emotionTags: [],
    sceneTags: [event.id, trigger.name],
    placement: "after_block" as const,
    priority: 1000,
    alt: "봉인 서고 개방",
    caption: "",
    source: "package" as const,
    canonical: false,
    triggerId: trigger.id,
    triggerSourceId: event.id,
  };
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-TRIGGER-HISTORY-REPAIR",
    title: "시계도서관의 마지막 열쇠",
    events: [event],
    imageTriggers: [trigger],
    mediaAssets: [asset],
  };
  const earlyTurn: TurnRecord = {
    id: "early-trigger-turn",
    turn: 1,
    role: "exchange",
    blocks: [{
      id: "ordinary-morning",
      type: "narration",
      text: "아직 도서관에도 가지 않은 평범한 아침 수업이 시작됐다.",
      mediaAssetId: asset.id,
    }],
    recommendations: [],
    createdAt: new Date(0).toISOString(),
  };
  const actualTurn: TurnRecord = {
    id: "actual-trigger-turn",
    turn: 2,
    role: "exchange",
    blocks: [{
      id: "archive-opened",
      type: "narration",
      text: "봉인문이 열렸다. 안쪽 바닥에서 청동 인장을 발견했다.",
      mediaAssetId: asset.id,
    }],
    recommendations: [],
    createdAt: new Date(1).toISOString(),
  };

  const repaired = repairPrematureTriggeredMediaHistory(pack, [earlyTurn, actualTurn]);
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.clearedPrematureMediaCount, 1);
  assert.equal(repaired.turns[0].blocks[0]?.mediaAssetId, "");
  assert.equal(repaired.turns[1].blocks[0]?.mediaAssetId, asset.id);
});

test("Fate 세션에 저장된 예전 기성학원 대체 턴을 탐지한다", () => {
  const opening = createOpeningTurn(fatePack);
  const contaminated: TurnRecord = {
    ...opening,
    id: "contaminated-turn",
    role: "exchange",
    turn: 1,
    userText: "우선 수업에 집중하자",
    blocks: [
      {
        id: "block-1",
        type: "narration",
        text: "한세린의 손끝이 분석 화면을 스쳤다. 겹쳐 있던 두 파형이 벌어지며 선으로 떠올랐다.",
      },
      {
        id: "block-2",
        type: "dialogue",
        speakerName: "한명진",
        text: "좋습니다. 정답을 서두르지 않겠습니다.",
      },
    ],
  };

  const report = inspectSessionIntegrity(fatePack, [opening, contaminated]);

  assert.equal(report.foreignDemoExchangeCount, 1);
  assert.equal(report.hasLegacyDemoOpening, false);
});

test("내장 기성학원 데모는 오염으로 오인하지 않는다", () => {
  const opening = createOpeningTurn(demoScenario);
  const state = createInitialState(demoScenario);
  const report = inspectSessionIntegrity(demoScenario, [opening]);

  assert.equal(demoScenario.startTime, "09:00");
  assert.equal(state.time, "09:00");
  assert.deepEqual(report, {
    foreignDemoExchangeCount: 0,
    hasLegacyDemoOpening: false,
  });
});

test("가져온 작품에 남은 기성학원 오프닝 제목은 스포일러 없는 제목으로 가린다", () => {
  const legacyHeadingPack = {
    ...fatePack,
    opening: { ...fatePack.opening, openingEvent: "첫 번째 공명" },
  };

  assert.equal(resolveChapterTitle(legacyHeadingPack), "프롤로그");
  assert.equal(resolveChapterTitle(fatePack), "거짓 왕관의 개막");
  assert.notEqual(resolveChapterTitle(demoScenario), "프롤로그");
});

test("저장된 소환 장면의 누락 대사와 트리거를 복구하고 잘못 생성된 홍재 이미지를 지운다", () => {
  const saber = {
    ...demoScenario.npcs[0],
    id: "NPC_SERVANT_SABER_JEONGJO_TS",
    name: "세이버 · 홍재",
    role: "Saber 클래스 서번트",
    appearance: "흑갈색 긴 반묶음 머리, 적색 댕기, 호박빛 눈",
    hiddenInfo: "진명 정조 이산",
  };
  const pack = {
    ...fateSessionIntegrityPack,
    npcs: [saber],
    mediaAssets: [
      {
        id: "hongjae-canonical",
        path: "characters/hongjae.png",
        kind: "character" as const,
        characterId: saber.id,
        characterName: saber.name,
        label: "대표 기준 이미지",
        emotionTags: ["canonical"],
        sceneTags: [],
        placement: "after_block" as const,
        priority: 1000,
        alt: "홍재",
        caption: saber.name,
        source: "package" as const,
        canonical: true,
      },
      {
        id: "hongjae-summoning-trigger",
        path: "scenes/hongjae-summoning.png",
        kind: "scene" as const,
        characterId: "",
        characterName: "",
        label: "홍재 소환",
        emotionTags: [],
        sceneTags: ["EV_PROLOGUE_07_SABER_SUMMONING"],
        placement: "after_block" as const,
        priority: 1,
        alt: "홍재 소환",
        caption: saber.name,
        source: "package" as const,
        canonical: false,
      },
    ],
  };
  const turn: TurnRecord = {
    id: "broken-summoning-turn",
    turn: 7,
    role: "exchange",
    blocks: [
      {
        id: "manifestation",
        type: "narration",
        text: "바닥의 원형 문양이 붉게 빛났다. 빛 속에서 검을 든 소녀가 나타나 날아든 칼날을 쳐냈다.",
      },
      {
        id: "wrong-first-line",
        type: "dialogue",
        text: "다친 곳은 없습니까?",
        speakerName: "정체불명의 소녀 검사",
      },
    ],
    recommendations: [],
    imageUrl: "data:image/webp;base64,wrong-hongjae",
    imagePrompt: "정체불명의 소녀 검사가 서 있는 장면",
    createdAt: new Date(0).toISOString(),
  };

  const repaired = repairSaberSummoningHistory(pack, [turn]);
  const repairedTurn = repaired.turns[0];

  assert.equal(repaired.repaired, true);
  assert.equal(repaired.clearedGeneratedSceneCount, 1);
  assert.equal(repairedTurn.blocks.at(-1)?.text, "묻겠다. 그대가 나의 마스터인가.");
  assert.equal(repairedTurn.blocks.at(-1)?.speakerId, saber.id);
  assert.equal(repairedTurn.blocks.at(-1)?.mediaAssetId, "hongjae-summoning-trigger");
  assert.equal(repairedTurn.characterVisuals?.[0]?.canonicalAssetId, "hongjae-canonical");
  assert.equal(repairedTurn.imageUrl, undefined);
});

test("비-Fate 저장본도 필수 사건의 대사·패키지 기준본을 복구한다", () => {
  const guide = {
    ...demoScenario.npcs[0],
    id: "NPC_GUIDE_MIRA",
    name: "사서 미라",
    role: "폐쇄 서고의 안내인",
    appearance: "짙은 남색 제복과 은색 열쇠 목걸이",
  };
  const pack = {
    ...demoScenario,
    projectId: "CLOCKWORK-LIBRARY-HISTORY-REPAIR",
    title: "시계도서관의 마지막 열쇠",
    genre: "미스터리 어드벤처",
    npcs: [guide],
    events: [{
      ...demoScenario.events[0],
      id: "EVENT_OPEN_ARCHIVE",
      name: "봉인 서고 개방",
      required: true,
      sequence: 1,
      completionSignals: "봉인문이 열렸다",
      requiredItems: "청동 인장",
      requiredDialogue: "문이 열렸습니다.",
      requiredSpeakerId: guide.id,
      participants: guide.id,
      endSceneAfterCompletion: true,
    }],
    imageTriggers: [{
      id: "TRIGGER_ARCHIVE_OPEN",
      name: "봉인 서고 개방 CG",
      enabled: true,
      visibility: "Hidden",
      triggerType: "event_success",
      sourceId: "EVENT_OPEN_ARCHIVE",
      threshold: 0,
      storyProgress: "",
      customCondition: "",
      mode: "show_package_image",
      characterIds: [guide.id],
      prompt: "",
      negativePrompt: "",
      once: true,
      priority: 100,
      outputPosition: "after_scene",
    }],
    mediaAssets: [
      {
        id: "mira-canonical",
        path: "characters/mira.webp",
        kind: "character" as const,
        characterId: guide.id,
        characterName: guide.name,
        label: "미라 대표 이미지",
        emotionTags: ["canonical"],
        sceneTags: [],
        placement: "after_block" as const,
        priority: 1000,
        alt: guide.name,
        caption: guide.name,
        source: "package" as const,
        canonical: true,
      },
      {
        id: "archive-opening-scene",
        path: "scenes/archive-opening.webp",
        kind: "scene" as const,
        characterId: "",
        characterName: "",
        label: "봉인 서고 개방",
        emotionTags: [],
        sceneTags: ["sealed-archive"],
        placement: "after_block" as const,
        priority: 1,
        alt: "봉인 서고 개방",
        caption: guide.name,
        source: "package" as const,
        canonical: false,
        triggerId: "TRIGGER_ARCHIVE_OPEN",
        triggerSourceId: "EVENT_OPEN_ARCHIVE",
      },
    ],
  };
  const turn: TurnRecord = {
    id: "broken-archive-turn",
    turn: 3,
    role: "exchange",
    blocks: [{
      id: "archive-opened",
      type: "narration",
      text: "봉인문이 열렸다. 바닥에서 청동 인장을 발견했다.",
    }],
    recommendations: [],
    imageUrl: "data:image/webp;base64,wrong-mira",
    imagePrompt: "기준본과 다른 사서 미라",
    characterVisuals: [{
      blockIndex: 0,
      characterId: guide.id,
      characterName: guide.name,
      importance: "major",
      isFirstMajorAppearance: true,
      appearancePrompt: "다른 외형",
      reason: "첫 등장",
      canonicalAssetId: "generated-wrong-mira",
      source: "generated",
    }],
    createdAt: new Date(0).toISOString(),
  };
  const correctLaterTurn: TurnRecord = {
    id: "correct-mira-reference-turn",
    turn: 4,
    role: "exchange",
    blocks: [{
      id: "mira-guides-next-step",
      type: "dialogue",
      text: "인장을 잃어버리지 마세요.",
      speakerId: guide.id,
      speakerName: guide.name,
    }],
    recommendations: [],
    imageUrl: "data:image/jpeg;base64,correct-mira",
    imagePrompt: "사서 미라가 열린 서고를 안내하는 장면",
    imageReferenceAssetIds: ["mira-canonical"],
    createdAt: new Date(1).toISOString(),
  };

  const repaired = repairRequiredEventHistory(pack, [turn, correctLaterTurn]);
  const repairedTurn = repaired.turns[0];

  assert.equal(repaired.repairedEventCount, 1);
  assert.equal(repaired.clearedGeneratedSceneCount, 1);
  assert.equal(repairedTurn.blocks.at(-1)?.text, "문이 열렸습니다.");
  assert.equal(repairedTurn.blocks.at(-1)?.speakerId, guide.id);
  assert.equal(repairedTurn.blocks.at(-1)?.mediaAssetId, "archive-opening-scene");
  assert.equal(repairedTurn.characterVisuals?.[0]?.canonicalAssetId, "mira-canonical");
  assert.equal(repairedTurn.imageUrl, undefined);
  assert.equal(repaired.turns[1]?.imageUrl, correctLaterTurn.imageUrl);
  assert.deepEqual(repaired.turns[1]?.imageReferenceAssetIds, ["mira-canonical"]);
});
