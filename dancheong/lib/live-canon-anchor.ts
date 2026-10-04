import { contractSignalSatisfied } from "./contract-signals";
import {
  eventWindowClocks,
  explicitDurationMinutes,
  minutesUntilEventDeadline,
  requestedTimeExceedsEventDeadline,
  strictClockMinutes,
} from "./event-time-guard";

export type LiveCanonAnchorGuard = {
  active: boolean;
  currentTime: string;
  currentLocation: string;
  eventTimeWindow: string;
  eventLocation: string;
  longSpan: boolean;
  restrictLocation: boolean;
  highRiskTravel: boolean;
  destinationHint: string;
  requestedEndTime: string;
  requestedMinimumMinutes: number | null;
  strictEventTime?: boolean;
  canonAbsorptionRequired?: boolean;
  eventName?: string;
  currentBeatSignals?: string[];
  /** Original long-span request retained for audit, never for corrected prose validation. */
  deferredRequestedEndTime?: string;
  /** Server-issued end clock for the executable interruption contract. */
  effectiveEndTime?: string;
  nextBeatSignals?: string[];
  nextEventName?: string;
};

export const rebaseLiveCanonAnchorGuard = (
  guard: LiveCanonAnchorGuard | undefined,
  effectiveEndTime: string,
  requireCanonEvidence = true,
): LiveCanonAnchorGuard | undefined => guard ? {
  ...guard,
  longSpan: false,
  requestedEndTime: effectiveEndTime,
  requestedMinimumMinutes: null,
  deferredRequestedEndTime: guard.deferredRequestedEndTime || guard.requestedEndTime,
  effectiveEndTime,
  canonAbsorptionRequired: requireCanonEvidence && Boolean(guard.currentBeatSignals?.length),
} : undefined;

const compact = (value: string): string =>
  value.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

const LONG_ELAPSED_PATTERN =
  /(?:(?:\d+|한|두|세|네|몇|수)\s*(?:년|개월|달|주(?:일)?|일)\s*(?:동안|간|뒤|후|째|을|를)?|수년|수개월|수주|며칠|다음\s*날|이튿날).{0,48}(?:지났|흘렀|보냈|살았|생활(?:을)?\s*(?:하였|했)|머물렀|틀어박혀|계속됐|이어졌|끝났|끝에|되었|됐다|맞았)/u;
const LONG_ELAPSED_REVERSED_PATTERN =
  /(?:지나|흘러|보내|살아|생활|머물|틀어박|계속|이어).{0,36}(?:(?:\d+|한|두|세|네|몇|수)\s*(?:년|개월|달|주(?:일)?|일)|수년|수개월|수주|며칠)/u;
const INVENTED_TIME_TRANSITION_PATTERN =
  /(?:그렇게|그로부터|그\s*뒤|그\s*후|이후|시간이).{0,28}(?:(?:\d+|한|두|세|네|몇|수)\s*(?:년|개월|달|주(?:일)?|일)|수년|수개월|수주|며칠)/u;
const ARRIVAL_PATTERN =
  /(?:도착(?:했|하|해|한)|들어섰|도달했|자리를\s*잡았|틀어박혔|머물렀|밤을\s*보냈|생활을\s*시작했)/u;
const HIGH_RISK_TRAVEL_PATTERN =
  /(?:비행기|항공(?:권|편)|공항|출국|입국|국경|해외|외국|대륙|KTX|고속\s*열차|기차표|고속버스|여객선|배편|수백\s*(?:킬로미터|km)|순간\s*이동|텔레포트|워프)/iu;
const LOCAL_REACHABILITY_PATTERN =
  /(?:같은\s*(?:건물|층|구역|동네)|건물\s*(?:안|내|앞|뒤|옆)|교내|학교\s*(?:안|내|앞|뒤|정문|후문)|캠퍼스|강의실|복도|계단|로비|현관|마당|골목|근처|인근|주변|맞은편|건너편|도보|걸어서\s*\d{1,2}\s*분|\d{1,2}\s*분\s*거리)/iu;
const IMMEDIATE_COMPLETION_PATTERN =
  /(?:즉시|곧바로|순식간에|눈\s*깜짝할\s*사이).{0,64}(?:도착|출국|입국|건너갔|이동을\s*마쳤)/u;
const DAY_TRANSITION_PATTERN =
  /(?:다음\s*날|다음날|이튿날|날이\s*밝|아침이\s*밝|하룻밤(?:이|을)?\s*(?:지나|보내)|밤을\s*넘겨|\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*(?:새벽|아침|오전))/u;

const currentNarrativeDayPeriod = (text: string): { index: number; minutes: number } | undefined => {
  const candidates: Array<{ index: number; minutes: number }> = [];
  const minutesByPeriod = {
    새벽: 300, 아침: 480, 오전: 540, 정오: 720, 낮: 720,
    오후: 900, 저녁: 1140, 밤: 1320,
  } as Record<string, number>;
  for (const match of text.matchAll(
    /(?:시계(?:가|는)?|현재\s*시각(?:이|은)?|시간(?:이|은)?).{0,24}(새벽|아침|오전|정오|낮|오후|저녁|밤)(?:\s*무렵)?(?:을|를|이|가)?\s*(?:가리키|되|접어들|넘|향해)/gu,
  )) {
    candidates.push({ index: match.index ?? 0, minutes: minutesByPeriod[match[1]] });
  }
  for (const match of text.matchAll(
    /(?:창밖|창가\s*너머|바깥|캠퍼스|거리|보도|하늘).{0,36}(?:어두워졌|어두워진|어둠이\s*내렸|해가\s*(?:졌|기울))/gu,
  )) {
    candidates.push({ index: match.index ?? 0, minutes: minutesByPeriod.저녁 });
  }
  for (const match of text.matchAll(
    /(?:해가\s*기울(?:었|기\s*시작|어|자|\s*무렵)|해가\s*졌|석양이\s*(?:번지|내리)|노을이\s*(?:번지|깔리))/gu,
  )) {
    candidates.push({ index: match.index ?? 0, minutes: minutesByPeriod.저녁 });
  }
  for (const match of text.matchAll(
    /(?:저녁|밤)(?:이|가|의)?\s*(?:가까워(?:지|질)|다가오|접어들|시작되|흐름(?:으로)?\s*넘어(?:가|갔))/gu,
  )) {
    candidates.push({ index: match.index ?? 0, minutes: minutesByPeriod[match[0].includes("밤") ? "밤" : "저녁"] });
  }
  for (const match of text.matchAll(
    /(?:저녁\s*안내\s*방송|폐관\s*시간을?\s*알리|창가(?:의|에서)?\s*빛이?.{0,24}빠져나가|(?:책상\s*)?스탠드와?\s*천장등이?.{0,18}(?:차례로\s*)?켜졌)/gu,
  )) {
    candidates.push({ index: match.index ?? 0, minutes: minutesByPeriod.저녁 });
  }
  return candidates.sort((left, right) => left.index - right.index).at(-1);
};

const latestNarrativeClock = (text: string): number | undefined => {
  const candidates: Array<{ index: number; minutes: number }> = [];
  for (const match of text.matchAll(/(?:^|[.!?。！？\n]\s*)([01]?\d|2[0-3])[:：]([0-5]\d)/gu)) {
    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - 28), index + match[0].length + 28);
    if (/(?:예정|예약|마감\s*알림|수령\s*가능|발송\s*시각|기록\s*시각|알람|시간표)/u.test(context)) continue;
    candidates.push({ index, minutes: Number(match[1]) * 60 + Number(match[2]) });
  }
  for (const match of text.matchAll(/(오전|오후|밤|새벽)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/gu)) {
    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - 30), index + match[0].length + 32);
    if (/(?:예정|예약|마감\s*알림|수령\s*가능|발송\s*시각|기록\s*시각|알람|시간표|약속|까지\s*(?:가|오|도착|끝))/u.test(context)) continue;
    const after = text.slice(index + match[0].length, index + match[0].length + 16);
    const before = text.slice(Math.max(0, index - 16), index);
    const directlyAnchored = /(?:현재|지금|시각(?:은|이)?|시간(?:은|이)?|시계(?:는|가)?)\s*$/u.test(before);
    const relativeClockPhrase = /^(?:\s|,)*(?:무렵|쯤|경|정각|가?\s*(?:되|넘)|를?\s*(?:조금\s*)?(?:앞두|지나)|직전|,)/u.test(after);
    if (!/(?:^|[.!?。！？\n]\s*)$/u.test(before) && !directlyAnchored && !relativeClockPhrase) continue;
    let hour = Number(match[2]);
    if (match[1] === "오후" && hour < 12) hour += 12;
    if ((match[1] === "오전" || match[1] === "새벽") && hour === 12) hour = 0;
    if (match[1] === "밤" && hour >= 6 && hour < 12) hour += 12;
    if (hour <= 23) candidates.push({ index, minutes: hour * 60 + Number(match[3] ?? 0) });
  }
  for (const match of text.matchAll(/(?:^|[.!?。！？\n]\s*)(새벽|아침|오전|낮|오후|저녁|밤)(?:이|가)?\s*(?:되었|됐다|되자|깊어|밝)/gu)) {
    const period = ({ 새벽: 300, 아침: 480, 오전: 540, 낮: 720, 오후: 900, 저녁: 1140, 밤: 1320 } as Record<string, number>)[match[1]];
    candidates.push({ index: match.index ?? 0, minutes: period });
  }
  const currentDayPeriod = currentNarrativeDayPeriod(text);
  if (currentDayPeriod) candidates.push(currentDayPeriod);
  return candidates.sort((left, right) => left.index - right.index).at(-1)?.minutes;
};

const narrativeTimeExceedsWindow = (text: string, guard: LiveCanonAnchorGuard): boolean => {
  const current = strictClockMinutes(guard.currentTime);
  const remaining = minutesUntilEventDeadline(guard.eventTimeWindow, guard.currentTime);
  if (current === undefined || remaining === undefined) return false;
  const elapsed = explicitDurationMinutes(text);
  if (elapsed !== undefined && elapsed > remaining) return true;
  const narrativeClock = latestNarrativeClock(text);
  if (narrativeClock === undefined) return false;
  const delta = narrativeClock >= current
    ? narrativeClock - current
    : 1440 - current + narrativeClock;
  return delta > remaining;
};

/**
 * Keep ordinary scene movement autonomous. Only a clearly unreachable trip
 * gets the deterministic live rewind; ambiguous distances remain a prose
 * judgment inside the already-running writer rather than another preflight
 * model call.
 */
export const highRiskLiveTravelIntent = (input: string): boolean => {
  const normalized = input.normalize("NFKC");
  if (LOCAL_REACHABILITY_PATTERN.test(normalized) &&
      !HIGH_RISK_TRAVEL_PATTERN.test(normalized)) return false;
  return HIGH_RISK_TRAVEL_PATTERN.test(normalized) ||
    IMMEDIATE_COMPLETION_PATTERN.test(normalized);
};

export const liveCanonAnchorDriftReason = (
  text: string,
  guard?: LiveCanonAnchorGuard,
): string | undefined => {
  if (!guard?.active) return undefined;
  const normalized = text.normalize("NFKC");
  const currentBeatSignals = guard.currentBeatSignals ?? [];
  const canonEvidenceVisible = currentBeatSignals.length > 0 &&
    currentBeatSignals.some((signal) => contractSignalSatisfied(signal, normalized));
  if (guard.strictEventTime) {
    const window = eventWindowClocks(guard.eventTimeWindow);
    const dayTransitionInvalid = DAY_TRANSITION_PATTERN.test(normalized) &&
      (!window.crossesMidnight || narrativeTimeExceedsWindow(normalized, guard));
    if (dayTransitionInvalid || narrativeTimeExceedsWindow(normalized, guard)) {
      return `${guard.eventName || "현재 사건"}의 시간창 ${guard.eventTimeWindow}을 넘긴 시간 이탈을 마감 안의 인물 중심 행동으로 즉시 교정`;
    }
  }
  if (guard.canonAbsorptionRequired && !canonEvidenceVisible) {
    if (DAY_TRANSITION_PATTERN.test(normalized)) {
      return `${guard.eventName || "현재 사건"}에 합류하기 전에 다음 날로 넘어간 본문을 현재 시각의 인물 중심 정사 교정으로 되감기`;
    }
    if (requestedTimeExceedsEventDeadline({
      eventTimeWindow: guard.eventTimeWindow,
      currentTime: guard.currentTime,
      requestedEndTime: guard.requestedEndTime,
      requestedDurationMinutes: guard.requestedMinimumMinutes ?? undefined,
    })) {
      return `${guard.eventName || "현재 사건"}의 시간창 ${guard.eventTimeWindow}을 넘긴 장면을 현재 비트의 행동과 반응에 즉시 합류하도록 교정`;
    }
  }
  if (
    (guard.longSpan || INVENTED_TIME_TRANSITION_PATTERN.test(normalized)) &&
    (LONG_ELAPSED_PATTERN.test(normalized) || LONG_ELAPSED_REVERSED_PATTERN.test(normalized))
  ) {
    return `현재 시각 ${guard.currentTime}을 벗어난 장기 시간 점프를 현재 장면의 시도와 즉시 반응으로 교정`;
  }

  const destination = compact(guard.destinationHint);
  const currentLocation = compact(guard.currentLocation);
  const eventLocation = compact(guard.eventLocation);
  const destinationAlreadyCurrent = Boolean(destination) && (
    currentLocation.includes(destination) || destination.includes(currentLocation) ||
    eventLocation.includes(destination) || destination.includes(eventLocation)
  );
  if (
    guard.restrictLocation &&
    ARRIVAL_PATTERN.test(normalized) &&
    ((destination.length >= 2 &&
      !destinationAlreadyCurrent &&
      compact(normalized).includes(destination)) ||
      (guard.highRiskTravel && HIGH_RISK_TRAVEL_PATTERN.test(normalized)))
  ) {
    return `사건 시간창 ${guard.eventTimeWindow} 안에 성립할 수 없는 장거리 도착을 이동 의도와 인물 중심 정사 합류로 교정`;
  }
  return undefined;
};

/**
 * Paragraph selection must only react to evidence contained in that paragraph.
 * The full-scene guard also enforces that a diversion turn visibly rejoins the
 * active beat; applying that scene-wide requirement to each paragraph made a
 * five-paragraph scene demand the same beat signal five separate times.
 */
export const liveCanonAnchorParagraphDriftReason = (
  text: string,
  guard?: LiveCanonAnchorGuard,
): string | undefined => guard
  ? liveCanonAnchorDriftReason(text, {
      ...guard,
      canonAbsorptionRequired: false,
      requestedEndTime: "",
      requestedMinimumMinutes: null,
    })
  : undefined;

const beatSignalAction = (signal: string): string => {
  const clean = signal.normalize("NFKC").replace(/[\r\n]+/gu, " ").trim();
  if (!clean) return "";
  if (/(?:알림|메시지|문자).*(?:확인|열람)/u.test(clean)) {
    return `${clean.replace(/\s*(?:확인|열람)\s*$/u, "")}을 확인한 순간`;
  }
  if (/(?:문|출입구).*(?:열림|개방)/u.test(clean)) {
    return `${clean.replace(/\s*(?:열림|개방)\s*$/u, "")}이 열리자`;
  }
  if (/(?:도착|등장|출현|발견|공격|습격|연락|응답|대답|제안|요청)\s*$/u.test(clean)) {
    const stem = clean.replace(/\s*(도착|등장|출현|발견|공격|습격|연락|응답|대답|제안|요청)\s*$/u, " $1");
    return `${stem}이 눈앞에서 벌어지자`;
  }
  return `${clean}이 뜻밖의 소리와 움직임으로 눈앞에 닥치자`;
};

export const liveCanonAnchorFallbackParagraph = (
  guard: LiveCanonAnchorGuard,
): string => {
  const destination = guard.destinationHint
    .normalize("NFKC")
    .replace(/[\r\n]+/gu, " ")
    .trim()
    .slice(0, 60);
  const actions = (guard.currentBeatSignals ?? [])
    .map(beatSignalAction)
    .filter(Boolean);
  const interruption = actions.length
    ? `그러나 얼마 지나지 않아 ${actions.join(", ")} 손끝이 멈췄다. 익숙하던 풍경에서 조금 전까지 없던 긴장이 번졌다.`
    : "그러나 얼마 지나지 않아 가까운 곳에서 마른 소리가 튀었다. 손끝이 멈췄고, 익숙하던 풍경에서 조금 전까지 없던 긴장이 번졌다.";
  return destination
    ? `그는 ${destination}로 향할 생각으로 가방 끈을 당겼다. ${interruption}`
    : `그는 하던 일에 다시 몰두하려 했다. ${interruption}`;
};
