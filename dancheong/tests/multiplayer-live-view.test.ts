import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('only painted public blocks are relayed; private buffers never leave and receiver preserves unchanged nodes',()=>{
 const dom=new JSDOM('<div id="feed"><article class="turn" data-turn-index="0"><div class="choice">입력\n두 줄</div><div class="prose"><p class="nexus-narration" data-reader-start="0" data-reader-end="6">공개된 문장</p><div class="nexus-dialogue-row"><div class="nexus-dialogue-head"><strong>공개 이름</strong></div><div class="nexus-dialogue-body"><p data-reader-start="8" data-reader-end="13">“안녕.”</p></div></div><figure class="speaker-beat-image" data-state="READY" data-speaker-portrait="public-person"><img src="data:image/png;base64,cHVibGlj"><figcaption><strong>공개 이름</strong></figcaption></figure><aside hidden>비공개 정보</aside></div><div class="diagnostic">내부 판정</div></article></div>',{runScripts:'outside-only'});
 try{
  const w=dom.window as any,source=fs.readFileSync('public/cortex-nexus-view.js','utf8');
  w.eval(source.slice(0,source.indexOf('// Quote identity')));
  let transactions=0;w.NexusReaderScroll={transaction(fn:()=>unknown){transactions++;return fn()}};
  const turns=[{id:'new-public-turn',text:'숨겨진 뒤 문단과 API 비밀',displayText:'출력용 원문도 직접 전송하지 않는다',dialogueAnnotations:[{secret:'내부 인물'}]}];
  const sender=w.createNexusMultiplayerLive({_turns:()=>turns}),payload=sender.capture(0),wire=JSON.stringify(payload);
  assert.ok(wire.includes('공개된 문장'));assert.ok(wire.includes('공개 이름'));assert.ok(wire.includes('public-person'));
  for(const privateText of ['숨겨진','API 비밀','내부 인물','비공개 정보','내부 판정','data:image'])assert.ok(!wire.includes(privateText));
  assert.equal(payload.input,'입력\n두 줄');
  const receiver=w.createNexusMultiplayerLive({_turns:()=>[]});w.NexusCortexPrimaryMedia=new Map([['public-person',{dataUrl:'data:image/png;base64,cHVibGlj'}]]);
  receiver.apply({...payload,seq:1});const n=w.document.querySelector('.nexus-live-turn'),p=n.querySelector('.nexus-narration'),image=n.querySelector('img');
  const next=structuredClone(payload);next.blocks.push({kind:'text',text:'<img src=x onerror=alert(1)>',start:14,end:40});receiver.apply({...next,seq:2});
  assert.equal(n.querySelector('.nexus-narration'),p);assert.equal(n.querySelector('img'),image);
  assert.equal(n.querySelectorAll('img').length,1,'network markup is text, never HTML');
  receiver.apply({...payload,seq:1});assert.ok(n.textContent.includes('onerror'));
  n.remove();receiver.reconcile();assert.ok(w.document.querySelector('.nexus-live-turn').textContent.includes('onerror'),'engine DOM refresh restores last received frame without browser reload');
  assert.equal(receiver.current.status,'STREAMING');assert.ok(transactions>=2);
  receiver.clear();assert.equal(w.document.querySelector('.nexus-live-turn'),null);assert.equal(receiver.current,null);
 }finally{dom.window.close()}
});

test('spectator buffer keeps text/image nodes, catches up, suspends hidden frames and hands off atomically',()=>{
 const dom=new JSDOM('<div id="feed"></div>',{runScripts:'outside-only'});
 try{
  const w=dom.window as any,source=fs.readFileSync('public/cortex-nexus-view.js','utf8');let now=0,id=0,visible='visible';const frames=new Map<number,(now:number)=>void>();
  Object.defineProperty(w.document,'visibilityState',{get:()=>visible});Object.defineProperty(w.performance,'now',{value:()=>now});
  w.requestAnimationFrame=(fn:any)=>{frames.set(++id,fn);return id};w.cancelAnimationFrame=(id:number)=>frames.delete(id);
  const step=(ms=34)=>{now+=ms;const work=[...frames.values()];frames.clear();work.forEach(fn=>fn(now))};
  w.eval(source.slice(0,source.indexOf('// Quote identity')));w.NexusReaderScroll={transaction:(fn:any)=>fn()};w.NexusCortexPrimaryMedia=new Map([['person',{dataUrl:'data:image/png;base64,cHVibGlj'}]]);
  const live=w.createNexusMultiplayerLive({_turns:()=>[],_settings:()=>({typingSpeed:'natural'})});
  const blocks=[{kind:'portrait',portrait:'person',name:'인물',text:''},{kind:'dialogue',name:'인물',text:'가'.repeat(100)+'😀',start:0,end:102}];
  live.apply({id:'live',seq:1,input:'입력',blocks});const article=w.document.querySelector('.nexus-live-turn'),p=article.querySelector('.nexus-dialogue-body p'),node=p.firstChild,image=article.querySelector('img');
  assert.ok(p.textContent.length<100);step(200);assert.ok(p.textContent.length>1&&p.textContent.length<100);assert.equal(p.firstChild,node);
  live.apply({id:'live',seq:2,input:'입력',blocks:[blocks[0],{...blocks[1],text:blocks[1].text+' 이어짐',end:106}]});
  assert.equal(article.querySelector('.nexus-dialogue-body p'),p);assert.equal(article.querySelector('img'),image);
  visible='hidden';w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(frames.size,0);
  visible='visible';w.document.dispatchEvent(new w.Event('visibilitychange'));step(1800);assert.equal(p.textContent,blocks[1].text+' 이어짐');assert.equal(frames.size,0);
  live.apply({id:'live',seq:3,input:'입력',blocks:[blocks[0],{...blocks[1],text:'수정된 대사',end:6}]});
  let during=false;live.handoff(()=>{during=article.isConnected;const committed=w.document.createElement('article');committed.dataset.turnId='live';committed.innerHTML='<figure data-speaker-portrait="person"><img src="data:image/png;base64,cHVibGlj"></figure><p>확정 본문</p>';w.document.getElementById('feed').append(committed)});
  assert.equal(during,true,'keep live text until committed markup is mounted');assert.equal(w.document.querySelectorAll('article').length,1);assert.equal(w.document.querySelector('img'),image);assert.equal(live.current,null);assert.equal(frames.size,0,'commit never waits for animation');
 }finally{dom.window.close()}
});
