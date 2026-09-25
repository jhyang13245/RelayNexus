import test from 'node:test';
import assert from 'node:assert/strict';
import { imageRoutingKey, imageProviderFor, readImageRouting } from '../public/vn-image-routing.mjs';
const storage = values => ({ getItem: key => values[key] ?? null });
test('single-provider preferences migrate to both roles without changing the users chosen model', () => {
  for (const choice of ['openai', 'gemini']) assert.deepEqual(readImageRouting(storage({ 'dancheong-ln-image-provider-v1': choice })), { background: choice, character: choice });
  assert.deepEqual(readImageRouting(storage({})), { background: 'openai', character: 'openai' });
});
test('independent choices survive reload and take precedence over the legacy selection', () => {
  const expected = { background: 'openai', character: 'gemini' };
  const read = readImageRouting(storage({ [imageRoutingKey]: JSON.stringify(expected), 'dancheong-ln-image-provider-v1': 'gemini' }));
  assert.deepEqual(read, expected);
  assert.equal(imageProviderFor(read, 'background'), 'openai');
  for (const purpose of ['portrait', 'expression', 'scene']) assert.equal(imageProviderFor(read, purpose), 'gemini');
});
test('malformed or inaccessible preferences fall back safely', () => {
  assert.deepEqual(readImageRouting(storage({ [imageRoutingKey]: '{', 'dancheong-ln-image-provider-v1': 'gemini' })), { background: 'gemini', character: 'gemini' });
  assert.deepEqual(readImageRouting({ getItem() { throw Error('storage blocked'); } }), { background: 'openai', character: 'openai' });
});
