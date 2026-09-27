import { estimateCost, sumCosts, usageReceipt, pricingDate } from './vn-cost-core.mjs';
import { requestDurableStorage } from './vn-storage.mjs';

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dancheong-vn-usage-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('calls', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function records(row) {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('calls', row ? 'readwrite' : 'readonly');
    const request = row ? tx.objectStore('calls').put(row) : tx.objectStore('calls').getAll();
    tx.oncomplete = () => resolve(row || request.result); tx.onerror = tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
const money = usd => `$${usd.toFixed(4)}`;
const labels = { text: '본문·판정', cast: '인물 배치', background: '배경', scene: '장면', portrait: '인물', expression: '표정', voice: 'AI 음성', music: 'AI 음악' };
function purposeHeader(headers) {
  if (!headers) return '';
  if (typeof headers.get === 'function') {
    try { return String(headers.get('X-Dancheong-Purpose') ?? ''); } catch { return ''; }
  }
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry) && String(entry[0]).toLowerCase() === 'x-dancheong-purpose') return String(entry[1] ?? '');
    }
    return '';
  }
  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (String(key).toLowerCase() === 'x-dancheong-purpose') return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
    }
  }
  return '';
}
export function resolveCostCategory({ image = false, purpose = '', headers } = {}) {
  if (image) return ['background', 'scene', 'portrait', 'expression'].includes(purpose) ? purpose : 'scene';
  return ['cast', 'voice', 'music'].includes(purposeHeader(headers).trim()) ? purposeHeader(headers).trim() : 'text';
}
export function installCostMeter({ context, onChange }) {
  const nativeFetch = globalThis.fetch.bind(globalThis), memory = new Map();
  let storageFailed = false;
  let historyBefore = 0;
  try { const key = 'dancheong-vn-meter-start-v1'; historyBefore = Number(localStorage.getItem(key)) || Date.now(); localStorage.setItem(key, String(historyBefore)); } catch { historyBefore = 0; /* Do not backfill without a durable deduplication boundary. */ }
  async function save(row) {
    memory.set(row.id, row);
    try { await records(row); } catch { storageFailed = true; }
    onChange?.();
  }
  async function observe(response, row) {
    let receipt = null;
    try {
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '';
        const line = value => { if (!value.startsWith('data:')) return; try { receipt = usageReceipt(JSON.parse(value.slice(5).trim())) || receipt; } catch { /* [DONE] or partial provider data */ } };
        for (;;) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split(/\r?\n/u); buffer = lines.pop() || '';
          for (const value of lines) line(value);
          if (done) { line(buffer); break; }
          // Discard malformed unbounded SSE lines, never buffer a full transcript.
          if (buffer.length > 1000000) buffer = '';
        }
      } else if (!(response.headers.get('content-type') || '').startsWith('audio/')) receipt = usageReceipt(await response.json());
    } catch { /* A disconnected response is recorded with unknown usage. */ }
    // Store accounting only. Never persist prompts, prose, images or API keys.
    const usage = receipt?.usage;
    const numeric = object => Object.fromEntries(Object.entries(object || {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)));
    const safeUsage = usage ? { ...numeric(usage), input_tokens_details: { ...numeric(usage.input_tokens_details), cached_tokens_details: numeric(usage.input_tokens_details?.cached_tokens_details || usage.cached_tokens_details) }, output_tokens_details: numeric(usage.output_tokens_details) } : null;
    const complete = { ...row, state: response.ok ? 'complete' : 'error', model: receipt?.model || row.model, serviceTier: receipt?.serviceTier, usage: safeUsage };
    complete.cost = estimateCost(complete);
    await save(complete);
  }
  globalThis.fetch = async (input, init) => {
    let url;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.origin); } catch { return nativeFetch(input, init); }
    // Typecast may also be called straight from the browser (see vn-typecast-direct.mjs).
    const typecastDirect = url.origin === 'https://api.typecast.ai' && url.pathname === '/v1/text-to-speech';
    if (!typecastDirect && (url.origin !== location.origin || !['/api/voice', '/api/image', '/api/gemini/image', '/api/gemini/music', '/api/gemini/voice', '/api/typecast/voice', '/api/openai/responses', '/api/go/responses'].includes(url.pathname))) return nativeFetch(input, init);
    let body = {};
    try { if (typeof init?.body === 'string') body = JSON.parse(init.body); } catch { /* Request validation belongs to the API. */ }
    const image = url.pathname === '/api/image' || url.pathname === '/api/gemini/image';
    if (image || ['/api/voice', '/api/gemini/voice', '/api/typecast/voice', '/api/gemini/music'].includes(url.pathname)) void requestDurableStorage();
    const headers = init?.headers ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
    const row = { id: crypto.randomUUID(), at: Date.now(), ...context(), provider: url.pathname.startsWith('/api/go/') ? 'go' : url.pathname.startsWith('/api/gemini/') ? 'gemini' : url.pathname.startsWith('/api/typecast/') || typecastDirect ? 'typecast' : 'openai', category: typecastDirect ? 'voice' : resolveCostCategory({ image, purpose: body.purpose, headers }), model: typeof body.model === 'string' ? body.model : '', state: 'pending', usage: null, priceDate: pricingDate };
    void save(row);
    try {
      const response = await nativeFetch(input, init);
      void observe(response.clone(), row);
      return response;
    } catch (error) { void save({ ...row, state: 'error', cost: estimateCost(row) }); throw error; }
  };
  return {
    async importHistory(turns) {
      const current = context();
      for (const turn of turns) for (const entry of turn.apiLog || []) {
        const at = Date.parse(entry.startedAt);
        if (!at || at >= historyBefore || !entry.id) continue;
        const old = entry.usage;
        const usage = old ? { input_tokens: old.inputTokens, output_tokens: old.outputTokens, input_tokens_details: { cached_tokens: old.cachedTokens, text_tokens: old.textInputTokens, image_tokens: old.imageInputTokens }, output_tokens_details: { image_tokens: old.imageOutputTokens } } : null;
        const row = { id: `history:${current.slug}:${entry.id}`, at, ...current, provider: String(entry.provider).startsWith('opencode-go') ? 'go' : 'openai', category: String(entry.model).startsWith('gpt-image-') ? 'scene' : 'text', model: entry.model || '', state: 'complete', usage, priceDate: pricingDate };
        row.cost = estimateCost(row);
        await save(row);
      }
    },
    async render(element, slug) {
      let rows;
      try { rows = await records(); } catch { rows = []; storageFailed = true; }
      const merged = new Map(rows.map(row => [row.id, row]));
      for (const [id, row] of memory) merged.set(id, row);
      rows = [...merged.values()].sort((a, b) => b.at - a.at);
      const total = sumCosts(rows), work = sumCosts(rows.filter(row => row.slug === slug));
      element.innerHTML = `<div class="vn-cost-summary"><div><small>누적 API 예상 비용</small><strong>${money(total.usd)}</strong><span>${total.calls.toLocaleString()}회 호출 · 이 기기에서 집계</span></div><div><small>현재 작품</small><strong>${money(work.usd)}</strong><span>${work.calls.toLocaleString()}회 호출</span></div></div><p class="vn-cost-note">API가 반환한 사용량으로 계산한 USD 추정치입니다. 이전 기록은 작품을 열 때 저장된 사용량이 있는 호출만 합산합니다. 기록 없는 이용분·다른 기기·세금·환율·구독료는 제외됩니다. 실제 청구액은 제공사에서 확인하세요.</p><div class="vn-cost-breakdown"></div><p class="vn-cost-note">사용량 미확인 ${total.unknown}회 · OpenCode Go ${total.subscription}회 (구독 사용, 호출별 금액 미산정) · Typecast ${total.credits}회 (요금제 크레딧 차감, 금액 미산정)<br>입력 ${total.input.toLocaleString()} / 출력 ${total.output.toLocaleString()} 토큰</p><h3>최근 호출</h3><div class="vn-cost-table"><table><thead><tr><th>시간 / 작품</th><th>용도 / 모델</th><th>예상 비용</th></tr></thead><tbody></tbody></table></div><p class="vn-cost-note">요금 기준 ${pricingDate} · 캐시 토큰 반영. 이미지 캐시 세부 사용량이 없으면 할인 전 상한으로 표시합니다.<br><a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noopener noreferrer">OpenAI 요금표 ↗</a> · <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer">OpenAI 실제 사용량 ↗</a><br><a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer">Gemini 요금표 ↗</a> · <a href="https://aistudio.google.com/usage" target="_blank" rel="noopener noreferrer">Gemini 실제 사용량 ↗</a> · <a href="https://typecast.ai/developers/api" target="_blank" rel="noopener noreferrer">Typecast API 크레딧 ↗</a></p>`;
      const breakdown = element.querySelector('.vn-cost-breakdown');
      for (const [provider, label] of [['openai', 'OpenAI'], ['gemini', 'Google Gemini'], ['typecast', 'Typecast']]) {
        const subtotal = sumCosts(rows.filter(row => row.provider === provider));
        const span = document.createElement('span'); span.textContent = `${label} ${provider === 'typecast' ? '크레딧 · 금액 미산정' : money(subtotal.usd)} · ${subtotal.calls}회`; breakdown.append(span);
      }
      for (const category of ['text', 'cast', 'background', 'scene', 'portrait', 'expression', 'voice', 'music']) {
        const subtotal = sumCosts(rows.filter(row => row.category === category));
        const span = document.createElement('span'); span.textContent = `${labels[category]} ${money(subtotal.usd)} · ${subtotal.calls}회`; breakdown.append(span);
      }
      const tbody = element.querySelector('tbody');
      for (const row of rows.slice(0, 30)) {
        const tr = document.createElement('tr'), price = row.cost || estimateCost(row);
        for (const value of [new Date(row.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '\n' + (row.title || '작품 선택 전'), `${labels[row.category] || 'API'}\n${row.model || '모델 미확인'}`, row.state === 'pending' ? '사용량 대기' : price.kind === 'subscription' ? 'Go 구독' : price.kind === 'credits' ? 'Typecast 크레딧' : typeof price.usd === 'number' ? money(price.usd) + (price.kind === 'upper-bound' ? ' 이하' : '') : '금액 미확인']) {
          const td = document.createElement('td'); td.textContent = value; tr.append(td);
        }
        tbody.append(tr);
      }
      if (!rows.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 3; td.textContent = '아직 기록된 API 호출이 없습니다.'; tr.append(td); tbody.append(tr); }
      if (storageFailed) { const note = document.createElement('p'); note.className = 'vn-cost-note'; note.textContent = '기기 저장이 불가능해 일부 사용량은 현재 탭에만 보관됩니다.'; element.append(note); }
    },
  };
}
