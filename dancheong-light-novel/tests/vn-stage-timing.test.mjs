import test from 'node:test';
import assert from 'node:assert/strict';
import { readableTurnPages } from '../public/vn-core.mjs';
import { publishedUnit, dialogueWait } from '../public/vn-stage-timing.mjs';

test('first published narration stays readable, and closed dialogue can prepare before COMMITTED', () => {
  const turn = { id: 't', status: 'STREAMING', text: 'PRIVATE UNPUBLISHED DRAFT', displayText: '문이 열렸다.\n나디아가 앞에 섰다. “안녕하세요.”\n다음 문장' };
  const pages = readableTurnPages(turn, 0);
  assert.equal(pages[0].text, '문이 열렸다.');
  const speech = pages.find(page => page.quoted), unit = publishedUnit(turn, speech);
  assert.equal(unit.ready, true); assert.ok(unit.prefix.includes('“안녕하세요.”'));
  assert.ok(!JSON.stringify(unit).includes('PRIVATE')); assert.ok(!unit.prefix.includes('다음 문장'));
  assert.equal(dialogueWait(pages[0], { castStatus: 'checking' }, { enabled: true }), false);
  assert.equal(dialogueWait(speech, { castStatus: 'checking' }, { enabled: true }), true);
});

test('growing quotes wait for a paragraph boundary; a completed stream needs no final adjudication', () => {
  const turn = { id: 't', status: 'STREAMING', displayText: '“안녕' };
  const page = readableTurnPages(turn, 0)[0];
  assert.equal(publishedUnit(turn, page).ready, false);
  turn.status = 'ADJUDICATION_PENDING'; turn.displayText += '하세요.”';
  assert.equal(publishedUnit(turn, page).ready, true);
});

test('finalized and streaming copies share stable paragraph text and page offsets', () => {
  const text = '나디아가 들어왔다.\n“같이 가요.”\n마지막 문장.';
  const live = { id: 't', status: 'STREAMING', displayText: text };
  const done = { ...live, status: 'COMMITTED', text };
  const page = readableTurnPages(live, 0)[1];
  const a = publishedUnit(live, page), b = publishedUnit(done, page);
  assert.equal(a.text, b.text); assert.equal(a.previousText, b.previousText);
  assert.deepEqual(a.pages.map(row => row.start), b.pages.map(row => row.start));
});

test('a physical speaker must be drawn and decoded before dialogue; remote quotes need no sprite', () => {
  const page = { quoted: true }, view = { castStatus: 'ready', speakerId: 'nadia', portraits: [] };
  assert.equal(dialogueWait(page, view, { enabled: true }), true);
  view.portraits.push({ id: 'nadia' });
  assert.equal(dialogueWait(page, view, { enabled: true }), true);
  assert.equal(dialogueWait(page, view, { enabled: true, decoded: true }), false);
  assert.equal(dialogueWait(page, { ...view, speakerId: '' }, { enabled: true }), false);
  assert.equal(dialogueWait(page, view, { enabled: false }), false);
  assert.equal(dialogueWait(page, view, { enabled: true, bypass: true }), false);
});
