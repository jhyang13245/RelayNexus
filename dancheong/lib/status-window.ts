import {
  defaultStatusWindow,
  type PublicStatusItem,
  type PublicStatusRelationshipDisplay,
  type PublicStatusSnapshot,
  type RuntimeState,
  type RuntimeStatusEntry,
  type RelationshipMemory,
  type ScenarioPack,
  type StatusFieldDefinition,
  type StatusLedgerChange,
  type StatusValue,
} from "./scenario";
import {
  containsStorySpoiler,
  mentionsUnobservedPlotClaim,
} from "./disclosure";

type SnapshotPatch = {
  statusAdd?: string[];
  statusRemove?: string[];
  inventoryAdd?: string[];
  inventoryRemove?: string[];
  encounteredCharactersAdd?: Array<{ characterId: string }>;
  statusLedgerChanges?: StatusLedgerChange[];
  relationChanges?: Array<{
    characterId: string;
    trustDelta: number;
  }>;
  relationshipMemoriesAdd?: RelationshipMemory[];
  clockChanges?: Array<{
    clockId: string;
    delta: number;
  }>;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const textItems = (value: string | string[]): string[] => {
  const values = Array.isArray(value) ? value : value.split(/[,|\n]/);
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].slice(
    0,
    40,
  );
};

const STATUS_IDENTITY_SECRET_PATTERN =
  /진명|마스터|서번트|계약\s*(?:관계|상대|대상|자)|소환자|true\s*name|\bmaster\b|\bservant\b/i;
const FATE_CLASS_PATTERN =
  /세이버|아처|랜서|라이더|어쌔신|캐스터|버서커|포리너|프리텐더|\bsaber\b|\barcher\b|\blancer\b|\brider\b|\bassassin\b|\bcaster\b|\bberserker\b|\bforeigner\b|\bpretender\b/i;
const STATUS_META_SPOILER_FIELD_PATTERN =
  /목표|퀘스트|미션|향후|다음\s*(?:행동|단계|사건)|비밀\s*계획|숨은\s*계획|복선|예정|사건\s*(?:시계|클록)|진행\s*클록|\bobjectives?\b|\bgoals?\b|\bquests?\b|\bmissions?\b|\bfuture\b|\bnext\s*(?:action|step|event)\b|\bevent\s*clocks?\b/i;

const statusValueText = (value: StatusValue): string =>
  Array.isArray(value) ? value.join(" ") : String(value);

export const isSensitivePublicStatusText = (value: string): boolean =>
  STATUS_IDENTITY_SECRET_PATTERN.test(value) ||
  FATE_CLASS_PATTERN.test(value) ||
  containsStorySpoiler(value);

const normalizedText = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim();

const directObservationCorpus = (state: RuntimeState): string =>
  [
    state.sceneSummary,
    ...(state.observableTraces ?? []).map((trace) => trace.text),
    ...(state.relationshipMemories ?? [])
      .filter((memory) => memory.active && memory.visibility === "Public")
      .flatMap((memory) => [memory.title, memory.summary, memory.cause]),
  ]
    .filter(Boolean)
    .join(" ");

const mentionsUndisclosedEntity = (
  pack: ScenarioPack,
  state: RuntimeState,
  value: string,
  observedText: string,
): boolean =>
  pack.npcs.some(
    (npc) =>
      !(state.encounteredCharacterIds ?? []).includes(npc.id) &&
      value.includes(npc.name),
  ) ||
  pack.factions.some(
    (faction) =>
      value.includes(faction.name) && !observedText.includes(faction.name),
  );

export const isPubliclyObservedMemory = (
  pack: ScenarioPack,
  state: RuntimeState,
  memory: string,
): boolean => {
  const openingGoal = normalizedText(pack.opening.firstGoal || "");
  const text = normalizedText(memory);
  const directObservation = directObservationCorpus(state);
  return Boolean(
    text &&
      text !== openingGoal &&
      !isSensitivePublicStatusText(text) &&
      !mentionsUndisclosedEntity(pack, state, text, directObservation) &&
      !mentionsUnobservedPlotClaim(text, directObservation),
  );
};

const observationCorpus = (pack: ScenarioPack, state: RuntimeState): string => {
  return [
    directObservationCorpus(state),
    ...(state.memories ?? []).filter((memory) =>
      isPubliclyObservedMemory(pack, state, memory)
    ),
  ]
    .filter(Boolean)
    .join(" ");
};

const CORPUS_STOP_WORDS = new Set([
  "현재",
  "상황",
  "관련",
  "대한",
  "그리고",
  "있다",
  "없다",
  "진행",
  "확인",
]);

const disclosureTokens = (value: string): string[] =>
  [
    ...new Set(
      normalizedText(value)
        .match(/[\p{L}\p{N}]{2,}/gu)
        ?.filter((token) => !CORPUS_STOP_WORDS.has(token)) ?? [],
    ),
  ].slice(0, 8);

const isCorroboratedByObservation = (
  value: string,
  corpus: string,
): boolean => {
  const normalizedValue = normalizedText(value);
  const normalizedCorpus = normalizedText(corpus);
  if (!normalizedValue || !normalizedCorpus) return false;
  if (normalizedCorpus.includes(normalizedValue)) return true;
  const tokens = disclosureTokens(normalizedValue);
  if (!tokens.length) return false;
  const matches = tokens.filter((token) => normalizedCorpus.includes(token)).length;
  return matches >= Math.min(2, tokens.length);
};

export const isPubliclyObservedVariable = (
  pack: ScenarioPack,
  state: RuntimeState,
  variable: RuntimeState["variables"][number],
): boolean => {
  if (
    variable.visibility !== "public" ||
    variable.status !== "active" ||
    variable.createdTurn <= 0 ||
    variable.createdTurn > state.turn
  ) {
    return false;
  }
  const text = `${variable.label} ${variable.detail}`;
  const corpus = observationCorpus(pack, state);
  return (
    !isSensitivePublicStatusText(text) &&
    !mentionsUnobservedPlotClaim(text, corpus) &&
    isCorroboratedByObservation(text, corpus)
  );
};

export const observableClockLabel = (
  pack: ScenarioPack,
  state: RuntimeState,
  clock: RuntimeState["clocks"][number],
): string | undefined => {
  if (/hidden|secret|private|gm|비공개|숨김/i.test(clock.visibility)) {
    return undefined;
  }
  if (clock.current <= 0) return undefined;
  const label = normalizedText(clock.publicHint || clock.name);
  const corpus = observationCorpus(pack, state);
  if (
    !label ||
    isSensitivePublicStatusText(label) ||
    mentionsUnobservedPlotClaim(label, corpus) ||
    !isCorroboratedByObservation(label, corpus)
  ) {
    return undefined;
  }
  return label;
};

const isSensitiveStatusDisclosure = (
  field: StatusFieldDefinition,
  value: StatusValue,
  reason = "",
): boolean =>
  STATUS_IDENTITY_SECRET_PATTERN.test(
    [
      field.id,
      field.label,
      field.sectionLabel,
      field.updateRule,
      statusValueText(value),
      reason,
    ].join(" "),
  );

const fateClassAlias = (value: string): string => {
  const match = value.match(FATE_CLASS_PATTERN)?.[0]?.toLowerCase();
  if (!match) return "";
  const aliases: Record<string, string> = {
    saber: "세이버",
    archer: "아처",
    lancer: "랜서",
    rider: "라이더",
    assassin: "어쌔신",
    caster: "캐스터",
    berserker: "버서커",
    foreigner: "포리너",
    pretender: "프리텐더",
  };
  return aliases[match] ?? match;
};

const fateClassWasObserved = (alias: string, observedText: string): boolean => {
  const patterns: Record<string, RegExp> = {
    세이버: /세이버|\bsaber\b/i,
    아처: /아처|\barcher\b/i,
    랜서: /랜서|\blancer\b/i,
    라이더: /라이더|\brider\b/i,
    어쌔신: /어쌔신|\bassassin\b/i,
    캐스터: /캐스터|\bcaster\b/i,
    버서커: /버서커|\bberserker\b/i,
    포리너: /포리너|\bforeigner\b/i,
    프리텐더: /프리텐더|\bpretender\b/i,
  };
  if (!alias || !patterns[alias]?.test(observedText)) return false;
  if (alias === "세이버") {
    return /(?:(?:클래스(?:명)?|영기\s*(?:반응|판정)|소환\s*적성|호칭).{0,24}(?:세이버|\bsaber\b)|(?:자신을|그녀를|소녀를).{0,16}(?:세이버|\bsaber\b)(?:라|라고|로)\s*(?:소개|밝히|말하|칭하|부르)|(?:세이버|\bsaber\b).{0,24}(?:클래스|(?:라|이라고|라고)\s*(?:소개|밝히|말하|칭하|부르)|로\s*(?:소환|판정|확인|분류)))/i.test(
      observedText,
    );
  }
  return true;
};

const publicCharacterAlias = (
  pack: ScenarioPack,
  characterId: string,
  observedText = "",
): { name: string; identityIsSecret: boolean } => {
  const character = pack.npcs.find((npc) => npc.id === characterId);
  if (!character) return { name: "정체불명의 인물", identityIsSecret: false };
  const identityIsSecret =
    /진명|true\s*name|정체.{0,12}(?:비공개|숨김|비밀)/i.test(
      character.hiddenInfo,
    ) || FATE_CLASS_PATTERN.test(character.role);
  if (!identityIsSecret) {
    return { name: character.name, identityIsSecret: false };
  }
  const namedAlias = character.publicInfo.match(
    /(?:공개\s*(?:이름|호칭|명칭)|호칭|가명|별칭|코드네임)\s*[:：]\s*([^,;\n]+)/i,
  )?.[1]?.trim();
  const classDescriptor = `${character.publicInfo} ${character.role}`;
  const classAlias = fateClassAlias(classDescriptor);
  const classWasObserved = fateClassWasObserved(classAlias, observedText);
  const safeNamedAlias = namedAlias &&
      (!FATE_CLASS_PATTERN.test(namedAlias) || classWasObserved)
    ? namedAlias
    : "";
  const authoredAlias = character.preRevealAlias?.trim() ?? "";
  const safeAuthoredAlias = authoredAlias &&
      !isSensitivePublicStatusText(authoredAlias) &&
      (!FATE_CLASS_PATTERN.test(authoredAlias) || classWasObserved)
    ? authoredAlias
    : "";
  const appearanceAlias = /세이버|\bsaber\b/i.test(classDescriptor)
    ? "정체불명의 소녀 검사"
    : "정체불명의 인물";
  return {
    name:
      safeNamedAlias ||
      safeAuthoredAlias ||
      (classWasObserved ? classAlias : "") ||
      appearanceAlias,
    identityIsSecret: true,
  };
};

const relationDisclosureCorpora = (
  pack: ScenarioPack,
  state: RuntimeState,
  memories: RelationshipMemory[],
): { relation: string; global: string } => ({
  relation: memories.flatMap((memory) => [
      memory.title,
      memory.summary,
      memory.cause,
    ]).join(" "),
  global: [
    ...(state.memories ?? []).filter((memory) =>
      isPubliclyObservedMemory(pack, state, memory)
    ),
    ...(state.variables ?? [])
      .filter((variable) => isPubliclyObservedVariable(pack, state, variable))
      .flatMap((variable) => [variable.label, variable.detail]),
  ].join(" "),
});

const relationIdentityIsDisclosed = (
  pack: ScenarioPack,
  state: RuntimeState,
  characterName: string,
  memories: RelationshipMemory[],
): boolean => {
  if (state.turn <= 0) return false;
  const corpus = relationDisclosureCorpora(pack, state, memories);
  const identityDisclosure =
    /진명|(?:정체|이름).{0,12}(?:공개|확인|밝혀|알게|소개)/i;
  return (
    identityDisclosure.test(corpus.relation) ||
    (corpus.global.includes(characterName) &&
      identityDisclosure.test(corpus.global))
  );
};

const relationContractIsDisclosed = (
  pack: ScenarioPack,
  state: RuntimeState,
  characterName: string,
  memories: RelationshipMemory[],
): boolean => {
  if (state.turn <= 0) return false;
  const corpus = relationDisclosureCorpora(pack, state, memories);
  const contractDisclosure =
    /마스터|서번트|계약.{0,12}(?:성립|체결|맺|확인)|소환자/i;
  return (
    contractDisclosure.test(corpus.relation) ||
    (corpus.global.includes(characterName) &&
      contractDisclosure.test(corpus.global))
  );
};

const statusDefinition = (pack: ScenarioPack) =>
  pack.statusWindow ?? defaultStatusWindow();

const initialLedger = (pack: ScenarioPack) =>
  (pack.initialStatusLedger ?? []).map((entry) => ({ ...entry }));

export const normalizeRuntimeStatusLedger = (
  pack: ScenarioPack,
  entries: RuntimeStatusEntry[] | undefined,
): RuntimeStatusEntry[] => {
  const merged = new Map(
    initialLedger(pack).map((entry) => [entry.fieldId, entry] as const),
  );
  (entries ?? []).forEach((entry) => {
    if (!entry?.fieldId) return;
    merged.set(entry.fieldId, {
      fieldId: entry.fieldId,
      value:
        typeof entry.value === "number" ||
        typeof entry.value === "boolean" ||
        typeof entry.value === "string" ||
        Array.isArray(entry.value)
          ? entry.value
          : "",
      grade: typeof entry.grade === "string" ? entry.grade.slice(0, 40) : "",
      revealed: Boolean(entry.revealed),
      updatedTurn: Number.isFinite(entry.updatedTurn) ? entry.updatedTurn : 0,
    });
  });
  return [...merged.values()].slice(0, 160);
};

export const sanitizeStatusLedgerChanges = (
  pack: ScenarioPack,
  changes: StatusLedgerChange[] | undefined,
): StatusLedgerChange[] => {
  const fields = new Map(
    statusDefinition(pack).fields.map((field) => [field.id, field] as const),
  );
  const sanitized: StatusLedgerChange[] = [];
  for (const raw of changes ?? []) {
    const field = fields.get(raw?.fieldId?.trim());
    if (!field || field.source) continue;
    const operation = ["set", "increment", "add", "remove", "reveal"].includes(
      raw.operation,
    )
      ? raw.operation
      : "set";
    const limit = Math.max(0, field.maxDelta || 100);
    sanitized.push({
      fieldId: field.id,
      operation,
      numericDelta: clamp(Number(raw.numericDelta) || 0, -limit, limit),
      value: typeof raw.value === "string" ? raw.value.trim().slice(0, 1200) : "",
      items: textItems(Array.isArray(raw.items) ? raw.items : []).slice(0, 20),
      grade: typeof raw.grade === "string" ? raw.grade.trim().slice(0, 40) : "",
      reveal: Boolean(raw.reveal),
      reason:
        typeof raw.reason === "string"
          ? raw.reason.trim().slice(0, 300)
          : "",
    });
    if (sanitized.length >= 12) break;
  }
  return sanitized;
};

const numericValue = (value: StatusValue): number => {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const applyStatusLedgerChanges = (
  pack: ScenarioPack,
  state: RuntimeState,
  changes: StatusLedgerChange[] | undefined,
): { ledger: RuntimeStatusEntry[]; changes: StatusLedgerChange[] } => {
  const sanitized = sanitizeStatusLedgerChanges(pack, changes);
  const fields = new Map(
    statusDefinition(pack).fields.map((field) => [field.id, field] as const),
  );
  const ledger = new Map(
    normalizeRuntimeStatusLedger(pack, state.statusLedger).map((entry) => [
      entry.fieldId,
      entry,
    ] as const),
  );

  for (const change of sanitized) {
    const field = fields.get(change.fieldId);
    if (!field) continue;
    const current = ledger.get(field.id) ?? {
      fieldId: field.id,
      value: field.kind === "number" ? 0 : field.kind === "list" ? [] : "",
      grade: "",
      revealed: field.visibility === "public",
      updatedTurn: state.turn,
    } satisfies RuntimeStatusEntry;
    let value = current.value;
    if (change.operation === "increment" && field.kind === "number") {
      const minimum = field.minimum ?? -1_000_000;
      const maximum = field.maximum ?? 1_000_000;
      value = clamp(
        numericValue(current.value) + change.numericDelta,
        minimum,
        maximum,
      );
    } else if (change.operation === "set") {
      if (field.kind === "number") {
        const parsed = Number(change.value);
        if (Number.isFinite(parsed)) {
          value = clamp(
            parsed,
            field.minimum ?? -1_000_000,
            field.maximum ?? 1_000_000,
          );
        }
      } else if (field.kind === "list") {
        value = change.items.length ? change.items : textItems(change.value);
      } else {
        value = change.value;
      }
    } else if (change.operation === "add" && field.kind === "list") {
      value = textItems([
        ...(Array.isArray(current.value) ? current.value : textItems(String(current.value))),
        ...change.items,
      ]);
    } else if (change.operation === "remove" && field.kind === "list") {
      const remove = new Set(change.items);
      value = (Array.isArray(current.value) ? current.value : textItems(String(current.value)))
        .filter((item) => !remove.has(item));
    }
    ledger.set(field.id, {
      ...current,
      value,
      grade: change.grade || current.grade,
      revealed:
        current.revealed || change.reveal || change.operation === "reveal",
      updatedTurn: state.turn + 1,
    });
  }

  return { ledger: [...ledger.values()].slice(0, 160), changes: sanitized };
};

const resolveSource = (
  source: string,
  pack: ScenarioPack,
  state: RuntimeState,
  patch?: SnapshotPatch,
): StatusValue => {
  const normalized = source.trim().toLowerCase();
  if (normalized === "player.affiliation") return pack.player.affiliation;
  if (normalized === "player.status" || normalized === "player.position") {
    return pack.player.status;
  }
  if (normalized === "player.skills") return textItems(pack.player.skills);
  if (normalized === "player.inventory" || normalized === "state.inventory") {
    return state.inventory;
  }
  if (normalized === "state.status" || normalized === "state.conditions") {
    return state.status;
  }
  if (normalized === "state.location" || normalized === "context.location") {
    return state.location;
  }
  if (normalized === "state.time" || normalized === "context.time") {
    return state.time;
  }
  if (normalized === "state.date" || normalized === "context.date") {
    return state.date;
  }
  if (normalized === "state.weather" || normalized === "context.weather") {
    return state.weather;
  }
  if (normalized === "state.objectives" || normalized === "state.goals") {
    const active = (state.variables ?? [])
      .filter((variable) => isPubliclyObservedVariable(pack, state, variable))
      .map((variable) => variable.label);
    return [...new Set(active.filter(Boolean))];
  }
  if (normalized === "state.clocks") {
    const deltas = new Map<string, number>();
    (patch?.clockChanges ?? []).forEach((change) => {
      deltas.set(change.clockId, (deltas.get(change.clockId) ?? 0) + change.delta);
    });
    return state.clocks
      .map((clock) => {
        const label = observableClockLabel(pack, state, clock);
        if (!label) return "";
        const delta = deltas.get(clock.id) ?? 0;
        return `${label} ${clock.current}/${clock.maximum}${delta ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}`;
      })
      .filter(Boolean);
  }
  return "";
};

const fieldIsVisible = (
  field: StatusFieldDefinition,
  entry: RuntimeStatusEntry | undefined,
  state: RuntimeState,
) => {
  if (field.visibility === "hidden") return false;
  if (field.visibility === "conditional") return Boolean(entry?.revealed);
  if (field.visibility === "encountered" && field.characterId) {
    return (state.encounteredCharacterIds ?? []).includes(field.characterId);
  }
  return field.visibility !== "encountered" ||
    field.source === "state.relations" ||
    Boolean(entry?.revealed);
};

const gradeFor = (
  field: StatusFieldDefinition,
  value: StatusValue,
  storedGrade: string,
) => {
  if (storedGrade) return storedGrade;
  if (typeof value !== "number" || !field.ranks.length) return "";
  return [...field.ranks]
    .sort((a, b) => b.minimum - a.minimum)
    .find((rank) => value >= rank.minimum)?.label ?? "";
};

const displayValueFor = (
  field: StatusFieldDefinition,
  value: StatusValue,
) => {
  if (field.kind === "list") {
    const values = Array.isArray(value) ? value : textItems(String(value));
    return values.length ? values.join(" · ") : "-";
  }
  if (field.kind === "number") {
    const current = numericValue(value);
    return String(current);
  }
  if (typeof value === "boolean") return value ? "활성" : "비활성";
  return String(value || "-");
};

const statusValueIsEmpty = (value: StatusValue): boolean =>
  Array.isArray(value)
    ? value.length === 0
    : value === "" || value === null || value === undefined;

export const buildPublicStatusSnapshot = (
  pack: ScenarioPack,
  state: RuntimeState,
  patch?: SnapshotPatch,
): PublicStatusSnapshot | undefined => {
  const definition = statusDefinition(pack);
  if (!definition.enabled) return undefined;
  const entries = new Map(
    normalizeRuntimeStatusLedger(pack, state.statusLedger).map((entry) => [
      entry.fieldId,
      entry,
    ] as const),
  );
  const changes = new Map(
    sanitizeStatusLedgerChanges(pack, patch?.statusLedgerChanges ?? state.lastStatusChanges)
      .map((change) => [change.fieldId, change] as const),
  );
  const sectionsById = new Map(
    definition.sections
      .filter((section) => section.enabled)
      .map((section) => [section.id, { ...section, items: [] as PublicStatusItem[] }] as const),
  );
  const relationshipDisplaysById = new Map<string, PublicStatusRelationshipDisplay>();
  const relationshipDisplayChangedIds = new Set<string>();

  for (const field of [...definition.fields].sort((a, b) => a.order - b.order)) {
    if (field.source === "state.relations") continue;
    if (
      STATUS_META_SPOILER_FIELD_PATTERN.test(
        `${field.id} ${field.label} ${field.sectionLabel} ${field.source}`,
      )
    ) {
      continue;
    }
    const entry = entries.get(field.id);
    const change = changes.get(field.id);
    if (!fieldIsVisible(field, entry, state)) continue;
    if (definition.displayMode === "summary" && !field.summary) continue;
    if (
      definition.displayMode === "changes" &&
      state.turn > 0 &&
      !change &&
      !field.relationshipDisplayId
    ) continue;
    const value = field.source
      ? resolveSource(field.source, pack, state, patch)
      : entry?.value ?? (field.kind === "list" ? [] : field.kind === "number" ? 0 : "");
    if (field.source && statusValueIsEmpty(value)) continue;
    const disclosureText = [
      field.id,
      field.label,
      field.sectionLabel,
      field.updateRule,
      statusValueText(value),
      change?.reason ?? "",
    ].join(" ");
    const observableText = observationCorpus(pack, state);
    if (
      containsStorySpoiler(disclosureText) ||
      mentionsUnobservedPlotClaim(disclosureText, observableText) ||
      mentionsUndisclosedEntity(pack, state, disclosureText, observableText)
    ) {
      continue;
    }
    if (
      isSensitiveStatusDisclosure(field, value, change?.reason) &&
      !(entry?.revealed && entry.updatedTurn > 0)
    ) {
      continue;
    }
    if (
      field.relationshipDisplayId &&
      field.relationshipEntityType &&
      field.relationshipEntityId &&
      field.relationshipPart
    ) {
      const relationshipDefinition = definition.relationshipDisplay?.entries.find(
        (candidate) => candidate.id === field.relationshipDisplayId,
      );
      const publicLabel = field.relationshipEntityType === "character"
        ? publicCharacterAlias(
            pack,
            field.relationshipEntityId,
            observationCorpus(pack, state),
          ).name
        : field.relationshipLabel || relationshipDefinition?.label || field.label;
      const current = relationshipDisplaysById.get(field.relationshipDisplayId) ?? {
        id: field.relationshipDisplayId,
        entityType: field.relationshipEntityType,
        entityId: field.relationshipEntityId,
        label: publicLabel,
        displayParts: relationshipDefinition?.displayParts ?? [],
        reason: "",
      };
      if (field.relationshipPart === "sentence") {
        current.sentence = String(value || "");
      } else if (field.relationshipPart === "symbol") {
        current.symbol = String(value || "");
      } else {
        current.stat = {
          label: field.label,
          current: numericValue(value),
          minimum: field.minimum ?? relationshipDefinition?.stat.minimum ?? -100,
          maximum: field.maximum ?? relationshipDefinition?.stat.maximum ?? 100,
          delta:
            field.showDelta && change?.operation === "increment"
              ? change.numericDelta
              : undefined,
        };
      }
      if (change) {
        relationshipDisplayChangedIds.add(field.relationshipDisplayId);
        if (!current.reason && change.reason) current.reason = change.reason;
      }
      relationshipDisplaysById.set(field.relationshipDisplayId, current);
      continue;
    }
    const grade = gradeFor(field, value, entry?.grade ?? "");
    const section = sectionsById.get(field.sectionId) ?? {
      id: field.sectionId,
      label: field.sectionLabel || "상태",
      icon: field.icon,
      order: 999,
      enabled: true,
      items: [] as PublicStatusItem[],
    };
    section.items.push({
      id: field.id,
      label: field.label,
      kind: field.kind,
      icon: field.icon,
      unit: field.unit,
      value,
      displayValue: displayValueFor(field, value),
      grade,
      maximum: field.maximum,
      delta:
        field.showDelta && change?.operation === "increment"
          ? change.numericDelta
          : undefined,
      reason: change?.reason ?? "",
    });
    sectionsById.set(field.sectionId, section);
  }

  const relationDeltas = new Map<string, number>();
  (patch?.relationChanges ?? []).forEach((change) => {
    relationDeltas.set(
      change.characterId,
      (relationDeltas.get(change.characterId) ?? 0) + change.trustDelta,
    );
  });
  const addedMemoryIds = new Set(
    (patch?.relationshipMemoriesAdd ?? [])
      .filter((memory) => memory.visibility === "Public")
      .map((memory) => memory.id),
  );
  const publicMemories = (state.relationshipMemories ?? []).filter(
    (memory) => memory.active && memory.visibility === "Public",
  );
  const relationsEnabled = definition.fields.some(
    (field) => field.source === "state.relations" && field.visibility !== "hidden",
  );
  const encountered = new Set(state.encounteredCharacterIds ?? []);
  let relations = relationsEnabled
    ? state.relations
        .filter((relation) => encountered.has(relation.characterId))
        .map((relation) => {
          const memories = publicMemories
            .filter(
              (memory) =>
                memory.relationId === relation.relationId ||
                (memory.sourceId === relation.sourceId &&
                  memory.targetId === relation.targetId),
            )
            .sort((left, right) =>
              right.createdTurn - left.createdTurn ||
              right.importance - left.importance,
            );
          const latestReason = pack.relationshipMemoryRuntime
              ?.displayPublicReasonsInHud
            ? memories[0]
            : undefined;
          const memoryDelta = memories
            .filter((memory) => addedMemoryIds.has(memory.id))
            .reduce((sum, memory) => sum + memory.effects.trust, 0);
          const relationObservation = observationCorpus(pack, state);
          const publicIdentity = publicCharacterAlias(
            pack,
            relation.characterId,
            relationObservation,
          );
          const identityDisclosed = relationIdentityIsDisclosed(
            pack,
            state,
            relation.name,
            memories,
          );
          const contractDisclosed = relationContractIsDisclosed(
            pack,
            state,
            relation.name,
            memories,
          );
          const hiddenIdentity =
            publicIdentity.identityIsSecret && !identityDisclosed;
          const hiddenContract =
            STATUS_IDENTITY_SECRET_PATTERN.test(relation.relationType) &&
            !contractDisclosed;
          const reasonTitle = latestReason?.title ?? "";
          const reasonSummary = latestReason?.summary || latestReason?.cause || "";
          const reasonText = `${reasonTitle} ${reasonSummary}`;
          const reasonIsSafe =
            !isSensitivePublicStatusText(reasonText) &&
            !mentionsUnobservedPlotClaim(reasonText, relationObservation);
          return {
            characterId: relation.characterId,
            name: hiddenIdentity ? publicIdentity.name : relation.name,
            relationType:
              hiddenContract ? "첫 만남" : relation.relationType || "첫 만남",
            trust:
              hiddenContract ? 0 : relation.publicTrust ?? relation.trust,
            delta:
              hiddenContract
                ? 0
                : memoryDelta || relationDeltas.get(relation.characterId) || 0,
            reasonTitle: reasonIsSafe ? reasonTitle : "",
            reasonSummary: reasonIsSafe ? reasonSummary : "",
          };
        })
    : [];
  if (definition.displayMode === "changes" && state.turn > 0) {
    relations = relations.filter((relation) => relation.delta !== 0);
  }
  let relationshipDisplays = [...relationshipDisplaysById.values()];
  if (definition.displayMode === "changes" && state.turn > 0) {
    relationshipDisplays = relationshipDisplays.filter((entry) =>
      relationshipDisplayChangedIds.has(entry.id),
    );
  }
  const statusChangeCount =
    [...changes.keys()].filter((fieldId) =>
      !definition.fields.find((field) => field.id === fieldId)?.relationshipDisplayId,
    ).length +
    relationshipDisplayChangedIds.size +
    relations.filter((relation) => relation.delta !== 0).length +
    (patch?.clockChanges ?? []).filter((change) => change.delta !== 0).length +
    (patch?.statusAdd ?? []).length +
    (patch?.statusRemove ?? []).length +
    (patch?.inventoryAdd ?? []).length +
    (patch?.inventoryRemove ?? []).length +
    (patch?.encounteredCharactersAdd ?? []).length +
    (patch?.relationshipMemoriesAdd ?? []).filter(
      (memory) => memory.visibility === "Public",
    ).length;
  const traceObservation = observationCorpus(pack, state);
  const worldTraces = (state.observableTraces ?? [])
    .filter(
      (trace) =>
        trace.turn === state.turn &&
        !isSensitivePublicStatusText(trace.text) &&
        !mentionsUnobservedPlotClaim(trace.text, traceObservation),
    )
    .slice(-4);
  return {
    turn: state.turn,
    title: definition.title,
    displayMode: definition.displayMode,
    defaultExpanded: definition.defaultExpanded,
    day: state.day,
    date: state.date,
    weekday: state.weekday,
    time: state.time,
    weather: state.weather,
    location: state.location,
    sections: [...sectionsById.values()]
      .filter((section) => section.items.length)
      .sort((a, b) => a.order - b.order)
      .map(({ id, label, icon, items }) => ({ id, label, icon, items })),
    relations,
    relationshipDisplays,
    worldTraces,
    changedCount: statusChangeCount + worldTraces.length,
  };
};

export const sanitizeStoredPublicStatusSnapshot = (
  pack: ScenarioPack,
  snapshot: PublicStatusSnapshot,
): PublicStatusSnapshot => {
  const openingGoal = normalizedText(pack.opening.firstGoal || "");
  const sections = (snapshot.sections ?? [])
    .map((section) => ({
      ...section,
      items: (section.items ?? []).filter(
        (item) => {
          const text = [
            section.label,
            item.label,
            item.displayValue,
            item.reason,
          ].join(" ");
          return (
            !STATUS_META_SPOILER_FIELD_PATTERN.test(
              `${section.id} ${section.label} ${item.id} ${item.label}`,
            ) &&
            !isSensitivePublicStatusText(text) &&
            (!openingGoal || !normalizedText(text).includes(openingGoal))
          );
        },
      ),
    }))
    .filter((section) => section.items.length > 0);
  const relations = (snapshot.relations ?? []).map((relation) => {
    const publicIdentity = publicCharacterAlias(pack, relation.characterId);
    const hiddenContract = isSensitivePublicStatusText(
      relation.relationType,
    );
    return {
      ...relation,
      name: publicIdentity.identityIsSecret
        ? publicIdentity.name
        : relation.name,
      relationType: hiddenContract ? "첫 만남" : relation.relationType,
      trust: hiddenContract ? 0 : relation.trust,
      delta: hiddenContract ? 0 : relation.delta,
      reasonTitle: isSensitivePublicStatusText(relation.reasonTitle)
        ? ""
        : relation.reasonTitle,
      reasonSummary: isSensitivePublicStatusText(relation.reasonSummary)
        ? ""
        : relation.reasonSummary,
    };
  });
  const relationshipDisplays = (snapshot.relationshipDisplays ?? []).flatMap((entry) => {
    const publicLabel = entry.entityType === "character"
      ? publicCharacterAlias(pack, entry.entityId).name
      : entry.label;
    const unsafeText = [
      publicLabel,
      entry.sentence ?? "",
      entry.stat?.label ?? "",
      entry.reason,
    ].join(" ");
    if (isSensitivePublicStatusText(unsafeText)) return [];
    return [{ ...entry, label: publicLabel }];
  });
  const worldTraces = (snapshot.worldTraces ?? []).filter(
    (trace) => !isSensitivePublicStatusText(trace.text),
  );
  return {
    ...snapshot,
    sections,
    relations,
    relationshipDisplays,
    worldTraces,
    changedCount:
      sections.flatMap((section) => section.items).filter(
        (item) => item.delta !== undefined && item.delta !== 0,
      ).length +
      relations.filter((relation) => relation.delta !== 0).length +
      relationshipDisplays.filter((entry) => entry.stat?.delta !== undefined).length +
      worldTraces.length,
  };
};
