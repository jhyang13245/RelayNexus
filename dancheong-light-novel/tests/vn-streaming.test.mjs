import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readableTurnPages } from '../public/vn-core.mjs';
import { captureScene } from '../public/vn-scene.mjs';
import { imageNotice } from '../public/vn-assets.mjs';
import { nextPlaybackStep } from '../public/vn-reader.mjs';

// ---------- helpers ----------
function fakeExperience() {
  return {
    createImageCapsule: () => ({ visualReferences: [] }),
    publicCharacter: (person) => ({
      id: person.id,
      name: person.name,
      referenceMode: person.id === 'ghost' ? 'NONE' : 'PRIMARY',
      publicProfile: '',
      allowedAssetRefs: [],
    }),
  };
}

function baseScenario(openingCharacters) {
  return {
    world: { location: 'village', time: 'day', weather: 'clear' },
    scene: { presentCharacterIds: ['hero'] },
    protagonist: { id: 'hero', name: 'Hero' },
    characters: [
      { id: 'npc1', name: 'Npc1' },
      { id: 'npc2', name: 'Npc2' },
      { id: 'ghost', name: 'Ghost' },
    ],
    runtime: { packageContract: { openingContract: { openingCharacters } } },
  };
}

// ---------- readableTurnPages ----------
describe('readableTurnPages', () => {
  it('empty STREAMING displayText stays empty despite a full turn.text draft', () => {
    const pages = readableTurnPages(
      { id: 't1', status: 'STREAMING', displayText: '', text: 'Full draft that must never show.' },
      0,
    );
    assert.deepEqual(pages, []);
  });

  it('nonempty published displayText is returned before COMMITTED with live/growing flags', () => {
    const turn = {
      id: 't2',
      status: 'STREAMING',
      displayText: 'Hello published world.',
      text: 'Hello published world. UNPUBLISHED DRAFT TAIL',
    };
    const pages = readableTurnPages(turn, 0);
    assert.ok(pages.length > 0, 'published text should produce pages');
    assert.ok(pages.every((p) => p.isLive === true), 'all streaming pages are live');
    assert.equal(pages.at(-1).isGrowing, true, 'last streaming page grows');
    assert.ok(pages.slice(0, -1).every((p) => p.isGrowing === false));
    const joined = pages.map((p) => p.text).join(' ');
    assert.ok(!joined.includes('UNPUBLISHED DRAFT TAIL'), 'draft tail must not leak');
  });

  it('appended paragraphs preserve earlier offsets', () => {
    const before = readableTurnPages(
      { id: 't3', status: 'STREAMING', displayText: 'First paragraph here.', text: 'draft' },
      0,
      500,
    );
    const after = readableTurnPages(
      { id: 't3', status: 'STREAMING', displayText: 'First paragraph here.\nSecond paragraph here.', text: 'draft' },
      0,
      500,
    );
    assert.ok(before.length >= 1 && after.length >= 2, 'growth should add a page');
    assert.equal(after[0].start, before[0].start, 'first page start stable');
    assert.equal(after[0].end, before[0].end, 'first page end stable');
    assert.equal(after[0].text, before[0].text, 'first page text stable');
  });

  it('COMMITTED uses final turn.text with no live/growing flags', () => {
    const pages = readableTurnPages(
      { id: 't4', status: 'COMMITTED', text: 'Final story text.', displayText: 'stale published draft' },
      2,
    );
    assert.ok(pages.length > 0);
    const joined = pages.map((p) => p.text).join(' ');
    assert.ok(joined.includes('Final story text.'));
    assert.ok(!joined.includes('stale published draft'));
    assert.ok(pages.every((p) => p.isLive === false && p.isGrowing === false));
  });

  it('REJECTED turns are not shown', () => {
    const pages = readableTurnPages(
      { id: 't5', status: 'REJECTED', text: 'rejected text', displayText: 'rejected text' },
      0,
    );
    assert.deepEqual(pages, []);
  });

  it('ADJUDICATION_PENDING uses checkpoint only when displayText is missing', () => {
    const fallback = readableTurnPages(
      { id: 't6', status: 'ADJUDICATION_PENDING', sameTurnResume: { publicText: 'Explicit checkpoint.' } },
      0,
    );
    assert.ok(fallback.length > 0, 'checkpoint should produce pages');
    assert.ok(fallback.map((p) => p.text).join(' ').includes('Explicit checkpoint.'));

    const preferred = readableTurnPages(
      {
        id: 't6',
        status: 'ADJUDICATION_PENDING',
        displayText: 'Live published line.',
        sameTurnResume: { publicText: 'Explicit checkpoint.' },
      },
      0,
    );
    const joined = preferred.map((p) => p.text).join(' ');
    assert.ok(joined.includes('Live published line.'));
    assert.ok(!joined.includes('Explicit checkpoint.'), 'displayText wins over checkpoint');
  });
});

// ---------- captureScene ----------
describe('captureScene openingCharacters', () => {
  it('comma-separated explicit IDs add public NPCs when only protagonist is present', () => {
    const scenario = baseScenario('npc1, npc2');
    const scene = captureScene({
      scope: 'test',
      scenario,
      turn: { id: 'opening', text: 'Once upon a time.' },
      previous: undefined,
      experience: fakeExperience(),
    });
    const ids = scene.candidates.map((c) => c.id);
    assert.ok(ids.includes('hero'), 'protagonist stays');
    assert.ok(ids.includes('npc1') && ids.includes('npc2'), 'opening NPCs added');
  });

  it('unknown IDs are ignored and NONE references are excluded', () => {
    const scenario = baseScenario('npc1, unknown-id, ghost');
    const scene = captureScene({
      scope: 'test',
      scenario,
      turn: { id: 'opening', text: 'Once upon a time.' },
      previous: undefined,
      experience: fakeExperience(),
    });
    const ids = scene.candidates.map((c) => c.id);
    assert.ok(ids.includes('npc1'));
    assert.ok(!ids.includes('unknown-id'), 'unknown IDs ignored');
    assert.ok(!ids.includes('ghost'), 'NONE references excluded');
  });

  it('openingCharacters do NOT add NPCs to a later normal turn', () => {
    const scenario = baseScenario('npc1, npc2');
    const scene = captureScene({
      scope: 'test',
      scenario,
      turn: { id: 'turn-2', text: 'Later events.' },
      previous: undefined,
      experience: fakeExperience(),
    });
    const ids = scene.candidates.map((c) => c.id);
    assert.deepEqual(ids, ['hero'], 'later turn keeps only present protagonist');
  });

  it('input scenario remains unchanged', () => {
    const scenario = baseScenario('npc1, npc2');
    const before = JSON.stringify(scenario);
    captureScene({
      scope: 'test',
      scenario,
      turn: { id: 'opening', text: 'Once upon a time.' },
      previous: undefined,
      experience: fakeExperience(),
    });
    assert.equal(JSON.stringify(scenario), before, 'scenario must not be mutated');
    assert.deepEqual(scenario.scene.presentCharacterIds, ['hero']);
  });
});

// ---------- imageNotice ----------
describe('imageNotice', () => {
  it('missing key calls for settings', () => {
    const notice = imageNotice({ status: 'idle', readyCount: 0, totalCount: 2 }, false);
    assert.equal(notice?.action, 'settings');
  });

  it('background completion does not hide a missing portrait', () => {
    const withoutKey = imageNotice({ status: 'idle', readyCount: 1, totalCount: 2 }, false);
    assert.equal(withoutKey?.action, 'settings');
    const withKey = imageNotice({ status: 'idle', readyCount: 1, totalCount: 2 }, true);
    assert.ok(withKey !== null, 'partial readiness must still notify');
    assert.equal(withKey?.action, 'wait');
  });

  it('ready images show no notice', () => {
    assert.equal(imageNotice({ status: 'ready', readyCount: 2, totalCount: 2 }, true), null);
    assert.equal(imageNotice(null, true), null);
  });
});

// ---------- nextPlaybackStep ----------
describe('nextPlaybackStep', () => {
  it('waits at a currently streaming end', () => {
    assert.equal(
      nextPlaybackStep({ mode: 'auto', cursor: 4, length: 5, readThrough: 4, blocked: false, revealing: false, streaming: true }),
      'wait',
    );
  });

  it('advances over available pages', () => {
    assert.equal(
      nextPlaybackStep({ mode: 'auto', cursor: 1, length: 5, readThrough: 1, blocked: false, revealing: false, streaming: true }),
      'advance',
    );
  });

  it('stops at a committed end', () => {
    assert.equal(
      nextPlaybackStep({ mode: 'auto', cursor: 4, length: 5, readThrough: 4, blocked: false, revealing: false, streaming: false }),
      'stop',
    );
  });
});
