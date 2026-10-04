import {
  STORY_ROUTE_PROGRESS_VARIABLE_ID,
  type RuntimeState,
  type ScenarioEvent,
  type ScenarioPack,
  type StoryBlock,
} from "./scenario";
import { resolveWorkAdapter, resolveWorkAdapterByRouteId } from "./work-adapters";
import {
  contractInventoryContainsItem,
  contractItemMentioned,
  contractSituationSatisfied,
} from "./contract-signals";

export { STORY_ROUTE_PROGRESS_VARIABLE_ID } from "./scenario";

export type StoryDriveMode = "steady" | "accelerate" | "force_milestone";

export type StoryRouteLock = {
  active: boolean;
  routeId: string;
  phase: string;
  currentEventId: string;
  currentEventName: string;
  strictRules: string[];
  forbiddenProgression: string[];
  forbiddenRegression: string[];
  recoverMissedRequiredEvent: boolean;
  required: boolean;
  completionSignals: string[];
  requiredItems: string[];
  requiredDialogue: string;
  requiredSpeakerId: string;
  recoveryAlternatives: string[];
  preservePlayerChoice: boolean;
  endSceneAfterCompletion: boolean;
};

type StoryRouteProgressMarker = {
  routeId: string;
  phase: string;
  eventId: string;
  completedEventIds: string[];
  adjudication?: "semantic-v1";
};

const readStoryRouteProgress = (
  state: RuntimeState,
): StoryRouteProgressMarker | undefined => {
  const variable = state.variables.find(
    (candidate) =>
      candidate.id === STORY_ROUTE_PROGRESS_VARIABLE_ID &&
      candidate.visibility === "hidden",
  );
  if (!variable) return undefined;
  try {
    const parsed = JSON.parse(variable.detail) as Partial<StoryRouteProgressMarker>;
    if (
      typeof parsed.routeId !== "string" ||
      typeof parsed.phase !== "string" ||
      typeof parsed.eventId !== "string"
    ) {
      return undefined;
    }
    return {
      routeId: parsed.routeId,
      phase: parsed.phase,
      eventId: parsed.eventId,
      completedEventIds: [
        ...new Set([
          ...(Array.isArray(parsed.completedEventIds)
            ? parsed.completedEventIds.filter(
                (eventId): eventId is string => typeof eventId === "string",
              )
            : []),
          parsed.eventId,
        ]),
      ],
      adjudication: parsed.adjudication === "semantic-v1"
        ? "semantic-v1"
        : undefined,
    };
  } catch {
    return undefined;
  }
};

export const storyRouteProgressVariable = (
  routeLock: StoryRouteLock,
  state?: RuntimeState,
  additionallyCompletedEventIds: string[] = [],
) => {
  const previous = state ? readStoryRouteProgress(state) : undefined;
  const completedEventIds = [
    ...new Set([
      ...(previous?.routeId === routeLock.routeId
        ? previous.completedEventIds
        : []),
      routeLock.currentEventId,
      ...additionallyCompletedEventIds,
    ]),
  ];
  return {
    id: STORY_ROUTE_PROGRESS_VARIABLE_ID,
    label: "서버 검증 이야기 진행도",
    detail: JSON.stringify({
      routeId: routeLock.routeId,
      phase: routeLock.phase,
      eventId: routeLock.currentEventId,
      completedEventIds,
      adjudication: "semantic-v1",
    }),
    visibility: "hidden" as const,
    reason: "완료된 사건보다 앞선 사건이 다시 선택되지 않도록 서버가 기록한 진행도",
  };
};

export type StoryDrive = {
  mode: StoryDriveMode;
  scenarioFamily: "holy_grail_war" | "generic";
  canonicalAdvance: boolean;
  conservativeInput: boolean;
  conservativeStreak: number;
  milestonePending: boolean;
  milestoneKind: "summoning" | "scheduled_event" | "none";
  hiddenMilestone: string;
  deadlineDay: number | null;
  deadlineTime: string;
  minimumTurnsBeforeMilestone: number;
  targetWithinTurns: number;
  requireMilestoneThisTurn: boolean;
  /**
   * 이미 더 뒤 단계로 넘어간 저장본에서 과거 사건의 소품 장부만 빠진 경우,
   * 과거 장면을 재연하지 않고 이번 상태 반영에서 조용히 보정할 항목.
   */
  reconciledInventoryAdds: string[];
  routeLock: StoryRouteLock;
  directives: string[];
};

export type StoryDriveAssessment = {
  macroProgress: boolean;
  milestoneTriggered: boolean;
  summoningCircleVisible: boolean;
  majorVisualQueued: boolean;
  protectiveInterventionVisible: boolean;
  endsAtMasterQuestion: boolean;
  routeStepCompleted: boolean;
  prematureProgression: boolean;
  elapsedMinutes: number;
  needsCorrection: boolean;
  reasons: string[];
};

type StoryDriveRecentTurn = {
  userText?: string;
  blocks: Array<Pick<StoryBlock, "text">>;
};

type StoryDriveLongTermMemory = {
  turn: number;
  date?: string;
  time?: string;
  location?: string;
  title: string;
  summary: string;
};

type GeneratedStoryTurn = {
  blocks?: Array<Pick<StoryBlock, "type" | "text" | "speakerId" | "speakerName">>;
  characterVisuals?: unknown[];
  statePatch?: {
    time?: string;
    location?: string;
    clockChanges?: unknown[];
    variablesResolve?: string[];
    encounteredCharactersAdd?: unknown[];
    inventoryAdd?: string[];
    memoryAdd?: string[];
    inventoryRemove?: string[];
    autonomyActions?: unknown[];
  };
};

const safeStringify = (value: unknown, maxChars = 18_000): string => {
  try {
    return JSON.stringify(value).slice(0, maxChars);
  } catch {
    return "";
  }
};

const normalize = (value: string) =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim();

const compact = (value: string) =>
  normalize(value).replace(/[^\p{L}\p{N}]+/gu, "");

const MASTER_QUESTION = "묻겠다그대가나의마스터인가";

export const saberSummoningIsVisible = (value: string): boolean => {
  const text = normalize(value);
  const circleVisible =
    /소환진|마법진|마법\s*문양|원형\s*문양|빛의\s*원|바닥.{0,28}(?:문양|진)/u.test(
      text,
    );
  const manifestationVisible =
    /현현|소환(?:되|됐|되었|발생|완료)|(?:소녀|검사|인영).{0,36}(?:나타(?:났|나|난)|모습을\s*드러|빛\s*속에서)/u.test(
      text,
    );
  const saberFigureVisible =
    /(?:소녀|검사|인영|그녀).{0,60}(?:검|장검|칼날)|(?:검|장검|칼날).{0,60}(?:소녀|검사|인영|그녀)/u.test(
      text,
    );
  return circleVisible && manifestationVisible && saberFigureVisible;
};

const turnEndsAtMasterQuestion = (turn: GeneratedStoryTurn): boolean => {
  const publicBlocks = (turn.blocks ?? []).filter(
    (block) => block.type !== "system",
  );
  const finalBlock = publicBlocks.at(-1);
  return Boolean(
    finalBlock?.type === "dialogue" &&
      compact(finalBlock.text) === MASTER_QUESTION,
  );
};

const isConservativeInput = (value: string): boolean =>
  /(?:우선|일단|그냥|가만|기다|지켜본|관여하지|무시|나중|보류|미룬|수업|공부|일상|집(?:으로)?\s*(?:간|돌아)|돌아간|휴식|쉰|쉬자|잠을|잠든|안전한|피한다|물러난|떠난다|더\s*조사하지|그만(?:둔|한다)|신중하게)/u.test(
    normalize(value),
  );

const trailingConservativeStreak = (
  userText: string,
  recentTurns: StoryDriveRecentTurn[],
): number => {
  let count = isConservativeInput(userText) ? 1 : 0;
  if (!count) return 0;
  for (const turn of [...recentTurns].reverse().slice(0, 4)) {
    if (!isConservativeInput(turn.userText ?? "")) break;
    count += 1;
  }
  return count;
};

const parseTime = (value: string): number | null => {
  const match = normalize(value).match(/(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)(?:\D|$)/u);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const parseDay = (value: string): number | null => {
  const match = normalize(value).match(/D\s*\+\s*(\d+)/iu);
  return match ? Number(match[1]) : null;
};

const parseMinimumPlayerTurns = (value: string): number => {
  const match = normalize(value).match(
    /최소\s*(?:사용자\s*)?(?:행동|입력)?\s*(\d+)\s*(?:회|턴)/u,
  );
  return match ? Number(match[1]) : 0;
};

const formatTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const eventText = (event: ScenarioEvent) =>
  [
    event.name,
    event.type,
    event.status,
    event.timeWindow,
    event.conditions,
    event.participants,
    event.effects,
    event.onSuccess,
    event.onFailure,
    event.followUp,
    event.description,
  ]
    .join(" ")
    .slice(0, 4_000);

const splitContractList = (value = "", includeComma = false): string[] =>
  [...new Set(value
    .split(includeComma ? /[|,;\n]/u : /[|;\n]/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2))]
    .slice(0, 16);

const extractRequiredItemsFromEffects = (effects = ""): string[] => {
  const acquisition = effects.match(
    /(?:열었을\s*때|경우|시)\s+(.{2,360}?)\s*(?:획득|확보|회수|전달받)/u,
  )?.[1] ?? effects.match(
    /(?:^|[.;。]\s*)(.{2,240}?)\s*(?:획득|확보|회수|전달받)/u,
  )?.[1] ?? "";
  return [...new Set(acquisition
    .split(/[·,]/u)
    .map((item) => item
      .trim()
      .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "")
      .replace(/^(?:그리고|및)\s+/u, ""))
    .filter((item) => item.length >= 2 && item.length <= 100))]
    .slice(0, 16);
};

export const requiredEventItems = (event: ScenarioEvent): string[] => {
  const explicit = splitContractList(event.requiredItems, true);
  return explicit.length ? explicit : extractRequiredItemsFromEffects(event.effects);
};

const inventoryContainsAll = (inventory: string[], requiredItems: string[]): boolean => {
  return requiredItems.every((item) =>
    contractInventoryContainsItem(inventory, item)
  );
};

const PENDING_EVENT_LANGUAGE =
  /(?:가능\s*상태|수령\s*가능|수령\s*대기|도착\s*예정|예정\s*시각|진행\s*예정|준비\s*중|직전|선택할지|할지\s*결정|아직\s*(?:열지|받지|완료되지|발생하지)|미개봉|미수령)/u;

const eventNameCompletedInText = (eventName: string, observed: string): boolean => {
  const escaped = eventName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  return new RegExp(
    `(?:${escaped}.{0,180}(?:완료|해결|종료|성립|확보|획득|전달받|도착했|만났|대면했|열렸|발동했|격퇴했|탈출했)|(?:완료|해결|종료|성립|확보|획득|전달받|도착했|만났|대면했|열렸|발동했|격퇴했|탈출했).{0,180}${escaped})`,
    "u",
  ).test(observed);
};

const parcelCompletionVisible = (observed: string): boolean => {
  if (PENDING_EVENT_LANGUAGE.test(observed)) {
    const withoutPending = observed.replace(new RegExp(PENDING_EVENT_LANGUAGE.source, "gu"), "");
    if (withoutPending === observed) return false;
    observed = withoutPending;
  }
  return (
    /(?:택배|소포|상자|보관함|봉투).{0,120}(?:수령(?:을)?\s*(?:완료|확정|했|함)|실제로\s*받|인도받|회수했|꺼냈|열었|문이\s*열렸|배출구로\s*나왔)/u.test(observed) ||
    /(?:수령(?:을)?\s*(?:완료|확정|했|함)|실제로\s*받|인도받|회수했|꺼냈|열었|문이\s*열렸|배출구로\s*나왔).{0,120}(?:택배|소포|상자|보관함|봉투)/u.test(observed)
  );
};

const parcelItemsAcquiredInStory = (
  observed: string,
  requiredItems: string[],
): boolean => {
  if (!requiredItems.length) return true;
  if (!requiredItems.every((item) => contractItemMentioned(item, observed))) return false;
  return /(?:상자|택배|소포|보관함|봉투).{0,220}(?:열자|열었|꺼냈|챙겼|확보했|손에\s*넣|메신저백\s*안|가방\s*안)|(?:꺼냈|챙겼|확보했|손에\s*넣|메신저백\s*안|가방\s*안).{0,220}(?:상자|택배|소포|보관함|봉투)/u.test(
    observed,
  );
};

const requiredEventComplete = (
  event: ScenarioEvent,
  observed: string,
  inventory: string[] = [],
): boolean => {
  const requiredItems = requiredEventItems(event);
  const itemsSatisfied = inventoryContainsAll(inventory, requiredItems);
  if (/(?:complete|completed|resolved|ended|완료|해결|종료)/iu.test(event.status)) {
    return requiredItems.length === 0 || itemsSatisfied;
  }
  const observedKey = compact(`${observed}\n${inventory.join("\n")}`);
  if (observedKey.includes(compact(`필수 사건 완료: ${event.id}`))) {
    return requiredItems.length === 0 || itemsSatisfied;
  }
  const completionSignals = splitContractList(event.completionSignals);
  const signalSatisfied = completionSignals.length === 0 ||
    completionSignals.some((signal) => contractSituationSatisfied(signal, observed));
  const requiredDialogue = event.requiredDialogue?.trim() ?? "";
  const dialogueSatisfied = !requiredDialogue ||
    observedKey.includes(compact(requiredDialogue));
  if (completionSignals.length || requiredItems.length || requiredDialogue) {
    return signalSatisfied && itemsSatisfied && dialogueSatisfied;
  }
  return eventNameCompletedInText(event.name, observed);
};

const activeEvent = (event: ScenarioEvent) =>
  !/(?:complete|completed|resolved|ended|cancelled|완료|해결|종료|취소)/iu.test(
    event.status,
  );

const selectSummoningEvent = (events: ScenarioEvent[]): ScenarioEvent | undefined =>
  events
    .filter(activeEvent)
    .filter((event) =>
      /(?:우발\s*소환|세이버.{0,24}소환|소환.{0,24}세이버|첫\s*(?:계약|소환)|servant.{0,20}summon|saber.{0,20}summon)/iu.test(
        eventText(event),
      )
    )
    .sort((left, right) => right.priority - left.priority)[0];

const isHolyGrailWar = (pack: ScenarioPack): boolean => {
  const descriptor = [
    pack.title,
    pack.genre,
    pack.opening.openingEvent,
    pack.opening.currentSituation,
    safeStringify(pack.world, 12_000),
  ].join(" ");
  return /(?:fate\/?|성배\s*전쟁|서번트|servant)/iu.test(descriptor);
};

const observedStoryText = (
  pack: ScenarioPack,
  state: RuntimeState,
  recentTurns: StoryDriveRecentTurn[],
  longTermMemories: StoryDriveLongTermMemory[] = [],
) => {
  const encountered = new Set(state.encounteredCharacterIds ?? []);
  const encounteredCharacters = pack.npcs
    .filter((npc) => encountered.has(npc.id))
    .map((npc) => `${npc.name} ${npc.role} ${npc.publicInfo}`);
  return [
    state.sceneSummary,
    ...state.memories,
    ...state.variables
      .filter((variable) => variable.visibility === "public")
      .flatMap((variable) => [variable.label, variable.detail]),
    ...state.observableTraces.map((trace) => trace.text),
    ...state.inventory,
    ...longTermMemories.flatMap((memory) => [
      memory.title,
      memory.summary,
      memory.location ?? "",
      memory.date ?? "",
      memory.time ?? "",
    ]),
    ...recentTurns.slice(-15).flatMap((turn) => [
      turn.userText ?? "",
      ...turn.blocks.map((block) => block.text),
    ]),
    ...encounteredCharacters,
  ].join("\n");
};

const inactiveRouteLock = (
  forbiddenRegression: string[] = [],
): StoryRouteLock => ({
  active: false,
  routeId: "",
  phase: "",
  currentEventId: "",
  currentEventName: "",
  strictRules: [],
  forbiddenProgression: [],
  forbiddenRegression,
  recoverMissedRequiredEvent: false,
  required: false,
  completionSignals: [],
  requiredItems: [],
  requiredDialogue: "",
  requiredSpeakerId: "",
  recoveryAlternatives: [],
  preservePlayerChoice: true,
  endSceneAfterCompletion: false,
});

/**
 * ACT 0가 적용되지 않는 작품과 이미 끝난 작품을 구분한다. 완료 표식을
 * 잃으면 일반 필수 사건 탐색기가 패키지 첫 줄부터 다시 읽어 과거 장면을
 * 재개할 수 있으므로, 비활성 상태에서도 완료된 경로의 정체를 유지한다.
 */
const completedActZeroRouteLock = (
  adapter: NonNullable<ReturnType<typeof resolveWorkAdapter>>,
): StoryRouteLock => {
  const completed = adapter.completedRoute();
  return {
    ...inactiveRouteLock(completed.forbiddenRegression),
    ...completed,
  };
};

const orderedRequiredEvents = (pack: ScenarioPack) =>
  pack.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.required)
    .sort(
      (left, right) =>
        (left.event.sequence ?? left.index + 1) -
          (right.event.sequence ?? right.index + 1) ||
        left.index - right.index,
    );

const actZeroProgressFloor = (
  marker: StoryRouteProgressMarker | undefined,
  adapter: NonNullable<ReturnType<typeof resolveWorkAdapter>>,
): number => {
  if (marker?.routeId !== adapter.routeId) return 0;
  if (marker.eventId === adapter.eventMap.mapGlitch) return 0;
  const phaseIndex = adapter.phaseOrder.indexOf(
    marker.phase as (typeof adapter.phaseOrder)[number],
  );
  if (
    marker.phase === "separate_evening_daily_life" &&
    marker.adjudication !== "semantic-v1"
  ) {
    return adapter.phaseOrder.indexOf("separate_evening_daily_life");
  }
  return phaseIndex < 0 ? 0 : phaseIndex + 1;
};

const deriveActZeroRouteLock = ({
  pack,
  state,
  recentTurns,
  longTermMemories = [],
  summoned,
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  recentTurns: StoryDriveRecentTurn[];
  longTermMemories?: StoryDriveLongTermMemory[];
  summoned: boolean;
}): StoryRouteLock => {
  const adapter = resolveWorkAdapter(pack);
  const eventById = new Map(pack.events.map((event) => [event.id, event]));
  if (!adapter) {
    return inactiveRouteLock();
  }

  const observed = observedStoryText(pack, state, recentTurns, longTermMemories);
  const persistedCharacterIds = new Set([
    ...(state.encounteredCharacterIds ?? []),
    ...(state.characterVisuals ?? []).map((profile) => profile.characterId),
  ]);
  const parcelEvent = eventById.get(adapter.eventMap.parcel);
  const parcelRequiredItems = parcelEvent ? requiredEventItems(parcelEvent) : [];
  const parcelItemsSecured = inventoryContainsAll(
    state.inventory,
    parcelRequiredItems,
  );
  const parcelStoryAcquired = parcelItemsAcquiredInStory(
    observed,
    parcelRequiredItems,
  );
  const parcelHandled = (parcelCompletionVisible(observed) || parcelStoryAcquired) &&
    (parcelRequiredItems.length === 0 ||
      parcelItemsSecured ||
      parcelStoryAcquired);
  const nadiaNpcIds = new Set(
    pack.npcs
      .filter((npc) => adapter.patterns.nadiaName.test(npc.name))
      .map((npc) => npc.id),
  );
  const nadiaPersisted = [...nadiaNpcIds].some((npcId) =>
    persistedCharacterIds.has(npcId)
  );
  const nadiaObserved = adapter.patterns.nadiaName.test(observed) || nadiaPersisted;
  const explicitNadiaSceneClosed = nadiaObserved &&
    adapter.patterns.nadiaSceneClosed.test(observed);
  // 첫 만남 자체는 캐릭터 기록에 남았지만 구형 저장본이 장면 종료 문장을
  // 보존하지 못한 경우가 있다. 이때 현재 장면이 집·다음 날·별도 일상으로
  // 이미 이동했다면 과거의 작품 전용 조우를 다시 열지 않는다. 반대로 현재
  // sceneSummary가 그 조우의 대화를 명시하면 시각이나 턴 수와 무관하게
  // 진행 중인 대화를 유지한다.
  const latestRecentTurn = recentTurns.at(-1);
  const latestRecentText = latestRecentTurn
    ? [
        latestRecentTurn.userText ?? "",
        ...latestRecentTurn.blocks.map((block) => block.text),
      ].join("\n")
    : "";
  const currentSceneText = state.sceneSummary.trim() || latestRecentText;
  const residentialNow =
    /(?:집|자택|주거지|아파트|원룸|기숙사|침실|거실|현관)/u.test(
      state.location,
    );
  const campusNow =
    /(?:대학|대학교|캠퍼스|교내|공학관|박물관|별관|안내도|보행로)/u.test(
      state.location,
    );
  const currentSceneExplicitlyClosed =
    /(?:떠났|멀어졌|작별|대화가\s*(?:끝|마무리)|만남이\s*(?:끝|마무리)|상황이?\s*마무리|시간이\s*(?:많이\s*)?흘렀|다음\s*날|아침이\s*밝)/u.test(
      currentSceneText,
    );
  const nadiaActiveNow =
    campusNow &&
    adapter.patterns.nadiaName.test(currentSceneText) &&
    !currentSceneExplicitlyClosed;
  const clearlyDifferentCurrentScene =
    residentialNow ||
    state.day > 0 ||
    /(?:귀가|침실|기상|아침|수업|과제|식사|배달|출근|취침|잠에서|다른\s*장소|별도\s*일상)/u.test(
      currentSceneText,
    );
  const implicitNadiaSceneClosed =
    nadiaObserved &&
    !nadiaActiveNow &&
    currentSceneText.length > 0 &&
    clearlyDifferentCurrentScene;
  const nadiaSceneClosed =
    explicitNadiaSceneClosed || implicitNadiaSceneClosed;
  const currentMinutes = parseTime(state.time) ?? 0;
  // 평범한 저녁의 소재가 언급됐다는 사실만으로 장면을 끝내지 않는다.
  // 새 응답은 Luna의 narrativeAudit을 통과한 뒤 서버 진행도 표식을 남기며,
  // 그 표식만이 다음 정전 단계로 넘어가는 권위 있는 완료 기록이다.
  const persistedProgress = readStoryRouteProgress(state);
  const eveningDailyCompleted =
    persistedProgress?.routeId === adapter.routeId &&
    persistedProgress.adjudication === "semantic-v1" &&
    adapter.phaseOrder.indexOf(
      persistedProgress.phase as (typeof adapter.phaseOrder)[number],
    ) >= adapter.phaseOrder.indexOf("separate_evening_daily_life");
  const blackoutExperienced =
    /(?:22\s*[:시]\s*47|정전|전력.{0,20}꺼|불이.{0,12}꺼)/u.test(observed) &&
    /(?:종이\s*가면|추적자|습격|쫓아|공격)/u.test(observed);
  const shelterReached = blackoutExperienced &&
    adapter.patterns.shelterReached.test(observed);
  const saberPersisted = pack.npcs.some((npc) =>
    persistedCharacterIds.has(npc.id) &&
    adapter.patterns.saberDescriptor.test(
      `${npc.role} ${npc.affiliation} ${npc.publicInfo} ${npc.hiddenInfo}`,
    )
  );
  const firstBattleCompleted = (summoned || saberPersisted) &&
    adapter.patterns.firstBattleCompleted.test(observed);
  const churchInvitationIssued = (summoned || saberPersisted) &&
    adapter.patterns.churchInvitation.test(observed);
  const churchReached = adapter.patterns.churchReached.test(observed);

  const activeNadiaBeforeParcelCompletion = !parcelHandled && nadiaObserved &&
    !nadiaSceneClosed && !blackoutExperienced && !(summoned || saberPersisted);

  let evidencePhaseFloor = 0;
  if (parcelHandled) evidencePhaseFloor = Math.max(evidencePhaseFloor, 1);
  if (nadiaObserved) evidencePhaseFloor = Math.max(evidencePhaseFloor, 2);
  if (nadiaSceneClosed) evidencePhaseFloor = Math.max(evidencePhaseFloor, 3);
  if (eveningDailyCompleted) evidencePhaseFloor = Math.max(evidencePhaseFloor, 4);
  if (blackoutExperienced) evidencePhaseFloor = Math.max(evidencePhaseFloor, 5);
  if (shelterReached) evidencePhaseFloor = Math.max(evidencePhaseFloor, 6);
  if (summoned || saberPersisted) evidencePhaseFloor = Math.max(evidencePhaseFloor, 7);
  if (firstBattleCompleted || churchInvitationIssued) {
    evidencePhaseFloor = Math.max(evidencePhaseFloor, 8);
  }
  if (churchReached) evidencePhaseFloor = adapter.phaseOrder.length;
  const authoritativeProgressFloor =
    persistedProgress?.routeId === adapter.routeId &&
      persistedProgress.adjudication === "semantic-v1"
      ? actZeroProgressFloor(persistedProgress, adapter)
      : null;
  // 새 저장본에서는 서버가 의미 검증 후 기록한 사건 커서가 유일한
  // 진행 원장이다. 본문에 미래 사건의 단어·회상·오염 문장이 있어도
  // 그 단어만으로 패키지 순서를 건너뛰지 않는다. 원장이 없는 구형
  // 저장본에 한해서만 기존 전문을 한 번 마이그레이션 근거로 사용한다.
  // 의미 검증 커서는 일반적으로 본문보다 우선한다. 단, 실제로 저장된
  // 세이버 기준본과 현재 성당 위치처럼 되돌릴 수 없는 구조화 상태는 오래된
  // 커서가 뒤처졌음을 증명하므로 그 지점까지만 단조롭게 전진시킨다.
  let irreversibleStateFloor = 0;
  if (saberPersisted) irreversibleStateFloor = 7;
  if (saberPersisted && firstBattleCompleted) irreversibleStateFloor = 8;
  const churchStatePersisted = saberPersisted &&
    /(?:성당|교회|고해실|보호실)/u.test(state.location) &&
    churchReached;
  if (churchStatePersisted) irreversibleStateFloor = adapter.phaseOrder.length;
  let phaseFloor = authoritativeProgressFloor === null
    ? Math.max(evidencePhaseFloor, actZeroProgressFloor(persistedProgress, adapter))
    : Math.max(authoritativeProgressFloor, irreversibleStateFloor);
  // 조우나 그 이후 사건이 실제 전문에 성립했다면 택배 장부 누락만을
  // 이유로 사건 커서를 과거로 되돌리지 않는다. 빠진 소품은 아래의
  // reconciledInventoryAdds가 상태만 보정한다.
  if (
    !parcelHandled &&
    evidencePhaseFloor === 0 &&
    actZeroProgressFloor(persistedProgress, adapter) === 0
  ) {
    phaseFloor = activeNadiaBeforeParcelCompletion ? 2 : 0;
  }

  if (phaseFloor >= adapter.phaseOrder.length) {
    return completedActZeroRouteLock(adapter);
  }

  const {
    phase,
    currentEventId,
    strictRules,
    forbiddenProgression,
    forbiddenRegression,
  } = adapter.routePolicy({
    phaseFloor,
    currentMinutes,
    turn: state.turn,
  });

  const currentEvent = eventById.get(currentEventId);
  const fallbackRequiredDialogue = phase === "accidental_summoning"
    ? adapter.identity.canonicalMasterQuestion
    : "";
  const fallbackSpeakerId = phase === "accidental_summoning"
    ? adapter.primaryMilestoneNpc(pack)?.id ?? ""
    : "";
  return {
    active: true,
    routeId: adapter.routeId,
    phase,
    currentEventId,
    currentEventName: currentEvent?.name ?? currentEventId,
    strictRules,
    forbiddenProgression,
    forbiddenRegression,
    recoverMissedRequiredEvent: false,
    required: true,
    completionSignals: [
      ...splitContractList(currentEvent?.completionSignals ?? ""),
      ...(currentEvent?.sceneMarkers ?? [])
        .filter((marker) => marker.phase === "complete")
        .map((marker) => marker.label),
    ],
    requiredItems: currentEvent ? requiredEventItems(currentEvent) : [],
    requiredDialogue:
      currentEvent?.requiredDialogue?.trim() || fallbackRequiredDialogue,
    requiredSpeakerId:
      currentEvent?.requiredSpeakerId?.trim() || fallbackSpeakerId,
    recoveryAlternatives: [
      ...splitContractList(currentEvent?.recoveryAlternatives ?? ""),
      ...(currentEvent?.alternateBeats ?? [])
        .slice()
        .sort((left, right) => right.priority - left.priority)
        .map((beat) => beat.narrativeGoal)
        .filter(Boolean),
    ],
    preservePlayerChoice: currentEvent?.preservePlayerChoice ?? true,
    endSceneAfterCompletion:
      currentEvent?.endSceneAfterCompletion ?? true,
  };
};

const deriveGenericRequiredRouteLock = ({
  pack,
  state,
  recentTurns,
  longTermMemories = [],
  skipEventIds = new Set<string>(),
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  recentTurns: StoryDriveRecentTurn[];
  longTermMemories?: StoryDriveLongTermMemory[];
  skipEventIds?: ReadonlySet<string>;
}): StoryRouteLock => {
  const observed = observedStoryText(pack, state, recentTurns, longTermMemories);
  const allOrdered = orderedRequiredEvents(pack);
  const skipped = allOrdered.filter(({ event }) => skipEventIds.has(event.id));
  const ordered = allOrdered.filter(({ event }) => !skipEventIds.has(event.id));
  const marker = readStoryRouteProgress(state);
  const authoritativeMarker =
    marker?.routeId === "PACKAGE_REQUIRED_EVENT_SEQUENCE" &&
    marker.adjudication === "semantic-v1";
  const markerCompletedEventIds = new Set(
    marker?.routeId === "PACKAGE_REQUIRED_EVENT_SEQUENCE"
      ? marker.completedEventIds
      : [],
  );
  const observedCompletions = ordered.map(({ event }) =>
    requiredEventComplete(event, observed, state.inventory)
  );
  const markerCompletions = ordered.map(({ event }) =>
    markerCompletedEventIds.has(event.id) &&
    inventoryContainsAll(state.inventory, requiredEventItems(event))
  );
  const completedEvidence = authoritativeMarker
    ? markerCompletions
    : ordered.map((_, index) =>
        observedCompletions[index] || markerCompletions[index]
      );
  // Story progress is monotonic. If a later required event is already proven,
  // every earlier event is closed as part of the elapsed route even when an
  // older save never recorded its individual completion. Reopening that hole
  // would make the present scene jump back into an expired storyline.
  const closedThroughIndex = authoritativeMarker
    ? completedEvidence.reduce(
        (closed, completed, index) =>
          index === closed + 1 && completed ? index : closed,
        -1,
      )
    : completedEvidence.reduce(
        (latest, completed, index) => completed ? Math.max(latest, index) : latest,
        -1,
      );
  const nextOrderedIndex = closedThroughIndex + 1;
  const closedEventFingerprints = [...skipped, ...ordered
    .filter((_, index) => index <= closedThroughIndex)
  ]
    .flatMap(({ event }) => {
      const contractFingerprints = [
        ...splitContractList(event.completionSignals),
        event.requiredDialogue?.trim() ?? "",
      ].filter(Boolean);
      return contractFingerprints.length ? contractFingerprints : [event.name];
    })
    .filter(Boolean)
    .slice(-24);
  const next = ordered[nextOrderedIndex];
  if (!next) return inactiveRouteLock(closedEventFingerprints);

  const event = next.event;
  const recoverMissedRequiredEvent = false;
  const laterEventNames = ordered
    .filter((_, index) => index > nextOrderedIndex)
    .map(({ event: candidate }) => candidate.name)
    .filter(Boolean)
    .slice(0, 8);
  const earlierEventFingerprints = closedEventFingerprints;
  const completionSignals = [
    ...splitContractList(event.completionSignals),
    ...(event.sceneMarkers ?? [])
      .filter((marker) => marker.phase === "complete")
      .map((marker) => marker.label),
  ];
  const requiredItems = requiredEventItems(event);
  const recoveryAlternatives = [
    ...splitContractList(event.recoveryAlternatives),
    ...(event.alternateBeats ?? [])
      .slice()
      .sort((left, right) => right.priority - left.priority)
      .map((beat) => beat.narrativeGoal)
      .filter(Boolean),
  ];
  const strictRules = [
    `패키지의 다음 필수 사건은 ‘${event.name}’이다. 조건과 현재 장면의 인과를 지키며 이 사건을 향해 진행한다.`,
    "이 사건이 아직 현재 순서일 때 누락·회피가 발생하면 현재 시점의 NPC·환경·시간이 만든 우회 경로로 즉시 완료한다.",
    `현재 위치 ‘${state.location}’를 출발점으로 삼는다. 필수 사건의 원래 장소가 달라도 현재 장소에 맞게 변형한다. 다른 장소로 갈 때는 이동 원인 → 출발과 실제 이동 → 이동 수단 또는 동행자의 안내 → 충분한 경과 시간 → 새 장소 도착을 순서대로 쓴다. 자연스러운 연결이 어렵다면 이동을 실제로 시도한 뒤 인물의 판단·상대 반응·교통·날씨·연락·현재 사건 같은 구체적 이유로 멈추거나 돌아오고, 현재 장소에서 사건을 계속한다. 설명 없는 장소 변경은 작가가 복구할 전개이지 턴 폐기 사유가 아니다.`,
    "더 뒤 사건의 완료가 확정된 순간 이 사건보다 앞선 단계는 모두 종결된 과거다. 누락 보충을 이유로 과거 사건·인물·장소·선택지를 다시 현재 서사로 꺼내지 않는다.",
    event.conditions
      ? `발생 조건: ${event.conditions}`
      : "현재 상태와 사건표의 순서에 맞춰 NPC·환경·시간이 사건을 발생시킨다.",
    event.effects || event.description
      ? `반드시 남길 핵심 결과: ${event.effects || event.description}`
      : "사건명에 해당하는 관측 가능한 결과를 본문과 상태 변화에 남긴다.",
    ...(completionSignals.length
      ? [`완료 판정 문구 중 적어도 하나를 자연스럽게 본문에 성립시킨다: ${completionSignals.join(" / ")}`]
      : []),
    ...(requiredItems.length
      ? [`필수 소품을 발견·전달·회수 과정과 함께 등장시키고 inventoryAdd에 같은 명칭으로 기록한다: ${requiredItems.join(" / ")}`]
      : []),
    ...((event.requiredDialogue?.trim() ?? "")
      ? [`필수 대사는 글자 그대로 출력한다: ${event.requiredDialogue}`]
      : []),
    (event.preservePlayerChoice ?? true)
      ? "플레이어가 원래 연출을 거절·회피·변경하면 그 첫 결과는 유지하고, 우회 인과로 필수 결과만 회수한다."
      : "플레이어 주권을 침해하지 않는 범위에서 사건의 핵심 인과를 유지한다.",
    ...(recoveryAlternatives.length
      ? [`허용된 우회 경로: ${recoveryAlternatives.join(" / ")}`]
      : []),
    ...((event.endSceneAfterCompletion ?? false)
      ? ["이 사건이 완료되면 같은 응답에서 다음 필수 사건을 시작하지 않고 새 대응 지점에서 장면을 닫는다."]
      : []),
  ];
  return {
    active: true,
    routeId: "PACKAGE_REQUIRED_EVENT_SEQUENCE",
    phase: "required_event",
    currentEventId: event.id,
    currentEventName: event.name,
    strictRules,
    forbiddenProgression: laterEventNames,
    forbiddenRegression: earlierEventFingerprints,
    recoverMissedRequiredEvent,
    required: true,
    completionSignals,
    requiredItems,
    requiredDialogue: event.requiredDialogue?.trim() ?? "",
    requiredSpeakerId: event.requiredSpeakerId?.trim() ?? "",
    recoveryAlternatives,
    preservePlayerChoice: event.preservePlayerChoice ?? true,
    endSceneAfterCompletion: event.endSceneAfterCompletion ?? false,
  };
};

const missingItemsFromClosedEvents = (
  pack: ScenarioPack,
  state: RuntimeState,
  routeLock: StoryRouteLock,
): string[] => {
  const inventoryKey = compact(state.inventory.join("\n"));
  let closedEvents: ScenarioEvent[] = [];

  const adapter = resolveWorkAdapterByRouteId(routeLock.routeId);
  if (adapter) {
    const currentIndex = adapter.eventIds.indexOf(
      routeLock.currentEventId as (typeof adapter.eventIds)[number],
    );
    if (currentIndex > 0) {
      closedEvents = adapter.eventIds.slice(0, currentIndex)
        .map((eventId) => pack.events.find((event) => event.id === eventId))
        .filter((event): event is ScenarioEvent => Boolean(event));
    }
  } else if (routeLock.routeId === "PACKAGE_REQUIRED_EVENT_SEQUENCE") {
    const ordered = orderedRequiredEvents(pack);
    const currentIndex = ordered.findIndex(
      ({ event }) => event.id === routeLock.currentEventId,
    );
    if (currentIndex > 0) {
      closedEvents = ordered.slice(0, currentIndex).map(({ event }) => event);
    }
  }

  return [...new Set(
    closedEvents
      .flatMap(requiredEventItems)
      .filter((item) => !inventoryKey.includes(compact(item))),
  )];
};

const summoningHasOccurred = (
  pack: ScenarioPack,
  state: RuntimeState,
  recentTurns: StoryDriveRecentTurn[],
  longTermMemories: StoryDriveLongTermMemory[] = [],
): boolean => {
  const encountered = new Set([
    ...(state.encounteredCharacterIds ?? []),
    ...(state.characterVisuals ?? []).map((profile) => profile.characterId),
  ]);
  if (
    pack.npcs.some(
      (npc) =>
        encountered.has(npc.id) &&
        /(?:^|\b)saber(?:\b|$)|세이버/iu.test(
          `${npc.role} ${npc.affiliation} ${npc.publicInfo}`,
        ),
    )
  ) {
    return true;
  }
  const observed = observedStoryText(pack, state, recentTurns, longTermMemories);
  return saberSummoningIsVisible(observed) ||
    /(?:우발\s*소환.{0,60}(?:세이버|소녀|검사)|소환(?:진|식|이|은|되|됐|되었|발생|완료).{0,60}(?:세이버|소녀\s*검사|검을\s*든\s*소녀)|세이버.{0,48}(?:소환|현현|나타났|계약)|(?:소녀\s*검사|검을\s*든\s*소녀).{0,64}(?:현현|나타났|불려\s*나왔|연결된\s*상태|계약)|계약.{0,24}(?:세이버|소녀).{0,24}(?:성립|각인))/u.test(
      observed,
    );
};

const elapsedMinutes = (before: string, after: string): number => {
  const start = parseTime(before);
  const end = parseTime(after);
  if (start === null || end === null) return 0;
  if (end >= start) return end - start;
  return 24 * 60 - start + end;
};

export const deriveStoryDrive = ({
  pack,
  state,
  userText,
  recentTurns,
  longTermMemories = [],
  advanceMode = "player",
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  userText: string;
  recentTurns: StoryDriveRecentTurn[];
  longTermMemories?: StoryDriveLongTermMemory[];
  advanceMode?: "player" | "canonical";
}): StoryDrive => {
  const canonicalAdvance = advanceMode === "canonical";
  const holyGrailWar = isHolyGrailWar(pack);
  const conservativeInput = isConservativeInput(userText);
  const conservativeStreak = trailingConservativeStreak(userText, recentTurns);
  const summoned = holyGrailWar && summoningHasOccurred(
    pack,
    state,
    recentTurns,
    longTermMemories,
  );
  const actZeroRouteLock = deriveActZeroRouteLock({
    pack,
    state,
    recentTurns,
    longTermMemories,
    summoned,
  });
  const completedAdapter = resolveWorkAdapterByRouteId(actZeroRouteLock.routeId);
  const actZeroCompleted = Boolean(completedAdapter) &&
    actZeroRouteLock.phase === "completed";
  const genericRouteLock = actZeroRouteLock.active
    ? inactiveRouteLock()
    : deriveGenericRequiredRouteLock({
        pack,
        state,
        recentTurns,
        longTermMemories,
        skipEventIds: actZeroCompleted
          ? new Set(completedAdapter?.eventIds ?? [])
          : new Set<string>(),
      });
  const routeLock = actZeroRouteLock.active
    ? actZeroRouteLock
    : actZeroCompleted
      ? {
          ...(genericRouteLock.active ? genericRouteLock : actZeroRouteLock),
          forbiddenRegression: [...new Set([
            ...actZeroRouteLock.forbiddenRegression,
            ...genericRouteLock.forbiddenRegression,
          ])],
        }
      : genericRouteLock;
  const reconciledInventoryAdds = missingItemsFromClosedEvents(
    pack,
    state,
    routeLock,
  );
  const routeAllowsSummoning = !routeLock.active ||
    routeLock.phase === "accidental_summoning";
  const routeEvent = routeLock.active
    ? pack.events.find((event) => event.id === routeLock.currentEventId)
    : undefined;
  const genericRequiredEvent = routeLock.phase === "required_event"
    ? routeEvent
    : undefined;
  const summoningEvent = holyGrailWar ? selectSummoningEvent(pack.events) : undefined;
  const selectedMilestoneEvent = genericRequiredEvent ?? summoningEvent;
  const rawMilestone = selectedMilestoneEvent
    ? eventText(selectedMilestoneEvent)
    : "";
  const parsedDeadlineDay = parseDay(rawMilestone);
  const parsedDeadlineMinutes = parseTime(rawMilestone);
  const milestonePending = Boolean(genericRequiredEvent) ||
    (holyGrailWar && !summoned && Boolean(summoningEvent));
  const minimumTurnsBeforeMilestone = milestonePending
    ? parseMinimumPlayerTurns(rawMilestone)
    : 0;
  const minimumTurnsReached = state.turn >= minimumTurnsBeforeMilestone;
  const deadlineDay = milestonePending ? parsedDeadlineDay : null;
  const deadlineMinutes = milestonePending ? parsedDeadlineMinutes : null;
  const deadlineTime = deadlineMinutes === null ? "" : formatTime(deadlineMinutes);
  const currentMinutes = parseTime(state.time) ?? parseTime(pack.startTime) ?? 0;
  const deadlineReached = deadlineDay !== null && deadlineMinutes !== null &&
    (state.day > deadlineDay ||
      (state.day === deadlineDay && currentMinutes >= deadlineMinutes));
  let mode: StoryDriveMode = "steady";
  if (milestonePending) {
    if (
      (routeAllowsSummoning || Boolean(genericRequiredEvent)) &&
      minimumTurnsReached &&
      (deadlineReached ||
        state.turn >= 12 ||
        conservativeStreak >= 4 ||
        (Boolean(genericRequiredEvent) && canonicalAdvance) ||
        (state.turn >= 9 && conservativeInput))
    ) {
      mode = "force_milestone";
    } else if (
      deadlineReached ||
      state.turn >= 5 ||
      conservativeStreak >= 2 ||
      (state.day === 0 && currentMinutes >= 18 * 60)
    ) {
      mode = "accelerate";
    }
  }
  const genericRequiredReady = Boolean(genericRequiredEvent) &&
    minimumTurnsReached &&
    (deadlineDay === null || deadlineMinutes === null || deadlineReached);
  if (genericRequiredReady) {
    mode = canonicalAdvance || state.turn >= 1
      ? "force_milestone"
      : "accelerate";
  }
  if (
    holyGrailWar &&
    summoned &&
    (canonicalAdvance || conservativeStreak >= 2)
  ) {
    mode = "accelerate";
  }
  if (canonicalAdvance && mode === "steady") {
    mode = "accelerate";
  }

  const hiddenMilestone = routeEvent
    ? eventText(routeEvent)
    : milestonePending
      ? rawMilestone
      : "";
  const targetWithinTurns = mode === "force_milestone"
    ? 0
    : mode === "accelerate"
      ? 1
      : milestonePending
        ? Math.max(
            1,
            (minimumTurnsBeforeMilestone || 6) - state.turn,
          )
        : 0;
  const directives = [
    "이야기 진행은 단조 증가한다. 이미 완료되었거나 더 뒤 사건의 발생으로 완료가 확정된 과거 사건을 현재 장면으로 다시 재연·재선택·되감지 않는다.",
    "과거 사건은 회상이나 짧은 사실 확인으로만 언급할 수 있으며, 현재 시각·장소·상태를 그 사건 당시로 되돌리거나 당시의 선택지를 다시 제시하지 않는다.",
    `현재 위치 ‘${state.location}’는 다음 응답의 출발점이다. 필수 사건의 고정 장소와 다르면 사건을 현재 위치에 맞게 변형한다. 다른 장소가 필요하면 이동 이유·실제 이동 과정·수단 또는 동행자·경과 시간·새 장소 도착을 순서대로 서술한다. 연결이 부자연스러우면 이동을 시도한 뒤 구체적인 작중 이유로 번복해 현재 위치로 돌아오고, 현재 장소에서 비트와 사건을 계속 진행한다.`,
    "필수 사건 누락은 그 사건이 아직 현재 잠금 단계일 때만 현재 시점의 대체 경로로 복구한다. 다음 사건이 완료된 뒤에는 이전 사건을 복구 장면으로 재개하지 않고 현재 사건과 그 이후 인과만 이어 간다.",
    "플레이어의 보수적·소극적 선택은 장면의 경로와 비용을 바꿀 뿐, 패키지에 고정된 필수 사건을 취소하거나 무기한 연기하지 않는다.",
    "사용자가 새로운 장소·흔적·사고·환경 결과를 직접 제시하면 이를 별개의 미래 사건으로 밀어내지 말고, 현재 비트에서 인물이 관측하고 반응하는 결과로 먼저 흡수한다. 활성 사건과 연결 가능한 흔적이면 같은 인과 안에서 진행하고 가능하면 현재 비트 안에서 종결한다.",
    "현재 잠금 단계의 필수 사건을 플레이어가 명시적으로 부정해도 그 선택을 되감지 않는다. 원래 장소·첫 시도·거절 결과는 유지하고, 다음 사건으로 넘어가기 전에 다른 장소의 사고·다른 적의 동선·NPC의 연락·세계 규칙의 지연 반응으로 같은 필수 인과와 도착점을 회수한다.",
    "필수 사건은 플레이어가 정답 행동을 맞혀야 열리는 보상이 아니다. 시간, NPC 계획, 적대 세력, 촉매, 환경이 독립적으로 움직여 예정된 인과를 발생시킨다.",
    "사용자가 짧게 답하거나 일상으로 돌아가면 관계·정보 변화 없이 반복되는 일상만 압축하고, 그동안 진행된 외부 사건의 관측 가능한 결과가 현재 장면에 도달하게 한다.",
    "storyDirector의 이름·마감·단계·숨은 목표를 본문, 상태창, 기억, 공개 변수, 추천 행동에 메타 정보로 노출하지 않는다.",
  ];
  if (holyGrailWar && summoned) {
    directives.push(
      "계약 이후 주요 서번트와의 낮 일상은 불필요한 지연이 아니라 관계와 전투 인과를 쌓는 정식 서사다. 필요하면 1~2턴 동안 호칭·생활 규칙·가치관·전날 후유증을 다루되, 매 장면에서 관계나 정보가 하나는 달라지게 한다.",
      "낮에 생긴 약속·갈등·정보가 밤의 조사와 협공을 바꾸고, 밤의 부상·마력 소모·판단이 다음 날 생활과 대사에 남도록 이어 붙인다.",
    );
  }
  if (canonicalAdvance) {
    directives.push(
      "사용자는 플레이어의 대사나 행동을 선언하지 않고 ‘이어서 진행’을 선택했다. 플레이어가 말하거나 움직이거나 동의하거나 감정을 느꼈다고 새로 쓰지 않는다.",
      "패키지 사건표에서 현재 조건이 충족된 사건을 먼저, 시간상 가장 가까운 사건을 다음으로, 우선순위가 높은 사건을 그다음으로 삼아 정석 흐름의 다음 장면을 진행한다.",
      "플레이어의 입력을 기다리는 정지 장면을 반복하지 않는다. 시간 경과, 현장 NPC의 자율 행동, 연락·방문·침입·사고·환경 변화 중 세계관에 등록된 원인을 사용해 최소 하나의 의미 있는 사건 비트를 완료한다.",
      "현재 사건을 결말까지 자동 해결하지 말고, NPC와 세계가 진행시킨 결과를 보여준 뒤 플레이어의 판단이 의미를 갖는 새 대응 지점에서 멈춘다.",
      "숨은 사건명·향후 결과·미등장 인물·진명은 여전히 공개하지 않는다.",
    );
  }
  if (routeLock.active) {
    directives.push(
      `[패키지 사건 잠금] 현재 허용 사건은 ${routeLock.currentEventName}(${routeLock.phase}) 하나다. 사건 ID와 단계명은 플레이어에게 노출하지 않는다.`,
      ...routeLock.strictRules,
      `이번 응답에서 앞당기면 안 되는 내용: ${routeLock.forbiddenProgression.join(", ")}. 허용 사건을 끝내더라도 이 목록의 다음 사건을 같은 응답에 붙이지 않는다.`,
      `이미 끝나 다시 현재 장면으로 만들면 안 되는 내용: ${routeLock.forbiddenRegression.join(", ") || "현재 단계보다 앞선 모든 필수 사건"}.`,
      "현재 허용 사건의 인과와 사용자 입력만 처리한다. 미래 사건의 이미지·대사·정체·소품을 예고편처럼 먼저 보여주지 않는다.",
    );
  } else if (routeLock.forbiddenRegression.length) {
    directives.push(
      `[완료 사건 잠금] 다음 사건까지 성립해 종결된 과거 완료 신호는 ${routeLock.forbiddenRegression.join(", ")}이다. 이 신호가 성립하는 옛 장면을 다시 쓰지 말고 현재 시각·장소·갈등에서만 계속한다.`,
    );
  }
  if (milestonePending) {
    directives.push(
      `숨은 다음 필수 이정표: ${hiddenMilestone}`,
      deadlineDay !== null && deadlineTime
        ? `패키지 사건표의 내부 마감은 D+${deadlineDay} ${deadlineTime}이며 앞으로 최대 ${targetWithinTurns}회의 응답 안에 도달한다. 이 문장을 플레이어에게 그대로 보여주지 않는다.`
        : `패키지 사건표의 발생 조건과 우선순위를 따르며 앞으로 최대 ${targetWithinTurns}회의 응답 안에 도달한다. 이 문장을 플레이어에게 그대로 보여주지 않는다.`,
    );
    if (genericRequiredEvent) {
      directives.push(
        "필수 사건은 패키지에 등록된 완료 판정·소품·대사를 충족해야 완료된다. 분위기나 징조만 쓰고 다음 턴으로 미루지 않는다.",
        "등록된 전용 이미지 트리거와 캐릭터 기준 이미지가 있으면 사건 ID와 참여 캐릭터 ID로 연결하고, 모델이 임의의 얼굴을 새로 만들지 않는다.",
      );
    } else {
      directives.push(
        "소환 이전의 단서는 2~3개면 충분하다. 모든 기록의 의미를 해독하거나 택배함·USB·열쇠의 정답을 전부 알아내게 한 뒤에야 진행하는 구조로 만들지 않는다.",
        "소환이 발생해도 현현한 인물의 진명과 역사적 정체는 공개 조건이 충족되기 전까지 숨긴다. 클래스명 역시 작중 인물의 직접 발언이나 관측 가능한 영기 판정으로 공개되기 전에는 쓰지 않고 외형 호칭만 사용한다.",
      );
    }
    if (minimumTurnsBeforeMilestone > 0) {
      directives.push(
        `이 필수 사건은 최소 사용자 행동 ${minimumTurnsBeforeMilestone}턴 전에는 발생시키지 않는다. 현재 턴은 ${state.turn}이며, 최소 턴 전에는 인과를 쌓되 사건 완료를 앞당기지 않는다.`,
      );
    }
  }
  if (mode === "accelerate" && milestonePending && routeAllowsSummoning) {
    directives.push(
      "이번 응답은 현재 입력의 결과를 짧게 확정한 뒤 저위험 시간을 압축하고, 야간 위기·추적·침입·촉매 반응 등 소환 직전의 돌이킬 수 없는 발화점까지 진행한다.",
      "응답 마지막을 또 다른 조사 질문으로 끝내지 않는다. 다음 한 응답 안에 필수 이정표가 발생할 수밖에 없는 급박한 현장으로 바꾼다.",
    );
  } else if (mode === "accelerate" && routeLock.active) {
    directives.push(
      `이번 응답은 ACT 0 사건 잠금이 허용한 ${routeLock.currentEventName}만 충분히 전개한다. 다음 사건을 합치거나 건너뛰지 않는다.`,
      "허용 사건이 대화 종료나 평범한 일상이라면 그 자체를 완결된 사건 변화로 취급한다. 자극을 높이기 위해 습격·마술·정체 공개를 덧붙이지 않는다.",
    );
  } else if (mode === "accelerate" && holyGrailWar && summoned) {
    directives.push(
      "첫 계약 이후 플레이어가 신중하게 기다리거나 일상·부차적 절차에 머물러도 성배전쟁의 다른 마스터·서번트·세력과 패키지 사건은 독립적으로 움직인다.",
      "현재 입력의 직접 결과를 짧게 반영한 뒤, 패키지 사건표와 주요 NPC 계획에서 현재 시각에 맞는 다음 메인 갈등의 관측 가능한 결과까지 진행한다.",
      "시설 확인·행정 절차·반복 조사 같은 보조 장면을 새 소목표로 늘리지 않는다. 관계 대화라면 새로운 정보·결정·위험 중 하나를 남기고, 일상이라면 시간을 압축해 메인 사건이 현재 장면에 영향을 주는 지점에서 멈춘다.",
      "진명·미등장 인물·숨은 계획은 미리 밝히지 않고, 지금 감각·연락·대면으로 드러난 범위만 공개한다.",
    );
  } else if (mode === "accelerate" && canonicalAdvance) {
    directives.push(
      "이번 응답은 패키지의 현재 단계에 맞는 다음 사건 비트를 실제로 완료한다. 분위기나 징조만 덧붙이고 같은 상황에 머물면 실패다.",
      "필요한 저위험 시간은 압축하고, 사건표와 NPC 계획에서 인과적으로 이어지는 새 상황까지 장면을 전환한다.",
    );
  } else if (mode === "force_milestone" && genericRequiredEvent) {
    directives.push(
      `이번 응답 안에서 패키지 필수 사건 ‘${genericRequiredEvent.name}’의 핵심 결과를 실제로 발생시킨다. 징조나 직전 단계에서 멈추면 실패다.`,
      ...routeLock.strictRules,
      routeLock.requiredDialogue
        ? `필수 대사는 정확히 ‘${routeLock.requiredDialogue}’로 출력하고 지정 화자가 말하게 한다.`
        : "필수 대사가 없으면 사건의 관측 가능한 결과가 성립한 새 대응 지점에서 멈춘다.",
      routeLock.endSceneAfterCompletion
        ? "필수 사건이 완료된 즉시 장면을 닫고 다음 필수 사건의 시작·이미지·인물·정보를 같은 응답에 붙이지 않는다."
        : "필수 사건의 직접 반응까지만 다루고 미래 사건을 과도하게 압축하지 않는다.",
      "플레이어가 입력하지 않은 이동·동의·대사·감정을 만들지 않는다. 필요한 원인은 NPC, 환경, 시간, 세계 규칙의 독립 행동에 둔다.",
    );
  } else if (mode === "force_milestone") {
    directives.push(
      "이번 응답 안에서 시간 고정 우발 소환을 실제로 발생시킨다. 징조나 직전 단계에서 멈추면 실패다.",
      "현재 입력의 즉각적 결과 → 필요한 시간 압축 → 외부 습격/촉매/의식의 자동 반응 → 바닥과 공간에 펼쳐지는 소환진·마법 문양 → 소환 발생 → 현현한 소녀 검사가 치명타를 막는 장면까지 한 턴에 묘사한다.",
      "플레이어가 의식이나 주문을 자발적으로 수행했다고 새로 만들지 않는다. 외부 사건과 세계 규칙이 플레이어 주변에서 우발 소환을 일으키게 한다.",
      "소녀 검사는 계약자를 돌아본 뒤 첫 대사로 정확히 ‘묻겠다. 그대가 나의 마스터인가.’라고 말한다. 이 대사를 마지막 비시스템 블록으로 두고, 뒤에는 설명·행동·플레이어 반응을 붙이지 않은 채 즉시 멈춘다.",
      "패키지 이미지 자산의 sceneTags·triggers에 소환, 마법진, 현현, 첫 등장, 계약이 있으면 해당 이미지 트리거를 이 장면에서 사용한다.",
      deadlineTime
        ? "본문에 소환이 실제로 발생했음을 명확히 쓰고, statePatch.time을 패키지 마감 시각 이후로 전진시키며, 새 주요 인물을 encounteredCharactersAdd와 characterVisuals에 추가한다."
        : "본문에 소환이 실제로 발생했음을 명확히 쓰고, 장면 규모만큼 시간을 전진시키며, 새 주요 인물을 encounteredCharactersAdd와 characterVisuals에 추가한다.",
    );
  }

  return {
    mode,
    scenarioFamily: holyGrailWar ? "holy_grail_war" : "generic",
    canonicalAdvance,
    conservativeInput,
    conservativeStreak,
    milestonePending,
    milestoneKind: genericRequiredEvent ||
      (routeLock.active && !routeAllowsSummoning)
      ? "scheduled_event"
      : milestonePending
        ? "summoning"
        : "none",
    hiddenMilestone,
    deadlineDay,
    deadlineTime,
    minimumTurnsBeforeMilestone,
    targetWithinTurns,
    requireMilestoneThisTurn:
      mode === "force_milestone" &&
      (routeAllowsSummoning || Boolean(genericRequiredEvent)),
    reconciledInventoryAdds,
    routeLock,
    directives,
  };
};

export const assessStoryDrive = ({
  state,
  drive,
  turn,
}: {
  state: Pick<RuntimeState, "time"> & Partial<Pick<RuntimeState, "inventory">>;
  drive: StoryDrive;
  turn: GeneratedStoryTurn;
}): StoryDriveAssessment => {
  const text = (turn.blocks ?? []).map((block) => block.text).join("\n");
  const patch = turn.statePatch;
  const advancedMinutes = elapsedMinutes(state.time, patch?.time ?? state.time);
  const decisiveChanges = [
    patch?.clockChanges,
    patch?.variablesResolve,
    patch?.encounteredCharactersAdd,
    patch?.inventoryAdd,
    patch?.inventoryRemove,
    patch?.autonomyActions,
  ].reduce((sum, values) => sum + (values?.length ?? 0), 0);
  const externalEscalation =
    /(?:습격|침입|추격|공격|경보|정전|붕괴|봉쇄|폭발|촉매.{0,24}반응|마력.{0,24}(?:폭주|분출)|의식.{0,24}(?:시작|발동))/u.test(
      text,
    );
  const genericRequiredRoute = drive.routeLock.phase === "required_event";
  const contractText = [
    text,
    ...(patch?.memoryAdd ?? []),
    ...(patch?.inventoryAdd ?? []),
  ].join("\n");
  const contractKey = compact(contractText);
  const contractSignalSatisfied = drive.routeLock.completionSignals.length === 0 ||
    drive.routeLock.completionSignals.some((signal) =>
      contractSituationSatisfied(signal, contractText)
    );
  const contractItemsSatisfied = inventoryContainsAll(
    [...(state.inventory ?? []), ...(patch?.inventoryAdd ?? [])],
    drive.routeLock.requiredItems,
  );
  const contractDialogueSatisfied = !drive.routeLock.requiredDialogue ||
    contractKey.includes(compact(drive.routeLock.requiredDialogue));
  const missedEventRecoveryBridgeVisible =
    !drive.routeLock.recoverMissedRequiredEvent ||
    /(?:현재\s*시점|지연|뒤늦|후속|연락|전송|도착|남겨진|잔류|기록|증거|흔적|보고|통보)/u.test(
      text,
    );
  const explicitGenericContract = drive.routeLock.completionSignals.length > 0 ||
    drive.routeLock.requiredItems.length > 0 ||
    Boolean(drive.routeLock.requiredDialogue);
  const genericContractCompleted = genericRequiredRoute &&
    contractSignalSatisfied &&
    contractItemsSatisfied &&
    contractDialogueSatisfied &&
    missedEventRecoveryBridgeVisible &&
    (explicitGenericContract ||
      eventNameCompletedInText(drive.routeLock.currentEventName, contractText));
  const closedRouteRegression = !drive.routeLock.active &&
    drive.routeLock.forbiddenRegression.some((pastEvent) => {
      const pastKey = compact(pastEvent);
      return pastKey.length >= 3 && contractKey.includes(pastKey);
    });
  const saberMilestoneTriggered = saberSummoningIsVisible(text) ||
    /(?:우발\s*소환.{0,60}(?:세이버|소녀|검사)|소환(?:진|식|이|은|되|됐|되었|발생|완료).{0,60}(?:세이버|소녀\s*검사|검을\s*든\s*소녀)|세이버.{0,48}(?:소환|현현|나타났)|마법진.{0,48}(?:소녀|검사|검을\s*든\s*인영).{0,32}(?:나타|현현)|계약.{0,24}(?:세이버|소녀).{0,24}(?:성립|각인))/u.test(
      text,
    );
  const milestoneTriggered = genericRequiredRoute
    ? genericContractCompleted
    : saberMilestoneTriggered;
  const summoningCircleVisible =
    /(?:소환진|마법진|마법\s*문양|원형진|빛의\s*원|바닥.{0,20}(?:문양|진)).{0,80}(?:빛|타올|펼쳐|그려|새겨|회전|현현|소환)|(?:소환|현현).{0,80}(?:소환진|마법진|마법\s*문양|원형진)/u.test(
      text,
    );
  const majorVisualQueued = (turn.characterVisuals?.length ?? 0) > 0;
  const protectiveInterventionVisible =
    /(?:소녀|검사|그녀|인영).{0,80}(?:치명타|공격|일격|칼날|검격).{0,50}(?:막|받아내|쳐내|가로막|튕겨)|(?:치명타|공격|일격|칼날|검격).{0,80}(?:소녀|검사|그녀|인영).{0,50}(?:막|받아내|쳐내|가로막|튕겨)/u.test(
      text,
    );
  const publicBlocks = (turn.blocks ?? []).filter((block) => block.type !== "system");
  const requiredDialogueAtEnd = genericRequiredRoute
    ? !drive.routeLock.requiredDialogue ||
      compact(publicBlocks.at(-1)?.text ?? "") ===
        compact(drive.routeLock.requiredDialogue)
    : milestoneTriggered && turnEndsAtMasterQuestion(turn);
  const endsAtMasterQuestion = requiredDialogueAtEnd;
  const exactEndingRequired = genericRequiredRoute
    ? Boolean(drive.routeLock.requiredDialogue)
    : milestoneTriggered;
  const routeAdapter = resolveWorkAdapterByRouteId(drive.routeLock.routeId);
  const adapterStepCompleted = routeAdapter
    ? routeAdapter.routeStepCompleted({
        phase: drive.routeLock.phase,
        currentEventId: drive.routeLock.currentEventId,
        text,
        milestoneTriggered,
        endsAtMasterQuestion,
        contractItemsSatisfied,
      })
    : undefined;
  const routeStepCompleted = drive.routeLock.active &&
    (adapterStepCompleted ??
      (drive.routeLock.phase === "required_event"
        ? genericContractCompleted
        : false));
  const adapterPrematureProgression = routeAdapter
    ? routeAdapter.prematureProgression({
        phase: drive.routeLock.phase,
        text,
        routeStepCompleted,
      })
    : undefined;
  const genericPrematureProgression = drive.routeLock.active &&
    drive.routeLock.phase === "required_event" &&
    ((drive.routeLock.endSceneAfterCompletion &&
      drive.routeLock.forbiddenProgression.some((futureEvent) => {
        const futureKey = compact(futureEvent);
        return futureKey.length >= 3 && contractKey.includes(futureKey);
      })) ||
      (!routeStepCompleted &&
        drive.routeLock.forbiddenRegression.some((pastEvent) => {
          const pastKey = compact(pastEvent);
          return pastKey.length >= 3 && contractKey.includes(pastKey);
        })));
  const prematureProgression = closedRouteRegression ||
    (adapterPrematureProgression ?? genericPrematureProgression);
  const macroProgress =
    advancedMinutes >= 45 || decisiveChanges > 0 || externalEscalation ||
    milestoneTriggered || routeStepCompleted;
  const reasons: string[] = [];
  if (prematureProgression) {
    reasons.push("현재 허용 사건을 벗어나 미래 사건을 앞당기거나 완료된 과거 사건으로 되돌아감");
  }
  if (drive.mode === "accelerate" && !macroProgress) {
    reasons.push("메인 사건을 향한 시간·외부 사건·상태 변화가 없음");
  }
  if (drive.mode === "force_milestone" && !milestoneTriggered) {
    reasons.push(
      genericRequiredRoute
        ? drive.routeLock.recoverMissedRequiredEvent &&
            !missedEventRecoveryBridgeVisible
          ? "누락 필수 사건을 과거 재연이 아닌 현재 시점의 후속 결과로 회수하지 않음"
          : "이번 턴에 패키지 필수 사건의 완료 계약이 충족되지 않음"
        : "이번 턴에 필수 우발 소환이 실제로 발생하지 않음",
    );
  }
  if (drive.mode === "force_milestone" && advancedMinutes < 1) {
    reasons.push("고정 사건 시각을 향한 시간 전진이 없음");
  }
  if (
    drive.mode === "force_milestone" &&
    !genericRequiredRoute &&
    !majorVisualQueued
  ) {
    reasons.push("새 주요 서번트의 외형 기준 이미지 등록이 없음");
  }
  if (
    drive.mode === "force_milestone" &&
    !genericRequiredRoute &&
    !summoningCircleVisible
  ) {
    reasons.push("소환진·마법 문양이 장면에 시각적으로 현현하지 않음");
  }
  if (
    milestoneTriggered &&
    exactEndingRequired &&
    !requiredDialogueAtEnd
  ) {
    reasons.push("필수 사건이 등록된 정확한 대사에서 끝나지 않음");
  }
  if (
    drive.scenarioFamily === "holy_grail_war" &&
    !genericRequiredRoute &&
    milestoneTriggered &&
    !protectiveInterventionVisible
  ) {
    reasons.push("소환된 검사가 주인공을 위기에서 구하는 첫 방어가 없음");
  }
  return {
    macroProgress,
    milestoneTriggered,
    summoningCircleVisible,
    majorVisualQueued,
    protectiveInterventionVisible,
    endsAtMasterQuestion,
    routeStepCompleted,
    prematureProgression,
    elapsedMinutes: advancedMinutes,
    needsCorrection:
      prematureProgression ||
      (drive.mode === "accelerate" && !macroProgress) ||
      (milestoneTriggered &&
        exactEndingRequired &&
        !requiredDialogueAtEnd) ||
      (drive.scenarioFamily === "holy_grail_war" &&
        !genericRequiredRoute &&
        milestoneTriggered &&
        !protectiveInterventionVisible) ||
      (drive.mode === "force_milestone" &&
        (!milestoneTriggered ||
          advancedMinutes < 1 ||
          (!genericRequiredRoute && !majorVisualQueued) ||
          (!genericRequiredRoute && !summoningCircleVisible))),
    reasons,
  };
};

export const buildStoryDriveCorrection = (
  drive: StoryDrive,
  assessment: StoryDriveAssessment,
) => `
[메인 시나리오 감독 재작성 지시]
첫 작성은 필수 서사 진행 검사에 실패했다: ${assessment.reasons.join(", ") || "메인 사건 진행 부족"}.
- 사용자가 보수적으로 행동했다는 이유로 필수 사건을 미루거나 같은 단서를 더 조사하게 하지 않는다.
- 현재 입력의 직접 결과는 존중하되, NPC·적대 세력·시간·촉매가 독립적으로 움직여 메인 사건을 플레이어에게 도달시킨다.
- 현재 감독 단계는 ${drive.mode}, 숨은 필수 이정표는 ${drive.hiddenMilestone || "패키지의 다음 고정 사건"}이다.
${drive.routeLock.active
  ? `- 패키지 사건 잠금상 지금 허용된 사건은 ${drive.routeLock.currentEventName}(${drive.routeLock.phase}) 하나다. ${drive.routeLock.strictRules.join(" ")}\n- 이번 응답에서 금지: ${drive.routeLock.forbiddenProgression.join(", ")}. 현재 사건이 끝나도 다음 사건을 같은 응답에 이어 붙이지 않는다.\n- 이미 끝난 사건으로 되돌아가지 않는다: ${drive.routeLock.forbiddenRegression.join(", ") || "현재 단계 이전의 모든 필수 사건"}. 과거는 한 문장 회상만 가능하며 당시 시각·장소·선택지를 현재 장면으로 다시 만들지 않는다.`
  : drive.routeLock.forbiddenRegression.length
    ? `- 필수 사건표의 다음 단계까지 이미 성립했다. 다음 완료 신호가 나타나는 이전 사건을 다시 장면화하지 않는다: ${drive.routeLock.forbiddenRegression.join(", ")}. 현재 시각·장소·갈등에서만 이어 쓴다.`
    : ""}
${drive.routeLock.phase === "required_event"
  ? `- force_milestone 단계에서는 이번 응답 안에 필수 사건 ‘${drive.routeLock.currentEventName}’의 완료 조건을 실제로 성립시킨다. 분위기·징조·질문만 남기고 멈추지 않는다.
- 현재 잠금 사건이 누락·회피되면 다음 사건으로 넘어가기 전에 현재 시점의 대체 경로로 완료한다. 이미 다음 사건이 완료된 과거 단계는 이 잠금 대상으로 다시 선택하지 않는다.
- 완료 판정 문구: ${drive.routeLock.completionSignals.join(" / ") || "사건명과 핵심 효과"}.
- 필수 소품: ${drive.routeLock.requiredItems.join(" / ") || "없음"}. 소품이 있으면 발견 과정을 본문에 쓰고 inventoryAdd에 정확히 기록한다.
- 필수 대사: ${drive.routeLock.requiredDialogue || "없음"}. 대사가 있으면 지정 화자의 정확한 문장으로 마지막 비시스템 블록에 둔다.
- 원래 연출이 막혔다면 첫 결과를 되감지 않고 ${drive.routeLock.recoveryAlternatives.join(" / ") || "NPC·환경·시간의 대체 경로"}로 핵심 인과를 회수한다.`
  : `- force_milestone 단계에서는 이번 응답 안에 소환진의 시각적 현현, 새 주요 인물의 소환, 치명타 방어까지 완료한다. 징조·마법진 점등·습격 시작에서 멈추지 않는다.
- 현현한 소녀 검사가 적의 치명타·칼날·공격을 검으로 막아 플레이어를 구하는 첫 개입을 본문에 명확히 쓴다.
- 소환이 발생한 응답의 마지막 비시스템 블록은 해당 서번트의 대사 ‘묻겠다. 그대가 나의 마스터인가.’여야 한다. 문구를 바꾸거나 그 뒤에 설명·플레이어 반응·추천 대사를 붙이지 않는다.`}
- 플레이어가 새 행동·대사·감정·의식을 수행했다고 만들지 않는다. 우발 사건의 원인은 세계와 NPC 쪽에 둔다.
- 진명·숨은 정체·향후 배신·GM 단계명은 공개하지 않는다.
`;
