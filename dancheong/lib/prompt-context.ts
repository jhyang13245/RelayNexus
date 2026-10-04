const BINARY_KEY = /(?:^|_)(?:dataurl|data_url|base64|binary|blob|bytes|filedata|file_data|imagedata|image_data|archive|zip)(?:$|_)/i;
const BINARY_VALUE = /^data:(?:image|audio|video|application)\//i;

export const MAX_STATIC_PROMPT_CHARS = 180_000;
export const MAX_DYNAMIC_PROMPT_CHARS = 60_000;

type CompactPromptOptions = {
  maxChars: number;
  relevanceText?: string;
  maxDepth?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
  maxStringChars?: number;
};

type Budget = {
  remaining: number;
  truncated: boolean;
};

const normalize = (value: string): string => value.normalize("NFKC").toLowerCase();

const keywordsFrom = (value: string): string[] => [
  ...new Set(
    normalize(value)
      .match(/[\p{L}\p{N}_-]{2,}/gu)
      ?.filter((token) => token.length >= 2)
      .slice(0, 64) ?? [],
  ),
];

const shallowPreview = (value: unknown, limit = 1_200): string => {
  if (typeof value === "string") return value.slice(0, limit);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (!value || typeof value !== "object") return "";

  const pieces: string[] = [];
  const append = (piece: string) => {
    if (!piece || pieces.join(" ").length >= limit) return;
    pieces.push(piece.slice(0, Math.max(0, limit - pieces.join(" ").length)));
  };

  if (Array.isArray(value)) {
    value.slice(0, 8).forEach((item) => append(shallowPreview(item, 220)));
  } else {
    Object.entries(value as Record<string, unknown>)
      .slice(0, 24)
      .forEach(([key, item]) => {
        if (BINARY_KEY.test(key)) return;
        append(key);
        append(shallowPreview(item, 220));
      });
  }
  return pieces.join(" ").slice(0, limit);
};

const relevanceScore = (
  key: string,
  value: unknown,
  keywords: string[],
): number => {
  const preview = normalize(`${key} ${shallowPreview(value)}`);
  let score = 0;
  keywords.forEach((keyword) => {
    if (preview.includes(keyword)) score += keyword.length >= 4 ? 8 : 4;
  });
  if (/^(?:id|name|title|summary|description|status|priority|type|visibility)$/i.test(key)) {
    score += 3;
  }
  if (/opening|current|active|rule|goal|secret|event|clock|lore|canon|핵심|현재|규칙|목표|비밀|사건/i.test(key)) {
    score += 2;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.status === "active" || record.enabled === true) score += 5;
    if (typeof record.priority === "number") score += Math.max(0, Math.min(5, record.priority));
  }
  return score;
};

const compactLongString = (
  value: string,
  maxChars: number,
  keywords: string[],
): string => {
  if (BINARY_VALUE.test(value)) return "[대용량 바이너리 데이터 생략]";
  if (value.length <= maxChars) return value;

  const normalized = normalize(value);
  const excerpts: string[] = [value.slice(0, Math.min(1_200, maxChars))];
  for (const keyword of keywords) {
    const index = normalized.indexOf(keyword);
    if (index < 0) continue;
    const start = Math.max(0, index - 360);
    excerpts.push(value.slice(start, Math.min(value.length, start + 1_100)));
    if (excerpts.join("\n…\n").length >= maxChars - 600) break;
  }
  excerpts.push(value.slice(-Math.min(400, maxChars)));
  return `${excerpts.join("\n…[중간 생략]…\n").slice(0, maxChars - 36)}\n[긴 텍스트 일부 생략]`;
};

const compactValue = (
  value: unknown,
  budget: Budget,
  keywords: string[],
  options: Required<Omit<CompactPromptOptions, "maxChars" | "relevanceText">>,
  depth: number,
): unknown => {
  if (budget.remaining <= 96) {
    budget.truncated = true;
    return "[컨텍스트 예산 초과로 생략]";
  }
  if (value === null || value === undefined) {
    budget.remaining -= 4;
    return null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    budget.remaining -= 12;
    return value;
  }
  if (typeof value === "string") {
    const compacted = compactLongString(
      value,
      Math.min(options.maxStringChars, Math.max(64, budget.remaining - 48)),
      keywords,
    );
    budget.remaining -= compacted.length + 8;
    if (compacted.length < value.length) budget.truncated = true;
    return compacted;
  }
  if (depth >= options.maxDepth) {
    budget.truncated = true;
    const preview = shallowPreview(value, Math.min(1_000, budget.remaining - 32));
    budget.remaining -= preview.length + 24;
    return `${preview}\n[깊은 하위 구조 생략]`;
  }
  if (Array.isArray(value)) {
    const ranked = value.map((item, index) => ({
      item,
      index,
      score: relevanceScore(String(index), item, keywords),
    }));
    ranked.sort((a, b) => b.score - a.score || a.index - b.index);
    const selected = ranked
      .slice(0, options.maxArrayItems)
      .sort((a, b) => a.index - b.index);
    if (selected.length < value.length) budget.truncated = true;
    budget.remaining -= 8;
    return selected.map(({ item }) =>
      compactValue(item, budget, keywords, options, depth + 1),
    );
  }

  const record = value as Record<string, unknown>;
  const rankedEntries = Object.entries(record)
    .filter(([key]) => !BINARY_KEY.test(key))
    .map(([key, item], index) => ({
      key,
      item,
      index,
      score: relevanceScore(key, item, keywords),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, options.maxObjectKeys);
  if (rankedEntries.length < Object.keys(record).length) budget.truncated = true;

  const compacted: Record<string, unknown> = {};
  budget.remaining -= 8;
  for (const { key, item } of rankedEntries) {
    if (budget.remaining <= 96) {
      budget.truncated = true;
      break;
    }
    budget.remaining -= key.length + 6;
    compacted[key] = compactValue(
      item,
      budget,
      keywords,
      options,
      depth + 1,
    );
  }
  if (budget.truncated && !("_contextNotice" in compacted)) {
    compacted._contextNotice = "현재 장면과 관련성이 높은 설정을 우선 선별함";
  }
  return compacted;
};

/**
 * Turns package-owned JSON into a bounded, binary-free prompt section. Large
 * ScenarioPacks stay on the device; only relevant text reaches the model.
 */
export function compactPromptSection(
  value: unknown,
  options: CompactPromptOptions,
): string {
  const maxChars = Math.max(1_000, Math.floor(options.maxChars));
  const budget: Budget = {
    remaining: Math.floor(maxChars * 0.82),
    truncated: false,
  };
  const compacted = compactValue(
    value,
    budget,
    keywordsFrom(options.relevanceText ?? ""),
    {
      maxDepth: options.maxDepth ?? 7,
      maxArrayItems: options.maxArrayItems ?? 64,
      maxObjectKeys: options.maxObjectKeys ?? 96,
      maxStringChars: options.maxStringChars ?? 8_000,
    },
    0,
  );
  const serialized = JSON.stringify(compacted);
  if (serialized.length <= maxChars) return serialized;
  return JSON.stringify({
    _contextNotice: "현재 장면과 관련성이 높은 설정 일부만 전달됨",
    excerpt: serialized.slice(0, Math.max(0, maxChars - 180)),
  });
}

export function sanitizePromptCacheKey(projectId: string): string {
  const safe = projectId
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._:-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `relay-novel:${safe || "scenario"}:v6`;
}
