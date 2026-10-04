import {pagesForTurn} from '../vendor/visual-novel/public/vn-core.mjs';
import {typeset} from '../vendor/visual-novel/public/vn-typeset.mjs';
import {glyphSchedule,paragraphHold} from '../public/cortex-vn-timeline.mjs';

export function vnTurnManifest(turn:any, number:number, finalized:boolean) {
  const text = String(finalized ? turn.text || '' : turn.displayText || '');
  // The existing writer's live presentation has the same 24K bound. Store only
  // numeric public paragraph metadata here, never story text or credentials.
  if (!text || text.length > 24000) return null;
  const pages = pagesForTurn({...turn, text, displayText: undefined}, number - 1, 150);
  if (!pages.length || pages.length > 512) return null;
  return {turnId: String(turn.id), turn: number, finalized, pages: pages.map((p:any, i:number) => {
    const visible = typeset(p.rawText || p.text).visible;
    return {start: p.start, end: p.end, reveal: glyphSchedule(visible).duration, hold: paragraphHold(visible), growing: !finalized && i === pages.length - 1};
  })};
}
export function vnSnapshotManifest(snapshot:any) {
  const turns = Array.isArray(snapshot?.turns) ? snapshot.turns : [], last = turns.at(-1);
  if (last?.status === 'COMMITTED') return vnTurnManifest(last, turns.length, true);
  if (turns.length) return null;
  const sc = snapshot?.scenario || {}, runtime = sc.runtime || {};
  const contract = runtime.packageContract?.openingContract || runtime.packageV15?.openingContract || runtime.packageV15?.opening || {};
  const jieum=runtime.packageV15?.jieum;
  const opening=jieum&&jieum.mode!=='hud_only'?(runtime.jieum?.routeIndex>0?'':jieum.openingText):contract.openingLine||contract.firstLine;
  const text = opening || sc.event?.summary || sc.summary || '새로운 이야기가 시작됩니다.';
  return vnTurnManifest({id:'opening', text:String(text).trim()}, 0, true);
}
