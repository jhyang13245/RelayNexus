import { checkWorkManifest } from './vn-manifest-check.mjs?v=889f2cc97573';
import { presentationScenario, visualCharacter, publicAppearance } from './vn-public-cast.mjs?v=889f2cc97573';
const list = value => Array.isArray(value) ? value : [];
export const issueLabels = { 'duplicate-id': '인물 ID 중복', 'ambiguous-alias': '다른 인물이 같은 호칭 사용', 'missing-participant': '사건 참여 인물 연결 누락', 'missing-public-name': '첫 등장용 공개 호칭 누락', 'missing-appearance': '공개 외형·참조 이미지 없음' };
// Inspect authored metadata without invoking a model or mutating the engine.
// Only aggregate codes leave this adapter; hidden identities/event text never
// appear in the player diagnostics or exported performance report.
export function inspectWork({ scenario, scope, turns = [], experience, media = [] }) {
  if (!scenario || !experience) return { counts: { characters: 0, events: 0 }, issues: [] };
  const projected = presentationScenario(scenario, scope, turns, experience);
  const metadata = scenario.runtime?.packageContract?.presentation || {};
  const people = [projected.protagonist, ...list(projected.characters)].filter(Boolean);
  const characters = people.map(person => {
    const visible = visualCharacter(person, projected, experience);
    const first = person.imageOnFirstAppearance ?? person.source?.imageOnFirstAppearance;
    let hasPortrait = !visible;
    if (visible) try { hasPortrait = Boolean(experience.selectImageReferences({ visualReferences: [{ characterId: person.id, name: visible.name, mode: visible.referenceMode, allowedAssetRefs: visible.allowedAssetRefs, primaryAssetRef: visible.primaryAssetRef }] }, media)?.length); } catch { /* Missing reference is diagnosed. */ }
    return { id: person.id, name: visible?.name || '', aliases: visible ? [...list(visible.aliases), ...list(metadata.publicAliases?.[person.id])] : [],
      allowFirstAppearance: first === true && !person.secret && !person.source?.secret,
      appearance: visible ? publicAppearance(person, projected, experience) || visible.publicProfile || '' : '', hasPortrait };
  });
  const nodes = scenario.runtime?.packageContract?.eventGraph?.nodes;
  const events = (Array.isArray(nodes) ? nodes : nodes && typeof nodes === 'object' ? Object.values(nodes) : [scenario.event]).filter(Boolean).map(event => {
    const authored = [...list(metadata.eventPublicAliases).filter(row => list(row.eventIds).includes(event.id)), ...list(event.presentation?.eventPublicAliases || event.publicAliases)];
    const participants = list(event.participants).filter(row => row && typeof row === 'object').map(row => ({ characterId: row.characterId || row.id || row.characterName, aliases: [row.publicName, ...list(row.publicAliases)].filter(Boolean) }));
    participants.push(...authored.map(row => ({ characterId: row.characterId, aliases: [row.name, ...list(row.aliases)].filter(Boolean) })));
    // Explicit author references by a UNIQUE registered name are supported by
    // the engine. Do not report them missing or guess an ambiguous name.
    for (const p of participants) if (!people.some(row => row.id === p.characterId)) {
      const matches = people.filter(row => row.name === p.characterId || row.source?.name === p.characterId);
      if (matches.length === 1) p.characterId = matches[0].id;
    }
    return { id: event.id, participants };
  });
  const report = checkWorkManifest({ characters, events });
  return { counts: report.counts, issues: Object.entries(issueLabels).map(([code, label]) => ({ code, label, count: report.issues.filter(row => row.code === code).length })).filter(row => row.count) };
}

export function createHealthDialog({ root, report, diagnostics }) {
  const dialog = document.createElement('dialog'); dialog.className = 'vn-health-dialog vn-cloud-dialog vn-saves-dialog';
  dialog.innerHTML = '<header><h2>작품·성능 점검</h2><button type="button">닫기 ×</button></header><section data-health></section><section data-performance></section>';
  root.append(dialog); dialog.querySelector('button').onclick = () => dialog.close();
  return { show() {
    const data = report(), body = dialog.querySelector('[data-health]'); body.replaceChildren();
    const intro = document.createElement('p'); intro.textContent = `현재 덧칠 · 인물 ${data.counts.characters}개 / 사건 ${data.counts.events}개 · 유료 호출 없는 사전 검사`;
    body.append(intro);
    for (const row of data.issues) { const p = document.createElement('p'); p.textContent = `${row.label} · ${row.count}건`; body.append(p); }
    const note = document.createElement('p'); note.textContent = data.issues.length ? '등록 정보의 보완이 필요한 항목입니다. 연결을 추측하거나 작품 원본을 자동 변경하지 않습니다. 숨겨진 인물과 사건의 내용은 표시하지 않습니다.' : '검사한 등록 정보에서 문제를 발견하지 않았습니다. 실제 생성 결과의 정확성을 보장하는 검사는 아닙니다.'; body.append(note);
    diagnostics.render(dialog.querySelector('[data-performance]'));
    if (!dialog.open) dialog.showModal();
  } };
}
