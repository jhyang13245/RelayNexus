import type {
  SessionCanonEntry,
  SessionCanonKind,
  SessionCanonTruth,
  SessionCanonUpdate,
} from "./scenario";

type CanonCharacter = { id: string; name: string };
type CanonDialogue = { speakerId?: string; speakerName?: string; text: string };

const compact = (value: string) => value
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[\s\p{P}\p{S}]+/gu, "");

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const clip = (value: string, max: number) => {
  const normalized = String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
};

const STOP_WORDS = new Set([
  "그리고", "그런데", "그러면", "사실", "방금", "지금", "이것", "저것",
  "대체", "당신", "정체", "정말", "그냥", "이미", "아직", "대해서",
  "사용", "했다", "한다", "된다", "있는", "없는", "인가요", "건가요",
]);

const tokens = (value: string) => [...new Set(
  value.normalize("NFKC").match(/[\p{L}\p{N}]{2,}/gu) ?? [],
)].map((token) => token.replace(
  /(?:에게|한테|께서|께|으로|에서|라는|이라고|였다고|이라고|은|는|이|가|을|를|와|과|에)$/u,
  "",
)).filter((token) => token.length >= 2 && !STOP_WORDS.has(token));

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const truthForKind = (kind: SessionCanonKind): SessionCanonTruth =>
  kind === "player_hypothesis"
    ? "unconfirmed"
    : kind === "refuted_hypothesis"
      ? "refuted"
      : kind === "pending_consequence"
        ? "pending"
        : "confirmed";

const originForKind = (kind: SessionCanonKind): "player" | "scene" =>
  kind === "player_hypothesis" || kind === "refuted_hypothesis"
    ? "player"
    : "scene";

const evidenceVisible = (evidence: string, publicText: string) => {
  const evidenceKey = compact(evidence);
  const publicKey = compact(publicText);
  if (evidenceKey.length >= 6 && publicKey.includes(evidenceKey)) return true;
  const evidenceTokens = tokens(evidence);
  if (!evidenceTokens.length) return false;
  const matched = evidenceTokens.filter((token) => publicKey.includes(compact(token)));
  return matched.length >= Math.min(2, evidenceTokens.length) &&
    matched.length / evidenceTokens.length >= 0.45;
};

const statementGrounded = (statement: string, corpus: string) => {
  const statementTokens = tokens(statement);
  if (!statementTokens.length) return false;
  const corpusKey = compact(corpus);
  const matched = statementTokens.filter((token) => corpusKey.includes(compact(token)));
  return matched.length >= Math.min(2, statementTokens.length) &&
    matched.length / statementTokens.length >= 0.35;
};

export const sanitizeSessionCanonUpdates = ({
  updates,
  existing,
  userInput,
  publicText,
  characterIds,
  eventIds,
  turn,
}: {
  updates: SessionCanonUpdate[] | undefined;
  existing: SessionCanonEntry[];
  userInput: string;
  publicText: string;
  characterIds: Set<string>;
  eventIds: Set<string>;
  turn: number;
}): SessionCanonEntry[] => {
  if (!Array.isArray(updates)) return [];
  return updates.slice(0, 6).flatMap((raw, index) => {
    const kind = raw?.kind;
    if (![
      "player_hypothesis",
      "refuted_hypothesis",
      "confirmed_reveal",
      "branch_canon",
      "scene_fact",
      "pending_consequence",
    ].includes(kind as SessionCanonKind)) return [];
    const statement = clip(raw.statement, 320);
    const evidence = clip(raw.evidence, 320);
    const consequence = clip(raw.consequence, 320);
    if (statement.length < 6 || !evidenceVisible(evidence, publicText)) return [];
    const playerOrigin = kind === "player_hypothesis" || kind === "refuted_hypothesis";
    if (playerOrigin && !statementGrounded(statement, `${userInput}\n${publicText}`)) return [];
    if (!playerOrigin && !statementGrounded(statement, publicText)) return [];
    const subjectIds = [...new Set((raw.subjectIds ?? []).filter((id) => characterIds.has(id)))].slice(0, 6);
    const relatedEventIds = [...new Set((raw.relatedEventIds ?? []).filter((id) => eventIds.has(id)))].slice(0, 6);
    const key = `${kind}:${compact(statement)}`;
    return [{
      id: `SESSION_CANON_${turn}_${index}_${stableHash(key)}`,
      kind,
      statement,
      truth: truthForKind(kind),
      origin: originForKind(kind),
      subjectIds,
      evidence,
      consequence,
      relatedEventIds,
      createdTurn: turn,
      updatedTurn: turn,
      active: true,
    } satisfies SessionCanonEntry];
  }).filter((entry, index, list) =>
    list.findIndex((candidate) => compact(candidate.statement) === compact(entry.statement) && candidate.kind === entry.kind) === index &&
    !existing.some((candidate) => candidate.active && candidate.kind === entry.kind && compact(candidate.statement) === compact(entry.statement))
  );
};

const sameProposition = (left: SessionCanonEntry, right: SessionCanonEntry) => {
  const a = compact(left.statement);
  const b = compact(right.statement);
  if (a === b || (Math.min(a.length, b.length) >= 8 && (a.includes(b) || b.includes(a)))) {
    return true;
  }
  const sharesSubject = left.subjectIds.some((id) => right.subjectIds.includes(id));
  if (!sharesSubject) return false;
  const rightTokens = tokens(right.statement).map(compact);
  const sharedTokens = tokens(left.statement).map(compact).filter((leftToken) =>
    rightTokens.some((rightToken) =>
      leftToken === rightToken ||
      (Math.min(leftToken.length, rightToken.length) >= 2 &&
        (leftToken.includes(rightToken) || rightToken.includes(leftToken)))
    )
  );
  return sharedTokens.length >= 2;
};

export const mergeSessionCanonLedger = (
  existing: SessionCanonEntry[] = [],
  additions: SessionCanonEntry[] = [],
  maxEntries = 160,
): SessionCanonEntry[] => {
  const merged = existing.map((entry) => ({ ...entry }));
  additions.forEach((addition) => {
    if (["refuted_hypothesis", "confirmed_reveal", "branch_canon"].includes(addition.kind)) {
      merged.forEach((entry) => {
        if (entry.active && entry.kind === "player_hypothesis" && sameProposition(entry, addition)) {
          entry.active = false;
          entry.updatedTurn = addition.updatedTurn;
        }
      });
    }
    merged.push(addition);
  });
  return merged.slice(-maxEntries);
};

export const sessionCanonMemoryText = (entry: SessionCanonEntry): string => {
  const prefix = entry.kind === "player_hypothesis"
    ? "미확인 추측"
    : entry.kind === "refuted_hypothesis"
      ? "부정된 추측"
      : entry.kind === "confirmed_reveal"
        ? "확인된 공개"
        : entry.kind === "branch_canon"
          ? "분기 정사"
          : entry.kind === "pending_consequence"
            ? "남은 여파"
            : "장면 사실";
  return `[${prefix}] ${entry.statement}${entry.consequence ? ` 이후 반영: ${entry.consequence}` : ""}`;
};

export const activeSessionCanonForPrompt = (entries: SessionCanonEntry[] = []) =>
  entries.filter((entry) => entry.active).slice(-80).map((entry) => ({
    kind: entry.kind,
    truth: entry.truth,
    statement: entry.statement,
    subjectIds: entry.subjectIds,
    evidence: entry.evidence,
    consequence: entry.consequence,
    relatedEventIds: entry.relatedEventIds,
    createdTurn: entry.createdTurn,
  }));

export type UserCanonIntent = {
  targetId: string;
  targetName: string;
  question: boolean;
  identityClaim: boolean;
  namedNpcAction: boolean;
  topicTokens: string[];
  actionTokens: string[];
};

const characterAliases = (name: string) => {
  const parts = name.split(/[\s·/()]+/u).filter((part) => part.length >= 2);
  const aliases = [...parts];
  parts.forEach((part) => {
    if (/^[가-힣]{3,}$/u.test(part)) aliases.push(part.slice(-2));
  });
  return [...new Set(aliases)];
};

const ACTION_TOKEN_PATTERN = /(?:주문|마술|마법|시전|공격|방어|치료|사용|발동|소환|변신|이동|출발|도착|떠나|열|닫|건네|받|던지|쏘|휘두르|잡|놓|부수|도망|추격|말하|외치|부르|웃|울|쓰러|일어나)/u;
const ANSWER_PATTERN = /(?:아니|맞|그렇|모르|확인할\s*수|말할\s*수|밝힐\s*수|대답할\s*수|공개할\s*수|설명할\s*수|비밀|추측|오해|제\s*것이\s*아니|때가\s*되면)/u;
const REFUSAL_OR_RESULT_PATTERN = /(?:거부|거절|멈췄|실패|불발|통하지\s*않|할\s*수\s*없|하지\s*않|대신|피했|막았|빗나갔)/u;

export const deriveUserCanonIntent = (
  input: string,
  characters: CanonCharacter[],
  executedClauses?: string[],
): UserCanonIntent => {
  const normalized = input.normalize("NFKC");
  const executable = executedClauses
    ? executedClauses.join(" ").normalize("NFKC")
    : normalized;
  const target = characters.find((character) => {
    if (normalized.includes(character.name)) return true;
    return characterAliases(character.name).some((part) => normalized.includes(part));
  });
  const targetNamePattern = target
    ? characterAliases(target.name)
      .map(escapeRegex)
      .join("|")
    : "";
  const subjectPattern = targetNamePattern
    ? new RegExp(`(?:${targetNamePattern})(?:이|가|은|는|께서)`, "u")
    : null;
  const question = /[?？]/u.test(normalized) ||
    /(?:인가요|건가요|나요|습니까|일까요|맞나요|무엇|누구|왜|어떻게)/u.test(normalized);
  const identityClaim = Boolean(target) && !question &&
    /(?:정체|진명|사실).{0,60}(?:이다|였다|이었다|였다고|이라고|아니었|인물)|(?:은|는)\s*사실\s*[^.!?]{1,50}(?:였다|이었다|이다)/u.test(executable);
  const namedNpcAction = Boolean(target && subjectPattern?.test(executable)) &&
    ACTION_TOKEN_PATTERN.test(executable);
  const targetParts = new Set(target ? characterAliases(target.name).map(compact) : []);
  const topicTokens = tokens(normalized).filter((token) => !targetParts.has(compact(token))).slice(0, 12);
  return {
    targetId: target?.id ?? "",
    targetName: target?.name ?? "",
    question,
    identityClaim,
    namedNpcAction,
    topicTokens,
    actionTokens: topicTokens.filter((token) => ACTION_TOKEN_PATTERN.test(token)).slice(0, 8),
  };
};

export const userCanonIntentHandled = (
  intent: UserCanonIntent,
  publicText: string,
  dialogue: CanonDialogue[],
): boolean => {
  if (!intent.targetId && !intent.targetName) return true;
  const targetDialogue = dialogue.filter((line) =>
    (intent.targetId && line.speakerId === intent.targetId) ||
    (intent.targetName && line.speakerName?.includes(intent.targetName)) ||
    characterAliases(intent.targetName).some((part) => line.speakerName?.includes(part))
  );
  if (intent.question || intent.identityClaim) {
    if (!targetDialogue.length) return false;
    return targetDialogue.some((line) => {
      const lineKey = compact(line.text);
      return ANSWER_PATTERN.test(line.text) || intent.topicTokens.some((token) => lineKey.includes(compact(token)));
    });
  }
  if (intent.namedNpcAction) {
    const textKey = compact(publicText);
    return intent.actionTokens.some((token) => textKey.includes(compact(token))) ||
      REFUSAL_OR_RESULT_PATTERN.test(publicText);
  }
  return true;
};
