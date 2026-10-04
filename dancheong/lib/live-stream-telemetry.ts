import type {
  EngineTurnResponse,
  LiveDiscardReason,
  LiveReliabilitySnapshot,
} from "./engine";
import type { LivePlanEnvelope } from "./live-story-runtime";
import type { FailedTurnDiagnostic } from "./simulation-stream";

export type LiveTimingState = {
  attemptId: string;
  attemptStartedAt: number;
  planReadyAt: number | null;
  writerRequestStartedAt: number | null;
  writerResponseAt: number | null;
  firstDeltaAt: number | null;
  firstSentenceAt: number | null;
  writerPromptChars: number;
  writerSchemaChars: number;
  writerStaticPromptChars: number;
  writerContextChars: number;
  writerPlanChars: number;
  writerProtocol: string;
  rewindCount: number;
  correctionPassCount: number;
  semanticAuditCount: number;
};

export const createLiveTimingState = (now = Date.now()): LiveTimingState => ({
  attemptId: crypto.randomUUID(),
  attemptStartedAt: now,
  planReadyAt: null,
  writerRequestStartedAt: null,
  writerResponseAt: null,
  firstDeltaAt: null,
  firstSentenceAt: null,
  writerPromptChars: 0,
  writerSchemaChars: 0,
  writerStaticPromptChars: 0,
  writerContextChars: 0,
  writerPlanChars: 0,
  writerProtocol: "",
  rewindCount: 0,
  correctionPassCount: 0,
  semanticAuditCount: 0,
});

const liveLatencyFields = (timing: LiveTimingState) => ({
  preparationMs: timing.planReadyAt === null
    ? undefined
    : Math.max(0, timing.planReadyAt - timing.attemptStartedAt),
  upstreamHandshakeMs:
    timing.writerRequestStartedAt === null || timing.writerResponseAt === null
      ? undefined
      : Math.max(0, timing.writerResponseAt - timing.writerRequestStartedAt),
  modelFirstDeltaMs:
    timing.writerRequestStartedAt === null || timing.firstDeltaAt === null
      ? null
      : Math.max(0, timing.firstDeltaAt - timing.writerRequestStartedAt),
  firstVisibleGraphemeMs: timing.firstSentenceAt === null
    ? null
    : Math.max(0, timing.firstSentenceAt - timing.attemptStartedAt),
  structureBufferMs:
    timing.firstDeltaAt === null || timing.firstSentenceAt === null
      ? null
      : Math.max(0, timing.firstSentenceAt - timing.firstDeltaAt),
  writerPromptChars: timing.writerPromptChars,
  writerSchemaChars: timing.writerSchemaChars,
  writerStaticPromptChars: timing.writerStaticPromptChars,
  writerContextChars: timing.writerContextChars,
  writerPlanChars: timing.writerPlanChars,
  writerProtocol: timing.writerProtocol,
});

export const planningFailureReliability = (
  diagnostic: FailedTurnDiagnostic,
  timing: LiveTimingState,
  discardReason: LiveDiscardReason,
  now = Date.now(),
): LiveReliabilitySnapshot => ({
  attemptId: timing.attemptId,
  beatPhase: diagnostic.phase,
  beat: diagnostic.beat,
  totalBeats: diagnostic.totalBeats,
  firstDraftDirect: diagnostic.phase === "first_draft",
  streamPath: "live",
  discarded: true,
  discardReason,
  rewindCount: timing.rewindCount,
  correctionPasses: timing.correctionPassCount,
  correctionReasons: [],
  semanticAuditCount: timing.semanticAuditCount,
  ttftMs: timing.firstDeltaAt === null
    ? null
    : Math.max(0, timing.firstDeltaAt - timing.attemptStartedAt),
  firstSentenceMs: timing.firstSentenceAt === null
    ? null
    : Math.max(0, timing.firstSentenceAt - timing.attemptStartedAt),
  ...liveLatencyFields(timing),
  totalStreamMs: Math.max(0, now - timing.attemptStartedAt),
});

export const liveDiscardReason = (
  error: { message?: string; code?: string },
): LiveDiscardReason => {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (code === "FINAL_BEAT_CLOSURE_FAILED") return "final_closure";
  if (code === "LIVE_SEMANTIC_CORRECTION_FAILED") return "semantic_correction";
  if (code === "NARRATIVE_REWRITE_FAILED" || /진명|정체|비공개/u.test(message)) {
    return "protected_term";
  }
  if (/JSON|구조|문자열|파싱/u.test(message)) return "json";
  if (/REQUEST|API_KEY|집필 요청|연결|통신|upstream/iu.test(`${code} ${message}`)) {
    return "transport";
  }
  if (/검증|일치|계약|연속/u.test(message)) return "validation";
  if (code === "LUNA_RESPONSE_REJECTED") return "validation";
  return "unknown";
};

export const liveReliabilitySnapshot = ({
  envelope,
  timing,
  correctionReasons,
  discarded,
  discardReason,
  streamPath = "live",
  now = Date.now(),
}: {
  envelope: LivePlanEnvelope;
  timing: LiveTimingState;
  correctionReasons: string[];
  discarded: boolean;
  discardReason: LiveDiscardReason | null;
  streamPath?: "live" | "validated_replay";
  now?: number;
}): LiveReliabilitySnapshot => ({
  attemptId: timing.attemptId,
  beatPhase: envelope.beatPolicy.phase,
  beat: envelope.beatPolicy.beat,
  totalBeats: envelope.beatPolicy.totalBeats,
  firstDraftDirect: envelope.beatPolicy.phase === "first_draft",
  streamPath,
  discarded,
  discardReason,
  rewindCount: timing.rewindCount,
  correctionPasses: timing.correctionPassCount,
  correctionReasons: [...correctionReasons],
  semanticAuditCount: timing.semanticAuditCount,
  ttftMs: timing.firstDeltaAt === null
    ? null
    : Math.max(0, timing.firstDeltaAt - timing.attemptStartedAt),
  firstSentenceMs: timing.firstSentenceAt === null
    ? null
    : Math.max(0, timing.firstSentenceAt - timing.attemptStartedAt),
  ...liveLatencyFields(timing),
  sidecarSplit: envelope.splitSidecar === true,
  totalStreamMs: Math.max(0, now - timing.attemptStartedAt),
});

export const validatedReplayReliability = (
  result: EngineTurnResponse,
  timing: LiveTimingState,
  now = Date.now(),
): LiveReliabilitySnapshot => {
  const beat = Math.max(0, result.usage?.contextProfile?.currentBeat ?? 0);
  const totalBeats = Math.max(0, result.usage?.contextProfile?.totalBeats ?? 0);
  const phase = totalBeats > 0 && beat >= totalBeats
    ? "final_closure" as const
    : beat <= 1
      ? "first_draft" as const
      : "closure_build_up" as const;
  const elapsed = Math.max(0, now - timing.attemptStartedAt);
  return {
    attemptId: timing.attemptId,
    beatPhase: phase,
    beat,
    totalBeats,
    firstDraftDirect: false,
    streamPath: "validated_replay",
    discarded: false,
    discardReason: null,
    rewindCount: 0,
    correctionPasses: 0,
    correctionReasons: [],
    semanticAuditCount: 0,
    ttftMs: elapsed,
    firstSentenceMs: elapsed,
    firstVisibleGraphemeMs: elapsed,
    totalStreamMs: elapsed,
  };
};
