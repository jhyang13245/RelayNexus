import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),source=file=>fs.readFileSync(root+'/'+file,'utf8');
test('host keeps keys ephemeral and notifies image-only durable changes without an export loop',async()=>{
 const {HeadlessCortex,makeModel}=await import(pathToFileURL(root+'/tests/cortex/harness.mjs').href);
 let html=source('public/cortex.html').replace('<head>','<head><script>window.Image=class {naturalWidth=320;naturalHeight=180;set src(v){setTimeout(()=>this.onload?.(),0)}decode(){return Promise.resolve()}};</script>');
 for(const name of ['cortex-host','jieum-reader','cortex-nexus-view','cortex-nexus-inspector'])html=html.replace('<script src="/'+name+'.js"></script>',()=>'<script>'+source('public/'+name+'.js')+'</script>');
 html=html.replace(/<link\b[^>]*>/g,'');
 const original=fs.readFileSync;fs.readFileSync=function(file,...args){return file==='__audit_memory__.html'?html:original.call(this,file,...args)};
 let app;try{
  const scenario=JSON.parse(source('tests/fixtures/cortex-173-chronos-2turn.json')).scenario;
  app=await new HeadlessCortex({standalonePath:'__audit_memory__.html',initialScenario:scenario,model:makeModel({beforeRespond:entry=>entry.kind==='image'?{ok:true,status:200,json:async()=>({imageUrl:'data:image/png;base64,c3ludGhldGlj',model:'gpt-image-2.5-flare'})}:undefined})}).open();
  app.api.applyImportedState({scenario,turns:[{id:'beat-image',status:'COMMITTED',text:'아무도 없는 방에 햇빛이 들었다.'}]},{persistState:false});
  app.api._setSettings({apiKey:'synthetic-key-not-a-credential'});await app.api.persist();await app.settle(1200);
  assert.equal(app.win.localStorage.getItem('dancheong-cortex-device-api-key-v1'),null);
  const events=[];app.win.parent.postMessage=data=>events.push(data);
  await app.api._generateTurnImage(0);await app.settle(1200);
  assert.equal(app.turns[0].imageStatus,'GENERATED');assert.ok(events.some(e=>e.type==='DURABLE_CHANGE'));
  events.length=0;await app.api.persist({notifyHost:false});await app.settle(1200);assert.equal(events.filter(e=>e.type==='DURABLE_CHANGE').length,0);
  assert.equal(app.turns[0].imageStatus,'GENERATED');
 }finally{fs.readFileSync=original;app?.close()}

});
