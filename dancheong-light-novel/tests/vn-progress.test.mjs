import test from 'node:test';
import assert from 'node:assert/strict';
import { storageProblem, submitEngineTurn, pendingAdjudication, retryAdjudication } from '../public/vn-progress.mjs';

function engine() {
  const turns = [{ id: 'saved', status: 'COMMITTED' }];
  const storage = { blocked: false };
  let input = '', requests = 0;
  return { turns, storage, get input() { return input; }, get requests() { return requests; },
    _turns: () => turns, _storageStatus: () => storage,
    _setInput: value => { input = value; },
    runTurnV1111: async () => { requests++; }, _continue: async () => { requests++; } };
}

test('blocked storage rejects a choice before invoking the writer or replacing its input', async () => {
  const api = engine(); api._setInput('보존된 행동'); api.storage.blocked = true;
  await assert.rejects(submitEngineTurn(api, { input: '새 행동' }), /저장/);
  assert.equal(api.requests, 0); assert.equal(api.input, '보존된 행동');
});
test('silent engine refusal is an error, retaining the selected input and recovery reason', async () => {
  const api = engine();
  await assert.rejects(submitEngineTurn(api, { input: '문을 두드린다.', notice: () => '기록 복구가 필요합니다.' }), /기록 복구/);
  assert.equal(api.input, '문을 두드린다.'); assert.equal(api.turns.length, 1);
});
test('auto continuation that produces no turn cannot report success', async () => {
  const api = engine(); await assert.rejects(submitEngineTurn(api, { auto: true }), /시작하지 못/);
});
test('a failed durable save after prose generation surfaces the storage problem', async () => {
  const api = engine();
  api.runTurnV1111 = async () => { api.turns.push({ id: 'new', status: 'COMMITTED' }); api.storage.blocked = true; api.storage.failure = { code: 'QuotaExceededError' }; };
  await assert.rejects(submitEngineTurn(api, { input: '행동' }), /공간이 부족/);
  assert.equal(api.turns.at(-1).id, 'new');
});
test('successful isolated save clears the guard and the next action creates one turn', async () => {
  const api = engine(); api.storage.blocked = true;
  api.storage.blocked = false; api.storage.failure = { code: 'PERSIST_WRITE_TIMEOUT', resolution: 'ISOLATED_SAVE' };
  api.runTurnV1111 = async () => api.turns.push({ id: 'new', status: 'COMMITTED' });
  assert.equal(storageProblem(api), null);
  assert.equal((await submitEngineTurn(api, { input: '행동' })).id, 'new');
});
test('same-turn adjudication can commit without allocating another turn', async () => {
  const api = engine(); api.turns[0].status = 'ADJUDICATION_PENDING';
  api.runTurnV1111 = async () => { api.turns[0].status = 'COMMITTED'; };
  assert.equal((await submitEngineTurn(api, { input: '행동' })).status, 'COMMITTED');
});
test('save timeout, quota, and restore failures receive distinct explanations', () => {
  const api = engine(); api.storage.blocked = true;
  api.storage.failure = { code: 'PERSIST_WRITE_TIMEOUT' }; assert.match(storageProblem(api).reason, /제시간/);
  api.storage.failure = { code: 'PERSIST_CONFLICT', saveError: 'QuotaExceededError' }; assert.match(storageProblem(api).reason, /공간/);
  api.storage.failure = { code: 'RESTORE_FAILED' }; api.storage.restoreFailed = true; assert.match(storageProblem(api).reason, /읽지 못/);
});

function parkedEngine() {
  const api = engine();
  Object.assign(api.turns[0], { status: 'ADJUDICATION_PENDING', text: '이미 공개된 본문.', input: '기존 행동', sameTurnResume: { schema: 'CORTEX_SAME_TURN_RESUME_V1', publicText: '이미 공개된 본문.' } });
  api._setInput('작성 중이던 입력');
  return api;
}

test('adjudication retry resumes the saved beat without replacing input or creating another turn', async () => {
  const api = parkedEngine(); let calls = 0;
  api.runTurnV1111 = async (...args) => { assert.deepEqual(args, []); calls++; api.turns[0].status = 'COMMITTED'; };
  assert.equal(pendingAdjudication(api).id, 'saved');
  assert.equal(await retryAdjudication(api), true);
  assert.equal(calls, 1); assert.equal(api.turns.length, 1);
  assert.equal(api.turns[0].text, '이미 공개된 본문.'); assert.equal(api.input, '작성 중이던 입력');
  assert.equal(pendingAdjudication(api), null);
});

test('adjudication retry never invokes the writer without a valid resume checkpoint', async () => {
  const api = engine();
  assert.equal(await retryAdjudication(api), false);
  api.turns[0].status = 'ADJUDICATION_PENDING';
  assert.equal(await retryAdjudication(api), false);
  assert.equal(api.requests, 0);
});

test('adjudication retry respects both storage and the original engine lock', async () => {
  const api = parkedEngine();
  assert.equal(await retryAdjudication(api, { enabled: () => false }), false);
  api.storage.blocked = true;
  await assert.rejects(retryAdjudication(api), /저장/);
  assert.equal(api.requests, 0);
});

test('double activation cannot dispatch two adjudication retries', async () => {
  const api = parkedEngine(); let finish, calls = 0;
  api.runTurnV1111 = () => { calls++; return new Promise(resolve => { finish = () => { api.turns[0].status = 'COMMITTED'; resolve(); }; }); };
  const first = retryAdjudication(api);
  assert.equal(await retryAdjudication(api), false);
  finish(); assert.equal(await first, true); assert.equal(calls, 1);
});

test('failed adjudication retains the resume point and permits an explicit retry', async () => {
  const api = parkedEngine();
  await assert.rejects(retryAdjudication(api, { notice: () => '판정 요청 실패 · 다시 시도해 주세요.' }), /판정 요청 실패/);
  assert.equal(api.requests, 1); assert.ok(pendingAdjudication(api));
  assert.equal(api.turns[0].text, '이미 공개된 본문.');
  api.runTurnV1111 = async () => { api.turns[0].status = 'COMMITTED'; };
  assert.equal(await retryAdjudication(api), true);
});

test('a save failure during adjudication surfaces recovery instead of success', async () => {
  const api = parkedEngine();
  api.runTurnV1111 = async () => { api.turns[0].status = 'COMMITTED'; api.storage.blocked = true; };
  await assert.rejects(retryAdjudication(api), /저장/);
});
