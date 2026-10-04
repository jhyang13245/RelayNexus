import type {
  EngineCallUsage,
  EngineReasoningEffort,
} from "./engine";
import type { LiveCanonAnchorGuard } from "./live-canon-anchor";
import { textCostUsd } from "./api-cost";

export const LIVE_PLAN_KIND = "relay_live_scene_plan_v1" as const;

export type LiveScenePlan = {
  scenePlan: string;
  openingDirection: string;
  endingDirection: string;
  mustShow: string[];
  mustAvoid: string[];
  targetTime: string;
  targetLocation: string;
  beatAdvanced: boolean;
  eventResolved: boolean;
};

export type LiveBeatPhase =
  | "first_draft"
  | "closure_build_up"
  | "final_closure";

export type LiveBeatPolicy = {
  phase: LiveBeatPhase;
  beat: number;
  totalBeats: number;
  /** One deterministic sentence gate pass; never another paid prose draft. */
  correctionLimit: 0 | 1;
  preserveFailedDraft: boolean;
  closureExtension?: boolean;
  closureExtensionStage?: 1 | 2;
};

export type LiveDiagnosticContract = {
  eventName: string;
  timeWindow: string;
  currentTime: string;
  currentLocation: string;
  targetLocation: string;
  requiredItems: string[];
  requiredDialogue: string[];
  completionSignals: string[];
  currentBeatSignals: string[];
};

export type LiveSpeakerBinding = {
  /** Opaque ID exposed to the live writer. Never a package character ID. */
  streamId: string;
  characterId: string;
  visibleName: string;
};

export type LivePlanEnvelope = {
  kind: typeof LIVE_PLAN_KIND;
  plan: LiveScenePlan;
  /** Bounded public facts required before the first prose token. */
  publicWriterContext: Record<string, unknown>;
  /** Full public bookkeeping context used only after prose is complete. */
  publicSidecarContext?: Record<string, unknown>;
  writerStaticPrompt: string;
  /** Full cached state/recommendation prompt used only by the post-prose call. */
  sidecarStaticPrompt?: string;
  /** Defers the legacy full prompt until prose is already visible. Internal only. */
  sidecarStaticPromptFactory?: () => string;
  protectedTerms: string[];
  /** Exact, high-confidence phrases from the next three events. */
  futureProgressionTerms?: string[];
  /** Rare paragraph rewind gate for a player-authored hard time/place jump. */
  canonAnchorGuard?: LiveCanonAnchorGuard;
  beatPolicy: LiveBeatPolicy;
  diagnosticContract: LiveDiagnosticContract;
  speakerBindings?: LiveSpeakerBinding[];
  /** Stream prose first, then derive state/memory/UI sidecars in a second call. */
  splitSidecar?: boolean;
  model: string;
  baseUrl?: string;
  reasoningEffort: EngineReasoningEffort;
  maxOutputTokens: number;
  promptCacheKey: string;
  planUsage: EngineCallUsage;
};

export type LiveRuntimeRequest =
  | { phase: "plan" }
  | {
      phase: "finalize";
      turn: Record<string, unknown>;
      beatPolicy: LiveBeatPolicy;
    };

export const liveScenePlanSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    scenePlan: { type: "string", minLength: 40, maxLength: 1400 },
    openingDirection: { type: "string", minLength: 8, maxLength: 320 },
    endingDirection: { type: "string", minLength: 8, maxLength: 320 },
    mustShow: {
      type: "array",
      items: { type: "string", maxLength: 240 },
      minItems: 1,
      maxItems: 8,
    },
    mustAvoid: {
      type: "array",
      items: { type: "string", maxLength: 180 },
      maxItems: 6,
    },
    targetTime: { type: "string", maxLength: 40 },
    targetLocation: { type: "string", maxLength: 160 },
    beatAdvanced: { type: "boolean" },
    eventResolved: { type: "boolean" },
  },
  required: [
    "scenePlan",
    "openingDirection",
    "endingDirection",
    "mustShow",
    "mustAvoid",
    "targetTime",
    "targetLocation",
    "beatAdvanced",
    "eventResolved",
  ],
} as const;

export const isLivePlanEnvelope = (value: unknown): value is LivePlanEnvelope => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LivePlanEnvelope>;
  return candidate.kind === LIVE_PLAN_KIND &&
    Boolean(candidate.plan) &&
    Boolean(candidate.publicWriterContext) &&
    typeof candidate.writerStaticPrompt === "string" &&
    Array.isArray(candidate.protectedTerms) &&
    (candidate.futureProgressionTerms === undefined ||
      Array.isArray(candidate.futureProgressionTerms)) &&
    (candidate.canonAnchorGuard === undefined ||
      typeof candidate.canonAnchorGuard === "object") &&
    Boolean(candidate.beatPolicy) &&
    Boolean(candidate.diagnosticContract) &&
    typeof candidate.model === "string";
};

const normalizedDisclosureText = (value: string): string =>
  value.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

/**
 * Protection lists are package data, not prose filters.  A few legacy packs
 * derived them from sentences such as "진명은 공개하지 않는다" and ended up
 * registering grammar words ("또는", "않는다") as secrets.  Those words must
 * never be allowed to stop an otherwise safe scene.
 */
const PROTECTED_TERM_STOPWORDS = new Set([
  "그리고", "그러나", "하지만", "또는", "혹은", "또한", "대신", "때문", "경우",
  "한다", "된다", "있다", "없다", "않다", "않는다", "아니다", "말한다", "보인다",
  "공개", "비공개", "미공개", "누설", "금지", "보호", "정보", "내용", "명칭",
  "정체", "진명", "본명", "비밀", "사건", "미래", "과거", "인물", "플레이어",
  "사용자", "작가", "시스템", "서버", "장면", "본문", "대사", "행동", "감정",
  "아직", "먼저", "이번", "현재", "다음", "직접", "절대", "임의", "확정",
  "full", "partial", "forbidden", "hidden", "secret", "private", "truename",
]);

const cleanProtectedTerm = (value: string): string =>
  value.normalize("NFKC")
    .trim()
    .replace(/^[\s'"“”‘’`()[\]{}<>《》〈〉「」『』:：;,，.。!?！？·|/\\-]+/gu, "")
    .replace(/[\s'"“”‘’`()[\]{}<>《》〈〉「」『』:：;,，.。!?！？·|/\\-]+$/gu, "")
    .trim();

// Reveal guards are a lexicon, not a place to store serialized runtime state or
// full scene prose. Keeping this bounded also guarantees that the flexible
// punctuation-tolerant matcher stays well below JavaScript engine regexp limits.
export const MAX_PROTECTED_TERM_CHARACTERS = 96;

const protectedTermCharacters = (value: string): string[] =>
  [...value.normalize("NFKC")].filter((character) => /[\p{L}\p{N}]/u.test(character));

export const sanitizeProtectedTerms = (terms: string[]): string[] => {
  const seen = new Set<string>();
  const accepted: string[] = [];
  for (const raw of terms) {
    const term = cleanProtectedTerm(String(raw ?? ""));
    const characters = protectedTermCharacters(term);
    const key = normalizedDisclosureText(term);
    if (
      key.length < 2 ||
      characters.length > MAX_PROTECTED_TERM_CHARACTERS ||
      PROTECTED_TERM_STOPWORDS.has(key)
    ) continue;
    if (/(?:공개|누설|말하|밝히|드러내|숨기)/u.test(term) &&
      /(?:않(?:는)?다|금지|말\s*것|하지\s*마)/u.test(term)) continue;
    if (/^(?:하지|되지|아니|않).*(?:다|음)$/u.test(term)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push(term);
  }
  return accepted.sort((left, right) =>
    normalizedDisclosureText(right).length - normalizedDisclosureText(left).length
  );
};

export type ProtectedTermMatch = {
  term: string;
  index: number;
  end: number;
  matchedText: string;
};

export const findProtectedTerm = (
  value: string,
  protectedTerms: string[],
): string | undefined => findProtectedTermMatch(value, protectedTerms)?.term;

const escapeRegularExpression = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const flexibleProtectedTermPattern = (term: string): RegExp | undefined => {
  const characters = protectedTermCharacters(term);
  if (
    characters.length < 2 ||
    characters.length > MAX_PROTECTED_TERM_CHARACTERS
  ) return undefined;
  const latinOnly = characters.every((character) => /[A-Za-z0-9]/u.test(character));
  return new RegExp(
    `${latinOnly ? "(?<![A-Za-z0-9])" : ""}${
      characters.map(escapeRegularExpression).join("[\\s\\p{P}\\p{S}]*")
    }${latinOnly ? "(?![A-Za-z0-9])" : ""}`,
    "giu",
  );
};

export const replaceProtectedTermMatches = (
  value: string,
  protectedTerms: string[],
  replacement: string,
): string => {
  let text = value;
  for (const term of sanitizeProtectedTerms(protectedTerms)) {
    const pattern = flexibleProtectedTermPattern(term);
    if (pattern) text = text.replace(pattern, replacement);
  }
  return text;
};

export const findProtectedTermMatch = (
  value: string,
  protectedTerms: string[],
): ProtectedTermMatch | undefined => {
  let earliest: ProtectedTermMatch | undefined;
  for (const term of sanitizeProtectedTerms(protectedTerms)) {
    const pattern = flexibleProtectedTermPattern(term);
    const match = pattern?.exec(value);
    if (!match || match.index === undefined) continue;
    const candidate = {
      term,
      index: match.index,
      end: match.index + match[0].length,
      matchedText: match[0],
    };
    if (!earliest || candidate.index < earliest.index ||
      (candidate.index === earliest.index && candidate.end > earliest.end)) {
      earliest = candidate;
    }
  }
  return earliest;
};

export type LiveSentenceCorrection = {
  text: string;
  corrected: boolean;
  reasons: string[];
  remainingProtectedTerm?: string;
};

/**
 * A single deterministic real-time correction pass. It only masks explicit
 * protected lexemes and therefore can run before a completed sentence is
 * exposed without delaying first-token streaming for another model call.
 */
export const correctProtectedTermsOnce = (
  value: string,
  protectedTerms: string[],
): LiveSentenceCorrection => {
  let text = value;
  const reasons: string[] = [];
  for (const term of sanitizeProtectedTerms(protectedTerms)) {
    if (!findProtectedTerm(text, [term])) continue;
    const pattern = flexibleProtectedTermPattern(term);
    if (!pattern) continue;
    text = text.replace(pattern, "아직 정체가 드러나지 않은 대상");
    reasons.push(`비공개 명칭 ‘${term}’ 공개 표현 교정`);
  }
  return {
    text,
    corrected: reasons.length > 0,
    reasons,
    remainingProtectedTerm: findProtectedTerm(text, protectedTerms),
  };
};

export const livePlanDeveloperPrompt = `너는 Relay Nexus의 비공개 장면 감독이다.
제공된 sceneContext를 읽고 다음 한 턴을 위한 짧은 실행 계획 JSON만 작성한다.

- 플레이어 입력의 실제 시도와 세계의 직접 반응을 첫 인과로 둔다.
- 첫 비트에서는 자유로운 반응과 가능성을 발전시키고 사건을 억지로 종결하지 않는다.
- 중간 비트에서는 현재 선택의 결과를 보존하면서 마지막 비트의 종결이 자연스러워질 원인·관계·단서를 한 단계 쌓는다. 아직 사건을 닫지는 않는다.
- 마지막 비트에서는 현재 시간·장소·이동 가능성을 지키면서 현재 사건의 결과로 수렴하고 이번 턴에 종결한다.
- 마지막 비트 전에는 다음 사건을 시작하지 않는다. 마지막 비트에서는 현재 사건의 완료 근거를 먼저 모두 성립시킨 뒤, 경과 시간·이동을 연결해 다음 정사 사건의 첫 자극이나 도착 알림까지만 열 수 있다. 다음 사건의 해결·획득·승패·비밀 공개는 계획하지 않는다.
- 공개 전 정체·미래 사건·GM 정보의 명칭이나 내용을 계획에 적지 않는다.
- 본문 문장, 대사 전문, 묘사문은 쓰지 않는다. 작가가 실행할 공개 가능한 방향만 간결하게 쓴다.
- 플레이어의 새 행동·대사·감정을 임의로 계획하지 않는다.
- mustAvoid에는 구체적인 비밀 이름을 적지 말고 "공개 전 정체" 같은 범주만 쓴다.`;

export const liveWriterPromptSuffix = `

[Instant Live Writer]
- 이번 호출은 승인된 장면 계획을 실제 최종 본문으로 쓰는 단 한 번의 집필이다.
- 입력에는 공개 가능한 정보와 승인된 계획만 있다. 입력에 없는 인물 정체·미래 사건·GM 사실을 추측하지 않는다.
- JSON 최상위 liveBlocks를 반드시 첫 필드로 출력한다. 각 블록은 type, speakerId, speakerName, emotion, text 순서로 쓴다. narration 블록의 화자 필드는 빈 문자열로 두고, dialogue 블록은 allowedSpeakers에 있는 불투명 speakerId와 정확한 공개 이름만 사용한다.
- 일반 비트는 전체 650~1000자 분량의 완성된 한국어 장르소설 장면으로 쓰되, 마지막 비트는 별도 확장 종결 정책이 요구하는 대화·반응·결과가 모두 성립할 때까지 1400~2400자까지 충분히 이어 쓴다.
- 초안 보고, 자체 검사 설명, 계획 설명, 시스템 용어를 출력하지 않는다.
- 승인 계획과 충돌하지 않는 범위에서 문장·대사·감각 묘사는 자유롭게 완성한다.
- liveBlocks 이후의 장부 필드는 블록 본문에 실제로 성립한 사실만 기록한다.
- 출력 도중 별도의 수정본을 다시 시작하지 않는다. 처음 출력하는 liveBlocks 자체가 최종본이다.`;

export const publicWriterContextFromScene = (
  sceneContext: Record<string, unknown>,
): Record<string, unknown> => {
  const {
    activeEvent,
    disclosure: _disclosure,
    ...publicContext
  } = sceneContext;
  void _disclosure;
  const event = activeEvent && typeof activeEvent === "object" && !Array.isArray(activeEvent)
    ? activeEvent as Record<string, unknown>
    : null;
  const currentBeat = event?.currentBeat && typeof event.currentBeat === "object" &&
      !Array.isArray(event.currentBeat)
    ? event.currentBeat as Record<string, unknown>
    : null;
  const characters = Array.isArray(sceneContext.characters)
    ? sceneContext.characters
    : [];
  const inputContract = sceneContext.playerInputContract &&
      typeof sceneContext.playerInputContract === "object" &&
      !Array.isArray(sceneContext.playerInputContract)
    ? sceneContext.playerInputContract as Record<string, unknown>
    : {};
  const inputText = String(inputContract.original ?? "").normalize("NFKC");
  const currentBeatText = currentBeat
    ? [currentBeat.content, currentBeat.requiredSignals].filter(Boolean).join("\n")
    : "";
  const requiredSpeakerText = String(event?.requiredSpeakerId ?? "").normalize("NFKC");
  const communicationRequested =
    /(?:말(?:하|을|해)|묻|질문|대답|답하|토론|논쟁|설명|설득|인사|부르|외치|대화|통화|전화|연락|방송|전달)/u
      .test(inputText);
  const sceneAnchor = sceneContext.sceneAnchor &&
      typeof sceneContext.sceneAnchor === "object" &&
      !Array.isArray(sceneContext.sceneAnchor)
    ? sceneContext.sceneAnchor as Record<string, unknown>
    : {};
  const currentLocation = String(sceneAnchor.location ?? "").normalize("NFKC").trim();
  const recentDialogue = Array.isArray(sceneContext.recentTurns)
    ? sceneContext.recentTurns.slice(-2).flatMap((turnValue) => {
        if (!turnValue || typeof turnValue !== "object" || Array.isArray(turnValue)) return [];
        const turn = turnValue as Record<string, unknown>;
        const turnLocation = String(turn.location ?? "").normalize("NFKC").trim();
        if (currentLocation && turnLocation && currentLocation !== turnLocation) return [];
        const blocks = turn.blocks;
        return Array.isArray(blocks)
          ? blocks.filter((blockValue) =>
              blockValue && typeof blockValue === "object" &&
              !Array.isArray(blockValue) &&
              String((blockValue as Record<string, unknown>).type ?? "") === "dialogue"
            ) as Record<string, unknown>[]
          : [];
      })
    : [];
  const includesIdentity = (corpus: string, id: string, name: string): boolean => {
    const normalizedId = id.normalize("NFKC");
    const normalizedName = name.normalize("NFKC");
    return Boolean(
      (normalizedId && corpus.includes(normalizedId)) ||
      (normalizedName && corpus.includes(normalizedName))
    );
  };
  const publicCharacters = characters.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
    const character = candidate as Record<string, unknown>;
    const id = String(character.id ?? "").trim();
    const name = String(character.visibleName ?? "").trim();
    const beatNameIndex = name
      ? currentBeatText.normalize("NFKC").indexOf(name.normalize("NFKC"))
      : -1;
    const beatNameContext = beatNameIndex >= 0
      ? currentBeatText.normalize("NFKC").slice(
          Math.max(0, beatNameIndex - 12),
          beatNameIndex + name.length + 14,
        )
      : "";
    const onlyAbsentReference =
      /(?:부재|실종|사라진|없는|떠난|세상을\s*떠|연락이?\s*(?:끊|닿지)|행방불명|사망)/u.test(beatNameContext);
    const recentlySpoke = recentDialogue.some((block) =>
      String(block.speakerId ?? "").trim() === id ||
      String(block.speakerName ?? "").trim() === name
    );
    const speakerEligible = character.isPlayer === true ||
      recentlySpoke ||
      includesIdentity(requiredSpeakerText, id, name) ||
      (beatNameIndex >= 0 && !onlyAbsentReference) ||
      (communicationRequested && includesIdentity(inputText, id, name));
    return { ...character, speakerEligible };
  });
  let publicParticipants = String(event?.participants ?? "");
  for (const candidate of publicCharacters) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const character = candidate as Record<string, unknown>;
    const id = String(character.id ?? "").trim();
    const name = String(character.visibleName ?? "").trim();
    if (id && name) publicParticipants = publicParticipants.split(id).join(name);
  }

  // The compiler has already redacted this object. The live writer still must
  // not receive the event's completion contract, future beats, recovery route,
  // effects, or server IDs. It only needs the public dramatic premise and the
  // current beat to avoid turning a compact prompt into generic clue spam.
  const drama = event
    ? {
        eventName: event.name ?? "현재 장면",
        participants: publicParticipants,
        timeWindow: event.timeWindow ?? "",
        premise: currentBeat ? "" : event.description ?? "",
        currentBeat: currentBeat
          ? {
              number: currentBeat.number ?? 1,
              total: currentBeat.total ?? 1,
              title: currentBeat.title ?? "",
              intent: currentBeat.content ?? "",
              viewpoint: currentBeat.viewpoint ?? "",
              requiredSignals: currentBeat.requiredSignals ?? "",
            }
          : null,
      }
    : null;
  return {
    ...publicContext,
    characters: publicCharacters,
    ...(drama ? { drama } : {}),
  };
};

export const liveSpeakerBindingsFromContext = (
  publicContext: Record<string, unknown>,
): LiveSpeakerBinding[] => {
  const characters = Array.isArray(publicContext.cast)
    ? publicContext.cast
    : Array.isArray(publicContext.characters)
      ? publicContext.characters
      : [];
  return characters.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const character = candidate as Record<string, unknown>;
    const characterId = String(character.id ?? "").trim();
    const visibleName = String(character.visibleName ?? "").trim();
    if (character.speakerEligible === false) return [];
    if (!characterId || !visibleName) return [];
    return [{
      streamId: `VISIBLE_SPEAKER_${index + 1}`,
      characterId,
      visibleName,
    }];
  }).slice(0, 16);
};

export const extractPartialJsonStringField = (
  json: string,
  field: string,
): { value: string; complete: boolean; found: boolean; malformed: boolean } => {
  const marker = new RegExp(`"${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"`, "u");
  const match = marker.exec(json);
  if (!match) return { value: "", complete: false, found: false, malformed: false };
  let index = (match.index ?? 0) + match[0].length;
  let value = "";
  while (index < json.length) {
    const char = json[index];
    if (char === '"') {
      return { value, complete: true, found: true, malformed: false };
    }
    if (char !== "\\") {
      value += char;
      index += 1;
      continue;
    }
    if (index + 1 >= json.length) {
      return { value, complete: false, found: true, malformed: false };
    }
    const escaped = json[index + 1];
    const simple: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    if (escaped === "u") {
      const hex = json.slice(index + 2, index + 6);
      if (hex.length < 4) {
        return { value, complete: false, found: true, malformed: false };
      }
      if (!/^[0-9a-f]{4}$/iu.test(hex)) {
        return { value, complete: false, found: true, malformed: true };
      }
      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 6;
      continue;
    }
    if (!(escaped in simple)) {
      return { value, complete: false, found: true, malformed: true };
    }
    value += simple[escaped];
    index += 2;
  }
  return { value, complete: false, found: true, malformed: false };
};

export type PartialLiveWriterBlock = {
  type: string;
  speakerId: string;
  speakerName: string;
  emotion: string;
  text: string;
  textComplete: boolean;
  objectComplete: boolean;
};

/** Parses completed metadata and the growing text field without waiting for the
 * rest of the strict JSON document. The writer schema deliberately puts text
 * last, so speaker/type metadata is known before the first visible grapheme. */
export const extractPartialLiveBlocks = (
  json: string,
): {
  found: boolean;
  complete: boolean;
  malformed: boolean;
  blocks: PartialLiveWriterBlock[];
} => {
  const compactMarker = /"b"\s*:\s*\[/u.exec(json);
  const legacyMarker = /"liveBlocks"\s*:\s*\[/u.exec(json);
  const marker = compactMarker ?? legacyMarker;
  const compact = Boolean(compactMarker && marker === compactMarker);
  if (!marker) return { found: false, complete: false, malformed: false, blocks: [] };
  const start = (marker.index ?? 0) + marker[0].length;
  const slices: Array<{ value: string; complete: boolean }> = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let complete = false;

  for (let index = start; index < json.length; index += 1) {
    const character = json[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
      continue;
    }
    if (character === "}") {
      if (depth <= 0) return { found: true, complete: false, malformed: true, blocks: [] };
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        slices.push({ value: json.slice(objectStart, index + 1), complete: true });
        objectStart = -1;
      }
      continue;
    }
    if (character === "]" && depth === 0) {
      complete = true;
      break;
    }
  }
  if (objectStart >= 0) slices.push({ value: json.slice(objectStart), complete: false });

  const blocks: PartialLiveWriterBlock[] = [];
  for (const slice of slices) {
    const type = extractPartialJsonStringField(slice.value, compact ? "k" : "type");
    const speakerId = extractPartialJsonStringField(slice.value, compact ? "s" : "speakerId");
    const speakerName = extractPartialJsonStringField(slice.value, compact ? "n" : "speakerName");
    const emotion = extractPartialJsonStringField(slice.value, compact ? "e" : "emotion");
    const text = extractPartialJsonStringField(slice.value, compact ? "t" : "text");
    if ([type, speakerId, speakerName, emotion, text].some((field) => field.malformed)) {
      return { found: true, complete, malformed: true, blocks: [] };
    }
    if (!type.found && !slice.complete) continue;
    blocks.push({
      type: compact
        ? type.value === "n" ? "narration" : type.value === "d" ? "dialogue" : type.value
        : type.value,
      speakerId: speakerId.value,
      speakerName: speakerName.value,
      emotion: emotion.value,
      text: text.value,
      textComplete: text.complete,
      objectComplete: slice.complete,
    });
  }
  return { found: true, complete, malformed: false, blocks };
};

export const splitDisclosureSafePrefix = (
  value: string,
  protectedTerms: string[],
): { release: string; pending: string; protectedTerm?: string } => {
  const protectedMatch = findProtectedTermMatch(value, protectedTerms);
  if (protectedMatch) {
    return { release: "", pending: value, protectedTerm: protectedMatch.term };
  }
  const normalizedTerms = sanitizeProtectedTerms(protectedTerms)
    .map(normalizedDisclosureText)
    .filter(Boolean);
  let holdAt = value.length;
  const lowerBound = Math.max(0, value.length - 160);
  for (let index = lowerBound; index < value.length; index += 1) {
    const suffix = normalizedDisclosureText(value.slice(index));
    if (!suffix) continue;
    if (normalizedTerms.some((term) => term.startsWith(suffix))) {
      holdAt = index;
      break;
    }
  }
  return {
    release: value.slice(0, holdAt),
    pending: value.slice(holdAt),
  };
};

const trailingSentenceClosers = /[”’"'」』】）)]/u;

export const drainCompletedNarration = (
  value: string,
  flush = false,
): { commits: string[]; rest: string } => {
  const commits: string[] = [];
  let start = 0;
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    const punctuation = /[.!?。！？…]/u.test(char);
    const paragraphBreak = char === "\n";
    if (!punctuation && !paragraphBreak) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < value.length && trailingSentenceClosers.test(value[end])) end += 1;
    if (punctuation && end >= value.length && !flush) break;
    const commit = value.slice(start, end);
    if (commit) commits.push(commit);
    start = end;
    index = end;
  }
  if (flush && start < value.length) {
    commits.push(value.slice(start));
    start = value.length;
  }
  return { commits, rest: value.slice(start) };
};

export const openAIUsageFromResponse = (
  response: Record<string, unknown>,
  stage: EngineCallUsage["stage"],
  call: number,
  reasoningEffort: EngineReasoningEffort,
  durationMs: number,
): EngineCallUsage => {
  const usage = (response.usage ?? {}) as Record<string, unknown>;
  const details = (usage.input_tokens_details ?? {}) as Record<string, unknown>;
  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  const cachedInputTokens = Number(details.cached_tokens ?? 0);
  const cacheWriteTokens = Number(details.cache_write_tokens ?? 0);
  const uncachedInputTokens = Math.max(
    0,
    inputTokens - cachedInputTokens - cacheWriteTokens,
  );
  return {
    call,
    stage,
    reasoningEffort,
    rewriteReasons: [],
    durationMs,
    repairScope: "none",
    inputTokens,
    uncachedInputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    estimatedCostUsd: textCostUsd({
      model: typeof response.model === "string" ? response.model : "gpt-6-luna",
      inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens,
    }),
  };
};
