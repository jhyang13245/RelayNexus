import type { Project } from './studio-model';
import type { CanonStat } from './canon-design';

/** An additive contract: never recompile the author's routes, loops or endings. */
export type CanonHud = {
  revision: 1;
  stats: CanonStat[];
  timeline?: { startDate: string; cycleStatId: string };
  effects: Array<{ id: string; eventId: string; criterion: string; statId: string; amount: number }>;
};
export const canonHud = (p: Project): CanonHud => p.canonHud || { revision: 1, stats: [], effects: [] };
export function assertCanonHud(value: unknown): asserts value is CanonHud {
  const h = value as CanonHud | null;
  const object = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(h) || h!.revision !== 1 || !Array.isArray(h!.stats) || !Array.isArray(h!.effects)
    || !h!.stats.every(s => object(s) && ['id','label','characterId','unit','increaseWhen','decreaseWhen'].every(k => typeof (s as unknown as Record<string,unknown>)[k] === 'string') && ['event','resource'].includes(s.mode) && [s.initial,s.minimum,s.maximum].every(Number.isFinite) && typeof s.visible === 'boolean' && (s.revealWhenChanged === undefined || typeof s.revealWhenChanged === 'boolean'))
    || !h!.effects.every(e => object(e) && [e.id,e.eventId,e.criterion,e.statId].every(v => typeof v === 'string') && Number.isFinite(e.amount))
    || (h!.timeline !== undefined && (!object(h!.timeline) || typeof h!.timeline.startDate !== 'string' || typeof h!.timeline.cycleStatId !== 'string')))
    throw new Error('스탯 표시 계약의 형식이 올바르지 않습니다. 원본 파일을 확인하세요.');
}
export function validHudDate(value: string) {
  const n = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(value+'T00:00:00Z') : NaN;
  return Number.isFinite(n) && new Date(n).toISOString().slice(0,10) === value;
}
export function hasLegacyCanonContracts(p: Project) {
  const old = p.package15;
  return !p.canonDesign && (old.enabled || old.loopPolicy.enabled || old.routes.length > 0 || old.chapters.length > 0 || old.endings.length > 0 || old.flags.length > 0 || old.branchEnding.enabled || old.branchEnding.choiceRecords.length > 0 || old.branchEnding.decisions.length > 0 || p.events.some(e => !!e.multiroute?.chapterId || !!e.multiroute?.routeId || !!e.multiroute?.routeEntryFor));
}
export function hudIssues(p: Project): Array<{ severity: 'error'; area: string; message: string }> {
  if (!p.canonHud) return [];
  const h = p.canonHud, messages: string[] = [];
  try { assertCanonHud(h); } catch { return [{ severity: 'error', area: '스탯·자원', message: '스탯 표시 계약의 형식을 확인하세요.' }]; }
  if (p.canonDesign) messages.push('기존 계약용 스탯과 새 정사 설계를 동시에 사용할 수 없습니다.');
  if (h.timeline && (!validHudDate(h.timeline.startDate) || (h.timeline.cycleStatId && !h.stats.some(s=>s.id===h.timeline!.cycleStatId && s.mode==='event')))) messages.push('날짜 표시의 시작일과 회차 스탯을 확인하세요.');
  if (h.stats.length > 7 || new Set(h.stats.map(s => s.id)).size !== h.stats.length) messages.push('서로 다른 스탯을 최대 7개까지 지정하세요.');
  for (const s of h.stats) {
    if (!s.id || !s.label?.trim() || ![s.initial,s.minimum,s.maximum].every(Number.isFinite) || s.initial < s.minimum || s.initial > s.maximum || !['event','resource'].includes(s.mode) || ![p.player,...p.npcs].some(c => c.id === s.characterId) || typeof s.visible !== 'boolean' || (s.revealWhenChanged !== undefined && typeof s.revealWhenChanged !== 'boolean')) messages.push('스탯의 이름·대상·시작값·범위를 확인하세요.');
    const flag = p.package15.flags.find(f => f.id === s.id);
    if (flag) messages.push(`${s.label}: 기존 상태값과 다른 고유 이름을 사용하세요. 원본 상태값과 분기는 그대로 유지됩니다.`);
  }
  const ids = new Set(p.package15.branchEnding.choiceRecords.map(r => r.id));
  for (const e of h.effects) {
    if (!e.id || ids.has(e.id) || !p.events.some(row => row.id === e.eventId && row.kind !== 'constraint') || !h.stats.some(s => s.id === e.statId && s.mode === 'event') || !e.criterion?.trim() || !Number.isFinite(e.amount)) messages.push('점수 변화의 사건·수치·조건·고유 이름을 확인하세요.');
    ids.add(e.id);
  }
  return messages.map(message => ({ severity: 'error', area: '스탯·자원', message }));
}
export function compileCanonHud(p: Project): Project { return p; }
