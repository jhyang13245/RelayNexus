import assert from 'node:assert/strict';
import test from 'node:test';
import { backgroundFor, pagesForTurn } from '../public/vn-core.mjs';

test('본문의 화자 주석을 대사 페이지에 연결하고 모든 문장을 표시한다', () => {
  const source = '문이 열렸다.\n“들어와.”\n나는 고개를 끄덕였다.';
  const pages = pagesForTurn({ id: 'beat-1', text: source, dialogueAnnotations: [{ offset: source.indexOf('“'), quoteText: '“들어와.”', characterId: 'hero', speakerName: '서현' }] }, 0);
  assert.deepEqual(pages.map(page => page.kind), ['narration', 'dialogue', 'narration']);
  assert.equal(pages[1].speaker, '서현');
  assert.equal(pages[1].characterId, 'hero');
  assert.equal(pages[1].text, '들어와.');
  assert.equal(pages.map(page => page.text).join('').replace(/[“”\s]/gu, ''), source.replace(/[“”\s]/gu, ''));
});

test('이미지는 선택한 시점 이전의 최신 장면을 배경으로 쓰고, 없으면 표지를 쓴다', () => {
  const turns = [{ imageUrl: 'scene-1' }, {}, { imageUrl: 'scene-3' }];
  assert.deepEqual(backgroundFor(turns, 1, 'cover'), { url: 'scene-1', source: 'generated', turnIndex: 0 });
  assert.deepEqual(backgroundFor(turns, 2, 'cover'), { url: 'scene-3', source: 'generated', turnIndex: 2 });
  assert.deepEqual(backgroundFor([{}], 0, 'cover'), { url: 'cover', source: 'cover', turnIndex: -1 });
  assert.deepEqual(backgroundFor([{}], 0, 'cover', 'opening-art'), { url: 'opening-art', source: 'opening', turnIndex: -1 });
});

test('긴 대사를 나눠도 원문과 화자, 읽기 위치가 유지된다', () => {
  const quote = `“${'지금은 이곳에서 기다릴게. '.repeat(30).trim()}”`;
  const source = `그가 말했다.\n${quote}\n바람이 불었다.`;
  const pages = pagesForTurn({ id: 'long', text: source, dialogueAnnotations: [{ offset: source.indexOf('“'), quoteText: quote, characterId: 'hero', speakerName: '서현' }] }, 0, 150);
  const dialogue = pages.filter(page => page.kind === 'dialogue');
  assert.ok(dialogue.length > 1);
  assert.ok(dialogue.every(page => page.speaker === '서현' && page.characterId === 'hero'));
  assert.equal(pages.map(page => page.rawText || page.text).join('').replace(/\s/gu, ''), source.replace(/\s/gu, ''));
  assert.equal(new Set(pages.map(page => page.start)).size, pages.length);
  for (const page of pages) assert.equal(source.slice(page.start, page.end).trim(), page.rawText || page.text);
});
