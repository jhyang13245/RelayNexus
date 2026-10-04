import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveNarrativeSceneContract,
  inputContainsSpeech,
  inputContainsExecutedMovement,
  narrativeSceneContractPrompt,
} from "../lib/narrative-kernel";

test("준비·이동·재회·대화 복합 입력을 선언 순서의 장면 계약으로 만든다", () => {
  const contract = deriveNarrativeSceneContract(
    "황동열쇠를 책상에 남겨 두고 낡은 우산과 함께 잠깐 편의점에 들르기로 한다. 그곳에서 낮에 본 나디아와 재회한다. 한시우는 그녀에게 말을 건다.",
  );

  assert.equal(contract.compound, true);
  assert.equal(contract.hasMovement, true);
  assert.equal(contract.hasEncounter, true);
  assert.equal(contract.hasSpeech, true);
  assert.equal(contract.destinationEncounter, true);
  assert.deepEqual(
    contract.clauses.map((clause) => clause.kind),
    ["prepare", "move", "encounter", "speak"],
  );
  assert.deepEqual(
    contract.clauses.map((clause) => clause.authority),
    ["player", "player", "world", "player"],
  );
  assert.match(narrativeSceneContractPrompt(contract), /출발·경로 또는 수단·경과 시간·도착/u);
  assert.match(narrativeSceneContractPrompt(contract), /부재·착각·엇갈림/u);
});

test("과잉 행동은 이동이 아니라 시도·반응·비용 계약으로 분류한다", () => {
  const contract = deriveNarrativeSceneContract(
    "등굣길에 보이는 사람을 모두 희롱하면서 간다.",
  );

  assert.equal(contract.hasOverreach, true);
  assert.equal(contract.clauses[0]?.kind, "overreach");
  assert.equal(contract.clauses[0]?.authority, "mixed");
  assert.match(contract.clauses[0]?.completionRule ?? "", /직접 반응.*현실적인 비용/u);
});

test("단순한 세계 결과 선언은 모델이 성립 여부를 판정하게 한다", () => {
  const contract = deriveNarrativeSceneContract(
    "경비가 출입을 허락하고 안으로 들여보내 준다.",
  );

  assert.equal(contract.clauses[0]?.authority, "world");
  assert.match(contract.clauses[0]?.completionRule ?? "", /성립 또는 불성립/u);
});

test("인사·두려움 설명·장시간 동행 부탁을 이동이나 사물 행동이 아닌 대화로 판정한다", () => {
  const input = "아.. 안녕하세요. 죄송한데 제가 오늘 이상한 메모를 받고 지금 살짝 두려움에 휩싸여 있는 상태여서 오늘 밤까지만 저와 시간을 보내주시면 안될까요? 부탁드립니다.";
  const contract = deriveNarrativeSceneContract(input);

  assert.equal(inputContainsSpeech(input), true);
  assert.equal(contract.hasSpeech, true);
  assert.equal(contract.hasMovement, false);
  assert.ok(contract.clauses.some((clause) => clause.kind === "speak"));
  assert.ok(contract.clauses.every((clause) => clause.kind !== "move"));
  assert.match(narrativeSceneContractPrompt(contract), /상대가 이해한 직접 반응 또는 답/u);
});

test("조사 가 포함된 제가를 이동 동사로 오인하지 않는다", () => {
  const contract = deriveNarrativeSceneContract(
    "제가 손에 든 메모를 다시 읽고 생각을 정리한다.",
  );

  assert.equal(contract.hasMovement, false);
});

test("부정·조건·회상·전언 속 이동은 현재 실행으로 올리지 않는다", () => {
  const examples = [
    ["편의점에 갈까 생각했지만 가지 않았다.", "negated"],
    ["비가 그치면 편의점에 가겠다.", "conditional"],
    ["어제 편의점에 갔던 일을 떠올린다.", "recalled"],
    ["나디아가 편의점에 갔다고 들었다.", "reported"],
  ] as const;

  for (const [input, mode] of examples) {
    const contract = deriveNarrativeSceneContract(input);
    assert.equal(contract.hasMovement, false, input);
    assert.equal(inputContainsExecutedMovement(input), false, input);
    assert.equal(contract.clauses[0]?.mode, mode, input);
  }
});

test("도구로 대상에 변화를 만든 sceneFact도 직접 장면 계약으로 판정한다", () => {
  const contract = deriveNarrativeSceneContract(
    "한시우는 라이터로 종이를 불태워 없앤다. 그것은 실제로 잠시나마 효과가 있었다.",
  );

  assert.equal(contract.requiresDirectScene, true);
  assert.ok(contract.clauses.some((clause) =>
    clause.kind === "act" && clause.authority === "player" && clause.mode === "execution"
  ));
  assert.match(narrativeSceneContractPrompt(contract), /관측 가능한 실행 결과/u);
  assert.ok(contract.policy.some((rule) => /연소.*즉시 효과/u.test(rule)));
});
