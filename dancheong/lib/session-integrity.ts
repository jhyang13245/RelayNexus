import { contractItemMentioned } from "./contract-signals";
import {
  createInitialState,
  createId,
  isTriggerBoundMediaAsset,
  scenarioMediaAssetMatchesSceneContext,
  resolveVisibleCharacterAlias,
  selectEventCharacterReferenceIds,
  selectEventTriggeredMediaAsset,
  selectPackageCharacterReferenceAsset,
  selectSaberSummoningMediaAsset,
  STORY_ROUTE_PROGRESS_VARIABLE_ID,
  type RuntimeState,
  type ScenarioPack,
  type TurnRecord,
} from "./scenario";
import { requiredEventItems, saberSummoningIsVisible } from "./story-director";
import {
  inferNarrativeChronology,
  resolveRuntimeChronology,
} from "./engine";
import {
  CLAUDE_RUNTIME_VARIABLE_ID,
  claudeContractItemObtained,
  claudeRuntimeVariable,
  readClaudeRuntime,
} from "./claude-runtime";
import { cloneRuntimeCheckpoint } from "./session-timeline";
import { fateSeoulSessionIntegrity } from "./work-adapters/fate-seoul-session-integrity";

const BUILT_IN_DEMO_PROJECT_ID = "RN-AI-KI-ACADEMY-001";

const demoBlockFingerprints = [
  "한세린의 손끝이 분석 화면을 스쳤다",
  "겹쳐 있던 두 파형이 벌어지며",
  "정답을 서두르지 않겠습니다",
  "주축으로 삼고, 다른 하나를 보조 공명",
] as const;

const demoRecommendationFingerprints = [
  "주축과 보조 공명의 구체적인 차이",
  "두 파형을 짧게 동시에",
  "권장안과 전혀 다른 능력 원리",
  "세 가지 능력의 비용과 한계",
  "권장안 외에 원소조작",
] as const;

const demoOpeningEventFingerprints = [
  "첫 번째 공명",
  "능력설계실의 첫 번째 공명",
] as const;

export type SessionIntegrityReport = {
  foreignDemoExchangeCount: number;
  hasLegacyDemoOpening: boolean;
};

export type SaberSummoningHistoryRepair = {
  turns: TurnRecord[];
  repaired: boolean;
  clearedGeneratedSceneCount: number;
};

export type RequiredEventHistoryRepair = {
  turns: TurnRecord[];
  repairedEventCount: number;
  clearedGeneratedSceneCount: number;
};

export type TriggeredMediaHistoryRepair = {
  turns: TurnRecord[];
  repaired: boolean;
  clearedPrematureMediaCount: number;
};

export type NarrativeRegressionHistoryRepair = {
  turns: TurnRecord[];
  state: RuntimeState;
  repaired: boolean;
  removedTurnCount: number;
};

export type NarrativeChronologyHistoryRepair = {
  turns: TurnRecord[];
  state: RuntimeState;
  repaired: boolean;
  repairedTurnCount: number;
};

export type NarrativeControlLeakHistoryRepair = {
  turns: TurnRecord[];
  state: RuntimeState;
  repaired: boolean;
  removedTurnCount: number;
};

export type ClaudeEventLedgerHistoryRepair = {
  turns: TurnRecord[];
  state: RuntimeState;
  repaired: boolean;
  sealedEventCount: number;
  recoveredItems: string[];
};

const visibleSessionText = (turns: TurnRecord[]) => turns.flatMap((turn) => [
  ...turn.blocks
    .filter((block) => block.type !== "system")
    .map((block) => block.text),
]).filter(Boolean).join("\n");

const rawClaudeSealedCount = (state: RuntimeState): number => {
  const variable = state.variables.find(
    (candidate) => candidate.id === CLAUDE_RUNTIME_VARIABLE_ID,
  );
  if (!variable) return 0;
  try {
    const parsed = JSON.parse(variable.detail) as { sealed?: unknown[] };
    return Array.isArray(parsed.sealed) ? parsed.sealed.length : 0;
  } catch {
    return 0;
  }
};

/**
 * Reconciles old saves where visible prose completed an event but an older
 * response omitted eventResolved. Only textually demonstrated acquisitions
 * are restored; the repair never invents a missing contract item.
 */
export function repairClaudeEventLedgerHistory(
  pack: ScenarioPack,
  state: RuntimeState,
  turns: TurnRecord[],
): ClaudeEventLedgerHistoryRepair {
  const transcript = visibleSessionText(turns);
  const previousSealedCount = rawClaudeSealedCount(state);
  const evidenceState: RuntimeState = {
    ...state,
    memories: [...state.memories, transcript],
  };
  const ledger = readClaudeRuntime(pack, evidenceState);
  const inventory = [...state.inventory];
  const recoveredItems: string[] = [];

  for (const sealed of ledger.sealed) {
    const event = pack.events.find((candidate) => candidate.id === sealed.id);
    if (!event) continue;
    for (const item of requiredEventItems(event)) {
      const alreadyOwned = inventory.some(
        (owned) => owned.normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase() ===
          item.normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase(),
      );
      if (!alreadyOwned && claudeContractItemObtained(item, transcript, inventory)) {
        inventory.push(item);
        recoveredItems.push(item);
      }
    }
  }

  const variableTemplate = claudeRuntimeVariable(ledger);
  const previousVariable = state.variables.find(
    (candidate) => candidate.id === CLAUDE_RUNTIME_VARIABLE_ID,
  );
  const nextVariable = {
    ...variableTemplate,
    status: "active" as const,
    createdTurn: previousVariable?.createdTurn ?? state.turn,
  };
  const nextState: RuntimeState = {
    ...state,
    inventory,
    variables: [
      ...state.variables.filter(
        (candidate) => candidate.id !== CLAUDE_RUNTIME_VARIABLE_ID,
      ),
      nextVariable,
    ],
  };
  const sealedEventCount = Math.max(0, ledger.sealed.length - previousSealedCount);
  const repaired = previousVariable?.detail !== nextVariable.detail ||
    recoveredItems.length > 0;
  const repairedTurns = repaired && turns.length > 0
    ? turns.map((turn, index) => index === turns.length - 1
      ? { ...turn, runtimeSnapshot: cloneRuntimeCheckpoint(nextState) }
      : turn)
    : turns;

  return {
    turns: repairedTurns,
    state: repaired ? nextState : state,
    repaired,
    sealedEventCount,
    recoveredItems,
  };
}

const NARRATIVE_CONTROL_LEAK_PATTERN =
  /(?:사용자(?:의)?\s*(?:직접\s*)?(?:행동|입력)|플레이어(?:가|의|에게)?\s*(?:직접\s*)?(?:판단|대응|선택|입력)|NPC(?:의)?\s*(?:독립|자율)\s*행동|새\s*대응\s*지점|다음\s*판단은\s*플레이어|패키지\s*정석\s*전개|(?:routeLock|statePatch|narrativeAudit|agencyAudit|recommendations|dynamicContext)|(?:시스템|서버)\s*(?:지시|복구|판정)|(?:여부|경우)에\s*따라.{0,40}(?:장면|사건|전개).{0,24}(?:진행|전개|처리)|(?:일상|후속|분기|선택지|다른)\s*장면을?\s*(?:진행|전개|처리)(?:한다|함)?)/iu;
const RESIDENTIAL_LOCATION_PATTERN =
  /(?:^|의|\s)(?:집|자택|주택|아파트|원룸|기숙사|숙소|거처|침실|방)(?:$|\s)/u;
const LEGACY_NON_RESIDENTIAL_HOME_PREP_PATTERN =
  /(?=.*휴대전화\s*알람)(?=.*오늘\s*일정표)(?=.*아직\s*집\s*안이므로)/isu;

/**
 * Drops a trailing legacy suffix that rendered director/audit instructions as
 * story prose, forced an encounter into a home, or repeated home preparation
 * while the HUD location was non-residential. Runtime cursors and turn-scoped
 * ledgers return to the final valid public snapshot.
 */
export function repairNarrativeControlLeakHistory(
  pack: ScenarioPack,
  state: RuntimeState,
  turns: TurnRecord[],
): NarrativeControlLeakHistoryRepair {
  const workRules = fateSeoulSessionIntegrity.matches(pack)
    ? fateSeoulSessionIntegrity
    : undefined;
  const lastTurn = turns.at(-1);
  const lastPublicText = lastTurn?.blocks
    .filter((block) => block.type !== "system")
    .map((block) => block.text)
    .join("\n")
    .normalize("NFKC") ?? "";
  const leaked = lastTurn?.role === "exchange" && lastTurn.blocks.some(
    (block) =>
      block.type !== "system" &&
      NARRATIVE_CONTROL_LEAK_PATTERN.test(block.text.normalize("NFKC")),
  );
  const forcedHomeEncounter = lastTurn?.role === "exchange" && Boolean(
    workRules?.isForcedHomeEncounter(
      lastTurn.statusSnapshot?.location ?? state.location,
      lastPublicText,
    ),
  );
  let malformedLocationSuffixStart = turns.length;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const publicText = turn.blocks
      .filter((block) => block.type !== "system")
      .map((block) => block.text)
      .join("\n")
      .normalize("NFKC");
    const location = turn.statusSnapshot?.location ?? state.location;
    const malformed = turn.role === "exchange" &&
      !RESIDENTIAL_LOCATION_PATTERN.test(location) &&
      LEGACY_NON_RESIDENTIAL_HOME_PREP_PATTERN.test(publicText);
    if (!malformed) break;
    malformedLocationSuffixStart = index;
  }
  const malformedLocationLoop = malformedLocationSuffixStart < turns.length;
  if (!leaked && !forcedHomeEncounter && !malformedLocationLoop) {
    return { turns, state, repaired: false, removedTurnCount: 0 };
  }

  const removeFromIndex = malformedLocationLoop
    ? malformedLocationSuffixStart
    : Math.max(0, turns.length - 1);
  const retainedTurns = turns.slice(0, removeFromIndex);
  const removedTurns = turns.slice(removeFromIndex);
  const lastValidTurn = retainedTurns.at(-1);
  const snapshot = lastValidTurn?.statusSnapshot;
  const restoredTurn = snapshot?.turn ?? Math.max(0, state.turn - 1);
  const sceneSummary = lastValidTurn?.blocks
    .filter((block) => block.type !== "system")
    .slice(-2)
    .map((block) => block.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || state.sceneSummary;
  const removedVisualIds = new Set(removedTurns.flatMap((turn) => [
    ...(turn.characterVisuals ?? []).map((visual) => visual.characterId),
    ...turn.blocks.flatMap((block) => block.speakerId ? [block.speakerId] : []),
  ]));
  const stillVisibleCharacterIds = new Set(
    retainedTurns.flatMap((turn) =>
      (turn.characterVisuals ?? []).map((visual) => visual.characterId)
    ),
  );
  const retainedPublicText = retainedTurns
    .flatMap((turn) => turn.blocks.map((block) => block.text))
    .join("\n");
  const workCharacterWasAlreadyVisible = Boolean(
    workRules?.characterWasAlreadyVisible(retainedPublicText),
  );

  return {
    turns: retainedTurns,
    state: {
      ...state,
      turn: restoredTurn,
      day: snapshot?.day ?? state.day,
      date: snapshot?.date ?? state.date,
      weekday: snapshot?.weekday ?? state.weekday,
      time: snapshot?.time ?? state.time,
      weather: snapshot?.weather ?? state.weather,
      location: snapshot?.location ?? state.location,
      sceneSummary,
      memories: state.memories.filter((memory) => {
        const normalized = memory.normalize("NFKC");
        if (NARRATIVE_CONTROL_LEAK_PATTERN.test(normalized)) return false;
        if (
          malformedLocationLoop &&
          /휴대전화\s*알람|오늘\s*일정표|아침을\s*맞아.*이동\s*준비/u.test(normalized)
        ) return false;
        if (!forcedHomeEncounter) return true;
        return workCharacterWasAlreadyVisible ||
          !workRules?.isForcedEncounterMemory(normalized);
      }),
      variables: state.variables.filter((variable) =>
        variable.createdTurn <= restoredTurn
      ),
      characterVisuals: state.characterVisuals.filter(
        (visual) =>
          !removedVisualIds.has(visual.characterId) ||
          stillVisibleCharacterIds.has(visual.characterId),
      ),
      encounteredCharacterIds: state.encounteredCharacterIds.filter(
        (characterId) =>
          !removedVisualIds.has(characterId) ||
          stillVisibleCharacterIds.has(characterId),
      ),
      autonomyLog: state.autonomyLog.filter((action) => action.turn <= restoredTurn),
      worldFacts: state.worldFacts.filter((fact) => fact.turn <= restoredTurn),
      relationshipMemories: state.relationshipMemories.filter(
        (memory) => memory.createdTurn <= restoredTurn,
      ),
      lastRelationshipMemoryIds: [],
      observableTraces: state.observableTraces.filter(
        (trace) => trace.turn <= restoredTurn,
      ),
      lastStatusChanges: [],
    },
    repaired: true,
    removedTurnCount: removedTurns.length,
  };
}

/** Reconciles legacy HUD snapshots with explicit public chronology in prose. */
export function repairNarrativeChronologyHistory(
  pack: ScenarioPack,
  state: RuntimeState,
  turns: TurnRecord[],
): NarrativeChronologyHistoryRepair {
  const initial = createInitialState(pack);
  let cursor = {
    day: initial.day,
    date: initial.date,
    weekday: initial.weekday,
    time: initial.time,
  };
  let repairedTurnCount = 0;
  const repairedTurns = turns.map((turn) => {
    if (turn.role === "opening") {
      if (!turn.statusSnapshot) return turn;
      const changed = turn.statusSnapshot.day !== cursor.day ||
        turn.statusSnapshot.date !== cursor.date ||
        turn.statusSnapshot.weekday !== cursor.weekday ||
        turn.statusSnapshot.time !== cursor.time;
      if (changed) repairedTurnCount += 1;
      return {
        ...turn,
        statusSnapshot: { ...turn.statusSnapshot, ...cursor },
      };
    }
    const snapshot = turn.statusSnapshot;
    if (!snapshot) return turn;
    const signal = inferNarrativeChronology(cursor, turn.blocks);
    const preservedDayDelta = Math.max(0, snapshot.day - cursor.day);
    const chronology = resolveRuntimeChronology(
      cursor,
      signal.time ?? snapshot.time,
      signal.dayDelta ?? (preservedDayDelta || undefined),
    );
    const changed = snapshot.day !== chronology.day ||
      snapshot.date !== chronology.date ||
      snapshot.weekday !== chronology.weekday ||
      snapshot.time !== chronology.time;
    if (changed) repairedTurnCount += 1;
    cursor = chronology;
    return changed
      ? { ...turn, statusSnapshot: { ...snapshot, ...chronology } }
      : turn;
  });
  const latestSnapshot = [...repairedTurns].reverse().find(
    (turn) => turn.statusSnapshot,
  )?.statusSnapshot;
  if (!latestSnapshot || repairedTurnCount === 0) {
    return { turns, state, repaired: false, repairedTurnCount: 0 };
  }
  return {
    turns: repairedTurns,
    state: {
      ...state,
      day: latestSnapshot.day,
      date: latestSnapshot.date,
      weekday: latestSnapshot.weekday,
      time: latestSnapshot.time,
    },
    repaired: true,
    repairedTurnCount,
  };
}

const compactContractText = (value: string): string =>
  value.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

const splitContractList = (value = "", includeComma = false): string[] =>
  [...new Set(value
    .split(includeComma ? /[|,;\n]/u : /[|;\n]/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2))];

const genericSummoningIsVisible = (value: string): boolean => {
  const text = value.normalize("NFKC").replace(/\s+/g, " ");
  const circle =
    /소환진|마법진|마법\s*문양|원형\s*문양|빛의\s*원|바닥.{0,28}(?:문양|진)|summon(?:ing)?\s*circle/iu.test(
      text,
    );
  const manifestation =
    /현현|소환(?:되|됐|되었|발생|완료)|(?:인물|사람|소녀|소년|남자|여자|검사|인영|형체).{0,40}(?:나타(?:났|나|난)|모습을\s*드러|빛\s*속에서)|manifest(?:ed|ation)?/iu.test(
      text,
    );
  return circle && manifestation;
};

const parcelAcquisitionVisible = (value: string, requiredItems: string[]): boolean => {
  if (!requiredItems.every((item) => contractItemMentioned(item, value))) {
    return false;
  }
  return /(?:상자|택배|소포|보관함|봉투).{0,240}(?:열자|열었|꺼냈|챙겼|확보했|수령|건넸|전달|손에\s*넣|메신저백\s*안|가방\s*안)|(?:꺼냈|챙겼|확보했|수령|건넸|전달|손에\s*넣|메신저백\s*안|가방\s*안).{0,240}(?:상자|택배|소포|보관함|봉투)/u.test(
    value,
  );
};

/**
 * Removes only a trailing duplicate parcel scene that an older director
 * generated after the same package and authored items had already been
 * acquired. A player's follow-up pointing out the duplicate is removed with
 * the bad scene, and the runtime clock/location return to the last valid turn.
 */
export function repairNarrativeRegressionHistory(
  pack: ScenarioPack,
  state: RuntimeState,
  turns: TurnRecord[],
): NarrativeRegressionHistoryRepair {
  const parcelEvents = pack.events.filter((event) =>
    /(?:택배|소포|배송|보관함|parcel|delivery)/iu.test(
      `${event.name} ${event.description} ${event.effects}`,
    )
  );
  for (const event of parcelEvents) {
    const requiredItems = requiredEventItems(event);
    if (!requiredItems.length) continue;
    const texts = turns.map((turn) =>
      turn.blocks.map((block) => block.text).join("\n")
    );
    const firstAcquisitionIndex = texts.findIndex((text) =>
      parcelAcquisitionVisible(text, requiredItems)
    );
    if (firstAcquisitionIndex < 0) continue;
    const duplicateIndex = texts.findIndex((text, index) =>
      index > firstAcquisitionIndex &&
      parcelAcquisitionVisible(text, requiredItems) &&
      /(?:다시\s*진동|배송\s*(?:직원|담당자)|새\s*(?:택배|봉투|배송)|현재\s*위치까지|실제\s*수령)/u.test(text)
    );
    if (duplicateIndex < 0) continue;
    const duplicateTail = texts.slice(duplicateIndex);
    if (!duplicateTail.every((text, index) =>
      index === 0 ||
      /(?:중복|새로\s*온\s*물건이\s*아니|이미\s*수령|같은\s*내용을\s*두\s*번|배송\s*전산|추가\s*물품.{0,24}없)/u.test(text)
    )) {
      continue;
    }

    const retainedTurns = turns.slice(0, duplicateIndex);
    const lastValidTurn = retainedTurns.at(-1);
    const snapshot = lastValidTurn?.statusSnapshot;
    const restoredTurn = snapshot?.turn ?? Math.max(
      0,
      state.turn - (turns.length - duplicateIndex),
    );
    const restoredSceneSummary = lastValidTurn?.blocks
      .filter((block) => block.type !== "system")
      .slice(-2)
      .map((block) => block.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500) || state.sceneSummary;
    return {
      turns: retainedTurns,
      state: {
        ...state,
        turn: restoredTurn,
        day: snapshot?.day ?? state.day,
        date: snapshot?.date ?? state.date,
        weekday: snapshot?.weekday ?? state.weekday,
        time: snapshot?.time ?? state.time,
        weather: snapshot?.weather ?? state.weather,
        location: snapshot?.location ?? state.location,
        sceneSummary: restoredSceneSummary,
        inventory: [...new Set([...state.inventory, ...requiredItems])],
        memories: state.memories.filter((memory) =>
          !/(?:분리\s*전달|중복\s*(?:배송|전산)|미수령\s*택배.{0,40}수령)/u.test(memory)
        ),
        variables: state.variables.filter((variable) =>
          variable.id !== "RELAY_SERVER_SCENE_PHASE_PROGRESS" &&
          variable.createdTurn <= restoredTurn
        ),
        lastStatusChanges: [],
      },
      repaired: true,
      removedTurnCount: turns.length - duplicateIndex,
    };
  }
  return { turns, state, repaired: false, removedTurnCount: 0 };
}

/**
 * Removes trigger CGs that older simulator versions accepted directly from
 * Luna before their authored condition was visible. The check is generic:
 * every package trigger is matched against its own event/clock/story evidence,
 * while summoning CGs additionally require an actual circle + manifestation.
 */
export function repairPrematureTriggeredMediaHistory(
  pack: ScenarioPack,
  turns: TurnRecord[],
): TriggeredMediaHistoryRepair {
  const assets = new Map((pack.mediaAssets ?? []).map((asset) => [asset.id, asset]));
  const triggers = new Map((pack.imageTriggers ?? []).map((trigger) => [trigger.id, trigger]));
  const events = new Map(pack.events.map((event) => [event.id, event]));
  const clocks = new Map(pack.clocks.map((clock) => [clock.id, clock]));
  const firedTriggerIds = new Set<string>();
  let clearedPrematureMediaCount = 0;

  const repairedTurns = turns.map((turn) => {
    const turnText = turn.blocks.map((block) => block.text).join("\n");
    let changed = false;
    const blocks = turn.blocks.map((block) => {
      const asset = assets.get(block.mediaAssetId ?? "");
      if (!asset || !isTriggerBoundMediaAsset(asset)) return block;

      const trigger = triggers.get(asset.triggerId ?? "") ??
        [...triggers.values()].find((candidate) =>
          candidate.sourceId === asset.triggerSourceId
        );
      const event = events.get(trigger?.sourceId ?? asset.triggerSourceId ?? "");
      const clock = clocks.get(trigger?.sourceId ?? asset.triggerSourceId ?? "");
      const evidenceAsset = {
        ...asset,
        sceneTags: [
          ...asset.sceneTags,
          trigger?.name ?? "",
          trigger?.storyProgress ?? "",
          trigger?.customCondition ?? "",
          event?.name ?? "",
          event?.completionSignals ?? "",
          event?.requiredItems ?? "",
          event?.requiredDialogue ?? "",
          event?.effects ?? "",
          event?.onSuccess ?? "",
          event?.onFailure ?? "",
          clock?.name ?? "",
        ].filter(Boolean),
      };
      const descriptor = `${trigger?.name ?? ""} ${event?.name ?? ""} ${asset.label}`;
      const summoningTrigger = /소환|현현|summon|manifest/iu.test(descriptor);
      const visibleEvidence = scenarioMediaAssetMatchesSceneContext(
        evidenceAsset,
        turnText,
      );
      const supported = Boolean(trigger?.enabled ?? true) &&
        visibleEvidence &&
        (!summoningTrigger ||
          saberSummoningIsVisible(turnText) ||
          genericSummoningIsVisible(turnText));
      const triggerKey = trigger?.id || asset.triggerId || asset.triggerSourceId || asset.id;
      const repeatedOnceTrigger = Boolean(
        supported && trigger?.once && firedTriggerIds.has(triggerKey),
      );
      if (supported && !repeatedOnceTrigger) {
        if (trigger?.once) firedTriggerIds.add(triggerKey);
        return block;
      }

      changed = true;
      clearedPrematureMediaCount += 1;
      return { ...block, mediaAssetId: "" };
    });
    return changed ? { ...turn, blocks } : turn;
  });

  return {
    turns: repairedTurns,
    repaired: clearedPrematureMediaCount > 0,
    clearedPrematureMediaCount,
  };
}

/**
 * Repairs old sessions for any package-authored required event. This is the
 * generic counterpart to the narrow legacy Saber migration below.
 */
export function repairRequiredEventHistory(
  pack: ScenarioPack,
  turns: TurnRecord[],
): RequiredEventHistoryRepair {
  let repairedTurns = turns;
  let repairedEventCount = 0;
  let clearedGeneratedSceneCount = 0;
  const requiredEvents = pack.events
    .filter((event) => event.required)
    .sort((left, right) =>
      (left.sequence ?? 1) - (right.sequence ?? 1) ||
      right.priority - left.priority
    );

  for (const event of requiredEvents) {
    const signals = splitContractList(event.completionSignals);
    const items = splitContractList(event.requiredItems, true);
    const candidates = [
      ...signals,
      ...items,
      event.requiredDialogue ?? "",
      ...(signals.length || items.length || event.requiredDialogue
        ? []
        : [event.name]),
    ].filter(Boolean).map(compactContractText);
    if (!candidates.length) continue;
    const eventTurnIndex = repairedTurns.findIndex((turn) => {
      const key = compactContractText(
        turn.blocks.map((block) => block.text).join("\n"),
      );
      return candidates.some((candidate) =>
        candidate.length >= 2 && key.includes(candidate)
      );
    });
    if (eventTurnIndex < 0) continue;

    const eventAsset = selectEventTriggeredMediaAsset(
      pack,
      event.id,
    );
    const characterIds = selectEventCharacterReferenceIds(pack, event.id);
    const canonicalReferenceAssetIds = characterIds.flatMap((characterId) => {
      const reference = selectPackageCharacterReferenceAsset(pack, characterId);
      return reference ? [reference.id] : [];
    });
    let eventRepaired = false;
    repairedTurns = repairedTurns.map((turn, turnIndex) => {
      let nextTurn = turn;
      if (turnIndex === eventTurnIndex) {
        let blocks = [...turn.blocks];
        const requiredDialogue = event.requiredDialogue?.trim() ?? "";
        if (requiredDialogue) {
          const dialogueKey = compactContractText(requiredDialogue);
          const existing = blocks.find((block) =>
            block.type === "dialogue" &&
            compactContractText(block.text) === dialogueKey
          );
          blocks = blocks.filter((block) => block !== existing);
          const speaker = pack.npcs.find((npc) =>
            npc.id === (event.requiredSpeakerId ?? "")
          );
          blocks.push({
            ...(existing ?? { id: createId() }),
            type: "dialogue",
            text: requiredDialogue,
            speakerId: speaker?.id ?? event.requiredSpeakerId ?? "",
            speakerName: existing?.speakerName?.trim() || speaker?.name || "",
            emotion: existing?.emotion || "확고함",
            mediaAssetId: eventAsset?.id ?? existing?.mediaAssetId,
          });
          if (
            turn.blocks.at(-1)?.text !== requiredDialogue ||
            (eventAsset && turn.blocks.at(-1)?.mediaAssetId !== eventAsset.id)
          ) {
            eventRepaired = true;
          }
        } else if (eventAsset && blocks.length) {
          const targetIndex = blocks.length - 1;
          if (blocks[targetIndex]?.mediaAssetId !== eventAsset.id) {
            blocks = blocks.map((block, index) => ({
              ...block,
              mediaAssetId: index === targetIndex
                ? eventAsset.id
                : block.mediaAssetId === eventAsset.id
                  ? ""
                  : block.mediaAssetId,
            }));
            eventRepaired = true;
          }
        }

        const characterVisuals = [...(turn.characterVisuals ?? [])];
        for (const characterId of characterIds.slice(0, 2)) {
          const character = pack.npcs.find((npc) => npc.id === characterId);
          const reference = character
            ? selectPackageCharacterReferenceAsset(pack, character.id)
            : undefined;
          if (!character || !reference) continue;
          const existingIndex = characterVisuals.findIndex((cue) =>
            cue.characterId === character.id
          );
          const cue = {
            blockIndex: Math.max(0, blocks.length - 1),
            characterId: character.id,
            characterName: character.name,
            importance: "major" as const,
            isFirstMajorAppearance: true,
            appearancePrompt: character.appearance,
            reason: `${event.name}의 주요 인물 등장`,
            canonicalAssetId: reference.id,
            source: "package" as const,
          };
          if (
            existingIndex < 0 ||
            characterVisuals[existingIndex]?.canonicalAssetId !== reference.id
          ) {
            if (existingIndex >= 0) characterVisuals[existingIndex] = cue;
            else characterVisuals.push(cue);
            eventRepaired = true;
          }
        }
        nextTurn = { ...turn, blocks, characterVisuals };
      }

      const involvesContractCharacter = characterIds.some((characterId) => {
        const character = pack.npcs.find((npc) => npc.id === characterId);
        return nextTurn.blocks.some((block) =>
          block.speakerId === characterId ||
          (character && resolveVisibleCharacterAlias(
            pack,
            block.speakerId ?? "",
            block.speakerName ?? "",
          )?.id === character.id)
        ) ||
          (nextTurn.characterVisuals ?? []).some((cue) =>
            cue.characterId === characterId
          );
      });
      if (
        turnIndex >= eventTurnIndex &&
        nextTurn.imageUrl &&
        involvesContractCharacter &&
        canonicalReferenceAssetIds.length > 0 &&
        !canonicalReferenceAssetIds.some((assetId) =>
          (nextTurn.imageReferenceAssetIds ?? []).includes(assetId)
        )
      ) {
        nextTurn = {
          ...nextTurn,
          imageUrl: undefined,
          imageQuality: undefined,
          imageReferenceAssetIds: undefined,
        };
        clearedGeneratedSceneCount += 1;
        eventRepaired = true;
      }
      return nextTurn;
    });
    if (eventRepaired) repairedEventCount += 1;
  }

  return { repairedEventCount, clearedGeneratedSceneCount, turns: repairedTurns };
}

const primarySaber = (pack: ScenarioPack) =>
  pack.npcs
    .map((npc) => {
      const descriptor = `${npc.name} ${npc.role} ${npc.affiliation} ${npc.publicInfo} ${npc.hiddenInfo}`;
      let score = 0;
      if (/(?:^|\b)saber(?:\b|$)|세이버/iu.test(descriptor)) score += 120;
      if (/(?:^|\b)servant(?:\b|$)|서번트|영령/iu.test(descriptor)) score += 50;
      if (fateSeoulSessionIntegrity.matches(pack)) {
        score += fateSeoulSessionIntegrity.saberIdentityScore(descriptor);
      }
      return { npc, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.npc;

/**
 * Migrates already-saved sessions affected by the old loose summoning check.
 * It restores the mandatory line and event image, then removes only generated
 * scene images that visibly include the affected Saber so they cannot keep a
 * wrong face after the package reference is restored.
 */
export function repairSaberSummoningHistory(
  pack: ScenarioPack,
  turns: TurnRecord[],
): SaberSummoningHistoryRepair {
  if (!fateSeoulSessionIntegrity.matches(pack)) {
    return { turns, repaired: false, clearedGeneratedSceneCount: 0 };
  }
  const saber = primarySaber(pack);
  if (!saber) {
    return { turns, repaired: false, clearedGeneratedSceneCount: 0 };
  }
  const summoningIndex = turns.findIndex((turn) =>
    saberSummoningIsVisible(turn.blocks.map((block) => block.text).join("\n"))
  );
  if (summoningIndex < 0) {
    return { turns, repaired: false, clearedGeneratedSceneCount: 0 };
  }

  const summoningAsset = selectSaberSummoningMediaAsset(
    pack,
    turns[summoningIndex].blocks.map((block) => block.text).join("\n"),
  );
  const canonicalReference =
    selectPackageCharacterReferenceAsset(pack, saber.id) ??
    selectPackageCharacterReferenceAsset(pack, saber.name);
  let repaired = false;
  let clearedGeneratedSceneCount = 0;

  const repairedTurns = turns.map((turn, turnIndex) => {
    let nextTurn = turn;
    if (turnIndex === summoningIndex) {
      const priorSpeaker = [...turn.blocks]
        .reverse()
        .find(
          (block) =>
            block.type === "dialogue" &&
            (block.speakerId === saber.id ||
              fateSeoulSessionIntegrity.isSaberAlias(block.speakerName ?? "")),
        );
      const priorMasterBlock = turn.blocks.at(-1);
      const priorExact =
        priorMasterBlock?.type === "dialogue" &&
        priorMasterBlock.text.trim() === fateSeoulSessionIntegrity.canonicalMasterQuestion &&
        priorMasterBlock.speakerId === saber.id;
      const blocks = turn.blocks.filter(
        (block) => !fateSeoulSessionIntegrity.isMasterQuestionVariant(block.text.trim()),
      );
      const masterBlock = {
        ...(priorExact ? priorMasterBlock : { id: createId() }),
        type: "dialogue",
        text: fateSeoulSessionIntegrity.canonicalMasterQuestion,
        speakerId: saber.id,
        speakerName:
          priorSpeaker?.speakerName?.trim() || fateSeoulSessionIntegrity.defaultSaberAlias,
        emotion: "엄숙한 확인",
        mediaAssetId: summoningAsset?.id,
      } as const;
      blocks.push(masterBlock);
      if (summoningAsset) {
        blocks.forEach((block, blockIndex) => {
          if (
            blockIndex !== blocks.length - 1 &&
            block.mediaAssetId === summoningAsset.id
          ) {
            blocks[blockIndex] = { ...block, mediaAssetId: "" };
          }
        });
      }
      const cue = canonicalReference
        ? {
            blockIndex: blocks.length - 1,
            characterId: saber.id,
            characterName: saber.name,
            importance: "major" as const,
            isFirstMajorAppearance: true,
            appearancePrompt: saber.appearance,
            reason: "우발 소환으로 현현한 주요 서번트의 첫 등장",
            canonicalAssetId: canonicalReference.id,
            source: "package" as const,
          }
        : undefined;
      const priorCue = (turn.characterVisuals ?? []).find(
        (existing) => existing.characterId === saber.id,
      );
      const cueAlreadyCanonical = Boolean(
        cue &&
        priorCue?.canonicalAssetId === cue.canonicalAssetId &&
        priorCue.source === "package" &&
        priorCue.blockIndex === cue.blockIndex,
      );
      const characterVisuals = cue && !cueAlreadyCanonical
        ? [
            ...(turn.characterVisuals ?? []).filter(
              (existing) => existing.characterId !== saber.id,
            ),
            cue,
          ]
        : turn.characterVisuals;
      repaired = repaired ||
        !priorExact ||
        Boolean(summoningAsset && priorMasterBlock?.mediaAssetId !== summoningAsset.id) ||
        Boolean(cue && !cueAlreadyCanonical);
      nextTurn = { ...turn, blocks, characterVisuals };
    }

    const involvesSaber =
      turnIndex === summoningIndex ||
      nextTurn.blocks.some(
        (block) =>
          block.speakerId === saber.id ||
          block.speakerName === saber.name ||
          fateSeoulSessionIntegrity.isSaberAlias(block.speakerName ?? ""),
      ) ||
      (nextTurn.characterVisuals ?? []).some(
        (cue) => cue.characterId === saber.id || cue.characterName === saber.name,
      ) ||
      fateSeoulSessionIntegrity.isSaberAlias(nextTurn.imagePrompt ?? "");
    const usedCanonicalReference = Boolean(
      canonicalReference &&
      (nextTurn.imageReferenceAssetIds ?? []).includes(canonicalReference.id),
    );
    if (
      turnIndex >= summoningIndex &&
      nextTurn.imageUrl &&
      involvesSaber &&
      canonicalReference &&
      !usedCanonicalReference
    ) {
      clearedGeneratedSceneCount += 1;
      repaired = true;
      nextTurn = {
        ...nextTurn,
        imageUrl: undefined,
        imageQuality: undefined,
        imageReferenceAssetIds: undefined,
      };
    }
    return nextTurn;
  });

  return { turns: repairedTurns, repaired, clearedGeneratedSceneCount };
}

const isBuiltInDemo = (pack: ScenarioPack): boolean =>
  pack.projectId === BUILT_IN_DEMO_PROJECT_ID;

const runtimeChapterTitle = (pack: ScenarioPack, state?: RuntimeState): string => {
  const progress = state?.variables.find(
    (variable) =>
      variable.id === STORY_ROUTE_PROGRESS_VARIABLE_ID &&
      variable.visibility === "hidden" &&
      variable.status === "active",
  );
  if (!progress) return "";
  try {
    const parsed = JSON.parse(progress.detail) as {
      phase?: string;
      completedEventIds?: string[];
    };
    if (parsed.phase && fateSeoulSessionIntegrity.matches(pack)) {
      const title = fateSeoulSessionIntegrity.chapterTitleForPhase(parsed.phase);
      if (title) return title;
    }
    if (parsed.phase === "required_event") {
      const completed = Array.isArray(parsed.completedEventIds)
        ? parsed.completedEventIds.length
        : 1;
      return `이야기 진행 · ${Math.max(1, completed)}번째 사건 완료`;
    }
  } catch {
    return "";
  }
  return "";
};

export function resolveChapterTitle(pack: ScenarioPack, state?: RuntimeState): string {
  const runtimeTitle = runtimeChapterTitle(pack, state);
  if (runtimeTitle) return runtimeTitle;
  const firstSentence = (pack.opening.openingEvent || "")
    .split(/[.!?。\n]/)[0]
    .trim();
  if (
    !isBuiltInDemo(pack) &&
    demoOpeningEventFingerprints.some((fingerprint) =>
      firstSentence.includes(fingerprint),
    )
  ) {
    return "프롤로그";
  }
  if (!firstSentence) return "첫 번째 장면";
  return firstSentence.length > 42
    ? `${firstSentence.slice(0, 42).trim()}…`
    : firstSentence;
}

const matchingFingerprintCount = (
  text: string,
  fingerprints: readonly string[],
): number => fingerprints.filter((fingerprint) => text.includes(fingerprint)).length;

/**
 * Detects turns written by the old built-in academy fallback inside a session
 * belonging to another ScenarioPack. Exact fingerprints keep this migration
 * narrow so ordinary academy stories are not mistaken for contamination.
 */
export function inspectSessionIntegrity(
  pack: ScenarioPack,
  turns: TurnRecord[],
): SessionIntegrityReport {
  if (isBuiltInDemo(pack)) {
    return { foreignDemoExchangeCount: 0, hasLegacyDemoOpening: false };
  }

  let foreignDemoExchangeCount = 0;
  let hasLegacyDemoOpening = false;

  turns.forEach((turn) => {
    const blockText = turn.blocks.map((block) => block.text).join("\n");
    const recommendationText = turn.recommendations
      .map((recommendation) => recommendation.label)
      .join("\n");
    const blockMatches = matchingFingerprintCount(
      blockText,
      demoBlockFingerprints,
    );
    const recommendationMatches = matchingFingerprintCount(
      recommendationText,
      demoRecommendationFingerprints,
    );

    if (turn.role === "exchange" && (blockMatches >= 1 || recommendationMatches >= 2)) {
      foreignDemoExchangeCount += 1;
    }
    if (turn.role === "opening" && recommendationMatches >= 2) {
      hasLegacyDemoOpening = true;
    }
  });

  return { foreignDemoExchangeCount, hasLegacyDemoOpening };
}
