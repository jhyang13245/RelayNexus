import type {
  DialogueAnnotation,
  EngineTurnResponse,
  LiveReliabilitySnapshot,
} from "./engine";
import { splitGraphemes } from "./final-turn-reveal";
import type { StoryBlock } from "./scenario";

export type FailedTurnDiagnostic = {
  code: string;
  summary: string;
  reasons: string[];
  narration?: string;
  draftKind?: "narration" | "scene_plan";
  beat: number;
  totalBeats: number;
  phase: "first_draft" | "closure_build_up" | "final_closure";
  correctionApplied: boolean;
  recoveryExhausted?: boolean;
  reliability?: LiveReliabilitySnapshot;
};

export const SIMULATION_STREAM_CONTENT_TYPE =
  "text/event-stream; charset=utf-8";

export type SimulationStreamEventName =
  | "turn_ack"
  | "narration_commit"
  | "narration_rewind"
  | "turn_sidecar"
  | "turn_abort"
  | "done"
  | "error";

export type SimulationStreamEvent =
  | {
      event: "turn_ack";
      data: {
        phase: "planning" | "writing" | "generating";
        message: string;
      };
    }
  | {
      event: "narration_rewind";
      data: {
        toGrapheme: number;
        reason: string;
        attempt: number;
      };
    }
  | {
      event: "narration_commit";
      data: {
        blockIndex: number;
        delta: string;
        block?: Omit<StoryBlock, "text">;
        totalGraphemes?: number;
      };
    }
  | {
      event: "turn_sidecar";
      data: { result: EngineTurnResponse };
    }
  | {
      event: "turn_abort";
      data: { reason: string; diagnostic?: FailedTurnDiagnostic };
    }
  | {
      event: "done";
      data: { validated: true; memoryApplied: true };
    }
  | {
      event: "error";
      data: { error: string; code?: string; diagnostic?: FailedTurnDiagnostic };
    };

export const encodeSimulationStreamEvent = (
  event: SimulationStreamEvent,
): string => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;

const sentenceFragments = (text: string): string[] => {
  const graphemes = splitGraphemes(text);
  if (!graphemes.length) return [];

  const fragments: string[] = [];
  let current = "";
  for (const grapheme of graphemes) {
    current += grapheme;
    if (
      /[.!?。！？…]/u.test(grapheme) ||
      (grapheme === "\n" && current.trim())
    ) {
      fragments.push(current);
      current = "";
    }
  }
  if (current) fragments.push(current);
  return fragments;
};

/**
 * The public stream never exposes raw model deltas. Every emitted fragment is
 * cut from the already validated final response and keeps complete graphemes.
 */
export const createNarrationCommitEvents = (
  blocks: StoryBlock[],
): SimulationStreamEvent[] => {
  const totalGraphemes = blocks.reduce(
    (total, block) => total + splitGraphemes(block.text).length,
    0,
  );
  return blocks.flatMap((block, blockIndex) => {
    const { text, ...metadata } = block;
    void text;
    const fragments = sentenceFragments(block.text);
    return fragments.map((delta, fragmentIndex) => ({
      event: "narration_commit" as const,
      data: {
        blockIndex,
        delta,
        totalGraphemes,
        ...(fragmentIndex === 0 ? { block: metadata } : {}),
      },
    }));
  });
};

export const parseSimulationStreamFrame = (
  frame: string,
): SimulationStreamEvent | undefined => {
  let eventName = "";
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/u)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!eventName || !dataLines.length) return undefined;
  if (![
    "turn_ack",
    "narration_commit",
    "narration_rewind",
    "turn_sidecar",
    "turn_abort",
    "done",
    "error",
  ].includes(eventName)) return undefined;
  return {
    event: eventName,
    data: JSON.parse(dataLines.join("\n")),
  } as SimulationStreamEvent;
};

export const consumeSimulationStream = async (
  response: Response,
  onEvent: (event: SimulationStreamEvent) => void | Promise<void>,
): Promise<void> => {
  if (!response.body) throw new Error("실시간 본문 스트림을 열 수 없습니다.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/u);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = parseSimulationStreamFrame(frame);
        if (event) await onEvent(event);
      }
      if (done) break;
    }
    const finalEvent = parseSimulationStreamFrame(buffer);
    if (finalEvent) await onEvent(finalEvent);
  } finally {
    reader.releaseLock();
  }
};

const TYPEWRITER_MIN_DURATION_MS = 900;
const TYPEWRITER_MAX_DURATION_MS = 2_800;
const TYPEWRITER_MS_PER_GRAPHEME = 3;
export const TYPEWRITER_FRAME_MS = 16;

export const typewriterDurationMs = (totalGraphemes: number): number => {
  if (totalGraphemes <= 0) return 0;
  return Math.min(
    TYPEWRITER_MAX_DURATION_MS,
    Math.max(
      TYPEWRITER_MIN_DURATION_MS,
      Math.round(totalGraphemes * TYPEWRITER_MS_PER_GRAPHEME),
    ),
  );
};

export const typewriterGraphemesPerFrame = (
  totalGraphemes: number,
): number => {
  const durationMs = typewriterDurationMs(totalGraphemes);
  if (durationMs <= 0) return 1;
  return Math.max(
    1,
    Math.ceil(totalGraphemes / Math.max(1, durationMs / TYPEWRITER_FRAME_MS)),
  );
};

const waitForTypewriterFrame = (milliseconds: number) =>
  milliseconds > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();

/** Reveals one server-validated sentence from its first grapheme onward. */
export const revealNarrationCommit = async (
  blocks: StoryBlock[],
  event: Extract<SimulationStreamEvent, { event: "narration_commit" }>,
  onFrame: (blocks: StoryBlock[]) => void,
  options: { signal?: AbortSignal; frameMs?: number } = {},
): Promise<StoryBlock[]> => {
  const graphemes = splitGraphemes(event.data.delta);
  if (!graphemes.length) return appendNarrationCommit(blocks, event);
  const totalGraphemes = Math.max(
    graphemes.length,
    event.data.totalGraphemes ?? graphemes.length,
  );
  const take = typewriterGraphemesPerFrame(totalGraphemes);
  const frameMs = options.frameMs ?? TYPEWRITER_FRAME_MS;
  let next = blocks;

  let index = 0;
  while (index < graphemes.length) {
    if (options.signal?.aborted) {
      throw new DOMException("본문 표시가 취소되었습니다.", "AbortError");
    }
    const frameTake = index === 0 && blocks.length === 0 ? 1 : take;
    next = appendNarrationCommit(next, {
      event: "narration_commit",
      data: {
        ...event.data,
        delta: graphemes.slice(index, index + frameTake).join(""),
        block: index === 0 ? event.data.block : undefined,
      },
    });
    onFrame(next);
    index += frameTake;
    if (index < graphemes.length) {
      await waitForTypewriterFrame(frameMs);
    }
  }
  return next;
};

export const appendNarrationCommit = (
  blocks: StoryBlock[],
  event: Extract<SimulationStreamEvent, { event: "narration_commit" }>,
): StoryBlock[] => {
  const { blockIndex, delta, block } = event.data;
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex > 200) {
    throw new Error("본문 스트림 블록 순서가 올바르지 않습니다.");
  }
  const next = blocks.map((candidate) => ({ ...candidate }));
  const existing = next[blockIndex];
  if (!existing) {
    if (!block || blockIndex !== next.length) {
      throw new Error("본문 스트림 블록 메타데이터가 누락되었습니다.");
    }
    next.push({ ...block, text: delta } as StoryBlock);
    return next;
  }
  existing.text += delta;
  return next;
};

/** Removes only the provisional prose after a server-approved grapheme edge. */
export const rewindNarrationBlocks = (
  blocks: StoryBlock[],
  toGrapheme: number,
): StoryBlock[] => {
  if (!Number.isInteger(toGrapheme) || toGrapheme < 0) {
    throw new Error("본문 되감기 위치가 올바르지 않습니다.");
  }
  let remaining = toGrapheme;
  const next: StoryBlock[] = [];
  for (const block of blocks) {
    if (remaining <= 0) break;
    const graphemes = splitGraphemes(block.text);
    const take = Math.min(remaining, graphemes.length);
    if (take > 0) next.push({ ...block, text: graphemes.slice(0, take).join("") });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new Error("본문 되감기 위치가 현재 공개 분량을 초과했습니다.");
  }
  return next;
};

const liveBlockText = (value: string): string => value
  .replace(/^[\s“”‘’"']+/u, "")
  .replace(/[\s“”‘’"']+$/u, "")
  .trim();

const liveBlockMatchText = (value: string): string =>
  liveBlockText(value).replace(/\s+/gu, " ");

type LiveDialogueRange = {
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
};

const inferredDialogueRanges = (narration: string): LiveDialogueRange[] => {
  const ranges: LiveDialogueRange[] = [];
  let cursor = 0;
  while (cursor < narration.length) {
    const curlyStart = narration.indexOf("“", cursor);
    const straightStart = narration.indexOf('"', cursor);
    const starts = [curlyStart, straightStart].filter((index) => index >= 0);
    if (!starts.length) break;
    const start = Math.min(...starts);
    const opener = narration[start];
    const closer = opener === "“" ? "”" : '"';
    const lineEnd = narration.indexOf("\n", start + 1);
    const foundEnd = narration.indexOf(closer, start + 1);
    const closed = foundEnd >= 0 && (lineEnd < 0 || foundEnd < lineEnd);
    const contentEnd = closed
      ? foundEnd
      : lineEnd >= 0
        ? lineEnd
        : narration.length;
    ranges.push({
      start,
      contentStart: start + 1,
      contentEnd,
      end: closed ? contentEnd + 1 : contentEnd,
    });
    cursor = Math.max(start + 1, closed ? contentEnd + 1 : contentEnd);
  }
  return ranges;
};

const annotatedDialogueRanges = (
  narration: string,
  annotations: DialogueAnnotation[],
): LiveDialogueRange[] => {
  const ranges: LiveDialogueRange[] = [];
  let cursor = 0;
  for (const annotation of annotations) {
    const quote = liveBlockText(annotation.quote);
    if (!quote) continue;
    const contentStart = narration.indexOf(quote, cursor);
    if (contentStart < 0) continue;
    const opening = /[“"']/u.test(narration[contentStart - 1] ?? "")
      ? contentStart - 1
      : contentStart;
    const contentEnd = contentStart + quote.length;
    const closing = /[”"']/u.test(narration[contentEnd] ?? "")
      ? contentEnd + 1
      : contentEnd;
    ranges.push({
      start: opening,
      contentStart,
      contentEnd,
      end: closing,
    });
    cursor = closing;
  }
  return ranges;
};

const matchedValidatedBlock = (
  type: StoryBlock["type"],
  text: string,
  validatedBlocks: StoryBlock[],
  used: Set<number>,
): StoryBlock | undefined => {
  const normalized = liveBlockMatchText(text);
  const index = validatedBlocks.findIndex((block, candidateIndex) =>
    !used.has(candidateIndex) &&
    block.type === type &&
    liveBlockMatchText(block.text) === normalized
  );
  if (index < 0) return undefined;
  used.add(index);
  return validatedBlocks[index];
};

/**
 * Projects the accepted narration into stable UI blocks while it is arriving.
 * Quoted dialogue gets its final card immediately with a reserved speaker row;
 * the final sidecar later hydrates speaker/media metadata onto the same IDs.
 */
export const projectStableLiveBlocks = ({
  narration,
  dialogueAnnotations = [],
  validatedBlocks = [],
  turnId = "live",
  inferDialogue = true,
}: {
  narration: string;
  dialogueAnnotations?: DialogueAnnotation[];
  validatedBlocks?: StoryBlock[];
  turnId?: string;
  inferDialogue?: boolean;
}): StoryBlock[] => {
  if (!narration) return [];
  const ranges = dialogueAnnotations.length
    ? annotatedDialogueRanges(narration, dialogueAnnotations)
    : inferDialogue
      ? inferredDialogueRanges(narration)
      : [];
  const blocks: StoryBlock[] = [];
  const usedValidatedBlocks = new Set<number>();

  const pushBlock = (
    type: "narration" | "dialogue",
    rawText: string,
    sourceStart: number,
  ) => {
    const text = liveBlockText(rawText);
    if (!text) return;
    const firstTextOffset = Math.max(0, rawText.indexOf(text));
    const stableStart = sourceStart + firstTextOffset;
    const matched = matchedValidatedBlock(
      type,
      text,
      validatedBlocks,
      usedValidatedBlocks,
    );
    blocks.push({
      ...(matched ?? {}),
      id: `${turnId}-live-${type}-${stableStart}`,
      type,
      text,
      speakerId: matched?.speakerId ?? "",
      speakerName: matched?.speakerName ?? "",
      emotion: matched?.emotion ?? "",
      mediaAssetId: matched?.mediaAssetId ?? "",
    });
  };

  const pushNarration = (start: number, end: number) => {
    const raw = narration.slice(start, end);
    let localStart = 0;
    for (const match of raw.matchAll(/\n+/gu)) {
      const boundary = match.index ?? 0;
      pushBlock("narration", raw.slice(localStart, boundary), start + localStart);
      localStart = boundary + (match[0]?.length ?? 0);
    }
    pushBlock("narration", raw.slice(localStart), start + localStart);
  };

  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    pushNarration(cursor, range.start);
    pushBlock(
      "dialogue",
      narration.slice(range.contentStart, range.contentEnd),
      range.start,
    );
    cursor = range.end;
  }
  pushNarration(cursor, narration.length);

  if (!blocks.length) pushBlock("narration", narration, 0);
  return blocks.slice(0, 36);
};

export const liveScrollerShouldFollow = ({
  scrollHeight,
  clientHeight,
  scrollTop,
  threshold = 120,
}: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  threshold?: number;
}): boolean => scrollHeight - clientHeight - scrollTop <= threshold;

export const shouldStartInitialStreamScroll = ({
  alreadyScheduled,
  visibleBlockCount,
}: {
  alreadyScheduled: boolean;
  visibleBlockCount: number;
}): boolean => !alreadyScheduled && visibleBlockCount > 0;

const canonicalJson = (value: unknown): string => JSON.stringify(
  value,
  (_key, candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return candidate;
    }
    return Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  },
);

/**
 * SSE reconstruction changes JavaScript property insertion order (`text` is
 * appended after the metadata). Equality must therefore compare JSON meaning,
 * not the incidental order used by JSON.stringify.
 */
export const validatedStoryBlocksMatch = (
  streamed: StoryBlock[],
  validated: StoryBlock[],
): boolean => canonicalJson(streamed) === canonicalJson(validated);

/**
 * Live finalization may project one accepted narration string into separate
 * narration/dialogue blocks for presentation metadata. Re-serializing those
 * blocks changes paragraph boundaries even though the prose was not edited.
 * The exact accepted (and, if necessary, rewound/corrected) writer string is
 * therefore the response authority for the live path.
 */
export const finalResponseNarration = (
  liveFinalize: boolean,
  acceptedNarration: string | undefined,
  projectedNarration: string,
): string => liveFinalize && acceptedNarration?.trim()
  ? acceptedNarration
  : projectedNarration;

const normalizeNarrationNewlines = (value: string): string =>
  value.replace(/\r\n?/gu, "\n").trim();

export const validatedLiveNarrationMatches = (
  streamed: StoryBlock[],
  narration: string | undefined,
): boolean => {
  if (!narration || streamed.length !== 1 || streamed[0]?.id !== "live-narration") {
    return false;
  }
  return normalizeNarrationNewlines(streamed[0].text) ===
    normalizeNarrationNewlines(narration);
};

export const isDirectLiveBlockStream = (blocks: StoryBlock[]): boolean =>
  blocks.length > 0 && blocks.every((block) => block.id.startsWith("live-block-"));

export const canonicalNarrationFromLiveBlocks = (blocks: StoryBlock[]): string =>
  blocks.map((block) => block.type === "dialogue" ? `“${block.text}”` : block.text)
    .join("\n\n");

export const validatedLiveProjectionMatches = (
  streamed: StoryBlock[],
  narration: string | undefined,
): boolean => Boolean(narration) && normalizeNarrationNewlines(
  canonicalNarrationFromLiveBlocks(streamed),
) === normalizeNarrationNewlines(narration ?? "");

/** Keeps the IDs already mounted in the reading surface while hydrating final
 * speaker/media metadata. When a protected paragraph correction collapsed the
 * remaining stream, final blocks are re-keyed by position only after approval. */
export const hydrateValidatedLiveBlocks = ({
  streamed,
  validated,
  turnId,
}: {
  streamed: StoryBlock[];
  validated: StoryBlock[];
  turnId: string;
}): StoryBlock[] => {
  const sameProjection = streamed.length === validated.length && streamed.every(
    (block, index) => block.type === validated[index]?.type &&
      normalizeNarrationNewlines(block.text) ===
        normalizeNarrationNewlines(validated[index]?.text ?? ""),
  );
  const source = sameProjection
    ? validated.map((block, index) => ({
        ...streamed[index],
        ...block,
        text: streamed[index].text,
      }))
    : validated;
  return source.map((block, index) => ({
    ...block,
    id: `${turnId}-live-${block.type}-${index}`,
  }));
};
