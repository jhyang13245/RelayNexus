import assert from "node:assert/strict";
import test from "node:test";

import {
  highRiskLiveTravelIntent,
  liveCanonAnchorFallbackParagraph,
  liveCanonAnchorDriftReason,
  liveCanonAnchorParagraphDriftReason,
  type LiveCanonAnchorGuard,
} from "../lib/live-canon-anchor";
import { deriveClaudeTurnIntent } from "../lib/claude-runtime";

const guard = (overrides: Partial<LiveCanonAnchorGuard> = {}): LiveCanonAnchorGuard => ({
  active: true,
  currentTime: "15:30",
  currentLocation: "대학교 강의실",
  eventTimeWindow: "15:00~18:00",
  eventLocation: "대학교 강의실",
  longSpan: true,
  restrictLocation: false,
  highRiskTravel: false,
  destinationHint: "",
  requestedEndTime: "",
  requestedMinimumMinutes: null,
  strictEventTime: true,
  ...overrides,
});

test("1년 생활을 완료한 입력과 본문은 장기 시간 이탈로 판정한다", () => {
  assert.equal(
    deriveClaudeTurnIntent("한시우는 1년 동안 폐인 생활을 하였다.", undefined, "15:30").longSpan,
    true,
  );
  assert.match(
    liveCanonAnchorDriftReason("그렇게 한시우는 1년 동안 폐인 생활을 하였다.", guard()) ?? "",
    /장기 시간 점프/u,
  );
});

test("장기 계획을 생각하거나 준비하는 현재 행동은 되감지 않는다", () => {
  assert.equal(
    liveCanonAnchorDriftReason("그는 1년쯤 쉬고 싶다는 생각을 했지만 우선 가방을 챙겼다.", guard()),
    undefined,
  );
});

test("시간 이탈 안전 대체문은 검증 규칙을 설명하지 않고 장면의 긴장을 이어 간다", () => {
  const fallback = liveCanonAnchorFallbackParagraph(guard());
  assert.equal(
    fallback,
    "그는 하던 일에 다시 몰두하려 했다. 그러나 얼마 지나지 않아 가까운 곳에서 마른 소리가 튀었다. 손끝이 멈췄고, 익숙하던 풍경에서 조금 전까지 없던 긴장이 번졌다.",
  );
  assert.doesNotMatch(fallback, /현재 시각|현재 장소|정사|교정|가능한 행동|이미 지나거나/u);
});

test("문단 선택 검사는 장면 전체의 정사 합류 신호를 문단마다 반복 요구하지 않는다", () => {
  const canonGuard = guard({
    currentTime: "15:27",
    eventTimeWindow: "15:30~18:00",
    canonAbsorptionRequired: true,
    requestedEndTime: "19:00",
    currentBeatSignals: ["무인택배함 알림 확인"],
  });
  const ordinaryParagraph = "한시우는 도시공학 자료의 보행 흐름을 노트에 옮겨 적었다.";
  assert.match(liveCanonAnchorDriftReason(ordinaryParagraph, canonGuard) ?? "", /시간창/u);
  assert.equal(liveCanonAnchorParagraphDriftReason(ordinaryParagraph, canonGuard), undefined);
  assert.match(
    liveCanonAnchorParagraphDriftReason("캠퍼스의 저녁 안내 방송이 낮게 번졌다.", canonGuard) ?? "",
    /시간창|시간 이탈/u,
  );
});

test("정사 합류 안전 대체문은 사건 신호를 한 번의 장면 행동으로 성립시킨다", () => {
  const canonGuard = guard({
    currentTime: "15:27",
    eventTimeWindow: "15:30~18:00",
    canonAbsorptionRequired: true,
    requestedEndTime: "19:00",
    eventName: "첫 번째 택배",
    currentBeatSignals: ["무인택배함 알림 확인"],
  });
  const fallback = liveCanonAnchorFallbackParagraph(canonGuard);
  assert.match(fallback, /그러나 얼마 지나지 않아/u);
  assert.match(fallback, /무인택배함\s*알림을\s*확인/u);
  assert.equal(liveCanonAnchorDriftReason(fallback, canonGuard), undefined);
  assert.doesNotMatch(fallback, /저녁|밤|현재 시각|시간창|정사|교정/u);
});

test("정사 밖 목적지에 이미 도착한 문단만 장소 이탈로 판정한다", () => {
  const locationGuard = guard({
    longSpan: false,
    restrictLocation: true,
    highRiskTravel: true,
    destinationHint: "부산",
  });
  assert.match(
    liveCanonAnchorDriftReason("그는 어느새 부산에 도착했다.", locationGuard) ?? "",
    /장거리 도착/u,
  );
  assert.equal(
    liveCanonAnchorDriftReason("그는 부산으로 갈 방법을 확인하고 택시를 불렀다.", locationGuard),
    undefined,
  );
});

test("사건 안에서 가능한 근거리 장소 이동은 되감지 않는다", () => {
  assert.equal(highRiskLiveTravelIntent("교내 카페로 걸어가 자리를 잡는다."), false);
  assert.equal(
    liveCanonAnchorDriftReason("십 분 뒤 교내 카페에 도착해 자리를 잡았다.", guard({
      longSpan: false,
      restrictLocation: false,
      destinationHint: "교내 카페",
    })),
    undefined,
  );
});

test("즉시 출국해 해외에 도착하는 입력과 문단은 실시간 교정 대상으로 잡는다", () => {
  const input = "캐나다행 비행기 땡처리표를 구입해 즉시 인천공항에서 출국하여 캐나다에 도착한다.";
  assert.equal(highRiskLiveTravelIntent(input), true);
  assert.match(
    liveCanonAnchorDriftReason("그는 인천공항에서 출국해 캐나다에 도착했다.", guard({
      longSpan: false,
      restrictLocation: true,
      highRiskTravel: true,
      destinationHint: "캐나다",
    })) ?? "",
    /성립할 수 없는 장거리 도착/u,
  );
});

test("필수 사건을 건너뛰어 시간창 뒤까지 공부한 문단은 즉시 되감는다", () => {
  const canonGuard = guard({
    currentTime: "15:27",
    eventTimeWindow: "15:30~18:00",
    longSpan: true,
    canonAbsorptionRequired: true,
    eventName: "첫 번째 택배",
    currentBeatSignals: ["무인택배함 알림 확인"],
  });
  assert.equal(
    deriveClaudeTurnIntent(
      "한시우는 휴대전화를 덮어놓고 저녁 늦게까지 공부를 이어간다.",
      { required: true } as never,
      "15:27",
    ).explicitDerailment,
    true,
  );
  assert.match(
    liveCanonAnchorDriftReason(
      "21:52. 그는 열람실에서 공부를 끝냈지만 택배는 그대로 두었다.",
      canonGuard,
    ) ?? "",
    /시간창/u,
  );
});

test("정사 흡수는 비트 신호 목록 중 한 장면 증거가 자연스럽게 성립하면 통과한다", () => {
  assert.equal(
    liveCanonAnchorDriftReason(
      "꺼진 화면을 내려놓는 순간 무인택배함 알림을 확인했고, 한시우의 손이 노트 위에서 멈췄다.",
      guard({
        canonAbsorptionRequired: true,
        currentBeatSignals: ["무인택배함 알림 확인", "수령함으로 향함"],
      }),
    ),
    undefined,
  );
});

test("현재 비트 신호를 성립시켜도 사건 마감 시각을 넘기면 되감는다", () => {
  assert.match(
    liveCanonAnchorDriftReason(
      "18:05. 귀가하던 길에 무인택배함 알림을 확인하고 발걸음을 돌렸다.",
      guard({
        eventTimeWindow: "15:30~18:00",
        canonAbsorptionRequired: true,
        eventName: "첫 번째 택배",
        currentBeatSignals: ["무인택배함 알림 확인"],
      }),
    ) ?? "",
    /시간 이탈/u,
  );
});

test("숫자 시각 없이 세 시간 뒤로 건너뛰어도 사건 마감을 넘으면 되감는다", () => {
  assert.match(
    liveCanonAnchorDriftReason(
      "그는 세 시간 동안 열람실에서 공부를 계속한 뒤에야 휴대전화를 들었다.",
      guard({ currentTime: "15:30", eventTimeWindow: "15:00~18:00" }),
    ) ?? "",
    /시간 이탈/u,
  );
});

test("저녁이 될 때까지 장면을 미루는 표현도 낮 사건의 마감을 넘으면 되감는다", () => {
  assert.match(
    liveCanonAnchorDriftReason(
      "저녁이 되었다. 그는 그제야 자리에서 일어났다.",
      guard({ currentTime: "15:30", eventTimeWindow: "15:00~18:00", longSpan: false }),
    ) ?? "",
    /시간 이탈/u,
  );
});

test("저녁 무렵과 어두워진 캠퍼스로 우회 표현한 시간 이탈도 문단 교정 대상으로 잡는다", () => {
  const text = [
    "창밖의 햇빛은 서서히 낮아졌고, 유리창에 비친 실내 조명은 하나둘 밝아졌다.",
    "시계가 저녁 무렵을 가리킬 때까지 공부가 이어졌다.",
    "창가 너머로 어두워진 캠퍼스 보도가 보였다.",
  ].join("\n");

  assert.match(
    liveCanonAnchorDriftReason(text, guard({
      currentTime: "15:27",
      eventTimeWindow: "15:30~18:00",
      longSpan: false,
      canonAbsorptionRequired: true,
      eventName: "첫 번째 택배",
      currentBeatSignals: ["무인택배함 알림 확인"],
    })) ?? "",
    /시간창|시간 이탈/u,
  );
});

test("실제 실패 문체의 저녁 전환과 '18시를 조금 앞두고'도 시간 이탈로 잡는다", () => {
  const canonGuard = guard({
    currentTime: "15:27",
    eventTimeWindow: "15:30~17:30",
    strictEventTime: true,
    canonAbsorptionRequired: false,
  });
  const paragraphs = [
    "낮의 페이지 넘기는 소리는 저녁이 가까워질수록 낮은 속삭임으로 바뀌었다.",
    "캠퍼스는 특별한 소란 없이 저녁의 흐름으로 넘어갔다.",
    "과제의 정리가 일단락될 무렵, 시계는 18시를 조금 앞두고 있었다.",
  ];

  paragraphs.forEach((paragraph) => {
    assert.match(liveCanonAnchorDriftReason(paragraph, canonGuard) ?? "", /시간창|시간 이탈/u);
  });
});

test("정사 합류 전 다음 날 아침으로 넘어가면 정확한 시각이 없어도 되감는다", () => {
  assert.match(
    liveCanonAnchorDriftReason(
      "2018년 10월 24일 아침. 그는 침대에서 눈을 떴다.",
      guard({
        canonAbsorptionRequired: true,
        eventName: "첫 번째 택배",
        currentBeatSignals: ["무인택배함 알림 확인"],
      }),
    ) ?? "",
    /시간 이탈|다음 날/u,
  );
});
