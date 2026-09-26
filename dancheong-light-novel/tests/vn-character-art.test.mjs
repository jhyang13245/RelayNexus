import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createQualityReferenceLoader, portraitPrompt, workPortrait, readWorkArt, writeWorkArt } from '../public/vn-character-art.mjs';
import { portraitKey } from '../public/vn-scene.mjs';
const person = { id: 'guide', referenceMode: 'PRIMARY' };
const key = portraitKey('work-a:save', person);
const image = 'data:image/png;base64,aW1hZ2U=';

describe('work-scoped quality reference', () => {
  it('without a selected guide uses text alone and does not read or fetch any image', async () => {
    const load = createQualityReferenceLoader({ read: () => assert.fail('unselected image read') });
    assert.equal(await load('work-a:save'), '');
  });
  it('coalesces same-work image reads and cannot return it for another work', async () => {
    let reads = 0;
    const load = createQualityReferenceLoader({ getSelection: () => key, read: async k => { reads++; return { key: k, url: image }; } });
    assert.deepEqual(await Promise.all([load('work-a:one'), load('work-a:two')]), [image, image]);
    assert.equal(await load('work-b:one'), '');
    assert.equal(reads, 1);
  });
  it('disabling the selection stops sending a previously cached guide', async () => {
    let selected = key;
    const load = createQualityReferenceLoader({ getSelection: () => selected, read: async key => ({ key, url: image }) });
    assert.equal(await load('work-a:save'), image);
    selected = '';
    assert.equal(await load('work-a:save'), '');
  });
  it('foreign, expression, wardrobe and invalid reference URLs never become quality guides', async () => {
    for (const k of [portraitKey('other:save', person), portraitKey('work-a:save', person, 'angry'), JSON.stringify(['vn-wardrobe-1', key, 'swimwear']), 'invalid']) assert.equal(workPortrait(k, 'work-a:save'), false);
    for (const url of ['https://external/image.png', '', 'data:text/html;base64,aA==']) {
      const load = createQualityReferenceLoader({ getSelection: () => key, read: async key => ({ key, url }) });
      assert.equal(await load('work-a:save'), '');
    }
  });
  it('settings and pinned portraits remain local to the selected work and character', () => {
    const records = new Map(), storage = { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) };
    writeWorkArt(storage, 'work-a:save', { guideKey: key, locks: { guide: key, stranger: key } });
    assert.deepEqual(readWorkArt(storage, 'work-a:another'), { guideKey: key, locks: { guide: key } });
    assert.deepEqual(readWorkArt(storage, 'work-b:save'), { guideKey: '', locks: {} });
  });
});
describe('portraitPrompt target vs guide identity', () => {
  const elder = {
    name: 'Old Master Han',
    publicProfile: 'elderly swordsman with deep wrinkles and grey topknot',
    age: 78,
    gender: 'male',
  };

  it('serializes male/elderly target data as JSON without losing identity', () => {
    const prompt = portraitPrompt({ person: elder, art: 'ink style', hasGuide: false });
    const expected = JSON.stringify({
      name: elder.name,
      profile: elder.publicProfile,
      age: elder.age,
      gender: elder.gender,
    });
    assert.ok(prompt.includes(expected), 'target JSON block must be embedded intact');
    assert.ok(prompt.includes('"age":78'));
    assert.ok(prompt.includes('"gender":"male"'));
    assert.ok(prompt.includes('Old Master Han'));
  });

  it('keeps the guide identity separate when hasGuide is true', () => {
    const prompt = portraitPrompt({ person: elder, art: 'ink style', hasGuide: true });
    assert.ok(prompt.includes('RENDERING-QUALITY GUIDE'));
    assert.ok(prompt.includes('NOT this character'));
    assert.match(prompt, /never copy/i);
    // Target identity still present alongside the guide disclaimer.
    assert.ok(prompt.includes('"gender":"male"'));
    assert.ok(prompt.includes('Old Master Han'));
  });

  it('makes no final-reference claim when hasGuide is false', () => {
    const prompt = portraitPrompt({ person: elder, art: 'ink style', hasGuide: false });
    assert.ok(!prompt.includes('FINAL reference'));
    assert.ok(!prompt.includes('RENDERING-QUALITY GUIDE'));
  });
});
