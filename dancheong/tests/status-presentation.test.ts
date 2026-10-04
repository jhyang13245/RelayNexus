import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompactStatusView,
  buildDetailedStatusView,
} from "../lib/status-presentation";
import type { PublicStatusSnapshot } from "../lib/scenario";

const snapshot = (overrides: Partial<PublicStatusSnapshot> = {}): PublicStatusSnapshot => ({
  turn: 1,
  title: "Live Status",
  displayMode: "full",
  defaultExpanded: true,
  day: 0,
  date: "2042-03-02",
  weekday: "월요일",
  time: "09:00",
  weather: "맑음",
  location: "강의실",
  sections: [],
  relations: [],
  worldTraces: [],
  changedCount: 0,
  ...overrides,
});

test("compact status localizes common English labels and limits the list", () => {
  const view = buildCompactStatusView(snapshot({
    sections: [{
      id: "profile",
      label: "Profile",
      icon: "profile",
      items: [
        { id: "affiliation", label: "Affiliation", kind: "text", icon: "", value: "시계탑", displayValue: "시계탑", grade: "", reason: "" },
        { id: "condition", label: "Condition", kind: "text", icon: "", value: "healthy", displayValue: "healthy", grade: "", reason: "" },
        { id: "skills", label: "Skills", kind: "list", icon: "", value: ["강화"], displayValue: "강화", grade: "", reason: "" },
        { id: "inventory", label: "Inventory", kind: "list", icon: "", value: ["휴대전화"], displayValue: "휴대전화", grade: "", reason: "" },
        { id: "luck", label: "Luck", kind: "number", icon: "", value: 20, displayValue: "20", grade: "", reason: "" },
        { id: "reputation", label: "Reputation", kind: "number", icon: "", value: 1, displayValue: "1", grade: "", reason: "" },
      ],
    }],
  }), 5);

  assert.deepEqual(view.items.map((item) => item.label), [
    "소속",
    "상태",
    "스킬",
    "소지품",
    "행운",
  ]);
  assert.equal(view.items[1]?.displayValue, "양호");
});

test("compact status hides plot-forward fields and omits unknown English labels", () => {
  const view = buildCompactStatusView(snapshot({
    sections: [{
      id: "story",
      label: "Story",
      icon: "",
      items: [
        { id: "objective", label: "Next Objective", kind: "text", icon: "", value: "성배를 찾는다", displayValue: "성배를 찾는다", grade: "", reason: "" },
        { id: "identity", label: "Servant Contract", kind: "text", icon: "", value: "세이버의 마스터", displayValue: "세이버의 마스터", grade: "", reason: "" },
        { id: "unknown", label: "Foreshadowing Meter", kind: "number", icon: "", value: 3, displayValue: "3", grade: "", reason: "" },
        { id: "condition", label: "상태", kind: "text", icon: "", value: "정상", displayValue: "정상", grade: "", reason: "" },
      ],
    }],
  }));

  assert.deepEqual(view.items.map((item) => item.label), ["상태"]);
});

test("compact status localizes relationship types and limits met characters", () => {
  const view = buildCompactStatusView(snapshot({
    relations: [
      { characterId: "a", name: "A", relationType: "ally", trust: 12, delta: 2, reasonTitle: "", reasonSummary: "" },
      { characterId: "b", name: "B", relationType: "rival", trust: -3, delta: 0, reasonTitle: "", reasonSummary: "" },
      { characterId: "c", name: "C", relationType: "friend", trust: 20, delta: 1, reasonTitle: "", reasonSummary: "" },
      { characterId: "d", name: "D", relationType: "enemy", trust: -20, delta: -1, reasonTitle: "", reasonSummary: "" },
    ],
  }), 5, 3);

  assert.deepEqual(view.relations.map((relation) => relation.relationType), [
    "동료",
    "경쟁",
    "친구",
  ]);
});

test("detailed status groups the six HUD sections without exposing plot fields", () => {
  const view = buildDetailedStatusView(snapshot({
    sections: [
      {
        id: "ability",
        label: "Ability",
        icon: "spark",
        items: [
          { id: "ability_summary", label: "능력 설명", kind: "text", icon: "", value: "지형과 위험 신호를 빠르게 파악한다.", displayValue: "지형과 위험 신호를 빠르게 파악한다.", grade: "", reason: "" },
          { id: "next_objective", label: "다음 목표", kind: "text", icon: "", value: "성당으로 간다", displayValue: "성당으로 간다", grade: "", reason: "" },
        ],
      },
      {
        id: "core_stats",
        label: "Core Stats",
        icon: "gauge",
        items: [
          { id: "health", label: "체력", kind: "number", icon: "", value: 85, displayValue: "85", grade: "A", maximum: 100, reason: "" },
        ],
      },
      {
        id: "resources",
        label: "Resources",
        icon: "gem",
        items: [
          { id: "command_seals", label: "령주", kind: "number", icon: "", value: 3, displayValue: "3", grade: "", reason: "" },
          { id: "magic_gems", label: "보석", kind: "number", icon: "", value: 0, displayValue: "0", grade: "", reason: "" },
          { id: "magic_weapons", label: "마술무기", kind: "number", icon: "", value: 0, displayValue: "0", grade: "", reason: "" },
        ],
      },
      {
        id: "condition",
        label: "Condition",
        icon: "pulse",
        items: [
          { id: "condition_summary", label: "현재 상태", kind: "text", icon: "", value: "가벼운 피로 외에는 이상이 없다.", displayValue: "가벼운 피로 외에는 이상이 없다.", grade: "", reason: "" },
        ],
      },
      {
        id: "funds",
        label: "자금",
        icon: "wallet",
        items: [
          { id: "funds", label: "자금", kind: "number", icon: "", value: 35000, displayValue: "35000", grade: "", reason: "" },
        ],
      },
    ],
  }));

  assert.equal(view.ability?.id, "ability_summary");
  assert.deepEqual(view.stats.map((item) => item.id), ["health"]);
  assert.deepEqual(view.resources.map((item) => item.id), [
    "command_seals",
    "magic_gems",
    "magic_weapons",
  ]);
  assert.equal(view.condition?.id, "condition_summary");
  assert.equal(view.funds?.value, 35000);
  assert.equal(view.stats.some((item) => item.id === "next_objective"), false);
  assert.equal(view.stats[0]?.displayValue, "85");
});

test("detailed status preserves work-specific resource names, icons, and units", () => {
  const view = buildDetailedStatusView(snapshot({
    sections: [
      {
        id: "resources",
        label: "Resources",
        icon: "spark",
        items: [
          { id: "reactor_cells", label: "반응로 셀", kind: "number", icon: "spark", unit: "기", value: 4, displayValue: "4", grade: "", reason: "" },
          { id: "star_crystals", label: "성운 결정", kind: "number", icon: "crystal", unit: "개", value: 2, displayValue: "2", grade: "", reason: "" },
        ],
      },
      {
        id: "funds",
        label: "Funds",
        icon: "wallet",
        items: [
          { id: "funds", label: "함선 크레딧", kind: "number", icon: "wallet", unit: "C", value: 1250, displayValue: "1250", grade: "", reason: "" },
        ],
      },
    ],
  }));

  assert.deepEqual(view.resources.map((item) => item.label), ["반응로 셀", "성운 결정"]);
  assert.deepEqual(view.resources.map((item) => item.icon), ["spark", "crystal"]);
  assert.deepEqual(view.resources.map((item) => item.unit), ["기", "개"]);
  assert.equal(view.funds?.label, "함선 크레딧");
  assert.equal(view.funds?.unit, "C");
});
