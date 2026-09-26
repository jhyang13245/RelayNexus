import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextWaitTracker } from '../public/vn-reader.mjs';

test('a one-glyph stream gap gets dots even between network requests; each visible glyph clears the hint', () => {
  let clock = 0;
  const wait = createTextWaitTracker({ now: () => clock });
  const reading = { key: 'turn:20', length: 1, total: 1, growing: true, loading: false };
  assert.equal(wait.reason(reading), '');
  clock = 700;
  assert.equal(wait.reason(reading), '다음 문장 준비 중');
  wait.progress(reading.key, 2);
  assert.equal(wait.reason({ ...reading, length: 2, total: 10 }), '');
  clock = 1450;
  assert.equal(wait.reason({ ...reading, length: 2, total: 10 }), '본문 표시 준비 중');
});

test('punctuation, intentional reading pauses, a ready next page and a completed turn do not look like buffering', () => {
  let clock = 0;
  const wait = createTextWaitTracker({ now: () => clock });
  const reading = { key: 'turn:20', length: 10, total: 20, growing: true };
  wait.reason(reading); clock = 480;
  assert.equal(wait.reason(reading), '');
  clock = 4000;
  assert.equal(wait.reason({ ...reading, paused: true }), '');
  assert.equal(wait.reason(reading), '', 'resuming a menu does not flash stale dots');
  clock = 4800;
  assert.equal(wait.reason({ ...reading, length: 20, total: 20, growing: false, loading: true, hasNext: true }), '');
  clock = 5600;
  assert.equal(wait.reason({ ...reading, length: 20, total: 20, growing: false, loading: false }), '');
});

test('page changes, initial blank waits and later text arrivals cannot retain an old buffering hint', () => {
  let clock = 0;
  const wait = createTextWaitTracker({ now: () => clock });
  const reading = { key: 'old:0', length: 2, total: 2, loading: true };
  wait.reason(reading); clock = 1000;
  assert.equal(wait.reason(reading), '다음 문장 준비 중');
  assert.equal(wait.reason({ ...reading, key: 'new:0', length: 0, waitingImages: true }), '');
  clock = 4000;
  assert.equal(wait.reason({ ...reading, key: 'new:0', length: 0, waitingImages: true }), '');
  assert.equal(wait.reason({ ...reading, key: 'new:0', length: 1, total: 10 }), '');
});
