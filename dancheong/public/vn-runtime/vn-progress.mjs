export function storageProblem(api) {
  const status = api?._storageStatus?.();
  if (!status?.blocked) return null;
  const code = String(status.failure?.saveError || status.failure?.code || 'PERSIST_FAILED');
  let reason = '현재 장면을 기기에 저장하지 못했습니다.';
  if (/quota|space|disk/iu.test(code)) reason = '브라우저의 저장 공간이 부족합니다.';
  else if (/timeout|blocked/iu.test(code) && code !== 'PERSIST_BLOCKED') reason = '기기 저장소가 제시간에 응답하지 않았습니다.';
  else if (/conflict/iu.test(code)) reason = '다른 저장본과 충돌해 저장을 완료하지 못했습니다.';
  else if (status.restoreFailed) reason = '기존 저장 기록을 읽지 못했습니다.';
  return { reason, restoreFailed: Boolean(status.restoreFailed), message: `${reason} 진행상황 창에서 백업하거나 별도 저장한 뒤 계속해 주세요. 새로고침 전 현재 진행을 보존해 주세요.` };
}

export function pendingAdjudication(api) {
  return api?._turns?.().find(turn => turn?.status === 'ADJUDICATION_PENDING' && turn?.sameTurnResume?.schema === 'CORTEX_SAME_TURN_RESUME_V1') || null;
}

const retrying = new WeakSet();
// Resume the engine's saved beat; never submit a new choice or replace input.
export async function retryAdjudication(api, { enabled = () => true, notice = () => '' } = {}) {
  const pending = pendingAdjudication(api);
  if (!pending || retrying.has(api) || !enabled()) return false;
  const problem = storageProblem(api);
  if (problem) throw new Error(problem.message);
  retrying.add(api);
  try {
    await api.runTurnV1111();
    const failedSave = storageProblem(api);
    if (failedSave) throw new Error(failedSave.message);
    const result = api._turns().find(turn => turn.id === pending.id);
    if (result?.status !== 'COMMITTED') throw new Error(notice() || '판정 보완을 완료하지 못했습니다. 본문은 보존되어 있으며 다시 시도할 수 있습니다.');
    return true;
  } finally { retrying.delete(api); }
}

// The engine can decline a turn without throwing (storage/recovery/event gates).
// A resolved promise alone therefore does not mean a choice was accepted.
export async function submitEngineTurn(api, { input, auto = false, notice = () => '' } = {}) {
  const problem = storageProblem(api);
  if (problem) throw new Error(problem.message);
  const before = api._turns().at(-1);
  const beforeId = before?.id, beforeStatus = before?.status;
  if (auto) await api._continue();
  else { api._setInput(input); await api.runTurnV1111(); }
  const after = api._turns().at(-1);
  const failedSave = storageProblem(api);
  if (failedSave) throw new Error(failedSave.message);
  if (after?.status === 'REJECTED') throw new Error('다음 장면을 완성하지 못했습니다. 입력을 보존했으니 다시 시도해 주세요.');
  if (after?.id === beforeId && after?.status === beforeStatus) {
    throw new Error(notice() || '다음 장면을 시작하지 못했습니다. 입력은 보존했습니다. 진행 안내를 확인한 뒤 다시 시도해 주세요.');
  }
  return after;
}
