// Only explicit package-level declarations belong here. Event revealTerms and
// route-scoped facts must never be promoted to global protection by guessing.
type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === "object" && !Array.isArray(v);
export function normalizeProtectedTerms(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))] : [];
}
function declaration(source: unknown): RecordValue | null {
  if (!record(source)) return null;
  const value = record(source.disclosure) ? source.disclosure : source;
  if (!Object.hasOwn(value, "protectedTerms")) return null;
  if (!Array.isArray(value.protectedTerms) || value.protectedTerms.some((v) => typeof v !== "string")) throw new Error("보호어 목록 형식이 올바르지 않습니다. protectedTerms에는 문자열 배열이 필요합니다.");
  return { protectedTerms: normalizeProtectedTerms(value.protectedTerms) };
}
const same = (a: RecordValue, b: RecordValue) => JSON.stringify([...(a.protectedTerms as string[])].sort()) === JSON.stringify([...(b.protectedTerms as string[])].sort());
export function restoreDisclosure(editor: RecordValue, authoritative: boolean, ...sources: unknown[]): RecordValue {
  const own = declaration(editor);
  const declarations = sources.map(declaration).filter((v): v is RecordValue => v !== null);
  if (authoritative && own) {
    if (declarations.some((v) => !same(own, v))) throw new Error("편집 원본과 실행 자료의 보호어 목록이 다릅니다. 원본 패키지에서 목록을 확인해 일치시킨 뒤 다시 불러오세요.");
    return { ...editor, disclosure: own };
  }
  const candidates = [...declarations, ...(own ? [own] : [])];
  const nonempty = candidates.filter((v) => (v.protectedTerms as string[]).length);
  if (nonempty.some((v) => !same(nonempty[0], v))) throw new Error("패키지 안에 서로 다른 보호어 목록이 있습니다. 목록을 확인해 일치시킨 뒤 다시 불러오세요.");
  const selected = nonempty[0] ?? candidates[0];
  return selected ? { ...editor, disclosure: selected } : editor;
}
