import assert from "node:assert/strict";
import test from "node:test";

import {
  package15RevealGuards,
  parsePackage15Runtime,
} from "../lib/package15-runtime";

const documents = {
  revealFacts: {
    format: "RELAY_NOVEL_REVEAL_FACTS_V1",
    facts: [{
      id: "FACT_IDENTITY",
      label: "숨은 정체",
      description: "",
      protectedTerms: ["진짜 이름"],
    }],
  },
  revealPolicies: {
    format: "RELAY_NOVEL_REVEAL_POLICIES_V1",
    policies: [{
      id: "POLICY_IDENTITY",
      scope: "global",
      rules: [{
        factId: "FACT_IDENTITY",
        beforeMode: "forbidden",
        afterMode: "full",
        transitionWhen: { kind: "event_completed", eventId: "EV_REVEAL" },
        forbiddenTerms: ["왕의 본명"],
      }],
    }],
  },
};

test("Package 1.5 중첩 manifest도 공식 필수 기능 협상에 사용한다", () => {
  const runtime = parsePackage15Runtime({
    packageVersion: "1.5",
    manifest: {
      manifest: {
        requiredFeatures: ["reveal_policy_v1"],
      },
    },
    documents,
  });
  assert.deepEqual(runtime?.requiredFeatures, ["reveal_policy_v1"]);
});

test("RevealPolicy는 공개 사건 전 금칙어를 막고 사건 봉인 뒤 full로 연다", () => {
  const runtime = parsePackage15Runtime({
    packageVersion: "1.5",
    manifest: { requiredFeatures: ["reveal_policy_v1"] },
    documents,
  });
  const before = package15RevealGuards(runtime, { completedEventIds: [] });
  assert.equal(before[0]?.mode, "forbidden");
  assert.deepEqual(before[0]?.protectedTerms, ["진짜 이름", "왕의 본명"]);
  const after = package15RevealGuards(runtime, {
    completedEventIds: ["EV_REVEAL"],
  });
  assert.equal(after[0]?.mode, "full");
});
