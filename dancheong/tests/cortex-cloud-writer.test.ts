import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

function host(enabled=true){
 const dom=new JSDOM('<textarea id="input">작성 중인 입력\n둘째 줄</textarea><button id="send">완료</button>',{url:`https://test/cortex.html?cloudAuthority=${enabled?1:0}`,runScripts:'outside-only'});
 const w=dom.window,events:any[]=[],calls:string[]=[];
 w.postMessage=(message:any)=>events.push(message);
 (w as any).fixtureApi={runTurnV1111:async()=>{calls.push('run')},_continue:async()=>{calls.push('continue')}};
 const source=fs.readFileSync('public/cortex-host.js','utf8');
 const code=source.slice(source.indexOf(' const cloudAuthority='),source.indexOf(' // Nexus에서는 사용자 키'));
 w.eval(`const channel='NEXUS_CORTEX_HOST_V1',emit=(type,extra={})=>parent.postMessage({channel,type,...extra},location.origin);let api=window.fixtureApi,durableTimer=0,durablePending=false;const busy=()=>false;${code};mountCloudWrites();`);
 const result=(allowed:boolean,id=events.at(-1)?.requestId)=>w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data:{channel:'NEXUS_CORTEX_HOST_V1',type:'CLOUD_WRITE_RESULT',requestId:id,allowed}}));
 const tick=()=>new Promise(r=>setTimeout(r,0));
 return {dom,w,events,calls,result,tick};
}

test('host waits for server permission, coalesces duplicate sends and reports completion',async()=>{
 const h=host();try{
  h.w.document.getElementById('send')!.click();h.w.document.getElementById('send')!.click();
  assert.deepEqual(h.calls,[]);assert.equal(h.events.length,1);
  h.result(true,'unrelated');await h.tick();assert.deepEqual(h.calls,[]);
  h.result(true);await h.tick();assert.deepEqual(h.calls,['run']);assert.equal(h.events.at(-1).type,'CLOUD_WRITE_FINISHED');
 }finally{h.dom.window.close()}
});
test('denied permission preserves multiline input and Enter also uses the gate',async()=>{
 const h=host();try{
  h.w.document.getElementById('input')!.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  assert.equal(h.events.at(-1).type,'CLOUD_WRITE_REQUEST');h.result(false);await h.tick();assert.deepEqual(h.calls,[]);
  assert.equal((h.w.document.getElementById('input') as HTMLTextAreaElement).value,'작성 중인 입력\n둘째 줄');
 }finally{h.dom.window.close()}
});
test('multiplayer and standalone adapter calls are not changed by the single-player gate',async()=>{
 const h=host(false);try{await (h.w as any).fixtureApi.runTurnV1111();assert.deepEqual(h.calls,['run']);assert.deepEqual(h.events,[])}finally{h.dom.window.close()}
});
