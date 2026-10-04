import { storageStatus, requestDurableStorage, formatBytes, mediaInventory, mediaPaused } from './vn-storage.mjs?v=88af24489d44';

export function storageDescription(info) {
  const usage = Number.isFinite(info.usage) && Number.isFinite(info.quota)
    ? `이 사이트 사용량 ${formatBytes(info.usage)} / 브라우저 허용량 ${formatBytes(info.quota)} (추정)`
    : '이 브라우저에서는 사이트 저장 용량을 확인할 수 없습니다.';
  const protection = info.persistent === true ? '브라우저 자동 정리 방지: 승인됨'
    : !info.supported ? '브라우저 자동 정리 방지: 지원되지 않음' : '브라우저 자동 정리 방지: 승인되지 않음';
  return `${usage}\n${protection}. 브라우저 데이터 직접 삭제·기기 분실에는 파일 백업이 필요합니다.`;
}
export function createStoragePanel({ parent, works, slots, clear, resume, optimize, openSaves }) {
  const panel = document.createElement('section'); panel.className = 'vn-storage-panel';
  panel.innerHTML = '<h2>저장 공간 관리</h2><div class="vn-storage-overview"><p></p><progress max="100" hidden aria-label="사이트 저장 공간 사용률"></progress></div><div class="vn-storage-actions"><button type="button" data-protect>자동 정리 방지 요청</button><button type="button" data-refresh>새로고침</button><button type="button" data-backup>슬롯 파일 백업</button></div><p class="vn-storage-status" role="status" aria-live="polite"></p><p>이미지·음성 캐시만 작품별로 정리합니다. 이어하기, 10개 저장 슬롯, 작품 패키지와 비용 기록은 유지됩니다. 파일에서 가져온 슬롯에 포함된 미디어 복사본도 유지되므로 실제로 확보되는 용량은 다를 수 있습니다.</p><div class="vn-storage-works"></div><section class="vn-storage-confirm" hidden aria-label="캐시 정리 확인"><p></p><div><button type="button" data-cancel>취소</button><button type="button" data-confirm>캐시 삭제</button></div></section>';
  parent.append(panel);
  const status = panel.querySelector('.vn-storage-status'), list = panel.querySelector('.vn-storage-works'), confirmation = panel.querySelector('.vn-storage-confirm');
  let working = false, intent = null, revision = 0;
  const setBusy = value => { working = value; panel.setAttribute('aria-busy', String(value)); panel.querySelectorAll('button').forEach(button => { button.disabled = value; }); };
  const button = (label, action) => { const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.onclick = action; return node; };
  async function refresh() {
    const token = ++revision;
    try {
      const [info, inventory, summaries] = await Promise.all([storageStatus(), mediaInventory(), slots.list()]);
      if (token !== revision) return;
      panel.querySelector('.vn-storage-overview p').textContent = storageDescription(info);
      const progress = panel.querySelector('progress'); progress.hidden = !Number.isFinite(info.usage) || !info.quota; progress.value = info.quota ? Math.min(100, 100 * info.usage / info.quota) : 0;
      const names = new Map(works().map(row => [row.slug, row.title]));
      for (const row of summaries) if (!names.has(row.slug)) names.set(row.slug, row.title);
      for (const row of inventory) if (!names.has(row.slug)) names.set(row.slug, row.slug);
      list.replaceChildren();
      for (const [slug, title] of names) {
        const row = inventory.find(item => item.slug === slug);
        if (!row && !mediaPaused(slug, 'image') && !mediaPaused(slug, 'voice')) continue;
        const card = document.createElement('article'); card.className = 'vn-storage-work';
        const heading = document.createElement('h3'); heading.textContent = title; card.append(heading);
        for (const kind of ['image', 'voice']) {
          const group = row?.[kind] || { count: 0, bytes: 0 }, label = kind === 'image' ? '이미지' : 'AI 음성';
          const text = document.createElement('p'); text.textContent = `${label} ${group.count}개 · ${formatBytes(group.bytes)}${mediaPaused(slug, kind) ? ' · 자동 생성 일시 중지' : ''}`;
          const actions = document.createElement('div');
          if (kind === 'image' && group.count && optimize) actions.append(button('이미지 WebP 최적화', async () => {
            if (working) return; setBusy(true);
            try {
              const result = await optimize(slug, ({ done, total }) => { status.textContent = `이미지 최적화 중 · ${done}/${total}`; });
              status.textContent = `${result.changed}개 이미지를 WebP로 저장 · 약 ${formatBytes(result.savedBytes)} 절약. ${result.failed ? `${result.failed}개는 변환하지 못해 원본을 유지했습니다.` : '크기가 줄어든 이미지만 적용했습니다.'} 이미지 재생성 비용은 없습니다.`;
            } catch (error) { status.textContent = error.message; }
            finally { setBusy(false); await refresh(); }
          }));
          const remove = button(`${label} 캐시 정리`, () => {
            if (working) return; intent = { slug, kind }; confirmation.hidden = false;
            confirmation.querySelector('p').textContent = `「${title}」의 ${label} 캐시 ${group.count}개를 삭제할까요? 파일 백업이 없다면 이 캐시는 복구할 수 없습니다. 삭제 후 ${label} 자동 생성을 멈춥니다. 재개하면 필요한 미디어를 다시 생성하며 API 비용이 발생할 수 있습니다.`;
            confirmation.querySelector('[data-cancel]').focus();
          }); remove.disabled = working || !group.count; actions.append(remove);
          if (mediaPaused(slug, kind)) actions.append(button(`${label} 자동 생성 재개`, async () => { try { await resume(slug, kind); status.textContent = '자동 생성을 재개했습니다. 필요한 이미지·음성부터 생성합니다.'; await refresh(); } catch (error) { status.textContent = error.message; } }));
          card.append(text, actions);
        }
        list.append(card);
      }
      if (!list.childElementCount) { const empty = document.createElement('p'); empty.textContent = '정리할 이미지·음성 캐시가 없습니다.'; list.append(empty); }
      const total = summaries.reduce((sum, row) => sum + (row.storageBytes || 0), 0);
      const detail = document.createElement('p'); detail.textContent = `저장 슬롯 ${summaries.length} / 10개 · ${formatBytes(total)}${summaries.some(row => !row.storageBytes) ? ' + 이전 버전 슬롯 용량 미확인' : ''}. 슬롯에는 진행·패키지 이미지의 전체 백업이 포함됩니다.`; list.prepend(detail);
    } catch (error) { if (token === revision) status.textContent = `저장 공간을 확인하지 못했습니다: ${error.message}`; }
  }
  panel.querySelector('[data-protect]').onclick = async () => { setBusy(true); try { const granted = await requestDurableStorage({ manual: true }); status.textContent = granted ? '자동 정리 방지가 승인되었습니다. 중요한 진행은 파일로도 보관해 주세요.' : '브라우저에서 승인하지 않았거나 지원하지 않습니다. 파일 백업을 이용해 주세요.'; } finally { setBusy(false); await refresh(); } };
  panel.querySelector('[data-refresh]').onclick = () => void refresh();
  panel.querySelector('[data-backup]').onclick = openSaves;
  panel.querySelector('[data-cancel]').onclick = () => { intent = null; confirmation.hidden = true; };
  panel.querySelector('[data-confirm]').onclick = async () => {
    if (working || !intent) return; const selected = intent; intent = null; setBusy(true);
    try { const count = await clear(selected.slug, selected.kind); status.textContent = `${count}개의 캐시를 정리했습니다. 해당 종류의 자동 생성은 일시 중지했습니다.`; }
    catch (error) { status.textContent = error.message; }
    finally { confirmation.hidden = true; setBusy(false); await refresh(); }
  };
  return { refresh, get working() { return working; } };
}
