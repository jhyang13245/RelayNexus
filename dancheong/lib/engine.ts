import {
  characterVisualAssetId,
  clamp,
  createId,
  STORY_ROUTE_PROGRESS_VARIABLE_ID,
  selectCharacterReferenceAsset,
  selectScenarioMediaAsset,
  type CharacterVisualCue,
  type CharacterVisualProfile,
  type CharacterResearchCacheEntry,
  type NarrativeVariable,
  type RecommendedReply,
  type RuntimeChronology,
  type RuntimeState,
  type ScenarioPack,
  type StatusLedgerChange,
  type RelationshipMemory,
  type SessionCanonEntry,
  type SessionCanonUpdate,
  type StoryBlock,
} from "./scenario";
import {
  applyAutonomyActionPatches,
  applyRelationshipMemoryPatches,
  deriveRuntimeRelationsFromMemories,
  normalizeRuntimeAutonomyActors,
  sanitizeRelationshipMemoryPatches,
  selectAutonomyCandidates,
  type AutonomyActionPatch,
  type RelationshipMemoryPatch,
} from "./autonomy";
import {
  applyStatusLedgerChanges,
  sanitizeStatusLedgerChanges,
} from "./status-window";
import { NEXUS_COMPOUND_BEAT_PREFIX } from "./nexus-guard";
import {
  CLAUDE_RUNTIME_VARIABLE_ID,
  type ClaudeTurnSignals,
} from "./claude-runtime";
import { mergeSessionCanonLedger } from "./session-canon";

export type RelationChange = {
  characterId: string;
  trustDelta: number;
  favorDelta: number;
  respectDelta: number;
  suspicionDelta: number;
  hostilityDelta: number;
  reason: string;
};

export type ClockChange = {
  clockId: string;
  delta: number;
  reason: string;
};

export type EncounteredCharacterAddition = {
  characterId: string;
  name: string;
  relationType: string;
};

export type StatePatch = {
  time: string;
  /**
   * Explicit calendar rollover inferred from the public prose. Most turns omit
   * this; midnight rollover is still detected from the clock automatically.
   */
  dayDelta?: number;
  location: string;
  weather?: string;
  sceneSummary: string;
  statusAdd: string[];
  statusRemove: string[];
  inventoryAdd: string[];
  inventoryRemove: string[];
  relationChanges: RelationChange[];
  clockChanges: ClockChange[];
  memoryAdd: string[];
  variablesAdd: Array<
    Pick<NarrativeVariable, "id" | "label" | "detail" | "visibility" | "reason">
  >;
  variablesResolve: string[];
  characterVisualsAdd: CharacterVisualProfile[];
  encounteredCharactersAdd: EncounteredCharacterAddition[];
  statusLedgerChanges: StatusLedgerChange[];
  autonomyActions: AutonomyActionPatch[];
  relationshipMemoriesAdd: RelationshipMemory[];
  relationshipMemoryResolveIds: string[];
  /** Model-authored candidates; the route validates these against public prose. */
  sessionCanonUpdates?: SessionCanonUpdate[];
  /** Server-authoritative entries accepted from sessionCanonUpdates. */
  sessionCanonAdd?: SessionCanonEntry[];
  /** Server-authored web research cache entries; never model-authored. */
  characterResearchCacheUpsert?: CharacterResearchCacheEntry[];
};

export type EngineCallStage =
  | "character_research"
  | "scene_plan"
  | "live_writer"
  | "live_sidecar"
  | "draft"
  | "format_repair"
  | "audit_rewrite"
  | "semantic_rewrite"
  | "continuity_rewrite"
  | "recommendation_repair"
  | "narrative_rescue"
  | "scene_regeneration";

export type EngineReasoningEffort = "none" | "low" | "medium" | "high";

export type EngineAuditSeverity = "hard_error" | "quality_advisory";

export type EngineRepairScope =
  | "none"
  | "word"
  | "sentence"
  | "paragraph"
  | "scene"
  | "sidecar";

export type EngineAuditReason = {
  reason: string;
  severity: EngineAuditSeverity;
};

export type DialogueAnnotation = {
  /** Exact NPC dialogue text as it appears in narration, without quote marks. */
  quote: string;
  speakerId: string;
  speakerName: string;
  emotion: string;
};

export type EngineCallUsage = {
  call: number;
  stage: EngineCallStage;
  /** Reasoning budget used by this individual model call. */
  reasoningEffort?: EngineReasoningEffort;
  rewriteReasons: string[];
  rewriteReasonDetails?: EngineAuditReason[];
  /** Wall-clock time spent waiting for this successful model response. */
  durationMs?: number;
  /** Smallest narrative surface the request was allowed to change. */
  repairScope?: EngineRepairScope;
  /** Whether this was the last rewrite candidate considered for the saved turn. */
  finalRewriteCandidate?: boolean;
  inputTokens: number;
  uncachedInputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  webSearchCallCount?: number;
  toolCallCostUsd?: number;
  estimatedCostUsd: number;
};

export type EngineLocalRepairUsage = {
  ruleId: string;
  repairScope: EngineRepairScope;
  reasons: string[];
  durationMs: number;
  success: boolean;
};

export type EngineContextProfile = {
  compilerVersion: "scene-context-v1";
  path: "fast" | "deep";
  pathReasons: string[];
  compileDurationMs: number;
  staticPromptChars: number;
  dynamicPromptChars: number;
  estimatedPromptTokens: number;
  activeEventId: string;
  currentBeat: number;
  totalBeats: number;
  inputClauseCount: number;
  executableClauseCount: number;
  includedCharacterIds: string[];
  includedMemoryTurns: number[];
  includedRecentTurns: number[];
  excludedCharacterCount: number;
  excludedEventCount: number;
  excludedMemoryCount: number;
  protectedTermCount: number;
  fallbackUsed: boolean;
};

export type LiveStreamPath = "live" | "validated_replay";
export type LiveDiscardReason =
  | "json"
  | "protected_term"
  | "semantic_correction"
  | "final_closure"
  | "transport"
  | "validation"
  | "unknown";

export type LiveReliabilitySnapshot = {
  attemptId: string;
  beatPhase: "first_draft" | "closure_build_up" | "final_closure";
  beat: number;
  totalBeats: number;
  firstDraftDirect: boolean;
  streamPath: LiveStreamPath;
  discarded: boolean;
  discardReason: LiveDiscardReason | null;
  rewindCount: number;
  correctionPasses: number;
  correctionReasons: string[];
  semanticAuditCount: number;
  /** First upstream model text delta from request start. */
  ttftMs: number | null;
  /** Historical field name; now records the first visible grapheme. */
  firstSentenceMs: number | null;
  /** Local request normalization and public-context compilation. */
  preparationMs?: number;
  /** Time from opening the writer request until response headers arrive. */
  upstreamHandshakeMs?: number;
  /** Time from opening the writer request until its first text delta. */
  modelFirstDeltaMs?: number | null;
  /** First user-visible grapheme from the original turn request. */
  firstVisibleGraphemeMs?: number | null;
  /** Structured-output prefix time between the first model delta and first visible text. */
  structureBufferMs?: number | null;
  writerPromptChars?: number;
  writerSchemaChars?: number;
  writerStaticPromptChars?: number;
  writerContextChars?: number;
  writerPlanChars?: number;
  writerProtocol?: string;
  sidecarSplit?: boolean;
  totalStreamMs: number;
};

export type EngineUsage = {
  model: string;
  outputTokenLimit?: number;
  /** Primary draft reasoning budget. Repair calls record their own effort. */
  reasoningEffort?: EngineReasoningEffort;
  /** Every upstream HTTP attempt, including an unbilled compatibility retry. */
  callCount: number;
  /** Successful model responses carrying token usage. */
  billedCallCount: number;
  rewriteCount: number;
  rewriteReasons: string[];
  /** Blocking contract violations that justified a new model call or recovery. */
  hardErrorReasons?: string[];
  /** Non-blocking craft observations retained for measurement, not rewriting. */
  qualityAdvisories?: string[];
  inputTokens: number;
  uncachedInputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  /** Character-reference research only; included in estimatedCostUsd. */
  researchCallCount?: number;
  webSearchCallCount?: number;
  researchCostUsd?: number;
  estimatedCostUsd: number;
  /** Model wait time plus deterministic local-repair time for this turn. */
  totalDurationMs?: number;
  /** Repairs completed without another paid model request. */
  localRepairs?: EngineLocalRepairUsage[];
  /** Per-turn scene compiler trace. Contains counts and ids, never secret text. */
  contextProfile?: EngineContextProfile;
  /** Live publication trace; contains policy/counters, never prose or secrets. */
  liveReliability?: LiveReliabilitySnapshot;
  calls: EngineCallUsage[];
};

export type NarrativeAudit = {
  inputHandled: boolean;
  inputOutcome: "resolved" | "blocked" | "in_progress" | "not_applicable";
  inputEvidence: string;
  meaningfulBeat: boolean;
  meaningfulBeatEvidence: string;
  routeEventStatus: "not_started" | "in_progress" | "completed";
  routeEventEvidence: string;
  chronologyConsistent: boolean;
  chronologyNote: string;
  recommendationsGrounded: boolean;
  recommendationBasis: string[];
  currentScene: string;
  currentLocation: string;
  currentTime?: string;
  activeCharacters: string[];
  activeThreats: string[];
};

export type EngineTurnResponse = {
  mode: "mock" | "luna";
  /** v31 canonical prose source. Blocks are a deterministic UI projection. */
  narration?: string;
  dialogueAnnotations?: DialogueAnnotation[];
  blocks: StoryBlock[];
  statePatch: StatePatch;
  /** Server-finalized single clock used by every turn consumer. */
  chronology?: RuntimeChronology;
  /** Public prose requested a past clock that cannot belong to this scene. */
  chronologyConflict?: string;
  recommendations: RecommendedReply[];
  image: {
    recommended: boolean;
    reason: string;
    prompt: string;
    characterIds: string[];
  };
  characterVisuals: CharacterVisualCue[];
  agencyAudit: {
    playerActionInvented: boolean;
    note: string;
  };
  /**
   * Luna가 최근 전문과 이번 응답을 다시 읽고 작성하는 의미 기반 판정.
   * 오래된 모의 응답과 저장본은 이 필드가 없을 수 있어 선택값으로 둔다.
   */
  narrativeAudit?: NarrativeAudit;
  /**
   * Exact signal adapter for the user-provided Claude HTML runtime. Luna must
   * emit it; the server, never the model, adjudicates beats and event seals.
   * Optional only for legacy saves and the built-in offline mock.
   */
  claudeSignals?: ClaudeTurnSignals;
  usage?: EngineUsage;
  warning?: string;
};

export type SimulateRequest = {
  pack: ScenarioPack;
  state: RuntimeState;
  userText: string;
  advanceMode?: "player" | "canonical";
  generationMode?: "instant" | "planned_recovery";
  recoveryContext?: {
    failedNarration: string;
    failureReasons: string[];
  };
  provider?: {
    textModel: string;
    imageModel: string;
    baseUrl: string;
    outputContract: string;
  };
  recentTurns: Array<{
    turn: number;
    userText?: string;
    blocks: StoryBlock[];
    location?: string;
    time?: string;
  }>;
  longTermMemories?: Array<{
    turn: number;
    day: number;
    date: string;
    time: string;
    location: string;
    title: string;
    summary: string;
  }>;
};

const addMinutes = (time: string, minutes: number): string => {
  const [hoursValue, minutesValue] = time.split(":").map(Number);
  if (!Number.isFinite(hoursValue) || !Number.isFinite(minutesValue)) {
    return time;
  }
  const total = (hoursValue * 60 + minutesValue + minutes + 24 * 60) %
    (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
};

const cleanList = (items: string[], max = 8): string[] =>
  [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, max);

const clockMinutes = (value: string): number | undefined => {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/u);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
};

const weekdayForDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "요일 미상";
  return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][
    parsed.getUTCDay()
  ];
};

const advanceIsoDate = (date: string, days: number): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

/**
 * Luna only returns a clock value. The calendar is therefore advanced by the
 * runtime, and ordinary backwards clock mistakes are clamped instead of
 * silently turning into a nearly 24-hour jump.
 */
export const resolveRuntimeChronology = (
  state: RuntimeChronology,
  requestedTime: string,
  requestedDayDelta?: number,
): RuntimeChronology => {
  const current = clockMinutes(state.time);
  const requested = clockMinutes(requestedTime);
  const explicitDayDelta = Number.isFinite(requestedDayDelta)
    ? Math.max(0, Math.min(31, Math.trunc(requestedDayDelta ?? 0)))
    : undefined;
  if (explicitDayDelta && explicitDayDelta > 0) {
    const date = advanceIsoDate(state.date, explicitDayDelta);
    const finalMinutes = requested ?? current;
    return {
      day: state.day + explicitDayDelta,
      date,
      weekday: date === state.date ? state.weekday : weekdayForDate(date),
      time: finalMinutes === undefined
        ? state.time
        : `${String(Math.floor(finalMinutes / 60)).padStart(2, "0")}:${String(finalMinutes % 60).padStart(2, "0")}`,
    };
  }
  if (current === undefined || requested === undefined) {
    return { day: state.day, date: state.date, weekday: state.weekday, time: state.time };
  }
  if (requested >= current) {
    return {
      day: state.day,
      date: state.date,
      weekday: state.weekday,
      time: `${String(Math.floor(requested / 60)).padStart(2, "0")}:${String(requested % 60).padStart(2, "0")}`,
    };
  }

  const crossesMidnight = current >= 18 * 60 && requested <= 6 * 60;
  if (!crossesMidnight) {
    return { day: state.day, date: state.date, weekday: state.weekday, time: state.time };
  }
  const date = advanceIsoDate(state.date, 1);
  return {
    day: state.day + 1,
    date,
    weekday: date === state.date ? state.weekday : weekdayForDate(date),
    time: `${String(Math.floor(requested / 60)).padStart(2, "0")}:${String(requested % 60).padStart(2, "0")}`,
  };
};

export type NarrativeChronologySignal = {
  time?: string;
  dayDelta?: number;
  source: "explicit_time" | "elapsed_time" | "day_period" | "day_transition" | "none";
};

const dayPeriodClock = (period: string): string | undefined => ({
  새벽: "05:00",
  아침: "08:00",
  오전: "09:00",
  정오: "12:00",
  낮: "12:00",
  오후: "15:00",
  저녁: "19:00",
  밤: "22:00",
} as Record<string, string>)[period];

const narrativeDayPeriodTime = (text: string): string | undefined => {
  const matches = [...text.matchAll(
    /(?:^|[.!?。！？\n]\s*|\d{1,2}일\s*)(새벽|아침|오전|정오|낮|오후|저녁|밤)(?=\s|[,.!?。！？]|$)/gu,
  )];
  const period = matches.at(-1)?.[1];
  return dayPeriodClock(period ?? "");
};

/**
 * Reads only strong, present-scene day-period transitions. This deliberately
 * excludes loose mentions such as an evening appointment or a night plan.
 */
const currentNarrativeDayPeriodTime = (text: string): string | undefined => {
  const candidates: Array<{ index: number; period: string }> = [];
  for (const match of text.matchAll(
    /(?:시계(?:가|는)?|현재\s*시각(?:이|은)?|시간(?:이|은)?).{0,24}(새벽|아침|오전|정오|낮|오후|저녁|밤)(?:\s*무렵)?(?:을|를|이|가)?\s*(?:가리키|되|접어들|넘|향해)/gu,
  )) {
    candidates.push({ index: match.index ?? 0, period: match[1] });
  }
  for (const match of text.matchAll(
    /(?:창밖|창가\s*너머|바깥|캠퍼스|거리|보도|하늘).{0,36}(?:어두워졌|어두워진|어둠이\s*내렸|해가\s*(?:졌|기울))/gu,
  )) {
    candidates.push({ index: match.index ?? 0, period: "저녁" });
  }
  for (const match of text.matchAll(
    /(?:저녁|밤)(?:이|가|의)?\s*(?:가까워(?:지|질)|다가오|접어들|시작되|흐름(?:으로)?\s*넘어(?:가|갔))/gu,
  )) {
    candidates.push({ index: match.index ?? 0, period: match[0].includes("밤") ? "밤" : "저녁" });
  }
  const period = candidates.sort((left, right) => left.index - right.index).at(-1)?.period;
  return dayPeriodClock(period ?? "");
};

const koreanNumber = (value: string): number | undefined => {
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  return ({ 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 } as Record<string, number>)[value];
};

const normalizeNarrativeHour = (period: string, rawHour: number): number => {
  const hour = Math.max(0, Math.min(23, rawHour));
  if (period === "오전") return hour === 12 ? 0 : hour;
  if (period === "오후") return hour === 12 ? 12 : hour + 12;
  if (period === "밤") {
    if (hour === 12) return 0;
    return hour >= 6 && hour <= 11 ? hour + 12 : hour;
  }
  if (period === "새벽") return hour === 12 ? 0 : Math.min(hour, 11);
  return hour;
};

const narrativeDayDeltaFromDate = (currentDate: string, text: string) => {
  const current = new Date(`${currentDate}T00:00:00Z`);
  if (Number.isNaN(current.getTime())) return undefined;
  const matches = [...text.matchAll(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/gu)];
  for (const match of matches.reverse()) {
    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - 20), index + match[0].length + 20);
    if (/(?:기록|문서|메모|신문|작성일|발송일|생년월일|과거)/u.test(context)) continue;
    const year = Number(match[1] || current.getUTCFullYear());
    const target = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[3])));
    if (Number.isNaN(target.getTime())) continue;
    const delta = Math.round((target.getTime() - current.getTime()) / 86_400_000);
    if (delta >= 0 && delta <= 31) return delta;
  }
  return undefined;
};

/**
 * Reads only public narration and extracts chronology when the prose itself
 * clearly places the current scene at a clock time or after an elapsed span.
 * Appointment, delivery, alarm, and document timestamps are deliberately
 * ignored so a quoted schedule cannot move the live HUD.
 */
export const inferNarrativeChronology = (
  state: Pick<RuntimeState, "date" | "time">,
  blocks: Array<Pick<StoryBlock, "type" | "text">>,
): NarrativeChronologySignal => {
  const text = blocks
    .filter((block) => block.type === "narration")
    .map((block) => block.text.normalize("NFKC"))
    .join("\n");
  if (!text.trim()) return { source: "none" };

  const explicitDateDelta = narrativeDayDeltaFromDate(state.date, text);
  const relativeDayDelta = /(?:다음\s*날|다음날|이튿날|날이\s*밝(?:자|고|았다)|아침이\s*밝(?:자|고|았다)|하룻밤(?:이|을)?\s*(?:지나|보내)|밤을\s*넘겨)/u.test(text)
    ? 1
    : undefined;
  const dayDelta = explicitDateDelta ?? relativeDayDelta;

  const candidates: Array<{ index: number; time: string }> = [];
  const addCandidate = (
    match: RegExpMatchArray,
    hour: number,
    minute: number,
  ) => {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return;
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 36), index);
    const after = text.slice(index + match[0].length, index + match[0].length + 28);
    const sentencePrefix = before.slice(
      Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("\n")) + 1,
    ).trim();
    const atSentenceStart = sentencePrefix.length === 0;
    const directlyAnchored = /(?:현재|지금|시각(?:은|이)?|시간(?:은|이)?|시계(?:는|가)?|다음\s*날|다음날|이튿날)\s*$/u.test(before) ||
      /^(?:\s|,)*(?:무렵|정각|쯤|경(?:이었다|이다)?|를?\s*넘|가?\s*되)/u.test(after);
    const scheduled = /(?:예정|예약|마감|도착\s*예정|수령\s*가능|발송\s*시각|기록\s*시각|알람|시간표|배차표)/u.test(
      `${before.slice(-18)} ${after.slice(0, 18)}`,
    );
    if ((!atSentenceStart && !directlyAnchored) || scheduled) return;
    candidates.push({
      index,
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    });
  };

  for (const match of text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/gu)) {
    addCandidate(match, Number(match[1]), Number(match[2]));
  }
  for (const match of text.matchAll(/(오전|오후|새벽|밤)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/gu)) {
    addCandidate(
      match,
      normalizeNarrativeHour(match[1] ?? "", Number(match[2])),
      Number(match[3] ?? 0),
    );
  }
  candidates.sort((left, right) => left.index - right.index);
  const explicitTime = candidates.at(-1)?.time;
  if (explicitTime) {
    return { time: explicitTime, dayDelta, source: "explicit_time" };
  }

  // A date/day transition followed only by a day period is still an explicit
  // scene-time anchor. Keeping the previous night's clock would produce an
  // impossible HUD such as "next morning · 22:18".
  const dayPeriodTime = dayDelta !== undefined
    ? narrativeDayPeriodTime(text)
    : undefined;
  if (dayPeriodTime) {
    return { time: dayPeriodTime, dayDelta, source: "day_transition" };
  }

  const currentDayPeriodTime = currentNarrativeDayPeriodTime(text);
  const currentMinutes = clockMinutes(state.time);
  const dayPeriodMinutes = currentDayPeriodTime
    ? clockMinutes(currentDayPeriodTime)
    : undefined;
  if (
    currentDayPeriodTime &&
    currentMinutes !== undefined &&
    dayPeriodMinutes !== undefined &&
    dayPeriodMinutes > currentMinutes
  ) {
    return { time: currentDayPeriodTime, source: "day_period" };
  }

  const elapsedMatches = [...text.matchAll(
    /(\d+|한|두|세|네|다섯|여섯)\s*시간(?:\s*(\d{1,2})\s*분)?\s*(?:후|뒤|지나|흘렀|흐른)/gu,
  )];
  const elapsed = elapsedMatches.at(-1);
  if (elapsed) {
    const context = text.slice(
      Math.max(0, (elapsed.index ?? 0) - 18),
      (elapsed.index ?? 0) + elapsed[0].length + 22,
    );
    if (!/(?:예정|예약|걸릴|소요|도착\s*예정)/u.test(context)) {
      const hours = koreanNumber(elapsed[1]) ?? 0;
      const minutes = Number(elapsed[2] ?? 0);
      const current = clockMinutes(state.time);
      if (current !== undefined) {
        const total = current + hours * 60 + minutes;
        return {
          time: `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
          dayDelta: dayDelta ?? Math.floor(total / 1440),
          source: "elapsed_time",
        };
      }
    }
  }

  return dayDelta === undefined
    ? { source: "none" }
    : { dayDelta, source: "day_transition" };
};

export const synchronizeGeneratedTurnChronology = <T extends {
  blocks: Array<Pick<StoryBlock, "type" | "text">>;
  statePatch: StatePatch;
  narrativeAudit?: NarrativeAudit;
  claudeSignals?: ClaudeTurnSignals;
}>(
  state: RuntimeChronology,
  turn: T,
): T & { chronology: RuntimeChronology; chronologyConflict?: string } => {
  const signal = inferNarrativeChronology(state, turn.blocks);
  const requestedTime = signal.time ?? turn.statePatch.time;
  const requestedDayDelta = signal.dayDelta !== undefined
    ? signal.dayDelta
    : turn.statePatch.dayDelta;
  const chronology = resolveRuntimeChronology(
    state,
    requestedTime,
    requestedDayDelta,
  );
  const dayDelta = Math.max(0, chronology.day - state.day);
  const chronologyConflict = signal.time && signal.time !== chronology.time
    ? `본문의 명시 시각 ${signal.time}은 현재 원장 ${state.date} ${state.time} 이후의 유효한 순방향 시각이 아니다.`
    : undefined;
  return {
    ...turn,
    chronology,
    chronologyConflict,
    statePatch: {
      ...turn.statePatch,
      time: chronology.time,
      dayDelta,
    },
    narrativeAudit: turn.narrativeAudit
      ? {
          ...turn.narrativeAudit,
          chronologyConsistent: chronologyConflict
            ? false
            : turn.narrativeAudit.chronologyConsistent,
          chronologyNote: chronologyConflict ?? turn.narrativeAudit.chronologyNote,
          currentTime: chronology.time,
        }
      : turn.narrativeAudit,
    claudeSignals: turn.claudeSignals
      ? {
          ...turn.claudeSignals,
          sceneTime: chronology.time,
          location: turn.statePatch.location,
        }
      : turn.claudeSignals,
  };
};

const withSubjectParticle = (name: string): string => {
  const last = name.codePointAt(name.length - 1) ?? 0;
  const hasFinalConsonant = last >= 0xac00 && last <= 0xd7a3
    ? (last - 0xac00) % 28 !== 0
    : false;
  return `${name}${hasFinalConsonant ? "이" : "가"}`;
};

export function applyStatePatch(
  state: RuntimeState,
  patch: StatePatch,
  pack?: ScenarioPack,
  finalizedChronology?: RuntimeChronology,
): RuntimeState {
  const calculatedChronology = resolveRuntimeChronology(
    state,
    patch.time || state.time,
    patch.dayDelta,
  );
  const chronology = finalizedChronology &&
      finalizedChronology.day === calculatedChronology.day &&
      finalizedChronology.date === calculatedChronology.date &&
      finalizedChronology.weekday === calculatedChronology.weekday &&
      finalizedChronology.time === calculatedChronology.time
    ? finalizedChronology
    : calculatedChronology;
  const status = state.status
    .filter((item) => !patch.statusRemove.includes(item))
    .concat(patch.statusAdd);
  const inventory = state.inventory
    .filter((item) => !(patch.inventoryRemove ?? []).includes(item))
    .concat(patch.inventoryAdd ?? []);

  const relationPool = [...state.relations];
  (patch.encounteredCharactersAdd ?? []).forEach((character) => {
    if (
      !character.characterId ||
      relationPool.some(
        (relation) => relation.characterId === character.characterId,
      )
    ) {
      return;
    }
    relationPool.push({
      relationId: `RUNTIME_${character.characterId}_${pack?.player.id ?? "PLAYER"}`,
      sourceId: character.characterId,
      targetId: pack?.player.id ?? "PLAYER",
      characterId: character.characterId,
      name: character.name || "이름 없는 인물",
      relationType: character.relationType || "첫 만남",
      trust: 0,
      publicTrust: 0,
      favor: 0,
      fear: 0,
      respect: 0,
      suspicion: 0,
      hostility: 0,
      dependency: 0,
    });
  });

  const directlyChangedRelations = relationPool.map((relation) => {
    const changes = patch.relationChanges.filter(
      (change) => change.characterId === relation.characterId,
    );
    if (!changes.length) return relation;
    return changes.reduce(
      (current, change) => ({
        ...current,
        trust: clamp(current.trust + clamp(change.trustDelta, -3, 3), -100, 100),
        publicTrust: clamp(
          (current.publicTrust ?? current.trust) + clamp(change.trustDelta, -3, 3),
          -100,
          100,
        ),
        favor: clamp(current.favor + clamp(change.favorDelta, -3, 3), -100, 100),
        respect: clamp(
          current.respect + clamp(change.respectDelta, -3, 3),
          -100,
          100,
        ),
        suspicion: clamp(
          current.suspicion + clamp(change.suspicionDelta, -3, 3),
          -100,
          100,
        ),
        hostility: clamp(
          current.hostility + clamp(change.hostilityDelta, -3, 3),
          -100,
          100,
        ),
      }),
      relation,
    );
  });
  const memoryEnabled = Boolean(pack?.relationshipMemoryRuntime?.enabled);
  const sanitizedMemoryAdditions = pack && memoryEnabled
    ? sanitizeRelationshipMemoryPatches(
        pack,
        state,
        (patch.relationshipMemoriesAdd ?? []) as unknown as RelationshipMemoryPatch[],
      )
    : [];
  const memoryResult = pack
    ? applyRelationshipMemoryPatches(
        pack,
        state,
        sanitizedMemoryAdditions,
        patch.relationshipMemoryResolveIds,
      )
    : {
        memories: state.relationshipMemories ?? [],
        addedIds: [],
      };
  const relations = pack && memoryEnabled
    ? deriveRuntimeRelationsFromMemories(pack, relationPool, memoryResult.memories)
    : directlyChangedRelations;

  const clocks = state.clocks.map((clock) => {
    const delta = patch.clockChanges
      .filter((change) => change.clockId === clock.id)
      .reduce((sum, change) => sum + clamp(change.delta, -1, 1), 0);
    return {
      ...clock,
      current: clamp(clock.current + delta, 0, clock.maximum),
    };
  });

  const resolvedIds = new Set(patch.variablesResolve ?? []);
  const existingVariables = (state.variables ?? []).map((variable) =>
    resolvedIds.has(variable.id)
      ? { ...variable, status: "resolved" as const }
      : variable,
  );
  const additions = (patch.variablesAdd ?? []).map((variable, index) => ({
    id: variable.id || `variable-${state.turn + 1}-${index + 1}`,
    label: variable.label,
    detail: variable.detail,
    visibility: variable.visibility,
    reason: variable.reason,
    status: "active" as const,
    createdTurn: state.turn + 1,
  }));
  const mergedVariables = new Map(
    existingVariables.map((variable) => [variable.id, variable]),
  );
  additions.forEach((variable) => mergedVariables.set(variable.id, variable));
  const mergedVariableValues = [...mergedVariables.values()];
  const protectedVariables = mergedVariableValues.filter(
    (variable) =>
      variable.id === STORY_ROUTE_PROGRESS_VARIABLE_ID ||
      variable.id === CLAUDE_RUNTIME_VARIABLE_ID ||
      (variable.status === "active" &&
        variable.id.startsWith(NEXUS_COMPOUND_BEAT_PREFIX)),
  );
  const protectedVariableIds = new Set(
    protectedVariables.map((variable) => variable.id),
  );
  const retainedVariables = [
    ...mergedVariableValues
      .filter((variable) => !protectedVariableIds.has(variable.id))
      .slice(-Math.max(0, 16 - protectedVariables.length)),
    ...protectedVariables,
  ];
  const mergedCharacterVisuals = new Map(
    (state.characterVisuals ?? []).map((profile) => [
      profile.characterId,
      profile,
    ]),
  );
  (patch.characterVisualsAdd ?? []).forEach((profile) => {
    if (!mergedCharacterVisuals.has(profile.characterId)) {
      mergedCharacterVisuals.set(profile.characterId, profile);
    }
  });
  const encounteredCharacterIds = [
    ...new Set([
      ...(state.encounteredCharacterIds ?? []),
      ...(patch.encounteredCharactersAdd ?? []).map(
        (character) => character.characterId,
      ),
    ]),
  ].filter(Boolean).slice(-64);
  const statusLedgerResult = pack
    ? applyStatusLedgerChanges(pack, state, patch.statusLedgerChanges)
    : {
        ledger: state.statusLedger ?? [],
        changes: patch.statusLedgerChanges ?? [],
      };
  const autonomyResult = pack && pack.autonomyRuntime?.enabled
    ? applyAutonomyActionPatches(
        pack,
        state,
        patch.autonomyActions,
        chronology,
      )
    : {
        actors: pack
          ? normalizeRuntimeAutonomyActors(pack, state.autonomyActors)
          : state.autonomyActors ?? [],
        log: state.autonomyLog ?? [],
        facts: state.worldFacts ?? [],
        traces: state.observableTraces ?? [],
      };
  const researchByName = new Map(
    (state.characterResearchCache ?? []).map((entry) => [entry.characterName, entry] as const),
  );
  (patch.characterResearchCacheUpsert ?? []).forEach((entry) => {
    if (entry.characterName && entry.summary) researchByName.set(entry.characterName, entry);
  });

  return {
    ...state,
    turn: state.turn + 1,
    day: chronology.day,
    date: chronology.date,
    weekday: chronology.weekday,
    time: chronology.time,
    weather: patch.weather?.trim().slice(0, 40) || state.weather,
    location: patch.location || state.location,
    status: cleanList(status, 12),
    inventory: cleanList(inventory, 24),
    relations,
    encounteredCharacterIds,
    clocks,
    sceneSummary: patch.sceneSummary || state.sceneSummary,
    memories: cleanList([...state.memories, ...patch.memoryAdd], 24),
    sessionCanonLedger: mergeSessionCanonLedger(
      state.sessionCanonLedger ?? [],
      patch.sessionCanonAdd ?? [],
    ),
    variables: retainedVariables,
    characterVisuals: [...mergedCharacterVisuals.values()].slice(-32),
    statusLedger: statusLedgerResult.ledger,
    lastStatusChanges: statusLedgerResult.changes,
    autonomyActors: autonomyResult.actors,
    autonomyLog: autonomyResult.log,
    worldFacts: autonomyResult.facts,
    relationshipMemories: memoryEnabled
      ? memoryResult.memories
      : state.relationshipMemories ?? [],
    lastRelationshipMemoryIds: memoryResult.addedIds,
    observableTraces: autonomyResult.traces,
    characterResearchCache: [...researchByName.values()].slice(-64),
  };
}

export function createMockTurn(request: SimulateRequest): EngineTurnResponse {
  const { pack, state, userText } = request;
  const guide = pack.npcs.find((npc) =>
    pack.opening.openingLine.includes(npc.name),
  ) ?? pack.npcs.find((npc) =>
    pack.opening.openingCharacters.includes(npc.name),
  ) ?? pack.npcs[0];
  const asksDual = /둘|두\s*(?:개|가지|파형|공명)|동시|공명|양쪽/.test(userText);
  const asksCost = /비용|대가|부작용|위험|한계|약점/.test(userText);
  const proposesElement = /원소|불|물|바람|번개|얼음|중력/.test(userText);
  const nextTurn = state.turn + 1;
  const mentionedNpc = pack.npcs.find((npc) => userText.includes(npc.name));
  const arrivalMentioned =
    /다가(?:오|온|왔)|나타나|등장|합류|찾아(?:오|온|왔)|끼어들/.test(
      userText,
    );
  const activeNpc = arrivalMentioned && mentionedNpc ? mentionedNpc : guide;
  const isNewEncounter = Boolean(
    activeNpc &&
      !(state.encounteredCharacterIds ?? []).includes(activeNpc.id),
  );

  let dialogue =
    "좋습니다. 정답을 서두르지 않겠습니다. 먼저 어떤 원리를 원하는지부터 분명히 해 보죠.";
  let narration =
    "한세린의 손끝이 분석 화면을 스쳤다. 겹쳐 있던 두 파형이 벌어지며, 각 선택이 만들어 낼 궤적이 반투명한 선으로 떠올랐다.";
  let memory = "능력설계는 명칭보다 작동 원리와 비용을 먼저 정해야 한다.";
  let clockDelta = 0;

  if (asksDual) {
    dialogue =
      "가능성이 없다고 단정할 수는 없습니다. 다만 두 계통을 한꺼번에 완성하려 하면 서로의 리듬이 무너질 수 있어요. 하나를 주축으로 삼고, 다른 하나를 보조 공명으로 검증하는 편이 안전합니다.";
    narration =
      "질문이 끝나자 화면 한쪽의 경고 표시가 주황색으로 바뀌었다. 한세린은 놀라기보다 오래 기다리던 수치를 확인한 사람처럼 두 파형의 간격을 세밀하게 조절했다.";
    memory = "두 공명핵은 주축과 보조 공명으로 단계적으로 검증할 수 있다.";
    clockDelta = 1;
  } else if (asksCost) {
    dialogue =
      "벡터 편향은 정밀할수록 집중력을, 공진 증폭은 출력만큼 신체 부담을, 감각 가속은 사용 뒤 감각 둔화를 요구합니다. 강한 능력보다 감당할 수 있는 비용을 고르는 게 중요해요.";
    memory = "후보 능력마다 집중력·신체 부담·감각 둔화라는 다른 비용이 있다.";
  } else if (proposesElement) {
    dialogue =
      "원소 자체를 만드는 것보다, 이미 존재하는 물질이나 에너지의 움직임에 간섭하는 쪽이 현재 파형과 잘 맞습니다. 어떤 현상을 다루고 싶은지 구체화해 보세요.";
    narration =
      "화면의 세 가지 권장안 옆에 빈 설계 슬롯 하나가 새로 열렸다. 규격 밖 제안을 즉시 기각하지 않겠다는 뜻이었다.";
    memory = "권장안 밖의 능력도 작동 대상과 비용을 구체화하면 설계할 수 있다.";
  }

  if (arrivalMentioned && mentionedNpc) {
    const suppliedNpcLine = userText
      .split(/\n+/)
      .slice(1)
      .join(" ")
      .replace(/^[“\"']|[”\"']$/g, "")
      .trim()
      .slice(0, 260);
    narration = `${mentionedNpc.name}의 등장이 진행 중이던 장면의 흐름을 바꾸었다. ${mentionedNpc.appearance || "익숙한 모습"}이 시야에 들어오자, 주변 인물들의 주의도 자연스럽게 새로 합류한 인물에게 향했다. 갑작스러운 방문은 우연처럼 보였지만, 현재 장소와 시간을 정확히 찾아왔다는 사실만으로도 다음 대화에 작은 의문을 남겼다.`;
    dialogue = suppliedNpcLine ||
      `여기 있었구나! 마침 잘 됐어. 지금 무슨 이야기를 하고 있었는지 나도 들어도 될까?`;
    memory = `${withSubjectParticle(mentionedNpc.name)} 현재 장면에 합류했고, 찾아온 목적은 아직 확인되지 않았다.`;
    clockDelta = 0;
  }

  const imageDue = state.imageEvery > 0 && nextTurn % state.imageEvery === 0;
  const guideEmotion = arrivalMentioned
    ? /오+|안녕|웃|미소|반가/.test(userText)
      ? "bright"
      : "attentive"
    : asksDual
      ? "attentive"
      : "calm";
  const packageMedia = selectScenarioMediaAsset(
    pack,
    activeNpc?.id,
    guideEmotion,
  );
  const characterReference = activeNpc
    ? selectCharacterReferenceAsset(pack, activeNpc.id)
    : undefined;
  const isFirstMajorAppearance = Boolean(
    arrivalMentioned &&
      mentionedNpc &&
      !(state.characterVisuals ?? []).some(
        (profile) => profile.characterId === mentionedNpc.id,
      ),
  );
  const visualSource = packageMedia || characterReference
    ? "package" as const
    : "pending" as const;
  const canonicalAssetId = activeNpc
    ? characterReference?.id ??
      packageMedia?.id ??
      characterVisualAssetId(activeNpc.id)
    : "";
  const characterVisuals: CharacterVisualCue[] =
    isFirstMajorAppearance && mentionedNpc
      ? [
          {
            blockIndex: 1,
            characterId: mentionedNpc.id,
            characterName: mentionedNpc.name,
            importance: "major",
            isFirstMajorAppearance: true,
            appearancePrompt:
              mentionedNpc.appearance ||
              `${mentionedNpc.role || "주요 인물"}, ${mentionedNpc.personality}`,
            reason: "장면의 흐름과 후속 관계에 영향을 주는 주요 인물의 첫 등장",
            canonicalAssetId,
            source: visualSource,
          },
        ]
      : [];
  const variablesAdd = arrivalMentioned
    ? [
        {
          id: `arrival-${mentionedNpc?.id ?? "new-npc"}-${nextTurn}`,
          label: `${mentionedNpc?.name ?? "새 인물"}의 장면 합류`,
          detail:
            "새로 합류한 인물의 목적과 주변 인물의 반응이 다음 장면에 영향을 준다.",
          visibility: "public" as const,
          reason: "사용자 입력에서 인물의 등장 또는 합류가 명시되었다.",
        },
      ]
    : [];
  const mockStatusField = pack.statusWindow?.fields.find(
    (field) =>
      !field.source &&
      field.kind === "number" &&
      /mana|energy|focus|stamina|ki|마나|기력|집중|체력|기\b/i.test(
        `${field.id} ${field.label}`,
      ),
  );
  const statusLedgerChanges = sanitizeStatusLedgerChanges(
    pack,
    asksDual && mockStatusField
      ? [
          {
            fieldId: mockStatusField.id,
            operation: "increment",
            numericDelta: -3,
            value: "",
            items: [],
            grade: "",
            reveal: false,
            reason: "두 공명핵을 동시에 검토하며 일시적으로 자원을 소모했다.",
          },
        ]
      : [],
  );
  const autonomyCandidates = selectAutonomyCandidates(pack, state, userText);
  const autonomyActions: AutonomyActionPatch[] = autonomyCandidates.slice(0, 1)
    .map((candidate) => ({
      actorId: candidate.actorId,
      intent: candidate.runtime.nextAction || candidate.definition.nextAction ||
        candidate.definition.shortTermGoal,
      outcome: candidate.requiredOutcome,
      locationAfter: candidate.runtime.currentLocation,
      resourcesAfter: candidate.runtime.resources,
      currentPlanAfter: candidate.runtime.currentPlan,
      nextActionAfter: candidate.runtime.nextAction,
      evidenceUsed: [],
      resourcesSpent: [],
      worldMutations: candidate.isOnScreen
        ? ["현재 장면의 분석·판단이 다음 계획에 반영되었다."]
        : ["화면 밖 계획이 한 단계 진행되었다."],
      knowledgeAdd: [],
      misinformationRemove: [],
      trace: candidate.isOnScreen
        ? "주변 장비와 인물의 움직임에서 계획이 진행되고 있다는 작은 변화가 관측됐다."
        : "",
      traceVisibility: candidate.isOnScreen ? "observable" : "hidden",
      reason: `행동 주기와 목표 우선도에 따라 ${candidate.requiredOutcome} 판정을 적용했다.`,
      travelJustification: "",
    }));
  const activeRelation = activeNpc
    ? state.relations.find((relation) => relation.characterId === activeNpc.id)
    : undefined;
  const relationshipMemoriesAdd = pack.relationshipMemoryRuntime?.enabled &&
      activeRelation && !arrivalMentioned
    ? sanitizeRelationshipMemoryPatches(pack, state, [
        {
          id: `MEM_T${nextTurn}_${activeRelation.relationId}`,
          relationId: activeRelation.relationId,
          sourceId: activeRelation.sourceId,
          targetId: activeRelation.targetId,
          eventId: "",
          type: "custom",
          title: asksCost || asksDual ? "위험을 먼저 확인한 대화" : "선택을 서두르지 않은 대화",
          summary: asksCost || asksDual
            ? "능력의 가능성뿐 아니라 비용과 위험을 구체적으로 확인했다."
            : "상대의 설명을 듣고 다음 선택을 위한 정보를 확인했다.",
          cause: "능력설계실에서 실제로 나눈 대화",
          visibility: "Public",
          importance: asksCost || asksDual ? 58 : 35,
          permanence: "decaying",
          effects: {
            trust: 1,
            favor: 0,
            fear: 0,
            respect: asksCost || asksDual ? 1 : 0,
            suspicion: asksDual ? 1 : 0,
            hostility: 0,
            dependency: 0,
          },
          unresolved: false,
          resolutionConditions: "",
          tags: "대화, 능력설계",
        },
      ])
    : [];
  return {
    mode: "mock",
    blocks: [
      {
        id: createId(),
        type: "narration",
        text: narration,
      },
      {
        id: createId(),
        type: "dialogue",
        speakerId: activeNpc?.id,
        speakerName: activeNpc?.name ?? "한세린",
        emotion: guideEmotion,
        text: dialogue,
        mediaAssetId: packageMedia?.id,
      },
    ],
    statePatch: {
      time: addMinutes(state.time, 3),
      location: state.location,
      sceneSummary:
        arrivalMentioned && mentionedNpc
          ? `${state.location}에서 ${withSubjectParticle(mentionedNpc.name)} 합류해 대화의 흐름이 바뀌었다.`
          : "능력설계실에서 첫 능력의 원리와 위험을 검토하고 있다.",
      statusAdd: clockDelta ? ["이중 공명 검증 중"] : [],
      statusRemove: [],
      inventoryAdd: [],
      inventoryRemove: [],
      relationChanges: !pack.relationshipMemoryRuntime?.enabled && activeNpc && !arrivalMentioned
        ? [
            {
              characterId: activeNpc.id,
              trustDelta: 1,
              favorDelta: 0,
              respectDelta: asksCost || asksDual ? 1 : 0,
              suspicionDelta: asksDual ? 1 : 0,
              hostilityDelta: 0,
              reason: "능력의 원리와 위험을 구체적으로 확인했다.",
            },
          ]
        : [],
      clockChanges:
        clockDelta && state.clocks[0]
          ? [
              {
                clockId: state.clocks[0].id,
                delta: clockDelta,
                reason: "두 공명핵의 단계적 운용 가능성을 검토했다.",
              },
            ]
          : [],
      memoryAdd: [memory],
      variablesAdd,
      variablesResolve: [],
      characterVisualsAdd: characterVisuals.map((visual) => ({
        characterId: visual.characterId,
        characterName: visual.characterName,
        appearancePrompt: visual.appearancePrompt,
        assetId: visual.canonicalAssetId,
        source: visual.source,
        introducedTurn: nextTurn,
      })),
      encounteredCharactersAdd: isNewEncounter && activeNpc
        ? [
            {
              characterId: activeNpc.id,
              name: activeNpc.name,
              relationType:
                state.relations.find(
                  (relation) => relation.characterId === activeNpc.id,
                )?.relationType || "첫 만남",
            },
          ]
        : [],
      statusLedgerChanges,
      autonomyActions,
      relationshipMemoriesAdd,
      relationshipMemoryResolveIds: [],
    },
    recommendations:
      arrivalMentioned && mentionedNpc
        ? [
            { label: `${withSubjectParticle(mentionedNpc.name)} 찾아온 이유를 묻는다.`, risk: "낮음" },
            { label: "주변 인물들의 반응부터 살핀다.", risk: "보통" },
            { label: "진행 중이던 문제에 곧바로 끌어들인다.", risk: "높음" },
          ]
        : [
            { label: "주축과 보조 공명의 구체적인 차이를 묻는다.", risk: "낮음" },
            { label: "두 파형을 짧게 동시에 울려 보겠다고 제안한다.", risk: "보통" },
            { label: "권장안과 전혀 다른 능력 원리를 설계한다.", risk: "높음" },
          ],
    image: {
      recommended: imageDue,
      reason: imageDue
        ? `${state.imageEvery}턴 주기의 장면 이미지 생성 시점입니다.`
        : state.imageEvery === 0
          ? "정기 장면 이미지 생성이 꺼져 있습니다."
          : `${state.imageEvery}턴마다 장면 이미지를 생성합니다.`,
      prompt: imageDue
        ? `${pack.turnPresentation.sceneImage.styleHint}, ${state.location}, 장면 중심에 선 ${activeNpc?.name ?? "교사"}, 현재 사건의 긴장이 드러나는 표정과 구도, TV 애니메이션을 일시정지한 듯한 자연스러운 장면, 화면 내 글자 없음`
        : "",
      characterIds: activeNpc ? [activeNpc.id] : [],
    },
    characterVisuals,
    agencyAudit: {
      playerActionInvented: false,
      note: "사용자가 입력한 내용 이후의 NPC와 환경 반응만 서술했습니다.",
    },
    narrativeAudit: {
      inputHandled: true,
      inputOutcome: "resolved",
      inputEvidence: dialogue,
      meaningfulBeat: true,
      meaningfulBeatEvidence: dialogue,
      routeEventStatus: "in_progress",
      routeEventEvidence: "",
      chronologyConsistent: true,
      chronologyNote: "모의 엔진의 현재 상태에서 순방향으로 진행했습니다.",
      recommendationsGrounded: true,
      recommendationBasis: [narration, dialogue],
      currentScene: arrivalMentioned && mentionedNpc
        ? `${state.location}에서 새 인물이 합류한 장면`
        : "능력설계실에서 첫 능력의 원리와 위험을 검토하는 장면",
      currentLocation: state.location,
      activeCharacters: activeNpc ? [activeNpc.name] : [],
      activeThreats: [],
    },
    warning:
      "현재는 API 키 없이 작동하는 모의 엔진입니다. Luna 연결 시 같은 상태 계약을 사용합니다.",
  };
}
