import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  applyStatePatch,
  createMockTurn,
  inferNarrativeChronology,
  resolveRuntimeChronology,
  synchronizeGeneratedTurnChronology,
} from "../lib/engine";
import {
  MAX_SCENARIO_JSON_BYTES,
  MAX_SCENARIO_PACKAGE_BYTES,
  createInitialState,
  createOpeningTurn,
  deriveEncounteredCharacterIds,
  detachScenarioMedia,
  extractScenarioMediaDataUrl,
  hasUsableSplitScenarioJson,
  isPlayerAgencyViolation,
  normalizeScenarioPack,
  parseScenarioPackFile,
  repairPackageCharacterVisuals,
  resolveVisibleCharacterAlias,
  selectCharacterReferenceAsset,
  selectEventCharacterReferenceIds,
  selectEventTriggeredMediaAsset,
  selectSaberSummoningMediaAsset,
  selectPackageCharacterReferenceAsset,
  selectSceneCharacterReferenceIds,
  selectTriggeredScenarioMediaAsset,
  STORY_ROUTE_PROGRESS_VARIABLE_ID,
  type ScenarioMediaAsset,
  type TurnRecord,
} from "../lib/scenario";
import {
  applyStatusLedgerChanges,
  buildPublicStatusSnapshot,
  isPubliclyObservedMemory,
  sanitizeStoredPublicStatusSnapshot,
} from "../lib/status-window";
import {
  sanitizeRelationshipMemoryPatches,
  selectAutonomyCandidates,
} from "../lib/autonomy";
import { demoScenario } from "../lib/demo-scenario";

test("저장본의 예약 시각이 남아 있어도 새 이야기 HUD는 오프닝 본문 시각에서 시작한다", () => {
  const pack = {
    ...demoScenario,
    startTime: "15:30",
    opening: {
      ...demoScenario.opening,
      openingLine: "오전 8시 07분, 첫 수업 직전에 휴대전화가 짧게 진동했다.",
    },
  };

  assert.equal(createInitialState(pack).time, "08:07");
});

test("서버의 필수 사건 진행도는 숨은 변수 제한을 넘어도 삭제되지 않는다", () => {
  const pack = normalizeScenarioPack(
    { projectId: "LONG-RUN-STORY-PROGRESS", title: "장기 연재" },
    {
      projectId: "LONG-RUN-STORY-PROGRESS",
      title: "장기 연재",
      player: { id: "PLAYER", name: "주인공" },
      opening: { openingLine: "시작한다." },
    },
  );
  const state = {
    ...createInitialState(pack),
    variables: [
      {
        id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
        label: "서버 검증 이야기 진행도",
        detail: JSON.stringify({ routeId: "PACKAGE_REQUIRED_EVENT_SEQUENCE", phase: "required_event", eventId: "EVENT_15" }),
        visibility: "hidden" as const,
        reason: "server verified",
        status: "active" as const,
        createdTurn: 15,
      },
      ...Array.from({ length: 15 }, (_, index) => ({
        id: `VARIABLE_${index}`,
        label: `변수 ${index}`,
        detail: "장기 진행 변수",
        visibility: "hidden" as const,
        reason: "test",
        status: "active" as const,
        createdTurn: index,
      })),
    ],
  };
  const next = applyStatePatch(state, {
    time: state.time,
    location: state.location,
    sceneSummary: state.sceneSummary,
    statusAdd: [],
    statusRemove: [],
    inventoryAdd: [],
    inventoryRemove: [],
    relationChanges: [],
    clockChanges: [],
    memoryAdd: [],
    variablesAdd: [{
      id: "VARIABLE_NEW",
      label: "새 변수",
      detail: "새로운 장기 진행 변수",
      visibility: "hidden",
      reason: "test",
    }],
    variablesResolve: [],
    characterVisualsAdd: [],
    encounteredCharactersAdd: [],
    statusLedgerChanges: [],
    autonomyActions: [],
    relationshipMemoriesAdd: [],
    relationshipMemoryResolveIds: [],
  }, pack);

  assert.equal(next.variables.length, 16);
  assert.ok(next.variables.some((variable) =>
    variable.id === STORY_ROUTE_PROGRESS_VARIABLE_ID
  ));
  assert.ok(next.variables.some((variable) => variable.id === "VARIABLE_NEW"));
});

test("자정을 넘는 시각 패치는 날짜·요일·D-Day를 함께 전진시킨다", () => {
  const chronology = resolveRuntimeChronology({
    day: 0,
    date: "2018-10-23",
    weekday: "화요일",
    time: "23:48",
  }, "00:12");

  assert.deepEqual(chronology, {
    day: 1,
    date: "2018-10-24",
    weekday: "수요일",
    time: "00:12",
  });
});

test("설명 없는 낮 시간 역행은 다음 날로 오인하지 않고 현재 시각에 고정한다", () => {
  const chronology = resolveRuntimeChronology({
    day: 0,
    date: "2018-10-23",
    weekday: "화요일",
    time: "15:42",
  }, "09:03");

  assert.equal(chronology.time, "15:42");
  assert.equal(chronology.date, "2018-10-23");
  assert.equal(chronology.day, 0);
});

test("본문의 명시적 현재 시각을 상태 패치와 HUD 원장에 강제로 동기화한다", () => {
  const state = {
    ...createInitialState(demoScenario),
    time: "15:30",
  };
  const turn = createMockTurn({
    pack: demoScenario,
    state,
    userText: "수업을 마친다.",
    recentTurns: [],
  });
  const synchronized = synchronizeGeneratedTurnChronology(state, {
    ...turn,
    blocks: [{
      id: "time-anchor",
      type: "narration" as const,
      text: "오후 4시 12분, 마지막 수업이 끝나 복도에 학생들이 쏟아져 나왔다.",
    }],
    statePatch: { ...turn.statePatch, time: "15:33" },
  });
  const next = applyStatePatch(
    state,
    synchronized.statePatch,
    demoScenario,
    synchronized.chronology,
  );

  assert.equal(synchronized.statePatch.time, "16:12");
  assert.equal(synchronized.chronology.time, "16:12");
  assert.equal(synchronized.narrativeAudit?.currentTime, "16:12");
  assert.equal(next.time, "16:12");
  assert.equal(buildPublicStatusSnapshot(demoScenario, next)?.time, "16:12");
});

test("모델의 낮 시간 역행은 서버 확정 단계에서 모든 시간 소비자보다 먼저 제거한다", () => {
  const state = {
    ...createInitialState(demoScenario),
    day: 2,
    date: "2018-10-25",
    weekday: "목요일",
    time: "15:42",
  };
  const turn = createMockTurn({
    pack: demoScenario,
    state,
    userText: "복도를 계속 살핀다.",
    recentTurns: [],
  });
  const synchronized = synchronizeGeneratedTurnChronology(state, {
    ...turn,
    blocks: [{
      id: "no-time-anchor",
      type: "narration" as const,
      text: "복도 끝에서 문이 닫히는 소리가 들렸다.",
    }],
    statePatch: { ...turn.statePatch, time: "09:03", dayDelta: 0 },
    claudeSignals: {
      inputMode: "advance" as const,
      sceneTime: "09:03",
      location: turn.statePatch.location,
      appearing: [],
      firstAppearance: [],
      mentioned: [],
      openQuestions: [],
      resolvedQuestions: [],
      beatAdvanced: false,
      eventResolved: false,
      resolutionSummary: "",
      autoAction: "",
    },
  });

  assert.deepEqual(synchronized.chronology, {
    day: 2,
    date: "2018-10-25",
    weekday: "목요일",
    time: "15:42",
  });
  assert.equal(synchronized.statePatch.time, "15:42");
  assert.equal(synchronized.statePatch.dayDelta, 0);
  assert.equal(synchronized.claudeSignals.sceneTime, "15:42");
  assert.equal(synchronized.narrativeAudit?.currentTime, "15:42");
  assert.equal(synchronized.chronologyConflict, undefined);
});

test("본문이 현재보다 과거 시각을 명시하면 조용히 HUD만 고치지 않고 재작성 충돌로 표시한다", () => {
  const state = {
    ...createInitialState(demoScenario),
    day: 2,
    date: "2018-10-25",
    weekday: "목요일",
    time: "15:42",
  };
  const turn = createMockTurn({
    pack: demoScenario,
    state,
    userText: "복도를 계속 살핀다.",
    recentTurns: [],
  });
  const synchronized = synchronizeGeneratedTurnChronology(state, {
    ...turn,
    blocks: [{
      id: "past-time-anchor",
      type: "narration" as const,
      text: "오전 9시 3분, 복도 끝에서 문이 닫혔다.",
    }],
    statePatch: { ...turn.statePatch, time: "09:03", dayDelta: 0 },
  });

  assert.equal(synchronized.statePatch.time, "15:42");
  assert.match(synchronized.chronologyConflict ?? "", /09:03/u);
  assert.equal(synchronized.narrativeAudit?.chronologyConsistent, false);
});

test("다음 날 신호는 모델 시각이 잘못돼도 달력 원장을 먼저 전진시킨다", () => {
  const chronology = resolveRuntimeChronology({
    day: 2,
    date: "2018-10-25",
    weekday: "목요일",
    time: "22:40",
  }, "시각 오류", 1);

  assert.deepEqual(chronology, {
    day: 3,
    date: "2018-10-26",
    weekday: "금요일",
    time: "22:40",
  });
});

test("다음 날 서술은 시각뿐 아니라 날짜·요일·D-Day까지 함께 넘긴다", () => {
  const state = {
    ...createInitialState(demoScenario),
    day: 0,
    date: "2018-10-23",
    weekday: "화요일",
    time: "22:40",
  };
  const signal = inferNarrativeChronology(state, [{
    type: "narration",
    text: "다음 날 오전 7시 10분, 창문 사이로 들어온 빛에 방 안의 윤곽이 드러났다.",
  }]);
  const chronology = resolveRuntimeChronology(
    state,
    signal.time ?? state.time,
    signal.dayDelta,
  );

  assert.deepEqual(signal, {
    time: "07:10",
    dayDelta: 1,
    source: "explicit_time",
  });
  assert.deepEqual(chronology, {
    day: 1,
    date: "2018-10-24",
    weekday: "수요일",
    time: "07:10",
  });
});

test("본문이 날짜와 아침만 명시해도 전날 밤 HUD를 유지하지 않는다", () => {
  const state = {
    ...createInitialState(demoScenario),
    day: 0,
    date: "2018-10-23",
    weekday: "화요일",
    time: "22:08",
  };
  const synchronized = synchronizeGeneratedTurnChronology(state, {
    blocks: [{
      id: "date-only-morning",
      type: "narration" as const,
      text: "2018년 10월 24일 아침. 커튼 사이로 햇빛이 침실 바닥을 밝혔다.",
    }],
    statePatch: {
      time: "22:18",
      dayDelta: 0,
      location: "침실",
      sceneSummary: "밤새 잠든 뒤 아침이 밝았다.",
      statusAdd: [], statusRemove: [], inventoryAdd: [], inventoryRemove: [],
      memoryAdd: [], variablesAdd: [], variablesResolve: [], clockChanges: [],
      relationChanges: [], autonomyActions: [], relationshipMemoriesAdd: [],
      relationshipMemoryResolveIds: [], observableTracesAdd: [],
      encounteredCharactersAdd: [], statusLedgerChanges: [], sessionCanonUpdates: [],
    },
  });

  assert.deepEqual(synchronized.chronology, {
    day: 1,
    date: "2018-10-24",
    weekday: "수요일",
    time: "08:00",
  });
  assert.equal(synchronized.statePatch.dayDelta, 1);
  assert.equal(synchronized.statePatch.time, "08:00");
});

test("택배 도착 예정·알람 시각은 현재 HUD 시각으로 오인하지 않는다", () => {
  const state = { date: "2018-10-23", time: "09:03" };
  const signal = inferNarrativeChronology(state, [{
    type: "narration",
    text: "휴대전화에는 택배 도착 예정 15:30과 오전 수업 알람이 나란히 남아 있었다.",
  }]);

  assert.deepEqual(signal, { source: "none" });
});

test("저녁 무렵과 어두워진 현재 풍경은 같은 턴의 HUD를 저녁으로 전진시킨다", () => {
  const state = {
    ...createInitialState(demoScenario),
    time: "15:27",
  };
  const text = [
    "창밖의 햇빛은 서서히 낮아졌고, 유리창에 비친 실내 조명은 하나둘 밝아졌다.",
    "시계가 저녁 무렵을 가리킬 때까지 공부가 이어졌다.",
    "창가 너머로 어두워진 캠퍼스 보도가 보였다.",
  ].join("\n");
  const signal = inferNarrativeChronology(state, [{ type: "narration", text }]);
  const turn = createMockTurn({
    pack: demoScenario,
    state,
    userText: "휴대전화를 끄고 계속 공부한다.",
    recentTurns: [],
  });
  const synchronized = synchronizeGeneratedTurnChronology(state, {
    ...turn,
    blocks: [{ id: "evening-transition", type: "narration" as const, text }],
    statePatch: { ...turn.statePatch, time: "15:27" },
  });

  assert.deepEqual(signal, { time: "19:00", source: "day_period" });
  assert.equal(synchronized.statePatch.time, "19:00");
  assert.equal(synchronized.chronology.time, "19:00");
});

test("미래의 저녁 계획만 언급한 문장은 현재 HUD를 움직이지 않는다", () => {
  const signal = inferNarrativeChronology(
    { date: "2018-10-23", time: "15:27" },
    [{
      type: "narration",
      text: "저녁에 제출할 과제와 오늘 밤의 귀가 계획이 노트 한쪽에 적혀 있었다.",
    }],
  );

  assert.deepEqual(signal, { source: "none" });
});

const samplePath = new URL(
  "../samples/기성학원_첫_번째_공명_ScenarioPack.zip",
  import.meta.url,
);

const loadPack = async () => {
  const bytes = await readFile(samplePath);
  return parseScenarioPackFile(
    new NodeFile([bytes], "scenario.zip") as unknown as globalThis.File,
  );
};

test("ScenarioPack 분석 진행률은 단계별로 증가해 100%에서 끝난다", async () => {
  const bytes = await readFile(samplePath);
  const updates: Array<{ ratio: number; phase: string; detail: string }> = [];
  await parseScenarioPackFile(
    new NodeFile([bytes], "scenario-progress.zip") as unknown as globalThis.File,
    { onProgress: (progress) => updates.push(progress) },
  );

  assert.ok(updates.length >= 5);
  assert.equal(updates.at(-1)?.ratio, 1);
  assert.match(updates.at(-1)?.phase ?? "", /완료/);
  assert.ok(
    updates.every((progress, index) =>
      index === 0 || progress.ratio >= updates[index - 1].ratio,
    ),
  );
});

test("JSON은 100MB까지 허용하고 통합본 초과 시 사용할 분할 구조를 판별한다", () => {
  assert.equal(MAX_SCENARIO_JSON_BYTES, 100 * 1024 * 1024);
  assert.equal(
    hasUsableSplitScenarioJson([
      "manifest.json",
      "project.json",
      "characters/player.json",
      "characters/npcs.json",
      "world/world.json",
    ]),
    true,
  );
  assert.equal(
    hasUsableSplitScenarioJson([
      "manifest.json",
      "project.json",
      "assets/manifest.json",
    ]),
    false,
  );
});

test("ScenarioPack ZIP은 1GB까지만 불러오고 초과 파일은 분석 전에 거부한다", async () => {
  assert.equal(MAX_SCENARIO_PACKAGE_BYTES, 1024 * 1024 * 1024);
  await assert.rejects(
    () => parseScenarioPackFile({
      name: "oversized-scenario.zip",
      size: MAX_SCENARIO_PACKAGE_BYTES + 1,
    } as File),
    /최대 1GB/,
  );
});

test("실제 ScenarioPack ZIP을 파싱하고 중복 관계를 병합한다", async () => {
  const pack = await loadPack();
  const state = createInitialState(pack);

  assert.equal(pack.title, "기성학원: 첫 번째 공명");
  assert.equal(pack.player.name, "윤시우");
  assert.equal(pack.npcs.length, 6);
  assert.equal(new Set(state.relations.map((item) => item.characterId)).size, 5);
  assert.equal(state.relations.length, 5);
  assert.ok(state.encounteredCharacterIds.length > 0);
  assert.ok(state.encounteredCharacterIds.length < state.relations.length);
  assert.ok(
    state.encounteredCharacterIds.every((characterId) => {
      const npc = pack.npcs.find((item) => item.id === characterId);
      return Boolean(npc && pack.opening.openingCharacters.includes(npc.name));
    }),
  );
  assert.equal(
    state.relations.find((item) => item.name === "차도진")?.relationType,
    "경계·경쟁",
  );
  assert.equal(pack.startDate, "2042-03-02");
  assert.equal(pack.startTime, "00:00");
  assert.equal(state.time, "00:00");
});

test("가져온 작품은 기성학원 기본값 없이 자기 시작 날짜·시각·장소를 사용한다", () => {
  const fatePack = normalizeScenarioPack(
    {
      projectId: "RN-FATE-SEOUL-CROWN-OF-LIES-20181023-V3",
      title: "Fate/Seoul — 거짓 왕관의 성배전쟁",
    },
    {
      project: {
        projectId: "RN-FATE-SEOUL-CROWN-OF-LIES-20181023-V3",
        title: "Fate/Seoul — 거짓 왕관의 성배전쟁",
        genre: "현대 판타지 · 성배전쟁",
        startDate: "2018-10-23",
        startLocation: "대한민국 서울특별시 종로구 창덕궁 후원 지하, 봉인된 규장각 외고",
        player: { id: "PLAYER_HAN_SIWOO", name: "한시우" },
        opening: {
          currentSituation: "23:41. 봉인된 규장각 외고의 공기가 가라앉아 있다.",
          openingLocation: "창덕궁 후원 지하",
          openingEvent: "거짓 왕관의 개막",
          openingLine: "봉인된 문 너머에서 금속음이 울렸다.",
        },
      },
    },
  );
  const state = createInitialState(fatePack);

  assert.equal(fatePack.startDate, "2018-10-23");
  assert.equal(fatePack.startTime, "23:41");
  assert.match(fatePack.startLocation, /창덕궁/);
  assert.equal(state.date, "2018-10-23");
  assert.equal(state.time, "23:41");
  assert.match(state.location, /창덕궁/);
  assert.doesNotMatch(JSON.stringify({ fatePack, state }), /국립기성학원|2042-03-02/);
});

test("패키지 생성기의 필수 사건 체크와 완료 계약 필드를 그대로 불러온다", () => {
  const pack = normalizeScenarioPack(
    { projectId: "REQUIRED-FLAG-IMPORT", title: "필수 사건 테스트" },
    {
      projectId: "REQUIRED-FLAG-IMPORT",
      title: "필수 사건 테스트",
      player: { id: "PLAYER", name: "주인공" },
      opening: { openingLine: "사건이 시작된다." },
      events: [{
        id: "EVENT_REQUIRED",
        name: "반드시 오는 편지",
        required: true,
        sequence: 3,
        completionSignals: "편지가 도착했다|봉인이 열렸다",
        requiredItems: "봉인된 편지",
        requiredDialogue: "당신에게 온 편지입니다.",
        requiredSpeakerId: "NPC_MESSENGER",
        recoveryAlternatives: "우편함 재배송|전령의 직접 전달",
        preservePlayerChoice: true,
        endSceneAfterCompletion: true,
      }],
    },
  );
  const event = pack.events[0];

  assert.equal(event.required, true);
  assert.equal(event.sequence, 3);
  assert.equal(event.completionSignals, "편지가 도착했다|봉인이 열렸다");
  assert.equal(event.requiredItems, "봉인된 편지");
  assert.equal(event.requiredDialogue, "당신에게 온 편지입니다.");
  assert.equal(event.requiredSpeakerId, "NPC_MESSENGER");
  assert.equal(event.recoveryAlternatives, "우편함 재배송|전령의 직접 전달");
  assert.equal(event.endSceneAfterCompletion, true);
});

test("시작 정보가 없는 일반 작품에도 기성학원 날짜와 장소를 대입하지 않는다", () => {
  const pack = normalizeScenarioPack(
    { projectId: "GENERIC-ORIGINAL-STORY", title: "독립 작품" },
    {
      projectId: "GENERIC-ORIGINAL-STORY",
      title: "독립 작품",
      player: { id: "PLAYER", name: "주인공" },
      opening: { openingLine: "아직 날짜와 장소는 공개되지 않았다." },
    },
  );
  const state = createInitialState(pack);

  assert.equal(pack.startDate, "");
  assert.equal(pack.startTime, "00:00");
  assert.equal(pack.startLocation, "");
  assert.equal(state.date, "날짜 미상");
  assert.equal(state.weekday, "요일 미상");
  assert.equal(state.location, "시작 장소 미상");
  assert.doesNotMatch(JSON.stringify({ pack, state }), /기성학원|2042-03-02/);
});

test("오프닝과 모의 턴은 플레이어 대사를 새로 만들지 않는다", async () => {
  const pack = await loadPack();
  const state = createInitialState(pack);
  const opening = createOpeningTurn(pack);
  const result = createMockTurn({
    pack,
    state: { ...state, turn: 4 },
    userText: "두 파형을 함께 운용할 수 있는지 질문한다.",
    recentTurns: [],
  });

  assert.ok(
    opening.blocks.every((block) => !isPlayerAgencyViolation(block, pack.player)),
  );
  assert.ok(
    result.blocks.every((block) => !isPlayerAgencyViolation(block, pack.player)),
  );
  assert.equal(result.image.recommended, true);
  assert.equal(result.statePatch.clockChanges[0]?.delta, 1);
});

test("발송인 이름만 적힌 오프닝은 공개 설정의 실종 사실과 의문을 첫 본문에 보완한다", () => {
  const pack = normalizeScenarioPack(
    {
      projectId: "FATE-SEOUL-OPENING-CONTEXT",
      title: "Fate/Seoul — 거짓 왕관의 성배전쟁",
    },
    {
      project: {
        projectId: "FATE-SEOUL-OPENING-CONTEXT",
        title: "Fate/Seoul — 거짓 왕관의 성배전쟁",
        startTime: "15:30",
        player: { id: "PLAYER_HAN_SIWOO", name: "한시우" },
        npcs: [{
          id: "NPC_HAN_MYUNGJIN",
          name: "한명진",
          role: "1년 전 실종된 외할머니",
        }],
        opening: {
          currentSituation:
            "교내 택배 알림의 발송인은 1년 전 실종된 외할머니 한명진이다.",
          immediateProblem: "실종자의 이름으로 택배가 왔다.",
          knownRisks: "한명진에게서는 1년 동안 연락이 없었다.",
          openingLine:
            "오전 8시 07분, 휴대전화가 진동했다. [교내 무인택배함] 발송인: 한명진.",
          openingCharacters: "한명진",
        },
      },
    },
  );

  const opening = createOpeningTurn(pack);
  const state = createInitialState(pack);
  const openingText = opening.blocks.map((block) => block.text).join(" ");
  const recommendationText = opening.recommendations
    .map((recommendation) => recommendation.label)
    .join(" ");

  assert.match(openingText, /1년 전 실종된 한시우의 외할머니, 한명진/);
  assert.match(openingText, /왜 지금 그 이름으로 택배가 오는 걸까/);
  assert.equal(pack.startTime, "08:07");
  assert.equal(state.time, "08:07");
  assert.ok(opening.blocks.every((block) => block.type !== "dialogue"));
  assert.doesNotMatch(recommendationText, /한명진에게|한명진한테/u);
  assert.match(recommendationText, /택배|발송|보관/);
  assert.ok(!state.encounteredCharacterIds.includes("NPC_HAN_MYUNGJIN"));
  assert.ok(!state.characterVisuals.some(
    (visual) => visual.characterId === "NPC_HAN_MYUNGJIN",
  ));
  assert.ok(
    opening.blocks.every((block) => !isPlayerAgencyViolation(block, pack.player)),
  );
});

test("Instant Story 내장 데모는 공식 시작 프로필의 현장 선택지를 사용한다", () => {
  const opening = createOpeningTurn(demoScenario);
  const text = opening.recommendations.map((item) => item.label).join(" ");

  assert.match(text, /학생증을 올려놓고/u);
  assert.match(text, /검사 전에 어떤 순서/u);
  assert.match(text, /차단부스와 네 종류의 샘플/u);
  assert.doesNotMatch(text, /윤시우|강하은/u);
});

test("장면 이미지 주기를 끄거나 2턴으로 바꾸면 정확히 반영한다", async () => {
  const pack = await loadPack();
  const initial = createInitialState(pack);
  const off = createMockTurn({
    pack,
    state: { ...initial, turn: 19, imageEvery: 0 },
    userText: "주변의 반응을 살핀다.",
    recentTurns: [],
  });
  const everyTwo = createMockTurn({
    pack,
    state: { ...initial, turn: 1, imageEvery: 2 },
    userText: "주변의 반응을 살핀다.",
    recentTurns: [],
  });

  assert.equal(off.image.recommended, false);
  assert.match(off.image.reason, /꺼져/);
  assert.equal(everyTwo.image.recommended, true);
});

test("생성기 v1 HUD는 새 자원·자금 구조로 이행하고 계약 전 령주를 숨긴다", () => {
  const pack = normalizeScenarioPack(
    { projectId: "LEGACY-HUD-FATE", title: "성배전쟁" },
    {
      projectId: "LEGACY-HUD-FATE",
      title: "성배전쟁",
      player: { id: "PLAYER", name: "한시우" },
      statusWindow: {
        enabled: true,
        title: "TURN STATUS · LIVE",
        sections: { profile: true, skills: true, stats: true, resources: true },
        stats: [
          { id: "hp", name: "체력", current: 100, max: 100, rank: "A" },
          { id: "focus", name: "집중력", current: 90, max: 100, rank: "B" },
        ],
        resources: [
          { id: "old-fate", name: "운명점", current: 3 },
          { id: "old-clue", name: "단서", current: 0 },
          { id: "old-fame", name: "명성", current: 0 },
        ],
      },
    },
  );
  const state = createInitialState(pack);
  const fields = pack.statusWindow.fields;
  const commandSeals = state.statusLedger.find((entry) => entry.fieldId === "command_seals");
  const initialSnapshot = buildPublicStatusSnapshot(pack, state);
  const initialItemIds = initialSnapshot?.sections.flatMap((section) =>
    section.items.map((item) => item.id)
  ) ?? [];

  assert.deepEqual(
    fields.filter((field) => field.sectionId === "resources").map((field) => field.label),
    ["령주", "보석", "마술무기"],
  );
  assert.equal(fields.some((field) => field.id === "funds"), true);
  assert.equal(commandSeals?.value, 3);
  assert.equal(commandSeals?.revealed, false);
  assert.equal(initialItemIds.includes("command_seals"), false);
});

test("비-Fate 생성기 v1 HUD는 작품 고유 자원명·아이콘·단위를 보존한다", () => {
  const pack = normalizeScenarioPack(
    { projectId: "LEGACY-HUD-SPACE-OPERA", title: "유리 성운의 항해자" },
    {
      projectId: "LEGACY-HUD-SPACE-OPERA",
      title: "유리 성운의 항해자",
      genre: "스페이스 오페라",
      player: { id: "PLAYER", name: "윤서" },
      statusWindow: {
        enabled: true,
        title: "SHIP STATUS",
        sections: { profile: true, skills: true, stats: true, resources: true },
        stats: [
          { id: "vitality", name: "활력", current: 80, max: 100, rank: "B" },
        ],
        resources: [
          { id: "reactor_cells", name: "반응로 셀", icon: "spark", current: 4, unit: "기", visibility: "public", revealRule: "함선 계기판에서 확인" },
          { id: "star_crystals", name: "성운 결정", icon: "crystal", current: 2, unit: "개", visibility: "public", revealRule: "화물칸에서 확인" },
          { id: "drone_blades", name: "호위 드론", icon: "weapon", current: 1, unit: "대", visibility: "public", revealRule: "출격 준비가 완료되면 공개" },
        ],
        funds: { name: "함선 크레딧", current: 1250, unit: "C" },
      },
    },
  );
  const state = createInitialState(pack);
  const resources = pack.statusWindow.fields.filter((field) =>
    field.sectionId === "resources"
  );
  const snapshotResources = buildPublicStatusSnapshot(pack, state)?.sections
    .flatMap((section) => section.items)
    .filter((item) => resources.some((resource) => resource.id === item.id)) ?? [];

  assert.deepEqual(resources.map((field) => field.label), [
    "반응로 셀",
    "성운 결정",
    "호위 드론",
  ]);
  assert.deepEqual(resources.map((field) => field.icon), ["spark", "crystal", "weapon"]);
  assert.deepEqual(snapshotResources.map((item) => item.unit), ["기", "개", "대"]);
  assert.equal(pack.statusWindow.fields.some((field) => field.id === "command_seals"), false);
});

test("패키지 상태창을 읽어 수치를 갱신하고 숨은 항목과 미등장 관계를 차단한다", async () => {
  const bytes = await readFile(samplePath);
  const files = unzipSync(new Uint8Array(bytes));
  files["rules/status_window.json"] = strToU8(JSON.stringify({
    enabled: true,
    title: "아카데미 상태",
    displayMode: "full",
    defaultExpanded: true,
    sections: [
      { id: "stats", label: "스탯", order: 10 },
      { id: "people", label: "관계", order: 20 },
    ],
    fields: [
      { id: "mana", label: "마나", sectionId: "stats", kind: "number", minimum: 0, maximum: 100, maxDelta: 20 },
      { id: "secret-name", label: "미공개 진명", sectionId: "stats", kind: "text", visibility: "hidden" },
      { id: "relations", label: "관계", sectionId: "people", kind: "list", source: "state.relations", visibility: "encountered" },
    ],
  }));
  files["state/initial_status_ledger.json"] = strToU8(JSON.stringify([
    { fieldId: "mana", value: 32, grade: "C-", revealed: true },
    { fieldId: "secret-name", value: "절대 공개 금지", revealed: false },
  ]));
  const packed = zipSync(files);
  const pack = await parseScenarioPackFile(
    new NodeFile([packed], "status-pack.zip") as unknown as globalThis.File,
  );
  const state = createInitialState(pack);
  const finalizedChronology = resolveRuntimeChronology(state, "09:13");
  const next = applyStatePatch(state, {
    time: "09:13",
    location: state.location,
    sceneSummary: "마나를 사용했다.",
    statusAdd: [],
    statusRemove: [],
    inventoryAdd: [],
    inventoryRemove: [],
    relationChanges: [],
    clockChanges: [],
    memoryAdd: [],
    variablesAdd: [],
    variablesResolve: [],
    characterVisualsAdd: [],
    encounteredCharactersAdd: [],
    statusLedgerChanges: [
      {
        fieldId: "mana",
        operation: "increment",
        numericDelta: -8,
        value: "",
        items: [],
        grade: "C-",
        reveal: false,
        reason: "마법 사용",
      },
      {
        fieldId: "secret-name",
        operation: "set",
        numericDelta: 0,
        value: "노출 시도",
        items: [],
        grade: "",
        reveal: false,
        reason: "내부 장부 갱신",
      },
    ],
    autonomyActions: [],
    relationshipMemoriesAdd: [],
    relationshipMemoryResolveIds: [],
  }, pack, finalizedChronology);
  const snapshot = buildPublicStatusSnapshot(pack, next, {
    statusLedgerChanges: next.lastStatusChanges,
  });
  const publicItems = snapshot?.sections.flatMap((section) => section.items) ?? [];

  assert.equal(pack.statusWindow.title, "아카데미 상태");
  assert.equal(publicItems.find((item) => item.id === "mana")?.displayValue, "24");
  assert.equal(publicItems.find((item) => item.id === "mana")?.grade, "C-");
  assert.equal(publicItems.find((item) => item.id === "mana")?.maximum, 100);
  assert.equal(publicItems.find((item) => item.id === "mana")?.delta, -8);
  assert.equal(publicItems.some((item) => item.id === "secret-name"), false);
  assert.ok(snapshot?.relations.every((relation) =>
    next.encounteredCharacterIds.includes(relation.characterId),
  ));
});

test("Studio v1.8.1 관계 HUD는 결합 표시와 관측 공개 규칙을 보존한다", () => {
  const pack = normalizeScenarioPack(
    { projectId: "RELATIONSHIP-HUD-V1", title: "관계 상태창" },
    {
      projectId: "RELATIONSHIP-HUD-V1",
      title: "관계 상태창",
      player: { id: "PLAYER", name: "주인공" },
      npcs: [
        { id: "NPC_LENA", name: "레나", publicInfo: "동급생" },
        { id: "NPC_SECRET", name: "백야", preRevealAlias: "낯선 학생", publicInfo: "정체 미공개", hiddenInfo: "진명 비공개" },
      ],
      statusWindow: {
        enabled: true,
        displayMode: "full",
        relationshipDisplays: [
          {
            id: "HUD_LENA", entityType: "character", entityId: "NPC_LENA", label: "레나",
            visibility: "met_only", showSentence: true, sentence: "아직 경계하고 있다.",
            showStat: true, statLabel: "신뢰", current: 5, minimum: -100, maximum: 100,
            showSymbol: true, symbol: "🟣", updateRule: "직접 상호작용 때만 변경",
          },
          {
            id: "HUD_SECRET", entityType: "character", entityId: "NPC_SECRET", label: "백야",
            visibility: "met_only", showSentence: true, sentence: "말없이 지켜본다.",
            showStat: false, showSymbol: false,
          },
          {
            id: "HUD_FACTION", entityType: "faction", entityId: "FACTION_SCHOOL", label: "기성학원",
            visibility: "public", showSentence: true, sentence: "정식 입학생이다.",
            showStat: false, showSymbol: true, symbol: "🏫",
          },
        ],
      },
    },
  );
  const initial = createInitialState(pack);
  assert.deepEqual(
    buildPublicStatusSnapshot(pack, initial)?.relationshipDisplays?.map((entry) => entry.id),
    ["HUD_FACTION"],
  );

  const changes = [
    { fieldId: "relationship_display:HUD_LENA:sentence", operation: "set" as const, numericDelta: 0, value: "대화를 나눈 뒤 경계가 조금 누그러졌다.", items: [], grade: "", reveal: false, reason: "검사실에서 솔직하게 대화했다." },
    { fieldId: "relationship_display:HUD_LENA:stat", operation: "increment" as const, numericDelta: 2, value: "", items: [], grade: "", reveal: false, reason: "검사실에서 솔직하게 대화했다." },
    { fieldId: "relationship_display:HUD_LENA:symbol", operation: "set" as const, numericDelta: 0, value: "🟣", items: [], grade: "", reveal: false, reason: "검사실에서 솔직하게 대화했다." },
  ];
  const applied = applyStatusLedgerChanges(pack, initial, changes);
  const encountered = {
    ...initial,
    turn: 1,
    encounteredCharacterIds: ["NPC_LENA", "NPC_SECRET"],
    statusLedger: applied.ledger,
    lastStatusChanges: applied.changes,
  };
  const snapshot = buildPublicStatusSnapshot(pack, encountered, { statusLedgerChanges: applied.changes });
  const lena = snapshot?.relationshipDisplays?.find((entry) => entry.id === "HUD_LENA");
  const secret = snapshot?.relationshipDisplays?.find((entry) => entry.id === "HUD_SECRET");
  assert.deepEqual(lena?.displayParts, ["sentence", "stat", "symbol"]);
  assert.equal(lena?.sentence, "대화를 나눈 뒤 경계가 조금 누그러졌다.");
  assert.equal(lena?.stat?.current, 7);
  assert.equal(lena?.stat?.delta, 2);
  assert.equal(lena?.symbol, "🟣");
  assert.equal(secret?.label, "낯선 학생");
  assert.equal(snapshot?.changedCount, 1);
});

test("조건부 상태값과 영령의 진명·마스터 관계는 공개 사건 전까지 가린다", () => {
  const pack = normalizeScenarioPack(
    { projectId: "fate-spoiler-check", title: "성배전쟁" },
    {
      projectId: "fate-spoiler-check",
      player: { id: "PLAYER", name: "한시우" },
      npcs: [
        {
          id: "SABER",
          name: "정조",
          role: "Saber-class Servant",
          publicInfo: "호칭: 세이버",
          hiddenInfo: "미공개 진명: 정조",
        },
      ],
      characterRelations: [
        {
          id: "REL_SABER_PLAYER",
          sourceId: "SABER",
          targetId: "PLAYER",
          relationType: "마스터-서번트 계약",
          trust: 45,
        },
      ],
      statusWindow: {
        sections: [
          { id: "identity", label: "신분" },
          { id: "relations", label: "관계" },
        ],
        fields: [
          {
            id: "contract",
            label: "계약 관계",
            sectionId: "identity",
            kind: "text",
            visibility: "conditional",
          },
          {
            id: "unsafe-role",
            label: "직위",
            sectionId: "identity",
            kind: "text",
            visibility: "public",
            initialValue: "정조의 마스터",
          },
          {
            id: "relations",
            label: "관계",
            sectionId: "relations",
            kind: "list",
            source: "state.relations",
            visibility: "encountered",
          },
        ],
        initialLedger: { contract: "정조의 마스터" },
      },
    },
  );
  const state = {
    ...createInitialState(pack),
    encounteredCharacterIds: ["SABER"],
    memories: ["관리실 세이버 방금 새 문장이 떴다."],
  };
  const snapshot = buildPublicStatusSnapshot(pack, state);
  const publicItems = snapshot?.sections.flatMap((section) => section.items) ?? [];

  assert.equal(
    pack.initialStatusLedger.find((entry) => entry.fieldId === "contract")
      ?.revealed,
    false,
  );
  assert.equal(publicItems.some((item) => item.id === "contract"), false);
  assert.equal(publicItems.some((item) => item.id === "unsafe-role"), false);
  assert.equal(snapshot?.relations[0]?.name, "정체불명의 소녀 검사");
  assert.equal(snapshot?.relations[0]?.relationType, "첫 만남");
  assert.equal(snapshot?.relations[0]?.trust, 0);

  const classRevealedState = {
    ...state,
    turn: 1,
    sceneSummary: "소녀 검사의 클래스가 세이버로 확인됐다.",
    memories: ["소녀 검사의 클래스가 세이버로 확인됐다."],
  };
  assert.equal(
    buildPublicStatusSnapshot(pack, classRevealedState)?.relations[0]?.name,
    "세이버",
  );

  const revealedState = {
    ...state,
    turn: 1,
    statusLedger: state.statusLedger.map((entry) =>
      entry.fieldId === "contract"
        ? { ...entry, revealed: true, updatedTurn: 1 }
        : entry,
    ),
  };
  const revealedItems =
    buildPublicStatusSnapshot(pack, revealedState)?.sections.flatMap(
      (section) => section.items,
    ) ?? [];
  assert.equal(
    revealedItems.find((item) => item.id === "contract")?.displayValue,
    "정조의 마스터",
  );

  const staleSnapshot = {
    ...snapshot!,
    sections: [
      {
        id: "identity",
        label: "신분",
        icon: "",
        items: [
          {
            id: "contract",
            label: "계약 관계",
            kind: "text" as const,
            icon: "",
            value: "정조의 마스터",
            displayValue: "정조의 마스터",
            grade: "",
            reason: "",
          },
        ],
      },
    ],
    relations: [
      {
        characterId: "SABER",
        name: "정조",
        relationType: "마스터-서번트 계약",
        trust: 45,
        delta: 0,
        reasonTitle: "",
        reasonSummary: "",
      },
    ],
  };
  const scrubbed = sanitizeStoredPublicStatusSnapshot(pack, staleSnapshot);
  assert.equal(scrubbed.sections.length, 0);
  assert.equal(scrubbed.relations[0]?.name, "정체불명의 소녀 검사");
  assert.equal(scrubbed.relations[0]?.relationType, "첫 만남");
});

test("오프닝 목표와 미확인 사건 계획은 상태창·기억에 미리 노출하지 않는다", async () => {
  const basePack = await loadPack();
  const pack = {
    ...basePack,
    opening: {
      ...basePack.opening,
      firstGoal: "숨은 배후의 배신 계획을 저지한다.",
    },
    statusWindow: {
      ...basePack.statusWindow,
      displayMode: "full" as const,
      sections: [
        ...basePack.statusWindow.sections,
        { id: "plot", label: "스토리 진행", icon: "", order: 999, enabled: true },
      ],
      fields: [
        ...basePack.statusWindow.fields,
        {
          id: "future-goals",
          label: "현재 목표",
          sectionId: "plot",
          sectionLabel: "스토리 진행",
          kind: "list" as const,
          source: "state.objectives",
          characterId: "",
          visibility: "public" as const,
          order: 1,
          icon: "",
          summary: true,
          showDelta: false,
          minimum: undefined,
          maximum: undefined,
          maxDelta: 0,
          ranks: [],
          updateRule: "",
        },
        {
          id: "event-clock",
          label: "사건 클록",
          sectionId: "plot",
          sectionLabel: "스토리 진행",
          kind: "list" as const,
          source: "state.clocks",
          characterId: "",
          visibility: "public" as const,
          order: 2,
          icon: "",
          summary: true,
          showDelta: false,
          minimum: undefined,
          maximum: undefined,
          maxDelta: 0,
          ranks: [],
          updateRule: "",
        },
      ],
    },
  };
  const initial = createInitialState(pack);
  const state = {
    ...initial,
    turn: 1,
    memories: [pack.opening.firstGoal],
    variables: [
      {
        id: "future-betrayal",
        label: "오베론의 배신",
        detail: "다음 장면에서 정체를 드러낼 예정이다.",
        visibility: "public" as const,
        reason: "GM 진행용",
        status: "active" as const,
        createdTurn: 1,
      },
    ],
    clocks: initial.clocks.map((clock) => ({
      ...clock,
      current: 1,
      publicHint: "다가올 습격의 개막",
    })),
  };
  const snapshot = buildPublicStatusSnapshot(pack, state);
  const publicText = JSON.stringify(snapshot);
  const unmetNpc = pack.npcs.find(
    (npc) => !state.encounteredCharacterIds.includes(npc.id),
  );

  assert.deepEqual(initial.memories, []);
  assert.ok(unmetNpc);
  assert.equal(
    isPubliclyObservedMemory(pack, state, `${unmetNpc.name}의 배신이 확정됐다.`),
    false,
  );
  assert.doesNotMatch(publicText, /숨은 배후|배신 계획|오베론|다음 장면|다가올 습격/);

  const scrubbed = sanitizeStoredPublicStatusSnapshot(pack, {
    ...snapshot!,
    sections: [
      {
        id: "plot",
        label: "스토리 진행",
        icon: "",
        items: [
          {
            id: "future-goals",
            label: "현재 목표",
            kind: "list",
            icon: "",
            value: [pack.opening.firstGoal],
            displayValue: pack.opening.firstGoal,
            grade: "",
            reason: "",
          },
        ],
      },
    ],
  });
  assert.equal(scrubbed.sections.length, 0);
});

test("상태 패치는 관계와 사건 클록 변화 폭을 다시 제한한다", async () => {
  const pack = await loadPack();
  const state = createInitialState(pack);
  const target = state.relations[0];
  const clock = state.clocks[0];
  const next = applyStatePatch(state, {
    time: "09:13",
    location: state.location,
    sceneSummary: "검증 중",
    statusAdd: [],
    statusRemove: [],
    inventoryAdd: ["응급 마력 회복약"],
    inventoryRemove: [state.inventory[0]],
    relationChanges: [
      {
        characterId: target.characterId,
        trustDelta: 99,
        favorDelta: 0,
        respectDelta: 0,
        suspicionDelta: 0,
        hostilityDelta: 0,
        reason: "테스트",
      },
    ],
    clockChanges: [{ clockId: clock.id, delta: 99, reason: "테스트" }],
    memoryAdd: ["새 기억"],
    variablesAdd: [],
    variablesResolve: [],
    characterVisualsAdd: [],
    encounteredCharactersAdd: [],
    statusLedgerChanges: [],
    autonomyActions: [],
    relationshipMemoriesAdd: [],
    relationshipMemoryResolveIds: [],
  });

  assert.equal(
    next.relations[0].trust,
    Math.min(100, state.relations[0].trust + 3),
  );
  assert.ok(next.inventory.includes("응급 마력 회복약"));
  assert.ok(!next.inventory.includes(state.inventory[0]));
  assert.equal(next.clocks[0].current, state.clocks[0].current + 1);
  assert.equal(next.turn, 1);
});

test("생성기 v1 자율 행동과 관계 이유 기억을 숨은 장부·공개 상태창에 분리한다", async () => {
  const bytes = await readFile(samplePath);
  const files = unzipSync(new Uint8Array(bytes));
  const basePack = await loadPack();
  const baseState = createInitialState(basePack);
  const encounteredRelation = baseState.relations.find((relation) =>
    baseState.encounteredCharacterIds.includes(relation.characterId),
  );
  assert.ok(encounteredRelation);
  const actorId = "AUTO_TEST_ONSCREEN";
  const hiddenActorId = "AUTO_TEST_OFFSCREEN";
  const actors = [
    {
      id: actorId,
      entityType: "character",
      entityId: encounteredRelation.characterId,
      enabled: true,
      activityTier: "nearby",
      currentLocation: baseState.location,
      locationVisibility: "Public",
      shortTermGoal: "현재 대화에서 다음 단서를 확보한다.",
      mediumTermGoal: "플레이어의 판단 기준을 파악한다.",
      longTermGoal: "사건을 해결한다.",
      goalPriority: 95,
      currentPlan: "현장에서 관찰한다.",
      nextAction: "분석 장치를 확인한다.",
      actionCadence: "every_turn",
      knowledge: "현재 현장에서 확인한 정보",
      misinformation: "",
      resources: "분석 장치",
      constraints: "현장을 벗어나지 않는다.",
      riskTolerance: "low",
      cooperationRules: "",
      conflictRules: "",
      travelRules: "",
      successOutcome: "단서를 확인한다.",
      partialOutcome: "불완전한 단서를 얻는다.",
      failureOutcome: "단서를 놓친다.",
      offscreenEnabled: true,
      canFailOffscreen: true,
      revealTraces: true,
    },
    {
      id: hiddenActorId,
      entityType: "character",
      entityId: basePack.npcs.find((npc) =>
        npc.id !== encounteredRelation.characterId,
      )?.id,
      enabled: true,
      activityTier: "distant",
      currentLocation: "비공개 원거리 시설",
      locationVisibility: "Hidden",
      shortTermGoal: "화면 밖 계획을 진행한다.",
      mediumTermGoal: "비공개",
      longTermGoal: "비공개",
      goalPriority: 60,
      currentPlan: "비공개 계획",
      nextAction: "비공개 행동",
      actionCadence: "every_turn",
      knowledge: "자신이 확인한 정보",
      misinformation: "",
      resources: "등록 자원",
      constraints: "",
      riskTolerance: "moderate",
      cooperationRules: "",
      conflictRules: "",
      travelRules: "",
      successOutcome: "비공개 결과",
      partialOutcome: "비공개 부분 결과",
      failureOutcome: "비공개 실패",
      offscreenEnabled: true,
      canFailOffscreen: true,
      revealTraces: false,
    },
  ];
  const autonomyRuntime = {
    format: "RELAY_NOVEL_AUTONOMY_RUNTIME_V1",
    enabled: true,
    configuration: {
      maxActionsPerTurn: 2,
      factionTickTurns: 3,
      deterministicSeed: true,
      requireTravelTime: true,
      enforceKnowledgeBounds: true,
      enforceResourceBounds: true,
      allowOffscreenFailure: true,
      tracePolicy: "observable_only",
    },
  };
  const initialMemories = [
    {
      id: "MEM_PUBLIC_INITIAL",
      relationId: encounteredRelation.relationId,
      sourceId: encounteredRelation.sourceId,
      targetId: encounteredRelation.targetId,
      turnLabel: "프롤로그",
      eventId: "",
      type: "custom",
      title: "공개 가능한 첫인상",
      summary: "직접 대면해 확인한 첫인상이다.",
      cause: "첫 대면",
      visibility: "Public",
      importance: 40,
      permanence: "decaying",
      effects: { trust: 2, favor: 0, fear: 0, respect: 0, suspicion: 0, hostility: 0, dependency: 0 },
      active: true,
      unresolved: false,
      resolutionConditions: "",
      tags: "첫인상",
      createdAt: "",
    },
    {
      id: "MEM_HIDDEN_INITIAL",
      relationId: encounteredRelation.relationId,
      sourceId: encounteredRelation.sourceId,
      targetId: encounteredRelation.targetId,
      turnLabel: "프롤로그",
      eventId: "",
      type: "custom",
      title: "절대 노출하면 안 되는 의심",
      summary: "숨은 사정으로 강하게 의심한다.",
      cause: "비공개 조사",
      visibility: "Hidden",
      importance: 90,
      permanence: "permanent",
      effects: { trust: -7, favor: 0, fear: 0, respect: 0, suspicion: 12, hostility: 0, dependency: 0 },
      active: true,
      unresolved: true,
      resolutionConditions: "비밀 해소",
      tags: "비공개",
      createdAt: "",
    },
  ];
  const relationshipRuntime = {
    format: "RELAY_NOVEL_RELATIONSHIP_MEMORY_RUNTIME_V1",
    enabled: true,
    configuration: {
      deriveScoresFromMemory: true,
      keepContradictoryMemories: true,
      decayEnabled: true,
      maxActiveMemoriesPerRelation: 50,
      displayPublicReasonsInHud: true,
    },
  };
  const project = JSON.parse(new TextDecoder().decode(files["project.json"])) as Record<string, unknown>;
  project.autonomyActors = actors;
  project.autonomyRuntime = autonomyRuntime;
  project.relationshipMemories = initialMemories;
  project.relationshipMemoryRuntime = relationshipRuntime;
  files["project.json"] = strToU8(JSON.stringify(project));
  files["actors/autonomy_actors.json"] = strToU8(JSON.stringify(actors));
  files["rules/autonomy_runtime.json"] = strToU8(JSON.stringify(autonomyRuntime));
  files["relations/relationship_memories.json"] = strToU8(JSON.stringify(initialMemories));
  files["rules/relationship_memory_runtime.json"] = strToU8(JSON.stringify(relationshipRuntime));
  const pack = await parseScenarioPackFile(
    new NodeFile([zipSync(files)], "engine-v1.zip") as unknown as globalThis.File,
  );
  const state = createInitialState(pack);
  const runtimeRelation = state.relations.find(
    (relation) => relation.relationId === encounteredRelation.relationId,
  );
  assert.equal(pack.autonomyRuntime.enabled, true);
  assert.equal(pack.relationshipMemoryRuntime.enabled, true);
  assert.equal(pack.autonomyActors.length, 2);
  assert.equal(
    runtimeRelation?.trust,
    encounteredRelation.trust - 5,
    "내부 점수에는 공개·숨은 기억이 모두 반영되어야 한다",
  );
  assert.equal(
    runtimeRelation?.publicTrust,
    encounteredRelation.trust + 2,
    "공개 점수에는 공개 기억만 반영되어야 한다",
  );
  const candidates = selectAutonomyCandidates(pack, state, "현재 장치를 살핀다.");
  assert.ok(candidates.some((candidate) => candidate.actorId === actorId));

  const memoryAdditions = sanitizeRelationshipMemoryPatches(pack, state, [
    {
      id: "MEM_PUBLIC_TURN_1",
      relationId: encounteredRelation.relationId,
      sourceId: encounteredRelation.sourceId,
      targetId: encounteredRelation.targetId,
      eventId: "",
      type: "promise_kept",
      title: "약속을 실제로 지킴",
      summary: "직접 확인 가능한 방식으로 약속을 지켰다.",
      cause: "현재 장면의 행동",
      visibility: "Public",
      importance: 75,
      permanence: "permanent",
      effects: { trust: 4, favor: 1, fear: 0, respect: 2, suspicion: -1, hostility: 0, dependency: 0 },
      unresolved: false,
      resolutionConditions: "",
      tags: "약속",
    },
  ]);
  const worldChronology = resolveRuntimeChronology(state, "09:13");
  const next = applyStatePatch(state, {
    time: "09:13",
    location: state.location,
    sceneSummary: "현장의 변화와 화면 밖 행동을 함께 처리했다.",
    statusAdd: [],
    statusRemove: [],
    inventoryAdd: [],
    inventoryRemove: [],
    relationChanges: [{
      characterId: encounteredRelation.characterId,
      trustDelta: 3,
      favorDelta: 3,
      respectDelta: 3,
      suspicionDelta: 0,
      hostilityDelta: 0,
      reason: "관계 엔진에서는 무시되어야 한다.",
    }],
    clockChanges: [],
    memoryAdd: [],
    variablesAdd: [],
    variablesResolve: [],
    characterVisualsAdd: [],
    encounteredCharactersAdd: [],
    statusLedgerChanges: [],
    autonomyActions: [
      {
        actorId,
        intent: "분석 장치를 확인한다.",
        outcome: "success",
        locationAfter: state.location,
        resourcesAfter: "분석 장치",
        currentPlanAfter: "확인된 단서를 정리한다.",
        nextActionAfter: "플레이어의 다음 선택을 관찰한다.",
        evidenceUsed: ["현장 측정값"],
        resourcesSpent: [],
        worldMutations: ["분석 기록이 갱신되었다."],
        knowledgeAdd: ["새 측정값"],
        misinformationRemove: [],
        trace: "분석 화면의 기록 시간이 갱신된 것이 보였다.",
        traceVisibility: "observable",
        reason: "현장에서 직접 확인했다.",
        travelJustification: "",
      },
      {
        actorId: hiddenActorId,
        intent: "비공개 행동",
        outcome: "partial",
        locationAfter: "비공개 원거리 시설",
        resourcesAfter: "등록 자원",
        currentPlanAfter: "비공개 계획",
        nextActionAfter: "비공개 후속 행동",
        evidenceUsed: [],
        resourcesSpent: [],
        worldMutations: ["비공개 변화"],
        knowledgeAdd: [],
        misinformationRemove: [],
        trace: "이 문장은 공개되면 안 된다.",
        traceVisibility: "hidden",
        reason: "화면 밖 처리",
        travelJustification: "",
      },
    ],
    relationshipMemoriesAdd: memoryAdditions,
    relationshipMemoryResolveIds: [],
  }, pack, worldChronology);
  const snapshot = buildPublicStatusSnapshot(pack, next, {
    relationshipMemoriesAdd: memoryAdditions,
  });
  const publicRelation = snapshot?.relations.find(
    (relation) => relation.characterId === encounteredRelation.characterId,
  );
  assert.equal(next.autonomyLog.length, 2);
  assert.equal(next.worldFacts.length, 2);
  assert.equal(snapshot?.worldTraces.length, 1);
  assert.equal(snapshot?.worldTraces[0]?.text, "분석 화면의 기록 시간이 갱신된 것이 보였다.");
  assert.equal(next.autonomyLog[0]?.time, worldChronology.time);
  assert.equal(next.worldFacts[0]?.date, worldChronology.date);
  assert.equal(snapshot?.worldTraces[0]?.day, worldChronology.day);
  assert.equal(snapshot?.worldTraces[0]?.time, worldChronology.time);
  assert.equal(publicRelation?.delta, 4);
  assert.equal(publicRelation?.reasonTitle, "약속을 실제로 지킴");
  assert.equal(publicRelation?.trust, encounteredRelation.trust + 6);
  assert.ok(!JSON.stringify(snapshot).includes("절대 노출하면 안 되는 의심"));
  assert.ok(!JSON.stringify(snapshot).includes("이 문장은 공개되면 안 된다"));
});

test("ZIP 캐릭터 이미지를 분리 저장 가능한 자산으로 불러온다", async () => {
  const bytes = await readFile(samplePath);
  const files = unzipSync(new Uint8Array(bytes));
  const imagePath = "assets/characters/NPC_MASTER_HAN/calm.webp";
  files["assets/manifest.json"] = strToU8(
    JSON.stringify({
      version: 1,
      assets: [
        {
          id: "han-calm",
          path: imagePath,
          kind: "character",
          characterId: "NPC_MASTER_HAN",
          label: "차분한 설명",
          emotionTags: ["calm", "default"],
          sceneTags: ["opening", "ability-lab"],
          placement: "after_block",
          priority: 80,
          alt: "능력설계실의 한세린",
        },
      ],
    }),
  );
  files[imagePath] = Uint8Array.from([0x52, 0x49, 0x46, 0x46]);

  const archiveBytes = zipSync(files);
  const pack = await parseScenarioPackFile(
    new NodeFile(
      [archiveBytes],
      "scenario-with-media.zip",
    ) as unknown as globalThis.File,
  );
  const opening = createOpeningTurn(pack);
  const detached = detachScenarioMedia(pack);

  assert.equal(pack.mediaAssets.length, 1);
  assert.match(pack.mediaAssets[0].dataUrl ?? "", /^data:image\/webp;base64,/);
  assert.equal(opening.blocks.find((block) => block.type === "dialogue")?.mediaAssetId, "han-calm");
  assert.equal(detached.pack.mediaAssets[0].dataUrl, undefined);
  assert.match(detached.mediaUrls["han-calm"], /^data:image\/webp;base64,/);
  assert.equal(createInitialState(pack).characterVisuals[0]?.source, "package");
  assert.equal(opening.characterVisuals?.[0]?.canonicalAssetId, "han-calm");

  const indexedFile = new NodeFile(
    [archiveBytes],
    "scenario-with-indexed-media.zip",
  );
  const indexedProgress: Array<{ ratio: number; phase: string; detail: string }> = [];
  const indexedPack = await parseScenarioPackFile(
    indexedFile as unknown as globalThis.File,
    {
      indexMediaOnly: true,
      onProgress: (progress) => indexedProgress.push(progress),
    },
  );
  assert.equal(indexedPack.mediaAssets[0].dataUrl, undefined);
  assert.match(
    await extractScenarioMediaDataUrl(indexedFile, indexedPack.mediaAssets[0]),
    /^data:image\/webp;base64/,
  );
  assert.equal(MAX_SCENARIO_PACKAGE_BYTES, 1024 * 1024 * 1024);
  assert.equal(indexedProgress.at(-1)?.ratio, 1);
  assert.ok(indexedProgress.some((progress) => /파일 목록/.test(progress.phase)));
});

test("Studio Package 1.4 Asset-Once 원본을 한 번 해시하고 AI 세계관 런타임을 연결한다", async () => {
  const bytes = await readFile(samplePath);
  const files = unzipSync(new Uint8Array(bytes));
  files["manifest.json"] = strToU8(JSON.stringify({
    ...JSON.parse(strFromU8(files["manifest.json"])),
    packageVersion: "1.4",
  }));
  const imagePath = "assets/characters/NPC_MASTER_HAN/01_han.png";
  const imageBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const digest = await crypto.subtle.digest("SHA-256", imageBytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  files["assets/manifest.json"] = strToU8(JSON.stringify({
    format: "RELAY_NOVEL_MEDIA_ASSET_MANIFEST_V2",
    storage: {
      format: "RELAY_NOVEL_ASSET_ONCE_V1",
      integrity: "SHA-256",
      inlineDataUrls: false,
      logicalAssetCount: 2,
      originalAssetBytes: imageBytes.byteLength * 2,
      storedAssetCount: 1,
      storedAssetBytes: imageBytes.byteLength,
    },
    assets: ["default", "calm"].map((label, index) => ({
      id: `han-${label}`,
      path: imagePath,
      kind: "character",
      characterId: "NPC_MASTER_HAN",
      label,
      emotionTags: [label],
      assetRef: `sha256:${sha256}`,
      byteLength: imageBytes.byteLength,
      dataUrlHeader: "data:image/png;base64",
      sha256,
      canonical: index === 0,
    })),
  }));
  files["rules/ai_world_context.json"] = strToU8(JSON.stringify({
    format: "RELAY_NOVEL_AI_WORLD_CONTEXT_RUNTIME_V1",
    enabled: true,
    liveEvaluation: true,
    execution: {
      mode: "inject_into_simulator_api_context",
      evaluationMoments: ["sessionStart", "npcDecision"],
      updateDepth: "deep",
      knowledgePolicy: "hybrid",
    },
    worldContext: {
      premise: "현대 한국의 비밀 전쟁",
      protectedCanon: "패키지 인물과 사건",
      spoilerRule: "공개 전 비밀 차단",
    },
    referenceCharacterResearch: {
      enabled: true,
      lookupMode: "simulator_web_search_tool",
      characters: ["한세린"],
      canonCutoff: "패키지 지정 시점",
      cacheMode: "session",
      lookupTiming: {
        sessionStart: true,
        beforeFirstAppearance: true,
        onCanonConflict: true,
        everyTurn: false,
      },
      recordSourcesInLedger: true,
    },
  }));
  files[imagePath] = imageBytes;

  const pack = await parseScenarioPackFile(
    new NodeFile([zipSync(files)], "studio-package-1.4.zip") as unknown as globalThis.File,
    { indexMediaOnly: true },
  );
  assert.equal(pack.compatibility?.fullSupport, true);
  assert.equal(pack.assetLedger?.logicalAssetCount, 2);
  assert.equal(pack.assetLedger?.physicalAssetCount, 1);
  assert.equal(pack.assetLedger?.storedAssetBytes, imageBytes.byteLength);
  assert.equal(pack.aiWorldContext?.format, "RELAY_NOVEL_AI_WORLD_CONTEXT_RUNTIME_V1");
  assert.equal(pack.mediaAssets[0]?.assetRef, `sha256:${sha256}`);
});

test("Studio v1.6.0 Package 1.5 기능을 협상하고 작품 독립 서사 필드를 연결한다", async () => {
  const bytes = await readFile(samplePath);
  const files = unzipSync(new Uint8Array(bytes));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  const project = JSON.parse(strFromU8(files["project.json"]));
  files["manifest.json"] = strToU8(JSON.stringify({
    ...manifest,
    packageVersion: "1.5",
    requiredFeatures: ["reveal_policy_v1"],
    optionalFeatures: ["multi_route_v1"],
  }));
  files["characters/npcs.json"] = strToU8(JSON.stringify([{
    id: "NPC_SECRET",
    name: "진짜 이름",
    publicInfo: "정체를 감추고 있다.",
  }]));
  files["events/events.json"] = strToU8(JSON.stringify([{
    id: "EV_SECRET",
    name: "정체와 마주하는 장면",
    sequence: 1,
    required: true,
    description: "현재 선택에 따라 정체의 단서를 확인한다.",
  }]));
  files["project.json"] = strToU8(JSON.stringify({
    ...project,
    npcs: [{
      id: "NPC_SECRET",
      name: "진짜 이름",
      publicInfo: "정체를 감추고 있다.",
    }],
    events: [{
      id: "EV_SECRET",
      name: "정체와 마주하는 장면",
      sequence: 1,
      required: true,
      description: "현재 선택에 따라 정체의 단서를 확인한다.",
    }],
  }));
  files["rules/narrative_runtime.json"] = strToU8(JSON.stringify({
    format: "RELAY_NOVEL_NARRATIVE_RUNTIME_EXTENSION_V1",
    packageCompatibility: ["1.4", "1.5"],
    mergeRules: {},
    characterDisclosure: [{
      characterId: "NPC_SECRET",
      preRevealAlias: "회색 코트의 여자",
      revealCondition: { kind: "event_completed", eventId: "EV_SECRET" },
    }],
    events: [{
      eventId: "EV_SECRET",
      alternateBeats: [{
        id: "ALT_TRACE",
        priority: 80,
        narrativeGoal: "플레이어가 택한 장소에서 다른 흔적으로 진실에 접근한다.",
        requiredSignals: ["TRACE_FOUND"],
        preservePlayerChoice: true,
      }],
      sceneMarkers: [{ id: "MARK_TRACE", label: "흔적 확인", phase: "progress" }],
    }],
  }));
  files["routes/reveal_facts.json"] = strToU8(JSON.stringify({
    format: "RELAY_NOVEL_REVEAL_FACTS_V1",
    facts: [{ id: "FACT_SECRET", label: "정체", description: "", protectedTerms: ["진짜 이름"] }],
  }));
  files["routes/reveal_policies.json"] = strToU8(JSON.stringify({
    format: "RELAY_NOVEL_REVEAL_POLICIES_V1",
    mergePrecedence: ["forbidden", "hint_only", "partial", "full"],
    policies: [{
      id: "POLICY_SECRET",
      scope: "global",
      rules: [{ factId: "FACT_SECRET", beforeMode: "forbidden", afterMode: "full" }],
    }],
  }));

  const pack = await parseScenarioPackFile(
    new NodeFile([zipSync(files)], "studio-package-1.5.zip") as unknown as globalThis.File,
  );
  assert.equal(pack.compatibility?.studioPackage15, true);
  assert.equal(pack.compatibility?.package15FeatureNegotiated, true);
  assert.deepEqual(pack.package15Runtime?.requiredFeatures, ["reveal_policy_v1"]);
  assert.equal(
    pack.npcs.find((character) => character.id === "NPC_SECRET")?.preRevealAlias,
    "회색 코트의 여자",
  );
  assert.equal(
    pack.events.find((event) => event.id === "EV_SECRET")?.alternateBeats?.[0]?.id,
    "ALT_TRACE",
  );
  assert.equal(
    pack.events.find((event) => event.id === "EV_SECRET")?.sceneMarkers?.[0]?.id,
    "MARK_TRACE",
  );
});

test("Package 1.5의 미지원 필수 기능은 1.4 축소 실행 없이 거부한다", async () => {
  const bytes = await readFile(samplePath);
  const files = unzipSync(new Uint8Array(bytes));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  files["manifest.json"] = strToU8(JSON.stringify({
    ...manifest,
    packageVersion: "1.5",
    requiredFeatures: ["unknown_runtime_v1"],
  }));
  await assert.rejects(
    () => parseScenarioPackFile(
      new NodeFile([zipSync(files)], "unsupported-package-1.5.zip") as unknown as globalThis.File,
    ),
    /지원하지 않는 Package 1\.5 필수 기능/u,
  );
});

test("Studio Asset-Once의 SHA-256이 실제 이미지와 다르면 패키지를 거부한다", async () => {
  const bytes = await readFile(samplePath);
  const files = unzipSync(new Uint8Array(bytes));
  const imagePath = "assets/characters/NPC_MASTER_HAN/01_han.png";
  const imageBytes = Uint8Array.from([1, 2, 3, 4]);
  const wrongHash = "0".repeat(64);
  files["assets/manifest.json"] = strToU8(JSON.stringify({
    format: "RELAY_NOVEL_MEDIA_ASSET_MANIFEST_V2",
    storage: {
      format: "RELAY_NOVEL_ASSET_ONCE_V1",
      integrity: "SHA-256",
      inlineDataUrls: false,
      logicalAssetCount: 1,
      originalAssetBytes: 4,
      storedAssetCount: 1,
      storedAssetBytes: 4,
    },
    assets: [{
      id: "han-default",
      path: imagePath,
      kind: "character",
      characterId: "NPC_MASTER_HAN",
      assetRef: `sha256:${wrongHash}`,
      byteLength: 4,
      sha256: wrongHash,
    }],
  }));
  files[imagePath] = imageBytes;
  await assert.rejects(
    parseScenarioPackFile(
      new NodeFile([zipSync(files)], "studio-invalid-hash.zip") as unknown as globalThis.File,
    ),
    /SHA-256이 매니페스트와 다릅니다/u,
  );
});

test("캐릭터 내부 images의 대표 사진을 첫 등장 기본 프로필로 반드시 출력한다", async () => {
  const secondaryDataUrl = "data:image/jpeg;base64,/9j/2Q==";
  const primaryDataUrl = "data:image/jpeg;base64,/9j/4AAQ==";
  const archiveBytes = zipSync({
    "manifest.json": strToU8(JSON.stringify({
      projectId: "INLINE-NADIA-PROFILE",
      title: "내장 프로필 테스트",
    })),
    "project.json": strToU8(JSON.stringify({
      projectId: "INLINE-NADIA-PROFILE",
      title: "내장 프로필 테스트",
      player: { id: "PLAYER", name: "한시우" },
      npcs: [{
        id: "NPC_MASTER_NADIA",
        name: "나디아 알 하다드",
        role: "유학생",
        appearance: "베이지 트렌치코트를 입은 여성",
        images: [
          {
            id: "nadia-secondary",
            label: "보조 기준 이미지",
            mimeType: "image/jpeg",
            isPrimary: false,
            dataUrl: secondaryDataUrl,
          },
          {
            id: "nadia-primary",
            label: "대표 기준 이미지",
            mimeType: "image/jpeg",
            isPrimary: true,
            dataUrl: primaryDataUrl,
          },
        ],
      }],
      opening: {
        openingCharacters: "나디아 알 하다드",
        openingLine: "나디아 알 하다드가 안내도 앞에서 물었다. “공학관 별관으로 가는 길을 아시나요?”",
      },
    })),
  });
  const file = new NodeFile(
    [archiveBytes],
    "inline-nadia-profile.zip",
  ) as unknown as globalThis.File;
  const pack = await parseScenarioPackFile(file);
  const primary = selectPackageCharacterReferenceAsset(
    pack,
    "NPC_MASTER_NADIA",
  );
  const opening = createOpeningTurn(pack);
  const detached = detachScenarioMedia(pack);
  const detachedPrimary = detached.pack.mediaAssets.find(
    (asset) => asset.id === "nadia-primary",
  );

  assert.equal(pack.mediaAssets.length, 2);
  assert.equal(primary?.id, "nadia-primary");
  assert.equal(primary?.canonical, true);
  assert.equal(primary?.dataUrl, primaryDataUrl);
  assert.equal(opening.characterVisuals?.[0]?.canonicalAssetId, "nadia-primary");
  assert.equal(
    opening.blocks.find((block) => block.type === "dialogue")?.mediaAssetId,
    "nadia-primary",
  );
  assert.equal(detached.mediaUrls["nadia-primary"], primaryDataUrl);
  assert.ok(detachedPrimary);
  assert.equal(detachedPrimary?.dataUrl, undefined);
  assert.equal(
    await extractScenarioMediaDataUrl(file as unknown as Blob, detachedPrimary!),
    primaryDataUrl,
  );
});

test("별도 매니페스트가 없어도 일반 캐릭터 이미지 폴더를 인물 ID에 연결한다", async () => {
  const bytes = await readFile(samplePath);
  const files = unzipSync(new Uint8Array(bytes));
  delete files["assets/manifest.json"];
  const imagePath = "images/characters/한세린/1.webp";
  files[imagePath] = Uint8Array.from([0x52, 0x49, 0x46, 0x46]);

  const archiveBytes = zipSync(files);
  const pack = await parseScenarioPackFile(
    new NodeFile([archiveBytes], "scenario-auto-character-media.zip") as unknown as globalThis.File,
  );
  const asset = pack.mediaAssets.find((item) => item.path === imagePath);

  assert.equal(asset?.characterId, "NPC_MASTER_HAN");
  assert.equal(asset?.characterName, "한세린");
  assert.equal(asset?.canonical, true);
  assert.match(asset?.dataUrl ?? "", /^data:image\/webp;base64,/);
});

test("패키지 캐릭터 이미지는 AI 생성 기준본보다 항상 우선하며 오염된 세션을 복구한다", async () => {
  const basePack = await loadPack();
  const npc = basePack.npcs[0];
  const packageAsset: ScenarioMediaAsset = {
    id: "package-canonical",
    path: `images/characters/${npc.id}/red-royal-robe.webp`,
    kind: "character",
    characterId: npc.id,
    characterName: npc.name,
    label: "패키지 공식 기준본",
    emotionTags: ["canonical", "default"],
    sceneTags: ["first-appearance"],
    placement: "after_block",
    priority: 10,
    alt: `${npc.name} 공식 기준 이미지`,
    caption: `${npc.name} 공식 기준본`,
    source: "package",
    canonical: true,
  };
  const generatedAsset: ScenarioMediaAsset = {
    ...packageAsset,
    id: `generated-character-${npc.id.toLowerCase()}`,
    path: `generated/characters/${npc.id}/canonical.webp`,
    label: "잘못 생성된 갑옷 기준본",
    priority: 1200,
    source: "generated",
  };
  const contaminatedPack = {
    ...basePack,
    mediaAssets: [packageAsset, generatedAsset],
  };
  const contaminatedState = {
    ...createInitialState(contaminatedPack),
    characterVisuals: [{
      characterId: npc.id,
      characterName: npc.name,
      appearancePrompt: "검은 갑옷을 입은 검사",
      assetId: generatedAsset.id,
      source: "generated" as const,
      introducedTurn: 4,
    }],
  };
  const contaminatedTurn: TurnRecord = {
    id: "contaminated-turn",
    turn: 4,
    role: "exchange",
    blocks: [{
      id: "npc-block",
      type: "dialogue",
      text: "물러서라.",
      speakerId: npc.id,
      speakerName: npc.name,
      mediaAssetId: generatedAsset.id,
    }],
    recommendations: [],
    imagePrompt: `${npc.name}이 검을 들고 선 야간 장면`,
    imageUrl: "data:image/webp;base64,WRONG_ARMOR_SCENE",
    imageQuality: "low",
    characterVisuals: [{
      blockIndex: 0,
      characterId: npc.id,
      characterName: npc.name,
      importance: "major",
      isFirstMajorAppearance: true,
      appearancePrompt: "검은 갑옷을 입은 검사",
      reason: "첫 등장",
      canonicalAssetId: generatedAsset.id,
      source: "generated",
    }],
    createdAt: new Date(0).toISOString(),
  };

  assert.equal(
    selectCharacterReferenceAsset(contaminatedPack, npc.id)?.id,
    packageAsset.id,
  );
  const repaired = repairPackageCharacterVisuals(
    contaminatedPack,
    contaminatedState,
    [contaminatedTurn],
  );

  assert.equal(repaired.repairedCharacterCount, 1);
  assert.equal(repaired.clearedSceneCount, 1);
  assert.deepEqual(repaired.removedGeneratedAssetIds, [generatedAsset.id]);
  assert.equal(repaired.state.characterVisuals[0]?.assetId, packageAsset.id);
  assert.equal(repaired.state.characterVisuals[0]?.source, "package");
  assert.equal(repaired.turns[0]?.blocks[0]?.mediaAssetId, packageAsset.id);
  assert.equal(repaired.turns[0]?.imageUrl, undefined);
  assert.equal(repaired.turns[0]?.characterVisuals?.[0]?.canonicalAssetId, packageAsset.id);
  assert.ok(!repaired.pack.mediaAssets.some((asset) => asset.id === generatedAsset.id));
});

test("공개 전 별칭으로 저장된 주요 인물도 패키지 기준본과 정식 ID로 복구한다", async () => {
  const basePack = await loadPack();
  const originalNpc = basePack.npcs[0];
  const npc = {
    ...originalNpc,
    id: "NPC_ALIAS_SABER",
    name: "홍재",
    preRevealAlias: "정체불명의 소녀 검사",
    role: "Saber 클래스 서번트",
    publicInfo: "검을 든 소녀",
  };
  const packageAsset: ScenarioMediaAsset = {
    id: "hongjae-package-canonical",
    path: "images/characters/NPC_ALIAS_SABER/canonical.webp",
    kind: "character",
    characterId: npc.id,
    characterName: npc.name,
    label: "홍재 공식 기준본",
    emotionTags: ["canonical", "default"],
    sceneTags: ["first-appearance"],
    placement: "after_block",
    priority: 100,
    alt: "공개 전 소녀 검사의 공식 기준 이미지",
    caption: "정체불명의 소녀 검사",
    source: "package",
    canonical: true,
  };
  const generatedAsset: ScenarioMediaAsset = {
    ...packageAsset,
    id: "generated-character-dynamic-girl-swordswoman",
    path: "generated/characters/dynamic-girl-swordswoman/canonical.webp",
    characterId: "dynamic-girl-swordswoman",
    characterName: "소녀 검사",
    label: "잘못 생성된 별칭 기준본",
    source: "generated",
  };
  const pack = {
    ...basePack,
    npcs: [npc, ...basePack.npcs.slice(1)],
    mediaAssets: [packageAsset, generatedAsset],
  };
  const state = {
    ...createInitialState(pack),
    encounteredCharacterIds: ["dynamic-girl-swordswoman"],
    characterVisuals: [{
      characterId: "dynamic-girl-swordswoman",
      characterName: "소녀 검사",
      appearancePrompt: "검은 갑옷의 낯선 검사",
      assetId: generatedAsset.id,
      source: "generated" as const,
      introducedTurn: 4,
    }],
  };
  const turn: TurnRecord = {
    id: "alias-contaminated-turn",
    turn: 4,
    role: "exchange",
    blocks: [{
      id: "alias-block",
      type: "dialogue",
      text: "문을 닫아라.",
      speakerId: "dynamic-girl-swordswoman",
      speakerName: "소녀 검사",
      mediaAssetId: generatedAsset.id,
    }],
    recommendations: [],
    characterVisuals: [{
      blockIndex: 0,
      characterId: "dynamic-girl-swordswoman",
      characterName: "소녀 검사",
      importance: "major",
      isFirstMajorAppearance: true,
      appearancePrompt: "검은 갑옷의 낯선 검사",
      reason: "공개 전 첫 등장",
      canonicalAssetId: generatedAsset.id,
      source: "generated",
    }],
    createdAt: new Date(0).toISOString(),
  };

  assert.equal(
    selectPackageCharacterReferenceAsset(pack, "소녀 검사")?.id,
    packageAsset.id,
  );
  const repaired = repairPackageCharacterVisuals(pack, state, [turn]);

  assert.equal(repaired.state.characterVisuals[0]?.characterId, npc.id);
  assert.equal(repaired.state.characterVisuals[0]?.assetId, packageAsset.id);
  assert.deepEqual(repaired.state.encounteredCharacterIds, [npc.id]);
  assert.equal(repaired.turns[0]?.blocks[0]?.speakerId, npc.id);
  assert.equal(repaired.turns[0]?.blocks[0]?.speakerName, "소녀 검사");
  assert.equal(repaired.turns[0]?.blocks[0]?.mediaAssetId, packageAsset.id);
  assert.equal(repaired.turns[0]?.characterVisuals?.[0]?.characterId, npc.id);
  assert.equal(
    repaired.turns[0]?.characterVisuals?.[0]?.canonicalAssetId,
    packageAsset.id,
  );
});

test("앞으로 추가되는 공개 별칭과 플레이어 호칭도 하나의 패키지 ID로 해석한다", async () => {
  const importedAliases = normalizeScenarioPack(
    { projectId: "ALIAS-SCHEMA-IMPORT", title: "별칭 스키마" },
    {
      projectId: "ALIAS-SCHEMA-IMPORT",
      title: "별칭 스키마",
      player: { id: "PLAYER_ALIAS", name: "한시우", aliases: ["시우", "주인공"] },
      npcs: [{
        id: "NPC_ALIAS_IMPORT",
        name: "종이가면 추적자",
        publicAliases: ["현관 밖의 목소리", "종이가면의 남자"],
      }],
      opening: { openingLine: "현관 밖에서 목소리가 들렸다." },
    },
  );
  assert.deepEqual(importedAliases.player.aliases, ["시우", "주인공"]);
  assert.deepEqual(
    importedAliases.npcs[0]?.aliases,
    ["현관 밖의 목소리", "종이가면의 남자"],
  );

  const basePack = await loadPack();
  const pursuer = {
    ...basePack.npcs[0],
    id: "NPC_PAPER_MASK_PURSUER",
    name: "종이가면 추적자",
    aliases: ["종이가면의 남자", "현관 밖의 목소리", "현관 밖의 남자"],
    role: "황동열쇠를 쫓는 침입자",
    publicInfo: "현관 밖에서 종이가면을 쓰고 침입한 추적자",
    appearance: "찌그러진 종이가면과 젖은 검은 외투",
  };
  const firstSupervisor = {
    ...basePack.npcs[0],
    id: "NPC_FIRST_SUPERVISOR",
    name: "첫 감독관",
    role: "중립 감독관",
  };
  const secondSupervisor = {
    ...basePack.npcs[0],
    id: "NPC_SECOND_SUPERVISOR",
    name: "둘째 감독관",
    role: "현장 감독관",
  };
  const pack = {
    ...basePack,
    player: { ...basePack.player, name: "한시우", aliases: ["시우", "주인공"] },
    npcs: [pursuer, firstSupervisor, secondSupervisor],
  };

  assert.equal(resolveVisibleCharacterAlias(pack, "", "현관 밖의 목소리")?.id, pursuer.id);
  assert.equal(resolveVisibleCharacterAlias(pack, "", "종이가면의 남자")?.id, pursuer.id);
  assert.equal(resolveVisibleCharacterAlias(pack, "", "시우")?.id, pack.player.id);
  assert.equal(resolveVisibleCharacterAlias(pack, "", "주인공")?.id, pack.player.id);
  assert.equal(resolveVisibleCharacterAlias(pack, "", "감독관"), undefined);
});

test("패키지 이미지가 없는 별칭 인물도 관계·기억·되돌리기 상태까지 정식 ID로 복구한다", async () => {
  const basePack = await loadPack();
  const pursuer = {
    ...basePack.npcs[0],
    id: "NPC_PAPER_MASK_CANONICAL",
    name: "종이가면 추적자",
    aliases: ["현관 밖의 목소리", "현관 밖의 남자"],
    role: "침입자",
    appearance: "찌그러진 종이가면과 젖은 외투",
  };
  const pack = {
    ...basePack,
    npcs: [pursuer],
    mediaAssets: [],
  };
  const dynamicId = "dynamic-hallway-voice";
  const relation = {
    relationId: `RUNTIME_${dynamicId}_${pack.player.id}`,
    sourceId: dynamicId,
    targetId: pack.player.id,
    characterId: dynamicId,
    name: "현관 밖의 목소리",
    relationType: "위협적인 첫 대면",
    trust: 0,
    publicTrust: 0,
    favor: 0,
    fear: 3,
    respect: 0,
    suspicion: 2,
    hostility: 3,
    dependency: 0,
  };
  const memory = {
    id: "MEM_ALIAS_PURSUER",
    relationId: relation.relationId,
    sourceId: dynamicId,
    targetId: pack.player.id,
    turnLabel: "TURN 4 · D+0",
    eventId: "",
    type: "custom" as const,
    title: "현관 침입",
    summary: "현관 밖의 목소리가 황동열쇠를 요구했다.",
    cause: "종이가면 추적자의 침입",
    visibility: "Public" as const,
    importance: 70,
    permanence: "decaying" as const,
    effects: { trust: 0, favor: 0, fear: 3, respect: 0, suspicion: 2, hostility: 3, dependency: 0 },
    active: true,
    unresolved: true,
    resolutionConditions: "추적자를 떼어 낸다",
    tags: "침입",
    createdAt: "",
    createdTurn: 4,
  };
  const state = {
    ...createInitialState(pack),
    encounteredCharacterIds: [dynamicId],
    characterVisuals: [{
      characterId: dynamicId,
      characterName: "현관 밖의 목소리",
      appearancePrompt: pursuer.appearance,
      assetId: "generated-character-dynamic-hallway-voice",
      source: "generated" as const,
      introducedTurn: 4,
    }],
    relations: [relation],
    relationshipMemories: [memory],
    sessionCanonLedger: [{
      id: "CANON_ALIAS_PURSUER",
      kind: "scene_fact" as const,
      statement: "현관 밖의 목소리가 열쇠를 요구했다.",
      truth: "confirmed" as const,
      origin: "scene" as const,
      subjectIds: [dynamicId],
      evidence: "직접 들었다.",
      consequence: "침입자가 현관에 남아 있다.",
      relatedEventIds: [],
      createdTurn: 4,
      updatedTurn: 4,
      active: true,
    }],
  };
  const turn: TurnRecord = {
    id: "turn-alias-pursuer",
    turn: 4,
    role: "exchange",
    blocks: [{
      id: "voice-block",
      type: "dialogue",
      text: "열쇠를 내놓아.",
      speakerId: dynamicId,
      speakerName: "현관 밖의 목소리",
    }],
    recommendations: [],
    createdAt: new Date(0).toISOString(),
    runtimeSnapshot: state,
  };

  const repaired = repairPackageCharacterVisuals(pack, state, [turn]);

  assert.equal(repaired.repairedCharacterCount, 1);
  assert.deepEqual(repaired.state.encounteredCharacterIds, [pursuer.id]);
  assert.equal(repaired.state.characterVisuals[0]?.characterId, pursuer.id);
  assert.equal(repaired.state.characterVisuals[0]?.source, "generated");
  assert.equal(repaired.state.relations[0]?.characterId, pursuer.id);
  assert.equal(repaired.state.relations[0]?.sourceId, pursuer.id);
  assert.equal(repaired.state.relationshipMemories[0]?.sourceId, pursuer.id);
  assert.deepEqual(repaired.state.sessionCanonLedger[0]?.subjectIds, [pursuer.id]);
  assert.equal(repaired.turns[0]?.blocks[0]?.speakerId, pursuer.id);
  assert.equal(repaired.turns[0]?.runtimeSnapshot?.relations[0]?.characterId, pursuer.id);
});

test("패키지 장면 태그가 소환진과 일치하면 대표 이미지보다 트리거 자산을 우선한다", async () => {
  const basePack = await loadPack();
  const npc = basePack.npcs[0];
  const canonical: ScenarioMediaAsset = {
    id: "canonical-portrait",
    path: "characters/portrait.webp",
    kind: "character",
    characterId: npc.id,
    characterName: npc.name,
    label: "대표 기준본",
    emotionTags: ["canonical", "default"],
    sceneTags: [],
    placement: "after_block",
    priority: 1000,
    alt: "대표 이미지",
    caption: "",
    source: "package",
    canonical: true,
  };
  const summoningScene: ScenarioMediaAsset = {
    ...canonical,
    id: "summoning-magic-circle",
    path: "scenes/summoning.webp",
    kind: "scene",
    characterId: "",
    characterName: "",
    label: "마법진 소환 현현",
    emotionTags: [],
    sceneTags: ["summoning", "magic-circle", "first-appearance"],
    priority: 10,
    canonical: false,
  };
  const pack = {
    ...basePack,
    mediaAssets: [canonical, summoningScene],
  };

  const selected = selectTriggeredScenarioMediaAsset(
    pack,
    "바닥의 마법진이 빛나며 소녀 검사가 현현했다. summoning magic-circle",
    npc.id,
  );

  assert.equal(selected?.id, "summoning-magic-circle");
});

test("공개용 소녀 검사 호칭만 있어도 홍재의 패키지 ID와 소환 전용 이미지를 찾는다", async () => {
  const basePack = await loadPack();
  const saber = {
    ...basePack.npcs[0],
    id: "NPC_SERVANT_SABER_JEONGJO_TS",
    name: "세이버 · 홍재",
    role: "Saber 클래스 서번트",
    hiddenInfo: "진명 정조 이산",
  };
  const canonical: ScenarioMediaAsset = {
    id: "hongjae-canonical",
    path: "characters/hongjae.png",
    kind: "character",
    characterId: saber.id,
    characterName: saber.name,
    label: "대표 기준 이미지",
    emotionTags: ["canonical"],
    sceneTags: [],
    placement: "after_block",
    priority: 1000,
    alt: "홍재 기준 이미지",
    caption: "세이버 · 홍재",
    source: "package",
    canonical: true,
  };
  const summon: ScenarioMediaAsset = {
    ...canonical,
    id: "hongjae-summoning-trigger",
    path: "scenes/hongjae-summoning.png",
    kind: "scene",
    characterId: "",
    characterName: "",
    label: "홍재 소환",
    sceneTags: ["EV_PROLOGUE_07_SABER_SUMMONING"],
    priority: 1,
    canonical: false,
  };
  const pack = { ...basePack, npcs: [saber], mediaAssets: [canonical, summon] };
  const blocks = [{
    id: "alias-dialogue",
    type: "dialogue" as const,
    text: "뒤로 물러서십시오.",
    speakerName: "정체불명의 소녀 검사",
  }];

  assert.deepEqual(selectSceneCharacterReferenceIds(pack, blocks), [saber.id]);
  assert.equal(selectSaberSummoningMediaAsset(pack)?.id, summon.id);
});

test("작품 종류와 무관하게 사건 ID에 연결된 패키지 이미지와 인물 기준본을 찾는다", async () => {
  const basePack = await loadPack();
  const guide = {
    ...basePack.npcs[0],
    id: "NPC_GUIDE_MIRA",
    name: "사서 미라",
    role: "폐쇄 서고의 안내인",
  };
  const canonical: ScenarioMediaAsset = {
    id: "mira-canonical",
    path: "characters/mira.webp",
    kind: "character",
    characterId: guide.id,
    characterName: guide.name,
    label: "미라 대표 이미지",
    emotionTags: ["canonical"],
    sceneTags: [],
    placement: "after_block",
    priority: 1000,
    alt: "사서 미라",
    caption: guide.name,
    source: "package",
    canonical: true,
  };
  const eventScene: ScenarioMediaAsset = {
    ...canonical,
    id: "archive-opening-scene",
    path: "scenes/archive-opening.webp",
    kind: "scene",
    characterId: "",
    characterName: "",
    label: "봉인 서고 개방",
    sceneTags: ["sealed-archive"],
    priority: 1,
    canonical: false,
    triggerId: "TRIGGER_ARCHIVE_OPEN",
    triggerSourceId: "EVENT_OPEN_ARCHIVE",
  };
  const pack = {
    ...basePack,
    title: "시계도서관의 마지막 열쇠",
    genre: "미스터리 어드벤처",
    npcs: [guide],
    events: [{
      ...basePack.events[0],
      id: "EVENT_OPEN_ARCHIVE",
      name: "봉인 서고 개방",
      participants: guide.id,
      required: true,
      sequence: 1,
      requiredSpeakerId: guide.id,
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
    mediaAssets: [canonical, eventScene],
  };

  assert.equal(
    selectEventTriggeredMediaAsset(pack, "EVENT_OPEN_ARCHIVE")?.id,
    eventScene.id,
  );
  assert.equal(
    selectTriggeredScenarioMediaAsset(
      pack,
      "아직 봉인 서고에 도착하지 않은 평범한 아침이다.",
    ),
    undefined,
    "트리거 자산은 비슷한 장면 단어만으로 일반 이미지처럼 선택되면 안 된다",
  );
  assert.equal(
    selectTriggeredScenarioMediaAsset(
      pack,
      "EVENT_OPEN_ARCHIVE 사건이 현재 서버에서 활성화되었다.",
    )?.id,
    eventScene.id,
    "정확한 사건 ID를 가진 서버 경로에서는 연결 자산을 선택한다",
  );
  assert.deepEqual(
    selectEventCharacterReferenceIds(pack, "EVENT_OPEN_ARCHIVE"),
    [guide.id],
  );
});

test("짧은 인물 등장 입력은 NPC 반응과 후속 변수를 만든다", async () => {
  const pack = await loadPack();
  const state = createInitialState(pack);
  const result = createMockTurn({
    pack,
    state,
    userText: "그때 강하은이 다가온다.\n오! 여기 있었구나!",
    recentTurns: [],
  });
  const next = applyStatePatch(state, result.statePatch);

  assert.equal(result.blocks.find((block) => block.type === "dialogue")?.speakerName, "강하은");
  assert.match(result.blocks.find((block) => block.type === "dialogue")?.text ?? "", /여기 있었구나/);
  assert.equal(result.statePatch.variablesAdd.length, 1);
  assert.equal(next.variables[0]?.status, "active");
  assert.match(next.variables[0]?.label ?? "", /강하은/);
  assert.equal(result.characterVisuals.length, 1);
  assert.equal(result.characterVisuals[0]?.characterName, "강하은");
  assert.equal(result.characterVisuals[0]?.source, "pending");
  assert.equal(next.characterVisuals.at(-1)?.characterName, "강하은");
  assert.equal(result.statePatch.encounteredCharactersAdd.length, 1);
  assert.ok(
    next.encounteredCharacterIds.includes(
      result.statePatch.encounteredCharactersAdd[0].characterId,
    ),
  );
  assert.ok(
    result.blocks.every((block) => !isPlayerAgencyViolation(block, pack.player)),
  );
});

test("기존 저장 기록은 실제 대화한 인물만 만난 인물로 복원한다", async () => {
  const pack = await loadPack();
  const opening = createOpeningTurn(pack);
  const metNpc = pack.npcs.find(
    (npc) => !pack.opening.openingCharacters.includes(npc.name),
  );
  assert.ok(metNpc);
  const encountered = deriveEncounteredCharacterIds(pack, [
    opening,
    {
      id: "legacy-turn",
      turn: 1,
      role: "exchange",
      blocks: [
        {
          id: "legacy-dialogue",
          type: "dialogue",
          text: "처음 보네.",
          speakerId: metNpc.id,
          speakerName: metNpc.name,
        },
      ],
      recommendations: [],
      createdAt: new Date(0).toISOString(),
    },
  ]);

  assert.ok(encountered.includes(metNpc.id));
  assert.ok(encountered.length < pack.npcs.length);
});
