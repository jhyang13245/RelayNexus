import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {setCortexAccountOwner,accountStorageKey} from '../lib/cortex-account-scope';
import {CortexPlayer} from '../app/cortex-player';

async function reader(run:(h:any)=>Promise<void>){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://dancheong.test/',pretendToBeVisual:true}),prior=new Map();
 for(const [k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,localStorage:dom.window.localStorage,CustomEvent:dom.window.CustomEvent,React,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,value:v});}
 const nativeFetch=globalThis.fetch,requests:any[]=[],sent:any[]=[],intervals=new Map<number,()=>void>();let id=0;
 dom.window.setInterval=((fn:()=>void,ms:number)=>{intervals.set(ms,fn);return ++id}) as any;
 const snapshot={schema:'CORTEX_FULL_BACKUP_V1',scenario:{title:'synthetic'},turns:[{id:'1',text:'기존 이야기'}]},state:any={revision:1,leaseBlocked:false,offline:false,putFails:false,snapshot};
 globalThis.fetch=async(input,init)=>{const url=String(input),body=init?.body?JSON.parse(String(init.body)):undefined;requests.push({url,body});
  if(state.offline)throw TypeError('offline');
  if(url.endsWith('/lease'))return state.leaseBlocked&&body.action==='acquire'?Response.json({code:'CORTEX_SESSION_IN_USE',retryAfterMs:90000},{status:409}):Response.json({lease:{epoch:'write:test',ttlMs:90000}});
  if(url.includes('/preserve'))return Response.json({session:{id:'backup',revision:1}});
  if(init?.method==='PUT'){if(state.putFails)throw TypeError('offline');state.revision++;return Response.json({session:{id:'s',revision:state.revision,turn:2}});}
  return Response.json({session:{id:'s',revision:state.revision,turn:state.snapshot.turns.length},snapshot:state.snapshot});
 };
 setCortexAccountOwner('account:test');dom.window.localStorage.setItem(accountStorageKey('nexus-cloud-base:s','account:test')!,JSON.stringify({revision:1,savedAt:'saved',contentKey:'known'}));
 const root=createRoot(dom.window.document.getElementById('root')!);const flush=()=>act(async()=>{await new Promise(r=>setTimeout(r,25))});
 try{
  await act(async()=>root.render(React.createElement(CortexPlayer,{accountOwnerKey:'account:test',sessionId:'s',projectId:'work',sessionName:'test',apiKey:'',theme:'light',readingWidth:'normal',fontSize:'small',typingSpeed:'natural',imageQuality:'low',imageEvery:0,file:null,onFileConsumed:()=>{},onHome:()=>{},onSettings:()=>{}})));
  const frame=dom.window.document.querySelector('iframe')!;assert.ok(frame);frame.contentWindow!.postMessage=(m:any)=>sent.push(m);
  const emit=async(type:string,data:any={})=>{await act(async()=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{origin:dom.window.location.origin,source:frame.contentWindow,data:{channel:'NEXUS_CORTEX_HOST_V1',type,...data}})));await flush()};
  const ready=()=>emit('READY',{local:{restored:true,turn:1,savedAt:'saved',contentKey:'known'}});
  await run({dom,requests,sent,state,emit,ready,flush,intervals});
 }finally{await act(async()=>root.unmount());globalThis.fetch=nativeFetch;dom.window.close();for(const [k,d]of prior){if(d)Object.defineProperty(globalThis,k,d);else delete (globalThis as any)[k]}}
}

test('reader mounts before cloud lookup without lease; acknowledged cache avoids ZIP and full download',()=>reader(async({requests,sent,ready}:any)=>{
 assert.equal(requests.length,0);await ready();assert.equal(requests.length,1);assert.match(requests[0].url,/summary=1/);
 assert.ok(sent.some((m:any)=>m.type==='OFFER_PROJECT'));assert.ok(!sent.some((m:any)=>m.type==='OFFER_FILE'||m.type==='CLOUD_RESTORE'));
 const offers=sent.filter((m:any)=>m.type==='OFFER_PROJECT').length;await ready();assert.equal(sent.filter((m:any)=>m.type==='OFFER_PROJECT').length,offers);
 assert.equal(sent.filter((m:any)=>m.type==='LEASE_LOCK').at(-1).locked,false,'duplicate readiness must not lock a checked reader');
}));
test('input acquires on demand and keeps permission until server save acknowledgement',()=>reader(async({ready,emit,requests,sent}:any)=>{
 await ready();await emit('CLOUD_WRITE_REQUEST',{requestId:'one'});
 assert.equal(requests.filter((r:any)=>r.body?.action==='acquire').length,1);assert.equal(sent.find((m:any)=>m.type==='CLOUD_WRITE_RESULT').allowed,true);
 await emit('CLOUD_SNAPSHOT',{snapshot:{schema:'CORTEX_FULL_BACKUP_V1',turns:[]},contentKey:'new'});
 assert.ok(!requests.some((r:any)=>r.body?.snapshot));
 await emit('CLOUD_WRITE_FINISHED',{requestId:'one'});
 await emit('CLOUD_SNAPSHOT',{snapshot:{schema:'CORTEX_FULL_BACKUP_V1',turns:[{id:'2'}]},contentKey:'new'});
 assert.ok(requests.some((r:any)=>r.body?.snapshot));assert.equal(requests.at(-1).body.action,'release');assert.equal(requests.at(-1).body.handoff,true);
}));
test('peer writer blocks mutation rather than reading; explicit fork stays available',()=>reader(async({ready,state,emit,dom,sent}:any)=>{
 state.leaseBlocked=true;await ready();assert.ok(dom.window.document.querySelector('iframe'));assert.doesNotMatch(dom.window.document.body.textContent,/다른 기기에서 사용 중/);
 await emit('CLOUD_WRITE_REQUEST',{requestId:'blocked'});assert.equal(sent.find((m:any)=>m.type==='CLOUD_WRITE_RESULT').allowed,false);assert.match(dom.window.document.body.textContent,/별도 세션으로 계속/);
}));
test('newer server revision restores before input can run',()=>reader(async({ready,state,emit,sent}:any)=>{
 await ready();state.revision=2;state.snapshot.turns.push({id:'2',text:'다른 기기'});
 await emit('CLOUD_WRITE_REQUEST',{requestId:'stale'});assert.equal(sent.find((m:any)=>m.type==='CLOUD_WRITE_RESULT').allowed,false);
 assert.ok(sent.some((m:any)=>m.type==='CLOUD_RESTORE'&&m.snapshot.turns.length===2));
}));

test('explicit takeover reconciles the saved cloud record before unlocking the existing reader',()=>reader(async({ready,state,emit,dom,sent,flush}:any)=>{
 await ready();state.leaseBlocked=true;await emit('CLOUD_WRITE_REQUEST',{requestId:'blocked'});
 state.leaseBlocked=false;const button=Array.from(dom.window.document.querySelectorAll('button')).find((b:any)=>b.textContent==='다른 기기 종료 후 이어서') as HTMLButtonElement;assert.ok(button);
 await act(async()=>button.click());await flush();assert.ok(sent.some((m:any)=>m.type==='CLOUD_EXPORT'));
 await emit('CLOUD_SNAPSHOT',{snapshot:state.snapshot,contentKey:'known',savedAt:'saved'});
 assert.equal(sent.filter((m:any)=>m.type==='LEASE_LOCK').at(-1).locked,false);
}));

test('retry after a busy writer re-enables the checked reader without taking a reading lease',()=>reader(async({ready,state,emit,dom,sent,flush,requests}:any)=>{
 await ready();state.leaseBlocked=true;await emit('CLOUD_WRITE_REQUEST',{requestId:'blocked'});
 const count=requests.length;const button=Array.from(dom.window.document.querySelectorAll('button')).find((b:any)=>b.textContent==='다시 확인') as HTMLButtonElement;assert.ok(button);
 await act(async()=>button.click());await flush();assert.equal(sent.filter((m:any)=>m.type==='LEASE_LOCK').at(-1).locked,false);
 assert.equal(requests.length,count,'retrying the view is not a writer acquisition');
}));
test('offline preflight denies generation and preserves local data',()=>reader(async({ready,state,emit,sent}:any)=>{
 await ready();state.offline=true;await emit('CLOUD_WRITE_REQUEST',{requestId:'offline'});
 assert.equal(sent.find((m:any)=>m.type==='CLOUD_WRITE_RESULT').allowed,false);assert.ok(!sent.some((m:any)=>m.type==='CLOUD_RESTORE'));
}));
test('idle refresh follows cloud without a writer acquisition',()=>reader(async({ready,state,intervals,flush,sent,requests}:any)=>{
 await ready();state.revision=2;await act(async()=>intervals.get(8000)());await flush();
 assert.ok(sent.some((m:any)=>m.type==='CLOUD_RESTORE'));assert.ok(!requests.some((r:any)=>r.body?.action==='acquire'));
}));
