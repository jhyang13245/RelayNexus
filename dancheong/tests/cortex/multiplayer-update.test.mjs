import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {HeadlessCortex,makeModel} from './harness.mjs';

test('shared update preserves old DOM/images, matches full restore, acknowledges only durable state and rejects wrong bases',async()=>{
 const source=file=>fs.readFileSync(file,'utf8'),exports={};
 vm.runInNewContext(ts.transpileModule(source('lib/multiplayer-update.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
 let html=source('public/cortex.html').replace('<head>','<head><script>window.Image=class {naturalWidth=320;naturalHeight=180;set src(v){setTimeout(()=>this.onload?.(),0)}decode(){return Promise.resolve()}};</script>');
 for(const name of ['cortex-host','jieum-reader','cortex-nexus-view','cortex-nexus-inspector'])html=html.replace('<script src="/'+name+'.js"></script>',()=>'<script>'+source('public/'+name+'.js')+'</script>');
 html=html.replace(/<link\b[^>]*>/g,'');
 const original=fs.readFileSync;fs.readFileSync=function(file,...args){return file==='__shared_update__.html'?html:original.call(this,file,...args)};
 let app,control;
 try{
  const scenario=JSON.parse(source('tests/fixtures/cortex-173-chronos-2turn.json')).scenario;
  const open=()=>new HeadlessCortex({standalonePath:'__shared_update__.html',url:'https://nexus.test/cortex.html?session=shared-test&multiplayer=1',initialScenario:scenario,model:makeModel()}).open();
  app=await open();
  const turns=Array.from({length:100},(_,i)=>({id:'beat-'+i,status:'COMMITTED',input:'행동 '+i,text:'기록된 본문 '+i+' '+('조용한 장면이었다. '.repeat(80))}));
  turns[95].imageAssetKey='saved-scene';turns[95].imageStatus='GENERATED';
  app.api.applyImportedState({scenario,turns},{persistState:false});
  const base=JSON.parse(JSON.stringify(app.api._export()));base.media={generated:[{key:'saved-scene',turnId:'beat-95',dataUrl:'data:image/png;base64,c3ludGhldGlj'}],packageAssets:[]};
  const events=[];app.win.parent.postMessage=data=>events.push(data);
  const emit=data=>app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:app.win.location.origin,source:app.win.parent,data:{channel:'NEXUS_CORTEX_HOST_V1',...data}}));
  const wait=async(type)=>{for(let n=0;n<150&&!events.some(e=>e.type===type);n++)await app.settle(30);assert.ok(events.some(e=>e.type===type),JSON.stringify(events)+' '+app.logs.join('\n'));};
  emit({type:'CLOUD_RESTORE',snapshot:structuredClone(base),sharedRevision:100,snapshotVersion:'base-hash'});await wait('CLOUD_RESTORE_COMPLETE');await app.settle(100);
  const article=app.win.document.querySelector('article[data-turn-index="95"]'),image=article.querySelector('img');assert.ok(image,'initial cached scene is mounted');
  const next=structuredClone(base);delete next.media;
  next.turns.push({id:'beat-100',status:'COMMITTED',input:'다음 입력',text:'다음 비트의 확정된 본문입니다.'});
  next.turns[98].text+=' 뒤늦게 복구된 대사입니다.';next.turns[98].imageAssetKey='saved-scene';next.turns[98].imageStatus='GENERATED';
  next.canonicalSession.story.summary='새로운 장면과 과거 기억을 함께 보존한다.';
  const {media,...wire}=base,operations=exports.sharedOperations(wire,next);assert.ok(operations);
  const live=app.win.NexusMultiplayerLive;assert.ok(live);
  live.apply({id:'beat-100',seq:1,input:'다음 입력',blocks:[{kind:'text',text:'다음 비트의',start:0,end:6}]});
  assert.equal(app.turns.length,100,'live view never enters durable engine turns');
  assert.equal(app.win.document.querySelectorAll('.nexus-live-turn').length,1);
  live.apply({id:'beat-100',seq:2,input:'다음 입력',blocks:[{kind:'text',text:'다음 비트의 확정된 본문입니다.',start:0,end:20}]});
  live.apply({id:'beat-100',seq:1,input:'오래된 전달',blocks:[]});
  await app.settle(1700); // The receiver now paints a buffered frame instead of replacing it instantly.
  assert.match(app.win.document.querySelector('.nexus-live-turn').textContent,/확정된/);
  const packet={schema:'CORTEX_SHARED_UPDATE_V1',baseRevision:100,baseVersion:'base-hash',revision:101,operations};
  events.length=0;emit({type:'SHARED_UPDATE',update:packet,snapshotVersion:'next-hash'});await wait('SHARED_UPDATE_COMPLETE');await app.settle(100);
  assert.equal(app.turns.length,101);assert.equal(app.win.document.querySelector('article[data-turn-index="95"]'),article);assert.equal(article.querySelector('img'),image);
  assert.match(app.win.document.querySelector('article[data-turn-index="98"]').textContent,/뒤늦게/);assert.ok(app.win.document.querySelector('article[data-turn-index="98"] img'),'late cached image is rendered at its original beat');
  assert.equal(app.win.document.querySelectorAll('article[data-turn-index="100"]').length,1);
  assert.equal(app.win.document.querySelectorAll('.nexus-live-turn').length,0,'durable replacement clears the ephemeral view without duplicate beats');
  const savedAt=app.api._storageStatus().savedAt;assert.ok(savedAt);
  events.length=0;emit({type:'SHARED_UPDATE',update:packet,snapshotVersion:'next-hash'});await wait('SHARED_UPDATE_COMPLETE');assert.equal(app.api._storageStatus().savedAt,savedAt,'duplicate delivery does not save/apply twice');
  events.length=0;emit({type:'SHARED_UPDATE',update:{...packet,baseVersion:'wrong',revision:102},snapshotVersion:'bad'});await wait('SHARED_UPDATE_FAILED');assert.equal(app.turns.length,101);
  control=await open();await control.api._importFull({...structuredClone(next),media:base.media});await control.settle(150);
  const publicTurns=a=>JSON.parse(JSON.stringify(a.api._export().turns)).map(({id,text,input,status,imageAssetKey})=>({id,text,input,status,imageAssetKey}));
  assert.deepEqual(publicTurns(app),publicTurns(control));
  assert.deepEqual(JSON.parse(JSON.stringify(app.scenario.world)),JSON.parse(JSON.stringify(control.scenario.world)));
  assert.deepEqual(JSON.parse(JSON.stringify(app.api._export().canonicalSession.story)),JSON.parse(JSON.stringify(control.api._export().canonicalSession.story)));
  const comparable=a=>JSON.parse(JSON.stringify(a.api._export(),(key,value)=>['exportedAt','storageDiagnostics','mediaGeneration'].includes(key)?undefined:value));
  assert.deepEqual(comparable(app),comparable(control),'full engine state including memory, HUD, undo and recovery must match full restore');
  const before=publicTurns(app),failed=structuredClone(next);failed.turns.push({id:'beat-101',status:'COMMITTED',text:'저장 실패로 활성화되면 안 되는 비트'});
  const nativeOpen=app.indexedDB.open;app.indexedDB.open=()=>{throw Error('synthetic storage failure')};
  try{await assert.rejects(app.api._applySharedUpdate(failed,[101]),/PERSIST/);assert.deepEqual(publicTurns(app),before);}finally{app.indexedDB.open=nativeOpen}
 }finally{app?.close();control?.close();fs.readFileSync=original}
});
