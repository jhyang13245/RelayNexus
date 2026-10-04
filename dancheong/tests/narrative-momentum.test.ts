import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeNarrativeMomentum,
  assessGeneratedMomentum,
  type MomentumRecentTurn,
} from "../lib/narrative-momentum";

const recentTurn = (
  turn: number,
  userText: string,
  text: string,
): MomentumRecentTurn => ({
  turn,
  userText,
  location: "대학교 지하 1층 택배함",
  time: `09:0${turn}`,
  blocks: [{ id: `block-${turn}`, type: "narration", text }],
});

test("같은 장소에서 반복 조사하면 장면 탈출 단계로 판정한다", () => {
  const recentTurns = [
    recentTurn(1, "택배함을 살펴본다.", "택배함의 차가운 철판이 보였다."),
    recentTurn(2, "문을 확인한다.", "택배함의 차가운 문과 번호표가 보였다."),
    recentTurn(3, "다시 확인한다.", "차가운 철판과 번호표는 그대로였다."),
  ];
  const momentum = analyzeNarrativeMomentum({
    state: { location: "대학교 지하 1층 택배함" },
    userText: "택배함을 연다.",
    recentTurns,
  });

  assert.equal(momentum.level, "breakout");
  assert.equal(momentum.intent, "inspect");
  assert.equal(momentum.explicitAction, true);
  assert.equal(momentum.sceneTurnCount, 4);
  assert.match(momentum.directives.join(" "), /반드시 종료|결과/);
});

test("명시한 행동을 처리하지 않고 같은 묘사만 하면 자동 보정 대상으로 잡는다", () => {
  const recentTurns = [
    recentTurn(1, "택배함을 살펴본다.", "택배함의 차가운 철판이 보였다."),
    recentTurn(2, "문을 확인한다.", "택배함의 차가운 문과 번호표가 보였다."),
    recentTurn(3, "다시 확인한다.", "차가운 철판과 번호표는 그대로였다."),
  ];
  const state = {
    location: "대학교 지하 1층 택배함",
    time: "09:03",
    sceneSummary: "택배함 앞에서 번호표를 살피고 있다.",
  };
  const momentum = analyzeNarrativeMomentum({
    state,
    userText: "택배함을 연다.",
    recentTurns,
  });
  const assessment = assessGeneratedMomentum({
    state,
    recentTurns,
    momentum,
    turn: {
      blocks: [{ type: "narration", text: "차가운 철판과 번호표는 여전히 그대로였다." }],
      statePatch: {
        time: "09:03",
        location: state.location,
        sceneSummary: state.sceneSummary,
      },
    },
  });

  assert.equal(assessment.actionResolved, false);
  assert.equal(assessment.materialChange, false);
  assert.equal(assessment.needsCorrection, true);
});

test("첫 조사에서 결과와 새 단서를 확정하면 장면 진행으로 인정한다", () => {
  const recentTurns: MomentumRecentTurn[] = [];
  const state = {
    location: "대학교 지하 1층 택배함",
    time: "09:03",
    sceneSummary: "택배함 앞에서 번호표를 살피고 있다.",
  };
  const momentum = analyzeNarrativeMomentum({
    state,
    userText: "택배함을 연다.",
    recentTurns,
  });
  const assessment = assessGeneratedMomentum({
    state,
    recentTurns,
    momentum,
    turn: {
      blocks: [{
        type: "narration",
        text: "문이 열렸다. 안쪽에서 발신인 없는 검은 봉투와 끊어진 붉은 실이 발견됐다.",
      }],
      statePatch: {
        time: "09:05",
        location: state.location,
        sceneSummary: "택배함에서 발신인 없는 봉투와 끊어진 붉은 실이 발견됐다.",
        memoryAdd: ["발신인 없는 봉투가 택배함 안에 있었다."],
      },
    },
  });

  assert.equal(assessment.actionResolved, true);
  assert.equal(assessment.materialChange, true);
  assert.equal(assessment.needsCorrection, false);
});

test("장소 이름이 조금 달라도 같은 현장의 장면 예산을 이어서 센다", () => {
  const recentTurns = [
    {
      ...recentTurn(1, "택배함을 살펴본다.", "열린 칸 안은 비어 있었다."),
      location: "상업시설 지하 1층",
    },
    {
      ...recentTurn(2, "표시를 확인한다.", "위치 표기가 한 번 깜박였다."),
      location: "상업시설 지하 1층 무인택배함",
    },
  ];
  const momentum = analyzeNarrativeMomentum({
    state: { location: "상업시설 지하 1층 무인택배함 앞" },
    userText: "문을 다시 확인한다.",
    recentTurns,
  });

  assert.equal(momentum.sceneTurnCount, 3);
  assert.equal(momentum.level, "breakout");
});

test("이전 장소의 반복 서술은 새 장소의 첫 장면을 정체로 오인시키지 않는다", () => {
  const recentTurns = [1, 2, 3].map((turn) => ({
    ...recentTurn(turn, "주변 상황을 정리한다.", "대학의 오전 일정이 이어졌다."),
    location: "한성도시대학교 교정",
  }));
  const momentum = analyzeNarrativeMomentum({
    state: { location: "한시우의 집" },
    userText: "집에서 잠시 쉬기로 한다.",
    recentTurns,
  });

  assert.equal(momentum.sceneTurnCount, 1);
  assert.equal(momentum.intent, "wait");
  assert.equal(momentum.level, "normal");
});

test("탈출 단계에서는 확정 단서 하나만 추가해도 장면 전환으로 인정하지 않는다", () => {
  const recentTurns = [
    recentTurn(1, "택배함을 살펴본다.", "택배함의 차가운 철판이 보였다."),
    recentTurn(2, "문을 확인한다.", "택배함의 차가운 문과 번호표가 보였다."),
  ];
  const state = {
    location: "대학교 지하 1층 택배함",
    time: "09:03",
    sceneSummary: "택배함 앞에서 번호표를 살피고 있다.",
  };
  const momentum = analyzeNarrativeMomentum({
    state,
    userText: "택배함을 연다.",
    recentTurns,
  });
  const assessment = assessGeneratedMomentum({
    state,
    recentTurns,
    momentum,
    turn: {
      blocks: [{
        type: "narration",
        text: "문이 열렸다. 안쪽에서 발신인 없는 검은 봉투가 발견됐다.",
      }],
      statePatch: {
        time: "09:05",
        location: state.location,
        sceneSummary: "택배함 안에서 발신인 없는 검은 봉투가 발견됐다.",
        memoryAdd: ["택배함 안에 검은 봉투가 있었다."],
      },
    },
  });

  assert.equal(momentum.level, "breakout");
  assert.equal(assessment.actionResolved, true);
  assert.equal(assessment.hardTransition, false);
  assert.equal(assessment.needsCorrection, true);
});

test("새 메모와 미세 이상만 늘리며 답을 계속 유보하면 전개로 인정하지 않는다", () => {
  const recentTurns = [
    recentTurn(1, "USB 기록을 확인한다.", "파일 시각은 여전히 그대로였고 원인은 확인되지 않았다."),
    recentTurn(2, "택배 기록과 대조한다.", "두 기록은 일부 일치했지만 의미는 알 수 없었다. 가능성만 남았다."),
    recentTurn(3, "17초 차이를 계산한다.", "숫자는 다시 나타났지만 호출자의 신원은 확인되지 않았다."),
  ].map((turn) => ({ ...turn, location: "한시우의 집" }));
  const state = {
    location: "한시우의 집",
    time: "16:52",
    sceneSummary: "택배와 인터폰의 시간 차이를 대조하고 있다.",
  };
  const momentum = analyzeNarrativeMomentum({
    state,
    userText: "두 기록의 시각을 다시 대조한다.",
    recentTurns,
  });
  const assessment = assessGeneratedMomentum({
    state,
    recentTurns,
    momentum,
    turn: {
      blocks: [{
        type: "narration",
        text: "화면이 한 번 깜박였지만 기록은 여전히 그대로였다. 어느 장치가 먼저 기준을 잃었는지는 알 수 없었고, 같은 현상일 가능성만 남았다.",
      }],
      statePatch: {
        time: "16:54",
        location: state.location,
        sceneSummary: "두 기록에 같은 시간 오차가 있다는 가능성이 남았다.",
        memoryAdd: ["화면이 한 번 깜박였다."],
        variablesAdd: [{ id: "tiny-clue" }],
      },
    },
  });

  assert.equal(momentum.level, "breakout");
  assert.ok(momentum.recentUnresolvedTurns >= 2);
  assert.equal(assessment.microClueOnly, true);
  assert.equal(assessment.materialChange, false);
  assert.equal(assessment.needsCorrection, true);
});

test("정체 장면에서 실제 침입과 즉각 대응 지점이 생기면 진행으로 인정한다", () => {
  const recentTurns = [
    recentTurn(1, "USB 기록을 확인한다.", "원인은 확인되지 않았다."),
    recentTurn(2, "택배 기록과 대조한다.", "의미는 여전히 알 수 없었다."),
    recentTurn(3, "17초 차이를 계산한다.", "가능성만 남았다."),
  ].map((turn) => ({ ...turn, location: "한시우의 집" }));
  const state = {
    location: "한시우의 집",
    time: "16:52",
    sceneSummary: "택배와 인터폰의 시간 차이를 대조하고 있다.",
  };
  const momentum = analyzeNarrativeMomentum({
    state,
    userText: "인터폰 화면을 계속 본다.",
    recentTurns,
  });
  const assessment = assessGeneratedMomentum({
    state,
    recentTurns,
    momentum,
    turn: {
      blocks: [{
        type: "narration",
        text: "현관 잠금이 바깥에서 풀렸다. 젖은 코트를 입은 여성이 문을 밀며 들어왔고, USB를 내놓으라고 말했다.",
      }],
      statePatch: {
        time: "16:53",
        location: state.location,
        sceneSummary: "정체불명의 여성이 현관을 열고 USB를 요구했다.",
        encounteredCharactersAdd: [{ characterId: "UNKNOWN_VISITOR" }],
      },
    },
  });

  assert.equal(assessment.sceneShift, true);
  assert.equal(assessment.materialChange, true);
  assert.equal(assessment.needsCorrection, false);
});

test("이미 진행 중인 침입을 표현만 바꿔 다시 세우면 새 장면 전환으로 인정하지 않는다", () => {
  const recentTurns = [
    recentTurn(1, "문을 막는다.", "검은 옷의 침입자가 현관문을 밀며 공격했다."),
    recentTurn(2, "복도로 유인한다.", "침입자는 복도까지 추격해 와 다시 문을 두드렸다."),
    recentTurn(3, "문을 닫는다.", "습격자는 닫힌 현관 앞에서 계속 잠금을 흔들었다."),
  ].map((turn) => ({ ...turn, location: "서촌 주택가 한명진의 집 현관 안쪽" }));
  const state = {
    location: "서촌 주택가 한명진의 집 현관 안쪽",
    time: "22:55",
    sceneSummary: "같은 침입자와 현관 안팎에서 대치하고 있다.",
  };
  const momentum = analyzeNarrativeMomentum({
    state,
    userText: "현관을 다시 막는다.",
    recentTurns,
  });
  const assessment = assessGeneratedMomentum({
    state,
    recentTurns,
    momentum,
    turn: {
      blocks: [{
        type: "narration",
        text: "침입자가 다시 현관으로 들이닥쳤다. 그는 문을 공격하며 열쇠를 내놓으라고 외쳤다.",
      }],
      statePatch: {
        time: "22:56",
        location: state.location,
        sceneSummary: "침입자가 다시 현관을 공격하며 대치가 이어졌다.",
      },
    },
  });

  assert.equal(momentum.level, "breakout");
  assert.equal(assessment.hardTransition, false);
  assert.equal(assessment.needsCorrection, true);
  assert.ok(assessment.reasons.some((reason) => /같은 위협/u.test(reason)));
});

test("같은 장소에서도 나디아가 감사를 전하고 떠나면 독립 대화 장면 종료로 인정한다", () => {
  const recentTurns = [
    {
      ...recentTurn(
        2,
        "박물관 별관 위치를 묻는 말을 듣는다.",
        "베이지색 트렌치코트를 입은 나디아가 캠퍼스 안내도 앞에서 길을 물었다.",
      ),
      location: "한성도시대학교 중앙 보행로 안내도 앞",
    },
    {
      ...recentTurn(
        3,
        "별관이 언덕 위에 있다고 알려준다.",
        "나디아는 접힌 방문 지도를 펴고 언덕 쪽 건물 이름을 확인했다.",
      ),
      location: "한성도시대학교 중앙 보행로 안내도 앞",
    },
  ];
  const state = {
    location: "한성도시대학교 중앙 보행로 안내도 앞",
    time: "16:12",
    sceneSummary: "나디아 알 하다드에게 대학박물관 별관으로 가는 길을 안내하고 있다.",
  };
  const momentum = analyzeNarrativeMomentum({
    state,
    userText: "별관은 언덕 꼭대기에 있어서 교내 셔틀을 타는 편이 낫다고 설명한다.",
    recentTurns,
  });
  const assessment = assessGeneratedMomentum({
    state,
    recentTurns,
    momentum,
    turn: {
      blocks: [
        {
          type: "dialogue",
          text: "감사합니다. 나디아 알 하다드예요. 프랑스에서 온 이름고고학자입니다.",
        },
        {
          type: "narration",
          text: "나디아는 가볍게 고개를 숙여 인사한 뒤 셔틀 정류장 쪽으로 걸어갔다. 짧은 안내와 만남은 거기서 끝났다.",
        },
      ],
      statePatch: {
        time: "16:15",
        location: state.location,
        sceneSummary: "나디아가 감사를 전하고 박물관 별관 쪽으로 떠나며 낮의 만남이 끝났다.",
        memoryAdd: ["나디아 알 하다드와의 평범한 길 안내 대화가 끝났다."],
      },
    },
  });

  assert.equal(momentum.level, "breakout");
  assert.equal(assessment.hardTransition, true);
  assert.equal(assessment.materialChange, true);
  assert.equal(assessment.needsCorrection, false);
});
