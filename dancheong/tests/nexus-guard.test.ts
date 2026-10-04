import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "./fixtures/legacy-demo-scenario";
import { applyStatePatch } from "../lib/engine";
import {
  activeSceneConstraints,
  adjudicateCompoundResolution,
  buildDerailmentCoSealPlan,
  compoundBeatProgressVariable,
  selectNarrativeCandidate,
} from "../lib/nexus-guard";
import {
  createInitialState,
  normalizeScenarioPack,
  type ScenarioEvent,
} from "../lib/scenario";

const event = (overrides: Partial<ScenarioEvent> = {}): ScenarioEvent => ({
  id: "EVENT_1",
  name: "첫 사건",
  type: "Fixed",
  visibility: "Hidden",
  status: "Planned",
  priority: 100,
  conditions: "",
  description: "",
  required: true,
  sequence: 1,
  kind: "event",
  ...overrides,
});

test("constraint는 사건 목록과 분리된 채 JSON 캐시 왕복 뒤에도 유지된다", () => {
  const pack = normalizeScenarioPack(
    { projectId: "NEXUS-CONSTRAINT-CACHE" },
    {
      projectId: "NEXUS-CONSTRAINT-CACHE",
      title: "제약 캐시",
      player: { id: "PLAYER", name: "주인공" },
      events: [
        event(),
        {
          ...event({ id: "CONSTRAINT_1", name: "서로 모르는 사람들" }),
          kind: "constraint",
          appliesTo: ["EVENT_1"],
          rules: ["첫 대면 전에는 서로의 이름을 알지 못한다."],
        },
      ],
      opening: { openingLine: "시작한다." },
    },
  );
  const cached = JSON.parse(JSON.stringify(pack)) as typeof pack;

  assert.equal(cached.events.length, 1);
  assert.equal(cached.constraints.length, 1);
  assert.equal(cached.constraints[0]?.id, "CONSTRAINT_1");
  assert.deepEqual(activeSceneConstraints(cached, "EVENT_1")[0]?.rules, [
    "첫 대면 전에는 서로의 이름을 알지 못한다.",
  ]);
});

test("재작성 실패는 입력 거절이 아니라 안전한 의도 보존형 복구로 이어진다", () => {
  const original = { text: "이태원 클럽으로 가려는 계획" };
  const recover = (candidate: typeof original) => ({
    text: `${candidate.text}을 남기고 현재 사건을 먼저 잇는다`,
  });

  assert.deepEqual(
    selectNarrativeCandidate({
      original,
      corrected: undefined,
      correctedIsSafe: false,
      recover,
    }),
    { text: "이태원 클럽으로 가려는 계획을 남기고 현재 사건을 먼저 잇는다" },
  );
  assert.deepEqual(
    selectNarrativeCandidate({
      original,
      corrected: { text: "입력을 지운 불안전한 재작성본" },
      correctedIsSafe: false,
      recover,
    }),
    { text: "이태원 클럽으로 가려는 계획을 남기고 현재 사건을 먼저 잇는다" },
  );
  assert.deepEqual(
    selectNarrativeCandidate({
      original,
      corrected: { text: "안전한 재작성본" },
      correctedIsSafe: true,
      recover,
    }),
    { text: "안전한 재작성본" },
  );
});

test("이탈 동반 봉인은 현재 사건 필수 조건이 없으면 시작조차 하지 않는다", () => {
  const current = event({
    requiredItems: "봉인 열쇠",
    requiredDialogue: "문을 열어라.",
    completionSignals: "문이 열렸다",
  });
  const plan = buildDerailmentCoSealPlan({
    explicitDerailmentTurn: true,
    currentEvent: current,
    followingEvents: [event({ id: "EVENT_2" })],
    observedText: "주인공은 자리를 떠나려 했다.",
    inventory: [],
  });

  assert.equal(plan.allowed, false);
  assert.deepEqual(plan.sealableEventIds, []);
  assert.equal(plan.stoppedAtEventId, "EVENT_1");
});

test("이탈 동반 봉인은 실제로 성립하지 않은 중간 사건 직전에서 멈춘다", () => {
  const current = event({
    completionSignals: "첫 문이 열렸다",
  });
  const second = event({
    id: "EVENT_2",
    completionSignals: "두 번째 문이 열렸다",
  });
  const third = event({
    id: "EVENT_3",
    completionSignals: "세 번째 문이 열렸다",
  });
  const plan = buildDerailmentCoSealPlan({
    explicitDerailmentTurn: true,
    currentEvent: current,
    followingEvents: [second, third],
    observedText: "첫 문이 열렸다. 이어서 두 번째 문이 열렸다.",
    inventory: [],
  });

  assert.equal(plan.allowed, true);
  assert.deepEqual(plan.sealableEventIds, ["EVENT_1", "EVENT_2"]);
  assert.equal(plan.stoppedAtEventId, "EVENT_3");
});

test("compound 사건은 마지막 비트 전 eventResolved를 비트 전진으로만 처리한다", () => {
  const compound = event({
    id: "COMPOUND_1",
    kind: "compound",
    beats: [
      { id: "B1", order: 1, title: "A 시점", content: "첫 장면" },
      { id: "B2", order: 2, title: "B 시점", content: "둘째 장면" },
      { id: "B3", order: 3, title: "합류", content: "마지막 장면" },
    ],
  });
  const state = createInitialState({ ...demoScenario, events: [compound] });
  const decision = adjudicateCompoundResolution({
    event: compound,
    state,
    requestedEventResolved: true,
    observedText: "첫 장면이 실제로 벌어졌다.",
  });

  assert.equal(decision.allowEventCompletion, false);
  assert.equal(decision.advanceBeat, true);
  assert.equal(decision.nextBeatIndex, 1);
});

test("compound 사건은 마지막 비트가 실제로 성립한 뒤에만 완료된다", () => {
  const compound = event({
    id: "COMPOUND_2",
    kind: "compound",
    beats: [
      { id: "B1", order: 1, title: "전반", content: "전반" },
      {
        id: "B2",
        order: 2,
        title: "결말",
        content: "결말",
        requiredSignals: "두 사람이 합류했다",
      },
    ],
  });
  const initial = createInitialState({ ...demoScenario, events: [compound] });
  const state = {
    ...initial,
    variables: [compoundBeatProgressVariable(compound, 1, 1)],
  };

  assert.equal(adjudicateCompoundResolution({
    event: compound,
    state,
    requestedEventResolved: true,
    observedText: "아직 서로를 찾는 중이다.",
  }).allowEventCompletion, false);
  assert.equal(adjudicateCompoundResolution({
    event: compound,
    state,
    requestedEventResolved: true,
    observedText: "두 사람이 합류했다.",
  }).allowEventCompletion, true);
});

test("활성 compound 비트 원장은 일반 변수 제한을 넘어도 소실되지 않는다", () => {
  const compound = event({
    id: "COMPOUND_LONG_RUN",
    kind: "compound",
    beats: [
      { id: "B1", order: 1, title: "전반", content: "전반" },
      { id: "B2", order: 2, title: "후반", content: "후반" },
    ],
  });
  const pack = { ...demoScenario, events: [compound] };
  const state = {
    ...createInitialState(pack),
    variables: [
      compoundBeatProgressVariable(compound, 1, 1),
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `ORDINARY_${index}`,
        label: `일반 변수 ${index}`,
        detail: "",
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
    variablesAdd: [],
    variablesResolve: [],
    characterVisualsAdd: [],
    encounteredCharactersAdd: [],
    statusLedgerChanges: [],
    autonomyActions: [],
    relationshipMemoriesAdd: [],
    relationshipMemoryResolveIds: [],
  }, pack);

  assert.ok(next.variables.some((variable) =>
    variable.id === "RELAY_NEXUS_COMPOUND_BEAT:COMPOUND_LONG_RUN"
  ));
});
