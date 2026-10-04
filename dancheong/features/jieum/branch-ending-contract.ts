import { orderedEvents } from "./cortex-event-design";
import type {
  BranchDecisionDefinition,
  RuntimePredicate,
} from "./package15-contract";
import type { Project } from "./studio-model";

export type BranchEndingFinding = {
  level: "ERROR" | "WARN" | "INFO";
  code: string;
  message: string;
  where?: string;
};

const predicateRefs = (
  predicate: RuntimePredicate,
): Array<{ kind: "event" | "flag" | "choice" | "character"; id: string }> => {
  if ("allOf" in predicate) return predicate.allOf.flatMap(predicateRefs);
  if ("anyOf" in predicate) return predicate.anyOf.flatMap(predicateRefs);
  if ("not" in predicate) return predicateRefs(predicate.not);
  if (predicate.kind === "event_completed")
    return [{ kind: "event", id: predicate.eventId }];
  if (predicate.kind === "flag_equals" || predicate.kind === "flag_at_least")
    return [{ kind: "flag", id: predicate.flagId }];
  if (predicate.kind === "choice_status")
    return [{ kind: "choice", id: predicate.choiceId }];
  if (predicate.kind === "relation_at_least")
    return [{ kind: "character", id: predicate.characterId }];
  return [];
};

export function validateBranchEndingContract(
  project: Project,
): BranchEndingFinding[] {
  const contract = project.package15.branchEnding;
  if (!project.package15.enabled || !contract.enabled) return [];
  const findings: BranchEndingFinding[] = [];
  const add = (
    level: BranchEndingFinding["level"],
    code: string,
    message: string,
    where = "",
  ) => findings.push({ level, code, message, where });
  const events = orderedEvents(project);
  const eventIds = new Set(events.map((event) => event.id));
  const flagIds = new Set(project.package15.flags.map((flag) => flag.id));
  const characterIds = new Set(
    [project.player, ...project.npcs].map((character) => character.id),
  );
  const choiceIds = new Set<string>();
  const decisionIds = new Set<string>();
  const decisionEvents = new Set<string>();
  const checkEnginePredicate = (predicate: RuntimePredicate, where: string): void => {
    if ('allOf' in predicate || 'anyOf' in predicate) {
      const children = 'allOf' in predicate ? predicate.allOf : predicate.anyOf;
      if (!children.length) add('ERROR', 'BRANCH_PREDICATE_EMPTY', '복합 분기 조건을 한 개 이상 지정하세요.', where);
      children.forEach(child => checkEnginePredicate(child, where));
    } else if ('not' in predicate) checkEnginePredicate(predicate.not, where);
    else if (project.packageTarget === 'cortex' && !['choice_status','event_completed','flag_equals','flag_at_least'].includes(predicate.kind)) {
      add('ERROR', 'CORTEX_PREDICATE_UNSUPPORTED', `Cortex 1.42.0은 ${predicate.kind} 분기 조건을 실행하지 않습니다. 공개 본문 선택 기록 또는 점수·플래그 조건으로 설계하세요.`, where);
    }
  };

  if (
    !project.package15.requiredFeatures.includes("branch_ending_convergence_v1")
  )
    add(
      "ERROR",
      "BRANCH_FEATURE_REQUIRED",
      "분기·엔딩 수렴을 켠 작품은 branch_ending_convergence_v1을 필수 기능으로 지정해야 합니다.",
    );
  if (!contract.primaryEndingGroupId.trim())
    add(
      "ERROR",
      "ENDING_GROUP_EMPTY",
      "배타적으로 확정할 대표 엔딩 그룹 ID를 입력하세요.",
    );
  if (
    flagIds.size !== project.package15.flags.length ||
    project.package15.flags.some((flag) => !flag.id.trim())
  )
    add(
      "ERROR",
      "BRANCH_FLAG_ID_INVALID",
      "분기에서 사용할 점수·플래그 ID가 비어 있거나 중복됩니다.",
    );
  for (const flag of project.package15.flags) {
    if (!flag.label.trim())
      add(
        "ERROR",
        "BRANCH_FLAG_LABEL_EMPTY",
        "점수·플래그의 표시 이름을 입력하세요.",
        flag.id,
      );
    if (flag.valueType === "number" && typeof flag.defaultValue !== "number")
      add(
        "ERROR",
        "BRANCH_FLAG_TYPE_MISMATCH",
        "숫자 점수의 기본값은 숫자여야 합니다.",
        flag.id,
      );
    if (flag.valueType === "boolean" && typeof flag.defaultValue !== "boolean")
      add(
        "ERROR",
        "BRANCH_FLAG_TYPE_MISMATCH",
        "참/거짓 플래그의 기본값 형식을 확인하세요.",
        flag.id,
      );
    if (flag.valueType === "string" && typeof flag.defaultValue !== "string")
      add(
        "ERROR",
        "BRANCH_FLAG_TYPE_MISMATCH",
        "문자열 플래그의 기본값 형식을 확인하세요.",
        flag.id,
      );
  }

  for (const choice of contract.choiceRecords) {
    if (!choice.id.trim() || choiceIds.has(choice.id))
      add(
        "ERROR",
        "CHOICE_ID_INVALID",
        "선택 기록 ID가 비어 있거나 중복됩니다.",
        choice.id,
      );
    choiceIds.add(choice.id);
    if (!eventIds.has(choice.sourceEventId))
      add(
        "ERROR",
        "CHOICE_SOURCE_MISSING",
        `선택을 판정할 사건 '${choice.sourceEventId}'을 찾을 수 없습니다.`,
        choice.id,
      );
    if (!choice.criterion.trim())
      add(
        "ERROR",
        "CHOICE_CRITERION_EMPTY",
        "공개 본문에서 확인할 행동 기준을 작성하세요.",
        choice.id,
      );
    if (choice.evaluationSource !== "PUBLIC_PROSE")
      add(
        "ERROR",
        "CHOICE_SOURCE_INVALID",
        "선택 판정 근거는 공개 본문이어야 합니다.",
        choice.id,
      );
    if (choice.applyPolicy !== 'ONCE_PER_EVENT') add('ERROR','CHOICE_APPLY_POLICY_INVALID','선택 기록은 사건마다 한 번 적용해야 합니다.',choice.id);
    if (choice.satisfiedEffect) {
      const effect = choice.satisfiedEffect, flag = project.package15.flags.find(f => f.id === effect.flagId);
      if (flag && (typeof effect.value !== flag.valueType || (effect.kind === 'increment_flag' && flag.valueType !== 'number')))
        add('ERROR','CHOICE_EFFECT_TYPE_MISMATCH','선택 효과 값의 형식이 대상 점수·플래그와 다릅니다.',choice.id);
    }
    if (choice.satisfiedEffect && !flagIds.has(choice.satisfiedEffect.flagId))
      add(
        "ERROR",
        "CHOICE_FLAG_MISSING",
        `선택 효과가 참조하는 플래그 '${choice.satisfiedEffect.flagId}'를 찾을 수 없습니다.`,
        choice.id,
      );
    if (
      choice.satisfiedEffect?.kind === "increment_flag" &&
      typeof choice.satisfiedEffect.value !== "number"
    )
      add(
        "ERROR",
        "CHOICE_INCREMENT_INVALID",
        "누적 점수는 숫자여야 합니다.",
        choice.id,
      );
  }

  for (const decision of contract.decisions) {
    if (!decision.id.trim() || decisionIds.has(decision.id))
      add(
        "ERROR",
        "BRANCH_ID_INVALID",
        "분기 ID가 비어 있거나 중복됩니다.",
        decision.id,
      );
    decisionIds.add(decision.id);
    if (decisionEvents.has(decision.decisionEventId)) add('ERROR','BRANCH_SOURCE_DUPLICATE','한 사건에는 하나의 분기 결정만 연결할 수 있습니다.',decision.id);
    decisionEvents.add(decision.decisionEventId);
    if (decision.matchPolicy !== 'FIRST_AUTHORED_MATCH') add('ERROR','BRANCH_MATCH_POLICY_INVALID','분기는 작가가 정한 조건 순서대로 선택해야 합니다.',decision.id);
    if (!eventIds.has(decision.decisionEventId))
      add(
        "ERROR",
        "BRANCH_SOURCE_MISSING",
        `분기 사건 '${decision.decisionEventId}'을 찾을 수 없습니다.`,
        decision.id,
      );
    if (!decision.rules.length)
      add(
        "ERROR",
        "BRANCH_RULES_EMPTY",
        "조건별 후속사건을 한 개 이상 추가하세요.",
        decision.id,
      );
    if (
      !decision.fallback.nextEventId ||
      !eventIds.has(decision.fallback.nextEventId)
    )
      add(
        "ERROR",
        "BRANCH_FALLBACK_MISSING",
        "조건 미달·미확정에도 진행할 작가 지정 안전 경로가 필요합니다.",
        decision.id,
      );
    if (!decision.fallback.acceptsUnevaluated)
      add(
        "ERROR",
        "BRANCH_UNEVALUATED_BLOCK",
        "판정 복구가 끝나도 미평가이면 기록을 그대로 보존한 채 안전 경로로 진행하도록 허용해야 합니다.",
        decision.id,
      );
    if (!decision.fallback.narrativeGuidance.trim())
      add(
        "ERROR",
        "BRANCH_FALLBACK_GUIDANCE_EMPTY",
        "안전 경로가 관계 훼손이나 조건 실패를 날조하지 않도록 연결 지침을 작성하세요.",
        decision.id,
      );
    if (![0,1,2].includes(decision.recoveryAttempts))
      add(
        "ERROR",
        "BRANCH_RECOVERY_UNBOUNDED",
        "미평가 복구 횟수는 0~2회로 제한하세요.",
        decision.id,
      );
    const ruleIds = new Set<string>();
    for (const rule of decision.rules) {
      checkEnginePredicate(rule.when, `${decision.id}/${rule.id}`);
      if (!rule.id.trim() || ruleIds.has(rule.id))
        add(
          "ERROR",
          "BRANCH_RULE_ID_INVALID",
          "분기 조건 ID가 비어 있거나 중복됩니다.",
          decision.id,
        );
      ruleIds.add(rule.id);
      if (!eventIds.has(rule.nextEventId))
        add(
          "ERROR",
          "BRANCH_TARGET_MISSING",
          `조건별 후속사건 '${rule.nextEventId}'을 찾을 수 없습니다.`,
          `${decision.id}/${rule.id}`,
        );
      for (const ref of predicateRefs(rule.when)) {
        const valid =
          ref.kind === "event"
            ? eventIds.has(ref.id)
            : ref.kind === "flag"
              ? flagIds.has(ref.id)
              : ref.kind === "choice"
                ? choiceIds.has(ref.id)
                : characterIds.has(ref.id);
        if (!valid)
          add(
            "ERROR",
            "BRANCH_PREDICATE_REF_MISSING",
            `${ref.kind} 참조 '${ref.id}'를 찾을 수 없습니다.`,
            `${decision.id}/${rule.id}`,
          );
      }
    }
  }

  const terminalEvents = new Set(
    project.package15.endings
      .filter(
        (ending) =>
          (ending.exclusiveGroupId || "primary") ===
          contract.primaryEndingGroupId,
      )
      .map((ending) => ending.terminalEventId || "")
      .filter(Boolean),
  );
  if (!terminalEvents.size)
    add(
      "ERROR",
      "ENDING_TERMINAL_MISSING",
      "대표 엔딩 그룹에 종결 사건을 하나 이상 지정하세요.",
    );
  const primaryTerminalIds = project.package15.endings
    .filter(
      (ending) =>
        (ending.exclusiveGroupId || "primary") ===
        contract.primaryEndingGroupId,
    )
    .map((ending) => ending.terminalEventId || "")
    .filter(Boolean);
  if (new Set(primaryTerminalIds).size !== primaryTerminalIds.length)
    add(
      "ERROR",
      "ENDING_TERMINAL_AMBIGUOUS",
      "같은 배타 엔딩 그룹에서 하나의 종결 사건을 여러 엔딩에 연결할 수 없습니다.",
    );
  for (const ending of project.package15.endings) {
    if ((ending.exclusiveGroupId || 'primary') === contract.primaryEndingGroupId && (!ending.id.trim() || !ending.terminalEventId))
      add('ERROR','ENDING_ID_OR_TERMINAL_EMPTY','대표 엔딩마다 ID와 종결 사건을 지정하세요.',ending.id);
    if (project.packageTarget === 'cortex' && (ending.exclusiveGroupId || 'primary') === contract.primaryEndingGroupId && ending.returnPolicy !== 'stay_ended')
      add('ERROR','CORTEX_ENDING_RETURN_UNSUPPORTED','Cortex 1.42.0의 분기 엔딩은 종료 상태 유지만 지원합니다. 회차 재시작·루트 선택 복귀는 엔진 업데이트가 필요합니다.',ending.id);
    if (ending.terminalEventId && !eventIds.has(ending.terminalEventId))
      add(
        "ERROR",
        "ENDING_EVENT_MISSING",
        `엔딩 종결 사건 '${ending.terminalEventId}'을 찾을 수 없습니다.`,
        ending.id,
      );
  }

  const decisions = new Map(
    contract.decisions.map((decision) => [decision.decisionEventId, decision]),
  );
  const nextByOrder = new Map(
    events.map((event, index) => [event.id, events[index + 1]?.id || ""]),
  );
  const outgoing = (eventId: string): string[] => {
    if (terminalEvents.has(eventId)) return [];
    const decision = decisions.get(eventId);
    if (decision)
      return [
        ...new Set(
          [
            ...decision.rules.map((rule) => rule.nextEventId),
            decision.fallback.nextEventId,
          ].filter(Boolean),
        ),
      ];
    const event = events.find((candidate) => candidate.id === eventId);
    const next = event?.nextEventId || nextByOrder.get(eventId) || "";
    return next ? [next] : [];
  };
  const state = new Map<string, "visiting" | "safe" | "unsafe">();
  const reachesEndingWithoutOpenCycle = (id: string): boolean => {
    if (terminalEvents.has(id)) return true;
    if (state.get(id) === "visiting") return false;
    if (state.get(id) === "safe") return true;
    if (state.get(id) === "unsafe") return false;
    state.set(id, "visiting");
    const targets = outgoing(id);
    const safe =
      targets.length > 0 &&
      targets.every(
        (target) =>
          eventIds.has(target) && reachesEndingWithoutOpenCycle(target),
      );
    state.set(id, safe ? "safe" : "unsafe");
    return safe;
  };
  for (const event of events) {
    if (!reachesEndingWithoutOpenCycle(event.id))
      add(
        "ERROR",
        "ENDING_CONVERGENCE_BROKEN",
        "이 사건에서 가능한 모든 진행 경로가 대표 엔딩 그룹으로 수렴하지 않습니다. 막다른 연결이나 무제한 반복을 확인하세요.",
        event.id,
      );
  }

  if (!findings.some((finding) => finding.level === "ERROR"))
    add(
      "INFO",
      "ENDING_CONVERGENCE_OK",
      "분기 조건의 충족·미달·미평가 경로가 모두 지정된 엔딩 그룹으로 수렴합니다.",
    );
  return findings;
}

export const defaultBranchDecision = (
  id: string,
  decisionEventId = "",
): BranchDecisionDefinition => ({
  id,
  name: "새 결말 분기",
  decisionEventId,
  rules: [],
  matchPolicy: "FIRST_AUTHORED_MATCH",
  recoveryAttempts: 1,
  fallback: {
    nextEventId: "",
    acceptsUnevaluated: true,
    narrativeGuidance:
      "조건 달성이나 실패를 새로 만들지 말고, 이미 공개된 사실을 유지하며 이 경로로 연결한다.",
  },
  unresolvedPolicy: "FALLBACK_WITHOUT_ASSERTING_CONDITION",
});
