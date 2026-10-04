import type { EngineUsage } from "./engine";
import type { TurnRecord } from "./scenario";
import { APP_VERSION, LEGACY_COST_VERSION } from "./app-version";
import type { ImageCostBreakdown } from "./api-cost";

export type CostMeterEntry = {
  id: string;
  projectId: string;
  sessionId: string;
  turnId: string;
  turn: number;
  createdAt: string;
  appVersion: string;
  usage: EngineUsage;
  imageCostUsd: number;
  imageCosts?: ImageCostBreakdown[];
};

export const costMeterEntryFromTurn = (
  projectId: string,
  sessionId: string,
  turn: TurnRecord,
): CostMeterEntry | null => {
  if (!turn.usage) return null;
  return {
    // A model call remains the same cost event when its story turn is restored
    // or forked into another session. Session-scoped ids counted that already
    // paid call again after a conflict fork.
    id: `call:${turn.id}`,
    projectId,
    sessionId,
    turnId: turn.id,
    turn: turn.turn,
    createdAt: turn.createdAt,
    appVersion: turn.appVersion || LEGACY_COST_VERSION,
    usage: turn.usage,
    imageCostUsd: Math.max(0, Number(turn.imageCostUsd ?? 0)),
    imageCosts: turn.imageCosts ?? [],
  };
};

export const mergeCostMeterEntries = (
  current: CostMeterEntry[],
  incoming: CostMeterEntry[],
): CostMeterEntry[] => {
  const merged = new Map(current.map((entry) => [entry.id, entry] as const));
  for (const entry of incoming) merged.set(entry.id, entry);
  return [...merged.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
};

export const currentTurnAppVersion = () => APP_VERSION;
