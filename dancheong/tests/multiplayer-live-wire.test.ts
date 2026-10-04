import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {liveBasis,liveDelta,applyLiveDelta,parseLiveBasis} from '../lib/multiplayer-live-wire';
import {validateLivePresentation} from '../lib/multiplayer-live';
import {createRoomClock,scheduleRoomPoll,roomPollDelay} from '../lib/multiplayer-live-timing';
const packet=(seq=1)=>validateLivePresentation({id:'beat',seq,input:'두 줄\n입력',blocks:Array.from({length:40},(_,i)=>({kind:'text',text:('문단 '+i+'의 공개된 내용. ').repeat(30),start:i*500,end:(i+1)*500}))});
test('public deltas reduce traffic, bridge skipped sequences and recover changed prefixes without data loss',async()=>{
 const base=packet(),basis=await liveBasis(base),next=structuredClone(base);next.seq=9;next.blocks.at(-1)!.text+=' 이어지는 대사 😀';next.blocks.at(-1)!.end+=12;
 let wire=await liveDelta(next,basis);assert.equal(wire.wire,'LIVE_DELTA_V1');assert.deepEqual(applyLiveDelta(base,wire),next);
 const fullBytes=Buffer.byteLength(JSON.stringify(next)),deltaBytes=Buffer.byteLength(JSON.stringify(wire));assert.ok(deltaBytes<fullBytes/20);console.log(JSON.stringify({liveWireBenchmark:{fullBytes,deltaBytes}}));
 assert.equal(applyLiveDelta(null,wire),null);assert.equal(applyLiveDelta({...base,seq:2},wire),null);assert.equal(applyLiveDelta({...base,id:'other'},wire),null);
 next.blocks[0].text='앞 문단 수정';wire=await liveDelta(next,basis);assert.equal(wire.wire,undefined);assert.deepEqual(applyLiveDelta(base,wire),next);
 next.blocks[0]=base.blocks[0];next.blocks.at(-1)!.text='짧게 수정';wire=await liveDelta(next,basis);assert.deepEqual(applyLiveDelta(base,wire),next);
 next.blocks.push({...base.blocks[0],kind:'dialogue',name:'공개 이름'});next.input='수정 입력';wire=await liveDelta(next,basis);assert.deepEqual(applyLiveDelta(base,wire),next);
 assert.equal(parseLiveBasis('x'.repeat(2000)),null);assert.equal(parseLiveBasis({...basis,n:-1}),null);
 assert.equal((await liveDelta(next,{...basis,head:'0'.repeat(64)})).wire,undefined);
 assert.equal((await liveDelta(next,null)).wire,undefined,'old clients get complete public frames');
});
test('server deadline ignores wrong/changed device clocks and corrects again after sleep',()=>{
 let mono=100,wall=100000;const clock=createRoomClock(()=>mono,()=>wall);assert.equal(clock.now(),wall);
 mono=200;clock.sample(1000000,100);assert.equal(clock.now(),1000050);
 mono+=1000;wall-=300000;assert.equal(clock.now(),1001050);
 clock.sample(NaN,mono);clock.sample(9000000,mono-6000);assert.equal(clock.now(),1001050);
 mono+=3600000;clock.sample(5000000,mono-100);assert.equal(clock.now(),5000050);
});
test('one adaptive polling chain coalesces wakeups, pauses hidden work and stops cleanly',async()=>{
 const queued=new Map<number,{fn:()=>void;ms:number}>();let id=0,visible=true,calls=0,release:()=>void=()=>{};
 const poll=scheduleRoomPoll(async()=>{calls++;await new Promise<void>(resolve=>release=resolve)},()=>800,()=>visible,{set:((fn:any,ms:number)=>{queued.set(++id,{fn,ms});return id}) as any,clear:((id:number)=>queued.delete(id)) as any});
 poll.wake();poll.wake();poll.wake();assert.equal(calls,1);assert.equal(queued.size,0);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(queued.size,1);assert.equal([...queued.values()][0].ms,0);
 visible=false;poll.suspend();assert.equal(queued.size,0);poll.wake();assert.equal(calls,1);
 visible=true;poll.wake();assert.equal(calls,2);poll.stop();release();await new Promise(resolve=>setImmediate(resolve));assert.equal(queued.size,0);
 assert.equal(roomPollDelay(true,false),800);assert.equal(roomPollDelay(true,true),2500);assert.equal(roomPollDelay(false,false),2500);
 assert.equal(roomPollDelay(false,false,true),1200);assert.equal(roomPollDelay(true,false,true),800);
});

test('default polling timers retain the native receiver and keep delivering before commit',async()=>{
 let calls=0;const queued=new Map<number,()=>void>();let next=0;
 const context=vm.createContext({
  __name:(fn:unknown)=>fn,
  setTimeout:function(this:any,fn:()=>void){assert.ok(!this?.set,'native timer must not be invoked as a custom object method');queued.set(++next,fn);return next},
  clearTimeout:function(this:any,id:number){assert.ok(!this?.clear);queued.delete(id)},
  work:async()=>{calls++},
 });
 const poll=vm.runInContext(`(${scheduleRoomPoll.toString()})(work,()=>800,()=>true)`,context);
 poll.wake();await new Promise(r=>setImmediate(r));
 for(let n=0;n<4;n++){assert.equal(queued.size,1);const [id,fn]=[...queued.entries()][0];queued.delete(id);fn();await new Promise(r=>setImmediate(r));}
 assert.equal(calls,5,'continuous live reads, with no refresh or final commit required');
 poll.stop();assert.equal(queued.size,0);
});

test('VN text deltas preserve exact public annotations, recover rewritten prefixes, and avoid full retransmission',async()=>{
 const base={id:'vn-live',seq:1,input:'행동',blocks:[],visual:{text:'가'.repeat(16000),annotations:[]}};
 const next={...base,seq:3,visual:{text:base.visual.text+'“여기야.”',annotations:[{offset:16000,speakerName:'검증 인물',quoteText:'“여기야.”'}]}};
 const delta=await liveDelta(next,await liveBasis(base));
 assert.equal(delta.wire,'LIVE_DELTA_V1');assert.ok(JSON.stringify(delta).length<600);
 assert.deepEqual(applyLiveDelta(base,delta),next);
 const correction={...next,seq:4,visual:{...next.visual,text:'나'+next.visual.text.slice(1)}};
 assert.deepEqual(applyLiveDelta(next,await liveDelta(correction,await liveBasis(next))),correction);
 assert.equal(applyLiveDelta({...base,seq:2},delta),null);
});

test('VN speaker handles survive the public wire without copying private IDs or profiles',()=>{
 const text='“안녕하세요.”',raw={id:'writer',seq:1,input:'',blocks:[],visual:{text,annotations:[{offset:0,quoteText:text,speakerName:'여자',speakerRef:'w:abc123:def456',presence:'PHYSICAL',characterId:'PRIVATE_ID',profile:'PRIVATE_PROFILE',apiKey:'PRIVATE_KEY'}]}};
 const saved=validateLivePresentation(raw) as any,a=saved.visual.annotations[0];
 assert.equal(a.speakerRef,'w:abc123:def456');assert.equal(a.presence,'PHYSICAL');assert.equal(a.bindingVersion,2);
 assert.doesNotMatch(JSON.stringify(saved),/PRIVATE/);
 raw.visual.annotations[0].speakerRef='INVALID_SECRET';raw.visual.annotations[0].presence='UNKNOWN';
 const invalid=validateLivePresentation(raw) as any;assert.equal(invalid.visual.annotations[0].speakerRef,undefined);assert.equal(invalid.visual.annotations[0].presence,undefined);
});
