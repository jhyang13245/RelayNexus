import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createAutoRecovery, retryVerdict } from '../public/vn-recovery.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  let clock = 0, scope = 1, calls = 0, busy = false;
  const turn = { id: 'one', text: '이미 읽은 본문', status: 'COMMITTED', txn: { txnId: 'same' } };
  const storage = { blocked: true, failure: { code: 'PERSIST_WRITE_TIMEOUT', turnId: turn.id } };
  const api = { _turns: () => [turn], _isBusy: () => busy, _storageStatus: () => storage,
    _retryStorage: async () => { calls++; storage.blocked = false; return { ok: true }; },
    runTurnV1111: async (...args) => { assert.deepEqual(args, []); calls++; turn.status = 'COMMITTED'; },
    _setInput: () => assert.fail('must not replace the input'), _continue: () => assert.fail('must not write another beat') };
  const recovery = createAutoRecovery({ now: () => clock });
  return { api, turn, storage, recovery, get calls() { return calls; }, setBusy: v => { busy = v; },
    tick: (ms = 0, options = {}) => { clock += ms; return recovery.tick(api, { scope, ...options }); },
    changeScope: () => { scope++; } };
}
test('temporary save failure recovers automatically before the exact pending beat resumes', async () => {
  const h = fixture(); h.turn.status = 'ADJUDICATION_PENDING';
  h.turn.sameTurnResume = { schema: 'CORTEX_SAME_TURN_RESUME_V1' };
  assert.equal(h.tick().waiting, true);
  h.tick(1000); h.tick(); await flush(); assert.equal(h.calls, 1);
  h.tick(); h.tick(1000); await flush();
  assert.equal(h.calls, 2); assert.equal(h.turn.text, '이미 읽은 본문'); assert.equal(h.turn.status, 'COMMITTED');
  assert.equal(h.tick().phase, 'idle');
});
test('busy engines, imports, and offline verdicts wait without spending attempts', async () => {
  const h = fixture(); h.setBusy(true); h.tick(9999); await flush(); assert.equal(h.calls, 0);
  h.setBusy(false); h.tick(9999, { enabled: false }); await flush(); assert.equal(h.calls, 0);
  h.storage.blocked = false; h.turn.status = 'ADJUDICATION_PENDING'; h.turn.sameTurnResume = { schema: 'CORTEX_SAME_TURN_RESUME_V1' };
  assert.equal(h.tick(9999, { online: false }).phase, 'offline'); assert.equal(h.calls, 0);
  h.tick(9999); await flush(); assert.equal(h.calls, 1);
});
test('ordinary in-flight adjudication does not pause automatic reading of already published sentences', () => {
  const h = fixture(); h.storage.blocked = false; h.turn.status = 'ADJUDICATION_PENDING';
  h.turn.sameTurnResume = { schema: 'CORTEX_SAME_TURN_RESUME_V1' }; h.setBusy(true);
  assert.equal(h.tick().waiting, false); assert.equal(h.calls, 0);
});
test('persistent storage failure has bounded backoff and never deletes content or loops on render', async () => {
  const h = fixture(); let writes = 0; h.api._retryStorage = async () => { writes++; return { ok: false, code: 'QuotaExceededError' }; };
  h.tick(); h.tick(1000); await flush();
  for (let i = 0; i < 100; i++) h.tick(); assert.equal(writes, 1);
  h.tick(3000); await flush(); h.tick(9000); await flush();
  assert.equal(h.tick(999999).phase, 'failed'); assert.equal(writes, 3); assert.equal(h.storage.blocked, true);
  assert.equal(h.turn.text, '이미 읽은 본문');
  h.changeScope(); h.tick(); h.tick(1000); await flush(); assert.equal(writes, 4);
});
test('failed restore is never overwritten and invalid credentials are never automatically retried', async () => {
  const h = fixture(); h.storage.restoreFailed = true;
  assert.equal(h.tick().phase, 'failed'); h.tick(99999); assert.equal(h.calls, 0);
  h.storage.blocked = false; h.turn.status = 'ADJUDICATION_PENDING'; h.turn.sameTurnResume = { schema: 'CORTEX_SAME_TURN_RESUME_V1' }; h.turn.diagnostic = 'VERDICT_HTTP_401';
  assert.equal(h.tick().phase, 'failed'); h.tick(99999); assert.equal(h.calls, 0);
});
test('a manual save recovery cancels a scheduled retry; a stale task cannot affect another session', async () => {
  const h = fixture(); h.tick(); h.storage.blocked = false;
  assert.equal(h.tick(2000).phase, 'idle'); assert.equal(h.calls, 0);
  let finish; h.storage.blocked = true; h.api._retryStorage = () => new Promise(resolve => { finish = resolve; });
  h.tick(); h.tick(1000); h.changeScope(); h.storage.blocked = false; h.tick();
  finish({ ok: true }); await flush(); assert.equal(h.tick().phase, 'idle');
});
test('verdict retries transient and malformed output, stops on success or auth, and records every attempt', async () => {
  let calls = 0; const sleeps = [], status = [];
  const result = await retryVerdict(async () => ++calls < 3 ? { available: false, code: calls === 1 ? 'VERDICT_HTTP_503' : 'Unexpected token in JSON' } : { available: true },
    { sleep: async ms => sleeps.push(ms), onStatus: s => status.push(s) });
  assert.equal(calls, 3); assert.deepEqual(sleeps, [1500, 4500]); assert.equal(result.autoRecovery.attempts, 3); assert.equal(status.at(-1), null);
  calls = 0; await retryVerdict(async () => { calls++; return { available: false, code: 'VERDICT_HTTP_401' }; }); assert.equal(calls, 1);
  calls = 0; const failed = await retryVerdict(async () => { calls++; return { available: false, code: 'VERDICT_TIMEOUT' }; }, { sleep: async () => {} });
  assert.equal(calls, 3); assert.equal(failed.available, false);
});
test('verdict backoff rechecks session identity before dispatch', async () => {
  let calls = 0, current = true;
  await retryVerdict(async () => { calls++; return { available: false, code: 'VERDICT_TIMEOUT' }; }, { current: () => current, sleep: async () => { current = false; } });
  assert.equal(calls, 1);
});

// Run the actual closure adapter against engine state, not a reimplementation.
function storageAdapter() {
  const metrics = { persistence: { status: 'FAILED' }, lifecycle: { stage: 'SAVE_BLOCKED' } };
  let writes = 0, options, result = { ok: true, savedAt: 'saved', sequence: 8 };
  const context = vm.createContext({ busy: false, restoreFailedV1390: false, storageBlockedV1390: true,
    storageFailureV1396: { code: 'PERSIST_WRITE_TIMEOUT', turnId: 'one' }, turns: [{ id: 'one', status: 'COMMITTED', metrics }],
    persistenceQueueV1363: Promise.resolve(), clone: structuredClone, $: () => ({}), syncSameTurnUiV13914() {}, renderTelemetry() {},
    storageNoticeV1390() { context.storageBlockedV1390 = true; },
    persist: async input => { writes++; options = input; return result; } });
  vm.runInContext(readFileSync(new URL('../scripts/cortex-storage-recovery.js', import.meta.url), 'utf8'), context);
  return { context, metrics, run: () => context.retryStorageVN(), setResult: v => { result = v; }, get writes() { return writes; }, get options() { return options; } };
}
test('storage adapter saves committed metrics durably and releases its engine lock only after completion', async () => {
  const h = storageAdapter(); const first = h.run(); assert.equal(h.context.busy, true);
  assert.equal((await h.run()).code, 'RECOVERY_BUSY'); assert.equal((await first).ok, true);
  assert.equal(h.writes, 1); assert.equal(h.options.committedTurnId, 'one');
  assert.equal(h.metrics.persistence.status, 'SAVED'); assert.equal(h.metrics.lifecycle.stage, 'DURABLE');
  assert.equal(h.context.busy, false); assert.equal(h.context.storageBlockedV1390, false);
});
test('failed save leaves the barrier and failure metrics intact; failed restores never persist', async () => {
  const h = storageAdapter(); h.setResult({ ok: false, code: 'QuotaExceededError' });
  assert.equal((await h.run()).ok, false); assert.equal(h.context.storageBlockedV1390, true);
  assert.equal(h.metrics.persistence.status, 'FAILED'); assert.equal(h.context.busy, false);
  h.context.restoreFailedV1390 = true; assert.equal((await h.run()).code, 'RESTORE_REQUIRED'); assert.equal(h.writes, 1);
});

test('generated Cortex verdict adapter retries requests before applying branch effects once', async () => {
  const html = readFileSync(new URL('../public/cortex.html', import.meta.url), 'utf8');
  const start = html.indexOf('  async function requestUnifiedAdjudicationV1360(');
  const code = html.slice(start, html.indexOf('\n  function createContinuityJudgeQueueV240(', start));
  let requests = 0, branchEffects = 0, resourceEffects = 0;
  const turn = { id: 'beat', txn: { commitGraphCatalog: { requirements: [] } }, metrics: {} };
  const ctx = vm.createContext({ performance, AbortController, setTimeout, clearTimeout, sessionEpoch: 1, turns: [turn], scenario: { event: {}, runtime: {} },
    settings: { baseUrl: 'https://example.invalid', apiKey: 'fixture' }, asText: v => String(v ?? ''), clone: structuredClone,
    judgeWindowV1411: () => ({ eventIds: [], rawEvents: [], initialPublicProse: '' }), parseOutputText: json => json.output,
    CortexQuality: { eventContract: () => ({}) }, CortexProseMemory: { judgeTransport: () => ({ requirements: [], schema: {} }), judgeContract: () => ({}),
      transportVerdict: () => ({ available: true, requirements: [] }), judgeInstruction: '' },
    CortexBranchEnding: { pending: () => [], extend() {}, record() { branchEffects++; } },
    CortexJieum: { extend() {}, extendImages() {}, config: () => null, stage() { resourceEffects++; }, imageMoments: () => [] },
    NexusVNRetryVerdict: (attempt, options) => retryVerdict(attempt, { ...options, sleep: async () => {} }),
    apiFetchV1390: async () => { requests++; return requests < 3 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ output: '{}' }) }; } });
  vm.runInContext(code, ctx);
  const result = await ctx.requestUnifiedAdjudicationV1360('행동', turn.txn, '보존된 본문');
  assert.equal(result.available, true); assert.equal(requests, 3); assert.equal(branchEffects, 1); assert.equal(resourceEffects, 1);
  assert.equal(turn.metrics.adjudicationAttempts.attempts, 3);
  assert.equal(turn.metrics.adjudicationAttempts.history[0].code, 'VERDICT_HTTP_503');
});
