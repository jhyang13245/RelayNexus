import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {cloudSaveLabel,multiplayerConnectionLabel} from '../lib/reader-reliability';

test('receipts distinguish known saved beats, pending updates, rewind and unknown storage',()=>{
 assert.equal(cloudSaveLabel('complete',20,20),'20비트까지 저장 완료');
 assert.equal(cloudSaveLabel('syncing',20,21),'21비트 저장 중…');
 assert.equal(cloudSaveLabel('retry',20,23),'21–23비트 미저장');
 assert.equal(cloudSaveLabel('retry',null,20),'클라우드 저장 확인 필요');
 assert.equal(cloudSaveLabel('retry',20,20),'20비트 변경사항 미저장');
 assert.equal(cloudSaveLabel('complete',0,0),'시작 장면 저장 완료');
 assert.equal(cloudSaveLabel('syncing',20,19),'19비트 변경사항 저장 중…');
});
test('connection loss is not confused with a connected catch-up application',()=>{
 assert.match(multiplayerConnectionLabel('offline',true),/오프라인/);
 assert.equal(multiplayerConnectionLabel('reconnecting',false),'연결 복구 중…');
 assert.equal(multiplayerConnectionLabel('connected',true,20),'최신 본문 불러오는 중…');
 assert.equal(multiplayerConnectionLabel('connected',false,20),'20비트까지 반영됨');
});
test('per-beat diagnostics use an allowlist, omit prose by default and redact credentials even with prose',()=>{
 const dom=new JSDOM('<button id="open">진단</button>',{url:'https://test/',runScripts:'outside-only'});try{
 const w=dom.window as any;w.eval(fs.readFileSync('public/cortex-nexus-view.js','utf8'));
 const key='secret-fixture-value',turn={status:'COMMITTED',text:'선택 본문 '+key+' sk-proj-fixturekey12345678',settings:{apiKey:key},input:'비공개 입력',txn:{private:'숨은 정체'},error:'API_IDLE_TIMEOUT raw private prose '+key,apiLog:[{model:'muse-spark-1.3-contributor',provider:'opencode-go',role:'PROSE_STREAM',totalMs:1234.56,firstDeltaMs:140,status:'API_IDLE_TIMEOUT',prompt:'private',headers:{Authorization:'Bearer '+key},raw:'private'}],imageReferenceCharacters:[{name:'공개 인물',url:'data:image/private'}]};
 const report=w.NexusBeatDiagnostics(turn,19,{secrets:[key]});
 assert.equal(report.beat,20);assert.equal(report.requests[0].totalMs,1234.56);assert.deepEqual(Array.from(report.errors),['API_IDLE_TIMEOUT']);assert.equal('prose' in report,false);
 assert.doesNotMatch(JSON.stringify(report),/private|apiKey|Authorization|숨은|비공개|secret-fixture|선택 본문|data:image/);
 const included=w.NexusBeatDiagnostics(turn,19,{includeProse:true,secrets:[key]});assert.match(included.prose,/선택 본문/);assert.doesNotMatch(included.prose,/secret-fixture|sk-proj/);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 const api={_settings:()=>({apiKey:key})};w.openNexusBeatDiagnostics(api,turn,19,w.document.getElementById('open'));
 assert.equal(w.document.querySelector('input').checked,false);w.document.querySelector('input').checked=true;
 w.openNexusBeatDiagnostics(api,turn,19,w.document.getElementById('open'));assert.equal(w.document.querySelectorAll('dialog').length,1);assert.equal(w.document.querySelector('input').checked,false);
 }finally{dom.window.close()}
});
