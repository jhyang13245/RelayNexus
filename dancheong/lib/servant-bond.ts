import type { RuntimeState, ScenarioPack, StoryBlock } from "./scenario";

export type ServantBondMode =
  | "inactive"
  | "first_contact"
  | "settling_in"
  | "daily_bond"
  | "combat_coordination";

export type ServantBondRecentTurn = {
  turn?: number;
  userText?: string;
  blocks: Array<Pick<StoryBlock, "type" | "text" | "speakerId" | "speakerName">>;
};

export type ServantBondDirection = {
  mode: ServantBondMode;
  routePhase: "inactive" | "summoning" | "daytime" | "night" | "aftermath";
  active: boolean;
  primaryServantId: string;
  primaryServantName: string;
  primaryServantAliases?: string[];
  isJeongjo: boolean;
  turnsSinceDialogue: number;
  requireServantDialogue: boolean;
  requireModernLifeBeat: boolean;
  visualTriggerTerms: string[];
  directives: string[];
};

export type ServantBondAssessment = {
  servantSpoke: boolean;
  modernLifeBeat: boolean;
  endsAtMasterQuestion: boolean;
  needsCorrection: boolean;
  reasons: string[];
};

type GeneratedTurnLike = {
  blocks?: Array<Pick<StoryBlock, "type" | "text" | "speakerId" | "speakerName">>;
};

const normalize = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

const compact = (value: string) =>
  normalize(value).replace(/[^\p{L}\p{N}]+/gu, "");

const MASTER_QUESTION = "묻겠다그대가나의마스터인가";

const characterMatches = (
  characterId: string,
  characterName: string,
  speakerId = "",
  speakerName = "",
  aliases: string[] = [],
) =>
  Boolean(
    (speakerId && compact(speakerId) === compact(characterId)) ||
      (speakerName && [characterName, ...aliases].some((alias) => {
        const candidate = compact(alias);
        const speaker = compact(speakerName);
        return candidate && speaker &&
          (candidate === speaker || candidate.includes(speaker) || speaker.includes(candidate));
      })),
  );

const primaryServant = (pack: ScenarioPack) => {
  const connectedIds = new Set(
    pack.relations
      .filter(
        (relation) =>
          relation.sourceId === pack.player.id ||
          relation.targetId === pack.player.id,
      )
      .flatMap((relation) => [relation.sourceId, relation.targetId]),
  );
  return pack.npcs
    .map((npc) => {
      const descriptor = normalize(
        `${npc.name} ${npc.role} ${npc.affiliation} ${npc.publicInfo} ${npc.hiddenInfo}`,
      );
      const directRole = normalize(`${npc.name} ${npc.role} ${npc.affiliation}`);
      const isServantCandidate =
        /(?:^|\b)saber(?:\b|$)|세이버|(?:^|\b)servant(?:\b|$)|서번트|영령/u.test(
          directRole,
        ) ||
        /계약\s*서번트|소환된\s*영령/u.test(normalize(npc.publicInfo)) ||
        /진명\s*[:：]?\s*(?:정조|이산)|정조\s*이산/u.test(
          normalize(npc.hiddenInfo),
        );
      let score = 0;
      if (/(?:^|\b)saber(?:\b|$)|세이버/u.test(descriptor)) score += 120;
      if (/정조|이산/u.test(descriptor)) score += 80;
      if (/(?:^|\b)servant(?:\b|$)|서번트|영령/u.test(descriptor)) score += 55;
      if (connectedIds.has(npc.id)) score += 25;
      if (/마스터.{0,20}(?:계약|상대)|계약.{0,20}마스터/u.test(descriptor)) {
        score += 20;
      }
      return { npc, score, descriptor, isServantCandidate };
    })
    // "마스터 교사"나 플레이어 관계만으로 일반 NPC를 계약 서번트로
    // 오인하지 않는다. 패키지 내부 설명에 실제 클래스/서번트/진명 표지가
    // 있는 인물만 이 감독의 대상으로 삼는다.
    .filter((candidate) => candidate.isServantCandidate && candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0];
};

const turnsSinceDialogue = (
  characterId: string,
  characterName: string,
  aliases: string[],
  recentTurns: ServantBondRecentTurn[],
) => {
  let count = 0;
  for (const turn of [...recentTurns].reverse()) {
    const spoke = turn.blocks.some(
      (block) =>
        block.type === "dialogue" &&
        characterMatches(
          characterId,
          characterName,
          block.speakerId,
          block.speakerName,
          aliases,
        ),
    );
    if (spoke) return count;
    count += 1;
  }
  return Math.min(8, count || 8);
};

const DAILY_INPUT_PATTERN =
  /함께|식사|밥|아침|점심|저녁|요리|집|방|잠|씻|옷|갈아입|쇼핑|장보|편의점|카페|산책|외출|학교|수업|휴대전화|핸드폰|스마트폰|인터넷|지하철|버스|택시|배달|일상|현대/u;

const MODERN_LIFE_PATTERN =
  /스마트폰|휴대전화|핸드폰|인터넷|검색|앱|교통카드|지하철|버스|택시|자동차|엘리베이터|편의점|카페|배달|냉장고|전자레인지|텔레비전|옷|사복|교복|아파트|학교|대학|수업|민주|시민|행정|신분증|카드|현대|서울|식사|밥|요리|침대|방/u;

const IMMEDIATE_DANGER_PATTERN =
  /습격|공격|추격|전투|침입|폭발|붕괴|결계|봉쇄|부상|출혈|(?:^|[^\p{L}\p{N}])적(?:이|의|을|과|은)?(?=[^\p{L}\p{N}]|$)|살기|총격|검격|도주|탈출/u;

const RESOLVED_DANGER_PATTERN =
  /(?:전투|추격|습격|공격|위협).{0,18}(?:끝|종료|해제|멎|그쳤|물러|사라|없)|(?:즉각적인\s*)?위협.{0,8}(?:없|해소)|안전(?:해졌|하다|한 상태)/u;

export const deriveServantBondDirection = ({
  pack,
  state,
  userText,
  recentTurns,
  summoningNow,
  supportHandoffNeeded,
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  userText: string;
  recentTurns: ServantBondRecentTurn[];
  summoningNow: boolean;
  supportHandoffNeeded: boolean;
}): ServantBondDirection => {
  const selected = primaryServant(pack);
  if (!selected) {
    return {
      mode: "inactive",
      routePhase: "inactive",
      active: false,
      primaryServantId: "",
      primaryServantName: "",
      primaryServantAliases: [],
      isJeongjo: false,
      turnsSinceDialogue: 0,
      requireServantDialogue: false,
      requireModernLifeBeat: false,
      visualTriggerTerms: [],
      directives: [],
    };
  }
  const servant = selected.npc;
  const servantAliases = [
    servant.preRevealAlias ?? "",
    ...(servant.aliases ?? []),
  ].filter(Boolean);
  const isJeongjo = /정조|이산/u.test(selected.descriptor);
  const encountered = (state.encounteredCharacterIds ?? []).includes(servant.id) ||
    (state.characterVisuals ?? []).some(
      (profile) => profile.characterId === servant.id,
    );
  const dialogueGap = turnsSinceDialogue(
    servant.id,
    servant.name,
    servantAliases,
    recentTurns,
  );
  const introduction = (state.characterVisuals ?? []).find(
    (profile) => profile.characterId === servant.id,
  )?.introducedTurn;
  const turnsSinceIntroduction = Number.isFinite(introduction)
    ? Math.max(0, state.turn - Number(introduction))
    : Number.POSITIVE_INFINITY;
  const immediateDanger = IMMEDIATE_DANGER_PATTERN.test(userText) ||
    (IMMEDIATE_DANGER_PATTERN.test(state.sceneSummary) &&
      !RESOLVED_DANGER_PATTERN.test(state.sceneSummary));
  const recentStoryText = recentTurns
    .slice(-2)
    .flatMap((turn) => turn.blocks.map((block) => block.text))
    .join(" ");
  const recentBattle = IMMEDIATE_DANGER_PATTERN.test(recentStoryText);
  const hourMatch = state.time.match(/(?:^|\D)([01]?\d|2[0-3])[:：]/u);
  const hour = hourMatch ? Number(hourMatch[1]) : 12;
  const routePhase: ServantBondDirection["routePhase"] = summoningNow
    ? "summoning"
    : recentBattle && !immediateDanger
      ? "aftermath"
      : hour >= 6 && hour < 18
        ? "daytime"
        : "night";
  const everydayInput = DAILY_INPUT_PATTERN.test(userText);

  let mode: ServantBondMode = "inactive";
  if (summoningNow) {
    mode = "first_contact";
  } else if (encountered && supportHandoffNeeded) {
    mode = immediateDanger ? "combat_coordination" : "daily_bond";
  } else if (
    encountered &&
    turnsSinceIntroduction <= 3 &&
    dialogueGap >= 1
  ) {
    mode = "settling_in";
  } else if (encountered && routePhase === "aftermath" && dialogueGap >= 1) {
    mode = "settling_in";
  } else if (encountered && everydayInput && !immediateDanger) {
    mode = "daily_bond";
  } else if (
    encountered &&
    routePhase === "daytime" &&
    dialogueGap >= 3 &&
    !immediateDanger
  ) {
    mode = "daily_bond";
  } else if (
    encountered &&
    dialogueGap >= 2 &&
    (immediateDanger || routePhase === "night")
  ) {
    mode = "combat_coordination";
  }

  const active = summoningNow || encountered;
  const requireServantDialogue = mode !== "inactive";
  const requireModernLifeBeat = mode === "daily_bond";
  const visualTriggerTerms = mode === "first_contact"
    ? [
        "summoning",
        "summon",
        "magic-circle",
        "magic circle",
        "first-appearance",
        "소환",
        "소환진",
        "마법진",
        "현현",
        "첫 등장",
        "계약",
      ]
    : mode === "settling_in"
      ? [
          "summoning-aftermath",
          "first-conversation",
          "contract",
          "소환 직후",
          "첫 대화",
          "계약",
        ]
      : mode === "daily_bond"
        ? [
            "daily",
            "everyday",
            "modern-life",
            "casual",
            "home",
            "일상",
            "현대",
            "사복",
            "외출",
          ]
        : mode === "combat_coordination"
          ? immediateDanger
            ? ["battle", "combat", "master-servant", "전투", "협공", "호위"]
            : ["night", "investigation", "patrol", "밤", "조사", "순찰"]
          : [];

  const directives: string[] = [];
  if (active) {
    directives.push(
      `primaryServantId=${servant.id}인 계약 서번트는 전투 도구나 배경 인물이 아니라 ${pack.player.name}와 함께 작품을 이끄는 공동 주인공이다. 왕으로서의 주체성·판단·자존심·책임감을 유지한다.`,
      "전투 장면 사이에는 계약자와 서번트가 서로의 가치관·생활방식·약점·신뢰를 알아 가는 관계 장면을 실제 서사로 축적한다. 전투가 없다고 무조건 시간을 건너뛰지 않는다.",
      "관계 장면에서도 플레이어의 행동·대사·감정을 대신 쓰지 않는다. 서번트와 환경이 먼저 움직이고 말한 뒤, 플레이어가 답하거나 행동할 수 있는 지점에서 멈춘다.",
      "미공개 클래스명·진명·역사적 정체는 공개 조건 전까지 쓰지 않는다. 다만 숨은 정체에서 비롯되는 말투·통치관·책임감·시대 감각은 정체를 단정할 수 없는 방식으로 자연스럽게 드러낸다.",
      "전체 진행은 현대의 평범한 낮과 비밀스러운 밤의 마술전이 교차하는 비주얼노벨형 노선을 따른다. 특정 기존 작품의 사건·대사·장면을 복제하지 않고 패키지의 서울 사건표와 인물로 독자적인 인과를 만든다.",
      "낮에는 학교·주거·도시 생활, 관계와 가치관, 전날 사건의 후유증, 다음 위험의 관측 가능한 징후를 다룬다. 밤에는 조사·추적·다른 진영의 책략·영령전을 본격적으로 움직인다.",
      "전투 결과의 부상·마력 소모·불신·약속은 다음 날 일상 대사와 선택에 남고, 낮에 쌓은 신뢰·정보·갈등은 다음 밤의 협공과 판단을 바꾼다. 일상과 전투를 서로 무관한 에피소드로 분리하지 않는다.",
      "한 사이클 안에서 관계 변화와 성배전쟁 진행이 모두 한 단계씩 움직이게 하되, 낮마다 습격하고 밤마다 결전을 벌이는 기계적 반복은 피한다.",
    );
  }
  if (isJeongjo) {
    directives.push(
      "이 인물의 숨은 정체는 TS 정조다. 진명은 감추되 백성을 향한 책임, 개혁 군주의 시선, 학문과 기록에 대한 관심, 절제된 위엄, 충성과 희생에 대한 복합적인 태도를 일관된 성격 기반으로 사용한다.",
      "현대 서울에서는 스마트폰·대중교통·배달 문화·대학 생활·사복·현대 행정과 시민사회 등을 조선 군주의 관점으로 받아들이며 진지함과 의외의 호기심이 함께 나오는 고유한 일상 포인트를 만든다. 특정 기존 작품의 장면이나 대사를 복제하지 않는다.",
      "왕이라는 이유로 고어체만 반복하거나 모든 현대 물건에 과장되게 놀라게 하지 않는다. 빠르게 이해하지만 가치관 차이에서 재치 있는 충돌과 따뜻한 여운이 생기게 한다.",
    );
  }
  if (mode === "first_contact") {
    directives.push(
      "소환진·마법 문양·빛·마력 흐름을 공간적으로 명확히 보여주고, 패키지의 소환/마법진/첫 등장 이미지 트리거에 맞는 자산을 사용한다.",
      `현현한 서번트는 ${pack.player.name}을 향해 첫 대사로 정확히 ‘묻겠다. 그대가 나의 마스터인가.’라고 말한다. 이 문구를 다른 계약 질문이나 선언으로 바꾸지 않는다.`,
      "정확한 마스터 질문을 마지막 비시스템 블록으로 두고 즉시 장면을 멈춘다. 그 뒤 플레이어의 대답·감정·몸짓이나 계약 설명을 만들지 않는다.",
    );
  } else if (mode === "settling_in") {
    directives.push(
      routePhase === "aftermath"
        ? "직전 전투의 여운을 건너뛰지 않는다. 부상·마력 소모·전술적 실수·서로를 보호한 이유 중 하나를 구체적인 대화로 다루고 다음 일상의 태도에 남긴다."
        : "소환 직후의 여운을 건너뛰지 않는다. 계약의 한계, 서로의 호칭, 안전한 체류 방식, 현대 생활의 첫 인상 중 적어도 하나를 구체적인 대화로 다룬다.",
      "설정 설명만 늘어놓지 말고 두 인물의 가치관 차이와 향후 신뢰의 씨앗이 되는 작은 선택 지점을 만든다.",
    );
  } else if (mode === "daily_bond") {
    directives.push(
      `이번 응답에는 primaryServantId=${servant.id}인 인물이 직접 대화하며, 현대 생활의 구체적인 대상 하나와 자신의 가치관을 연결하는 관계 비트를 넣는다.`,
      "일상 비트는 단순 개그나 음식 반응으로 끝내지 않는다. 현대적 편의에 대한 호기심·군주로서의 습관·생활 규칙의 충돌·상대에 대한 배려 중 하나를 통해 두 사람의 관계가 이전과 조금 달라지게 한다.",
      "항상 식사만 반복하지 말고 주거, 사복, 스마트폰, 교통, 대학, 서울의 밤, 기록, 행정, 사생활, 돈과 소비 등 소재를 순환한다.",
      "일상은 1~2턴 숨 쉴 수 있게 하되 메인 사건과 완전히 분리된 필러로 만들지 않는다. 끝에는 지금 장면 안에서 답할 수 있는 관계적 질문·제안·작은 문제를 남긴다.",
    );
  } else if (mode === "combat_coordination") {
    directives.push(
      immediateDanger
        ? "전투·위기 중에도 계약 서번트가 침묵한 무기로만 행동하지 않게 한다. 위험 판단, 전술 제안, 보호 원칙 또는 신뢰 문제를 플레이어에게 직접 말하게 한다."
        : "밤의 조사·경계에서도 계약 서번트가 뒤따르는 무기로만 남지 않게 한다. 감지한 이상, 이동 원칙, 다른 진영에 대한 판단 또는 둘 사이의 전술 합의를 플레이어에게 직접 말하게 한다.",
    );
  }

  return {
    mode,
    routePhase,
    active,
    primaryServantId: servant.id,
    primaryServantName: servant.name,
    primaryServantAliases: servantAliases,
    isJeongjo,
    turnsSinceDialogue: dialogueGap,
    requireServantDialogue,
    requireModernLifeBeat,
    visualTriggerTerms,
    directives,
  };
};

export const assessServantBond = ({
  direction,
  turn,
}: {
  direction: ServantBondDirection;
  turn: GeneratedTurnLike;
}): ServantBondAssessment => {
  if (!direction.requireServantDialogue) {
    return {
      servantSpoke: true,
      modernLifeBeat: true,
      endsAtMasterQuestion: true,
      needsCorrection: false,
      reasons: [],
    };
  }
  const blocks = turn.blocks ?? [];
  const servantSpoke = blocks.some(
    (block) =>
      block.type === "dialogue" &&
      characterMatches(
        direction.primaryServantId,
        direction.primaryServantName,
        block.speakerId,
        block.speakerName,
        direction.primaryServantAliases ?? [],
      ),
  );
  const outputText = blocks.map((block) => block.text).join("\n");
  const modernLifeBeat = !direction.requireModernLifeBeat ||
    MODERN_LIFE_PATTERN.test(outputText);
  const publicBlocks = blocks.filter((block) => block.type !== "system");
  const finalBlock = publicBlocks.at(-1);
  const endsAtMasterQuestion = direction.mode !== "first_contact" ||
    Boolean(
      finalBlock?.type === "dialogue" &&
        characterMatches(
          direction.primaryServantId,
          direction.primaryServantName,
          finalBlock.speakerId,
          finalBlock.speakerName,
          direction.primaryServantAliases ?? [],
        ) &&
        compact(finalBlock.text) === MASTER_QUESTION,
    );
  const reasons: string[] = [];
  if (!servantSpoke) {
    reasons.push("계약 서번트가 플레이어에게 직접 말을 걸지 않음");
  }
  if (!modernLifeBeat) {
    reasons.push("현대 생활과 인물 가치관이 맞닿는 구체적인 일상 비트가 없음");
  }
  if (!endsAtMasterQuestion) {
    reasons.push("첫 소환 장면이 정확한 마스터 질문에서 끝나지 않음");
  }
  return {
    servantSpoke,
    modernLifeBeat,
    endsAtMasterQuestion,
    needsCorrection: !servantSpoke || !modernLifeBeat || !endsAtMasterQuestion,
    reasons,
  };
};

export const buildServantBondCorrection = (
  direction: ServantBondDirection,
  assessment: ServantBondAssessment,
) => `
[계약 서번트 관계 장면 재작성 지시]
첫 작성은 공동 주인공 관계 검사에 실패했다: ${assessment.reasons.join(", ") || "서번트와의 상호작용 부족"}.
- primaryServantId=${direction.primaryServantId}인 인물이 이번 응답에서 직접 말하고 장면의 능동적 주체가 되어야 한다.
- first_contact이면 소환진의 시각적 현현 → 치명타 방어 → 주변과 계약자 확인 → 서번트의 정확한 대사 ‘묻겠다. 그대가 나의 마스터인가.’까지 진행한다.
- first_contact의 정확한 마스터 질문은 마지막 비시스템 블록이어야 한다. 문구를 바꾸거나 뒤에 설명·플레이어의 답·감정·몸짓을 붙이지 않는다.
- daily_bond이면 스마트폰·교통·사복·주거·대학·서울 생활·현대 행정 등 눈앞의 구체적 대상 하나와 인물의 가치관을 연결한다. 음식 반응만 반복하지 않는다.
- 이 관계 장면은 단순 설명이나 개그가 아니라 신뢰·경계·호칭·생활 규칙·책임 중 하나를 조금 변화시키는 사건이어야 한다.
- 미공개 클래스명과 진명은 밝히지 않는다. 숨은 정체는 성격의 근거로만 사용한다.
- 플레이어의 새 행동·대사·감정은 만들지 않고 서번트가 말을 건 뒤 응답 지점에서 멈춘다.
`;
