import {
  inferNarrativeChronology,
  resolveRuntimeChronology,
  type NarrativeAudit,
  type StatePatch,
} from "./engine";
import type { ClaudeTurnSignals } from "./claude-runtime";
import type { LiveBeatPolicy } from "./live-story-runtime";
import type { RuntimeChronology, StoryBlock } from "./scenario";
import { cappedEventClock } from "./event-time-guard";

const clockMinutes = (value: string): number | undefined => {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/u);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
};

/**
 * The prose and the final state ledger are one atomic result. A live event
 * deadline may reject or rewrite a prose jump, but it must never silently cap
 * only the HUD after that jump has already been published.
 */
export const finalNarrativeChronologyMismatchReason = ({
  state,
  blocks,
  chronology,
}: {
  state: RuntimeChronology;
  blocks: Array<Pick<StoryBlock, "type" | "text">>;
  chronology: RuntimeChronology;
}): string | undefined => {
  const signal = inferNarrativeChronology(state, blocks);
  if (!signal.time && signal.dayDelta === undefined) return undefined;
  const expected = resolveRuntimeChronology(
    state,
    signal.time ?? chronology.time,
    signal.dayDelta,
  );
  if (
    expected.day === chronology.day &&
    expected.date === chronology.date &&
    expected.weekday === chronology.weekday &&
    expected.time === chronology.time
  ) return undefined;
  return `본문 시각 ${expected.date} ${expected.time}과 최종 상태 시각 ${chronology.date} ${chronology.time}이 일치하지 않는다.`;
};

const minimumElapsedMinutes = ({
  blocks,
  phase,
  locationChanged,
  canonAbsorption,
}: {
  blocks: Array<Pick<StoryBlock, "type" | "text">>;
  phase: LiveBeatPolicy["phase"];
  locationChanged: boolean;
  canonAbsorption: boolean;
}): number => {
  const text = blocks.map((block) => block.text).join("\n");
  const dialogueCount = blocks.filter((block) => block.type === "dialogue").length;
  const travelShown = /(?:이동|출발|도착|향했|걸어|달려|버스|지하철|택시|차를\s*타|장소를\s*옮|캠퍼스\s*밖)/u.test(text);
  let minutes = phase === "final_closure" ? 5 : phase === "closure_build_up" ? 3 : 1;
  if (dialogueCount >= 2) minutes = Math.max(minutes, 3);
  if (canonAbsorption) minutes = Math.max(minutes, 5);
  if (locationChanged || travelShown) minutes = Math.max(minutes, 10);
  return minutes;
};

/** Advances only a frozen live turn; a writer-supplied forward clock is preserved. */
export const ensureElapsedTimeForLiveTurn = <T extends {
  blocks: Array<Pick<StoryBlock, "type" | "text">>;
  statePatch: StatePatch;
  chronology: RuntimeChronology;
  narrativeAudit?: NarrativeAudit;
  claudeSignals?: ClaudeTurnSignals;
}>({
  state,
  turn,
  beatPolicy,
  canonAbsorption = false,
  eventTimeWindow = "",
}: {
  state: RuntimeChronology & { location: string };
  turn: T;
  beatPolicy: LiveBeatPolicy;
  canonAbsorption?: boolean;
  eventTimeWindow?: string;
}): T => {
  const current = clockMinutes(state.time);
  const cappedTime = eventTimeWindow
    ? cappedEventClock(eventTimeWindow, state.time, turn.chronology.time)
    : turn.chronology.time;
  if (cappedTime !== turn.chronology.time) {
    const chronology = resolveRuntimeChronology(state, cappedTime, 0);
    return {
      ...turn,
      chronology,
      statePatch: { ...turn.statePatch, time: chronology.time, dayDelta: 0 },
      narrativeAudit: turn.narrativeAudit
        ? { ...turn.narrativeAudit, currentTime: chronology.time }
        : turn.narrativeAudit,
      claudeSignals: turn.claudeSignals
        ? { ...turn.claudeSignals, sceneTime: chronology.time }
        : turn.claudeSignals,
    };
  }
  const finalized = clockMinutes(cappedTime);
  const publicLength = turn.blocks.reduce((sum, block) => sum + block.text.trim().length, 0);
  if (current === undefined || finalized !== current || publicLength < 40) return turn;
  const elapsed = minimumElapsedMinutes({
    blocks: turn.blocks,
    phase: beatPolicy.phase,
    locationChanged: Boolean(turn.statePatch.location && turn.statePatch.location !== state.location),
    canonAbsorption,
  });
  const total = current + elapsed;
  const dayDelta = Math.floor(total / 1440);
  const requestedTime = `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  const chronology = resolveRuntimeChronology(state, requestedTime, dayDelta);
  const boundedTime = eventTimeWindow
    ? cappedEventClock(eventTimeWindow, state.time, chronology.time)
    : chronology.time;
  const boundedChronology = boundedTime === chronology.time
    ? chronology
    : resolveRuntimeChronology(state, boundedTime, 0);
  return {
    ...turn,
    chronology: boundedChronology,
    statePatch: { ...turn.statePatch, time: boundedChronology.time, dayDelta: boundedChronology.day - state.day },
    narrativeAudit: turn.narrativeAudit
      ? { ...turn.narrativeAudit, currentTime: boundedChronology.time }
      : turn.narrativeAudit,
    claudeSignals: turn.claudeSignals
      ? { ...turn.claudeSignals, sceneTime: boundedChronology.time }
      : turn.claudeSignals,
  };
};
