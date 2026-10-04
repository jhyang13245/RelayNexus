import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "../lib/demo-scenario";
import type { SimulateRequest } from "../lib/engine";
import {
  compileSceneContext,
  MAX_PLAYER_INPUT_CHARS,
  protectedTermsAbsentFromCompiledPackageContext,
} from "../lib/scene-context-compiler";
import {
  createInitialState,
  type ScenarioEvent,
  type ScenarioPack,
} from "../lib/scenario";

const currentEvent: ScenarioEvent = {
  ...demoScenario.events[0],
  id: "EV_CURRENT",
  name: "유리 온실의 호출",
  description: "회색 연구자와 함께 진정체의 흔적을 확인한다.",
  participants: "NPC_SECRET",
  requiredSpeakerId: "NPC_SECRET",
  beats: [
    {
      id: "BEAT_CURRENT_1",
      order: 1,
      title: "젖은 기록",
      content: "회색 연구자가 젖은 기록을 확인한다.",
      requiredSignals: "기록의 물성 확인",
    },
    {
      id: "BEAT_CURRENT_2",
      order: 2,
      title: "다음 비트의 비밀",
      content: "아직 쓰지 않을 미래 대응",
      requiredSignals: "미래 신호",
    },
  ],
};

const futureEvent: ScenarioEvent = {
  ...demoScenario.events[1],
  id: "EV_FUTURE_SECRET",
  name: "미래의 비밀 사건",
  description: "아직 등장하지 않은 왕과 진정체가 만난다.",
  sequence: 99,
};

const secretNpc = {
  ...demoScenario.npcs[0],
  id: "NPC_SECRET",
  name: "진정체",
  role: "미공개 지휘관",
  preRevealAlias: "회색 연구자",
  revealCondition: {
    kind: "clock_at_least" as const,
    clockId: "CLOCK_REVEAL",
    value: 2,
  },
};

const unrelatedNpc = {
  ...demoScenario.npcs[1],
  id: "NPC_UNRELATED",
  name: "먼 도시의 기록관",
};

const pack: ScenarioPack = {
  ...demoScenario,
  instantStoryRuntime: undefined,
  projectId: "GENERIC-CHRONICLE-001",
  title: "유리 온실 연대기",
  npcs: [secretNpc, unrelatedNpc],
  events: [currentEvent, futureEvent],
  clocks: [
    {
      id: "CLOCK_REVEAL",
      name: "공개 시계",
      current: 0,
      maximum: 3,
      visibility: "hidden",
      publicHint: "",
      hiddenNotes: "진정체 공개 조건",
    },
  ],
  narrativeRuntime: {
    format: "RELAY_NOVEL_NARRATIVE_RUNTIME_EXTENSION_V1",
    packageCompatibility: ["1.5"],
    mergeRules: {},
    characterDisclosure: [
      {
        characterId: "NPC_SECRET",
        preRevealAlias: "회색 연구자",
        revealCondition: {
          kind: "clock_at_least",
          clockId: "CLOCK_REVEAL",
          value: 2,
        },
      },
    ],
    events: [],
  },
};

const requestFor = (
  userText: string,
  options: { revealClock?: number; recentTurns?: number; memories?: number } = {},
): SimulateRequest => {
  const state = createInitialState(pack);
  state.location = "유리 온실 입구";
  state.sceneSummary = "회색 연구자가 젖은 기록 곁에 서 있다.";
  state.encounteredCharacterIds = ["NPC_SECRET"];
  state.clocks = pack.clocks.map((clock) => ({
    ...clock,
    current: options.revealClock ?? 0,
  }));
  return {
    pack,
    state,
    userText,
    recentTurns: Array.from({ length: options.recentTurns ?? 0 }, (_, index) => ({
      turn: index + 1,
      userText: `${index + 1}번째 기록을 확인한다.`,
      blocks: [],
      location: "유리 온실",
      time: `09:${String(index).padStart(2, "0")}`,
    })),
    longTermMemories: Array.from({ length: options.memories ?? 0 }, (_, index) => ({
      turn: index + 1,
      day: 1,
      date: "2042-03-02",
      time: "09:00",
      location: "유리 온실",
      title: `${index + 1}번째 온실 기억`,
      summary: index % 2 === 0 ? "젖은 기록을 조사했다." : "복도에서 대화했다.",
    })),
  };
};

const compile = (
  request: SimulateRequest,
  deep = false,
) => compileSceneContext({
  request,
  activeEvent: currentEvent,
  beatIndex: 0,
  totalBeats: 2,
  completedEventIds: [],
  protectedTerms: [
    ...(request.state.clocks.find((clock) => clock.id === "CLOCK_REVEAL")?.current ?? 0) < 2
      ? ["진정체"]
      : [],
    "미래의 비밀 사건",
  ],
  pathSignals: [{ id: "test_deep", active: deep }],
  visibleInventory: request.state.inventory,
});

test("3천 자를 넘는 플레이어 입력도 조용히 자르지 않고 원문 계약에 보존한다", () => {
  const longInput = `회색 연구자에게 기록의 모든 면을 차례로 보여 준다. ${"관찰을 계속한다. ".repeat(500)}`;
  assert.ok(longInput.length > 3_000);
  assert.ok(longInput.length < MAX_PLAYER_INPUT_CHARS);

  const result = compile(requestFor(longInput));

  assert.equal(result.context.playerInputContract.original, longInput);
  assert.ok(result.profile.inputClauseCount >= 1);
});

test("12,000자를 넘는 입력은 중간을 잘라 다른 뜻으로 만들지 않고 명시적으로 거부한다", () => {
  const oversized = "행동을 순서대로 실행한다. ".repeat(900);
  assert.ok(oversized.length > MAX_PLAYER_INPUT_CHARS);
  assert.throws(
    () => compile(requestFor(oversized)),
    /PLAYER_INPUT_TOO_LONG/u,
  );
});

test("부정·조건 입력은 실행 의무가 아니며 sceneFact의 일시 효과는 직접 증거 계약이 된다", () => {
  const result = compile(requestFor(
    "비가 오면 떠나겠지만 지금은 가지 않는다. 라이터로 종이를 불태워 없앤다. 잠시나마 효과가 있었다.",
  ));

  assert.ok(result.context.playerInputContract.clauses.some((clause) =>
    clause.mustNotExecute && !clause.mustAttempt
  ));
  assert.equal(result.context.playerInputContract.sceneFact.active, true);
  assert.equal(result.context.playerInputContract.sceneFact.temporaryEffect, true);
  assert.ok(result.context.playerInputContract.requiredEvidence.some((item) =>
    /효과가 끝나거나 반동/u.test(item)
  ));
});

test("Fast 경로는 현재 사건·현재 비트·관련 인물만 담고 미래 사건과 보호 정체를 제외한다", () => {
  const result = compile(requestFor("회색 연구자에게 젖은 기록을 건넨다.", {
    recentTurns: 12,
    memories: 50,
  }));
  const serialized = JSON.stringify(result.context);

  assert.equal(result.profile.path, "fast");
  assert.equal(result.context.activeEvent?.id, "EV_CURRENT");
  assert.equal(
    (result.context.activeEvent?.currentBeat as Record<string, unknown>)?.id,
    "BEAT_CURRENT_1",
  );
  assert.ok(!serialized.includes("EV_FUTURE_SECRET"));
  assert.ok(!serialized.includes("미래의 비밀 사건"));
  assert.ok(!serialized.includes("진정체"));
  assert.ok(serialized.includes("회색 연구자"));
  assert.ok(!result.profile.includedCharacterIds.includes("NPC_UNRELATED"));
  assert.equal(result.context.recentTurns.length, 4);
  assert.equal(result.context.semanticMemories.length, 14);
  assert.equal(
    protectedTermsAbsentFromCompiledPackageContext(
      result.context,
      ["진정체", "미래의 비밀 사건"],
    ),
    true,
  );
});

test("과거 AI 본문·요약·공개 장부의 공개 전 명칭은 다시 가리고 플레이어 추측만 보존한다", () => {
  const request = requestFor("회색 연구자에게 젖은 기록을 보여 준다.");
  request.state.sceneSummary = "진정체가 유리 온실에 남았다.";
  request.state.status = ["진정체와 대치 중"];
  request.state.variables = [{
    id: "PUBLIC_LEAK",
    label: "진정체 경보",
    detail: "진정체가 접근했다.",
    visibility: "public",
    reason: "legacy leak",
    status: "active",
    createdTurn: 1,
  }];
  request.state.sessionCanonLedger = [{
    id: "CANON_LEAK",
    kind: "scene_fact",
    statement: "진정체가 자신을 밝혔다.",
    truth: "confirmed",
    origin: "scene",
    subjectIds: ["NPC_SECRET"],
    evidence: "진정체의 대사",
    consequence: "진정체를 안다.",
    relatedEventIds: [],
    createdTurn: 1,
    updatedTurn: 1,
    active: true,
  }];
  request.recentTurns = [{
    turn: 1,
    userText: "당신이 진정체인가요?",
    blocks: [{
      id: "legacy-leak",
      type: "dialogue",
      text: "나는 진정체다.",
      speakerId: "NPC_SECRET",
      speakerName: "진정체",
      emotion: "침착",
    }],
    location: "진정체의 온실",
    time: "09:00",
  }];
  request.longTermMemories = [{
    turn: 1,
    day: 1,
    date: "2042-03-02",
    time: "09:00",
    location: "진정체의 온실",
    title: "진정체 공개",
    summary: "진정체가 이름을 밝혔다.",
  }];

  const result = compile(request);

  assert.equal(result.context.recentTurns[0]?.userText, "당신이 진정체인가요?");
  assert.equal(
    protectedTermsAbsentFromCompiledPackageContext(
      result.context,
      ["진정체", "미래의 비밀 사건"],
    ),
    true,
  );
  assert.ok(JSON.stringify(result.context).includes("[공개 전 정보]"));
});

test("50턴 이상 세션도 Fast 경로가 최근 4턴과 관련 기억 14건만 선택한다", () => {
  const result = compile(requestFor(
    "회색 연구자에게 젖은 기록을 보여 준다.",
    { recentTurns: 60, memories: 180 },
  ));

  assert.equal(result.profile.path, "fast");
  assert.deepEqual(
    result.context.recentTurns.map((turn) => turn.turn),
    [57, 58, 59, 60],
  );
  assert.equal(result.context.semanticMemories.length, 14);
  assert.equal(result.profile.excludedMemoryCount, 166);
  assert.ok(result.profile.dynamicPromptChars < 100_000);
});

test("공개 시계가 조건에 도달한 뒤에는 canonicalName을 별칭 대신 사용할 수 있다", () => {
  const before = compile(requestFor("회색 연구자를 바라본다.", { revealClock: 1 }));
  const after = compile(requestFor("진정체에게 정체를 묻는다.", { revealClock: 2 }));

  assert.equal(before.context.characters.some((item) => item.visibleName === "회색 연구자"), true);
  assert.equal(after.context.characters.some((item) => item.visibleName === "진정체"), true);
  assert.equal(
    (after.context.characters.find((item) => item.id === "NPC_SECRET")?.disclosureState),
    "revealed",
  );
});

test("Deep 경로는 이유를 기록하고 더 넓은 최근 턴·의미 기억 범위를 선택한다", () => {
  const result = compile(
    requestFor("문을 부수고 안으로 돌입한다.", { recentTurns: 12, memories: 50 }),
    true,
  );

  assert.equal(result.profile.path, "deep");
  assert.deepEqual(result.profile.pathReasons, ["test_deep"]);
  assert.equal(result.context.recentTurns.length, 8);
  assert.equal(result.context.semanticMemories.length, 28);
  assert.equal(result.profile.excludedEventCount, 1);
  assert.ok(result.profile.excludedMemoryCount > 0);
});

test("Instant Story는 초기 복합 장면을 Fast로 유지하고 패키지 예산을 적용한다", () => {
  const request = requestFor("회색 연구자에게 젖은 기록을 건넨다.", {
    recentTurns: 12,
    memories: 50,
  });
  request.pack = {
    ...pack,
    instantStoryRuntime: demoScenario.instantStoryRuntime,
  };
  const result = compileSceneContext({
    request,
    activeEvent: currentEvent,
    beatIndex: 0,
    totalBeats: 2,
    completedEventIds: [],
    protectedTerms: ["진정체", "미래의 비밀 사건"],
    pathSignals: [
      { id: "combat", active: true },
      { id: "compound_or_multi_clause", active: true },
    ],
    visibleInventory: request.state.inventory,
  });

  assert.equal(result.profile.path, "fast");
  assert.equal(result.context.recentTurns.length, 4);
  assert.equal(result.context.semanticMemories.length, 10);
  assert.equal(result.context.runtimeExtensions.instantStory?.profile, "instant_story");
});

test("Instant Story v2는 가짜 마지막 비트 신호로 사건 결과에 수렴하지 않는다", () => {
  const request = requestFor("기록의 결론을 확인한다.", {
    recentTurns: 12,
    memories: 50,
  });
  request.pack = {
    ...pack,
    instantStoryRuntime: demoScenario.instantStoryRuntime,
  };
  const result = compileSceneContext({
    request,
    activeEvent: currentEvent,
    beatIndex: 1,
    totalBeats: 2,
    completedEventIds: [],
    protectedTerms: ["진정체", "미래의 비밀 사건"],
    pathSignals: [],
    visibleInventory: request.state.inventory,
  });

  assert.equal(result.profile.path, "fast");
  assert.deepEqual(result.profile.pathReasons, ["ordinary_current_scene"]);
});
