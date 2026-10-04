import type {
  DialogueAnnotation,
  EngineCallUsage,
  EngineTurnResponse,
  EngineUsage,
  LiveReliabilitySnapshot,
  SimulateRequest,
} from "./engine";
import { splitGraphemes } from "./final-turn-reveal";
import {
  drainCompletedNarration,
  findProtectedTerm,
  openAIUsageFromResponse,
  replaceProtectedTermMatches,
  type LivePlanEnvelope,
} from "./live-story-runtime";
import { contractInventoryContainsItem, contractSignalSatisfied, contractSituationSatisfied } from "./contract-signals";
import { liveCanonAnchorDriftReason, liveCanonAnchorParagraphDriftReason, rebaseLiveCanonAnchorGuard } from "./live-canon-anchor";
import { chronologyCorrectionDeveloperPrompt, chronologySafetyRecovery, selectChronologyCorrectionTargets } from "./live-chronology-correction";
import { createNarrationCommitEvents, type FailedTurnDiagnostic,
  type SimulationStreamEvent,
} from "./simulation-stream";
export {
  authoredTurnFromLiveBlocks, resolveLiveDialogueSpeaker,
  type LiveAuthoredBlock,
} from "./live-block-classification";
export {
  createLiveTimingState,
  liveDiscardReason,
  liveReliabilitySnapshot,
  planningFailureReliability,
  validatedReplayReliability,
  type LiveTimingState,
} from "./live-stream-telemetry";
export const extractOutputTextDelta = (
  frame: string,
): { delta?: string; completedResponse?: Record<string, unknown>; error?: string } => {
  const dataLines = frame.split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (!dataLines.length) return {};
  const data = dataLines.join("\n");
  if (data === "[DONE]") return {};
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return { error: "Luna 스트림 이벤트 JSON이 손상되었습니다." };
  }
  const type = String(payload.type ?? "");
  if (type === "response.output_text.delta" && typeof payload.delta === "string") {
    return { delta: payload.delta };
  }
  if (type === "response.completed") {
    const response = payload.response;
    return {
      completedResponse: response && typeof response === "object"
        ? response as Record<string, unknown>
        : payload,
    };
  }
  if (type === "error" || type === "response.failed") {
    const errorValue = payload.error;
    const error = errorValue && typeof errorValue === "object"
      ? String((errorValue as Record<string, unknown>).message ?? "")
      : String(errorValue ?? payload.message ?? "");
    return { error: error || "Luna 실시간 집필이 중단되었습니다." };
  }
  return {};
};
export const extractResponseOutputText = (response: Record<string, unknown>): string => {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  return output.flatMap((item) => {
    const content = item && typeof item === "object"
      ? (item as Record<string, unknown>).content
      : [];
    return Array.isArray(content) ? content : [];
  }).map((item) => item && typeof item === "object"
    ? String((item as Record<string, unknown>).text ?? "")
    : "").join("");
};

export const liveWriterRequestBody = (
  envelope: LivePlanEnvelope,
  turnSchema: Record<string, unknown>,
): Record<string, unknown> => {
  const sourceProperties = turnSchema.properties && typeof turnSchema.properties === "object"
    ? turnSchema.properties as Record<string, unknown>
    : {};
  const sourceRequired = Array.isArray(turnSchema.required)
    ? turnSchema.required.map(String)
    : [];
  const { narration: _narration, dialogueAnnotations: _dialogueAnnotations, ...sidecarProperties } =
    sourceProperties;
  void _narration;
  void _dialogueAnnotations;
  const publicCast = Array.isArray(envelope.publicWriterContext.cast)
    ? envelope.publicWriterContext.cast
    : [];
  const allowedSpeakers = (envelope.speakerBindings ?? []).map((binding) => {
    const capsule = publicCast.find((candidate) =>
      candidate && typeof candidate === "object" &&
      String((candidate as Record<string, unknown>).visibleName ?? "") === binding.visibleName
    ) as Record<string, unknown> | undefined;
    return {
      id: binding.streamId,
      name: binding.visibleName,
      presence: String(capsule?.scenePresence ?? "unknown"),
      usage: "이 인물이 대사를 말하면 s에 이 id를 반드시 사용하고 n은 비운다.",
    };
  });
  const compactBlocksProperty = {
    type: "array",
    minItems: 1,
    maxItems: 36,
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        k: { type: "string", enum: ["n", "d"] },
        s: { type: "string", enum: ["", ...allowedSpeakers.map((speaker) => speaker.id)] },
        n: { type: "string" },
        e: { type: "string" },
        c: { type: "string", pattern: "^\\+[0-9]{1,3} ([01][0-9]|2[0-3]):[0-5][0-9]$" },
        t: { type: "string" },
      },
      required: ["k", "s", "n", "e", "c", "t"],
    },
  };
  const splitSidecar = envelope.splitSidecar === true;
  const liveTurnSchema = {
    ...turnSchema,
    properties: {
      b: compactBlocksProperty,
      ...(splitSidecar ? {} : sidecarProperties),
    },
    required: splitSidecar
      ? ["b"]
      : [
          "b",
          ...sourceRequired.filter((field) =>
            field !== "narration" && field !== "dialogueAnnotations"
          ),
        ],
  };
  return ({
  model: envelope.model,
  reasoning: { effort: envelope.reasoningEffort, context: "current_turn" },
  max_output_tokens: envelope.maxOutputTokens,
  store: false,
  stream: true,
  prompt_cache_key: envelope.promptCacheKey,
  prompt_cache_options: { mode: "explicit", ttl: "30m" },
  input: [
    {
      type: "message",
      role: "developer",
      content: [{
        type: "input_text",
        text: envelope.writerStaticPrompt,
        prompt_cache_breakpoint: { mode: "explicit" },
      }],
    },
    {
      type: "message",
      role: "user",
      content: [{
        type: "input_text",
        text: JSON.stringify({
          plan: envelope.plan,
          ctx: envelope.publicWriterContext,
          speakers: allowedSpeakers,
          phase: {
            name: envelope.beatPolicy.phase,
            beat: envelope.beatPolicy.beat,
            total: envelope.beatPolicy.totalBeats,
          },
          ...(envelope.beatPolicy.phase === "final_closure"
            ? { closure: envelope.diagnosticContract }
            : {}),
        }),
      }],
    },
  ],
  text: {
    format: {
      type: "json_schema",
      name: "relay_novel_live_turn",
      strict: true,
      schema: liveTurnSchema,
    },
  },
  });
};

export const liveSidecarRequestBody = (
  envelope: LivePlanEnvelope,
  turnSchema: Record<string, unknown>,
  narration: string,
  dialogueAnnotations: DialogueAnnotation[],
  writerTimeMarks: Array<{ blockIndex: number; dayDelta: number; time: string }> = [],
): Record<string, unknown> => {
  const sidecarStaticPrompt = envelope.sidecarStaticPrompt ||
    envelope.sidecarStaticPromptFactory?.() ||
    envelope.writerStaticPrompt;
  const sourceProperties = turnSchema.properties && typeof turnSchema.properties === "object"
    ? turnSchema.properties as Record<string, unknown>
    : {};
  const sourceRequired = Array.isArray(turnSchema.required)
    ? turnSchema.required.map(String)
    : [];
  const { narration: _narration, dialogueAnnotations: _annotations, ...sidecarProperties } =
    sourceProperties;
  void _narration;
  void _annotations;
  const sidecarSchema = {
    ...turnSchema,
    properties: sidecarProperties,
    required: sourceRequired.filter((field) =>
      field !== "narration" && field !== "dialogueAnnotations"
    ),
  };
  return {
    model: envelope.model,
    reasoning: { effort: "none", context: "current_turn" },
    max_output_tokens: Math.max(1800, Math.min(3600, envelope.maxOutputTokens)),
    store: false,
    stream: false,
    prompt_cache_key: envelope.promptCacheKey,
    prompt_cache_options: { mode: "explicit", ttl: "30m" },
    input: [
      {
        type: "message",
        role: "developer",
        content: [{
          type: "input_text",
          text: `${sidecarStaticPrompt}

너는 이미 공개·확정된 실시간 소설 본문의 상태 정산기다.
- narration과 dialogueAnnotations는 절대 다시 쓰거나 교정하지 않는다.
- 실제 본문과 공개 컨텍스트에서 관측 가능한 결과만 상태·메모리·추천·이미지 보조 데이터로 계산한다.
- 본문에 없는 행동, 소지품, 이동, 관계 변화, 사건 종결을 만들어내지 않는다.
- 대화·수색·이동·응급처치처럼 분명히 시간이 드는 장면이면 현재 시각을 그대로 복사하지 말고 본문에 맞는 최소 경과 시간을 반영한다. 본문에 명시된 시각이 있으면 그것을 우선한다.
- 물품은 본문에서 실제로 집어 들거나 전달받아 소지한 경우에만 획득 목록에 넣는다. 반대로 실제 획득이 쓰였으면 같은 공개 명칭을 빠뜨리지 않는다.
- dialogueAnnotations의 화자·인용문은 승인된 본문 블록과 정확히 일치시킨다. 비등록 화자를 가까운 다른 인물에게 배정하지 않는다.
- writerTimeMarks는 작가가 각 본문 블록에 붙인 서버 전용 장면 시각이다. 마지막 표식의 time/dayDelta를 상태 시각으로 사용하고, 독자용 본문에 이 메타데이터를 덧붙이지 않는다.
- 요청된 sidecar JSON만 출력한다.`,
          prompt_cache_breakpoint: { mode: "explicit" },
        }],
      },
      {
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: JSON.stringify({
            approvedScenePlan: envelope.plan,
            publicSceneContext: envelope.publicSidecarContext ?? envelope.publicWriterContext,
            beatPolicy: envelope.beatPolicy,
            ...(envelope.beatPolicy.phase === "final_closure"
              ? { closureContract: envelope.diagnosticContract }
              : {}),
            narration,
            dialogueAnnotations,
            writerTimeMarks,
          }),
        }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "relay_novel_live_sidecar",
        strict: true,
        schema: sidecarSchema,
      },
    },
  };
};

export type SemanticSentenceCorrection = {
  adequate: boolean;
  reason: string;
  replacementSentence: string;
  response: Record<string, unknown>;
  usage: EngineCallUsage;
};

export type NarrationParagraph = {
  index: number;
  start: number;
  end: number;
  text: string;
  separator: string;
};

export const splitNarrationParagraphs = (narration: string): NarrationParagraph[] => {
  const paragraphs: NarrationParagraph[] = [];
  const separator = /\r?\n+/gu;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = separator.exec(narration)) !== null) {
    paragraphs.push({
      index: paragraphs.length,
      start: cursor,
      end: match.index,
      text: narration.slice(cursor, match.index),
      separator: match[0],
    });
    cursor = match.index + match[0].length;
  }
  paragraphs.push({
    index: paragraphs.length,
    start: cursor,
    end: narration.length,
    text: narration.slice(cursor),
    separator: "",
  });
  return paragraphs;
};

export const narrationParagraphStartAt = (narration: string, index: number): number => {
  const safeIndex = Math.max(0, Math.min(index, narration.length));
  const previousNewline = narration.lastIndexOf("\n", Math.max(0, safeIndex - 1));
  return previousNewline < 0 ? 0 : previousNewline + 1;
};

export type ProtectedParagraphCorrection = {
  narration: string;
  correctedIndexes: number[];
  reasons: string[];
  usage?: EngineCallUsage;
  fallbackApplied: boolean;
};

const protectedParagraphCorrectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    paragraphs: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer", minimum: 0 },
          text: { type: "string", minLength: 1, maxLength: 3200 },
        },
        required: ["index", "text"],
      },
    },
  },
  required: ["paragraphs"],
} as const;

const rebuildNarrationParagraphs = (
  narration: string,
  replacements: Map<number, string>,
): string => splitNarrationParagraphs(narration)
  .map((paragraph) => `${replacements.get(paragraph.index) ?? paragraph.text}${paragraph.separator}`)
  .join("");

const CORRECTION_META_PROSE_PATTERNS = [
  /(?:현재\s*(?:시각|장소|사건|비트)|정사\s*(?:합류|교정|흡수)|사건\s*시간창|시스템\s*(?:용어|규칙)|교정(?:본|문|을|이)|검증(?:기|을|이))/u,
  /(?:사용자(?:의)?\s*(?:입력|욕구|의도)|플레이어\s*입력|지금\s*가능한\s*행동부터)/u,
  /(?:그\s*시간이\s*이미\s*지나거나\s*이동이\s*끝난|다음\s*선택을\s*피할\s*수\s*없는\s*상태)/u,
] as const;

export const correctionProseViolationReason = (text: string): string | undefined => {
  const normalized = text.normalize("NFKC");
  return CORRECTION_META_PROSE_PATTERNS.some((pattern) => pattern.test(normalized))
    ? "교정 규칙이나 선택지 판정을 독자에게 설명하는 메타 문체"
    : undefined;
};

const futureProgressionFallback = (paragraph: string, guardTerms: string[]): string => {
  const sentences = paragraph.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)|\n+/gu) ?? [paragraph];
  const preserved = sentences.filter((sentence) =>
    !findProtectedTerm(sentence, guardTerms)
  ).join("").trim();
  if (preserved && !findProtectedTerm(preserved, guardTerms)) return preserved;
  return "그 너머의 일은 아직 시작되지 않았다.";
};

export const requestProtectedParagraphCorrection = async ({
  fetcher,
  apiKey,
  envelope,
  narration,
  guardTerms = envelope.protectedTerms,
  guardKind = "protected",
}: {
  fetcher: typeof fetch;
  apiKey: string;
  envelope: LivePlanEnvelope;
  narration: string;
  guardTerms?: string[];
  guardKind?: "protected" | "future" | "chronology";
}): Promise<ProtectedParagraphCorrection> => {
  const paragraphs = splitNarrationParagraphs(narration), validationGuard = rebaseLiveCanonAnchorGuard(envelope.canonAnchorGuard, envelope.plan.targetTime);
  const chronologySelection = guardKind === "chronology"
    ? selectChronologyCorrectionTargets(paragraphs, narration, envelope.canonAnchorGuard)
    : undefined;
  const targets = chronologySelection?.targets ?? paragraphs.filter((paragraph) =>
    Boolean(findProtectedTerm(paragraph.text, guardTerms))
  );
  if (!targets.length) {
    return { narration, correctedIndexes: [], reasons: [], fallbackApplied: false };
  }
  const reasons = targets.flatMap((paragraph) => {
    if (guardKind === "chronology") {
      const reason = liveCanonAnchorParagraphDriftReason(
        paragraph.text,
        envelope.canonAnchorGuard,
      ) ?? chronologySelection?.wholeSceneReason;
      return reason ? [`${paragraph.index + 1}문단 ${reason}`] : [];
    }
    const term = findProtectedTerm(paragraph.text, guardTerms);
    return term ? [guardKind === "future"
      ? `${paragraph.index + 1}문단 다음 사건 선행 진행 ‘${term}’ 재작성`
      : `${paragraph.index + 1}문단 비공개 명칭 ‘${term}’ 재작성`] : [];
  });
  const maskedTargets = targets.map((paragraph) => ({
    index: paragraph.index,
    text: guardKind === "chronology"
      ? paragraph.text
      : replaceProtectedTermMatches(
          paragraph.text,
          guardTerms,
          guardKind === "future" ? "[다음 사건 선행 내용]" : "[공개 전 정보]",
        ),
  }));
  const startedAt = Date.now();
  try {
    const response = await fetcher(`${envelope.baseUrl ?? "https://api.openai.com/v1"}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: envelope.model,
        reasoning: {
          effort: guardKind === "chronology" ? "low" : "none",
          context: "current_turn",
        },
        max_output_tokens: guardKind === "chronology"
          ? Math.max(1800, Math.min(5200, envelope.maxOutputTokens))
          : Math.max(900, Math.min(3600, envelope.maxOutputTokens)),
        store: false,
        prompt_cache_key: envelope.promptCacheKey,
        input: [
          {
            type: "message",
            role: "developer",
            content: [{
              type: "input_text",
              text: guardKind === "chronology" ? chronologyCorrectionDeveloperPrompt(envelope) : guardKind === "future" ? `너는 실시간 소설의 사건 경계 문단 교정 작가다.
초안에서 아직 시작하지 않은 다음 사건을 실제로 진행한 문단만 전달된다. [다음 사건 선행 내용]을 제거하고 현재 사건의 인물 반응·결과·종결 또는 인계 제안까지만 남겨 같은 문단을 다시 쓴다.
- 현재 사건 계약에 있는 다음 목적지 제안은 보존할 수 있지만, 그곳에 도착하거나 새 인물과 조우하거나 후속 갈등을 발생시키지 않는다.
- 원래 문단의 현재 사건 행동·대사·인과·문체를 보존한다.
- 다른 문단과 플레이어 입력을 수정하지 않는다.
- 판정·요약·선택지 안내가 아니라 인물의 감각·행동·즉각 반응이 이어지는 흥미로운 장르소설 문단으로 쓴다.
- ‘현재 사건’, ‘비트’, ‘정사’, ‘교정’, ‘사용자 입력’, ‘다음 선택’ 같은 검증기 표현을 본문에 쓰지 않는다.
- 시스템 용어와 교정 설명 없이 요청된 문단만 JSON으로 출력한다.` : `너는 실시간 소설의 문단 교정 작가다.
초안에서 공개 전 정보가 나온 문단만 전달된다. [공개 전 정보]의 정답을 추측하지 말고 현재 공개 호칭·외형·행동으로 바꿔 같은 문단을 다시 쓴다.
- 원래 문단의 공개된 행동·대사·인과·결과와 문체를 보존한다.
- 문단을 요약하거나 장면을 조기에 끝내지 않는다.
- 다른 문단, 장부, 계획은 수정하지 않는다.
- 마지막 비트라면 종결에 필요한 공개 행동과 결과를 반드시 보존한다.
- 고친 흔적이 보이는 설명문이나 추상적 요약 대신, 인물의 감각·행동·반응이 살아 있는 장르소설 문단으로 쓴다.
- ‘공개 전 정보’, ‘현재 사건’, ‘비트’, ‘정사’, ‘교정’, ‘검증’, ‘다음 선택’ 같은 내부 표현을 본문에 쓰지 않는다.
- 시스템 용어와 교정 설명 없이 요청된 문단만 JSON으로 출력한다.`,
            }],
          },
          {
            type: "message",
            role: "user",
            content: [{
              type: "input_text",
              text: JSON.stringify({
                approvedScenePlan: envelope.plan,
                beatPolicy: envelope.beatPolicy,
                canonAnchor: validationGuard,
                fullSceneContext: narration,
                paragraphs: maskedTargets,
              }),
            }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "relay_live_protected_paragraph_correction",
            strict: true,
            schema: protectedParagraphCorrectionSchema,
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`문단 교정 요청 실패 (${response.status})`);
    const body = await response.json() as Record<string, unknown>;
    const parsed = JSON.parse(extractResponseOutputText(body)) as {
      paragraphs?: Array<{ index?: number; text?: string }>;
    };
    const replacements = new Map<number, string>();
    for (const target of targets) {
      const correction = parsed.paragraphs?.find((entry) => entry.index === target.index);
      const text = correction?.text?.trim() ?? "";
      const invalid = guardKind === "chronology"
        ? Boolean(liveCanonAnchorParagraphDriftReason(text, validationGuard))
        : Boolean(findProtectedTerm(text, guardTerms));
      const proseViolation = correctionProseViolationReason(text);
      if (!text || invalid || proseViolation) {
        throw new Error(`${target.index + 1}문단 교정본 검증 실패`);
      }
      replacements.set(target.index, text);
    }
    const correctedNarration = rebuildNarrationParagraphs(narration, replacements);
    if (
      guardKind === "chronology" &&
      liveCanonAnchorDriftReason(correctedNarration, validationGuard)
    ) {
      throw new Error("장면 전체의 시간·장소 또는 사건 합류 검증 실패");
    }
    return {
      narration: correctedNarration,
      correctedIndexes: targets.map((target) => target.index),
      reasons,
      fallbackApplied: false,
      usage: {
        ...openAIUsageFromResponse(
          body,
          "semantic_rewrite",
          3,
          "none",
          Math.max(0, Date.now() - startedAt),
        ),
        rewriteReasons: reasons,
        repairScope: "paragraph",
        finalRewriteCandidate: true,
      },
    };
  } catch {
    if (guardKind === "chronology" && envelope.canonAnchorGuard) {
      const recoveryGuard = rebaseLiveCanonAnchorGuard(envelope.canonAnchorGuard, envelope.plan.targetTime, false)!;
      const corrected = chronologySafetyRecovery(paragraphs, recoveryGuard);
      if (liveCanonAnchorDriftReason(corrected, recoveryGuard)) {
        throw Object.assign(new Error("시간·장소 정사 이탈 장면의 전면 재집필과 안전 복구에 실패했습니다."), {
          code: "NARRATIVE_REWRITE_FAILED",
        });
      }
      return {
        narration: corrected,
        correctedIndexes: targets.map((target) => target.index),
        reasons: [
          ...reasons,
          "작가 꼬리 장면 재집필 실패 후 마지막 안전 문단부터 현재 사건 자극으로 다시 연결",
        ],
        fallbackApplied: true,
      };
    }
    const replacements = new Map<number, string>();
    for (const target of targets) {
      const fallback = guardKind === "future"
          ? futureProgressionFallback(target.text, guardTerms)
          : replaceProtectedTermMatches(
              target.text,
              guardTerms,
              "아직 정체가 드러나지 않은 대상",
            );
      replacements.set(target.index, fallback);
    }
    const corrected = rebuildNarrationParagraphs(narration, replacements);
    const correctionStillInvalid = guardKind === "chronology"
      ? Boolean(liveCanonAnchorDriftReason(corrected, envelope.canonAnchorGuard))
      : Boolean(findProtectedTerm(corrected, guardTerms));
    if (correctionStillInvalid) {
      const label = guardKind === "chronology"
        ? "시간·장소 정사 이탈 문단"
        : guardKind === "future" ? "다음 사건 선행 문단" : "비공개 정보 문단";
      throw Object.assign(new Error(`${label} 교정과 안전 대체에 실패했습니다.`), {
        code: "NARRATIVE_REWRITE_FAILED",
      });
    }
    return {
      narration: corrected,
      correctedIndexes: targets.map((target) => target.index),
      reasons: [
        ...reasons,
        guardKind === "chronology"
          ? "작가 문단 교정 실패 후 사용자 의도를 현재 시각·장소의 즉시 행동으로 안전 연결"
          : guardKind === "future"
          ? "작가 문단 교정 실패 후 다음 사건 선행 문장만 제거"
          : "작가 문단 교정 실패 후 안전 호칭으로 대체",
      ],
      fallbackApplied: true,
    };
  }
};

const semanticCorrectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    adequate: { type: "boolean" },
    reason: { type: "string", maxLength: 240 },
    replacementSentence: { type: "string", maxLength: 360 },
  },
  required: ["adequate", "reason", "replacementSentence"],
} as const;

export const requestSemanticBuildUpCorrection = async ({
  fetcher,
  apiKey,
  envelope,
  authoredTurn,
}: {
  fetcher: typeof fetch;
  apiKey: string;
  envelope: LivePlanEnvelope;
  authoredTurn: Record<string, unknown>;
}): Promise<SemanticSentenceCorrection> => {
  const startedAt = Date.now();
  const response = await fetcher(`${envelope.baseUrl ?? "https://api.openai.com/v1"}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: envelope.model,
      reasoning: { effort: "none", context: "current_turn" },
      max_output_tokens: 480,
      store: false,
      prompt_cache_key: envelope.promptCacheKey,
      input: [
        {
          type: "message",
          role: "developer",
          content: [{
            type: "input_text",
            text: `너는 실시간 소설의 중간 비트 문장 교정기다.
현재 narration이 approvedScenePlan에 적힌 이번 비트의 구체적 극적 목적과 mustShow를 실제로 성립시켜 마지막 비트가 개연성 있게 이어지는지 판정한다.
- 이미 충분하면 adequate=true, replacementSentence=""로 둔다.
- 부족하면 adequate=false로 두고 마지막 문장 하나만 대체할 replacementSentence를 쓴다.
- 대체문은 기존 narration에 이미 나온 인물·사물·행동만 연결한다. 새 인물·새 물품·새 이동·새 플레이어 행동·새 대사를 만들지 않는다.
- 계획의 목적이 단서 발견이 아니라면 새 기록·기호·소리·수수께끼를 만들어 빌드업으로 대신하지 않는다. 인물의 관계·결정·위험·기회·물리 상태 중 기존 본문에 근거한 변화를 택한다.
- 사건을 종결하거나 eventResolved에 해당하는 결과를 만들지 않는다.
- 공개 전 정체와 입력에 없는 사실을 쓰지 않는다. 설명문이나 엔진 용어 없이 작품 문체의 문장만 쓴다.
- 마지막 문장은 판정·요약·선택지 안내가 아니라, 인물의 행동이나 감각적 변화가 다음 순간의 긴장을 만드는 장르소설 문장이어야 한다.
- ‘현재 사건’, ‘비트’, ‘정사’, ‘교정’, ‘검증’, ‘사용자 의도’, ‘가능한 행동’, ‘다음 선택’ 같은 내부 표현을 쓰지 않는다.`,
          }],
        },
        {
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              approvedScenePlan: envelope.plan,
              publicSceneContext: envelope.publicWriterContext,
              narration: String(authoredTurn.narration ?? ""),
              statePatch: authoredTurn.statePatch ?? {},
            }),
          }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "relay_live_semantic_sentence_correction",
          strict: true,
          schema: semanticCorrectionSchema,
        },
      },
    }),
  });
  if (!response.ok) {
    throw Object.assign(new Error(`중간 비트 의미 교정 요청이 실패했습니다. (${response.status})`), {
      code: "LIVE_SEMANTIC_CORRECTION_FAILED",
    });
  }
  const body = await response.json() as Record<string, unknown>;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractResponseOutputText(body)) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error("중간 비트 의미 교정 JSON이 손상되었습니다."), {
      code: "LIVE_SEMANTIC_CORRECTION_FAILED",
    });
  }
  const adequate = parsed.adequate === true;
  const reason = String(parsed.reason ?? "").trim();
  const replacementSentence = String(parsed.replacementSentence ?? "").trim();
  if (!adequate && !replacementSentence) {
    throw Object.assign(new Error("중간 비트 의미 교정이 대체 문장을 반환하지 않았습니다."), {
      code: "LIVE_SEMANTIC_CORRECTION_FAILED",
    });
  }
  if (findProtectedTerm(replacementSentence, [
    ...envelope.protectedTerms,
    ...(envelope.futureProgressionTerms ?? []),
  ])) {
    throw Object.assign(new Error("중간 비트 의미 교정문에 비공개 정보 또는 다음 사건 선행 내용이 남았습니다."), {
      code: "LIVE_SEMANTIC_CORRECTION_FAILED",
    });
  }
  const proseViolation = correctionProseViolationReason(replacementSentence);
  if (proseViolation) {
    throw Object.assign(new Error(`중간 비트 의미 교정문이 소설 문체를 벗어났습니다: ${proseViolation}`), {
      code: "LIVE_SEMANTIC_CORRECTION_FAILED",
    });
  }
  return {
    adequate,
    reason,
    replacementSentence,
    response: body,
    usage: {
      ...openAIUsageFromResponse(
        body,
        "semantic_rewrite",
        3,
        "none",
        Math.max(0, Date.now() - startedAt),
      ),
      rewriteReasons: adequate ? [] : [reason || "종결 빌드업 의미 교정"],
      repairScope: "sentence",
      finalRewriteCandidate: !adequate,
    },
  };
};

export const replaceLastNarrationSentence = (
  narration: string,
  replacementSentence: string,
): { narration: string; prefix: string; rewindToGrapheme: number; delta: string } => {
  const commits = drainCompletedNarration(narration, true).commits;
  const last = commits.at(-1) ?? narration;
  const start = Math.max(0, narration.length - last.length);
  const leadingWhitespace = last.match(/^\s*/u)?.[0] ?? "";
  const prefix = narration.slice(0, start);
  const normalizedReplacement = `${leadingWhitespace}${replacementSentence.trim()}`;
  return {
    narration: `${prefix}${normalizedReplacement}`,
    prefix,
    rewindToGrapheme: splitGraphemes(prefix).length,
    delta: normalizedReplacement,
  };
};

export const mergeLiveUsage = ({
  result,
  planUsage,
  writerUsage,
  correctionUsages = [],
  envelope,
  correctionReasons,
  reliability,
}: {
  result: EngineTurnResponse;
  planUsage: EngineCallUsage;
  writerUsage: EngineCallUsage;
  correctionUsages?: EngineCallUsage[];
  envelope: LivePlanEnvelope;
  correctionReasons: string[];
  reliability: LiveReliabilitySnapshot;
}): EngineUsage => {
  const base = result.usage;
  const calls = [planUsage, writerUsage, ...correctionUsages, ...(base?.calls ?? [])]
    .filter((call) =>
      call.inputTokens > 0 ||
      call.outputTokens > 0 ||
      call.estimatedCostUsd > 0 ||
      call.stage !== "scene_plan"
    )
    .map((call, index) => ({ ...call, call: index + 1 }));
  const inputTokens = calls.reduce((sum, call) => sum + call.inputTokens, 0);
  const outputTokens = calls.reduce((sum, call) => sum + call.outputTokens, 0);
  const cachedInputTokens = calls.reduce((sum, call) => sum + call.cachedInputTokens, 0);
  const cacheWriteTokens = calls.reduce((sum, call) => sum + call.cacheWriteTokens, 0);
  const rewriteUsages = correctionUsages.filter((usage) => usage.rewriteReasons.length > 0);
  const usageReasons = new Set(rewriteUsages.flatMap((usage) => usage.rewriteReasons));
  const untrackedReasons = correctionReasons.filter((reason) => !usageReasons.has(reason));
  const liveRepairs = correctionReasons.length
    ? [
        ...rewriteUsages.map((usage) => ({
          ruleId: usage.repairScope === "paragraph"
            ? "live-protected-paragraph-rewind"
            : "live-semantic-build-up-correction",
          repairScope: usage.repairScope === "paragraph"
            ? "paragraph" as const
            : "sentence" as const,
          reasons: usage.rewriteReasons,
          durationMs: usage.durationMs ?? 0,
          success: true,
        })),
        ...(untrackedReasons.length ? [{
          ruleId: "live-protected-paragraph-safe-fallback",
          repairScope: "paragraph" as const,
          reasons: untrackedReasons,
          durationMs: 0,
          success: true,
        }] : []),
      ]
    : [];
  return {
    model: base?.model ?? envelope.model,
    outputTokenLimit: base?.outputTokenLimit,
    reasoningEffort: base?.reasoningEffort,
    callCount: calls.length,
    billedCallCount: calls.length,
    rewriteCount: correctionUsages.filter((usage) =>
      usage.finalRewriteCandidate || usage.rewriteReasons.length > 0
    ).length,
    rewriteReasons: correctionReasons,
    hardErrorReasons: base?.hardErrorReasons ?? [],
    qualityAdvisories: base?.qualityAdvisories ?? [],
    inputTokens,
    uncachedInputTokens: Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens),
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    researchCallCount: base?.researchCallCount ?? 0,
    webSearchCallCount: base?.webSearchCallCount ?? 0,
    researchCostUsd: base?.researchCostUsd ?? 0,
    estimatedCostUsd: calls.reduce((sum, call) => sum + call.estimatedCostUsd, 0),
    totalDurationMs: calls.reduce((sum, call) => sum + (call.durationMs ?? 0), 0) +
      [...(base?.localRepairs ?? []), ...liveRepairs]
        .reduce((sum, repair) => sum + repair.durationMs, 0),
    localRepairs: [...(base?.localRepairs ?? []), ...liveRepairs],
    contextProfile: base?.contextProfile,
    liveReliability: reliability,
    calls,
  };
};

export const sendValidatedReplay = (
  send: (event: SimulationStreamEvent) => void,
  result: EngineTurnResponse,
  reliability?: LiveReliabilitySnapshot,
) => {
  const enriched = reliability && result.usage
    ? { ...result, usage: { ...result.usage, liveReliability: reliability } }
    : result;
  createNarrationCommitEvents(enriched.blocks).forEach(send);
  send({ event: "turn_sidecar", data: { result: enriched } });
  send({ event: "done", data: { validated: true, memoryApplied: true } });
};

const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];

const diagnosticKey = (value: string): string =>
  value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

export const buildFailedTurnDiagnostic = ({
  error,
  envelope,
  request,
  narration,
  authoredTurn,
  correctionApplied,
  reliability,
}: {
  error: { message?: string; code?: string };
  envelope: LivePlanEnvelope;
  request: SimulateRequest;
  narration: string;
  authoredTurn?: Record<string, unknown>;
  correctionApplied: boolean;
  reliability: LiveReliabilitySnapshot;
}): FailedTurnDiagnostic => {
  const code = error.code || "SIMULATION_STREAM_FAILED";
  const message = error.message || "실시간 본문 전송에 실패했습니다.";
  const reasons: string[] = [];
  const leakedTerm = findProtectedTerm(narration, envelope.protectedTerms);
  if (leakedTerm) reasons.push(`진명 또는 공개 전 정체 ‘${leakedTerm}’가 본문에서 감지되었습니다.`);
  if (/JSON|구조|문자열|파싱/u.test(message)) reasons.push(message);

  if (code === "FINAL_BEAT_CLOSURE_FAILED") {
    const statePatch = recordOf(authoredTurn?.statePatch);
    const signals = recordOf(authoredTurn?.claudeSignals);
    const inventory = [...request.state.inventory, ...stringList(statePatch.inventoryAdd)];
    envelope.diagnosticContract.requiredItems.forEach((item) => {
      if (!contractInventoryContainsItem(inventory, item)) {
        reasons.push(`필수 물품 ‘${item}’ 미소지로 종결 조건을 충족할 수 없습니다.`);
      }
    });
    envelope.diagnosticContract.requiredDialogue.forEach((dialogue) => {
      if (!contractSignalSatisfied(dialogue, narration)) {
        reasons.push(`필수 대사 ‘${dialogue}’가 현재 본문에 성립하지 않았습니다.`);
      }
    });
    if (envelope.diagnosticContract.completionSignals.length > 0 &&
      !envelope.diagnosticContract.completionSignals.some((signal) =>
        contractSituationSatisfied(signal, narration)
      )) {
      reasons.push(`종결 신호 ‘${envelope.diagnosticContract.completionSignals.join(" / ")}’가 관측되지 않았습니다.`);
    }
    envelope.diagnosticContract.currentBeatSignals.forEach((signal) => {
      if (!contractSignalSatisfied(signal, narration)) {
        reasons.push(`현재 비트 필수 신호 ‘${signal}’가 본문에 성립하지 않았습니다.`);
      }
    });
    if (signals.eventResolved !== true) reasons.push("마지막 비트인데 eventResolved가 true로 확정되지 않았습니다.");
    const targetLocation = envelope.diagnosticContract.targetLocation.trim();
    const finalLocation = String(statePatch.location ?? request.state.location).trim();
    if (targetLocation &&
      diagnosticKey(targetLocation) !== diagnosticKey(request.state.location) &&
      diagnosticKey(targetLocation) !== diagnosticKey(finalLocation)) {
      reasons.push(`종결 목표 장소 ‘${targetLocation}’에 현재 위치 ‘${finalLocation}’에서 도달한 근거가 없습니다.`);
    }
    const targetTime = envelope.plan.targetTime.trim();
    const finalTime = String(statePatch.time ?? request.state.time).trim();
    const clockPattern = /^(?:[01]?\d|2[0-3]):[0-5]\d$/u;
    if (clockPattern.test(targetTime) && clockPattern.test(finalTime) && targetTime !== finalTime) {
      reasons.push(`종결 목표 시간 ‘${targetTime}’과 최종 상태 시간 ‘${finalTime}’이 일치하지 않습니다.`);
    }
    if (!reasons.length) reasons.push(message.replace(/^마지막 비트 종결 실패:\s*/u, "").trim());
  }

  if (!reasons.length) reasons.push(message);
  return {
    code,
    summary: code === "FINAL_BEAT_CLOSURE_FAILED"
      ? `${envelope.diagnosticContract.eventName} 종결 검증에 실패했습니다.`
      : message,
    reasons: [...new Set(reasons.filter(Boolean))],
    ...(envelope.beatPolicy.preserveFailedDraft && narration.trim()
      ? { narration, draftKind: "narration" as const }
      : {}),
    beat: envelope.beatPolicy.beat,
    totalBeats: envelope.beatPolicy.totalBeats,
    phase: envelope.beatPolicy.phase,
    correctionApplied,
    reliability,
  };
};
