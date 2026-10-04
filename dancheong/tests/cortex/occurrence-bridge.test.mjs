import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HeadlessCortex,makeModel} from './harness.mjs';
import '../../vendor/cortex/occurrence-runtime.js';
const O=globalThis.CortexOccurrence;
const event=(id)=>({id,cortexDesign:{occurrenceEnabled:true,occurrence:'15시 30분 이후 상자가 도착한다.'}});
const scenario=()=>({world:{day:0,time:'09:07:30',location:'대학교 복도'},event:event('parcel'),runtime:{eventLedger:{sealed:[{id:'previous',status:'SEALED'}],activeEventId:'parcel'}}});

test('no eligible successor bridges the original event without changing time, conditions or sealed history',async()=>{
 const sc=scenario();sc.event.nextEvent=event('later');const before=structuredClone(sc);
 const result=await O.select(sc,async()=>({verdict:'FALSE',evidence:'09:07:30'}));
 assert.equal(result.selected,true);assert.equal(result.bridging,true);assert.equal(result.scenario.event.id,'parcel');
 assert.deepEqual(result.scenario.world,before.world);assert.deepEqual(result.scenario.event,before.event);
 assert.deepEqual(result.scenario.runtime.eventLedger,before.runtime.eventLedger);assert.deepEqual(sc,before);
 assert.equal(result.scenario.runtime.occurrenceBridge.checked.length,2);
 assert.equal(result.scenario.runtime.occurrenceDecisions,undefined);
 assert.equal(O.writerBridge(result.scenario).condition,sc.event.cortexDesign.occurrence);
});

test('ID-linked eligible successors still win; only exhausted selection falls back',async()=>{
 const sc=scenario();sc.event.nextEventId='later';sc.runtime.packageContract={eventGraph:{nodes:{later:event('later')}}};
 const calls=[];const result=await O.select(sc,async e=>{calls.push(e.id);return {verdict:e.id==='later'?'TRUE':'FALSE',evidence:'09:07:30'}});
 assert.deepEqual(calls,['parcel','later']);assert.equal(result.scenario.event.id,'later');assert.equal(result.bridging,undefined);
 assert.equal(O.writerBridge(result.scenario),null);assert.deepEqual(result.scenario.runtime.eventLedger.sealed,sc.runtime.eventLedger.sealed);
});

test('unknown, unavailable judge, empty condition and cycles preserve play and do not certify a condition',async()=>{
 for(const kind of ['UNKNOWN','API','EMPTY','CYCLE']){
  const sc=scenario();if(kind==='EMPTY')sc.event.cortexDesign.occurrence='';
  if(kind==='CYCLE'){sc.event.nextEventId='parcel';sc.runtime.packageContract={eventGraph:{nodes:{parcel:event('parcel')}}};sc.runtime.packageContract.eventGraph.nodes.parcel.nextEventId='parcel'}
  const result=await O.select(sc,async()=>{if(kind==='API')throw Error('NEXT_EVENT_CLOSURE_TIMEOUT');return {verdict:kind==='CYCLE'?'FALSE':'UNKNOWN',evidence:kind==='CYCLE'?'09:07:30':''}});
  assert.equal(result.selected,true,kind);assert.equal(result.scenario.event.id,'parcel');assert.equal(result.bridging,true);
  assert.deepEqual(result.scenario.world,sc.world);assert.equal(result.scenario.runtime.occurrenceDecisions,undefined);
 }
});

test('restored bridge avoids another judge call and does not leak to a different event',async()=>{
 const sc=scenario();sc.runtime.noEligibleEvent=true;
 const first=await O.select(sc,async()=>({verdict:'UNKNOWN',evidence:''}));
 assert.equal(first.scenario.runtime.noEligibleEvent,undefined);
 const second=await O.select(JSON.parse(JSON.stringify(first.scenario)),async()=>{throw Error('must not call')});
 assert.equal(second.changed,false);assert.equal(second.bridging,true);
 second.scenario.event.id='other';assert.equal(O.writerBridge(second.scenario),null);
});

test('candidate selection never crosses an ending or unlocks a later route',async()=>{
 for(const guard of ['ending','route']){
  const sc=scenario();sc.event.nextEventId='locked';sc.runtime.packageContract={eventGraph:{nodes:{locked:{id:'locked'}}}};
  sc.runtime.packageV15=guard==='ending'?{branchEnding:{terminalEvents:[{terminalEventId:'parcel'}]}}:{jieum:{routes:[{eventIds:['parcel'],endingEventId:'end'},{eventIds:['locked'],endingEventId:'locked'}]}};
  const result=await O.select(sc,async()=>({verdict:'FALSE',evidence:'09:07:30'}));
  assert.equal(result.scenario.event.id,'parcel');assert.equal(result.bridging,true);
  assert.deepEqual(result.scenario.runtime.packageV15,sc.runtime.packageV15);
 }
});

test('restored non-opening canon event with no eligible successor reaches writer and survives cloud roundtrip',async()=>{
 const sc=JSON.parse(fs.readFileSync('tests/fixtures/cortex-173-chronos-2turn.json','utf8')).scenario;
 sc.runtime.eventLedger={sealed:[{id:'previous',status:'SEALED'}],activeEventId:sc.event.id};
 sc.runtime.noEligibleEvent=true;sc.runtime.occurrenceDecisions=[];
 sc.event.cortexDesign=event('parcel').cortexDesign;delete sc.event.nextEvent;delete sc.event.nextEventId;
 sc.world.time='09:07:30';sc.runtime.packageContract={...sc.runtime.packageContract,eventGraph:{nodes:{}}};
 let checks=0;const writerRequests=[];
 const model=makeModel({beforeRespond(entry,body){
  if(entry.format==='cortex_event_occurrence'){checks++;return {ok:true,status:200,body:null,json:async()=>({output_text:JSON.stringify({verdict:'UNKNOWN',evidence:''})})}}
  if(entry.kind==='writer'){writerRequests.push({payload:entry.payload,body})}
 }});
 const standalonePath=process.env.CORTEX_TEST_HTML||'vendor/cortex/Cortex_v1.42.0.html';
 let app=await new HeadlessCortex({standalonePath,model,initialScenario:sc}).open();
 try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  const turn=await app.turn('수업을 마치고 택배 도착을 기다린다.');
  assert.equal(turn.status,'COMMITTED');assert.equal(checks,1);
  assert.ok(writerRequests.length);for(const request of writerRequests){assert.equal(request.payload.occurrenceBridge.eventId,sc.event.id);assert.equal(request.payload.occurrenceBridge.condition,sc.event.cortexDesign.occurrence);assert.match(JSON.stringify(request.body),/필요한 시간 경과/)}
  const exported=await app.api._fullExport();
  assert.equal(exported.scenario.runtime.occurrenceBridge.eventId,sc.event.id);
  assert.equal(exported.canonicalSession.state.cortexRuntimeExtra.occurrenceBridge.eventId,sc.event.id);
  app.close();app=await new HeadlessCortex({standalonePath,model}).open();
  await app.api._importFull(exported);app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  assert.equal(app.scenario.runtime.occurrenceBridge.eventId,sc.event.id);
  assert.equal(app.api._turns().at(-1).text,turn.text);
  await app.turn('서연과 이야기하며 기다린다.');assert.equal(checks,1);
 }finally{app.close()}
});
