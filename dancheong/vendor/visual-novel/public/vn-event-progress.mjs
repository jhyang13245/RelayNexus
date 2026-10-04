// Read-only projection of Cortex's saved judgments. Never normalize or advance
// the engine here: opening an inspector must not alter the story or call AI.
const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : '';
const number = value => Number.isFinite(value) && value >= 0 ? value : null;
const labels = {
  MET: ['충족', 'met'], ALTERNATIVE_MET: ['대체 달성', 'allowed'],
  OUT_OF_SCOPE: ['판정 범위 밖', 'allowed'], AUTHOR_ACCEPTED: ['작가 인정', 'allowed'],
  UNMET: ['미충족', 'unmet'], UNCERTAIN: ['미확인', 'pending'], UNREVIEWED: ['판정 전', 'pending'],
  ACTIVE: ['진행 중', 'active'], WAITING_FOR_START: ['시작 대기', 'pending'],
  LEADIN: ['첫 비트 준비', 'pending'], RESOLUTION_PENDING: ['판정 보완 대기', 'pending'],
  EXTENSION_1: ['연장 1', 'active'], EXTENSION_2: ['최종 연장', 'active'],
  REPAIR_REQUIRED: ['흐름 재조정 필요', 'error'], OVERDUE: ['종결조건 확인 중', 'pending'],
  SEALED: ['종결', 'closed'], SEALED_SUCCESS: ['종결', 'closed'],
  SEALED_INCOMPLETE: ['미충족 조건 이월', 'closed'], SEALED_FORCED_INCOMPLETE: ['미충족 조건 이월', 'closed'],
  BRANCH_PENDING: ['분기 선택 대기', 'pending'], COMMITTED: ['확정', 'met'],
  ADJUDICATION_PENDING: ['판정 보완 대기', 'pending'], REJECTED: ['작성 실패', 'error'],
};
export function progressLabel(code) { return labels[code] || ['기록 확인 중', 'pending']; }
const sealReasons = {
  UNIFIED_ADJUDICATOR_EARLY_CLOSURE: '종결조건을 달성하고 장면과 행동이 마무리되어 조기 종결했습니다.',
  UNIFIED_ADJUDICATOR_REQUIREMENTS_MET: '종결조건 판정에 따라 사건을 마무리했습니다.',
  FINAL_EXTENSION_UNMET_CARRIED_TO_NEXT_EVENT: '최종 연장까지 진행하여 남은 조건을 다음 사건으로 이월했습니다.',
  CONSECUTIVE_VERDICT_FAILURES: '판정이 연속으로 실패하여 본문을 보존하고 다음 사건으로 넘겼습니다.',
  LEGACY_INCOMPLETE_IMPORT: '이전 저장본에서 미완료 종결 기록을 가져왔습니다.',
  SYSTEMIC_COMPLETION_PASS: '엔진의 사건 완료 판정을 통과했습니다.',
};
function requirements(event, saved, helper) {
  if (helper) return helper(event, saved).map(row => ({
    ref: text(row.ref), label: text(row.label), status: text(row.status) || 'UNREVIEWED', reason: text(row.reason),
  }));
  const same = saved?.eventId === event?.id, records = same ? saved?.records : null;
  return list(event?.requiredFunctions).map(row => {
    const ref = text(row.ref || row.id), label = text(row.description) || text(row.label);
    const record = records?.[ref];
    return { ref, label, status: text(record?.status) || (records ? 'UNREVIEWED' : same && saved?.verdicts?.[label] === true ? 'MET' : 'UNREVIEWED'), reason: text(record?.reason) };
  });
}
function review(value) {
  if (!value) return null;
  return { reason: text(value.reason), checks: [
    ['종결조건 달성', value.goalsMet], ['장면 속 행동 마무리', value.sceneActionSettled ?? value.userActionSettled],
    ['장면 마무리', value.sceneSettled], ['다음 사건 연결 준비', value.handoffReady],
  ].map(([label, status]) => ({ label, status: status === 'YES' ? 'MET' : status === 'NO' ? 'UNMET' : 'UNCERTAIN' })) };
}
function closureReason(seal, closingTurn) {
  const code = text(closingTurn?.transition?.releaseReason) || text(seal.sealReason);
  return sealReasons[code] || (code.startsWith('FORCED_DEADLINE_CLOSURE:')
    ? `종결 시점에 남은 조건을 정리했습니다. ${code.slice(24).trim()}`
    : code || '저장된 종결사유가 없습니다.');
}
export function readEventProgress(api, { requirementDisplay } = {}) {
  const scenario = api?._scenario?.(), runtime = scenario?.runtime || {}, event = scenario?.event;
  const turns = list(api?._turns?.());
  const state = event?.id && runtime.systemicEventState?.activeEventId === event.id ? runtime.systemicEventState : {};
  const machine = event?.id && runtime.eventMachine?.activeEventId === event.id ? runtime.eventMachine : {};
  const saved = [runtime.requirementVerdicts, state.requirementVerdicts].find(value => value?.eventId === event?.id);
  const rows = requirements(event, saved, requirementDisplay);
  const recorded = turns.filter(turn => ['COMMITTED', 'ADJUDICATION_PENDING', 'REJECTED'].includes(turn?.status));
  const sealed = list(runtime.eventLedger?.sealed);
  const eventTitles = new Map(sealed.map(row => [row.id, text(row.title)]));
  if (event?.id) eventTitles.set(event.id, text(event.title));
  const history = recorded.map((turn, index) => {
    const verdict = turn.metrics?.unifiedAdjudication, eventId = text(turn.sourceEventId || turn.transition?.eventId);
    return { id: text(turn.id) || `beat-${index}`, index: index + 1, eventId,
      eventTitle: eventTitles.get(eventId) || '이전 사건', status: text(turn.status),
      decision: text(turn.transition?.status || turn.transition?.decision),
      adjudicated: verdict?.available === true,
      reason: verdict?.available === true ? text(verdict.earlyClosure?.reason) : '',
      requirements: verdict?.available === true ? list(verdict.requirements).map(row => ({
        ref: text(row.requirementRef), status: text(row.status), reason: text(row.reason),
        label: eventId === event?.id ? rows.find(r => r.ref === row.requirementRef)?.label || '종결조건' : '종결조건',
      })) : [],
    };
  }).reverse();
  const closures = sealed.map(seal => {
    const closing = [...recorded].reverse().find(turn => (turn.transition?.eventId || turn.sourceEventId) === seal.id && /^SEALED/u.test(turn.transition?.status || ''));
    return { id: text(seal.id), title: text(seal.title) || '이전 사건', status: text(seal.status),
      reason: closureReason(seal, closing), mode: text(seal.closureMode),
      review: review(seal.earlyClosureReview || closing?.metrics?.unifiedAdjudication?.earlyClosure),
      beats: number(seal.beatCount), extensions: number(seal.extensionCount),
      missing: list(seal.missingRequirementRefs).length, alternatives: list(seal.alternativeRequirementRefs).length,
    };
  }).reverse();
  return { current: event?.id ? {
    id: text(event.id), title: text(event.title) || '현재 사건', phase: text(state.phase || machine.state || event.status) || 'ACTIVE',
    beats: number(state.eventBeats ?? state.eventTurns ?? machine.eventBeats ?? machine.eventTurns),
    budget: number(api?.CortexCommitGraph?.mainBudgetTurns?.(event)) ?? 3,
    extensions: number(state.closureExtensionCount ?? machine.extensionCount) ?? 0,
    requirements: rows, review: review(state.lastAudit?.earlyClosureReview),
    decision: text(state.lastAudit?.decision),
    steps: list(event.beats).map((beat, index) => ({ title: text(beat.title || beat.goal) || `단계 ${index + 1}`, status: text(beat.status), current: index === event.activeBeatIndex })),
  } : null, history, closures };
}
