import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "./fixtures/legacy-demo-scenario";
import {
  analyzeSceneFocus,
  assessSceneFocus,
  type SceneFocusRecentTurn,
} from "../lib/scene-focus";

const supportTurn = (
  turn: number,
  speakerName: string,
  text = "확인을 위해 다른 담당자에게 다시 문의해 주세요.",
): SceneFocusRecentTurn => ({
  turn,
  location: "대학교 시설관리실 앞",
  blocks: [
    {
      type: "dialogue",
      text,
      speakerId: `dynamic-support-${turn}`,
      speakerName,
    },
  ],
});

test("시설·지원 인력이 두 턴 연속 장면을 점유하면 인계를 요구한다", () => {
  const focus = analyzeSceneFocus({
    pack: demoScenario,
    recentTurns: [
      supportTurn(1, "시설관리 직원"),
      supportTurn(2, "학생지원실 직원"),
    ],
  });

  assert.equal(focus.level, "handoff");
  assert.equal(focus.requireHandoff, true);
  assert.equal(focus.consecutiveTurns, 2);
  assert.match(focus.directives.join(" "), /역할과 예산은 끝났다/);
});

test("패키지 별칭 화자는 보조 인력이 아니라 같은 주요 인물로 판정한다", () => {
  const major = {
    ...demoScenario.npcs[0],
    id: "NPC_VISITOR_RESEARCHER",
    name: "나디아 알 하다드",
    aliases: ["방문 연구자", "낮에 마주친 외국인 연구자"],
    role: "방문 연구자",
  };
  const pack = { ...demoScenario, npcs: [major] };
  const focus = analyzeSceneFocus({
    pack,
    recentTurns: [
      supportTurn(1, "시설관리 직원"),
      supportTurn(2, "학생지원실 직원"),
    ],
  });
  const assessment = assessSceneFocus({
    pack,
    state: { location: "대학교 별관 앞" },
    focus,
    turn: {
      blocks: [{
        type: "dialogue",
        text: "별관 위치를 확인하고 있었습니다.",
        speakerId: "dynamic-visiting-researcher",
        speakerName: "방문 연구자",
      }],
      statePatch: {},
    },
  });

  assert.equal(assessment.packageCharacterTookLead, true);
  assert.equal(assessment.handoffOccurred, true);
  assert.equal(assessment.needsCorrection, false);
});

test("담당자 이름만 바꾼 장기 기존 세션은 즉시 탈출 단계가 된다", () => {
  const focus = analyzeSceneFocus({
    pack: demoScenario,
    recentTurns: [
      supportTurn(1, "시설관리 직원"),
      supportTurn(2, "당직 관리인"),
      supportTurn(3, "학생지원실 직원"),
      supportTurn(4, "택배 담당 직원"),
    ],
  });

  assert.equal(focus.level, "breakout");
  assert.equal(focus.recentTurnCount, 4);
  assert.ok(focus.blockedRecommendationTerms.includes("관리실"));
});

test("보조 직원이 설명과 질문을 계속하면 재작성 대상으로 잡는다", () => {
  const focus = analyzeSceneFocus({
    pack: demoScenario,
    recentTurns: [
      supportTurn(1, "시설관리 직원"),
      supportTurn(2, "학생지원실 직원"),
      supportTurn(3, "당직 관리인"),
    ],
  });
  const assessment = assessSceneFocus({
    pack: demoScenario,
    state: { location: "대학교 시설관리실 앞" },
    focus,
    turn: {
      blocks: [
        {
          type: "dialogue",
          text: "기록을 한 번 더 확인해야 합니다.",
          speakerId: "dynamic-facility-a",
          speakerName: "시설관리 직원",
        },
        {
          type: "dialogue",
          text: "오후 담당자가 오면 다시 문의하세요.",
          speakerId: "dynamic-facility-b",
          speakerName: "관리실 당직자",
        },
      ],
      statePatch: { location: "대학교 시설관리실 앞" },
    },
  });

  assert.equal(assessment.supportingCastStillLeads, true);
  assert.equal(assessment.needsCorrection, true);
});

test("패키지 주요 인물이 장면을 이어받으면 보조 인물 루프를 종료한다", () => {
  const majorNpc = demoScenario.npcs[0];
  const focus = analyzeSceneFocus({
    pack: demoScenario,
    recentTurns: [
      supportTurn(1, "시설관리 직원"),
      supportTurn(2, "학생지원실 직원"),
      supportTurn(3, "당직 관리인"),
    ],
  });
  const assessment = assessSceneFocus({
    pack: demoScenario,
    state: { location: "대학교 시설관리실 앞" },
    focus,
    turn: {
      blocks: [
        {
          type: "narration",
          text: "직원은 업무로 복귀했다. 복도 끝에서 익숙한 학생이 급히 다가왔다.",
        },
        {
          type: "dialogue",
          text: "여기서 뭘 하고 있어? 당장 보여 줄 게 있어.",
          speakerId: majorNpc.id,
          speakerName: majorNpc.name,
        },
      ],
      statePatch: { location: "대학교 시설관리실 앞" },
    },
  });

  assert.equal(assessment.packageCharacterTookLead, true);
  assert.equal(assessment.handoffOccurred, true);
  assert.equal(assessment.needsCorrection, false);
});

test("패키지에 등록된 인물은 직업명이 비슷해도 보조 NPC로 오인하지 않는다", () => {
  const npc = demoScenario.npcs[0];
  const pack = {
    ...demoScenario,
    npcs: [{ ...npc, name: "시설관리 책임자 윤서", role: "주요 조력자" }],
  };
  const recentTurns = [1, 2, 3].map((turn) => ({
    turn,
    blocks: [{
      type: "dialogue" as const,
      text: "메인 사건에 관한 대화가 이어졌다.",
      speakerId: npc.id,
      speakerName: "시설관리 책임자 윤서",
    }],
  }));
  const focus = analyzeSceneFocus({ pack, recentTurns });

  assert.equal(focus.level, "normal");
  assert.equal(focus.requireHandoff, false);
});
