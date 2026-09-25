import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTextRevealer, glyphDelay } from '../public/vn-reader.mjs';

function createHarness() {
  const writes = [];
  let completes = 0;
  const pending = new Map();
  let nextId = 1;
  let paused = false;
  const schedule = (cb, delay) => {
    const id = nextId++;
    pending.set(id, { cb, delay });
    return id;
  };
  const cancel = (id) => {
    pending.delete(id);
  };
  const revealer = createTextRevealer({
    write: (text) => writes.push(text),
    onComplete: () => { completes++; },
    isPaused: () => paused,
    schedule,
    cancel,
  });
  const pendingDelays = () => [...pending.values()].map((entry) => entry.delay);
  const runOne = () => {
    assert.ok(pending.size > 0, 'expected a pending timer to run');
    const id = Math.min(...pending.keys());
    const entry = pending.get(id);
    pending.delete(id);
    entry.cb();
    return entry.delay;
  };
  const visible = () => writes[writes.length - 1];
  return {
    revealer,
    writes,
    pending,
    pendingDelays,
    runOne,
    visible,
    completes: () => completes,
    setPaused: (value) => { paused = value; },
  };
}

describe('createTextRevealer', () => {
  it('reveals a long incoming chunk one Unicode code point per tick, not all at once', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'abcdef' });
    assert.equal(h.visible(), '');
    assert.equal(h.revealer.length, 0);
    assert.equal(h.pending.size, 1);
    assert.equal(h.completes(), 0);
    const expected = ['a', 'ab', 'abc', 'abcd', 'abcde', 'abcdef'];
    for (let i = 0; i < expected.length; i++) {
      h.runOne();
      assert.equal(h.visible(), expected[i]);
      assert.equal(h.revealer.length, i + 1);
      assert.equal(h.completes(), i === expected.length - 1 ? 1 : 0);
    }
    assert.equal(h.pending.size, 0);
  });

  it('schedules the first timer of a new page with zero delay', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'hello' });
    assert.equal(h.pending.size, 1);
    assert.deepEqual(h.pendingDelays(), [0]);
    assert.ok(h.revealer.timer);
  });

  it('appending text while a timer is pending preserves the timer and visible prefix', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'abc' });
    h.runOne();
    assert.equal(h.visible(), 'a');
    const timerBefore = h.revealer.timer;
    assert.ok(timerBefore);
    h.revealer.update({ key: 'p1', text: 'abcdef' });
    assert.equal(h.revealer.timer, timerBefore);
    assert.equal(h.pending.size, 1);
    assert.equal(h.revealer.length, 1);
    assert.equal(h.visible(), 'a');
    assert.equal(h.completes(), 0);
    h.runOne();
    assert.equal(h.visible(), 'ab');
  });

  it('identical update does not flush or restart animation', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'abcd' });
    h.runOne();
    assert.equal(h.visible(), 'a');
    const timerBefore = h.revealer.timer;
    const writesBefore = h.writes.length;
    h.revealer.update({ key: 'p1', text: 'abcd' });
    assert.equal(h.revealer.length, 1);
    assert.equal(h.visible(), 'a');
    assert.equal(h.completes(), 0);
    assert.equal(h.revealer.timer, timerBefore);
    assert.equal(h.pending.size, 1);
    // Commit-equivalent repeat: still no flush, no extra timer.
    h.revealer.update({ key: 'p1', text: 'abcd' });
    assert.equal(h.revealer.length, 1);
    assert.equal(h.visible(), 'a');
    assert.equal(h.revealer.timer, timerBefore);
    assert.equal(h.pending.size, 1);
    assert.equal(h.writes.length, writesBefore + 2);
    h.runOne();
    assert.equal(h.visible(), 'ab');
    assert.equal(h.completes(), 0);
  });

  it('runs completion only after the final glyph', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'ab' });
    assert.equal(h.completes(), 0);
    h.runOne();
    assert.equal(h.visible(), 'a');
    assert.equal(h.completes(), 0);
    assert.equal(h.pending.size, 1);
    h.runOne();
    assert.equal(h.visible(), 'ab');
    assert.equal(h.completes(), 1);
    assert.equal(h.pending.size, 0);
    assert.equal(h.revealer.timer, 0);
  });

  it('finish reveals currently available text and a later append resumes animation', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'abcdef' });
    h.runOne();
    h.runOne();
    assert.equal(h.visible(), 'ab');
    assert.equal(h.revealer.finish(), true);
    assert.equal(h.visible(), 'abcdef');
    assert.equal(h.completes(), 1);
    assert.equal(h.pending.size, 0);
    assert.equal(h.revealer.finish(), false);
    assert.equal(h.completes(), 1);
    h.revealer.update({ key: 'p1', text: 'abcdefghi' });
    assert.equal(h.visible(), 'abcdef');
    assert.equal(h.revealer.length, 6);
    assert.equal(h.pending.size, 1);
    assert.equal(h.completes(), 1);
    h.runOne();
    assert.equal(h.visible(), 'abcdefg');
    h.runOne();
    h.runOne();
    assert.equal(h.visible(), 'abcdefghi');
    assert.equal(h.completes(), 2);
    assert.equal(h.pending.size, 0);
  });

  it('page change cancels the old timer and resets the visible prefix', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'abcdef' });
    h.runOne();
    assert.equal(h.visible(), 'a');
    const oldTimer = h.revealer.timer;
    assert.ok(oldTimer);
    h.revealer.update({ key: 'p2', text: 'xyz' });
    assert.ok(!h.pending.has(oldTimer));
    assert.equal(h.revealer.length, 0);
    assert.equal(h.visible(), '');
    assert.equal(h.pending.size, 1);
    assert.deepEqual(h.pendingDelays(), [0]);
    assert.equal(h.completes(), 0);
    h.runOne();
    assert.equal(h.visible(), 'x');
  });

  it('reset cancels pending work', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'abcdef' });
    h.runOne();
    assert.equal(h.visible(), 'a');
    const writesBefore = h.writes.length;
    h.revealer.reset();
    assert.equal(h.pending.size, 0);
    assert.equal(h.revealer.timer, 0);
    assert.equal(h.revealer.length, 0);
    assert.equal(h.revealer.key, '');
    assert.equal(h.writes.length, writesBefore);
    assert.equal(h.completes(), 0);
  });

  it('instant mode flushes without scheduling', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'abcdef', speed: 'instant' });
    assert.equal(h.visible(), 'abcdef');
    assert.equal(h.revealer.length, 6);
    assert.equal(h.pending.size, 0);
    assert.equal(h.completes(), 1);
    h.revealer.reset();
    const completesBefore = h.completes();
    h.revealer.update({ key: 'p2', text: 'xyz', immediate: true });
    assert.equal(h.visible(), 'xyz');
    assert.equal(h.pending.size, 0);
    assert.equal(h.completes(), completesBefore + 1);
  });

  it('pause delays progression and resume preserves it', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'abc' });
    h.setPaused(true);
    h.runOne();
    assert.equal(h.visible(), '');
    assert.equal(h.revealer.length, 0);
    assert.equal(h.completes(), 0);
    assert.deepEqual(h.pendingDelays(), [160]);
    h.runOne();
    assert.equal(h.visible(), '');
    assert.equal(h.revealer.length, 0);
    assert.deepEqual(h.pendingDelays(), [160]);
    h.setPaused(false);
    h.runOne();
    assert.equal(h.visible(), 'a');
    assert.equal(h.revealer.length, 1);
    assert.equal(h.completes(), 0);
  });

  it('punctuation uses the same glyphDelay', () => {
    const h = createHarness();
    assert.ok(glyphDelay('。') > glyphDelay('a'));
    h.revealer.update({ key: 'p1', text: 'a。b' });
    h.runOne();
    assert.equal(h.visible(), 'a');
    assert.deepEqual(h.pendingDelays(), [glyphDelay('a')]);
    h.runOne();
    assert.equal(h.visible(), 'a。');
    assert.deepEqual(h.pendingDelays(), [glyphDelay('。')]);
    h.runOne();
    assert.equal(h.visible(), 'a。b');
    assert.equal(h.completes(), 1);
  });

  it('correction retains only the matching visible prefix', () => {
    const h = createHarness();
    h.revealer.update({ key: 'p1', text: 'abcdef' });
    h.runOne();
    h.runOne();
    h.runOne();
    assert.equal(h.visible(), 'abc');
    h.revealer.update({ key: 'p1', text: 'abXdef' });
    assert.equal(h.revealer.length, 2);
    assert.equal(h.visible(), 'ab');
    assert.equal(h.completes(), 0);
    h.runOne();
    assert.equal(h.visible(), 'abX');
    h.runOne();
    h.runOne();
    h.runOne();
    assert.equal(h.visible(), 'abXdef');
    assert.equal(h.completes(), 1);
  });

  it('emoji remains intact as one code point per tick', () => {
    const h = createHarness();
    const text = 'a👋b';
    assert.equal(Array.from(text).length, 3);
    h.revealer.update({ key: 'p1', text });
    assert.equal(h.visible(), '');
    h.runOne();
    assert.equal(h.visible(), 'a');
    h.runOne();
    assert.equal(h.visible(), 'a👋');
    assert.ok(h.visible().includes('👋'));
    h.runOne();
    assert.equal(h.visible(), 'a👋b');
    assert.equal(h.completes(), 1);
    assert.deepEqual(h.writes, ['', 'a', 'a👋', 'a👋b']);
    for (const write of h.writes) {
      assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(write));
    }
  });
});
