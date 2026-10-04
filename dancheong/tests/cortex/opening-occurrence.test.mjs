import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HeadlessCortex,makeModel} from './harness.mjs';
import '../../vendor/cortex/occurrence-runtime.js';
const opening=()=>({event:{id:'first'},runtime:{eventLedger:{sealed:[]},packageContract:{openingContract:{activeEventId:'first'}}}});
test('only an unplayed authored opening bypasses occurrence; later candidates keep checks',()=>{
 const O=globalThis.CortexOccurrence,sc=opening();assert.equal(O.isOpeningEvent(sc,[]),true);
 assert.equal(O.isOpeningEvent(sc,[{status:'FAILED'}]),true);
 assert.equal(O.isOpeningEvent(sc,[{status:'COMMITTED'}]),false);
 sc.event.id='later';assert.equal(O.isOpeningEvent(sc,[]),false);
 sc.event.id='first';sc.runtime.eventLedger.sealed=[{id:'previous'}];assert.equal(O.isOpeningEvent(sc,[]),false);
 sc.runtime.eventLedger.sealed=[];sc.runtime.occurrenceDecisions=[{eventId:'earlier',verdict:'FALSE'}];assert.equal(O.isOpeningEvent(sc,[]),false);
 sc.runtime.occurrenceDecisions=[];sc.runtime.jieum={routeIndex:1};sc.runtime.packageV15={jieum:{routes:[{eventIds:['first']},{eventIds:['second-route-start']}]}};sc.event.id='second-route-start';assert.equal(O.isOpeningEvent(sc,[]),true);
});
test('existing opening session writes without calling an UNKNOWN occurrence judge and survives reload',async()=>{
 const sc=JSON.parse(fs.readFileSync('tests/fixtures/cortex-173-chronos-2turn.json','utf8')).scenario;
 sc.runtime.eventLedger={...(sc.runtime.eventLedger||{}),sealed:[]};sc.runtime.occurrenceDecisions=[];
 sc.event.cortexDesign={schema:'STUDIO_EVENT_DESIGN_V2',occurrenceEnabled:true,occurrence:'아직 확인하지 못한 시작 조건'};
 let occurrenceCalls=0;
 const model=makeModel({beforeRespond(entry){
  if(entry.format!=='cortex_event_occurrence')return;
  occurrenceCalls++;
  return {ok:true,status:200,body:null,json:async()=>({output_text:JSON.stringify({verdict:'UNKNOWN',evidence:''})})};
 }});
 let app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model,initialScenario:sc}).open();
 try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  const restoredScenario=JSON.parse(JSON.stringify(app.scenario)),saved=app.close();app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model,...saved,initialScenario:restoredScenario}).open();
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  const before=JSON.stringify(app.scenario.event.cortexDesign),turn=await app.turn('주변을 살핀다');
  assert.equal(occurrenceCalls,0);assert.equal(turn.status,'COMMITTED',JSON.stringify(turn));assert.equal(turn.sourceEventId,sc.event.id);assert.equal(JSON.stringify(app.scenario.event.cortexDesign),before);assert.equal(app.scenario.runtime.occurrenceDecisions?.length||0,0);
 }finally{app.close()}
});
