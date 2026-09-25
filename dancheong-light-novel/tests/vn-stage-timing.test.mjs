import test from 'node:test';
import assert from 'node:assert/strict';
import { readableTurnPages } from '../public/vn-core.mjs';
import { publishedUnit, dialogueWait, resolvedSpeaker, preparationPages, createPreparationQueue, nextWaitReason, prepareAhead } from '../public/vn-stage-timing.mjs';

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

test('verified attribution replaces the writer grandmother guess, including a grounded generic professor', () => {
  const page = { quoted: true, kind: 'dialogue', speaker: '한명진', characterId: 'grandmother', text: '수업을 마치겠습니다.' };
  const verified = resolvedSpeaker(page, { castStatus: 'ready', speakerName: '교수', speakerId: '' });
  assert.equal(verified.speaker, '교수'); assert.equal(verified.characterId, ''); assert.equal(verified.speakerResolved, true);
  assert.equal(resolvedSpeaker(page, { castStatus: 'checking' }).speaker, '');
  assert.equal(resolvedSpeaker(page, { castStatus: 'ready' }).speaker, '');
});

test('all published future paragraphs prepare while the reader remains on first narration or an older turn', () => {
  const pages = Array.from({ length: 12 }, (_, index) => ({ turnId: index < 4 ? 'old' : 'incoming', start: index * 50 }));
  assert.deepEqual(preparationPages(pages, 1), pages.slice(1));
  assert.deepEqual(preparationPages(pages, 4), pages.slice(4));
  assert.deepEqual(preparationPages([], 0), []);
});

test('preparation queue bounds concurrency, deduplicates and drops cancelled queued work', async () => {
  const started = [], releases = [], active = [], errors = [];
  const queue = createPreparationQueue({ concurrency: 2, onError: error => errors.push(error) });
  const job = id => async current => { started.push(id); active.push(current); await new Promise(resolve => releases.push(resolve)); };
  queue.add('one', job(1)); queue.add('two', job(2)); queue.add('three', job(3)); queue.add('one', job(99));
  await new Promise(setImmediate); assert.deepEqual(started, [1, 2]);
  queue.clear(); assert.equal(active[0](), false);
  queue.add('four', job(4)); releases.shift()(); await new Promise(setImmediate);
  assert.deepEqual(started, [1, 2, 4]);
  releases.splice(0).forEach(resolve => resolve()); await new Promise(setImmediate);
  assert.deepEqual(errors, []);
});

test('inline waiting indicator only appears after the current sentence and clears when next content is ready', () => {
  const state = { complete: true, blocked: false, loading: true, imagesEnabled: true };
  assert.equal(nextWaitReason(state), '다음 문장 준비 중');
  assert.equal(nextWaitReason({ ...state, complete: false }), '');
  assert.equal(nextWaitReason({ ...state, blocked: true }), '');
  assert.equal(nextWaitReason({ ...state, loading: false }), '');
  const nextPage = { quoted: true };
  assert.equal(nextWaitReason({ ...state, nextPage, nextView: { castStatus: 'checking' } }), '다음 대사의 인물 준비 중');
  assert.equal(nextWaitReason({ ...state, nextPage, nextView: { castStatus: 'ready', speakerId: 'nadia', portraits: [{ id: 'nadia' }] } }), '');
  assert.equal(nextWaitReason({ ...state, nextPage, nextView: { castStatus: 'ready', speakerId: '', portraits: [] } }), '');
  assert.equal(nextWaitReason({ ...state, nextPage, imagesEnabled: false }), '');
});

test('a slow background never occupies the cast queue or postpones the later speaker request', async () => {
  const started = [], completed = []; let release;
  const background = new Promise(resolve => release = resolve), queue = createPreparationQueue({ concurrency: 1 });
  const castDirector = { prepare: async scene => started.push(`cast-${scene.id}`) };
  const assets = { prepare: async scene => { started.push(`images-${scene.id}`); await background; }, view: () => ({ portraits: [{ url: 'fixture-sprite' }] }) };
  const preloads = [];
  for (const id of [1, 2, 3, 4]) queue.add(String(id), async active => {
    const job = await prepareAhead({ scene: { id }, pages: [{}], castDirector, assets, active, generate: true, preload: async url => preloads.push(url) });
    completed.push(job.completion);
  });
  await new Promise(setImmediate);
  assert.ok(started.includes('images-4'), 'later portrait begins before background finishes');
  assert.equal(preloads.length, 0);
  release(); await Promise.all(completed); assert.equal(preloads.length, 4);
});
