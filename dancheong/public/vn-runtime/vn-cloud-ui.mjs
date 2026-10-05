import { createCloudClient, cloudPayload, cloudSlot, continueSlot } from './vn-cloud.mjs?v=ef485ae04925';
import { hostServices } from './vn-host.mjs?v=ef485ae04925';
import { formatBytes } from './vn-storage.mjs?v=ef485ae04925';

export function createCloudDialog({ root, capture, load, localStore, currentSlug, canSave, onOpen, notify = () => {}, onStatus = () => {}, storage = localStorage }) {
  const client = createCloudClient(), dialog = document.createElement('dialog'); dialog.className = 'vn-saves-dialog vn-cloud-dialog';
  dialog.setAttribute('aria-labelledby', 'vn-cloud-title');
  dialog.innerHTML = `<header><div><span class="vn-kicker">CLOUD SAVE</span><h2 id="vn-cloud-title">계정 클라우드 저장</h2></div><button type="button" data-close>닫기 ×</button></header>
    <p class="vn-cloud-status" role="status"></p><p data-sync-state role="status"></p><a data-login target="_top" hidden>ChatGPT로 로그인</a>
    <div class="vn-cloud-options"><label><input type="checkbox" data-auto> 이 계정에 현재 작품 이어하기 자동 저장</label><label><input type="checkbox" data-media> 생성한 이미지·음성도 포함</label><button type="button" data-refresh>목록 새로고침</button></div>
    <p class="vn-saves-help">클라우드는 로그인한 계정의 전용 저장입니다. 기존 기기 슬롯은 자동으로 업로드하지 않습니다. API 키는 이 기기에 남습니다. 다른 기기에서 먼저 저장하면 덮어쓰지 않고 충돌을 알립니다. 미디어를 제외하면 다른 기기에서 새 이미지 생성 비용이 발생할 수 있습니다.</p><div class="vn-cloud-grid vn-saves-grid"></div>`;
  const confirmation = document.createElement('section'); confirmation.className = 'vn-save-confirm'; confirmation.hidden = true;
  confirmation.innerHTML = '<p></p><div><button type="button" data-cancel>취소</button><button type="button" data-confirm>확인</button></div>'; dialog.append(confirmation);
  const ask = message => new Promise(resolve => {
    confirmation.hidden = false; confirmation.querySelector('p').textContent = message;
    for (const [selector, value] of [['[data-cancel]', false], ['[data-confirm]', true]]) {
      const control = confirmation.querySelector(selector); control.disabled = false;
      control.onclick = () => { confirmation.hidden = true; resolve(value); };
    }
    confirmation.querySelector('[data-cancel]').focus();
  });
  root.append(dialog);
  const status = dialog.querySelector('[role=status]'), grid = dialog.querySelector('.vn-cloud-grid'), login = dialog.querySelector('[data-login]'); login.href = hostServices().signIn;
  const auto = dialog.querySelector('[data-auto]'), media = dialog.querySelector('[data-media]');
  let rows = [], working = false, timer = 0, due = 0, queued = false, failedAuto = '', lastAccount = '';
  let localState = '기기 저장: 확인 대기', cloudState = '클라우드: 연결 확인 중';
  const announce = () => { const text = `${localState} · ${cloudState}`; dialog.querySelector('[data-sync-state]').textContent = text; onStatus(text); };
  const syncState = text => { cloudState = `클라우드: ${text}`; announce(); };
  const progress = value => syncState(value.phase === 'commit' ? '미디어 전송 완료 · 진행 저장 중' : `미디어 ${formatBytes(value.sent)} / ${formatBytes(value.total)} · 기존 ${value.reused}개 재사용`);
  function schedule(delay = 10000) {
    queued = true;
    const next = Date.now() + delay;
    if (timer && due <= next) return;
    clearTimeout(timer); due = next; timer = setTimeout(automatic, delay);
  }
  const preferencesKey = () => `dancheong-vn-cloud-v1:${client.account}`;
  const preferences = () => { try { return JSON.parse(storage.getItem(preferencesKey()) || '{}'); } catch { return {}; } };
  const writePreferences = value => storage.setItem(preferencesKey(), JSON.stringify(value));
  const baselineKey = slot => `dancheong-vn-cloud-base-v1:${client.account}:${slot}`;
  const remember = row => { storage.setItem(baselineKey(row.slot), row.revision); };
  const button = (text, callback) => { const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.onclick = callback; return node; };
  const busy = value => { working = value; dialog.setAttribute('aria-busy', String(value)); dialog.querySelectorAll('button,input').forEach(n => { n.disabled = value; }); };
  function settings() { const prefs = preferences(); auto.checked = Boolean(prefs.auto?.[currentSlug()]); media.checked = Boolean(prefs.media); auto.disabled = !currentSlug() || !client.account || working; media.disabled = !client.account || working; }
  function render() {
    grid.replaceChildren();
    if (!client.account) return;
    const slots = [...new Set([...(currentSlug() ? [continueSlot(currentSlug())] : []), ...rows.filter(r => r.slot.startsWith('continue-')).map(r => r.slot), ...Array.from({ length: 11 }, (_, i) => cloudSlot(i + 1))])];
    for (const id of slots) {
      const row = rows.find(r => r.slot === id), number = Number(id.replace('slot-', ''));
      const card = document.createElement('article'); card.className = 'vn-save-slot vn-cloud-slot';
      const title = document.createElement('h3'); title.textContent = id.startsWith('continue-') ? `${row?.title || '현재 작품'} · 이어하기` : number === 11 ? '퀵 세이브' : `${number}번 슬롯`;
      const detail = document.createElement('p'); detail.textContent = row ? `${row.title} · ${new Date(row.updatedAt).toLocaleString('ko-KR')} · ${row.page}/${row.pageCount} · ${formatBytes(row.format === 'manifest-v2' ? row.mediaBytes : row.bytes)}${row.format === 'manifest-v2' ? ' (공유 파일 포함)' : ''}${row.mediaIncluded ? ' · 미디어 포함' : ' · 진행·패키지'}` : '빈 클라우드 슬롯';
      const excerpt = document.createElement('p'); excerpt.textContent = row?.excerpt || '';
      const actions = document.createElement('div'); actions.className = 'vn-save-actions';
      const saveButton = button(row ? '진행 덮어쓰기' : '현재 진행 저장', () => run(async () => {
        if (row && !await ask(`${title.textContent}의 저장을 현재 진행으로 바꿀까요?`)) return;
        await upload(id, row?.revision || '0', await capture(number || 1));
      }));
      saveButton.disabled = Boolean(canSave()) || working || id.startsWith('continue-') && id !== continueSlot(currentSlug());
      const loadButton = button('클라우드 불러오기', () => run(async () => {
        if (!await ask(`「${row.title}」의 저장 시점으로 이동할까요? 현재 진행은 기기의 이어하기에 먼저 보관합니다. 보존할 분기는 기기 슬롯에 저장해 주세요.`)) return;
        status.textContent = '클라우드 저장을 내려받고 확인하고 있습니다…';
        const record = await client.get(row);
        // Recheck the account after a long download before applying any state.
        const owner = client.account; await client.list(); if (client.account !== owner) throw new Error('로그인 계정이 바뀌어 불러오기를 취소했습니다.');
        await load(record); remember(row); dialog.close();
      })); loadButton.disabled = !row || working;
      actions.append(saveButton, loadButton);
      if (number) {
        const localButton = button('이 기기 슬롯 업로드', () => run(async () => {
        const local = await localStore.get(number); if (!local) throw new Error('같은 번호의 기기 슬롯이 비어 있습니다.');
        if (!await ask(`이 기기의 「${local.title}」 저장을 ${title.textContent}에 업로드할까요?${row ? ' 기존 클라우드 저장이 교체됩니다.' : ''}`)) return;
        await upload(id, row?.revision || '0', local);
        }));
        localButton.disabled = working; actions.append(localButton);
      }
      card.append(title, detail, excerpt, actions); grid.append(card);
    }
  }
  async function refresh() {
    try {
      const data = await client.list();
      if (lastAccount && lastAccount !== data.account) { failedAuto = ''; clearTimeout(timer); timer = 0; due = 0; queued = false; }
      lastAccount = data.account; rows = data.slots; login.hidden = true;
      status.textContent = `${data.displayName} · 클라우드 ${rows.length}개 저장 · 같은 미디어는 슬롯 간 공유됩니다`;
      if (cloudState === '클라우드: 연결 확인 중') syncState('연결됨');
    } catch (error) { rows = []; client.clear(); status.textContent = error.message; login.hidden = error.status !== 401; syncState(error.status === 401 ? '로그인 필요' : '연결 실패 · 기기 저장 이용 가능'); }
    settings(); render();
  }
  async function upload(id, revision, record) {
    const owner = client.account, includeMedia = media.checked;
    syncState('진행·미디어 분리 중');
    const payload = await cloudPayload(record, includeMedia);
    if (client.account !== owner) throw new Error('계정이 바뀌어 업로드를 취소했습니다.');
    const saved = await client.put(id, payload, revision, crypto.randomUUID(), progress); remember(saved); failedAuto = '';
    syncState(`동기화 완료 ${new Date().toLocaleTimeString('ko-KR')}`);
    notify('클라우드에 저장했습니다.');
  }
  async function run(task) {
    if (working) return; busy(true); let problem = '';
    try { await task(); } catch (error) { problem = error.message; syncState(`미완료 · ${problem}`); }
    finally { busy(false); await refresh(); if (problem) { status.textContent = problem; notify(problem); } }
  }
  async function automatic() {
    timer = 0; due = 0;
    if (!queued || working) { if (queued) schedule(15000); return; }
    const slug = currentSlug();
    if (!slug || !client.account || !preferences().auto?.[slug] || failedAuto) { queued = false; return; }
    if (canSave()) { schedule(15000); return; }
    queued = false; busy(true);
    try {
      const account = client.account, id = continueSlot(slug), revision = storage.getItem(baselineKey(id)) || '0';
      syncState('자동 저장 준비 중');
      const record = await capture(1); const payload = await cloudPayload(record, Boolean(preferences().media));
      if (client.account !== account || currentSlug() !== slug) return;
      const row = await client.put(id, payload, revision, crypto.randomUUID(), progress); remember(row); syncState(`동기화 완료 ${new Date().toLocaleTimeString('ko-KR')}`);
    } catch (error) { failedAuto = error.message; syncState(`자동 저장 보류 · ${error.message}`); notify(`클라우드 자동 저장 보류 · ${error.message}`); }
    finally { busy(false); if (dialog.open) await refresh(); if (queued && !failedAuto) schedule(15000); }
  }
  auto.onchange = () => {
    const prefs = preferences(), slug = currentSlug(); if (!slug || !client.account) return;
    prefs.auto = { ...prefs.auto, [slug]: auto.checked }; writePreferences(prefs); failedAuto = '';
    if (auto.checked) schedule(1000);
  };
  media.onchange = () => writePreferences({ ...preferences(), media: media.checked });
  dialog.querySelector('[data-close]').onclick = () => { if (!working) dialog.close(); };
  dialog.querySelector('[data-refresh]').onclick = () => { if (!working) { failedAuto = ''; void refresh(); } };
  dialog.addEventListener('cancel', e => { if (working) e.preventDefault(); });
  return {
    async show() { onOpen(); if (!dialog.open) dialog.showModal(); await refresh(); },
    schedule,
    localSaved() { localState = `기기 저장 완료 ${new Date().toLocaleTimeString('ko-KR')}`; if (!working && client.account && preferences().auto?.[currentSlug()]) cloudState = '클라우드: 동기화 대기'; announce(); },
    async connect() { await refresh(); },
    get working() { return working; },
  };
}
