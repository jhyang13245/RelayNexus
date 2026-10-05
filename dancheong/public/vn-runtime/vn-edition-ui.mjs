import { revisionDescriptor } from './vn-editions.mjs?v=620ff060ab90';
import { editionId } from './vn-edition-key.mjs?v=620ff060ab90';

export function createEditionDialog({ root, getWork, getCurrent, list, install, restore, exportRecord }) {
  const dialog = document.createElement('dialog'); dialog.id = 'vn-edition-dialog'; dialog.className = 'vn-edition-dialog';
  dialog.setAttribute('aria-labelledby', 'vn-edition-heading');
  dialog.innerHTML = '<header><h2 id="vn-edition-heading">덧칠 관리</h2><button type="button" data-close aria-label="덧칠 관리 닫기">닫기 ×</button></header><p data-work></p><p>새 덧칠은 별도의 이야기로 시작합니다. 현재 진행은 자동 보관되며, 아래에서 이전 덧칠을 이어갈 수 있습니다. 저장 슬롯 10개와 기존 이미지·음성은 유지됩니다.</p><p data-status role="status"></p><div data-revisions></div><h3>이 기기에 보관된 이야기</h3><div data-installed></div><button type="button" data-refresh>새로 확인</button>';
  root.append(dialog);
  const el = name => dialog.querySelector(`[data-${name}]`);
  let working = false, generation = 0;
  const setBusy = value => { working = value; dialog.setAttribute('aria-busy', String(value)); dialog.querySelectorAll('button').forEach(b => { b.disabled = value; }); };
  dialog.addEventListener('cancel', event => { if (working) event.preventDefault(); });
  el('close').onclick = () => { if (!working) dialog.close(); };
  async function run(action) {
    if (working) return;
    setBusy(true); el('status').textContent = '진행을 보관하고 덧칠을 준비하고 있습니다…';
    try { await action(); await refresh(); }
    catch (error) { el('status').textContent = error?.message || '덧칠을 적용하지 못했습니다.'; }
    finally { setBusy(false); }
  }
  function row(parent, title, detail, label, action) {
    const box = document.createElement('article'), heading = document.createElement('strong'), info = document.createElement('p'), button = document.createElement('button');
    heading.textContent = title; info.textContent = detail; button.type = 'button'; button.textContent = label; button.onclick = () => void run(action);
    box.append(heading, info, button); parent.append(box); return box;
  }
  async function refresh() {
    const work = getWork(), ticket = ++generation; if (!work) return;
    el('work').textContent = work.title; el('status').textContent = '공개 덧칠을 확인하고 있습니다…';
    el('revisions').replaceChildren(); el('installed').replaceChildren();
    // Local archives remain accessible even when the catalog is temporarily offline.
    const installed = await list(work.slug), current = getCurrent(), currentId = editionId(current, work.slug);
    if (ticket !== generation || getWork()?.slug !== work.slug) return;
    for (const item of installed) {
      const title = item.edition ? `덧칠 v${item.edition.revision}` : '기존 진행 · 덧칠 번호 미확인';
      const box = row(el('installed'), title, `${item.turnCount}턴 · ${new Date(item.savedAt).toLocaleString('ko-KR')}`, item.id === currentId ? '현재 이야기' : '이어하기', () => restore(item.id));
      if (item.id === currentId) box.querySelector('button').remove();
      const backup = document.createElement('button'); backup.type = 'button'; backup.textContent = '파일로 백업'; backup.onclick = () => void run(() => exportRecord(item.id)); box.append(backup);
    }
    if (!installed.length) el('installed').textContent = '덧칠을 바꾸면 현재 이야기가 여기에 자동 보관됩니다.';
    try {
      const response = await fetch(`/api/work/${encodeURIComponent(work.slug)}/revisions`, { cache: 'no-store' });
      if (!response.ok) throw new Error('공개 덧칠 목록을 불러오지 못했습니다. 보관된 이야기는 계속 이용할 수 있습니다.');
      const payload = await response.json();
      if (payload.slug !== work.slug || !Array.isArray(payload.revisions)) throw new Error('덧칠의 작품 정보를 확인하지 못했습니다.');
      if (ticket !== generation || getWork()?.slug !== work.slug) return;
      for (const raw of payload.revisions) {
        const revision = revisionDescriptor(raw), id = editionId({ schema: 'DANCHEONG_VN_EDITION_V1', slug: work.slug, revision: revision.revision, sha256: revision.sha256 }, work.slug);
        const saved = installed.some(item => item.id === id);
        const detail = [revision.createdAt ? new Date(revision.createdAt).toLocaleDateString('ko-KR') : '', revision.notes || '작가가 등록한 변경 설명이 없습니다.'].filter(Boolean).join(' · ');
        const box = row(el('revisions'), `덧칠 v${revision.revision}${raw.current ? ' · 최신' : ''}`, detail, currentId === id ? '현재 덧칠' : saved ? '보관된 이야기 이어하기' : '이 덧칠로 새 이야기 시작', () => saved ? restore(id) : install(revision));
        if (currentId === id) box.querySelector('button').remove();
      }
      el('status').textContent = current ? `현재 플레이: 덧칠 v${current.revision}` : '현재 진행의 덧칠 번호는 추측하지 않고 기존 진행으로 보관합니다.';
    } catch (error) { el('status').textContent = error.message; }
  }
  el('refresh').onclick = () => void run(async () => {});
  return { async show() { if (working) return; if (!dialog.open) dialog.showModal(); await run(async () => {}); } };
}
