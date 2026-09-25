import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  readingFrame,
  reconcileCursor,
  reconcileReadThrough,
  nextPlaybackStep,
  glyphDelay,
  pageKey,
} from '../public/vn-reader.mjs';
import { directionFor, directionAt, transitionFor } from '../public/vn-direction.mjs';

const page = (turnId, start, text, extra = {}) => ({
  turnId,
  start,
  rawText: text,
  ...extra,
});

describe('readingFrame', () => {
  it('never includes future pages', () => {
    const pages = [
      page('t1', 0, '첫 장면이 열렸다.'),
      page('t1', 10, '바람이 불었다.'),
      page('t1', 20, '문이 열렸다.'),
      page('t1', 30, '아직 오지 않은 내일 이야기.'),
      page('t1', 40, '더 먼 미래 이야기.'),
    ];
    const frame = readingFrame(pages, 2, { lineBudget: 100 });
    assert.ok(frame.length > 0);
    for (const entry of frame) {
      assert.ok(entry.index <= 2, `future page leaked: ${entry.index}`);
    }
    assert.equal(frame.at(-1).index, 2);
    assert.match(frame.at(-1).text, /문이 열렸다/);
  });

  it('resets across turns: a new turn never shows the previous turn', () => {
    const pages = [
      page('t1', 0, '첫 번째 턴의 마지막 문장이다.'),
      page('t1', 20, '첫 번째 턴의 끝맺음이다.'),
      page('t2', 0, '두 번째 턴이 시작되었다.'),
      page('t2', 20, '두 번째 턴이 이어진다.'),
    ];
    const frame = readingFrame(pages, 2, { lineBudget: 100 });
    assert.ok(frame.length > 0);
    for (const entry of frame) {
      assert.equal(entry.page.turnId, 't2');
    }
    assert.equal(frame[0].index, 2);
  });

  it('respects the line budget while always keeping the current page', () => {
    const pages = Array.from(
      { length: 8 },
      (_, i) => page('t1', i * 10, `같은 턴의 문장 ${i + 1}번이 이어진다.`),
    );
    const roomy = readingFrame(pages, 7, { lineBudget: 100 });
    const tight = readingFrame(pages, 7, { lineBudget: 3 });
    assert.equal(roomy.at(-1).index, 7);
    assert.equal(tight.at(-1).index, 7);
    assert.ok(
      tight.length < roomy.length,
      'a tight budget should drop the oldest pages of the turn',
    );
    assert.ok(
      tight[0].index > roomy[0].index,
      'tight frame should start later in the same turn',
    );
  });

  it('preserves rawText including quotes', () => {
    const quoted = '“안녕,” 그가 말했다. “오늘 밤이 마지막이야.”';
    const pages = [page('t1', 0, quoted)];
    const frame = readingFrame(pages, 0, { lineBudget: 100 });
    assert.equal(frame.length, 1);
    assert.equal(frame[0].text, quoted);
    assert.ok(frame[0].text.includes('“안녕,”'));
  });

  it('returns an empty frame when the cursor points nowhere', () => {
    assert.deepEqual(readingFrame([page('t1', 0, '본문.')], 5), []);
    assert.deepEqual(readingFrame([], 0), []);
  });
});

describe('reconcileCursor', () => {
  it('maintains the current reader position when later pages arrive', () => {
    const previous = [page('t1', 0, '첫 문장.'), page('t1', 10, '둘째 문장.')];
    const next = [...previous, page('t1', 20, '셋째 문장.')];
    assert.equal(reconcileCursor(previous, next, 1), 1);
    assert.equal(pageKey(next[reconcileCursor(previous, next, 1)]), pageKey(previous[1]));
  });

  it('enters the FIRST page when awaiting a brand-new turn', () => {
    const previous = [page('t1', 0, '이전 턴 문장.'), page('t1', 10, '이전 턴 끝.')];
    const next = [...previous, page('t2', 0, '새 턴 첫 문장.'), page('t2', 15, '새 턴 둘째.')];
    const cursor = reconcileCursor(previous, next, 1, { awaiting: true });
    assert.equal(cursor, 2);
    assert.equal(next[cursor].turnId, 't2');
    assert.match(next[cursor].rawText, /새 턴 첫 문장/);
  });

  it('does not jump while awaiting when the turn has not changed', () => {
    const previous = [page('t1', 0, '첫 문장.'), page('t1', 10, '둘째 문장.')];
    const next = [...previous, page('t1', 20, '같은 턴 셋째.')];
    assert.equal(reconcileCursor(previous, next, 0, { awaiting: true }), 0);
  });

  it('restores a bookmarked page when there is no previous position', () => {
    const next = [page('t1', 0, '첫 문장.'), page('t1', 10, '책갈피 문장.'), page('t1', 20, '셋째.')];
    const cursor = reconcileCursor([], next, 0, { bookmark: pageKey(next[1]) });
    assert.equal(cursor, 1);
  });

  it('falls back to the latest turn start when the saved position is gone', () => {
    const previous = [page('t0', 0, '사라진 저장 문장.')];
    const next = [
      page('t1', 0, '이전 턴 첫 문장.'),
      page('t1', 10, '이전 턴 둘째.'),
      page('t2', 0, '최신 턴 첫 문장.'),
      page('t2', 10, '최신 턴 둘째.'),
    ];
    const cursor = reconcileCursor(previous, next, 0);
    assert.equal(cursor, 2);
    assert.equal(next[cursor].turnId, 't2');
    assert.match(next[cursor].rawText, /최신 턴 첫 문장/);
  });

  it('first-open always starts at the beginning', () => {
    const next = [page('t1', 0, '첫 문장.'), page('t1', 10, '둘째.')];
    assert.equal(reconcileCursor(next, next, 1, { first: true }), 0);
  });
});

describe('nextPlaybackStep', () => {
  it('stops at the final page', () => {
    assert.equal(
      nextPlaybackStep({ mode: 'auto', cursor: 4, length: 5, readThrough: 10 }),
      'stop',
    );
  });

  it('skip mode stops at the unread boundary', () => {
    assert.equal(
      nextPlaybackStep({ mode: 'skip', cursor: 2, length: 10, readThrough: 2 }),
      'stop',
    );
  });

  it('skip mode advances inside already-read pages', () => {
    assert.equal(
      nextPlaybackStep({ mode: 'skip', cursor: 2, length: 10, readThrough: 5 }),
      'advance',
    );
  });

  it('auto mode advances mid-chapter', () => {
    assert.equal(
      nextPlaybackStep({ mode: 'auto', cursor: 1, length: 5, readThrough: 1 }),
      'advance',
    );
  });

  it('blocked or revealing never advances', () => {
    assert.equal(
      nextPlaybackStep({ mode: 'auto', cursor: 1, length: 5, readThrough: 4, blocked: true }),
      'wait',
    );
    assert.equal(
      nextPlaybackStep({ mode: 'auto', cursor: 1, length: 5, readThrough: 4, revealing: true }),
      'wait',
    );
    assert.equal(
      nextPlaybackStep({ mode: 'skip', cursor: 1, length: 5, readThrough: 4, blocked: true }),
      'wait',
    );
  });

  it('manual mode waits instead of advancing or stopping', () => {
    assert.equal(
      nextPlaybackStep({ mode: 'manual', cursor: 1, length: 5, readThrough: 4 }),
      'wait',
    );
  });
});

describe('punctuation delay and instant speed', () => {
  it('sentence-ending punctuation lingers longer than a plain glyph', () => {
    assert.ok(glyphDelay('。') > glyphDelay('가'));
    assert.ok(glyphDelay('!') > glyphDelay('가'));
    assert.ok(glyphDelay('?') > glyphDelay('나'));
  });

  it('commas linger, but less than sentence-enders', () => {
    assert.ok(glyphDelay(',') > glyphDelay('가'));
    assert.ok(glyphDelay('。') > glyphDelay(','));
  });

  it('instant speed removes every delay including punctuation', () => {
    assert.equal(glyphDelay('。', 'instant'), 0);
    assert.equal(glyphDelay('!', 'instant'), 0);
    assert.equal(glyphDelay('가', 'instant'), 0);
  });
});

describe('directionFor', () => {
  it('only explicit narration triggers impact', () => {
    const hit = directionFor({ kind: 'narration', text: '폭발음이 울렸다.' }, {});
    assert.equal(hit.impact, true);
    const calm = directionFor({ kind: 'narration', text: '그는 조용히 찻잔을 들었다.' }, {});
    assert.equal(calm.impact, false);
    const nearMiss = directionFor({ kind: 'narration', text: '폭발 이야기가 나왔다.' }, {});
    assert.equal(nearMiss.impact, false);
  });

  it('only explicit narration triggers a closeup', () => {
    const close = directionFor(
      { kind: 'narration', text: '그의 얼굴이 눈앞에 있었다.' },
      {},
    );
    assert.equal(close.shot, 'close');
    const calm = directionFor({ kind: 'narration', text: '그는 조용히 찻잔을 들었다.' }, {});
    assert.equal(calm.shot, 'medium');
  });

  it('quoted speech cannot trigger impact or closeup', () => {
    const quotedImpact = directionFor(
      { kind: 'narration', text: '“폭발음이 울렸다”' },
      {},
    );
    assert.equal(quotedImpact.impact, false);
    const quotedClose = directionFor(
      { kind: 'narration', text: '“얼굴이 눈앞에 있었다”' },
      {},
    );
    assert.equal(quotedClose.shot, 'medium');
  });

  it('dialogue kind cannot trigger direction even with trigger words', () => {
    const spoken = directionFor({ kind: 'dialogue', text: '폭발음이 울렸다.' }, {});
    assert.equal(spoken.impact, false);
    const stared = directionFor(
      { kind: 'dialogue', text: '그의 얼굴이 눈앞에 있었다.' },
      {},
    );
    assert.equal(stared.shot, 'medium');
  });
});

describe('transitionFor', () => {
  it('same environment means no transition', () => {
    assert.equal(
      transitionFor(
        { environmentKey: 'garden-night', world: { location: '정원' } },
        { environmentKey: 'garden-night', world: { location: '정원' } },
      ),
      'none',
    );
  });

  it('changed location reports a location transition', () => {
    assert.equal(
      transitionFor(
        { environmentKey: 'garden-night', world: { location: '정원' } },
        { environmentKey: 'palace-day', world: { location: '궁궐' } },
      ),
      'location',
    );
  });
});

describe('persistent direction', () => {
  const pages = [
    page('a', 0, '그의 얼굴이 눈앞에 있었다.', { kind: 'narration', text: '그의 얼굴이 눈앞에 있었다.' }),
    page('a', 20, '대화', { kind: 'dialogue', text: '대화' }),
    page('a', 30, '하늘을 올려다보았다.', { kind: 'narration', text: '하늘을 올려다보았다.' }),
    page('b', 0, '고요했다.', { kind: 'narration', text: '고요했다.' }),
  ];
  it('holds a closeup through dialogue without using later cues', () => {
    assert.equal(directionAt(pages, 1, {}).shot, 'close');
    assert.equal(directionAt(pages, 2, {}).shot, 'wide');
    assert.equal(directionAt(pages, 1, {}).shot, 'close');
  });
  it('resets framing on a new turn', () => assert.equal(directionAt(pages, 3, {}).shot, 'medium'));
  it('does not repeat impact and holds memory until explicit return', () => {
    const memory = [
      { turnId: 'a', kind: 'narration', text: '그날의 기억이 떠올랐다. 폭발음이 울렸다.' },
      { turnId: 'a', kind: 'dialogue', text: '대화' },
      { turnId: 'a', kind: 'narration', text: '현실로 돌아왔다.' },
    ];
    assert.equal(directionAt(memory, 0, {}).impact, true);
    assert.equal(directionAt(memory, 1, {}).impact, false);
    assert.equal(directionAt(memory, 1, {}).memory, true);
    assert.equal(directionAt(memory, 2, {}).memory, false);
  });
});

describe('read boundary across story updates', () => {
  it('does not inherit read opening pages when the first turn replaces them', () => {
    const opening = [page('opening', 0, '도입'), page('opening', 20, '도입 끝')];
    const first = [page('turn-1', 0, '처음 읽는 본문'), page('turn-1', 20, '미독')];
    assert.equal(reconcileReadThrough(opening, first, 1), -1);
  });
  it('preserves the read boundary when later turns arrive', () => {
    const before = [page('a', 0, '읽음'), page('a', 10, '아직')];
    assert.equal(reconcileReadThrough(before, [...before, page('b', 0, '새 턴')], 0), 0);
  });
  it('restores only a bookmark that still exists', () => {
    const pages = [page('a', 0, '본문')];
    assert.equal(reconcileReadThrough([], pages, -1, 'a:0'), 0);
    assert.equal(reconcileReadThrough([], pages, -1, 'removed:0'), -1);
  });
});
