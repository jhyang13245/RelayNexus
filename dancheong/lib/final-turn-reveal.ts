import type { StoryBlock } from "./scenario";

const MIN_REVEAL_DURATION_MS = 900;
const MAX_REVEAL_DURATION_MS = 2_600;
const REVEAL_MS_PER_GRAPHEME = 1.8;

export type FinalTurnRevealPlan = {
  entries: Array<{
    block: StoryBlock;
    graphemes: string[];
  }>;
  totalGraphemes: number;
  durationMs: number;
};

export const splitGraphemes = (text: string): string[] => {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
};

export const finalTurnRevealDurationMs = (graphemeCount: number): number => {
  if (graphemeCount <= 0) return 0;
  return Math.min(
    MAX_REVEAL_DURATION_MS,
    Math.max(
      MIN_REVEAL_DURATION_MS,
      Math.round(graphemeCount * REVEAL_MS_PER_GRAPHEME),
    ),
  );
};

export const createFinalTurnRevealPlan = (
  blocks: StoryBlock[],
): FinalTurnRevealPlan => {
  const entries = blocks.map((block) => ({
    block,
    graphemes: splitGraphemes(block.text),
  }));
  const totalGraphemes = entries.reduce(
    (total, entry) => total + entry.graphemes.length,
    0,
  );
  return {
    entries,
    totalGraphemes,
    durationMs: finalTurnRevealDurationMs(totalGraphemes),
  };
};

export const visibleGraphemeCount = (
  totalGraphemes: number,
  elapsedMs: number,
  durationMs: number,
): number => {
  if (totalGraphemes <= 0) return 0;
  if (durationMs <= 0 || elapsedMs >= durationMs) return totalGraphemes;
  const progress = Math.max(0, elapsedMs) / durationMs;
  return Math.min(
    totalGraphemes,
    Math.max(1, Math.floor(totalGraphemes * progress)),
  );
};

export const revealStoryBlocks = (
  plan: FinalTurnRevealPlan,
  visibleCount: number,
): StoryBlock[] => {
  let remaining = Math.max(0, Math.min(plan.totalGraphemes, visibleCount));
  const visibleBlocks: StoryBlock[] = [];

  for (const entry of plan.entries) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, entry.graphemes.length);
    remaining -= take;
    if (take <= 0) continue;
    visibleBlocks.push({
      ...entry.block,
      text: entry.graphemes.slice(0, take).join(""),
    });
  }

  return visibleBlocks;
};
