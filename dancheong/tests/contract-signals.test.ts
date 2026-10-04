import assert from "node:assert/strict";
import test from "node:test";

import {
  contractInventoryContainsItem,
  contractItemEquivalent,
  contractItemMentioned,
  contractSignalSatisfied,
  contractSituationSatisfied,
  missingContractSignals,
} from "../lib/contract-signals";

test("비트 신호는 문장부호·조사·어순 차이를 허용한다", () => {
  assert.equal(
    contractSignalSatisfied(
      "직원이 파편을 확인했다",
      "파편은 통제선 안에서 직원에게 실제로 확인됐다.",
    ),
    true,
  );
});

test("저자가 명시한 대체 표현은 같은 비트 신호로 판정한다", () => {
  assert.equal(
    contractSignalSatisfied(
      "문이 열렸다 ≈ 출입문이 개방됐다",
      "A205호 출입문이 마침내 개방됐다.",
    ),
    true,
  );
});

test("단일 키워드만 겹친 문장은 비트 신호를 허위 충족하지 않는다", () => {
  assert.deepEqual(
    missingContractSignals(
      "직원이 파편을 확인했다",
      "직원이 복도를 지나갔다.",
    ),
    ["직원이 파편을 확인했다"],
  );
});

test("필수 물품은 고문서와 기록지의 동일한 물품 정체성을 인식한다", () => {
  assert.equal(
    contractItemEquivalent("불탄 고문서 조각", "불탄 기록지 조각"),
    true,
  );
  assert.equal(
    contractInventoryContainsItem(
      ["황동열쇠", "불탄 기록지 조각"],
      "불탄 고문서 조각",
    ),
    true,
  );
  assert.equal(
    contractItemMentioned(
      "불탄 고문서 조각",
      "한시우는 불탄 기록지 조각을 가방 안쪽에 넣었다.",
    ),
    true,
  );
});

test("모호한 종이나 서로 다른 온전한 문서는 필수 물품을 대신하지 못한다", () => {
  assert.equal(contractItemMentioned("불탄 고문서 조각", "불탄 종이를 챙겼다."), false);
  assert.equal(contractItemEquivalent("불탄 고문서 조각", "온전한 기록지"), false);
});

test("종결 상황은 출발 장소가 달라도 같은 붕괴와 지하 도착 인과를 인정한다", () => {
  assert.equal(
    contractSituationSatisfied(
      "집안에서 바닥이 꺼져 방공호에 도착",
      "주차장에서 바닥이 꺼져 오래된 지하공간에 도착했다.",
    ),
    true,
  );
});

test("붕괴 또는 지하 도착 결과가 빠진 비슷한 분위기는 종결로 인정하지 않는다", () => {
  assert.equal(
    contractSituationSatisfied(
      "집안에서 바닥이 꺼져 방공호에 도착",
      "주차장 바닥에 금이 갔고 오래된 지하공간의 입구가 보였다.",
    ),
    false,
  );
  assert.equal(
    contractSituationSatisfied(
      "집안에서 바닥이 꺼져 방공호에 도착",
      "주차장에서 바닥이 무너졌지만 그는 지상에 매달려 버텼다.",
    ),
    false,
  );
});

test("종결 상황은 자연스러운 퇴장·시야 이탈 동의 표현을 인정한다", () => {
  const signal = "나디아가 박물관 별관 방향으로 떠나 시야에서 사라짐";
  assert.equal(
    contractSituationSatisfied(signal, "나디아는 자리에서 일어나 별관으로 향했다."),
    true,
  );
  assert.equal(
    contractSituationSatisfied(
      signal,
      "나디아는 박물관 별관 쪽으로 발걸음을 옮겼다. 이윽고 그녀의 모습은 빗속에 묻혔다.",
    ),
    true,
  );
  assert.equal(
    contractSituationSatisfied(
      signal,
      "나디아가 박물관 별관 쪽 골목 너머로 멀어졌다.",
    ),
    true,
  );
});

test("퇴장 의도나 장소 언급만으로 종결 상황을 허위 충족하지 않는다", () => {
  const signal = "나디아가 박물관 별관 방향으로 떠나 시야에서 사라짐";
  assert.equal(
    contractSituationSatisfied(signal, "나디아는 별관으로 떠날 생각이라고 말했다."),
    false,
  );
  assert.equal(
    contractSituationSatisfied(signal, "나디아는 박물관 별관의 전시 일정을 확인했다."),
    false,
  );
  assert.equal(
    contractSituationSatisfied(signal, "나디아는 별관으로 떠나지 않고 자리에 남았다."),
    false,
  );
});
