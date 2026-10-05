import { estimateCost } from './vn-cost-core.mjs?v=ef485ae04925';
const key = 'dancheong-vn-budget-v1';
const finite = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(10000, Number(value))) : 0;
export function budgetSettings(storage = localStorage) {
  try { const data = JSON.parse(storage.getItem(key) || '{}'); return { work: data.work || {}, session: finite(data.session), callLimit: Math.floor(finite(data.callLimit)), sessionId: String(data.sessionId || ''), sessionAt: Number(data.sessionAt) || 0 }; }
  catch { return { work: {}, session: 0, callLimit: 0, sessionId: '', sessionAt: 0 }; }
}
export function reservationFor(row, history) {
  if (['go', 'typecast'].includes(row.provider)) return 0;
  const previous = history.filter(r => r.provider === row.provider && r.model === row.model && r.category === row.category)
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0)).slice(0, 20)
    .map(r => (r.cost || estimateCost(r)).usd).filter(n => Number.isFinite(n));
  // These are planning reserves, not provider tariffs or billing guarantees.
  const fallback = { text: .02, cast: .015, background: .05, portrait: .06, expression: .06, scene: .08, voice: .03, music: .08 };
  return Math.max(fallback[row.category] || .05, ...previous.map(n => n * 1.25));
}
export function budgetDecision(settings, rows, row, reserve, optional = false) {
  const charge = r => { const cost = r.cost || estimateCost(r); return Number.isFinite(cost.usd) ? cost.usd : Number(r.reserveUsd) || 0; };
  const workRows = rows.filter(r => r.slug === row.slug), sessionRows = rows.filter(r => r.budgetSession === settings.sessionId && settings.sessionId);
  const work = workRows.reduce((n,r) => n+charge(r),0), session = sessionRows.reduce((n,r) => n+charge(r),0);
  const limits = [[finite(settings.work[row.slug]), work], [settings.session, session]];
  const exceeded = limits.some(([limit,used]) => limit && (used >= limit || used + reserve > limit));
  const near = limits.some(([limit,used]) => limit && used >= limit * .8);
  const callsExceeded = settings.callLimit > 0 && sessionRows.length >= settings.callLimit;
  return { allowed: !exceeded && !callsExceeded && !(optional && near), work, session, calls: sessionRows.length, near,
    reason: callsExceeded ? '이번 세션의 API 호출 수 제한에 도달했습니다.' : exceeded ? '예상 비용과 진행 중 요청의 예약액이 예산 한도에 도달했습니다.' : optional && near ? '예산의 80%를 사용해 추가 연출 이미지 생성을 보류했습니다.' : '' };
}
export function createBudget({ readRows, saveRow, storage = localStorage, locks = globalThis.navigator?.locks, notify = () => {} }) {
  let warned = '', serial = Promise.resolve();
  function settings() {
    const data = budgetSettings(storage);
    if (!data.sessionId) { data.sessionId = crypto.randomUUID(); data.sessionAt = Date.now(); storage.setItem(key, JSON.stringify(data)); }
    return data;
  }
  const lock = task => locks?.request ? locks.request('dancheong-vn-spending-v1', task) : (serial = serial.catch(() => {}).then(task));
  return {
    async admit(row, { optional = false } = {}) {
      return lock(async () => {
        const prefs = settings(), enabled = prefs.session || finite(prefs.work[row.slug]) || prefs.callLimit;
        // Browsers without origin-wide locks cannot safely enforce concurrent
        // budgets. Fail closed for a configured limit, without blocking reading.
        if (enabled && !locks?.request) throw new Error('이 브라우저에서는 동시 요청 예산 보호를 사용할 수 없습니다. 한도를 해제하거나 지원 브라우저를 사용해 주세요.');
        const history = enabled ? await readRows() : [];
        row.budgetSession = prefs.sessionId; row.reserveUsd = reservationFor(row, history);
        const decision = budgetDecision(prefs, history, row, row.reserveUsd, optional);
        if (!decision.allowed) { if (warned !== decision.reason) { warned = decision.reason; notify(decision.reason); } return decision; }
        // Persist admission before starting a paid request. Pending or unknown
        // usage keeps its reserve across reloads; it is never treated as zero.
        if (enabled) await saveRow(row); warned = ''; return decision;
      });
    },
    async render(element, slug, onChange = () => {}) {
      const prefs = settings(), rows = await readRows().catch(() => []), report = budgetDecision(prefs, rows, { slug }, 0);
      const section = document.createElement('section'); section.className = 'vn-budget';
      section.innerHTML = '<h3>자동 비용 관리</h3><div class="vn-budget-fields"><label>현재 작품 한도 (USD)<input data-work type="number" min="0" max="10000" step="0.1"></label><label>이번 세션 한도 (USD)<input data-session type="number" min="0" max="10000" step="0.1"></label><label>세션 API 호출 수 제한<input data-calls type="number" min="0" max="10000" step="1"></label></div><p data-summary></p><p>0은 제한 없음입니다. 80%부터 추가 표정·사건·컷인·음악 생성을 보류합니다. 한도에 도달하면 새 API 호출을 멈추고 저장된 본문·이미지는 계속 사용할 수 있습니다. 요청별 예약액은 최근 비용에 25% 여유를 둔 예상치이며 최소 예약액이 있습니다. 실제 청구 한도는 제공사에서도 설정해 주세요. 사용량 미확인은 예약액으로 유지합니다. Go 구독·Typecast 크레딧은 USD로 환산하지 않으므로 호출 수 제한을 함께 사용할 수 있습니다.</p><button type="button" data-save>한도 적용</button><button type="button" data-reset>새 비용 세션 시작</button><span role="status"></span>';
      const work = section.querySelector('[data-work]'), session = section.querySelector('[data-session]'), calls = section.querySelector('[data-calls]');
      work.value = finite(prefs.work[slug]); work.disabled = !slug; session.value = prefs.session; calls.value = prefs.callLimit;
      section.querySelector('[data-summary]').textContent = `예상·예약 합계 · 현재 작품 $${report.work.toFixed(4)} / 이번 세션 $${report.session.toFixed(4)} · ${report.calls}회`;
      section.querySelector('[data-save]').onclick = async () => {
        try { await lock(async () => { const value = settings(); if (slug) value.work[slug] = finite(work.value); value.session = finite(session.value); value.callLimit = Math.floor(finite(calls.value)); storage.setItem(key, JSON.stringify(value)); }); onChange(); section.querySelector('[role=status]').textContent = '한도를 적용했습니다. 보류된 생성은 이미지 상태에서 다시 시도할 수 있습니다.'; }
        catch { section.querySelector('[role=status]').textContent = '한도를 저장하지 못했습니다.'; }
      };
      section.querySelector('[data-reset]').onclick = async () => {
        if (!confirm('기존 비용 기록은 유지하고 세션 한도 집계만 새로 시작할까요?')) return;
        await lock(async () => { const value = settings(); value.sessionId = crypto.randomUUID(); value.sessionAt = Date.now(); storage.setItem(key, JSON.stringify(value)); }); onChange();
      };
      element.prepend(section);
    },
  };
}
