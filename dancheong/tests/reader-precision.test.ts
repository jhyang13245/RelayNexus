import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const source = readFileSync('public/cortex-nexus-view.js', 'utf8');
const context: any = { window: {} }; vm.runInNewContext(source, context);
const dialogue = context.window.NexusDialogue;
const rows = ['민준', '서연', '지수'].map((name, index) => ({ person: { id: 'p' + index }, visible: { name }, names: [name] }));
const resolve = (text: string, annotations: any[] = []) => Array.from(dialogue.resolve(text, annotations, rows, () => true)) as any[];
const annotation = (text: string, name = '민준', index = 0) => ({ offset: text.indexOf('“'), characterId: 'p' + index, speakerName: name, source: 'WRITER_CHARACTER_REF' });

test('the writer binding owns the card regardless of nearby addressees or quoted names', () => {
  for (const text of ['민준이 서연에게 말했다. “지수는 어디 있어?”', '민준은 서연을 바라보며 물었다. “서연아, 준비됐어?”']) assert.equal(resolve(text,[{...annotation(text),bindingVersion:2,quoteText:text.slice(text.indexOf('“'))}])[0].row?.visible.name, '민준');
});
test('ambiguous alternating replies and incidental actions never invent a speaker', () => {
  const text = '민준은 서연을 보았다.\n“가자.”\n“싫어.”\n“왜?”', quotes = [...text.matchAll(/“/g)];
  assert.deepEqual(resolve(text, [annotation(text), { ...annotation(text), offset: quotes[2].index }]).map(q => q.row?.visible.name || null), ['민준', null, '민준']);
  assert.equal(resolve('민준이 고개를 돌려 서연을 바라봤다. “안녕.”')[0].row, null);
});
test('legacy offsets do not drift into a different quote or inside its text', () => {
  const text = '“네.” “아니요.”';
  assert.equal(resolve(text, [{ ...annotation(text), offset: 7 }]).every(q => !q.row), true);
  assert.equal(resolve('  “네.”', [{ ...annotation(text), offset: 0 }])[0].row.visible.name, '민준');
});
test('quote-bound annotations survive prefix edits, but repeated quotes require context', () => {
  const text = '수정된 첫 문단이다.\n서연은 기다렸다.\n“출발하자.”';
  assert.equal(resolve(text, [{ ...annotation(text), offset: 1, quoteText: '“출발하자.”', quoteClosed: true }])[0].row.visible.name, '민준');
  assert.equal(resolve('“네.”\n“네.”', [{ ...annotation(text), quoteText: '“네.”' }]).every(q => !q.row), true);
  assert.equal(resolve('“네.”\n서연이 손을 들었다.\n“네.”', [{ ...annotation(text), quoteText: '“네.”', prefixText: '서연이 손을 들었다.' }])[1].row.visible.name, '민준');
});
test('streamed partial quotes use their own binding without waiting for finalization', () => {
  const text = '“이제 출발';
  assert.equal(resolve(text, [{ ...annotation(text), quoteText: '“이제 출발하자.”' }])[0].row.visible.name, '민준');
});
test('nested quotation marks remain within one speaker card, including a partial inner quote', () => {
  const full = '“그가 ‘안녕’이라고 했어.”';
  assert.deepEqual(resolve(full, [{...annotation(full), quoteText:full}]).map(q => q.text), [full]);
  assert.equal(resolve('“그가 ‘안녕’', [{...annotation(full), quoteText:full}])[0].row.visible.name, '민준');
  assert.equal(resolve("It's raining. “가자.”").length, 1);
});
test('printed notices and inner thoughts cannot inherit a character marker', () => {
  for (const text of ['화면에는 알림이 표시됐다. “내일 3시”', '쪽지에는 “돌아와”라고 적혀 있었다.', '서연은 속으로 “무슨 일이지?”']) assert.equal(resolve(text, [annotation(text)])[0].row, null);
});
test('writer-named extras render verbatim without requiring a repeated name in narration', () => {
  const text = '“괜찮아요?”\n“네.”\n“천천히 해요.”';
  const names=['검은 단발 학생','긴 머리 학생','지나가던  행인'];
  const annotations=[...text.matchAll(/“[^”]*”/g)].map((m,i)=>({offset:m.index,quoteText:m[0],bindingVersion:2,characterId:'',speakerName:names[i],source:'WRITER_PUBLIC_NAME'}));
  assert.deepEqual(resolve(text,annotations).map(q => q.row?.visible.name), names);
  assert.equal(resolve('“비밀 인물이 왔다.”', [{ offset: 0, speakerName: '비밀 인물', source: 'WRITER_PUBLIC_NAME' }])[0].row, null);
});
test('message sender is explicitly supplied by the writer and unknown ids fail closed', () => {
  const text = '서연이 보낸 문장은 짧았다.\n“와 줘.”';
  assert.equal(resolve(text, [annotation(text,'서연',1)])[0].row.visible.name, '서연');
  assert.equal(resolve(text)[0].row,null);
  assert.equal(resolve('서연이 물었다. “왜?”', [{ offset: 9, characterId: 'secret', speakerName: '지수' }])[0].row, null);
});

function readerHarness() {
  const dom = new JSDOM('<section id="story"><div id="feed"><article data-turn-id="t"><p data-reader-start="0" data-reader-end="20">abcdefghijklmnopqrst</p></article></div></section><button id="jump"></button>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const win: any = dom.window; win.eval(source);
  const story: any = win.document.getElementById('story'), feed = win.document.getElementById('feed'), jump = win.document.getElementById('jump');
  let height = 2000, elementTop = 900;
  Object.defineProperties(story, { scrollHeight: { get: () => height }, clientHeight: { value: 500 } });
  story.getBoundingClientRect = () => ({ top: 0, bottom: 500, right: 600 });
  const bind = () => { feed.querySelector('p').getBoundingClientRect = () => ({ top: elementTop - story.scrollTop, bottom: elementTop - story.scrollTop + 100 }); };
  bind(); story.scrollTop = 900;
  const turn = { id: 't', status: 'STREAMING', displayText: 'abc' };
  const controller = win.createNexusReaderScroll(story, feed, jump, () => turn);
  return { dom, win, story, feed, jump, turn, controller, bind, setTop: (n: number) => elementTop = n, setHeight: (n: number) => height = n, settle: () => new Promise(r => setTimeout(r, 40)) };
}
test('wheel cancels a queued follow and manually reaching the bottom resumes it', async () => {
  const h = readerHarness(); try {
    h.controller.schedule(); h.story.dispatchEvent(new h.win.WheelEvent('wheel', { deltaY: -120 })); h.story.scrollTop = 600; h.story.dispatchEvent(new h.win.Event('scroll'));
    await h.settle(); assert.equal(h.story.scrollTop, 600); assert.equal(h.controller.following, false);
    h.story.scrollTop = 1500; h.story.dispatchEvent(new h.win.Event('scroll')); h.turn.displayText += 'def'; h.controller.schedule(); await h.settle(); assert.equal(h.controller.following, true);
    h.jump.click(); assert.equal(h.controller.following, true);
  } finally { h.dom.window.close(); }
});
test('manual scrolling to the real page end hides the jump button and resumes follow', () => {
  const h = readerHarness(); try {
    h.controller.pause();
    h.story.scrollTop = 1497; h.story.dispatchEvent(new h.win.Event('scroll'));
    assert.equal(h.jump.hidden, false, 'the button stays available above the page end');
    h.story.scrollTop = 1500; h.story.dispatchEvent(new h.win.Event('scroll'));
    assert.equal(h.jump.hidden, true, 'manual arrival at the page end hides the button');
    assert.equal(h.controller.following, true, 'manual arrival resumes streaming follow');
  } finally { h.dom.window.close(); }
});
test('a committed replacement and a late image above the reader preserve its text anchor', async () => {
  const h = readerHarness(); try {
    h.controller.pause(); await new Promise(r => setTimeout(r, 360));
    h.controller.transaction(() => { h.turn.status = 'COMMITTED'; h.feed.querySelector('p').replaceWith(h.feed.querySelector('p').cloneNode(true)); h.bind(); h.setTop(1250); });
    await h.settle(); assert.equal(h.story.scrollTop, 1250);
    h.setTop(1650); h.setHeight(2400); h.feed.dispatchEvent(new h.win.Event('load')); await h.settle(); assert.equal(h.story.scrollTop, 1650);
  } finally { h.dom.window.close(); }
});
test('layout-only changes while following do not jump to the bottom on commitment', async () => {
  const h = readerHarness(); try {
    h.turn.status = 'COMMITTED'; h.controller.transaction(() => h.setTop(1150)); await h.settle(); assert.equal(h.story.scrollTop, 1150);
  } finally { h.dom.window.close(); }
});
test('touch scrolling and reader navigation keys pause follow, but text input does not', () => {
  const h = readerHarness(); try {
    const touch=(type:string,y:number)=>{const event=new h.win.Event(type);Object.defineProperty(event,'touches',{value:[{clientX:30,clientY:y}]});h.story.dispatchEvent(event)};
    touch('touchstart',300);touch('touchmove',270);assert.equal(h.controller.following,false);
    h.jump.click();h.story.dispatchEvent(new h.win.KeyboardEvent('keydown',{key:'PageUp',bubbles:true}));assert.equal(h.controller.following,false);
    h.jump.click();const input=h.win.document.createElement('textarea');h.story.append(input);input.dispatchEvent(new h.win.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));assert.equal(h.controller.following,true);
  } finally { h.dom.window.close(); }
});

test('streaming below the viewport does not accumulate the paragraph-to-glyph one-pixel offset', async () => {
  const h = readerHarness(); try {
    h.win.document.createRange = () => ({ setStart() {}, setEnd() {}, getBoundingClientRect: () => ({ top: 901-h.story.scrollTop, bottom:921-h.story.scrollTop }) });
    h.story.scrollTop=600;h.controller.pause();
    let writes=0,top=600;Object.defineProperty(h.story,'scrollTop',{configurable:true,get:()=>top,set:(value:number)=>{writes++;top=value}});
    for(let i=0;i<8;i++){h.turn.displayText+=' more prose';h.controller.transaction(()=>{});await h.settle()}
    assert.equal(h.story.scrollTop,600);assert.equal(writes,0,'unchanged layout must not write scrollTop');
  } finally { h.dom.window.close(); }
});
