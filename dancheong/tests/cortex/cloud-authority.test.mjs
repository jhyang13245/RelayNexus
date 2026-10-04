import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HeadlessCortex,makeModel} from './harness.mjs';

test('actual reader gates generation and preserves a typed draft through cloud restore',async()=>{
 const read=file=>fs.readFileSync(file,'utf8');
 let html=read('public/cortex.html').replace('<head>','<head><script>window.Image=class {naturalWidth=320;naturalHeight=180;set src(v){setTimeout(()=>this.onload?.(),0)}decode(){return Promise.resolve()}};</script>');
 for(const name of ['cortex-host','jieum-reader','cortex-nexus-view','cortex-nexus-inspector'])html=html.replace('<script src="/'+name+'.js"></script>',()=>'<script>'+read('public/'+name+'.js')+'</script>');
 html=html.replace(/<link\b[^>]*>/g,'');
 const scenario=JSON.parse(read('tests/fixtures/cortex-173-chronos-2turn.json')).scenario;
 const original=fs.readFileSync;fs.readFileSync=function(file,...args){return file==='__cloud_authority__.html'?html:original.call(this,file,...args)};
 let app;
 try{
  const model=makeModel();app=await new HeadlessCortex({standalonePath:'__cloud_authority__.html',url:'https://nexus.test/cortex.html?session=cloud-test&cloudAuthority=1',initialScenario:scenario,model}).open();
  const events=[];app.win.parent.postMessage=data=>events.push(data);
  const emit=data=>app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:app.win.location.origin,source:app.win.parent,data:{channel:'NEXUS_CORTEX_HOST_V1',...data}}));
  const wait=async type=>{for(let n=0;n<160&&!events.some(e=>e.type===type);n++)await app.settle(25);assert.ok(events.some(e=>e.type===type),JSON.stringify(events)+' '+app.logs.join('\n'))};
  const snapshot=await app.api._fullExport();
  app.api._setInput('입력 초안\n두 번째 줄');
  emit({type:'CLOUD_RESTORE',snapshot,syncEpoch:1});await wait('CLOUD_RESTORE_COMPLETE');
  assert.equal(app.win.document.getElementById('input').value,'입력 초안\n두 번째 줄');
  app.api._setSettings({apiKey:'test-key',typingSpeed:'instant',imageEvery:0});
  events.length=0;const denied=app.api.runTurnV1111();await wait('CLOUD_WRITE_REQUEST');
  assert.equal(app.turns.length,0);emit({type:'CLOUD_WRITE_RESULT',requestId:events.find(e=>e.type==='CLOUD_WRITE_REQUEST').requestId,allowed:false});await denied;
  assert.equal(app.turns.length,0);assert.equal(app.win.document.getElementById('input').value,'입력 초안\n두 번째 줄');
  events.length=0;const pending=app.api.runTurnV1111();await wait('CLOUD_WRITE_REQUEST');
  emit({type:'CLOUD_WRITE_RESULT',requestId:events.find(e=>e.type==='CLOUD_WRITE_REQUEST').requestId,allowed:true});await pending;
  assert.ok(app.turns.length>0,app.logs.join('\n'));assert.ok(events.some(e=>e.type==='CLOUD_WRITE_FINISHED'));
  assert.ok(app.turns.at(-1).text,'engine still commits narrative after permission');
 }finally{app?.close();fs.readFileSync=original}
});
