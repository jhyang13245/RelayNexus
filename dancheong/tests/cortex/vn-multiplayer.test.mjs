import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createInputNotice,createMultiplayerProjection,multiplayerReadStep} from '../../public/cortex-vn-multiplayer.mjs';
import {createSharedAssets} from '../../public/cortex-vn-shared.mjs';
import {createVoice} from '../../public/vn-runtime/vn-voice.mjs';
import {createVoiceCredits} from '../../public/vn-runtime/vn-voice-credits.mjs';

test('shared voice ignores listener model tags and retains the actual Typecast credit',async()=>{
 const requests=[];let paid=0;
 globalThis.NexusVNSharedAssets={isShared:()=>false,record:async(kind,key,_produce,options)=>{
  requests.push({kind,key,turn:options.turn});return {key,url:'data:audio/mpeg;base64,YQ==',provider:'typecast',voice:'actor-id',voiceName:'공개 성우 이름'};
 }};
 try{
  for(const provider of ['openai','gemini-3.8-flash-tts']){
   let played;const ready=new Promise(resolve=>played=resolve);
   const voice=createVoice({getEnabled:()=>true,getKey:()=>'',read:async()=>null,write:async()=>{},fetchVoice:async()=>{paid++;throw Error('must not call');},makeAudio:()=>({play:async()=>{},pause(){}}),onState:phase=>{if(phase==='playing')played();}});
   voice.update({key:JSON.stringify(['vn-voice-3','work','person','different-'+provider,'안녕',provider,'turn',0]),playbackKey:'work/turn/0',text:provider==='openai'?'안녕':'<sigh> 안녕',speakerId:'person',voice:'local-voice',provider,mediaTurn:3});
   await ready;
   assert.equal(voice.speaking.provider,'typecast');
   const credit=createVoiceCredits({getItem:()=>null,setItem(){}});credit.record('work',voice.speaking,[]);
   assert.deepEqual(credit.names('work'),['공개 성우 이름']);voice.stop();
  }
  assert.equal(paid,0);assert.equal(requests[0].key,requests[1].key);assert.ok(requests.every(row=>row.turn===3));
 }finally{delete globalThis.NexusVNSharedAssets;}
});
test('VN preview never mutates canonical turns; repeat/out-of-order frames and commit handoff retain one turn',()=>{
 const turns=[],projection=createMultiplayerProjection({_turns:()=>turns});
 projection.receive({id:'beat',seq:3,visual:{text:'공개된 문장',annotations:[]}});
 const shown=projection.turns()[0];assert.equal(shown.displayText,'공개된 문장');assert.equal(shown.text,'');assert.equal(turns.length,0);
 projection.receive({id:'beat',seq:2,visual:{text:'오래된 문장'}});assert.equal(projection.turns()[0],shown);
 turns.push({id:'beat',status:'COMMITTED',text:'확정'});assert.equal(projection.turns().length,1);assert.equal(projection.turns()[0],turns[0]);
 projection.clear();assert.equal(projection.turns(),turns);
});

test('listeners with keys never invoke a producer; originating turn stays attached while results are shared',async()=>{
 let calls=0,claim;
 const record={key:'same-line',url:'data:audio/mpeg;base64,YQ=='};
 const coordinator=createSharedAssets({visible:()=>true,request:async body=>{
  if(body.action==='read')return {record:claim?record:null};
  if(body.action==='claim'){claim=body;return {claimed:false,status:'waiting-owner'};}
  if(body.action==='lookup')return {rows:body.keys.map(key=>({key,status:'ready'}))};
 }});
 const received=await coordinator.record('voice','same-line',()=>{calls++;return record},{canProduce:true,turn:7});
 assert.equal(calls,0);assert.equal(claim.turn,7);assert.equal(received,record);
});
test('submitted input is safe text for ten seconds and repeated receipts do not restart its lifetime',()=>{
 const dom=new JSDOM('<aside hidden></aside>'),node=dom.window.document.querySelector('aside');let delay,expire;
 const show=createInputNotice(node,{now:()=>100000,schedule:(fn,ms)=>{expire=fn;delay=ms;return 1},cancel:()=>{}});
 const row={id:'one',createdAt:new Date(98000).toISOString(),name:'나',text:'<img src=x onerror=1>'};show(row);
 assert.equal(delay,8000);assert.equal(node.querySelector('img'),null);assert.equal(node.hidden,false);
 expire();show(row);assert.equal(node.hidden,true);
 show({...row,id:'stale',createdAt:new Date(80000).toISOString()});assert.equal(node.hidden,true);
 dom.window.close();
});
test('concurrent local asset requests produce once; upload acknowledgement retry never regenerates',async()=>{
 let produced=0,published=0,record=null;
 const coordinator=createSharedAssets({request:async body=>{
  if(body.action==='read')return {record};if(body.action==='claim')return {claimed:true,status:'running'};
  if(body.action==='publish'){published++;record=body.record;if(published===1)throw Error('lost response');return{saved:true}}
 },visible:()=>true});
 const produce=async()=>{produced++;coordinator.started('image','sprite');return{key:'sprite',url:'data:image/webp;base64,YQ=='}};
 const [a,b]=await Promise.all([coordinator.record('image','sprite',produce),coordinator.record('image','sprite',produce)]);
 assert.equal(produced,1);assert.equal(published,2);assert.equal(a,b);assert.equal(coordinator.pending,0);assert.equal(coordinator.isShared('image','sprite'),true);
});

test('only a gateway rejection before upstream releases an unpaid reservation; unknown attempts remain fenced',async()=>{
 for(const attempts of [['unpaid'],['unknown'],['unknown','unpaid']]){
  const actions=[];let coordinator;
  coordinator=createSharedAssets({request:async body=>{actions.push(body.action);if(body.action==='read')return {record:null};if(body.action==='claim')return {claimed:true};return{};}});
  await coordinator.record('cast','fixture',async()=>{
   for(const attempt of attempts){coordinator.started('cast','fixture');if(attempt==='unpaid')coordinator.response('cast','fixture',new Response('',{status:409,headers:{'X-VN-Provider-State':'not-started'}}));}
   return null;
  });
  assert.equal(actions.at(-1),attempts.includes('unknown')?'failed':'release');
 }
});

test('multiplayer auto reading waits for displayed text/voice, advances pages and stops for player choice without submitting',()=>{
 const ready={hasPage:true,hasNext:true,voicePhase:'idle'};
 assert.equal(multiplayerReadStep(ready),'advance');
 for(const reason of [{blocked:true},{revealing:true},{growing:true},{voicePhase:'preparing'},{voicePhase:'playing'}])assert.equal(multiplayerReadStep({...ready,...reason}),'wait');
 assert.equal(multiplayerReadStep({...ready,hasNext:false}),'choices');
 for(const reason of [{busy:true},{awaiting:true},{actions:true},{tailStatus:'ADJUDICATION_PENDING'}])assert.equal(multiplayerReadStep({...ready,hasNext:false,...reason}),'wait');
 assert.equal(multiplayerReadStep({...ready,actions:true}),'advance','a later public paragraph resumes reading');
});
