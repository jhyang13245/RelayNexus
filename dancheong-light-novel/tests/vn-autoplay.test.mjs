import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fullAutoStep, fullAutoVisuals, storyComplete, createContinuationGate } from '../public/vn-autoplay.mjs';
import { readingVoiceLine, voiceLine, createVoice } from '../public/vn-voice.mjs';
import { pageKey, nextPlaybackStep, readDelay } from '../public/vn-reader.mjs';
import { submitEngineTurn } from '../public/vn-progress.mjs';
import { createVoicePlayer } from '../public/vn-voice-post.mjs';

const ready = { hasPage: true, hasNext: true, hasVoice: true, voicePhase: 'done', tailStatus: 'COMMITTED' };
test('full autoplay waits for all current verified people, including silent companions, after the prose grace expires', () => {
  const person = { id: 'a', url: 'a.png', baseKey: 'a' }, companion = { id: 'b', status: 'generating' };
  const view = { castStatus: 'ready', portraits: [person], pending: [companion] };
  for (const hasNext of [true, false]) {
    for (const visual of [fullAutoVisuals({ castStatus: 'checking' }), fullAutoVisuals(view, { displayed: [{ id: 'a', url: 'a.png' }] })]) {
      assert.equal(fullAutoStep({ ...ready, hasNext, visual }).action, 'wait');
    }
  }
  for (const status of ['error', 'needs-key']) {
    assert.equal(fullAutoVisuals({ ...view, pending: [{ ...companion, status }] }).action, 'stop');
  }
  assert.equal(fullAutoVisuals({ castStatus: 'error' }).action, 'stop');
  assert.equal(fullAutoVisuals({ castStatus: 'pending' }, { canPrepare: false }).action, 'stop');
  assert.equal(fullAutoVisuals({ castStatus: 'ready', portraits: [], pending: [] }).action, 'ready', 'verified narration with no on-stage cast needs no invented person');
});
test('the gate requires decoded current identities while reusing visible expressions and event participants', () => {
  const person = { id: 'a', url: 'base.png', baseKey: 'outfit-a', expressionReady: false };
  const view = { castStatus: 'ready', portraits: [person], pending: [], status: 'generating', cgStatus: 'generating' };
  assert.equal(fullAutoVisuals(view).action, 'wait', 'generated data is not a displayed image');
  assert.equal(fullAutoVisuals(view, { displayed: [{ id: 'a', url: 'prior-expression.png', baseKey: 'outfit-a' }] }).action, 'ready');
  assert.equal(fullAutoVisuals(view, { displayed: [{ id: 'a', url: 'prior.png', baseKey: 'other-outfit' }] }).action, 'wait');
  assert.equal(fullAutoVisuals(view, { displayed: [{ id: 'a', url: 'base.png', hidden: true }] }).action, 'wait');
  assert.equal(fullAutoVisuals(view, { displayed: [{ id: 'a', failedUrl: 'base.png' }] }).action, 'stop');
  const event = { ...view, eventBackground: 'event.png', eventCharacterIds: ['a'] };
  assert.equal(fullAutoVisuals(event).action, 'wait');
  assert.equal(fullAutoVisuals(event, { eventDecoded: true }).action, 'ready');
  assert.equal(fullAutoVisuals({ ...event, pending: [{ id: 'witness', status: 'generating' }] }, { eventDecoded: true }).action, 'wait');
});
test('full autoplay waits for speech and published text, then advances during a continuing stream', () => {
  for (const voicePhase of ['idle', 'preparing', 'playing']) assert.equal(fullAutoStep({ ...ready, voicePhase }).action, 'wait');
  for (const flag of ['blocked', 'revealing', 'growing']) assert.equal(fullAutoStep({ ...ready, [flag]: true }).action, 'wait');
  assert.equal(fullAutoStep({ ...ready, busy: true, awaiting: true, engineLocked: true }).action, 'advance');
  assert.equal(fullAutoStep({ ...ready, hasNext: false, busy: true }).action, 'wait');
  assert.equal(fullAutoStep({ ...ready, hasNext: false, awaiting: true }).action, 'wait');
  assert.equal(fullAutoStep({ ...ready, hasNext: false }).action, 'continue');
});
test('errors, user drafts, parked judgments and completed endings never start a new turn', () => {
  for (const change of [{ problem: '저장 오류' }, { draft: true }, { voicePhase: 'error' }, { voicePhase: 'blocked' }, { voicePhase: 'needs-key' },
    { hasNext: false, tailStatus: 'REJECTED' }, { hasNext: false, tailStatus: 'ADJUDICATION_PENDING' }, { hasNext: false, ended: true }]) {
    assert.equal(fullAutoStep({ ...ready, ...change }).action, 'stop');
  }
  assert.equal(fullAutoStep({ ...ready, ended: true }).action, 'advance', 'finish reading the ending before stopping');
  assert.equal(storyComplete({ event: { id: 'last' }, runtime: { eventLedger: { sealed: [{ eventId: 'last' }] } } }), true);
  assert.equal(storyComplete({ event: { id: 'next' }, runtime: { eventLedger: { sealed: [{ id: 'previous' }] } } }), false);
  assert.equal(storyComplete({ event: { id: 'last' }, runtime: { instantStory: true, eventLedger: { sealed: [{ id: 'last' }] } } }), false);
  assert.equal(storyComplete({ runtime: { branchEndingState: { ending: true } } }), true);
});
test('a continuation is single-flight and never automatically retried, including failed requests', async () => {
  const gate = createContinuationGate(); let release, calls = 0;
  const task = gate.run('turn1', () => { calls++; return new Promise(resolve => { release = resolve; }); });
  assert.equal(await gate.run('turn1', () => calls++), false);
  assert.equal(await gate.run('turn2', () => calls++), false);
  gate.reset(); release(); await task;
  assert.equal(await gate.run('turn1', () => calls++), false);
  await assert.rejects(gate.run('turn2', () => { calls++; throw new Error('provider'); }));
  assert.equal(await gate.run('turn2', () => calls++), false);
  assert.equal(calls, 2);
  gate.reset(); assert.equal(await gate.run('turn2', () => calls++), true, 'only an explicit new run resets the gate');
});
test('full reading speaks narration and unidentified quotations neutrally, and reuses verified character speech', () => {
  const page = { turnId: 't1', start: 0, kind: 'narration', text: '복도 끝에서 바람이 불었다.' };
  assert.equal(voiceLine(page, {}, 'work'), null, 'normal voice mode stays dialogue-only');
  const narration = readingVoiceLine(page, {}, 'work');
  assert.equal(narration.speakerId, '@vn/narrator'); assert.equal(narration.text, page.text);
  assert.equal(readingVoiceLine({ ...page, isGrowing: true }, {}, 'work'), null);
  const quote = { ...page, quoted: true, kind: 'dialogue', text: '“잠깐 기다려.”' };
  const view = { castStatus: 'ready', speakerId: 'verified', speakerName: '정민' };
  assert.deepEqual(readingVoiceLine(quote, view, 'work'), voiceLine(quote, view, 'work'));
  assert.equal(readingVoiceLine(quote, { ...view, castStatus: 'checking' }, 'work').speakerId, '@vn/narrator');
});
test('narration completion releases autoplay; later replays reuse its paid audio', async () => {
  let calls = 0, audio; const saved = new Map();
  const line = readingVoiceLine({ turnId: 't', start: 0, text: '발걸음 소리가 멀어졌다.' }, {}, 'w');
  const voice = createVoice({ getEnabled: () => true, getKey: () => 'fixture', read: async k => saved.get(k), write: async r => saved.set(r.key, r),
    fetchVoice: async () => { calls++; return Response.json({ audioUrl: 'data:audio/mpeg;base64,aGk=' }); },
    makeAudio: () => (audio = { play: async () => {}, pause() {}, currentTime: 0 }) });
  voice.update(line); await new Promise(r => setImmediate(r));
  assert.equal(fullAutoStep({ ...ready, voicePhase: voice.phase }).action, 'wait');
  audio.onended(); assert.equal(fullAutoStep({ ...ready, voicePhase: voice.phase }).action, 'advance');
  voice.replay(line); await new Promise(r => setImmediate(r)); assert.equal(calls, 1); voice.stop();
});

// Exercise the real shell's timer, mode and submit integration with a tiny DOM
// and a fake engine. No live saves, browser API keys or paid requests are used.
function shell() {
  const source = readFileSync(new URL('../public/vn.js', import.meta.url), 'utf8');
  const controls = source.slice(source.indexOf('function stopPlayback()'), source.indexOf('function setTextHidden('));
  const submission = source.slice(source.indexOf('async function submit('), source.indexOf('async function retryPendingAdjudication('));
  const elements = new Map(), timers = new Map(), notes = [], delays = []; let serial = 0, turnStatus = 'COMMITTED', engineCalls = 0, release;
  let view = { castStatus: 'ready', portraits: [], pending: [] };
  const $ = id => { if (!elements.has(id)) elements.set(id, { value: '', hidden: true, disabled: false, children: [], textContent: '', setAttribute() {}, classList: { remove() {} } }); return elements.get(id); };
  const api = { _turns: () => [{ id: `t${engineCalls}`, status: turnStatus }], _scenario: () => ({ runtime: {}, event: { id: 'active' } }),
    _storageStatus: () => ({}), _pendingRecovery: () => null, _setInput: () => assert.fail('must use _continue, not user input'),
    _continue: async () => { engineCalls++; turnStatus = 'STREAMING'; await new Promise(r => { release = r; }); turnStatus = 'COMMITTED'; } };
  const state = { api, playback: 'manual', playbackTimer: 0, screen: 'stage', keys: { openai: 'fixture' }, pages: [{ turnId: 't0', start: 0, text: '첫 문장.' }], cursor: 0,
    readThrough: -1, reveal: { timer: 0 }, reading: { pace: 'normal' }, voiceLine: { key: 'speech' } };
  const voice = { phase: 'done', reset() { this.phase = 'idle'; }, resume() {} };
  const gate = createContinuationGate();
  const deps = { state, $, voice, document: { hidden: false, querySelector: () => null }, root: { classList: { contains: () => false } }, cinema: { blocked: false },
    autoContinuation: gate, fullAutoStep, fullAutoVisuals, storyComplete, pageKey, nextPlaybackStep, readDelay, submitEngineTurn,
    pageScene: () => ({}), presentationPage: (_s, p) => p, assets: { view: () => view }, hasImageKey: () => true,
    sceneScope: () => 'work:save', storageProblem: () => null, pendingAdjudication: () => null, textKey: () => 'fixture', mediaPaused: () => false,
    busy: () => turnStatus === 'STREAMING', syncRecovery: () => null, engineNotice: null,
    updateVoiceControls() {}, toast: m => notes.push(m), renderPage() {}, sync() {}, openSettings() {},
    nextPage: () => { state.cursor++; }, setTimeout: (fn, ms) => { delays.push(ms); const id = ++serial; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
  const functions = new Function(...Object.keys(deps), `${controls}\n${submission}\nreturn {toggleFullPlayback,stopPlayback,schedulePlayback};`)(...Object.values(deps));
  return { ...functions, state, voice, gate, notes, timers, api, delays, $, setView: value => { view = value; }, get calls() { return engineCalls; },
    fire() { const [id, fn] = timers.entries().next().value || []; if (fn) { timers.delete(id); fn(); } }, finish: () => release() };
}
test('real shell automatically continues across two turns and stopping during a request cannot resume it', async () => {
  const h = shell(); h.toggleFullPlayback(); assert.equal(h.state.playback, 'full');
  h.voice.phase = 'done'; h.schedulePlayback(); h.schedulePlayback(); assert.equal(h.timers.size, 1);
  h.fire(); assert.equal(h.calls, 1); assert.equal(h.state.playback, 'full');
  h.schedulePlayback(); assert.equal(h.timers.size, 0);
  h.finish(); await new Promise(r => setImmediate(r));
  h.state.pages = [{ turnId: 't1', start: 0, text: '다음 문장.' }];
  h.schedulePlayback(); h.fire(); assert.equal(h.calls, 2);
  h.stopPlayback(); h.finish(); await new Promise(r => setImmediate(r));
  h.schedulePlayback(); assert.equal(h.state.playback, 'manual'); assert.equal(h.timers.size, 0); assert.equal(h.calls, 2);
});
test('real shell waits through slow cast and image work, then decode, before continuing; an image failure stops it', async () => {
  const h = shell(); h.setView({ castStatus: 'checking' }); h.toggleFullPlayback(); h.voice.phase = 'done';
  h.schedulePlayback(); assert.equal(h.timers.size, 0); assert.equal(h.state.playback, 'full');
  h.setView({ castStatus: 'ready', pending: [{ id: 'a', status: 'generating' }], portraits: [] });
  h.schedulePlayback(); assert.equal(h.timers.size, 0);
  const view = { castStatus: 'ready', pending: [], portraits: [{ id: 'a', url: 'a.png', baseKey: 'base' }] };
  h.setView(view); h.schedulePlayback(); assert.equal(h.timers.size, 0, 'download and decode still have to finish');
  h.$('vn-characters').children = [{ dataset: { characterId: 'a' }, vnReadyUrl: 'a.png', vnBaseKey: 'base', classList: { contains: () => false } }];
  h.schedulePlayback(); assert.equal(h.timers.size, 1); assert.ok(h.delays.at(-1) >= 1500);
  h.fire(); assert.equal(h.calls, 1); h.stopPlayback(); h.finish(); await new Promise(r => setImmediate(r));
  const failed = shell(); failed.toggleFullPlayback(); failed.voice.phase = 'done'; failed.schedulePlayback(); assert.equal(failed.timers.size, 1);
  failed.setView({ castStatus: 'ready', pending: [{ id: 'a', status: 'error' }] }); failed.schedulePlayback(); failed.fire();
  assert.equal(failed.state.playback, 'manual'); assert.equal(failed.calls, 0);
  assert.match(failed.notes.at(-1), /인물 이미지 생성에 실패/);
});
test('a new visual wait cancels an already armed navigation timer instead of skipping newly discovered cast', () => {
  const h = shell(); h.toggleFullPlayback(); h.voice.phase = 'done'; h.schedulePlayback();
  h.setView({ castStatus: 'ready', pending: [{ id: 'a', status: 'generating' }] });
  h.schedulePlayback(); assert.equal(h.timers.size, 0); h.fire(); assert.equal(h.calls, 0);
  h.stopPlayback(); assert.equal(h.state.playback, 'manual');
});
test('stopping the real shell cancels a pending continuation before any engine call', () => {
  const h = shell(); h.toggleFullPlayback(); h.voice.phase = 'done'; h.schedulePlayback();
  assert.equal(h.timers.size, 1); h.stopPlayback(); h.fire(); assert.equal(h.calls, 0); assert.equal(h.timers.size, 0);
});

test('real shell holds full autoplay through storage recovery and resumes without toggling the mode', () => {
  const h = shell(); h.toggleFullPlayback(); h.voice.phase = 'done'; h.schedulePlayback();
  h.state.autoRecovery = { waiting: true, kind: 'storage' };
  h.schedulePlayback(); h.fire();
  assert.equal(h.state.playback, 'full'); assert.equal(h.timers.size, 0); assert.equal(h.calls, 0);
  h.state.autoRecovery = { waiting: false, phase: 'idle' };
  h.schedulePlayback(); assert.equal(h.timers.size, 1);
  h.stopPlayback(); h.fire(); assert.equal(h.calls, 0);
});
test('voice playback can unlock its own audio context synchronously on the start gesture', () => {
  let resumes = 0;
  const make = createVoicePlayer({ createContext: () => ({ state: 'suspended', resume() { resumes++; return Promise.resolve(); } }) });
  const voice = createVoice({ getEnabled: () => true, getKey: () => '', read: async () => null, write: async () => {}, makeAudio: make });
  voice.resume(); assert.equal(resumes, 1);
});
