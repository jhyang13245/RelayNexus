import { estimateCost, sumCosts, usageReceipt, pricingDate } from './vn-cost-core.mjs?v=4a6fe5d540c6';
import { requestDurableStorage } from './vn-storage.mjs?v=4a6fe5d540c6';
import { createBudget } from './vn-budget.mjs?v=4a6fe5d540c6';
import { diagnostics } from './vn-diagnostics.mjs?v=4a6fe5d540c6';

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
    const store = tx.objectStore('calls');
    const request = Array.isArray(row) ? (row.forEach(value => store.put(value)), null) : row ? store.put(row) : store.getAll();
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
export function installCostMeter({ context, onChange, notify = () => {}, enabled = () => true }) {
  const nativeFetch = globalThis.fetch.bind(globalThis), memory = new Map();
  const budget = createBudget({ readRows: () => records(), saveRow: row => records(row), notify });
  let storageFailed = false, historyTask = Promise.resolve();
  let historyBefore = 0;
  try { const key = 'dancheong-vn-meter-start-v1'; historyBefore = Number(localStorage.getItem(key)) || Date.now(); localStorage.setItem(key, String(historyBefore)); } catch { historyBefore = 0; /* Do not backfill without a durable deduplication boundary. */ }
  async function save(row) {
    memory.set(row.id, row);
    try { await records(row); } catch { storageFailed = true; }
    onChange?.();
  }
  async function observe(response, row, received = () => {}) {
    let receipt = null;
    try {
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '', first = true; const started = performance.now();
        const line = value => { if (!value.startsWith('data:')) return; if (first && /output_text.delta|content.delta|response.completed/u.test(value)) { first = false; diagnostics.record('firstText', performance.now() - started + (row.headerMs || 0)); } try { receipt = usageReceipt(JSON.parse(value.slice(5).trim())) || receipt; } catch { /* [DONE] or partial provider data */ } };
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
    received(); // API elapsed time excludes the subsequent local accounting write.
    // Store accounting only. Never persist prompts, prose, images or API keys.
    const usage = receipt?.usage;
    const numeric = object => Object.fromEntries(Object.entries(object || {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)));
    const safeUsage = usage ? { ...numeric(usage), input_tokens_details: { ...numeric(usage.input_tokens_details), cached_tokens_details: numeric(usage.input_tokens_details?.cached_tokens_details || usage.cached_tokens_details) }, output_tokens_details: numeric(usage.output_tokens_details) } : null;
    const complete = { ...row, state: response.ok ? 'complete' : 'error', model: receipt?.model || row.model, serviceTier: receipt?.serviceTier, usage: safeUsage };
    complete.cost = estimateCost(complete);
    await save(complete);
  }
  globalThis.fetch = async (input, init) => {
    if (!enabled()) return nativeFetch(input, init);
    let url;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.origin); } catch { return nativeFetch(input, init); }
    if (url.pathname === '/api/text/responses') url.pathname = globalThis.NexusCortexTextProvider === 'openai' ? '/api/vn/openai/responses' : '/api/vn/go/responses';
    if (url.origin === 'https://api.openai.com' && url.pathname === '/v1/responses') url = new URL('/api/vn/openai/responses', location.origin);
    // Typecast may also be called straight from the browser (see vn-typecast-direct.mjs).
    const typecastDirect = url.origin === 'https://api.typecast.ai' && url.pathname === '/v1/text-to-speech';
    if (!typecastDirect && (url.origin !== location.origin || !['/api/vn/voice', '/api/vn/image', '/api/vn/gemini/image', '/api/vn/gemini/music', '/api/vn/gemini/voice', '/api/vn/typecast/voice', '/api/vn/openai/responses', '/api/vn/go/responses'].includes(url.pathname))) return nativeFetch(input, init);
    let body = {};
    try { if (typeof init?.body === 'string') body = JSON.parse(init.body); } catch { /* Request validation belongs to the API. */ }
    const image = url.pathname === '/api/vn/image' || url.pathname === '/api/vn/gemini/image';
    if (image || typecastDirect || ['/api/vn/voice', '/api/vn/gemini/voice', '/api/vn/typecast/voice', '/api/vn/gemini/music'].includes(url.pathname)) void requestDurableStorage();
    const headers = init?.headers ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
    const row = { id: crypto.randomUUID(), at: Date.now(), ...context(), provider: url.pathname.startsWith('/api/vn/go/') ? 'go' : url.pathname.startsWith('/api/vn/gemini/') ? 'gemini' : url.pathname.startsWith('/api/vn/typecast/') || typecastDirect ? 'typecast' : 'openai', category: typecastDirect ? 'voice' : resolveCostCategory({ image, purpose: body.purpose, headers }), model: typeof body.model === 'string' ? body.model : '', state: 'pending', usage: null, priceDate: pricingDate };
    try {
      await historyTask;
      const admission = await budget.admit(row, { optional: ['scene', 'expression', 'music'].includes(row.category) || new Headers(headers).get('X-VN-Optional') === '1' });
      if (!admission.allowed) return Response.json({ error: { message: admission.reason, code: 'VN_BUDGET_LIMIT' }, code: 'VN_BUDGET_LIMIT' }, { status: 402 });
    } catch (error) { notify(error.message); return Response.json({ error: { message: '예산 보호를 확인하지 못해 유료 요청을 보류했습니다. ' + error.message, code: 'VN_BUDGET_LIMIT' } }, { status: 402 }); }
    void save(row);
    const end = diagnostics.start(image ? 'image' : ['cast', 'voice', 'music'].includes(row.category) ? row.category : 'text'), started = performance.now();
    try {
      const response = await nativeFetch(input, init); row.headerMs = Math.round(performance.now() - started);
      // Binary audio carries no usage JSON. Do not tee and retain a second
      // copy of the full audio stream just for accounting on mobile devices.
      const receipt = (response.headers.get('content-type') || '').toLowerCase().startsWith('audio/')
        ? new Response(null, { status: response.status, headers: response.headers }) : response.clone();
      void observe(receipt, row, end).finally(end);
      return response;
    } catch (error) { end(); void save({ ...row, state: 'error', cost: estimateCost(row) }); throw error; }
  };
  return {
    importHistory(turns, current = context()) {
      // Rendering proceeds now, but paid admission still awaits accounting.
      const task = async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      const existing = new Set((await records()).map(row => row.id)), batch = [];

      for (const turn of turns) for (const entry of turn.apiLog || []) {
        const at = Date.parse(entry.startedAt);
        if (!at || at >= historyBefore || !entry.id) continue;
        const old = entry.usage;
        const usage = old ? { input_tokens: old.inputTokens, output_tokens: old.outputTokens, input_tokens_details: { cached_tokens: old.cachedTokens, text_tokens: old.textInputTokens, image_tokens: old.imageInputTokens }, output_tokens_details: { image_tokens: old.imageOutputTokens } } : null;
        const row = { id: `history:${current.slug}:${entry.id}`, at, ...current, provider: String(entry.provider).startsWith('opencode-go') ? 'go' : 'openai', category: String(entry.model).startsWith('gpt-image-') ? 'scene' : 'text', model: entry.model || '', state: 'complete', usage, priceDate: pricingDate };
        row.cost = estimateCost(row);
        if (!existing.has(row.id)) { existing.add(row.id); batch.push(row); }
      }
      if (batch.length) { await records(batch); for (const row of batch) memory.set(row.id, row); onChange?.(); }
      };
      historyTask = historyTask.catch(()=>{}).then(task);
      return historyTask;
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
      await budget.render(element, slug, onChange);
      if (storageFailed) { const note = document.createElement('p'); note.className = 'vn-cost-note'; note.textContent = '기기 저장이 불가능해 일부 사용량은 현재 탭에만 보관됩니다.'; element.append(note); }
    },
  };
}
