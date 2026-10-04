const KOREAN_NUMBER = {
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  다섯: 5,
  여섯: 6,
  몇: 3,
} as Record<string, number>;

export const strictClockMinutes = (value: string): number | undefined => {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/u);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
};

const normalizeHour = (period: string, rawHour: number): number => {
  if (period === "오후" && rawHour < 12) return rawHour + 12;
  if ((period === "오전" || period === "새벽") && rawHour === 12) return 0;
  if (period === "밤" && rawHour >= 6 && rawHour < 12) return rawHour + 12;
  return rawHour;
};

export const eventWindowClocks = (
  window: string,
): { start?: number; deadline?: number; crossesMidnight: boolean } => {
  const values: number[] = [];
  const occupied: Array<[number, number]> = [];
  for (const match of window.matchAll(/(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)(?=\D|$)/gu)) {
    values.push(Number(match[1]) * 60 + Number(match[2]));
    occupied.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
  }
  for (const match of window.matchAll(/(오전|오후|밤|새벽)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/gu)) {
    const index = match.index ?? 0;
    if (occupied.some(([start, end]) => index >= start && index < end)) continue;
    const hour = normalizeHour(match[1] ?? "", Number(match[2]));
    const minute = Number(match[3] ?? 0);
    if (hour <= 23 && minute <= 59) values.push(hour * 60 + minute);
  }
  const start = values.length >= 2 ? values[0] : undefined;
  const deadline = values.at(-1);
  return {
    start,
    deadline,
    crossesMidnight: start !== undefined && deadline !== undefined && start > deadline,
  };
};

export const minutesUntilEventDeadline = (
  window: string,
  currentTime: string,
): number | undefined => {
  const current = strictClockMinutes(currentTime);
  const { start, deadline, crossesMidnight } = eventWindowClocks(window);
  if (current === undefined || deadline === undefined) return undefined;
  if (!crossesMidnight) return current <= deadline ? deadline - current : 0;
  if (start !== undefined && current >= start) return 1440 - current + deadline;
  if (current <= deadline) return deadline - current;
  return 0;
};

export const explicitDurationMinutes = (input: string): number | undefined => {
  const normalized = input.normalize("NFKC");
  const durations: number[] = [];
  for (const match of normalized.matchAll(
    /(\d+|한|두|세|네|다섯|여섯|몇)\s*시간(?:\s*(\d{1,2})\s*분)?\s*(?:동안|간|내내|뒤|후|지나|흘|보내|공부|기다|머물|잤|자고|계속)/gu,
  )) {
    const hours = Number(match[1]) || KOREAN_NUMBER[match[1]] || 0;
    durations.push(hours * 60 + Number(match[2] ?? 0));
  }
  for (const match of normalized.matchAll(
    /(\d{1,3})\s*분\s*(?:동안|간|내내|뒤|후|지나|흘|보내|공부|기다|머물|계속)/gu,
  )) durations.push(Number(match[1]));
  return durations.length ? Math.max(...durations) : undefined;
};

export const requestedTimeExceedsEventDeadline = ({
  eventTimeWindow,
  currentTime,
  requestedEndTime,
  requestedDurationMinutes,
}: {
  eventTimeWindow: string;
  currentTime: string;
  requestedEndTime?: string;
  requestedDurationMinutes?: number;
}): boolean => {
  const remaining = minutesUntilEventDeadline(eventTimeWindow, currentTime);
  const current = strictClockMinutes(currentTime);
  if (remaining === undefined || current === undefined) return false;
  if (requestedDurationMinutes !== undefined && requestedDurationMinutes > remaining) return true;
  const requested = requestedEndTime ? strictClockMinutes(requestedEndTime) : undefined;
  if (requested === undefined) return false;
  const delta = requested >= current ? requested - current : 1440 - current + requested;
  return delta > remaining;
};

export const cappedEventClock = (
  eventTimeWindow: string,
  currentTime: string,
  candidateTime: string,
): string => {
  const remaining = minutesUntilEventDeadline(eventTimeWindow, currentTime);
  const current = strictClockMinutes(currentTime);
  const candidate = strictClockMinutes(candidateTime);
  const { deadline } = eventWindowClocks(eventTimeWindow);
  if (
    remaining === undefined || current === undefined || candidate === undefined ||
    deadline === undefined
  ) return candidateTime;
  if (remaining === 0) return currentTime;
  const delta = candidate >= current ? candidate - current : 1440 - current + candidate;
  if (delta <= remaining) return candidateTime;
  return `${String(Math.floor(deadline / 60)).padStart(2, "0")}:${String(deadline % 60).padStart(2, "0")}`;
};

export const immediateRecoveryClock = (
  eventTimeWindow: string,
  currentTime: string,
  maxAdvanceMinutes = 15,
): string => {
  const current = strictClockMinutes(currentTime);
  const remaining = minutesUntilEventDeadline(eventTimeWindow, currentTime);
  if (current === undefined || remaining === undefined) return currentTime;
  const advance = Math.max(0, Math.min(maxAdvanceMinutes, remaining));
  const target = (current + advance) % (24 * 60);
  return `${String(Math.floor(target / 60)).padStart(2, "0")}:${String(target % 60).padStart(2, "0")}`;
};
