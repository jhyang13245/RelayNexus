import type { LiveReliabilitySnapshot } from "./engine";
import { APP_VERSION } from "./app-version";

export type LiveReliabilityEntry = LiveReliabilitySnapshot & {
  id: string;
  projectId: string;
  sessionId: string;
  appVersion: string;
  createdAt: string;
};

export const liveReliabilityEntry = (
  projectId: string,
  sessionId: string,
  snapshot: LiveReliabilitySnapshot,
  createdAt = new Date().toISOString(),
): LiveReliabilityEntry => ({
  ...snapshot,
  id: snapshot.attemptId,
  projectId,
  sessionId,
  appVersion: APP_VERSION,
  createdAt,
});

export const mergeLiveReliabilityEntries = (
  current: LiveReliabilityEntry[],
  incoming: LiveReliabilityEntry[],
): LiveReliabilityEntry[] => {
  const merged = new Map(current.map((entry) => [entry.id, entry] as const));
  incoming.forEach((entry) => merged.set(entry.id, entry));
  return [...merged.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-500);
};

export const persistLiveReliabilityEntry = async (
  entry: LiveReliabilityEntry,
): Promise<void> => {
  const response = await fetch("/api/telemetry/live-reliability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!response.ok) throw new Error("실시간 신뢰도 계측을 저장하지 못했습니다.");
};
