import type { LiveScenePlan } from "./live-story-runtime";

export type LiveWriterTimeMark = {
  blockIndex: number;
  dayDelta: number;
  time: string;
};

export type LiveWriterSceneClock = {
  dayDelta: number;
  time: string;
  marks: LiveWriterTimeMark[];
};

const MARK_PATTERN = /^\+(\d{1,3})\s+([01]\d|2[0-3]):([0-5]\d)$/u;

const parseMark = (value: string): Omit<LiveWriterTimeMark, "blockIndex"> | undefined => {
  const match = value.normalize("NFKC").trim().match(MARK_PATTERN);
  if (!match) return undefined;
  return { dayDelta: Number(match[1]), time: `${match[2]}:${match[3]}` };
};

const absoluteMinutes = (mark: Omit<LiveWriterTimeMark, "blockIndex">): number => {
  const [hours, minutes] = mark.time.split(":").map(Number);
  return mark.dayDelta * 1440 + hours * 60 + minutes;
};

export const resolveLiveWriterSceneClock = ({
  rawBlocks,
  currentTime,
}: {
  rawBlocks: Array<Record<string, unknown>>;
  currentTime: string;
}): LiveWriterSceneClock => {
  const current = parseMark(`+0 ${currentTime}`);
  if (!current) throw new Error("현재 월드 시각 형식이 올바르지 않습니다.");
  let previousMinutes = absoluteMinutes(current);
  const marks = rawBlocks.map((block, blockIndex): LiveWriterTimeMark => {
    const parsed = parseMark(String(block.c ?? block.sceneClock ?? ""));
    if (!parsed) {
      throw new Error(`실시간 본문 ${blockIndex + 1}번 블록의 비공개 장면 시각이 없습니다.`);
    }
    const minutes = absoluteMinutes(parsed);
    if (minutes < previousMinutes) {
      throw new Error(`실시간 본문 ${blockIndex + 1}번 블록의 장면 시각이 과거로 역행했습니다.`);
    }
    previousMinutes = minutes;
    return { blockIndex, ...parsed };
  });
  const final = marks.at(-1);
  if (!final) throw new Error("실시간 본문의 비공개 장면 시각이 없습니다.");
  return { dayDelta: final.dayDelta, time: final.time, marks };
};

/** A chronology rewrite replaced the offending tail, so its old hidden clock
 * cannot survive. Use the approved plan boundary as the rewritten scene time. */
export const correctedLiveWriterSceneClock = ({
  clock,
  plan,
  chronologyCorrected,
}: {
  clock: LiveWriterSceneClock;
  plan: LiveScenePlan;
  chronologyCorrected: boolean;
}): LiveWriterSceneClock => chronologyCorrected && /^([01]\d|2[0-3]):[0-5]\d$/u.test(plan.targetTime)
  ? {
      dayDelta: 0,
      time: plan.targetTime,
      marks: clock.marks.map((mark) => ({ ...mark, dayDelta: 0, time: plan.targetTime })),
    }
  : clock;
