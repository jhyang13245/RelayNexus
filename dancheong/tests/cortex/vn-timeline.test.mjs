import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {createRoomTimeline,glyphSchedule,revealCount} from '../../public/cortex-vn-timeline.mjs';
import {createCachedPages} from '../../public/cortex-vn-page-cache.mjs';

test('different arrival clocks render the same glyph count without drift over 10,000 frames',()=>{
 let fast=0,slow=700;const a=createRoomTimeline(()=>fast),b=createRoomTimeline(()=>slow),text=glyphSchedule('동시에 표시되는 문장입니다. 다음 문장도 같습니다.');
 for(let seq=1;seq<=10000;seq++){
  const start=seq*10000,playback={seq,turnId:'turn-'+seq,start:0,startsAt:start+1200,revealAt:0,phase:'reading'};
  a.receive({playback,serverNow:start});b.receive({playback,serverNow:start+700});
  fast+=2000;slow+=1300;
  assert.equal(a.now(),b.now());assert.equal(revealCount(text,a.now()-playback.startsAt),revealCount(text,b.now()-playback.startsAt));
  const previous=b.now();b.receive({playback:{...playback,seq:seq-1},serverNow:previous-500});assert.equal(b.frame.seq,seq);assert.ok(b.now()>=previous);
  slow=fast+700;
 }
});

test('history fast path inspects only the live tail; explicit corrections and canonical replacement invalidate safely',()=>{
 let parsed=0,accessed=0;
 const turns=Array.from({length:1000},(_,i)=>({id:'t'+i,status:'COMMITTED',text:'이전 본문 '.repeat(1000),get dialogueAnnotations(){accessed++;return [];}}));
 const collect=createCachedPages(t=>{parsed++;return [{turnId:t.id,text:t.text||t.displayText}];});
 const pages=collect(turns);assert.equal(parsed,1000);accessed=0;
 const start=performance.now();for(let i=0;i<10000;i++)assert.equal(collect(turns),pages);
 const elapsed=performance.now()-start;assert.equal(accessed,10000);assert.equal(parsed,1000);
 turns[0].text='공식 정정';collect.invalidate();assert.equal(collect(turns)[0].text,'공식 정정');assert.equal(parsed,1001);
 const restored=structuredClone(turns);assert.deepEqual(collect(restored),collect(turns));
 console.log(JSON.stringify({vnHistoryPolls:10000,historyTurns:1000,elapsedMs:Math.round(elapsed)}));
});

test('actual renderer retains the shared paragraph through canonical restore, turn ownership and a missing live preview',()=>{
 const source=fs.readFileSync('vendor/visual-novel/nexus-multiplayer-entry.mjs','utf8');
 const frames=Array.from({length:15},(_,i)=>({turnId:'beat',start:i*20}));
 const frame={seq:4,turnId:'beat',start:200,startsAt:1000,phase:'reading'};
 const state={pages:frames,cursor:0,actions:false};let stopped=0;
 const context=vm.createContext({host:{multiplayer:true},roomTimeline:{frame,now:()=>2000},roomFrame:null,roomAligned:false,state,voice:{stop(){stopped++}},stopReleasedVoice(){}});
 const at=source.indexOf('function alignMultiplayerPlayback()'),end=source.indexOf('function roomPageStarted',at);vm.runInContext(source.slice(at,end),context);
 assert.equal(vm.runInContext('alignMultiplayerPlayback()',context),true);assert.equal(state.cursor,10);
 state.cursor=0;state.pages=structuredClone(frames);assert.equal(vm.runInContext('alignMultiplayerPlayback()',context),true);assert.equal(state.cursor,10,'canonical replacement does not jump ten paragraphs back');
 state.pages=[];assert.equal(vm.runInContext('alignMultiplayerPlayback()',context),false,'hold painted surface during restore');
 state.pages=frames;state.cursor=1;assert.equal(vm.runInContext('alignMultiplayerPlayback()',context),true);assert.equal(state.cursor,10);
 assert.ok(stopped>0);
});

test('touches reveal then advance only finalized paragraphs and never during a pending shared transition',()=>{
 const source=fs.readFileSync('vendor/visual-novel/nexus-multiplayer-entry.mjs','utf8');const calls=[];
 const frame={seq:4,phase:'reading'},page={turnIndex:0,turnId:'beat'},turn={status:'COMMITTED'};
 const state={pages:[page],cursor:0,reveal:{length:2,glyphs:Array(10)},api:{_turns:()=>[turn]}};
 const context=vm.createContext({host:{active:true},roomAligned:true,roomFrame:frame,roomTimeline:{frame},state,roomRequest:(...args)=>calls.push(args)});
 const at=source.indexOf('function multiplayerTouch()'),end=source.indexOf('function scheduleMultiplayerPlayback',at);vm.runInContext(source.slice(at,end),context);
 vm.runInContext('multiplayerTouch()',context);assert.deepEqual(calls.pop(),['reveal','beat']);
 state.reveal.length=10;vm.runInContext('multiplayerTouch()',context);assert.deepEqual(calls.pop(),['advance','beat']);
 for(const status of ['STREAMING','ADJUDICATION_PENDING','FAILED']){turn.status=status;vm.runInContext('multiplayerTouch()',context);}
 assert.equal(calls.length,0);turn.status='COMMITTED';context.roomTimeline.frame={seq:5};vm.runInContext('multiplayerTouch()',context);assert.equal(calls.length,0);
});

test('a second deliberate tap is not throttled like an automatic readiness retry',()=>{
 const source=fs.readFileSync('vendor/visual-novel/nexus-multiplayer-entry.mjs','utf8');const calls=[];let now=2000;
 const context=vm.createContext({performance:{now:()=>now},roomRequestPending:false,roomRequestAt:0,roomTimeline:{frame:{seq:4}},host:{emit:(...args)=>calls.push(args)}});
 const at=source.indexOf('function roomRequest('),end=source.indexOf('function alignMultiplayerPlayback',at);vm.runInContext(source.slice(at,end),context);
 vm.runInContext("roomRequest('reveal','beat')",context);assert.equal(calls.length,1);
 now+=250;vm.runInContext("roomRequest('advance','beat')",context);assert.equal(calls.length,1,'one request in flight');
 context.roomRequestPending=false;vm.runInContext("roomRequest('advance','beat')",context);assert.equal(calls.length,2,'second tap after acknowledgement works immediately');
 context.roomRequestPending=false;vm.runInContext("roomRequest('auto','beat')",context);assert.equal(calls.length,2,'background retries remain rate limited');
});
