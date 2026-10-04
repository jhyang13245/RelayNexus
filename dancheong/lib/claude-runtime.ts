import type {
  NarrativeVariable,
  RuntimeState,
  ScenarioEvent,
  ScenarioPack,
} from "./scenario";
import {
  compactContractText,
  contractInventoryContainsItem,
  contractItemMentioned,
  contractSignalSatisfied,
  contractSituationSatisfied,
  missingContractSignals,
  splitContractSignals,
} from "./contract-signals";
import { highRiskLiveTravelIntent } from "./live-canon-anchor";
import {
  explicitDurationMinutes,
  requestedTimeExceedsEventDeadline,
} from "./event-time-guard";

/**
 * Authoritative port of the deterministic event runtime embedded in the
 * user-provided Claude single-file simulator.  The prose model emits signals;
 * this runtime alone owns beats, event closure, sealed history and the next
 * active event.  GPT/Nexus world simulation runs after this adjudication.
 */
export const CLAUDE_RUNTIME_VARIABLE_ID = "RELAY_CLAUDE_HTML_RUNTIME_V1";
export const CLAUDE_RUNTIME_VERSION = "claude-html-2026-08-22+relay-nexus-v38";
export const CLAUDE_CARRYOVER_LIMIT = 8;

export type ClaudeInputMode = "advance" | "digress" | "overreach";

export type ClaudeTurnIntent = {
  explicitDerailment: boolean;
  impliedTravel: boolean;
  longSpan: boolean;
  requestedEndTime: string;
  requestedMinimumMinutes: number | null;
  destinationHint: string;
  highRiskTravel: boolean;
};

export type ClaudeTurnSignals = {
  inputMode: ClaudeInputMode;
  sceneTime: string;
  location: string;
  appearing: string[];
  firstAppearance: string[];
  mentioned: string[];
  openQuestions: string[];
  resolvedQuestions: string[];
  beatAdvanced: boolean;
  eventResolved: boolean;
  resolutionSummary: string;
  autoAction: string;
};

export type ClaudeSealedEvent = {
  id: string;
  name: string;
  summary: string;
  status?: "sealed" | "manually_closed" | "carried_over";
  missing?: string[];
  closureReason?: string;
  closedAtTurn?: number;
  closedAtTime?: string;
  closedAtLocation?: string;
  carryoverResolution?: string;
  carryoverItems?: ClaudeCarryoverItem[];
  carryoverResolvedAtTurn?: number;
  carryoverResolvedAtTime?: string;
  carryoverResolvedAtLocation?: string;
};

export type ClaudeManualCarryover = {
  origin: "manual" | "automatic_rejection";
  sourceEventId: string;
  sourceEventName: string;
  initialMissing: string[];
  missing: string[];
  items: ClaudeCarryoverItem[];
  ageTurns: number;
  observedText: string;
  createdTurn: number;
  createdTime: string;
  createdLocation: string;
};

export type ClaudeCarryoverItem = {
  id: string;
  requirement: string;
  status: "pending" | "resolved" | "substituted" | "abandoned";
  resolvedTurn?: number;
  evidence?: string;
  resolutionSummary?: string;
};

export type ClaudeManualEventAction = {
  state: RuntimeState;
  changed: boolean;
  message: string;
  closedEvent?: ClaudeSealedEvent;
};

export type ClaudeRuntimeLedger = {
  version: string;
  activeEventId: string;
  beat: number;
  beatTotal: number;
  stallTurns: number;
  eventTurns: number;
  overdueTurns: number;
  maxSequence: number;
  backfill: boolean;
  driftTurns: number;
  eventText: string;
  mustHolds: number;
  mustPending: string[];
  closureExtensionCount: number;
  manualCarryover: ClaudeManualCarryover | null;
  manualCloseCooldownEventId: string;
  sealed: ClaudeSealedEvent[];
  cancelled: string[];
  openQuestions: string[];
  resume: {
    events: string[];
    at: string;
    location: string;
    tail: string;
  } | null;
  lastInputMode: ClaudeInputMode;
  lastAdjudication: string;
};

export type ClaudeRuntimePrompt = {
  engine: string;
  priority: string[];
  activeEvent: Record<string, unknown> | null;
  currentBeat: Record<string, unknown> | null;
  constraints: Array<Record<string, unknown>>;
  sealedEvents: ClaudeSealedEvent[];
  unresolvedThreads: string[];
  transitionResume: ClaudeRuntimeLedger["resume"];
  manualCarryover: Record<string, unknown> | null;
  closurePressure: Record<string, unknown>;
  pressure: string[];
  derailment: Record<string, unknown>;
  outputContract: Record<string, unknown>;
  hardRules: string[];
};

export type ClaudeTurnAdjudication = {
  ledger: ClaudeRuntimeLedger;
  activeEventBefore?: ScenarioEvent;
  activeEventAfter?: ScenarioEvent;
  explicitDerailmentTurn: boolean;
  completedEventIds: string[];
  beatAdvanced: boolean;
  eventCompleted: boolean;
  eventCarriedOver: boolean;
  closureBeatExtended: boolean;
  completionRejected: boolean;
  missingCurrentContract: string[];
  stoppedAtEventId?: string;
  reason: string;
};

const compact = compactContractText;

const clip = (value: string, length: number) => {
  const normalized = String(value || "").replace(/\s+/gu, " ").trim();
  return normalized.length > length
    ? `${normalized.slice(0, length)}…`
    : normalized;
};

const splitContractList = splitContractSignals;

const ENGINE_CLOSURE_TERMS = /(?:사건\s*탭|사건(?:을|이)?\s*(?:닫|종결|봉인|완료)|필수\s*(?:계약|조건)|봉인(?:됐|되었|합니다)|시스템|eventResolved|비트\s*완료)/iu;

const substantiveClosure = (value = "") => {
  const normalized = clip(value, 360);
  return normalized.length >= 16 && !ENGINE_CLOSURE_TERMS.test(normalized)
    ? normalized
    : "";
};

const withTopicParticle = (name: string) => {
  const label = name.trim() || "주인공";
  const code = label.charCodeAt(label.length - 1);
  const hasFinalConsonant = code >= 0xac00 && code <= 0xd7a3
    ? (code - 0xac00) % 28 !== 0
    : false;
  return `${label}${hasFinalConsonant ? "은" : "는"}`;
};

const authoredEventClosure = (event: ScenarioEvent, candidate = "") =>
  substantiveClosure(candidate) ||
  substantiveClosure(event.onSuccess) ||
  substantiveClosure(event.effects) ||
  substantiveClosure(event.description);

const naturalContractList = (missing: string[]) => {
  const items = missing.map((item) => item
    .replace(/^(?:필수 물품|필수 대사|종결 신호)\s*/u, "")
    .replace(/^"|"$/gu, "")
    .trim(),
  ).filter(Boolean);
  if (!items.length) return "앞서 남은 일";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} 그리고 ${items.at(-1)}`;
};

const eventSequence = (event: ScenarioEvent) => event.sequence ?? 999;

export const orderedClaudeEvents = (pack: ScenarioPack): ScenarioEvent[] =>
  [...(pack.events ?? [])]
    .filter((event) => event.kind !== "constraint")
    .sort(
      (left, right) =>
        eventSequence(left) - eventSequence(right) ||
        (right.priority ?? 0) - (left.priority ?? 0),
    );

export const claudeBeatTotalFor = (event?: ScenarioEvent): number => {
  if (!event) return 3;
  if (event.kind === "compound" && event.beats?.length) {
    return event.beats.length;
  }
  const text = [
    event.effects,
    event.onSuccess,
    event.description,
    event.conditions,
  ].filter(Boolean).join(" ");
  const declared = text.match(/(\d+)\s*턴/u)?.[1];
  if (declared) {
    const parsed = Number(declared);
    if (parsed >= 2 && parsed <= 8) return parsed;
  }
  const base = event.required ? 4 : 3;
  return /프롤로그|일상/u.test(event.name) ? Math.max(2, base - 1) : base;
};

const initialEvent = (pack: ScenarioPack, fallbackEventId = "") => {
  const events = orderedClaudeEvents(pack);
  return events.find((event) => event.id === fallbackEventId) ??
    events.find((event) => event.status === "Active") ??
    events[0];
};

const newLedger = (
  pack: ScenarioPack,
  fallbackEventId = "",
): ClaudeRuntimeLedger => {
  const event = initialEvent(pack, fallbackEventId);
  return {
    version: CLAUDE_RUNTIME_VERSION,
    activeEventId: event?.id ?? "",
    beat: 0,
    beatTotal: claudeBeatTotalFor(event),
    stallTurns: 0,
    eventTurns: 0,
    overdueTurns: 0,
    maxSequence: event ? eventSequence(event) : 0,
    backfill: false,
    driftTurns: 0,
    eventText: "",
    mustHolds: 0,
    mustPending: [],
    closureExtensionCount: 0,
    manualCarryover: null,
    manualCloseCooldownEventId: "",
    sealed: [],
    cancelled: [],
    openQuestions: [],
    resume: null,
    lastInputMode: "advance",
    lastAdjudication: "Claude HTML runtime initialized",
  };
};

const hasExplicitClaudeContract = (event?: ScenarioEvent) => Boolean(
  event && (
    splitContractList(event.requiredItems).length > 0 ||
    event.requiredDialogue?.trim() ||
    splitContractList(event.completionSignals).length > 0
  ),
);

const legacyEvidenceUnits = (state: RuntimeState, ledger: ClaudeRuntimeLedger): string[] => [
  ledger.eventText,
  state.sceneSummary,
  ...(state.memories ?? []),
].filter(Boolean).flatMap((value) =>
  String(value).split(/(?<=[.!?。！？])|\r?\n/u).map((part) => part.trim()).filter(Boolean)
);

/** Legacy saves may contain summaries from several turns. Contract fragments
 * from different sentences must never be concatenated into one false match. */
const missingLegacyReconciliationContract = (
  event: ScenarioEvent,
  evidenceUnits: string[],
  inventory: string[],
): string[] => {
  const missing: string[] = [];
  for (const item of splitContractList(event.requiredItems)) {
    if (!evidenceUnits.some((unit) => claudeContractItemObtained(item, unit, inventory))) {
      missing.push(`필수 물품 \"${item}\"`);
    }
  }
  const dialogue = event.requiredDialogue?.trim() ?? "";
  if (dialogue && !evidenceUnits.some((unit) => contractSignalSatisfied(dialogue, unit))) {
    missing.push(`필수 대사 \"${clip(dialogue, 48)}\"`);
  }
  const signals = splitContractList(event.completionSignals);
  if (signals.length > 0 && !signals.some((signal) =>
    evidenceUnits.some((unit) => contractSituationSatisfied(signal, unit))
  )) {
    missing.push(`종결 신호 ${signals.map((signal) => `\"${clip(signal, 32)}\"`).join(" / ")}`);
  }
  return missing;
};

/**
 * Repairs ledgers written by older Nexus builds. An authoritative active event
 * means every earlier ordered event is already historical, never waiting. If
 * the saved public prose and inventory also satisfy the active event's exact
 * contract, close it even when an older response forgot eventResolved.
 */
const reconcileClaudeRuntimeLedger = (
  pack: ScenarioPack,
  state: RuntimeState,
  ledger: ClaudeRuntimeLedger,
): ClaudeRuntimeLedger => {
  const ordered = orderedClaudeEvents(pack);
  const active = pack.events.find((event) => event.id === ledger.activeEventId);
  const activeIndex = active
    ? ordered.findIndex((event) => event.id === active.id)
    : -1;

  if (active && activeIndex > 0 && !ledger.backfill) {
    for (const predecessor of ordered.slice(0, activeIndex)) {
      if (ledger.cancelled.includes(predecessor.id)) continue;
      sealClaudeEvent(
        ledger,
        predecessor,
        `${active.name} 이전에 순서대로 성립한 선행 사건으로 복구됐다.`,
        {
          closureReason: predecessor.onSuccess || predecessor.effects || predecessor.description ||
            `${predecessor.name}에서 해야 할 일이 끝나고, 인물들은 ${active.name}의 상황으로 넘어갔다.`,
          turn: state.turn,
          time: state.time,
          location: state.location,
        },
      );
    }
  }

  if (!active || !hasExplicitClaudeContract(active)) return ledger;
  const evidenceUnits = legacyEvidenceUnits(state, ledger);
  const observedText = evidenceUnits.join("\n");
  const missing = missingLegacyReconciliationContract(active, evidenceUnits, state.inventory);
  ledger.mustPending = missing;
  // Legacy non-compound saves never advanced a beat cursor after writing the
  // visible completion contract. Keep repairing those as before. The stricter
  // runtime total is only needed once v38 has appended its synthetic closure
  // beat; otherwise reading the save could seal that extra beat before it is
  // actually played.
  const compoundComplete = ledger.closureExtensionCount > 0
    ? ledger.beat >= ledger.beatTotal
    : active.kind !== "compound" ||
      !active.beats?.length ||
      ledger.beat >= active.beats.length;
  if (missing.length > 0 || !compoundComplete) return ledger;

  sealClaudeEvent(
    ledger,
    active,
    `저장된 본문과 상태에서 ${active.name}의 필수 계약이 모두 확인됐다.`,
    {
      closureReason: active.onSuccess || active.effects || active.description ||
        `${active.name}에서 해야 할 일이 실제로 마무리되어 다음 상황으로 넘어갈 수 있게 됐다.`,
      turn: state.turn,
      time: state.time,
      location: state.location,
    },
  );
  const releasesManualCloseCooldown =
    ledger.manualCloseCooldownEventId === active.id;
  openClaudeEvent(ledger, nextUnsealedEvent(pack, ledger, active));
  if (releasesManualCloseCooldown) {
    ledger.manualCloseCooldownEventId = "";
  }
  ledger.resume = {
    events: [active.name],
    at: state.time,
    location: state.location,
    tail: observedText.slice(-420),
  };
  ledger.lastAdjudication = "저장된 본문·인벤토리 계약을 재검증해 완료 사건을 봉인";
  return ledger;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

export const readClaudeRuntime = (
  pack: ScenarioPack,
  state: RuntimeState,
  fallbackEventId = "",
): ClaudeRuntimeLedger => {
  const variable = (state.variables ?? []).find(
    (candidate) =>
      candidate.id === CLAUDE_RUNTIME_VARIABLE_ID &&
      candidate.status === "active",
  );
  if (!variable) {
    return reconcileClaudeRuntimeLedger(
      pack,
      state,
      newLedger(pack, fallbackEventId),
    );
  }
  try {
    const raw = JSON.parse(variable.detail) as Partial<ClaudeRuntimeLedger>;
    const knownEvents = new Set(orderedClaudeEvents(pack).map((event) => event.id));
    const activeEventId = typeof raw.activeEventId === "string" &&
        knownEvents.has(raw.activeEventId)
      ? raw.activeEventId
      : initialEvent(pack, fallbackEventId)?.id ?? "";
    const event = pack.events.find((candidate) => candidate.id === activeEventId);
    const beatTotal = Math.max(1, Number(raw.beatTotal) || claudeBeatTotalFor(event));
    const sealed = Array.isArray(raw.sealed)
      ? raw.sealed.filter(
          (entry): entry is ClaudeSealedEvent =>
            Boolean(entry && typeof entry.id === "string" && knownEvents.has(entry.id)),
        )
      : [];
    return reconcileClaudeRuntimeLedger(pack, state, {
      version: CLAUDE_RUNTIME_VERSION,
      activeEventId,
      beat: Math.max(0, Math.min(beatTotal, Number(raw.beat) || 0)),
      beatTotal,
      stallTurns: Math.max(0, Number(raw.stallTurns) || 0),
      eventTurns: Math.max(0, Number(raw.eventTurns) || 0),
      overdueTurns: Math.max(0, Number(raw.overdueTurns) || 0),
      maxSequence: Math.max(0, Number(raw.maxSequence) || eventSequence(event ?? {} as ScenarioEvent)),
      backfill: Boolean(raw.backfill),
      driftTurns: Math.max(0, Number(raw.driftTurns) || 0),
      eventText: typeof raw.eventText === "string" ? raw.eventText.slice(-8000) : "",
      mustHolds: Math.max(0, Number(raw.mustHolds) || 0),
      mustPending: stringArray(raw.mustPending),
      closureExtensionCount: Math.max(
        0,
        Math.min(2, Number(raw.closureExtensionCount) || 0),
      ),
      manualCarryover: raw.manualCarryover && typeof raw.manualCarryover === "object"
        ? {
            origin: raw.manualCarryover.origin === "automatic_rejection"
              ? "automatic_rejection"
              : "manual",
            sourceEventId: typeof raw.manualCarryover.sourceEventId === "string"
              ? raw.manualCarryover.sourceEventId
              : "",
            sourceEventName: typeof raw.manualCarryover.sourceEventName === "string"
              ? raw.manualCarryover.sourceEventName
              : "이전 사건",
            initialMissing: stringArray(raw.manualCarryover.initialMissing),
            missing: stringArray(raw.manualCarryover.missing),
            items: Array.isArray(raw.manualCarryover.items)
              ? raw.manualCarryover.items.flatMap((value, index) => {
                  if (!value || typeof value !== "object") return [];
                  const item = value as Partial<ClaudeCarryoverItem>;
                  if (typeof item.requirement !== "string" || !item.requirement.trim()) return [];
                  const status = ["pending", "resolved", "substituted", "abandoned"].includes(
                    String(item.status),
                  ) ? item.status as ClaudeCarryoverItem["status"] : "pending";
                  return [{
                    id: typeof item.id === "string" ? item.id : `carryover-${index + 1}`,
                    requirement: item.requirement,
                    status,
                    ...(typeof item.resolvedTurn === "number" ? { resolvedTurn: item.resolvedTurn } : {}),
                    ...(typeof item.evidence === "string" ? { evidence: item.evidence.slice(-600) } : {}),
                    ...(typeof item.resolutionSummary === "string"
                      ? { resolutionSummary: item.resolutionSummary.slice(-600) }
                      : {}),
                  }];
                })
              : stringArray(raw.manualCarryover.initialMissing).map((requirement, index) => ({
                  id: `carryover-${index + 1}`,
                  requirement,
                  status: stringArray(raw.manualCarryover?.missing).includes(requirement)
                    ? "pending" as const
                    : "resolved" as const,
                })),
            ageTurns: Math.max(0, Number(raw.manualCarryover.ageTurns) || 0),
            observedText: typeof raw.manualCarryover.observedText === "string"
              ? raw.manualCarryover.observedText.slice(-8000)
              : "",
            createdTurn: Math.max(0, Number(raw.manualCarryover.createdTurn) || 0),
            createdTime: typeof raw.manualCarryover.createdTime === "string"
              ? raw.manualCarryover.createdTime
              : "",
            createdLocation: typeof raw.manualCarryover.createdLocation === "string"
              ? raw.manualCarryover.createdLocation
              : "",
          }
        : null,
      manualCloseCooldownEventId:
        typeof raw.manualCloseCooldownEventId === "string"
          ? raw.manualCloseCooldownEventId
          : "",
      sealed,
      cancelled: stringArray(raw.cancelled),
      openQuestions: stringArray(raw.openQuestions).slice(-12),
      resume: raw.resume && typeof raw.resume === "object"
        ? {
            events: stringArray(raw.resume.events).slice(-3),
            at: typeof raw.resume.at === "string" ? raw.resume.at : "",
            location: typeof raw.resume.location === "string"
              ? raw.resume.location
              : "",
            tail: typeof raw.resume.tail === "string"
              ? raw.resume.tail.slice(-420)
              : "",
          }
        : null,
      lastInputMode: raw.lastInputMode === "digress" || raw.lastInputMode === "overreach"
        ? raw.lastInputMode
        : "advance",
      lastAdjudication: typeof raw.lastAdjudication === "string"
        ? raw.lastAdjudication
        : "Claude HTML runtime restored",
    });
  } catch {
    return reconcileClaudeRuntimeLedger(
      pack,
      state,
      newLedger(pack, fallbackEventId),
    );
  }
};

export const claudeRuntimeVariable = (
  ledger: ClaudeRuntimeLedger,
): Pick<NarrativeVariable, "id" | "label" | "detail" | "visibility" | "reason"> => ({
  id: CLAUDE_RUNTIME_VARIABLE_ID,
  label: "Claude HTML authoritative event runtime",
  detail: JSON.stringify(ledger),
  visibility: "hidden",
  reason: "Claude 단일 HTML의 비트·봉인·이탈·필수 성립 상태 기계를 서버 권위 원장으로 보존",
});

export const CLAUDE_ABANDON_PATTERN =
  /(안\s*가|안\s*갈|가지\s*않|안\s*해|하지\s*않겠|무시|생까|제쳐\s*두|내버려\s*두|버려\s*두|방치|포기|그만두|그만하|때려치|도망|달아나|떠난|떠나|자리를\s*뜨|자리를\s*이탈|빠져나|돌아가|돌아선|집에\s*가|귀가|버리고|관심\s*없|신경\s*안|그냥\s*지나|모른\s*척|외면|물러난|철수)/u;

// `외면하지 말고`, `포기하지 않는다`, `떠나지 않겠다`처럼 이탈
// 동사를 부정하는 문장은 현재 사건을 버리겠다는 뜻의 정반대다. 단순
// 키워드 검사는 이중 부정을 C형 이탈로 뒤집으므로, 긍정형 이탈 검사를
// 하기 전에 해당 범위만 제거한다. `안 간다`, `가지 않겠다`는 목적지나
// 제안을 실제로 거절하는 표현이므로 의도적으로 이 목록에 넣지 않는다.
const CLAUDE_NEGATED_ABANDON_PATTERN =
  /(?:안\s*(?:무시|외면|포기|떠나|도망|달아나|돌아가|물러나|철수|그만두|그만하)|(?:(?:무시|외면|포기|방치|모른\s*척|자리를\s*이탈)(?:하)?|떠나|도망(?:치)?|달아나|돌아가|물러나|철수|그만두|그만하|버리|제쳐\s*두|내버려\s*두|자리를\s*뜨|빠져나가)(?:지|지는|지도)\s*(?:않|말))/gu;

const containsAffirmativeClaudeAbandonment = (input: string): boolean =>
  CLAUDE_ABANDON_PATTERN.test(
    input.normalize("NFKC").replace(CLAUDE_NEGATED_ABANDON_PATTERN, " "),
  );

const CLAUDE_LONG_DIVERSION_PATTERN =
  /(밤\s*을?\s*새|밤새|철야|다음\s*날|내일|아침까지|새벽까지|저녁(?:\s*늦게)?까지|해\s*(?:질|가\s*질)\s*때까지|날이\s*어두워질\s*때까지|늦은\s*밤까지|밤까지|오전\s*\d{1,2}\s*(?:시|:)|하루\s*(?:종일|내내)|몇\s*시간|(?:(?:\d+|한|두|세|네|몇|수)\s*(?:년|개월|달|주(?:일)?|일)\s*(?:동안|간|뒤|후)?|수년|수개월|수주|며칠)|여행|휴가)/u;
const clockMinutes = (value: string): number | null => {
  const match = value.match(/^(\d{1,2}):([0-5]\d)$/u);
  if (!match) return null;
  const hours = Number(match[1]);
  return hours <= 23 ? hours * 60 + Number(match[2]) : null;
};

const explicitEndClock = (input: string): string => {
  const match = input.normalize("NFKC").match(
    /(오전|오후)?\s*(\d{1,2})\s*(?::|시)\s*(\d{1,2})?\s*분?\s*까지/u,
  );
  if (!match) return "";
  let hour = Number(match[2]);
  const minute = Number(match[3] ?? 0);
  if (match[1] === "오후" && hour < 12) hour += 12;
  if (match[1] === "오전" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const qualitativeEndClock = (input: string): string => {
  const normalized = input.normalize("NFKC");
  if (/(?:늦은\s*밤|밤\s*늦게)까지/u.test(normalized)) return "23:00";
  if (/새벽까지/u.test(normalized)) return "05:00";
  if (/밤까지/u.test(normalized)) return "22:00";
  if (/저녁\s*늦게까지/u.test(normalized)) return "21:00";
  if (/(?:저녁까지|해\s*(?:질|가\s*질)\s*때까지|날이\s*어두워질\s*때까지)/u.test(normalized)) {
    return "19:00";
  }
  return "";
};

const destinationHintFromInput = (input: string): string => {
  const normalized = input.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const matches = [...normalized.matchAll(
    /([\p{L}\p{N}·'-]+(?:\s+[\p{L}\p{N}·'-]+){0,5})(?:(?:에|으로|(?<!으)로)\s*(?:(?:곧장|바로|즉시)\s*)?(?:가(?=\s|[.!?]|$)|가서|간다|가기로|가려|향해|향한다|향하려|이동(?:하|해)|출발(?:하|해))|에서(?=.{0,48}(?:밤\s*을?\s*새|밤새|놀|파티|머물|시간을\s*보내)))/gu,
  )];
  const raw = matches.at(-1)?.[1]
    ?.split(/(?:하고|지만|는데|다가|고)\s+/u)
    .at(-1) ?? "";
  return raw
    .replace(/^(?:갑자기|그냥|일단|한시우는|주인공은|그는|그녀는|그들은)\s*/u, "")
    .replace(/(?:을|를|은|는|이|가)$/u, "")
    .trim()
    .slice(-32);
};

export const deriveClaudeTurnIntent = (
  input: string,
  event: ScenarioEvent | undefined,
  currentTime = "",
  backfill = false,
): ClaudeTurnIntent => {
  const normalized = input.normalize("NFKC");
  const requestedEndTime = explicitEndClock(normalized) || qualitativeEndClock(normalized);
  const start = clockMinutes(currentTime);
  const end = clockMinutes(requestedEndTime);
  const requestedMinimumMinutes = start === null || end === null
    ? null
    : end > start
      ? end - start
      : 24 * 60 - start + end;
  const declaredDurationMinutes = explicitDurationMinutes(normalized);
  const effectiveRequestedMinutes = Math.max(
    requestedMinimumMinutes ?? 0,
    declaredDurationMinutes ?? 0,
  ) || null;
  const destinationHint = destinationHintFromInput(normalized);
  const asksForDirections = /(?:가는|갈)\s*(?:길|방법|방향)|길을?\s*(?:알려|묻)/u.test(
    normalized,
  );
  const impliedTravel = !asksForDirections && (
    Boolean(destinationHint) ||
    /(?:으로|로)\s*(?:가서|간다|향해|향한다|이동|출발)/u.test(normalized)
  );
  const exceedsDeadline = Boolean(event?.required) && requestedTimeExceedsEventDeadline({
    eventTimeWindow: event?.timeWindow ?? "",
    currentTime,
    requestedEndTime,
    requestedDurationMinutes: declaredDurationMinutes,
  });
  const longSpan = CLAUDE_LONG_DIVERSION_PATTERN.test(normalized) ||
    (effectiveRequestedMinutes ?? 0) >= 180;
  // 장시간 이동은 목적지에서 무엇을 하겠다는 동사 형태와 무관하게
  // 현재 사건의 시간·장소를 벗어나는 명시적 플레이어 행동이다. 특히
  // "클럽으로 곧장 가서 다음날까지"처럼 `으로/로`를 쓰는 입력을 일반
  // 턴으로 오판하면 재작성 비교 게이트가 턴을 무한 거부한다.
  const semanticDiversion = (longSpan || exceedsDeadline) && !asksForDirections;
  return {
    explicitDerailment: Boolean(
      event?.required &&
      !backfill &&
      (containsAffirmativeClaudeAbandonment(normalized) || semanticDiversion)
    ),
    impliedTravel,
    longSpan,
    requestedEndTime,
    requestedMinimumMinutes: effectiveRequestedMinutes,
    destinationHint,
    highRiskTravel: highRiskLiveTravelIntent(normalized),
  };
};

export const isClaudeDerailmentTurn = (
  input: string,
  event: ScenarioEvent | undefined,
  backfill = false,
) => deriveClaudeTurnIntent(input, event, "", backfill).explicitDerailment;

export const claudeContractItemObtained = (
  item: string,
  text: string,
  inventory: string[],
) => {
  if (contractInventoryContainsItem(inventory, item)) return true;
  const obtainPattern = /(열|집|챙기|받|건네|꺼내|쥐|넣|주머니|가방|손에|획득|인벤토리)/u;
  return text
    .split(/(?<=[.!?。！？\n])/u)
    .some((sentence) => contractItemMentioned(item, sentence) && obtainPattern.test(sentence));
};

export type ClaudeContractChecklistItem = {
  id: string;
  kind: "item" | "dialogue" | "signal";
  label: string;
  met: boolean;
};

/** Read-only UI projection of the same evidence checks used by event closure. */
export const claudeContractChecklist = (
  event: ScenarioEvent | undefined,
  observedText: string,
  inventory: string[],
): ClaudeContractChecklistItem[] => {
  if (!event) return [];
  const items = splitContractList(event.requiredItems).map((item, index) => ({
    id: `item-${index}-${item}`,
    kind: "item" as const,
    label: item,
    met: claudeContractItemObtained(item, observedText, inventory),
  }));
  const dialogue = event.requiredDialogue?.trim() ?? "";
  const dialogueItem = dialogue
    ? [{
      id: `dialogue-${dialogue}`,
      kind: "dialogue" as const,
      label: clip(dialogue, 96),
      met: contractSignalSatisfied(dialogue, observedText),
    }]
    : [];
  const signals = splitContractList(event.completionSignals);
  const signalItem = signals.length
    ? [{
      id: `signal-${signals.join("|")}`,
      kind: "signal" as const,
      label: signals.map((signal) => clip(signal, 72)).join(" / "),
      met: signals.some((signal) => contractSituationSatisfied(signal, observedText)),
    }]
    : [];
  return [...items, ...dialogueItem, ...signalItem];
};

export const missingClaudeContract = (
  event: ScenarioEvent | undefined,
  observedText: string,
  inventory: string[],
): string[] => {
  if (!event) return [];
  const missing: string[] = [];
  for (const item of splitContractList(event.requiredItems)) {
    if (!claudeContractItemObtained(item, observedText, inventory)) {
      missing.push(`필수 물품 \"${item}\"`);
    }
  }
  const dialogue = event.requiredDialogue?.trim() ?? "";
  if (dialogue && !contractSignalSatisfied(dialogue, observedText)) {
    missing.push(`필수 대사 \"${clip(dialogue, 48)}\"`);
  }
  const signals = splitContractList(event.completionSignals);
  if (signals.length > 0 && !signals.some((signal) =>
    contractSituationSatisfied(signal, observedText)
  )) {
    missing.push(`종결 신호 ${signals.map((signal) => `\"${clip(signal, 32)}\"`).join(" / ")}`);
  }
  return missing;
};

/**
 * The beat cursor is server authority. Only the final beat converges on the
 * event result and attempts closure; every earlier beat remains exploratory.
 * This is derived from persisted state so existing sessions opt in without a
 * migration or restart.
 */
export const claudeClosurePressureActive = (
  event: ScenarioEvent | undefined,
  ledger: ClaudeRuntimeLedger,
): boolean => Boolean(
  event &&
  ledger.activeEventId === event.id &&
  ledger.beatTotal > 0 &&
  ledger.beat >= Math.max(0, ledger.beatTotal - 1),
);

const missingClaudeCurrentBeatContract = (
  event: ScenarioEvent | undefined,
  beatIndex: number,
  observedText: string,
): string[] => {
  if (event?.kind !== "compound" || !event.beats?.length) return [];
  const beat = [...event.beats].sort((left, right) => left.order - right.order)[
    Math.min(Math.max(0, beatIndex), event.beats.length - 1)
  ];
  return missingContractSignals(beat.requiredSignals, observedText)
    .map((signal) => `마지막 비트 신호 "${clip(signal, 48)}"`);
};

export const forcedClaudeClosureViolations = ({
  turn,
  activeEvent,
  ledger,
  publicText,
  inventoryAfter,
}: {
  turn: { claudeSignals?: ClaudeTurnSignals };
  activeEvent?: ScenarioEvent;
  ledger: ClaudeRuntimeLedger;
  publicText: string;
  inventoryAfter: string[];
}): string[] => {
  if (!claudeClosurePressureActive(activeEvent, ledger)) return [];
  const violations: string[] = [];
  if (!turn.claudeSignals?.eventResolved) {
    violations.push("마지막 비트 eventResolved=false");
  } else if ((turn.claudeSignals.resolutionSummary ?? "").trim().length < 12) {
    violations.push("강제 종결의 구체적인 resolutionSummary 누락");
  }
  const missing = missingClaudeContract(
    activeEvent,
    `${ledger.eventText}\n${publicText}`,
    inventoryAfter,
  );
  missing.push(...missingClaudeCurrentBeatContract(
    activeEvent,
    ledger.beat,
    publicText,
  ));
  if (missing.length) {
    violations.push(`강제 종결 근거 미성립: ${missing.join(" / ")}`);
  }
  return violations;
};

export const claudeClosureEvidenceSatisfied = ({
  activeEvent,
  ledger,
  publicText,
  inventoryAfter,
}: {
  activeEvent?: ScenarioEvent;
  ledger: ClaudeRuntimeLedger;
  publicText: string;
  inventoryAfter: string[];
}): boolean => {
  if (!claudeClosurePressureActive(activeEvent, ledger)) return false;
  const missing = missingClaudeContract(
    activeEvent,
    `${ledger.eventText}\n${publicText}`,
    inventoryAfter,
  );
  missing.push(...missingClaudeCurrentBeatContract(
    activeEvent,
    ledger.beat,
    publicText,
  ));
  return missing.length === 0;
};

export const confirmClaudeClosureFromEvidence = <T extends {
  claudeSignals?: ClaudeTurnSignals;
}>({
  turn,
  activeEvent,
  ledger,
  publicText,
  inventoryAfter,
}: {
  turn: T;
  activeEvent?: ScenarioEvent;
  ledger: ClaudeRuntimeLedger;
  publicText: string;
  inventoryAfter: string[];
}): T => {
  const signals = turn.claudeSignals;
  if (!signals || signals.eventResolved || !claudeClosureEvidenceSatisfied({
    activeEvent,
    ledger,
    publicText,
    inventoryAfter,
  })) return turn;
  return {
    ...turn,
    claudeSignals: {
      ...signals,
      beatAdvanced: true,
      eventResolved: true,
      resolutionSummary: signals.resolutionSummary?.trim().length >= 12
        ? signals.resolutionSummary
        : `${activeEvent?.name ?? "현재 사건"}의 필수 결과가 본문과 상태 원장에 성립했다.`,
    },
  };
};

export const unmetClaudePrerequisites = (
  pack: ScenarioPack,
  ledger: ClaudeRuntimeLedger,
  target: ScenarioEvent,
  currentTurn: number,
): string[] => {
  const completed = new Set([
    ...ledger.sealed.map((event) => event.id),
    ...ledger.cancelled,
  ]);
  const missing: string[] = [];
  const referencedIds = target.conditions.match(/\bEVT?_[A-Za-z0-9_]+/gu) ?? [];
  for (const id of new Set(referencedIds)) {
    if (pack.events.some((event) => event.id === id) && !completed.has(id)) {
      missing.push(`선행 사건 ${id} 미완료`);
    }
  }
  const minimumTurn = [target.conditions, target.cancelConditions]
    .map((text) => text?.match(/최소[^0-9]{0,10}(\d+)\s*턴/u)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .reduce((maximum, value) => Math.max(maximum, value), 0);
  if (minimumTurn > currentTurn) {
    missing.push(`최소 ${minimumTurn}턴 (현재 ${currentTurn}턴)`);
  }
  const current = pack.events.find((event) => event.id === ledger.activeEventId);
  const currentSequence = current ? eventSequence(current) : 0;
  const gap = orderedClaudeEvents(pack).filter(
    (event) =>
      event.required &&
      !completed.has(event.id) &&
      event.id !== target.id &&
      eventSequence(event) > currentSequence &&
      eventSequence(event) < eventSequence(target),
  );
  if (gap.length) missing.push(`사이 필수 사건 ${gap.length}건 미완료`);
  return [...new Set(missing)];
};

const applicableConstraints = (
  pack: ScenarioPack,
  eventId: string,
) => (pack.constraints ?? []).filter((constraint) => {
  const targets = constraint.appliesTo ?? [];
  return targets.length === 0 || targets.includes("*") || targets.includes(eventId);
});

export const buildClaudeRuntimePrompt = ({
  pack,
  state,
  ledger,
  userInput,
  canonicalAdvance,
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  ledger: ClaudeRuntimeLedger;
  userInput: string;
  canonicalAdvance: boolean;
}): ClaudeRuntimePrompt => {
  const event = pack.events.find((candidate) => candidate.id === ledger.activeEventId);
  const turnIntent = deriveClaudeTurnIntent(
    userInput,
    event,
    state.time,
    ledger.backfill,
  );
  const explicitDerailment = !canonicalAdvance && turnIntent.explicitDerailment;
  const beat = event?.kind === "compound" && event.beats?.length
    ? [...event.beats].sort((left, right) => left.order - right.order)[
        Math.min(ledger.beat, event.beats.length - 1)
      ]
    : undefined;
  const pressure: string[] = [];
  const forceClosureThisTurn = claudeClosurePressureActive(event, ledger);
  if (forceClosureThisTurn) {
    pressure.push(
      ledger.closureExtensionCount >= 2
        ? "확장 본문과 임시 종결 비트 뒤의 마지막 강제 종결 턴이다. 인물다운 책임·관계·시간 압박으로 이탈 입력을 정사에 흡수하고 남은 필수 결과를 모두 직접 성립시켜 eventResolved=true로 닫는다. 새 갈등이나 다음 사건은 시작하지 않는다."
        : ledger.closureExtensionCount > 0
        ? "종결 본문을 충분히 확장한 뒤 추가된 임시 종결 비트다. 이번에는 현재 사건의 남은 필수 결과를 장면 안에서 모두 직접 성립시키고 eventResolved=true로 닫는다. 새 갈등이나 다음 사건은 시작하지 않는다."
        : "현재 사건의 마지막 비트다. 짧은 장면 분량에 맞추지 말고 필요한 대화·확인·이동 제안·인계가 끝날 때까지 본문을 충분히 이어 쓴다. 시간창·현재 장소·등장인물의 동기를 지키며 남은 결과를 개연성 있게 성립시키고 eventResolved=true로 닫는다.",
    );
    if (ledger.mustPending.length) {
      pressure.push(`마지막 비트에서 성립시킬 필수 계약: ${ledger.mustPending.join(" / ")}`);
    }
    if (ledger.closureExtensionCount > 0) {
      pressure.unshift("정사 강제 흡수 비트다. 사용자가 무관한 장소·밤샘·회피를 선언해도 욕구는 짧게 인정하되, 주인공의 양심·책임·관계·상대의 설득·시간 압박 중 인물다운 이유로 스스로 재고하게 하고 현재 사건의 필수 행동으로 돌아와 반드시 종결한다.");
    }
  } else {
    pressure.push("탐색 비트다. 사건 결과를 미리 수렴·종결하려 하지 말고, 플레이어 선택과 인물 반응이 만드는 현재 장면을 자유롭게 발전시킨다.");
  }
  if (ledger.manualCarryover?.missing.length) {
    const carryoverAge = Math.max(
      ledger.manualCarryover.ageTurns,
      state.turn - ledger.manualCarryover.createdTurn,
    );
    pressure.unshift(forceClosureThisTurn
      ? `${ledger.manualCarryover.origin === "automatic_rejection" ? "종결이 한 번 거부되어 자동" : "직접 종결로"} 이월된 조건을 마지막 비트의 원인·행동·반응 속에 성립시킨다: ${ledger.manualCarryover.missing.join(" / ")}`
      : `이월된 조건은 아직 강제하지 않는다. 현재 장면에 자연스럽게 맞으면 복선·원인으로만 연결하고, 사건 결과 수렴은 마지막 비트까지 미룬다: ${ledger.manualCarryover.missing.join(" / ")}`);
    if (forceClosureThisTurn && carryoverAge >= 3) {
      pressure.unshift("이월이 3턴 이상 남았다. 배경 암시가 아니라 NPC의 직접 행동·전달·확인으로 이번 장면에서 적어도 한 항목을 확정한다.");
    }
    if (forceClosureThisTurn && carryoverAge >= 5) {
      pressure.unshift("원래 방식이 현재 분기와 맞지 않으면 alternativeFulfillment 또는 같은 인과를 보존하는 대체 결과로 회수한다. 원래 연출을 재연하지 않는다.");
    }
    if (forceClosureThisTurn && carryoverAge >= 7) {
      pressure.unshift(`이월 한계 ${CLAUDE_CARRYOVER_LIMIT}턴 직전이다. 이번 장면에서도 성립하지 않으면 해당 결과는 실제로 일어나지 않은 것으로 포기 처리되며 이후 일어난 사실처럼 참조할 수 없다.`);
    }
  }
  if (forceClosureThisTurn && ledger.driftTurns >= 1) {
    pressure.push("이전 이탈이 남아 있다. 이번 턴에는 현재 필수 사건을 다시 미루지 말고 인물의 동기와 실제 행동으로 자연스럽게 흡수해 필수 계약까지 성립시킨다.");
  }
  return {
    engine: CLAUDE_RUNTIME_VERSION,
    priority: [
      "출력 계약",
      "필수 성립",
      "사건 경계",
      "입력 흡수",
      "플레이어 주권",
      "문체와 분량",
    ],
    activeEvent: event
      ? {
          id: event.id,
          name: event.name,
          required: Boolean(event.required),
          timeWindow: event.timeWindow ?? "",
          conditions: event.conditions,
          participants: event.participants ?? "",
          description: event.description,
          effects: event.effects ?? "",
          onSuccess: event.onSuccess ?? "",
          onFailure: event.onFailure ?? "",
          recoveryAlternatives: event.recoveryAlternatives ?? "",
          alternateBeats: event.alternateBeats ?? [],
          sceneMarkers: event.sceneMarkers ?? [],
          multiroute: event.multiroute ?? {},
          requiredItems: event.requiredItems ?? "",
          requiredDialogue: event.requiredDialogue ?? "",
          completionSignals: event.completionSignals ?? "",
          progress: `${ledger.beat}/${ledger.beatTotal}`,
          eventTurns: ledger.eventTurns,
          alternateBeatPolicy:
            "현재 상태가 원래 연출과 맞지 않으면 when 조건과 priority를 확인해 alternateBeats 중 하나를 선택한다. narrativeGoal과 requiredSignals를 실제 장면에 성립시키되 preservePlayerChoice=true인 선택은 취소하지 않는다.",
          sceneMarkerPolicy:
            "sceneMarkers는 작성자가 정한 관측 표식이다. 표식의 label과 phase에 해당하는 사실이 본문에 실제로 나타난 경우에만 사건 진행 근거로 사용한다.",
        }
      : null,
    currentBeat: beat
      ? {
          number: ledger.beat + 1,
          total: ledger.beatTotal,
          id: beat.id,
          title: beat.title,
          viewpoint: beat.viewpoint ?? "",
          content: beat.content,
          requiredSignals: beat.requiredSignals ?? "",
          policy: "이번 비트 하나만 쓴다. 다음 비트와 다음 사건을 미리 쓰지 않는다.",
        }
      : null,
    constraints: applicableConstraints(pack, event?.id ?? "").map((constraint) => ({
      id: constraint.id,
      name: constraint.name,
      appliesTo: constraint.appliesTo ?? [],
      rules: constraint.rules?.length
        ? constraint.rules
        : [constraint.conditions, constraint.description].filter(Boolean),
      policy: "사건이 아니라 장면 내내 지킬 규칙이며 완료·봉인 대상이 아니다.",
    })),
    sealedEvents: ledger.sealed.slice(-32),
    unresolvedThreads: ledger.openQuestions,
    transitionResume: ledger.resume,
    manualCarryover: ledger.manualCarryover
      ? {
          origin: ledger.manualCarryover.origin,
          sourceEventId: ledger.manualCarryover.sourceEventId,
          sourceEventName: ledger.manualCarryover.sourceEventName,
          missing: ledger.manualCarryover.missing,
          ageTurns: Math.max(
            ledger.manualCarryover.ageTurns,
            state.turn - ledger.manualCarryover.createdTurn,
          ),
          items: ledger.manualCarryover.items,
          createdAt: `${ledger.manualCarryover.createdTurn}턴 · ${ledger.manualCarryover.createdTime} · ${ledger.manualCarryover.createdLocation}`,
          policy: `${ledger.manualCarryover.origin === "automatic_rejection" ? "직전 사건의 종결 요청이 한 번 거부되어 자동 이월됐다." : "사용자가 직전 사건을 직접 종결해 남은 일이 이월됐다."} 직전 사건을 재개하거나 회상으로 때우지 않는다. 현재 활성 사건의 장소·인물·갈등 안에서 지연 도착, 뒤늦은 전달, 후속 연락, 남은 대사, 현장 결과처럼 자연스러운 인과로 이 조건을 실제 성립시킨다. 각 조건은 이번 턴 본문에서 직접 확인된 근거로 개별 해소하며, 서로 다른 턴의 문장 조각을 합쳐 충족시키지 않는다.`,
        }
      : null,
    closurePressure: {
      active: forceClosureThisTurn,
      eventId: forceClosureThisTurn ? event?.id ?? "" : "",
      eventName: forceClosureThisTurn ? event?.name ?? "" : "",
      trigger: forceClosureThisTurn
        ? `${ledger.closureExtensionCount >= 2 ? "최종 강제 종결 턴" : ledger.closureExtensionCount > 0 ? "임시 종결 비트" : "저장 원장의 마지막 비트"}가 활성 상태임 (${ledger.beat + 1}/${ledger.beatTotal})`
        : "none",
      policy: forceClosureThisTurn
        ? "이번 응답은 현재 사건의 종결 전용 턴이다. 짧게 끝내지 말고 필요한 대화와 반응을 모두 이어 쓴다. 플레이어의 새 행동을 대신 만들지 말고 사용자 입력을 먼저 반영한 뒤 NPC의 결단·퇴각·체포·전달·확인, 환경 변화, 물리적 결과로 남은 완료 신호와 필수 결과를 직접 발생시킨다. 본문에 종결 근거를 쓴 뒤 beatAdvanced=true와 eventResolved=true로 제출한다. 다음 사건은 같은 응답에서 시작하지 않는다."
        : "마지막 비트 이후의 다음 턴에만 강제 종결한다.",
    },
    pressure,
    derailment: {
      active: explicitDerailment,
      recoveryStage: explicitDerailment ? "immediate_absorb" : "none",
      driftTurnsBefore: ledger.driftTurns,
      destinationHint: turnIntent.destinationHint,
      requestedEndTime: turnIntent.requestedEndTime,
      requestedMinimumMinutes: turnIntent.requestedMinimumMinutes,
      policy: explicitDerailment
        ? ledger.closureExtensionCount > 0
          ? "종결 전용 연장 비트에서는 이탈 목적을 실행 완료하지 않는다. 사용자가 피시방 밤샘·장거리 이동·회피를 선언해도 그 욕구와 이유를 먼저 인정한 뒤, 현재 인물의 양심·책임·관계·상대의 설득·부상·시간 압박으로 스스로 마음을 돌리는 과정을 장면화한다. 단순히 입력을 삭제하거나 시스템 힘으로 막지 말고, 인물이 지금 해야 할 정사 행동을 납득 가능하게 선택하여 활성 사건의 필수 대사·결과·완료 신호를 모두 성립시키고 종결한다."
          : "필수 사건의 장소·시간을 벗어나는 계획도 사용자의 목적과 자율성으로 보존한다. 같은 턴 안에서 목적지와 시간 계획을 명시하고 경로 확인·준비·출발·부분 이동 중 가능한 첫 행동을 실제 반영한다. 이동을 완성할 수 있으면 원인·경로·수단·경과 시간·도착을 모두 쓴다. 현재 비트와의 인과상 이동이 어렵다면 실제로 출발을 시도한 뒤 인물의 판단·상대 반응·교통·날씨·연락·현재 사건 같은 구체적인 이유로 멈추거나 돌아오게 하고 현재 장소에서 사건을 계속한다. 필수 사건은 현재 동선에 외부 연락·마감·우연한 조우·환경 방해·안전상 우회로 끼어들게 하며, '생각을 접었다' 한 문장만으로 전환하면 실패다. 활성 필수 사건의 실제 행동·결과·필수 물품 획득까지 서술하고, 가능하면 현재 비트 안에서 종결한다. 아직 실행되지 않은 밤샘·다음 날 시각은 월드 시간에 반영하지 않는다. 현재 사건의 계약이 본문과 상태 패치에 실제 성립한 경우에만 eventResolved=true로 둔다. 기본은 현재 사건에서 멈추되 후속 사건까지 자연스럽게 전개했다면 중간 사건을 생략하지 않고 모든 필수 계약을 순서대로 실제 장면에 성립시킨다."
        : "일반 턴에는 미래 사건 내용과 동반 봉인을 허용하지 않는다.",
    },
    outputContract: {
      field: "claudeSignals",
      inputMode: "advance | digress | overreach",
      sceneTime: "statePatch.time과 동일한 HH:MM",
      location: "statePatch.location과 동일",
      appearing: "이번 장면에 물리적으로 존재한 인물 ID",
      firstAppearance: "처음 모습을 드러낸 인물 ID",
      mentioned: "언급·회상·전화만 나온 인물 ID",
      openQuestions: "새 미해결 의문",
      resolvedQuestions: "해결된 기존 의문의 정확한 문구",
      beatAdvanced: "현재 비트가 본문에서 실제 성립했을 때만 true",
      eventResolved: "활성 사건의 필수 계약과 종결 신호가 실제 성립했을 때만 true",
      resolutionSummary: "종결 시 사건 탭에 그대로 공개할 서사형 종결 사유 1~2문장. 누가 무엇을 마쳤고 어떤 상태·선택지가 남아 장면이 닫혔는지 구체적으로 쓴다. 사건·비트·조건·계약·봉인·시스템 같은 엔진 용어는 금지한다. 미종결이면 빈 문자열",
      autoAction: "이어서 진행에서만 NPC·환경이 만든 진행을 한 문장으로",
    },
    hardRules: [
      ...(forceClosureThisTurn
        ? ["마지막 비트에서는 분량 제한보다 종결 인과를 우선한다. 필요한 대화·확인·이동 제안·인계를 한 장면 안에 충분히 이어 써 현재 사건을 종결한다. 그래도 필수 결과가 남으면 사건을 버리지 않고 임시 종결 비트를 추가하며, 거기서도 남으면 최종 강제 종결 턴 하나를 더 추가한다."]
        : ["마지막 비트 전에는 사건 결과를 수렴하거나 종결하지 않는다. 현재 장면의 플레이어 선택·대화·탐색·관계 변화를 자유롭게 전개한다."]),
      ...(ledger.manualCarryover?.missing.length
        ? ["직전 사건의 이월 조건을 현재 사건의 진행에 개연성 있게 합쳐 실제로 성립시키되, 엔진 용어·이월·미완료 조건이라는 표현은 본문에 쓰지 않는다. 이월 때문에 현재 사건의 완료와 다음 사건 진행을 막지 않는다."]
        : []),
      ...(ledger.closureExtensionCount > 0
        ? ["추가된 종결 전용 비트에서는 플레이어의 이탈 욕구를 인물의 내적·외적 동기로 정사에 강제 흡수하고, 현재 사건을 반드시 종결한다."]
        : []),
      "활성 사건 안에서만 전개한다.",
      "봉인 사건은 회상만 허용하고 재개하지 않는다.",
      "일반 턴에서 미래 사건이 섞이면 전체 응답을 재작성한다.",
      "eventResolved는 모델의 결정이 아니라 서버가 검증할 요청 신호일 뿐이다.",
      "재작성 실패 시 응답 전체를 버리지 않는다. 사용자 입력을 반영한 안전한 문장과 상태 변화는 보존하고, 위반 구간만 현재 사건의 인과로 다시 잇는다.",
      "사건 체류 횟수만으로 자동 봉인하지 않는다.",
      "시각과 장소는 본문·claudeSignals·statePatch가 서로 일치해야 한다.",
      `현재 상태는 ${state.date} ${state.time}, ${state.location}이다.`,
    ],
  };
};

export const claudeSignalViolations = ({
  turn,
  activeEvent,
  ledger,
  expectedDerailment,
  knownCharacterIds,
}: {
  turn: {
    claudeSignals?: ClaudeTurnSignals;
    statePatch?: { time?: string; location?: string };
    chronologyConflict?: string;
  };
  activeEvent?: ScenarioEvent;
  ledger: ClaudeRuntimeLedger;
  expectedDerailment: boolean;
  knownCharacterIds?: ReadonlySet<string>;
}): string[] => {
  const signal = turn.claudeSignals;
  if (!signal) return ["claudeSignals 누락"];
  const violations: string[] = [];
  if (!["advance", "digress", "overreach"].includes(signal.inputMode)) {
    violations.push("inputMode 계약 위반");
  }
  if (signal.sceneTime !== turn.statePatch?.time) {
    violations.push("sceneTime과 statePatch.time 불일치");
  }
  if (compact(signal.location) !== compact(turn.statePatch?.location ?? "")) {
    violations.push("location과 statePatch.location 불일치");
  }
  if (turn.chronologyConflict) {
    violations.push(`본문 시간 원장 충돌: ${turn.chronologyConflict}`);
  }
  if (expectedDerailment && activeEvent?.required && signal.inputMode !== "advance") {
    violations.push("즉시 정사 흡수 턴 inputMode 오판");
  }
  if (activeEvent?.kind === "compound" && activeEvent.beats?.length) {
    const lastBeat = ledger.beat >= activeEvent.beats.length - 1;
    if (signal.eventResolved && !lastBeat) {
      violations.push("Compound 마지막 비트 전 eventResolved");
    }
  }
  if (!signal.eventResolved && signal.resolutionSummary.trim()) {
    violations.push("미종결 턴에 resolutionSummary 출력");
  }
  if (knownCharacterIds) {
    const unknown = [
      ...signal.appearing,
      ...signal.firstAppearance,
      ...signal.mentioned,
    ].filter((id) => !knownCharacterIds.has(id));
    if (unknown.length) violations.push(`등록되지 않은 인물 ID: ${[...new Set(unknown)].join(", ")}`);
  }
  if (signal.firstAppearance.some((id) => !signal.appearing.includes(id))) {
    violations.push("firstAppearance가 appearing에 포함되지 않음");
  }
  if (signal.mentioned.some((id) => signal.appearing.includes(id))) {
    violations.push("물리적 등장 인물을 mentioned로 중복 기록");
  }
  return violations;
};

const currentBeatSatisfied = (
  event: ScenarioEvent,
  beatIndex: number,
  text: string,
) => {
  if (event.kind !== "compound" || !event.beats?.length) return true;
  const beat = [...event.beats].sort((left, right) => left.order - right.order)[
    Math.min(beatIndex, event.beats.length - 1)
  ];
  return missingContractSignals(beat.requiredSignals, text).length === 0;
};

function nextUnsealedEvent(
  pack: ScenarioPack,
  ledger: ClaudeRuntimeLedger,
  current?: ScenarioEvent,
) {
  const sealed = new Set([
    ...ledger.sealed.map((event) => event.id),
    ...ledger.cancelled,
  ]);
  const ordered = orderedClaudeEvents(pack).filter((event) => !sealed.has(event.id));
  const required = ordered.find((event) => event.required && event.id !== current?.id);
  if (required) return required;
  const currentSequence = current ? eventSequence(current) : 0;
  return ordered.find(
    (event) => event.id !== current?.id && eventSequence(event) > currentSequence,
  ) ?? ordered.find((event) => event.id !== current?.id);
}

function openClaudeEvent(
  ledger: ClaudeRuntimeLedger,
  event?: ScenarioEvent,
) {
  if (!event) {
    ledger.activeEventId = "";
    ledger.beat = 0;
    ledger.beatTotal = 0;
    return;
  }
  const sequence = eventSequence(event);
  ledger.backfill = sequence < ledger.maxSequence;
  ledger.maxSequence = Math.max(ledger.maxSequence, sequence);
  ledger.activeEventId = event.id;
  ledger.beat = 0;
  ledger.beatTotal = ledger.backfill ? 2 : claudeBeatTotalFor(event);
  ledger.stallTurns = 0;
  ledger.eventTurns = 0;
  ledger.overdueTurns = 0;
  ledger.eventText = "";
  ledger.mustHolds = 0;
  ledger.mustPending = [];
  ledger.closureExtensionCount = 0;
  ledger.driftTurns = 0;
}

function sealClaudeEvent(
  ledger: ClaudeRuntimeLedger,
  event: ScenarioEvent,
  summary: string,
  options: {
    status?: ClaudeSealedEvent["status"];
    missing?: string[];
    closureReason?: string;
    turn?: number;
    time?: string;
    location?: string;
  } = {},
) {
  if (ledger.sealed.some((entry) => entry.id === event.id)) return;
  ledger.sealed.push({
    id: event.id,
    name: event.name,
    summary: clip(summary || event.onSuccess || event.effects || event.description, 220),
    status: options.status ?? "sealed",
    missing: options.missing?.filter(Boolean),
    closureReason: clip(
      options.closureReason || summary || event.onSuccess || event.effects || event.description,
      260,
    ),
    closedAtTurn: options.turn,
    closedAtTime: options.time,
    closedAtLocation: options.location,
  });
}

function createClaudeCarryover(
  ledger: ClaudeRuntimeLedger,
  event: ScenarioEvent,
  missing: string[],
  options: {
    origin: ClaudeManualCarryover["origin"];
    observedText: string;
    turn: number;
    time: string;
    location: string;
  },
) {
  ledger.manualCarryover = {
    origin: options.origin,
    sourceEventId: event.id,
    sourceEventName: event.name,
    initialMissing: [...missing],
    missing: [...missing],
    items: missing.map((requirement, index) => ({
      id: `${event.id}-carryover-${index + 1}`,
      requirement,
      status: "pending",
    })),
    ageTurns: 0,
    observedText: options.observedText.slice(-8000),
    createdTurn: options.turn,
    createdTime: options.time,
    createdLocation: options.location,
  };
}

function abandonClaudeCarryover(
  ledger: ClaudeRuntimeLedger,
  options: {
    turn: number;
    time: string;
    location: string;
    reason: string;
  },
) {
  const carryover = ledger.manualCarryover;
  if (!carryover) return;
  const items = carryover.items.map((item) => item.status === "pending"
    ? {
        ...item,
        status: "abandoned" as const,
        resolvedTurn: options.turn,
        evidence: "",
        resolutionSummary: `${options.reason} 이 결과는 실제로 일어나지 않았으며 이후 일어난 사실처럼 참조하지 않는다.`,
      }
    : item);
  const sealedSource = ledger.sealed.find(
    (entry) => entry.id === carryover.sourceEventId,
  );
  if (sealedSource) {
    sealedSource.missing = [];
    sealedSource.carryoverItems = items;
    sealedSource.carryoverResolution = `${options.reason} 남은 조건은 현재 세계선에서 성립하지 않은 것으로 확정했으며, 이후 일어난 사실처럼 참조하지 않는다.`;
    sealedSource.carryoverResolvedAtTurn = options.turn;
    sealedSource.carryoverResolvedAtTime = options.time;
    sealedSource.carryoverResolvedAtLocation = options.location;
  }
  ledger.manualCarryover = null;
}

const stateWithClaudeRuntime = (
  state: RuntimeState,
  ledger: ClaudeRuntimeLedger,
): RuntimeState => {
  const stored = claudeRuntimeVariable(ledger);
  const existing = (state.variables ?? []).find(
    (variable) => variable.id === CLAUDE_RUNTIME_VARIABLE_ID,
  );
  const nextVariable: NarrativeVariable = {
    ...stored,
    status: "active",
    createdTurn: existing?.createdTurn ?? state.turn,
  };
  return {
    ...state,
    variables: [
      ...(state.variables ?? []).filter(
        (variable) => variable.id !== CLAUDE_RUNTIME_VARIABLE_ID,
      ),
      nextVariable,
    ],
  };
};

/** Advances only the authoritative event cursor. It never invents prose or
 * consumes an API call, and it deliberately stops at the final open beat so
 * closing the event remains an explicit separate decision. */
export const advanceClaudeBeatManually = (
  pack: ScenarioPack,
  state: RuntimeState,
): ClaudeManualEventAction => {
  const ledger: ClaudeRuntimeLedger = JSON.parse(JSON.stringify(
    readClaudeRuntime(pack, state),
  ));
  const event = pack.events.find((candidate) => candidate.id === ledger.activeEventId);
  if (!event) {
    return { state, changed: false, message: "진행 중인 활성 사건이 없습니다." };
  }
  const finalOpenBeat = Math.max(0, ledger.beatTotal - 1);
  if (ledger.beat >= finalOpenBeat) {
    return {
      state,
      changed: false,
      message: "이미 마지막 비트입니다. 사건을 닫으려면 ‘지금 종결’을 눌러 주세요.",
    };
  }
  const before = ledger.beat + 1;
  ledger.beat += 1;
  ledger.stallTurns = 0;
  ledger.overdueTurns = 0;
  ledger.lastAdjudication = `사용자 수동 비트 전진 ${before}/${ledger.beatTotal} → ${ledger.beat + 1}/${ledger.beatTotal}`;
  return {
    state: stateWithClaudeRuntime(state, ledger),
    changed: true,
    message: `${event.name} · 비트를 ${before}/${ledger.beatTotal}에서 ${ledger.beat + 1}/${ledger.beatTotal}(으)로 이동했습니다.`,
  };
};

/** Immediately closes the active event by explicit user authority. Missing
 * canonical contracts are retained in the sealed ledger rather than silently
 * erased, so the inspector can explain exactly what was bypassed. */
export const closeClaudeEventManually = (
  pack: ScenarioPack,
  state: RuntimeState,
): ClaudeManualEventAction => {
  const ledger: ClaudeRuntimeLedger = JSON.parse(JSON.stringify(
    readClaudeRuntime(pack, state),
  ));
  const event = pack.events.find((candidate) => candidate.id === ledger.activeEventId);
  if (!event) {
    return { state, changed: false, message: "종결할 활성 사건이 없습니다." };
  }
  if (ledger.manualCloseCooldownEventId === event.id) {
    return {
      state,
      changed: false,
      message: "‘지금 종결’은 두 사건 연속 사용할 수 없습니다. 이 사건은 본문 진행으로 종결해 주세요.",
    };
  }
  if (ledger.manualCarryover?.missing.length) {
    return {
      state,
      changed: false,
      message: `이전 사건의 이월 조건을 먼저 본문에서 성립시켜야 합니다: ${ledger.manualCarryover.missing.join(" · ")}`,
    };
  }
  const missing = missingClaudeContract(event, ledger.eventText, state.inventory);
  const sceneResult = substantiveClosure(state.sceneSummary);
  const authoredResult = authoredEventClosure(event);
  const resultSummary = sceneResult || authoredResult ||
    `${withTopicParticle(pack.player.name)} ${event.name}에서 지금까지 확인한 사실을 바탕으로 다음 행동을 정했다.`;
  const closureReason = missing.length
    ? `${resultSummary} 다만 ${naturalContractList(missing)}에 관한 일은 아직 끝나지 않아, 뒤이어 벌어질 상황 속에서 그 결과를 직접 확인하기로 했다.`
    : `${resultSummary} 필요한 결과가 모두 눈앞에 남았고, 이제 인물들은 그 결과를 안고 다음 선택으로 나아갈 수 있게 됐다.`;
  sealClaudeEvent(ledger, event, resultSummary, {
    status: "manually_closed",
    missing,
    closureReason,
    turn: state.turn,
    time: state.time,
    location: state.location,
  });
  const closedEvent = ledger.sealed.find((entry) => entry.id === event.id);
  if (missing.length) {
    createClaudeCarryover(ledger, event, missing, {
      origin: "manual",
      observedText: ledger.eventText,
      turn: state.turn,
      time: state.time,
      location: state.location,
    });
  } else {
    ledger.manualCarryover = null;
  }
  openClaudeEvent(ledger, nextUnsealedEvent(pack, ledger, event));
  ledger.manualCloseCooldownEventId = ledger.activeEventId;
  ledger.resume = null;
  ledger.lastAdjudication = `사용자 직접 종결 · ${event.name}`;
  return {
    state: stateWithClaudeRuntime(state, ledger),
    changed: true,
    closedEvent,
    message: `${event.name}을 직접 종결하고 봉인 장부로 이동했습니다.`,
  };
};

export const adjudicateClaudeTurn = ({
  pack,
  state,
  ledger: currentLedger,
  signals,
  publicText,
  userInput,
  canonicalAdvance,
  inventoryAfter,
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  ledger: ClaudeRuntimeLedger;
  signals: ClaudeTurnSignals;
  publicText: string;
  userInput: string;
  canonicalAdvance: boolean;
  inventoryAfter: string[];
}): ClaudeTurnAdjudication => {
  const ledger: ClaudeRuntimeLedger = JSON.parse(JSON.stringify(currentLedger));
  const event = pack.events.find((candidate) => candidate.id === ledger.activeEventId);
  if (!event) {
    ledger.lastAdjudication = "남은 활성 사건 없음";
    return {
      ledger,
      explicitDerailmentTurn: false,
      completedEventIds: [],
      beatAdvanced: false,
      eventCompleted: false,
      eventCarriedOver: false,
      closureBeatExtended: false,
      completionRejected: false,
      missingCurrentContract: [],
      reason: ledger.lastAdjudication,
    };
  }
  const explicitDerailmentTurn = !canonicalAdvance &&
    deriveClaudeTurnIntent(userInput, event, state.time, ledger.backfill)
      .explicitDerailment;
  const forcedClosureTurn = claudeClosurePressureActive(event, currentLedger);
  if (ledger.eventTurns >= 1) ledger.resume = null;
  const priorEventText = ledger.eventText;
  ledger.eventText = `${priorEventText}\n${publicText}`.slice(-8000);
  ledger.eventTurns += 1;
  ledger.lastInputMode = signals.inputMode;
  if (ledger.manualCarryover) {
    const carryover = ledger.manualCarryover;
    const sourceEvent = pack.events.find(
      (candidate) => candidate.id === carryover.sourceEventId,
    );
    const ageTurns = Math.max(
      carryover.ageTurns + 1,
      state.turn + 1 - carryover.createdTurn,
    );
    const currentTurnMissing = sourceEvent
      ? missingClaudeContract(sourceEvent, publicText, inventoryAfter)
      : [...carryover.missing];
    const items = (carryover.items.length
      ? carryover.items
      : carryover.initialMissing.map((requirement, index) => ({
          id: `${carryover.sourceEventId}-carryover-${index + 1}`,
          requirement,
          status: carryover.missing.includes(requirement)
            ? "pending" as const
            : "resolved" as const,
        }))).map((item) => {
          if (item.status !== "pending" || currentTurnMissing.includes(item.requirement)) {
            return item;
          }
          return {
            ...item,
            status: "resolved" as const,
            resolvedTurn: state.turn + 1,
            evidence: clip(publicText, 600),
            resolutionSummary: `${event.name}의 현재 장면에서 ${item.requirement}에 해당하는 결과가 직접 확인됐다.`,
          };
        });
    const remaining = items
      .filter((item) => item.status === "pending")
      .map((item) => item.requirement);
    const sealedSource = ledger.sealed.find(
      (entry) => entry.id === carryover.sourceEventId,
    );
    if (!sourceEvent || (remaining.length && ageTurns >= CLAUDE_CARRYOVER_LIMIT)) {
      ledger.manualCarryover = {
        ...carryover,
        ageTurns,
        observedText: publicText.slice(-8000),
        items,
        missing: remaining,
      };
      abandonClaudeCarryover(ledger, {
        turn: state.turn + 1,
        time: signals.sceneTime,
        location: signals.location,
        reason: sourceEvent
          ? `이월 한계 ${CLAUDE_CARRYOVER_LIMIT}턴 안에 직접 성립하지 못했다.`
          : "패키지에서 원본 사건이 제거됐다.",
      });
    } else if (remaining.length) {
      if (sealedSource) {
        sealedSource.missing = [...remaining];
        sealedSource.carryoverItems = items;
      }
      ledger.manualCarryover = {
        ...carryover,
        ageTurns,
        observedText: publicText.slice(-8000),
        items,
        missing: remaining,
      };
    } else {
      if (sealedSource) {
        sealedSource.missing = [];
        sealedSource.carryoverItems = items;
        sealedSource.carryoverResolution = `${event.name}에서 ${naturalContractList(
          items.filter((item) => item.status === "resolved").map((item) => item.requirement),
        )}이 차례로 실제 확인되면서, 앞서 남겨 두었던 일도 현재 세계선의 인과 안에서 마무리됐다.`;
        sealedSource.carryoverResolvedAtTurn = state.turn + 1;
        sealedSource.carryoverResolvedAtTime = signals.sceneTime;
        sealedSource.carryoverResolvedAtLocation = signals.location;
      }
      ledger.manualCarryover = null;
    }
  }
  ledger.openQuestions = [
    ...ledger.openQuestions.filter(
      (question) => !signals.resolvedQuestions.some(
        (resolved) => compact(question).includes(compact(resolved)) || compact(resolved).includes(compact(question)),
      ),
    ),
    ...signals.openQuestions,
  ].filter((question, index, list) =>
    question.trim() && list.findIndex((candidate) => compact(candidate) === compact(question)) === index
  ).slice(-12);

  const beatSatisfied = currentBeatSatisfied(event, ledger.beat, publicText);
  const requestedBeatAdvance = !forcedClosureTurn ||
    signals.beatAdvanced || signals.eventResolved;
  // A beat cursor may never outrun its authored evidence. The prose is still
  // accepted on early beats, but the same beat remains active until its
  // required signal is actually visible.
  const mayAdvanceBeat = requestedBeatAdvance && beatSatisfied;
  if (mayAdvanceBeat) {
    ledger.beat = Math.min(ledger.beatTotal, ledger.beat + 1);
    ledger.stallTurns = 0;
  } else {
    ledger.stallTurns += 1;
  }
  ledger.driftTurns = mayAdvanceBeat || signals.inputMode === "advance"
    ? 0
    : ledger.driftTurns + 1;
  ledger.overdueTurns = ledger.eventTurns >= ledger.beatTotal + 3
    ? ledger.overdueTurns + 1
    : 0;

  const missingCurrentContract = missingClaudeContract(
    event,
    ledger.eventText,
    inventoryAfter,
  );
  if (forcedClosureTurn) {
    missingCurrentContract.push(...missingClaudeCurrentBeatContract(
      event,
      currentLedger.beat,
      publicText,
    ));
  }
  ledger.mustPending = missingCurrentContract;
  const compoundLastBeat = ledger.beat >= ledger.beatTotal;
  // The final beat first gets a larger scene budget. If its concrete contract
  // still remains incomplete, the event may receive a temporary closure beat
  // and one final forced-closure turn instead of discarding usable prose.
  const completionRequested = forcedClosureTurn;
  const completionAllowed = completionRequested &&
    missingCurrentContract.length === 0 &&
    compoundLastBeat;
  const closureBeatExtensionAllowed = completionRequested &&
    !completionAllowed &&
    forcedClosureTurn &&
    missingCurrentContract.length > 0 &&
    ledger.closureExtensionCount < 2;
  if (completionRequested && !completionAllowed) ledger.mustHolds += 1;

  const completedEventIds: string[] = [];
  let stoppedAtEventId: string | undefined;
  const eventCarriedOver = false;
  let closureBeatExtended = false;
  if (completionAllowed) {
    const releasesManualCloseCooldown =
      ledger.manualCloseCooldownEventId === event.id;
    const closureReason = authoredEventClosure(event, signals.resolutionSummary) ||
      `${withTopicParticle(pack.player.name)} ${event.name}에서 해야 할 일을 마치고, 그 결과를 안은 채 다음 선택으로 나아갈 수 있게 됐다.`;
    sealClaudeEvent(ledger, event, closureReason, {
      closureReason,
      turn: state.turn + 1,
      time: signals.sceneTime,
      location: signals.location,
    });
    completedEventIds.push(event.id);

    // Claude syncTarget/fastForward port: only an explicit derailment turn may
    // co-seal, and only after the current event contract has passed. Every
    // later event is checked in strict order and scanning stops at the first
    // contract (or Compound beat) that is not visibly enacted.
    if (explicitDerailmentTurn) {
      const ordered = orderedClaudeEvents(pack);
      const startIndex = ordered.findIndex((candidate) => candidate.id === event.id);
      for (const candidate of ordered.slice(startIndex + 1)) {
        const prerequisites = unmetClaudePrerequisites(
          pack,
          ledger,
          candidate,
          state.turn + 1,
        );
        const missing = missingClaudeContract(candidate, publicText, inventoryAfter);
        const compoundBeatsSatisfied = candidate.kind !== "compound" ||
          !candidate.beats?.length ||
          [...candidate.beats]
            .sort((left, right) => left.order - right.order)
            .every((_, beatIndex) => currentBeatSatisfied(candidate, beatIndex, publicText));
        if (prerequisites.length || missing.length || !compoundBeatsSatisfied) {
          stoppedAtEventId = candidate.id;
          break;
        }
        sealClaudeEvent(ledger, candidate, candidate.onSuccess || candidate.effects || publicText, {
          closureReason: candidate.onSuccess || candidate.effects || candidate.description || publicText,
          turn: state.turn + 1,
          time: signals.sceneTime,
          location: signals.location,
        });
        completedEventIds.push(candidate.id);
      }
    }
    const completedNames = completedEventIds
      .map((id) => pack.events.find((candidate) => candidate.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    const lastCompleted = pack.events.find(
      (candidate) => candidate.id === completedEventIds.at(-1),
    ) ?? event;
    openClaudeEvent(ledger, nextUnsealedEvent(pack, ledger, lastCompleted));
    if (releasesManualCloseCooldown) {
      ledger.manualCloseCooldownEventId = "";
    }
    ledger.resume = {
      events: completedNames.slice(-3),
      at: signals.sceneTime,
      location: signals.location,
      tail: publicText.slice(-420),
    };
  } else if (closureBeatExtensionAllowed) {
    ledger.closureExtensionCount = Math.min(2, ledger.closureExtensionCount + 1);
    ledger.beatTotal += 1;
    ledger.beat = Math.max(0, ledger.beatTotal - 1);
    ledger.stallTurns = 0;
    ledger.overdueTurns = 0;
    closureBeatExtended = true;
  }

  const reason = completionAllowed
    ? completedEventIds.length > 1
      ? `현재 사건 계약 확인 후 ${completedEventIds.length}개 사건을 순서대로 봉인`
      : "활성 사건의 실제 계약과 종결 신호를 확인해 봉인"
    : closureBeatExtended
      ? ledger.closureExtensionCount >= 2
        ? `임시 종결 비트 뒤에도 남은 결과가 있어 최종 강제 종결 턴 1개 추가: ${missingCurrentContract.join(" / ")}`
        : `종결 본문 확장 뒤에도 남은 결과가 있어 임시 종결 비트 1개 추가: ${missingCurrentContract.join(" / ")}`
    : completionRequested
      ? `종결 요청 거부: ${[
          ...missingCurrentContract,
          ...(ledger.manualCarryover?.missing.map((item) => `이월 조건 ${item}`) ?? []),
        ].join(" / ") || "Compound 마지막 비트 미도달"}`
      : mayAdvanceBeat
        ? "현재 비트만 전진"
        : "현재 사건 유지";
  ledger.lastAdjudication = reason;
  return {
    ledger,
    activeEventBefore: event,
    activeEventAfter: pack.events.find(
      (candidate) => candidate.id === ledger.activeEventId,
    ),
    explicitDerailmentTurn,
    completedEventIds,
    beatAdvanced: mayAdvanceBeat || closureBeatExtended,
    eventCompleted: completionAllowed && completedEventIds.includes(event.id),
    eventCarriedOver,
    closureBeatExtended,
    completionRejected: completionRequested && !completionAllowed,
    missingCurrentContract,
    stoppedAtEventId,
    reason,
  };
};
