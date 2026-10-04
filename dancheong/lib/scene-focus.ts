import {
  resolveVisibleCharacterAlias,
  type RuntimeState,
  type ScenarioPack,
  type StoryBlock,
} from "./scenario";

export type SceneFocusLevel = "normal" | "handoff" | "breakout";

export type SceneFocusRecentTurn = {
  turn?: number;
  blocks: Array<Pick<StoryBlock, "type" | "text" | "speakerId" | "speakerName">>;
  location?: string;
};

export type SceneFocusControl = {
  level: SceneFocusLevel;
  cohort: string;
  cohortLabel: string;
  consecutiveTurns: number;
  recentTurnCount: number;
  exhaustedSpeakerNames: string[];
  blockedRecommendationTerms: string[];
  requireHandoff: boolean;
  directives: string[];
};

export type SceneFocusAssessment = {
  handoffOccurred: boolean;
  supportingDialogueCount: number;
  packageCharacterTookLead: boolean;
  majorEventTookLead: boolean;
  supportingCastStillLeads: boolean;
  needsCorrection: boolean;
  reasons: string[];
};

type GeneratedTurnLike = {
  blocks?: Array<Pick<StoryBlock, "type" | "text" | "speakerId" | "speakerName">>;
  statePatch?: {
    location?: string;
    encounteredCharactersAdd?: Array<{ characterId?: string; name?: string }>;
    clockChanges?: unknown[];
    variablesResolve?: string[];
    inventoryAdd?: string[];
    inventoryRemove?: string[];
  };
};

const normalize = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

const compact = (value: string) =>
  normalize(value).replace(/[^\p{L}\p{N}]+/gu, "");

const INSTITUTIONAL_SUPPORT_PATTERN =
  /시설\s*(?:관리|지원|팀|기사)|시설관리|관리\s*(?:사무소|직원|팀장|팀|기사|인)|관리실|학생\s*지원|학생지원실|지원실|행정실|경비|보안\s*(?:요원|직원)|당직\s*(?:자|직원)|안내\s*(?:데스크|원|직원)|접수\s*(?:원|직원)|택배\s*(?:기사|담당|직원)|배달\s*기사|수위|관리인/u;

const GENERIC_SUPPORT_ROLE_PATTERN =
  /(?:^|[\s·_/-])(?:직원|담당자|기사|경비원|관리자|안내원|접수원|행인|목격자)(?:$|[\s·_/-])/u;

const STAFF_EXIT_PATTERN =
  /(?:직원|담당자|기사|경비|관리인|지원실|관리실|시설팀).{0,36}(?:물러났|떠났|사라졌|돌아갔|통화를\s*끊|업무로\s*복귀|더는\s*응답하지|현장을\s*벗어났|문을\s*닫았)/u;

const MAJOR_EVENT_PATTERN =
  /습격|공격|추격|침입|전투|검격|총격|폭발|붕괴|봉쇄|결계|마력|마술|주문|영기|소환|계약|서번트|이변|괴이|정체불명.{0,16}(?:인물|소녀|여성|남성)|피할\s*수\s*없는\s*위험/u;

const sameLocation = (left: string, right: string) => {
  const a = compact(left);
  const b = compact(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
};

const packageCharacterMatches = (
  pack: ScenarioPack,
  speakerId = "",
  speakerName = "",
) => {
  const resolved = resolveVisibleCharacterAlias(pack, speakerId, speakerName);
  return Boolean(resolved && !resolved.isPlayer);
};

const supportingCohort = (
  pack: ScenarioPack,
  speakerId = "",
  speakerName = "",
): string => {
  if (packageCharacterMatches(pack, speakerId, speakerName)) return "";
  const descriptor = normalize(`${speakerId} ${speakerName}`);
  if (INSTITUTIONAL_SUPPORT_PATTERN.test(descriptor)) {
    return "institutional_support";
  }
  if (
    /(?:^|[\s_-])dynamic(?:[\s_-]|$)/u.test(descriptor) &&
    GENERIC_SUPPORT_ROLE_PATTERN.test(descriptor)
  ) {
    return "generic_support";
  }
  return "";
};

const turnSupportingCohort = (
  pack: ScenarioPack,
  turn: SceneFocusRecentTurn,
): string => {
  const dialogue = turn.blocks.filter((block) => block.type === "dialogue");
  if (
    dialogue.some((block) =>
      packageCharacterMatches(pack, block.speakerId, block.speakerName)
    )
  ) {
    return "";
  }
  const cohorts = dialogue
    .map((block) => supportingCohort(pack, block.speakerId, block.speakerName))
    .filter(Boolean);
  if (cohorts.length) {
    return cohorts.sort(
      (left, right) =>
        cohorts.filter((item) => item === right).length -
        cohorts.filter((item) => item === left).length,
    )[0] ?? "";
  }
  const text = turn.blocks.map((block) => block.text).join("\n");
  const mentionsPackageCharacter = pack.npcs.some(
    (npc) => npc.name && text.includes(npc.name),
  );
  return !mentionsPackageCharacter && INSTITUTIONAL_SUPPORT_PATTERN.test(text)
    ? "institutional_support"
    : "";
};

const cohortTerms = (cohort: string): string[] => {
  if (cohort === "institutional_support") {
    return [
      "시설관리",
      "시설 관리",
      "시설팀",
      "관리실",
      "관리 직원",
      "학생지원실",
      "지원실 직원",
      "경비원",
      "택배 기사",
    ];
  }
  if (cohort === "generic_support") {
    return ["직원", "담당자", "기사", "관리자", "안내원", "접수원"];
  }
  return [];
};

export const analyzeSceneFocus = ({
  pack,
  recentTurns,
}: {
  pack: ScenarioPack;
  recentTurns: SceneFocusRecentTurn[];
}): SceneFocusControl => {
  const window = recentTurns.slice(-8);
  const cohorts = window.map((turn) => turnSupportingCohort(pack, turn));
  const cohort = cohorts.at(-1) ?? "";
  let consecutiveTurns = 0;
  if (cohort) {
    for (const candidate of [...cohorts].reverse()) {
      if (candidate !== cohort) break;
      consecutiveTurns += 1;
    }
  }
  const recentTurnCount = cohort
    ? cohorts.filter((candidate) => candidate === cohort).length
    : 0;
  const level: SceneFocusLevel = !cohort
    ? "normal"
    : consecutiveTurns >= 3 || recentTurnCount >= 4
      ? "breakout"
      : consecutiveTurns >= 2 || recentTurnCount >= 3
        ? "handoff"
        : "normal";
  const exhaustedSpeakerNames = cohort
    ? [
        ...new Set(
          window.flatMap((turn) =>
            turn.blocks
              .filter(
                (block) =>
                  block.type === "dialogue" &&
                  supportingCohort(pack, block.speakerId, block.speakerName) ===
                    cohort,
              )
              .map((block) => block.speakerName?.trim() ?? "")
              .filter(Boolean)
          ),
        ),
      ].slice(-8)
    : [];
  const cohortLabel = cohort === "institutional_support"
    ? "현장 지원·관리 인력"
    : cohort === "generic_support"
      ? "일회성 보조 인물"
      : "";
  const requireHandoff = level !== "normal";
  const directives = [
    "장면의 주도권은 패키지의 주요 인물·주요 세력·현재 사건에 둔다. 직전 응답에서 편의상 만든 일회성 인물을 반복 등장시켜 메인 출연진처럼 키우지 않는다.",
  ];
  if (requireHandoff) {
    directives.push(
      `${cohortLabel}이 최근 ${recentTurnCount}턴(연속 ${consecutiveTurns}턴) 장면을 점유했다. 이 보조 장면의 역할과 예산은 끝났다.`,
      "이번 응답에서 해당 인력은 새 의문·새 절차·새 담당자·추가 확인 과제를 만들지 않는다. 필요하면 한 번의 짧은 종료 반응만 남기고 장면의 주도권을 넘긴다.",
      "같은 조직의 다른 직원이나 담당자로 이름만 바꿔 이어 가지 않는다. 패키지의 현재 시각·사건표·NPC 계획에 맞는 주요 인물, 적대 세력, 되돌릴 수 없는 사건 결과 중 하나가 장면을 이어받아야 한다.",
      "플레이어가 이동을 선언하지 않았다면 플레이어를 대신 움직이지 않는다. 주요 인물의 연락·도착, 적대 행동, 환경 변화, 저위험 시간 압축 뒤의 관측 가능한 사건처럼 세계 쪽 원인으로 기존 보조 장면을 종료한다.",
      "추천 행동은 소진된 보조 인력에게 다시 질문·확인·요청하는 선택을 만들지 않고, 응답 마지막에 실제로 열린 새 상황만 대상으로 삼는다.",
    );
  }

  return {
    level,
    cohort,
    cohortLabel,
    consecutiveTurns,
    recentTurnCount,
    exhaustedSpeakerNames,
    blockedRecommendationTerms: requireHandoff
      ? [...new Set([...exhaustedSpeakerNames, ...cohortTerms(cohort)])]
      : [],
    requireHandoff,
    directives,
  };
};

export const assessSceneFocus = ({
  pack,
  state,
  focus,
  turn,
}: {
  pack: ScenarioPack;
  state: Pick<RuntimeState, "location">;
  focus: SceneFocusControl;
  turn: GeneratedTurnLike;
}): SceneFocusAssessment => {
  if (!focus.requireHandoff) {
    return {
      handoffOccurred: true,
      supportingDialogueCount: 0,
      packageCharacterTookLead: false,
      majorEventTookLead: false,
      supportingCastStillLeads: false,
      needsCorrection: false,
      reasons: [],
    };
  }
  const blocks = turn.blocks ?? [];
  const outputText = blocks.map((block) => block.text).join("\n");
  const dialogue = blocks.filter((block) => block.type === "dialogue");
  const supportingDialogueCount = dialogue.filter(
    (block) =>
      supportingCohort(pack, block.speakerId, block.speakerName) === focus.cohort,
  ).length;
  const packageCharacterTookLead = dialogue.some((block) =>
    packageCharacterMatches(pack, block.speakerId, block.speakerName)
  ) || (turn.statePatch?.encounteredCharactersAdd ?? []).some((character) =>
    packageCharacterMatches(pack, character.characterId, character.name)
  );
  const locationChanged = Boolean(
    turn.statePatch?.location &&
      !sameLocation(turn.statePatch.location, state.location),
  );
  const decisiveStateChange = [
    turn.statePatch?.clockChanges,
    turn.statePatch?.variablesResolve,
    turn.statePatch?.inventoryAdd,
    turn.statePatch?.inventoryRemove,
  ].some((items) => (items?.length ?? 0) > 0);
  const majorEventTookLead = MAJOR_EVENT_PATTERN.test(outputText) ||
    locationChanged;
  const staffExited = STAFF_EXIT_PATTERN.test(outputText);
  const lastDialogue = [...dialogue].reverse()[0];
  const lastDialogueIsSupporting = Boolean(
    lastDialogue &&
      supportingCohort(pack, lastDialogue.speakerId, lastDialogue.speakerName) ===
        focus.cohort,
  );
  const handoffOccurred =
    packageCharacterTookLead ||
    (majorEventTookLead && supportingDialogueCount <= 1) ||
    (staffExited && supportingDialogueCount <= 1 && decisiveStateChange);
  const supportingCastStillLeads =
    supportingDialogueCount >= 2 ||
    (supportingDialogueCount >= 1 && !handoffOccurred) ||
    (lastDialogueIsSupporting && !packageCharacterTookLead && !majorEventTookLead);
  const reasons: string[] = [];
  if (!handoffOccurred) {
    reasons.push("소진된 보조 NPC 장면에서 주요 인물·사건으로 주도권이 넘어가지 않음");
  }
  if (supportingDialogueCount >= 2) {
    reasons.push("보조 NPC가 두 블록 이상 계속 설명하거나 질문함");
  }
  if (lastDialogueIsSupporting && !packageCharacterTookLead && !majorEventTookLead) {
    reasons.push("응답의 마지막 대응 상대가 여전히 같은 보조 NPC임");
  }
  return {
    handoffOccurred,
    supportingDialogueCount,
    packageCharacterTookLead,
    majorEventTookLead,
    supportingCastStillLeads,
    needsCorrection: !handoffOccurred || supportingCastStillLeads,
    reasons,
  };
};

export const buildSceneFocusCorrection = (
  focus: SceneFocusControl,
  assessment: SceneFocusAssessment,
) => `
[장면 주도권 재작성 지시]
첫 작성은 보조 NPC 장면 종료 검사에 실패했다: ${assessment.reasons.join(", ") || "메인 사건으로 인계되지 않음"}.
- ${focus.cohortLabel || "일회성 보조 인물"}은 이미 최근 ${focus.recentTurnCount}턴 사용됐다. 새 단서, 새 절차, 다른 담당자, 추가 질문을 주지 말고 이번 응답에서 장면의 주연 자리에서 완전히 내린다.
- 이 인력의 대사는 없어도 되며 꼭 필요하면 종료용 한 블록만 허용한다. 두 번째 설명·경고·질문은 금지한다.
- 같은 조직의 다른 직원으로 교체하는 것은 인계가 아니다. 패키지에 등록된 주요 인물·세력 또는 현재 시각에 맞는 메인 사건이 실제 행동·연락·도착·공격·환경 변화로 장면을 이어받게 한다.
- 사용자가 이동·동의·대사·감정을 새로 보였다고 쓰지 않는다. 세계와 NPC 쪽 원인으로 전환하고, 마지막에는 새 주요 상황에 대한 플레이어의 대응 지점에서 멈춘다.
- 추천 행동에도 ${focus.blockedRecommendationTerms.join(", ") || "해당 보조 인력"}을 다시 상대하는 선택을 넣지 않는다.
`;
