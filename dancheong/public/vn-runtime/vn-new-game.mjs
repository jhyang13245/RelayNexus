import { capturePresentation, makeSlot } from './vn-saves.mjs?v=620ff060ab90';
import { verifiedPackage, stampEdition } from './vn-editions.mjs?v=620ff060ab90';

// Prepare the package's initial canonical state without changing the live game.
// The activation journal shares the save loader's format, but this record is
// never put in a numbered slot. All ten user slots remain untouched.
export async function prepareNewGame({ slug, title, api, storage, fetchPackage = fetch, revision = null }) {
  if (!slug) throw new Error('새로 시작할 작품을 선택해 주세요.');
  const file = await verifiedPackage(slug, revision, fetchPackage);
  const candidate = stampEdition(await api.inspectNexusPackage(file), slug, revision);
  const scenario = candidate.scenario, storyId = scenario?.runtime?.storyId;
  const presentation = capturePresentation(storage, { slug, storyId, edition: scenario.runtime.vnEdition, met: [], openingArt: '', actions: false });
  presentation.values[0] = null;
  return makeSlot({ slot: 1, slug, title: title || candidate.report?.title,
    snapshot: { scenario, canonicalSession: candidate.canonicalSession, turns: [], undoLedger: [], recoveryJournal: [], pendingRecovery: null,
      media: { schema: 'CORTEX_MEDIA_BACKUP_V1', generated: [], packageAssets: candidate.mediaAssets || [] } },
    presentation, page: 1, pageCount: 1 });
}

export function createNewGameDialog({ root, getTitle, start, openSaves }) {
  const dialog = document.createElement('dialog'); dialog.id = 'vn-new-game-dialog'; dialog.className = 'vn-new-game-dialog';
  dialog.setAttribute('aria-labelledby', 'vn-new-game-heading');
  dialog.innerHTML = '<h2 id="vn-new-game-heading">처음부터 시작할까요?</h2><p class="vn-new-game-work"></p><p>현재 이어하기 기록이 새 진행으로 바뀝니다. 기존 저장 슬롯은 유지됩니다. 지금까지의 진행을 남기려면 먼저 슬롯에 저장해 주세요.</p><p class="vn-new-game-status" role="status" aria-live="polite"></p><div class="vn-new-game-actions"><button type="button" data-saves>저장·불러오기</button><button type="button" data-cancel>취소</button><button type="button" data-start>새로 시작</button></div>';
  root.append(dialog);
  const status = dialog.querySelector('.vn-new-game-status');
  let working = false;
  const setWorking = value => { working = value; dialog.setAttribute('aria-busy', String(value)); dialog.querySelectorAll('button').forEach(button => { button.disabled = value; }); };
  dialog.querySelector('[data-cancel]').onclick = () => { if (!working) dialog.close(); };
  dialog.querySelector('[data-saves]').onclick = () => { if (!working) { dialog.close(); void openSaves(); } };
  dialog.querySelector('[data-start]').onclick = async () => {
    if (working) return;
    setWorking(true); status.textContent = '첫 장면을 준비하고 있습니다…';
    try { await start(); dialog.close(); }
    catch (error) { status.textContent = error?.message || '새로 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'; }
    finally { setWorking(false); }
  };
  dialog.addEventListener('cancel', event => { if (working) event.preventDefault(); });
  return { show() { if (working) return; status.textContent = ''; dialog.querySelector('.vn-new-game-work').textContent = getTitle(); if (!dialog.open) dialog.showModal(); dialog.querySelector('[data-cancel]').focus(); } };
}
