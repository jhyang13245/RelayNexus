import {
  normalizeSimulateRequest,
  runLunaInternal,
  turnSchema,
} from "../route";
import { createCortexInstantStream } from "../../../../lib/cortex-instant-stream";

import {
  SIMULATION_STREAM_CONTENT_TYPE,
  encodeSimulationStreamEvent,
  type FailedTurnDiagnostic,
  type SimulationStreamEvent,
} from "../../../../lib/simulation-stream";
import type {
  DialogueAnnotation,
  EngineCallUsage,
  EngineTurnResponse,
  SimulateRequest,
} from "../../../../lib/engine";
import { splitGraphemes } from "../../../../lib/final-turn-reveal";
import { resolveRequestApiKey } from "../../../../lib/server-api-key-policy";
import {
  drainCompletedNarration,
  extractPartialLiveBlocks,
  extractPartialJsonStringField,
  findProtectedTerm,
  findProtectedTermMatch,
  isLivePlanEnvelope,
  openAIUsageFromResponse,
  splitDisclosureSafePrefix,
  type LivePlanEnvelope,
  type LiveRuntimeRequest,
} from "../../../../lib/live-story-runtime";
import {
  buildFailedTurnDiagnostic,
  authoredTurnFromLiveBlocks,
  createLiveTimingState,
  extractOutputTextDelta,
  extractResponseOutputText,
  liveDiscardReason,
  liveReliabilitySnapshot,
  liveSidecarRequestBody,
  liveWriterRequestBody,
  mergeLiveUsage,
  narrationParagraphStartAt,
  planningFailureReliability,
  replaceLastNarrationSentence,
  requestSemanticBuildUpCorrection,
  requestProtectedParagraphCorrection,
  resolveLiveDialogueSpeaker,
  sendValidatedReplay,
  validatedReplayReliability,
  type LiveAuthoredBlock,
} from "../../../../lib/live-stream-pipeline";
import { LIVE_WRITER_PROTOCOL_VERSION } from "../../../../lib/live-writer-context";
import { isDeviceNotificationMisclassifiedAsDialogue } from "../../../../lib/live-block-classification";
import { liveCanonAnchorDriftReason, rebaseLiveCanonAnchorGuard } from "../../../../lib/live-canon-anchor";
import { correctedLiveWriterSceneClock, type LiveWriterSceneClock } from "../../../../lib/live-scene-time";
import { requireAccountContext } from "../../../../lib/account-store";
import { assertMultiplayerTurn } from "../../../../lib/multiplayer-store";
import type { MultiplayerCallCause } from "../../../../lib/multiplayer-policy";

type SimulationBody = SimulateRequest & {
  apiKey?: string;
  multiplayer?: { roomCode?: string; cause?: MultiplayerCallCause };
};

const INTERNAL_LIVE_ERROR_MESSAGE =
  "실시간 본문 안전 검사에서 내부 오류가 발생했습니다. 입력과 임시 본문은 저장되지 않았습니다.";

export const publicSimulationStreamErrorMessage = (candidate: {
  message?: string;
  code?: string;
}): string => {
  const message = String(candidate.message ?? "").trim();
  if (!message) return "실시간 본문 전송에 실패했습니다.";
  if (
    message.length > 600 ||
    /invalid regular expression|regexp|syntaxerror|(?:^|\s)at\s+\S+\s*\(/iu.test(message)
  ) {
    return INTERNAL_LIVE_ERROR_MESSAGE;
  }
  return message;
};

type LiveEngineHandler = (
  request: SimulateRequest,
  suppliedApiKey: string | undefined,
  liveRuntime: LiveRuntimeRequest,
) => Promise<EngineTurnResponse | LivePlanEnvelope>;

const STREAM_HEARTBEAT_MS = 8_000;

export const createValidatedSimulationStream = (
  bodyText: string,
  _sourceUrl: string,
  engine: LiveEngineHandler = runLunaInternal,
  fetcher: typeof fetch = fetch,
): Response => {
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: SimulationStreamEvent) => {
        if (!cancelled) controller.enqueue(encoder.encode(encodeSimulationStreamEvent(event)));
      };
      const heartbeat = setInterval(() => {
        if (!cancelled) controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, STREAM_HEARTBEAT_MS);

      void (async () => {
        const timing = createLiveTimingState();
        let narrationStarted = false;
        let planEnvelope: LivePlanEnvelope | undefined;
        let normalizedRequestForFailure: SimulateRequest | undefined;
        let observedNarrationForFailure = "";
        let authoredTurnForFailure: Record<string, unknown> | undefined;
        let protectedCorrectionApplied = false;
        let canonAnchorCorrectionTriggered = false;
        let semanticCorrectionApplied = false;
        const correctionUsages: EngineCallUsage[] = [];
        const correctionReasons: string[] = [];
        try {
          const body = JSON.parse(bodyText) as SimulationBody;
          const suppliedApiKey = body.apiKey?.trim();
          if (body.multiplayer?.roomCode) {
            const account = await requireAccountContext();
            await assertMultiplayerTurn(
              account,
              body.multiplayer.roomCode,
              body.multiplayer.cause ?? "NORMAL",
            );
          }
          send({
            event: "turn_ack",
            data: {
              phase: "planning",
              message: "요청 수신 완료 · 현재 비트와 공개 문맥을 정리하는 중",
            },
          });
          const normalizedBody = body.pack && body.state
            ? normalizeSimulateRequest(body)
            : body;
          normalizedRequestForFailure = normalizedBody;
          const planResult = await engine(normalizedBody, suppliedApiKey, { phase: "plan" });
          if (!isLivePlanEnvelope(planResult)) {
            sendValidatedReplay(
              send,
              planResult,
              validatedReplayReliability(planResult, timing),
            );
            return;
          }
          planEnvelope = planResult;
          timing.planReadyAt = Date.now();
          const futureProgressionTerms = planResult.futureProgressionTerms ?? [];
          const liveGuardTerms = [
            ...planResult.protectedTerms,
            ...futureProgressionTerms,
          ];
          const guardReason = (value: string): string =>
            findProtectedTerm(value, futureProgressionTerms)
              ? "다음 사건의 선행 진행이 감지된 문단을 현재 사건 안에서 다시 작성"
              : "비공개 정보가 감지된 문단을 공개 호칭으로 다시 작성";

          const apiKey = resolveRequestApiKey({
            suppliedKey: suppliedApiKey,
            serverKey: process.env.OPENAI_API_KEY,
            runtimeEnvironment: process.env.NODE_ENV,
          });
          if (!apiKey) {
            throw Object.assign(new Error("실시간 본문 작성을 위한 OpenAI API 키가 없습니다."), {
              code: "API_KEY_REQUIRED",
            });
          }

          send({
            event: "turn_ack",
            data: {
              phase: "writing",
              message: planResult.beatPolicy.phase === "first_draft"
                ? "Luna가 1비트 첫 문장을 생성하는 중"
                : planResult.beatPolicy.phase === "closure_build_up"
                  ? "Luna가 종결 빌드업의 첫 문장을 생성하는 중"
                  : "Luna가 마지막 비트 종결본의 첫 문장을 생성하는 중",
            },
          });
          const writerStartedAt = Date.now();
          timing.writerRequestStartedAt = writerStartedAt;
          const writerRequest = liveWriterRequestBody(
            planResult,
            turnSchema as unknown as Record<string, unknown>,
          );
          timing.writerPromptChars = JSON.stringify(writerRequest.input ?? []).length;
          timing.writerSchemaChars = JSON.stringify(writerRequest.text ?? {}).length;
          timing.writerStaticPromptChars = planResult.writerStaticPrompt.length;
          timing.writerContextChars = JSON.stringify(planResult.publicWriterContext).length;
          timing.writerPlanChars = JSON.stringify(planResult.plan).length;
          timing.writerProtocol = LIVE_WRITER_PROTOCOL_VERSION;
          const upstream = await fetcher(`${planResult.baseUrl ?? "https://api.openai.com/v1"}/responses`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify(writerRequest),
          });
          timing.writerResponseAt = Date.now();
          if (!upstream.ok || !upstream.body) {
            throw Object.assign(
              new Error(`Luna 실시간 집필 요청이 실패했습니다. (${upstream.status})`),
              { code: "LUNA_REQUEST_FAILED" },
            );
          }

          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let streamBuffer = "";
          let fullJson = "";
          let observedNarration = "";
          let publishedNarration = "";
          let pendingNarration = "";
          let firstCommit = true;
          let rawNarrationSuppressed = false;
          let directBlockMode = false;
          let directCorrectionCollapsed = false;
          let directLeakBlockIndex: number | undefined;
          const directObservedTexts: string[] = [];
          const directPublishedTexts: string[] = [];
          const directPendingTexts: string[] = [];
          const directMetadataSent: boolean[] = [];
          let writerSceneClock: LiveWriterSceneClock | null = null;
          let completedResponse: Record<string, unknown> = {};

          const sendCommit = (delta: string) => {
            if (!delta) return;
            publishedNarration += delta;
            narrationStarted = true;
            if (timing.firstSentenceAt === null) timing.firstSentenceAt = Date.now();
            send({
              event: "narration_commit",
              data: {
                blockIndex: 0,
                delta,
                ...(firstCommit
                  ? {
                      block: {
                        id: "live-narration",
                        type: "narration" as const,
                        speakerId: "",
                        speakerName: "",
                        emotion: "",
                        mediaAssetId: "",
                      },
                    }
                  : {}),
              },
            });
            firstCommit = false;
          };

          const directBlockMetadata = (
            block: ReturnType<typeof extractPartialLiveBlocks>["blocks"][number],
            blockIndex: number,
          ) => {
            const deviceNotification = block.type === "dialogue" &&
              isDeviceNotificationMisclassifiedAsDialogue({
                text: block.text,
                previousText: directObservedTexts[blockIndex - 1],
              });
            if (block.type === "narration" || deviceNotification) {
              return {
                id: `live-block-${blockIndex}`,
                type: "narration" as const,
                speakerId: "",
                speakerName: "",
                emotion: "",
                mediaAssetId: "",
              };
            }
            if (block.type !== "dialogue") {
              throw Object.assign(
                new Error(`실시간 본문 ${blockIndex + 1}번 블록 종류가 올바르지 않습니다.`),
                { code: "LUNA_RESPONSE_REJECTED" },
              );
            }
            const speaker = resolveLiveDialogueSpeaker({
              bindings: planResult.speakerBindings ?? [],
              streamId: block.speakerId,
              visibleName: block.speakerName,
            });
            return {
              id: `live-block-${blockIndex}`,
              type: "dialogue" as const,
              speakerId: speaker.speakerId,
              speakerName: speaker.speakerName,
              emotion: block.emotion,
              mediaAssetId: "",
            };
          };

          const directVisibleGraphemesBefore = (blockIndex: number): number =>
            directPublishedTexts.slice(0, blockIndex).reduce(
              (total, text) => total + splitGraphemes(text ?? "").length,
              0,
            );

          const sendDirectCommit = (
            blockIndex: number,
            delta: string,
            block: ReturnType<typeof extractPartialLiveBlocks>["blocks"][number],
          ) => {
            if (!delta || rawNarrationSuppressed) return;
            directPublishedTexts[blockIndex] = `${directPublishedTexts[blockIndex] ?? ""}${delta}`;
            narrationStarted = true;
            if (timing.firstSentenceAt === null) timing.firstSentenceAt = Date.now();
            send({
              event: "narration_commit",
              data: {
                blockIndex,
                delta,
                ...(!directMetadataSent[blockIndex]
                  ? { block: directBlockMetadata(block, blockIndex) }
                  : {}),
              },
            });
            directMetadataSent[blockIndex] = true;
          };

          const suppressDirectProtectedBlock = (
            blockIndex: number,
            reason: string,
          ) => {
            if (rawNarrationSuppressed) return;
            timing.rewindCount += 1;
            timing.correctionPassCount += 1;
            protectedCorrectionApplied = true;
            rawNarrationSuppressed = true;
            directLeakBlockIndex = blockIndex;
            send({
              event: "narration_rewind",
              data: {
                toGrapheme: directVisibleGraphemesBefore(blockIndex),
                reason,
                attempt: timing.rewindCount,
              },
            });
            directPublishedTexts.splice(blockIndex);
            directPendingTexts.splice(blockIndex);
            directMetadataSent.splice(blockIndex);
          };

          const processDirectBlocks = (
            blocks: ReturnType<typeof extractPartialLiveBlocks>["blocks"],
          ) => {
            for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
              const block = blocks[blockIndex];
              const observed = directObservedTexts[blockIndex] ?? "";
              if (!block.text.startsWith(observed)) {
                throw Object.assign(
                  new Error("실시간 본문 블록이 이미 공개된 텍스트를 다시 수정했습니다."),
                  { code: "LUNA_RESPONSE_REJECTED" },
                );
              }
              directObservedTexts[blockIndex] = block.text;
              if (rawNarrationSuppressed) continue;
              const delta = block.text.slice(observed.length);
              const pending = `${directPendingTexts[blockIndex] ?? ""}${delta}`;
              const candidate = `${directPublishedTexts[blockIndex] ?? ""}${pending}`;
              const canonDriftReason = liveCanonAnchorDriftReason(
                candidate,
                planResult.canonAnchorGuard,
              );
              if (findProtectedTerm(candidate, liveGuardTerms)) {
                suppressDirectProtectedBlock(blockIndex, guardReason(candidate));
                continue;
              }
              if (canonDriftReason) {
                canonAnchorCorrectionTriggered = true;
                suppressDirectProtectedBlock(blockIndex, canonDriftReason);
                continue;
              }
              const safe = splitDisclosureSafePrefix(pending, liveGuardTerms);
              if (safe.protectedTerm) {
                suppressDirectProtectedBlock(blockIndex, guardReason(candidate));
                continue;
              }
              if (safe.release) sendDirectCommit(blockIndex, safe.release, block);
              directPendingTexts[blockIndex] = safe.pending;
              if (block.textComplete && directPendingTexts[blockIndex]) {
                sendDirectCommit(blockIndex, directPendingTexts[blockIndex], block);
                directPendingTexts[blockIndex] = "";
              }
            }
          };

          const publishCommit = (delta: string) => {
            if (!delta || rawNarrationSuppressed) return;
            const candidate = `${publishedNarration}${delta}`;
            const protectedMatch = findProtectedTermMatch(
              candidate,
              liveGuardTerms,
            );
            const canonDriftReason = liveCanonAnchorDriftReason(
              candidate,
              planResult.canonAnchorGuard,
            );
            if (!protectedMatch && !canonDriftReason) {
              sendCommit(delta);
              return;
            }
            if (!protectedMatch && canonDriftReason) {
              canonAnchorCorrectionTriggered = true;
            }
            const paragraphStart = narrationParagraphStartAt(candidate,
              protectedMatch?.index ?? publishedNarration.length);
            const visibleParagraphStart = Math.min(paragraphStart, publishedNarration.length);
            const safePrefix = publishedNarration.slice(0, visibleParagraphStart);
            timing.rewindCount += 1;
            timing.correctionPassCount += 1;
            protectedCorrectionApplied = true;
            rawNarrationSuppressed = true;
            send({
              event: "narration_rewind",
              data: {
                toGrapheme: splitGraphemes(safePrefix).length,
                reason: protectedMatch ? guardReason(candidate) : canonDriftReason!,
                attempt: timing.rewindCount,
              },
            });
            publishedNarration = safePrefix;
            firstCommit = publishedNarration.length === 0;
          };

          const processFrame = (frame: string) => {
            const event = extractOutputTextDelta(frame);
            if (event.error) {
              throw Object.assign(new Error(event.error), { code: "LUNA_RESPONSE_REJECTED" });
            }
            if (event.completedResponse) completedResponse = event.completedResponse;
            if (!event.delta) return;
            if (timing.firstDeltaAt === null) timing.firstDeltaAt = Date.now();
            fullJson += event.delta;
            const liveBlocks = extractPartialLiveBlocks(fullJson);
            if (liveBlocks.malformed) {
              throw Object.assign(new Error("실시간 본문 블록 JSON이 손상되었습니다."), {
                code: "LUNA_RESPONSE_REJECTED",
              });
            }
            if (liveBlocks.found) {
              directBlockMode = true;
              processDirectBlocks(liveBlocks.blocks);
              return;
            }
            const narration = extractPartialJsonStringField(fullJson, "narration");
            if (narration.malformed) {
              throw Object.assign(new Error("실시간 본문의 JSON 문자열이 손상되었습니다."), {
                code: "LUNA_RESPONSE_REJECTED",
              });
            }
            if (!narration.found) return;
            if (!narration.value.startsWith(observedNarration)) {
              throw Object.assign(new Error("실시간 본문이 이미 공개된 문장을 다시 수정했습니다."), {
                code: "LUNA_RESPONSE_REJECTED",
              });
            }
            pendingNarration += narration.value.slice(observedNarration.length);
            observedNarration = narration.value;
            observedNarrationForFailure = observedNarration;
            const drained = drainCompletedNarration(pendingNarration, narration.complete);
            drained.commits.forEach(publishCommit);
            pendingNarration = drained.rest;
          };

          while (true) {
            const { done, value } = await reader.read();
            streamBuffer += decoder.decode(value, { stream: !done });
            const frames = streamBuffer.split(/\r?\n\r?\n/u);
            streamBuffer = frames.pop() ?? "";
            frames.forEach(processFrame);
            if (done) break;
          }
          if (streamBuffer.trim()) processFrame(streamBuffer);
          if (!directBlockMode) {
            const tail = drainCompletedNarration(pendingNarration, true);
            tail.commits.forEach(publishCommit);
          }
          const writerCompletedAt = Date.now();

          let rawAuthoredTurn: Record<string, unknown>;
          try {
            rawAuthoredTurn = JSON.parse(fullJson) as Record<string, unknown>;
          } catch {
            throw Object.assign(new Error("실시간 본문의 최종 JSON이 손상되었습니다."), {
              code: "LUNA_RESPONSE_REJECTED",
            });
          }
          let authoredTurn: Record<string, unknown>;
          let authoredLiveBlocks: LiveAuthoredBlock[] = [];
          let finalNarration = "";
          if (directBlockMode) {
            let converted: ReturnType<typeof authoredTurnFromLiveBlocks>;
            try {
              converted = authoredTurnFromLiveBlocks({
                rawTurn: rawAuthoredTurn,
                envelope: planResult,
              });
            } catch (error) {
              throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
                code: "LUNA_RESPONSE_REJECTED",
              });
            }
            authoredTurn = converted.turn;
            authoredLiveBlocks = converted.blocks;
            writerSceneClock = converted.writerSceneClock;
            finalNarration = String(authoredTurn.narration ?? "");
            const rawBlocks = Array.isArray(rawAuthoredTurn.b)
              ? rawAuthoredTurn.b as Array<Record<string, unknown>>
              : Array.isArray(rawAuthoredTurn.liveBlocks)
                ? rawAuthoredTurn.liveBlocks as Array<Record<string, unknown>>
                : [];
            if (
              rawBlocks.length !== directObservedTexts.length ||
              rawBlocks.some((block, index) =>
                String(block.t ?? block.text ?? "") !== directObservedTexts[index]
              )
            ) {
              throw Object.assign(
                new Error("실시간 본문 블록과 최종 JSON의 본문이 일치하지 않습니다."),
                { code: "LUNA_RESPONSE_REJECTED" },
              );
            }
            publishedNarration = finalNarration;
            observedNarrationForFailure = finalNarration;
          } else {
            authoredTurn = rawAuthoredTurn;
            finalNarration = typeof authoredTurn.narration === "string"
              ? authoredTurn.narration
              : "";
            if (!finalNarration || finalNarration !== observedNarration) {
              throw Object.assign(new Error("실시간 본문과 최종 JSON의 본문이 일치하지 않습니다."), {
                code: "LUNA_RESPONSE_REJECTED",
              });
            }
          }
          authoredTurnForFailure = authoredTurn;
          if (rawNarrationSuppressed) {
            const futureGuardTriggered = Boolean(
              findProtectedTerm(finalNarration, futureProgressionTerms),
            );
            const correctionKind = canonAnchorCorrectionTriggered
              ? "chronology" as const
              : futureGuardTriggered ? "future" as const : "protected" as const;
            const correction = await requestProtectedParagraphCorrection({
              fetcher,
              apiKey,
              envelope: planResult,
              narration: finalNarration,
              guardTerms: liveGuardTerms,
              guardKind: correctionKind,
            });
            correctionReasons.push(...correction.reasons);
            if (correction.usage) correctionUsages.push(correction.usage);
            let correctedNarration = correction.narration;
            if (findProtectedTerm(correctedNarration, liveGuardTerms)) {
              throw Object.assign(new Error("문단 교정본에 보호 정보 또는 다음 사건 선행 내용이 남았습니다."), {
                code: "NARRATIVE_REWRITE_FAILED",
              });
            }
            const postCorrectionGuard = canonAnchorCorrectionTriggered
              ? rebaseLiveCanonAnchorGuard(planResult.canonAnchorGuard, planResult.plan.targetTime, false)
              : planResult.canonAnchorGuard;
            const remainingCanonDrift = liveCanonAnchorDriftReason(
              correctedNarration,
              postCorrectionGuard,
            );
            if (remainingCanonDrift) {
              const chronologyCorrection = await requestProtectedParagraphCorrection({
                fetcher,
                apiKey,
                envelope: planResult,
                narration: correctedNarration,
                guardTerms: liveGuardTerms,
                guardKind: "chronology",
              });
              correctedNarration = chronologyCorrection.narration;
              correctionReasons.push(...chronologyCorrection.reasons);
              if (chronologyCorrection.usage) correctionUsages.push(chronologyCorrection.usage);
            }
            if (liveCanonAnchorDriftReason(correctedNarration,
              rebaseLiveCanonAnchorGuard(planResult.canonAnchorGuard, planResult.plan.targetTime, false))) {
              throw Object.assign(new Error("문단 교정본이 현재 정사 시각·장소를 다시 벗어났습니다."), {
                code: "NARRATIVE_REWRITE_FAILED",
              });
            }
            if (directBlockMode) {
              const leakIndex = directLeakBlockIndex ?? 0;
              const prefixBlocks = authoredLiveBlocks.slice(0, leakIndex);
              const prefixText = prefixBlocks.map((block) =>
                block.type === "dialogue" ? `“${block.text}”` : block.text
              ).join("\n\n");
              const canonicalPrefix = prefixText ? `${prefixText}\n\n` : "";
              if (!correctedNarration.startsWith(canonicalPrefix)) {
                throw Object.assign(
                  new Error("문단 교정이 이미 확정된 앞 블록을 변경했습니다."),
                  { code: "LIVE_SEMANTIC_CORRECTION_FAILED" },
                );
              }
              const correctedTail = correctedNarration.slice(canonicalPrefix.length);
              rawNarrationSuppressed = false;
              directCorrectionCollapsed = true;
              directPublishedTexts[leakIndex] = correctedTail;
              directMetadataSent[leakIndex] = true;
              if (correctedTail) {
                send({
                  event: "narration_commit",
                  data: {
                    blockIndex: leakIndex,
                    delta: correctedTail,
                    block: {
                      id: `live-block-${leakIndex}`,
                      type: "narration",
                      speakerId: "",
                      speakerName: "",
                      emotion: "",
                      mediaAssetId: "",
                    },
                  },
                });
              }
              publishedNarration = correctedNarration;
            } else {
              if (!correctedNarration.startsWith(publishedNarration)) {
                throw Object.assign(new Error("문단 교정이 이미 확정된 앞 문단을 변경했습니다."), {
                  code: "LIVE_SEMANTIC_CORRECTION_FAILED",
                });
              }
              const correctedTail = drainCompletedNarration(
                correctedNarration.slice(publishedNarration.length),
                true,
              );
              correctedTail.commits.forEach(sendCommit);
            }
            authoredTurn = { ...authoredTurn, narration: correctedNarration };
            finalNarration = correctedNarration;
            authoredTurnForFailure = authoredTurn;
          }

          if (
            planResult.beatPolicy.phase === "closure_build_up" &&
            planResult.beatPolicy.correctionLimit > 0
          ) {
            timing.semanticAuditCount += 1;
            const semantic = await requestSemanticBuildUpCorrection({
              fetcher,
              apiKey,
              envelope: planResult,
              authoredTurn,
            });
            correctionUsages.push(semantic.usage);
            if (!semantic.adequate) {
              const edit = replaceLastNarrationSentence(publishedNarration, semantic.replacementSentence);
              semanticCorrectionApplied = true;
              timing.correctionPassCount += 1;
              correctionReasons.push(semantic.reason || "종결 빌드업 의미 교정");
              timing.rewindCount += 1;
              if (directBlockMode) {
                const blockIndex = Math.max(0, directPublishedTexts.length - 1);
                const oldBlockText = directPublishedTexts[blockIndex] ?? "";
                const blockEdit = replaceLastNarrationSentence(
                  oldBlockText,
                  semantic.replacementSentence,
                );
                const rewindToGrapheme = directVisibleGraphemesBefore(blockIndex) +
                  blockEdit.rewindToGrapheme;
                send({
                  event: "narration_rewind",
                  data: {
                    toGrapheme: rewindToGrapheme,
                    reason: semantic.reason || "종결 빌드업을 개연성 있게 연결하는 문장 교정",
                    attempt: timing.rewindCount,
                  },
                });
                directPublishedTexts[blockIndex] = blockEdit.narration;
                publishedNarration = edit.narration;
                const sourceBlock = authoredLiveBlocks[blockIndex];
                const dialogueAnnotations = Array.isArray(authoredTurn.dialogueAnnotations)
                  ? (authoredTurn.dialogueAnnotations as Array<Record<string, unknown>>).map(
                      (annotation) => String(annotation.quote ?? "") === oldBlockText
                        ? { ...annotation, quote: blockEdit.narration }
                        : annotation,
                    )
                  : [];
                authoredTurn = {
                  ...authoredTurn,
                  narration: publishedNarration,
                  dialogueAnnotations,
                };
                send({
                  event: "narration_commit",
                  data: {
                    blockIndex,
                    delta: blockEdit.delta,
                    ...(blockEdit.rewindToGrapheme === 0
                      ? {
                          block: directCorrectionCollapsed || !sourceBlock || sourceBlock.type === "narration"
                            ? {
                                id: `live-block-${blockIndex}`,
                                type: "narration" as const,
                                speakerId: "",
                                speakerName: "",
                                emotion: "",
                                mediaAssetId: "",
                              }
                            : {
                                id: `live-block-${blockIndex}`,
                                type: "dialogue" as const,
                                speakerId: sourceBlock.speakerId,
                                speakerName: sourceBlock.speakerName,
                                emotion: sourceBlock.emotion,
                                mediaAssetId: "",
                              },
                        }
                      : {}),
                  },
                });
              } else {
                send({
                  event: "narration_rewind",
                  data: {
                    toGrapheme: edit.rewindToGrapheme,
                    reason: semantic.reason || "종결 빌드업을 개연성 있게 연결하는 문장 교정",
                    attempt: timing.rewindCount,
                  },
                });
                publishedNarration = edit.narration;
                authoredTurn = { ...authoredTurn, narration: publishedNarration };
                send({
                  event: "narration_commit",
                  data: {
                    blockIndex: 0,
                    delta: edit.delta,
                    ...(edit.rewindToGrapheme === 0
                      ? {
                          block: {
                            id: "live-narration",
                            type: "narration" as const,
                            speakerId: "",
                            speakerName: "",
                            emotion: "",
                            mediaAssetId: "",
                          },
                        }
                      : {}),
                  },
                });
              }
              authoredTurnForFailure = authoredTurn;
            }
          }

          const acceptedSceneClock = writerSceneClock
            ? correctedLiveWriterSceneClock({
                clock: writerSceneClock,
                plan: planResult.plan,
                chronologyCorrected: canonAnchorCorrectionTriggered,
              })
            : null;
          if (planResult.splitSidecar) {
            const acceptedNarration = String(authoredTurn.narration ?? "");
            const acceptedDialogueAnnotations = Array.isArray(authoredTurn.dialogueAnnotations)
              ? authoredTurn.dialogueAnnotations as DialogueAnnotation[]
              : [];
            const sidecarStartedAt = Date.now();
            const sidecarResponse = await fetcher(`${planResult.baseUrl ?? "https://api.openai.com/v1"}/responses`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(liveSidecarRequestBody(
                planResult,
                turnSchema as unknown as Record<string, unknown>,
                acceptedNarration,
                acceptedDialogueAnnotations,
                acceptedSceneClock?.marks,
              )),
            });
            if (!sidecarResponse.ok) {
              throw Object.assign(
                new Error(`본문 후 상태 정산 요청이 실패했습니다. (${sidecarResponse.status})`),
                { code: "LUNA_REQUEST_FAILED" },
              );
            }
            const sidecarBody = await sidecarResponse.json() as Record<string, unknown>;
            let rawSidecar: Record<string, unknown>;
            try {
              rawSidecar = JSON.parse(extractResponseOutputText(sidecarBody)) as Record<string, unknown>;
            } catch {
              throw Object.assign(new Error("본문 후 상태 정산 JSON이 손상되었습니다."), {
                code: "LUNA_RESPONSE_REJECTED",
              });
            }
            authoredTurn = {
              ...rawSidecar,
              narration: acceptedNarration,
              dialogueAnnotations: acceptedDialogueAnnotations,
            };
            authoredTurnForFailure = authoredTurn;
            correctionUsages.push(openAIUsageFromResponse(
              sidecarBody,
              "live_sidecar",
              3,
              "none",
              Math.max(0, Date.now() - sidecarStartedAt),
            ));
          }
          if (acceptedSceneClock) {
            authoredTurn = {
              ...authoredTurn,
              statePatch: {
                ...(authoredTurn.statePatch as Record<string, unknown>),
                time: acceptedSceneClock.time,
                dayDelta: acceptedSceneClock.dayDelta,
              },
              writerSceneClock: {
                time: acceptedSceneClock.time,
                dayDelta: acceptedSceneClock.dayDelta,
              },
            };
          }

          const finalized = await engine(normalizedBody, suppliedApiKey, {
            phase: "finalize",
            turn: authoredTurn,
            beatPolicy: planResult.beatPolicy,
          });
          if (isLivePlanEnvelope(finalized)) {
            throw new Error("실시간 본문 상태 확정 단계가 잘못 연결되었습니다.");
          }
          const writerUsage = openAIUsageFromResponse(
            completedResponse,
            "live_writer",
            2,
            planResult.reasoningEffort,
            Math.max(0, writerCompletedAt - writerStartedAt),
          );
          const reliability = liveReliabilitySnapshot({
            envelope: planResult,
            timing,
            correctionReasons,
            discarded: false,
            discardReason: null,
          });
          const result: EngineTurnResponse = {
            ...finalized,
            usage: mergeLiveUsage({
              result: finalized,
              planUsage: planResult.planUsage,
              writerUsage,
              correctionUsages,
              envelope: planResult,
              correctionReasons,
              reliability,
            }),
          };
          send({ event: "turn_sidecar", data: { result } });
          send({ event: "done", data: { validated: true, memoryApplied: true } });
        } catch (error) {
          const candidate = error as {
            message?: string;
            code?: string;
            diagnostic?: FailedTurnDiagnostic;
          };
          const reliability = planEnvelope
            ? liveReliabilitySnapshot({
                envelope: planEnvelope,
                timing,
                correctionReasons,
                discarded: true,
                discardReason: liveDiscardReason(candidate),
              })
            : undefined;
          const inheritedDiagnostic = candidate.diagnostic;
          const diagnostic = inheritedDiagnostic
            ? {
                ...inheritedDiagnostic,
                reliability: inheritedDiagnostic.reliability ?? planningFailureReliability(
                  inheritedDiagnostic,
                  timing,
                  liveDiscardReason(candidate),
                ),
              }
            : planEnvelope && normalizedRequestForFailure
              ? buildFailedTurnDiagnostic({
                error: candidate,
                envelope: planEnvelope,
                request: normalizedRequestForFailure,
                narration: observedNarrationForFailure,
                authoredTurn: authoredTurnForFailure,
                correctionApplied: protectedCorrectionApplied || semanticCorrectionApplied,
                reliability: reliability!,
              })
              : undefined;
          if (narrationStarted) {
            send({
              event: "turn_abort",
              data: {
                reason: diagnostic?.summary ??
                  "본문 안전 검사 또는 최종 구조 확정에 실패해 임시 본문을 제거했습니다.",
                ...(diagnostic ? { diagnostic } : {}),
              },
            });
          }
          send({
            event: "error",
            data: {
              error: publicSimulationStreamErrorMessage(candidate),
              code: candidate.code || "SIMULATION_STREAM_FAILED",
              ...(diagnostic ? { diagnostic } : {}),
            },
          });
        } finally {
          clearInterval(heartbeat);
          if (!cancelled) controller.close();
        }
      })();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": SIMULATION_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
};

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();
    if (bodyText.length > 2_000_000) return Response.json({ error: "요청 크기 제한 초과" }, { status: 413 });
    const body = JSON.parse(bodyText);
    if (body.cortexInstant === true) return createCortexInstantStream(body);
    return createValidatedSimulationStream(bodyText, request.url);
  } catch {
    return Response.json(
      { error: "요청 데이터를 읽을 수 없습니다." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
