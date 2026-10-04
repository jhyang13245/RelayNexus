import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "./fixtures/legacy-demo-scenario";
import { createInitialState, type ScenarioPack } from "../lib/scenario";
import {
  assessServantBond,
  deriveServantBondDirection,
} from "../lib/servant-bond";

const jeongjo = {
  ...demoScenario.npcs[0],
  id: "NPC_SABER_JEONGJO",
  name: "붉은 옥새의 소녀 검사",
  aliases: ["소녀 검사", "검을 든 소녀"],
  preRevealAlias: "정체불명의 소녀 검사",
  role: "Saber 클래스 서번트",
  appearance: "붉은 곤룡포를 입은 흑발의 소녀 검사",
  publicInfo: "진명과 클래스를 밝히지 않은 계약 서번트",
  hiddenInfo: "진명 정조 이산. 개혁과 백성의 삶을 중시한 조선의 왕.",
};

test("공개 전 별칭으로 말해도 계약 서번트의 동일 인물 대화로 판정한다", () => {
  const state = {
    ...createInitialState(fatePack),
    encounteredCharacterIds: [jeongjo.id],
    turn: 3,
  };
  const direction = deriveServantBondDirection({
    pack: fatePack,
    state,
    userText: "상황을 확인한다.",
    recentTurns: [],
    summoningNow: true,
    supportHandoffNeeded: false,
  });
  const assessment = assessServantBond({
    direction,
    turn: {
      blocks: [{
        type: "dialogue",
        text: "묻겠다. 그대가 나의 마스터인가.",
        speakerId: "dynamic-girl-swordswoman",
        speakerName: "소녀 검사",
      }],
    },
  });

  assert.equal(assessment.servantSpoke, true);
  assert.equal(assessment.endsAtMasterQuestion, true);
  assert.equal(assessment.needsCorrection, false);
});

const fatePack: ScenarioPack = {
  ...demoScenario,
  projectId: "FATE-SEOUL-BOND-TEST",
  title: "Fate/Seoul — 거짓 왕관의 성배전쟁",
  genre: "현대 판타지 · 성배전쟁",
  npcs: [...demoScenario.npcs, jeongjo],
};

const servantDialogue = (text: string) => ({
  type: "dialogue" as const,
  text,
  speakerId: jeongjo.id,
  speakerName: jeongjo.name,
});

test("소환 턴은 마법진 이미지 트리거와 계약자의 첫 대화를 요구한다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 12,
    time: "23:41",
  };
  const direction = deriveServantBondDirection({
    pack: fatePack,
    state,
    userText: "상황을 지켜본다.",
    recentTurns: [],
    summoningNow: true,
    supportHandoffNeeded: false,
  });

  assert.equal(direction.mode, "first_contact");
  assert.equal(direction.routePhase, "summoning");
  assert.equal(direction.isJeongjo, true);
  assert.ok(direction.visualTriggerTerms.includes("magic-circle"));
  assert.match(direction.directives.join(" "), /직접 말을 건다|정조/);

  const missingDialogue = assessServantBond({
    direction,
    turn: {
      blocks: [{
        type: "narration",
        text: "마법진에서 소녀 검사가 현현했다.",
      }],
    },
  });
  const complete = assessServantBond({
    direction,
    turn: {
      blocks: [
        { type: "narration", text: "마법진에서 소녀 검사가 현현했다." },
        servantDialogue("묻겠다. 그대가 나의 마스터인가."),
      ],
    },
  });
  const paraphrased = assessServantBond({
    direction,
    turn: {
      blocks: [
        { type: "narration", text: "마법진에서 소녀 검사가 현현했다." },
        servantDialogue("그대가 나를 부른 자인가?"),
      ],
    },
  });

  assert.equal(missingDialogue.needsCorrection, true);
  assert.equal(complete.endsAtMasterQuestion, true);
  assert.equal(complete.needsCorrection, false);
  assert.equal(paraphrased.endsAtMasterQuestion, false);
  assert.equal(paraphrased.needsCorrection, true);
});

test("소환 후 낮 장면은 현대 생활과 정조의 가치관이 맞닿는 관계 비트가 된다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 18,
    time: "10:20",
    encounteredCharacterIds: [jeongjo.id],
    characterVisuals: [{
      characterId: jeongjo.id,
      characterName: jeongjo.name,
      appearancePrompt: jeongjo.appearance,
      assetId: "jeongjo-canonical",
      source: "package" as const,
      introducedTurn: 12,
    }],
  };
  const recentTurns = [15, 16, 17].map((turn) => ({
    turn,
    blocks: [{ type: "narration" as const, text: "시설 확인이 길어졌다." }],
  }));
  const direction = deriveServantBondDirection({
    pack: fatePack,
    state,
    userText: "집에서 잠시 쉬기로 한다.",
    recentTurns,
    summoningNow: false,
    supportHandoffNeeded: false,
  });

  assert.equal(direction.mode, "daily_bond");
  assert.equal(direction.routePhase, "daytime");
  assert.equal(direction.requireModernLifeBeat, true);

  const assessment = assessServantBond({
    direction,
    turn: {
      blocks: [
        {
          type: "narration",
          text: "소녀 검사는 스마트폰의 행정 앱과 시민 민원 화면을 빠르게 훑었다.",
        },
        servantDialogue("백성이 직접 고충을 올릴 수 있다니 훌륭하군. 다만 답하지 않는 관청이라면 이름만 달라졌을 뿐이다."),
      ],
    },
  });

  assert.equal(assessment.servantSpoke, true);
  assert.equal(assessment.modernLifeBeat, true);
  assert.equal(assessment.needsCorrection, false);
});

test("밤의 마술전과 다음 낮의 후유증을 서로 연결하는 노선을 지시한다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 20,
    time: "07:10",
    encounteredCharacterIds: [jeongjo.id],
    characterVisuals: [{
      characterId: jeongjo.id,
      characterName: jeongjo.name,
      appearancePrompt: jeongjo.appearance,
      assetId: "jeongjo-canonical",
      source: "package" as const,
      introducedTurn: 12,
    }],
    sceneSummary: "밤의 추격은 끝났고 현재 즉각적인 위협은 없다.",
  };
  const direction = deriveServantBondDirection({
    pack: fatePack,
    state,
    userText: "상처의 상태를 묻는다.",
    recentTurns: [{
      turn: 19,
      blocks: [{
        type: "narration",
        text: "새벽까지 이어진 영령전과 추격 끝에 적이 물러났다.",
      }],
    }],
    summoningNow: false,
    supportHandoffNeeded: false,
  });

  assert.equal(direction.routePhase, "aftermath");
  assert.equal(direction.mode, "settling_in");
  assert.match(direction.directives.join(" "), /직전 전투의 여운|다음 날 일상/);
});

test("밤에는 현대 일상 대신 서번트와 조사·전술 노선을 우선한다", () => {
  const state = {
    ...createInitialState(fatePack),
    turn: 24,
    time: "22:40",
    encounteredCharacterIds: [jeongjo.id],
    characterVisuals: [{
      characterId: jeongjo.id,
      characterName: jeongjo.name,
      appearancePrompt: jeongjo.appearance,
      assetId: "jeongjo-canonical",
      source: "package" as const,
      introducedTurn: 12,
    }],
    sceneSummary: "서울 도심의 마력 흔적을 멀리서 관측하고 있다.",
  };
  const recentTurns = [21, 22, 23].map((turn) => ({
    turn,
    blocks: [{ type: "narration" as const, text: "밤의 이동 경로를 확인했다." }],
  }));
  const direction = deriveServantBondDirection({
    pack: fatePack,
    state,
    userText: "주변을 경계한다.",
    recentTurns,
    summoningNow: false,
    supportHandoffNeeded: false,
  });

  assert.equal(direction.routePhase, "night");
  assert.equal(direction.mode, "combat_coordination");
  assert.equal(direction.requireModernLifeBeat, false);
  assert.ok(direction.visualTriggerTerms.includes("investigation"));
  assert.match(direction.directives.join(" "), /밤의 조사·경계|전술 합의/);
});
