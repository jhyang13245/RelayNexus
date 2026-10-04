import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {setCortexAccountOwner,accountStorageKey} from '../lib/cortex-account-scope';
import {CortexPlayer} from '../app/cortex-player';

async function withReader(fetcher:any,run:any){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://dancheong.test/'}),prior=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,localStorage:dom.window.localStorage,CustomEvent:dom.window.CustomEvent,React})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value});}
 const nativeFetch=globalThis.fetch;globalThis.fetch=fetcher;
 dom.window.localStorage.setItem(accountStorageKey('nexus-cloud-base:resume','account:test')!,JSON.stringify({revision:1,savedAt:'old',contentKey:'known'}));
 setCortexAccountOwner('account:test');
 const root=createRoot(dom.window.document.getElementById('root')!),settle=()=>new Promise(r=>setTimeout(r,90));
 try{
  root.render(React.createElement(CortexPlayer,{accountOwnerKey:'account:test',sessionId:'resume',projectId:'work',sessionName:'story',apiKey:'',theme:'light',readingWidth:'normal',fontSize:'small',typingSpeed:'natural',imageQuality:'low',imageEvery:0,file:null,onFileConsumed:()=>{},onHome:()=>{},onSettings:()=>{}}));await settle();
  const frame=dom.window.document.querySelector('iframe')!,sent:any[]=[];assert.ok(frame);frame.contentWindow!.postMessage=(data:any)=>sent.push(data);
  const emit=(type:string,data:object={})=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{origin:dom.window.location.origin,source:frame.contentWindow,data:{channel:'NEXUS_CORTEX_HOST_V1',type,...data}}));
  await run({dom,sent,emit,settle});
 }finally{root.unmount();await settle();globalThis.fetch=nativeFetch;dom.window.close();for(const [k,v]of prior){if(v)Object.defineProperty(globalThis,k,v);else delete (globalThis as any)[k]}}
}
const snapshot={schema:'CORTEX_APP_STATE_V1390',turns:[{id:'remote',text:'remote continuation'}]},session={id:'resume',revision:2,turn:2};

test('content identity follows PC continuation on re-entry and ignores obsolete exports after restore',async()=>{
 let puts=0;
 await withReader(async(input:any,init:any)=>{if(String(input).endsWith('/lease'))return Response.json({lease:{ttlMs:90000,epoch:'epoch'}});if(init?.method==='PUT')puts++;return Response.json({session,snapshot});},async({emit,settle,sent}:any)=>{
  emit('READY',{local:{restored:true,turn:1,savedAt:'new-export-time',contentKey:'known'}});await settle();await settle();
  const restore=sent.find((x:any)=>x.type==='CLOUD_RESTORE');assert.ok(restore);assert.equal(puts,0);
  emit('CLOUD_RESTORE_COMPLETE',{turn:2,savedAt:'restored',contentKey:'remote-key',syncEpoch:restore.syncEpoch});await settle();
  emit('CLOUD_SNAPSHOT',{snapshot:{turns:[{id:'old'}]},turn:1,syncEpoch:restore.syncEpoch-1});await settle();assert.equal(puts,0);
 });
});
test('visible idle resume follows cloud without claiming a writer lease or forking',async()=>{
 let renewal!:()=>void,checks=0,puts=0,newRevision=false;
 const gate=new Promise<void>(r=>renewal=r);
 await withReader(async(input:any,init:any)=>{
  const body=init?.body?JSON.parse(String(init.body)):{};
  if(String(input).endsWith('/lease')){checks++;if(body.action==='renew'){await gate;return Response.json({code:'CORTEX_LEASE_EXPIRED'},{status:409})}return Response.json({lease:{ttlMs:90000,epoch:'epoch-'+checks}});}
  if(init?.method==='PUT'){puts++;return Response.json({session});}
  return Response.json({session:newRevision?session:{...session,revision:1},snapshot});
 },async({dom,emit,settle,sent}:any)=>{
  emit('READY',{local:{restored:true,turn:1,savedAt:'old',contentKey:'known'}});await settle();
  newRevision=true;Object.defineProperty(dom.window.document,'visibilityState',{configurable:true,value:'visible'});dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
  await settle();await settle();assert.equal(checks,0);assert.equal(puts,0);assert.ok(sent.some((x:any)=>x.type==='CLOUD_RESTORE'));
  assert.doesNotMatch(dom.window.document.body.textContent||'',/이어 할 기록을 선택/);
 });
});
test('divergent records display a choice and preserve before following cloud only on click',async()=>{
 let preserves=0;
 await withReader(async(input:any,init:any)=>{
  const url=String(input);
  if(url.endsWith('/lease'))return Response.json({lease:{ttlMs:90000,epoch:'epoch'}});
  if(url.endsWith('/preserve')){preserves++;return Response.json({session:{id:'recovery-choice',name:'saved local',turn:1,revision:1}});}
  if(init?.method==='PUT')return Response.json({code:'CORTEX_SYNC_CONFLICT'},{status:409});
  return Response.json({session,snapshot});
 },async({dom,emit,settle,sent}:any)=>{
  emit('READY',{local:{restored:true,turn:1,savedAt:'unsent',contentKey:'local'}});await settle();
  emit('CLOUD_SNAPSHOT',{snapshot:{turns:[{id:'local'}]},turn:1,savedAt:'unsent',contentKey:'local',syncEpoch:0});await settle();await settle();
  assert.equal(preserves,0);assert.match(dom.window.document.body.textContent||'',/이어 할 기록을 선택/);assert.ok(!sent.some((x:any)=>x.type==='CLOUD_RESTORE'));
  [...dom.window.document.querySelectorAll('button')].find((b:any)=>b.textContent==='이 기기 기록 보존 후 클라우드로 이어서')!.click();await settle();
  emit('CLOUD_SNAPSHOT',{snapshot:{turns:[{id:'local'}]},turn:1,contentKey:'local',syncEpoch:0});await settle();await settle();
  assert.equal(preserves,1);assert.ok(sent.some((x:any)=>x.type==='CLOUD_RESTORE'));
 });
});
