import type { EngineTurnResponse, SimulateRequest } from "../engine";
import {
  createId,
  type ScenarioPack,
} from "../scenario";
import { saberSummoningIsVisible } from "../story-director";
import type { StoryDrive, StoryRouteLock } from "../story-director";
import {
  fateSeoulRouteRecoveryDefaults,
  fateSeoulRerouteAlternatives,
  fateSeoulRerouteSatisfied,
  fateSeoulRouteTopicPattern,
  recoverFateSeoulRequiredEventReroute,
} from "./fate-seoul-recovery";

export const FATE_SEOUL_ADAPTER_ID = "fate-seoul";
export const FATE_SEOUL_ACT_ZERO_ROUTE_ID =
  "ACT0_NADIA_SEPARATED_SEOCHON_CHURCH";

export const FATE_SEOUL_EVENT_IDS = {
  mapGlitch: "EV_PROLOGUE_02_MAP_GLITCH",
  parcel: "EV_PROLOGUE_03_GRANDMOTHER_PARCEL",
  nadiaEncounter: "EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER",
  eveningRain: "EV_PROLOGUE_04_EVENING_RAIN",
  blackout: "EV_PROLOGUE_05_CAMPUS_BLACKOUT",
  pursuit: "EV_PROLOGUE_06_NIGHT_PURSUIT",
  summoning: "EV_PROLOGUE_07_SABER_SUMMONING",
  firstBattle: "EV_PROLOGUE_08_FIRST_BATTLE_AFTER_SUMMONING",
  church: "EV_PROLOGUE_09_CHURCH_ORIENTATION",
} as const;

export const FATE_SEOUL_ACT_ZERO_EVENT_IDS = [
  FATE_SEOUL_EVENT_IDS.mapGlitch,
  FATE_SEOUL_EVENT_IDS.parcel,
  FATE_SEOUL_EVENT_IDS.nadiaEncounter,
  FATE_SEOUL_EVENT_IDS.eveningRain,
  FATE_SEOUL_EVENT_IDS.blackout,
  FATE_SEOUL_EVENT_IDS.pursuit,
  FATE_SEOUL_EVENT_IDS.summoning,
  FATE_SEOUL_EVENT_IDS.firstBattle,
  FATE_SEOUL_EVENT_IDS.church,
] as const;

export const FATE_SEOUL_PHASE_ORDER = [
  "ordinary_before_parcel",
  "nadia_human_encounter",
  "nadia_human_conversation",
  "separate_evening_daily_life",
  "seochon_blackout_attack",
  "night_pursuit_to_shelter",
  "accidental_summoning",
  "first_battle_after_summoning",
  "church_orientation",
] as const;

export type FateSeoulPhase = (typeof FATE_SEOUL_PHASE_ORDER)[number];

export const FATE_SEOUL_CLOSED_FINGERPRINTS = [
  "1년 늦은 택배",
  "나디아 인간 만남",
  "평범한 저녁 일상",
  "서촌 정전의 시작",
  "방공호 추적",
  "소환 장면 재연",
  "첫 전투 재연",
  "성당교회 첫 설명 재연",
] as const;

export const FATE_SEOUL_IDENTITY = {
  publicSaberAlias: "정체불명의 소녀 검사",
  classTerms: ["세이버", "Saber"] as const,
  canonicalMasterQuestion: "묻겠다. 그대가 나의 마스터인가.",
  saberClassPattern: /세이버|\bsaber\b/iu,
  saberClassRevealPattern:
    /(?:(?:내|제|자신의)?\s*(?:클래스(?:명)?|영기\s*(?:반응|판정)|소환\s*적성|호칭)\s*(?:은|는|이|가|:|：)?\s*(?:세이버|\bsaber\b)|(?:나는|저는|이쪽은)\s*(?:세이버|\bsaber\b)(?:다|야|입니다|라고)|(?:자신을|그녀를|소녀를).{0,16}(?:세이버|\bsaber\b)(?:라|라고|로)\s*(?:소개|밝히|말하|칭하|부르)|(?:세이버|\bsaber\b)\s*(?:클래스|(?:라|이라고|라고)\s*(?:소개|밝히|말하|칭하|부르)|로\s*(?:소환|판정|확인|분류)))/iu,
  saberDialogueRevealPattern:
    /^(?:(?:나는|저는)\s*)?(?:세이버|\bsaber\b)(?:다|야|입니다|라고|\s*[,!.。！？])/iu,
  masterQuestionVariantPattern:
    /^묻겠다[\s.,!?。！？“”"'·]*(?:그대가)?[\s.,!?。！？“”"'·]*(?:내|나의)[\s.,!?。！？“”"'·]*마스터인가[\s.,!?。！？“”"'·]*$/u,
} as const;

export const FATE_SEOUL_PATTERNS = {
  nadiaName: /나디아\s*알\s*하(?:다|디)드|나디아/u,
  nadiaPublicEncounter:
    /나디아\s*알\s*하(?:다|디)드|나디아|방문\s*연구자|외국인\s*연구자/u,
  nadiaSceneClosed:
    /(?:나디아|방문\s*연구자|외국인\s*연구자).{0,180}(?:떠났|멀어졌|향했다|걸어갔|자리를\s*떴|작별|대화가\s*(?:끝|마무리)|만남이\s*(?:끝|마무리))|(?:대화|만남).{0,60}(?:끝|마무리|종료).{0,100}나디아/u,
  shelterReached:
    /(?:옛\s*)?(?:민방위\s*)?방공호|폐쇄\s*공간|막힌\s*퇴로|잠긴\s*출구|현관.{0,30}(?:막|파손)|비상\s*계단|지하\s*주차장/u,
  saberDescriptor: /(?:^|\b)saber(?:\b|$)|세이버|서번트|영령/iu,
  firstBattleCompleted:
    /(?:종이\s*가면|추적자|첫\s*전투|첫\s*방어전|공격|칼날).{0,220}(?:물러났|퇴각|도주|사라졌|이어지지\s*않|전투가\s*끝|위협이\s*멎|퇴로를\s*만들|더\s*이상.{0,30}(?:공격|쫓|이어지).{0,12}않)|(?:전투|위협|첫\s*방어전).{0,100}(?:끝|멎|해소|정리).{0,140}(?:소녀\s*검사|서번트|세이버|홍재)/u,
  churchInvitation:
    /(?:소녀\s*검사|세이버|홍재).{0,220}(?:성당\s*교회|성당|교회|감독관|감독).{0,120}(?:가자|가야|안내|만나|향하|이동)|(?:성당\s*교회|성당|교회|감독관|감독).{0,160}(?:가자|가야|안내|만나|향하|이동).{0,120}(?:소녀\s*검사|세이버|홍재)/u,
  churchReached:
    /(?:명동\s*성당|지하\s*고해실|성당\s*교회).{0,120}(?:도착|들어갔|입장|대면|만났|설명\s*(?:시작|들었|했다))|(?:오요한|신부|감독관).{0,120}(?:대면|만났|설명\s*(?:시작|들었|했다)|통화가\s*연결|안내를\s*받)/u,
} as const;

export type FateSeoulRoutePolicy = Pick<
  StoryRouteLock,
  | "phase"
  | "currentEventId"
  | "strictRules"
  | "forbiddenProgression"
  | "forbiddenRegression"
>;

const ordinaryPolicy = (
  currentMinutes: number,
  turn: number,
): FateSeoulRoutePolicy => ({
  phase: "ordinary_before_parcel",
  currentEventId: currentMinutes < 15 * 60 + 30 && turn <= 1
    ? "EV_PROLOGUE_02_MAP_GLITCH"
    : "EV_PROLOGUE_03_GRANDMOTHER_PARCEL",
  strictRules: [
    "실종된 외할머니 한명진 명의의 택배 미스터리와 현재의 평범한 대학 생활만 다룬다.",
    "‘수령 가능·수령 대기·도착 예정’은 실제 수령 완료가 아니다. 택배의 필수 물품이 inventoryAdd와 상태 인벤토리에 모두 기록되기 전에는 이 사건을 완료하거나 다음 사건으로 넘어가지 않는다.",
    "택배를 거절·보류·무시하면 그 선택은 유지하되 분리 배송·직원 전달·자동 배출 같은 현재 시점의 우회 경로로 필수 물품을 실제 확보시킨다.",
  ],
  forbiddenProgression: [
    "나디아 인간 만남",
    "나디아의 마술사 정체",
    "서촌 정전",
    "습격",
    "방공호",
    "소환",
    "성당교회",
  ],
  forbiddenRegression: [],
});

const fixedPolicies: Record<Exclude<FateSeoulPhase, "ordinary_before_parcel">, FateSeoulRoutePolicy> = {
  nadia_human_encounter: {
    phase: "nadia_human_encounter",
    currentEventId: "EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER",
    strictRules: [
      "공개된 교내 동선에서 나디아 알 하다드를 평범한 인간 방문 연구자로 처음 만난다.",
      "나디아는 길을 묻고 인간적인 대화를 나눌 수 있지만 마술사·마스터·성배전쟁 참가자라는 사실은 전혀 드러내지 않는다.",
      "이 만남은 독립된 낮 장면이다. 장면을 끝내더라도 같은 응답에서 정전·습격·소환을 시작하지 않는다.",
    ],
    forbiddenProgression: [],
    forbiddenRegression: ["택배가 오기 전의 하루", "1년 늦은 택배"],
  },
  nadia_human_conversation: {
    phase: "nadia_human_conversation",
    currentEventId: "EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER",
    strictRules: [
      "현재는 나디아 알 하다드와의 평범한 인간 대화 장면이다. 사용자의 안내·대답에 나디아가 직접 반응한다.",
      "길 안내가 끝났다면 나디아가 감사와 인간적인 자기소개를 남기고 박물관 별관 쪽으로 떠나며 이 장면만 완전히 닫을 수 있다.",
      "나디아의 마술사·마스터 정체, 수상한 마력, 정전 예고를 암시하지 않는다.",
      "나디아 장면이 끝난 뒤의 저녁 일상이나 습격을 같은 응답에 이어 붙이지 않는다.",
    ],
    forbiddenProgression: [],
    forbiddenRegression: ["택배가 오기 전의 하루", "1년 늦은 택배"],
  },
  separate_evening_daily_life: {
    phase: "separate_evening_daily_life",
    currentEventId: "EV_PROLOGUE_04_EVENING_RAIN",
    strictRules: [
      "나디아와의 만남은 이미 끝났다. 이번 응답은 현재 시각과 장소에 맞는 한시우의 별도 일상 장면을 실제로 전개한다.",
      "아침이면 기상·식사·일정 확인, 낮이면 수업·과제·이동, 저녁이면 식사·귀가·배달·자전거 점검 중 사용자 입력과 현재 위치에 맞는 일상만 다룬다.",
      "이 별도 일상 턴에서는 수상한 인물, 종이가면, 정전 예고, 습격, 소환을 절대 시작하지 않는다.",
    ],
    forbiddenProgression: ["나디아 재등장", "서촌 정전", "종이가면", "습격", "방공호", "소환", "성당교회"],
    forbiddenRegression: ["1년 늦은 택배", "나디아 인간 만남"],
  },
  seochon_blackout_attack: {
    phase: "seochon_blackout_attack",
    currentEventId: "EV_PROLOGUE_05_CAMPUS_BLACKOUT",
    strictRules: [
      "별도 저녁 일상이 끝난 뒤에만 22:47 전후의 정전과 종이가면 습격을 새 야간 사건으로 시작한다.",
      "서촌은 원래 연출의 후보일 뿐 강제 좌표가 아니다. 플레이어가 집이나 다른 장소에 있으면 그 장소의 전력·현관·복도·주차장에 사건이 도달하게 변형할 수 있다.",
      "다른 장소를 써야 한다면 현재 장소에서 사건이 시작된 원인, 실제 이동 과정, 이동 수단 또는 동행자, 경과 시간, 도착을 본문 앞부분에 모두 서술한다. 이 연결 없이 장소만 바꾸지 않는다.",
      "정전과 종이가면 추적자는 새 야간 장면에서 시작하며 나디아를 끌어오지 않는다.",
      "이번 단계에서는 습격만 시작하고 소환·세이버·성당교회까지 한꺼번에 건너뛰지 않는다.",
    ],
    forbiddenProgression: ["나디아의 마술사 정체", "소환", "마스터 질문", "성당교회", "오요한"],
    forbiddenRegression: ["1년 늦은 택배", "나디아 인간 만남", "평범한 저녁 일상"],
  },
  night_pursuit_to_shelter: {
    phase: "night_pursuit_to_shelter",
    currentEventId: "EV_PROLOGUE_06_NIGHT_PURSUIT",
    strictRules: [
      "정전 뒤 종이가면 추적을 단순 퍼즐로 바꾸지 말고 옛 민방위 방공호 또는 현재 위치에서 인과적으로 성립한 폐쇄공간의 생존 위기까지 진행한다.",
      "현재가 집이면 파손된 현관·막힌 복도·비상계단·지하주차장처럼 집에서 이어지는 공간을 쓴다. 방공호로 옮기려면 집의 파손이나 추적, 안내자, 이동과 도착, 경과 시간을 먼저 보여 준다.",
      "플레이어가 주문·의식·마법 지식을 자발적으로 사용했다고 만들지 않는다.",
      "방공호와 치명적 위기를 확립하되 이번 응답에서 소환까지 합치지 않는다.",
    ],
    forbiddenProgression: ["나디아 재등장", "소환", "마스터 질문", "성당교회", "오요한"],
    forbiddenRegression: ["1년 늦은 택배", "나디아 인간 만남", "평범한 저녁 일상", "서촌 정전의 시작"],
  },
  accidental_summoning: {
    phase: "accidental_summoning",
    currentEventId: "EV_PROLOGUE_07_SABER_SUMMONING",
    strictRules: [
      "최소 사용자 행동 턴과 직접적 생존 위기가 충족된 뒤에만 우발 소환을 발생시킨다.",
      "외부 위기와 촉매의 자동 반응으로 마법진·현현·첫 방어를 묘사하고 플레이어가 주문이나 의식을 했다고 만들지 않는다.",
      "마법진은 현재 위기 장소의 바닥에서 발동한다. 방공호 등 다른 장소를 쓰려면 이전 장면부터 이어진 이동 인과가 본문에 있어야 한다.",
      "마지막 비시스템 블록은 정확히 ‘묻겠다. 그대가 나의 마스터인가.’여야 하며 진명과 역사적 정체는 숨긴다.",
    ],
    forbiddenProgression: ["진명", "역사적 정체", "첫 전투의 결말", "성당교회", "오요한"],
    forbiddenRegression: ["1년 늦은 택배", "나디아 인간 만남", "평범한 저녁 일상", "서촌 정전의 시작", "방공호로 향하는 추적"],
  },
  first_battle_after_summoning: {
    phase: "first_battle_after_summoning",
    currentEventId: "EV_PROLOGUE_08_FIRST_BATTLE_AFTER_SUMMONING",
    strictRules: [
      "마스터 질문에 대한 사용자의 답·질문·행동을 그대로 존중한 직후 첫 전투를 재개한다.",
      "소녀 검사의 목표는 적 추격보다 한시우의 생존과 퇴로 확보다. 새 적이나 복잡한 술식 설명을 추가하지 않는다.",
      "전투가 끝나면 소녀 검사가 감독관이 있는 성당교회로 가자고 먼저 제안할 수 있지만 플레이어의 동행을 대신 확정하지 않는다.",
    ],
    forbiddenProgression: ["진명", "역사적 정체", "새 적 진영", "성당교회 설명 완료"],
    forbiddenRegression: ["1년 늦은 택배", "나디아 인간 만남", "평범한 저녁 일상", "서촌 정전의 시작", "방공호 추적", "소환 장면 재연"],
  },
  church_orientation: {
    phase: "church_orientation",
    currentEventId: "EV_PROLOGUE_09_CHURCH_ORIENTATION",
    strictRules: [
      "첫 전투가 끝난 뒤 소녀 검사가 성당교회 감독관을 만나자고 이끌고, 사용자의 동행 여부를 존중한다.",
      "성당교회에 도착하면 오요한 신부가 먼저 무슨 일이 벌어졌는지 설명하고 질문을 받을 지점을 만든다.",
      "성배전쟁·마술사·마스터·서번트 개념을 한꺼번에 사전처럼 낭독하지 말고 대화 순서로 나눠 설명한다.",
      "진명과 역사적 정체는 계속 숨긴다.",
    ],
    forbiddenProgression: ["진명", "역사적 정체", "후속 진영의 정답", "향후 배신"],
    forbiddenRegression: ["1년 늦은 택배", "나디아 인간 만남", "평범한 저녁 일상", "서촌 정전의 시작", "방공호 추적", "소환 장면 재연", "첫 전투 재연"],
  },
};

export const matchesFateSeoulPack = (pack: ScenarioPack): boolean => {
  const ids = new Set(pack.events.map((event) => event.id));
  return FATE_SEOUL_ACT_ZERO_EVENT_IDS.every((eventId) => ids.has(eventId));
};

export const fateSeoulRoutePolicy = ({
  phaseFloor,
  currentMinutes,
  turn,
}: {
  phaseFloor: number;
  currentMinutes: number;
  turn: number;
}): FateSeoulRoutePolicy => {
  if (phaseFloor <= 0) return ordinaryPolicy(currentMinutes, turn);
  const phase = FATE_SEOUL_PHASE_ORDER[Math.min(
    phaseFloor,
    FATE_SEOUL_PHASE_ORDER.length - 1,
  )];
  return phase === "ordinary_before_parcel"
    ? ordinaryPolicy(currentMinutes, turn)
    : fixedPolicies[phase];
};

export const fateSeoulCompletedRoute = () => ({
  routeId: FATE_SEOUL_ACT_ZERO_ROUTE_ID,
  phase: "completed",
  currentEventId: "EV_PROLOGUE_09_CHURCH_ORIENTATION",
  currentEventName: "성당교회 오리엔테이션 완료",
  forbiddenRegression: [...FATE_SEOUL_CLOSED_FINGERPRINTS],
});

export const primaryFateSeoulSaberNpc = (pack: ScenarioPack) =>
  pack.npcs
    .map((npc) => {
      const descriptor = `${npc.name} ${npc.role} ${npc.affiliation} ${npc.publicInfo} ${npc.hiddenInfo}`;
      let score = 0;
      if (/(?:^|\b)saber(?:\b|$)|세이버/iu.test(descriptor)) score += 120;
      if (/(?:^|\b)servant(?:\b|$)|서번트|영령/iu.test(descriptor)) score += 50;
      if (/홍재|정조|이산/u.test(descriptor)) score += 40;
      return { npc, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.npc;

const FATE_SEOUL_CAMPUS_ENCOUNTER_LOCATION_PATTERN =
  /캠퍼스|대학교|대학\s*(?:교정|정문|후문|건물)|학교|교정|공학관|학생회관|강의실|대학박물관|박물관\s*별관|중앙\s*보행로|교내\s*안내도/u;

const fateSeoulRequiredEncounterContext = (
  request: SimulateRequest,
  drive: StoryDrive,
): string => {
  const event = request.pack.events.find((candidate) =>
    candidate.id === drive.routeLock.currentEventId
  );
  const speaker = request.pack.npcs.find((npc) =>
    npc.id === drive.routeLock.requiredSpeakerId
  );
  return [
    drive.routeLock.phase,
    event?.name,
    event?.description,
    event?.effects,
    ...drive.routeLock.completionSignals,
    ...drive.routeLock.recoveryAlternatives,
    speaker?.name,
    speaker?.role,
    speaker?.publicInfo,
  ].filter(Boolean).join(" ");
};

export const isFateSeoulNadiaPublicEncounter = (
  request: SimulateRequest,
  drive: StoryDrive,
): boolean => {
  const context = fateSeoulRequiredEncounterContext(request, drive);
  return ["nadia_human_encounter", "nadia_human_conversation"].includes(
    drive.routeLock.phase,
  ) || (
    FATE_SEOUL_PATTERNS.nadiaPublicEncounter.test(context) &&
    /길|안내|박물관|별관|캠퍼스|방문|연구자/u.test(context)
  );
};

export const shouldStageFateSeoulRequiredEncounterLocation = (
  request: SimulateRequest,
  drive: StoryDrive,
): boolean => {
  if (!drive.routeLock.active) return false;
  return isFateSeoulNadiaPublicEncounter(request, drive) &&
    !FATE_SEOUL_CAMPUS_ENCOUNTER_LOCATION_PATTERN.test(
      request.state.location.normalize("NFKC"),
    );
};

/**
 * Fate/Seoul's first summoning has one package-specific visible contract:
 * the command-seal observation and the canonical master question. Keeping the
 * repair here prevents the common simulation route from knowing Hongjae,
 * Saber aliases, or Fate-specific status fields.
 */
export const ensureFateSeoulCanonicalSummoningTurn = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  pack: ScenarioPack,
  state: SimulateRequest["state"],
): { turn: Omit<EngineTurnResponse, "mode" | "usage">; repaired: boolean } => {
  const publicText = (turn.blocks ?? [])
    .filter((block) => block.type !== "system")
    .map((block) => block.text)
    .join("\n");
  if (!saberSummoningIsVisible(publicText)) return { turn, repaired: false };
  const saber = primaryFateSeoulSaberNpc(pack);
  if (!saber) return { turn, repaired: false };
  const alreadyEncountered = state.encounteredCharacterIds.includes(saber.id);
  const currentTurnHasMasterQuestion = (turn.blocks ?? []).some((block) =>
    FATE_SEOUL_IDENTITY.masterQuestionVariantPattern.test(block.text.trim())
  );
  if (alreadyEncountered && !currentTurnHasMasterQuestion) {
    return { turn, repaired: false };
  }

  const previousSpeaker = [...(turn.blocks ?? [])]
    .reverse()
    .find(
      (block) =>
        block.type === "dialogue" &&
        (block.speakerId === saber.id ||
          /정체불명의\s*소녀\s*검사|소녀\s*검사|검을\s*든\s*소녀|세이버|홍재/u.test(
            block.speakerName ?? "",
          )),
    );
  const blocks = (turn.blocks ?? []).filter(
    (block) =>
      !FATE_SEOUL_IDENTITY.masterQuestionVariantPattern.test(block.text.trim()),
  );
  const commandSealField = pack.statusWindow.fields.find(
    (field) =>
      !field.source &&
      /command[_\s-]*seals?|령주/iu.test(
        `${field.id} ${field.label} ${field.sectionLabel}`,
      ),
  );
  const conditionField = pack.statusWindow.fields.find(
    (field) =>
      !field.source &&
      /condition|current[_\s-]*status|현재\s*상태|부상|이상/iu.test(
        `${field.id} ${field.label} ${field.sectionLabel}`,
      ),
  );
  const commandSealAlreadyRevealed = Boolean(
    commandSealField &&
      state.statusLedger.find((entry) => entry.fieldId === commandSealField.id)
        ?.revealed,
  );
  const commandSealObservationAdded = Boolean(
    commandSealField &&
      !commandSealAlreadyRevealed &&
      !/손등.{0,24}(?:세\s*획|3\s*획|붉은\s*문양|각인)|령주/u.test(publicText),
  );
  if (commandSealObservationAdded) {
    blocks.push({
      id: createId(),
      type: "narration",
      text: "동시에 한시우의 손등 위로 세 획의 붉은 문양이 떠올랐다. 빛은 소녀 검사와 이어진 선처럼 한 번 맥동한 뒤 피부 위에 남았다.",
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    });
  }
  const speakerName = previousSpeaker?.speakerName?.trim() ||
    FATE_SEOUL_IDENTITY.publicSaberAlias;
  blocks.push({
    id: createId(),
    type: "dialogue",
    text: FATE_SEOUL_IDENTITY.canonicalMasterQuestion,
    speakerId: saber.id,
    speakerName,
    emotion: "엄숙한 확인",
    mediaAssetId: "",
  });
  const masterBlockIndex = blocks.length - 1;
  const encounteredCharactersAdd = [
    ...(turn.statePatch.encounteredCharactersAdd ?? []),
  ];
  if (
    !state.encounteredCharacterIds.includes(saber.id) &&
    !encounteredCharactersAdd.some((entry) => entry.characterId === saber.id)
  ) {
    encounteredCharactersAdd.push({
      characterId: saber.id,
      name: speakerName,
      relationType: "우발 소환으로 첫 대면",
    });
  }
  const characterVisuals = [...(turn.characterVisuals ?? [])];
  const visualIndex = characterVisuals.findIndex(
    (cue) => cue.characterId === saber.id || cue.characterName === saber.name,
  );
  const visualCue = {
    blockIndex: masterBlockIndex,
    characterId: saber.id,
    characterName: saber.name,
    importance: "major" as const,
    isFirstMajorAppearance: true,
    appearancePrompt: saber.appearance,
    reason: "우발 소환으로 현현한 주요 서번트의 첫 등장",
    canonicalAssetId: "",
    source: "pending" as const,
  };
  if (visualIndex >= 0) characterVisuals[visualIndex] = visualCue;
  else characterVisuals.push(visualCue);

  const alreadyExact =
    turn.blocks.at(-1)?.type === "dialogue" &&
    turn.blocks.at(-1)?.text.trim() ===
      FATE_SEOUL_IDENTITY.canonicalMasterQuestion &&
    turn.blocks.at(-1)?.speakerId === saber.id;
  const statusLedgerChanges = [...(turn.statePatch.statusLedgerChanges ?? [])];
  if (commandSealField && !commandSealAlreadyRevealed) {
    statusLedgerChanges.push({
      fieldId: commandSealField.id,
      operation: "set",
      numericDelta: 0,
      value: "3",
      items: [],
      grade: "",
      reveal: true,
      reason: "우발 소환 직후 손등에 세 획의 붉은 문양이 직접 나타났다.",
    });
  }
  if (conditionField) {
    statusLedgerChanges.push({
      fieldId: conditionField.id,
      operation: "set",
      numericDelta: 0,
      value: "갑작스러운 습격과 현현으로 긴장 상태지만, 현재 확인되는 중상은 없다.",
      items: [],
      grade: "",
      reveal: true,
      reason: "생존 위기와 우발 소환 직후 관측된 현재 상태",
    });
  }
  return {
    repaired:
      !alreadyExact ||
      commandSealObservationAdded ||
      Boolean(commandSealField && !commandSealAlreadyRevealed),
    turn: {
      ...turn,
      blocks,
      characterVisuals,
      statePatch: {
        ...turn.statePatch,
        encounteredCharactersAdd,
        statusLedgerChanges,
        memoryAdd: [
          ...(turn.statePatch.memoryAdd ?? []).filter(
            (memory) => !/묻겠다.{0,30}마스터인가/u.test(memory),
          ),
          `${speakerName}가 치명타를 막고 “${FATE_SEOUL_IDENTITY.canonicalMasterQuestion}”라고 물었다.`,
        ],
      },
      image: {
        ...turn.image,
        characterIds: [
          ...new Set([...(turn.image.characterIds ?? []), saber.id]),
        ].slice(0, 4),
      },
    },
  };
};

export const fateSeoulRouteStepCompleted = ({
  phase,
  currentEventId,
  text,
  milestoneTriggered,
  endsAtMasterQuestion,
  contractItemsSatisfied,
}: {
  phase: string;
  currentEventId: string;
  text: string;
  milestoneTriggered: boolean;
  endsAtMasterQuestion: boolean;
  contractItemsSatisfied: boolean;
}): boolean | undefined => {
  switch (phase) {
    case "ordinary_before_parcel":
      if (currentEventId.includes("02_MAP_GLITCH")) {
        return /(?:지도|좌표|레이어|경로).{0,100}(?:오류|사라졌|갱신|표시|기록)/u.test(text);
      }
      return /(?:택배|배송|보관함|물품).{0,100}(?:수령|꺼냈|챙겼|손에\s*넣|확보)/u.test(text) &&
        contractItemsSatisfied;
    case "nadia_human_encounter":
      return /나디아\s*알\s*하(?:다|디)드|이름고고학자|방문\s*연구자/u.test(text);
    case "nadia_human_conversation":
      return /(?:나디아|방문\s*연구자|외국인\s*연구자).{0,180}(?:감사|인사).{0,120}(?:떠났|멀어졌|향했다|걸어갔|자리를\s*떴)|(?:나디아|방문\s*연구자).{0,180}(?:대화|만남).{0,40}(?:끝|마무리|종료)/u.test(text);
    case "separate_evening_daily_life":
      return /(?:아침\s*식사|오늘\s*일정표?|강의\s*일정|늦은\s*점심|남은\s*일정|저녁|학생식당|과제\s*정리|귀가\s*준비|배달\s*(?:앱|가방|주문)|자전거|예상\s*수입|저녁\s*식사)/u.test(text);
    case "seochon_blackout_attack":
      return /정전|전력.{0,20}꺼|불이.{0,12}꺼/u.test(text) &&
        /종이\s*가면|추적자|습격/u.test(text);
    case "night_pursuit_to_shelter":
      return FATE_SEOUL_PATTERNS.shelterReached.test(text) &&
        /종이\s*가면|추적|치명|출구를\s*막/u.test(text);
    case "accidental_summoning":
      return milestoneTriggered && endsAtMasterQuestion;
    case "first_battle_after_summoning":
      return /(?:종이\s*가면|추적자|첫\s*전투|첫\s*방어전).{0,180}(?:물러났|퇴각|도주|사라졌|전투가\s*끝|퇴로를\s*만들)/u.test(text);
    case "church_orientation":
      return /오요한|성당\s*교회|명동\s*성당|지하\s*고해실/u.test(text);
    default:
      return undefined;
  }
};

export const fateSeoulPrematureProgression = ({
  phase,
  text,
  routeStepCompleted,
}: {
  phase: string;
  text: string;
  routeStepCompleted: boolean;
}): boolean | undefined => {
  const futureFromEarlyAct =
    /(?:서촌.{0,80}(?:정전|습격|종이\s*가면)|종이\s*가면|우발\s*소환|소환진|마법진.{0,60}(?:현현|소녀\s*검사)|묻겠다.{0,20}마스터|오요한|지하\s*고해실)/u;
  const futureFromPursuit =
    /(?:우발\s*소환|소환진|마법진.{0,60}(?:현현|소녀\s*검사)|묻겠다.{0,20}마스터|오요한|지하\s*고해실)/u;
  const oldDailyScene =
    /(?:나디아|방문\s*연구자).{0,180}(?:셔틀|안내도|길을\s*물|박물관\s*별관|캠퍼스)|(?:학생식당|배달\s*대행\s*사무실|저녁\s*배차표).{0,160}(?:수업|캠퍼스|평범한\s*저녁)/u;
  switch (phase) {
    case "ordinary_before_parcel":
      return /(?:나디아\s*알\s*하(?:다|디)드|방문\s*연구자|외국인\s*연구자).{0,180}(?:길|박물관|안내도|캠퍼스)/u.test(text) ||
        futureFromEarlyAct.test(text);
    case "nadia_human_encounter":
    case "nadia_human_conversation":
    case "separate_evening_daily_life":
      return futureFromEarlyAct.test(text);
    case "seochon_blackout_attack":
    case "night_pursuit_to_shelter":
      return futureFromPursuit.test(text);
    case "accidental_summoning":
      return /오요한|지하\s*고해실|성배전쟁.{0,40}(?:규칙|설명)/u.test(text);
    case "first_battle_after_summoning":
      return /오요한|지하\s*고해실|신부.{0,60}(?:성배전쟁|마스터|서번트).{0,40}(?:설명|규칙)/u.test(text) ||
        (!routeStepCompleted && oldDailyScene.test(text));
    case "church_orientation":
      return !routeStepCompleted &&
        (oldDailyScene.test(text) ||
          /(?:마법진|소환진).{0,100}(?:처음|다시).{0,80}(?:현현|소환)/u.test(text));
    default:
      return undefined;
  }
};

export const fateSeoulAdapter = {
  id: FATE_SEOUL_ADAPTER_ID,
  matches: matchesFateSeoulPack,
  routeId: FATE_SEOUL_ACT_ZERO_ROUTE_ID,
  eventIds: FATE_SEOUL_ACT_ZERO_EVENT_IDS,
  eventMap: FATE_SEOUL_EVENT_IDS,
  phaseOrder: FATE_SEOUL_PHASE_ORDER,
  identity: FATE_SEOUL_IDENTITY,
  patterns: FATE_SEOUL_PATTERNS,
  completedRoute: fateSeoulCompletedRoute,
  routePolicy: fateSeoulRoutePolicy,
  primaryMilestoneNpc: primaryFateSeoulSaberNpc,
  isPublicEncounter: isFateSeoulNadiaPublicEncounter,
  shouldStageRequiredEncounterLocation:
    shouldStageFateSeoulRequiredEncounterLocation,
  ensureCanonicalSummoningTurn: ensureFateSeoulCanonicalSummoningTurn,
  canonicalSummoningRepairWarning:
    "소환 장면의 필수 마스터 질문과 홍재의 패키지 이미지 연결을 자동 복구했습니다.",
  routeStepCompleted: fateSeoulRouteStepCompleted,
  prematureProgression: fateSeoulPrematureProgression,
  routeTopicPattern: fateSeoulRouteTopicPattern,
  rerouteAlternatives: fateSeoulRerouteAlternatives,
  rerouteSatisfied: fateSeoulRerouteSatisfied,
  routeRecoveryDefaults: fateSeoulRouteRecoveryDefaults,
  recoverRequiredEventReroute: recoverFateSeoulRequiredEventReroute,
} as const;
