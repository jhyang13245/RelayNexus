import { NextResponse } from "next/server";
import { resolveRequestApiKey } from "../../../lib/server-api-key-policy";
import { normalizeModelProvider, providerEndpoint } from "../../../lib/model-provider";
import { upgradeLunaModel } from '../../../public/cortex-luna-model.mjs';
import { textCostUsd } from "../../../lib/api-cost";
import {
  createMockTurn,
  synchronizeGeneratedTurnChronology,
  type DialogueAnnotation,
  type EncounteredCharacterAddition,
  type EngineAuditReason,
  type EngineCallUsage,
  type EngineCallStage,
  type EngineReasoningEffort,
  type EngineTurnResponse,
  type EngineUsage,
  type SimulateRequest,
} from "../../../lib/engine";
import {
  characterVisualAssetId,
  createId,
  defaultAutonomyRuntime,
  defaultRelationshipMemoryRuntime,
  defaultStatusWindow,
  isTriggerBoundMediaAsset,
  isPlayerAgencyViolation,
  normalizeImageQuality,
  normalizeSceneImageInterval,
  resolveDeclaredCharacterAlias,
  resolveTrustedDialogueCharacter,
  resolveVisibleCharacterAlias,
  scenarioMediaAssetMatchesSceneContext,
  selectCharacterReferenceAsset,
  selectEventCharacterReferenceIds,
  selectEventTriggeredMediaAsset,
  selectSceneCharacterReferenceIds,
  selectScenarioMediaAsset,
  selectSaberSummoningMediaAsset,
  selectTriggeredScenarioMediaAsset,
  scenarioOpeningTime,
  visibleCharacterAliases,
  type CharacterVisualCue,
  type CharacterResearchCacheEntry,
  type SessionCanonUpdate,
  type ScenarioPack,
  type StoryBlock,
} from "../../../lib/scenario";
import {
  normalizeRuntimeAutonomyActors,
  normalizeRuntimeRelations,
  normalizeRuntimeRelationshipMemories,
  sanitizeAutonomyActionPatches,
  sanitizeRelationshipMemoryPatches,
  selectAutonomyCandidates,
  type AutonomyActionPatch,
  type RelationshipMemoryPatch,
} from "../../../lib/autonomy";
import {
  normalizeRuntimeStatusLedger,
  sanitizeStatusLedgerChanges,
} from "../../../lib/status-window";
import {
  compactPromptSection,
  MAX_STATIC_PROMPT_CHARS,
  sanitizePromptCacheKey,
} from "../../../lib/prompt-context";
import {
  package15RevealGuards,
  runtimePredicateSatisfied,
} from "../../../lib/package15-runtime";
import {
  compileSceneContext,
  contextProfileWithPromptSizes,
  MAX_PLAYER_INPUT_CHARS,
} from "../../../lib/scene-context-compiler";
import { selectEligibleTriggeredMedia } from "../../../lib/image-trigger-runtime";
import { instantRelationshipDisplayPrompt } from "../../../lib/relationship-display-prompt";
import {
  characterStillAvailableInScene,
  findUnobservedExactTerms,
  sanitizeRecommendedReplies,
} from "../../../lib/disclosure";
import {
  analyzeNarrativeMomentum,
  assessGeneratedMomentum,
} from "../../../lib/narrative-momentum";
import {
  assessStoryDrive,
  buildStoryDriveCorrection,
  deriveStoryDrive,
  requiredEventItems,
  saberSummoningIsVisible,
  STORY_ROUTE_PROGRESS_VARIABLE_ID,
  storyRouteProgressVariable,
  type StoryDrive,
} from "../../../lib/story-director";
import {
  analyzeSceneFocus,
  assessSceneFocus,
} from "../../../lib/scene-focus";
import {
  assessServantBond,
  deriveServantBondDirection,
} from "../../../lib/servant-bond";
import {
  compoundBeatProgressVariable,
  compoundBeatPrompt,
  compoundBeatVariableId,
  NEXUS_COMPOUND_BEAT_PREFIX,
} from "../../../lib/nexus-guard";
import {
  adjudicateClaudeTurn,
  buildClaudeRuntimePrompt,
  CLAUDE_RUNTIME_VARIABLE_ID,
  claudeClosurePressureActive,
  claudeRuntimeVariable,
  claudeSignalViolations,
  deriveClaudeTurnIntent, confirmClaudeClosureFromEvidence,
  forcedClaudeClosureViolations, missingClaudeContract,
  readClaudeRuntime,
  type ClaudeTurnIntent,
  type ClaudeTurnSignals,
} from "../../../lib/claude-runtime";
import {
  deriveNarrativeSceneContract,
  inputContainsExecutedMovement,
  inputContainsSpeech,
  narrativeSceneContractPrompt,
} from "../../../lib/narrative-kernel";
import {
  deriveSceneFactContract,
} from "../../../lib/scene-fact";
import {
  resolveWorkAdapter,
  resolveWorkAdapterByRouteId,
} from "../../../lib/work-adapters";
import { buildDirectExecutionRescuePrompt } from "../../../lib/simulation-prompt";
import { assessDirectSceneFact } from "../../../lib/simulation-pipeline";
import {
  deriveUserCanonIntent,
  sanitizeSessionCanonUpdates,
  userCanonIntentHandled,
} from "../../../lib/session-canon";
import { FATE_SEOUL_IDENTITY } from "../../../lib/work-adapters/fate-seoul";
import type { RequiredEventReroute } from "../../../lib/work-adapters/fate-seoul-recovery";
import { contractItemMentioned, contractSituationSatisfied, splitContractSignals } from "../../../lib/contract-signals";
import { requiredEventRerouteTurnSatisfied } from "../../../lib/required-event-reroute";
import {
  LIVE_PLAN_KIND,
  correctProtectedTermsOnce,
  findProtectedTerm,
  livePlanDeveloperPrompt,
  liveScenePlanSchema,
  liveSpeakerBindingsFromContext,
  openAIUsageFromResponse,
  publicWriterContextFromScene,
  sanitizeProtectedTerms,
  replaceProtectedTermMatches,
  type LivePlanEnvelope,
  type LiveRuntimeRequest,
  type LiveScenePlan,
} from "../../../lib/live-story-runtime";
import { buildLiveWriterStaticPrompt, FINAL_LIVE_CONTEXT_BUDGET,
  liveWriterContextFromScene, ORDINARY_LIVE_CONTEXT_BUDGET } from "../../../lib/live-writer-context";
import {
  deriveLiveBeatPolicy,
  firstBeatInstantPlan,
  liveFinalDisclosureBlocked,
  livePhaseWriterInstruction,
  middleBeatMicroPlan,
} from "../../../lib/live-beat-policy";
import { finalResponseNarration, type FailedTurnDiagnostic } from "../../../lib/simulation-stream";
import { futureEventGuardTerms } from "../../../lib/future-event-guard";
import { ensureElapsedTimeForLiveTurn, finalNarrativeChronologyMismatchReason } from "../../../lib/live-turn-time";
import { appendPlannedRecoveryPrompt, hardenChronologyInterruptionPlan, hardenPlannedRecoveryPlan, isPlannedTurnRecovery, liveCanonAnchorGuardForPlan, normalizePlannedRecoveryRequest, plannedRecoveryWriterInstruction } from "../../../lib/planned-turn-recovery";
import {
  compactDisclosureTerm,
  containsDeterministicRecoveryProse,
  firstDiegeticEventSentence,
  hiddenFutureEventLeaks,
  narrativeControlLeaks,
  publicTurnText,
} from "../../../lib/narrative-output-safety";
export const runtime = "nodejs";
const BUILT_IN_DEMO_PROJECT_IDS = new Set(["RN-AI-KI-ACADEMY-001", "RN-DEMO-GISEONG-INSTANT-001"]);
const SABER_PRE_REVEAL_ALIAS = FATE_SEOUL_IDENTITY.publicSaberAlias;
const SABER_CLASS_TERMS = [...FATE_SEOUL_IDENTITY.classTerms];
const SABER_CLASS_PATTERN = FATE_SEOUL_IDENTITY.saberClassPattern;
const SABER_CLASS_REVEAL_PATTERN =
  FATE_SEOUL_IDENTITY.saberClassRevealPattern;
const SABER_DIALOGUE_REVEAL_PATTERN =
  FATE_SEOUL_IDENTITY.saberDialogueRevealPattern;
const CANONICAL_MASTER_QUESTION =
  FATE_SEOUL_IDENTITY.canonicalMasterQuestion;
const STORY_SCENE_PROGRESS_VARIABLE_ID = "RELAY_SERVER_SCENE_PHASE_PROGRESS";
const RESIDENTIAL_LOCATION_PATTERN =
  /(?:^|의|\s)(?:집|자택|주택|아파트|원룸|기숙사|숙소|거처|침실|방)(?:$|\s)/u;
const PUBLIC_VENUE_EVENT_PATTERN =
  /캠퍼스|대학교|대학|학교|박물관|별관|도서관|공원|광장|지하철역|기차역|전철역|역사|정류장|식당|카페|상점|사무실|직장|안내도/u;
const HUMAN_ENCOUNTER_EVENT_PATTERN =
  /만나|만남|마주|대면|길을?\s*묻|안내|방문|연구자|대화|소개/u;
const GENERIC_UNNAMED_CHARACTER_PATTERN =
  /(?:^|[\s·_/-])(?:정체불명(?:의)?\s*)?(?:인물|사람|남자|여자|여성|남성|소년|소녀|목소리|화자|행인|목격자|직원|담당자|기사|경비원|관리자|안내원|접수원)(?:$|[\s·_/-])/u;
const runtimeKnownCharacterAliases = (request: SimulateRequest) => {
  const canonicalIds = new Set([
    request.pack.player.id,
    ...request.pack.npcs.map((character) => character.id),
  ]);
  const aliases: Array<{ alias: string; characterId: string }> = [];
  const add = (alias = "", characterId = "") => {
    const value = alias.trim();
    const id = characterId.trim();
    if (!value || !canonicalIds.has(id)) return;
    if (aliases.some((entry) => entry.alias === value && entry.characterId === id)) return;
    aliases.push({ alias: value, characterId: id });
  };
  (request.state.characterVisuals ?? []).forEach((profile) =>
    add(profile.characterName, profile.characterId)
  );
  (request.state.relations ?? []).forEach((relation) =>
    add(relation.name, relation.characterId)
  );
  request.recentTurns.forEach((turn) =>
    turn.blocks.forEach((block) => add(block.speakerName, block.speakerId))
  );
  return aliases;
};
const resolveTrustedDialogueSpeaker = (request: SimulateRequest, rawId = "", rawName = "") =>
  resolveTrustedDialogueCharacter(
    request.pack, rawId, rawName, runtimeKnownCharacterAliases(request),
  );

const requiredEncounterContext = (
  request: SimulateRequest,
  drive: StoryDrive,
): string => {
  const event = request.pack.events.find((candidate) =>
    candidate.id === drive.routeLock.currentEventId
  );
  const speaker = request.pack.npcs.find((npc) =>
    npc.id === drive.routeLock.requiredSpeakerId
  );
  return [
    drive.routeLock.phase,
    event?.name,
    event?.description,
    event?.effects,
    ...drive.routeLock.completionSignals,
    ...drive.routeLock.recoveryAlternatives,
    speaker?.name,
    speaker?.role,
    speaker?.publicInfo,
  ].filter(Boolean).join(" ");
};

const isAdapterPublicEncounter = (
  request: SimulateRequest,
  drive: StoryDrive,
): boolean => resolveWorkAdapter(request.pack)?.isPublicEncounter(
  request,
  drive,
) ?? false;

/**
 * A required first meeting may wait for a compatible location. It must never
 * be recovered by teleporting the NPC to the player's home.
 */
const shouldStageRequiredEncounterLocation = (
  request: SimulateRequest,
  drive: StoryDrive,
): boolean => {
  if (!drive.routeLock.active) return false;
  const adapterDecision = resolveWorkAdapter(request.pack)
    ?.shouldStageRequiredEncounterLocation(request, drive);
  if (adapterDecision !== undefined) return adapterDecision;
  const location = request.state.location.normalize("NFKC");
  if (drive.routeLock.phase !== "required_event") return false;
  const context = requiredEncounterContext(request, drive);
  return RESIDENTIAL_LOCATION_PATTERN.test(location) &&
    PUBLIC_VENUE_EVENT_PATTERN.test(context) &&
    HUMAN_ENCOUNTER_EVENT_PATTERN.test(context);
};

const IDENTITY_GENERIC_TERMS = new Set([
  "saber",
  "servant",
  "세이버",
  "서번트",
  "진명",
  "본명",
  "미공개",
  "비공개",
  "정체",
  "소녀",
  "검사",
  "클래스",
  "여성",
  "영령",
  "또는",
  "혹은",
  "그리고",
  "하지만",
  "아직",
  "않는다",
  "공개하지",
  "공개한다",
  "밝히지",
  "말하지",
  "역사적",
  "인물",
]);

const protectedSaberIdentityTerms = (pack: ScenarioPack): string[] => {
  const terms = new Set<string>();
  pack.npcs
    .filter((npc) =>
      /(?:^|\b)saber(?:\b|$)|세이버/iu.test(
        `${npc.role} ${npc.affiliation} ${npc.publicInfo} ${npc.hiddenInfo}`,
      )
    )
    .forEach((npc) => {
      if (
        !/(?:소녀|검사|세이버|saber|서번트|servant|미공개|정체불명)/iu.test(
          npc.name,
        )
      ) {
        terms.add(npc.name.normalize("NFKC").trim());
      }
      for (const match of npc.hiddenInfo.matchAll(
        /(?:진명|본명|true\s*name)\s*(?:은|는|이|가|:|：|-)?\s*([^,.;\n|]{2,48})/giu,
      )) {
        const source = (match[1] ?? "").normalize("NFKC").trim();
        const nameTokens: string[] = [];
        for (const token of source.match(/[가-힣]{2,8}|[A-Za-z][A-Za-z'-]{1,24}/g) ?? []) {
          const key = token.toLowerCase();
          if (IDENTITY_GENERIC_TERMS.has(key) ||
            /(?:공개|누설|금지|말하지|밝히지|드러내지|않는다)/u.test(token)) {
            break;
          }
          nameTokens.push(token);
          if (nameTokens.length >= 3) break;
        }
        nameTokens.forEach((token) => terms.add(token));
        if (nameTokens.length > 1) terms.add(nameTokens.join(" "));
      }
    });
  return sanitizeProtectedTerms([...terms]).slice(0, 24);
};

const containsSaberClassTerm = (value: string): boolean =>
  SABER_CLASS_PATTERN.test(value);

const saberClassWasExplicitlyObserved = (value: string): boolean =>
  SABER_CLASS_REVEAL_PATTERN.test(value);

const firstSaberClassUseIsExplicitReveal = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
): boolean => {
  for (const block of turn.blocks) {
    if (containsSaberClassTerm(block.speakerName ?? "")) return false;
    if (!containsSaberClassTerm(block.text)) continue;
    return SABER_CLASS_REVEAL_PATTERN.test(block.text) ||
      (block.type === "dialogue" && SABER_DIALOGUE_REVEAL_PATTERN.test(block.text));
  }
  return false;
};

const splitInitialInventory = (value: string): string[] =>
  value
    .split(/[,;|\n]/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

type RequiredContinuity = {
  active: boolean;
  eventId: string;
  eventName: string;
  senderName: string;
  requiredItems: string[];
  deliveryLike: boolean;
  recoveryAlternatives: string[];
};

const EVENT_CANCELLATION_PATTERN =
  /(?:일어나지\s*않|발생하지\s*않|없던\s*일|취소|무산|사라졌|없어졌|피했|피한다|벗어났|벗어난다|따돌렸|따돌린다|오지\s*않|나타나지\s*않|가지\s*않|안\s*(?:가|갈)|거절|만나지\s*않|대화하지\s*않|소환되지\s*않|작동하지\s*않|꺼지지\s*않|공격하지\s*않|전투하지\s*않|열지\s*않|받지\s*않|무시|생까|제쳐\s*두|내버려\s*두|버려\s*두|방치)/u;

const routeTopicPattern = (routeId: string, phase: string): RegExp =>
  resolveWorkAdapterByRouteId(routeId)?.routeTopicPattern(phase) ?? /사건|전개/u;

const eventRerouteAlternatives = (routeId: string, phase: string): string[] =>
  resolveWorkAdapterByRouteId(routeId)?.rerouteAlternatives(phase) ??
    ["NPC의 독립 행동", "환경 변화", "시간 고정 사건의 다른 장소 발생"];

const deriveRequiredEventReroute = (
  request: SimulateRequest,
  drive: StoryDrive,
  intent: ClaudeTurnIntent,
): RequiredEventReroute => {
  const explicitCancellation = EVENT_CANCELLATION_PATTERN.test(request.userText);
  const targetsCurrentEvent = drive.routeLock.phase === "required_event" ||
    routeTopicPattern(drive.routeLock.routeId, drive.routeLock.phase).test(request.userText) ||
    /(?:이|그|해당)\s*(?:사건|일|장면)/u.test(request.userText);
  const active = drive.routeLock.active && (
    intent.explicitDerailment || (explicitCancellation && targetsCurrentEvent)
  );
  const mode: RequiredEventReroute["mode"] = active
    ? "immediate_absorb"
    : "inactive";
  return {
    active,
    mode,
    routeId: active ? drive.routeLock.routeId : "",
    eventId: active ? drive.routeLock.currentEventId : "",
    eventName: active ? drive.routeLock.currentEventName : "",
    phase: active ? drive.routeLock.phase : "",
    policy: active
      ? "사용자의 목적·욕구를 취소하지 않는다. 목적지와 시간 계획을 본문에 구체적으로 남기고, 경로 저장·준비·출발 같은 실행 가능한 첫 행동을 실제로 반영한다. 그 동선에 활성 필수 사건이 외부 연락·마감·우연한 조우·환경 방해·안전상 우회로 자연스럽게 끼어들게 하며, 기본 결과는 포기가 아니라 잠시 보류하거나 순서를 바꾸는 것이다. '생각을 접었다' 한 문장만으로 정사로 전환하면 실패다. 현재 필수 사건의 이동·행동·결과·물품 획득을 실제 장면으로 완성하고, 장시간 계획은 아직 실행되지 않은 부분만 월드 시간에 반영하지 않는다. 현재 사건을 완료하되 다음 사건은 시작하지 않는다."
      : "",
    alternatives: active
      ? drive.routeLock.recoveryAlternatives.length
        ? drive.routeLock.recoveryAlternatives
        : eventRerouteAlternatives(drive.routeLock.routeId, drive.routeLock.phase)
      : [],
    completionSignals: active ? drive.routeLock.completionSignals : [],
    requiredItems: active ? drive.routeLock.requiredItems : [],
    requiredDialogue: active ? drive.routeLock.requiredDialogue : "",
    requiredSpeakerId: active ? drive.routeLock.requiredSpeakerId : "",
    destinationHint: active ? intent.destinationHint : "",
    requestedEndTime: active ? intent.requestedEndTime : "",
    preservePlayerIntent: active,
    resolveCurrentEvent: false,
    currentBeatSignals: [],
  };
};

const requiredEventRerouteSatisfied = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  reroute: RequiredEventReroute,
): boolean => requiredEventRerouteTurnSatisfied({
  turn,
  reroute,
  phaseSatisfied: resolveWorkAdapterByRouteId(reroute.routeId)?.rerouteSatisfied({
    phase: reroute.phase,
    eventId: reroute.eventId,
    text: publicTurnText(turn),
  }),
});

const deriveRequiredContinuity = (
  request: SimulateRequest,
  drive: StoryDrive,
  preTurnObservation: string,
): RequiredContinuity => {
  const lockedEvent = request.pack.events.find(
    (candidate) => candidate.id === drive.routeLock.currentEventId,
  );
  const event = lockedEvent && requiredEventItems(lockedEvent).length > 0
    ? lockedEvent
    : drive.routeLock.phase === "ordinary_before_parcel" &&
        /(?:택배|보관함|상자|봉투|내용물|수령)/u.test(request.userText)
      ? request.pack.events.find((candidate) =>
          /(?:택배|보관함|배송|수령)/u.test(
            `${candidate.name} ${candidate.description} ${candidate.effects}`,
          ) && requiredEventItems(candidate).length > 0
        )
      : undefined;
  if (!event) {
    return {
      active: false,
      eventId: "",
      eventName: "",
      senderName: "",
      requiredItems: [],
      deliveryLike: false,
      recoveryAlternatives: [],
    };
  }
  const requiredItems = requiredEventItems(event)
    .filter((item) => !containsDisclosureTerm(preTurnObservation, item));
  const userDivertedRequiredOutcome =
    /(?:뿐(?:이었|이다|이었다)?|대신|없었|없다|비어|빈\s*칸|아무것도|돈\s*뭉치|현금|사라졌|분실|버렸|파손|다른\s*(?:물건|내용물))/u.test(
      request.userText,
    ) &&
    (event.required ||
      /(?:택배|보관함|상자|봉투|내용물|물품|수령|전달)/u.test(
        `${event.name} ${event.description} ${event.effects} ${request.userText}`,
      ));
  const deliveryLike = /(?:택배|보관함|배송|상자|봉투|수령|발송인)/u.test(
    `${event.name} ${event.description} ${event.effects}`,
  );
  return {
    active: userDivertedRequiredOutcome && requiredItems.length > 0,
    eventId: event.id,
    eventName: event.name,
    senderName: `${event.name} ${event.description}`.match(
      /발송인\s*[:：]?\s*([가-힣A-Za-z·]{2,30})/u,
    )?.[1] ?? "",
    requiredItems,
    deliveryLike,
    recoveryAlternatives: (event.recoveryAlternatives ?? "")
      .split(/[|;\n]/u)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8),
  };
};

const missingRequiredContinuityItems = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  continuity: RequiredContinuity,
): string[] => {
  if (!continuity.active) return [];
  const publicText = publicTurnText(turn);
  const acquired = turn.statePatch.inventoryAdd.join("\n");
  return continuity.requiredItems.filter(
    (item) =>
      !contractItemMentioned(item, publicText) ||
      !contractItemMentioned(item, acquired),
  );
};

const containsDisclosureTerm = (value: string, term: string): boolean => {
  const compactValue = compactDisclosureTerm(value);
  const compactTerm = compactDisclosureTerm(term);
  return compactTerm.length >= 2 && compactValue.includes(compactTerm);
};

const replaceDisclosureTerms = (
  value: string,
  terms: string[],
  replacement: string,
): string => {
  return replaceProtectedTermMatches(value, terms, replacement);
};

const redactProtectedPublicTerms = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  itemTerms: string[],
  identityTerms: string[],
  otherTerms: string[] = [],
): Omit<EngineTurnResponse, "mode" | "usage"> => {
  const redactItem = (value: string) =>
    replaceDisclosureTerms(value, itemTerms, "미확인 물건");
  const redactIdentity = (value: string) =>
    replaceDisclosureTerms(value, identityTerms, SABER_PRE_REVEAL_ALIAS)
      .replace(
        /(?:정체불명의\s*소녀\s*검사\s*){2,}/gu,
        `${SABER_PRE_REVEAL_ALIAS} `,
      )
      .trim();
  const redactOther = (value: string) =>
    replaceDisclosureTerms(value, otherTerms, "아직 공개되지 않은 사건");
  const redact = (value: string) => redactOther(redactIdentity(redactItem(value)));
  const containsIdentityTerm = (value: string) =>
    identityTerms.some((term) => containsDisclosureTerm(value, term));
  const redactBlockText = (block: StoryBlock) => {
    const itemSafeText = redactOther(redactItem(block.text));
    if (!containsIdentityTerm(itemSafeText)) return itemSafeText;
    const sentences = itemSafeText.match(/[^.!?。！？\n]+[.!?。！？]?/gu) ?? [];
    const retained = sentences
      .filter((sentence) => !containsIdentityTerm(sentence))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (retained) return retained;
    return block.type === "dialogue"
      ? "지금은 그 정체를 확인할 수 없습니다."
      : `${SABER_PRE_REVEAL_ALIAS}의 정체는 아직 확인되지 않았다.`;
  };
  const hasProtectedTerm = (value: string) =>
    [...itemTerms, ...identityTerms, ...otherTerms].some((term) =>
      containsDisclosureTerm(value, term)
    );

  return {
    ...turn,
    blocks: turn.blocks.map((block) => ({
      ...block,
      text: redactBlockText(block),
      speakerName: redactIdentity(block.speakerName ?? ""),
    })),
    statePatch: {
      ...turn.statePatch,
      sceneSummary: redact(turn.statePatch.sceneSummary),
      statusAdd: turn.statePatch.statusAdd.map(redact),
      statusRemove: turn.statePatch.statusRemove.map(redact),
      inventoryRemove: turn.statePatch.inventoryRemove.filter(
        (item) => !hasProtectedTerm(item),
      ),
      relationChanges: turn.statePatch.relationChanges.map((change) => ({
        ...change,
        reason: redact(change.reason),
      })),
      clockChanges: turn.statePatch.clockChanges.map((change) => ({
        ...change,
        reason: redact(change.reason),
      })),
      memoryAdd: turn.statePatch.memoryAdd.map(redact),
      variablesAdd: turn.statePatch.variablesAdd.map((variable) =>
        variable.visibility === "public"
          ? {
              ...variable,
              label: redact(variable.label),
              detail: redact(variable.detail),
              reason: redact(variable.reason),
            }
          : variable
      ),
      encounteredCharactersAdd: turn.statePatch.encounteredCharactersAdd.map(
        (character) => ({
          ...character,
          name: redactIdentity(character.name),
          relationType: redact(character.relationType),
        }),
      ),
      statusLedgerChanges: turn.statePatch.statusLedgerChanges.map((change) => ({
        ...change,
        value: redact(change.value),
        items: change.items.map(redact),
        grade: redact(change.grade),
        reason: redact(change.reason),
      })),
      autonomyActions: turn.statePatch.autonomyActions.map((action) =>
        action.traceVisibility === "hidden"
          ? action
          : { ...action, trace: redact(action.trace) }
      ),
      relationshipMemoriesAdd: turn.statePatch.relationshipMemoriesAdd.map(
        (memory) =>
          memory.visibility === "Public"
            ? {
                ...memory,
                title: redact(memory.title),
                summary: redact(memory.summary),
                cause: redact(memory.cause),
                tags: redact(memory.tags),
              }
            : memory,
      ),
    },
    recommendations: turn.recommendations.filter(
      (recommendation) => !hasProtectedTerm(recommendation.label),
    ),
    image: {
      ...turn.image,
      reason: redact(turn.image.reason),
      prompt: redact(turn.image.prompt),
    },
    characterVisuals: turn.characterVisuals.map((visual) => ({
      ...visual,
      characterName: redactIdentity(visual.characterName),
      appearancePrompt: redact(visual.appearancePrompt),
      reason: redact(visual.reason),
    })),
  };
};

const addRouteMinutes = (time: string, minutes: number): string => {
  const match = time.match(/^(\d{1,2}):([0-5]\d)$/u);
  if (!match) return time;
  const total = (Number(match[1]) * 60 + Number(match[2]) + minutes) %
    (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
};

const elapsedRouteMinutes = (before: string, after: string): number => {
  const parse = (value: string) => {
    const match = value.match(/^(\d{1,2}):([0-5]\d)$/u);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = parse(before);
  const end = parse(after);
  if (start === null || end === null) return 0;
  return end >= start ? end - start : 24 * 60 - start + end;
};

const elapsedTurnMinutes = (
  before: string,
  after: string,
  dayDelta?: number,
): number => {
  if (!Number.isFinite(dayDelta)) return elapsedRouteMinutes(before, after);
  const parse = (value: string) => {
    const match = value.match(/^(\d{1,2}):([0-5]\d)$/u);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = parse(before);
  const end = parse(after);
  if (start === null || end === null) return 0;
  return Math.max(0, Math.round(dayDelta ?? 0) * 24 * 60 + end - start);
};

type LocationContinuityAssessment = {
  needsCorrection: boolean;
  currentLocation: string;
  nextLocation: string;
  reason: string;
};

const LOCATION_GENERIC_WORDS = new Set([
  "서울", "대한민국", "현재", "장소", "주인공", "근처", "인근",
]);

const locationWords = (value: string): string[] =>
  [...new Set(
    (value.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [])
      .map((word) => word.replace(/(?:에서|으로|에는|은|는|이|가|을|를|의|에)$/u, ""))
      .filter((word) => (word.length >= 2 || word === "집") && !LOCATION_GENERIC_WORDS.has(word)),
  )];

const locationMinutesAdvanced = (before: string, after: string): number => {
  const parse = (value: string) => {
    const match = value.match(/^(\d{1,2}):([0-5]\d)$/u);
    return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
  };
  const start = parse(before);
  const end = parse(after);
  if (start === undefined || end === undefined) return 0;
  return end >= start ? end - start : end + 24 * 60 - start;
};

const assessLocationContinuity = (
  request: SimulateRequest,
  drive: StoryDrive,
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
): LocationContinuityAssessment => {
  const currentLocation = request.state.location.trim();
  const nextLocation = turn.statePatch.location.trim() || currentLocation;
  if (/미상|unknown/iu.test(currentLocation)) {
    return { needsCorrection: false, currentLocation, nextLocation, reason: "" };
  }
  const auditedLocation = turn.narrativeAudit?.currentLocation?.trim() ?? "";
  if (
    auditedLocation &&
    !/미상|unknown/iu.test(auditedLocation) &&
    !auditLocationMatchesPatch(auditedLocation, nextLocation)
  ) {
    return {
      needsCorrection: true,
      currentLocation,
      nextLocation,
      reason: `본문의 실제 마지막 장소 ‘${auditedLocation}’와 상태창 장소 ‘${nextLocation}’가 다름`,
    };
  }
  const currentKey = compactDisclosureTerm(currentLocation);
  const nextKey = compactDisclosureTerm(nextLocation);
  if (
    !currentKey ||
    !nextKey ||
    currentKey === nextKey ||
    currentKey.includes(nextKey) ||
    nextKey.includes(currentKey)
  ) {
    return { needsCorrection: false, currentLocation, nextLocation, reason: "" };
  }

  const publicBlocks = turn.blocks
    .filter((block) => block.type !== "system")
    .map((block) => block.text)
    .join("\n");
  const currentMentioned = locationWords(currentLocation).some((word) =>
    publicBlocks.includes(word)
  );
  const nextMentioned = locationWords(nextLocation).some((word) =>
    publicBlocks.includes(word)
  );
  const movementVisible =
    /떠나|나서|빠져나|이동|향해|향했|따라(?:가|나서|이동)|안내.{0,24}(?:따라|받아)|타고|걸어|달려|계단|엘리베이터|통로|차량|택시|버스|지하철|도보|옮겨/u.test(
      publicBlocks,
    );
  const arrivalVisible =
    /도착|들어섰|이르렀|닿았|도달|도착지|입구에\s*섰|안으로\s*들어/u.test(
      publicBlocks,
    );
  const transitionCauseVisible =
    /습격|추적|파손|부서|무너|붕괴|정전|대피|피신|안전|퇴로|안내|연락|호출|경보|유도|위험|공격|쫓|사건|요청/u.test(
      publicBlocks,
    );
  const locationIntent = deriveClaudeTurnIntent(
    request.userText,
    request.pack.events.find(
      (event) => event.id === drive.routeLock.currentEventId,
    ),
    request.state.time,
  );
  const inputRequestsTravel = movementActionRequested(
    request.userText,
    locationIntent,
  );
  const enoughTime =
    locationMinutesAdvanced(request.state.time, turn.statePatch.time) >= 3 ||
    /(?:몇|[1-9]\d*)\s*(?:분|시간)\s*(?:뒤|후)|한참\s*(?:뒤|후)/u.test(publicBlocks);
  const completeBridge = inputRequestsTravel
    ? movementVisible && arrivalVisible && nextMentioned && enoughTime
    : movementVisible &&
      arrivalVisible &&
      transitionCauseVisible &&
      currentMentioned &&
      nextMentioned &&
      enoughTime;
  if (completeBridge) {
    return { needsCorrection: false, currentLocation, nextLocation, reason: "" };
  }

  return {
    needsCorrection: true,
    currentLocation,
    nextLocation,
    reason: drive.routeLock.active
      ? "필수 사건을 진행하며 현재 장소와 새 장소 사이의 원인·이동·경과 시간·도착 연결이 누락됨"
      : "현재 장소와 새 장소 사이의 실제 이동 장면이 누락됨",
  };
};

const buildLocationContinuityCorrection = (
  assessment: LocationContinuityAssessment,
) => assessment.needsCorrection
  ? `\n[장소 연속성 작가 재구성 지시]\n첫 작성은 현재 위치 ‘${assessment.currentLocation}’에서 설명 없이 ‘${assessment.nextLocation}’로 바뀌었다. 이 문제는 턴 폐기 사유가 아니라 작가가 장면 안에서 수습할 복구 가능한 전개다. 이번 narration은 반드시 현재 위치에서 시작하고 다음 둘 중 하나를 택한다.\nA. 실제 이동: 이동하려는 이유 → 준비·출발 → 경로 또는 수단 → 충분한 경과 시간 → 새 장소 도착을 장면으로 쓴 뒤 statePatch.location을 ‘${assessment.nextLocation}’로 둔다.\nB. 이동 번복: 이동하려는 행동을 실제로 시작하되, 인물의 판단·상대의 반응·교통·날씨·연락·현재 사건처럼 구체적인 작중 이유로 멈추거나 돌아오게 한다. 이때 현재 장소에서 사건을 계속 진행하고 statePatch.location은 ‘${assessment.currentLocation}’로 유지한다.\n필수 사건은 선택한 장소와 동선에 맞춰 인과적으로 진행하며, 가능하면 현재 비트 안에서 종결한다. 장소 판정 규칙을 본문에 설명하거나 정형 복구문을 쓰지 않는다. 이 규칙은 모든 작품에 적용한다.\n`
  : "";

type ScenePacingContract = {
  calmScene: boolean;
  sceneExchangeNumber: number;
  minimumSceneExchanges: number;
  playerExplicitlyClosesScene: boolean;
  mayCompleteThisTurn: boolean;
};

type NarrativeSemanticAssessment = {
  available: boolean;
  inputHandled: boolean;
  meaningfulBeat: boolean;
  routeEventCompleted: boolean;
  chronologyConsistent: boolean;
  recommendationsGrounded: boolean;
  needsCorrection: boolean;
  reasons: string[];
};

const CALM_MULTI_EXCHANGE_PHASES = new Set([
  "ordinary_before_parcel",
  "nadia_human_encounter",
  "nadia_human_conversation",
  "separate_evening_daily_life",
  "church_orientation",
]);

const playerExplicitlyClosesScene = (userText: string): boolean =>
  /(?:집(?:으로)?\s*(?:돌아|귀가)|떠나|자리를\s*(?:뜨|벗어나)|대화를\s*(?:끝|마무리)|작별|밖으로\s*나가|돌아가기로)/u.test(
    userText,
  );

const readSceneExchangeCount = (
  request: SimulateRequest,
  drive: StoryDrive,
): number => {
  const variable = request.state.variables.find(
    (candidate) =>
      candidate.id === STORY_SCENE_PROGRESS_VARIABLE_ID &&
      candidate.visibility === "hidden",
  );
  if (!variable) return 0;
  try {
    const parsed = JSON.parse(variable.detail) as {
      routeId?: string;
      phase?: string;
      eventId?: string;
      exchanges?: number;
    };
    if (
      parsed.routeId !== drive.routeLock.routeId ||
      parsed.phase !== drive.routeLock.phase ||
      parsed.eventId !== drive.routeLock.currentEventId
    ) {
      return 0;
    }
    return Math.max(0, Math.min(20, Math.round(parsed.exchanges ?? 0)));
  } catch {
    return 0;
  }
};

const deriveScenePacingContract = (
  request: SimulateRequest,
  drive: StoryDrive,
): ScenePacingContract => {
  const calmScene = drive.routeLock.active &&
    CALM_MULTI_EXCHANGE_PHASES.has(drive.routeLock.phase);
  const minimumSceneExchanges = drive.routeLock.phase === "nadia_human_conversation"
    ? 2
    : calmScene
      ? 2
      : 1;
  const sceneExchangeNumber = readSceneExchangeCount(request, drive) + 1;
  const explicitClose = request.advanceMode !== "canonical" &&
    playerExplicitlyClosesScene(request.userText);
  return {
    calmScene,
    sceneExchangeNumber,
    minimumSceneExchanges,
    playerExplicitlyClosesScene: explicitClose,
    mayCompleteThisTurn:
      !calmScene ||
      sceneExchangeNumber >= minimumSceneExchanges ||
      explicitClose,
  };
};

const sceneProgressVariable = (
  request: SimulateRequest,
  drive: StoryDrive,
  pacing: ScenePacingContract,
) => ({
  id: STORY_SCENE_PROGRESS_VARIABLE_ID,
  label: "현재 장면 호흡",
  detail: JSON.stringify({
    routeId: drive.routeLock.routeId,
    phase: drive.routeLock.phase,
    eventId: drive.routeLock.currentEventId,
    exchanges: pacing.sceneExchangeNumber,
  }),
  visibility: "hidden" as const,
  reason: "평온한 만남과 대화를 한 응답에 끝내지 않기 위한 내부 장면 기록",
});

const auditEvidenceVisible = (evidence: string, publicText: string): boolean => {
  const evidenceKey = compactDisclosureTerm(evidence);
  const publicKey = compactDisclosureTerm(publicText);
  if (evidenceKey.length >= 4 && publicKey.includes(evidenceKey)) return true;

  // Luna가 실제 문장을 조사·어미만 조금 바꿔 인용해도 근거가 사라진 것으로
  // 오판하지 않는다. 이 검사는 사건 키워드 판정이 아니라, 모델이 전문을
  // 읽고 제시한 근거 문장이 공개 본문에 실재하는지 확인하는 보조 절차다.
  const evidenceTokens = [
    ...new Set(
      evidence
        .normalize("NFKC")
        .match(/[\p{L}\p{N}]{2,}/gu)
        ?.map((token) => compactDisclosureTerm(token))
        .filter((token) => token.length >= 2) ?? [],
    ),
  ];
  if (evidenceTokens.length < 2) return false;
  const matchedTokens = evidenceTokens.filter((token) => publicKey.includes(token));
  return matchedTokens.length >= 2 &&
    matchedTokens.length / evidenceTokens.length >= 0.6;
};

const INPUT_CONTEXT_STOP_WORDS = new Set([
  "한다", "하기", "하기로", "일단", "우선", "그냥", "그리고", "그런데",
  "지금", "여기", "저기", "이곳", "그곳", "것", "상황", "정도", "먼저",
  "계속", "조금", "같이", "함께", "다시", "나", "내가",
  "눈앞", "눈앞의",
]);

const meaningfulInputTokens = (value: string): string[] =>
  [...new Set(
    (value.normalize("NFKC").match(/[\p{L}\p{N}]{2,}/gu) ?? [])
      .map((token) => token.replace(
        /(?:에게|한테|께|에서|으로|로|에는|은|는|이|가|을|를|와|과|에)$/u,
        "",
      ))
      .filter((token) =>
        token.length >= 2 &&
        !INPUT_CONTEXT_STOP_WORDS.has(token) &&
        !/(?:한다|했다|된다|됐다|이다|있다|없다|간다|본다|말한다)$/u.test(token)
      ),
  )].slice(0, 12);

const DIRECT_RESULT_INTENT_PATTERN =
  /(?:떠나|떠난|떠날|벗어나|나가|돌아가|귀가|향하|향한|향해|향했|이동|출발|따라가|데려가|찾아가|들르|방문|들어가|입장|도착|간다|가기로|가\s*본다|가본다|묻|질문|말하|말을?\s*(?:걸|건)|인사|대답|답하|제안|요청|설명|알린|계속|머무|기다|수업|강의|공부|쉬|휴식|가만히|잠(?!시|깐)|자자|취침|눕|놀|밤새|밤을\s*새|시간을\s*보내|숙박|묵|마시|게임|관람|쇼핑|열|닫|확인|살펴|조사|챙기|꺼내|놓|두|남겨|사용|건네|받|불태|태우|태워|불붙|점화|끄|찢|자르|베|던지|밀|당기|부수|깨뜨|파손)/u;

const explicitSceneFactVisible = (input: string, publicText: string): boolean => {
  return assessDirectSceneFact(
    deriveSceneFactContract(input),
    publicText,
  ).satisfied;
};

const MOVEMENT_ACTION_PATTERN =
  /(?:떠나|떠난|떠날|벗어나|나가|돌아가|귀가|향하|향한|향해|향했|이동|출발|따라가|데려가|찾아가|들르|방문|들어가|입장|도착|간다|가기로|가\s*본다|가본다)/u;
const MOVEMENT_RESULT_PATTERN =
  /(?:떠났|벗어났|나섰|빠져나왔|길을\s*나섰|이동했|향했|출발했|따라갔|찾아갔|들렀|방문했|들어갔|들어섰|입장했|도착했|닿았|다다랐|돌아왔|귀가했)/u;

const movementActionRequested = (
  input: string,
  intent?: ClaudeTurnIntent,
): boolean => {
  const normalized = input.normalize("NFKC");
  if (!MOVEMENT_ACTION_PATTERN.test(normalized) && !intent?.impliedTravel) return false;
  const contract = deriveNarrativeSceneContract(normalized);
  return inputContainsExecutedMovement(normalized) ||
    contract.clauses.every((clause) => clause.mode === "execution");
};

const requestedNpcFromInput = (request: SimulateRequest) => {
  const input = request.userText.normalize("NFKC");
  return request.pack.npcs.find((npc) => {
    const publicNames = visibleCharacterAliases(npc)
      .filter((alias) => alias !== npc.id)
      .map((alias) => alias.normalize("NFKC").trim())
      .filter(Boolean);
    if (publicNames.some((alias) => input.includes(alias))) return true;
    const distinctiveTokens = publicNames
      .flatMap((alias) => alias.split(/[\s·/()]+/u))
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
    return distinctiveTokens.some((token) => input.includes(token));
  });
};

const npcClauseOutcomeVisible = (
  request: SimulateRequest,
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  publicText: string,
): boolean => {
  const npc = requestedNpcFromInput(request);
  const asksForContact = /(?:말을?\s*(?:걸|건)|불러\s*세우|다가가|인사|대화|묻|질문)/u.test(
    request.userText,
  );
  if (!npc || !asksForContact) return true;
  const npcNames = visibleCharacterAliases(npc).filter((alias) => alias !== npc.id);
  const npcTokens = npcNames.flatMap((alias) => alias
    .normalize("NFKC")
    .split(/[\s·/()]+/u)
    .filter((token) => token.length >= 2));
  const npcNamed = npcTokens.some((token) => publicText.includes(token));
  const npcResponded = turn.blocks.some((block) =>
    block.type === "dialogue" &&
    resolveVisibleCharacterAlias(
      request.pack,
      block.speakerId ?? "",
      block.speakerName ?? "",
    )?.id === npc.id
  );
  const claimRejectedInScene = npcNamed &&
    /(?:닮은\s*사람|다른\s*사람|착각|보이지\s*않|찾을\s*수\s*없|이미\s*떠|자리에\s*없)/u.test(
      publicText,
    );
  return npcNamed && (npcResponded || claimRejectedInScene);
};

type PlayerOverreachKind = "social" | "violence" | "property" | "coercion" | "impossible";

type PlayerOverreachIntent = {
  active: boolean;
  kind: PlayerOverreachKind;
  attemptsTravel: boolean;
};

const SOCIAL_OVERREACH_PATTERN =
  /(?:성희롱|희롱|추근대|음담패설|모욕|욕설|조롱|괴롭히|행패|시비를?\s*걸)/u;
const VIOLENT_OVERREACH_PATTERN =
  /(?:폭행|구타|때리|때려|두들겨|찔러|쏘아|쏜다|죽이|살해|목을\s*조르|불을\s*지르)/u;
const PROPERTY_OVERREACH_PATTERN =
  /(?:훔치|절도|강탈|부수|박살|파손|침입|무단으로\s*(?:열|가져|사용))/u;
const COERCIVE_OVERREACH_PATTERN =
  /(?:협박|납치|감금|스토킹|강제로\s*(?:키스|끌고|데려|시키|빼앗)|동의\s*없이)/u;
const IMPOSSIBLE_OVERREACH_PATTERN =
  /(?:모든\s*사람을\s*(?:조종|세뇌)|세계를\s*(?:지배|멸망)|시간을\s*(?:멈추|되돌리)|한순간에\s*(?:모두|전부).{0,16}(?:쓰러뜨리|제압|복종))/u;

const derivePlayerOverreachIntent = (input: string): PlayerOverreachIntent => {
  const normalized = input.normalize("NFKC");
  const kind: PlayerOverreachKind = SOCIAL_OVERREACH_PATTERN.test(normalized)
    ? "social"
    : VIOLENT_OVERREACH_PATTERN.test(normalized)
      ? "violence"
      : PROPERTY_OVERREACH_PATTERN.test(normalized)
        ? "property"
        : COERCIVE_OVERREACH_PATTERN.test(normalized)
          ? "coercion"
          : "impossible";
  const active = SOCIAL_OVERREACH_PATTERN.test(normalized) ||
    VIOLENT_OVERREACH_PATTERN.test(normalized) ||
    PROPERTY_OVERREACH_PATTERN.test(normalized) ||
    COERCIVE_OVERREACH_PATTERN.test(normalized) ||
    IMPOSSIBLE_OVERREACH_PATTERN.test(normalized);
  return {
    active,
    kind,
    attemptsTravel: /(?:등교|출근|가는\s*길|향하|이동|출발|떠나|간다|가기로)/u.test(
      normalized,
    ),
  };
};

const overreachOutcomeVisibleInTurn = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  overreach: PlayerOverreachIntent,
): boolean => {
  if (!overreach.active) return true;
  const text = publicTurnText(turn);
  const attemptVisible = overreach.kind === "social"
    ? /(?:희롱|추근|선을\s*넘는\s*(?:말|농담)|무례한\s*(?:말|농담)|모욕|욕설|시비)/u.test(text)
    : overreach.kind === "violence"
      ? /(?:주먹|공격|폭행|때리|휘두르|달려들|손을\s*대)/u.test(text)
      : overreach.kind === "property"
        ? /(?:훔치|빼앗|손을\s*대|부수|파손|침입|가져가)/u.test(text)
        : overreach.kind === "coercion"
          ? /(?:협박|강요|억지로|붙잡|가로막|위협)/u.test(text)
          : /(?:시도|힘을\s*주|집중|명령|능력)/u.test(text);
  const reactionVisible =
    /(?:피하|물러|항의|막아|붙잡|제지|경고|소리치|신고|경비|경찰|휴대전화|주변의\s*시선|얼굴을\s*굳|분위기가\s*얼어)/u.test(
      text,
    );
  const costVisible =
    /(?:지연|늦어|대가|평판|경계|의심|기록|목격|신고|제지|상처|실패|통하지\s*않|무시할\s*수\s*없)/u.test(
      text,
    );
  const genericErasure =
    /이전\s*장소의\s*(?:대화와\s*)?사건은\s*그곳에\s*남았|현재의\s*시선과\s*동선은\s*새\s*장소로\s*이어/u.test(
      text,
    );
  const routeCausallyLinked = !turn.claudeSignals?.eventResolved ||
    /(?:때문|여파|그\s*결과|그\s*탓|소란으로|제지\s*과정|신고.{0,24}(?:연락|확인|전달|안내)|경비.{0,24}(?:안내|동선|확인)|기록.{0,24}(?:연락|알림|확인))/u.test(
      text,
    );
  return attemptVisible && reactionVisible && costVisible &&
    routeCausallyLinked && !genericErasure;
};

const inputRequiresDirectResult = (
  input: string,
  intent: ClaudeTurnIntent,
): boolean => derivePlayerOverreachIntent(input).active || inputContainsSpeech(input) || intent.impliedTravel || intent.longSpan ||
  deriveNarrativeSceneContract(input).requiresDirectScene ||
  DIRECT_RESULT_INTENT_PATTERN.test(input.normalize("NFKC"));

/**
 * Long player inputs are scene plans, not atomic database transactions. The
 * writer must adjudicate every clause, but a safe scene is still useful when a
 * later world-authority clause is refused, deferred, or remains open.
 */
const compoundInputHasMeaningfulResult = (
  request: SimulateRequest,
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
): boolean => {
  const contract = deriveNarrativeSceneContract(request.userText);
  const clauses = contract.clauses.filter((clause) => clause.mode === "execution");
  if (!contract.compound || clauses.length === 0) return false;

  const text = publicTurnText(turn).normalize("NFKC");
  const compactText = compactDisclosureTerm(text);
  const hasNpcReply = turn.blocks.some((block) =>
    block.type === "dialogue" && Boolean(block.speakerName?.trim())
  );
  const movementVisible = MOVEMENT_RESULT_PATTERN.test(text) ||
    /(?:걸어|달려|차를\s*타|버스|지하철|택시|도착|들어섰|나섰)/u.test(text);
  const encounterAdjudicated = hasNpcReply ||
    /(?:마주쳤|마주했|발견했|다시\s*만났|고개를\s*들|부재|없었|보이지\s*않|엇갈렸|착각)/u.test(text);
  const responseVisible = hasNpcReply ||
    /(?:대답|답했|반응|고개를|말을\s*받|듣고|거절|수락|유보|되물|잠시\s*생각)/u.test(text);
  const observableAction =
    /(?:열었|닫았|확인했|살폈|챙겼|꺼냈|넣었|건넸|받았|보여\s*주|내밀|시작했|멈췄|달라졌)/u.test(text);

  const satisfied = clauses.filter((clause) => {
    if (clause.kind === "speak") return responseVisible;
    if (clause.kind === "move") return movementVisible;
    if (clause.kind === "encounter") return encounterAdjudicated;
    if (clause.kind === "overreach") {
      return overreachOutcomeVisibleInTurn(turn, derivePlayerOverreachIntent(clause.text));
    }
    const tokens = meaningfulInputTokens(clause.text).slice(0, 8);
    const overlap = tokens.filter((token) =>
      compactText.includes(compactDisclosureTerm(token))
    ).length;
    return observableAction && overlap >= Math.min(2, Math.max(1, tokens.length));
  }).length;

  const requiredCoverage = Math.min(3, Math.max(1, Math.ceil(clauses.length / 2)));
  return satisfied >= requiredCoverage;
};

const playerTurnTimeBudget = (
  input: string,
  intent: ClaudeTurnIntent,
): number => {
  // An explicit required-event derailment is absorbed before the declared
  // detour happens.  The rejected overnight plan is not elapsed world time;
  // only reconsideration, travel and the active event consume time.
  if (intent.explicitDerailment) return 6 * 60;
  if (intent.requestedMinimumMinutes !== null) {
    return Math.min(7 * 24 * 60, intent.requestedMinimumMinutes + 120);
  }
  const normalized = input.normalize("NFKC");
  if (/(?:밤을?\s*새|밤새|내일|다음\s*날)/u.test(normalized)) {
    return 24 * 60;
  }
  if (/(?:저녁|밤|하루|몇\s*시간|시간을\s*보내|때까지|끝날\s*때까지)/u.test(normalized)) {
    return 18 * 60;
  }
  if (/(?:잠|자자|취침|낮잠)/u.test(normalized)) return 120;
  if (/(?:수업|강의|공부)/u.test(normalized)) return 90;
  if (movementActionRequested(normalized, intent)) return 120;
  return 45;
};

const inputOutcomeVisibleInTurn = (
  request: SimulateRequest,
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  intent: ClaudeTurnIntent,
): boolean => {
  if (request.advanceMode === "canonical") return true;
  const input = request.userText.normalize("NFKC").trim();
  const publicText = turn.blocks
    .filter((block) => block.type !== "system")
    .map((block) => `${block.speakerName ?? ""} ${block.text}`)
    .join("\n")
    .normalize("NFKC");
  if (!input || !publicText) return false;
  if (!explicitSceneFactVisible(input, publicText)) return false;

  // A named NPC question, identity claim, or authored NPC action cannot be
  // considered handled merely because some unrelated dialogue exists. This
  // generic gate deliberately uses only package character data, so every work
  // receives the same player-origin canon protection.
  const canonContract = deriveNarrativeSceneContract(input);
  const userCanonIntent = deriveUserCanonIntent(
    input,
    request.pack.npcs,
    canonContract.clauses
      .filter((clause) => clause.mode === "execution")
      .map((clause) => clause.text),
  );
  const canonIntentHandled = userCanonIntentHandled(
    userCanonIntent,
    publicText,
    turn.blocks
      .filter((block) => block.type === "dialogue")
      .map((block) => ({
        speakerId: block.speakerId,
        speakerName: block.speakerName,
        text: block.text,
      })),
  );
  if (!canonIntentHandled) return false;

  // A concrete player-authored sceneFact is complete once its physical
  // action and observable result are actually present in the public scene.
  // Do not make that accepted scene depend on the older token-overlap
  // fallback below: Korean inflection (연다 → 열렸다, 태운다 → 타올랐다)
  // routinely changes the surface form even though the action was rendered.
  const directSceneFact = assessDirectSceneFact(
    deriveSceneFactContract(input),
    publicText,
  );
  if (directSceneFact.required && directSceneFact.satisfied) return true;

  if (compoundInputHasMeaningfulResult(request, turn)) return true;

  const absorbedRequiredDerailment = intent.explicitDerailment &&
    /그러나|하지만|문득|마음에\s*걸|생각이\s*들|떠올|계획을\s*(?:접|버리|바꾸)|생각을\s*(?:접|바꾸)|발길을\s*(?:돌리|바꾸)|외면할\s*수\s*없/u.test(publicText) &&
    (Boolean(turn.claudeSignals?.eventResolved) ||
      turn.narrativeAudit?.routeEventStatus === "completed");
  if (absorbedRequiredDerailment) return true;

  const movementIntent = movementActionRequested(input, intent);
  if (movementIntent) {
    const leavesVisible = MOVEMENT_RESULT_PATTERN.test(publicText);
    const explicitTarget = movementTargetFromInput(
      input,
      request.pack.player.name || "주인공",
    );
    const hintedTargetTokens = meaningfulInputTokens(
      explicitTarget || intent.destinationHint,
    );
    const targetTokens = hintedTargetTokens.length
      ? hintedTargetTokens
      : meaningfulInputTokens(input).filter((token) =>
      /집|자택|기숙사|숙소|학교|캠퍼스|별관|본관|성당|교회|역|정류장|골목|방|실|관|길/u.test(
        token,
      )
    );
    const publicAndStateLocation = `${publicText}\n${turn.statePatch.location}`;
    const compactExplicitTarget = compactDisclosureTerm(explicitTarget)
      .replace(compactDisclosureTerm(request.pack.player.name || "주인공"), "")
      .replace(/^의/u, "");
    const targetVisible = (
      compactExplicitTarget.length > 0 &&
      compactDisclosureTerm(publicAndStateLocation).includes(compactExplicitTarget)
    ) || targetTokens.length === 0 ||
      targetTokens.some((token) => compactDisclosureTerm(publicAndStateLocation).includes(
        compactDisclosureTerm(token),
      ));
    const longActionVisible = !intent.longSpan ||
      /(?:밤을\s*샜|밤새|시간이\s*흘|몇\s*시간|새벽|아침|문을\s*닫|영업이\s*끝|날이\s*밝)/u.test(publicText);
    const pickupVisible = !PICKUP_ACTION_PATTERN.test(input) ||
      /(?:수령\s*(?:완료|절차)|직접\s*(?:받|인도받|회수|꺼내)|물품을\s*(?:받|꺼내|챙기)|택배를\s*(?:받|꺼내|챙기))/u.test(publicText);
    const openVisible = !OPEN_ACTION_PATTERN.test(input) ||
      /(?:열었|열어|문이\s*열|개봉했|포장을\s*벗)/u.test(publicText);
    const inspectVisible = !INSPECT_ACTION_PATTERN.test(input) ||
      /(?:확인했|확인하자|살펴|조사했|내용물이\s*드러)/u.test(publicText);
    return leavesVisible && targetVisible && longActionVisible &&
      pickupVisible && openVisible && inspectVisible &&
      npcClauseOutcomeVisible(request, turn, publicText);
  }

  if (inputContainsSpeech(input)) {
    const hasNpcResponse = turn.blocks.some((block) =>
      block.type === "dialogue" && Boolean(block.speakerName?.trim())
    );
    const responseVisible = /(?:대답|답했|반응|고개를|말을\s*받|듣고|잠시\s*생각|설명|인사를\s*받)/u.test(
      publicText,
    );
    return hasNpcResponse || responseVisible;
  }

  if (/(?:계속|머무|기다|수업|공부|쉬|휴식|가만히)/u.test(input)) {
    const sameLocation = compactDisclosureTerm(turn.statePatch.location) ===
      compactDisclosureTerm(request.state.location);
    return sameLocation &&
      /(?:이어졌|계속됐|계속되|머물|기다|수업|공부|쉬|시간(?:이|은|도)?\s*(?:빠르게\s*)?흘|분이\s*지나)/u.test(
        publicText,
      );
  }

  if (/(?:잠|자자|취침|눕)/u.test(input)) {
    const sleepVisible = /(?:잠을\s*청|잠들|눈을\s*감|침대에\s*누|자리에\s*누)/u.test(
      publicText,
    );
    const enteredInterior = !/(?:현관\s*앞|바깥|외부)/u.test(request.state.location) ||
      !/(?:현관\s*앞|바깥|외부)/u.test(turn.statePatch.location);
    return sleepVisible && enteredInterior;
  }

  const tokens = meaningfulInputTokens(input);
  const publicKey = compactDisclosureTerm(publicText);
  const overlap = tokens.filter((token) =>
    publicKey.includes(compactDisclosureTerm(token))
  );
  const observableResult = /(?:열렸|열어|닫혔|닫아|닫자|확인했|확인하자|살폈|살펴|조사했|대조|떠올|표시됐|드러났|밝혀졌|챙겼|꺼냈|넣었|사용했|건넸|받았|완료했|끝냈|멈췄|시작했|이어졌|달라졌)/u.test(
    publicText,
  );
  return observableResult && overlap.length >= Math.min(2, Math.max(1, tokens.length));
};

const auditLocationMatchesPatch = (
  auditLocation: string,
  patchLocation: string,
): boolean => {
  if (!auditLocation.trim() || !patchLocation.trim()) return true;
  const auditKey = compactDisclosureTerm(auditLocation);
  const patchKey = compactDisclosureTerm(patchLocation);
  if (
    auditKey === patchKey ||
    auditKey.includes(patchKey) ||
    patchKey.includes(auditKey)
  ) {
    return true;
  }
  const auditWords = locationWords(auditLocation);
  const patchWords = new Set(locationWords(patchLocation));
  return auditWords.some((word) => patchWords.has(word));
};

const assessNarrativeSemantics = (
  request: SimulateRequest,
  drive: StoryDrive,
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  pacing: ScenePacingContract,
): NarrativeSemanticAssessment => {
  const activeEvent = request.pack.events.find(
    (event) => event.id === drive.routeLock.currentEventId,
  );
  const intent = deriveClaudeTurnIntent(
    request.userText,
    activeEvent,
    request.state.time,
  );
  const audit = turn.narrativeAudit;
  if (!audit) {
    return {
      available: false,
      inputHandled: true,
      meaningfulBeat: true,
      routeEventCompleted: false,
      chronologyConsistent: true,
      recommendationsGrounded: true,
      needsCorrection: false,
      reasons: [],
    };
  }
  const publicText = publicTurnText(turn);
  const controlLeaks = narrativeControlLeaks(turn);
  const canonicalAdvance = request.advanceMode === "canonical";
  const inputEvidenceVisible = canonicalAdvance ||
    auditEvidenceVisible(audit.inputEvidence, publicText);
  const inputHandledByContext = inputOutcomeVisibleInTurn(request, turn, intent);
  const inputHandled = canonicalAdvance
    ? audit.inputOutcome === "not_applicable" || audit.inputHandled
    : audit.inputOutcome !== "not_applicable" &&
      (inputRequiresDirectResult(request.userText, intent)
        ? inputHandledByContext
        : (audit.inputHandled && inputEvidenceVisible) || inputHandledByContext);
  const meaningfulBeat =
    (audit.meaningfulBeat &&
      auditEvidenceVisible(audit.meaningfulBeatEvidence, publicText)) ||
    (inputHandled && audit.inputOutcome !== "not_applicable");
  const locationAligned = auditLocationMatchesPatch(
    audit.currentLocation,
    turn.statePatch.location,
  );
  const auditTime = audit.currentTime?.trim() ?? "";
  const timeAligned = !auditTime || auditTime === turn.statePatch.time;
  const elapsedMinutes = elapsedTurnMinutes(
    request.state.time,
    turn.statePatch.time,
    turn.statePatch.dayDelta,
  );
  const timeBudgetAligned = canonicalAdvance ||
    elapsedMinutes <= playerTurnTimeBudget(request.userText, intent);
  const chronologyConsistent = audit.chronologyConsistent &&
    locationAligned && timeAligned && timeBudgetAligned;
  const completionEvidenceVisible =
    audit.routeEventStatus !== "completed" ||
    auditEvidenceVisible(audit.routeEventEvidence, publicText);
  const mayCompleteRoute = intent.explicitDerailment || pacing.mayCompleteThisTurn;
  const routeEventCompleted = drive.routeLock.active &&
    audit.routeEventStatus === "completed" &&
    completionEvidenceVisible &&
    mayCompleteRoute;
  const reasons: string[] = [];
  if (!inputHandled) {
    reasons.push("사용자 입력의 핵심 행동·대사·의도가 관측 가능한 결과로 처리되지 않음");
  }
  if (!meaningfulBeat) {
    reasons.push("현재 장면에서 인과적으로 의미 있는 변화가 실제 문장 근거와 함께 성립하지 않음");
  }
  if (!chronologyConsistent) {
    reasons.push(`최근 전문과 비교한 시간·장소 연속성이 맞지 않음${audit.chronologyNote ? `: ${audit.chronologyNote}` : ""}`);
  }
  if (!timeBudgetAligned) {
    reasons.push(`사용자가 장시간 경과를 요청하지 않았는데 한 응답에서 ${elapsedMinutes}분을 건너뜀`);
  }
  if (!audit.recommendationsGrounded) {
    reasons.push("추천 행동이 마지막 장면에 실제로 남아 있는 대상과 선택지만 사용하지 않음");
  }
  if (audit.routeEventStatus === "completed" && !completionEvidenceVisible) {
    reasons.push("필수 사건 완료 판정에 이번 본문의 실제 결과 문장 근거가 없음");
  }
  if (audit.routeEventStatus === "completed" && !mayCompleteRoute) {
    reasons.push(
      `평온한 장면을 ${pacing.minimumSceneExchanges}회 상호작용 전에 너무 빨리 종료함`,
    );
  }
  if (controlLeaks.length > 0) {
    reasons.push("소설 본문에 내부 진행 지시 또는 판정 용어가 노출됨");
  }
  return {
    available: true,
    inputHandled,
    meaningfulBeat,
    routeEventCompleted,
    chronologyConsistent,
    recommendationsGrounded: audit.recommendationsGrounded,
    needsCorrection: reasons.length > 0,
    reasons,
  };
};

const mergeSemanticStoryAssessment = (
  base: ReturnType<typeof assessStoryDrive>,
  semantic: NarrativeSemanticAssessment,
  drive: StoryDrive,
) => {
  if (!semantic.available) return base;
  const hardContractPhase =
    drive.routeLock.phase === "ordinary_before_parcel" ||
    drive.routeLock.phase === "required_event" ||
    drive.routeLock.phase === "accidental_summoning";
  const routeStepCompleted = drive.routeLock.active
    ? semantic.routeEventCompleted &&
      (!hardContractPhase || base.routeStepCompleted)
    : base.routeStepCompleted;
  const macroProgress = base.macroProgress || semantic.meaningfulBeat;
  const nonMacroReasons = base.reasons.filter(
    (reason) => !/메인 사건을 향한 시간·외부 사건·상태 변화가 없음/u.test(reason),
  );
  const reasons = [...new Set([...nonMacroReasons, ...semantic.reasons])];
  return {
    ...base,
    routeStepCompleted,
    macroProgress,
    needsCorrection: reasons.length > 0,
    reasons,
  };
};

const buildNarrativeSemanticCorrection = (
  assessment: NarrativeSemanticAssessment,
  pacing: ScenePacingContract,
) => assessment.needsCorrection
  ? `\n[전문 문맥 의미 검증 재작성 지시]\n첫 작성은 최근 전문과 이번 응답을 의미 단위로 판정하는 검사에 실패했다: ${assessment.reasons.join(", ")}.\n- 단어의 포함 여부가 아니라 문장 전체의 주어·부정·시제·결과를 읽고 다시 쓴다. 가능, 예정, 대기, 질문, 회상은 실제 발생이 아니다.\n- 사용자의 방금 입력을 먼저 인과로 처리한다. 일반 입력은 행동의 실제 결과를 쓴다. requiredEventReroute.active인 이탈 입력은 목적지·욕구 인정 → 준비·출발·부분 실행 → 현재 동선에 필수 사건이 끼어드는 구체적 원인 → 필수 사건의 실제 실행과 완료 → 원래 계획의 보류·재개 가능성을 쓴 것이 올바른 입력 처리다. '생각을 접었다'처럼 이유 없이 취소하지 않으며, 아직 실행되지 않은 장시간 경과만 적용하지 않는다.\n- 이름을 지목한 질문은 그 인물이 해당 주제에 답하거나 부정·회피·답변 거부해야 한다. 이름을 지목한 NPC 행동은 실제 실행되거나 불가능한 이유와 실패·거부 결과가 보여야 한다. 무관한 대사로 대신하지 않는다.\n- 정사 흡수는 보고서가 아니라 장면이다. 인물의 성격에 맞는 망설임이나 욕구, 눈앞의 구체적 자극, 행동의 결과를 이어 쓴다. '현재 동선', '관측 가능한 결과', '입력 의도', '필수 사건', '복구 경로' 같은 판정 문구를 본문에 쓰지 않는다.\n- 문장은 장르소설처럼 읽혀야 한다. 감각과 감정을 필요한 만큼만 살리고, 학술 해설·다큐멘터리 내레이션·업무 보고서 같은 요약문을 피한다.\n- 추천 행동은 재작성된 마지막 장면의 실제 인물·장소·소품·위협만 사용한다. 과거 장면과 미래 사건의 명칭은 제거한다.\n- \"사용자 행동\", \"NPC 독립 행동\", \"플레이어 판단\", \"새 대응 지점\", JSON 필드명 같은 내부 제어문은 모두 제거하고 독자가 실제로 보고 듣는 사건과 인물 반응으로만 다시 쓴다.\n- ${pacing.calmScene ? `이 장면은 평온한 상호작용 장면이다. 현재 ${pacing.sceneExchangeNumber}번째 응답이며 기본 ${pacing.minimumSceneExchanges}회 동안 관계·정보·선택을 충분히 쌓는다. 다만 requiredEventReroute.active인 즉시 흡수 턴은 현재 필수 사건을 같은 턴에 완료할 수 있다.` : "위기 장면도 원인 → 대응 → 관측 가능한 결과의 인과를 생략하지 않는다."}\n- 별도의 감사 보고서는 출력하지 말고 완성된 blocks와 그 장면에서 성립한 statePatch·claudeSignals만 출력한다.\n`
  : "";

const routeRecoveryDefaults = (
  request: SimulateRequest,
  drive: StoryDrive,
): {
  blocks: StoryBlock[];
  time: string;
  dayDelta?: number;
  location?: string;
  sceneSummary: string;
  memory: string;
  recommendations: Array<{ label: string; risk: "낮음" | "보통" | "높음" }>;
} => {
  const adapter = resolveWorkAdapter(request.pack);
  if (adapter) {
    return adapter.routeRecoveryDefaults(request, drive, {
      addRouteMinutes,
      movementActionRequested,
      movementTargetFromInput,
      movementDepartureNarration,
      locationAfterLeaving,
      firstDiegeticEventSentence,
      isPublicEncounter: isAdapterPublicEncounter,
      shouldStageRequiredEncounterLocation,
      requiredEventRerouteSatisfied,
    });
  }

  const currentLocation = request.state.location || "현재 장소";
  const narration = (text: string): StoryBlock => ({
    id: createId(),
    type: "narration",
    text,
  });
  if (drive.routeLock.phase === "required_event") {
    const event = request.pack.events.find((candidate) =>
      candidate.id === drive.routeLock.currentEventId
    );
    const speaker = request.pack.npcs.find((npc) =>
      npc.id === drive.routeLock.requiredSpeakerId
    );
    const signal = firstDiegeticEventSentence(
      drive.routeLock.completionSignals[0],
      event?.effects,
      event?.description,
      event?.name,
    );
    const blocks: StoryBlock[] = [
      narration(
        `${currentLocation}에서 직전 행동의 결과가 남은 순간, ${signal.replace(/[.。!?！？]+$/u, "")}.`,
      ),
    ];
    if (drive.routeLock.requiredItems.length) {
      blocks.push(narration(
        `그 과정에서 ${drive.routeLock.requiredItems.join(" · ")}이 실제로 전달되어 손에 들어왔다.`,
      ));
    }
    if (drive.routeLock.requiredDialogue) {
      blocks.push({
        id: createId(),
        type: "dialogue",
        text: drive.routeLock.requiredDialogue,
        speakerId: speaker?.id,
        speakerName: speaker?.name ?? "",
        emotion: "차분함",
      });
    }
    return {
      blocks,
      time: addRouteMinutes(request.state.time, 5),
      sceneSummary: `${currentLocation}에서 ${drive.routeLock.currentEventName}의 관측 가능한 변화가 나타났다.`,
      memory: `${currentLocation}에서 ${drive.routeLock.currentEventName}과 관련된 변화를 직접 확인했다.`,
      recommendations: [
        { label: `${currentLocation}에서 방금 달라진 흔적을 확인한다.`, risk: "보통" },
        { label: speaker ? `${speaker.name}에게 방금 행동의 이유를 묻는다.` : "변화가 시작된 방향을 살핀다.", risk: "낮음" },
        { label: "현재 확보된 정보와 소지품을 정리한다.", risk: "낮음" },
      ],
    };
  }

  return {
    blocks: [
      narration(
        `${currentLocation}에서 직전 행동에 대한 주변의 반응이 이어졌다. 사람과 사물의 변화가 눈앞에 남아 다음 판단을 요구했다.`,
      ),
    ],
    time: addRouteMinutes(request.state.time, 3),
    sceneSummary: `${currentLocation}에서 직전 행동의 결과와 다음 판단 지점이 생겼다.`,
    memory: `${currentLocation}에서 직전 선택이 구체적인 주변 반응으로 이어졌다.`,
    recommendations: [
      { label: "방금 달라진 현장을 직접 확인한다.", risk: "낮음" },
      { label: "가까운 인물에게 현재 상황을 묻는다.", risk: "보통" },
      { label: "현재 동선을 정리하고 다음 행동을 시작한다.", risk: "보통" },
    ],
  };
};
const recoverRequiredEventReroute = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  request: SimulateRequest,
  reroute: RequiredEventReroute,
): Omit<EngineTurnResponse, "mode" | "usage"> => {
  if (!reroute.active || requiredEventRerouteSatisfied(turn, reroute)) return turn;
  const adapter = resolveWorkAdapterByRouteId(reroute.routeId);
  if (adapter) {
    return adapter.recoverRequiredEventReroute(turn, request, reroute, {
      addRouteMinutes,
      requiredEventRerouteSatisfied,
    });
  }

  const drive = deriveStoryDrive({
    pack: request.pack,
    state: request.state,
    userText: request.userText,
    recentTurns: request.recentTurns,
    longTermMemories: request.longTermMemories,
    advanceMode: request.advanceMode,
  });
  const defaults = routeRecoveryDefaults(request, drive);
  const inventoryAdd = [...new Set([
    ...turn.statePatch.inventoryAdd,
    ...reroute.requiredItems,
  ])];
  const encounteredCharactersAdd = defaults.blocks
    .filter((block) => block.type === "dialogue" && block.speakerId)
    .map((block) => ({
      characterId: block.speakerId!,
      name: block.speakerName ?? "",
      relationType: "현재 사건에서 첫 대면",
    }));
  const verificationTurn = {
    ...turn,
    blocks: defaults.blocks,
    statePatch: { ...turn.statePatch, inventoryAdd },
    claudeSignals: turn.claudeSignals
      ? { ...turn.claudeSignals, eventResolved: true }
      : turn.claudeSignals,
    narrativeAudit: turn.narrativeAudit
      ? { ...turn.narrativeAudit, routeEventStatus: "completed" as const }
      : turn.narrativeAudit,
  };
  const serverMayResolveEvent = requiredEventRerouteSatisfied(
    verificationTurn,
    reroute,
  );
  const evidence = defaults.blocks
    .filter((block) => block.type !== "system")
    .map((block) => block.text)
    .join(" ")
    .slice(0, 360);
  return {
    ...turn,
    blocks: defaults.blocks,
    statePatch: {
      ...turn.statePatch,
      time: defaults.time,
      dayDelta: defaults.dayDelta ?? 0,
      location: defaults.location ?? request.state.location,
      sceneSummary: defaults.sceneSummary,
      memoryAdd: [...new Set([...turn.statePatch.memoryAdd, defaults.memory])],
      inventoryAdd,
      encounteredCharactersAdd: [
        ...turn.statePatch.encounteredCharactersAdd,
        ...encounteredCharactersAdd,
      ].filter((character, index, all) =>
        all.findIndex((candidate) =>
          candidate.characterId === character.characterId
        ) === index
      ),
    },
    recommendations: defaults.recommendations,
    agencyAudit: {
      playerActionInvented: false,
      note: "사용자의 선택을 보존하면서 현재 필수 사건의 결과를 같은 장면 안에서 연결했습니다.",
    },
    claudeSignals: turn.claudeSignals
      ? {
          ...turn.claudeSignals,
          inputMode: "advance",
          sceneTime: defaults.time,
          location: defaults.location ?? request.state.location,
          beatAdvanced: true,
          eventResolved: serverMayResolveEvent,
          resolutionSummary: serverMayResolveEvent
            ? `${reroute.eventName}의 필수 행동과 결과가 본문에서 실제로 성립했다.`
            : "",
        }
      : turn.claudeSignals,
    narrativeAudit: turn.narrativeAudit
      ? {
          ...turn.narrativeAudit,
          inputHandled: true,
          inputOutcome: "resolved",
          inputEvidence: evidence,
          meaningfulBeat: true,
          meaningfulBeatEvidence: evidence,
          routeEventStatus: serverMayResolveEvent ? "completed" : "in_progress",
          routeEventEvidence: evidence,
          chronologyConsistent: true,
          recommendationsGrounded: true,
          currentTime: defaults.time,
          currentLocation: defaults.location ?? request.state.location,
        }
      : turn.narrativeAudit,
  };
};
const recoverRejectedTurnIntoCanon = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  request: SimulateRequest,
  drive: StoryDrive,
): Omit<EngineTurnResponse, "mode" | "usage"> => {
  const route = drive.routeLock;
  const activeEvent = request.pack.events.find(
    (event) => event.id === route.currentEventId,
  );
  const intent = deriveClaudeTurnIntent(
    request.userText,
    activeEvent,
    request.state.time,
  );
  const actualDerailment = route.active && intent.explicitDerailment;

  // Claude HTML의 핵심 원칙: A(현재 사건 진행)·B(가벼운 곁가지) 입력의
  // 서사는 모델이 쓴 결과를 유지하고 서버는 구조만 판정한다. 활성 사건이
  // 있다는 이유로 정상 대화까지 고정문 정사 복구로 바꾸지 않는다.
  if (
    !actualDerailment &&
    turn.blocks.length > 0 &&
    Boolean(turn.claudeSignals)
  ) {
    return {
      ...turn,
      claudeSignals: turn.claudeSignals
        ? {
            ...turn.claudeSignals,
            sceneTime: turn.statePatch.time,
            location: turn.statePatch.location,
          }
        : turn.claudeSignals,
    };
  }
  const forcedReroute: RequiredEventReroute = {
    active: actualDerailment,
    mode: actualDerailment ? "immediate_absorb" : "inactive",
    routeId: actualDerailment ? route.routeId : "",
    eventId: actualDerailment ? route.currentEventId : "",
    eventName: actualDerailment ? route.currentEventName : "",
    phase: actualDerailment ? route.phase : "",
    policy: actualDerailment
      ? "입력의 욕구를 인정한 뒤 인물다운 동기로 재고하고 현재 필수 사건을 같은 턴에 실제 완료한다."
      : "",
    alternatives: actualDerailment
      ? route.recoveryAlternatives.length
        ? route.recoveryAlternatives
        : eventRerouteAlternatives(route.routeId, route.phase)
      : [],
    completionSignals: actualDerailment ? route.completionSignals : [],
    requiredItems: actualDerailment ? route.requiredItems : [],
    requiredDialogue: actualDerailment ? route.requiredDialogue : "",
    requiredSpeakerId: actualDerailment ? route.requiredSpeakerId : "",
    destinationHint: actualDerailment ? intent.destinationHint : "",
    requestedEndTime: actualDerailment ? intent.requestedEndTime : "",
    preservePlayerIntent: actualDerailment,
    resolveCurrentEvent: actualDerailment,
    currentBeatSignals: [],
  };
  const recoveryTime = addRouteMinutes(request.state.time, 5);
  const emptyPatch = {
    ...turn.statePatch,
    time: request.state.time,
    dayDelta: 0,
    location: request.state.location,
    weather: request.state.weather,
    sceneSummary: request.state.sceneSummary,
    statusAdd: [],
    statusRemove: [],
    inventoryAdd: [],
    inventoryRemove: [],
    relationChanges: [],
    clockChanges: [],
    memoryAdd: [],
    variablesAdd: [],
    variablesResolve: [],
    characterVisualsAdd: [],
    encounteredCharactersAdd: [],
    statusLedgerChanges: [],
    autonomyActions: [],
    relationshipMemoriesAdd: [],
    relationshipMemoryResolveIds: [],
  };
  const safeBase: Omit<EngineTurnResponse, "mode" | "usage"> = {
    ...turn,
    blocks: [],
    statePatch: emptyPatch,
    recommendations: [],
    image: {
      recommended: false,
      reason: "서버 정사 흡수 폴백에서는 새 이미지를 예약하지 않는다.",
      prompt: "",
      characterIds: [],
    },
    characterVisuals: [],
    agencyAudit: {
      playerActionInvented: false,
      note: "입력을 거절하지 않고 서버가 현재 정사 범위의 행동으로 변환했다.",
    },
    narrativeAudit: {
      inputHandled: true,
      inputOutcome: "resolved",
      inputEvidence: "입력의 의도를 현재 장면에서 실행 가능한 정사 행동으로 전환했다.",
      meaningfulBeat: true,
      meaningfulBeatEvidence: "현재 장면에 관측 가능한 변화가 생겼다.",
      routeEventStatus: route.active ? "in_progress" : "not_started",
      routeEventEvidence: "",
      chronologyConsistent: true,
      chronologyNote: "서버 단일 시간축에서 5분만 진행했다.",
      recommendationsGrounded: true,
      recommendationBasis: [],
      currentScene: request.state.sceneSummary,
      currentLocation: request.state.location,
      currentTime: request.state.time,
      activeCharacters: [],
      activeThreats: [],
    },
    claudeSignals: {
      inputMode: "advance",
      sceneTime: request.state.time,
      location: request.state.location,
      appearing: [],
      firstAppearance: [],
      mentioned: [],
      openQuestions: [],
      resolvedQuestions: [],
      beatAdvanced: true,
      eventResolved: false,
      resolutionSummary: "",
      autoAction: "서버가 입력을 현재 정사 범위로 흡수했다.",
    },
  };
  if (forcedReroute.active) {
    return recoverRequiredEventReroute(safeBase, request, forcedReroute);
  }
  const scene = request.state.sceneSummary || `${request.state.location}의 현재 장면`;
  const destination = intent.destinationHint.trim();
  const recoveryText = destination
    ? `${destination}로 향하려는 선택은 분명했다. 출발에 필요한 정보를 확인하던 사이, ${scene}에서 미처 지나치지 못한 변화가 먼저 모습을 드러냈다.`
    : `방금 내린 선택은 허공으로 사라지지 않았다. ${scene}에서 그 선택을 실행할 첫 단서를 붙잡는 순간, 주변도 가만히 있지 않고 반응했다.`;
  const resultText = destination
    ? `${request.state.location}에 남은 변화는 원래 목적을 지우지 않았다. 다만 지금 확인한 결과 때문에, 출발하기 전에 무엇을 챙기고 누구에게 답할지 새로 선택해야 했다.`
    : `${request.state.location}의 사람과 사물이 구체적인 반응을 돌려주었다. 방금의 선택은 흔적을 남겼고, 다음에는 그 결과를 받아들일지 밀어붙일지 결정할 수 있었다.`;
  return {
    ...safeBase,
    blocks: [
      { id: createId(), type: "narration", text: recoveryText },
      { id: createId(), type: "narration", text: resultText },
    ],
    statePatch: {
      ...emptyPatch,
      time: recoveryTime,
      sceneSummary: `${request.state.location}에서 사용자의 선택이 주변 반응과 새로운 판단 지점으로 이어졌다.`,
      memoryAdd: [destination
        ? `${destination}로 향하려는 계획이 남아 있고, 출발 전 현재 장소의 변화를 먼저 확인했다.`
        : "방금의 선택이 현재 장면에 구체적인 반응과 결과를 남겼다."],
    },
    recommendations: [
      { label: `${request.state.location}에서 방금 달라진 흔적을 직접 확인한다.`, risk: "낮음" },
      { label: "휴대전화로 지금 필요한 연락을 보낸다.", risk: "보통" },
      { label: "가장 가까운 출구로 이동해 다음 행동을 시작한다.", risk: "보통" },
    ],
    narrativeAudit: {
      ...safeBase.narrativeAudit!,
      inputEvidence: recoveryText,
      meaningfulBeatEvidence: resultText,
      currentScene: resultText,
      currentTime: recoveryTime,
    },
    claudeSignals: {
      ...safeBase.claudeSignals!,
      sceneTime: recoveryTime,
    },
  };
};

const latestConversationSpeaker = (request: SimulateRequest) => {
  for (const recentTurn of [...request.recentTurns].reverse()) {
    const speaker = [...recentTurn.blocks].reverse().find(
      (block) => block.type === "dialogue" && block.speakerName?.trim(),
    );
    if (speaker?.speakerName) {
      return {
        id: speaker.speakerId ?? "",
        name: speaker.speakerName,
      };
    }
  }
  return undefined;
};

const currentSceneSpeaker = (request: SimulateRequest) => {
  const latest = latestConversationSpeaker(request);
  if (latest) return latest;
  const summary = request.state.sceneSummary.normalize("NFKC");
  const npc = request.pack.npcs.find((candidate) =>
    summary.includes(candidate.name.normalize("NFKC")) &&
    request.state.encounteredCharacterIds.includes(candidate.id)
  );
  return npc ? { id: npc.id, name: npc.name } : undefined;
};

const movementTargetFromInput = (
  input: string,
  playerName: string,
): string => {
  if (/(?:집|자택)(?:으로|에)?\s*(?:돌아|귀가|간다|가기로)/u.test(input)) {
    return `${playerName}의 집`;
  }
  const normalized = input.normalize("NFKC");
  const objectVisitMatch = normalized.match(
    /([^.!?。！？,;\n]{1,120}?)(?:을|를)\s*(?:직접\s*)?방문(?:하|해|하여|한다|했다|하기로|하려고)?/u,
  );
  const particleMatch = normalized.match(
    /([^.!?。！？,;\n]{1,120}?)(?:으로|로|까지|에)\s*(?:곧장\s*)?(?:돌아가(?:기로|려고|겠다|자|서|다)?|귀가(?:하|해|하여|한다|했다|하기로)?|향(?:하|해|하여|한다|했다|하기로)?|이동(?:하|해|하여|해서|한다|했다|하기로)?|출발(?:하|해|하여|한다|했다|하기로)?|따라가(?:서|기로|려고|겠다|자|다)?|찾아가(?:서|기로|려고|겠다|자|다)?|들르(?:기로|려고|겠다|자|며|고|러|다|는|기)?|들려\s*(?:가|보)(?:기로|려고|겠다|자|며|고|다)?|방문(?:하|해|하여|한다|했다|하기로|하려고)?|들어가(?:서|기로|려고|겠다|자|다)?|입장(?:하|해|하여|한다|했다|하기로)?|가(?:서|기로|려고|겠다|자|다|\s*본다)|도착(?:하|해|하여|한다|했다)?)/u,
  );
  return (objectVisitMatch?.[1] ?? particleMatch?.[1] ?? "")
    .replace(new RegExp(`^(?:${playerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?:은|는|이|가)\\s+`, "u"), "")
    .replace(/^(?:주인공)(?:은|는|이|가)\s+/u, "")
    .split(/(?:남겨\s*두고|놓아?\s*두고|두고|놓고|챙기고|챙긴\s*뒤|들고|가지고|휴대하고|함께|마치고|끝내고|한\s*뒤|하고|그리고)\s+/u)
    .at(-1)!
    .replace(/^(?:갑자기|일단|우선|그냥|비도\s*오는데|이제)\s+/u, "")
    .replace(/^(?:잠깐|잠시|곧장|먼저)\s+/u, "")
    .trim();
};

const compactActionObject = (value: string, playerName: string): string =>
  value
    .replace(new RegExp(`^(?:${playerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?:은|는|이|가)\\s+`, "u"), "")
    .replace(/^(?:주인공)(?:은|는|이|가)\s+/u, "")
    .replace(/^(?:그리고|그러고는|일단|우선|먼저|잠깐|잠시)\s+/u, "")
    .trim();

const hasKoreanFinalConsonant = (value: string): boolean => {
  const character = [...value.trim()].at(-1) ?? "";
  const code = character.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
};

const withKoreanParticle = (
  value: string,
  consonantParticle: string,
  vowelParticle: string,
): string => `${value}${hasKoreanFinalConsonant(value)
  ? consonantParticle
  : vowelParticle}`;

const narrativeLocationName = (value: string): string => {
  const lastSegment = value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .at(-1) ?? value;
  return lastSegment
    .replace(/^(?:대한민국\s*)?(?:서울특별시|서울시)\s*/u, "")
    .trim();
};

const placedActionFromInput = (
  input: string,
  playerName: string,
): { item: string; place: string } | undefined => {
  const match = input.normalize("NFKC").match(
    /([^.!?。！？,;\n]{1,36}?)(?:을|를)\s+([^.!?。！？,;\n]{1,28}?)(?:에|위에)\s*(?:남겨\s*두|놓아?\s*두|놓|두)/u,
  );
  if (!match) return undefined;
  const item = compactActionObject(match[1], playerName);
  const place = compactActionObject(match[2], playerName);
  return item && place ? { item, place } : undefined;
};

const movementDepartureNarration = (
  input: string,
  playerName: string,
  currentLocation: string,
  residentialLocation = false,
): string => {
  const normalized = input.normalize("NFKC");
  const placed = placedActionFromInput(normalized, playerName);
  const carried = normalized.match(
    /([^.!?。！？,;\n]{1,32}?)(?:와|과)\s*함께/u,
  ) ?? normalized.match(
    /([^.!?。！？,;\n]{1,32}?)(?:을|를)\s*(?:챙기|챙겨|들고|가지고|휴대하)/u,
  );
  const pieces: string[] = [];
  if (placed) {
    pieces.push(`${withKoreanParticle(placed.item, "은", "는")} ${placed.place}에 남았다.`);
  }
  let carriedItem = "";
  if (carried) {
    carriedItem = compactActionObject(carried[1], playerName)
      .split(/(?:남겨\s*두고|놓아?\s*두고|두고|놓고|그리고)\s+/u)
      .at(-1)!
      .trim();
  }
  const shortLocation = narrativeLocationName(currentLocation);
  if (residentialLocation) {
    pieces.push(carriedItem
      ? `${withKoreanParticle(playerName, "은", "는")} ${withKoreanParticle(carriedItem, "을", "를")} 챙겨 ${shortLocation} 현관을 나섰다.`
      : `${withKoreanParticle(playerName, "은", "는")} ${shortLocation} 현관문을 열고 골목으로 나섰다.`);
  } else {
    pieces.push(carriedItem
      ? `${withKoreanParticle(playerName, "은", "는")} ${withKoreanParticle(carriedItem, "을", "를")} 챙겨 ${shortLocation}을 나섰다.`
      : `${withKoreanParticle(playerName, "은", "는")} 하던 일을 마무리하고 ${shortLocation}을 나섰다.`);
  }
  return pieces.join(" ");
};

const movementArrivalNarration = (
  destination: string,
  travelMinutes: number,
  weather: string,
): string => {
  const shortDestination = narrativeLocationName(destination);
  const rainDetail = /비|소나기|폭우/u.test(weather)
    ? "우산 끝에서 빗물이 바닥으로 톡톡 떨어질 즈음"
    : "골목을 몇 차례 지나";
  if (/(?:편의점|마트|가게|상점|카페|식당|서점|약국)/u.test(shortDestination)) {
    return `${rainDetail}, ${travelMinutes}분쯤 걸어 도착한 ${shortDestination}의 밝은 간판이 눈에 들어왔다. 자동문이 열리며 따뜻한 실내 공기와 진열대의 불빛이 한꺼번에 밀려왔다.`;
  }
  if (/(?:도서관|박물관|학교|대학|캠퍼스|역|정류장|성당|교회)/u.test(shortDestination)) {
    return `${rainDetail}, ${travelMinutes}분쯤 뒤 ${shortDestination} 입구에 닿았다. 안쪽의 조명과 사람들의 발소리가 지금 막 도착한 장소의 분위기를 또렷하게 드러냈다.`;
  }
  return `${rainDetail}, ${travelMinutes}분쯤 뒤 ${shortDestination}에 닿았다. 발걸음을 멈추자 새 장소의 소리와 풍경이 비로소 선명해졌다.`;
};

const PICKUP_ACTION_PATTERN =
  /(?:물품|택배|소포|상자|봉투|내용물|배송물|수령물).{0,28}(?:수령|받|인도받|회수|꺼내|챙기)|(?:수령|받|인도받|회수|꺼내|챙기).{0,28}(?:물품|택배|소포|상자|봉투|내용물|배송물|수령물)/u;
const OPEN_ACTION_PATTERN = /(?:보관함|택배함|상자|봉투|문|잠금|포장).{0,20}(?:열|개봉)|(?:열|개봉).{0,20}(?:보관함|택배함|상자|봉투|문|잠금|포장)/u;
const INSPECT_ACTION_PATTERN =
  /(?:내용물|물품|택배|상자|봉투|문서|소지품).{0,20}(?:확인|살펴|조사)|(?:확인|살펴|조사).{0,20}(?:내용물|물품|택배|상자|봉투|문서|소지품)/u;

const recoveryTravelMinutes = (
  currentLocation: string,
  destination: string,
  input: string,
): number => {
  const normalized = `${currentLocation}\n${destination}\n${input}`.normalize("NFKC");
  const declared = normalized.match(/(\d{1,3})\s*분/u)?.[1];
  if (declared) return Math.min(180, Math.max(3, Number(declared)));
  if (/(?:같은\s*건물|인접|바로\s*밖|공학관\s*밖|교내).{0,20}(?:보관함|택배함)|(?:보관함|택배함).{0,20}(?:공학관|교내)/u.test(normalized)) {
    return 8;
  }
  if (/집|자택|기숙사|숙소/u.test(destination)) return 20;
  if (/대학|학교|캠퍼스|공학관|강의실|보관함|택배함/u.test(normalized)) return 12;
  if (/역|정류장|버스|지하철|택시|클럽|다른\s*구|다른\s*동/u.test(normalized)) return 30;
  return 10;
};

const locationAfterLeaving = (currentLocation: string): string => {
  if (/무인\s*택배함/u.test(currentLocation)) {
    return currentLocation.replace(
      /(?:\s*\d+층)?\s*무인\s*택배함.*$/u,
      " 바깥 보행로",
    );
  }
  if (/처마/u.test(currentLocation)) {
    return currentLocation.replace(/\s*처마.*$/u, " 앞 보행로");
  }
  if (/현관\s*앞/u.test(currentLocation)) {
    return currentLocation.replace(/\s*현관\s*앞.*$/u, " 앞 보행로");
  }
  if (/실내|안쪽|내부/u.test(currentLocation)) {
    return currentLocation.replace(/(?:실내|안쪽|내부).*$/u, "바깥");
  }
  if (/방$/u.test(currentLocation)) return `${currentLocation} 밖 복도`;
  return `${currentLocation} 바깥 동선`;
};

const recoverInputContinuity = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  request: SimulateRequest,
  drive: StoryDrive,
): Omit<EngineTurnResponse, "mode" | "usage"> => {
  const input = request.userText.normalize("NFKC").trim();
  const playerName = request.pack.player.name || "주인공";
  const currentLocation = request.state.location || "현재 장소";
  const narration = (text: string): StoryBlock => ({
    id: createId(),
    type: "narration",
    text,
    speakerId: "",
    speakerName: "",
    emotion: "",
    mediaAssetId: "",
  });
  const dialogue = (text: string, npc: NonNullable<ReturnType<typeof requestedNpcFromInput>>): StoryBlock => ({
    id: createId(),
    type: "dialogue",
    text,
    speakerId: npc.id,
    speakerName: npc.name,
    emotion: "뜻밖의 재회에 놀람",
    mediaAssetId: "",
  });
  const movementIntent = movementActionRequested(input);
  const conversationIntent = inputContainsSpeech(input);
  const stayIntent = /(?:계속|머무|기다|수업|공부|쉬|휴식|가만히)/u.test(input);
  const sleepIntent = /(?:잠|자자|취침|눕)/u.test(input);
  const pickupIntent = PICKUP_ACTION_PATTERN.test(input);
  const openIntent = OPEN_ACTION_PATTERN.test(input);
  const inspectIntent = INSPECT_ACTION_PATTERN.test(input);
  const overreachIntent = derivePlayerOverreachIntent(input);
  const activeEvent = request.pack.events.find(
    (event) => event.id === drive.routeLock.currentEventId,
  );
  const activeEventText = activeEvent
    ? `${activeEvent.name} ${activeEvent.conditions} ${activeEvent.description} ${activeEvent.effects} ${activeEvent.completionSignals}`
    : "";
  const requestedNpc = requestedNpcFromInput(request);
  const recentPublicText = request.recentTurns
    .flatMap((recentTurn) => recentTurn.blocks.map((block) =>
      `${block.speakerName ?? ""} ${block.text}`
    ))
    .join("\n")
    .normalize("NFKC");
  const requestedNpcTokens = requestedNpc?.name
    .normalize("NFKC")
    .split(/[\s·/()]+/u)
    .filter((token) => token.length >= 2) ?? [];
  const requestedNpcKnown = Boolean(
    requestedNpc &&
    (
      request.state.encounteredCharacterIds.includes(requestedNpc.id) ||
      requestedNpcTokens.some((token) =>
        request.state.sceneSummary.includes(token) ||
        request.state.memories.some((memory) => memory.includes(token)) ||
        recentPublicText.includes(token)
      )
    ),
  );
  const requestedNpcBelongsToActiveEvent = Boolean(
    requestedNpc &&
    requestedNpcTokens.some((token) => activeEventText.includes(token)),
  );
  const requestedNpcMayAppear = requestedNpcKnown || requestedNpcBelongsToActiveEvent;
  const activeEventItems = activeEvent
    ? requiredEventItems(activeEvent)
    : drive.routeLock.requiredItems;
  const acquisitionEvent = Boolean(
    pickupIntent &&
    activeEvent &&
    /(?:수령|택배|보관함|상자|봉투|물품|회수|획득|전달|꺼내|열)/u.test(activeEventText),
  );
  const recoveredItems = acquisitionEvent
    ? activeEventItems.filter((item) =>
        !request.state.inventory.some((owned) =>
          compactDisclosureTerm(owned) === compactDisclosureTerm(item)
        )
      )
    : [];
  const acquisitionCompletionSignal = acquisitionEvent
    ? drive.routeLock.completionSignals.find((signal) => signal.trim())
    : undefined;
  let blocks: StoryBlock[];
  let time = addRouteMinutes(request.state.time, 3);
  let location = currentLocation;
  let sceneSummary = `${currentLocation}에서 사용자가 정한 행동의 직접 결과가 반영됐다.`;
  let memory = "";
  let appearedRequestedNpc = false;
  let encounteredCharactersAdd: Array<{
    characterId: string;
    name: string;
    relationType: string;
  }> = [];
  let recommendations: Array<{ label: string; risk: "낮음" | "보통" | "높음" }>;

  if (overreachIntent.active) {
    const routeLocation = /(?:등교|대학교|대학|학교|캠퍼스)/u.test(input)
      ? "대학교로 이어지는 통학로"
      : overreachIntent.attemptsTravel
        ? movementTargetFromInput(input, playerName) || locationAfterLeaving(currentLocation)
        : currentLocation;
    const elapsed = overreachIntent.attemptsTravel ? 8 : 3;
    time = addRouteMinutes(request.state.time, elapsed);
    location = routeLocation;
    const attempt = overreachIntent.kind === "social"
      ? `${playerName}는 ${overreachIntent.attemptsTravel ? `${currentLocation}을 나서 ${routeLocation}를 걷는 동안` : `${currentLocation}에서`} 눈에 들어오는 사람들에게 선을 넘는 말과 농담을 몇 차례 던졌다. 말은 실제로 입 밖으로 나갔고, 없던 일이 되지 않았다.`
      : overreachIntent.kind === "violence"
        ? `${playerName}는 ${routeLocation}에서 상대에게 거칠게 달려들어 힘으로 밀어붙이려 했다. 시도는 실제 행동으로 이어졌지만, 결과까지 마음대로 정할 수 있는 상황은 아니었다.`
        : overreachIntent.kind === "property"
          ? `${playerName}는 ${routeLocation}에서 남의 물건이나 시설에 손을 대 자신의 뜻대로 가져가거나 망가뜨리려 했다. 그 움직임은 곧 주변의 눈에 띄었다.`
          : overreachIntent.kind === "coercion"
            ? `${playerName}는 ${routeLocation}에서 상대를 억지로 따르게 만들려 했다. 거절할 틈을 빼앗으려는 움직임이 드러나자 주변의 공기가 단숨에 달라졌다.`
            : `${playerName}는 ${routeLocation}에서 자신의 뜻만으로 상황 전체를 뒤집으려 했다. 힘을 집중해 실제로 시도했지만, 세계는 선언만으로 복종하지 않았다.`;
    const reaction = overreachIntent.kind === "social"
      ? "처음에는 어이없어 굳어 있던 행인 한 명이 곧 얼굴을 굳히며 멈춰 섰다. 다른 사람은 동행을 자기 쪽으로 당겼고, 조금 떨어진 곳에서는 누군가 휴대전화를 들어 그의 말과 동선을 남기기 시작했다."
      : overreachIntent.kind === "violence"
        ? "상대가 몸을 피하며 소리쳤고, 가까이 있던 사람들이 둘 사이를 벌렸다. 누군가는 경비를 부르며 더 다가오지 말라고 경고했다."
        : overreachIntent.kind === "property"
          ? "금속성 소리와 함께 주변의 시선이 한꺼번에 쏠렸다. 주인이 손을 뻗어 막아섰고, 가까운 사람은 경비에게 현재 위치를 알렸다."
          : overreachIntent.kind === "coercion"
            ? "상대가 즉시 몸을 빼며 단호하게 거절했다. 주변 사람들도 사이에 끼어들었고, 한 사람은 신고 화면을 연 채 더 다가오지 말라고 말했다."
            : "아무도 쓰러지거나 복종하지 않았다. 대신 무리한 시도의 반동과 주변의 경계만 또렷하게 돌아왔다.";
    const consequence = overreachIntent.kind === "social"
      ? `장난으로 넘길 수 있는 선은 이미 사라졌다. ${overreachIntent.attemptsTravel ? "이동은 그 자리에서 지연됐고, " : ""}이후의 행동에는 신고 가능성과 주변의 경계라는 대가가 따라붙었다.`
      : overreachIntent.kind === "violence"
        ? `원한 대로 상대를 제압하지 못한 채 충돌만 커졌다. ${overreachIntent.attemptsTravel ? "가던 길은 막혔고, " : ""}경비가 도착하기 전까지 이곳을 마음대로 벗어나기도 어려워졌다.`
        : overreachIntent.kind === "property"
          ? "물건이나 시설을 차지하려던 시도는 현장에서 막혔다. 목격자와 경비 호출 기록이 남아, 이후에는 손해와 책임을 피할 수 없는 상황이 됐다."
          : overreachIntent.kind === "coercion"
            ? "상대의 거절은 뒤집히지 않았고, 강요한 사실만 여러 사람 앞에 남았다. 더 밀어붙일수록 신고와 관계 단절의 위험이 커질 뿐이었다."
            : "바라던 결과는 일어나지 않았고, 힘과 시간만 빠져나갔다. 실패의 흔적이 남았기에 다음 행동은 그 반동을 감수한 채 골라야 했다.";
    blocks = [narration(attempt), narration(reaction), narration(consequence)];
    const routeHook = drive.routeLock.phase === "ordinary_before_parcel"
      ? "택배 앱에서 새 수령 알림이 떠 있었다"
      : ["nadia_human_encounter", "nadia_human_conversation"].includes(
          drive.routeLock.phase,
        )
        ? "오늘 캠퍼스 일정과 방문자 안내가 함께 떠 있었다"
        : drive.routeLock.phase === "separate_evening_daily_life"
          ? "오늘 남은 일정과 귀가 시각을 확인하라는 알림이 떠 있었다"
          : drive.routeLock.phase === "seochon_blackout_attack"
            ? "인근 구역의 전력 이상을 알리는 안전 문자가 떠 있었다"
            : drive.routeLock.phase === "night_pursuit_to_shelter"
              ? "가까운 통행로가 막혔다는 안전 안내가 떠 있었다"
              : drive.routeLock.active
                ? "지금 확인해야 할 새 알림이 떠 있었다"
                : "";
    if (routeHook) {
      blocks.push(narration(
        `방금 벌어진 소란 때문에 주변의 신고·안전 연락망이 활성화됐다. 제지 과정에서 확인을 요구받은 휴대전화 화면에는 ${routeHook}. 별개의 일이 갑자기 끼어든 것이 아니라, 방금 남은 기록과 동선 통제의 결과가 현재 상황과 맞물린 것이었다.`,
      ));
    }
    sceneSummary = `${location}에서 ${playerName}의 과잉 행동이 주변의 직접 반응과 현실적인 대가를 불렀다.`;
    memory = `${location}에서 선을 넘는 시도를 했고, 주변의 제지와 기록·신고 가능성이 남았다.`;
    recommendations = overreachIntent.kind === "social"
      ? [
          { label: "휴대전화를 든 행인에게 거리를 두고 방금 행동을 설명한다.", risk: "낮음" },
          { label: "신고 가능성이 더 커지지 않도록 사람들과 거리를 벌려 이동한다.", risk: "보통" },
          { label: "주변의 경계를 무시하지 않고 가까운 경비에게 상황을 설명한다.", risk: "높음" },
        ]
      : overreachIntent.kind === "violence"
        ? [
            { label: "상대와 거리를 벌리고 더 공격하지 않겠다고 분명히 말한다.", risk: "낮음" },
            { label: "도착하는 경비에게 충돌이 시작된 경위를 직접 설명한다.", risk: "보통" },
            { label: "경비의 제지에 따르며 현장에서 벗어날 방법을 요청한다.", risk: "높음" },
          ]
        : overreachIntent.kind === "coercion"
          ? [
              { label: "상대에게서 물러난 뒤 강요한 행동을 직접 설명한다.", risk: "낮음" },
              { label: "신고 화면을 든 사람에게 더 접근하지 않고 상황을 설명한다.", risk: "보통" },
              { label: "주변 사람들의 제지에 따르며 현장을 떠날 방법을 요청한다.", risk: "높음" },
            ]
          : overreachIntent.kind === "impossible"
      ? [
          { label: "무리한 시도의 반동이 몸에 남았는지 직접 확인한다.", risk: "낮음" },
          { label: "남은 힘을 확인하고 지금 가능한 작은 행동을 결정한다.", risk: "보통" },
          { label: "주변의 경계를 살피며 같은 시도를 중단하고 이동한다.", risk: "높음" },
        ]
      : overreachIntent.kind === "property"
        ? [
            { label: "손을 뗀 뒤 물건의 주인과 목격자에게 피해 상태를 확인한다.", risk: "낮음" },
            { label: "경비가 오기 전에 도망치지 않고 책임질 방법을 제안한다.", risk: "보통" },
            { label: "다가오는 경비에게 방금 손댄 물건과 행동을 직접 설명한다.", risk: "높음" },
          ]
        : [
            { label: "방금 피해를 입은 사람들에게 거리를 두고 사과한다.", risk: "낮음" },
            { label: "휴대전화의 새 알림을 확인하며 현장에서 더 충돌하지 않도록 물러난다.", risk: "보통" },
            { label: "다가오는 경비에게 방금 벌어진 일을 직접 설명한다.", risk: "높음" },
          ];
  } else if (movementIntent) {
    const explicitTarget = movementTargetFromInput(input, playerName);
    location = explicitTarget || locationAfterLeaving(currentLocation);
    const travelMinutes = recoveryTravelMinutes(currentLocation, location, input);
    time = addRouteMinutes(request.state.time, travelMinutes);
    blocks = [
      narration(movementDepartureNarration(
        input,
        playerName,
        currentLocation,
        /(?:집|자택|주택|아파트|원룸|기숙사|숙소|거처|침실|방)/u.test(currentLocation),
      )),
      narration(movementArrivalNarration(location, travelMinutes, request.state.weather)),
    ];
    if (conversationIntent && requestedNpc) {
      if (requestedNpcMayAppear) {
        appearedRequestedNpc = true;
        const reunionDetail = /(?:편의점|마트|가게|상점)/u.test(location)
          ? `냉장 진열대 끝에서 상품 라벨을 살피던 ${requestedNpc.name}가 고개를 들었다.`
          : `사람들 사이에서 낯익은 ${requestedNpc.name}의 모습이 눈에 들어왔다.`;
        blocks.push(narration(
          `${reunionDetail} ${withKoreanParticle(playerName, "이", "가")} 가까이 다가가 말을 건네자, ${withKoreanParticle(requestedNpc.name, "은", "는")} 잠시 놀란 표정으로 그를 알아보았다.`,
        ));
        blocks.push(dialogue(
          requestedNpcKnown
            ? "아까 뵀던 분이군요. 여기서 다시 만날 줄은 몰랐어요."
            : "저를 부르셨나요? 무슨 일이신가요?",
          requestedNpc,
        ));
        if (!request.state.encounteredCharacterIds.includes(requestedNpc.id)) {
          encounteredCharactersAdd = [{
            characterId: requestedNpc.id,
            name: requestedNpc.name,
            relationType: "현재 동선에서 첫 대화",
          }];
        }
      } else {
        blocks.push(narration(
          `${withKoreanParticle(playerName, "이", "가")} ${requestedNpc.name}라고 생각한 뒷모습을 향해 말을 건넸지만, 돌아본 사람은 전혀 다른 얼굴이었다. 닮은 사람을 본 착각만 확인됐고, ${requestedNpc.name}의 행방은 이곳에서 확정되지 않았다.`,
        ));
      }
    }
    if (openIntent && !pickupIntent) {
      blocks.push(narration(`${playerName}는 도착한 자리에서 입력에 지정한 대상을 직접 열어 안쪽이 드러나게 했다.`));
    }
    if (pickupIntent) {
      blocks.push(narration(
        /(?:보관함|택배함)/u.test(`${input} ${location}`)
          ? `${playerName}는 알림의 수령 정보를 대조하고 보관함을 직접 열었다. 문이 열리자 안쪽의 물품을 꺼내 수령 절차를 실제로 마쳤다.`
          : `${playerName}는 도착한 자리에서 수령 정보를 확인한 뒤 지정한 물품을 직접 인도받아 손에 넣었다.`,
      ));
      if (recoveredItems.length > 0) {
        blocks.push(narration(`포장과 내용물을 확인하자 ${recoveredItems.join("·")}이 드러났다. ${playerName}는 각 물건을 확인하고 소지품에 챙겼다.`));
      } else if (inspectIntent) {
        blocks.push(narration(`${playerName}는 수령한 물품의 포장과 내용물을 그 자리에서 차례로 확인했다.`));
      }
    } else if (inspectIntent) {
      blocks.push(narration(`${playerName}는 도착한 자리에서 입력에 지정한 대상의 현재 상태를 직접 살펴 관찰 결과를 확정했다.`));
    }
    if (
      acquisitionCompletionSignal &&
      !compactDisclosureTerm(blocks.map((block) => block.text).join("\n")).includes(
        compactDisclosureTerm(acquisitionCompletionSignal),
      )
    ) {
      blocks.push(narration(`${acquisitionCompletionSignal.replace(/[.!?。！？]+$/u, "")}.`));
    }
    sceneSummary = `${playerName}가 ${currentLocation}을 떠나 ${location}에 도착했다.`;
    if (pickupIntent) {
      sceneSummary = recoveredItems.length
        ? `${playerName}가 ${location}에 도착해 물품을 수령하고 ${recoveredItems.join("·")}을 확보했다.`
        : `${playerName}가 ${location}에 도착해 지정한 물품을 실제로 수령했다.`;
      memory = sceneSummary;
      recommendations = [
        { label: `${location}에서 방금 수령한 물품의 상태와 출처를 확인한다.`, risk: "낮음" },
        { label: `${location}의 수령 기록과 알림을 대조한다.`, risk: "보통" },
        { label: `수령한 물품을 안전하게 챙긴 뒤 ${location}에서 다음 동선을 결정한다.`, risk: "보통" },
      ];
    } else {
      if (appearedRequestedNpc && requestedNpc) {
        sceneSummary = `${location}에서 ${requestedNpc.name}와 뜻밖에 다시 마주쳐 대화를 시작했다.`;
        memory = `${location}에서 ${requestedNpc.name}와 다시 만나 말을 건넸다.`;
        recommendations = [
          { label: `${requestedNpc.name}에게 이곳에 온 이유를 묻는다.`, risk: "낮음" },
          { label: `${requestedNpc.name}에게 낮에 보았던 상황을 확인한다.`, risk: "낮음" },
          { label: `${requestedNpc.name}와 필요한 이야기만 나눈 뒤 편의점 일을 마친다.`, risk: "보통" },
        ];
      } else {
        memory = `${currentLocation}을 떠나 ${location}으로 이동했다.`;
        recommendations = [
          { label: `${location}에서 가장 먼저 주변 동선을 확인한다.`, risk: "낮음" },
          { label: `${location}에서 휴대전화와 소지품을 정리한다.`, risk: "낮음" },
          { label: `${location}에서 이어 갈 다음 일정을 결정한다.`, risk: "보통" },
        ];
      }
    }
  } else if (pickupIntent) {
    time = addRouteMinutes(request.state.time, 4);
    blocks = [
      narration(
        /(?:보관함|택배함)/u.test(`${input} ${currentLocation}`)
          ? `${playerName}는 ${currentLocation}에서 알림의 수령 정보를 대조하고 보관함을 직접 열었다. 문이 열리자 안쪽의 물품을 꺼내 수령 절차를 마쳤다.`
          : `${playerName}는 ${currentLocation}에서 수령 정보를 확인한 뒤 지정한 물품을 직접 인도받았다.`,
      ),
    ];
    if (recoveredItems.length > 0) {
      blocks.push(narration(`포장과 내용물을 확인하자 ${recoveredItems.join("·")}이 드러났다. ${playerName}는 각 물건을 확인하고 소지품에 챙겼다.`));
    } else if (inspectIntent) {
      blocks.push(narration(`${playerName}는 수령한 물품의 포장과 내용물을 그 자리에서 차례로 확인했다.`));
    } else {
      blocks.push(narration(`물품은 미수령 상태로 남지 않았고, ${playerName}가 직접 소지한 상태가 됐다.`));
    }
    if (
      acquisitionCompletionSignal &&
      !compactDisclosureTerm(blocks.map((block) => block.text).join("\n")).includes(
        compactDisclosureTerm(acquisitionCompletionSignal),
      )
    ) {
      blocks.push(narration(`${acquisitionCompletionSignal.replace(/[.!?。！？]+$/u, "")}.`));
    }
    sceneSummary = recoveredItems.length
      ? `${currentLocation}에서 물품을 수령하고 ${recoveredItems.join("·")}을 확보했다.`
      : `${currentLocation}에서 지정한 물품을 실제로 수령했다.`;
    memory = sceneSummary;
    recommendations = [
      { label: `방금 수령한 물품의 상태와 출처를 확인한다.`, risk: "낮음" },
      { label: `${currentLocation}의 수령 기록과 알림을 대조한다.`, risk: "보통" },
      { label: `수령한 물품을 안전하게 챙긴 뒤 현재 동선을 이어 간다.`, risk: "보통" },
    ];
  } else if (conversationIntent) {
    const speaker = currentSceneSpeaker(request) ?? requestedNpc;
    const fearOrThreat = /(?:두렵|무섭|불안|겁이|공포|위협|이상한\s*(?:메모|편지|문자)|쫓기|살려)/u.test(input);
    const asksForCompany = /(?:(?:함께|같이|곁에|옆에).{0,36}(?:있|머물|보내)|시간을\s*보내).{0,36}(?:주|안\s*될까요|부탁)/u.test(input);
    const explicitRequest = /(?:부탁|요청|주(?:세요|실래요|시겠어요|실\s*수)|안\s*될까요)/u.test(input);
    const asksQuestion = /[?？]|(?:나요|가요|까요|습니까|인가요|일까요)[.!。]*$/u.test(input);
    const responseText = fearOrThreat && asksForCompany
      ? "그런 일을 겪으셨다면 불안하실 만해요. 우선 그 메모부터 보여 주세요. 오늘 밤 일을 바로 약속하기 전에 위험한 내용인지 확인하고, 안전하게 머물 방법부터 함께 정하죠."
      : explicitRequest
        ? "말씀하신 부탁은 이해했어요. 다만 바로 약속하기 전에 제가 알아야 할 사정이 있는지 조금 더 설명해 주시겠어요?"
        : asksQuestion
          ? "네, 들었어요. 방금 물으신 것부터 차근차근 말씀드릴게요."
          : "안녕하세요. 말씀하세요. 무슨 일이신가요?";
    blocks = [
      narration(
        fearOrThreat
          ? `${playerName}는 인사를 건넨 뒤, 목소리에 남은 긴장을 숨기지 못한 채 방금 겪은 일과 부탁을 끝까지 설명했다. 말이 끊기자 상대는 가볍게 넘기지 않고 그의 표정부터 살폈다.`
          : `${playerName}는 다른 사건에 말을 빼앗기지 않고, 지금 꺼낸 인사와 질문 또는 부탁을 현재 대화 상대에게 끝까지 전했다. 상대는 말을 자르지 않고 들은 뒤 대답했다.`,
      ),
      speaker
        ? {
            id: createId(),
            type: "dialogue",
            text: responseText,
            speakerId: speaker.id,
            speakerName: speaker.name,
            emotion: fearOrThreat ? "걱정하며 상황을 확인함" : "대화에 집중함",
            mediaAssetId: "",
          }
        : narration("말을 들은 상대는 바로 결론을 대신 정하지 않고, 부탁의 이유와 지금 필요한 도움이 무엇인지 먼저 확인했다."),
    ];
    sceneSummary = `${currentLocation}에서 ${playerName}의 말이 상대에게 전달되어 대화가 이어졌다.`;
    memory = `${currentLocation}에서 방금 꺼낸 화제로 대화를 이어 갔다.`;
    const speakerName = speaker?.name || "현재 대화 상대";
    recommendations = [
      { label: `${speakerName}의 답에서 가장 중요한 부분을 구체적으로 묻는다.`, risk: "낮음" },
      { label: `${speakerName}에게 현재 선택 가능한 방법을 설명해 달라고 한다.`, risk: "보통" },
      { label: `${speakerName}와의 대화를 마무리하고 현재 장소를 떠난다.`, risk: "보통" },
    ];
  } else if (sleepIntent) {
    const startsOutsideHome = /(?:집|자택|주택|아파트|원룸|기숙사|숙소).{0,20}(?:현관\s*앞|바깥|외부)/u.test(
      currentLocation,
    );
    if (startsOutsideHome) {
      location = currentLocation.replace(/\s*(?:현관\s*앞|바깥|외부).*$/u, " 실내");
    }
    time = addRouteMinutes(request.state.time, 5);
    const boxToDesk = /(?:상자|봉투|소지품).{0,20}(?:책상|탁자).{0,12}(?:올려|놓|두)/u.test(input) ||
      /(?:책상|탁자).{0,12}(?:위|에).{0,20}(?:상자|봉투|소지품)/u.test(input);
    blocks = [
      narration(
        startsOutsideHome
          ? `${playerName}는 문을 열고 ${location}로 들어갔다. 현관 밖에서 실내로 이어진 짧은 이동이 끝난 뒤 문도 닫혔다.`
          : `${playerName}는 ${currentLocation}에서 잠시 쉴 준비를 했다.`,
      ),
      narration(
        boxToDesk
          ? "가져온 상자와 메모를 책상 위에 올려둔 뒤 침대에 누워 잠을 청했다. 아직 깨어나지 않았으므로 시간은 몇 분만 흘렀고, 다음 사건을 미리 끌어오지 않았다."
          : "침대나 쉴 자리를 정돈한 뒤 누워 잠을 청했다. 아직 깨어나지 않았으므로 시간은 몇 분만 흘렀고, 다음 사건을 미리 끌어오지 않았다.",
      ),
    ];
    sceneSummary = `${location}에서 소지품을 정리하고 잠을 청하기 시작했다.`;
    memory = `${location}에서 잠을 청했다.`;
    recommendations = [
      { label: "문과 창문의 잠금 상태를 확인한 뒤 다시 눕는다.", risk: "낮음" },
      { label: "휴대전화 알람만 맞추고 그대로 잠을 청한다.", risk: "낮음" },
      { label: "잠들기 전에 책상 위 상자와 메모를 한 번 정리한다.", risk: "보통" },
    ];
  } else if (stayIntent) {
    const lesson = /(?:수업|강의)/u.test(input);
    const stayMinutes = lesson ? 50 : 5;
    time = addRouteMinutes(request.state.time, stayMinutes);
    blocks = lesson
      ? [
          narration(`${playerName}는 ${currentLocation}에 남아 지금 진행 중인 수업 한 교시를 들었다.`),
          narration(`${stayMinutes}분 동안 강의의 현재 단원과 필기를 따라갔다. 점심이나 오후 일정까지 한꺼번에 건너뛰지 않고, 수업 한 구간이 끝난 시점에서 다음 행동을 정할 수 있게 됐다.`),
        ]
      : [
          narration(`${playerName}는 ${currentLocation}에 그대로 머물며 방금 하던 일을 계속했다.`),
          narration("몇 분 동안 새로운 장소나 사건으로 건너뛰지 않은 채 현재 활동이 이어졌고, 그 자리에서 다음 행동을 정할 여유가 생겼다."),
        ];
    sceneSummary = lesson
      ? `${currentLocation}에서 수업 한 교시를 들었다.`
      : `${currentLocation}에서 현재 활동을 계속하며 몇 분이 흘렀다.`;
    memory = lesson
      ? `${currentLocation}에서 수업 한 교시를 들었다.`
      : `${currentLocation}에서 하던 일을 계속했다.`;
    recommendations = [
      { label: `${currentLocation}에서 현재 활동을 마무리한다.`, risk: "낮음" },
      { label: `${currentLocation}에서 휴대전화의 새 알림을 확인한다.`, risk: "낮음" },
      { label: `${currentLocation}을 떠날 다음 동선을 정한다.`, risk: "보통" },
    ];
  } else {
    const focus = meaningfulInputTokens(input)[0] || "눈앞의 대상";
    const closeMatch = input.match(/([가-힣A-Za-z0-9·][가-힣A-Za-z0-9·\s]{0,20}?)(을|를)\s*닫/u);
    const openMatch = input.match(/([가-힣A-Za-z0-9·][가-힣A-Za-z0-9·\s]{0,20}?)(을|를)\s*열/u);
    const inspectMatch = input.match(/([가-힣A-Za-z0-9·][가-힣A-Za-z0-9·\s]{0,20}?)(을|를)\s*(?:확인|살펴|조사)/u);
    const concreteAction = closeMatch ?? openMatch ?? inspectMatch;
    const objectWithParticle = concreteAction
      ? `${concreteAction[1].trim()}${concreteAction[2]}`
      : focus;
    if (closeMatch) {
      blocks = [
        narration(`${playerName}는 ${currentLocation}에서 ${objectWithParticle} 닫았다.`),
        narration(
          /창문/u.test(objectWithParticle) && /비/u.test(request.state.weather)
            ? "창틈으로 들이치던 빗방울도 더는 방 안으로 들어오지 않았다. 장소와 시간은 그대로인 채, 방금 한 행동의 결과만 눈앞에 남았다."
            : "열려 있던 틈이 완전히 닫혔다. 장소와 시간은 그대로인 채, 방금 한 행동의 결과만 눈앞에 남았다.",
        ),
      ];
    } else if (openMatch) {
      blocks = [
        narration(`${playerName}는 ${currentLocation}에서 ${objectWithParticle} 열었다.`),
        narration("가려져 있던 안쪽이 시야에 들어왔다. 다른 사건으로 건너뛰지 않은 채, 방금 연 대상의 상태부터 확인할 수 있었다."),
      ];
    } else if (inspectMatch) {
      blocks = [
        narration(`${playerName}는 ${currentLocation}에서 ${objectWithParticle} 직접 확인했다.`),
        narration("눈에 보이는 상태와 손에 닿는 반응을 차례로 살폈다. 확인하지 않은 결과를 미리 단정하지 않고, 현재 장면에서 알 수 있는 사실만 남았다."),
      ];
    } else {
      throw new SimulationRouteError(
        422,
        "LUNA_RESPONSE_REJECTED",
        "입력의 구체적인 행동 대상과 세계 반응을 확인할 수 없어 일반 행동 템플릿으로 저장하지 않았습니다. 입력과 세계 상태는 그대로 보존했습니다. 같은 입력으로 다시 시도해 주세요.",
      );
    }
    sceneSummary = `${currentLocation}에서 ${objectWithParticle} 대상으로 한 행동이 실제 결과로 이어졌다.`;
    memory = `${objectWithParticle} 대상으로 한 행동을 실행했다.`;
    recommendations = [
      { label: `${focus}에서 방금 달라진 점을 바탕으로 다음 행동을 결정한다.`, risk: "낮음" },
      { label: `${focus}와 관련된 정보를 휴대전화나 주변 기록에서 확인한다.`, risk: "보통" },
      { label: `${focus}를 정리하고 ${currentLocation}의 다른 동선으로 이동한다.`, risk: "보통" },
    ];
  }

  const recoveryText = blocks.map((block) => block.text).join("\n");
  const inventoryAdd = recoveredItems;
  const placedAction = movementIntent
    ? placedActionFromInput(input, playerName)
    : undefined;
  const inventoryRemove = placedAction
    ? request.state.inventory.filter((item) =>
        compactDisclosureTerm(item) === compactDisclosureTerm(placedAction.item)
      )
    : [];
  const inventoryAfter = [...new Set([
    ...request.state.inventory.filter((item) => !inventoryRemove.includes(item)),
    ...inventoryAdd,
  ])];
  const recoveryTouchesActiveEvent = Boolean(
    activeEvent &&
    (acquisitionEvent ||
      containsDisclosureTerm(recoveryText, activeEvent.name) ||
      drive.routeLock.completionSignals.some((signal) =>
        contractSituationSatisfied(signal, recoveryText)
      )),
  );
  const eventContractSatisfied = Boolean(
    activeEvent &&
    recoveryTouchesActiveEvent &&
    activeEvent.kind !== "compound" &&
    missingClaudeContract(activeEvent, recoveryText, inventoryAfter).length === 0,
  );
  const directInputResolved = inputOutcomeVisibleInTurn(
    request,
    {
      ...turn,
      blocks,
      statePatch: {
        ...turn.statePatch,
        time,
        location,
        inventoryAdd,
      },
    },
    deriveClaudeTurnIntent(input, activeEvent, request.state.time),
  );

  return {
    ...turn,
    blocks,
    statePatch: {
      ...turn.statePatch,
      time,
      location,
      weather: request.state.weather,
      sceneSummary,
      statusAdd: [],
      statusRemove: [],
      inventoryAdd,
      inventoryRemove,
      relationChanges: [],
      clockChanges: [],
      memoryAdd: memory ? [memory] : [],
      variablesAdd: [],
      variablesResolve: [],
      encounteredCharactersAdd,
      statusLedgerChanges: [],
      autonomyActions: [],
      relationshipMemoriesAdd: [],
      relationshipMemoryResolveIds: [],
    },
    recommendations,
    image: {
      ...turn.image,
      reason: "현재 입력의 직접 결과를 우선해 장면을 복구했습니다.",
      prompt: "",
      characterIds: [],
    },
    characterVisuals: [],
    claudeSignals: turn.claudeSignals
      ? {
          ...turn.claudeSignals,
          inputMode: overreachIntent.active ? "overreach" : "advance",
          sceneTime: time,
          location,
          beatAdvanced: directInputResolved,
          eventResolved: eventContractSatisfied,
          resolutionSummary: eventContractSatisfied
            ? `${drive.routeLock.currentEventName || activeEvent?.name || "현재 사건"}의 필수 행동과 결과가 본문과 상태에 실제로 성립했다.`
            : "",
        }
      : turn.claudeSignals,
    agencyAudit: {
      playerActionInvented: false,
      note: overreachIntent.active
        ? "사용자가 선언한 과잉 행동의 시도는 보존하고, 성공 여부는 세계의 반응과 비용으로 판정했습니다."
        : "사용자가 직접 선언한 이동과 후속 행동을 입력 순서대로 실행했습니다.",
    },
    narrativeAudit: {
      inputHandled: directInputResolved,
      inputOutcome: directInputResolved ? "resolved" : "in_progress",
      inputEvidence: recoveryText,
      meaningfulBeat: directInputResolved,
      meaningfulBeatEvidence: recoveryText,
      routeEventStatus: eventContractSatisfied ? "completed" : "in_progress",
      routeEventEvidence: eventContractSatisfied ? recoveryText : "현재 입력의 직접 결과만 성립했다.",
      chronologyConsistent: true,
      chronologyNote: `현재 시각에서 실제 이동과 후속 행동에 ${locationMinutesAdvanced(request.state.time, time)}분을 반영했다.`,
      recommendationsGrounded: true,
      recommendationBasis: [location, ...inventoryAdd].slice(0, 6),
      currentScene: sceneSummary,
      currentLocation: location,
      currentTime: time,
      activeCharacters: appearedRequestedNpc && requestedNpc
        ? [requestedNpc.name]
        : [],
      activeThreats: [],
    },
  };
};

const recoverLocationContinuity = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  request: SimulateRequest,
  drive: StoryDrive,
): Omit<EngineTurnResponse, "mode" | "usage"> => {
  if (
    request.advanceMode !== "canonical" &&
    movementActionRequested(request.userText)
  ) {
    return recoverInputContinuity(turn, request, drive);
  }
  const defaults = routeRecoveryDefaults(request, drive);
  const encounteredCharactersAdd = defaults.blocks
    .filter((block) => block.type === "dialogue" && block.speakerId)
    .map((block) => ({
      characterId: block.speakerId!,
      name: block.speakerName ?? "",
      relationType: "현재 장소에서 첫 대면",
    }))
    .filter(
      (character, index, all) =>
        !request.state.encounteredCharacterIds.includes(character.characterId) &&
        all.findIndex((candidate) =>
          candidate.characterId === character.characterId
        ) === index,
    );
  const recoveredLocation = defaults.location ?? request.state.location;
  const recoveryText = defaults.blocks.map((block) => block.text).join("\n");
  const placedAction = movementActionRequested(request.userText)
    ? placedActionFromInput(
        request.userText,
        request.pack.player.name || "주인공",
      )
    : undefined;
  const inventoryRemove = placedAction
    ? request.state.inventory.filter((item) =>
        compactDisclosureTerm(item) === compactDisclosureTerm(placedAction.item)
      )
    : [];
  const activeEvent = request.pack.events.find(
    (event) => event.id === drive.routeLock.currentEventId,
  );
  const recoveredTurn = {
    ...turn,
    blocks: defaults.blocks,
    statePatch: {
      ...turn.statePatch,
      time: defaults.time,
      location: recoveredLocation,
    },
  };
  const inputHandled = request.advanceMode === "canonical" || inputOutcomeVisibleInTurn(
    request,
    recoveredTurn,
    deriveClaudeTurnIntent(request.userText, activeEvent, request.state.time),
  );
  return {
    ...turn,
    blocks: defaults.blocks,
    statePatch: {
      ...turn.statePatch,
      time: defaults.time,
      dayDelta: defaults.dayDelta ?? 0,
      location: recoveredLocation,
      sceneSummary: defaults.sceneSummary,
      statusAdd: [],
      statusRemove: [],
      inventoryAdd: shouldStageRequiredEncounterLocation(request, drive)
        ? []
        : [...drive.routeLock.requiredItems],
      inventoryRemove,
      relationChanges: [],
      clockChanges: [],
      memoryAdd: [defaults.memory],
      variablesAdd: [],
      variablesResolve: [],
      encounteredCharactersAdd,
      statusLedgerChanges: [],
      autonomyActions: [],
      relationshipMemoriesAdd: [],
      relationshipMemoryResolveIds: [],
    },
    recommendations: defaults.recommendations,
    image: {
      ...turn.image,
      reason: "현재 위치에서 자연스럽게 이어지는 사건으로 장소 연속성을 복구했습니다.",
      prompt: "",
      characterIds: [],
    },
    characterVisuals: [],
    agencyAudit: {
      playerActionInvented: false,
      note: "서버가 설명 없는 장소 변경을 제거하고 현재 위치에서 이어지는 사건으로 복구했습니다.",
    },
    claudeSignals: turn.claudeSignals
      ? {
          ...turn.claudeSignals,
          sceneTime: defaults.time,
          location: recoveredLocation,
          beatAdvanced: inputHandled,
          eventResolved: false,
          resolutionSummary: "",
        }
      : turn.claudeSignals,
    narrativeAudit: {
      inputHandled,
      inputOutcome: inputHandled ? "resolved" : "in_progress",
      inputEvidence: recoveryText,
      meaningfulBeat: inputHandled,
      meaningfulBeatEvidence: recoveryText,
      routeEventStatus: "in_progress",
      routeEventEvidence: "현재 사건의 안전한 위치와 시간으로 복구했으며 완료 조건은 별도로 판정한다.",
      chronologyConsistent: true,
      chronologyNote: `복구 본문의 시각·장소를 ${defaults.time} · ${recoveredLocation}으로 동기화했다.`,
      recommendationsGrounded: true,
      recommendationBasis: [recoveredLocation],
      currentScene: defaults.sceneSummary,
      currentLocation: recoveredLocation,
      currentTime: defaults.time,
      activeCharacters: encounteredCharactersAdd.map((character) => character.name),
      activeThreats: [],
    },
  };
};

class SimulationRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly diagnostic?: FailedTurnDiagnostic,
  ) {
    super(message);
    this.name = "SimulationRouteError";
  }
}

const QUALITY_ADVISORY_REASONS = new Set([
  "장면 추진력 부족",
  "장면 초점 이탈",
  "인물 관계 연속성",
  "의미 있는 변화 부족",
  "추천 행동 근거 부족",
  "장소 전환을 작가가 이동 완성 또는 이동 번복으로 재구성해야 함",
]);

const auditReasonDetails = (reasons: string[]): EngineAuditReason[] =>
  [...new Set(reasons)].map((reason) => ({
    reason,
    severity: QUALITY_ADVISORY_REASONS.has(reason)
      ? "quality_advisory"
      : "hard_error",
  }));

export const turnSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    narration: {
      type: "string",
      minLength: 240,
      maxLength: 9000,
    },
    dialogueAnnotations: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          quote: { type: "string" },
          speakerId: { type: "string" },
          speakerName: { type: "string" },
          emotion: { type: "string" },
        },
        required: [
          "quote",
          "speakerId",
          "speakerName",
          "emotion",
        ],
      },
    },
    statePatch: {
      type: "object",
      additionalProperties: false,
      properties: {
        time: { type: "string" },
        location: { type: "string" },
        weather: { type: "string" },
        sceneSummary: { type: "string" },
        statusAdd: { type: "array", items: { type: "string" }, maxItems: 4 },
        statusRemove: { type: "array", items: { type: "string" }, maxItems: 4 },
        inventoryAdd: {
          type: "array",
          items: { type: "string" },
          maxItems: 6,
        },
        inventoryRemove: {
          type: "array",
          items: { type: "string" },
          maxItems: 6,
        },
        relationChanges: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              characterId: { type: "string" },
              trustDelta: { type: "integer", minimum: -3, maximum: 3 },
              favorDelta: { type: "integer", minimum: -3, maximum: 3 },
              respectDelta: { type: "integer", minimum: -3, maximum: 3 },
              suspicionDelta: { type: "integer", minimum: -3, maximum: 3 },
              hostilityDelta: { type: "integer", minimum: -3, maximum: 3 },
              reason: { type: "string" },
            },
            required: [
              "characterId",
              "trustDelta",
              "favorDelta",
              "respectDelta",
              "suspicionDelta",
              "hostilityDelta",
              "reason",
            ],
          },
        },
        clockChanges: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              clockId: { type: "string" },
              delta: { type: "integer", minimum: -1, maximum: 1 },
              reason: { type: "string" },
            },
            required: ["clockId", "delta", "reason"],
          },
        },
        memoryAdd: { type: "array", items: { type: "string" }, maxItems: 4 },
        variablesAdd: {
          type: "array",
          maxItems: 2,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              detail: { type: "string" },
              visibility: {
                type: "string",
                enum: ["public", "hidden"],
              },
              reason: { type: "string" },
            },
            required: ["id", "label", "detail", "visibility", "reason"],
          },
        },
        variablesResolve: {
          type: "array",
          items: { type: "string" },
          maxItems: 2,
        },
        encounteredCharactersAdd: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              characterId: { type: "string" },
              name: { type: "string" },
              relationType: { type: "string" },
            },
            required: ["characterId", "name", "relationType"],
          },
        },
        statusLedgerChanges: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              fieldId: { type: "string" },
              operation: {
                type: "string",
                enum: ["set", "increment", "add", "remove", "reveal"],
              },
              numericDelta: { type: "number" },
              value: { type: "string" },
              items: { type: "array", items: { type: "string" }, maxItems: 20 },
              grade: { type: "string" },
              reveal: { type: "boolean" },
              reason: { type: "string" },
            },
            required: [
              "fieldId",
              "operation",
              "numericDelta",
              "value",
              "items",
              "grade",
              "reveal",
              "reason",
            ],
          },
        },
        autonomyActions: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              actorId: { type: "string" },
              intent: { type: "string" },
              outcome: {
                type: "string",
                enum: ["success", "partial", "failure", "blocked"],
              },
              locationAfter: { type: "string" },
              resourcesAfter: { type: "string" },
              currentPlanAfter: { type: "string" },
              nextActionAfter: { type: "string" },
              evidenceUsed: {
                type: "array",
                items: { type: "string" },
                maxItems: 12,
              },
              resourcesSpent: {
                type: "array",
                items: { type: "string" },
                maxItems: 12,
              },
              worldMutations: {
                type: "array",
                items: { type: "string" },
                maxItems: 12,
              },
              knowledgeAdd: {
                type: "array",
                items: { type: "string" },
                maxItems: 12,
              },
              misinformationRemove: {
                type: "array",
                items: { type: "string" },
                maxItems: 12,
              },
              trace: { type: "string" },
              traceVisibility: {
                type: "string",
                enum: ["hidden", "observable", "rumor", "discovered"],
              },
              reason: { type: "string" },
              travelJustification: { type: "string" },
            },
            required: [
              "actorId",
              "intent",
              "outcome",
              "locationAfter",
              "resourcesAfter",
              "currentPlanAfter",
              "nextActionAfter",
              "evidenceUsed",
              "resourcesSpent",
              "worldMutations",
              "knowledgeAdd",
              "misinformationRemove",
              "trace",
              "traceVisibility",
              "reason",
              "travelJustification",
            ],
          },
        },
        relationshipMemoriesAdd: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              relationId: { type: "string" },
              sourceId: { type: "string" },
              targetId: { type: "string" },
              eventId: { type: "string" },
              type: {
                type: "string",
                enum: [
                  "promise_kept",
                  "promise_broken",
                  "rescue",
                  "betrayal",
                  "debt",
                  "secret_shared",
                  "humiliation",
                  "shared_success",
                  "shared_failure",
                  "custom",
                ],
              },
              title: { type: "string" },
              summary: { type: "string" },
              cause: { type: "string" },
              visibility: { type: "string", enum: ["Public", "Hidden"] },
              importance: { type: "integer", minimum: 0, maximum: 100 },
              permanence: {
                type: "string",
                enum: ["temporary", "decaying", "permanent"],
              },
              effects: {
                type: "object",
                additionalProperties: false,
                properties: {
                  trust: { type: "integer", minimum: -30, maximum: 30 },
                  favor: { type: "integer", minimum: -30, maximum: 30 },
                  fear: { type: "integer", minimum: -30, maximum: 30 },
                  respect: { type: "integer", minimum: -30, maximum: 30 },
                  suspicion: { type: "integer", minimum: -30, maximum: 30 },
                  hostility: { type: "integer", minimum: -30, maximum: 30 },
                  dependency: { type: "integer", minimum: -30, maximum: 30 },
                },
                required: [
                  "trust",
                  "favor",
                  "fear",
                  "respect",
                  "suspicion",
                  "hostility",
                  "dependency",
                ],
              },
              unresolved: { type: "boolean" },
              resolutionConditions: { type: "string" },
              tags: { type: "string" },
            },
            required: [
              "id",
              "relationId",
              "sourceId",
              "targetId",
              "eventId",
              "type",
              "title",
              "summary",
              "cause",
              "visibility",
              "importance",
              "permanence",
              "effects",
              "unresolved",
              "resolutionConditions",
              "tags",
            ],
          },
        },
        relationshipMemoryResolveIds: {
          type: "array",
          items: { type: "string" },
          maxItems: 8,
        },
        sessionCanonUpdates: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: {
                type: "string",
                enum: [
                  "player_hypothesis",
                  "refuted_hypothesis",
                  "confirmed_reveal",
                  "branch_canon",
                  "scene_fact",
                  "pending_consequence",
                ],
              },
              statement: { type: "string", maxLength: 320 },
              subjectIds: { type: "array", items: { type: "string" }, maxItems: 6 },
              evidence: { type: "string", maxLength: 320 },
              consequence: { type: "string", maxLength: 320 },
              relatedEventIds: { type: "array", items: { type: "string" }, maxItems: 6 },
            },
            required: [
              "kind",
              "statement",
              "subjectIds",
              "evidence",
              "consequence",
              "relatedEventIds",
            ],
          },
        },
      },
      required: [
        "time",
        "location",
        "weather",
        "sceneSummary",
        "statusAdd",
        "statusRemove",
        "inventoryAdd",
        "inventoryRemove",
        "relationChanges",
        "clockChanges",
        "memoryAdd",
        "variablesAdd",
        "variablesResolve",
        "encounteredCharactersAdd",
        "statusLedgerChanges",
        "autonomyActions",
        "relationshipMemoriesAdd",
        "relationshipMemoryResolveIds",
        "sessionCanonUpdates",
      ],
    },
    claudeSignals: {
      type: "object",
      additionalProperties: false,
      properties: {
        inputMode: {
          type: "string",
          enum: ["advance", "digress", "overreach"],
        },
        sceneTime: { type: "string" },
        location: { type: "string" },
        appearing: {
          type: "array",
          items: { type: "string" },
          maxItems: 12,
        },
        firstAppearance: {
          type: "array",
          items: { type: "string" },
          maxItems: 8,
        },
        mentioned: {
          type: "array",
          items: { type: "string" },
          maxItems: 16,
        },
        openQuestions: {
          type: "array",
          items: { type: "string" },
          maxItems: 8,
        },
        resolvedQuestions: {
          type: "array",
          items: { type: "string" },
          maxItems: 8,
        },
        beatAdvanced: { type: "boolean" },
        eventResolved: { type: "boolean" },
        resolutionSummary: { type: "string" },
        autoAction: { type: "string" },
      },
      required: [
        "inputMode",
        "sceneTime",
        "location",
        "appearing",
        "firstAppearance",
        "mentioned",
        "openQuestions",
        "resolvedQuestions",
        "beatAdvanced",
        "eventResolved",
        "resolutionSummary",
        "autoAction",
      ],
    },
    recommendations: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          risk: { type: "string", enum: ["낮음", "보통", "높음"] },
        },
        required: ["label", "risk"],
      },
    },
    image: {
      type: "object",
      additionalProperties: false,
      properties: {
        recommended: { type: "boolean" },
        reason: { type: "string" },
        prompt: { type: "string" },
        characterIds: {
          type: "array",
          items: { type: "string" },
          maxItems: 4,
        },
      },
      required: ["recommended", "reason", "prompt", "characterIds"],
    },
    characterVisuals: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          blockIndex: { type: "integer", minimum: 0, maximum: 6 },
          characterId: { type: "string" },
          characterName: { type: "string" },
          importance: {
            type: "string",
            enum: ["major", "supporting"],
          },
          isFirstMajorAppearance: { type: "boolean" },
          appearancePrompt: { type: "string" },
          reason: { type: "string" },
        },
        required: [
          "blockIndex",
          "characterId",
          "characterName",
          "importance",
          "isFirstMajorAppearance",
          "appearancePrompt",
          "reason",
        ],
      },
    },
    agencyAudit: {
      type: "object",
      additionalProperties: false,
      properties: {
        playerActionInvented: { type: "boolean" },
        note: { type: "string" },
      },
      required: ["playerActionInvented", "note"],
    },
  },
  required: [
    "narration",
    "dialogueAnnotations",
    "statePatch",
    "claudeSignals",
    "recommendations",
    "image",
    "characterVisuals",
    "agencyAudit",
  ],
} as const;

const recommendationRepairSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendations: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string", minLength: 4, maxLength: 140 },
          risk: { type: "string", enum: ["낮음", "보통", "높음"] },
        },
        required: ["label", "risk"],
      },
    },
  },
  required: ["recommendations"],
} as const;

const compactCharacter = (character: ScenarioPack["player"]) => ({
  id: character.id,
  name: character.name,
  aliases: character.aliases ?? [],
  role: character.role,
  affiliation: character.affiliation,
  personality: character.personality,
  speechStyle: character.speechStyle,
  appearance: character.appearance,
  status: character.status,
  publicInfo: character.publicInfo,
  hiddenInfo: character.hiddenInfo,
  skills: character.skills,
  preRevealAlias: character.preRevealAlias ?? "",
  revealCondition: character.revealCondition,
});

const buildV31StaticPrompt = (pack: ScenarioPack): string => {
  const relevanceText = [
    pack.projectId,
    pack.title,
    pack.genre,
    pack.tone,
    pack.player.id,
    pack.player.name,
  ].join("\n");
  const compact = (value: unknown, maxChars: number, maxArrayItems = 48) =>
    compactPromptSection(value, { maxChars, maxArrayItems, relevanceText });
  const writerCore = `[V31_WRITER_CORE_BEGIN]
너는 한국어 인터랙티브 장르소설의 단 한 명의 작가다. 먼저 완성된 소설 장면 하나를 쓰고, 그 장면에서 실제로 성립한 상태와 사건 신호만 장부에 옮긴다. 규칙을 설명하거나 판정문·보고서·복구문을 본문에 노출하지 않는다.

[우선순위]
출력 계약 → 공개 정보와 사건 경계 → 사용자 입력의 실제 처리 → 플레이어 주권 → 시간·장소 연속성 → 작품 문체와 장면 품질 순으로 지킨다. 충돌하면 앞의 규칙을 우선하되, 사용자의 입력을 메타적으로 거절하지 않는다.

[유일한 본문 원본]
- narration 하나가 이번 턴 소설의 유일한 원본이다. 처음부터 끝까지 한 작가가 쓴 장면으로 완성한다.
- 문단 분리와 NPC 대사는 narration 안에서 자연스러운 소설 형식으로 쓴다. blocks, 상태 보고, 처리 결과 목록처럼 쓰지 않는다.
- statePatch, claudeSignals, dialogueAnnotations, 추천 행동, 이미지 정보는 narration을 완성한 뒤 거기에서 관측되는 사실만 기록한다. 장부를 먼저 만들고 narration을 요약문으로 맞추지 않는다.
- dialogueAnnotations에는 narration에 실제 존재하는 NPC 대사만 넣는다. quote는 따옴표를 제외한 대사 전문과 글자 단위로 일치해야 한다. 플레이어의 대사는 주석으로 만들지 않는다.
- 서버가 narration을 문단과 대사 블록으로 투영한다. 문단 번호를 기준으로 characterVisuals.blockIndex를 기록하되, UI 구조를 의식해 문장을 잘게 자르지 않는다.

[입력 처리 A/B/C/D]
- A 현재 장면을 진행하는 입력: 사용자가 선언한 행동과 대사를 실제로 실행하고, 대상·NPC·환경의 직접 반응과 달라진 다음 상황까지 쓴다.
- B 둘러보기·잡담·일상·다른 관심사: 이번 턴에는 충분히 즐기게 한다. 현재 사건과 자연스러운 접점 하나만 남길 수 있지만 사용자 행동을 취소하지 않는다.
- C 현재 필수 사건의 장소·시간·계약을 명백히 버리는 이탈: 목적지와 욕구를 인정하고 준비·출발·부분 이동 중 가능한 행동을 실제로 수행한다. 구체적인 외부 연락·마감·우연한 조우·환경 방해·안전상 우회가 그 동선에 끼어들어 필수 사건으로 인과 연결되게 한다. 원래 계획은 포기시키지 말고 보류 또는 순서 변경으로 남긴다.
- D 불가능하거나 과도한 시도: 시도 자체를 삭제하지 않는다. 첫 부분에서 실제 시도, 대상과 주변의 즉각 반응을 보여 주고, 이어 제지·실패·부상·신고·평판·관계 악화·자원 소모 중 세계에 맞는 현실적인 대가를 확정한다. 일반 이동이나 마음을 바꾼 문장으로 덮어쓰지 않는다.
- A/B/D를 C처럼 취급하지 않는다. '다음에 만나자', 길 안내, 연락처 제안, 호감 표현은 현재 대화의 진행이지 즉시 시간 점프나 장소 이탈이 아니다.

[복합 입력의 선언 순서]
- 한 입력에 물건 조작→준비→출발→이동→재회→말 걸기처럼 여러 절이 있으면 선언 순서대로 모두 처리한다.
- 플레이어가 통제할 수 있는 앞 절은 먼저 실제로 성립시킨다. 뒤 절의 우연·재회·출입 성공·타인의 동의·승패가 세계 상태와 충돌해도 앞 절까지 취소하지 않는다.
- 뒤 절이 성립하면 NPC와 환경의 구체적인 반응을 쓴다. 성립하지 않으면 부재·거절·장애·착각·엇갈림의 현장 근거를 보여 준다. 아무 설명 없이 뒤 절을 생략하지 않는다.
- 이동이 포함된 복합 입력은 출발, 경로 또는 수단, 경과 시간, 도착을 장면에 넣는다. 재회나 대화가 뒤따르면 단순 도착문에서 멈추지 말고 그 절의 세계 판정까지 같은 narration에 쓴다.

[플레이어 주권]
- 플레이어는 ${pack.player.name}(${pack.player.id})이다. 사용자가 이번 입력에 명시한 행동·대사·의도만 플레이어의 확정 행동으로 쓴다.
- 사용자가 쓰지 않은 플레이어의 새 대사, 생각, 감정, 판단, 동의, 용서, 공격, 이동을 임의로 만들지 않는다. 필요한 변화는 NPC와 환경을 움직여 만든 뒤 플레이어가 대응할 지점에서 멈춘다.
- 사용자의 입력을 그대로 길게 재인용하지 않는다. 입력의 실행 결과와 세계의 반응을 중심으로 확장한다.
- C형 정사 흡수에서도 사용자의 원래 욕구와 목적지를 본문에 남기고, 필수 사건을 완성하는 데 필요한 최소 행동만 외부 원인으로 연결한다.

[사건과 정사]
- dynamicContext.claudeRuntime.activeEvent와 currentBeat만 현재 권위 사건이다. 모델은 비트·봉인·다음 사건을 결정하지 않고 관측 신호만 claudeSignals에 기록한다.
- 활성 사건의 지시문을 복사하거나 사건명·조건·비트·턴·플래그·정사 흡수 같은 엔진 용어를 본문에 쓰지 않는다. 지시된 상태 변화를 인물의 행동과 대사로 연기한다.
- 필수 물품·필수 대사·종결 신호는 실제 장면에서 발견·전달·발화·완료되어야 한다. 언급, 예정, 회상, 요약만으로 성립시키지 않는다.
- Compound 사건은 현재 비트만 쓴다. 마지막 비트 전에 eventResolved를 true로 만들지 않는다.
- 완료된 과거 사건을 다시 연기하거나 당시 시각·장소로 돌아가지 않는다. 아직 열리지 않은 미래 사건의 인물·물건·비밀·위협을 예고하거나 추천 행동에 넣지 않는다.
- constraints는 지속 장면 규칙이며 사건처럼 해결하거나 봉인하지 않는다.

[공개 정보]
- 플레이어가 직접 보거나 듣거나 조사해 알게 된 정보만 본문·상태·추천 행동·이미지에 공개한다.
- 진명, 클래스, 숨은 계약, 배신, 비밀 진영, 미등장 인물, 미래 소품을 먼저 쓰지 않는다. 현재 시점에서 부를 수 있는 외형·직함·관계 호칭을 사용한다.
- 패키지의 hiddenInfo와 GM 자료는 인물의 행동 원인을 정하는 데만 쓰고 설명하지 않는다.
- 처음 공개되는 물건은 발견·전달·개봉 장면을 먼저 쓰고 같은 이름을 inventoryAdd에 넣는다.
- 이 공개 금지는 작가·서버·NPC가 사용자보다 먼저 누설하는 것을 막는 규칙이다. 사용자가 이번 입력에서 직접 말한 비밀 명칭·추측·설정은 입력 자체를 지우거나 다른 행동으로 덮지 말고, 현재 인물과 세계가 듣거나 목격한 주장으로 장면 안에서 반드시 받아친다.
- 사용자가 패키지 fixedCanon과 충돌하는 정체·과거를 주장하면 그것을 사실로 확정하지 않는다. 해당 인물이 부정·회피·공개 거절 중 성격에 맞는 반응을 보이며, 진짜 정답은 공개 시점 전까지 말하지 않는다.
- 사용자가 선언한 변화가 fixedCanon과 충돌하지 않는다면 branchableCanon으로 받아들이고 실제 실행·반응·대가를 쓴다. 이후 기존 사건의 최초 공개·첫 사용 장면은 반복하지 말고 후폭풍·해명·관계 변화로 재구성한다.

[시간과 장소]
- narration의 마지막 시각·장소, statePatch.time/location, claudeSignals.sceneTime/location을 일치시킨다.
- 시간은 현재보다 자연스럽게 전진한다. 대화는 몇 분, 이동은 거리와 수단만큼, 수면과 장시간 행동은 사용자가 실제로 선언한 범위만 흐르게 한다.
- 장소가 바뀌면 현재 장소에서 시작하여 떠나는 계기와 행동, 이동 경로·수단·감각, 충분한 경과 시간, 도착 후 첫 관측을 순서대로 쓴다.
- 필수 사건의 원래 장소와 현재 장소가 다르면 인물을 순간이동시키지 않는다. 사건을 현재 동선에 맞게 변형하거나 실제 이동 원인을 만든다.
- 이전 장소의 사건은 그곳에 남았다는 식의 증명문, 주소를 나열하는 안내문, '실제 이동 끝에 도착했다' 같은 보고문을 쓰지 않는다.

[장면과 문체]
- 작품 지정 시점과 문체를 우선한다: ${pack.style.narrationPerson || "3인칭 제한 시점"} / ${pack.style.proseStyle || "밝고 읽기 쉬운 장르소설"}.
- narration은 보통 한국어 650~1100자, 3~6문단이다. 위기·전투·C형 흡수는 인과가 필요한 만큼 조금 늘릴 수 있다.
- 짧은 입력도 행동 실행→관측 가능한 결과→NPC·환경 반응→달라진 다음 대응 지점까지 하나의 장면 비트로 확장한다.
- 보고서·다큐멘터리·학술 해설처럼 원인과 결과를 정리하지 않는다. 손, 시선, 목소리, 거리, 소리, 온도, 사물의 촉감 중 필요한 감각을 골라 장면을 현재형 경험처럼 만든다.
- 감정을 분석하지 말고 몸짓과 대사의 결로 보여 준다. 명사를 나열하지 말고 인물과 사물이 움직이고 부딪히게 한다.
- 같은 기록·화면·질문·소품을 직전 턴과 말만 바꿔 반복하지 않는다. 매 턴 관계·정보·위험·기회·비용 중 하나는 실제로 달라져야 한다.
- 시설관리 직원·경비·안내원 같은 보조 인물은 전달 역할을 1~2턴 안에 끝낸다. 주요 인물과 핵심 갈등이 장면의 중심을 되찾게 한다.
- 평온한 만남은 첫 질문과 반응을 충분히 쓰고 사용자가 끝내기 전까지 한 번에 관계 전체를 닫지 않는다. 전투는 원인·대응·결과를 생략하지 않는다.
- '아직 알지 못했다', '머지않아', '곧 닥칠', '이것이 마지막이었다' 같은 미래 예고로 끝내지 않는다. 마지막은 현재의 구체적인 행동·대사·감각 또는 선택 지점으로 닫는다.

[인물과 대사]
- NPC는 personality, speechStyle, 관계 기억, 현재 목적에 따라 말하고 행동한다. 설정 설명을 위한 동일한 목소리로 만들지 않는다.
- dynamicContext.characterKnowledgeLedger는 인물별 지식 경계다. 각 인물은 자기 항목의 knownFacts·misinformation·relationshipEvidence와 이번 narration에서 직접 듣거나 본 사실만 사용할 수 있다. 다른 인물의 비공개 기억·지식·오정보를 자동 공유하지 않는다.
- visibility가 Hidden인 관계 기억은 해당 sourceId 인물의 판단과 말투에는 영향을 줄 수 있지만, 그 원인이나 제목을 대사로 설명하거나 플레이어가 안다고 가정하지 않는다.
- narration 속 NPC 대사는 자연스러운 따옴표 대사로 쓴다. 모든 NPC 대사를 dialogueAnnotations에 정확히 한 번 기록한다.
- 미등록 행인이나 음성은 speakerId를 빈 문자열로 두고 speakerName에 '편의점 직원', '전화 속 목소리'처럼 동일한 호칭을 쓴다.
- 사용자가 직접 입력한 플레이어 대사는 narration에서 다시 대사 블록으로 복제하지 않는다. NPC가 듣고 반응한 결과를 쓴다.

[추천 행동]
- narration을 완성한 같은 작가가 마지막 문단의 열린 대응 지점과 현재 활성 사건의 다음 정사 압력을 함께 판단해 정확히 3개를 쓴다. 별도 선택지 생성기처럼 장면의 명사만 조합하지 않는다.
- 출력 순서는 반드시 위험도 낮음 → 보통 → 높음이며 세 위험도를 하나씩만 쓴다. 위험도는 정답 가능성이 아니라 행동이 초래할 즉각적인 관계·노출·이동·자원·신체 비용과 되돌리기 어려운 정도다.
- 낮음은 되돌리기 쉽고 비용이 작지만 현재 상황을 실제로 한 단계 진행한다. 반복 확인·대기·같은 질문은 낮음이 아니다.
- 보통은 현재 인물·문제·사건에 한 단계 더 개입하고, 수락·거절·요청·이동처럼 분명한 입장을 취한다.
- 높음은 대립·노출·추적·강행·자원 소모 같은 현실적 대가를 감수하는 적극적 행동이다. 무모한 자살행동이나 아직 존재하지 않는 위협에 대비하는 행동을 만들지 않는다.
- 세 선택은 같은 행동의 표현이나 강도만 바꾸지 않는다. 정보·관계·행동/이동처럼 접근 방식과 기대되는 즉각 반응이 서로 달라야 한다.
- 각 추천은 마지막 장면에 실제 등장한 인물·물건·장소·질문 중 구체 명사 하나를 포함하고, 플레이어가 지금 말하거나 시도하는 행동으로 끝낸다.
- 현재 필수 사건과 다음 정사 비트는 추천의 방향을 잡는 내부 자료일 뿐이다. 사건명·미래 인물·미공개 소품·예정된 위협을 추천문에 누설하거나 결과를 미리 확정하지 않는다.
- 세 추천을 쓴 뒤 조용히 점검한다: 지금 즉시 가능한가, 모두 다른 행동인가, 낮음/보통/높음이 하나씩인가, 선택했을 때 다음 narration이 자연스럽게 이어지는가. 하나라도 아니면 JSON 출력 전에 추천 세 줄만 다시 쓴다.

[상태와 신호]
- statePatch에는 narration에서 실제로 변한 값만 넣는다. 장면에 없는 물건·관계·기억·상태·NPC 행동을 추가하지 않는다.
${instantRelationshipDisplayPrompt(pack)}
- sceneSummary와 memoryAdd는 narration의 결과를 간결하게 기록하되 소설 문장을 대체하지 않는다.
- statePatch.sessionCanonUpdates는 단순 줄거리 요약이 아니다. 사용자 추측은 player_hypothesis, 명시적 부정은 refuted_hypothesis, 실제 확인된 비밀은 confirmed_reveal, 사용자가 만든 새 분기는 branch_canon, 현재 장면의 지속 사실은 scene_fact, 다음 사건이 반드시 회수할 여파는 pending_consequence로 기록한다.
- 추측을 확정 사실로 승격하지 않는다. 부정문·회피·실패의 의미를 뒤집지 않고 evidence에는 narration에 실제 존재하는 근거 문장을 쓴다. 같은 사실을 매 턴 중복 기록하지 않는다.
- dynamicContext.sessionCanonLedger의 active 항목은 이후 모든 장면의 권위 기억이다. branch_canon과 scene_fact를 기존 정사에 흡수하고, 이미 일어난 최초 공개·행동·만남을 미래 사건에서 재연하지 않는다.
- claudeSignals.inputMode는 advance, digress, overreach 중 하나다. beatAdvanced와 eventResolved는 본문에서 실제 성립했을 때만 true다.
- agencyAudit.playerActionInvented는 플레이어의 새 행동·대사·생각을 임의로 만들었으면 true다. 숨기지 않는다.
- image.recommended는 dynamicContext.imageDue와 같아야 한다. imageDue가 true일 때만 글자가 없는 16:9 애니메이션 장면 프롬프트를 쓴다.
- 주요 신규 인물이 처음 등장하면 characterVisuals에 고정 외형을 기록한다. blockIndex는 그 인물이 처음 강조되는 narration 문단의 0부터 시작하는 번호다.

[한 장면의 설계]
- 첫 문단은 직전 턴 마지막 시각·장소·행동에서 끊김 없이 시작한다. 사용자가 새 행동을 선언했다면 준비 설명보다 그 행동이 세계에 닿는 순간을 앞세운다.
- 중간 문단은 입력의 각 절을 원인과 결과로 연결한다. 행동 하나를 쓸 때마다 손에 닿는 감각, 상대의 표정·거리 변화, 주변 사람이 보이는 반응, 소모된 시간이나 자원 중 적어도 하나를 붙여 실제 사건으로 만든다.
- 마지막 문단은 요약이나 교훈이 아니라 바뀐 현장의 구체적인 현재를 보여 준다. NPC의 질문, 열린 문, 울리는 전화, 드러난 상처, 결제를 기다리는 단말기처럼 사용자가 다음에 대응할 물리적 지점을 남긴다.
- 사용자가 한 번에 여러 행동을 선언했다면 각 절을 독립된 체크리스트처럼 나열하지 않는다. 앞 절의 결과가 다음 절의 조건이 되도록 문장 사이를 연결한다. 우산을 챙긴 결과 빗속 이동이 가능해지고, 이동한 결과 목적지의 사람이나 장애를 확인하는 식으로 쓴다.
- 결과가 불확실한 절은 성공을 선물하거나 조용히 삭제하지 않는다. 현재 정보와 능력으로 성공·부분 성공·실패를 판정한 뒤 그 증거를 현장에 남긴다. 재회라면 실제 인물의 반응, 부재라면 직원의 말·빈 자리·연락 기록처럼 확인 가능한 근거가 필요하다.
- 사용자가 이미 말한 대사와 의도는 세계가 들은 사실로 처리한다. 같은 말을 플레이어 대사로 길게 복제하지 말고 NPC가 무엇을 알아듣고 어떻게 답하거나 피하는지 쓴다.
- 사용자가 이름을 지목해 질문했다면 그 인물은 질문의 주제에 직접 답하거나, 부정·회피·답변 거부 중 하나를 명시한다. 무관한 경고나 다른 대사만 쓰면 입력을 처리한 것이 아니다. 사용자가 이름을 지목해 NPC의 행동을 선언했다면 그 행동을 실제로 실행시키거나 설정상 불가능한 이유와 실패·거부의 결과를 현장에 남긴다.
- 턴의 분량은 장면에 필요한 인과를 완성하는 데 쓴다. 배경 설정을 해설하거나 이전 사건을 요약해 글자 수를 채우지 않는다. 입력의 마지막 절이 아직 처리되지 않았다면 문체 장식을 줄이고 그 절의 판정과 반응을 먼저 완성한다.

[정사 연결의 최소 개입]
- 필수 사건은 사용자 입력보다 먼저 준비된 보이지 않는 선로가 아니다. 이번 입력에서 실제로 생긴 이동·대화·실수·소음·시간 지연·목격을 원인으로 삼을 수 있을 때만 현재 장면에 연결한다.
- 사용자가 다른 목적지를 선택했는데 필수 사건이 현재 위치에서 일어날 수 있다면 장소의 기능을 바꾸지 말고 사건의 전달 수단을 바꾼다. 인물이 찾아오거나, 전화가 걸리거나, 목적지의 물건이 같은 단서를 드러내는 등 현재 동선에서 관측 가능한 원인을 만든다.
- 필수 사건이 특정 장소의 물리적 행동을 요구하면 순간이동시키지 않는다. 사용자가 출발한 동선에 실제 이동·우회·정차를 넣고 거리와 시간에 맞는 범위까지만 진행한다. 한 턴에 도착할 수 없다면 중간 지점의 의미 있는 사건에서 멈추고 목적지는 계속 유효하게 남긴다.
- 사용자가 정사와 무관한 일상을 택했으면 그 일상 자체에 인물성과 결과를 준다. 필수 사건의 이름이나 미래 위협을 억지로 말하는 대신, 필요하다면 일상의 결과로 생긴 작은 연락이나 일정 변화만 다음 연결점으로 남긴다.
- 사건 완료는 분위기가 비슷해졌다는 뜻이 아니다. requiredItems는 실제 획득, requiredDialogue는 실제 발화와 청취, completionSignals는 관측 가능한 행동과 결과가 narration에 모두 있을 때만 완료다.
- 현재 사건이 끝나지 않았다면 다음 사건의 대표 인물·장소·위협·이미지를 끌어오지 않는다. 현재 사건이 끝났더라도 이번 narration 안에서 다음 사건을 곧바로 시작하지 말고, 완료 결과와 사용자가 대응할 여백에서 멈춘다.

[현실적인 반응과 비용]
- NPC는 사용자를 돕기 위해 존재하는 장치가 아니다. 자신의 정보, 감정, 이해관계, 안전, 사회적 역할에 따라 협조·경계·거절·오해·조건부 수락 중 자연스러운 반응을 고른다.
- 위험하거나 무례한 행동은 대상 한 사람의 표정만 바꾸고 끝내지 않는다. 목격자, 소음, CCTV, 직원, 경찰, 학교 규정, 온라인 소문, 신체 피로, 물건 파손처럼 작품 세계가 가진 반응망 중 가까운 것이 움직이게 한다.
- D형 대가는 추상적인 '큰일이 날 수 있다'가 아니라 이번 턴에 확정된 변화여야 한다. 상처가 생겼으면 상태에, 물건을 잃었으면 인벤토리에, 신뢰가 꺾였으면 관계와 기억에, 시간이 지연됐으면 시각에 반영한다.
- 강한 능력과 폭력은 성공 여부와 별개로 흔적을 남긴다. 에너지 소모, 통증, 구조물 손상, 주변인의 공포, 추적 가능한 기록 중 설정에 맞는 것을 고른다. 비용 없는 압도적 해결은 패키지에 명시된 경우에만 허용한다.
- 평범한 행동도 자동 성공만 쓰지 않는다. 가게의 영업 상태, 교통, 날씨, 상대의 일정 같은 작은 마찰을 사용할 수 있지만, 마찰을 이유로 입력 전체를 취소하거나 매번 필수 사건으로 우회시키지 않는다.

[문체 실패 방지]
- '직접 문을 열고 밖으로 나섰다', '실제 이동 끝에 도착했다', '이전 장소의 사건은 그곳에 남았다', '현재 시선과 동선이 이어졌다'처럼 시스템이 처리를 증명하는 문장을 쓰지 않는다. 문손잡이의 냉기, 젖은 보도, 자동문 바람, 계산대의 소리로 같은 사실을 장면화한다.
- 주소·국가·행정구역을 현재 상태값처럼 나열하지 않는다. 독자가 장소를 구별하는 데 필요한 간판, 골목, 창문, 조명, 냄새만 선택해 쓴다.
- 짧은 단문을 연속해 로그처럼 만들지 않는다. 반대로 한 문장에 모든 행동과 결과를 압축하지 않는다. 행동의 속도와 긴장에 맞춰 문장 길이를 바꾸고 문단마다 하나의 변화가 보이게 한다.
- '그는 생각했다', '그녀는 느꼈다'로 감정을 설명하기보다 시선이 머무는 곳, 손이 멈추는 순간, 말끝이 흐려지는 정도로 보여 준다. 단, 관측 불가능한 NPC 내면을 확정하지 않는다.
- 은유와 수식은 현장 이해를 돕는 만큼만 쓴다. 핵심 행동·대사·판정을 흐리거나 같은 비·어둠·심장 박동 이미지를 반복하지 않는다.
- 설정 고유명사는 독자가 이미 아는 범위에서만 자연스럽게 쓴다. 새 용어를 한 문단에 몰아넣거나 GM 정보를 설명하는 대사로 바꾸지 않는다.

[출력 전 조용한 점검]
- narration을 다 쓴 뒤 사용자 입력의 각 절에 대응하는 문장과 결과가 있는지 내부적으로 확인한다. 앞 절을 취소한 문장, 설명 없는 장소 변경, 공개되지 않은 이름, 현재보다 앞선 사건의 장면화가 있으면 JSON을 출력하기 전에 narration 자체를 고친다.
- 대사 주석의 quote가 narration 속 문자열과 정확히 일치하는지, 같은 대사를 중복 주석하지 않았는지 확인한다. 주석에만 있고 narration에 없는 대사는 삭제한다.
- statePatch의 추가·제거·관계 변화·기억·시각·장소를 narration 문장과 대조한다. 근거 문장을 찾을 수 없는 변화는 빈 값으로 되돌린다.
- recommendations 세 개가 마지막 장면에서 즉시 가능한지, 서로 다른 행동인지, 미공개 인물이나 다음 사건을 포함하지 않는지 확인한다.
- 이 점검 과정과 규칙 이름은 출력하지 않는다. 잘못된 초안을 별도 보고서로 설명하지 말고 수정된 narration과 장부만 한 번 출력한다.

[출력 계약]
- JSON 객체 하나만 출력한다. 마크다운 코드펜스와 JSON 밖 설명은 금지한다.
- 최상위 키는 narration, dialogueAnnotations, statePatch, claudeSignals, recommendations, image, characterVisuals, agencyAudit이다.
- narration을 먼저 완성한 뒤 나머지 필드를 채운다. narration과 같은 본문을 blocks나 다른 필드에 중복하지 않는다.
- 모든 배열과 statePatch 필드는 값이 없어도 생략하지 않고 빈 배열 또는 빈 문자열로 둔다. 별도 narrativeAudit은 출력하지 않는다.
[V31_WRITER_CORE_END]`;

  const fullPrompt = `${writerCore}

[작품 표현 캡슐 — 캐시되는 불변 설정]
제목: ${pack.title}
장르·톤: ${pack.genre} / ${pack.tone}
작품 고유 문체 규칙: ${compact(pack.style, 5_000, 20)}

[컨텍스트 경계]
- 인물·현재 사건·현재 비트·세션 기억·공개 상태·이미지 후보는 dynamicContext.sceneContext만 권위 자료로 사용한다.
- sceneContext에 없는 미래 사건, 비공개 인물 정체, GM 자료를 모델 지식으로 보충하지 않는다.
- sceneContext.playerInputContract를 먼저 장면화하고, 활성 사건은 그 결과에 인과적으로 연결한다.`;

  if (fullPrompt.length <= MAX_STATIC_PROMPT_CHARS) return fullPrompt;
  return `${fullPrompt.slice(0, MAX_STATIC_PROMPT_CHARS - 120)}\n[컨텍스트 예산에 따라 후순위 설정 일부 생략]\n`;
};

const extractOutputText = (response: Record<string, unknown>): string => {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const itemValue of output) {
    const item = itemValue as Record<string, unknown>;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const contentValue of content) {
      const part = contentValue as Record<string, unknown>;
      if (typeof part.text === "string") return part.text;
    }
  }
  throw new Error("Luna 응답에서 구조화된 본문을 찾지 못했습니다.");
};

const webSourcesFromResponse = (
  response: Record<string, unknown>,
): Array<{ title: string; url: string }> => {
  const sources = new Map<string, { title: string; url: string }>();
  const output = Array.isArray(response.output) ? response.output : [];
  for (const itemValue of output) {
    const item = itemValue as Record<string, unknown>;
    const action = item.action && typeof item.action === "object"
      ? item.action as Record<string, unknown>
      : {};
    for (const sourceValue of Array.isArray(action.sources) ? action.sources : []) {
      const source = sourceValue as Record<string, unknown>;
      const url = typeof source.url === "string" ? source.url : "";
      if (url) sources.set(url, { title: String(source.title ?? url), url });
    }
    for (const contentValue of Array.isArray(item.content) ? item.content : []) {
      const content = contentValue as Record<string, unknown>;
      for (const annotationValue of Array.isArray(content.annotations) ? content.annotations : []) {
        const annotation = annotationValue as Record<string, unknown>;
        const url = typeof annotation.url === "string" ? annotation.url : "";
        if (url) sources.set(url, { title: String(annotation.title ?? url), url });
      }
    }
  }
  return [...sources.values()].slice(0, 12);
};

const webSearchCountFromResponse = (response: Record<string, unknown>): number =>
  (Array.isArray(response.output) ? response.output : [])
    .filter((item) => (item as Record<string, unknown>).type === "web_search_call")
    .length;

const researchCandidatesForTurn = (request: SimulateRequest): string[] => {
  const runtime = request.pack.aiWorldContext;
  const research = runtime?.referenceCharacterResearch;
  if (!runtime?.enabled || !runtime.liveEvaluation || !research?.enabled) return [];
  if (research.lookupMode !== "simulator_web_search_tool") return [];
  const timing = research.lookupTiming;
  const sessionStart = timing.sessionStart && request.state.turn === 0;
  const conflict = timing.onCanonConflict &&
    /(?:정사|원작|설정|말투|성격|능력|관계).{0,20}(?:충돌|모순|다르|맞나|확인)/u.test(request.userText);
  const context = [
    request.userText,
    sessionStart ? request.pack.opening.openingCharacters : "",
    conflict ? request.state.sceneSummary : "",
  ].join("\n");
  const cached = new Set(
    (request.state.characterResearchCache ?? []).map((entry) => entry.characterName),
  );
  return research.characters.filter((name) => {
    if (cached.has(name)) return false;
    if (timing.everyTurn || sessionStart || conflict) return true;
    return timing.beforeFirstAppearance && context.includes(name);
  }).slice(0, 3);
};

const parseResearchPayload = (
  response: Record<string, unknown>,
  requestedNames: string[],
  canonCutoff: string,
): CharacterResearchCacheEntry[] => {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(extractOutputText(response)) as Record<string, unknown>;
  } catch {
    return [];
  }
  const sources = webSourcesFromResponse(response);
  const values = Array.isArray(payload.characters) ? payload.characters : [];
  const now = new Date().toISOString();
  return values.flatMap((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const characterName = typeof item.characterName === "string"
      ? item.characterName.trim()
      : "";
    const summary = typeof item.summary === "string" ? item.summary.trim() : "";
    if (!requestedNames.includes(characterName) || !summary) return [];
    return [{
      characterName,
      summary: summary.slice(0, 2200),
      canonCutoff,
      researchedAt: now,
      sources,
    }];
  });
};

type OpenAIErrorDetail = {
  message: string;
  code: string;
  type: string;
  param: string;
};

const sanitizeUpstreamText = (value: string): string =>
  value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[API 키 숨김]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);

const readOpenAIError = async (response: Response): Promise<OpenAIErrorDetail> => {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(await response.text()) as Record<string, unknown>;
  } catch {
    return { message: "", code: "", type: "", param: "" };
  }
  const rawError = payload.error;
  const error = rawError && typeof rawError === "object"
    ? rawError as Record<string, unknown>
    : payload;
  return {
    message: sanitizeUpstreamText(
      typeof error.message === "string" ? error.message : "",
    ),
    code: sanitizeUpstreamText(
      typeof error.code === "string" ? error.code : "",
    ),
    type: sanitizeUpstreamText(
      typeof error.type === "string" ? error.type : "",
    ),
    param: sanitizeUpstreamText(
      typeof error.param === "string" ? error.param : "",
    ),
  };
};

const shouldRetryWithCompatibilityProfile = (
  status: number,
  detail: OpenAIErrorDetail,
): boolean => {
  if (status !== 400) return false;
  const text = `${detail.code} ${detail.type} ${detail.param} ${detail.message}`;
  return !/context[_ -]?length|too many tokens|maximum context|request too large/i.test(
    text,
  );
};

const openAIErrorMessage = (
  status: number,
  detail: OpenAIErrorDetail,
): string => {
  const suffix = detail.message
    ? ` 원인: ${detail.message}`
    : detail.code
      ? ` 원인 코드: ${detail.code}`
      : "";
  if (status === 401) {
    return `저장된 OpenAI API 키가 거절되었습니다. 설정에서 키를 다시 확인해 주세요.${suffix}`;
  }
  if (status === 403) {
    return `이 API 키에는 GPT-6 Luna 사용 권한이 없습니다.${suffix}`;
  }
  if (status === 429) {
    return `OpenAI API 사용 한도 또는 결제 한도에 도달했습니다.${suffix}`;
  }
  if (status === 400) {
    return `OpenAI가 Luna 요청 형식을 거절했습니다.${suffix}`;
  }
  return `OpenAI API가 ${status} 상태를 반환했습니다.${suffix}`;
};

const createResponsesRequestBody = (
  model: string,
  projectId: string,
  staticPrompt: string,
  dynamicPrompt: string,
  reasoningEffort: EngineReasoningEffort,
  maxOutputTokens: number,
  compatibility = false,
): Record<string, unknown> => {
  const input = [
    {
      type: "message",
      role: "developer",
      content: [
        compatibility
          ? { type: "input_text", text: staticPrompt }
          : {
              type: "input_text",
              text: staticPrompt,
              prompt_cache_breakpoint: { mode: "explicit" },
            },
      ],
    },
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: dynamicPrompt }],
    },
  ];

  if (compatibility) {
    return {
      model,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: maxOutputTokens,
      store: false,
      input,
      text: { format: { type: "json_object" } },
    };
  }

  return {
    model,
    reasoning: { effort: reasoningEffort, context: "current_turn" },
    max_output_tokens: maxOutputTokens,
    store: false,
    prompt_cache_key: sanitizePromptCacheKey(projectId),
    prompt_cache_options: { mode: "explicit", ttl: "30m" },
    input,
    text: {
      format: {
        type: "json_schema",
        name: "relay_novel_turn",
        strict: true,
        schema: turnSchema,
      },
    },
  };
};
type ModelAuthoredTurn = Omit<
  EngineTurnResponse,
  "mode" | "usage" | "blocks"
> & {
  narration?: string;
  dialogueAnnotations?: DialogueAnnotation[];
  writerSceneClock?: { time: string; dayDelta: number };
  /** Accepted only for legacy tests and compatible saved upstream responses. */
  blocks?: StoryBlock[];
};
const trimDialogueMarks = (value: string) => value
  .trim()
  .replace(/^[\s“”‘’"']+/u, "")
  .replace(/[\s“”‘’"']+$/u, "")
  .trim();
const canonicalNarrationFromBlocks = (blocks: StoryBlock[]): string =>
  blocks
    .filter((block) => block.type !== "system" && block.text.trim())
    .map((block) =>
      block.type === "dialogue"
        ? `“${trimDialogueMarks(block.text)}”`
        : block.text.trim()
    )
    .join("\n\n");
const dialogueAnnotationsFromBlocks = (
  blocks: StoryBlock[],
): DialogueAnnotation[] => blocks
  .filter((block) => block.type === "dialogue" && block.text.trim())
  .map((block) => ({
    quote: trimDialogueMarks(block.text),
    speakerId: block.speakerId?.trim() ?? "",
    speakerName: block.speakerName?.trim() ?? "",
    emotion: block.emotion?.trim() ?? "",
  }));
const narrationProjection = (
  narration: string,
  annotations: DialogueAnnotation[],
): { blocks: StoryBlock[]; paragraphBlockIndexes: number[] } => {
  const paragraphs = narration
    .replace(/\r\n?/g, "\n")
    .split(/\n+/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 12);
  const blocks: StoryBlock[] = [];
  const paragraphBlockIndexes: number[] = [];
  const usedAnnotations = new Set<number>();

  const pushNarration = (text: string) => {
    const clean = text
      .replace(/^[\s”’]+/u, "")
      .replace(/[\s“‘]+$/u, "")
      .trim();
    if (!clean) return;
    blocks.push({
      id: "",
      type: "narration",
      text: clean,
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    });
  };

  for (const paragraph of paragraphs) {
    paragraphBlockIndexes.push(blocks.length);
    const matches = annotations
      .map((annotation, annotationIndex) => {
        if (usedAnnotations.has(annotationIndex)) return null;
        const quote = trimDialogueMarks(annotation.quote);
        if (!quote) return null;
        const start = paragraph.indexOf(quote);
        return start >= 0
          ? { annotation, annotationIndex, quote, start, end: start + quote.length }
          : null;
      })
      .filter((match): match is NonNullable<typeof match> => Boolean(match))
      .sort((left, right) => left.start - right.start || right.quote.length - left.quote.length);

    let cursor = 0;
    for (const match of matches) {
      if (match.start < cursor) continue;
      pushNarration(paragraph.slice(cursor, match.start));
      blocks.push({
        id: "",
        type: "dialogue",
        text: match.quote,
        speakerId: match.annotation.speakerId.trim(),
        speakerName: match.annotation.speakerName.trim(),
        emotion: match.annotation.emotion.trim(),
        mediaAssetId: "",
      });
      usedAnnotations.add(match.annotationIndex);
      cursor = match.end;
      if (/^[”’"']/u.test(paragraph.slice(cursor))) cursor += 1;
    }
    pushNarration(paragraph.slice(cursor));
  }

  if (!blocks.length && narration.trim()) pushNarration(narration);
  return { blocks: blocks.slice(0, 18), paragraphBlockIndexes };
};

const normalizeModelAuthoredTurn = (
  rawTurn: ModelAuthoredTurn,
): Omit<EngineTurnResponse, "mode" | "usage"> => {
  const { writerSceneClock: _writerSceneClock, ...publicTurn } = rawTurn;
  const legacyBlocks = Array.isArray(rawTurn.blocks) ? rawTurn.blocks : [];
  const narration = rawTurn.narration?.trim() ||
    canonicalNarrationFromBlocks(legacyBlocks);
  const annotations = Array.isArray(rawTurn.dialogueAnnotations)
    ? rawTurn.dialogueAnnotations
    : dialogueAnnotationsFromBlocks(legacyBlocks);
  const projection = rawTurn.narration?.trim()
    ? narrationProjection(narration, annotations)
    : { blocks: legacyBlocks, paragraphBlockIndexes: legacyBlocks.map((_, index) => index) };
  const characterVisuals = (rawTurn.characterVisuals ?? []).map((visual) => ({
    ...visual,
    blockIndex:
      projection.paragraphBlockIndexes[visual.blockIndex] ??
      Math.min(Math.max(0, visual.blockIndex), Math.max(0, projection.blocks.length - 1)),
  }));

  return {
    ...publicTurn,
    narration,
    dialogueAnnotations: annotations,
    blocks: projection.blocks,
    characterVisuals,
  } as Omit<EngineTurnResponse, "mode" | "usage">;
};

const withIds = (blocks: StoryBlock[]): StoryBlock[] =>
  blocks.map((block) => ({ ...block, id: createId() }));

const MODEL_RECENT_TURN_LIMIT = 8;
// Ordinary turns finish in one call; a fourth is reserved for from-scratch regeneration
// when the old deterministic prose fallback would otherwise become visible.
// The server never publishes that canned prose as fiction.
const MAX_UPSTREAM_REQUESTS_PER_TURN = 4;

export const runLunaInternal = async (
  request: SimulateRequest,
  suppliedApiKey?: string,
  liveRuntime?: LiveRuntimeRequest,
): Promise<EngineTurnResponse | LivePlanEnvelope> => {
  const liveFinalize = liveRuntime?.phase === "finalize";
  const writerSceneClockVerified = liveRuntime?.phase === "finalize" &&
    Boolean(liveRuntime.turn.writerSceneClock);
  const plannedRecovery = isPlannedTurnRecovery(request);
  const allowCanonicalHandoffOpening = liveFinalize &&
    liveRuntime.beatPolicy.phase === "final_closure";
  const apiKey = resolveRequestApiKey({
    suppliedKey: suppliedApiKey,
    serverKey: process.env.OPENAI_API_KEY,
    runtimeEnvironment: process.env.NODE_ENV,
  });
  if (!apiKey) {
    if (BUILT_IN_DEMO_PROJECT_IDS.has(request.pack.projectId)) {
      return synchronizeGeneratedTurnChronology(
        request.state,
        createMockTurn(request),
      );
    }
    throw new SimulationRouteError(
      401,
      "API_KEY_REQUIRED",
      "이 작품을 진행하려면 GPT-6 Luna 연결이 필요합니다. 설정에서 OpenAI API 키를 연결한 뒤 같은 입력을 다시 보내 주세요.",
    );
  }

  const imageDue = request.state.imageEvery > 0 &&
    (request.state.turn + 1) % request.state.imageEvery === 0;
  const momentum = analyzeNarrativeMomentum({
    state: request.state,
    userText: request.userText,
    recentTurns: request.recentTurns,
  });
  const storyDrive = deriveStoryDrive({
    pack: request.pack,
    state: request.state,
    userText: request.userText,
    recentTurns: request.recentTurns,
    longTermMemories: request.longTermMemories,
    advanceMode: request.advanceMode,
  });
  const claudeRuntime = readClaudeRuntime(
    request.pack,
    request.state,
    storyDrive.routeLock.currentEventId,
  );
  const nexusActiveEvent = request.pack.events.find(
    (event) => event.id === claudeRuntime.activeEventId,
  ) ?? request.pack.events.find(
    (event) => event.id === storyDrive.routeLock.currentEventId,
  );
  const forcedClosureTurn = claudeClosurePressureActive(
    nexusActiveEvent,
    claudeRuntime,
  );
  const finalBeatConvergenceTurn = forcedClosureTurn;
  const currentLiveBeat = Math.max(1, claudeRuntime.beat + 1);
  const totalLiveBeats = Math.max(1, claudeRuntime.beatTotal);
  const liveBeatPolicy = deriveLiveBeatPolicy({
    currentBeat: currentLiveBeat,
    totalBeats: totalLiveBeats,
    finalBeat: finalBeatConvergenceTurn,
    closureExtension: claudeRuntime.closureExtensionCount > 0,
    closureExtensionStage: claudeRuntime.closureExtensionCount === 2 ? 2 : claudeRuntime.closureExtensionCount === 1 ? 1 : undefined,
  });
  const turnIntent = deriveClaudeTurnIntent(
    request.userText,
    nexusActiveEvent,
    request.state.time,
    claudeRuntime.backfill,
  );
  const narrativeSceneContract = deriveNarrativeSceneContract(
    request.advanceMode === "canonical" ? "" : request.userText,
  );
  // 플레이어가 직접 선언한 장시간 이동은 활성 사건의 required 플래그나
  // 한국어 조사 변형에 관계없이 이탈 흡수 경로로 보낸다. 새로운 표현이
  // 의도 분류기를 빠져도 일반 재작성 비교에서 턴을 폐기하지 않는다.
  const explicitDerailmentTurn = request.advanceMode !== "canonical" && (
    turnIntent.explicitDerailment ||
    (turnIntent.impliedTravel && turnIntent.longSpan)
  );
  const requiredEncounterLocationBridge =
    shouldStageRequiredEncounterLocation(request, storyDrive);
  const scenePacing = deriveScenePacingContract(request, storyDrive);
  const sceneFocus = analyzeSceneFocus({
    pack: request.pack,
    recentTurns: request.recentTurns,
  });
  const servantBond = deriveServantBondDirection({
    pack: request.pack,
    state: request.state,
    userText: request.userText,
    recentTurns: request.recentTurns,
    summoningNow: storyDrive.requireMilestoneThisTurn,
    supportHandoffNeeded: sceneFocus.requireHandoff,
  });
  const autonomyCandidates = selectAutonomyCandidates(
    request.pack,
    request.state,
    request.userText,
  );
  const activeRelationshipMemories = (request.state.relationshipMemories ?? [])
    .filter((memory) => memory.active || memory.createdTurn >= request.state.turn - 12)
    .slice(-80);
  const entityNames = new Map<string, string>([
    [request.pack.player.id, request.pack.player.name],
    ...request.pack.npcs.map((npc) => [npc.id, npc.name] as const),
    ...request.pack.factions.map((faction) => [faction.id, faction.name] as const),
  ]);
  const autonomyByEntity = new Map(
    (request.state.autonomyActors ?? []).map((actor) => [actor.entityId, actor]),
  );
  const knowledgeEntityIds = [...new Set([
    request.pack.player.id,
    ...request.state.encounteredCharacterIds,
    ...activeRelationshipMemories.flatMap((memory) => [
      memory.sourceId,
      memory.targetId,
    ]),
  ])].filter((id) => entityNames.has(id)).slice(0, 32);
  const characterKnowledgeLedger = knowledgeEntityIds.map((entityId) => {
    const actor = autonomyByEntity.get(entityId);
    const ownRelationshipEvidence = activeRelationshipMemories
      .filter((memory) => memory.sourceId === entityId)
      .slice(-12)
      .map((memory) => ({
        targetId: memory.targetId,
        targetName: entityNames.get(memory.targetId) ?? memory.targetId,
        title: memory.title,
        cause: memory.cause || memory.summary,
        visibility: memory.visibility,
        unresolved: memory.unresolved,
      }));
    const playerKnownFacts = entityId === request.pack.player.id
      ? [
          ...request.state.memories.slice(-16),
          ...(request.state.observableTraces ?? []).slice(-10).map((trace) => trace.text),
        ]
      : [];
    return {
      entityId,
      name: entityNames.get(entityId) ?? entityId,
      knownFacts: [
        ...playerKnownFacts,
        ...(actor?.knowledge ? [actor.knowledge] : []),
      ].slice(-20),
      misinformation: actor?.misinformation ? [actor.misinformation] : [],
      relationshipEvidence: ownRelationshipEvidence,
      policy:
        "이 항목의 지식만 이 인물의 판단 근거로 사용한다. 다른 인물 항목의 비공개 사실은 전달 장면 전까지 모른다.",
    };
  });
  const recentContextText = request.recentTurns
    .slice(-MODEL_RECENT_TURN_LIMIT)
    .flatMap((turn) => [
      turn.userText ?? "",
      ...turn.blocks.map((block) =>
        `${block.speakerName ?? ""} ${block.text}`,
      ),
    ])
    .join("\n")
    .slice(-24_000);
  const preTurnObservation = [
    request.userText,
    recentContextText,
    ...(request.longTermMemories ?? []).flatMap((memory) => [
      memory.title,
      memory.summary,
      memory.location,
      memory.date,
      memory.time,
    ]),
    request.state.sceneSummary,
    ...request.state.memories,
    ...request.state.observableTraces.map((trace) => trace.text),
    ...request.state.variables
      .filter((variable) => variable.visibility === "public")
      .flatMap((variable) => [variable.label, variable.detail]),
  ].join("\n");
  // A player may type a hidden name as a guess.  That makes the utterance
  // observable, not the claim verified.  Only previously saved public prose
  // and ledgers release a protected term for author narration/state.
  const verifiedPreTurnObservation = [
    recentContextText,
    ...(request.longTermMemories ?? []).flatMap((memory) => [
      memory.title,
      memory.summary,
      memory.location,
      memory.date,
      memory.time,
    ]),
    request.state.sceneSummary,
    ...request.state.memories,
    ...request.state.observableTraces.map((trace) => trace.text),
    ...request.state.variables
      .filter((variable) => variable.visibility === "public")
      .flatMap((variable) => [variable.label, variable.detail]),
  ].join("\n");
  const derivedRequiredContinuity = deriveRequiredContinuity(
    request,
    storyDrive,
    preTurnObservation,
  );
  const requiredContinuity = {
    ...derivedRequiredContinuity,
    active: finalBeatConvergenceTurn && derivedRequiredContinuity.active,
  };
  const derivedRequiredEventReroute = deriveRequiredEventReroute(
    request,
    storyDrive,
    turnIntent,
  );
  const requiredEventReroute = {
    ...derivedRequiredEventReroute,
    active: derivedRequiredEventReroute.active,
    mode: derivedRequiredEventReroute.mode,
    resolveCurrentEvent: finalBeatConvergenceTurn,
    currentBeatSignals: splitContractSignals(
      nexusActiveEvent?.beats
        ?.slice()
        .sort((left, right) => left.order - right.order)[claudeRuntime.beat]
        ?.requiredSignals,
    ),
  };
  const inventoryInspectionRequested =
    /소지품|인벤토리|가방|주머니|보유\s*물품|가지고\s*있는\s*(?:것|물건)/u.test(
      request.userText,
    );
  const initialInventoryTerms = splitInitialInventory(
    request.pack.player.inventory,
  );
  const initialInventoryKeys = new Set(
    initialInventoryTerms.map(compactDisclosureTerm),
  );
  const visibleInventory = request.state.inventory.filter((term) => {
    if (inventoryInspectionRequested) return true;
    const key = compactDisclosureTerm(term);
    if (!initialInventoryKeys.has(key)) return true;
    return containsDisclosureTerm(preTurnObservation, term);
  });
  const visibleInventoryKeys = new Set(
    visibleInventory.map(compactDisclosureTerm),
  );
  const restrictedBodyTerms = request.state.inventory.filter(
    (term) =>
      term.trim().length >= 2 &&
      !visibleInventoryKeys.has(compactDisclosureTerm(term)),
  );
  const packageDisclosure = (request.pack.narrativeRuntime?.characterDisclosure ?? [])
    .map((disclosure) => {
      const character = request.pack.npcs.find((npc) => npc.id === disclosure.characterId);
      const revealed = runtimePredicateSatisfied(disclosure.revealCondition, {
        completedEventIds: claudeRuntime.sealed.map((sealed) => sealed.id),
        clocks: request.state.clocks,
      });
      return {
        characterId: disclosure.characterId,
        canonicalName: character?.name ?? "",
        preRevealAlias: disclosure.preRevealAlias || character?.preRevealAlias || "정체불명의 주요 인물",
        revealCondition: disclosure.revealCondition,
        revealed,
      };
    });
  const packageRevealGuards = package15RevealGuards(request.pack.package15Runtime, {
    completedEventIds: claudeRuntime.sealed.map((sealed) => sealed.id),
    clocks: request.state.clocks,
  });
  const protectedIdentityTerms = sanitizeProtectedTerms([
    ...protectedSaberIdentityTerms(request.pack),
    ...packageDisclosure
      .filter((disclosure) => !disclosure.revealed)
      .map((disclosure) => disclosure.canonicalName)
      .filter((name) => name.length >= 2),
    ...packageRevealGuards
      .filter((guard) => guard.mode !== "full")
      .flatMap((guard) => guard.protectedTerms),
  ]);
  const saberClassObservedBeforeTurn =
    saberClassWasExplicitlyObserved(verifiedPreTurnObservation);
  const canonicalAdvance = request.advanceMode === "canonical";
  const relevanceText = [
    request.userText,
    request.state.location,
    request.state.sceneSummary,
    ...request.state.memories.slice(-12),
    ...request.state.variables
      .filter((variable) => variable.status === "active")
      .flatMap((variable) => [variable.label, variable.detail]),
    recentContextText,
  ].join("\n");
  const overreachIntent = derivePlayerOverreachIntent(request.userText);
  const activeEventText = [
    nexusActiveEvent?.name,
    nexusActiveEvent?.type,
    nexusActiveEvent?.description,
    nexusActiveEvent?.completionSignals,
    nexusActiveEvent?.beats?.[claudeRuntime.beat]?.title,
    nexusActiveEvent?.beats?.[claudeRuntime.beat]?.content,
    request.userText,
  ].filter(Boolean).join(" ");
  const combatScene =
    /(?:전투|교전|습격|공격|결투|난전|추격전|combat|battle|fight)/iu.test(activeEventText);
  const complexScene =
    nexusActiveEvent?.kind === "compound" ||
    (nexusActiveEvent?.beats?.length ?? 0) > 1 ||
    narrativeSceneContract.clauses.filter((clause) => clause.mode === "execution").length >= 3 ||
    narrativeSceneContract.destinationEncounter ||
    (narrativeSceneContract.hasOverreach && narrativeSceneContract.compound);
  const requiredEventCompletion = finalBeatConvergenceTurn &&
    (storyDrive.requireMilestoneThisTurn || requiredEventReroute.active);
  const compiledScene = compileSceneContext({
    request,
    activeEvent: nexusActiveEvent,
    beatIndex: claudeRuntime.beat,
    totalBeats: claudeRuntime.beatTotal,
    completedEventIds: claudeRuntime.sealed.map((sealed) => sealed.id),
    protectedTerms: protectedIdentityTerms,
    visibleInventory,
    pathSignals: [
      { id: "combat", active: combatScene },
      { id: "compound_or_multi_clause", active: complexScene },
      { id: "overreach", active: overreachIntent.active },
      { id: "required_completion", active: requiredEventCompletion },
      { id: "location_bridge", active: requiredEncounterLocationBridge },
      { id: "continuity_repair", active: requiredContinuity.active },
      { id: "event_reroute", active: requiredEventReroute.active },
      { id: "explicit_derailment", active: explicitDerailmentTurn },
      { id: "manual_carryover", active: Boolean(claudeRuntime.manualCarryover?.missing.length) },
      { id: "forced_event_closure", active: forcedClosureTurn },
    ],
  });
  const compiledCharacterIds = new Set(
    compiledScene.profile.includedCharacterIds,
  );
  const selectedKnowledgeLedger = characterKnowledgeLedger
    .filter((entry) => compiledCharacterIds.has(entry.entityId))
    .map((entry) => ({
      ...entry,
      knownFacts: entry.knownFacts.filter((fact) =>
        !protectedIdentityTerms.some((term) => term.length >= 2 && fact.includes(term))
      ),
      misinformation: entry.misinformation.filter((fact) =>
        !protectedIdentityTerms.some((term) => term.length >= 2 && fact.includes(term))
      ),
      relationshipEvidence: entry.relationshipEvidence.filter((evidence) => {
        const text = `${evidence.title} ${evidence.cause}`;
        return !protectedIdentityTerms.some((term) => term.length >= 2 && text.includes(term));
      }),
    }));
  const selectedAutonomyCandidates = autonomyCandidates.filter((candidate) =>
    candidate.isOnScreen || compiledCharacterIds.has(candidate.entityId))
    .slice(0, compiledScene.context.compiler.path === "deep" ? 8 : 4);
  const deferFullPromptUntilAfterProse = liveRuntime?.phase === "plan" && liveBeatPolicy.phase !== "final_closure" && !plannedRecovery;
  const claudePromptContext = buildClaudeRuntimePrompt({
    pack: request.pack,
    state: request.state,
    ledger: claudeRuntime,
    userInput: canonicalAdvance ? "" : request.userText,
    canonicalAdvance,
  });
  const staticPrompt = deferFullPromptUntilAfterProse ? "" : buildV31StaticPrompt(request.pack);
  const dynamicContext = {
    instruction: canonicalAdvance
      ? "플레이어 입력 없이 패키지의 정석 시나리오와 자율 NPC 행동으로 다음 장면을 진행하라. 플레이어의 행동·대사·감정은 만들지 않는다."
      : "아래 현재 상태에서 사용자 입력 직후의 다음 장면을 생성하라.",
    advanceMode: canonicalAdvance ? "canonical" : "player",
    imageDue,
    sceneContext: compiledScene.context,
    pacing: {
      mode: "brisk",
      minimumStoryBeats: 3,
      recommendationPolicy:
        "narration을 쓴 같은 작가가 마지막 열린 대응 지점과 현재 활성 사건의 다음 정사 압력을 조용히 대조한다. 낮음·보통·높음을 하나씩, 서로 다른 접근으로 쓰며 세 선택 모두 현재 장면을 실제로 전진시킨다. 정사 자료는 방향에만 쓰고 미래 정보는 공개하지 않는다.",
    },
    disclosureGuard: {
      visibleInventory,
      forbiddenPublicTerms: [],
      hiddenInventoryTermCount: restrictedBodyTerms.length,
      policy:
        "visibleInventory만 이미 공개된 소지품이다. 숨은 소품의 정확한 명칭은 컨텍스트에서 제외됐다. 획득 과정을 narration에서 실제로 보여 준 뒤 inventoryAdd에 넣는 경우에만 새 명칭을 공개한다.",
    },
    characterKnowledgeLedger: selectedKnowledgeLedger,
    autonomyCandidates: selectedAutonomyCandidates,
    momentum,
    sceneFocus,
    servantBond,
    storyDirector: {
      mode: storyDrive.mode,
      canonicalAdvance: storyDrive.canonicalAdvance,
      requireMilestoneThisTurn:
        finalBeatConvergenceTurn && storyDrive.requireMilestoneThisTurn,
      currentEventId: storyDrive.routeLock.currentEventId,
      phase: storyDrive.routeLock.phase,
      reconciledInventoryAdds: storyDrive.reconciledInventoryAdds,
    },
    claudeRuntime: {
      engine: claudePromptContext.engine,
      activeEvent: compiledScene.context.activeEvent,
      currentBeat:
        compiledScene.context.activeEvent?.currentBeat ?? null,
      manualCarryover: claudePromptContext.manualCarryover,
      closurePressure: claudePromptContext.closurePressure,
      pressure: claudePromptContext.pressure,
      derailment: claudePromptContext.derailment,
      outputContract: claudePromptContext.outputContract,
      hardRules: claudePromptContext.hardRules,
    },
    sessionCanonLedger: {
      active: compiledScene.context.sessionCanon,
      userOriginPolicy: [
        "사용자 입력은 항상 장면에서 들리거나 시도된 사실이다. 그러나 그 안의 세계 주장까지 자동으로 참이 되는 것은 아니다.",
        "fixedCanon과 충돌하는 주장은 인물이 본문 안에서 부정·회피·공개 거절로 받아치고, 정답은 누설하지 않는다.",
        "fixedCanon과 충돌하지 않는 사용자 선언은 branch_canon 또는 scene_fact로 실제 성립시키고 후속 사건을 그 결과에 맞게 재구성한다.",
        "맞거나 틀린 추측은 확인 상태를 정확히 기록한다. 미확인 추측을 장기기억 요약 과정에서 확정 사실로 바꾸지 않는다.",
        "이미 사용자 분기로 일어난 공개·행동·만남은 예정된 미래 사건에서 반복하지 않고 결과·후폭풍·관계 변화로 흡수한다.",
      ],
    },
    nexusGuard: {
      compoundEvent: compoundBeatPrompt(request.state, nexusActiveEvent),
      beatClosure: {
        active: Boolean(nexusActiveEvent),
        forceClosureThisTurn: forcedClosureTurn,
        currentBeat: claudeRuntime.beat + 1,
        totalBeats: claudeRuntime.beatTotal,
        policy: forcedClosureTurn
          ? "현재가 마지막 비트다. 일반 장면 길이에 맞추지 말고 현재 시간창·장소·등장인물의 동기와 이동 가능 시간을 지키면서 사용자 입력의 직접 결과, 필요한 대화, 상대의 반응, 확인과 인계까지 충분히 이어 쓴다. 남은 필수 결과와 완료 신호를 본문에서 직접 성립시키고 eventResolved=true로 닫는다. 다음 사건은 시작하지 않는다. 충분히 확장한 본문에서도 종결 계약이 남을 때만 앱이 현재 사건에 종결 전용 비트 하나를 추가한다."
          : liveBeatPolicy.phase === "first_draft"
            ? "첫 비트다. 첫 유효 초안을 그대로 공개할 수 있도록 플레이어의 선택·대화·조사·관계 변화에 넓은 자율성을 주고 현재 장면의 직접 반응과 새로운 가능성을 자유롭게 발전시킨다. 사건 결과로 조기 수렴하지 말고 eventResolved=false로 둔다."
            : "중간 빌드업 비트다. 플레이어 선택과 현재 장면의 자율성은 보존하되, 마지막 비트에서 사건을 개연성 있게 닫을 수 있도록 원인·관계·단서·물리적 준비 중 적어도 하나를 실제 장면에 쌓는다. 아직 사건을 종결하지 말고 eventResolved=false로 둔다.",
      },
      derailment: {
        explicitDerailmentTurn,
        destinationHint: turnIntent.destinationHint,
        requestedEndTime: turnIntent.requestedEndTime,
        requestedMinimumMinutes: turnIntent.requestedMinimumMinutes,
        longSpan: turnIntent.longSpan,
        driftTurnsBefore: claudeRuntime.driftTurns,
        policy: explicitDerailmentTurn
          ? finalBeatConvergenceTurn
            ? "마지막 비트의 의도 보존형 정사 흡수 턴이다. 사용자가 선언한 목적지와 시간 계획을 인정하고 가능한 행동을 먼저 반영한다. 현재 시간창·장소·이동 시간을 지키며 활성 사건의 결과를 그 동선에 자연스럽게 끼워 넣고 이번 비트에서 종결한다."
            : "탐색·중간 비트의 의도 보존형 정사 교정 턴이다. 사용자의 목적지·시간 계획·이탈 욕구와 가능한 첫 행동은 지우지 않는다. 다만 현재 사건 시간창을 넘기기 전에 인물의 책임·관계·양심 또는 외부 연락·환경 변화가 구체적으로 끼어들어 현재 비트의 필수 행동과 반응에 합류시킨다. 현재 비트만 전진시키고 사건 결과 수렴과 종결은 마지막 비트까지 미룬다."
          : "일반 턴에서는 현재 사건 뒤의 사건을 함께 완료하거나 봉인하지 않는다. 미래 사건 내용이 섞이면 현재 사건 범위로 재작성한다.",
      },
      overreach: {
        ...overreachIntent,
        policy: overreachIntent.active
          ? "D형 과잉 입력이다. 입력을 일반 이동이나 정사 행동으로 덮지 말고, 시도 → 대상·주변의 직접 반응 → 현실적인 비용 → 현재 사건과의 인과적 접속 순서로 장면화한다. 선언만으로 타인의 동의·피해·승리를 확정하지 않되, 플레이어가 실제로 시도했다는 사실과 그 흔적은 반드시 남긴다."
          : "과잉 입력이 아니다.",
      },
    },
    scenePacing: {
      ...scenePacing,
      policy: scenePacing.calmScene
        ? `평온한 만남·일상·설명 장면은 기본 ${scenePacing.minimumSceneExchanges}회의 의미 있는 상호작용을 거친다. 이번은 ${scenePacing.sceneExchangeNumber}번째 응답이다. 플레이어가 직접 떠나거나 장면을 끝내지 않았다면 현재 장면 안에서 관계·정보·선택을 발전시키고 다음 필수 사건으로 전환하지 않는다.`
        : "위기 장면은 필요한 속도로 진행하되 원인·대응·결과를 생략하지 않는다.",
    },
    continuityBridge: {
      currentTime: request.state.time,
      currentLocation: request.state.location,
      currentScene: request.state.sceneSummary,
      policy: [
        "사용자 입력과 기존 장면이 곧바로 맞물리지 않으면 입력을 거절하거나 무시하지 말고, 현재 장소에서 출발하는 원인→행동→주변 반응→도착 또는 새 대응 지점의 연결 장면을 쓴다.",
        "복합 입력은 선언 순서대로 분해한다. 준비·물건 조작·출발·이동처럼 플레이어가 실행할 수 있는 앞 절은 먼저 확정하고, 뒤 절의 재회·타인 반응·출입 성공·우연·승패가 세계 상태와 충돌하면 그 뒤 절만 보류하거나 실패시킨다. 뒤 절의 충돌 때문에 앞 절까지 지우거나 원래 장소에 남기지 않는다.",
        "이동 뒤 특정 인물과 재회하거나 말을 거는 절이 있으면 그 인물의 등장·직접 반응 또는 부재·착각을 반드시 본문에 쓴다. 이동 도착문에서 응답을 끝내지 않는다.",
        "사용자가 이동을 선언하면 이동 수단·경과 시간·도착을, 대화를 선언하면 상대가 질문을 이해한 반응과 답변을, 조사하면 관측 가능한 결과를 blocks에 보여 준다.",
        "패키지의 필수 사건은 고정된 장소 연출을 강요하지 않는다. 사용자 선택으로 장소나 상황이 달라졌다면 NPC·환경·시간의 독립 행동으로 현재 장면에 맞게 변형한다.",
        "최근 전문에서 끝난 사건과 떠난 인물은 재생하지 않는다. 현재 장면을 자연스럽게 잇는 데 필요한 과거 사실은 한 문장 회상까지만 허용한다.",
        "문맥이 애매할수록 다음 큰 사건으로 건너뛰지 말고, 현재 장면에서 확인 가능한 작은 결과와 후속 선택을 만든다.",
      ],
    },
    requiredEncounterLocationBridge: {
      required: requiredEncounterLocationBridge,
      policy: requiredEncounterLocationBridge
        ? narrativeSceneContract.destinationEncounter
          ? "필수 첫 만남의 시작 장소와 현재 장소는 다르지만, 플레이어가 목적지 이동과 특정 인물의 재회·대화까지 한 입력에 선언했다. 시작 장소에 NPC를 순간이동시키지 말고 준비·출발·이동·도착을 먼저 쓴 뒤, 목적지가 사건과 양립하면 그곳에서 등장과 직접 반응까지 orderedSceneContract 순서대로 쓴다. 목적지에 없으면 닮은 사람·부재·엇갈림의 구체적 근거를 보여 주되 이동을 취소하지 않는다. 도착문에서 응답을 끝내지 않는다."
          : "필수 첫 만남의 예정 장소와 현재 장소가 맞지 않는다. 시작 장소에 해당 인물을 순간이동시키지 않는다. 현재 장소의 일상과 준비를 보여 주거나, 사용자가 이동만 선언했다면 출발·이동 수단·경과 시간·도착까지 서술하고 만남은 다음 턴에 남긴다."
        : "현재 장소에서 허용된 사건만 진행한다.",
    },
    requiredContinuity,
    requiredEventReroute,
    canonPriority: [
      "패키지 fixedCanon과 명시 인물의 바뀌지 않는 핵심 정체",
      "현재 sessionCanonLedger의 확인된 분기 정사·장면 사실·미해결 여파",
      "플레이어의 미확인 추측과 인물이 부정한 주장",
      "검증된 조사 캐시와 참고작품 일반 규칙",
      "모델 지식과 창작적 보완",
    ],
  };
  let dynamicPrompt = appendPlannedRecoveryPrompt(deferFullPromptUntilAfterProse
    ? ""
    : compactPromptSection(dynamicContext, {
        maxChars: compiledScene.context.compiler.path === "deep" ? 48_000
          : request.pack.instantStoryRuntime?.contextBudget.maxDynamicPromptChars ?? 24_000,
        maxArrayItems: compiledScene.context.compiler.path === "deep" ? 64 : 36,
        relevanceText,
      }), request);
  let contextProfile = contextProfileWithPromptSizes(
    compiledScene.profile,
    staticPrompt,
    dynamicPrompt,
  );
  const provider = normalizeModelProvider(request.provider);
  const model = upgradeLunaModel(request.provider?.textModel?.trim() || process.env.OPENAI_TEXT_MODEL?.trim() || provider.textModel);
  const instantFastRuntime = compiledScene.context.compiler.path === "fast"
    ? request.pack.instantStoryRuntime
    : undefined;
  const maxOutputTokens = finalBeatConvergenceTurn
    ? 5_200
    : instantFastRuntime?.generation.ordinaryTurnMaxOutputTokens ?? (
        combatScene || complexScene || requiredEventCompletion
          ? 3800
          : narrativeSceneContract.destinationEncounter
            ? 2800
            : nexusActiveEvent
              ? 3000
              : narrativeSceneContract.hasSpeech
                ? 2000
                : 2400
      );
  const reasoningEffort: EngineReasoningEffort =
    compiledScene.context.compiler.path === "deep"
      ? "medium"
      : instantFastRuntime?.generation.reasoningEffort ?? "none";
  let upstreamRequestCount = 0;
  let researchRequestCount = 0;
  const billedResponses: Record<string, unknown>[] = [];
  const billedRequestMetadata: Array<{
    call: number;
    stage: EngineCallStage;
    reasoningEffort: EngineReasoningEffort;
    rewriteReasons: string[];
    durationMs: number;
  }> = [];
  const localRepairs: NonNullable<EngineUsage["localRepairs"]> = [];
  const researchCandidates = liveRuntime || request.pack.instantStoryRuntime?.enabled
    ? []
    : researchCandidatesForTurn(request);
  let characterResearchCacheUpsert: CharacterResearchCacheEntry[] = [];
  if (researchCandidates.length) {
    const researchStartedAt = Date.now();
    upstreamRequestCount += 1;
    researchRequestCount += 1;
    const research = request.pack.aiWorldContext!.referenceCharacterResearch;
    const researchResponse = await fetch(providerEndpoint(provider, "responses"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        max_output_tokens: 1400,
        store: false,
        tools: [{ type: "web_search" }],
        include: ["web_search_call.action.sources"],
        input: `다음 참고작품 캐릭터를 조사하라: ${researchCandidates.join(", ")}\n조사 범위: ${research.researchScope}\n자료 우선순위: ${research.sourcePriority || "공식 자료 우선"}\n원작 시점 제한: ${research.canonCutoff || "패키지 지정 시점"}\n성격·말투·호칭·능력 한계·관계·원작 시점만 요약하고, 현재 패키지의 사건이나 비밀을 덮어쓰지 마라. 각 인물당 900자 이내 한국어 요약을 작성하라.`,
        text: {
          format: {
            type: "json_schema",
            name: "relay_character_research",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                characters: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      characterName: { type: "string" },
                      summary: { type: "string" },
                    },
                    required: ["characterName", "summary"],
                  },
                },
              },
              required: ["characters"],
            },
          },
        },
      }),
    });
    if (researchResponse.ok) {
      const researchBody = await researchResponse.json() as Record<string, unknown>;
      billedResponses.push(researchBody);
      billedRequestMetadata.push({
        call: upstreamRequestCount,
        stage: "character_research",
        reasoningEffort: "low",
        rewriteReasons: [],
        durationMs: Math.max(0, Date.now() - researchStartedAt),
      });
      characterResearchCacheUpsert = parseResearchPayload(
        researchBody,
        researchCandidates,
        research.canonCutoff,
      );
      if (characterResearchCacheUpsert.length) {
        dynamicPrompt = `${dynamicPrompt}\n\n[검증된 세션 캐릭터 조사 캐시]\n${compactPromptSection(
          characterResearchCacheUpsert,
          { maxChars: 8_000, relevanceText },
        )}\n정사 우선순위: 패키지 fixedCanon·명시 사실 > 현재 세션 확정 사실 > 이 조사 캐시 > 모델 지식·창작 보완. 조사 캐시는 패키지 정사를 덮어쓸 수 없다.`;
        contextProfile = contextProfileWithPromptSizes(
          compiledScene.profile,
          staticPrompt,
          dynamicPrompt,
        );
      }
    }
    // Research failure is non-blocking: package canon remains authoritative.
  }
  const sendOpenAIRequest = (
    prompt: string,
    requestReasoningEffort: EngineReasoningEffort,
    compatibility = false,
  ) => {
    if (upstreamRequestCount - researchRequestCount >= MAX_UPSTREAM_REQUESTS_PER_TURN) {
      throw new Error("Luna turn request budget exhausted.");
    }
    upstreamRequestCount += 1;
    return fetch(providerEndpoint(provider, "responses"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      createResponsesRequestBody(
        model,
        request.pack.projectId,
        staticPrompt,
        prompt,
        requestReasoningEffort,
        maxOutputTokens,
        compatibility,
      ),
    ),
    });
  };

  const requestOpenAI = async (
    prompt: string,
    stage: EngineCallStage,
    rewriteReasons: string[] = [],
  ) => {
    const startedAt = Date.now();
    const requestReasoningEffort: EngineReasoningEffort = stage === "draft"
      ? reasoningEffort
      : compiledScene.context.compiler.path === "deep"
        ? "medium"
        : "low";
    let openAIResponse = await sendOpenAIRequest(
      prompt,
      requestReasoningEffort,
    );
    let compatibilityRetry = false;
    if (!openAIResponse.ok) {
      const firstStatus = openAIResponse.status;
      const firstError = await readOpenAIError(openAIResponse);
      if (shouldRetryWithCompatibilityProfile(firstStatus, firstError)) {
        compatibilityRetry = true;
        openAIResponse = await sendOpenAIRequest(
          prompt,
          requestReasoningEffort,
          true,
        );
      } else {
        if (process.env.RELAY_DEBUG_NARRATIVE === "1") {
          console.error("[relay-narrative-debug]", JSON.stringify({
            deterministicSceneRecoveryReasons,
            input: request.userText,
            story: selectedStoryDriveAssessment,
            semantic: selectedSemanticAssessment,
            location: selectedLocationContinuityAssessment,
            disclosure: selectedDisclosureLeaks,
            identity: selectedIdentityLeaks,
            control: selectedNarrativeControlLeaks,
            required: selectedRequiredContinuityMissing,
            rerouteMissing: selectedRequiredEventRerouteMissing,
            directVisible: inputOutcomeVisibleInTurn(request, parsed, finalIntent),
          }));
        }
        throw new SimulationRouteError(
          502,
          "LUNA_REQUEST_FAILED",
          `Luna가 다음 장면을 만들지 못했습니다. ${openAIErrorMessage(firstStatus, firstError)}`,
        );
      }
    }
    if (!openAIResponse.ok) {
      const detail = await readOpenAIError(openAIResponse);
      throw new SimulationRouteError(
        502,
        "LUNA_REQUEST_FAILED",
        `Luna가 다음 장면을 만들지 못했습니다. ${openAIErrorMessage(openAIResponse.status, detail)}`,
      );
    }
    const responseBody = (await openAIResponse.json()) as Record<string, unknown>;
    billedResponses.push(responseBody);
    billedRequestMetadata.push({
      call: upstreamRequestCount,
      stage,
      reasoningEffort: requestReasoningEffort,
      rewriteReasons: [
        ...rewriteReasons,
        ...(compatibilityRetry ? ["호환 형식 재시도"] : []),
      ],
      durationMs: Math.max(0, Date.now() - startedAt),
    });
    return responseBody;
  };
  const requestRecommendationRepair = async (
    prompt: string,
    rewriteReasons: string[],
  ): Promise<Array<{ label: string; risk: "낮음" | "보통" | "높음" }> | null> => {
    if (upstreamRequestCount - researchRequestCount >= MAX_UPSTREAM_REQUESTS_PER_TURN) return null;
    const startedAt = Date.now();
    upstreamRequestCount += 1;
    const call = upstreamRequestCount;
    try {
      const openAIResponse = await fetch(providerEndpoint(provider, "responses"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          reasoning: { effort: "low", context: "current_turn" },
          max_output_tokens: 650,
          store: false,
          input: [
            {
              type: "message",
              role: "developer",
              content: [{
                type: "input_text",
                text: `너는 방금 완성된 한국어 장르소설 장면의 동일한 작가다. 본문은 절대 다시 쓰지 않고 추천행동 세 줄만 교정한다. 마지막 열린 대응 지점과 비공개 정사 압력을 함께 판단하되 미래 정보는 누설하지 않는다. 위험도 낮음·보통·높음을 하나씩 이 순서로 쓴다. 낮음은 되돌리기 쉽지만 전진하고, 보통은 분명한 개입이며, 높음은 현실적인 대가를 감수한다. 세 행동은 서로 다른 접근이어야 하며 같은 행동의 강도 변형, 반복 확인·대기, 결과 선확정, 미등장 인물·미공개 소품·미래 사건 언급을 금지한다.`,
              }],
            },
            {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: prompt }],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "relay_novel_recommendations",
              strict: true,
              schema: recommendationRepairSchema,
            },
          },
        }),
      });
      if (!openAIResponse.ok) return null;
      const responseBody = (await openAIResponse.json()) as Record<string, unknown>;
      billedResponses.push(responseBody);
      billedRequestMetadata.push({
        call,
        stage: "recommendation_repair",
        reasoningEffort: "low",
        rewriteReasons,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
      const parsedRepair = JSON.parse(extractOutputText(responseBody)) as {
        recommendations?: Array<{
          label?: string;
          risk?: "낮음" | "보통" | "높음";
        }>;
      };
      return (parsedRepair.recommendations ?? [])
        .filter((item): item is { label: string; risk: "낮음" | "보통" | "높음" } =>
          Boolean(item.label?.trim()) &&
          (item.risk === "낮음" || item.risk === "보통" || item.risk === "높음")
        )
        .slice(0, 3);
    } catch {
      return null;
    }
  };
  const narrativeRescueReserved =
    request.advanceMode !== "canonical" &&
    narrativeSceneContract.requiresDirectScene;
  const canUseStandardRewrite = () =>
    !liveFinalize && finalBeatConvergenceTurn && upstreamRequestCount < (
      MAX_UPSTREAM_REQUESTS_PER_TURN -
      Number(narrativeRescueReserved) -
      Number(forcedClosureTurn)
    );

  const parseTurn = (raw: Record<string, unknown>) =>
    synchronizeGeneratedTurnChronology(
      request.state,
      normalizeModelAuthoredTurn(
        JSON.parse(extractOutputText(raw)) as ModelAuthoredTurn,
      ),
    );
  const conciseRevisionPrompt = (
    draft: Omit<EngineTurnResponse, "mode" | "usage">,
    hardReasons: string[],
    detail = "",
  ) => `[Relay Nexus v31 강제 오류 교정]
직전 초안의 문체와 이미 성립한 사용자 행동은 보존하되, 아래 강제 오류를 제거한 완성 장면을 다시 작성한다. 품질 취향이나 경미한 문체 권고만으로 장면을 바꾸지 않는다.

현재: ${request.state.time} · ${request.state.location}
사용자 입력: ${request.advanceMode === "canonical" ? "정사대로 자동 진행" : request.userText}
활성 사건: ${nexusActiveEvent?.id ?? "없음"} / ${nexusActiveEvent?.name ?? "자유 장면"}
현재 비트: ${claudeRuntime.beat + 1}/${claudeRuntime.beatTotal}
강제 오류: ${hardReasons.join(" / ")}
선언 순서 계약:
${narrativeSceneContractPrompt(narrativeSceneContract)}
${detail.slice(0, 5000)}

직전 초안 JSON:
${JSON.stringify({
    narration: draft.narration || canonicalNarrationFromBlocks(draft.blocks),
    dialogueAnnotations: draft.dialogueAnnotations ?? dialogueAnnotationsFromBlocks(draft.blocks),
    statePatch: draft.statePatch,
    claudeSignals: draft.claudeSignals,
    recommendations: draft.recommendations,
    image: draft.image,
    characterVisuals: draft.characterVisuals,
    agencyAudit: draft.agencyAudit,
  }).slice(0, 14_000)}

같은 v31 JSON 스키마로 narration 하나를 처음부터 다시 출력한다. blocks를 만들지 않는다. 강제 오류와 직접 충돌하지 않는 문장·인물 말투·감각 묘사·사용자 입력의 성립한 절은 유지한다.`;
  if (liveRuntime?.phase === "plan") {
    const planStartedAt = Date.now();
    const planReasoningEffort: EngineReasoningEffort = plannedRecovery || compiledScene.context.compiler.path === "deep" ? "low" : "none";
    const fullLiveProtectedTerms = sanitizeProtectedTerms([
      ...restrictedBodyTerms,
      ...protectedIdentityTerms,
      ...request.state.variables
        .filter((variable) =>
          variable.status === "active" &&
          variable.visibility === "hidden" &&
          variable.id !== CLAUDE_RUNTIME_VARIABLE_ID &&
          variable.id !== STORY_ROUTE_PROGRESS_VARIABLE_ID &&
          variable.id !== STORY_SCENE_PROGRESS_VARIABLE_ID &&
          !variable.id.startsWith(NEXUS_COMPOUND_BEAT_PREFIX)
        )
        .flatMap((variable) => [variable.label, variable.detail]),
    ]).filter((term) => !containsDisclosureTerm(verifiedPreTurnObservation, term));
    const liveProtectedTerms = liveBeatPolicy.phase === "first_draft"
      ? sanitizeProtectedTerms(protectedIdentityTerms).filter((term) =>
          !containsDisclosureTerm(verifiedPreTurnObservation, term)
        )
      : fullLiveProtectedTerms;
    const liveFutureProgressionTerms = futureEventGuardTerms({
      pack: request.pack,
      activeEventId: nexusActiveEvent?.id ?? "",
      observedText: verifiedPreTurnObservation,
      allowNextEventOpening: liveBeatPolicy.phase === "final_closure",
    });
    const orderedBeats = [...(nexusActiveEvent?.beats ?? [])]
      .sort((left, right) => left.order - right.order);
    const orderedBeat = orderedBeats[
      Math.min(claudeRuntime.beat, Math.max(0, orderedBeats.length - 1))
    ];
    const nextBeatSignals = splitContractSignals(orderedBeats[claudeRuntime.beat + 1]?.requiredSignals), activeEventIndex = request.pack.events.findIndex((event) => event.id === nexusActiveEvent?.id), nextEventName = request.pack.events.slice(Math.max(0, activeEventIndex + 1)).find((event) => event.kind !== "constraint")?.name ?? "";
    const phaseWriterInstruction = `${livePhaseWriterInstruction(liveBeatPolicy)}${plannedRecoveryWriterInstruction(request)}`;
    const publicSidecarContext = publicWriterContextFromScene({
      ...(compiledScene.context as unknown as Record<string, unknown>),
      requiredEventReroute,
    });
    const publicWriterContext = liveWriterContextFromScene(
      publicSidecarContext,
      liveBeatPolicy.phase === "final_closure"
        ? FINAL_LIVE_CONTEXT_BUDGET
        : ORDINARY_LIVE_CONTEXT_BUDGET,
    );
    const liveWriterDrama = publicWriterContext.drama &&
        typeof publicWriterContext.drama === "object" &&
        !Array.isArray(publicWriterContext.drama)
      ? publicWriterContext.drama as Record<string, unknown>
      : {};
    const chronologyRecoveryActive = Boolean(
      liveWriterDrama.chronologyRecovery &&
      typeof liveWriterDrama.chronologyRecovery === "object",
    );
    const publicDrama = publicSidecarContext.drama &&
        typeof publicSidecarContext.drama === "object" &&
        !Array.isArray(publicSidecarContext.drama)
      ? publicSidecarContext.drama as Record<string, unknown>
      : {};
    const publicBeat = publicDrama.currentBeat &&
        typeof publicDrama.currentBeat === "object" &&
        !Array.isArray(publicDrama.currentBeat)
      ? publicDrama.currentBeat as Record<string, unknown>
      : {};
    const publicBeatSignals = splitContractSignals(
      String(publicBeat.requiredSignals ?? ""),
    );
    const publicBeatDirection = {
      eventName: String(publicDrama.eventName ?? "현재 장면"),
      beatTitle: String(publicBeat.title ?? ""),
      beatIntent: String(publicBeat.intent ?? publicDrama.premise ?? ""),
      requiredEvidence: compiledScene.context.playerInputContract.requiredEvidence,
      currentBeatSignals: publicBeatSignals,
    };
    const speakerBindings = liveSpeakerBindingsFromContext(publicWriterContext);
    const zeroPlanUsage: EngineCallUsage = {
      call: 0,
      stage: "scene_plan",
      reasoningEffort: "none",
      rewriteReasons: [],
      durationMs: 0,
      repairScope: "none",
      inputTokens: 0,
      uncachedInputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    };
    const liveEnvelope = (plan: LiveScenePlan,
      planUsage: EngineCallUsage,
    ): LivePlanEnvelope => {
      const chronologyBoundPlan = hardenChronologyInterruptionPlan({
        plan,
        currentTime: request.state.time,
        currentLocation: request.state.location,
        eventTimeWindow: nexusActiveEvent?.timeWindow ?? request.state.time,
        currentBeatSignals: publicBeatSignals,
        requestedEndTime: turnIntent.requestedEndTime,
        requestedMinimumMinutes: turnIntent.requestedMinimumMinutes, nextBeatSignals, nextEventName,
      }); return ({
      kind: LIVE_PLAN_KIND,
      plan: chronologyBoundPlan,
      publicWriterContext,
      publicSidecarContext,
      writerStaticPrompt: `${buildLiveWriterStaticPrompt(request.pack)}${phaseWriterInstruction}`,
      ...(staticPrompt ? { sidecarStaticPrompt: staticPrompt } : {}),
      ...(deferFullPromptUntilAfterProse
        ? { sidecarStaticPromptFactory: () => buildV31StaticPrompt(request.pack) }
        : {}),
      protectedTerms: liveProtectedTerms,
      futureProgressionTerms: liveFutureProgressionTerms,
      canonAnchorGuard: liveCanonAnchorGuardForPlan({
        plan: chronologyBoundPlan, intent: turnIntent,
        currentTime: request.state.time, currentLocation: request.state.location,
        eventTimeWindow: nexusActiveEvent?.timeWindow ?? request.state.time,
        canonAbsorptionRequired: plannedRecovery || requiredEventReroute.active || chronologyRecoveryActive,
        eventName: nexusActiveEvent?.name ?? "현재 사건", strictEventTime: Boolean(nexusActiveEvent?.timeWindow), currentBeatSignals: publicBeatSignals,
        nextBeatSignals, nextEventName, rebaseToPlan: plannedRecovery,
      }),
      beatPolicy: liveBeatPolicy,
      diagnosticContract: {
        eventName: nexusActiveEvent?.name ?? "현재 자유 장면",
        timeWindow: nexusActiveEvent?.timeWindow ?? request.state.time,
        currentTime: request.state.time,
        currentLocation: request.state.location,
        targetLocation: chronologyBoundPlan.targetLocation || request.state.location,
        requiredItems: splitContractSignals(nexusActiveEvent?.requiredItems),
        requiredDialogue: splitContractSignals(nexusActiveEvent?.requiredDialogue),
        completionSignals: splitContractSignals(nexusActiveEvent?.completionSignals),
        currentBeatSignals: splitContractSignals(orderedBeat?.requiredSignals),
      },
      speakerBindings,
      splitSidecar: true,
      model,
      baseUrl: provider.baseUrl,
      reasoningEffort,
      maxOutputTokens: liveBeatPolicy.phase === "final_closure"
        ? Math.max(5_200, maxOutputTokens)
        : maxOutputTokens,
      promptCacheKey: sanitizePromptCacheKey(request.pack.projectId),
      planUsage,
      });
    };
    if (liveBeatPolicy.phase === "first_draft" && !plannedRecovery) {
      return liveEnvelope(firstBeatInstantPlan(
        request.state.time,
        request.state.location,
        publicBeatDirection,
      ), zeroPlanUsage);
    }
    if (liveBeatPolicy.phase === "closure_build_up" && !plannedRecovery) {
      return liveEnvelope(middleBeatMicroPlan({
        time: request.state.time,
        location: request.state.location,
        ...publicBeatDirection,
      }), zeroPlanUsage);
    }
    const planResponse = await fetch(providerEndpoint(provider, "responses"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: planReasoningEffort, context: "current_turn" },
        max_output_tokens: 1000,
        store: false,
        input: [
          {
            type: "message",
            role: "developer",
            content: [{ type: "input_text", text: livePlanDeveloperPrompt }],
          },
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: dynamicPrompt }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "relay_live_scene_plan",
            strict: true,
            schema: liveScenePlanSchema,
          },
        },
      }),
    });
    if (!planResponse.ok) {
      const detail = await readOpenAIError(planResponse);
      throw new SimulationRouteError(
        502,
        "LUNA_REQUEST_FAILED",
        `Luna가 장면 계획을 만들지 못했습니다. ${openAIErrorMessage(planResponse.status, detail)}`,
      );
    }
    const planBody = await planResponse.json() as Record<string, unknown>;
    let plan: LiveScenePlan;
    try {
      plan = JSON.parse(extractOutputText(planBody)) as LiveScenePlan;
    } catch {
      throw new SimulationRouteError(
        422,
        "LUNA_RESPONSE_REJECTED",
        "장면 계획 JSON이 손상되어 이번 턴을 시작하지 않았습니다.",
      );
    }
    let serializedPlan = JSON.stringify(plan, null, 2);
    let leakedPlanTerms = [...new Set(liveProtectedTerms.filter((term) =>
      findProtectedTerm(serializedPlan, [term])
    ))];
    const planCorrectionReasons: string[] = [];
    if (leakedPlanTerms.length) {
      const correction = correctProtectedTermsOnce(serializedPlan, leakedPlanTerms);
      if (!correction.remainingProtectedTerm) {
        try {
          plan = JSON.parse(correction.text) as LiveScenePlan;
          serializedPlan = correction.text;
          planCorrectionReasons.push(...correction.reasons);
          leakedPlanTerms = [];
        } catch {
          // The original plan is retained below for the development diagnostic.
        }
      }
    }
    if (leakedPlanTerms.length) {
      const diagnostic: FailedTurnDiagnostic = {
        code: "NARRATIVE_REWRITE_FAILED",
        summary: "장면 계획에 비공개 정보가 포함되어 이번 턴을 시작하지 않았습니다.",
        reasons: leakedPlanTerms.map((term) =>
          `장면 계획에서 공개 전 보호 정보 ‘${term}’가 감지되었습니다.`
        ),
        narration: serializedPlan,
        draftKind: "scene_plan",
        beat: liveBeatPolicy.beat,
        totalBeats: liveBeatPolicy.totalBeats,
        phase: liveBeatPolicy.phase,
        correctionApplied: false,
      };
      throw new SimulationRouteError(
        422,
        "NARRATIVE_REWRITE_FAILED",
        diagnostic.summary,
        diagnostic,
      );
    }
    const hardenedPlan = hardenPlannedRecoveryPlan({ request, plan,
      eventTimeWindow: nexusActiveEvent?.timeWindow ?? request.state.time, currentBeatSignals: publicBeatSignals, nextBeatSignals, nextEventName,
    });
    plan = {
      ...hardenedPlan,
      targetTime: hardenedPlan.targetTime || request.state.time,
      targetLocation: hardenedPlan.targetLocation || request.state.location,
      beatAdvanced: finalBeatConvergenceTurn ? true : hardenedPlan.beatAdvanced,
      eventResolved: finalBeatConvergenceTurn ? true : false,
      mustShow: [...new Set([
        ...(hardenedPlan.mustShow ?? []),
        ...(finalBeatConvergenceTurn
          ? ["현재 사건의 관측 가능한 최종 결과와 종결 근거"]
          : []),
      ])].slice(0, 8),
    };
    const planUsage = openAIUsageFromResponse(
      planBody,
      "scene_plan",
      1,
      planReasoningEffort,
      Math.max(0, Date.now() - planStartedAt),
    );
    return liveEnvelope(plan, {
      ...planUsage,
      rewriteReasons: planCorrectionReasons,
      repairScope: planCorrectionReasons.length ? "word" : "none",
      finalRewriteCandidate: planCorrectionReasons.length > 0,
    });
  }

  let raw: Record<string, unknown> = {};
  const malformedResponseCanonRecoveryApplied = false;
  let parsed: Omit<EngineTurnResponse, "mode" | "usage">;
  if (liveRuntime?.phase === "finalize") {
    try {
      parsed = normalizeModelAuthoredTurn(
        liveRuntime.turn as unknown as ModelAuthoredTurn,
      );
    } catch {
      throw new SimulationRouteError(
        422,
        "LUNA_RESPONSE_REJECTED",
        "실시간 본문의 최종 JSON이 손상되어 이번 턴을 저장하지 않았습니다.",
      );
    }
  } else {
    raw = await requestOpenAI(dynamicPrompt, "draft");
    try {
      parsed = parseTurn(raw);
    } catch {
      try {
        const repairedRaw = await requestOpenAI(
        `[Relay Nexus v31 구조화 응답 복구]
현재: ${request.state.time} · ${request.state.location}
사용자 입력: ${request.advanceMode === "canonical" ? "정사대로 자동 진행" : request.userText}
활성 사건: ${nexusActiveEvent?.id ?? "없음"} / ${nexusActiveEvent?.name ?? "자유 장면"}
선언 순서 계약:
${narrativeSceneContractPrompt(narrativeSceneContract)}

직전 응답의 JSON이 잘렸거나 닫히지 않았다. 설명하지 말고 같은 장면을 v31 JSON 객체 하나로 처음부터 다시 출력한다. narration은 650~1000자, 3~5문단으로 쓰고 blocks는 출력하지 않는다. dialogueAnnotations, statePatch의 모든 필수 키(sessionCanonUpdates 포함), recommendations 3개, image, characterVisuals, agencyAudit, claudeSignals를 빠짐없이 넣는다. 코드펜스와 JSON 바깥 문장은 금지한다.`,
        "format_repair",
        ["구조화 JSON 파싱 실패"],
      );
        raw = repairedRaw;
        parsed = parseTurn(repairedRaw);
      } catch {
        throw new SimulationRouteError(
          422,
          "LUNA_RESPONSE_REJECTED",
          "Luna의 구조화 응답이 두 번 연속 손상되어 이번 턴을 저장하지 않았습니다. 입력과 세계 상태는 그대로 보존했습니다. 같은 입력으로 다시 시도해 주세요.",
        );
      }
    }
  }
  const disclosureLeaks = (turn: Omit<EngineTurnResponse, "mode" | "usage">) => {
    const newlyAcquired = (turn.statePatch.inventoryAdd ?? [])
      .map((item) => item.normalize("NFKC").replace(/\s+/g, ""));
    return findUnobservedExactTerms(
      publicTurnText(turn),
      verifiedPreTurnObservation,
      restrictedBodyTerms.filter(
        (term) =>
          !newlyAcquired.includes(
            term.normalize("NFKC").replace(/\s+/g, ""),
          ),
      ),
    );
  };
  const identityLeaks = (turn: Omit<EngineTurnResponse, "mode" | "usage">) =>
    [
      ...findUnobservedExactTerms(
        publicTurnText(turn),
        verifiedPreTurnObservation,
        protectedIdentityTerms,
      ),
      ...(!saberClassObservedBeforeTurn &&
      containsSaberClassTerm(publicTurnText(turn)) &&
      !firstSaberClassUseIsExplicitReveal(turn)
        ? SABER_CLASS_TERMS.filter((term) =>
            containsDisclosureTerm(publicTurnText(turn), term)
          )
        : []),
    ];
  const forcedClosureViolations = (
    turn: Omit<EngineTurnResponse, "mode" | "usage">,
  ) => forcedClaudeClosureViolations({
    turn,
    activeEvent: nexusActiveEvent,
    ledger: claudeRuntime,
    publicText: publicTurnText(turn),
    inventoryAfter: [...new Set([
      ...request.state.inventory,
      ...(turn.statePatch.inventoryAdd ?? []),
      ...storyDrive.reconciledInventoryAdds,
    ])],
  });
  let selectedDisclosureLeaks = disclosureLeaks(parsed);
  let selectedIdentityLeaks = identityLeaks(parsed);
  let selectedRequiredContinuityMissing = missingRequiredContinuityItems(
    parsed,
    requiredContinuity,
  );
  let selectedRequiredEventRerouteMissing = !requiredEventRerouteSatisfied(
    parsed,
    requiredEventReroute,
  );
  let selectedNarrativeControlLeaks = narrativeControlLeaks(parsed);
  let selectedFutureEventLeaks = hiddenFutureEventLeaks(
    parsed,
    storyDrive,
    request.pack,
    { allowNextEventOpening: allowCanonicalHandoffOpening },
  );
  let selectedClaudeSignalViolations = claudeSignalViolations({
    turn: parsed,
    activeEvent: nexusActiveEvent,
    ledger: claudeRuntime,
    expectedDerailment: explicitDerailmentTurn,
  });
  let selectedForcedClosureViolations = forcedClosureViolations(parsed);
  const firstMomentumAssessment = assessGeneratedMomentum({
    state: request.state,
    recentTurns: request.recentTurns,
    momentum,
    turn: parsed,
  });
  const firstSemanticAssessment = assessNarrativeSemantics(
    request,
    storyDrive,
    parsed,
    scenePacing,
  );
  const firstStoryDriveAssessment = mergeSemanticStoryAssessment(assessStoryDrive({
    state: request.state,
    drive: storyDrive,
    turn: parsed,
  }), firstSemanticAssessment, storyDrive);
  const firstSceneFocusAssessment = assessSceneFocus({
    pack: request.pack,
    state: request.state,
    focus: sceneFocus,
    turn: parsed,
  });
  const firstServantBondAssessment = assessServantBond({
    direction: servantBond,
    turn: parsed,
  });
  const firstLocationContinuityAssessment = assessLocationContinuity(
    request,
    storyDrive,
    parsed,
  );
  let selectedMomentumAssessment = firstMomentumAssessment;
  let selectedStoryDriveAssessment = firstStoryDriveAssessment;
  let selectedSceneFocusAssessment = firstSceneFocusAssessment;
  let selectedServantBondAssessment = firstServantBondAssessment;
  let selectedLocationContinuityAssessment =
    firstLocationContinuityAssessment;
  let selectedSemanticAssessment = firstSemanticAssessment;
  const observedQualityAdvisories = [
    firstMomentumAssessment.needsCorrection ? "장면 추진력 부족" : "",
    firstSceneFocusAssessment.needsCorrection ? "장면 초점 이탈" : "",
    firstServantBondAssessment.needsCorrection ? "인물 관계 연속성" : "",
    firstSemanticAssessment.available && !firstSemanticAssessment.meaningfulBeat
      ? "의미 있는 변화 부족"
      : "",
    firstSemanticAssessment.available && !firstSemanticAssessment.recommendationsGrounded
      ? "추천 행동 근거 부족"
      : "",
    selectedRequiredContinuityMissing.length ? "필수 요소가 현재 비트에 남아 있음" : "",
    selectedRequiredEventRerouteMissing ? "활성 사건이 현재 비트에서 계속 진행 중" : "",
    firstLocationContinuityAssessment.needsCorrection
      ? "장소 전환을 작가가 이동 완성 또는 이동 번복으로 재구성해야 함"
      : "",
    !finalBeatConvergenceTurn && parsed.agencyAudit.playerActionInvented
      ? "탐색 비트 플레이어 주권 권고"
      : "",
    !finalBeatConvergenceTurn && firstStoryDriveAssessment.prematureProgression
      ? "탐색 비트 사건 경계 권고"
      : "",
    !finalBeatConvergenceTurn && firstSemanticAssessment.available &&
        (!firstSemanticAssessment.inputHandled ||
          !firstSemanticAssessment.chronologyConsistent)
      ? "탐색 비트 입력·시간 인과 권고"
      : "",
  ].filter((reason): reason is string => Boolean(reason));
  const semanticHardFailure = firstSemanticAssessment.available &&
    !firstSemanticAssessment.chronologyConsistent;
  const observedHardErrorReasons = [
    selectedDisclosureLeaks.length ? "미공개 소품 누설" : "",
    selectedIdentityLeaks.length ? "미공개 정체 누설" : "",
    selectedFutureEventLeaks.length ? "미공개 미래 사건 누설" : "",
    selectedNarrativeControlLeaks.length ? "내부 제어문 노출" : "",
    selectedRequiredEventRerouteMissing ? "필수 사건 정사 흡수 누락" : "",
    ...(finalBeatConvergenceTurn
      ? [
          parsed.agencyAudit.playerActionInvented ? "플레이어 주권 위반" : "",
          firstStoryDriveAssessment.prematureProgression ? "사건 진행 경계 위반" : "",
          semanticHardFailure ? "입력 결과·인과 강제 오류" : "",
        ]
      : []),
    // claudeSignals/statePatch/recommendations 같은 부속 장부 불일치는
    // 완성된 narration을 다시 쓰게 하지 않는다. 서버 권위 판정과
    // 최종 정제 단계가 본문에서 관측되는 사실만 남긴다.
  ].filter((reason): reason is string => Boolean(reason));
  if (
    observedHardErrorReasons.length === 0 &&
    selectedClaudeSignalViolations.length > 0 &&
    parsed.claudeSignals
  ) {
    const sidecarRepairStartedAt = Date.now();
    // Sidecar-only disagreement: preserve the accepted prose and choose the
    // conservative ledger state. The authoritative server adjudicator may
    // advance it later only when the narration itself proves the contract.
    parsed = {
      ...parsed,
      claudeSignals: {
        ...parsed.claudeSignals,
        sceneTime: parsed.statePatch.time,
        location: parsed.statePatch.location,
        beatAdvanced: finalBeatConvergenceTurn
          ? false
          : Boolean(
              parsed.claudeSignals.beatAdvanced ||
              parsed.claudeSignals.eventResolved
            ),
        eventResolved: false,
        resolutionSummary: "",
      },
    };
    selectedClaudeSignalViolations = [];
    localRepairs.push({
      ruleId: "claude-sidecar-conservative-sync",
      repairScope: "sidecar",
      reasons: ["부속 장부 불일치"],
      durationMs: Math.max(0, Date.now() - sidecarRepairStartedAt),
      success: true,
    });
  }
  // 장소 불연속은 더 이상 폐기 가능한 강제 오류가 아니다. 다만 초안을
  // 그대로 내보내지는 않고, 같은 작가가 이동을 완성하거나 시도 후
  // 번복하도록 장면 재구성 대상으로 유지한다.
  let pendingHardErrorReasons = [
    ...observedHardErrorReasons,
    ...(finalBeatConvergenceTurn && firstLocationContinuityAssessment.needsCorrection
      ? ["복구 가능한 장소 전환"]
      : []),
  ];
  const disclosureOnlyReasons = new Set([
    "미공개 소품 누설",
    "미공개 정체 누설",
  ]);
  if (
    !liveFinalize &&
    pendingHardErrorReasons.length > 0 &&
    pendingHardErrorReasons.every((reason) => disclosureOnlyReasons.has(reason)) &&
    !storyDrive.requireMilestoneThisTurn &&
    !requiredContinuity.active
  ) {
    const localRepairStartedAt = Date.now();
    const localRepairReasons = [...pendingHardErrorReasons];
    parsed = redactProtectedPublicTerms(
      parsed,
      selectedDisclosureLeaks,
      selectedIdentityLeaks,
    );
    selectedDisclosureLeaks = disclosureLeaks(parsed);
    selectedIdentityLeaks = identityLeaks(parsed);
    const success =
      selectedDisclosureLeaks.length === 0 && selectedIdentityLeaks.length === 0;
    localRepairs.push({
      ruleId: "protected-public-term-redaction",
      repairScope: "word",
      reasons: localRepairReasons,
      durationMs: Math.max(0, Date.now() - localRepairStartedAt),
      success,
    });
    if (success) pendingHardErrorReasons = [];
  }
  if (!liveFinalize && pendingHardErrorReasons.length > 0) {
    try {
      const disclosureCorrection = selectedDisclosureLeaks.length
        ? `\n[미공개 소품 누설 재작성 지시]\n첫 작성이 아직 본문에 등장하지 않은 소품(${selectedDisclosureLeaks.join(", ")})을 플레이어가 이미 알고 있거나 소지한 것처럼 사용했다. 해당 명칭과 그것을 전제로 한 행동을 이번 응답에서 제거한다. 현재 입력으로 실제 발견·전달되는 장면이라면 획득 과정을 먼저 관측 가능하게 서술하고 inventoryAdd에 같은 물품을 넣어야 하며, 그렇지 않으면 암시도 하지 않는다. 추천 행동에도 넣지 않는다.\n`
        : "";
      const identityCorrection = selectedIdentityLeaks.length
        ? `\n[미공개 정체·클래스 누설 재작성 지시]\n첫 작성이 아직 공개 조건을 충족하지 않은 명칭(${selectedIdentityLeaks.join(", ")})을 노출했다. 해당 명칭을 본문·대화 화자명·상태·기억·관계·추천 행동·이미지·characterVisuals에서 제거하고 ${SABER_PRE_REVEAL_ALIAS}처럼 지금 관측 가능한 외형 호칭으로 바꾼다. 클래스명을 처음 밝힐 서사적 순간이라면 작중 인물의 직접 발언 또는 관측 가능한 영기 판정을 narration에 먼저 명시하고, 그 공개 문장 앞의 화자명과 서술에는 클래스명을 쓰지 않는다. 소환과 첫 대면은 그대로 진행하되 진명과 역사적 정체는 밝히지 않는다.\n`
        : "";
      const futureEventCorrection = selectedFutureEventLeaks.length
        ? `\n[미공개 미래 사건 누설 재작성 지시]\n첫 작성이 아직 현재 장면에서 공개되지 않은 미래 사건(${selectedFutureEventLeaks.join(", ")})을 먼저 발생시키거나 추천했다. 해당 사건과 그 징후·결과를 본문·기억·상태·추천 행동·이미지에서 전부 제거하고, 현재 활성 사건과 사용자가 이미 관측한 정보만으로 장면을 다시 쓴다.\n`
        : "";
      const requiredContinuityCorrection = selectedRequiredContinuityMissing.length
        ? `\n[필수 요소 즉시 복구 지시]\n사용자의 이탈 욕구·목적지·시간 계획은 본문에서 인정하고 가능한 준비·출발·부분 실행을 먼저 보여 준다. 그러나 현재 사건에 반드시 남아야 할 요소(${selectedRequiredContinuityMissing.join(", ")})가 첫 작성에서 소실됐다. 현재 동선에 구체적인 연락·마감·우연한 조우·환경 방해·안전상 우회가 끼어들어 잠시 순서를 바꾸게 한다. 원래 계획은 취소하지 말고 재개 가능한 상태로 남긴다. 이어 현재 사건의 행동을 실제로 수행해 이번 narration에서 발견·확인·획득 과정을 보여 주고 inventoryAdd에 같은 명칭을 모두 넣는다.\n`
        : "";
      const requiredEventRerouteCorrection = selectedRequiredEventRerouteMissing
        ? `\n[필수 사건 의도 보존형 정사 흡수 지시]\n사용자가 ${requiredEventReroute.eventName}의 장소·시간에서 이탈하려 했다. mode=${requiredEventReroute.mode}. 입력을 삭제하거나 거절하지 말고, 그 욕구와 목적지를 첫 인과로 인정한다. ${requiredEventReroute.policy} 활용 가능한 인과 재료: ${requiredEventReroute.alternatives.join(" / ")}. narration에는 반드시 ① 이탈 욕구와 목적지 ② 경로 확인·준비·출발·부분 이동 중 실제 실행한 행동 ③ 현재 동선에 필수 사건이 끼어드는 구체적 외부 원인 ④ 현재 비트의 실제 행동과 관측 가능한 반응 ⑤ 원래 계획이 취소되지 않고 보류됐음을 순서대로 쓴다. '생각을 접었다'만으로 전환하면 실패다. 아직 실행되지 않은 장시간 종료 시각은 적용하지 않는다. ${requiredEventReroute.resolveCurrentEvent ? "마지막 비트이므로 필수 물품의 발견·획득 과정과 종결 계약을 모두 성립시키고 eventResolved=true로 닫는다." : `마지막 비트 전이므로 현재 비트 신호(${requiredEventReroute.currentBeatSignals.join(" / ") || "현재 사건의 다음 행동과 반응"})만 성립시키고 eventResolved=false로 둔다.`} 다음 사건은 쓰지 않는다.\n`
        : "";
      const locationContinuityCorrection = buildLocationContinuityCorrection(
        firstLocationContinuityAssessment,
      );
      const narrativeControlCorrection = selectedNarrativeControlLeaks.length
        ? `\n[내부 제어문 누출 재작성 지시]\n첫 작성의 소설 본문에 내부 진행 문구(${selectedNarrativeControlLeaks.join(", ")})가 노출됐다. 해당 응답은 저장하지 않는다. 메타 용어를 전부 제거하고 현재 장소에서 관측 가능한 인물·환경의 행동으로 장면 전체를 다시 쓴다.\n`
        : "";
      const claudeSignalCorrection = selectedClaudeSignalViolations.length
        ? `\n[Claude HTML 출력 계약 재작성 지시]\n첫 작성은 Claude 결정적 런타임 계약을 위반했다: ${selectedClaudeSignalViolations.join(" / ")}. narration 전체를 다시 쓴 뒤 claudeSignals를 실제 본문과 statePatch에 맞춰 다시 판정한다. 현재 비트가 실제 성립하지 않았으면 beatAdvanced=false, 활성 사건의 필수 계약과 마지막 Compound 비트가 모두 성립하지 않았으면 eventResolved=false로 둔다.\n`
        : "";
      const forcedClosureCorrection = selectedForcedClosureViolations.length
        ? `\n[마지막 비트 종결 지시]\n현재 사건의 마지막 비트이므로 더 유보할 수 없다: ${selectedForcedClosureViolations.join(" / ")}. 현재 시간창·장소·이동 가능 시간과 등장인물의 동기를 지키면서 사용자 입력의 직접 결과를 먼저 보존한다. 이어 NPC의 결단·퇴각·체포·전달·확인 또는 환경과 물리적 결과 같은 작중 원인으로 남은 필수 결과와 완료 신호를 narration에 직접 성립시킨다. 같은 위협을 다시 세우거나 새 의문만 추가하지 않는다. 현재 사건만 eventResolved=true로 닫고 resolutionSummary에 구체적인 서사 결과를 쓴다. 다음 사건은 시작하지 않는다.\n`
        : "";
      const auditRewriteReasons = pendingHardErrorReasons;
      const correctedRaw = await requestOpenAI(
        conciseRevisionPrompt(
          parsed,
          auditRewriteReasons,
          `${
            firstStoryDriveAssessment.prematureProgression
              ? buildStoryDriveCorrection(storyDrive, firstStoryDriveAssessment)
              : ""
          }${
            semanticHardFailure
              ? buildNarrativeSemanticCorrection(firstSemanticAssessment, scenePacing)
              : ""
          }${disclosureCorrection}${identityCorrection}${futureEventCorrection}${requiredContinuityCorrection}${requiredEventRerouteCorrection}${locationContinuityCorrection}${narrativeControlCorrection}${claudeSignalCorrection}${forcedClosureCorrection}`,
        ),
        "audit_rewrite",
        auditRewriteReasons,
      );
      const correctedParsed = parseTurn(correctedRaw);
      const correctedDisclosureLeaks = disclosureLeaks(correctedParsed);
      const correctedIdentityLeaks = identityLeaks(correctedParsed);
      const correctedFutureEventLeaks = hiddenFutureEventLeaks(
        correctedParsed,
        storyDrive,
        request.pack,
        { allowNextEventOpening: allowCanonicalHandoffOpening },
      );
      const correctedRequiredContinuityMissing = missingRequiredContinuityItems(
        correctedParsed,
        requiredContinuity,
      );
      const correctedRequiredEventRerouteMissing = !requiredEventRerouteSatisfied(
        correctedParsed,
        requiredEventReroute,
      );
      const correctedNarrativeControlLeaks = narrativeControlLeaks(correctedParsed);
      const correctedClaudeSignalViolations = claudeSignalViolations({
        turn: correctedParsed,
        activeEvent: nexusActiveEvent,
        ledger: claudeRuntime,
        expectedDerailment: explicitDerailmentTurn,
      });
      const correctedForcedClosureViolations = forcedClosureViolations(
        correctedParsed,
      );
      const correctedAssessment = assessGeneratedMomentum({
        state: request.state,
        recentTurns: request.recentTurns,
        momentum,
        turn: correctedParsed,
      });
      const correctedSemanticAssessment = assessNarrativeSemantics(
        request,
        storyDrive,
        correctedParsed,
        scenePacing,
      );
      const correctedStoryDriveAssessment = mergeSemanticStoryAssessment(assessStoryDrive({
        state: request.state,
        drive: storyDrive,
        turn: correctedParsed,
      }), correctedSemanticAssessment, storyDrive);
      const correctedSceneFocusAssessment = assessSceneFocus({
        pack: request.pack,
        state: request.state,
        focus: sceneFocus,
        turn: correctedParsed,
      });
      const correctedServantBondAssessment = assessServantBond({
        direction: servantBond,
        turn: correctedParsed,
      });
      const correctedLocationContinuityAssessment = assessLocationContinuity(
        request,
        storyDrive,
        correctedParsed,
      );
      const selectedSafetyFailures = selectedDisclosureLeaks.length +
        selectedIdentityLeaks.length + selectedFutureEventLeaks.length +
        selectedNarrativeControlLeaks.length + Number(selectedRequiredEventRerouteMissing) +
        (finalBeatConvergenceTurn
          ? Number(parsed.agencyAudit.playerActionInvented) +
            selectedClaudeSignalViolations.length +
            selectedForcedClosureViolations.length +
            selectedRequiredContinuityMissing.length +
            Number(selectedLocationContinuityAssessment.needsCorrection) +
            Number(selectedStoryDriveAssessment.prematureProgression) +
            Number(
              selectedSemanticAssessment.available &&
                (!selectedSemanticAssessment.inputHandled ||
                  !selectedSemanticAssessment.chronologyConsistent),
            )
          : 0);
      const correctedSafetyFailures = correctedDisclosureLeaks.length +
        correctedIdentityLeaks.length + correctedFutureEventLeaks.length +
        correctedNarrativeControlLeaks.length + Number(correctedRequiredEventRerouteMissing) +
        (finalBeatConvergenceTurn
          ? Number(correctedParsed.agencyAudit.playerActionInvented) +
            correctedClaudeSignalViolations.length +
            correctedForcedClosureViolations.length +
            correctedRequiredContinuityMissing.length +
            Number(correctedLocationContinuityAssessment.needsCorrection) +
            Number(correctedStoryDriveAssessment.prematureProgression) +
            Number(
              correctedSemanticAssessment.available &&
                (!correctedSemanticAssessment.inputHandled ||
                  !correctedSemanticAssessment.chronologyConsistent),
            )
          : 0);
      const selectedQualityFailures = finalBeatConvergenceTurn ? [
        selectedMomentumAssessment,
        selectedStoryDriveAssessment,
        selectedSceneFocusAssessment,
        selectedServantBondAssessment,
      ].filter((assessment) => assessment.needsCorrection).length : 0;
      const correctedQualityFailures = finalBeatConvergenceTurn ? [
        correctedAssessment,
        correctedStoryDriveAssessment,
        correctedSceneFocusAssessment,
        correctedServantBondAssessment,
      ].filter((assessment) => assessment.needsCorrection).length : 0;
      const correctedIsBetter = correctedSafetyFailures < selectedSafetyFailures ||
        (correctedSafetyFailures === selectedSafetyFailures &&
          correctedQualityFailures < selectedQualityFailures) ||
        (correctedSafetyFailures === selectedSafetyFailures &&
          correctedQualityFailures === selectedQualityFailures &&
          correctedAssessment.score > selectedMomentumAssessment.score);
      if (correctedIsBetter) {
        // 더 안전하고 더 나은 교정본만 채택한다. 교정본이 오히려 입력의
        // 욕구를 지웠다면 안전한 원본 조각을 남겨 아래 흡수 단계가 잇는다.
        raw = correctedRaw;
        parsed = correctedParsed;
        selectedDisclosureLeaks = correctedDisclosureLeaks;
        selectedIdentityLeaks = correctedIdentityLeaks;
        selectedFutureEventLeaks = correctedFutureEventLeaks;
        selectedRequiredContinuityMissing = correctedRequiredContinuityMissing;
        selectedRequiredEventRerouteMissing = correctedRequiredEventRerouteMissing;
        selectedNarrativeControlLeaks = correctedNarrativeControlLeaks;
        selectedClaudeSignalViolations = correctedClaudeSignalViolations;
        selectedForcedClosureViolations = correctedForcedClosureViolations;
        selectedMomentumAssessment = correctedAssessment;
        selectedStoryDriveAssessment = correctedStoryDriveAssessment;
        selectedSceneFocusAssessment = correctedSceneFocusAssessment;
        selectedServantBondAssessment = correctedServantBondAssessment;
        selectedLocationContinuityAssessment =
          correctedLocationContinuityAssessment;
        selectedSemanticAssessment = correctedSemanticAssessment;
      }
    } catch {
      // Upstream rewrite failures fall through to deterministic server
      // recovery. API authentication/rate-limit errors are raised by the
      // initial request, not by this narrative fallback path.
    }
  }

  if (
    selectedSemanticAssessment.available &&
    (!selectedSemanticAssessment.inputHandled ||
      !selectedSemanticAssessment.chronologyConsistent) &&
    canUseStandardRewrite()
  ) {
    try {
      const semanticRaw = await requestOpenAI(
        conciseRevisionPrompt(
          parsed,
          ["입력 결과·인과 강제 오류"],
          `${buildNarrativeSemanticCorrection(
            selectedSemanticAssessment,
            scenePacing,
          )}\n[최종 문맥 교정]\n- 사용자 입력의 실행 결과를 첫 인과로 쓰고 현재 장면의 의미 있는 변화까지만 전개한다.\n- 다음 필수 사건을 예고하거나 추천 행동에 가져오지 않는다.`,
        ),
        "semantic_rewrite",
        ["입력 결과·인과 강제 오류"],
      );
      const semanticParsed = parseTurn(semanticRaw);
      const semanticDisclosureLeaks = disclosureLeaks(semanticParsed);
      const semanticIdentityLeaks = identityLeaks(semanticParsed);
      const semanticRequiredMissing = missingRequiredContinuityItems(
        semanticParsed,
        requiredContinuity,
      );
      const semanticRerouteMissing = !requiredEventRerouteSatisfied(
        semanticParsed,
        requiredEventReroute,
      );
      const semanticNarrativeControlLeaks = narrativeControlLeaks(semanticParsed);
      const semanticAssessment = assessNarrativeSemantics(
        request,
        storyDrive,
        semanticParsed,
        scenePacing,
      );
      const semanticStoryAssessment = mergeSemanticStoryAssessment(
        assessStoryDrive({
          state: request.state,
          drive: storyDrive,
          turn: semanticParsed,
        }),
        semanticAssessment,
        storyDrive,
      );
      const semanticLocationAssessment = assessLocationContinuity(
        request,
        storyDrive,
        semanticParsed,
      );
      if (
        !semanticParsed.agencyAudit.playerActionInvented &&
        !semanticStoryAssessment.prematureProgression &&
        !semanticLocationAssessment.needsCorrection &&
        semanticDisclosureLeaks.length === 0 &&
        semanticIdentityLeaks.length === 0 &&
        semanticNarrativeControlLeaks.length === 0 &&
        semanticRequiredMissing.length === 0 &&
        !semanticRerouteMissing
      ) {
        // 마지막 문맥 전용 재작성은 비공개 정보·장소·사건 순서 같은
        // 강제 안전 조건이 맞으면 후보로 채택한다. narrativeAudit의
        // 자기평가가 지나치게 보수적인 경우까지 작품 진행을 막지 않는다.
        raw = semanticRaw;
        parsed = semanticParsed;
        selectedDisclosureLeaks = semanticDisclosureLeaks;
        selectedIdentityLeaks = semanticIdentityLeaks;
        selectedRequiredContinuityMissing = semanticRequiredMissing;
        selectedRequiredEventRerouteMissing = semanticRerouteMissing;
        selectedNarrativeControlLeaks = semanticNarrativeControlLeaks;
        selectedSemanticAssessment = semanticAssessment;
        selectedStoryDriveAssessment = semanticStoryAssessment;
        selectedLocationContinuityAssessment = semanticLocationAssessment;
        selectedMomentumAssessment = assessGeneratedMomentum({
          state: request.state,
          recentTurns: request.recentTurns,
          momentum,
          turn: semanticParsed,
        });
        selectedSceneFocusAssessment = assessSceneFocus({
          pack: request.pack,
          state: request.state,
          focus: sceneFocus,
          turn: semanticParsed,
        });
        selectedServantBondAssessment = assessServantBond({
          direction: servantBond,
          turn: semanticParsed,
        });
      } else {
        // 강제 오류가 더 늘어난 교정본은 버리고 원본을 유지한다.
      }
    } catch {
      // 짧은 교정 호출이 실패하면 원본을 유지하고 서버 안전망으로 진행한다.
    }
  }

  if (
    selectedStoryDriveAssessment.prematureProgression &&
    canUseStandardRewrite()
  ) {
    try {
      const continuityRaw = await requestOpenAI(
        conciseRevisionPrompt(
          parsed,
          ["필수 사건 순서 위반"],
          `${buildStoryDriveCorrection(
            storyDrive,
            selectedStoryDriveAssessment,
          )}\n[사건 순서 최종 복구]\n- 현재 허용 사건만 다시 쓰고 금지된 과거·미래 사건의 재연·인물·추천을 제거한다.\n- 완료한 과거 시각·장소로 돌아가지 않으며 다음 사건의 첫 문장도 시작하지 않는다.\n- 사용자 입력은 현재 사건 안의 NPC·환경 반응으로 보존한다.`,
        ),
        "continuity_rewrite",
        ["필수 사건 순서 위반"],
      );
      const continuityParsed = parseTurn(continuityRaw);
      const continuityDisclosureLeaks = disclosureLeaks(continuityParsed);
      const continuityIdentityLeaks = identityLeaks(continuityParsed);
      const continuityRequiredMissing = missingRequiredContinuityItems(
        continuityParsed,
        requiredContinuity,
      );
      const continuityRequiredEventRerouteMissing = !requiredEventRerouteSatisfied(
        continuityParsed,
        requiredEventReroute,
      );
      const continuityNarrativeControlLeaks = narrativeControlLeaks(continuityParsed);
      const continuityMomentumAssessment = assessGeneratedMomentum({
        state: request.state,
        recentTurns: request.recentTurns,
        momentum,
        turn: continuityParsed,
      });
      const continuitySemanticAssessment = assessNarrativeSemantics(
        request,
        storyDrive,
        continuityParsed,
        scenePacing,
      );
      const continuityStoryAssessment = mergeSemanticStoryAssessment(assessStoryDrive({
        state: request.state,
        drive: storyDrive,
        turn: continuityParsed,
      }), continuitySemanticAssessment, storyDrive);
      const continuitySceneAssessment = assessSceneFocus({
        pack: request.pack,
        state: request.state,
        focus: sceneFocus,
        turn: continuityParsed,
      });
      const continuityServantAssessment = assessServantBond({
        direction: servantBond,
        turn: continuityParsed,
      });
      const continuityLocationAssessment = assessLocationContinuity(
        request,
        storyDrive,
        continuityParsed,
      );
      if (
        !continuityParsed.agencyAudit.playerActionInvented &&
        !continuityStoryAssessment.prematureProgression &&
        (!continuitySemanticAssessment.available ||
          (continuitySemanticAssessment.inputHandled &&
            continuitySemanticAssessment.chronologyConsistent)) &&
        !continuityLocationAssessment.needsCorrection &&
        continuityDisclosureLeaks.length === 0 &&
        continuityIdentityLeaks.length === 0
        && continuityNarrativeControlLeaks.length === 0
      ) {
        raw = continuityRaw;
        parsed = continuityParsed;
        selectedDisclosureLeaks = continuityDisclosureLeaks;
        selectedIdentityLeaks = continuityIdentityLeaks;
        selectedRequiredContinuityMissing = continuityRequiredMissing;
        selectedRequiredEventRerouteMissing = continuityRequiredEventRerouteMissing;
        selectedNarrativeControlLeaks = continuityNarrativeControlLeaks;
        selectedMomentumAssessment = continuityMomentumAssessment;
        selectedStoryDriveAssessment = continuityStoryAssessment;
        selectedSceneFocusAssessment = continuitySceneAssessment;
        selectedServantBondAssessment = continuityServantAssessment;
        selectedLocationContinuityAssessment = continuityLocationAssessment;
        selectedSemanticAssessment = continuitySemanticAssessment;
      } else {
        selectedStoryDriveAssessment = {
          ...selectedStoryDriveAssessment,
          prematureProgression: true,
          needsCorrection: true,
        };
      }
    } catch {
      selectedStoryDriveAssessment = {
        ...selectedStoryDriveAssessment,
        prematureProgression: true,
        needsCorrection: true,
      };
    }
  }
  let serverCanonicalRecoveryApplied = false;
  const preserveUnresolvedEventCandidate = (
    turn: Omit<EngineTurnResponse, "mode" | "usage">,
    missingItems: string[] = [],
  ): Omit<EngineTurnResponse, "mode" | "usage"> => {
    const publicText = publicTurnText(turn);
    const missingKeys = new Set(missingItems.map(compactDisclosureTerm));
    const inventoryAdd = (turn.statePatch.inventoryAdd ?? []).filter((item) =>
      !missingKeys.has(compactDisclosureTerm(item)) ||
      containsDisclosureTerm(publicText, item)
    );
    return {
      ...turn,
      statePatch: {
        ...turn.statePatch,
        inventoryAdd,
      },
      narrativeAudit: turn.narrativeAudit
        ? {
            ...turn.narrativeAudit,
            routeEventStatus: storyDrive.routeLock.active ? "in_progress" : "not_started",
          }
        : turn.narrativeAudit,
      claudeSignals: turn.claudeSignals
        ? {
            ...turn.claudeSignals,
            eventResolved: false,
            resolutionSummary: "",
          }
        : turn.claudeSignals,
    };
  };
  // 서버는 정상 A/B 입력의 소설을 다시 쓰지 않는다. 모든 일반 문맥
  // 문제는 위의 모델 재작성 후보와 아래의 구조 정제기로 처리한다.
  // 결정적 정사 흡수는 실제 C형 이탈에서 현재 필수 사건 연결이 끝내
  // 성립하지 않은 경우에만 마지막 수단으로 사용한다.
  const needsServerCanonicalRecovery =
    !liveFinalize &&
    finalBeatConvergenceTurn &&
    explicitDerailmentTurn && selectedRequiredEventRerouteMissing;
  if (needsServerCanonicalRecovery) {
    parsed = preserveUnresolvedEventCandidate(
      parsed,
      selectedRequiredContinuityMissing,
    );
    selectedClaudeSignalViolations = [];
    localRepairs.push({
      ruleId: "required-event-remains-open",
      repairScope: "sidecar",
      reasons: ["활성 사건 미종결"],
      durationMs: 0,
      success: true,
    });
  }
  // 장소 연결은 서버가 정형 문장으로 대신 쓰지 않는다. 교정본에도
  // 불연속이 남으면 아래 단일 작가 복구와 최종 전면 재구성이 맡는다.
  let locationContinuityRecoveryApplied = false;
  let requiredContinuityRecoveryApplied = false;
  if (selectedRequiredContinuityMissing.length > 0) {
    parsed = preserveUnresolvedEventCandidate(
      parsed,
      selectedRequiredContinuityMissing,
    );
    localRepairs.push({
      ruleId: "required-items-remain-pending",
      repairScope: "sidecar",
      reasons: ["필수 요소 미성립"],
      durationMs: 0,
      success: true,
    });
  }
  let requiredEventRerouteRecoveryApplied = false;
  if (selectedRequiredEventRerouteMissing) {
    parsed = preserveUnresolvedEventCandidate(
      parsed,
      selectedRequiredContinuityMissing,
    );
  }
  if (
    !liveFinalize &&
    (selectedDisclosureLeaks.length > 0 || selectedIdentityLeaks.length > 0)
  ) {
    parsed = redactProtectedPublicTerms(
      parsed,
      selectedDisclosureLeaks,
      selectedIdentityLeaks,
    );
    selectedDisclosureLeaks = disclosureLeaks(parsed);
    selectedIdentityLeaks = identityLeaks(parsed);
  }
  if (
    !liveFinalize &&
    (selectedDisclosureLeaks.length > 0 || selectedIdentityLeaks.length > 0)
  ) {
    parsed = recoverRejectedTurnIntoCanon(parsed, request, storyDrive);
    const fallbackDisclosureLeaks = disclosureLeaks(parsed);
    const fallbackIdentityLeaks = identityLeaks(parsed);
    if (fallbackDisclosureLeaks.length || fallbackIdentityLeaks.length) {
      parsed = redactProtectedPublicTerms(
        parsed,
        fallbackDisclosureLeaks,
        fallbackIdentityLeaks,
      );
    }
    selectedDisclosureLeaks = [];
    selectedIdentityLeaks = [];
    selectedRequiredEventRerouteMissing = false;
    selectedLocationContinuityAssessment = {
      ...assessLocationContinuity(request, storyDrive, parsed),
      needsCorrection: false,
      reason: "서버 정사 흡수로 장소 연속성을 복구함",
    };
    selectedSemanticAssessment = {
      available: true,
      inputHandled: true,
      meaningfulBeat: true,
      routeEventCompleted: storyDrive.routeLock.active,
      chronologyConsistent: true,
      recommendationsGrounded: true,
      needsCorrection: false,
      reasons: [],
    };
    serverCanonicalRecoveryApplied = true;
  }
  const usableDerailmentTurn = explicitDerailmentTurn &&
    !selectedRequiredEventRerouteMissing &&
    selectedSemanticAssessment.inputHandled &&
    selectedSemanticAssessment.meaningfulBeat &&
    selectedSemanticAssessment.chronologyConsistent &&
    !selectedLocationContinuityAssessment.needsCorrection &&
    !selectedStoryDriveAssessment.prematureProgression &&
    selectedDisclosureLeaks.length === 0 &&
    selectedIdentityLeaks.length === 0 &&
    selectedNarrativeControlLeaks.length === 0;
  if (usableDerailmentTurn && selectedSemanticAssessment.needsCorrection) {
    // 추천문이나 모델 자기평가 같은 비치명 품질 항목은 이후 정제 단계가
    // 고친다. 욕구 인정·정사 흡수·시간·장소·사건 경계가 맞는 턴을
    // 통째로 롤백하지 않는다.
    selectedSemanticAssessment = {
      ...selectedSemanticAssessment,
      recommendationsGrounded: true,
      needsCorrection: false,
      reasons: [],
    };
  }
  if (
    explicitDerailmentTurn &&
    selectedSemanticAssessment.available &&
    (!selectedSemanticAssessment.inputHandled ||
      !selectedSemanticAssessment.chronologyConsistent)
  ) {
    parsed = preserveUnresolvedEventCandidate(
      parsed,
      selectedRequiredContinuityMissing,
    );
  }
  let requiredEncounterLocationBridgeApplied = false;
  if (
    !liveFinalize &&
    finalBeatConvergenceTurn &&
    requiredEncounterLocationBridge &&
    !narrativeSceneContract.destinationEncounter
  ) {
    parsed = recoverLocationContinuity(parsed, request, storyDrive);
    selectedSemanticAssessment = {
      available: true,
      inputHandled: true,
      meaningfulBeat: true,
      routeEventCompleted: false,
      chronologyConsistent: true,
      recommendationsGrounded: true,
      needsCorrection: false,
      reasons: [],
    };
    selectedStoryDriveAssessment = {
      ...assessStoryDrive({
        state: request.state,
        drive: storyDrive,
        turn: parsed,
      }),
      routeStepCompleted: false,
      milestoneTriggered: false,
      needsCorrection: false,
      reasons: [],
    };
    selectedLocationContinuityAssessment = assessLocationContinuity(
      request,
      storyDrive,
      parsed,
    );
    requiredEncounterLocationBridgeApplied = true;
  }
  let directInputRecoveryApplied = false;
  const finalIntent = deriveClaudeTurnIntent(
    request.userText,
    nexusActiveEvent,
    request.state.time,
  );
  const finalOverreachIntent = derivePlayerOverreachIntent(request.userText);
  const finalSpeechIntent = inputContainsSpeech(request.userText);
  const finalSceneFact = deriveSceneFactContract(request.userText);
  const directInputNeedsRecovery =
    !liveFinalize &&
    finalBeatConvergenceTurn &&
    !explicitDerailmentTurn &&
    request.advanceMode !== "canonical" &&
    (
      selectedLocationContinuityAssessment.needsCorrection ||
      (finalOverreachIntent.active &&
        !overreachOutcomeVisibleInTurn(parsed, finalOverreachIntent)) ||
      (inputRequiresDirectResult(request.userText, finalIntent) &&
        !inputOutcomeVisibleInTurn(request, parsed, finalIntent))
    );
  if (directInputNeedsRecovery) {
    let singleAuthorRescueApplied = false;
    if (upstreamRequestCount < MAX_UPSTREAM_REQUESTS_PER_TURN - 1) {
      try {
        const rescueReason = selectedLocationContinuityAssessment.needsCorrection
          ? "장소·이동 연속성"
          : finalOverreachIntent.active
            ? "D형 시도·반응·대가 누락"
            : finalSpeechIntent
              ? "인사·질문·부탁과 상대의 실제 반응 누락"
            : "플레이어 sceneFact의 도구·대상·행동·즉시 결과 누락";
        const rescueRaw = await requestOpenAI(
          conciseRevisionPrompt(
            parsed,
            [rescueReason],
            buildDirectExecutionRescuePrompt(finalSceneFact),
          ),
          "narrative_rescue",
          [rescueReason],
        );
        const rescueParsed = parseTurn(rescueRaw);
        const rescueSemantic = assessNarrativeSemantics(
          request,
          storyDrive,
          rescueParsed,
          scenePacing,
        );
        const rescueStory = mergeSemanticStoryAssessment(
          assessStoryDrive({
            state: request.state,
            drive: storyDrive,
            turn: rescueParsed,
          }),
          rescueSemantic,
          storyDrive,
        );
        const rescueLocation = assessLocationContinuity(
          request,
          storyDrive,
          rescueParsed,
        );
        const rescueDisclosure = disclosureLeaks(rescueParsed);
        const rescueIdentity = identityLeaks(rescueParsed);
        const rescueControl = narrativeControlLeaks(rescueParsed);
        const rescueRequired = missingRequiredContinuityItems(
          rescueParsed,
          requiredContinuity,
        );
        const rescueRerouteMissing = !requiredEventRerouteSatisfied(
          rescueParsed,
          requiredEventReroute,
        );
        const rescueSignals = claudeSignalViolations({
          turn: rescueParsed,
          activeEvent: nexusActiveEvent,
          ledger: claudeRuntime,
          expectedDerailment: explicitDerailmentTurn,
        });
        const directResultVisible = finalOverreachIntent.active
          ? overreachOutcomeVisibleInTurn(rescueParsed, finalOverreachIntent)
          : inputOutcomeVisibleInTurn(request, rescueParsed, finalIntent);
        if (
          directResultVisible &&
          !rescueStory.prematureProgression &&
          !rescueLocation.needsCorrection &&
          rescueDisclosure.length === 0 &&
          rescueIdentity.length === 0 &&
          rescueControl.length === 0
        ) {
          parsed = rescueSignals.length > 0 && rescueParsed.claudeSignals
            ? {
                ...rescueParsed,
                claudeSignals: {
                  ...rescueParsed.claudeSignals,
                  beatAdvanced: false,
                  eventResolved: false,
                  resolutionSummary: "",
                },
              }
            : rescueParsed;
          selectedSemanticAssessment = rescueSemantic;
          selectedStoryDriveAssessment = rescueStory;
          selectedLocationContinuityAssessment = rescueLocation;
          selectedDisclosureLeaks = rescueDisclosure;
          selectedIdentityLeaks = rescueIdentity;
          selectedNarrativeControlLeaks = rescueControl;
          selectedRequiredContinuityMissing = rescueRequired;
          selectedRequiredEventRerouteMissing = rescueRerouteMissing;
          selectedClaudeSignalViolations = [];
          selectedMomentumAssessment = assessGeneratedMomentum({
            state: request.state,
            recentTurns: request.recentTurns,
            momentum,
            turn: rescueParsed,
          });
          selectedSceneFocusAssessment = assessSceneFocus({
            pack: request.pack,
            state: request.state,
            focus: sceneFocus,
            turn: rescueParsed,
          });
          selectedServantBondAssessment = assessServantBond({
            direction: servantBond,
            turn: rescueParsed,
          });
          singleAuthorRescueApplied = true;
        }
      } catch {
        // The deterministic scene builder below is retained only for malformed
        // or repeatedly unsafe upstream responses.
      }
    }
    if (!singleAuthorRescueApplied) {
      // Preserve the model draft for the final writer pass. The retired
      // deterministic input-recovery narrator must not replace fiction.
      directInputRecoveryApplied = true;
    }
    selectedSemanticAssessment = assessNarrativeSemantics(
      request,
      storyDrive,
      parsed,
      scenePacing,
    );
    selectedStoryDriveAssessment = assessStoryDrive({
      state: request.state,
      drive: storyDrive,
      turn: parsed,
    });
    selectedLocationContinuityAssessment = assessLocationContinuity(
      request,
      storyDrive,
      parsed,
    );
    selectedDisclosureLeaks = disclosureLeaks(parsed);
    selectedIdentityLeaks = identityLeaks(parsed);
    selectedNarrativeControlLeaks = narrativeControlLeaks(parsed);
    selectedRequiredContinuityMissing = missingRequiredContinuityItems(
      parsed,
      requiredContinuity,
    );
    selectedRequiredEventRerouteMissing = !requiredEventRerouteSatisfied(
      parsed,
      requiredEventReroute,
    );
    selectedClaudeSignalViolations = claudeSignalViolations({
      turn: parsed,
      activeEvent: nexusActiveEvent,
      ledger: claudeRuntime,
      expectedDerailment: explicitDerailmentTurn,
    });
  }
  // Required contracts are writer goals and authoritative ledger checks, not
  // permission for the server to append generic prose. If the writer does not
  // finish the current beat, the event remains open and the next turn carries
  // stronger closure pressure.
  const requiredContractRepair = { turn: parsed, repaired: false };
  const canonicalSummoningRepair = finalBeatConvergenceTurn && !liveFinalize
    ? resolveWorkAdapter(request.pack)?.ensureCanonicalSummoningTurn(
        parsed,
        request.pack,
        request.state,
      ) ?? { turn: parsed, repaired: false }
    : { turn: parsed, repaired: false };
  parsed = canonicalSummoningRepair.turn;
  if (canonicalSummoningRepair.repaired) {
    parsed = { ...parsed, narrativeAudit: undefined };
    selectedSemanticAssessment = assessNarrativeSemantics(
      request,
      storyDrive,
      parsed,
      scenePacing,
    );
    selectedStoryDriveAssessment = assessStoryDrive({
      state: request.state,
      drive: storyDrive,
      turn: parsed,
    });
    selectedServantBondAssessment = assessServantBond({
      direction: servantBond,
      turn: parsed,
    });
  }
  if (
    !liveFinalize &&
    finalBeatConvergenceTurn &&
    finalOverreachIntent.active &&
    !overreachOutcomeVisibleInTurn(parsed, finalOverreachIntent)
  ) {
    // Contract/media repair runs after the first D-type guard. If that later
    // stage resolves an event without making the overreach cost its cause,
    // restore the authoritative attempt/reaction/cost scene and keep the event
    // open instead of allowing a disguised canon transition.
    directInputRecoveryApplied = true;
  }
  selectedNarrativeControlLeaks = narrativeControlLeaks(parsed);
  if (
    !liveFinalize &&
    finalBeatConvergenceTurn &&
    !explicitDerailmentTurn &&
    request.advanceMode !== "canonical" &&
    selectedNarrativeControlLeaks.length > 0 &&
    movementActionRequested(request.userText, finalIntent)
  ) {
    directInputRecoveryApplied = true;
  }
  if (
    !liveFinalize &&
    finalBeatConvergenceTurn &&
    explicitDerailmentTurn &&
    selectedNarrativeControlLeaks.length > 0
  ) {
    parsed = recoverRejectedTurnIntoCanon(parsed, request, storyDrive);
    selectedNarrativeControlLeaks = [];
    serverCanonicalRecoveryApplied = true;
  }
  if (
    !liveFinalize &&
    finalBeatConvergenceTurn &&
    explicitDerailmentTurn &&
    parsed.claudeSignals
  ) {
    parsed = {
      ...parsed,
      claudeSignals: {
        ...parsed.claudeSignals,
        inputMode: "advance",
        sceneTime: parsed.statePatch.time,
        location: parsed.statePatch.location,
      },
    };
  }
  selectedClaudeSignalViolations = claudeSignalViolations({
    turn: parsed,
    activeEvent: nexusActiveEvent,
    ledger: claudeRuntime,
    expectedDerailment: explicitDerailmentTurn,
  });
  if (
    !liveFinalize &&
    finalBeatConvergenceTurn &&
    explicitDerailmentTurn &&
    selectedClaudeSignalViolations.length > 0
  ) {
    parsed = recoverRejectedTurnIntoCanon(parsed, request, storyDrive);
    selectedClaudeSignalViolations = [];
    serverCanonicalRecoveryApplied = true;
  }
  if (
    !saberClassObservedBeforeTurn &&
    firstSaberClassUseIsExplicitReveal(parsed) &&
    !parsed.statePatch.memoryAdd.some((memory) =>
      saberClassWasExplicitlyObserved(memory)
    )
  ) {
    parsed = {
      ...parsed,
      statePatch: {
        ...parsed.statePatch,
        memoryAdd: [
          ...parsed.statePatch.memoryAdd,
          `${SABER_PRE_REVEAL_ALIAS}의 클래스가 세이버로 확인됐다.`,
        ],
      },
    };
  }
  if (
    !liveFinalize &&
    finalBeatConvergenceTurn &&
    explicitDerailmentTurn &&
    selectedStoryDriveAssessment.prematureProgression
  ) {
    parsed = recoverRejectedTurnIntoCanon(parsed, request, storyDrive);
    selectedStoryDriveAssessment = {
      ...selectedStoryDriveAssessment,
      prematureProgression: false,
      needsCorrection: false,
      reasons: [],
    };
    serverCanonicalRecoveryApplied = true;
  }
  const deterministicSceneRecoveryReasons = [
    serverCanonicalRecoveryApplied ? "서버 정사 흡수문 대체" : "",
    requiredEventRerouteRecoveryApplied ? "필수 사건 우회 정형문 대체" : "",
    locationContinuityRecoveryApplied ? "장소 연속성 정형문 대체" : "",
    requiredContinuityRecoveryApplied ? "필수 요소 정형문 대체" : "",
    requiredEncounterLocationBridgeApplied ? "필수 만남 위치 정형문 대체" : "",
    directInputRecoveryApplied ? "직접 입력 정형문 대체" : "",
    selectedLocationContinuityAssessment.needsCorrection
      ? "장소 전환을 이동 완성 또는 이동 번복으로 작가 재구성"
      : "",
    containsDeterministicRecoveryProse(parsed) ? "퇴역 정형 복구 문체 감지" : "",
  ].filter((reason): reason is string => Boolean(reason));
  if (
    !liveFinalize &&
    finalBeatConvergenceTurn &&
    deterministicSceneRecoveryReasons.length > 0
  ) {
    let regeneratedSceneAccepted = false;
    if (
      upstreamRequestCount <
        MAX_UPSTREAM_REQUESTS_PER_TURN - Number(forcedClosureTurn)
    ) {
      try {
        const regenerationRaw = await requestOpenAI(
          `${dynamicPrompt}\n\n[최종 소설 장면 전면 재구성]\n앞선 초안들이 장면 계약을 해결하지 못해 서버의 정형 복구문이 사용될 상황이었다. 정형 복구문은 독자에게 소설로 제공할 수 없으므로, 기존 초안과 문장 구조를 버리고 같은 사용자 입력에서 출발하는 장면을 처음부터 새로 설계한다.\n\n재구성 사유: ${deterministicSceneRecoveryReasons.join(" / ")}\n\n- 사용자 입력의 실제 시도와 현재 인물의 직접 반응을 첫 인과로 쓴다.\n- 기존 초안과 다른 구체적인 행동·대화·환경 반응을 선택해 장면 자체를 새로 구성한다.\n- 필수 사건이 필요하면 내부 규칙을 설명하지 말고 인물의 선택, 외부 연락, 우연한 조우, 물리적 방해처럼 작중 원인으로만 연결한다. 가능하면 현재 비트 안에서 사건을 종결한다.\n- 장소를 바꾼다면 현재 장소에서 출발해 이동 이유·경로 또는 수단·경과 시간·도착을 쓴다. 이동 연결이 부자연스러우면 이동 행동을 시작한 뒤 구체적인 작중 이유로 멈추거나 돌아와 현재 장소에서 사건을 계속하고 statePatch.location도 현재 장소로 유지한다.\n- '말뿐인 충동', '막 출발하려던 순간', '짧은 우회 끝에', '손에 잡히는 결과', '순서만 잠시 뒤로 밀렸다' 같은 정형 복구문과 메타 표현을 절대 사용하지 않는다.\n- 인사·질문·부탁은 상대가 듣고 성격·관계·일정에 따라 수락·거절·유보·역질문하는 실제 장면으로 쓴다.\n- 장소 이동이 없는 대화 입력을 이탈·우회·출발로 바꾸지 않는다.\n- 결과를 보고서처럼 요약하지 말고 한국어 장르소설의 하나의 narration으로 쓴다.\n- 같은 v31 JSON 스키마만 출력하고 blocks는 만들지 않는다.`,
          "scene_regeneration",
          deterministicSceneRecoveryReasons,
        );
        const regenerated = parseTurn(regenerationRaw);
        const regenerationDisclosure = disclosureLeaks(regenerated);
        const regenerationIdentity = identityLeaks(regenerated);
        const regenerationControl = narrativeControlLeaks(regenerated);
        const regenerationRequired = missingRequiredContinuityItems(
          regenerated,
          requiredContinuity,
        );
        const regenerationRerouteMissing = !requiredEventRerouteSatisfied(
          regenerated,
          requiredEventReroute,
        );
        const regenerationSemantic = assessNarrativeSemantics(
          request,
          storyDrive,
          regenerated,
          scenePacing,
        );
        const regenerationStory = mergeSemanticStoryAssessment(
          assessStoryDrive({
            state: request.state,
            drive: storyDrive,
            turn: regenerated,
          }),
          regenerationSemantic,
          storyDrive,
        );
        const regenerationLocation = assessLocationContinuity(
          request,
          storyDrive,
          regenerated,
        );
        const regenerationSignals = claudeSignalViolations({
          turn: regenerated,
          activeEvent: nexusActiveEvent,
          ledger: claudeRuntime,
          expectedDerailment: explicitDerailmentTurn,
        });
        const regenerationDirectResultVisible =
          request.advanceMode === "canonical" ||
          !inputRequiresDirectResult(request.userText, finalIntent)
            ? true
            : finalOverreachIntent.active
              ? overreachOutcomeVisibleInTurn(regenerated, finalOverreachIntent)
              : inputOutcomeVisibleInTurn(request, regenerated, finalIntent);
        const regenerationValid =
          !regenerated.agencyAudit.playerActionInvented &&
          regenerationDirectResultVisible &&
          (!regenerationSemantic.available ||
            (regenerationSemantic.inputHandled &&
              regenerationSemantic.chronologyConsistent)) &&
          !regenerationStory.prematureProgression &&
          regenerationDisclosure.length === 0 &&
          regenerationIdentity.length === 0 &&
          regenerationControl.length === 0 &&
          regenerationSignals.length === 0 &&
          !containsDeterministicRecoveryProse(regenerated);
        if (regenerationValid) {
          parsed = regenerationRequired.length > 0 || regenerationRerouteMissing
            ? preserveUnresolvedEventCandidate(regenerated, regenerationRequired)
            : regenerated;
          selectedDisclosureLeaks = regenerationDisclosure;
          selectedIdentityLeaks = regenerationIdentity;
          selectedNarrativeControlLeaks = regenerationControl;
          selectedRequiredContinuityMissing = regenerationRequired;
          selectedRequiredEventRerouteMissing = regenerationRerouteMissing;
          selectedSemanticAssessment = regenerationSemantic;
          selectedStoryDriveAssessment = regenerationStory;
          selectedLocationContinuityAssessment = regenerationLocation;
          selectedClaudeSignalViolations = regenerationSignals;
          selectedMomentumAssessment = assessGeneratedMomentum({
            state: request.state,
            recentTurns: request.recentTurns,
            momentum,
            turn: regenerated,
          });
          selectedSceneFocusAssessment = assessSceneFocus({
            pack: request.pack,
            state: request.state,
            focus: sceneFocus,
            turn: regenerated,
          });
          selectedServantBondAssessment = assessServantBond({
            direction: servantBond,
            turn: regenerated,
          });
          serverCanonicalRecoveryApplied = false;
          requiredEventRerouteRecoveryApplied = false;
          locationContinuityRecoveryApplied = false;
          requiredContinuityRecoveryApplied = false;
          requiredEncounterLocationBridgeApplied = false;
          directInputRecoveryApplied = false;
          if (regenerationLocation.needsCorrection) {
            localRepairs.push({
              ruleId: "location-continuity-advisory-accepted",
              repairScope: "sidecar",
              reasons: ["장소 전환은 작가 재구성 후 품질 권고로 유지"],
              durationMs: 0,
              success: true,
            });
          }
          regeneratedSceneAccepted = true;
        }
      } catch (error) {
        if (error instanceof SimulationRouteError && error.status !== 422) {
          throw error;
        }
      }
    }
    if (!regeneratedSceneAccepted) {
      parsed = preserveUnresolvedEventCandidate(
        parsed,
        selectedRequiredContinuityMissing,
      );
      serverCanonicalRecoveryApplied = false;
      requiredEventRerouteRecoveryApplied = false;
      locationContinuityRecoveryApplied = false;
      requiredContinuityRecoveryApplied = false;
      requiredEncounterLocationBridgeApplied = false;
      directInputRecoveryApplied = false;
      localRepairs.push({
        ruleId: "partial-scene-preserved-without-discard",
        repairScope: "sidecar",
        reasons: ["비공개 누설이 아닌 미완성 초안 보존"],
        durationMs: 0,
        success: true,
      });
      regeneratedSceneAccepted = true;
    }
  }
  if (forcedClosureTurn) parsed = confirmClaudeClosureFromEvidence({ turn: parsed, activeEvent: nexusActiveEvent, ledger: claudeRuntime, publicText: publicTurnText(parsed), inventoryAfter: [...new Set([...request.state.inventory, ...(parsed.statePatch.inventoryAdd ?? []), ...storyDrive.reconciledInventoryAdds])] });
  selectedForcedClosureViolations = forcedClosureViolations(parsed);
  if (
    !liveFinalize &&
    forcedClosureTurn &&
    selectedForcedClosureViolations.length > 0 &&
    upstreamRequestCount < MAX_UPSTREAM_REQUESTS_PER_TURN
  ) {
    observedHardErrorReasons.push("마지막 비트 강제 종결 실패");
    let closureParsed: Omit<EngineTurnResponse, "mode" | "usage">;
    try {
      const closureRaw = await requestOpenAI(
        conciseRevisionPrompt(
          parsed,
          ["마지막 비트 강제 종결 실패"],
          `[마지막 비트 종결 최종 게이트]\n현재 ${nexusActiveEvent?.name ?? "현재 사건"}의 마지막 비트다. 이번 응답은 같은 사건을 한 번 더 유보할 수 없다.\n- 현재 시간창 ${nexusActiveEvent?.timeWindow || request.state.time}과 장소 ${request.state.location}에서 실제 가능한 인과만 사용한다. 이동이 필요하면 수단과 경과 시간을 반영하고, 시간창 안에 불가능한 순간이동은 만들지 않는다.\n- 사용자 입력의 직접 결과를 첫 인과로 보존한다.\n- 플레이어의 새 행동·대사·감정을 만들지 않는다. NPC의 결단·퇴각·체포·전달·확인, 환경 변화, 물리적 결과 중 현재 인과에 맞는 수단으로 사건을 닫는다.\n- 필수 물품: ${nexusActiveEvent?.requiredItems || "없음"}\n- 필수 대사: ${nexusActiveEvent?.requiredDialogue || "없음"}\n- 완료 신호: ${nexusActiveEvent?.completionSignals || "현재 갈등의 관측 가능한 최종 결과"}\n- 같은 위협을 다시 등장시키거나 새 의문만 추가해 장면을 연장하지 않는다.\n- 현재 사건의 종결 근거를 narration에 직접 쓴 뒤 beatAdvanced=true, eventResolved=true, 구체적인 resolutionSummary를 출력한다. 다음 사건은 시작하지 않는다.`,
        ),
        "audit_rewrite",
        ["마지막 비트 강제 종결 실패"],
      );
      closureParsed = parseTurn(closureRaw);
      closureParsed = {
        ...closureParsed,
        claudeSignals: {
          ...closureParsed.claudeSignals!,
          beatAdvanced: true,
          eventResolved: true,
          resolutionSummary:
            (closureParsed.claudeSignals?.resolutionSummary?.trim().length ?? 0) >= 12
              ? closureParsed.claudeSignals?.resolutionSummary || ''
              : `${nexusActiveEvent?.name ?? "현재 사건"}의 종결을 시도했으나 남은 결과는 다음 사건의 인과로 이어진다.`,
        },
      };
    } catch (error) {
      if (error instanceof SimulationRouteError && error.status !== 422) {
        throw error;
      }
      throw new SimulationRouteError(
        422,
        "NARRATIVE_REWRITE_FAILED",
        "현재 사건은 반드시 종결되어야 하지만 작가의 최종 종결본이 손상되어 이번 턴을 저장하지 않았습니다. 같은 입력으로 다시 시도해 주세요.",
      );
    }

    const closureDisclosure = disclosureLeaks(closureParsed);
    const closureIdentity = identityLeaks(closureParsed);
    const closureControl = narrativeControlLeaks(closureParsed);
    const closureSemantic = assessNarrativeSemantics(
      request,
      storyDrive,
      closureParsed,
      scenePacing,
    );
    const closureStory = mergeSemanticStoryAssessment(
      assessStoryDrive({
        state: request.state,
        drive: storyDrive,
        turn: closureParsed,
      }),
      closureSemantic,
      storyDrive,
    );
    const closureLocation = assessLocationContinuity(
      request,
      storyDrive,
      closureParsed,
    );
    const closureForcedViolations = forcedClosureViolations(closureParsed);
    const closureValid =
      closureDisclosure.length === 0 &&
      closureIdentity.length === 0 &&
      closureControl.length === 0;
    if (!closureValid) {
      throw new SimulationRouteError(
        422,
        "NARRATIVE_REWRITE_FAILED",
        `마지막 비트 종결본에 비공개 정보가 남아 이번 초안을 저장하지 않았습니다: ${[
          ...closureDisclosure.map((term) => `미공개 소품 ${term}`),
          ...closureIdentity.map((term) => `미공개 정체 ${term}`),
          ...closureControl.map((term) => `내부 제어문 ${term}`),
        ].join(" / ") || "서사 안전 계약 위반"}`,
      );
    }

    parsed = closureParsed;
    selectedDisclosureLeaks = closureDisclosure;
    selectedIdentityLeaks = closureIdentity;
    selectedNarrativeControlLeaks = closureControl;
    selectedRequiredContinuityMissing = missingRequiredContinuityItems(
      closureParsed,
      requiredContinuity,
    );
    selectedRequiredEventRerouteMissing = !requiredEventRerouteSatisfied(
      closureParsed,
      requiredEventReroute,
    );
    selectedSemanticAssessment = closureSemantic;
    selectedStoryDriveAssessment = closureStory;
    selectedLocationContinuityAssessment = closureLocation;
    selectedClaudeSignalViolations = claudeSignalViolations({
      turn: closureParsed,
      activeEvent: nexusActiveEvent,
      ledger: claudeRuntime,
      expectedDerailment: explicitDerailmentTurn,
    });
    selectedForcedClosureViolations = closureForcedViolations;
    selectedMomentumAssessment = assessGeneratedMomentum({
      state: request.state,
      recentTurns: request.recentTurns,
      momentum,
      turn: closureParsed,
    });
    selectedSceneFocusAssessment = assessSceneFocus({
      pack: request.pack,
      state: request.state,
      focus: sceneFocus,
      turn: closureParsed,
    });
    selectedServantBondAssessment = assessServantBond({
      direction: servantBond,
      turn: closureParsed,
    });
    serverCanonicalRecoveryApplied = false;
    requiredEventRerouteRecoveryApplied = false;
    locationContinuityRecoveryApplied = false;
    requiredContinuityRecoveryApplied = false;
    requiredEncounterLocationBridgeApplied = false;
    directInputRecoveryApplied = false;
  }
  const recoveryReasons = [
    selectedMomentumAssessment.needsCorrection ? "장면 전개" : "",
    selectedStoryDriveAssessment.needsCorrection ? "메인 사건 연결" : "",
    selectedSceneFocusAssessment.needsCorrection ? "장면 주도권" : "",
    selectedServantBondAssessment.needsCorrection ? "서번트 상호작용" : "",
  ].filter(Boolean);
  const recoveryWarning = malformedResponseCanonRecoveryApplied
    ? "입력은 정상 접수했습니다. Luna의 구조화 응답이 손상되어, 사용자의 선택을 현재 사건·장소·시간축에 맞는 장면으로 다시 이어 썼습니다."
    : canonicalSummoningRepair.repaired
    ? resolveWorkAdapter(request.pack)?.canonicalSummoningRepairWarning ??
      "작품 어댑터의 소환 장면 필수 조건을 자동 복구했습니다."
    : requiredEncounterLocationBridgeApplied
    ? "입력한 준비와 이동을 실제 장면으로 반영하고, 필수 만남은 도착한 공개 동선의 인물 반응으로 자연스럽게 연결했습니다."
    : directInputRecoveryApplied
    ? "입력은 정상 접수했습니다. 모델 초안에서 누락된 실행 가능한 앞부분과 직접 결과를 선언 순서대로 복구하고, 세계 판정이 필요한 뒤쪽 행동만 현재 상태에 맞게 남겼습니다."
    : requiredContractRepair.repaired
    ? "패키지에 등록된 필수 사건의 소품·대사·전용 이미지 연결을 자동 복구했습니다."
    : locationContinuityRecoveryApplied
    ? "설명 없이 바뀐 장소를 제거하고 현재 위치에서 자연스럽게 이어지는 필수 사건으로 자동 복구했습니다."
    : requiredEventRerouteRecoveryApplied
    ? "사용자의 선택은 유지하면서 필수 사건의 인과를 다른 경로로 연결했습니다."
    : serverCanonicalRecoveryApplied
    ? "입력은 정상 접수했으며, 충돌한 부분만 현재 사건과 시간축에 맞게 고치고 사용자의 목적은 장면 안에 남겼습니다."
    : requiredContinuityRecoveryApplied
    ? "사용자의 입력을 유지하면서 소실될 수 없는 필수 요소를 별도 경로로 이어 붙였습니다."
    : recoveryReasons.length
    ? `입력을 버리지 않고 현재 사건 범위에서 ${recoveryReasons.join("·")}을 자동 보강해 이어갔습니다.`
    : undefined;
  let finalDisclosureLeaks = disclosureLeaks(parsed);
  let finalIdentityLeaks = identityLeaks(parsed);
  let finalFutureEventLeaks = hiddenFutureEventLeaks(
    parsed,
    storyDrive,
    request.pack,
    { allowNextEventOpening: allowCanonicalHandoffOpening },
  );
  let finalNarrativeControlLeaks = narrativeControlLeaks(parsed);
  if (liveFinalize && (
    finalDisclosureLeaks.length > 0 ||
    finalIdentityLeaks.length > 0 ||
    finalFutureEventLeaks.length > 0
  )) {
    const narrationOnly = parsed.blocks.map((block) =>
      `${block.speakerName ?? ""}\n${block.text}`
    ).join("\n");
    const leakingTerms = [
      ...finalDisclosureLeaks,
      ...finalIdentityLeaks,
      ...finalFutureEventLeaks,
    ];
    const sidecarOnly = leakingTerms.every((term) =>
      !containsDisclosureTerm(narrationOnly, term)
    );
    if (sidecarOnly) {
      const sidecarRepairStartedAt = Date.now();
      parsed = redactProtectedPublicTerms(
        parsed,
        finalDisclosureLeaks,
        finalIdentityLeaks,
        finalFutureEventLeaks,
      );
      finalDisclosureLeaks = disclosureLeaks(parsed);
      finalIdentityLeaks = identityLeaks(parsed);
      finalFutureEventLeaks = hiddenFutureEventLeaks(parsed, storyDrive, request.pack, {
        allowNextEventOpening: allowCanonicalHandoffOpening,
      });
      finalNarrativeControlLeaks = narrativeControlLeaks(parsed);
      localRepairs.push({
        ruleId: "live-protected-sidecar-redaction",
        repairScope: "sidecar",
        reasons: ["본문 밖 공개 장부의 비공개 명칭 제거"],
        durationMs: Math.max(0, Date.now() - sidecarRepairStartedAt),
        success:
          finalDisclosureLeaks.length === 0 &&
          finalIdentityLeaks.length === 0 &&
          finalFutureEventLeaks.length === 0,
      });
    }
  }
  if (liveFinalDisclosureBlocked({
    policy: liveFinalize ? liveRuntime.beatPolicy : undefined,
    identityLeakCount: finalIdentityLeaks.length,
    disclosureLeakCount: finalDisclosureLeaks.length,
    futureEventLeakCount: finalFutureEventLeaks.length,
    controlLeakCount: finalNarrativeControlLeaks.length,
  })) {
    const finalSafetyReason = finalFutureEventLeaks.length > 0
      ? `아직 시작하지 않은 다음 사건 ‘${finalFutureEventLeaks.join(" / ")}’의 진행이 최종 본문에 남았습니다.`
      : "비공개 정보가 최종 본문에 남았습니다.";
    throw new SimulationRouteError(
      422,
      "NARRATIVE_REWRITE_FAILED",
      `${finalSafetyReason} 이번 초안을 저장하지 않았습니다. 같은 입력으로 다시 시도해 주세요.`,
    );
  }
  const validMediaIds = new Set(
    (request.pack.mediaAssets ?? [])
      // A model-provided ID is never sufficient proof that a trigger fired.
      // Trigger CGs are re-attached below by trusted deterministic checks.
      .filter((asset) => !isTriggerBoundMediaAsset(asset))
      .map((asset) => asset.id),
  );
  const usedMediaIds = new Set<string>();
  const keepCanonAbsorptionActions = explicitDerailmentTurn &&
    (serverCanonicalRecoveryApplied || requiredEventRerouteRecoveryApplied);
  const keepAuthorizedPlayerActions = liveFinalize ||
    keepCanonAbsorptionActions ||
    directInputRecoveryApplied ||
    derivePlayerOverreachIntent(request.userText).active;
  const cleanBlocks = withIds(parsed.blocks)
    .filter((block) =>
      keepAuthorizedPlayerActions ||
      !isPlayerAgencyViolation(block, request.pack.player)
    )
    .map((block) => {
      const mediaAssetId = block.mediaAssetId?.trim() ?? "";
      if (
        !mediaAssetId ||
        !validMediaIds.has(mediaAssetId) ||
        usedMediaIds.has(mediaAssetId)
      ) {
        return { ...block, mediaAssetId: "" };
      }
      usedMediaIds.add(mediaAssetId);
      return { ...block, mediaAssetId };
    })
    .map((block) => {
      if (block.type !== "dialogue") return block;
      const character = resolveTrustedDialogueSpeaker(
        request,
        block.speakerId ?? "",
        block.speakerName ?? "",
      );
      const nextBlock = character
        ? { ...block, speakerId: character.id }
        : { ...block, speakerId: "" };
      const attachedAsset = request.pack.mediaAssets?.find(
        (asset) => asset.id === nextBlock.mediaAssetId,
      );
      if (
        attachedAsset?.kind === "character" &&
        (!character || attachedAsset.characterId !== character.id)
      ) {
        usedMediaIds.delete(attachedAsset.id);
        return { ...nextBlock, mediaAssetId: "" };
      }
      return nextBlock;
    });

  const turnKnownAliases = [...runtimeKnownCharacterAliases(request)];
  const rememberTurnAlias = (alias = "", characterId = "") => {
    const value = alias.trim();
    const id = characterId.trim();
    if (!value || !id) return;
    if (turnKnownAliases.some((entry) =>
      entry.alias === value && entry.characterId === id
    )) return;
    turnKnownAliases.push({ alias: value, characterId: id });
  };
  (parsed.characterVisuals ?? []).forEach((cue) => {
    const byId = resolveDeclaredCharacterAlias(request.pack, cue.characterId, "", turnKnownAliases);
    const byName = resolveDeclaredCharacterAlias(request.pack, "", cue.characterName, turnKnownAliases);
    const character = byName ?? byId;
    if (byId && byName && byId.id !== byName.id) return;
    if (!character) return;
    rememberTurnAlias(cue.characterId, character.id);
    if (byName?.id === character.id) {
      rememberTurnAlias(cue.characterName, character.id);
    }
  });
  cleanBlocks.forEach((block, index) => {
    const canonicalId = block.speakerId?.trim() ?? "";
    if (!canonicalId) return;
    const original = parsed.blocks.find((candidate) =>
      candidate.text === block.text &&
      candidate.speakerName === block.speakerName
    ) ?? parsed.blocks[index];
    rememberTurnAlias(original?.speakerId, canonicalId);
    rememberTurnAlias(original?.speakerName, canonicalId);
    rememberTurnAlias(block.speakerName, canonicalId);
  });
  const resolveTurnCharacterAlias = (
    rawId = "",
    rawName = "",
    hintText = "",
    preferredCharacterIds: string[] = [],
  ) => resolveVisibleCharacterAlias(request.pack, rawId, rawName, {
    hintText,
    preferredCharacterIds: [
      ...new Set([
        ...preferredCharacterIds,
        ...(request.state.encounteredCharacterIds ?? []),
        ...(request.state.characterVisuals ?? []).map((profile) => profile.characterId),
      ]),
    ],
    knownAliases: turnKnownAliases,
  });
  const canonicalTurnCharacterId = (rawId = "", hintText = "") =>
    resolveTurnCharacterAlias(rawId, rawId, hintText)?.id ?? rawId;
  if (parsed.claudeSignals) {
    parsed = {
      ...parsed,
      claudeSignals: {
        ...parsed.claudeSignals,
        appearing: [...new Set(parsed.claudeSignals.appearing.map((id) =>
          canonicalTurnCharacterId(id, parsed.statePatch.sceneSummary)
        ))],
        firstAppearance: [...new Set(parsed.claudeSignals.firstAppearance.map((id) =>
          canonicalTurnCharacterId(id, parsed.statePatch.sceneSummary)
        ))],
        mentioned: [...new Set(parsed.claudeSignals.mentioned.map((id) =>
          canonicalTurnCharacterId(id, parsed.statePatch.sceneSummary)
        ))],
      },
    };
  }

  const synchronizedParsed = ensureElapsedTimeForLiveTurn({
    state: request.state,
    turn: synchronizeGeneratedTurnChronology(request.state, { ...parsed, blocks: cleanBlocks }),
    beatPolicy: liveBeatPolicy,
    canonAbsorption: keepCanonAbsorptionActions,
    eventTimeWindow: writerSceneClockVerified ? "" : nexusActiveEvent?.timeWindow ?? "",
  });
  parsed = synchronizedParsed;
  if (synchronizedParsed.chronologyConflict) {
    localRepairs.push({
      ruleId: "chronology-conflict-preserved-as-advisory",
      repairScope: "sidecar",
      reasons: ["비공개 누설이 아닌 시간 인과 권고"],
      durationMs: 0,
      success: true,
    });
  }
  const finalizedChronology = parsed.chronology ?? {
    day: request.state.day,
    date: request.state.date,
    weekday: request.state.weekday,
    time: parsed.statePatch.time || request.state.time,
  };

  const cleanStoryText = cleanBlocks.map((block) => block.text).join("\n");
  const inventoryAfter = [...new Set([
    ...request.state.inventory,
    ...(parsed.statePatch.inventoryAdd ?? []),
    ...storyDrive.reconciledInventoryAdds,
  ])];
  const finalForcedClosureViolations = forcedClaudeClosureViolations({
    turn: parsed,
    activeEvent: nexusActiveEvent,
    ledger: claudeRuntime,
    publicText: cleanStoryText,
    inventoryAfter,
  });
  const closureBeatMayExtend = forcedClosureTurn &&
    finalForcedClosureViolations.length > 0 &&
    claudeRuntime.closureExtensionCount < 2;
  if (
    forcedClosureTurn &&
    claudeRuntime.closureExtensionCount >= 2 &&
    finalForcedClosureViolations.length > 0
  ) {
    throw new SimulationRouteError(
      422,
      "FINAL_BEAT_CLOSURE_FAILED",
      `마지막 비트 종결 실패: ${finalForcedClosureViolations.join(" / ")}`,
    );
  }
  if (finalForcedClosureViolations.length > 0) {
    parsed = {
      ...parsed,
      claudeSignals: {
        ...parsed.claudeSignals!,
        beatAdvanced: true,
        eventResolved: closureBeatMayExtend ? false : true,
        resolutionSummary: closureBeatMayExtend
          ? ""
          : (parsed.claudeSignals?.resolutionSummary?.trim().length ?? 0) >= 12
            ? parsed.claudeSignals?.resolutionSummary || ''
            : `${nexusActiveEvent?.name ?? "현재 사건"}의 종결 장면에서 남은 결과를 정사 인과로 마무리했다.`,
      },
    };
  }
  const claudeAdjudication = adjudicateClaudeTurn({
    pack: request.pack,
    state: request.state,
    ledger: claudeRuntime,
    signals: parsed.claudeSignals as ClaudeTurnSignals,
    publicText: cleanStoryText,
    userInput: request.userText,
    canonicalAdvance: request.advanceMode === "canonical",
    inventoryAfter,
  });
  const activeEventCompleted =
    Boolean(nexusActiveEvent) &&
    (!requiredEncounterLocationBridgeApplied || forcedClosureTurn) &&
    claudeAdjudication.eventCompleted;
  const activeEventCarriedOver =
    Boolean(nexusActiveEvent) && claudeAdjudication.eventCarriedOver;
  const activeEventExited = activeEventCompleted || activeEventCarriedOver;
  const claudeVariable = claudeRuntimeVariable(claudeAdjudication.ledger);
  parsed = {
    ...parsed,
    statePatch: {
      ...parsed.statePatch,
      variablesAdd: (parsed.statePatch.variablesAdd ?? []).filter(
        (variable) =>
          variable.id !== STORY_ROUTE_PROGRESS_VARIABLE_ID &&
          variable.id !== STORY_SCENE_PROGRESS_VARIABLE_ID &&
          variable.id !== claudeVariable.id,
      ),
      inventoryAdd: inventoryAfter.filter(
        (item) => !request.state.inventory.includes(item),
      ),
    },
  };
  if (
    claudeAdjudication.beatAdvanced &&
    !claudeAdjudication.eventCompleted &&
    !claudeAdjudication.eventCarriedOver &&
    nexusActiveEvent?.kind === "compound"
  ) {
    const beatVariable = compoundBeatProgressVariable(
      nexusActiveEvent,
      Math.min(
        Math.max(0, claudeAdjudication.ledger.beat),
        Math.max(0, (nexusActiveEvent.beats?.length ?? 1) - 1),
      ),
      request.state.turn + 1,
    );
    parsed = {
      ...parsed,
      statePatch: {
        ...parsed.statePatch,
        variablesAdd: [
          ...(parsed.statePatch.variablesAdd ?? []).filter(
            (variable) => variable.id !== beatVariable.id,
          ),
          beatVariable,
        ],
      },
    };
  }
  if (activeEventExited && storyDrive.routeLock.active) {
    const progressVariable = storyRouteProgressVariable(
      storyDrive.routeLock,
      request.state,
      claudeAdjudication.completedEventIds,
    );
    parsed = {
      ...parsed,
      statePatch: {
        ...parsed.statePatch,
        variablesAdd: [
          ...(parsed.statePatch.variablesAdd ?? []).filter(
            (variable) => variable.id !== progressVariable.id,
          ),
          progressVariable,
        ],
      },
    };
  } else if (storyDrive.routeLock.active) {
    parsed = {
      ...parsed,
      statePatch: {
        ...parsed.statePatch,
        variablesAdd: [
          ...(parsed.statePatch.variablesAdd ?? []).filter(
            (variable) => variable.id !== STORY_SCENE_PROGRESS_VARIABLE_ID,
          ),
          sceneProgressVariable(request, storyDrive, scenePacing),
        ],
      },
    };
  }
  parsed = {
    ...parsed,
    statePatch: {
      ...parsed.statePatch,
      variablesAdd: [
        ...(parsed.statePatch.variablesAdd ?? []).filter(
          (variable) => variable.id !== claudeVariable.id,
        ),
        claudeVariable,
      ],
    },
    warning: claudeAdjudication.closureBeatExtended
      ? claudeAdjudication.ledger.closureExtensionCount >= 2
        ? `임시 종결 장면은 그대로 저장했습니다. 남은 종결 결과를 반드시 성립시키는 최종 강제 종결 턴 1개를 추가했습니다: ${claudeAdjudication.missingCurrentContract.join(" · ")}`
        : `마지막 장면은 그대로 저장했습니다. 아직 남은 종결 결과를 확실히 성립시키기 위해 임시 종결 비트 1개를 추가했습니다: ${claudeAdjudication.missingCurrentContract.join(" · ")}`
      : activeEventCarriedOver
      ? `남은 조건을 다음 사건으로 이월했습니다: ${claudeAdjudication.missingCurrentContract.join(" · ")}`
      : claudeAdjudication.completionRejected
      ? `Claude Core가 조기 사건 종결을 차단했습니다: ${claudeAdjudication.reason}`
      : parsed.warning,
  };
  if (activeEventExited) {
    parsed = {
      ...parsed,
      statePatch: {
        ...parsed.statePatch,
        variablesResolve: [...new Set([
          ...(parsed.statePatch.variablesResolve ?? []),
          STORY_SCENE_PROGRESS_VARIABLE_ID,
          ...(nexusActiveEvent?.kind === "compound"
            ? [compoundBeatVariableId(nexusActiveEvent.id)]
            : []),
        ])],
      },
    };
  }
  if (activeEventCompleted) {
    const eventAsset = selectEventTriggeredMediaAsset(
      request.pack,
      nexusActiveEvent?.id ?? storyDrive.routeLock.currentEventId,
    );
    const exactDialogueIndex = storyDrive.routeLock.requiredDialogue
      ? cleanBlocks.findIndex((block) =>
          compactDisclosureTerm(block.text) ===
            compactDisclosureTerm(storyDrive.routeLock.requiredDialogue)
        )
      : -1;
    const targetIndex = exactDialogueIndex >= 0
      ? exactDialogueIndex
      : cleanBlocks.length - 1;
    if (eventAsset && cleanBlocks[targetIndex]) {
      cleanBlocks.forEach((block, index) => {
        if (index !== targetIndex && block.mediaAssetId === eventAsset.id) {
          cleanBlocks[index] = { ...block, mediaAssetId: "" };
        }
      });
      const previousAssetId = cleanBlocks[targetIndex]?.mediaAssetId;
      if (previousAssetId) usedMediaIds.delete(previousAssetId);
      cleanBlocks[targetIndex] = {
        ...cleanBlocks[targetIndex],
        mediaAssetId: eventAsset.id,
      };
      usedMediaIds.add(eventAsset.id);
    }
  }
  const summoningVisible = saberSummoningIsVisible(cleanStoryText);
  if (summoningVisible) {
    const summoningAsset = selectSaberSummoningMediaAsset(
      request.pack,
      `${storyDrive.routeLock.currentEventId} ${parsed.statePatch.sceneSummary} ${cleanStoryText}`,
    );
    const masterQuestionIndex = cleanBlocks.findIndex(
      (block) => block.text.trim() === CANONICAL_MASTER_QUESTION,
    );
    const targetIndex = masterQuestionIndex >= 0
      ? masterQuestionIndex
      : cleanBlocks.length - 1;
    if (summoningAsset && cleanBlocks[targetIndex]) {
      cleanBlocks.forEach((block, index) => {
        if (index !== targetIndex && block.mediaAssetId === summoningAsset.id) {
          cleanBlocks[index] = { ...block, mediaAssetId: "" };
        }
      });
      const previousAssetId = cleanBlocks[targetIndex]?.mediaAssetId;
      if (previousAssetId) usedMediaIds.delete(previousAssetId);
      cleanBlocks[targetIndex] = {
        ...cleanBlocks[targetIndex],
        mediaAssetId: summoningAsset.id,
      };
      usedMediaIds.add(summoningAsset.id);
    }
  }

  const hasServerAttachedTriggerAsset = cleanBlocks.some((block) => {
    const asset = (request.pack.mediaAssets ?? []).find(
      (candidate) => candidate.id === block.mediaAssetId,
    );
    return Boolean(asset && isTriggerBoundMediaAsset(asset));
  });
  if (!hasServerAttachedTriggerAsset) {
    const eligibleTrigger = selectEligibleTriggeredMedia(request.pack, {
      activeEventId: storyDrive.routeLock.active
        ? storyDrive.routeLock.currentEventId
        : undefined,
      completedEventId: activeEventCompleted
        ? storyDrive.routeLock.currentEventId
        : undefined,
      currentText: cleanStoryText,
      sceneSummary: parsed.statePatch.sceneSummary,
      userText: request.userText,
      day: finalizedChronology.day,
      date: finalizedChronology.date,
      time: finalizedChronology.time,
      location: parsed.statePatch.location || request.state.location,
      clocks: request.state.clocks,
      clockChanges: parsed.statePatch.clockChanges,
      variables: request.state.variables,
      variablesAdd: parsed.statePatch.variablesAdd,
      variablesResolve: parsed.statePatch.variablesResolve,
      priorMediaAssetIds: request.recentTurns.flatMap((turn) =>
        turn.blocks.map((block) => block.mediaAssetId ?? "").filter(Boolean)
      ),
    });
    const targetIndex = eligibleTrigger?.trigger.outputPosition === "turn_bottom"
      ? cleanBlocks.length - 1
      : cleanBlocks.findIndex((block) =>
          eligibleTrigger && scenarioMediaAssetMatchesSceneContext(
            eligibleTrigger.asset,
            block.text,
          )
        );
    const resolvedTargetIndex = targetIndex >= 0
      ? targetIndex
      : cleanBlocks.length - 1;
    if (eligibleTrigger && cleanBlocks[resolvedTargetIndex]) {
      const previousAssetId = cleanBlocks[resolvedTargetIndex]?.mediaAssetId;
      if (previousAssetId) usedMediaIds.delete(previousAssetId);
      cleanBlocks[resolvedTargetIndex] = {
        ...cleanBlocks[resolvedTargetIndex],
        mediaAssetId: eligibleTrigger.asset.id,
      };
      usedMediaIds.add(eligibleTrigger.asset.id);
    }
  }

  const recommendationObservation = [
    request.userText,
    ...cleanBlocks.map(
      (block) => `${block.speakerName ?? ""} ${block.text}`,
    ),
  ].join("\n");
  const recommendationFocus = [
    parsed.statePatch.sceneSummary,
    ...cleanBlocks
      .slice(-3)
      .map((block) => `${block.speakerName ?? ""} ${block.text}`),
  ].join("\n");
  const latestDialogueSpeaker = [...cleanBlocks]
    .reverse()
    .find((block) => block.type === "dialogue")?.speakerName ?? "";
  const recommendationSpeaker = latestDialogueSpeaker &&
      characterStillAvailableInScene(latestDialogueSpeaker, cleanBlocks)
    ? latestDialogueSpeaker
    : "";
  const availableRecommendationCharacterNames = [...new Set([
    ...cleanBlocks
      .filter((block) => block.type === "dialogue")
      .map((block) => block.speakerName ?? ""),
    ...(parsed.characterVisuals ?? []).map((visual) => visual.characterName),
    ...(parsed.image.characterIds ?? []).map(
      (characterId) =>
        request.pack.npcs.find((npc) => npc.id === characterId)?.name ?? "",
    ),
  ].filter(Boolean))].filter((name) =>
    characterStillAvailableInScene(name, cleanBlocks)
  );
  const forbiddenRecommendationNames = request.pack.npcs
    .map((npc) => npc.name)
    .filter(
      (name) => name && !recommendationObservation.includes(name),
    );
  const forbiddenRecommendationTerms = sanitizeProtectedTerms([
    ...restrictedBodyTerms,
    ...request.state.variables
      .filter((variable) => variable.visibility === "hidden")
      .flatMap((variable) => [variable.label, variable.detail]),
    ...request.pack.events
      .filter((event) => event.visibility.toLowerCase() !== "public")
      .flatMap((event) => [event.name, event.description]),
  ]).filter(
    (term) =>
      term.trim().length >= 2 &&
      !recommendationObservation
        .normalize("NFKC")
        .replace(/\s+/g, "")
        .includes(term.normalize("NFKC").replace(/\s+/g, "")),
  );
  const recommendationValidationOptions = {
    observableText: recommendationObservation,
    focusText: recommendationFocus,
    speakerName: sceneFocus.requireHandoff ? "" : recommendationSpeaker,
    forbiddenNames: forbiddenRecommendationNames,
    forbiddenTerms: forbiddenRecommendationTerms,
    excludedTerms: [
      ...sceneFocus.blockedRecommendationTerms,
      ...request.pack.npcs
        .map((npc) => npc.name)
        .filter((name) =>
          name && !availableRecommendationCharacterNames.includes(name)
        ),
    ],
    characterNames: request.pack.npcs.map((npc) => npc.name),
    availableCharacterNames: availableRecommendationCharacterNames,
    requireProgressive: true,
    validationMode: "hard_only" as const,
    fillFallbacks: false,
    uniqueRisks: false,
    count: 3,
  };
  const riskOrder = new Map([["낮음", 0], ["보통", 1], ["높음", 2]]);
  const orderRecommendations = (
    values: Array<{ label: string; risk: "낮음" | "보통" | "높음" }>,
  ) => [...values].sort(
    (left, right) =>
      (riskOrder.get(left.risk) ?? 9) - (riskOrder.get(right.risk) ?? 9),
  );
  const completeRiskSet = (
    values: Array<{ label: string; risk: "낮음" | "보통" | "높음" }>,
  ) => values.length === 3 &&
    new Set(values.map((item) => item.risk)).size === 3;
  const normalizeRiskSlots = (
    values: Array<{ label: string; risk: "낮음" | "보통" | "높음" }>,
  ) => {
    if (values.length !== 3) return values;
    const slotRisks = ["낮음", "보통", "높음"] as const;
    return values.map((item, index) => ({ ...item, risk: slotRisks[index] }));
  };

  let writerRecommendations = normalizeRiskSlots(
    sanitizeRecommendedReplies(
      parsed.recommendations,
      recommendationValidationOptions,
    ),
  );
  const recommendationHardRepairRequired = !completeRiskSet(writerRecommendations);
  if (
    !liveFinalize &&
    recommendationHardRepairRequired &&
    finalBeatConvergenceTurn
  ) {
    observedHardErrorReasons.push("추천행동 강제 오류");
    const repairPrompt = `완성된 narration의 마지막 열린 대응 지점에 맞춰 추천행동만 교정한다.

현재 시각·장소: ${parsed.statePatch.time} · ${parsed.statePatch.location}
사용자 입력: ${request.advanceMode === "canonical" ? "정사대로 이어서 진행" : request.userText}
완성된 본문:
${canonicalNarrationFromBlocks(cleanBlocks).slice(-6000)}

현재 장면 요약: ${parsed.statePatch.sceneSummary.slice(0, 1200)}
비공개 정사 압력(추천 방향에만 사용하고 명칭·미래 사실을 출력하지 말 것):
${[
      nexusActiveEvent?.description,
      nexusActiveEvent?.beats?.[claudeRuntime.beat]?.content,
      nexusActiveEvent?.completionSignals,
    ].filter(Boolean).join(" / ").slice(0, 2400) || "자유 장면의 현재 인과를 한 단계 진행"}

기존 추천 초안: ${JSON.stringify(parsed.recommendations).slice(0, 1600)}
현재 장면에 없는 인물: ${forbiddenRecommendationNames.slice(0, 16).join(", ") || "없음"}
공개 금지 명칭: ${forbiddenRecommendationTerms.slice(0, 20).join(", ").slice(0, 1400) || "없음"}

본문·상태·사건은 바꾸지 않는다. 마지막 장면에서 지금 즉시 가능한 서로 다른 행동 세 개만 JSON으로 출력한다.`;
    const repaired = await requestRecommendationRepair(
      repairPrompt,
      ["추천행동 강제 오류"],
    );
    if (repaired) {
      writerRecommendations = normalizeRiskSlots(
        sanitizeRecommendedReplies(
          repaired,
          recommendationValidationOptions,
        ),
      );
    }
  }

  if (!completeRiskSet(writerRecommendations)) {
    const fallbackStartedAt = Date.now();
    // Do not expose the old machine-written "구체적으로 묻는다/요청한다"
    // templates when the compact repair call fails. A smaller set of authentic,
    // hard-safe writer choices is preferable to three fabricated generic lines.
    writerRecommendations = orderRecommendations(writerRecommendations);
    localRepairs.push({
      ruleId: "writer-recommendation-preserve-valid-subset",
      repairScope: "sentence",
      reasons: ["추천행동 강제 오류"],
      durationMs: Math.max(0, Date.now() - fallbackStartedAt),
      success: writerRecommendations.length > 0,
    });
  }
  const safeRecommendations = orderRecommendations(writerRecommendations).slice(0, 3);

  const seenCharacterIds = new Set(
    (request.state.characterVisuals ?? []).map((profile) => profile.characterId),
  );
  const seenCharacterNames = new Set(
    (request.state.characterVisuals ?? []).map((profile) => profile.characterName),
  );
  const visualSceneContext = [
    request.userText,
    parsed.statePatch.sceneSummary,
    ...cleanBlocks.map((block) => block.text),
    ...(activeEventCompleted
      ? [storyDrive.routeLock.currentEventId]
      : []),
    ...(summoningVisible
      ? [
          storyDrive.routeLock.currentEventId,
          `${resolveWorkAdapter(request.pack)?.primaryMilestoneNpc(request.pack)?.name ?? "주요 인물"} 소환 summoning magic-circle first-appearance 소환진 마법진 현현 첫 등장 계약`,
        ]
      : []),
    ...servantBond.visualTriggerTerms,
  ].join("\n");
  const requestedVisualCues = [...(parsed.characterVisuals ?? [])];
  cleanBlocks.forEach((block, blockIndex) => {
    if (block.type !== "dialogue") return;
    const character = resolveTrustedDialogueSpeaker(
      request,
      block.speakerId ?? "",
      block.speakerName ?? "",
    );
    if (
      !character ||
      character.isPlayer ||
      seenCharacterIds.has(character.id) ||
      seenCharacterNames.has(character.name) ||
      requestedVisualCues.some(
        (cue) => cue.characterId === character.id || cue.characterName === character.name,
      )
    ) {
      return;
    }
    requestedVisualCues.push({
      blockIndex,
      characterId: character.id,
      characterName: block.speakerName?.trim() ||
        character.preRevealAlias?.trim() ||
        character.name,
      importance: "major",
      isFirstMajorAppearance: true,
      appearancePrompt: character.appearance,
      reason: "패키지 주요 인물이 본문에서 처음 직접 등장함",
      canonicalAssetId: "",
      source: "pending",
    });
  });

  const visualCues: CharacterVisualCue[] = [];
  for (const rawCue of requestedVisualCues) {
    const characterName = rawCue.characterName?.trim().slice(0, 80) ?? "";
    const fallbackId = characterName
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const characterId =
      rawCue.characterId?.trim().slice(0, 120) || `dynamic-${fallbackId}`;
    if (
      !characterName ||
      !characterId ||
      rawCue.importance !== "major" ||
      !rawCue.isFirstMajorAppearance ||
      characterId === request.pack.player.id ||
      characterName === request.pack.player.name ||
      seenCharacterIds.has(characterId) ||
      seenCharacterNames.has(characterName)
    ) {
      continue;
    }

    const blockIndex = Math.min(
      cleanBlocks.length - 1,
      Math.max(0, Math.round(rawCue.blockIndex ?? 0)),
    );
    const cueBlock = cleanBlocks[blockIndex];
    const blockSpeaker = cueBlock?.type === "dialogue"
      ? resolveTrustedDialogueSpeaker(
          request,
          cueBlock.speakerId ?? "",
          cueBlock.speakerName ?? "",
        )
      : undefined;
    // Dialogue portraits are bound only by a package/session-declared visible
    // identity. An unregistered role must remain text-only even if the model
    // supplied an unrelated package character ID in characterVisuals.
    if (cueBlock?.type === "dialogue" && !blockSpeaker) continue;
    const cueById = resolveDeclaredCharacterAlias(
      request.pack,
      characterId,
      "",
      turnKnownAliases,
    );
    const cueByName = resolveDeclaredCharacterAlias(
      request.pack,
      "",
      characterName,
      turnKnownAliases,
    );
    if (cueById && cueByName && cueById.id !== cueByName.id) continue;
    const character = blockSpeaker ?? cueByName ?? cueById;
    if (
      blockSpeaker &&
      ((cueById && cueById.id !== blockSpeaker.id) ||
        (cueByName && cueByName.id !== blockSpeaker.id))
    ) continue;
    const canonicalCharacterId = character?.id ?? characterId;
    if (
      canonicalCharacterId === request.pack.player.id ||
      seenCharacterIds.has(canonicalCharacterId) ||
      (character?.name ? seenCharacterNames.has(character.name) : false)
    ) continue;
    const triggeredDisplay = selectTriggeredScenarioMediaAsset(
      request.pack,
      visualSceneContext,
      canonicalCharacterId,
    );
    const packageDisplay = triggeredDisplay ??
      selectScenarioMediaAsset(
        request.pack,
        canonicalCharacterId,
        cleanBlocks[blockIndex]?.emotion,
      );
    const packageReference = selectCharacterReferenceAsset(
      request.pack,
      canonicalCharacterId,
    );
    const characterDisplay = packageDisplay?.kind === "character"
      ? packageDisplay
      : undefined;
    const source = characterDisplay || packageReference
      ? "package" as const
      : "pending" as const;
    const canonicalAssetId =
      packageReference?.id ??
      characterDisplay?.id ??
      characterVisualAssetId(canonicalCharacterId);
    if (packageDisplay && cleanBlocks[blockIndex]) {
      cleanBlocks[blockIndex] = {
        ...cleanBlocks[blockIndex],
        mediaAssetId: packageDisplay.id,
      };
      usedMediaIds.add(packageDisplay.id);
    }

    const fixedAppearance =
      character?.appearance?.trim() ||
      rawCue.appearancePrompt?.trim().slice(0, 1200) ||
      `${characterName}의 고유한 얼굴·머리·복장 디자인`;
    const safeAppearance = replaceDisclosureTerms(
      fixedAppearance,
      [
        ...protectedIdentityTerms,
        ...(!saberClassObservedBeforeTurn ? SABER_CLASS_TERMS : []),
      ],
      characterName || SABER_PRE_REVEAL_ALIAS,
    );

    visualCues.push({
      blockIndex,
      characterId: canonicalCharacterId,
      characterName,
      importance: "major",
      isFirstMajorAppearance: true,
      appearancePrompt: safeAppearance,
      reason:
        rawCue.reason?.trim().slice(0, 300) ||
        "후속 전개에 영향을 주는 주요 인물의 첫 등장",
      canonicalAssetId,
      source,
    });
    seenCharacterIds.add(characterId);
    seenCharacterIds.add(canonicalCharacterId);
    seenCharacterNames.add(characterName);
    if (visualCues.length >= 2) break;
  }

  const primaryServantBlockIndex = cleanBlocks.findIndex(
    (block) =>
      block.type === "dialogue" &&
      servantBond.primaryServantId &&
      (block.speakerId === servantBond.primaryServantId ||
        block.speakerName === servantBond.primaryServantName),
  );
  if (
    servantBond.visualTriggerTerms.length &&
    cleanBlocks.length &&
    primaryServantBlockIndex >= 0
  ) {
    const triggered = selectTriggeredScenarioMediaAsset(
      request.pack,
      [
        cleanBlocks[primaryServantBlockIndex]?.text ?? "",
        parsed.statePatch.sceneSummary,
        ...servantBond.visualTriggerTerms,
      ].join(" "),
      servantBond.primaryServantId,
    );
    if (
      triggered &&
      !usedMediaIds.has(triggered.id) &&
      cleanBlocks[primaryServantBlockIndex]
    ) {
      cleanBlocks[primaryServantBlockIndex] = {
        ...cleanBlocks[primaryServantBlockIndex],
        mediaAssetId: triggered.id,
      };
      usedMediaIds.add(triggered.id);
    }
  }

  let automaticTriggerCount = 0;
  for (const [blockIndex, block] of cleanBlocks.entries()) {
    if (automaticTriggerCount >= 1 || block.mediaAssetId) continue;
    const triggered = selectTriggeredScenarioMediaAsset(
      request.pack,
      `${block.text}\n${parsed.statePatch.sceneSummary}`,
      block.speakerId,
    );
    if (!triggered || usedMediaIds.has(triggered.id)) continue;
    if (
      triggered.kind === "character" &&
      (!block.speakerId || triggered.characterId !== block.speakerId)
    ) continue;
    cleanBlocks[blockIndex] = { ...block, mediaAssetId: triggered.id };
    usedMediaIds.add(triggered.id);
    automaticTriggerCount += 1;
  }

  const alreadyEncountered = new Set(
    request.state.encounteredCharacterIds ?? [],
  );
  const encounterCandidates: EncounteredCharacterAddition[] = [
    ...(parsed.statePatch.encounteredCharactersAdd ?? []),
    ...(parsed.claudeSignals?.firstAppearance ?? []).map((characterId) => {
      const npc = request.pack.npcs.find(
        (candidate) => candidate.id === characterId,
      );
      return {
        characterId,
        name: npc?.name ?? "",
        relationType: "첫 만남",
      };
    }),
    ...cleanBlocks
      .filter(
        (block) =>
          block.type === "dialogue" &&
          Boolean(block.speakerId || block.speakerName),
      )
      .map((block) => ({
        characterId: block.speakerId ?? "",
        name: block.speakerName ?? "",
        relationType: "첫 만남",
      })),
    ...visualCues.map((visual) => ({
      characterId: visual.characterId,
      name: visual.characterName,
      relationType: "첫 만남",
    })),
  ];
  const encounteredCharactersAdd: EncounteredCharacterAddition[] = [];
  for (const candidate of encounterCandidates) {
    const rawName = candidate.name?.trim().slice(0, 80) ?? "";
    const packNpc = resolveTurnCharacterAlias(
      candidate.characterId?.trim() ?? "",
      rawName,
      `${candidate.relationType ?? ""} ${parsed.statePatch.sceneSummary} ${cleanStoryText}`,
      visualCues.map((visual) => visual.characterId),
    );
    const fallbackId = rawName
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const characterId =
      packNpc?.id ||
      candidate.characterId?.trim().slice(0, 120) ||
      (fallbackId ? `dynamic-${fallbackId}` : "");
    const packNameIsProtected = Boolean(
      packNpc?.name &&
        findUnobservedExactTerms(
          packNpc.name,
          verifiedPreTurnObservation,
          protectedIdentityTerms,
        ).length,
    );
    const rawNameIsProtected = Boolean(
      rawName &&
        findUnobservedExactTerms(
          rawName,
          verifiedPreTurnObservation,
          protectedIdentityTerms,
        ).length,
    );
    const safeRoleAlias = packNpc?.preRevealAlias?.trim() || (/(?:^|\b)saber(?:\b|$)|세이버/iu.test(
        packNpc?.role ?? "",
      )
      ? saberClassObservedBeforeTurn
        ? "세이버"
        : SABER_PRE_REVEAL_ALIAS
      : "정체불명의 주요 인물");
    const name = packNameIsProtected
      ? rawName && !rawNameIsProtected
        ? rawName
        : safeRoleAlias
      : packNpc?.name || rawName;
    if (
      !characterId ||
      !name ||
      (!packNpc && GENERIC_UNNAMED_CHARACTER_PATTERN.test(rawName)) ||
      characterId === request.pack.player.id ||
      name === request.pack.player.name ||
      alreadyEncountered.has(characterId)
    ) {
      continue;
    }
    const knownRelation = request.state.relations.find(
      (relation) => relation.characterId === characterId,
    );
    encounteredCharactersAdd.push({
      characterId,
      name,
      relationType:
        candidate.relationType?.trim().slice(0, 80) ||
        knownRelation?.relationType ||
        "첫 만남",
    });
    alreadyEncountered.add(characterId);
    if (encounteredCharactersAdd.length >= 4) break;
  }

  const imageCharacterIds = selectSceneCharacterReferenceIds(
    request.pack,
    cleanBlocks,
    [
      ...(parsed.image.characterIds ?? []),
      ...visualCues.map((cue) => cue.characterId),
      ...(activeEventCompleted
        ? selectEventCharacterReferenceIds(
            request.pack,
            nexusActiveEvent?.id ?? storyDrive.routeLock.currentEventId,
          )
        : []),
    ],
  );

  const billedUsage = billedResponses.map((response, index):EngineCallUsage => {
    const usage = (response.usage ?? {}) as Record<string, unknown>;
    const details = (usage.input_tokens_details ?? {}) as Record<string, unknown>;
    const inputTokens = Number(usage.input_tokens ?? 0);
    const outputTokens = Number(usage.output_tokens ?? 0);
    const cachedInputTokens = Number(details.cached_tokens ?? 0);
    const cacheWriteTokens = Number(details.cache_write_tokens ?? 0);
    const webSearchCallCount = webSearchCountFromResponse(response);
    const toolCallCostUsd = webSearchCallCount * 0.01;
    const estimatedCostUsd = textCostUsd({
      model, inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, toolCallCostUsd,
    });
    const metadata = billedRequestMetadata[index];
    const stage = metadata?.stage ?? (index === 0 ? "draft" : "audit_rewrite");
    const reasons = metadata?.rewriteReasons ?? [];
    const repairScope = stage === "draft" || stage === "character_research"
      ? "none"
      : stage === "recommendation_repair"
        ? "sentence"
      : reasons.some((reason) => /정체|소품/u.test(reason))
        ? "word"
        : reasons.some((reason) => /내부 제어문/u.test(reason))
          ? "sentence"
          : reasons.some((reason) => /장소|이동/u.test(reason))
            ? "paragraph"
            : "scene";
    return {
      call: metadata?.call ?? index + 1,
      stage,
      reasoningEffort: metadata?.reasoningEffort,
      rewriteReasons: reasons,
      rewriteReasonDetails: auditReasonDetails(reasons),
      durationMs: metadata?.durationMs ?? 0,
      repairScope,
      inputTokens,
      uncachedInputTokens: Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens),
      cachedInputTokens,
      cacheWriteTokens,
      outputTokens,
      webSearchCallCount,
      toolCallCostUsd,
      estimatedCostUsd,
    };
  });
  const lastRewriteUsageIndex = billedUsage.findLastIndex(
    (usage) => usage.stage !== "draft" && usage.stage !== "character_research",
  );
  if (lastRewriteUsageIndex >= 0) {
    billedUsage[lastRewriteUsageIndex] = {
      ...billedUsage[lastRewriteUsageIndex],
      finalRewriteCandidate: true,
    };
  }
  const inputTokens = billedUsage.reduce((sum, usage) => sum + usage.inputTokens, 0);
  const outputTokens = billedUsage.reduce((sum, usage) => sum + usage.outputTokens, 0);
  const cachedInputTokens = billedUsage.reduce(
    (sum, usage) => sum + usage.cachedInputTokens,
    0,
  );
  const cacheWriteTokens = billedUsage.reduce(
    (sum, usage) => sum + usage.cacheWriteTokens,
    0,
  );
  const uncachedInputTokens = Math.max(
    0,
    inputTokens - cachedInputTokens - cacheWriteTokens,
  );
  const estimatedCostUsd = billedUsage.reduce(
    (sum, usage) => sum + usage.estimatedCostUsd,
    0,
  );
  const totalDurationMs =
    billedUsage.reduce((sum, usage) => sum + (usage.durationMs ?? 0), 0) +
    localRepairs.reduce((sum, repair) => sum + repair.durationMs, 0);
  const rewriteCalls = billedUsage.filter(
    (usage) => usage.stage !== "draft" && usage.stage !== "character_research",
  );
  const researchCalls = billedUsage.filter((usage) => usage.stage === "character_research");
  const webSearchCallCount = researchCalls.reduce(
    (sum, usage) => sum + (usage.webSearchCallCount ?? 0),
    0,
  );
  const researchCostUsd = researchCalls.reduce(
    (sum, usage) => sum + usage.estimatedCostUsd,
    0,
  );
  const rewriteReasons = [
    ...new Set(rewriteCalls.flatMap((usage) => usage.rewriteReasons)),
  ];
  const hardErrorReasons = [
    ...new Set([
      ...observedHardErrorReasons,
      ...rewriteCalls.flatMap((usage) =>
        (usage.rewriteReasonDetails ?? [])
          .filter((detail) => detail.severity === "hard_error")
          .map((detail) => detail.reason),
      ),
    ]),
  ];
  const qualityAdvisories = [
    ...new Set([
      ...observedQualityAdvisories,
      ...rewriteCalls.flatMap((usage) =>
        (usage.rewriteReasonDetails ?? [])
          .filter((detail) => detail.severity === "quality_advisory")
          .map((detail) => detail.reason),
      ),
    ]),
  ];
  const autonomyActions = sanitizeAutonomyActionPatches(
    request.pack,
    request.state,
    autonomyCandidates,
    parsed.statePatch.autonomyActions as AutonomyActionPatch[],
  );
  const canonicalRelationChanges = (parsed.statePatch.relationChanges ?? []).map(
    (change) => ({
      ...change,
      characterId: canonicalTurnCharacterId(
        change.characterId,
        `${change.reason} ${cleanStoryText}`,
      ),
    }),
  );
  const factionIds = new Set(request.pack.factions.map((faction) => faction.id));
  const canonicalEntityId = (rawId = "", hintText = "") =>
    factionIds.has(rawId) ? rawId : canonicalTurnCharacterId(rawId, hintText);
  const canonicalRelationshipMemoryPatches = ((
    parsed.statePatch.relationshipMemoriesAdd as unknown as RelationshipMemoryPatch[] | undefined
  ) ?? []).map((memory) => {
    const hint = `${memory.title ?? ""} ${memory.summary ?? ""} ${memory.cause ?? ""}`;
    const sourceId = canonicalEntityId(memory.sourceId, hint);
    const targetId = canonicalEntityId(memory.targetId, hint);
    const authoredRelation = request.pack.relations.find((relation) =>
      (relation.sourceId === sourceId && relation.targetId === targetId) ||
      (relation.sourceId === targetId && relation.targetId === sourceId)
    );
    return {
      ...memory,
      sourceId,
      targetId,
      relationId: authoredRelation?.id ?? memory.relationId,
    };
  });
  const relationshipMemoriesAdd = sanitizeRelationshipMemoryPatches(
    request.pack,
    request.state,
    canonicalRelationshipMemoryPatches,
  );
  const resolvableMemoryIds = new Set(
    (request.state.relationshipMemories ?? [])
      .filter((memory) => memory.active && memory.unresolved)
      .map((memory) => memory.id),
  );
  const relationshipMemoryResolveIds = [
    ...new Set(parsed.statePatch.relationshipMemoryResolveIds ?? []),
  ].filter((id) => resolvableMemoryIds.has(id)).slice(0, 8);
  const canonicalSessionCanonUpdates = (
    parsed.statePatch.sessionCanonUpdates as SessionCanonUpdate[] | undefined
  )?.map((update) => ({
    ...update,
    subjectIds: [...new Set(update.subjectIds.map((id) =>
      canonicalEntityId(id, `${update.statement} ${update.evidence}`)
    ))],
  }));
  const sessionCanonAdd = sanitizeSessionCanonUpdates({
    updates: canonicalSessionCanonUpdates,
    existing: request.state.sessionCanonLedger ?? [],
    userInput: request.advanceMode === "canonical" ? "" : request.userText,
    publicText: cleanStoryText,
    characterIds: new Set([
      request.pack.player.id,
      ...request.pack.npcs.map((character) => character.id),
    ]),
    eventIds: new Set(request.pack.events.map((event) => event.id)),
    turn: request.state.turn + 1,
  });

  // Final model-free guard against a sidecar restoring an obsolete HUD clock.
  const responseChronology = ensureElapsedTimeForLiveTurn({
    state: request.state,
    turn: synchronizeGeneratedTurnChronology(request.state, { ...parsed, blocks: cleanBlocks }),
    beatPolicy: liveBeatPolicy, canonAbsorption: keepCanonAbsorptionActions,
    eventTimeWindow: writerSceneClockVerified ? "" : nexusActiveEvent?.timeWindow ?? "",
  });
  parsed = {
    ...parsed,
    chronology: responseChronology.chronology,
    chronologyConflict: responseChronology.chronologyConflict,
    statePatch: responseChronology.statePatch,
    narrativeAudit: responseChronology.narrativeAudit,
    claudeSignals: responseChronology.claudeSignals,
  };
  const finalChronologyMismatch = finalNarrativeChronologyMismatchReason({ state: request.state, blocks: cleanBlocks, chronology: responseChronology.chronology });
  if (finalChronologyMismatch) throw new SimulationRouteError(422, "NARRATIVE_REWRITE_FAILED", `${finalChronologyMismatch} 본문과 상태창이 다른 턴은 저장하지 않았습니다. 같은 입력으로 다시 시도해 주세요.`);
  const projectedNarration = canonicalNarrationFromBlocks(cleanBlocks);
  const responseNarration = finalResponseNarration(
    liveFinalize,
    parsed.narration,
    projectedNarration,
  );
  return {
    ...parsed,
    narration: responseNarration,
    dialogueAnnotations: dialogueAnnotationsFromBlocks(cleanBlocks),
    blocks: cleanBlocks,
    recommendations: safeRecommendations,
    statePatch: {
      ...parsed.statePatch,
      characterVisualsAdd: visualCues.map((visual) => ({
        characterId: visual.characterId,
        characterName: visual.characterName,
        appearancePrompt: visual.appearancePrompt,
        assetId: visual.canonicalAssetId,
        source: visual.source,
        introducedTurn: request.state.turn + 1,
      })),
      encounteredCharactersAdd,
      statusLedgerChanges: sanitizeStatusLedgerChanges(
        request.pack,
        parsed.statePatch.statusLedgerChanges,
      ),
      relationChanges: request.pack.relationshipMemoryRuntime.enabled || (request.pack.instantStoryRuntime?.enabled &&
        request.pack.package15Runtime?.negotiatedFeatures.includes("status_relationship_display_v1"))
        ? []
        : canonicalRelationChanges,
      autonomyActions,
      relationshipMemoriesAdd,
      relationshipMemoryResolveIds,
      // Never trust the model's ledger directly. Only prose-grounded entries
      // survive into the server-authoritative session memory.
      sessionCanonUpdates: [],
      sessionCanonAdd,
      characterResearchCacheUpsert,
    },
    image: {
      ...parsed.image,
      recommended: imageDue,
      prompt: imageDue ? parsed.image.prompt : "",
      characterIds: imageCharacterIds,
    },
    characterVisuals: visualCues,
    agencyAudit: {
      playerActionInvented: false,
      note: parsed.agencyAudit.playerActionInvented
        ? "서버가 플레이어 주권 위반 블록을 제거하고 안전한 NPC·환경 반응만 저장했습니다."
        : parsed.agencyAudit.note,
    },
    mode: "luna",
    warning: [parsed.warning, recoveryWarning].filter(Boolean).join(" ") || undefined,
    usage: {
      model,
      outputTokenLimit: maxOutputTokens,
      reasoningEffort,
      callCount: upstreamRequestCount,
      billedCallCount: billedUsage.length,
      rewriteCount: rewriteCalls.length,
      rewriteReasons,
      hardErrorReasons,
      qualityAdvisories,
      inputTokens,
      uncachedInputTokens,
      cachedInputTokens,
      cacheWriteTokens,
      outputTokens,
      researchCallCount: researchCalls.length,
      webSearchCallCount,
      researchCostUsd,
      estimatedCostUsd,
      totalDurationMs,
      localRepairs,
      contextProfile,
      calls: billedUsage,
    },
  };
};

export const normalizeSimulateRequest = (
  body: SimulateRequest,
): SimulateRequest => {
  const canonicalAdvance = body.advanceMode === "canonical";
  const normalizedUserText = canonicalAdvance ? "" : body.userText.trim();
  const openingNpc = body.pack.npcs.find((npc) =>
    body.pack.opening.openingLine.includes(npc.name)
  ) ?? body.pack.npcs.find((npc) =>
    body.pack.opening.openingCharacters.includes(npc.name)
  );
  const normalizedPack: ScenarioPack = {
    ...body.pack,
    startTime: scenarioOpeningTime(body.pack),
    constraints: body.pack.constraints ?? [],
    statusWindow: body.pack.statusWindow ?? defaultStatusWindow(),
    initialStatusLedger: body.pack.initialStatusLedger ?? [],
    factions: body.pack.factions ?? [],
    autonomyActors: body.pack.autonomyActors ?? [],
    autonomyRuntime: body.pack.autonomyRuntime ?? defaultAutonomyRuntime(),
    initialRelationshipMemories:
      body.pack.initialRelationshipMemories ?? [],
    relationshipMemoryRuntime:
      body.pack.relationshipMemoryRuntime ??
      defaultRelationshipMemoryRuntime(),
  };
  return {
    pack: normalizedPack,
    state: {
      ...body.state,
      imageEvery: normalizeSceneImageInterval(body.state.imageEvery),
      imageQuality: normalizeImageQuality(body.state.imageQuality),
      variables: body.state.variables ?? [],
      characterVisuals: body.state.characterVisuals ?? [],
      relations: normalizeRuntimeRelations(normalizedPack, body.state.relations),
      statusLedger: normalizeRuntimeStatusLedger(
        normalizedPack,
        body.state.statusLedger,
      ),
      lastStatusChanges: body.state.lastStatusChanges ?? [],
      autonomyActors: normalizeRuntimeAutonomyActors(
        normalizedPack,
        body.state.autonomyActors,
      ),
      autonomyLog: body.state.autonomyLog ?? [],
      worldFacts: body.state.worldFacts ?? [],
      relationshipMemories: normalizeRuntimeRelationshipMemories(
        normalizedPack,
        body.state.relationshipMemories,
      ),
      lastRelationshipMemoryIds:
        body.state.lastRelationshipMemoryIds ?? [],
      observableTraces: body.state.observableTraces ?? [],
      characterResearchCache: body.state.characterResearchCache ?? [],
      encounteredCharacterIds:
        body.state.encounteredCharacterIds ??
        [
          ...new Set([
            ...(openingNpc ? [openingNpc.id] : []),
            ...(body.state.characterVisuals ?? []).map(
              (profile) => profile.characterId,
            ),
          ]),
        ],
    },
    userText: normalizedUserText,
    advanceMode: canonicalAdvance ? "canonical" : "player",
    provider: body.provider ? normalizeModelProvider(body.provider) : undefined,
    ...normalizePlannedRecoveryRequest(body),
    recentTurns: Array.isArray(body.recentTurns)
      ? body.recentTurns.slice(-15)
      : [],
    longTermMemories: Array.isArray(body.longTermMemories)
      ? body.longTermMemories.slice(-2000).map((memory) => ({
          turn: Number(memory.turn ?? 0),
          day: Number(memory.day ?? 0),
          date: String(memory.date ?? "").slice(0, 40),
          time: String(memory.time ?? "").slice(0, 20),
          location: String(memory.location ?? "").slice(0, 240),
          title: String(memory.title ?? "").slice(0, 160),
          summary: String(memory.summary ?? "").slice(0, 1000),
        }))
      : [],
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SimulateRequest & { apiKey?: string };
    const canonicalAdvance = body?.advanceMode === "canonical";
    if (
      !body?.pack?.projectId ||
      !body?.state ||
      (!canonicalAdvance && !body?.userText?.trim())
    ) {
      return NextResponse.json(
        { error: "ScenarioPack, 현재 상태, 사용자 입력이 필요합니다." },
        { status: 400 },
      );
    }

    const normalizedUserText = canonicalAdvance ? "" : body.userText.trim();
    if (normalizedUserText.length > MAX_PLAYER_INPUT_CHARS) {
      return NextResponse.json(
        {
          error: `한 번의 입력은 ${MAX_PLAYER_INPUT_CHARS.toLocaleString("ko-KR")}자까지 처리할 수 있습니다. 행동 순서를 유지한 채 두 턴으로 나눠 입력해 주세요.`,
          code: "PLAYER_INPUT_TOO_LONG",
          inputLength: normalizedUserText.length,
          maximumLength: MAX_PLAYER_INPUT_CHARS,
        },
        { status: 413 },
      );
    }

    const suppliedApiKey = body.apiKey?.trim();
    if (suppliedApiKey && suppliedApiKey.length > 512) {
      return NextResponse.json(
        { error: "API 키 형식이 너무 깁니다." },
        { status: 400 },
      );
    }

    const normalizedRequest = normalizeSimulateRequest(body);

    try {
      return NextResponse.json(
        await runLunaInternal(normalizedRequest, suppliedApiKey),
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof SimulationRouteError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          {
            status: error.status,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
      return NextResponse.json(
        {
          error: error instanceof Error
            ? `Luna가 다음 장면을 만들지 못했습니다. ${error.message}`
            : "Luna가 다음 장면을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
          code: "LUNA_REQUEST_FAILED",
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "요청 데이터를 읽을 수 없습니다." },
      { status: 400 },
    );
  }
}
