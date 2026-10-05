import { SLOT_COUNT, QUICK_SLOT, slotLabel } from './vn-saves.mjs?v=620ff060ab90';
import { storageStatus, formatBytes, requestDurableStorage } from './vn-storage.mjs?v=620ff060ab90';
import { storageDescription } from './vn-storage-ui.mjs?v=620ff060ab90';

export function createSaveDialog({ root, store, canSave, onOpen, save, load, readFile, importFile, exportFile }) {
  const dialog = document.createElement('dialog'); dialog.className = 'vn-saves-dialog'; dialog.id = 'vn-saves-dialog';
  dialog.setAttribute('aria-labelledby', 'vn-saves-title');
  dialog.innerHTML = '<header><div><span class="vn-kicker">SAVE / LOAD</span><h2 id="vn-saves-title">저장·불러오기</h2></div><button class="vn-saves-close" type="button">닫기 ×</button></header><p class="vn-saves-help">이어하기와 별도로 작품 전체에서 10개 슬롯을 사용합니다. 읽던 문장과 진행·인물 상태를 이 브라우저에 저장합니다. 브라우저 데이터를 지우거나 다른 기기를 사용하면 불러올 수 없습니다.</p><p class="vn-saves-status" role="status" aria-live="polite"></p><div class="vn-saves-grid"></div><section class="vn-save-confirm" hidden aria-label="저장 작업 확인"><p></p><div><button type="button" data-cancel>취소</button><button type="button" data-confirm>확인</button></div></section>';
  root.append(dialog);
  dialog.querySelector('.vn-saves-help').textContent = '이어하기와 별도로 10개 슬롯과 퀵 세이브(F5 저장 / F9 불러오기)를 사용합니다. 슬롯 파일에는 진행·작품 패키지와 해당 작품의 저장된 이미지·음성·비용 기록이 포함됩니다. 중요한 진행은 기기 밖에도 파일로 보관해 주세요. API 키는 파일에 포함하지 않습니다.';
  const storage = document.createElement('section'); storage.className = 'vn-saves-storage';
  storage.innerHTML = '<p></p><button type="button">자동 정리 방지 요청</button>';
  dialog.querySelector('.vn-saves-help').after(storage);
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.gz,application/json,application/gzip'; input.hidden = true; dialog.append(input);
  const grid = dialog.querySelector('.vn-saves-grid'), status = dialog.querySelector('.vn-saves-status'), confirmation = dialog.querySelector('.vn-save-confirm');
  let working = false, intent = null, rows = [], epoch = 0, fileTarget = null;
  const button = (text, action) => { const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.addEventListener('click', action); return node; };
  const setWorking = value => { working = value; dialog.setAttribute('aria-busy', String(value)); dialog.querySelectorAll('button').forEach(node => { node.disabled = value; }); };
  function render() {
    grid.replaceChildren();
    const unavailable = canSave();
    for (const slot of [QUICK_SLOT, ...Array.from({ length: SLOT_COUNT }, (_, index) => index + 1)]) {
      const record = rows.find(row => row.slot === slot);
      const card = document.createElement('article'); card.className = `vn-save-slot${record ? '' : ' is-empty'}`;
      const preview = document.createElement('div'); preview.className = 'vn-save-preview';
      if (record?.thumbnail?.startsWith('data:image/')) { const image = document.createElement('img'); image.src = record.thumbnail; image.alt = ''; preview.append(image); }
      const number = document.createElement('span'); number.className = 'vn-save-number'; number.textContent = slot === QUICK_SLOT ? 'Q' : String(slot).padStart(2, '0'); if (slot === QUICK_SLOT) card.classList.add('is-quick'); preview.append(number);
      const info = document.createElement('div'); info.className = 'vn-save-info';
      const title = document.createElement('h3'); title.textContent = record?.title || '빈 슬롯'; info.append(title);
      if (record) {
        const time = document.createElement('time'); time.dateTime = record.savedAt; time.textContent = new Date(record.savedAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const scene = document.createElement('p'); scene.className = 'vn-save-scene'; scene.textContent = `${record.scene || '이야기'} · ${record.page || 1} / ${record.pageCount || 1}`;
        const excerpt = document.createElement('p'); excerpt.className = 'vn-save-excerpt'; excerpt.textContent = record.excerpt;
        info.append(time, scene, excerpt);
      } else { const hint = document.createElement('p'); hint.className = 'vn-save-excerpt'; hint.textContent = slot === QUICK_SLOT ? '플레이 중 F5로 빠르게 저장하고 F9로 불러옵니다.' : '현재 장면을 저장해 두세요.'; info.append(hint); }
      const actions = document.createElement('div'); actions.className = 'vn-save-actions';
      const saveButton = button(record ? '덮어쓰기' : '저장', () => choose('save', slot, record));
      saveButton.dataset.slotSave = ''; saveButton.setAttribute('aria-label', `${slotLabel(slot)} ${record ? '덮어쓰기' : '저장'}`); saveButton.disabled = working || Boolean(unavailable); saveButton.title = unavailable || '';
      const loadButton = button('불러오기', () => choose('load', slot, record)); loadButton.setAttribute('aria-label', `${slotLabel(slot)} 불러오기`); loadButton.disabled = working || !record;
      loadButton.dataset.slotLoad = '';
      const exportButton = button('파일 내보내기', () => { intent = { action: 'export', slot, revision: record?.revision || '' }; void run(); }); exportButton.setAttribute('aria-label', `${slotLabel(slot)} 파일 내보내기`); exportButton.disabled = working || !record;
      const importButton = button('파일 가져오기', () => { fileTarget = { slot, revision: record?.revision || '' }; input.value = ''; input.click(); }); importButton.setAttribute('aria-label', `${slotLabel(slot)} 파일 가져오기`); importButton.disabled = working;
      if (record?.storageBytes) { const size = document.createElement('p'); size.className = 'vn-save-scene'; size.textContent = `슬롯 ${formatBytes(record.storageBytes)}`; info.append(size); }
      actions.append(saveButton, loadButton, exportButton, importButton); card.append(preview, info, actions); grid.append(card);
    }
  }
  async function refresh() {
    const token = ++epoch;
    try { const [next, space] = await Promise.all([store.list(), storageStatus()]); if (token !== epoch) return; rows = next; render(); storage.querySelector('p').textContent = storageDescription(space); }
    catch (error) { if (token === epoch) status.textContent = `저장 목록을 읽지 못했습니다: ${error.message}`; }
  }
  function choose(action, slot, record) {
    if (working) return;
    intent = { action, slot, revision: record?.revision || '' };
    if (action === 'save' && !record) return void run();
    confirmation.hidden = false;
    confirmation.querySelector('p').textContent = action === 'save'
      ? `${slotLabel(slot)}의 「${record.title}」 저장을 현재 진행으로 덮어쓸까요? 기존 슬롯 기록은 교체됩니다.`
      : `${slotLabel(slot)}의 「${record.title}」을 불러올까요? 현재 진행은 이어하기에 먼저 보관하지만, 같은 작품이면 이어하기도 불러온 시점으로 바뀝니다. 보존할 분기는 다른 슬롯에 먼저 저장해 주세요.`;
    confirmation.querySelector('[data-confirm]').textContent = action === 'save' ? '덮어쓰기' : '불러오기';
    confirmation.querySelector('[data-cancel]').focus();
  }
  async function run() {
    if (!intent || working) return;
    const selected = intent; intent = null; confirmation.hidden = true; setWorking(true);
    status.textContent = ({ save: '현재 진행을 저장하고 있습니다…', load: '저장된 장면을 불러오고 있습니다…', export: '작품의 이미지·음성과 함께 파일을 만들고 있습니다…', import: '백업 파일을 슬롯에 보관하고 있습니다…' })[selected.action];
    try {
      if (selected.action === 'save') await save(selected.slot, selected.revision);
      else if (selected.action === 'load') await load(selected.slot, selected.revision);
      else if (selected.action === 'import') await importFile(selected.backup, selected.slot, selected.revision);
      else if (selected.action === 'export') await exportFile(selected.slot, selected.revision);
      status.textContent = selected.action === 'export' ? '백업 파일을 만들었습니다. 브라우저 다운로드 목록에서 파일이 저장되었는지 확인해 주세요.' : selected.action === 'import' ? `${slotLabel(selected.slot)}에 파일을 보관했습니다. 이 슬롯의 불러오기를 누르면 진행과 미디어를 복원합니다.` : `${slotLabel(selected.slot)}에 저장했습니다.`;
      if (selected.action === 'load') dialog.close();
    } catch (error) { status.textContent = error?.message || '저장 작업을 완료하지 못했습니다. 기존 슬롯은 유지됩니다.'; }
    finally { setWorking(false); await refresh(); }
  }
  input.onchange = async () => {
    if (working || !input.files?.[0] || !fileTarget) return;
    const selected = fileTarget; fileTarget = null; setWorking(true); status.textContent = '백업 파일을 검사하고 있습니다…';
    try {
      const backup = await readFile(input.files[0]);
      intent = { ...selected, action: 'import', backup }; confirmation.hidden = false;
      confirmation.querySelector('p').textContent = `「${backup.record.title}」 (${backup.record.savedAt?.slice(0, 10) || '날짜 미상'}, 미디어 ${backup.assets.length}개)을 ${slotLabel(selected.slot)}에 가져올까요?${selected.revision ? ' 이 슬롯의 기존 저장을 덮어씁니다.' : ''} 현재 플레이는 바뀌지 않습니다. 불러오기를 누르면 적용됩니다.`;
      confirmation.querySelector('[data-confirm]').textContent = '파일 가져오기'; status.textContent = '파일 검사 완료 · 가져올 작품과 슬롯을 확인해 주세요.';
    } catch (error) { intent = null; confirmation.hidden = true; status.textContent = error.message; }
    finally { setWorking(false); render(); confirmation.querySelector('[data-cancel]').focus(); input.value = ''; }
  };
  storage.querySelector('button').onclick = async () => { setWorking(true); try { const granted = await requestDurableStorage({ manual: true }); status.textContent = granted ? '자동 정리 방지가 승인되었습니다.' : '브라우저에서 승인하지 않았거나 지원하지 않습니다. 파일 백업을 이용해 주세요.'; } finally { setWorking(false); await refresh(); } };
  dialog.querySelector('.vn-saves-close').onclick = () => { if (!working) dialog.close(); };
  confirmation.querySelector('[data-cancel]').onclick = () => { intent = null; confirmation.hidden = true; };
  confirmation.querySelector('[data-confirm]').onclick = () => void run();
  dialog.addEventListener('cancel', event => { if (working) event.preventDefault(); });
  dialog.addEventListener('close', () => { intent = null; confirmation.hidden = true; });
  // Background image work can finish while this dialog is open. Re-enable the
  // same focused buttons instead of rebuilding the list under the reader.
  setInterval(() => {
    if (!dialog.open || working) return;
    const problem = canSave();
    grid.querySelectorAll('[data-slot-save]').forEach(node => { node.disabled = Boolean(problem); node.title = problem || ''; });
  }, 500);
  return {
    get open() { return dialog.open; }, get working() { return working; },
    async show() {
      if (working) return;
      onOpen(); status.textContent = canSave() || '원하는 슬롯에 저장하거나 이전 장면을 불러오세요.';
      if (!dialog.open) dialog.showModal();
      await refresh();
      dialog.scrollTop = 0;
    },
  };
}
