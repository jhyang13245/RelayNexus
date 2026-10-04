import assert from "node:assert/strict";
import test from "node:test";

import { futureEventGuardTerms } from "../lib/future-event-guard";
import type { ScenarioEvent, ScenarioPack } from "../lib/scenario";
import { demoScenario } from "./fixtures/legacy-demo-scenario";

const event = (id: string, sequence: number, extras: Partial<ScenarioEvent> = {}): ScenarioEvent => ({
  id,
  name: `${id} 사건`,
  type: "Story",
  visibility: "Hidden",
  status: sequence === 1 ? "Active" : "Pending",
  priority: 50,
  conditions: "",
  description: "",
  sequence,
  ...extras,
});

test("all beats guard the next three events using items, completion signals and effects", () => {
  const current = event("CURRENT", 1, {
    requiredDialogue: "감독관을 만나러 가자",
  });
  const next = event("NEXT", 2, {
    requiredItems: "은빛 출입증",
    completionSignals: "봉인실 문이 실제로 열림",
    effects: "지하 회랑의 경보가 울린다.",
  });
  const fourth = event("FOURTH", 4, { requiredItems: "세 번째 열쇠" });
  const fifth = event("FIFTH", 5, { requiredItems: "범위 밖 왕관" });
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-FUTURE-GUARD",
    events: [current, next, event("THIRD", 3), fourth, fifth],
  } satisfies ScenarioPack;
  const terms = futureEventGuardTerms({ pack, activeEventId: current.id });
  assert.ok(terms.includes("은빛 출입증"));
  assert.ok(terms.includes("봉인실 문이 실제로 열림"));
  assert.ok(terms.includes("지하 회랑의 경보가 울린다"));
  assert.ok(terms.includes("세 번째 열쇠"));
  assert.equal(terms.includes("범위 밖 왕관"), false);
});

test("current-event handoff contract remains legal and already observed phrases are not re-blocked", () => {
  const current = event("CURRENT", 1, {
    requiredDialogue: "감독관을 만나러 가자|성당으로 이동하자",
  });
  const next = event("NEXT", 2, {
    requiredDialogue: "감독관을 만나러 가자",
    completionSignals: "성당 도착 뒤 새 심문이 시작됨",
    requiredItems: "이미 공개된 표식",
  });
  const pack = { ...demoScenario, events: [current, next] } satisfies ScenarioPack;
  const terms = futureEventGuardTerms({
    pack,
    activeEventId: current.id,
    observedText: "그들은 이미 공개된 표식을 확인했다.",
  });
  assert.equal(terms.includes("감독관을 만나러 가자"), false);
  assert.equal(terms.includes("이미 공개된 표식"), false);
  assert.ok(terms.includes("성당 도착 뒤 새 심문이 시작됨"));
});

test("final closure permits only the nearest event opening vocabulary and still guards its payoff", () => {
  const current = event("CURRENT", 1);
  const next = event("NEXT", 2, {
    name: "오후의 도착 알림",
    requiredItems: "푸른 보관함 열쇠",
    requiredDialogue: "접수 직원의 도착 안내",
    completionSignals: "보관함을 열어 문서를 실제로 획득",
    effects: "문서의 봉인이 완전히 해제된다.",
  });
  const later = event("LATER", 3, { requiredItems: "먼 훗날의 증표" });
  const pack = { ...demoScenario, events: [current, next, later] } satisfies ScenarioPack;
  const terms = futureEventGuardTerms({
    pack,
    activeEventId: current.id,
    allowNextEventOpening: true,
  });
  assert.equal(terms.includes("오후의 도착 알림"), false);
  assert.equal(terms.includes("푸른 보관함 열쇠"), false);
  assert.equal(terms.includes("접수 직원의 도착 안내"), false);
  assert.ok(terms.includes("보관함을 열어 문서를 실제로 획득"));
  assert.ok(terms.includes("문서의 봉인이 완전히 해제된다"));
  assert.ok(terms.includes("먼 훗날의 증표"));
});
