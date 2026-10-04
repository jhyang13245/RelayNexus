import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {setCortexAccountOwner,cortexAccountOwner,accountStorageKey,accountSessionPrefix,accountFetch} from '../lib/cortex-account-scope';
import {CORTEX_CATALOG,readCortexCatalog,saveCortexSession,syncCortexCloudCatalog,rememberCortexProjectPackage,readCortexProjectPackage} from '../app/hooks/use-runtime-engine';

test('same-browser accounts have separate catalogs, packages and reader bytes; unknown legacy is never adopted',async(t)=>{
 const dom=new JSDOM('',{url:'https://account.test'}),keys=['window','localStorage','sessionStorage','CustomEvent'] as const;
 const previous=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,value:dom.window[k]});
 Object.defineProperty(dom.window,'indexedDB',{value:new IDBFactory()});
 let serverOwner='account:a',serverRows:any[]=[];let hold:Promise<void>|null=null;let release=()=>{};
 t.mock.method(globalThis,'fetch',async()=>{const ownerKey=serverOwner,sessions=serverRows;if(hold)await hold;return Response.json({ownerKey,sessions})});
 try{
  const legacy=[{id:'private-legacy',projectId:'cortex-import-shared-title',name:'unassigned'}];
  localStorage.setItem(CORTEX_CATALOG,JSON.stringify(legacy));
  assert.deepEqual(readCortexCatalog(),[]);assert.equal(await readCortexProjectPackage('same'),null);
  await syncCortexCloudCatalog();assert.equal(cortexAccountOwner(),'account:a');assert.deepEqual(readCortexCatalog(),[]);
  saveCortexSession({id:'private-a',projectId:'cortex-import-shared-title',name:'A only'});
  await rememberCortexProjectPackage('same',new File(['A package'],'a.zip'));
  localStorage.setItem(accountSessionPrefix('same')+'state','A prose');
  serverOwner='account:b';await syncCortexCloudCatalog();
  assert.deepEqual(readCortexCatalog(),[]);assert.equal(await readCortexProjectPackage('same'),null);
  assert.equal(localStorage.getItem(accountSessionPrefix('same')+'state'),null);
  saveCortexSession({id:'late-a',projectId:'p',name:'stale A callback'},'account:a');assert.deepEqual(readCortexCatalog(),[]);
  saveCortexSession({id:'private-b',projectId:'p',name:'B only'});
  await rememberCortexProjectPackage('same',new File(['B package'],'b.zip'));
  serverOwner='account:a';await syncCortexCloudCatalog();assert.deepEqual(readCortexCatalog().map(r=>r.id),['private-a']);
  assert.equal(await (await readCortexProjectPackage('same'))!.text(),'A package');
  hold=new Promise(r=>release=r);const stale=syncCortexCloudCatalog();setCortexAccountOwner('account:b');release();await stale;hold=null;
  assert.equal(cortexAccountOwner(),'account:b');assert.deepEqual(readCortexCatalog().map(r=>r.id),['private-b']);
  assert.equal(localStorage.getItem(CORTEX_CATALOG),JSON.stringify(legacy),'unassigned original retained for recovery');
  localStorage.setItem('nexus-cortex:private-legacy:state','unsynced latest A prose');
  serverOwner='account:a';serverRows=legacy;await syncCortexCloudCatalog();
  assert.equal(localStorage.getItem(accountSessionPrefix('private-legacy')+'state'),'unsynced latest A prose','server-confirmed owner retains the newer local save without copying databases');
  serverOwner='account:b';serverRows=[];await syncCortexCloudCatalog();
  assert.equal(localStorage.getItem(accountSessionPrefix('private-legacy')+'state'),null,'other account cannot reuse the confirmed legacy slot');
  setCortexAccountOwner('');assert.deepEqual(readCortexCatalog(),[]);assert.equal(accountStorageKey('x'),null);
 }finally{release();dom.window.close();keys.forEach((k,i)=>{if(previous[i])Object.defineProperty(globalThis,k,previous[i]!);else delete (globalThis as any)[k]})}
});

test('stale signed-in tabs send a fence; server derives ownership from authentication and rejects a changed account',async(t)=>{
 let sent='';t.mock.method(globalThis,'fetch',async(_url,init)=>{sent=new Headers(init?.headers).get('X-Cortex-Account')||'';return Response.json({})});
 await assert.rejects(accountFetch('','/api/cortex/sessions/x'));await accountFetch('account:a','/api/cortex/sessions/x',{method:'PUT'});assert.equal(sent,'account:a');
 const source=fs.readFileSync('lib/simulation-store.ts','utf8'),start=source.indexOf('export async function requireOwnerKey('),end=source.indexOf('export async function ensureSimulationSchema',start),exports:any={};
 vm.runInNewContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({requireAccountContext:async()=>({ownerKey:'account:b'})})});
 await assert.rejects(exports.requireOwnerKey(new Request('https://test',{headers:{'X-Cortex-Account':'account:a'}})),/계정이 변경/);
 assert.equal(await exports.requireOwnerKey(new Request('https://test',{headers:{'X-Cortex-Account':'account:b'}})),'account:b');
 assert.equal(await exports.requireOwnerKey(new Request('https://test')),'account:b','legacy client cannot select another owner via omission');
});
