import type { RuntimeState, StoryBlock } from "./scenario";

export type NarrativeIntent =
  | "inspect"
  | "move"
  | "talk"
  | "confront"
  | "use"
  | "wait"
  | "other";

export type MomentumRecentTurn = {
  turn: number;
  userText?: string;
  blocks: StoryBlock[];
  location?: string;
  time?: string;
};

export type NarrativeMomentum = {
  level: "normal" | "advance" | "breakout";
  sceneTurnCount: number;
  recentUnresolvedTurns: number;
  repeatedIntent: boolean;
  recentSimilarity: number;
  explicitAction: boolean;
  intent: NarrativeIntent;
  requireMaterialChange: boolean;
  directives: string[];
};

export type GeneratedMomentumAssessment = {
  actionResolved: boolean;
  materialChange: boolean;
  sceneShift: boolean;
  hardTransition: boolean;
  microClueOnly: boolean;
  unresolvedPhraseCount: number;
  repeatedOutput: boolean;
  score: number;
  needsCorrection: boolean;
  reasons: string[];
};

type GeneratedTurnLike = {
  blocks?: Array<Pick<StoryBlock, "type" | "text">>;
  statePatch?: {
    time?: string;
    location?: string;
    sceneSummary?: string;
    statusAdd?: string[];
    statusRemove?: string[];
    inventoryAdd?: string[];
    inventoryRemove?: string[];
    relationChanges?: unknown[];
    clockChanges?: unknown[];
    memoryAdd?: string[];
    variablesAdd?: unknown[];
    variablesResolve?: string[];
    encounteredCharactersAdd?: unknown[];
    statusLedgerChanges?: unknown[];
    autonomyActions?: unknown[];
    relationshipMemoriesAdd?: unknown[];
    relationshipMemoryResolveIds?: string[];
  };
};

const normalizeLocation = (value: string) =>
  value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

const trigrams = (value: string): Set<string> => {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 5_000);
  const grams = new Set<string>();
  if (normalized.length < 3) {
    if (normalized) grams.add(normalized);
    return grams;
  }
  for (let index = 0; index <= normalized.length - 3; index += 1) {
    grams.add(normalized.slice(index, index + 3));
  }
  return grams;
};

export const narrativeSimilarity = (left: string, right: string): number => {
  const leftGrams = trigrams(left);
  const rightGrams = trigrams(right);
  if (!leftGrams.size || !rightGrams.size) return 0;
  let intersection = 0;
  leftGrams.forEach((gram) => {
    if (rightGrams.has(gram)) intersection += 1;
  });
  return intersection / (leftGrams.size + rightGrams.size - intersection);
};

export const locationsAreSame = (left: string, right: string): boolean => {
  const normalizedLeft = normalizeLocation(left);
  const normalizedRight = normalizeLocation(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  const shorter = normalizedLeft.length <= normalizedRight.length
    ? normalizedLeft
    : normalizedRight;
  const longer = shorter === normalizedLeft ? normalizedRight : normalizedLeft;
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  return narrativeSimilarity(normalizedLeft, normalizedRight) >= 0.46;
};

const turnText = (turn: MomentumRecentTurn) =>
  turn.blocks.map((block) => block.text).join("\n");

const unresolvedPhraseCount = (value: string): number =>
  value.match(
    /확인(?:되지|할 수 없)|알 수 없|판별(?:할 수 없|하기 어렵)|분간하기 어렵|원인은 (?:아직 )?(?:알 수 없|확인되지)|여전히|그대로(?:였|이다|남|유지)|변하지 않았|가능성(?:만|이 남)|끝내 (?:공란|알 수 없)|현재 확인(?:되는|된) 것은|확정할 수 없|신원은 .*확인되지/gu,
  )?.length ?? 0;

const CRISIS_EVENT_PATTERN =
  /(?:공격|추격|침입|대치|도주|탈출|정전|경보|폭발|붕괴|충돌|발각|습격|봉쇄|퇴거|강제로)|(?:누군가|인물|직원|경비|경찰).{0,24}(?:막아섰|붙잡|들이닥|빼앗|공격|연행|가로막)|(?:잠금|문|셔터|엘리베이터).{0,18}(?:강제로|갑자기|완전히).{0,10}(?:열렸|풀렸|닫혔|멈췄)/u;

export const classifyNarrativeIntent = (value: string): NarrativeIntent => {
  const text = value.normalize("NFKC").toLowerCase();
  if (/연다|열(?:어|고|자|다|었|린)|확인|살펴|조사|뒤져|검색|읽(?:어|고|는다)|꺼내|관찰|들여다/.test(text)) {
    return "inspect";
  }
  if (/간다|가자|이동|나간|떠난|벗어난|올라간|내려간|향한|돌아간|들어간/.test(text)) {
    return "move";
  }
  if (/묻(?:는|고|자|는다)|질문|말한다|대화|연락|전화|호출|답한다/.test(text)) {
    return "talk";
  }
  if (/공격|맞선|대치|제압|막아|붙잡|추격|도망|피한다|숨는다/.test(text)) {
    return "confront";
  }
  if (/사용|작동|누른|켜|끄|장착|건넨|놓는다|보낸다/.test(text)) {
    return "use";
  }
  if (/기다|집중|수업|미룬|넘긴|지켜본|가만히|쉬(?:기|자|다|기로|었다)|휴식|잠시\s*쉰|잠을\s*잔다/.test(text)) {
    return "wait";
  }
  return "other";
};

const isExplicitAction = (value: string, intent: NarrativeIntent) => {
  if (intent !== "other") return true;
  return /(?:한다|하자|해본다|시도한다|결정한다|선택한다|거절한다|받는다)[.!]?$/u.test(
    value.trim(),
  );
};

const sceneTurnCount = (
  currentLocation: string,
  recentTurns: MomentumRecentTurn[],
) => {
  const current = normalizeLocation(currentLocation);
  let count = 1;
  for (const turn of [...recentTurns].reverse()) {
    if (!turn.location) {
      count += 1;
      // 예전 저장 세션은 과거 턴의 위치 스냅샷이 없을 수 있다. 사용자가
      // 이동한 턴을 현재 장면의 시작점으로 보고 그 이전까지만 추정한다.
      if (classifyNarrativeIntent(turn.userText ?? "") === "move") break;
      if (count >= 8) break;
      continue;
    }
    if (!locationsAreSame(turn.location, current)) break;
    count += 1;
    if (count >= 8) break;
  }
  return count;
};

export const analyzeNarrativeMomentum = ({
  state,
  userText,
  recentTurns,
}: {
  state: Pick<RuntimeState, "location">;
  userText: string;
  recentTurns: MomentumRecentTurn[];
}): NarrativeMomentum => {
  const intent = classifyNarrativeIntent(userText);
  const explicitAction = isExplicitAction(userText, intent);
  const sameSceneTurns = sceneTurnCount(state.location, recentTurns);
  const recentIntents = recentTurns
    .slice(-3)
    .map((turn) => classifyNarrativeIntent(turn.userText ?? ""))
    .filter((value) => value !== "other");
  const repeatedIntent = intent !== "other" && recentIntents.includes(intent);
  const recentSceneTexts = recentTurns.slice(-3).map(turnText).filter(Boolean);
  const recentUnresolvedTurns = recentTurns
    .slice(-4)
    .filter((turn) => unresolvedPhraseCount(turnText(turn)) >= 2)
    .length;
  const similarities = recentSceneTexts.slice(1).map((text, index) =>
    narrativeSimilarity(recentSceneTexts[index] ?? "", text),
  );
  const recentSimilarity = similarities.length
    ? Math.max(...similarities)
    : 0;

  const level =
    sameSceneTurns >= 3 ||
      (sameSceneTurns >= 2 && repeatedIntent) ||
      (sameSceneTurns >= 2 && recentUnresolvedTurns >= 1) ||
      (sameSceneTurns >= 2 && recentSimilarity >= 0.62)
      ? "breakout"
      : sameSceneTurns >= 2 || repeatedIntent
        ? "advance"
        : "normal";
  const requireMaterialChange = level !== "normal" || explicitAction;

  const directives = [
    "사용자가 명시한 행동은 첫 1~2개 블록 안에서 실행하고, 관측 가능한 결과까지 이번 응답에 보여준다. 같은 행동을 다시 할지 묻지 않는다.",
    "새로운 플레이어 행동을 대신 만들지 않으면서도 NPC·환경·시간·장소·단서를 능동적으로 움직인다.",
    "짧은 입력도 짧은 응답 지시가 아니다. 행동 결과, 외부 반응, 사건 변화 또는 다음 갈고리까지 최소 3개의 인과적 비트를 한 턴에 진행한다.",
    "사용자가 한 문장만 입력해도 NPC와 세계가 기다리지 않고 각자의 목표에 따라 행동하게 한다.",
  ];
  if (intent === "inspect") {
    directives.push(
      "조사는 재차 살펴보라는 선택지로 끝내지 말고, 쓸 수 있는 단서·명확한 부재·구체적인 방해 중 하나를 확정한다.",
    );
  } else if (intent === "move") {
    directives.push(
      "이동이 가능하면 목적지 도착까지 처리한다. 불가능하면 즉시 막는 장애와 그 결과를 보여준다.",
    );
  } else if (intent === "talk") {
    directives.push(
      "질문이나 연락에는 NPC의 실제 답변·거절·무응답 중 하나를 확정하고, 다시 같은 질문을 권하지 않는다.",
    );
  } else if (intent === "wait") {
    directives.push(
      "기다리거나 일상에 집중하는 선택은 시간을 실제로 건너뛰고, 그동안 변한 관측 가능한 상황으로 연결한다.",
    );
  }
  if (level === "advance") {
    directives.push(
      `현재 장소의 장면이 ${sameSceneTurns}턴째다. 이번 응답 안에서 현재 소목표를 끝내고 새로운 대응 지점까지 진행한다.`,
    );
  }
  if (level === "breakout") {
    directives.push(
      `전개 정체가 감지됐다(${sameSceneTurns}턴, 유사도 ${recentSimilarity.toFixed(2)}). 이번 응답에서 현재 장면 비트를 반드시 종료한다.`,
      "비밀의 정답을 누설하지 말고도 문이 열림, 물건의 확인, NPC의 개입, 경보, 연락, 시간 경과, 장소 이탈처럼 플레이어가 지금 관측할 수 있는 결과를 발생시킨다.",
      "응답 마지막에는 직전과 다른 문제·대화 상대·위험·장소 중 하나가 열린 상태여야 한다.",
      "장면 요약 변경, 메모 추가, 화면 깜박임, 미세한 소리, 새 숫자 하나만으로는 전개로 계산하지 않는다. 같은 미스터리를 다른 표현으로 미루지 않는다.",
      "이번 응답에서는 단순한 추가 단서로 통과할 수 없다. 장소 전환, 새로운 주요 인물의 실질적 개입, 즉시 대응해야 할 위험, 사건·물건·자원의 되돌릴 수 없는 변화 중 최소 하나를 실제로 발생시킨다.",
      "플레이어가 이동을 선택하지 않았다면 플레이어를 대신 움직이지 말고, 현재 장소로 사건이나 NPC가 들이닥치게 하여 기존 장면을 끝낸다.",
    );
  }

  return {
    level,
    sceneTurnCount: sameSceneTurns,
    recentUnresolvedTurns,
    repeatedIntent,
    recentSimilarity,
    explicitAction,
    intent,
    requireMaterialChange,
    directives,
  };
};

const consequentialStateChangeCount = (patch: GeneratedTurnLike["statePatch"]) => {
  if (!patch) return 0;
  return [
    patch.statusAdd,
    patch.statusRemove,
    patch.inventoryAdd,
    patch.inventoryRemove,
    patch.relationChanges,
    patch.clockChanges,
    patch.variablesResolve,
    patch.encounteredCharactersAdd,
    patch.statusLedgerChanges,
    patch.autonomyActions,
    patch.relationshipMemoryResolveIds,
  ].reduce((sum, items) => sum + (items?.length ?? 0), 0);
};

const decisiveStateChangeCount = (patch: GeneratedTurnLike["statePatch"]) => {
  if (!patch) return 0;
  return [
    patch.inventoryAdd,
    patch.inventoryRemove,
    patch.clockChanges,
    patch.variablesResolve,
    patch.encounteredCharactersAdd,
    patch.autonomyActions,
  ].reduce((sum, items) => sum + (items?.length ?? 0), 0);
};

const actionWasResolved = (
  intent: NarrativeIntent,
  outputText: string,
  turn: GeneratedTurnLike,
  state: Pick<RuntimeState, "location" | "time">,
) => {
  const patch = turn.statePatch;
  if (intent === "inspect") {
    return /열렸|열리지|잠겼|꺼냈|확인|발견|드러|나타났|적혀|내용|흔적|단서|비어\s*있|없었다|반응했다/.test(
      outputText,
    );
  }
  if (intent === "move") {
    return Boolean(
      patch?.location && !locationsAreSame(patch.location, state.location),
    ) || /도착|나섰|벗어났|올라갔|내려갔|이동했|문을\s*나|향하는\s*길/.test(outputText);
  }
  if (intent === "talk") {
    return Boolean(turn.blocks?.some((block) => block.type === "dialogue")) ||
      /대답|답신|통화|연결|거절|응답|침묵|받지\s*않/.test(outputText);
  }
  if (intent === "wait") {
    return Boolean(patch?.time && patch.time !== state.time) ||
      /시간이\s*흘|수업이\s*끝|종료|잠시\s*뒤|분\s*후|시간\s*뒤/.test(outputText);
  }
  if (intent === "confront") {
    return /막았|피했|부딪|공격|제압|도망|추격|대치|상처|실패|성공/.test(outputText);
  }
  if (intent === "use") {
    return /작동|켜졌|꺼졌|눌렀|사용|반응|실패|멈췄|열렸/.test(outputText);
  }
  return /결과|변했|드러|발견|대답|도착|열렸|시작|끝났|실패|성공|감사|소개|떠났|멀어졌|향했다|작별/.test(
    outputText,
  );
};

export const assessGeneratedMomentum = ({
  state,
  recentTurns,
  momentum,
  turn,
}: {
  state: Pick<RuntimeState, "location" | "time" | "sceneSummary">;
  recentTurns: MomentumRecentTurn[];
  momentum: NarrativeMomentum;
  turn: GeneratedTurnLike;
}): GeneratedMomentumAssessment => {
  const outputText = (turn.blocks ?? []).map((block) => block.text).join("\n");
  const previousText = recentTurns.length
    ? turnText(recentTurns[recentTurns.length - 1])
    : "";
  const outputSimilarity = narrativeSimilarity(previousText, outputText);
  const repeatedOutput = outputSimilarity >= 0.62;
  const patch = turn.statePatch;
  const unresolvedCount = unresolvedPhraseCount(outputText);
  const locationChanged = Boolean(
    patch?.location && !locationsAreSame(patch.location, state.location),
  );
  const consequentialStateChange = consequentialStateChangeCount(patch) > 0;
  const decisiveStateChange = decisiveStateChangeCount(patch) > 0;
  const summaryChanged = Boolean(
    patch?.sceneSummary &&
      patch.sceneSummary.trim() &&
      narrativeSimilarity(patch.sceneSummary, state.sceneSummary) < 0.72,
  );
  const weakVisibleEvent = /발견|드러|나타났|다가왔|들어왔|울렸|꺼졌|켜졌|열렸|깨졌|도착|연결|대답|거절|막혔|사라졌|바뀌었|움직였|시작됐|끝났|실패|성공/.test(
    outputText,
  );
  const activeEvent =
    /(?:누군가|인물|남성|여성|직원|경비|학생|교수|목소리).{0,28}(?:다가왔|들어왔|나타났|막아섰|따라왔|붙잡|공격|건넸|외쳤)|(?:공격|추격|침입|대치|도주|탈출|정전|경보|폭발|붕괴|충돌|발각|습격)|(?:문|잠금|봉인|셔터|엘리베이터).{0,20}(?:열렸|풀렸|깨졌|찢어졌|멈췄|닫혔)/u.test(
      outputText,
    );
  const escalationEvent = CRISIS_EVENT_PATTERN.test(outputText);
  const recentCrisisAlreadyActive = recentTurns
    .slice(-3)
    .some((recentTurn) => CRISIS_EVENT_PATTERN.test(turnText(recentTurn)));
  const newEscalationEvent = escalationEvent && !recentCrisisAlreadyActive;
  const definitiveOutcome =
    /(?:택배함|보관함|상자|문|파일|기록|봉투|연락|통화).{0,24}(?:열렸|열리지 않았|비어 있었|없었|발견됐|복구됐|재생됐|연결됐|거절됐)|(?:획득|회수|분실|파손|확보|전달받|밝혀졌|확정됐|식별됐|해독됐)/u.test(
      outputText,
    );
  const sceneClosureText = `${outputText}\n${patch?.sceneSummary ?? ""}`;
  const conversationalSceneClosed =
    /(?:대화|만남|안내|용건).{0,48}(?:끝|마무리|종료)|(?:인물|남성|여성|학생|교수|연구자|방문자|그녀|그|나디아).{0,100}(?:감사|인사|고개를\s*(?:숙|끄덕)).{0,100}(?:떠났|멀어졌|향했다|걸어갔|돌아갔|자리를\s*떴|사라졌)|(?:떠났|멀어졌|향했다|걸어갔|자리를\s*떴).{0,80}(?:대화|만남|안내).{0,32}(?:끝|마무리|종료)/u.test(
      sceneClosureText,
    );
  const hardTransition =
    locationChanged || decisiveStateChange || newEscalationEvent ||
    conversationalSceneClosed;
  const sceneShift =
    hardTransition || consequentialStateChange || activeEvent || definitiveOutcome;
  const weakChange = Boolean(
    summaryChanged ||
      weakVisibleEvent ||
      (patch?.memoryAdd?.length ?? 0) > 0 ||
      (patch?.variablesAdd?.length ?? 0) > 0,
  );
  const microClueOnly = weakChange && !sceneShift;
  const materialChange = sceneShift && !(unresolvedCount >= 3 && !locationChanged && !consequentialStateChange && !activeEvent);
  const actionResolved = !momentum.explicitAction || actionWasResolved(
    momentum.intent,
    outputText,
    turn,
    state,
  );
  const score =
    (actionResolved ? 2 : 0) +
    (materialChange ? 2 : 0) +
    (locationChanged ? 1 : 0) +
    (hardTransition ? 2 : 0) +
    (consequentialStateChange ? 1 : 0) +
    (activeEvent ? 1 : 0) -
    (microClueOnly ? 2 : 0) -
    Math.min(3, unresolvedCount) -
    (repeatedOutput ? 2 : 0);
  const reasons: string[] = [];
  if (!actionResolved) reasons.push("명시된 행동의 결과가 확정되지 않음");
  if (!materialChange) reasons.push("새 단서·사건·상태·장소 변화가 없음");
  if (momentum.level === "breakout" && !hardTransition) {
    reasons.push(
      recentCrisisAlreadyActive && escalationEvent
        ? "이미 진행 중인 같은 위협을 새 전환처럼 반복함"
        : "같은 장소의 장면을 끝내는 전환이 없음",
    );
  }
  if (microClueOnly) reasons.push("미세한 단서만 늘고 장면의 문제는 그대로임");
  if (unresolvedCount >= 2) reasons.push("확인 불가·그대로·가능성 유보가 반복됨");
  if (repeatedOutput) reasons.push("직전 응답과 서술이 지나치게 유사함");
  const needsCorrection =
    (momentum.level === "breakout" &&
      (!materialChange || !hardTransition || microClueOnly || repeatedOutput || unresolvedCount >= 3)) ||
    (momentum.level === "advance" &&
      (microClueOnly || unresolvedCount >= 3)) ||
    (momentum.explicitAction && !actionResolved);

  return {
    actionResolved,
    materialChange,
    sceneShift,
    hardTransition,
    microClueOnly,
    unresolvedPhraseCount: unresolvedCount,
    repeatedOutput,
    score,
    needsCorrection,
    reasons,
  };
};

export const buildMomentumCorrection = (
  momentum: NarrativeMomentum,
  assessment: GeneratedMomentumAssessment,
) => `
[장면 전개 재작성 지시]
첫 작성은 전개 검사에 실패했다: ${assessment.reasons.join(", ") || "실질적 변화 부족"}.
- 같은 사용자 입력을 다시 처리하되 첫 1~2개 블록에서 명시된 행동의 관측 가능한 결과를 확정한다.
- 현재 장면의 소목표를 이번 응답에서 끝내고, 마지막에는 새로운 대응 지점을 연다.
- 장면 요약·메모·숫자·시간만 바꾸거나 작은 소리·화면 깜박임·새로운 미세 흔적 하나를 추가하는 것은 실패다.
- advance에서는 확정적인 조사 결과와 다음 대응 지점까지, breakout에서는 장소 전환·새 인물 개입·즉시 위험·사건/자원의 되돌릴 수 없는 변화까지 본문과 statePatch에 일치하게 실제 발생시킨다.
- 짧은 입력이어도 행동 결과 → NPC/환경 반응 → 사건 변화/다음 갈고리의 최소 3개 비트를 진행한다.
- '확인되지 않았다', '여전히', '그대로', '가능성만 남았다'로 같은 의문을 다시 유보하지 않는다. 비밀의 정답은 숨겨도 현재 행동의 결과는 확정한다.
- 직전 묘사와 같은 사물·질문·선택지를 표현만 바꿔 반복하지 않는다.
- 비밀이나 미래를 누설하지 않으며 플레이어의 새로운 행동·대사·감정을 만들지 않는다.
- 현재 추진력 단계: ${momentum.level}, 같은 장면 ${momentum.sceneTurnCount}턴째, 최근 유보 반복 ${momentum.recentUnresolvedTurns}턴, 입력 의도 ${momentum.intent}.
`;
