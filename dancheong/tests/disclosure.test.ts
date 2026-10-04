import assert from "node:assert/strict";
import test from "node:test";

import {
  characterStillAvailableInScene,
  recommendationIsImmediate,
  sanitizeRecommendedReplies,
} from "../lib/disclosure";

test("추천 행동은 현재 장면 밖의 미래 사건과 미등장 인물을 제거한다", () => {
  const observableText =
    "아다시노 히시리가 봉투를 내려놓았다. 지금 이 봉투의 봉인을 확인해 보세요.";
  const recommendations = sanitizeRecommendedReplies(
    [
      { label: "봉투의 봉인 상태를 살핀다.", risk: "낮음" },
      { label: "곧 일어날 습격에 대비한다.", risk: "높음" },
      { label: "오베론에게 이후 배신의 이유를 묻는다.", risk: "보통" },
    ],
    {
      observableText,
      speakerName: "아다시노 히시리",
      forbiddenNames: ["오베론"],
      count: 3,
    },
  );

  assert.equal(recommendations.length, 3);
  assert.equal(recommendations[0]?.label, "봉투의 봉인 상태를 살핀다.");
  assert.doesNotMatch(
    recommendations.map((item) => item.label).join(" "),
    /곧|이후|습격|배신|오베론/,
  );
});

test("결과를 미리 확정하는 문장은 추천 행동으로 인정하지 않는다", () => {
  assert.equal(
    recommendationIsImmediate("범인의 정체를 알아낸다.", {
      observableText: "잠긴 문과 찢어진 종이만 보인다.",
    }),
    false,
  );
  assert.equal(
    recommendationIsImmediate("찢어진 종이의 글자를 살핀다.", {
      observableText: "잠긴 문과 찢어진 종이만 보인다.",
    }),
    true,
  );
});

test("추천 라벨 안의 위험도 접두어는 별도 위험 배지와 중복되지 않게 제거한다", () => {
  const recommendations = sanitizeRecommendedReplies([
    { label: "낮음: 봉투의 봉인 상태를 살핀다.", risk: "낮음" },
    { label: "보통보통 · 직원에게 발송 기록을 묻는다.", risk: "보통" },
    { label: "위험도 높음—보관함을 직접 연다.", risk: "높음" },
  ], {
    observableText: "봉투와 발송 기록, 보관함이 눈앞에 있다. 직원도 곁에 있다.",
    validationMode: "hard_only",
    fillFallbacks: false,
    count: 3,
  });
  assert.deepEqual(recommendations, [
    { label: "봉투의 봉인 상태를 살핀다.", risk: "낮음" },
    { label: "직원에게 발송 기록을 묻는다.", risk: "보통" },
    { label: "보관함을 직접 연다.", risk: "높음" },
  ]);
});

test("작가 추천 모드는 경미한 초점 휴리스틱 때문에 자연스러운 선택을 기계문으로 교체하지 않는다", () => {
  const authored = [
    { label: "메모를 계산대 위에 펼쳐 나디아가 직접 읽게 한다.", risk: "낮음" },
    { label: "편의점 직원에게 메모의 발신 번호를 함께 확인해 달라고 부탁한다.", risk: "보통" },
    { label: "나디아에게 메모가 가리킨 골목까지 함께 가자고 제안한다.", risk: "높음" },
  ] as const;
  const recommendations = sanitizeRecommendedReplies([...authored], {
    observableText:
      "나디아와 편의점 직원이 계산대 앞에 있다. 메모에는 가까운 골목 주소와 발신 번호가 적혀 있다.",
    focusText: "나디아가 메모를 바라보며 대답을 고르고 있다.",
    validationMode: "hard_only",
    fillFallbacks: false,
    uniqueRisks: true,
    requireProgressive: true,
    count: 3,
  });

  assert.deepEqual(recommendations, authored);
});

test("작가 추천 모드는 현재 장면의 주인공 이름을 정상적인 행동 주체로 유지한다", () => {
  const authored = [
    { label: "한시우는 나디아에게 메모를 보여 주며 가장 수상한 대목을 묻는다.", risk: "낮음" },
    { label: "한시우는 나디아와 함께 편의점 창가에 앉아 메모의 발신 경로를 맞춰 본다.", risk: "보통" },
    { label: "한시우는 위험을 감수하고 나디아에게 오늘 밤 동행해 달라고 다시 제안한다.", risk: "높음" },
  ] as const;
  const recommendations = sanitizeRecommendedReplies([...authored], {
    observableText:
      "한시우는 편의점에서 나디아에게 이상한 메모를 받았다고 털어놓고 오늘 밤 함께 있어 달라고 부탁했다.",
    focusText: "나디아는 메모를 먼저 보여 달라며 맞은편 의자에 앉았다.",
    speakerName: "나디아",
    characterNames: ["나디아"],
    availableCharacterNames: ["나디아"],
    validationMode: "hard_only",
    fillFallbacks: false,
    count: 3,
  });

  assert.deepEqual(recommendations, authored);
});

test("작가 추천 모드도 미래 사건 누설과 결과 선확정은 강제 오류로 제거한다", () => {
  const recommendations = sanitizeRecommendedReplies([
    { label: "곧 일어날 습격을 피해 달아난다.", risk: "낮음" },
    { label: "범인의 정체를 알아낸다.", risk: "보통" },
    { label: "나디아에게 메모를 보여 주며 의견을 묻는다.", risk: "높음" },
  ], {
    observableText: "나디아가 편의점 계산대 앞에서 메모를 보고 있다.",
    validationMode: "hard_only",
    fillFallbacks: false,
    uniqueRisks: true,
    count: 3,
  });

  assert.deepEqual(recommendations, [
    { label: "나디아에게 메모를 보여 주며 의견을 묻는다.", risk: "높음" },
  ]);
});

test("본문에 나오지 않은 초기 인벤토리 소품은 추천 행동에서 차단한다", () => {
  const recommendations = sanitizeRecommendedReplies(
    [
      { label: "황동열쇠와 불탄 기록을 꺼내 비교한다.", risk: "보통" },
      { label: "현관 화면의 17초 공백을 다시 확인한다.", risk: "낮음" },
    ],
    {
      observableText:
        "인터폰 영상과 택배 화면에 같은 17초 공백이 남았다. 현관 밖은 조용했다.",
      forbiddenTerms: ["황동열쇠", "불탄 기록"],
      count: 3,
    },
  );

  const text = recommendations.map((item) => item.label).join(" ");
  assert.doesNotMatch(text, /황동|열쇠|불탄 기록/);
  assert.match(text, /17초 공백/);
});

test("본문에서 실제로 공개된 소품은 추천 행동에 사용할 수 있다", () => {
  assert.equal(
    recommendationIsImmediate("황동열쇠의 홈을 살핀다.", {
      observableText: "책상 위에서 황동열쇠가 발견됐다.",
      forbiddenTerms: ["황동열쇠"],
    }),
    true,
  );
});

test("전개형 추천 모드에서는 반복 관찰을 버리고 행동 가능한 선택만 남긴다", () => {
  const recommendations = sanitizeRecommendedReplies(
    [
      { label: "봉인 스티커를 다시 자세히 살핀다.", risk: "낮음" },
      { label: "화면의 숫자를 한 번 더 대조한다.", risk: "보통" },
      { label: "관리실에 연락해 현장 처리를 요청한다.", risk: "보통" },
    ],
    {
      observableText: "봉인된 택배함과 관리실 전화번호가 눈앞에 있다.",
      requireProgressive: true,
      count: 3,
    },
  );
  const text = recommendations.map((item) => item.label).join(" ");

  assert.equal(recommendations.length, 3);
  assert.match(text, /연락|벗어난|요청|이동/);
  assert.doesNotMatch(text, /다시 자세히|한 번 더 대조/);
});

test("택배 장면 대체 추천은 확인만 반복하지 않고 수령까지 진행한다", () => {
  const recommendations = sanitizeRecommendedReplies([], {
    observableText: "택배 알림을 확인했고 무인택배함 앞에 도착했다.",
    focusText: "택배 알림을 확인했고 무인택배함 앞에 도착했다.",
    requireProgressive: true,
    count: 3,
  });
  const labels = recommendations.map((item) => item.label).join(" ");

  assert.equal(recommendations.length, 3);
  assert.match(labels, /꺼낸다|수령 절차|챙긴다/u);
  assert.doesNotMatch(labels, /다시|한 번 더|기다/u);
});

test("장면 예산이 끝난 보조 NPC를 다시 상대하는 추천은 무조건 제거한다", () => {
  const recommendations = sanitizeRecommendedReplies(
    [
      { label: "시설관리 직원에게 기록을 다시 확인해 달라고 요청한다.", risk: "낮음" },
      { label: "관리실에 전화해 다른 담당자를 부른다.", risk: "보통" },
      { label: "복도에 새로 나타난 인물에게 정체를 묻는다.", risk: "높음" },
    ],
    {
      observableText:
        "시설관리 직원은 떠났고, 복도 끝에 정체불명의 인물이 나타났다.",
      excludedTerms: ["시설관리 직원", "관리실", "담당자"],
      requireProgressive: true,
      count: 3,
    },
  );

  const text = recommendations.map((item) => item.label).join(" ");
  assert.doesNotMatch(text, /시설관리|관리실|담당자/);
  assert.match(text, /정체|벗어난|이동|도움/);
});

test("추천 행동 세 개는 마지막 장면의 구체 대상과 모두 연결된다", () => {
  const focusText =
    "나디아 알 하다드가 캠퍼스 안내도 앞에서 공학관 별관으로 가는 길을 물었다. 셔틀 정류장은 안내도 오른편에 보였다.";
  const recommendations = sanitizeRecommendedReplies(
    [
      { label: "기숙사로 돌아가 휴대전화를 충전한다.", risk: "낮음" },
      { label: "도서관에서 오래된 전투 기록을 찾는다.", risk: "보통" },
      { label: "별관 방향을 가리키며 셔틀 정류장까지 함께 이동한다.", risk: "낮음" },
    ],
    {
      observableText: focusText,
      focusText,
      speakerName: "나디아 알 하다드",
      requireProgressive: true,
      count: 3,
    },
  );

  assert.equal(recommendations.length, 3);
  recommendations.forEach((recommendation) => {
    assert.match(recommendation.label, /캠퍼스|안내도|공학관|별관|셔틀|정류장|오른편/);
  });
  assert.doesNotMatch(
    recommendations.map((item) => item.label).join(" "),
    /기숙사|충전|도서관|전투 기록/,
  );
});

test("추천 답변 대체문은 서술 동사를 핵심 대상으로 오인하지 않는다", () => {
  const recommendations = sanitizeRecommendedReplies([], {
    observableText:
      "푸른 파형 두 줄이 교차했다. 한세린은 궤적을 바라보다가 시우 쪽으로 의자를 돌렸다.",
    focusText:
      "한세린이 벡터 편향, 공진 증폭, 감각 가속의 세 가지 발전 방향을 설명한다. 푸른 파형 두 줄이 교차했다.",
    speakerName: "한세린",
    count: 3,
  });

  const labels = recommendations.map((item) => item.label).join(" ");
  assert.equal(recommendations.length, 3);
  assert.doesNotMatch(labels, /‘(?:바라보다|교차했다|돌렸다|설명한다)’/u);
  assert.match(labels, /벡터|편향|공진|증폭|감각|가속|파형/u);
});

test("이름만 언급된 실종자는 현재 대화 상대처럼 추천하지 않는다", () => {
  const focusText =
    "교내 무인택배함 알림이 도착했다. 발송인 한명진은 1년 전 실종됐고 지금 통화나 대화가 연결된 상태가 아니다.";
  const recommendations = sanitizeRecommendedReplies(
    [
      { label: "한명진에게 지금 상황에서 가장 먼저 확인해야 할 것을 묻는다.", risk: "낮음" },
      { label: "택배 알림에서 발송인 표시와 도착 시각을 확인한다.", risk: "낮음" },
      { label: "무인택배함의 보관 위치와 수령 가능 시간을 확인한다.", risk: "보통" },
      { label: "한명진 명의 발송 기록이 실제인지 택배함 관리 시스템에 문의한다.", risk: "높음" },
    ],
    {
      observableText: focusText,
      focusText,
      characterNames: ["한명진"],
      availableCharacterNames: [],
      count: 3,
    },
  );
  const text = recommendations.map((item) => item.label).join(" ");

  assert.equal(recommendations.length, 3);
  assert.doesNotMatch(text, /한명진에게|한명진한테|한명진과\s*(?:대화|통화)/u);
  assert.match(text, /택배|발송 기록|보관 위치/);
});

test("대화 뒤 퇴장한 인물은 같은 턴의 추천 대화 상대로 남지 않는다", () => {
  const blocks = [
    { type: "dialogue", speakerName: "나디아 알 하다드", text: "그럼 이만 가볼게요." },
    { type: "narration", speakerName: "", text: "나디아가 별관 안으로 들어가고 유리문이 닫혔다." },
  ];
  assert.equal(
    characterStillAvailableInScene("나디아 알 하다드", blocks),
    false,
  );
  const focusText = blocks.map((block) => block.text).join(" ");
  const recommendations = sanitizeRecommendedReplies([], {
    observableText: focusText,
    focusText,
    speakerName: "",
    characterNames: ["나디아 알 하다드"],
    availableCharacterNames: [],
    excludedTerms: ["나디아 알 하다드"],
    requireProgressive: true,
    count: 3,
  });
  const labels = recommendations.map((item) => item.label).join(" ");
  assert.equal(recommendations.length, 3);
  assert.doesNotMatch(labels, /나디아/u);
  assert.doesNotMatch(labels, /‘(?:실제|남아|한시우|유리문)’/u);
});

test("연도와 메타 개념을 행동 대상으로 삼는 추천은 모든 장면에서 제거한다", () => {
  const focusText =
    "2018년 10월 23일 오전 6시 43분. 현관에는 낡은 우산 두 개가 있고 부엌에는 서로 다른 무늬의 찻잔이 놓여 있다. 한명진은 오늘로 정확히 일 년째 돌아오지 않았다.";
  const recommendations = sanitizeRecommendedReplies(
    [
      { label: "2018년의 현재 상태를 확인하고 바로 처리한다.", risk: "낮음" },
      { label: "2018년 관련 기록을 확인한 뒤 연락 여부를 결정한다.", risk: "보통" },
      { label: "2018년 정리를 마친 뒤 현재 장소의 다음 동선으로 이동한다.", risk: "보통" },
    ],
    {
      observableText: focusText,
      focusText,
      requireProgressive: true,
      count: 3,
    },
  );
  const labels = recommendations.map((item) => item.label).join(" ");

  assert.equal(recommendations.length, 3);
  assert.doesNotMatch(labels, /2018년|현재 상태|관련 기록|현재 장소|다음 동선/u);
  assert.match(labels, /찻잔/u);
  assert.match(labels, /현관|생활 흔적/u);
});

test("날짜가 포함돼도 구체적인 현재 장면 행동은 유지한다", () => {
  assert.equal(
    recommendationIsImmediate("현관의 우산을 살펴 달라진 흔적을 확인한다.", {
      observableText: "2018년 10월 23일, 현관에 낡은 우산 두 개가 남아 있다.",
      focusText: "2018년 10월 23일, 현관에 낡은 우산 두 개가 남아 있다.",
      requireProgressive: true,
    }),
    true,
  );
});
