import test from 'node:test';
import assert from 'node:assert/strict';
import { storageProblem, submitEngineTurn } from '../public/vn-progress.mjs';

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
