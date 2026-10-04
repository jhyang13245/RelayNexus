import { pendingAdjudication, retryAdjudication, storageProblem } from './vn-progress.mjs?v=88af24489d44';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function retryableVerdict(code = '') {
  // Invalid credentials, billing, permissions and invalid checkpoints cannot
  // improve by repeatedly charging the same request.
  return !/(?:HTTP[_ :]*(?:400|401|402|403|404|422)|api.?key|unauthor|forbidden|billing|insufficient.quota|CHECKPOINT_MISMATCH|RESTORE_REQUIRED)/iu.test(code);
}

// Retry only the event-verdict request. Publication, branch effects and beat
// counters are applied by Cortex ONCE, after the final result is returned.
export async function retryVerdict(attempt, { sleep = delay, current = () => true, onStatus = () => {} } = {}) {
  const history = []; const started = Date.now();
  let result;
  try {
    for (let n = 1; n <= 3; n++) {
      if (!current()) return { available: false, code: 'RECOVERY_CONTEXT_CHANGED' };
      if (n > 1) { onStatus({ kind: 'adjudication', phase: 'waiting', attempt: n - 1, max: 2 }); await sleep(n === 2 ? 1500 : 4500); }
      if (!current()) return { available: false, code: 'RECOVERY_CONTEXT_CHANGED' };
      if (n > 1) onStatus({ kind: 'adjudication', phase: 'running', attempt: n - 1, max: 2 });
      result = await attempt();
      history.push({ available: result.available === true, code: result.code || 'OK' });
      if (result.available || !retryableVerdict(result.code)) break;
    }
    return { ...result, autoRecovery: { attempts: history.length, history, totalMs: Date.now() - started } };
  } finally { onStatus(null); }
}

export function createAutoRecovery({ now = Date.now, changed = () => {} } = {}) {
  let owner, scope, job = null, running = false;
  const attempts = new Map();
  const view = () => job ? { ...job, waiting: ['waiting', 'running', 'offline', 'paused'].includes(job.phase) } : { phase: 'idle', waiting: false };
  function inspect(api) {
    const storage = api?._storageStatus?.();
    const pending = pendingAdjudication(api);
    if (storage?.blocked) return { kind: 'storage', id: storage.failure?.turnId || api._turns?.().at(-1)?.id || 'session',
      code: storage.failure?.saveError || storage.failure?.code || '', fatal: storage.restoreFailed || typeof api._retryStorage !== 'function' };
    if (pending) return { kind: 'adjudication', id: pending.id, code: pending.diagnostic || '', fatal: !retryableVerdict(pending.diagnostic) };
    return null;
  }
  function tick(api, { scope: nextScope, enabled = true, online = true, canJudge = true } = {}) {
    if (!api) return view();
    if (owner !== api || scope !== nextScope) {
      // All callers block imports while running. Also invalidate late results
      // in case the engine was replaced externally.
      owner = api; scope = nextScope; job = null; attempts.clear();
    }
    if (running) return view();
    const issue = inspect(api);
    if (!issue) { job = null; return view(); }
    // ADJUDICATION_PENDING is also the normal in-flight state. It is an
    // automatic recovery candidate only after the engine releases its lock.
    if (!job && issue.kind === 'adjudication' && api._isBusy?.()) return view();
    const key = `${issue.kind}:${issue.id}`;
    if (job?.key !== key) job = { ...issue, key, phase: 'waiting', attempt: attempts.get(key) || 0, max: 3, nextAt: now() + 1000 };
    if (issue.fatal || job.attempt >= job.max) { job.phase = 'failed'; return view(); }
    if (!enabled || api._isBusy?.()) { job.phase = 'paused'; return view(); }
    if (issue.kind === 'adjudication' && !canJudge) { job.phase = 'failed'; job.code = 'API_KEY_REQUIRED'; return view(); }
    if (issue.kind === 'adjudication' && !online) { job.phase = 'offline'; return view(); }
    if (now() < job.nextAt) { job.phase = 'waiting'; return view(); }
    job.phase = 'running'; job.attempt++; attempts.set(key, job.attempt); running = true;
    const ownJob = job, ownScope = scope;
    void (async () => {
      try {
        if (issue.kind === 'storage') {
          const result = await api._retryStorage();
          if (!result?.ok || storageProblem(api)) throw new Error(result?.code || 'PERSIST_FAILED');
        } else {
          const completed = await retryAdjudication(api, { enabled: () => !api._isBusy?.() });
          if (!completed) throw new Error('ADJUDICATION_NOT_READY');
        }
      } catch (error) { ownJob.code = String(error?.message || 'RECOVERY_FAILED'); }
      finally {
        running = false;
        if (owner === api && scope === ownScope && job === ownJob) {
          const remaining = inspect(api);
          if (!remaining || `${remaining.kind}:${remaining.id}` !== key) job = null;
          else { job.phase = job.attempt >= job.max ? 'failed' : 'waiting'; job.nextAt = now() + (job.attempt === 1 ? 3000 : 9000); }
          changed();
        }
      }
    })();
    return view();
  }
  return { tick, view, get running() { return running; }, reset() { if (!running) { job = null; attempts.clear(); } } };
}
