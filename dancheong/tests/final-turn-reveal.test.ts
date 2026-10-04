import assert from "node:assert/strict";
import test from "node:test";

import {
  createFinalTurnRevealPlan,
  finalTurnRevealDurationMs,
  revealStoryBlocks,
  splitGraphemes,
  visibleGraphemeCount,
} from "../lib/final-turn-reveal";
import type { StoryBlock } from "../lib/scenario";

const blocks: StoryBlock[] = [
  { id: "narration-1", type: "narration", text: "가나다" },
  {
    id: "dialogue-1",
    type: "dialogue",
    speakerName: "린",
    text: "👨‍👩‍👧‍👦 좋아.",
  },
];

test("final reveal segments Korean text and joined emoji by grapheme", () => {
  assert.deepEqual(splitGraphemes("가👨‍👩‍👧‍👦나"), ["가", "👨‍👩‍👧‍👦", "나"]);
});

test("final reveal preserves block order and metadata at boundaries", () => {
  const plan = createFinalTurnRevealPlan(blocks);
  const visible = revealStoryBlocks(plan, 4);

  assert.equal(visible.length, 2);
  assert.equal(visible[0]?.text, "가나다");
  assert.equal(visible[1]?.text, "👨‍👩‍👧‍👦");
  assert.equal(visible[1]?.speakerName, "린");
  assert.deepEqual(
    revealStoryBlocks(plan, plan.totalGraphemes),
    blocks,
  );
});

test("final reveal duration is fast, bounded, and completes exactly", () => {
  assert.equal(finalTurnRevealDurationMs(0), 0);
  assert.equal(finalTurnRevealDurationMs(1), 900);
  assert.equal(finalTurnRevealDurationMs(10_000), 2_600);
  assert.equal(visibleGraphemeCount(100, 0, 1_000), 1);
  assert.equal(visibleGraphemeCount(100, 500, 1_000), 50);
  assert.equal(visibleGraphemeCount(100, 1_000, 1_000), 100);
});
