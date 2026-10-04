import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "./fixtures/legacy-demo-scenario";
import type { ScenarioPack } from "../lib/scenario";
import { resolveWorkAdapter, resolveWorkAdapterByRouteId } from "../lib/work-adapters";
import {
  FATE_SEOUL_ACT_ZERO_EVENT_IDS,
  FATE_SEOUL_ACT_ZERO_ROUTE_ID,
  FATE_SEOUL_ADAPTER_ID,
  fateSeoulPrematureProgression,
  fateSeoulRoutePolicy,
  fateSeoulRouteStepCompleted,
  primaryFateSeoulSaberNpc,
} from "../lib/work-adapters/fate-seoul";

const actZeroPack: ScenarioPack = {
  ...demoScenario,
  projectId: "FATE-SEOUL-ADAPTER-TEST",
  title: "어댑터 경계 테스트",
  events: FATE_SEOUL_ACT_ZERO_EVENT_IDS.map((id, index) => ({
    id,
    name: `필수 사건 ${index + 1}`,
    type: "Fixed Timeline",
    visibility: "Hidden",
    status: "Planned",
    priority: 100 - index,
    required: true,
    sequence: index + 1,
  })),
  npcs: [
    ...demoScenario.npcs,
    {
      ...demoScenario.npcs[0],
      id: "NPC_FATE_SABER",
      name: "붉은 옥새의 소녀 검사",
      role: "Saber 클래스 서번트",
      hiddenInfo: "진명 정조 이산",
    },
  ],
};

test("Fate/Seoul 사건 서명이 있는 패키지만 작품 어댑터를 선택한다", () => {
  assert.equal(resolveWorkAdapter(actZeroPack)?.id, FATE_SEOUL_ADAPTER_ID);
  assert.equal(
    resolveWorkAdapterByRouteId(FATE_SEOUL_ACT_ZERO_ROUTE_ID)?.id,
    FATE_SEOUL_ADAPTER_ID,
  );

  const genericPack = {
    ...actZeroPack,
    projectId: "GENERIC-SERVANT-STORY",
    title: "일반 소환 판타지",
    events: actZeroPack.events.slice(0, -1),
  };
  assert.equal(resolveWorkAdapter(genericPack), undefined);
});

test("Fate/Seoul 단계 정책과 인물 선택은 어댑터 내부에서 결정한다", () => {
  const policy = fateSeoulRoutePolicy({
    phaseFloor: 6,
    currentMinutes: 23 * 60,
    turn: 8,
  });
  assert.equal(policy.phase, "accidental_summoning");
  assert.match(policy.strictRules.join(" "), /마스터인가/);
  assert.equal(primaryFateSeoulSaberNpc(actZeroPack)?.id, "NPC_FATE_SABER");
});

test("Fate/Seoul 단계 완료와 미래 사건 조기 진행을 어댑터가 판정한다", () => {
  assert.equal(
    fateSeoulRouteStepCompleted({
      phase: "accidental_summoning",
      currentEventId: "summoning",
      text: "소환진에서 소녀 검사가 현현했다.",
      milestoneTriggered: true,
      endsAtMasterQuestion: true,
      contractItemsSatisfied: true,
    }),
    true,
  );
  assert.equal(
    fateSeoulPrematureProgression({
      phase: "nadia_human_encounter",
      text: "종이가면 습격과 우발 소환이 한꺼번에 시작됐다.",
      routeStepCompleted: true,
    }),
    true,
  );
});

test("공통 이야기 감독 파일에는 Fate/Seoul 고유 인명과 사건 ID를 두지 않는다", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../lib/story-director.ts", import.meta.url), "utf8")
  );
  assert.doesNotMatch(source, /EV_PROLOGUE_/u);
  assert.doesNotMatch(source, /나디아|오요한|한명진|홍재|정조|이산/u);
});

test("공통 시뮬레이션 경로에는 Fate/Seoul 비상 복구 작성문을 두지 않는다", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../app/api/simulate/route.ts", import.meta.url), "utf8")
  );
  assert.doesNotMatch(
    source,
    /나디아|서촌|홍재|한시우|한명진|오요한|종이가면|방공호|명동성당/u,
  );
  assert.equal(typeof resolveWorkAdapter(actZeroPack)?.routeRecoveryDefaults, "function");
  assert.equal(
    typeof resolveWorkAdapter(actZeroPack)?.recoverRequiredEventReroute,
    "function",
  );
  assert.equal(
    typeof resolveWorkAdapter(actZeroPack)?.ensureCanonicalSummoningTurn,
    "function",
  );
});
