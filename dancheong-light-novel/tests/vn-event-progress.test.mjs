import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { readEventProgress } from '../public/vn-event-progress.mjs';

const html = readFileSync(new URL('../vendor/Cortex_v1.42.0.html', import.meta.url), 'utf8');
const marker = html.indexOf('/* Public prose is the narrative authority.');
const context = { structuredClone };
runInNewContext(html.slice(marker, html.indexOf('/* Studio v2.1:', marker)), context);
const requirementDisplay = context.CortexProseMemory.requirementDisplay;
function fixture() {
  const scenario = { event: { id: 'now', title: '복도에서 발견한 흔적', activeBeatIndex: 1,
    requiredFunctions: [{ ref: 'a', description: '흔적 확인' }, { ref: 'b', description: '다음 행동 결정' }],
    beats: [{ title: '흔적 발견', status: 'COMPLETED' }, { title: '선택', status: 'ACTIVE' }],
    nextEvent: { title: 'DO NOT DISCLOSE' } }, runtime: {
    systemicEventState: { activeEventId: 'now', phase: 'EXTENSION_1', eventBeats: 3, closureExtensionCount: 1 },
    requirementVerdicts: { eventId: 'now', records: { a: { status: 'MET', reason: '흔적을 보았다.' }, b: { status: 'UNMET', reason: '선택하지 않았다.' } } },
    eventLedger: { sealed: [] },
  } };
  const turns = [];
  const api = { _scenario: () => scenario, _turns: () => turns, CortexCommitGraph: { mainBudgetTurns: () => 3 } };
  return { scenario, turns, api };
}
test('uses the actual Cortex condition display and preserves all saved judgment statuses', () => {
  const { scenario, api } = fixture();
  for (const status of ['MET', 'UNMET', 'UNCERTAIN', 'AUTHOR_ACCEPTED', 'ALTERNATIVE_MET', 'OUT_OF_SCOPE']) {
    scenario.runtime.requirementVerdicts.records.a.status = status;
    assert.deepEqual(readEventProgress(api).current.requirements, JSON.parse(JSON.stringify(readEventProgress(api, { requirementDisplay }).current.requirements)));
  }
});
test('opening progress neither mutates the engine nor leaks unpublished events or drafts', () => {
  const { scenario, turns, api } = fixture(); turns.push({ status: 'STREAMING', text: 'PRIVATE DRAFT', rawResponse: 'PRIVATE KEY' });
  const before = JSON.stringify([scenario, turns]); const result = readEventProgress(api);
  assert.equal(JSON.stringify([scenario, turns]), before);
  assert.doesNotMatch(JSON.stringify(result), /DO NOT DISCLOSE|PRIVATE/);
  assert.equal(result.current.beats, 3); assert.equal(result.current.extensions, 1);
});
test('does not import another event counters or verdicts, and preserves zero counters', () => {
  const { scenario, api } = fixture(); const runtime = scenario.runtime;
  runtime.systemicEventState.activeEventId = 'previous'; runtime.requirementVerdicts.eventId = 'previous';
  runtime.eventMachine = { activeEventId: 'now', eventBeats: 0, state: 'ACTIVE' };
  const current = readEventProgress(api).current;
  assert.equal(current.beats, 0); assert.equal(current.extensions, 0); assert.equal(current.phase, 'ACTIVE');
  assert.ok(current.requirements.every(row => row.status === 'UNREVIEWED'));
});
test('legacy false and absent verdicts mean unreviewed, never a fabricated failure', () => {
  const { scenario, api } = fixture();
  scenario.runtime.requirementVerdicts = { eventId: 'now', verdicts: { '흔적 확인': true, '다음 행동 결정': false } };
  assert.deepEqual(readEventProgress(api).current.requirements.map(row => row.status), ['MET', 'UNREVIEWED']);
  assert.equal(readEventProgress(null).current, null);
});
test('closure history uses each sealed event and overrides budget reason on repeated judgment failure', () => {
  const { scenario, turns, api } = fixture();
  scenario.runtime.eventLedger.sealed.push({ id: 'past', title: '앞 사건', status: 'SEALED_INCOMPLETE', beatCount: 2, extensionCount: 0, sealReason: 'FINAL_EXTENSION_UNMET_CARRIED_TO_NEXT_EVENT', missingRequirementRefs: ['old-a'] });
  turns.push({ id: 'closing', sourceEventId: 'past', status: 'COMMITTED', transition: { status: 'SEALED_FORCED_INCOMPLETE', eventId: 'past', nextEventId: 'now', releaseReason: 'CONSECUTIVE_VERDICT_FAILURES' }, metrics: { unifiedAdjudication: { available: false } } });
  const result = readEventProgress(api);
  assert.match(result.closures[0].reason, /판정이 연속으로 실패/);
  assert.equal(result.closures[0].beats, 2); assert.equal(result.history[0].eventTitle, '앞 사건');
  assert.equal(result.history[0].adjudicated, false);
});
test('early closure retains actual reason and individual settling checks', () => {
  const { scenario, api } = fixture();
  scenario.runtime.eventLedger.sealed.push({ id: 'past', title: '완료 사건', status: 'SEALED', sealReason: 'UNIFIED_ADJUDICATOR_EARLY_CLOSURE', earlyClosureReview: { goalsMet: 'YES', sceneActionSettled: 'YES', sceneSettled: 'YES', handoffReady: 'NO', reason: '문을 닫고 대화를 마쳤다.' } });
  const closed = readEventProgress(api).closures[0];
  assert.match(closed.reason, /조기 종결/); assert.equal(closed.review.reason, '문을 닫고 대화를 마쳤다.');
  assert.deepEqual(closed.review.checks.map(row => row.status), ['MET', 'MET', 'MET', 'UNMET']);
});
