import type { LongTermMemoryRecord, TurnRecord } from "./scenario";
import { sessionCanonMemoryText } from "./session-canon";

export const FULL_CONTEXT_TURN_LIMIT = 15;
export const GENERATED_SCENE_IMAGE_LIMIT = 5;

const compactText = (value: string, maxLength: number): string => {
  const normalized = value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const memoryTitle = (turn: TurnRecord): string => {
  const firstDialogue = turn.blocks.find(
    (block) => block.type === "dialogue" && block.speakerName?.trim(),
  );
  const firstNarrative = turn.blocks.find(
    (block) => block.type !== "system" && block.text.trim(),
  );
  if (firstDialogue?.speakerName) {
    return compactText(`${firstDialogue.speakerName}와의 장면`, 64);
  }
  if (firstNarrative?.text) return compactText(firstNarrative.text, 64);
  return turn.role === "opening" ? "이야기의 시작" : `${turn.turn}턴의 사건`;
};

export const summarizeTurnForLongTermMemory = (
  turn: TurnRecord,
): LongTermMemoryRecord => {
  const canonEntries = (turn.runtimeSnapshot?.sessionCanonLedger ?? [])
    .filter((entry) => entry.createdTurn === turn.turn || entry.updatedTurn === turn.turn)
    .slice(-8);
  const observedBlocks = turn.blocks
    .filter((block) => block.type !== "system" && block.text.trim())
    .slice(0, 4)
    .map((block) =>
      block.type === "dialogue"
        ? `${block.speakerName || "인물"}: ${compactText(block.text, 180)}`
        : compactText(block.text, 220)
    );
  const playerChoice = turn.userText?.trim()
    ? `플레이어의 선택: ${compactText(turn.userText, 180)}.`
    : turn.advanceMode === "canonical"
      ? "플레이어의 추가 선언 없이 정석 전개가 이어졌다."
      : "";
  const summary = compactText(
    [
      playerChoice,
      ...observedBlocks,
      ...canonEntries.map(sessionCanonMemoryText),
    ].filter(Boolean).join(" "),
    720,
  );
  const snapshot = turn.statusSnapshot;
  return {
    id: `long-memory-${turn.id}`,
    sourceTurnId: turn.id,
    turn: turn.turn,
    day: snapshot?.day ?? 0,
    date: snapshot?.date ?? "",
    weekday: snapshot?.weekday ?? "",
    time: snapshot?.time ?? "",
    location: snapshot?.location ?? "",
    title: memoryTitle(turn),
    summary: summary || "공개된 사건 기록이 요약되어 장기기억에 보관됐다.",
    canonEntries,
    createdAt: turn.createdAt,
  };
};

export const appendLongTermMemories = (
  turns: TurnRecord[],
  existing: LongTermMemoryRecord[] = [],
  recentLimit = FULL_CONTEXT_TURN_LIMIT,
): LongTermMemoryRecord[] => {
  const archivedTurns = turns.slice(0, Math.max(0, turns.length - recentLimit));
  if (!archivedTurns.length) return existing;
  const bySourceTurn = new Map(
    existing.map((memory) => [memory.sourceTurnId, memory] as const),
  );
  archivedTurns.forEach((turn) => {
    if (!bySourceTurn.has(turn.id)) {
      bySourceTurn.set(turn.id, summarizeTurnForLongTermMemory(turn));
    }
  });
  return [...bySourceTurn.values()].sort((left, right) =>
    left.turn - right.turn || left.createdAt.localeCompare(right.createdAt)
  );
};

export const retainRecentGeneratedSceneImages = (
  turns: TurnRecord[],
  imageLimit = GENERATED_SCENE_IMAGE_LIMIT,
): TurnRecord[] => {
  const imageTurnIds = turns
    .filter((turn) => Boolean(turn.imageUrl))
    .map((turn) => turn.id);
  if (imageTurnIds.length <= imageLimit) return turns;
  const retainedIds = new Set(imageTurnIds.slice(-imageLimit));
  return turns.map((turn) =>
    turn.imageUrl && !retainedIds.has(turn.id)
      ? {
          ...turn,
          imageUrl: undefined,
          imagePrompt: undefined,
          imageQuality: undefined,
          imageReferenceAssetIds: undefined,
        }
      : turn
  );
};

export const optimizeConversationSnapshot = <T extends {
  turns: TurnRecord[];
  longTermMemories?: LongTermMemoryRecord[];
}>(snapshot: T): T & { longTermMemories: LongTermMemoryRecord[] } => ({
  ...snapshot,
  turns: retainRecentGeneratedSceneImages(snapshot.turns),
  longTermMemories: appendLongTermMemories(
    snapshot.turns,
    snapshot.longTermMemories ?? [],
  ),
});
