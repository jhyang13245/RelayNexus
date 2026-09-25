import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  environmentKey,
  expressionTimeline,
  expressionsAt,
  portraitKey,
  stageCast,
} from '../public/vn-scene.mjs';

const scopeA = 'test-scope-a';
const scopeB = 'test-scope-b';

function world(overrides = {}) {
  return {
    location: '해바라기 교실',
    time: '14:01',
    weather: '맑음',
    ...overrides,
  };
}

describe('environmentKey', () => {
  it('reuses the same key for the same place during a minute-level time change', () => {
    const a = environmentKey(scopeA, world({ time: '14:01' }));
    const b = environmentKey(scopeA, world({ time: '14:45' }));
    assert.equal(a, b);
  });

  it('produces different keys for day/night and place changes', () => {
    const day = environmentKey(scopeA, world({ time: '13:00' }));
    const night = environmentKey(scopeA, world({ time: '22:10' }));
    assert.notEqual(day, night);

    const here = environmentKey(scopeA, world({ location: '해바라기 교실' }));
    const there = environmentKey(scopeA, world({ location: '소나무 도서관' }));
    assert.notEqual(here, there);
  });

  it('isolates keys by scope', () => {
    const a = environmentKey(scopeA, world());
    const b = environmentKey(scopeB, world());
    assert.notEqual(a, b);
  });
});

describe('expressionTimeline with explicit named narration', () => {
  const minjun = { id: 'minjun', name: '민준' };
  const seoyeon = { id: 'seoyeon', name: '서연' };

  it('follows named narration for multiple characters', () => {
    const text = '민준은 미소 지었다. 서연은 노려보았다.';
    const timeline = expressionTimeline(text, [minjun, seoyeon]);
    const latest = expressionsAt({ expressions: timeline }, Infinity);
    assert.equal(latest.minjun, 'smile');
    assert.equal(latest.seoyeon, 'angry');
  });

  it('does not assign an expression without an explicit named subject', () => {
    const text = '미소 지었다.';
    const timeline = expressionTimeline(text, [minjun]);
    const latest = expressionsAt({ expressions: timeline }, Infinity);
    assert.equal(latest.minjun, 'neutral');
    assert.ok(timeline.every(event => event.expression === 'neutral'));
  });

  it('quoted emotional words do not update faces', () => {
    const quotedDouble = '민준은 "미소" 라고 말했다.';
    const quotedKorean = '민준은 “미소” 라고 말했다.';
    for (const text of [quotedDouble, quotedKorean]) {
      const timeline = expressionTimeline(text, [minjun]);
      assert.ok(
        timeline.every(event => event.expression === 'neutral'),
        `expected only neutral for: ${text}`,
      );
      assert.equal(expressionsAt({ expressions: timeline }, Infinity).minjun, 'neutral');
    }

    // Sanity check: the same word without quotes does update the face.
    const unquoted = '민준은 미소 지었다.';
    const unquotedLatest = expressionsAt(
      { expressions: expressionTimeline(unquoted, [minjun]) },
      Infinity,
    );
    assert.equal(unquotedLatest.minjun, 'smile');
  });
});

describe('expressionsAt', () => {
  it('does not reveal a future expression before its offset', () => {
    const scene = {
      expressions: [
        { offset: 0, characterId: 'minjun', expression: 'neutral' },
        { offset: 20, characterId: 'minjun', expression: 'smile' },
      ],
    };
    assert.equal(expressionsAt(scene, 5).minjun, 'neutral');
    assert.equal(expressionsAt(scene, 19).minjun, 'neutral');
    assert.equal(expressionsAt(scene, 20).minjun, 'smile');
    assert.equal(expressionsAt(scene, Infinity).minjun, 'smile');
  });
});

describe('portraitKey', () => {
  const base = {
    id: 'minjun',
    referenceMode: 'PUBLIC',
    allowedAssetRefs: ['ref-a'],
    primaryAssetRef: 'ref-a',
    publicProfile: '밝은 학생',
  };

  it('differs by expression', () => {
    const neutral = portraitKey(scopeA, base, 'neutral');
    const smile = portraitKey(scopeA, base, 'smile');
    assert.notEqual(neutral, smile);
  });

  it('differs by disclosure refs', () => {
    const baseKey = portraitKey(scopeA, base, 'neutral');
    const otherPrimary = portraitKey(
      scopeA,
      { ...base, primaryAssetRef: 'ref-b' },
      'neutral',
    );
    const otherAllowed = portraitKey(
      scopeA,
      { ...base, allowedAssetRefs: ['ref-b'] },
      'neutral',
    );
    const otherProfile = portraitKey(
      scopeA,
      { ...base, publicProfile: '조용한 학생' },
      'neutral',
    );
    assert.notEqual(baseKey, otherPrimary);
    assert.notEqual(baseKey, otherAllowed);
    assert.notEqual(baseKey, otherProfile);
  });

  it('isolates by scope', () => {
    assert.notEqual(
      portraitKey(scopeA, base, 'neutral'),
      portraitKey(scopeB, base, 'neutral'),
    );
  });
});

describe('stageCast', () => {
  const protagonist = { id: 'protagonist', name: '주인공' };
  const harin = { id: 'harin', name: '하린' };
  const jihoon = { id: 'jihoon', name: '지훈' };
  const doun = { id: 'doun', name: '도은' };
  const siwoo = { id: 'siwoo', name: '시우' };
  const yuna = { id: 'yuna', name: '유나' };

  it('keeps non-protagonist cast present independent of speaker, up to 3', () => {
    const scene = {
      protagonistId: protagonist.id,
      characters: [protagonist, harin, jihoon],
    };
    const noSpeaker = stageCast(scene, '').map(person => person.id);
    const firstSpeaker = stageCast(scene, harin.id).map(person => person.id);
    const secondSpeaker = stageCast(scene, jihoon.id).map(person => person.id);
    const protagonistSpeaker = stageCast(scene, protagonist.id).map(person => person.id);

    assert.deepEqual(noSpeaker, [harin.id, jihoon.id]);
    assert.deepEqual(firstSpeaker, noSpeaker);
    assert.deepEqual(secondSpeaker, noSpeaker);
    assert.deepEqual(protagonistSpeaker, noSpeaker);
    assert.ok(!noSpeaker.includes(protagonist.id));
  });

  it('caps visible cast at 3 non-protagonists', () => {
    const scene = {
      protagonistId: protagonist.id,
      characters: [protagonist, harin, jihoon, doun, siwoo, yuna],
    };
    const visible = stageCast(scene, '');
    assert.equal(visible.length, 3);
    assert.ok(visible.every(person => person.id !== protagonist.id));
    assert.deepEqual(
      visible.map(person => person.id),
      [harin.id, jihoon.id, doun.id],
    );
  });
});
