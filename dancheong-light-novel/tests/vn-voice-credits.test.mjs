import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceCredits } from '../public/vn-voice-credits.mjs';

test('Typecast credits retain actual public voice names per work across assignment changes and reloads', () => {
  const data = new Map(), storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
  const credits = createVoiceCredits(storage), catalog = [{ id: 'a', name: '목소리 A' }, { id: 'b', name: '목소리 B' }];
  credits.record('one', { provider: 'typecast', voice: 'a' }, catalog);
  credits.record('one', { provider: 'typecast', voice: 'a' }, catalog);
  credits.record('one', { provider: 'openai', voice: 'b' }, catalog);
  credits.record('one', { provider: 'typecast', voice: 'unknown' }, catalog);
  credits.record('two', { provider: 'typecast', voice: 'b' }, catalog);
  assert.deepEqual(credits.names('one'), ['목소리 A']);
  credits.record('one', { provider: 'typecast', voice: 'b' }, catalog);
  assert.deepEqual(createVoiceCredits(storage).names('one'), ['목소리 A', '목소리 B']);
  assert.deepEqual(credits.names('two'), ['목소리 B']);
});

test('malformed or unavailable storage never prevents visible voice credits', () => {
  const credits = createVoiceCredits({ getItem: () => '{bad', setItem: () => { throw Error('quota'); } });
  credits.record('work', { provider: 'typecast', voice: 'a' }, [{ id: 'a', name: '목소리 A' }]);
  assert.deepEqual(credits.names('work'), ['목소리 A']);
  const malformed = createVoiceCredits({ getItem: () => JSON.stringify([null, {}, ['a', {}], ['b', '목소리 B']]) });
  assert.deepEqual(malformed.names('work'), ['목소리 B']);
});
