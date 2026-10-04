const clockMinutes = (value: string): number | null => {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/u);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const eventDay = (window: string): number | null => {
  const explicit = window.match(/D\s*\+\s*(\d+)/iu);
  if (explicit) return Number(explicit[1]);
  if (/(?:첫날|첫째\s*날|첫\s*번째\s*날)/u.test(window)) return 0;
  if (/(?:둘째\s*날|두\s*번째\s*날)/u.test(window)) return 1;
  if (/(?:셋째\s*날|세\s*번째\s*날)/u.test(window)) return 2;
  return null;
};

const windowTimes = (window: string): number[] => {
  const matches = [...window.matchAll(/(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)(?=\D|$)/gu)];
  if (matches.length) return matches.map((match) => Number(match[1]) * 60 + Number(match[2]));
  return [...window.matchAll(/(오전|오후|밤|새벽)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/gu)]
    .map((match) => {
      let hour = Number(match[2]);
      if (match[1] === "오후" && hour < 12) hour += 12;
      if ((match[1] === "오전" || match[1] === "새벽") && hour === 12) hour = 0;
      return hour <= 23 ? hour * 60 + Number(match[3] ?? 0) : -1;
    })
    .filter((minutes) => minutes >= 0);
};

export type EventTimeRecovery = {
  active: true;
  mode: "overdue" | "late_window_entry";
  deadline: string;
  overdueMinutes: number;
  remainingMinutes: number;
  instruction: string;
};

/** Public, work-agnostic recovery contract for an event whose declared window has passed. */
export const deriveEventTimeRecovery = ({
  timeWindow,
  currentDay,
  currentTime,
  currentBeat = 1,
}: {
  timeWindow: string;
  currentDay: number;
  currentTime: string;
  currentBeat?: number;
}): EventTimeRecovery | null => {
  const normalizedWindow = timeWindow.normalize("NFKC");
  if (!normalizedWindow || /(?:매일|매주|첫\s*주|동안|이내|이후부터)/u.test(normalizedWindow)) return null;
  const times = windowTimes(normalizedWindow);
  const startClock = times[0] ?? null;
  const deadlineClock = times.at(-1) ?? null;
  const currentClock = clockMinutes(currentTime);
  if (deadlineClock === null || currentClock === null) return null;
  const declaredDay = eventDay(normalizedWindow);
  const deadlineDay = declaredDay ?? currentDay;
  const overdueMinutes = currentDay * 1440 + currentClock - (deadlineDay * 1440 + deadlineClock);
  const lateIntoWindow = currentBeat <= 1 && times.length >= 2 && startClock !== null &&
    currentDay === deadlineDay && currentClock > startClock && currentClock <= deadlineClock;
  if (overdueMinutes <= 0 && !lateIntoWindow) return null;
  const mode = overdueMinutes > 0 ? "overdue" : "late_window_entry";
  return {
    active: true,
    mode,
    deadline: `${declaredDay === null ? "현재 일자" : `D+${deadlineDay}`} ${String(Math.floor(deadlineClock / 60)).padStart(2, "0")}:${String(deadlineClock % 60).padStart(2, "0")}`,
    overdueMinutes: Math.max(0, overdueMinutes),
    remainingMinutes: Math.max(0, deadlineDay * 1440 + deadlineClock - (currentDay * 1440 + currentClock)),
    instruction: mode === "overdue"
      ? "과거 시각으로 되돌리지 않는다. 주인공의 책임·관계·양심·상대의 호소 중 현재 인물에게 맞는 동기로 지체를 즉시 끝내고, 택시·직행·전화 협조처럼 가장 빠르면서 물리적으로 가능한 경로로 현재 사건에 복귀시킨다. 대기·우회·새 소일거리를 추가하지 말고 지연의 현재 결과를 짧게 연결해 이번 비트의 핵심 행동에 바로 합류한다."
      : "다음 사건의 시간창에 이미 늦게 진입했다. 과거로 되돌리지 말고 현재 시각에서 가장 빠른 현실적 수단과 짧은 인물 동기로 즉시 핵심 현장·상대·행동에 합류시킨다. 남은 시간 동안 우회·대기·분위기용 시간 경과·새 소일거리를 만들지 않는다.",
  };
};
