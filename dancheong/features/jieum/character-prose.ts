import type { Character } from "./studio-model";

export const characterProseFields = [
  ["role", "역할"], ["age", "나이"], ["gender", "성별"], ["origin", "출신"],
  ["status", "현재 상태"], ["occupation", "신분·직업"], ["affiliation", "소속"],
  ["personality", "성격"], ["values", "가치관"], ["speechStyle", "말투"],
  ["skills", "능력·기술"], ["weaknesses", "약점·제약"], ["goals", "목표"],
  ["assets", "자산"], ["inventory", "소지품"], ["relationships", "관계"],
] as const satisfies ReadonlyArray<readonly [keyof Character, string]>;

export function characterProse(character: Character) {
  return [character.publicInfo || "", ...characterProseFields.flatMap(([key, label]) => {
    const value = character[key];
    return typeof value === "string" && value.trim() ? [`[${label}]\n${value}`] : [];
  })].filter(Boolean).join("\n\n");
}

export function updateCharacterProse<T extends Omit<Character,'images'>>(character: T, publicInfo: string): T {
  const next = { ...character, publicInfo };
  for (const [key] of characterProseFields) (next as unknown as Record<string, unknown>)[key] = "";
  return next;
}

export function appearanceProse(character: Character) {
  const appearance = character.appearance.trim(), anchor = character.visualAnchor.trim();
  if (!anchor || anchor === appearance || appearance.includes(anchor)) return appearance || anchor;
  return [appearance, `[이미지 일관성 특징]\n${anchor}`].filter(Boolean).join("\n\n");
}
