import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "./fixtures/legacy-demo-scenario";
import { createInitialState, type ScenarioPack } from "../lib/scenario";
import {
  assessStoryDrive,
  deriveStoryDrive,
  STORY_ROUTE_PROGRESS_VARIABLE_ID,
} from "../lib/story-director";

const saberNpc = {
  ...demoScenario.npcs[0],
  id: "NPC_SABER",
  name: "붉은 옥새의 소녀 검사",
  role: "Saber 클래스 서번트",
  publicInfo: "진명을 밝히지 않은 소녀 검사",
  hiddenInfo: "진명 정조 이산",
};

const fatePack: ScenarioPack = {
  ...demoScenario,
  projectId: "FATE-SEOUL-DIRECTOR-TEST",
  title: "Fate/Seoul — 거짓 왕관의 성배전쟁",
  genre: "현대 판타지 · 성배전쟁",
  npcs: [...demoScenario.npcs, saberNpc],
  events: [
    {
      id: "EVENT_ACCIDENTAL_SUMMONING",
      name: "한시우의 우발 소환",
      type: "Fixed Timeline",
      visibility: "Hidden",
      status: "Planned",
      priority: 100,
      conditions: "최소 사용자 행동 6턴 + D+0 23:41",
      description: "촉매가 반응해 세이버가 소환된다. 진명 정조는 비공개다.",
    },
  ],
};

const recentTurn = (
  turn: number,
  userText: string,
  text = "일상적인 시간이 흘렀다.",
) => ({
  turn,
  userText,
  blocks: [{
    id: `block-${turn}`,
    type: "narration" as const,
    text,
  }],
});

test("보수적인 선택이 반복되면 성배전쟁의 고정 소환 이정표를 가속한다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 6,
    time: "16:30",
  };
  const drive = deriveStoryDrive({
    pack: fatePack,
    state,
    userText: "그냥 집으로 돌아간다.",
    recentTurns: [recentTurn(5, "일단 수업에 집중한다.")],
  });

  assert.equal(drive.scenarioFamily, "holy_grail_war");
  assert.equal(drive.mode, "accelerate");
  assert.equal(drive.milestoneKind, "summoning");
  assert.equal(drive.deadlineDay, 0);
  assert.equal(drive.deadlineTime, "23:41");
  assert.equal(drive.targetWithinTurns, 1);
});

test("이미 오래 끈 기존 세션은 다음 응답에서 우발 소환을 강제한다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 12,
    time: "16:30",
  };
  const drive = deriveStoryDrive({
    pack: fatePack,
    state,
    userText: "좀 더 기다려 본다.",
    recentTurns: [],
  });

  assert.equal(drive.mode, "force_milestone");
  assert.equal(drive.requireMilestoneThisTurn, true);
  assert.match(drive.directives.join(" "), /이번 응답 안에서.*소환/);
});

test("사건표의 최소 사용자 행동 턴 전에는 마감 시각이어도 소환을 강제하지 않는다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 5,
    time: "23:41",
  };
  const drive = deriveStoryDrive({
    pack: fatePack,
    state,
    userText: "문이 막힌 지하실에서 주변을 살핀다.",
    recentTurns: [],
  });

  assert.equal(drive.minimumTurnsBeforeMilestone, 6);
  assert.equal(drive.mode, "accelerate");
  assert.equal(drive.requireMilestoneThisTurn, false);
});

test("강제 단계에서 징조만 추가하고 소환을 미루면 재작성 대상으로 잡는다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 12,
    time: "22:50",
  };
  const drive = deriveStoryDrive({
    pack: fatePack,
    state,
    userText: "가만히 상황을 지켜본다.",
    recentTurns: [],
  });
  const assessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [{
        type: "narration",
        text: "바닥의 붉은 선이 빛났지만 무엇인지는 알 수 없었다.",
      }],
      statePatch: { time: "23:41", encounteredCharactersAdd: [] },
      characterVisuals: [],
    },
  });

  assert.equal(assessment.milestoneTriggered, false);
  assert.equal(assessment.needsCorrection, true);
});

test("소환 발생과 신규 세이버 현현을 한 턴에 완료하면 통과한다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 12,
    time: "22:50",
  };
  const drive = deriveStoryDrive({
    pack: fatePack,
    state,
    userText: "가만히 상황을 지켜본다.",
    recentTurns: [],
  });
  const assessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [
        {
          type: "narration",
          text: "23시 41분, 촉매가 저절로 타오르며 우발 소환이 발생했다. 소환진에서 진명을 밝히지 않은 소녀 검사가 현현해 치명타를 검으로 막았다.",
        },
        {
          type: "dialogue",
          text: "묻겠다. 그대가 나의 마스터인가.",
          speakerId: "NPC_SABER",
          speakerName: "붉은 옥새의 소녀 검사",
        },
      ],
      statePatch: {
        time: "23:41",
        encounteredCharactersAdd: [{
          characterId: "NPC_SABER",
          name: "붉은 옥새의 소녀 검사",
          relationType: "첫 대면",
        }],
      },
      characterVisuals: [{
        characterId: "NPC_SABER",
        importance: "major",
      }],
    },
  });

  assert.equal(assessment.milestoneTriggered, true);
  assert.equal(assessment.majorVisualQueued, true);
  assert.equal(assessment.endsAtMasterQuestion, true);
  assert.equal(assessment.needsCorrection, false);
});

test("소환 뒤 마스터 질문을 바꾸거나 후속 설명을 붙이면 재작성한다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 12,
    time: "22:50",
  };
  const drive = deriveStoryDrive({
    pack: fatePack,
    state,
    userText: "가만히 상황을 지켜본다.",
    recentTurns: [],
  });
  const assessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [
        {
          type: "narration",
          text: "마법진에서 소녀 검사가 현현해 공격을 막았다. 우발 소환이 완료되었다.",
        },
        {
          type: "dialogue",
          text: "그대가 나를 부른 자인가?",
          speakerId: "NPC_SABER",
          speakerName: "붉은 옥새의 소녀 검사",
        },
      ],
      statePatch: {
        time: "23:41",
        encounteredCharactersAdd: [{
          characterId: "NPC_SABER",
          name: "붉은 옥새의 소녀 검사",
          relationType: "첫 대면",
        }],
      },
      characterVisuals: [{ characterId: "NPC_SABER" }],
    },
  });

  assert.equal(assessment.milestoneTriggered, true);
  assert.equal(assessment.endsAtMasterQuestion, false);
  assert.equal(assessment.needsCorrection, true);
});

test("모델이 조우 상태 패치를 빠뜨려도 화면에 현현한 세이버 소환을 판정한다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 12,
    time: "23:39",
  };
  const drive = deriveStoryDrive({
    pack: fatePack,
    state,
    userText: "눈앞의 칼날을 피하려 한다.",
    recentTurns: [],
  });
  const assessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [
        {
          type: "narration",
          text: "바닥의 원형 문양이 붉게 빛났다. 빛 속에서 검을 든 소녀가 나타나 날아든 칼날을 쳐냈다.",
        },
        {
          type: "dialogue",
          text: "상처는 없습니까?",
          speakerName: "정체불명의 소녀 검사",
        },
      ],
      statePatch: { time: "23:41", encounteredCharactersAdd: [] },
      characterVisuals: [],
    },
  });

  assert.equal(assessment.milestoneTriggered, true);
  assert.equal(assessment.endsAtMasterQuestion, false);
  assert.equal(assessment.needsCorrection, true);
});

test("세이버가 이미 등장한 세션에서는 소환을 반복하지 않는다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 13,
    time: "23:45",
    encounteredCharacterIds: ["NPC_SABER"],
  };
  const drive = deriveStoryDrive({
    pack: fatePack,
    state,
    userText: "소녀에게 누구인지 묻는다.",
    recentTurns: [],
  });

  assert.equal(drive.milestonePending, false);
  assert.equal(drive.milestoneKind, "none");
  assert.equal(drive.mode, "steady");
});

test("소환 이후에도 보수적 선택이 반복되면 다음 성배전쟁 사건을 가속한다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 18,
    time: "07:00",
    encounteredCharacterIds: ["NPC_SABER"],
  };
  const drive = deriveStoryDrive({
    pack: fatePack,
    state,
    userText: "우선은 조용히 기다린다.",
    recentTurns: [recentTurn(17, "일단 평범한 일상으로 돌아간다.")],
  });

  assert.equal(drive.milestonePending, false);
  assert.equal(drive.mode, "accelerate");
  assert.match(drive.directives.join(" "), /첫 계약 이후|다음 메인 갈등/);
  assert.doesNotMatch(drive.directives.join(" "), /이번 응답 안에서 시간 고정 우발 소환/);
});

test("일반 작품에는 성배전쟁 전용 소환 감독을 적용하지 않는다", () => {
  const state = {
    ...createInitialState(demoScenario),
    turn: 30,
    time: "23:50",
  };
  const drive = deriveStoryDrive({
    pack: demoScenario,
    state,
    userText: "그냥 기숙사로 돌아간다.",
    recentTurns: [],
  });

  assert.equal(drive.scenarioFamily, "generic");
  assert.equal(drive.milestonePending, false);
  assert.equal(drive.mode, "steady");
});

test("성배전쟁 작품이라도 패키지 사건표에 소환이 없으면 임의 시각을 만들지 않는다", () => {
  const pack = { ...fatePack, events: [] };
  const state = {
    ...createInitialState(pack),
    turn: 30,
    time: "23:50",
  };
  const drive = deriveStoryDrive({
    pack,
    state,
    userText: "상황을 지켜본다.",
    recentTurns: [],
  });

  assert.equal(drive.scenarioFamily, "holy_grail_war");
  assert.equal(drive.milestonePending, false);
  assert.equal(drive.deadlineDay, null);
  assert.equal(drive.deadlineTime, "");
  assert.equal(drive.mode, "steady");
  assert.doesNotMatch(drive.directives.join(" "), /23:41|우발 소환/);
});

test("이어서 진행은 플레이어 입력 없이도 정석 사건 비트를 가속한다", () => {
  const state = {
    ...createInitialState(demoScenario),
    turn: 1,
    time: "09:10",
  };
  const drive = deriveStoryDrive({
    pack: demoScenario,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.canonicalAdvance, true);
  assert.equal(drive.mode, "accelerate");
  assert.match(drive.directives.join(" "), /플레이어.*대사나 행동.*선언하지/);
  assert.match(drive.directives.join(" "), /정석 흐름의 다음 장면/);
});

const actZeroRouteEvents = [
  {
    id: "EV_PROLOGUE_02_MAP_GLITCH",
    name: "프롤로그: 택배가 오기 전의 하루",
    description: "평범한 대학 생활",
  },
  {
    id: "EV_PROLOGUE_03_GRANDMOTHER_PARCEL",
    name: "프롤로그: 1년 늦은 택배",
    description: "실종된 외할머니 명의 택배",
  },
  {
    id: "EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER",
    name: "프롤로그: 비 오는 캠퍼스의 방문 연구자",
    description: "나디아를 평범한 인간 연구자로 만난다.",
  },
  {
    id: "EV_PROLOGUE_04_EVENING_RAIN",
    name: "프롤로그: 각자의 저녁, 서촌으로",
    description: "나디아 장면 뒤 별도 저녁 일상",
  },
  {
    id: "EV_PROLOGUE_05_CAMPUS_BLACKOUT",
    name: "첫 번째 사건: 서촌 구역 정전과 종이가면",
    description: "22:47 서촌 정전",
  },
  {
    id: "EV_PROLOGUE_06_NIGHT_PURSUIT",
    name: "프롤로그: 서촌의 옛 민방위 방공호",
    description: "종이가면의 추적",
  },
  {
    id: "EV_PROLOGUE_07_SABER_SUMMONING",
    name: "첫 번째 밤: 마법진에서 온 소녀 검사",
    description: "최소 사용자 행동 7턴 + D+0 23:41 우발 소환으로 세이버가 현현한다.",
  },
  {
    id: "EV_PROLOGUE_08_FIRST_BATTLE_AFTER_SUMMONING",
    name: "소환 직후: 세이버의 첫 방어전",
    description: "소환 질문 뒤 첫 전투",
  },
  {
    id: "EV_PROLOGUE_09_CHURCH_ORIENTATION",
    name: "첫 번째 밤: 성당교회의 감독관",
    description: "오요한 신부의 설명",
  },
].map((event, index) => ({
  ...event,
  type: "Conditional",
  visibility: "Hidden",
  status: "Planned",
  priority: 100 - index,
  conditions: event.description,
}));

const actZeroRoutePack: ScenarioPack = {
  ...fatePack,
  projectId: "FATE-SEOUL-ACT0-ROUTE-LOCK-TEST",
  events: actZeroRouteEvents,
};

const actZeroParcelContractPack: ScenarioPack = {
  ...actZeroRoutePack,
  projectId: "FATE-SEOUL-ACT0-PARCEL-CONTRACT-TEST",
  events: actZeroRoutePack.events.map((event) =>
    event.id === "EV_PROLOGUE_03_GRANDMOTHER_PARCEL"
      ? {
          ...event,
          effects: "열었을 때 황동열쇠·불탄 고문서 조각 획득.",
        }
      : event
  ),
};

test("수령 가능·수령 대기는 실제 택배 수령 완료로 판정하지 않는다", () => {
  const state = {
    ...createInitialState(actZeroParcelContractPack),
    turn: 2,
    time: "15:35",
    inventory: [],
  };
  const recentTurns = [
    recentTurn(
      2,
      "",
      "무인택배함에 택배가 도착해 수령 가능 상태가 표시됐다. 상자를 직접 확인할지 선택할 수 있다.",
    ),
  ];
  const drive = deriveStoryDrive({
    pack: actZeroParcelContractPack,
    state,
    userText: "",
    recentTurns,
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.phase, "ordinary_before_parcel");
  assert.equal(
    drive.routeLock.currentEventId,
    "EV_PROLOGUE_03_GRANDMOTHER_PARCEL",
  );
  assert.deepEqual(
    drive.routeLock.requiredItems,
    ["황동열쇠", "불탄 고문서 조각"],
  );

  const assessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [
        {
          type: "narration",
          text: "가벼운 비 속에서 방문 연구자 나디아 알 하다드가 박물관으로 가는 길을 물었다.",
        },
        {
          type: "dialogue",
          text: "박물관 별관은 어느 쪽인가요?",
          speakerName: "나디아 알 하다드",
        },
      ],
      statePatch: {
        time: "15:38",
        inventoryAdd: [],
        encounteredCharactersAdd: [],
      },
      characterVisuals: [],
    },
  });
  assert.equal(assessment.routeStepCompleted, false);
  assert.equal(assessment.prematureProgression, true);
  assert.equal(assessment.needsCorrection, true);
});

test("택배 필수 소품이 실제 인벤토리에 모두 들어와야 나디아 장면으로 진행한다", () => {
  const state = {
    ...createInitialState(actZeroParcelContractPack),
    turn: 3,
    time: "15:40",
    inventory: ["황동열쇠", "불탄 고문서 조각"],
  };
  const drive = deriveStoryDrive({
    pack: actZeroParcelContractPack,
    state,
    userText: "",
    recentTurns: [
      recentTurn(
        3,
        "",
        "무인택배함 문이 열렸고 택배를 실제로 수령했다. 황동열쇠와 불탄 고문서 조각을 꺼냈다.",
      ),
    ],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.phase, "nadia_human_encounter");
});

test("전문에서 택배와 필수 소품을 실제로 챙겼다면 누락된 인벤토리를 복구하고 과거 택배를 재생하지 않는다", () => {
  const state = {
    ...createInitialState(actZeroParcelContractPack),
    turn: 4,
    time: "15:45",
    inventory: [],
  };
  const drive = deriveStoryDrive({
    pack: actZeroParcelContractPack,
    state,
    userText: "상자와 메모를 챙겨 집으로 간다.",
    recentTurns: [
      recentTurn(
        3,
        "택배함을 연다.",
        "무인택배함을 열자 황동열쇠와 불탄 고문서 조각이 들어 있었다. 두 물건을 꺼내 메신저백 안에 챙겼다.",
      ),
    ],
  });

  assert.equal(drive.routeLock.phase, "nadia_human_encounter");
  assert.deepEqual(
    [...drive.reconciledInventoryAdds].sort(),
    ["불탄 고문서 조각", "황동열쇠"].sort(),
  );
});

test("나디아 장면까지 진행됐다면 택배 장부 누락으로 과거 사건을 재연하지 않는다", () => {
  const state = {
    ...createInitialState(actZeroParcelContractPack),
    turn: 4,
    time: "15:42",
    inventory: [],
  };
  const activeConversation = deriveStoryDrive({
    pack: actZeroParcelContractPack,
    state,
    userText: "길을 알려준다.",
    recentTurns: [
      recentTurn(
        3,
        "",
        "나디아 알 하다드라는 방문 연구자가 박물관 별관으로 가는 길을 물었다.",
      ),
    ],
  });
  assert.equal(activeConversation.routeLock.phase, "nadia_human_conversation");

  const deferredRecovery = deriveStoryDrive({
    pack: actZeroParcelContractPack,
    state: { ...state, turn: 5, time: "15:45" },
    userText: "",
    recentTurns: [
      recentTurn(
        4,
        "",
        "나디아는 감사 인사를 남기고 박물관 별관 쪽으로 떠났다. 낮의 만남은 완전히 끝났다.",
      ),
    ],
    advanceMode: "canonical",
  });
  assert.equal(deferredRecovery.routeLock.phase, "separate_evening_daily_life");
  assert.equal(deferredRecovery.routeLock.recoverMissedRequiredEvent, false);
  assert.ok(deferredRecovery.routeLock.forbiddenRegression.includes("1년 늦은 택배"));
  assert.deepEqual(
    deferredRecovery.reconciledInventoryAdds.sort(),
    ["불탄 고문서 조각", "황동열쇠"].sort(),
  );
});

test("나디아 인간 대화가 끝나기 전에는 늦은 시각과 많은 턴에도 습격·소환을 앞당기지 않는다", () => {
  const state = {
    ...createInitialState(actZeroRoutePack),
    turn: 12,
    time: "23:41",
    location: "한성도시대학교 중앙 보행로 안내도 앞",
    sceneSummary: "나디아 알 하다드에게 박물관 별관으로 가는 길을 안내하고 있다.",
    memories: ["실종된 외할머니 한명진 명의의 택배를 수령했다."],
  };
  const drive = deriveStoryDrive({
    pack: actZeroRoutePack,
    state,
    userText: "별관은 언덕 위라 셔틀을 타는 편이 낫다고 설명한다.",
    recentTurns: [],
  });

  assert.equal(drive.routeLock.active, true);
  assert.equal(drive.routeLock.phase, "nadia_human_conversation");
  assert.equal(drive.mode, "accelerate");
  assert.equal(drive.milestoneKind, "scheduled_event");
  assert.equal(drive.requireMilestoneThisTurn, false);
  assert.match(drive.directives.join(" "), /평범한 인간 대화|같은 응답.*습격/);
});

test("나디아 첫 만남 기록 뒤 현재 장면이 다음 날 집이면 작별 문장이 없어도 과거 만남을 다시 열지 않는다", () => {
  const state = {
    ...createInitialState(actZeroRoutePack),
    day: 2,
    date: "2018-10-25",
    turn: 34,
    time: "08:12",
    location: "한시우의 집 침실",
    sceneSummary: "밤사이 상황이 마무리되고 시간이 많이 흘러 집 침실에서 아침을 맞았다.",
    memories: [
      "실종된 외할머니 한명진 명의의 택배를 수령했다.",
      "캠퍼스에서 방문 연구자 나디아 알 하다드가 박물관 별관으로 가는 길을 물었다.",
    ],
  };
  const drive = deriveStoryDrive({
    pack: actZeroRoutePack,
    state,
    userText: "어느 정도 상황도 마무리됐고 시간이 많이 흘렀다.",
    recentTurns: [],
  });

  assert.equal(drive.routeLock.phase, "separate_evening_daily_life");
  assert.ok(drive.routeLock.forbiddenRegression.includes("나디아 인간 만남"));
  assert.match(drive.directives.join(" "), /현재 시각과 장소|나디아와의 만남은 이미 끝/);
});

test("나디아가 감사하고 떠나는 장면 종료는 유효한 ACT 0 진척으로 통과한다", () => {
  const state = {
    ...createInitialState(actZeroRoutePack),
    turn: 6,
    time: "16:12",
    location: "한성도시대학교 중앙 보행로 안내도 앞",
    sceneSummary: "나디아 알 하다드에게 박물관 별관으로 가는 길을 안내하고 있다.",
    memories: ["실종된 외할머니 한명진 명의의 택배를 수령했다."],
  };
  const drive = deriveStoryDrive({
    pack: actZeroRoutePack,
    state,
    userText: "셔틀 정류장의 위치까지 알려준다.",
    recentTurns: [],
  });
  const assessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [
        {
          type: "dialogue",
          text: "감사합니다. 나디아 알 하다드예요. 프랑스에서 온 이름고고학자입니다.",
          speakerId: "NPC_NADIA",
          speakerName: "나디아 알 하다드",
        },
        {
          type: "narration",
          text: "나디아는 고개를 숙여 인사한 뒤 셔틀 정류장 쪽으로 걸어갔다. 낮의 짧은 만남은 그곳에서 끝났다.",
        },
      ],
      statePatch: { time: "16:15", encounteredCharactersAdd: [] },
      characterVisuals: [],
    },
  });

  assert.equal(assessment.routeStepCompleted, true);
  assert.equal(assessment.prematureProgression, false);
  assert.equal(assessment.needsCorrection, false);
});

test("나디아 장면에서 곧바로 서촌 정전 습격을 붙이면 사건 순서 재작성 대상으로 잡는다", () => {
  const state = {
    ...createInitialState(actZeroRoutePack),
    turn: 6,
    time: "16:12",
    sceneSummary: "나디아 알 하다드와 캠퍼스에서 길 안내 대화를 하고 있다.",
    memories: ["실종된 외할머니 한명진 명의의 택배를 수령했다."],
  };
  const drive = deriveStoryDrive({
    pack: actZeroRoutePack,
    state,
    userText: "길을 알려준다.",
    recentTurns: [],
  });
  const assessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [{
        type: "narration",
        text: "나디아가 떠난 직후 서촌 전역이 정전되고 종이가면의 습격이 시작됐다.",
      }],
      statePatch: { time: "22:47", encounteredCharactersAdd: [] },
      characterVisuals: [],
    },
  });

  assert.equal(assessment.prematureProgression, true);
  assert.equal(assessment.needsCorrection, true);
});

test("예전 키워드 판정으로 저장된 저녁 완료 표식은 정전을 앞당기지 않고 의미 판정을 다시 받는다", () => {
  const baseState = {
    ...createInitialState(actZeroRoutePack),
    turn: 6,
    time: "22:47",
    sceneSummary: "나디아가 떠난 뒤 캠퍼스에서 저녁 식사와 배달 앱, 자전거를 생각하고 있다.",
    memories: [
      "한명진 명의 택배를 실제로 수령했다.",
      "나디아 알 하다드가 감사 인사를 남기고 박물관 별관으로 떠났다.",
    ],
  };
  const oldKeywordMarkerState = {
    ...baseState,
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "ACT0_NADIA_SEPARATED_SEOCHON_CHURCH",
        phase: "separate_evening_daily_life",
        eventId: "EV_PROLOGUE_04_EVENING_RAIN",
        completedEventIds: ["EV_PROLOGUE_04_EVENING_RAIN"],
      }),
      visibility: "hidden" as const,
      reason: "구버전 키워드 판정",
      status: "active" as const,
      createdTurn: 6,
    }],
  };
  const semanticMarkerState = {
    ...oldKeywordMarkerState,
    variables: oldKeywordMarkerState.variables.map((variable) => ({
      ...variable,
      detail: JSON.stringify({
        routeId: "ACT0_NADIA_SEPARATED_SEOCHON_CHURCH",
        phase: "separate_evening_daily_life",
        eventId: "EV_PROLOGUE_04_EVENING_RAIN",
        completedEventIds: ["EV_PROLOGUE_04_EVENING_RAIN"],
        adjudication: "semantic-v1",
      }),
    })),
  };

  const oldDrive = deriveStoryDrive({
    pack: actZeroRoutePack,
    state: oldKeywordMarkerState,
    userText: "비도 오는데 집으로 돌아가기로 한다.",
    recentTurns: [],
  });
  const semanticDrive = deriveStoryDrive({
    pack: actZeroRoutePack,
    state: semanticMarkerState,
    userText: "집에서 주변을 확인한다.",
    recentTurns: [],
  });

  assert.equal(oldDrive.routeLock.phase, "separate_evening_daily_life");
  assert.equal(semanticDrive.routeLock.phase, "seochon_blackout_attack");
});

test("Fate 전개도 서버 사건 커서보다 뒤의 문장이 보여도 패키지 다음 순서를 건너뛰지 않는다", () => {
  const state = {
    ...createInitialState(actZeroRoutePack),
    turn: 8,
    time: "23:50",
    sceneSummary: "전문에 출처를 확인할 수 없는 소환과 성당 관련 문장이 섞여 있다.",
    memories: [
      "우발 소환으로 소녀 검사가 나타났다는 문장이 저장됐다.",
      "성당교회 감독관을 만났다는 문장이 저장됐다.",
    ],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "ACT0_NADIA_SEPARATED_SEOCHON_CHURCH",
        phase: "ordinary_before_parcel",
        eventId: "EV_PROLOGUE_03_GRANDMOTHER_PARCEL",
        completedEventIds: [
          "EV_PROLOGUE_02_MAP_GLITCH",
          "EV_PROLOGUE_03_GRANDMOTHER_PARCEL",
        ],
        adjudication: "semantic-v1",
      }),
      visibility: "hidden" as const,
      reason: "server verified",
      status: "active" as const,
      createdTurn: 7,
    }],
  };
  const drive = deriveStoryDrive({
    pack: actZeroRoutePack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.phase, "nadia_human_encounter");
  assert.equal(
    drive.routeLock.currentEventId,
    "EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER",
  );
});

test("실제 세이버 기준본과 성당 현장 상태가 있으면 뒤처진 ACT 0 커서를 완료 지점으로 복구한다", () => {
  const state = {
    ...createInitialState(actZeroRoutePack),
    turn: 37,
    time: "00:55",
    location: "명동성당 부속 비공개 별관 지하 임시 보호실",
    sceneSummary: "오요한 신부가 성배전쟁의 마스터와 서번트 계약을 설명했다.",
    memories: [
      "홍재와 함께 명동성당 지하 보호실에 도착했다.",
      "오요한 신부에게 성배전쟁과 마스터·서번트에 관한 설명을 들었다.",
    ],
    encounteredCharacterIds: [saberNpc.id],
    characterVisuals: [{
      characterId: saberNpc.id,
      characterName: saberNpc.name,
      appearancePrompt: saberNpc.appearance,
      assetId: "saber-canonical",
      source: "package" as const,
      introducedTurn: 8,
    }],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "ACT0_NADIA_SEPARATED_SEOCHON_CHURCH",
        phase: "ordinary_before_parcel",
        eventId: "EV_PROLOGUE_03_GRANDMOTHER_PARCEL",
        completedEventIds: ["EV_PROLOGUE_03_GRANDMOTHER_PARCEL"],
        adjudication: "semantic-v1",
      }),
      visibility: "hidden" as const,
      reason: "stale server cursor",
      status: "active" as const,
      createdTurn: 3,
    }],
  };

  const drive = deriveStoryDrive({
    pack: actZeroRoutePack,
    state,
    userText: "성당에서 다음 설명을 기다린다.",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.active, false);
  assert.equal(drive.routeLock.routeId, "ACT0_NADIA_SEPARATED_SEOCHON_CHURCH");
  assert.equal(drive.routeLock.phase, "completed");
  assert.ok(drive.routeLock.forbiddenRegression.includes("나디아 인간 만남"));
});

test("ACT 0 완료 뒤에는 패키지 첫 사건으로 돌아가지 않고 다음 필수 사건으로 인계한다", () => {
  const postChurchEvent = {
    ...actZeroRouteEvents.at(-1)!,
    id: "EV_ACT_ONE_FIRST_REQUIRED_EVENT",
    name: "제1막 첫 필수 사건",
    description: "성당교회 설명 이후 현재 시점에서 시작되는 사건",
    completionSignals: "제1막 사건이 시작됐다",
    required: true,
    sequence: 10,
  };
  const pack: ScenarioPack = {
    ...actZeroRoutePack,
    events: [
      ...actZeroRoutePack.events.map((event, index) => ({
        ...event,
        required: true,
        sequence: index + 1,
      })),
      postChurchEvent,
    ],
  };
  const state = {
    ...createInitialState(pack),
    turn: 37,
    time: "00:55",
    location: "명동성당 지하 임시 보호실",
    sceneSummary: "오요한 신부의 성배전쟁 설명이 끝났다.",
    memories: ["홍재와 성당에 도착해 오요한 신부의 설명을 들었다."],
    encounteredCharacterIds: [saberNpc.id],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "ACT0_NADIA_SEPARATED_SEOCHON_CHURCH",
        phase: "church_orientation",
        eventId: "EV_PROLOGUE_09_CHURCH_ORIENTATION",
        completedEventIds: actZeroRouteEvents.map((event) => event.id),
        adjudication: "semantic-v1",
      }),
      visibility: "hidden" as const,
      reason: "server verified",
      status: "active" as const,
      createdTurn: 37,
    }],
  };

  const drive = deriveStoryDrive({
    pack,
    state,
    userText: "다음 설명을 듣는다.",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.active, true);
  assert.equal(drive.routeLock.currentEventId, postChurchEvent.id);
  assert.notEqual(
    drive.routeLock.currentEventId,
    "EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER",
  );
  assert.ok(drive.routeLock.forbiddenRegression.includes("나디아 인간 만남"));
});

const genericRequiredPack: ScenarioPack = {
  ...demoScenario,
  projectId: "CLOCKWORK-LIBRARY-REQUIRED-EVENT-TEST",
  title: "시계도서관의 마지막 열쇠",
  genre: "미스터리 어드벤처",
  npcs: [{
    ...demoScenario.npcs[0],
    id: "NPC_LIBRARIAN_MIRA",
    name: "사서 미라",
    role: "폐쇄 서고의 안내인",
  }],
  events: [
    {
      id: "EVENT_OPEN_SEALED_ARCHIVE",
      name: "봉인 서고 개방",
      type: "Conditional",
      visibility: "Hidden",
      status: "Planned",
      priority: 100,
      conditions: "첫 번째 탐색 장면 이후",
      description: "사서 미라의 도움으로 봉인 서고가 열린다.",
      effects: "봉인문이 열리고 청동 인장을 회수한다.",
      required: true,
      sequence: 1,
      completionSignals: "봉인문이 열렸다|봉인이 해제됐다",
      requiredItems: "청동 인장",
      requiredDialogue: "문이 열렸습니다.",
      requiredSpeakerId: "NPC_LIBRARIAN_MIRA",
      recoveryAlternatives: "관리용 통로의 잠금장치가 자동 해제된다|미라가 예비 열쇠를 전달한다",
      preservePlayerChoice: true,
      endSceneAfterCompletion: true,
    },
    {
      id: "EVENT_CLOCK_TOWER_JUDGMENT",
      name: "시계탑의 심판",
      type: "Fixed Timeline",
      visibility: "Hidden",
      status: "Planned",
      priority: 90,
      conditions: "봉인 서고 개방 이후",
      description: "시계탑에서 최종 심판이 시작된다.",
      required: true,
      sequence: 2,
      completionSignals: "심판이 시작됐다",
      requiredItems: "",
      requiredDialogue: "",
      requiredSpeakerId: "",
      recoveryAlternatives: "시계탑의 종이 울린다",
      preservePlayerChoice: true,
      endSceneAfterCompletion: true,
    },
  ],
};

test("비-Fate 작품도 패키지의 첫 필수 사건 계약을 최우선으로 진행한다", () => {
  const state = {
    ...createInitialState(genericRequiredPack),
    turn: 2,
    time: "09:00",
  };
  const drive = deriveStoryDrive({
    pack: genericRequiredPack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.scenarioFamily, "generic");
  assert.equal(drive.routeLock.phase, "required_event");
  assert.equal(drive.routeLock.currentEventId, "EVENT_OPEN_SEALED_ARCHIVE");
  assert.equal(drive.mode, "force_milestone");
  assert.equal(drive.requireMilestoneThisTurn, true);
  assert.deepEqual(drive.routeLock.requiredItems, ["청동 인장"]);
  assert.equal(drive.routeLock.requiredDialogue, "문이 열렸습니다.");
  assert.match(drive.directives.join(" "), /원래 연출.*되감지|우회 경로/u);
});

test("같은 순번의 필수 사건은 우선순위 숫자가 아니라 패키지에 적힌 순서대로 진행한다", () => {
  const packageOrderPack: ScenarioPack = {
    ...genericRequiredPack,
    projectId: "PACKAGE-DECLARATION-ORDER-IS-AUTHORITATIVE",
    events: genericRequiredPack.events.map((event, index) => ({
      ...event,
      sequence: 1,
      priority: index === 0 ? 1 : 999,
    })),
  };
  const drive = deriveStoryDrive({
    pack: packageOrderPack,
    state: createInitialState(packageOrderPack),
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.currentEventId, "EVENT_OPEN_SEALED_ARCHIVE");
  assert.notEqual(drive.routeLock.currentEventId, "EVENT_CLOCK_TOWER_JUDGMENT");
});

test("필수 체크 사건은 일반 입력에서도 한 번의 준비 턴 뒤 강제 완료 단계가 된다", () => {
  const firstTurnDrive = deriveStoryDrive({
    pack: genericRequiredPack,
    state: {
      ...createInitialState(genericRequiredPack),
      turn: 0,
    },
    userText: "복도를 천천히 살핀다.",
    recentTurns: [],
  });
  const nextTurnDrive = deriveStoryDrive({
    pack: genericRequiredPack,
    state: {
      ...createInitialState(genericRequiredPack),
      turn: 1,
    },
    userText: "다른 서가를 확인한다.",
    recentTurns: [],
  });

  assert.equal(firstTurnDrive.mode, "accelerate");
  assert.equal(nextTurnDrive.mode, "force_milestone");
  assert.equal(nextTurnDrive.requireMilestoneThisTurn, true);
});

test("모든 작품에서 사건명이 수령 가능·대기처럼 언급된 것만으로 필수 사건을 완료하지 않는다", () => {
  const noContractPack: ScenarioPack = {
    ...genericRequiredPack,
    projectId: "GLASS-DOOR-PENDING-EVENT-TEST",
    events: [{
      ...genericRequiredPack.events[0],
      id: "EVENT_OPEN_GLASS_DOOR",
      name: "유리문 개방",
      description: "유리문을 실제로 열어 다음 구역을 확보한다.",
      effects: "유리문이 열린다.",
      completionSignals: "",
      requiredItems: "",
      requiredDialogue: "",
      requiredSpeakerId: "",
    }],
  };
  const state = {
    ...createInitialState(noContractPack),
    turn: 2,
    time: "09:00",
  };
  const drive = deriveStoryDrive({
    pack: noContractPack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });
  const pending = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [{
        type: "narration",
        text: "단말기에 유리문 개방 가능 상태가 표시됐다. 실제로 열지는 않았다.",
      }],
      statePatch: { time: "09:01", inventoryAdd: [], encounteredCharactersAdd: [] },
      characterVisuals: [],
    },
  });
  const completed = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [{
        type: "narration",
        text: "잠금이 풀리고 유리문 개방이 완료됐다. 다음 구역으로 이어지는 통로가 확보됐다.",
      }],
      statePatch: { time: "09:02", inventoryAdd: [], encounteredCharactersAdd: [] },
      characterVisuals: [],
    },
  });

  assert.equal(pending.routeStepCompleted, false);
  assert.equal(pending.needsCorrection, true);
  assert.equal(completed.routeStepCompleted, true);
  assert.equal(completed.needsCorrection, false);
});

test("비-Fate 필수 사건은 소품과 정확한 마지막 대사를 충족하면 통과한다", () => {
  const state = {
    ...createInitialState(genericRequiredPack),
    turn: 2,
    time: "09:00",
  };
  const drive = deriveStoryDrive({
    pack: genericRequiredPack,
    state,
    userText: "서고 대신 복도로 돌아간다.",
    recentTurns: [],
    advanceMode: "canonical",
  });
  const assessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [
        {
          type: "narration",
          text: "관리용 통로의 잠금장치가 자동으로 풀렸다. 봉인문이 열렸다. 문턱 안쪽에서 청동 인장을 회수했다.",
        },
        {
          type: "dialogue",
          text: "문이 열렸습니다.",
          speakerId: "NPC_LIBRARIAN_MIRA",
          speakerName: "사서 미라",
        },
      ],
      statePatch: {
        time: "09:05",
        inventoryAdd: ["청동 인장"],
        encounteredCharactersAdd: [],
      },
      characterVisuals: [],
    },
  });

  assert.equal(assessment.milestoneTriggered, true);
  assert.equal(assessment.routeStepCompleted, true);
  assert.equal(assessment.prematureProgression, false);
  assert.equal(assessment.needsCorrection, false);
});

test("비-Fate 필수 사건 완료 턴에 다음 필수 사건을 붙이면 차단한다", () => {
  const state = {
    ...createInitialState(genericRequiredPack),
    turn: 2,
    time: "09:00",
  };
  const drive = deriveStoryDrive({
    pack: genericRequiredPack,
    state,
    userText: "문을 살핀다.",
    recentTurns: [],
    advanceMode: "canonical",
  });
  const assessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [
        {
          type: "narration",
          text: "봉인문이 열렸다. 청동 인장을 회수한 순간 시계탑의 심판까지 시작됐다.",
        },
        {
          type: "dialogue",
          text: "문이 열렸습니다.",
          speakerId: "NPC_LIBRARIAN_MIRA",
          speakerName: "사서 미라",
        },
      ],
      statePatch: {
        time: "09:05",
        inventoryAdd: ["청동 인장"],
        encounteredCharactersAdd: [],
      },
      characterVisuals: [],
    },
  });

  assert.equal(assessment.milestoneTriggered, true);
  assert.equal(assessment.prematureProgression, true);
  assert.equal(assessment.needsCorrection, true);
});

test("후반의 소환이 확인되면 나디아·저녁 기록이 빠져도 과거 단계로 돌아가지 않는다", () => {
  const state = {
    ...createInitialState(actZeroRoutePack),
    turn: 9,
    time: "23:43",
    location: "서촌 옛 민방위 방공호",
    sceneSummary: "검을 든 소녀 검사가 한시우와 공격자 사이를 가로막고 있다.",
    memories: [],
    encounteredCharacterIds: [saberNpc.id],
    characterVisuals: [{
      characterId: saberNpc.id,
      characterName: saberNpc.name,
      appearancePrompt: saberNpc.appearance,
      assetId: "saber-canonical",
      source: "package" as const,
      introducedTurn: 8,
    }],
  };
  const drive = deriveStoryDrive({
    pack: actZeroRoutePack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.phase, "first_battle_after_summoning");
  assert.notEqual(drive.routeLock.currentEventId, "EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER");
  assert.match(drive.directives.join(" "), /과거 사건.*다시.*되감지/u);
});

test("첫 전투 종료와 감독관 방문 제안이 확인되면 다음 정석 전개는 성당교회다", () => {
  const state = {
    ...createInitialState(actZeroRoutePack),
    turn: 10,
    time: "23:55",
    location: "서촌 옛 민방위 방공호 입구",
    sceneSummary: "소녀 검사가 첫 방어전을 끝내고 성당교회 감독관을 만나러 가자고 제안했다.",
    memories: [
      "홍재가 종이가면 추적자를 물리쳐 첫 전투가 끝났고 성당교회 감독관에게 안내하겠다고 말했다.",
    ],
    encounteredCharacterIds: [saberNpc.id],
  };
  const drive = deriveStoryDrive({
    pack: actZeroRoutePack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.phase, "church_orientation");
  assert.equal(drive.routeLock.currentEventId, "EV_PROLOGUE_09_CHURCH_ORIENTATION");
});

test("모든 작품에서 뒤 사건이 완료되면 누락된 앞 사건을 종결하고 현재 다음 사건으로 간다", () => {
  const thirdEventPack: ScenarioPack = {
    ...genericRequiredPack,
    events: [
      ...genericRequiredPack.events,
      {
        ...genericRequiredPack.events[1],
        id: "EVENT_FINAL_RETURN",
        name: "귀환문 개방",
        priority: 80,
        sequence: 3,
        conditions: "시계탑의 심판 이후",
        description: "귀환문이 열린다.",
        completionSignals: "귀환문이 열렸다",
      },
    ],
  };
  const state = {
    ...createInitialState(thirdEventPack),
    turn: 7,
    memories: ["시계탑에서 심판이 시작됐다."],
  };
  const drive = deriveStoryDrive({
    pack: thirdEventPack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.currentEventId, "EVENT_FINAL_RETURN");
  assert.equal(drive.routeLock.recoverMissedRequiredEvent, false);
  assert.ok(drive.routeLock.forbiddenRegression.includes("심판이 시작됐다"));
  assert.ok(drive.routeLock.forbiddenRegression.includes("문이 열렸습니다."));
  assert.match(drive.directives.join(" "), /종결된 과거|다시.*현재 서사/u);
});

test("마지막 뒤 사건까지 완료되면 누락된 앞 사건은 복구 장면으로 다시 열리지 않는다", () => {
  const state = {
    ...createInitialState(genericRequiredPack),
    turn: 7,
    memories: ["시계탑에서 심판이 시작됐다."],
  };
  const drive = deriveStoryDrive({
    pack: genericRequiredPack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });
  const replayAssessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [
        { type: "narration", text: "아침의 봉인 서고로 돌아가 봉인문이 열렸다. 청동 인장을 회수했다." },
        { type: "dialogue", text: "문이 열렸습니다.", speakerName: "사서 미라" },
      ],
      statePatch: {
        time: "09:05",
        inventoryAdd: ["청동 인장"],
        encounteredCharactersAdd: [],
      },
      characterVisuals: [],
    },
  });
  assert.equal(drive.routeLock.active, false);
  assert.equal(drive.routeLock.recoverMissedRequiredEvent, false);
  assert.ok(drive.routeLock.forbiddenRegression.includes("봉인문이 열렸다"));
  assert.equal(replayAssessment.routeStepCompleted, false);
  assert.equal(replayAssessment.prematureProgression, true);
  assert.equal(replayAssessment.needsCorrection, true);
});

test("서버 원장과 뒤 사건 증거가 섞여도 가장 뒤 완료점 다음에서만 이어 간다", () => {
  const thirdEventPack: ScenarioPack = {
    ...genericRequiredPack,
    events: [
      ...genericRequiredPack.events,
      {
        ...genericRequiredPack.events[1],
        id: "EVENT_FINAL_RETURN_AFTER_RECOVERY",
        name: "귀환문 개방",
        priority: 80,
        sequence: 3,
        conditions: "시계탑의 심판 이후",
        description: "귀환문이 열린다.",
        completionSignals: "귀환문이 열렸다",
      },
    ],
  };
  const state = {
    ...createInitialState(thirdEventPack),
    turn: 8,
    memories: ["시계탑에서 심판이 시작됐다."],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "PACKAGE_REQUIRED_EVENT_SEQUENCE",
        phase: "required_event",
        eventId: "EVENT_OPEN_SEALED_ARCHIVE",
      }),
      visibility: "hidden" as const,
      reason: "server verified",
      status: "active" as const,
      createdTurn: 7,
    }],
  };
  const drive = deriveStoryDrive({
    pack: thirdEventPack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.currentEventId, "EVENT_FINAL_RETURN_AFTER_RECOVERY");
  assert.equal(drive.routeLock.recoverMissedRequiredEvent, false);
  assert.ok(drive.routeLock.forbiddenRegression.includes("심판이 시작됐다"));
});

test("서버 완료 진행도는 전문과 요약이 사라져도 다음 필수 사건을 고정한다", () => {
  const state = {
    ...createInitialState(genericRequiredPack),
    turn: 4,
    memories: [],
    inventory: ["청동 인장"],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "PACKAGE_REQUIRED_EVENT_SEQUENCE",
        phase: "required_event",
        eventId: "EVENT_OPEN_SEALED_ARCHIVE",
      }),
      visibility: "hidden" as const,
      reason: "server verified",
      status: "active" as const,
      createdTurn: 3,
    }],
  };
  const drive = deriveStoryDrive({
    pack: genericRequiredPack,
    state,
    userText: "",
    recentTurns: [],
    longTermMemories: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.currentEventId, "EVENT_CLOCK_TOWER_JUDGMENT");
});

test("서버 사건 커서가 있으면 본문의 미래 사건 문구만으로 다음 순서를 건너뛰지 않는다", () => {
  const state = {
    ...createInitialState(genericRequiredPack),
    turn: 4,
    inventory: ["청동 인장"],
    memories: ["누군가 시계탑의 심판이 이미 시작됐다고 주장했다."],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "PACKAGE_REQUIRED_EVENT_SEQUENCE",
        phase: "required_event",
        eventId: "EVENT_OPEN_SEALED_ARCHIVE",
        completedEventIds: ["EVENT_OPEN_SEALED_ARCHIVE"],
        adjudication: "semantic-v1",
      }),
      visibility: "hidden" as const,
      reason: "server verified",
      status: "active" as const,
      createdTurn: 3,
    }],
  };
  const drive = deriveStoryDrive({
    pack: genericRequiredPack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.currentEventId, "EVENT_CLOCK_TOWER_JUDGMENT");
  assert.equal(drive.routeLock.active, true);
});

test("공통 필수 사건 감독은 현재 사건 대신 완료된 앞 사건을 재연한 응답을 거부한다", () => {
  const state = {
    ...createInitialState(genericRequiredPack),
    turn: 4,
    inventory: ["청동 인장"],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "PACKAGE_REQUIRED_EVENT_SEQUENCE",
        phase: "required_event",
        eventId: "EVENT_OPEN_SEALED_ARCHIVE",
      }),
      visibility: "hidden" as const,
      reason: "server verified",
      status: "active" as const,
      createdTurn: 3,
    }],
  };
  const drive = deriveStoryDrive({
    pack: genericRequiredPack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });
  const assessment = assessStoryDrive({
    state,
    drive,
    turn: {
      blocks: [
        { type: "narration", text: "봉인 서고 개방이 다시 시작되며 봉인문이 열렸다." },
        { type: "dialogue", text: "문이 열렸습니다.", speakerName: "사서 미라" },
      ],
      statePatch: {
        time: "09:10",
        inventoryAdd: [],
        encounteredCharactersAdd: [],
      },
      characterVisuals: [],
    },
  });

  assert.equal(assessment.routeStepCompleted, false);
  assert.equal(assessment.prematureProgression, true);
  assert.equal(assessment.needsCorrection, true);
});

test("서버 완료 표식이 있어도 필수 소품이 실제 인벤토리에 없으면 사건을 완료 처리하지 않는다", () => {
  const state = {
    ...createInitialState(genericRequiredPack),
    turn: 4,
    inventory: [],
    variables: [{
      id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "PACKAGE_REQUIRED_EVENT_SEQUENCE",
        phase: "required_event",
        eventId: "EVENT_OPEN_SEALED_ARCHIVE",
      }),
      visibility: "hidden" as const,
      reason: "server verified",
      status: "active" as const,
      createdTurn: 3,
    }],
  };
  const drive = deriveStoryDrive({
    pack: genericRequiredPack,
    state,
    userText: "",
    recentTurns: [],
    advanceMode: "canonical",
  });

  assert.equal(drive.routeLock.currentEventId, "EVENT_OPEN_SEALED_ARCHIVE");
  assert.deepEqual(drive.routeLock.requiredItems, ["청동 인장"]);
});
