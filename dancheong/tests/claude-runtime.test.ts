import assert from "node:assert/strict";
import test from "node:test";

import {
  CLAUDE_RUNTIME_VARIABLE_ID,
  advanceClaudeBeatManually,
  adjudicateClaudeTurn,
  buildClaudeRuntimePrompt,
  claudeContractChecklist,
  claudeClosureEvidenceSatisfied,
  claudeClosurePressureActive,
  claudeRuntimeVariable,
  claudeSignalViolations,
  closeClaudeEventManually,
  deriveClaudeTurnIntent,
  forcedClaudeClosureViolations,
  readClaudeRuntime,
  type ClaudeTurnSignals,
} from "../lib/claude-runtime";
import { demoScenario } from "./fixtures/legacy-demo-scenario";
import { applyStatePatch } from "../lib/engine";
import {
  createInitialState,
  type RuntimeState,
  type ScenarioEvent,
  type ScenarioPack,
} from "../lib/scenario";

const event = (
  id: string,
  sequence: number,
  extras: Partial<ScenarioEvent> = {},
): ScenarioEvent => ({
  id,
  name: id,
  type: "Story",
  visibility: "Hidden",
  status: sequence === 1 ? "Active" : "Pending",
  priority: 50,
  conditions: "",
  description: `${id} 설명`,
  required: true,
  sequence,
  completionSignals: `${id} 완료`,
  ...extras,
});

test("사건 종결조건 체크리스트는 매 비트의 누적 본문과 보유 물품을 같은 판정기로 반영한다", () => {
  const active = event("EV_CHECKLIST", 1, {
    requiredItems: "황동 열쇠",
    requiredDialogue: "문을 열어 주세요",
    completionSignals: "경보가 멎었다 / 침입자가 물러났다",
  });
  const before = claudeContractChecklist(active, "아직 문밖을 살핀다.", []);
  assert.deepEqual(before.map((item) => item.met), [false, false, false]);

  const after = claudeContractChecklist(
    active,
    "황동 열쇠를 손에 쥐고 ‘문을 열어 주세요’라고 말했다. 잠시 뒤 침입자가 물러났다.",
    ["황동 열쇠"],
  );
  assert.deepEqual(after.map((item) => item.met), [true, true, true]);
});

const makePack = (...events: ScenarioEvent[]): ScenarioPack => ({
  ...demoScenario,
  projectId: "CLAUDE-RUNTIME-TEST",
  title: "Claude Runtime Test",
  events,
  constraints: [
    event("CONSTRAINT_STRANGERS", 0, {
      kind: "constraint",
      required: false,
      appliesTo: [events[0]?.id ?? "*"],
      rules: ["두 인물은 아직 서로의 진명을 모른다."],
    }),
  ],
});

const signals = (
  overrides: Partial<ClaudeTurnSignals> = {},
): ClaudeTurnSignals => ({
  inputMode: "advance",
  sceneTime: "09:05",
  location: "현재 장소",
  appearing: [],
  firstAppearance: [],
  mentioned: [],
  openQuestions: [],
  resolvedQuestions: [],
  beatAdvanced: true,
  eventResolved: false,
  resolutionSummary: "",
  autoAction: "",
  ...overrides,
});

const stateFor = (pack: ScenarioPack): RuntimeState => ({
  ...createInitialState(pack),
  location: "현재 장소",
  time: "09:00",
});

test("Claude HTML 원장은 활성 사건·비트·장면 제약을 별도 상태로 시작한다", () => {
  const first = event("EV_FIRST", 1);
  const pack = makePack(first, event("EV_SECOND", 2));
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  const prompt = buildClaudeRuntimePrompt({
    pack,
    state,
    ledger,
    userInput: "주변을 살핀다",
    canonicalAdvance: false,
  });

  assert.equal(ledger.activeEventId, first.id);
  assert.equal(prompt.activeEvent?.id, first.id);
  assert.equal(prompt.constraints.length, 1);
  assert.equal(prompt.constraints[0]?.policy, "사건이 아니라 장면 내내 지킬 규칙이며 완료·봉인 대상이 아니다.");
});

test("저장된 활성 사건보다 앞선 사건은 대기가 아니라 순서대로 봉인 복구된다", () => {
  const first = event("EV_FIRST", 1);
  const second = event("EV_SECOND", 2);
  const third = event("EV_THIRD", 3, { completionSignals: "" });
  const pack = makePack(first, second, third);
  const state = stateFor(pack);
  const oldLedger = readClaudeRuntime(pack, state, first.id);
  oldLedger.activeEventId = third.id;
  oldLedger.maxSequence = 3;
  oldLedger.sealed = [];
  const restored = readClaudeRuntime(pack, {
    ...state,
    variables: [{
      ...claudeRuntimeVariable(oldLedger),
      status: "active",
      createdTurn: 3,
    }],
  });

  assert.deepEqual(restored.sealed.map((entry) => entry.id), [first.id, second.id]);
  assert.equal(restored.activeEventId, third.id);
});

test("레거시 저장 복구는 서로 다른 문장과 기억의 계약 조각을 합치지 않는다", () => {
  const first = event("EV_FIRST", 1, {
    requiredDialogue: "문을 열어 주세요",
    completionSignals: "",
  });
  const second = event("EV_SECOND", 2);
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.eventText = "그는 문을 열어, 하고 말을 멈췄다.";
  const restored = readClaudeRuntime(pack, {
    ...state,
    sceneSummary: "다른 이야기가 이어졌다.",
    memories: ["그 뒤에 주세요라는 말만 따로 남았다."],
    variables: [{
      ...claudeRuntimeVariable(ledger),
      status: "active",
      createdTurn: state.turn,
    }],
  });
  assert.equal(restored.activeEventId, first.id);
  assert.ok(restored.mustPending.some((entry) => entry.includes("문을 열어 주세요")));
});

test("레거시 저장 복구는 한 문장 안에서 성립한 계약은 계속 복구한다", () => {
  const first = event("EV_FIRST", 1, {
    requiredDialogue: "문을 열어 주세요",
    completionSignals: "",
  });
  const second = event("EV_SECOND", 2);
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.eventText = "그는 상대에게 ‘문을 열어 주세요’라고 분명히 말했다.";
  const restored = readClaudeRuntime(pack, {
    ...state,
    variables: [{
      ...claudeRuntimeVariable(ledger),
      status: "active",
      createdTurn: state.turn,
    }],
  });
  assert.equal(restored.activeEventId, second.id);
  assert.ok(restored.sealed.some((entry) => entry.id === first.id));
});

test("필수 사건을 생까고 다른 장소에서 밤을 새는 입력을 장시간 이탈로 판정한다", () => {
  const first = event("EV_FIRST", 1, { requiredItems: "황동 열쇠" });
  const intent = deriveClaudeTurnIntent(
    "무인택배함을 생까고 이태원 클럽에서 다음 날 오전 6시까지 밤을 새며 논다.",
    first,
    "16:20",
  );

  assert.equal(intent.explicitDerailment, true);
  assert.equal(intent.impliedTravel, true);
  assert.equal(intent.longSpan, true);
  assert.equal(intent.requestedEndTime, "06:00");
  assert.equal(intent.requestedMinimumMinutes, 820);
  assert.match(intent.destinationHint, /이태원 클럽/u);
});

test("'클럽으로 곧장 가서 다음날까지' 조사형 장시간 이동도 이탈로 판정한다", () => {
  const first = event("EV_FIRST", 1, { requiredItems: "황동 열쇠" });
  const intent = deriveClaudeTurnIntent(
    "한시우는 이태원 클럽으로 곧장 가서 다음날 오전 7시까지 밤을 새기로 한다.",
    first,
    "15:30",
  );

  assert.equal(intent.explicitDerailment, true);
  assert.equal(intent.impliedTravel, true);
  assert.equal(intent.longSpan, true);
  assert.equal(intent.destinationHint, "이태원 클럽");
  assert.equal(intent.requestedEndTime, "07:00");
  assert.equal(intent.requestedMinimumMinutes, 930);
});

test("세 시간 미만이어도 필수 사건 마감을 넘기는 입력은 즉시 정사 교정한다", () => {
  const intent = deriveClaudeTurnIntent(
    "한시우는 오후 6시 10분까지 열람실에서 공부를 계속한다.",
    { required: true, timeWindow: "15:00~18:00" } as never,
    "15:30",
  );
  assert.equal(intent.explicitDerailment, true);
  assert.equal(intent.requestedEndTime, "18:10");
});

test("'저녁까지 공부한다'는 정성적 종료 시각도 필수 사건 이탈로 판정한다", () => {
  const intent = deriveClaudeTurnIntent(
    "한시우는 이번에는 휴대폰 전원을 종료한 뒤 저녁까지 공부에 몰두한다.",
    { required: true, timeWindow: "15:30~18:00" } as never,
    "15:27",
  );

  assert.equal(intent.explicitDerailment, true);
  assert.equal(intent.longSpan, true);
  assert.equal(intent.requestedEndTime, "19:00");
  assert.equal(intent.requestedMinimumMinutes, 213);
});

test("다음 날 목적지의 길을 알려주는 대사는 플레이어 이동으로 오판하지 않는다", () => {
  const first = event("EV_FIRST", 1);
  const intent = deriveClaudeTurnIntent(
    "다음 날 나디아에게 박물관 별관으로 가는 길을 알려준다.",
    first,
    "15:30",
  );

  assert.equal(intent.impliedTravel, false);
  assert.equal(intent.explicitDerailment, false);
});

test("나디아의 다음 데이트 제안은 목적지나 사건 이탈로 오판하지 않는다", () => {
  const first = event("EV_NADIA_CONVERSATION", 1);
  const intent = deriveClaudeTurnIntent(
    "별관은 왼쪽 언덕 위입니다. 마침 우산도 없으시니 제가 데려다 드리지요. 나디아는 친절한 한시우의 모습에 호감을 느껴 연락처를 교환하자 한다. 그녀는 다음에 데이트를 하자는 약속을 남긴다.",
    first,
    "15:40",
  );

  assert.equal(intent.explicitDerailment, false);
  assert.equal(intent.impliedTravel, false);
  assert.equal(intent.longSpan, false);
  assert.equal(intent.destinationHint, "");
});

test("외면하지 말라는 부탁은 필수 사건 이탈로 뒤집지 않는다", () => {
  const first = event("EV_NADIA_CONVERSATION", 1);
  const intent = deriveClaudeTurnIntent(
    "자신에게 이 일이 얼마나 절박한지 숨기지 않고, 나디아의 일정에 부담이 되더라도 이 문제를 외면하지 말고 함께 책임져 달라고 요청한다.",
    first,
    "19:10",
  );

  assert.equal(intent.explicitDerailment, false);
  assert.equal(intent.impliedTravel, false);
  assert.equal(intent.longSpan, false);
  assert.equal(intent.destinationHint, "");
});

test("이탈 동사의 부정형과 실제 포기 표현을 구분한다", () => {
  const first = event("EV_REQUIRED", 1);

  for (const input of [
    "이 문제를 포기하지 않고 끝까지 확인한다.",
    "나디아를 외면하지 않는다.",
    "여기서 떠나지 않겠다고 말한다.",
    "모른 척하지 말고 함께 살펴보자고 부탁한다.",
  ]) {
    assert.equal(
      deriveClaudeTurnIntent(input, first, "19:10").explicitDerailment,
      false,
      input,
    );
  }

  for (const input of [
    "이 문제를 외면하고 자리를 뜬다.",
    "필수 사건을 포기하고 돌아간다.",
    "모른 척하고 그냥 지나간다.",
  ]) {
    assert.equal(
      deriveClaudeTurnIntent(input, first, "19:10").explicitDerailment,
      true,
      input,
    );
  }
});

test("장시간 이탈은 같은 턴의 인물다운 즉시 정사 흡수 정책을 사용한다", () => {
  const first = event("EV_FIRST", 1, { requiredItems: "황동 열쇠" });
  const pack = makePack(first);
  const state = { ...stateFor(pack), time: "16:20", location: "대학교" };
  const ledger = readClaudeRuntime(pack, state, first.id);
  const prompt = buildClaudeRuntimePrompt({
    pack,
    state,
    ledger,
    userInput: "택배함을 생까고 이태원 클럽에서 오전 6시까지 밤을 샌다",
    canonicalAdvance: false,
  });

  assert.equal(prompt.derailment.active, true);
  assert.equal(prompt.derailment.recoveryStage, "immediate_absorb");
  assert.equal(prompt.derailment.requestedMinimumMinutes, 820);
  assert.match(String(prompt.derailment.policy), /목적과 자율성으로 보존/u);
  assert.match(String(prompt.derailment.policy), /준비·출발·부분 이동/u);
  assert.match(String(prompt.derailment.policy), /멈추거나 돌아오/u);
  assert.match(String(prompt.derailment.policy), /현재 비트 안에서 종결/u);
  assert.match(String(prompt.derailment.policy), /월드 시간에 반영하지 않는다/u);
  assert.match(String(prompt.derailment.policy), /필수 물품 획득/u);
});

test("이탈 턴은 욕구를 인정한 뒤 현재 필수 사건을 같은 턴에 완료하고 봉인한다", () => {
  const first = event("EV_FIRST", 1, { requiredItems: "황동 열쇠" });
  const pack = makePack(first);
  const state = { ...stateFor(pack), time: "16:20", location: "대학교" };
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal - 1;
  const result = adjudicateClaudeTurn({
    pack,
    state,
    ledger,
    signals: signals({
      inputMode: "advance",
      sceneTime: "16:40",
      location: "대학교 무인택배함",
      beatAdvanced: true,
      eventResolved: true,
      resolutionSummary: "택배를 열어 황동 열쇠를 챙겼다.",
    }),
    publicText: "이태원 클럽의 위치와 이동 경로를 저장하고 출발 준비를 했다. 출발 직전 외할머니의 마지막 유물일지 모를 택배의 수령 마감 알림이 떠서 현재 동선의 무인택배함으로 잠시 우회했다. 상자를 열어 황동 열쇠를 챙겼고, 클럽 계획은 취소하지 않은 채 보류했다. EV_FIRST 완료.",
    userInput: "택배함을 생까고 이태원 클럽에서 오전 6시까지 밤을 샌다",
    canonicalAdvance: false,
    inventoryAfter: ["황동 열쇠"],
  });

  assert.equal(result.explicitDerailmentTurn, true);
  assert.equal(result.eventCompleted, true);
  assert.equal(result.ledger.activeEventId, "");
  assert.equal(result.ledger.driftTurns, 0);
  assert.deepEqual(result.completedEventIds, [first.id]);
  assert.equal(result.ledger.sealed.length, 1);
});

test("일반 턴은 다음 사건 계약이 본문에 있어도 동반 봉인하지 않는다", () => {
  const first = event("EV_FIRST", 1);
  const second = event("EV_SECOND", 2);
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal - 1;
  const result = adjudicateClaudeTurn({
    pack,
    state,
    ledger,
    signals: signals({
      eventResolved: true,
      resolutionSummary: "첫 사건을 마쳤다.",
    }),
    publicText: "EV_FIRST 완료. EV_SECOND 완료.",
    userInput: "계속 진행한다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });

  assert.deepEqual(result.completedEventIds, [first.id]);
  assert.equal(result.ledger.activeEventId, second.id);
});

test("이탈 저지 턴도 현재 사건 계약이 없으면 봉인을 시작하지 않는다", () => {
  const first = event("EV_FIRST", 1, { requiredItems: "황동 열쇠" });
  const second = event("EV_SECOND", 2);
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal - 1;
  const result = adjudicateClaudeTurn({
    pack,
    state,
    ledger,
    signals: signals({ inputMode: "digress", eventResolved: true }),
    publicText: "그는 돌아섰지만 발이 묶였다. EV_FIRST 완료.",
    userInput: "여기서 떠나 집으로 간다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });

  assert.equal(result.eventCompleted, false);
  assert.equal(result.completionRejected, true);
  assert.equal(result.eventCarriedOver, false);
  assert.equal(result.closureBeatExtended, true);
  assert.match(result.missingCurrentContract.join(" "), /황동 열쇠/u);
  assert.equal(result.ledger.activeEventId, first.id);
  assert.equal(result.ledger.sealed.length, 0);
});

test("이탈 동반 봉인은 현재 사건 뒤 첫 미성립 사건에서 멈춘다", () => {
  const first = event("EV_FIRST", 1, { requiredItems: "황동 열쇠" });
  const second = event("EV_SECOND", 2, { requiredItems: "붉은 문서" });
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal - 1;
  const result = adjudicateClaudeTurn({
    pack,
    state,
    ledger,
    signals: signals({
      inputMode: "digress",
      eventResolved: true,
      resolutionSummary: "열쇠를 확보했다.",
    }),
    publicText: "그는 떠나려다 돌아와 황동 열쇠를 손에 챙겼다. EV_FIRST 완료.",
    userInput: "자리를 떠나 집으로 간다",
    canonicalAdvance: false,
    inventoryAfter: ["황동 열쇠"],
  });

  assert.deepEqual(result.completedEventIds, [first.id]);
  assert.equal(result.stoppedAtEventId, second.id);
  assert.equal(result.ledger.activeEventId, second.id);
});

test("이탈 흡수 본문이 여러 사건을 순서대로 실제 성립시키면 마지막 성립 사건까지 연속 봉인한다", () => {
  const first = event("EV_FIRST", 1, { requiredItems: "황동 열쇠" });
  const second = event("EV_SECOND", 2, { requiredItems: "붉은 문서" });
  const third = event("EV_THIRD", 3, { requiredItems: "청동 인장" });
  const fourth = event("EV_FOURTH", 4, { requiredItems: "검은 봉투" });
  const pack = makePack(first, second, third, fourth);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal - 1;
  const result = adjudicateClaudeTurn({
    pack,
    state,
    ledger,
    signals: signals({ eventResolved: true, resolutionSummary: "세 사건이 순서대로 성립했다." }),
    publicText: "떠나려 했지만 마음에 걸려 돌아왔다. 황동 열쇠를 챙겨 EV_FIRST 완료. 이어 붉은 문서를 실제로 받아 EV_SECOND 완료. 그 결과 열린 보관함에서 청동 인장을 챙겨 EV_THIRD 완료.",
    userInput: "모든 일을 생까고 멀리 떠난다",
    canonicalAdvance: false,
    inventoryAfter: ["황동 열쇠", "붉은 문서", "청동 인장"],
  });

  assert.deepEqual(result.completedEventIds, [first.id, second.id, third.id]);
  assert.equal(result.stoppedAtEventId, fourth.id);
  assert.equal(result.ledger.activeEventId, fourth.id);
});

test("Compound의 조기 eventResolved는 현재 비트 전진으로만 처리한다", () => {
  const compound = event("EV_COMPOUND", 1, {
    kind: "compound",
    completionSignals: "복합 사건 완료",
    beats: [
      { id: "B1", order: 1, title: "첫 장면", content: "첫 단서", requiredSignals: "첫 단서 확인" },
      { id: "B2", order: 2, title: "둘째 장면", content: "둘째 단서", requiredSignals: "둘째 단서 확인" },
    ],
  });
  const pack = makePack(compound);
  const state = stateFor(pack);
  const result = adjudicateClaudeTurn({
    pack,
    state,
    ledger: readClaudeRuntime(pack, state, compound.id),
    signals: signals({ eventResolved: true, resolutionSummary: "끝났다." }),
    publicText: "첫 단서 확인이 이루어졌다.",
    userInput: "첫 단서를 확인한다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });

  assert.equal(result.eventCompleted, false);
  assert.equal(result.beatAdvanced, true);
  assert.equal(result.ledger.beat, 1);
  assert.equal(result.ledger.sealed.length, 0);
});

test("4비트 사건은 앞의 세 비트를 자유 진행하고 마지막 비트에서만 한 번 종결한다", () => {
  const compound = event("EV_FOUR_BEATS", 1, {
    kind: "compound",
    completionSignals: "문이 완전히 열렸다",
    beats: [
      { id: "B1", order: 1, title: "탐색", content: "주변 탐색", requiredSignals: "첫 단서" },
      { id: "B2", order: 2, title: "접촉", content: "인물 접촉", requiredSignals: "둘째 단서" },
      { id: "B3", order: 3, title: "압박", content: "갈등 압박", requiredSignals: "셋째 단서" },
      { id: "B4", order: 4, title: "종결", content: "사건 종결", requiredSignals: "마지막 열쇠" },
    ],
  });
  const next = event("EV_NEXT", 2);
  const pack = makePack(compound, next);
  const initialState = stateFor(pack);
  let ledger = readClaudeRuntime(pack, initialState, compound.id);

  for (let beat = 0; beat < 3; beat += 1) {
    assert.equal(claudeClosurePressureActive(compound, ledger), false);
    const result = adjudicateClaudeTurn({
      pack,
      state: { ...initialState, turn: beat },
      ledger,
      signals: signals({ beatAdvanced: false, eventResolved: false }),
      publicText: `자유로운 탐색 장면 ${beat + 1}. ${["첫 단서", "둘째 단서", "셋째 단서"][beat]}가 실제로 확인됐다.`,
      userInput: "현재 장면을 자유롭게 탐색한다",
      canonicalAdvance: false,
      inventoryAfter: [],
    });
    assert.equal(result.eventCompleted, false);
    assert.equal(result.eventCarriedOver, false);
    assert.equal(result.ledger.beat, beat + 1);
    ledger = result.ledger;
  }

  assert.equal(claudeClosurePressureActive(compound, ledger), true);
  const rejectedClosure = adjudicateClaudeTurn({
    pack,
    state: { ...initialState, turn: 3 },
    ledger,
    signals: signals({ beatAdvanced: false, eventResolved: false }),
    publicText: "마지막 비트에서도 문은 아직 닫혀 있었다.",
    userInput: "문 앞의 상황을 지켜본다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });
  assert.equal(rejectedClosure.eventCarriedOver, false);
  assert.equal(rejectedClosure.closureBeatExtended, true);
  assert.equal(rejectedClosure.ledger.activeEventId, compound.id);
  assert.equal(rejectedClosure.ledger.beatTotal, 5);
  assert.equal(rejectedClosure.ledger.sealed.length, 0);
});

test("Compound는 마지막 비트와 사건 계약이 모두 성립해야 봉인된다", () => {
  const compound = event("EV_COMPOUND", 1, {
    kind: "compound",
    completionSignals: "복합 사건 완료",
    beats: [
      { id: "B1", order: 1, title: "첫 장면", content: "첫 단서", requiredSignals: "첫 단서 확인" },
      { id: "B2", order: 2, title: "둘째 장면", content: "둘째 단서", requiredSignals: "둘째 단서 확인" },
    ],
  });
  const pack = makePack(compound);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, compound.id);
  ledger.beat = 1;
  ledger.eventText = "첫 단서 확인";
  const result = adjudicateClaudeTurn({
    pack,
    state,
    ledger,
    signals: signals({
      eventResolved: true,
      resolutionSummary: "한시우는 두 단서가 같은 곳을 가리킨다는 사실을 확인했고, 이제 그 흔적을 따라 다음 장소로 움직일 수 있게 됐다.",
    }),
    publicText: "둘째 단서 확인 뒤 복합 사건 완료가 확정됐다.",
    userInput: "둘째 단서를 확인한다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });

  assert.equal(result.eventCompleted, true);
  assert.deepEqual(result.completedEventIds, [compound.id]);
  assert.equal(result.ledger.sealed[0]?.id, compound.id);
  assert.equal(
    result.ledger.sealed[0]?.closureReason,
    "한시우는 두 단서가 같은 곳을 가리킨다는 사실을 확인했고, 이제 그 흔적을 따라 다음 장소로 움직일 수 있게 됐다.",
  );
});

test("마지막 비트에 들어서면 즉시 결과 수렴·종결 상태가 된다", () => {
  const first = event("EV_STUCK", 1, {
    requiredItems: "현관 열쇠",
    completionSignals: "침입자가 물러났다",
  });
  const second = event("EV_NEXT", 2);
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal - 1;
  ledger.eventTurns = 12;
  ledger.eventText = "현관 열쇠를 손에 쥐었다.";

  const prompt = buildClaudeRuntimePrompt({
    pack,
    state,
    ledger,
    userInput: "문밖의 기척을 살핀다",
    canonicalAdvance: false,
  });
  assert.equal(claudeClosurePressureActive(first, ledger), true);
  assert.equal(prompt.closurePressure.active, true);
  assert.match(prompt.pressure.join(" "), /현재 사건의 마지막 비트/u);
  assert.match(prompt.hardRules.join(" "), /충분히 이어.*임시 종결 비트/u);

  const violations = forcedClaudeClosureViolations({
    turn: { claudeSignals: signals({ beatAdvanced: false, eventResolved: false }) },
    activeEvent: first,
    ledger,
    publicText: "침입자는 다시 문을 두드렸다.",
    inventoryAfter: ["현관 열쇠"],
  });
  assert.ok(violations.some((violation) => /eventResolved=false/u.test(violation)));
  assert.ok(violations.some((violation) => /종결 근거 미성립/u.test(violation)));
});

test("마지막 비트 본문 계약이 모두 성립하면 모델의 false와 무관하게 서버가 종결을 확정할 수 있다", () => {
  const first = event("EV_STUCK", 1, {
    requiredItems: "불탄 고문서 조각",
    completionSignals: "집안에서 바닥이 꺼져 방공호에 도착",
  });
  const pack = makePack(first, event("EV_NEXT", 2));
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal - 1;

  assert.equal(claudeClosureEvidenceSatisfied({
    activeEvent: first,
    ledger,
    publicText: "주차장에서 바닥이 꺼져 오래된 지하공간에 도착했다.",
    inventoryAfter: ["불탄 기록지 조각"],
  }), true);
});

test("강제 종결 턴은 작중 종결 근거가 성립하면 현재 사건만 닫고 다음 사건을 연다", () => {
  const first = event("EV_STUCK", 1, {
    requiredItems: "현관 열쇠",
    completionSignals: "침입자가 물러났다",
  });
  const second = event("EV_NEXT", 2);
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal;
  ledger.eventTurns = 12;
  ledger.eventText = "현관 열쇠를 챙겼다.";
  const publicText = "복도 경보가 울리자 침입자가 물러났다. 그는 계단 아래로 달아났고, 경찰이 현관을 확보해 잠금장치도 다시 닫혔다.";
  const turnSignals = signals({
    beatAdvanced: true,
    eventResolved: true,
    resolutionSummary: "경찰이 현관을 확보하고 침입자가 퇴각해 집 안의 대치가 끝났다.",
  });

  assert.deepEqual(forcedClaudeClosureViolations({
    turn: { claudeSignals: turnSignals },
    activeEvent: first,
    ledger,
    publicText,
    inventoryAfter: ["현관 열쇠"],
  }), []);
  const result = adjudicateClaudeTurn({
    pack,
    state,
    ledger,
    signals: turnSignals,
    publicText,
    userInput: "문밖의 기척을 살핀다",
    canonicalAdvance: false,
    inventoryAfter: ["현관 열쇠"],
  });
  assert.equal(result.eventCompleted, true);
  assert.equal(result.ledger.activeEventId, second.id);
  assert.deepEqual(result.completedEventIds, [first.id]);
});

test("확장된 마지막 본문에도 계약이 남으면 현재 사건에 임시 종결 비트를 추가한다", () => {
  const first = event("EV_STUCK", 1, {
    requiredItems: "현관 열쇠",
    completionSignals: "침입자가 물러났다",
  });
  const second = event("EV_NEXT", 2);
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal;
  ledger.eventTurns = 12;

  const result = adjudicateClaudeTurn({
    pack,
    state,
    ledger,
    signals: signals({
      eventResolved: true,
      resolutionSummary: "현관 대치의 종결을 시도했지만 침입자는 시야 밖으로 물러나 결과 확인이 남았다.",
    }),
    publicText: "경보음이 울리자 복도의 발소리가 멀어졌다.",
    userInput: "문밖의 기척을 살핀다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });

  assert.equal(result.eventCompleted, false);
  assert.equal(result.eventCarriedOver, false);
  assert.equal(result.closureBeatExtended, true);
  assert.equal(result.completionRejected, true);
  assert.deepEqual(result.completedEventIds, []);
  assert.equal(result.ledger.activeEventId, first.id);
  assert.equal(result.ledger.sealed.length, 0);
  assert.equal(result.ledger.manualCarryover, null);
  assert.equal(result.ledger.closureExtensionCount, 1);
  assert.equal(result.ledger.beatTotal, ledger.beatTotal + 1);
  assert.equal(result.ledger.beat, result.ledger.beatTotal - 1);
  assert.match(result.reason, /임시 종결 비트 1개 추가/u);
  const extensionPrompt = buildClaudeRuntimePrompt({
    pack,
    state: { ...state, turn: state.turn + 1 },
    ledger: result.ledger,
    userInput: "밤새도록 피시방에 틀어박혀 있겠다",
    canonicalAdvance: false,
  });
  assert.match(extensionPrompt.pressure.join(" "), /정사 강제 흡수/u);
  assert.match(String(extensionPrompt.derailment.policy), /스스로 마음을 돌리는 과정/u);
  assert.match(extensionPrompt.hardRules.join(" "), /현재 사건을 반드시 종결/u);
});

test("임시 종결 비트에도 계약이 남으면 최종 강제 종결 턴을 한 번 더 추가한다", () => {
  const first = event("EV_STUCK_TWICE", 1, { requiredItems: "현관 열쇠" });
  const second = event("EV_AFTER_STUCK", 2);
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal;
  const temporary = adjudicateClaudeTurn({
    pack,
    state,
    ledger,
    signals: signals({ eventResolved: true, resolutionSummary: "현관 수색을 이어 갔지만 열쇠의 위치는 아직 확인하지 못했다." }),
    publicText: "서랍을 모두 열어 보았지만 현관 열쇠는 보이지 않았다.",
    userInput: "계속 찾는다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });
  const finalExtension = adjudicateClaudeTurn({
    pack,
    state: { ...state, turn: state.turn + 1 },
    ledger: temporary.ledger,
    signals: signals({ eventResolved: true, resolutionSummary: "다시 수색했지만 열쇠를 찾지 못해 현관을 닫지 못했다." }),
    publicText: "문갑까지 살폈지만 열쇠는 없었다.",
    userInput: "밖으로 나가 버린다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });

  assert.equal(finalExtension.eventCompleted, false);
  assert.equal(finalExtension.closureBeatExtended, true);
  assert.equal(finalExtension.ledger.closureExtensionCount, 2);
  assert.match(finalExtension.reason, /최종 강제 종결 턴 1개 추가/u);
});

test("추가된 종결 전용 비트에서 남은 결과를 성립시키면 현재 사건을 닫고 다음 사건을 연다", () => {
  const first = event("EV_STUCK", 1, { requiredItems: "현관 열쇠" });
  const second = event("EV_NEXT", 2);
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  ledger.beat = ledger.beatTotal;
  const extended = adjudicateClaudeTurn({
    pack,
    state,
    ledger,
    signals: signals({ eventResolved: true, resolutionSummary: "첫 사건의 종결을 시도했지만 열쇠는 발견되지 않았다." }),
    publicText: "현관 수색은 여기서 끝났고 다음 연락이 도착했다.",
    userInput: "수색을 끝낸다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });
  const nextState = { ...state, turn: state.turn + 1 };
  const next = adjudicateClaudeTurn({
    pack,
    state: nextState,
    ledger: extended.ledger,
    signals: signals({ eventResolved: true, resolutionSummary: "현관 열쇠를 찾아 잠금을 복구하고 수색을 마쳤다." }),
    publicText: "서랍 아래에서 현관 열쇠를 찾아 잠금을 복구했고, EV_STUCK 완료를 확인하며 현관 수색을 마쳤다.",
    userInput: "정사대로 이어서 진행",
    canonicalAdvance: true,
    inventoryAfter: ["현관 열쇠"],
  });

  assert.equal(next.eventCompleted, true);
  assert.equal(next.ledger.activeEventId, second.id);
  assert.equal(next.ledger.manualCarryover, null);
  assert.equal(next.ledger.closureExtensionCount, 0);
});

test("이월 조건이 8턴 안에 성립하지 않으면 미발생 사실로 포기 처리한다", () => {
  const first = event("EV_FIRST", 1, { requiredDialogue: "문을 열어 주세요" });
  const second = event("EV_SECOND", 2);
  const pack = makePack(first, second);
  const initialState = stateFor(pack);
  const closed = closeClaudeEventManually(pack, initialState);
  const ledger = readClaudeRuntime(pack, closed.state);
  assert.ok(ledger.manualCarryover);
  ledger.manualCarryover!.ageTurns = 7;

  const result = adjudicateClaudeTurn({
    pack,
    state: { ...closed.state, turn: initialState.turn + 7 },
    ledger,
    signals: signals({ beatAdvanced: false, eventResolved: false }),
    publicText: "현재 사건의 조사만 이어졌다.",
    userInput: "조사를 계속한다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });

  assert.equal(result.ledger.manualCarryover, null);
  const sealed = result.ledger.sealed.find((entry) => entry.id === first.id);
  assert.equal(sealed?.carryoverItems?.[0]?.status, "abandoned");
  assert.match(sealed?.carryoverResolution ?? "", /성립하지 않은.*일어난 사실처럼 참조하지 않는다/u);
  assert.equal(result.ledger.activeEventId, second.id);
});

test("사건 탭의 비트 +1은 API 본문 없이 활성 비트 원장만 한 칸 전진시킨다", () => {
  const first = event("EV_FIRST", 1, {
    kind: "compound",
    beats: [
      { id: "B1", order: 1, title: "첫 장면", content: "첫 단서" },
      { id: "B2", order: 2, title: "둘째 장면", content: "둘째 단서" },
      { id: "B3", order: 3, title: "마지막 장면", content: "마지막 단서" },
    ],
  });
  const pack = makePack(first, event("EV_SECOND", 2));
  const state = stateFor(pack);
  const advanced = advanceClaudeBeatManually(pack, state);
  const ledger = readClaudeRuntime(pack, advanced.state);

  assert.equal(advanced.changed, true);
  assert.equal(ledger.activeEventId, first.id);
  assert.equal(ledger.beat, 1);
  assert.equal(ledger.beatTotal, 3);
  assert.equal(ledger.sealed.length, 0);
  assert.match(ledger.lastAdjudication, /사용자 수동 비트 전진/u);
});

test("지금 종결은 미성립 조건을 숨기지 않고 직접 봉인 사유와 시점을 남긴다", () => {
  const first = event("EV_FIRST", 1, {
    onSuccess: "한시우는 책상 위 단서를 확인하고 어디부터 다시 살필지 선택할 수 있게 됐다.",
    requiredItems: "황동 열쇠",
    completionSignals: "문이 열렸다",
  });
  const second = event("EV_SECOND", 2);
  const pack = makePack(first, second);
  const state = stateFor(pack);
  const closed = closeClaudeEventManually(pack, state);
  const ledger = readClaudeRuntime(pack, closed.state);
  const sealed = ledger.sealed[0];

  assert.equal(closed.changed, true);
  assert.equal(ledger.activeEventId, second.id);
  assert.equal(sealed?.id, first.id);
  assert.equal(sealed?.status, "manually_closed");
  assert.deepEqual(sealed?.missing, [
    '필수 물품 "황동 열쇠"',
    '종결 신호 "문이 열렸다"',
  ]);
  assert.match(sealed?.closureReason ?? "", /황동 열쇠/u);
  assert.match(sealed?.closureReason ?? "", /뒤이어 벌어질 상황/u);
  assert.doesNotMatch(sealed?.closureReason ?? "", /필수 조건|봉인|사건 탭/u);
  assert.equal(ledger.manualCarryover?.sourceEventId, first.id);
  assert.deepEqual(ledger.manualCarryover?.missing, sealed?.missing);
  assert.equal(ledger.manualCloseCooldownEventId, second.id);
  assert.equal(sealed?.closedAtTurn, state.turn);
  assert.equal(sealed?.closedAtTime, "09:00");
  assert.equal(sealed?.closedAtLocation, "현재 장소");
});

test("직접 종결의 미완료 조건은 다음 사건에 이월되고 두 사건 연속 직접 종결은 막힌다", () => {
  const first = event("EV_FIRST", 1, {
    requiredItems: "황동 열쇠",
    completionSignals: "문이 열렸다",
  });
  const second = event("EV_SECOND", 2);
  const third = event("EV_THIRD", 3);
  const pack = makePack(first, second, third);
  const initialState = stateFor(pack);
  const firstClosed = closeClaudeEventManually(pack, initialState);
  const afterCloseLedger = readClaudeRuntime(pack, firstClosed.state);
  const prompt = buildClaudeRuntimePrompt({
    pack,
    state: firstClosed.state,
    ledger: afterCloseLedger,
    userInput: "다음 상황을 살핀다",
    canonicalAdvance: false,
  });

  assert.equal(prompt.manualCarryover?.sourceEventName, first.name);
  assert.match(String(prompt.manualCarryover?.policy), /현재 활성 사건/u);
  const consecutiveAttempt = closeClaudeEventManually(pack, firstClosed.state);
  assert.equal(consecutiveAttempt.changed, false);
  assert.match(consecutiveAttempt.message, /두 사건 연속/u);

  const carryoverTurn = adjudicateClaudeTurn({
    pack,
    state: firstClosed.state,
    ledger: afterCloseLedger,
    signals: signals({ beatAdvanced: false, eventResolved: false }),
    publicText: "뒤늦게 도착한 황동 열쇠를 받아 들자 닫혀 있던 문이 열렸다.",
    userInput: "이어진 일을 확인한다",
    canonicalAdvance: false,
    inventoryAfter: ["황동 열쇠"],
  });
  assert.equal(carryoverTurn.ledger.manualCarryover, null);
  assert.match(
    carryoverTurn.ledger.sealed[0]?.carryoverResolution ?? "",
    /황동 열쇠.*문이 열렸다.*마무리/u,
  );
  assert.equal(carryoverTurn.ledger.manualCloseCooldownEventId, second.id);

  const afterCarryoverState: RuntimeState = {
    ...firstClosed.state,
    turn: initialState.turn + 1,
    inventory: ["황동 열쇠"],
    variables: [{
      ...claudeRuntimeVariable(carryoverTurn.ledger),
      status: "active",
      createdTurn: initialState.turn,
    }],
  };
  assert.equal(closeClaudeEventManually(pack, afterCarryoverState).changed, false);

  carryoverTurn.ledger.beat = carryoverTurn.ledger.beatTotal - 1;
  const secondCompleted = adjudicateClaudeTurn({
    pack,
    state: afterCarryoverState,
    ledger: carryoverTurn.ledger,
    signals: signals({
      eventResolved: true,
      resolutionSummary: "두 사람은 뒤늦은 전달을 확인하고 다음 목적지를 정할 수 있게 됐다.",
    }),
    publicText: "EV_SECOND 완료",
    userInput: "현재 일을 마무리한다",
    canonicalAdvance: false,
    inventoryAfter: ["황동 열쇠"],
  });
  assert.equal(secondCompleted.eventCompleted, true);
  assert.equal(secondCompleted.ledger.activeEventId, third.id);
  assert.equal(secondCompleted.ledger.manualCloseCooldownEventId, "");
});

test("이월 조건은 서로 다른 턴의 문장 조각을 합쳐 허위 충족하지 않는다", () => {
  const first = event("EV_FIRST", 1, {
    requiredDialogue: "문을 열어 주세요",
  });
  const second = event("EV_SECOND", 2);
  const pack = makePack(first, second);
  const initialState = stateFor(pack);
  const closed = closeClaudeEventManually(pack, initialState);
  const firstLedger = readClaudeRuntime(pack, closed.state);
  const firstFragment = adjudicateClaudeTurn({
    pack,
    state: closed.state,
    ledger: firstLedger,
    signals: signals({ beatAdvanced: false, eventResolved: false }),
    publicText: "그는 문을 열어, 하고 말끝을 흐렸다.",
    userInput: "말을 건다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });
  assert.equal(
    firstFragment.ledger.manualCarryover?.missing.some((requirement) =>
      requirement.includes("문을 열어 주세요")
    ),
    true,
  );

  const nextState: RuntimeState = {
    ...closed.state,
    turn: closed.state.turn + 1,
  };
  const secondFragment = adjudicateClaudeTurn({
    pack,
    state: nextState,
    ledger: firstFragment.ledger,
    signals: signals({ beatAdvanced: false, eventResolved: false }),
    publicText: "그가 뒤늦게 '주세요'라고 덧붙였다.",
    userInput: "말을 마저 한다",
    canonicalAdvance: false,
    inventoryAfter: [],
  });
  assert.equal(
    secondFragment.ledger.manualCarryover?.missing.some((requirement) =>
      requirement.includes("문을 열어 주세요")
    ),
    true,
  );
  assert.equal(secondFragment.ledger.manualCarryover?.ageTurns, 2);
  assert.equal(
    secondFragment.ledger.sealed[0]?.carryoverItems
      ?.find((item) => item.requirement.includes("문을 열어 주세요"))?.status,
    "pending",
  );
});

test("Claude 출력 계약의 시각·장소 불일치와 Compound 조기 종결을 재작성 대상으로 잡는다", () => {
  const compound = event("EV_COMPOUND", 1, {
    kind: "compound",
    beats: [
      { id: "B1", order: 1, title: "첫 장면", content: "첫 단서" },
      { id: "B2", order: 2, title: "둘째 장면", content: "둘째 단서" },
    ],
  });
  const pack = makePack(compound);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, compound.id);
  const violations = claudeSignalViolations({
    turn: {
      statePatch: { time: "09:05", location: "현재 장소" },
      chronologyConflict: "본문 시각 08:00이 현재 원장보다 과거다.",
      claudeSignals: signals({
        sceneTime: "10:00",
        location: "다른 장소",
        eventResolved: true,
        resolutionSummary: "끝났다.",
      }),
    },
    activeEvent: compound,
    ledger,
    expectedDerailment: false,
  });

  assert.ok(violations.some((violation) => /sceneTime/u.test(violation)));
  assert.ok(violations.some((violation) => /location/u.test(violation)));
  assert.ok(violations.some((violation) => /Compound/u.test(violation)));
  assert.ok(violations.some((violation) => /시간 원장 충돌/u.test(violation)));
});

test("Claude 권위 원장은 일반 변수 제한을 넘어도 세션에 남는다", () => {
  const first = event("EV_FIRST", 1);
  const pack = makePack(first);
  const state = stateFor(pack);
  const ledger = readClaudeRuntime(pack, state, first.id);
  const noisyState: RuntimeState = {
    ...state,
    variables: Array.from({ length: 24 }, (_, index) => ({
      id: `NOISE_${index}`,
      label: `noise ${index}`,
      detail: "noise",
      visibility: "hidden" as const,
      reason: "test",
      status: "active" as const,
      createdTurn: index,
    })),
  };
  const next = applyStatePatch(noisyState, {
    time: "09:05",
    location: "현재 장소",
    sceneSummary: "진행",
    statusAdd: [],
    statusRemove: [],
    inventoryAdd: [],
    inventoryRemove: [],
    relationChanges: [],
    clockChanges: [],
    memoryAdd: [],
    variablesAdd: [claudeRuntimeVariable(ledger)],
    variablesResolve: [],
    characterVisualsAdd: [],
    encounteredCharactersAdd: [],
    statusLedgerChanges: [],
    autonomyActions: [],
    relationshipMemoriesAdd: [],
    relationshipMemoryResolveIds: [],
  }, pack);

  assert.ok(next.variables.some((variable) => variable.id === CLAUDE_RUNTIME_VARIABLE_ID));
});
