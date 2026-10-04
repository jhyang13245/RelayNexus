import assert from "node:assert/strict";
import test from "node:test";

import type { SimulateRequest } from "../lib/engine";
import {
  appendPlannedRecoveryPrompt,
  hardenChronologyInterruptionPlan,
  hardenPlannedRecoveryPlan,
  isPlannedTurnRecovery,
  normalizePlannedRecoveryRequest,
  plannedRecoveryPromptContext,
  plannedRecoveryWriterInstruction,
  liveCanonAnchorGuardForPlan,
} from "../lib/planned-turn-recovery";
import { liveCanonAnchorDriftReason, rebaseLiveCanonAnchorGuard } from "../lib/live-canon-anchor";

test("계획형 재집필 요청은 실패 원문과 사유를 제한된 비공개 계획 문맥으로 보존한다", () => {
  const request = {
    generationMode: "planned_recovery",
    recoveryContext: {
      failedNarration: "저녁 안내 방송이 흐르고 도서관 불이 켜졌다.",
      failureReasons: ["현재 사건의 시간창을 넘김"],
    },
  } as SimulateRequest;
  const normalized = normalizePlannedRecoveryRequest(request);
  const complete = { ...request, ...normalized } as SimulateRequest;

  assert.equal(isPlannedTurnRecovery(complete), true);
  assert.match(JSON.stringify(plannedRecoveryPromptContext(complete)), /실패한 턴 전체를 폐기/u);
  assert.match(JSON.stringify(plannedRecoveryPromptContext(complete)), /저녁 안내 방송/u);
  assert.match(plannedRecoveryWriterInstruction(complete), /처음부터 새 장면/u);
  assert.match(appendPlannedRecoveryPrompt("압축된 일반 문맥", complete), /v1\.7\.8_style_plan_first_retry/u);
});

test("계획형 재집필은 저녁 완료 계획을 사건 마감 안의 실행 계약으로 강제한다", () => {
  const request = {
    generationMode: "planned_recovery",
    userText: "휴대전화를 끄고 저녁까지 공부한다.",
    state: { time: "15:27", location: "대학교 도서관" },
    recoveryContext: {
      failedNarration: "저녁 안내 방송이 울렸다.",
      failureReasons: ["현재 사건의 시간창을 넘긴 시간 이탈"],
    },
  } as SimulateRequest;
  const hardened = hardenPlannedRecoveryPlan({
    request,
    eventTimeWindow: "15:30~18:00",
    currentBeatSignals: ["무인택배함 알림 확인", "수령함으로 향함"],
    plan: {
      scenePlan: "휴대전화를 끈 뒤 세 시간 동안 공부하고 저녁에 도서관을 나선다.",
      openingDirection: "휴대전화 종료",
      endingDirection: "저녁 귀가",
      mustShow: ["공부"],
      mustAvoid: [],
      targetTime: "19:00",
      targetLocation: "대학교 도서관",
      beatAdvanced: true,
      eventResolved: true,
    },
  });

  assert.equal(hardened.targetTime, "15:42");
  assert.equal(hardened.eventResolved, false);
  assert.match(hardened.scenePlan, /즉시 가능한 첫 행동과 의도/u);
  assert.match(hardened.mustShow.join(" "), /무인택배함 알림 확인/u);
  assert.match(hardened.mustAvoid.join(" "), /저녁·밤·어두워짐·폐관/u);
  assert.match(hardened.endingDirection, /장기 행동을 끊고/u);
});

test("일반 실시간 집필도 마감 밖 장기 입력을 수분 안의 정사 전환으로 자른다", () => {
  const hardened = hardenChronologyInterruptionPlan({
    currentTime: "15:27",
    currentLocation: "대학교 도서관",
    eventTimeWindow: "15:30~18:00",
    currentBeatSignals: ["무인택배함 알림 확인"],
    requestedEndTime: "19:00",
    requestedMinimumMinutes: 213,
    nextBeatSignals: ["택배함 앞으로 이동"],
    nextEventName: "두 번째 공명",
    plan: {
      scenePlan: "사용자 입력의 직접 결과를 보여 준다.",
      openingDirection: "공부를 시작한다.",
      endingDirection: "공부를 마친다.",
      mustShow: ["공부"],
      mustAvoid: [],
      targetTime: "15:27",
      targetLocation: "대학교 도서관",
      beatAdvanced: true,
      eventResolved: false,
    },
  });

  assert.equal(hardened.targetTime, "15:42");
  assert.match(hardened.scenePlan, /완료 시각까지 압축하지 않는다/u);
  assert.match(hardened.mustShow.join(" "), /무인택배함 알림 확인/u);
  assert.match(hardened.endingDirection, /택배함 앞으로 이동.*인계 직전/u);
  assert.match(hardened.mustAvoid.join(" "), /두 번째 공명.*선행/u);
});

test("계획형 재집필은 원래 19시 요청을 보류하고 새 계획 시각·현재 비트로 계약을 재발급한다", () => {
  const plan = {
    scenePlan: "공부를 시작하지만 택배 알림이 끼어들어 현재 사건에 대응한다.", openingDirection: "공부 시작",
    endingDirection: "알림 확인", mustShow: ["무인택배함 알림 확인"], mustAvoid: ["저녁 전환"],
    targetTime: "15:42", targetLocation: "대학교 도서관", beatAdvanced: true, eventResolved: false,
  };
  const guard = liveCanonAnchorGuardForPlan({
    plan, currentTime: "15:27", currentLocation: "대학교 도서관", eventTimeWindow: "15:30~18:00",
    strictEventTime: true, canonAbsorptionRequired: true, eventName: "첫 번째 택배",
    currentBeatSignals: ["무인택배함 알림 확인"], nextBeatSignals: ["택배함으로 이동"],
    nextEventName: "두 번째 공명", rebaseToPlan: true,
    intent: { longSpan: true, highRiskTravel: false, destinationHint: "", requestedEndTime: "19:00", requestedMinimumMinutes: 213 } as never,
  });

  assert.equal(guard.requestedEndTime, "15:42");
  assert.equal(guard.deferredRequestedEndTime, "19:00");
  assert.equal(guard.longSpan, false);
  assert.match(liveCanonAnchorDriftReason("그는 공부를 시작했다. 곧 무인택배함 알림을 확인했다.", guard) ?? "", /^$/u);

  const correctionGuard = rebaseLiveCanonAnchorGuard({ ...guard, requestedEndTime: "19:00", longSpan: true }, "15:42", false)!;
  assert.equal(correctionGuard.requestedEndTime, "15:42");
  assert.equal(correctionGuard.canonAbsorptionRequired, false);
});

test("일반 턴에는 계획형 재집필 문맥이 섞이지 않는다", () => {
  const request = { generationMode: "instant" } as SimulateRequest;
  assert.equal(isPlannedTurnRecovery(request), false);
  assert.equal(plannedRecoveryPromptContext(request), undefined);
  assert.equal(plannedRecoveryWriterInstruction(request), "");
  assert.equal(appendPlannedRecoveryPrompt("일반 문맥", request), "일반 문맥");
});
