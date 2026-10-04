import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSceneFactContract,
  sceneFactPrompt,
  sceneFactVisible,
} from "../lib/scene-fact";

test("도구·대상·일시 효과를 작품 독립 sceneFact 계약으로 추출한다", () => {
  const contract = deriveSceneFactContract(
    "한시우는 라이터로 종이를 불태워 없앤다. 그것은 실제로 잠시나마 효과가 있었다.",
  );

  assert.equal(contract.active, true);
  assert.equal(contract.kind, "fire");
  assert.ok(contract.tools.some((item) => item.includes("라이터")));
  assert.ok(contract.targets.some((item) => item.includes("종이")));
  assert.equal(contract.temporaryEffect, true);
  assert.match(sceneFactPrompt(contract), /일시적.*재개·반동/u);
});

test("정사만 진행하고 sceneFact를 생략한 본문은 통과시키지 않는다", () => {
  const contract = deriveSceneFactContract(
    "라이터로 종이를 불태운다. 잠시나마 효과가 있었다.",
  );

  assert.equal(
    sceneFactVisible(contract, "추적자가 한 걸음 안으로 들어오며 열쇠를 향해 손을 뻗었다."),
    false,
  );
  assert.equal(
    sceneFactVisible(
      contract,
      "라이터 불꽃이 종이에 붙어 가장자리가 재로 무너졌다. 움직임은 몇 초간 멎었지만 곧 다시 이어졌다.",
    ),
    true,
  );
});

test("작품명 없이도 파괴·열기·전달 sceneFact를 판정한다", () => {
  for (const input of [
    "망치로 상자를 부순다.",
    "열쇠로 문을 연다.",
    "봉투를 동료에게 건넨다.",
  ]) {
    assert.equal(deriveSceneFactContract(input).active, true, input);
  }
});
