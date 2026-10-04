import type { LiveBeatPolicy, LiveScenePlan } from "./live-story-runtime";

export const deriveLiveBeatPolicy = ({
  currentBeat,
  totalBeats,
  finalBeat,
  closureExtension = false,
  closureExtensionStage,
}: {
  currentBeat: number;
  totalBeats: number;
  finalBeat: boolean;
  closureExtension?: boolean;
  closureExtensionStage?: 1 | 2;
}): LiveBeatPolicy => {
  const beat = Math.max(1, currentBeat);
  const total = Math.max(1, totalBeats);
  if (finalBeat) {
    return {
      phase: "final_closure",
      beat,
      totalBeats: total,
      correctionLimit: 0,
      preserveFailedDraft: true,
      ...(closureExtension ? { closureExtension: true } : {}),
      ...(closureExtensionStage ? { closureExtensionStage } : {}),
    };
  }
  if (beat <= 1) {
    return {
      phase: "first_draft",
      beat,
      totalBeats: total,
      correctionLimit: 0,
      preserveFailedDraft: false,
    };
  }
  return {
    phase: "closure_build_up",
    beat,
    totalBeats: total,
    correctionLimit: 1,
    preserveFailedDraft: false,
  };
};

export const livePhaseWriterInstruction = (policy: LiveBeatPolicy): string =>
  policy.phase === "first_draft"
    ? "\n[비트 1 즉시 공개 정책]\n- 별도 초안 승인이나 전면 재작성 없이 지금 출력하는 첫 집필을 문장 도착 즉시 공개한다.\n- 진명·공개 전 정체, 아직 시작하지 않은 다음 사건의 실제 진행, 현재 정사 시각·장소를 건너뛴 장기 경과나 장거리 도착이 나오면 장면 전체를 폐기하지 않고 그 문단만 되감아 현재 사건 안에서 다시 쓴다. JSON 파손만 구조 실패로 중단한다.\n- 사용자의 장기 계획·이탈 욕구를 삭제하지 말고 생각·의도·준비·출발 같은 현재 가능한 시도로 보존한 뒤, 눈앞의 인물·상황이 즉시 반응하게 한다. 이미 1년이 지났거나 먼 장소에 도착한 것처럼 확정하지 않는다.\n- 현재 사건 계약에 명시된 다음 목적지 제안은 허용하지만, 도착·새 조우·후속 갈등 발생은 쓰지 않는다.\n- 그 밖의 문체·전개 취향은 첫 집필을 다시 쓰게 하지 않는다.\n- 사건을 조기 종결하지 않는다."
    : policy.phase === "closure_build_up"
      ? "\n[비트 2~마지막 전 실시간 교정 정책]\n- 이번 한 번의 집필에서 마지막 비트 종결의 원인이 될 관계 변화·단서·준비·압박을 실제 장면에 하나 이상 성립시킨다.\n- 공개 전 정보나 다음 사건의 실제 진행이 나오면 해당 문단만 되감아 현재 사건 안에서 다시 쓰며, 장면 전체를 폐기하지 않는다.\n- 현재 사건 계약에 명시된 인계·이동 제안까지만 허용하고 다음 장소 도착·새 조우·후속 갈등 발생은 쓰지 않는다.\n- 완성 뒤 의미 교정기는 부족한 마지막 문장 하나만 되감아 교체할 수 있으며, 사건 전체는 아직 닫지 않는다."
      : policy.closureExtensionStage === 2
        ? "\n[최종 강제 종결 턴 — 정사 인과 완결]\n- 앞선 확장 본문과 임시 종결 비트에도 남은 조건이 있어 허용된 마지막 턴이다. 새 갈등·새 의문·다음 사건을 만들지 말고 현재 사건의 남은 종결 사유를 모두 실제 장면으로 성립시킨다.\n- 사용자가 시간·장소 이탈을 선언해도 욕구를 짧게 인정한 뒤, 주인공의 책임·양심·관계·상대의 설득·부상·마감 압력 중 현재 인물에게 맞는 구체적 사유로 스스로 선택을 돌리게 한다. 갑작스러운 시스템 강제나 설명 없는 입력 취소는 금지한다.\n- 필요한 대화·확인·인계·이동은 분량 제한 없이 끝까지 쓴다. 시간·장소 이탈 문단과 공개 전 정보 문단은 해당 문단만 되감아 고친다.\n- closureContract의 필수 대사·물품·완료 신호·현재 비트 신호를 전부 직접 성립시키고 eventResolved=true로 닫는다."
        : policy.closureExtension
        ? "\n[추가된 최종 종결 비트 — 정사 강제 흡수]\n- 이 비트에서는 현재 사건의 종결이 최우선이다. 사용자가 밤샘·장거리 이탈·무관한 활동을 선언해도 그 욕구를 먼저 짧게 인정한 뒤, 주인공의 양심·책임·관계·부상·상대의 설득·시간 압박 중 현재 인물과 상황에 맞는 동기로 스스로 재고하게 한다.\n- 사용자의 이탈 행동을 아무 설명 없이 삭제하지 말고, 왜 지금은 실행하지 않거나 중단하는지가 인물 중심 인과로 납득되게 이어져야 한다. 이 전용 비트에서는 정사 종결을 위해 주인공이 마음을 돌리고 필요한 행동을 선택하는 서술을 허용한다.\n- 공개 전 정보가 나오면 해당 문단만 되감아 다시 쓰되 종결 인과와 결과는 보존한다.\n- closureContract의 필수 대사·물품·완료 신호·현재 비트 신호를 모두 직접 성립시키고 eventResolved=true로 닫는다. 현재 사건을 닫은 뒤 시간이 실제로 흐르고 장소를 옮기는 인과를 썼다면 다음 정사 사건의 첫 자극이나 도착 알림까지만 열 수 있고, 그 사건의 해결·획득·승패는 쓰지 않는다."
        : "\n[마지막 비트 확장 종결 정책]\n- 일반 장면의 분량 제한을 무시하고, 필요한 대화·상대 반응·확인·이동 제안·인계가 끝날 때까지 한 장면을 충분히 길게 이어 쓴다.\n- 공개 전 정보가 나오면 해당 문단만 되감아 다시 쓰되 종결 인과와 결과는 보존한다.\n- 제공된 closureContract의 필수 대사·물품·완료 신호·현재 비트 신호를 본문에서 직접 성립시키고 eventResolved=true로 닫는다. 단순히 곧 하겠다고 예고하는 것은 성립이 아니다.\n- 현재 시간창·장소·이동 가능성과 인물 동기를 지킨다. 현재 사건을 먼저 완결한 뒤에는 경과 시간과 이동 과정을 자연스럽게 연결해 다음 정사 사건의 첫 자극·도착 알림·새 대응 지점까지만 열 수 있다. 다음 사건의 해결·획득·승패·비밀 공개까지 끝내지는 않는다.\n- 그래도 물리적으로 남은 조건이 있으면 안전한 현재 장면을 보존하며, 서버가 종결 전용 비트 하나를 추가한다.";

export const firstBeatInstantPlan = (
  time: string,
  location: string,
  {
    eventName = "현재 장면",
    beatTitle = "",
    beatIntent = "",
    requiredEvidence = [],
    currentBeatSignals = [],
  }: {
    eventName?: string;
    beatTitle?: string;
    beatIntent?: string;
    requiredEvidence?: string[];
    currentBeatSignals?: string[];
  } = {},
): LiveScenePlan => ({
  scenePlan: `${eventName}${beatTitle ? ` · ${beatTitle}` : ""}의 현재 목적(${beatIntent || "사용자 입력이 만든 직접 변화"})을 장면의 중심에 둔다. 사용자 입력의 실행 가능한 시도와 현재 세계의 직접 반응을 첫 인과로 삼고, 범용 단서를 새로 덧붙이는 대신 인물·관계·위험·기회 중 하나를 실제로 변화시킨다.`,
  openingDirection: "사용자 입력 직후의 관측 가능한 직접 결과",
  endingDirection: "현재 비트의 구체적 목적이 한 단계 성립했음을 인물 반응으로 보여 주되 사건은 닫지 않는 변화 지점",
  mustShow: [...new Set([
    "사용자 입력의 직접 결과",
    beatIntent || "현재 장면의 의미 있는 변화",
    ...requiredEvidence,
    ...currentBeatSignals,
  ])].filter(Boolean).slice(0, 8),
  mustAvoid: [
    "진명 또는 공개 전 정체",
    "사건의 조기 종결",
    "근거 없는 새 기록·기호·소리·수수께끼 추가",
    "직전 장면의 도입·사물·질문 반복",
    "현재 시각·장소를 건너뛴 장기 시간 경과 또는 장거리 도착의 완료",
  ],
  targetTime: time,
  targetLocation: location,
  beatAdvanced: true,
  eventResolved: false,
});

export const middleBeatMicroPlan = ({
  time,
  location,
  requiredEvidence = [],
  currentBeatSignals = [],
  eventName = "현재 장면",
  beatTitle = "",
  beatIntent = "",
}: {
  time: string;
  location: string;
  requiredEvidence?: string[];
  currentBeatSignals?: string[];
  eventName?: string;
  beatTitle?: string;
  beatIntent?: string;
}): LiveScenePlan => ({
  scenePlan: `${eventName}${beatTitle ? ` · ${beatTitle}` : ""}의 현재 목적(${beatIntent || "마지막 비트의 원인이 될 구체적 변화"})을 수행한다. 사용자 입력의 직접 결과를 먼저 성립시키고, 그 결과가 현재 인물의 관계·결정·준비·위험에 미치는 한 단계의 변화를 장면에 쌓는다. 현재 목적이 단서 발견이 아닌데 범용 기록·기호·소리를 추가해서 대신하지 않는다.`,
  openingDirection: "사용자 입력의 실행 가능한 시도와 세계의 직접 반응",
  endingDirection: "현재 비트의 구체적 변화가 다음 비트에서 선택·대면·인계·결과로 이어질 수 있는 인물 중심 지점",
  mustShow: [...new Set([
    "사용자 입력의 직접 결과",
    beatIntent || "마지막 비트 종결을 위한 구체적 원인 하나",
    ...requiredEvidence,
    ...currentBeatSignals,
  ])].filter(Boolean).slice(0, 8),
  mustAvoid: [
    "진명 또는 공개 전 정체",
    "사건의 조기 종결",
    "다음 사건 시작",
    "근거 없는 새 기록·기호·소리·수수께끼 추가",
    "직전 장면의 도입·사물·질문 반복",
  ],
  targetTime: time,
  targetLocation: location,
  beatAdvanced: true,
  eventResolved: false,
});

export const liveFinalDisclosureBlocked = ({
  policy,
  identityLeakCount,
  disclosureLeakCount,
  futureEventLeakCount,
  controlLeakCount,
}: {
  policy?: LiveBeatPolicy;
  identityLeakCount: number;
  disclosureLeakCount: number;
  futureEventLeakCount: number;
  controlLeakCount: number;
}): boolean => {
  if (identityLeakCount > 0 || futureEventLeakCount > 0) return true;
  if (policy?.phase === "first_draft") return false;
  return disclosureLeakCount > 0 || controlLeakCount > 0;
};
