type RecommendationCandidate = {
  label?: string;
  risk?: string;
};

export type RecommendationValidationMode = "strict" | "hard_only";

export type SafeRecommendation = {
  label: string;
  risk: "낮음" | "보통" | "높음";
};

type SceneAvailabilityBlock = {
  type?: string;
  text?: string;
  speakerName?: string;
};

const SCENE_DEPARTURE_PATTERN =
  /(?:떠났|떠나며|자리를\s*떴|벗어났|멀어졌|걸어갔|들어갔|안으로\s*들어|물러났|문이\s*닫|사라졌|발소리.{0,24}사라|통화(?:가|는)?.{0,24}(?:끊|끝|종료)|연결.{0,16}(?:끊|종료)|작별|대화가\s*(?:끝|마무리|종료)|만남이\s*(?:끝|마무리|종료))/u;

export const characterStillAvailableInScene = (
  characterName: string,
  blocks: SceneAvailabilityBlock[],
): boolean => {
  const dialogueIndex = blocks.findLastIndex(
    (block) => block.type === "dialogue" && block.speakerName === characterName,
  );
  if (dialogueIndex < 0) return false;
  const tail = blocks
    .slice(dialogueIndex + 1)
    .map((block) => block.text ?? "")
    .join(" ");
  return !SCENE_DEPARTURE_PATTERN.test(tail);
};

const EXPLICIT_STORY_SPOILER_PATTERN =
  /향후|훗날|머지않아|다가올|예정된|예고된|미래(?:의|에)|결말|엔딩|복선|(?:숨은|비밀|진짜)\s*(?:목표|계획|의도|목적|정체)|최종\s*(?:전|보스|결전|목표)|흑막|배후\s*세력|다음\s*(?:장면|턴|챕터|막)|\b(?:future|foreshadowing|ending|final\s*boss|hidden\s*(?:goal|plan|motive|identity)|secret\s*(?:goal|plan|motive)|next\s*(?:scene|turn|chapter))\b/i;

const PREDICTIVE_EVENT_PATTERN =
  /(?:곧|이후|앞으로|결국|조만간)[^.!?\n]{0,48}(?:등장|발생|습격|배신|암살|살해|죽|소환|각성|폭발|공격|도착|탈출|정체|밝혀|전쟁|결전|파멸|충돌|사라)|\b(?:soon|later|eventually|afterward)[^.!?\n]{0,48}(?:appear|happen|attack|betray|assassin|summon|awaken|explode|arrive|reveal|war|die)/i;

const CLAIMED_RESULT_PATTERN =
  /(?:정체|진상|배후|범인|진명|해답|비밀|원인)[^.!?\n]{0,24}(?:알아낸다|알게\s*된다|밝혀낸다|밝히게\s*된다|발견하게\s*된다)|(?:만나게|싸우게|배신당하게|죽게|구하게)\s*된다/i;

const PLOT_EVENT_TERMS = [
  "습격",
  "배신",
  "암살",
  "살해",
  "소환식",
  "결계 붕괴",
  "전쟁 개막",
  "폭발",
  "멸망",
  "파멸",
  "재앙",
  "흑막",
  "배후",
  "각성",
] as const;

const normalizeText = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim();

const compactMention = (value: string): string =>
  normalizeText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const ARTIFACT_HEAD_PATTERN =
  /열쇠|기록|문서|파일|USB|봉투|상자|장부|편지|메모|지도|사진|카드|반지|목걸이|유물|성유물|촉매|매개체|인장|증표|부적|조각|검|칼|창|총/u;

const mentionsForbiddenUnobservedTerm = (
  label: string,
  observableText: string,
  forbiddenTerms: string[],
): boolean => {
  const candidate = compactMention(label);
  const observed = compactMention(observableText);
  return forbiddenTerms.some((rawTerm) => {
    const term = compactMention(rawTerm);
    if (term.length < 2 || observed.includes(term)) return false;
    if (candidate.includes(term)) return true;

    // "황동열쇠"를 "열쇠"라고만 줄여 추천하는 우회도 막는다.
    const heads = rawTerm.match(new RegExp(ARTIFACT_HEAD_PATTERN.source, "gu")) ?? [];
    return heads.some((head) => {
      const compactHead = compactMention(head);
      return candidate.includes(compactHead) && !observed.includes(compactHead);
    });
  });
};

export const findUnobservedExactTerms = (
  value: string,
  observableText: string,
  restrictedTerms: string[],
): string[] => {
  const candidate = compactMention(value);
  const observed = compactMention(observableText);
  return [
    ...new Set(
      restrictedTerms.filter((rawTerm) => {
        const term = compactMention(rawTerm);
        return term.length >= 2 &&
          candidate.includes(term) &&
          !observed.includes(term);
      }),
    ),
  ];
};

export const containsStorySpoiler = (value: string): boolean => {
  const text = normalizeText(value);
  if (!text) return false;
  return (
    EXPLICIT_STORY_SPOILER_PATTERN.test(text) ||
    PREDICTIVE_EVENT_PATTERN.test(text)
  );
};

export const mentionsUnobservedPlotClaim = (
  value: string,
  observableText: string,
): boolean => {
  const text = normalizeText(value);
  const observed = normalizeText(observableText);
  return PLOT_EVENT_TERMS.some(
    (term) => text.includes(term) && !observed.includes(term),
  );
};

const normalizeRisk = (risk: string | undefined): SafeRecommendation["risk"] =>
  risk === "낮음" || risk === "높음" ? risk : "보통";

const withoutInlineRiskPrefix = (value: string): string =>
  value.replace(
    /^(?:(?:위험도\s*)?(?:낮음|보통|높음)\s*(?:[:：·|/\\\-–—]\s*)?)+/u,
    "",
  ).trim();

const RECOMMENDATION_CONTEXT_STOP_WORDS = new Set(
  [
    "그리고", "그러나", "하지만", "그래서", "때문", "대한", "통해", "위해",
    "그런데", "그러면", "그렇지만",
    "현재", "지금", "당장", "이번", "방금", "여기", "저기", "그곳", "이곳",
    "상황", "사실", "문제", "상대", "인물", "사람", "장소", "행동", "방법",
    "실제", "내용", "부분", "이름", "남아", "오늘", "이제", "한시우", "주인공",
    "오전", "오후", "새벽", "아침", "점심", "저녁", "밤", "연도", "날짜", "시간",
    "월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일",
    "무엇", "어디", "어떻게", "가장", "먼저", "함께", "직접", "즉시", "관련",
    "말했다", "말한다", "말하며", "물었다", "묻는다", "답한다", "대답한다",
    "요청한다", "요구한다", "제안한다", "확인한다", "바라보았다", "보였다",
    "보인다", "있었다",
    "있다", "없는", "아직", "다시", "the", "and", "that", "this", "with",
    "from", "into", "about", "now", "here", "there", "current", "situation",
  ].map((item) => compactMention(item)),
);

const CONTEXT_TOKEN_SUFFIX_PATTERN =
  /(?:으로부터|에게서는|에게서|에서는|으로는|이라는|이라고|이라며|이라면|까지는|부터는|처럼|보다|마다|에게|께서|에서|으로|로서|로써|에는|은|는|이|가|을|를|의|와|과|만|에)$/u;

const CONTEXT_VERB_ENDING_PATTERN =
  /(?:했다|한다|됩니다|된다|됐다|이었다|였다|있다|없다|보였다|들렸다|나타났다|사라졌다|바라보다|바라봤다|돌렸다|말했다|물었다|설명했다|설명한다|발견했다|확인했다|교차했다|움직였다|이어졌다|끝났다)$/u;

const contextToken = (value: string): string => {
  const compact = compactMention(value);
  if (compact.length < 2) return compact;
  const stripped = compact.replace(CONTEXT_TOKEN_SUFFIX_PATTERN, "");
  return stripped.length >= 2 ? stripped : compact;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const recommendationTargetsUnavailableCharacter = (
  label: string,
  unavailableCharacterNames: string[],
): boolean =>
  unavailableCharacterNames.some((rawName) => {
    const name = normalizeText(rawName);
    if (!name || !normalizeText(label).includes(name)) return false;
    const escaped = escapeRegExp(name);
    return new RegExp(
      `(?:${escaped}(?:에게|한테|께|와|과|을|를)?[^.!?\\n]{0,48}(?:묻|질문|대화|말을\\s*건|연락|전화|통화|찾아가|만나|요청|요구|제안|따라가|함께\\s*가)|(?:묻|질문|대화|연락|전화|통화|찾아가|만나|요청|요구|제안)[^.!?\\n]{0,48}${escaped})`,
      "u",
    ).test(label);
  });

const recommendationFocusAnchors = (
  focusText: string,
  speakerName = "",
  excludedAnchors: string[] = [],
): string[] => {
  const speakerTokens = new Set(
    normalizeText(speakerName)
      .match(/[\p{L}\p{N}]+/gu)
      ?.map(contextToken)
      .filter(Boolean) ?? [],
  );
  const values = normalizeText(focusText).match(/[\p{L}\p{N}]+/gu) ?? [];
  const excludedTokens = new Set(
    excludedAnchors
      .flatMap((value) => normalizeText(value).match(/[\p{L}\p{N}]+/gu) ?? [])
      .map(contextToken)
      .filter(Boolean),
  );
  const ranked = new Map<string, { value: string; count: number; last: number }>();
  values.forEach((rawValue, index) => {
    const key = contextToken(rawValue);
    if (
      key.length < 2 ||
      RECOMMENDATION_CONTEXT_STOP_WORDS.has(key) ||
      CONTEXT_VERB_ENDING_PATTERN.test(key) ||
      speakerTokens.has(key) ||
      excludedTokens.has(key) ||
      /^\d+$/u.test(key) ||
      /^(?:(?:19|20)\d{2}년?|\d{1,2}(?:월|일|시|분|년))$/u.test(key)
    ) {
      return;
    }
    const existing = ranked.get(key);
    ranked.set(key, {
      value: key,
      count: (existing?.count ?? 0) + 1,
      last: index,
    });
  });
  return [...ranked.values()]
    .sort((a, b) => {
      const aScore = a.count * 20 + a.last / Math.max(1, values.length) + Math.min(8, a.value.length);
      const bScore = b.count * 20 + b.last / Math.max(1, values.length) + Math.min(8, b.value.length);
      return bScore - aScore;
    })
    .map((item) => item.value)
    .slice(0, 12);
};

const recommendationMatchesFocus = (
  label: string,
  focusText: string,
  speakerName = "",
): boolean => {
  if (!normalizeText(focusText)) return true;
  const sharedSceneDomain = [
    /택배|배송|발송|수령|보관함|택배함|봉투|상자/u,
    /위협|추적|습격|공격|흉기|정전|폭발|붕괴/u,
    /길|동선|출구|정류장|셔틀|버스|지하철|이동/u,
    /신고|경비|경계|반동|남은\s*힘|거절|목격|책임|충돌|제지|상대|주변\s*사람|휴대전화/u,
  ].some((pattern) => pattern.test(label) && pattern.test(focusText));
  if (sharedSceneDomain) return true;
  const candidate = compactMention(label);
  const speaker = compactMention(speakerName);
  if (
    speaker &&
    candidate.includes(speaker) &&
    /묻|질문|설명|말|대답|요청|제안|거절|수락|결정/u.test(label)
  ) {
    return true;
  }
  const anchors = recommendationFocusAnchors(focusText, speakerName);
  if (!anchors.length) {
    const speaker = compactMention(speakerName);
    return !speaker || candidate.includes(speaker);
  }
  return anchors.some((anchor) => candidate.includes(anchor));
};

const hasBrokenKoreanObjectParticle = (value: string): boolean => {
  for (const match of value.matchAll(/([가-힣])([을를])/gu)) {
    const code = match[1].charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) continue;
    const hasFinalConsonant = (code - 0xac00) % 28 !== 0;
    if ((hasFinalConsonant && match[2] === "를") ||
      (!hasFinalConsonant && match[2] === "을")) {
      return true;
    }
  }
  return false;
};

const AWKWARD_RECOMMENDATION_PATTERN =
  /(?:에게\s*(?:문장|소리|빛|대답)(?:에|을|를|과|와|\s)|(?:문장|소리|빛)(?:을|를)\s*이용해)/u;

const DATE_AS_ACTION_TARGET_PATTERN =
  /(?:(?:19|20)\d{2}년|\d{1,2}월\s*\d{1,2}일|(?:월|화|수|목|금|토|일)요일)(?:의|을|를|에|에서|부터|까지)?\s*(?:현재\s*)?(?:상태|상황|기록|정리|처리|동선|확인|이동)/u;

const ABSTRACT_RECOMMENDATION_PATTERN =
  /(?:현재\s*상태|관련\s*기록|현재\s*장소|다음\s*동선|주변\s*상황|확인된\s*사실|눈앞의\s*문제)(?:을|를|의|에서)?[^.!?\n]{0,34}(?:확인|처리|정리|결정|이동|살피|바꾼)/u;

const immediateFallbacks = (
  speakerName: string,
  focusText = "",
  excludedAnchors: string[] = [],
): SafeRecommendation[] => {
  const anchors = recommendationFocusAnchors(
    focusText,
    speakerName,
    excludedAnchors,
  );
  const tangibleAnchors = anchors.filter((anchor) =>
    /(?:택배|보관함|봉투|상자|알림|메시지|휴대전화|지도|안내도|정류장|셔틀|별관|본관|캠퍼스|복도|출구|통로|현관|문|창문|우산|찻잔|신발|사진|가방|소지품|열쇠|기록|문서|조각|물품|흔적|파형|능력|공진|편향|가속|계약|제안|질문|위협|추적자|공격)/u.test(
      anchor,
    )
  );
  const anchor = (index: number) =>
    tangibleAnchors[index] ?? tangibleAnchors[0] ?? anchors[index] ?? anchors[0] ?? "주변 상황";

  if (speakerName) {
    return [
      {
        label: `${speakerName}에게 ${anchor(0)}에 관해 지금 결정해야 할 점을 구체적으로 묻는다.`,
        risk: "낮음",
      },
      {
        label: `${anchor(0)}에 대응하도록 ${speakerName}에게 구체적인 행동을 요청한다.`,
        risk: "보통",
      },
      {
        label: `${speakerName}의 답을 기다리지 않고 ${anchor(0)}에 직접 대응한다.`,
        risk: "높음",
      },
    ];
  }
  if (/(?:택배|보관함|봉투|상자|배송|발송|수령)/u.test(focusText)) {
    const alreadyAtStorage = /(?:보관함|택배함).{0,24}(?:앞|도착|마주|눈앞)|(?:앞|도착).{0,24}(?:보관함|택배함)/u.test(
      focusText,
    );
    return [
      {
        label: alreadyAtStorage
          ? "보관함의 수령 절차를 진행해 안의 물품을 직접 꺼낸다."
          : "택배 알림에 표시된 보관함으로 이동해 물품을 수령한다.",
        risk: "낮음",
      },
      { label: "택배 알림의 발송 정보와 보관 위치를 대조한 뒤 수령 절차를 진행한다.", risk: "보통" },
      { label: "보관함을 열어 내용물을 확인하고 필요한 물품을 바로 챙긴다.", risk: "높음" },
    ];
  }
  if (/(?:집|현관|부엌|방|주택|자택)/u.test(focusText)) {
    const roomObject = /찻잔/u.test(focusText)
      ? "부엌의 찻잔"
      : /가방/u.test(focusText)
        ? "방에 남은 가방"
        : "집 안에 남은 소지품";
    return [
      { label: `${roomObject}을 정리하며 주인이 남긴 단서를 찾는다.`, risk: "낮음" },
      {
        label: "집주인이 돌아오지 않은 기간의 생활 흔적을 정리해 마지막 행선지를 찾는다.",
        risk: "보통",
      },
      {
        label: /찻잔/u.test(focusText)
          ? "부엌의 찻잔 무늬를 사진으로 남긴 뒤 현관 밖으로 이동한다."
          : "집 안의 소지품을 사진으로 남긴 뒤 현관 밖으로 이동한다.",
        risk: "높음",
      },
    ];
  }
  if (/(?:위협|추적자|습격|공격|칼날|흉기|정전|폭발|붕괴)/u.test(focusText)) {
    return [
      { label: `${anchor(0)}과 거리를 벌릴 수 있는 출구로 이동한다.`, risk: "낮음" },
      { label: "주변 장애물을 이용해 공격을 막고 도움을 요청한다.", risk: "높음" },
      { label: "휴대전화로 현재 위치와 위협을 외부에 알린다.", risk: "보통" },
    ];
  }
  if (/(?:길|동선|출구|정류장|셔틀|버스|지하철|이동|도착|떠났)/u.test(focusText)) {
    return [
      { label: `${anchor(0)}을 기준으로 지금 이동할 방향을 정한다.`, risk: "낮음" },
      { label: "휴대전화 지도에서 현재 위치와 이동 경로를 확인한다.", risk: "보통" },
      { label: "현재 장소를 떠나 가장 가까운 공개 동선으로 이동한다.", risk: "높음" },
    ];
  }
  return [
    { label: `${anchor(0)}에 직접 손을 대 지금 필요한 처리를 시작한다.`, risk: "낮음" },
    { label: `${anchor(0)}에 연결된 ${anchor(1)}에서 다른 해결 방법을 시도한다.`, risk: "보통" },
    { label: `${anchor(0)}에서 가장 위험해 보이는 부분을 감수하고 즉시 행동한다.`, risk: "높음" },
  ];
};

const STALLING_RECOMMENDATION_PATTERN =
  /(?:다시|계속|더|좀 더|한 번 더|자세히).{0,28}(?:확인|살피|살핀|조사|관찰|대조|기다)/u;

const PROGRESSIVE_RECOMMENDATION_PATTERN =
  /(?:벗어난|이동|떠난|나간|올라간|내려간|향한다|찾아간|연락|전화|신고|요청|요구|제안|설명|결정|거절|수락|대답|답한다|묻는다|말한다|대면|추적|회수|확보|전달|사용|작동|연다|꺼낸|챙긴|수령|진행|처리|정리|막는다|도망|피한다|도움|행동|시도|확인한다|살핀다|찾는다|조사한다)/u;

export const recommendationIsImmediate = (
  label: string,
  options: {
    observableText: string;
    focusText?: string;
    speakerName?: string;
    forbiddenNames?: string[];
    forbiddenTerms?: string[];
    excludedTerms?: string[];
    characterNames?: string[];
    availableCharacterNames?: string[];
    requireProgressive?: boolean;
  },
): boolean => {
  const text = normalizeText(label);
  if (text.length < 4 || text.length > 140) return false;
  if (
    containsStorySpoiler(text) ||
    CLAIMED_RESULT_PATTERN.test(text) ||
    AWKWARD_RECOMMENDATION_PATTERN.test(text) ||
    DATE_AS_ACTION_TARGET_PATTERN.test(text) ||
    ABSTRACT_RECOMMENDATION_PATTERN.test(text) ||
    hasBrokenKoreanObjectParticle(text)
  ) {
    return false;
  }
  if (
    (options.forbiddenNames ?? []).some(
      (name) => name && text.includes(name),
    )
  ) {
    return false;
  }
  if (
    (options.excludedTerms ?? []).some((term) => {
      const excluded = compactMention(term);
      return excluded.length >= 2 && compactMention(text).includes(excluded);
    })
  ) {
    return false;
  }
  const availableCharacterKeys = new Set(
    (options.availableCharacterNames ?? []).map(compactMention).filter(Boolean),
  );
  const unavailableCharacterNames = (options.characterNames ?? []).filter(
    (name) => !availableCharacterKeys.has(compactMention(name)),
  );
  if (
    recommendationTargetsUnavailableCharacter(text, unavailableCharacterNames)
  ) {
    return false;
  }
  if (
    mentionsForbiddenUnobservedTerm(
      text,
      options.observableText,
      options.forbiddenTerms ?? [],
    )
  ) {
    return false;
  }
  if (
    options.requireProgressive &&
    (STALLING_RECOMMENDATION_PATTERN.test(text) ||
      !PROGRESSIVE_RECOMMENDATION_PATTERN.test(text))
  ) {
    return false;
  }
  if (
    options.focusText &&
    !recommendationMatchesFocus(
      text,
      options.focusText,
      options.speakerName,
    )
  ) {
    return false;
  }
  return !mentionsUnobservedPlotClaim(text, options.observableText);
};

export const recommendationHasHardError = (
  label: string,
  options: {
    observableText: string;
    forbiddenNames?: string[];
    forbiddenTerms?: string[];
    excludedTerms?: string[];
    characterNames?: string[];
    availableCharacterNames?: string[];
  },
): boolean => {
  const text = normalizeText(label);
  if (text.length < 4 || text.length > 140) return true;
  if (containsStorySpoiler(text) || CLAIMED_RESULT_PATTERN.test(text)) return true;
  if (
    (options.forbiddenNames ?? []).some(
      (name) => name && text.includes(name),
    )
  ) {
    return true;
  }
  if (
    (options.excludedTerms ?? []).some((term) => {
      const excluded = compactMention(term);
      return excluded.length >= 2 && compactMention(text).includes(excluded);
    })
  ) {
    return true;
  }
  const availableCharacterKeys = new Set(
    (options.availableCharacterNames ?? []).map(compactMention).filter(Boolean),
  );
  const unavailableCharacterNames = (options.characterNames ?? []).filter(
    (name) => !availableCharacterKeys.has(compactMention(name)),
  );
  if (recommendationTargetsUnavailableCharacter(text, unavailableCharacterNames)) {
    return true;
  }
  if (
    mentionsForbiddenUnobservedTerm(
      text,
      options.observableText,
      options.forbiddenTerms ?? [],
    )
  ) {
    return true;
  }
  return mentionsUnobservedPlotClaim(text, options.observableText);
};

export const sanitizeRecommendedReplies = (
  candidates: RecommendationCandidate[] | undefined,
  options: {
    observableText: string;
    focusText?: string;
    speakerName?: string;
    forbiddenNames?: string[];
    forbiddenTerms?: string[];
    excludedTerms?: string[];
    characterNames?: string[];
    availableCharacterNames?: string[];
    requireProgressive?: boolean;
    validationMode?: RecommendationValidationMode;
    fillFallbacks?: boolean;
    uniqueRisks?: boolean;
    count?: number;
  },
): SafeRecommendation[] => {
  const count = Math.max(0, Math.min(3, Math.round(options.count ?? 3)));
  if (count === 0) return [];

  const accepted: SafeRecommendation[] = [];
  const seen = new Set<string>();
  const seenRisks = new Set<SafeRecommendation["risk"]>();
  const consider = (candidate: RecommendationCandidate) => {
    const label = withoutInlineRiskPrefix(
      normalizeText(candidate.label ?? ""),
    ).slice(0, 140);
    const key = label.replace(/[\s.!?]/g, "").toLowerCase();
    const risk = normalizeRisk(candidate.risk);
    const acceptedByValidation = options.validationMode === "hard_only"
      ? !recommendationHasHardError(label, {
          observableText: options.observableText,
          forbiddenNames: options.forbiddenNames,
          forbiddenTerms: options.forbiddenTerms,
          excludedTerms: options.excludedTerms,
          characterNames: options.characterNames,
          availableCharacterNames: options.availableCharacterNames,
        })
      : recommendationIsImmediate(label, {
          observableText: options.observableText,
          focusText: options.focusText,
          speakerName: options.speakerName,
          forbiddenNames: options.forbiddenNames,
          forbiddenTerms: options.forbiddenTerms,
          excludedTerms: options.excludedTerms,
          characterNames: options.characterNames,
          availableCharacterNames: options.availableCharacterNames,
          requireProgressive: options.requireProgressive,
        });
    if (
      !key ||
      seen.has(key) ||
      (options.uniqueRisks && seenRisks.has(risk)) ||
      !acceptedByValidation
    ) {
      return;
    }
    seen.add(key);
    seenRisks.add(risk);
    accepted.push({ label, risk });
  };

  for (const candidate of candidates ?? []) {
    consider(candidate);
    if (accepted.length >= count) return accepted;
  }
  if (options.fillFallbacks === false) return accepted.slice(0, count);
  for (const fallback of immediateFallbacks(
    options.speakerName?.trim() ?? "",
    options.focusText,
    [
      ...(options.excludedTerms ?? []),
      ...(options.characterNames ?? []).filter(
        (name) => !(options.availableCharacterNames ?? []).some(
          (available) => compactMention(available) === compactMention(name),
        ),
      ),
    ],
  )) {
    consider(fallback);
    if (accepted.length >= count) break;
  }
  return accepted.slice(0, count);
};
