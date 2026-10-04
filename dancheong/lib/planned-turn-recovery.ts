import type { SimulateRequest } from "./engine";
import type { LiveScenePlan } from "./live-story-runtime";
import type { ClaudeTurnIntent } from "./claude-runtime";
import type { LiveCanonAnchorGuard } from "./live-canon-anchor";
import {
  explicitDurationMinutes,
  immediateRecoveryClock,
  minutesUntilEventDeadline,
  requestedTimeExceedsEventDeadline,
} from "./event-time-guard";

export type PlannedRecoveryContext = {
  failedNarration: string;
  failureReasons: string[];
};

export const isPlannedTurnRecovery = (request: SimulateRequest): boolean =>
  request.generationMode === "planned_recovery";

export const normalizePlannedRecoveryRequest = (
  body: SimulateRequest,
): Pick<SimulateRequest, "generationMode" | "recoveryContext"> => {
  if (body.generationMode !== "planned_recovery") {
    return { generationMode: "instant", recoveryContext: undefined };
  }
  return {
    generationMode: "planned_recovery",
    recoveryContext: {
      failedNarration: String(body.recoveryContext?.failedNarration ?? "").slice(0, 16_000),
      failureReasons: (body.recoveryContext?.failureReasons ?? [])
        .map((reason) => String(reason).slice(0, 600))
        .filter(Boolean)
        .slice(0, 12),
    },
  };
};

export const plannedRecoveryPromptContext = (
  request: SimulateRequest,
): Record<string, unknown> | undefined => isPlannedTurnRecovery(request) ? {
  mode: "v1.7.8_style_plan_first_retry",
  instruction: [
    "문단 교체를 다시 시도하지 않는다. 실패한 턴 전체를 폐기하고 현재 상태에서 새 실행계획을 먼저 완성한 뒤 처음부터 집필한다.",
    "실패 초안에서 이미 성립한 안전한 사용자 행동과 인물 인과는 보존하되, 실패 사유에 해당하는 시간·장소·미래 사건 진행은 계획 단계에서 제거한다.",
    "사용자의 목적을 거절하거나 무효화하지 말고, 현재 인물의 동기·관계·책임·외부 자극을 통해 활성 사건에 개연성 있게 흡수한다.",
    "장기 행동은 시작 단계만 짧게 성립시킨 뒤 ‘그러나 얼마 지나지 않아’에 해당하는 자연스러운 인물·환경 자극으로 끊는다. 사용자가 말한 먼 종료 시각까지 장면을 완주하지 않는다.",
    "계획의 targetTime은 현재로부터 수분 이내의 중단 지점으로 두고, 현재 비트 신호는 본문에서 한 번의 자연스러운 장면 행동으로 성립시킨다.",
  ],
  failedDraft: request.recoveryContext?.failedNarration ?? "",
  failureReasons: request.recoveryContext?.failureReasons ?? [],
} : undefined;

export const appendPlannedRecoveryPrompt = (
  dynamicPrompt: string,
  request: SimulateRequest,
): string => {
  const context = plannedRecoveryPromptContext(request);
  return context
    ? `${dynamicPrompt}\n\n[PLANNED_RECOVERY_PRIVATE]\n${JSON.stringify(context)}`
    : dynamicPrompt;
};

export const plannedRecoveryWriterInstruction = (request: SimulateRequest): string =>
  isPlannedTurnRecovery(request)
    ? "\n[계획형 재집필] 실패 초안의 문장을 고쳐 붙이지 말고, 방금 승인된 실행계획에 따라 같은 턴을 처음부터 새 장면으로 집필한다. plan.targetTime은 본문과 장부가 함께 지켜야 하는 이번 턴의 절대 상한이다. 사용자가 그보다 먼 시간을 요구했다면 장기 행동의 첫 단계만 짧게 보여 주고, 얼마 지나지 않아 끼어든 인물·책임·외부 자극으로 그 행동을 중단해 현재 사건으로 전환한다. 먼 종료 시각까지 완료된 경과로 쓰지 않는다. 사용자 목적과 안전하게 성립한 직접 행동은 보존하고 시간·장소 이탈은 인물 중심 인과로 활성 사건에 흡수한다.\n"
    : "";

export const hardenChronologyInterruptionPlan = ({
  plan,
  currentTime,
  currentLocation,
  eventTimeWindow,
  currentBeatSignals,
  requestedEndTime = "",
  requestedMinimumMinutes,
  nextBeatSignals = [],
  nextEventName = "",
  force = false,
}: {
  plan: LiveScenePlan;
  currentTime: string;
  currentLocation: string;
  eventTimeWindow: string;
  currentBeatSignals: string[];
  requestedEndTime?: string;
  requestedMinimumMinutes?: number | null;
  nextBeatSignals?: string[];
  nextEventName?: string;
  force?: boolean;
}): LiveScenePlan => {
  const requestExceedsWindow = requestedTimeExceedsEventDeadline({
    eventTimeWindow,
    currentTime,
    requestedEndTime,
    requestedDurationMinutes: requestedMinimumMinutes ?? undefined,
  });
  const planExceedsWindow = requestedTimeExceedsEventDeadline({
    eventTimeWindow,
    currentTime,
    requestedEndTime: plan.targetTime,
    requestedDurationMinutes: explicitDurationMinutes(plan.scenePlan),
  });
  if (!force && !requestExceedsWindow && !planExceedsWindow) return plan;

  const targetTime = immediateRecoveryClock(eventTimeWindow, currentTime);
  const beatEvidence = currentBeatSignals.at(0)?.trim();
  const nextBeatHandoff = nextBeatSignals.at(0)?.trim();
  const interruptionContract = `현재 ${currentTime}에서 시작해 ${targetTime} 안에 장면을 끊는다. 사용자가 요구한 장기 행동은 즉시 가능한 첫 행동과 의도만 잠깐 성립시키고, 완료 시각까지 압축하지 않는다. 얼마 지나지 않아 인물의 책임·외부 연락·환경 변화 중 현재 장면에 맞는 구체적 자극이 끼어들어 현재 사건 행동으로 전환된다.`;
  return {
    ...plan,
    scenePlan: [interruptionContract, plan.scenePlan].filter(Boolean).join(" "),
    endingDirection: beatEvidence
      ? `${beatEvidence}가 장기 행동을 끊고 즉각적인 대응이 시작되는 지점${nextBeatHandoff ? `에서 ${nextBeatHandoff}로 이어질 인계 직전` : ""}`
      : "현재 장면의 구체적 자극이 장기 행동을 끊고 즉각적인 대응이 시작되는 지점",
    targetTime,
    targetLocation: plan.targetLocation || currentLocation,
    mustShow: [...new Set([
      ...(plan.mustShow ?? []),
      "사용자 장기 행동의 즉시 가능한 첫 단계",
      "그 행동을 수분 안에 끊는 인물·환경의 구체적 자극",
      ...(beatEvidence ? [`현재 비트의 장면 증거: ${beatEvidence}`] : []),
    ])].slice(0, 8),
    mustAvoid: [...new Set([
      ...(plan.mustAvoid ?? []),
      `본문 시각 ${targetTime} 이후로 넘어가는 완료 묘사`,
      "저녁·밤·어두워짐·폐관·다음 날 등 아직 오지 않은 시간대의 확정 묘사",
      "사용자가 요구한 장기 행동을 요약문으로 끝까지 완료하는 서술",
      ...(nextEventName ? [`후속 사건 ‘${nextEventName}’의 시작·도착·결과를 이번 턴에 선행하는 서술`] : []),
    ])].slice(0, 6),
  };
};

export const liveCanonAnchorGuardForPlan = ({
  plan,
  intent,
  currentTime,
  currentLocation,
  eventTimeWindow,
  strictEventTime,
  canonAbsorptionRequired,
  eventName,
  currentBeatSignals,
  nextBeatSignals = [],
  nextEventName = "",
  rebaseToPlan = false,
}: {
  plan: LiveScenePlan;
  intent: ClaudeTurnIntent;
  currentTime: string;
  currentLocation: string;
  eventTimeWindow: string;
  strictEventTime: boolean;
  canonAbsorptionRequired: boolean;
  eventName: string;
  currentBeatSignals: string[];
  nextBeatSignals?: string[];
  nextEventName?: string;
  rebaseToPlan?: boolean;
}): LiveCanonAnchorGuard => ({
  active: true,
  currentTime,
  currentLocation,
  eventTimeWindow,
  eventLocation: plan.targetLocation || currentLocation,
  longSpan: rebaseToPlan ? false : intent.longSpan,
  restrictLocation: intent.highRiskTravel,
  highRiskTravel: intent.highRiskTravel,
  destinationHint: intent.destinationHint,
  requestedEndTime: rebaseToPlan ? plan.targetTime : intent.requestedEndTime,
  requestedMinimumMinutes: rebaseToPlan ? null : intent.requestedMinimumMinutes,
  deferredRequestedEndTime: intent.requestedEndTime,
  effectiveEndTime: plan.targetTime,
  strictEventTime,
  canonAbsorptionRequired,
  eventName,
  currentBeatSignals,
  nextBeatSignals,
  nextEventName,
});

export const hardenPlannedRecoveryPlan = ({
  request,
  plan,
  eventTimeWindow,
  currentBeatSignals,
  nextBeatSignals = [],
  nextEventName = "",
}: {
  request: SimulateRequest;
  plan: LiveScenePlan;
  eventTimeWindow: string;
  currentBeatSignals: string[];
  nextBeatSignals?: string[];
  nextEventName?: string;
}): LiveScenePlan => {
  if (!isPlannedTurnRecovery(request)) return plan;
  const remaining = minutesUntilEventDeadline(eventTimeWindow, request.state.time);
  const failedForChronology = (request.recoveryContext?.failureReasons ?? []).some((reason) =>
    /시간|시각|저녁|밤|날짜|장소|이동|정사/u.test(reason)
  );
  const planExceedsWindow = requestedTimeExceedsEventDeadline({
    eventTimeWindow,
    currentTime: request.state.time,
    requestedEndTime: plan.targetTime,
    requestedDurationMinutes: explicitDurationMinutes(plan.scenePlan),
  });
  const hardened = hardenChronologyInterruptionPlan({
    plan,
    currentTime: request.state.time,
    currentLocation: request.state.location,
    eventTimeWindow,
    currentBeatSignals,
    requestedEndTime: plan.targetTime,
    requestedMinimumMinutes: explicitDurationMinutes(plan.scenePlan),
    nextBeatSignals,
    nextEventName,
    force: failedForChronology || planExceedsWindow,
  });
  return {
    ...hardened,
    eventResolved: hardened.eventResolved && remaining === 0,
  };
};
