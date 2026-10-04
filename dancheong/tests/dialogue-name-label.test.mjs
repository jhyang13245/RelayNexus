import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Load NexusDialogue slice from view.js without jsdom.
// Main developer may adapt VIEW_URL when integrating.
const VIEW_URL = new URL('../public/cortex-nexus-view.js', import.meta.url);
const START_MARKER = 'window.NexusDialogue =';
const END_MARKER = '// Reader-owned follow state.';

function loadDialogue() {
  const src = fs.readFileSync(VIEW_URL, 'utf8');
  const start = src.indexOf(START_MARKER);
  const end = src.indexOf(END_MARKER);
  assert.ok(start >= 0, 'NexusDialogue start marker missing');
  assert.ok(end > start, 'NexusDialogue end marker missing');
  const snippet = src.slice(start, end);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(`${snippet}\n//# sourceURL=nexus-dialogue-slice.js`, sandbox);
  assert.ok(sandbox.window.NexusDialogue, 'NexusDialogue failed to evaluate');
  return sandbox.window.NexusDialogue;
}

const NexusDialogue = loadDialogue();

// Fictional fixtures only. Never private project data.
const MINSEO_FULL = '김민서';
const MINSEO_SHORT = '민서';
const JIHUN_FULL = '박지훈';
const JIHUN_SHORT = '지훈';

function publicRow(id, full, short) {
  return {
    person: { id },
    visible: { id, name: full, role: '', referenceMode: 'PRIMARY' },
    names: [full, short],
  };
}

const minseoRow = () => publicRow('minseo-id', MINSEO_FULL, MINSEO_SHORT);
const jihunRow = () => publicRow('jihun-id', JIHUN_FULL, JIHUN_SHORT);
const bothRows = () => [minseoRow(), jihunRow()];
const allowCards = () => true;
const allowMedia = () => false;

function ann({ offset, quoteText, speakerName, characterId = '', bindingVersion = 2, source = 'WRITER_PUBLIC_NAME', ...extra }) {
  return { bindingVersion, source, characterId, offset, quoteText, speakerName, ...extra };
}

function singleQuoteFixture(speakerName = MINSEO_SHORT) {
  const source = '민서가 웃었다. “안녕.”';
  const offset = source.indexOf('“');
  const quoteText = '“안녕.”';
  return { source, offset, quoteText, annotation: ann({ offset, quoteText, speakerName }) };
}

describe('NexusDialogue literal label preservation', () => {
  it('registered short label stays short while public identity is retained', () => {
    const { source, annotation } = singleQuoteFixture(MINSEO_SHORT);
    const [card] = NexusDialogue.resolve(source, [annotation], bothRows(), allowCards);
    assert.equal(card.row?.visible?.name, MINSEO_SHORT);
    assert.notEqual(card.row?.visible?.name, MINSEO_FULL);
    assert.equal(card.row?.person?.id, 'minseo-id');
    assert.equal(card.row?.visible?.referenceMode, 'PRIMARY');
    assert.ok(card.row?.names?.includes(MINSEO_FULL));
    assert.equal(card.evidence, 'WRITER_QUOTE_BINDING');

    // Media gate uses allowName()=>false: same public identity may supply an image,
    // but the label must still not be rewritten.
    const [media] = NexusDialogue.resolve(source, [annotation], bothRows(), allowMedia);
    assert.equal(media.row?.person?.id, 'minseo-id');
    assert.equal(media.row?.visible?.name, MINSEO_SHORT);
  });

  it('wrong ID cannot select a different person or replace the label', () => {
    const { source, offset, quoteText } = singleQuoteFixture(MINSEO_SHORT);
    const bad = ann({ offset, quoteText, speakerName: MINSEO_SHORT, characterId: 'jihun-id' });
    const [card] = NexusDialogue.resolve(source, [bad], bothRows(), allowCards);
    assert.equal(card.row?.visible?.name, MINSEO_SHORT);
    assert.notEqual(card.row?.visible?.name, JIHUN_FULL);
    assert.ok(!card.row?.person?.id, 'wrong-ID card must carry no package identity');
    assert.notEqual(card.row?.person?.id, 'jihun-id');
    assert.equal(card.row?.visible?.referenceMode, 'NONE');

    const [media] = NexusDialogue.resolve(source, [bad], bothRows(), allowMedia);
    assert.equal(media.row, null);
  });

  it('ambiguous shared alias stays literal without identity and without image', () => {
    const { source, annotation } = singleQuoteFixture(MINSEO_SHORT);
    const ambiguousRows = [
      publicRow('minseo-id', MINSEO_FULL, MINSEO_SHORT),
      // Same short alias claimed by a second public person.
      { person: { id: 'jihun-id' }, visible: { id: 'jihun-id', name: JIHUN_FULL, role: '', referenceMode: 'PRIMARY' }, names: [JIHUN_FULL, MINSEO_SHORT] },
    ];
    const [card] = NexusDialogue.resolve(source, [annotation], ambiguousRows, allowCards);
    assert.equal(card.row?.visible?.name, MINSEO_SHORT);
    assert.ok(!card.row?.person?.id, 'ambiguous card must carry no package identity');
    assert.equal(card.row?.visible?.referenceMode, 'NONE');

    const [media] = NexusDialogue.resolve(source, [annotation], ambiguousRows, allowMedia);
    assert.equal(media.row, null);
  });

  it('repeated quotes keep their distinct explicit labels', () => {
    const source = '“안녕.” 그리고 “안녕.”';
    const firstOffset = source.indexOf('“');
    const secondOffset = source.indexOf('“', firstOffset + 1);
    const annotations = [
      ann({ offset: firstOffset, quoteText: '“안녕.”', speakerName: MINSEO_SHORT }),
      ann({ offset: secondOffset, quoteText: '“안녕.”', speakerName: JIHUN_SHORT }),
    ];
    const records = NexusDialogue.resolve(source, annotations, bothRows(), allowCards);
    assert.equal(records.length, 2);
    assert.equal(records[0].row?.visible?.name, MINSEO_SHORT);
    assert.equal(records[0].row?.person?.id, 'minseo-id');
    assert.equal(records[1].row?.visible?.name, JIHUN_SHORT);
    assert.equal(records[1].row?.person?.id, 'jihun-id');
  });

  it('unregistered extra name paints literally without identity', () => {
    // Roster knows only 민서/김민서 here; 지훈 is the unregistered extra.
    const source = '누군가 말했다. “잘 가.”';
    const offset = source.indexOf('“');
    const annotation = ann({ offset, quoteText: '“잘 가.”', speakerName: JIHUN_SHORT });
    const [card] = NexusDialogue.resolve(source, [annotation], [minseoRow()], allowCards);
    assert.equal(card.row?.visible?.name, JIHUN_SHORT);
    assert.ok(!card.row?.person?.id, 'unregistered card must carry no package identity');
    assert.notEqual(card.row?.visible?.referenceMode, 'PRIMARY');

    const [media] = NexusDialogue.resolve(source, [annotation], [minseoRow()], allowMedia);
    assert.equal(media.row, null);
  });

  it('missing annotation does not infer a nearby name', () => {
    const { source } = singleQuoteFixture(MINSEO_SHORT);
    const [record] = NexusDialogue.resolve(source, [], bothRows(), allowCards);
    assert.equal(record.row, null);
    assert.equal(record.evidence, 'UNRESOLVED');
  });

  it('nonspeech quote produces no card', () => {
    const { source, offset, quoteText } = singleQuoteFixture(MINSEO_SHORT);
    const nonspeech = ann({
      offset,
      quoteText,
      speakerName: MINSEO_SHORT,
      source: 'WRITER_NON_SPEECH_QUOTE',
      quoteKind: 'NON_SPEECH',
    });
    const [record] = NexusDialogue.resolve(source, [nonspeech], bothRows(), allowCards);
    assert.equal(record.nonSpeech, true);
    assert.equal(record.row, null);
  });

  it('every streaming prefix keeps the exact short label', () => {
    const source = '민서가 말했다. “안녕, 지훈아.”';
    const offset = source.indexOf('“');
    const openIndex = offset;
    const annotation = ann({ offset, quoteText: '“안녕, 지훈아.”', speakerName: MINSEO_SHORT });
    for (let len = openIndex + 1; len <= source.length; len++) {
      const prefix = source.slice(0, len);
      const [record] = NexusDialogue.resolve(prefix, [annotation], bothRows(), allowCards, { streaming: true });
      assert.equal(record.row?.visible?.name, MINSEO_SHORT, `prefix length ${len} rewrote label`);
      assert.notEqual(record.row?.visible?.name, MINSEO_FULL, `prefix length ${len} expanded to registry name`);
    }
  });

  it('final committed resolve matches the streaming label', () => {
    const source = '민서가 말했다. “안녕, 지훈아.”';
    const offset = source.indexOf('“');
    const annotation = ann({ offset, quoteText: '“안녕, 지훈아.”', speakerName: MINSEO_SHORT });
    const [streamed] = NexusDialogue.resolve(source, [annotation], bothRows(), allowCards, { streaming: true });
    const [committed] = NexusDialogue.resolve(source, [annotation], bothRows(), allowCards);
    assert.equal(streamed.row?.visible?.name, MINSEO_SHORT);
    assert.equal(committed.row?.visible?.name, MINSEO_SHORT);
    assert.equal(committed.row?.visible?.name, streamed.row?.visible?.name);
    assert.equal(committed.row?.person?.id, 'minseo-id');
  });
});
