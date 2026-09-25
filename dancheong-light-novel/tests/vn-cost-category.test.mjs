import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCostCategory } from '../public/vn-costs.mjs';

test('text Responses request with cast header is classified as cast', () => {
  assert.equal(resolveCostCategory({ image: false, headers: { 'X-Dancheong-Purpose': 'cast' } }), 'cast');
});

test('ordinary text request without a purpose header stays text', () => {
  assert.equal(resolveCostCategory({ image: false }), 'text');
  assert.equal(resolveCostCategory({ image: false, headers: {} }), 'text');
});

test('valid image purpose is preserved', () => {
  assert.equal(resolveCostCategory({ image: true, purpose: 'portrait', headers: { 'X-Dancheong-Purpose': 'cast' } }), 'portrait');
});

test('invalid image purpose falls back to scene', () => {
  assert.equal(resolveCostCategory({ image: true, purpose: 'nope' }), 'scene');
});

