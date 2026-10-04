import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { rememberApiKeyOnDevice, restoreRememberedApiKey, forgetRememberedApiKey } from '../lib/api-key-vault';
import { loadDeviceKeys, storeDeviceKeys, changedDeviceKeys } from '../vendor/visual-novel/nexus-key-vault.mjs';
import * as originalVault from '../vendor/visual-novel/public/vn-key-vault.mjs';

function browser() {
  delete (globalThis as any).NexusVNLegacyKeyVault;
  const values = new Map<string,string>(), indexedDB = new IDBFactory();
  const localStorage = { getItem: (k:string) => values.get(k) ?? null, setItem: (k:string,v:string) => {values.set(k,v)}, removeItem: (k:string) => {values.delete(k)} };
  const w = { indexedDB, localStorage, crypto: webcrypto, btoa, atob, navigator: {storage:{persist:async()=>false}} };
  Object.defineProperty(globalThis,'window',{value:w,configurable:true});
  Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,configurable:true});
  Object.defineProperty(globalThis,'localStorage',{value:localStorage,configurable:true});
  return {w,values,indexedDB};
}
function request<T=any>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function secretRecord(name:string, value?:unknown) {
  const db=await request(indexedDB.open('dancheong-ln-key-vault-v1',1));
  try {const store=db.transaction('secrets',value?'readwrite':'readonly').objectStore('secrets');return await request(value?store.put(value,name):store.get(name));} finally{db.close()}
}

test('concurrent first saves share one wrapping key; both providers survive a reload and explicit single-provider removal',async()=>{
  const {w,values}=browser();
  // Force both first-time writers past their empty read before generating keys.
  let arrivals=0, release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve});
  w.crypto={getRandomValues:webcrypto.getRandomValues.bind(webcrypto),subtle:new Proxy(webcrypto.subtle,{get(target,property){
    if(property==='generateKey')return async(...args:any[])=>{if(++arrivals===2)release();await gate;return target.generateKey(...args)};
    const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
  }})} as any;
  await Promise.all([rememberApiKeyOnDevice('fixture-openai','openai'),rememberApiKeyOnDevice('fixture-go','opencode-go')]);
  w.crypto=webcrypto;
  assert.equal(await restoreRememberedApiKey('openai'),'fixture-openai');
  assert.equal(await restoreRememberedApiKey('opencode-go-luna'),'fixture-go');
  assert.ok([...values.values()].every(v=>!v.includes('fixture-')),'only ciphertext may be stored');
  await forgetRememberedApiKey('openai');
  assert.equal(await restoreRememberedApiKey('openai'),null);
  assert.equal(await restoreRememberedApiKey('opencode-go'),'fixture-go');
  await rememberApiKeyOnDevice('fixture-new-openai','openai');
  assert.equal(await restoreRememberedApiKey('opencode-go'),'fixture-go');
});

test('temporary IndexedDB failure does not destroy the encrypted main key',async()=>{
  const {w,values,indexedDB}=browser();
  await rememberApiKeyOnDevice('fixture-preserved','openai');
  const before=[...values.entries()];
  w.indexedDB={open(){throw Error('temporarily unavailable')}} as any;
  assert.equal(await restoreRememberedApiKey('openai'),null);
  assert.deepEqual([...values.entries()],before);
  w.indexedDB=indexedDB;
  assert.equal(await restoreRememberedApiKey('openai'),'fixture-preserved');
});

test('existing VN vault format survives the update for every provider',async()=>{
  browser();
  const keys={openai:'fixture-o',go:'fixture-g',gemini:'fixture-image',typecast:'fixture-voice'};
  await originalVault.storeDeviceKeys(keys);
  assert.deepEqual(await loadDeviceKeys(),keys);
  await storeDeviceKeys({gemini:'fixture-image-2'});
  assert.deepEqual(await originalVault.loadDeviceKeys(),{...keys,gemini:'fixture-image-2'});
});

test('concurrent VN first saves retain all four providers',async()=>{
  browser();
  const keys={openai:'fixture-o',go:'fixture-g',gemini:'fixture-image',typecast:'fixture-voice'};
  await Promise.all(Object.entries(keys).map(([name,value])=>storeDeviceKeys({[name]:value})));
  assert.deepEqual(await loadDeviceKeys(),keys);
});

test('one unreadable VN provider never prevents other keys loading or removes its encrypted record',async()=>{
  browser();
  await storeDeviceKeys({openai:'fixture-o',gemini:'fixture-image',typecast:'fixture-voice'});
  const invalid={iv:new Uint8Array(12),ciphertext:new Uint8Array([1,2,3]).buffer};
  await secretRecord('gemini',invalid);
  let errors=0;
  assert.deepEqual(await loadDeviceKeys({onError:()=>errors++}),{openai:'fixture-o',go:'',gemini:'',typecast:'fixture-voice'});
  assert.equal(errors,1);
  assert.deepEqual(await secretRecord('gemini'),invalid);
  await storeDeviceKeys(changedDeviceKeys({openai:'fixture-o',go:'',gemini:'',typecast:'fixture-updated'},{openai:'fixture-o',go:'',gemini:'',typecast:'fixture-voice'}));
  assert.deepEqual(await secretRecord('gemini'),invalid,'saving another setting must not blank the unreadable record');
});

test('stale settings from another VN tab update only keys the user actually edited',async()=>{
  browser();
  const opened={openai:'',go:'',gemini:'',typecast:''};
  await storeDeviceKeys({gemini:'fixture-from-other-tab'});
  await storeDeviceKeys(changedDeviceKeys({...opened,typecast:'fixture-voice'},opened));
  assert.equal((await loadDeviceKeys()).gemini,'fixture-from-other-tab');
  await storeDeviceKeys(changedDeviceKeys({gemini:''},{gemini:'fixture-from-other-tab'}));
  assert.equal((await loadDeviceKeys()).gemini,'','explicit field clearing still works');
});

test('reload restores immediately without a network probe; delayed provider restoration cannot replace a newer selection',async()=>{
  const page=readFileSync('app/page.tsx','utf8');
  const start=page.indexOf('const apiKeyOperationRef ='),end=page.indexOf('  const {\n    account,',start);
  assert.ok(start>=0 && end>start);
  const source=page.slice(start,end), listeners=new Map(), status:any={};
  let provider='openai',pending:(value:string)=>void;
  const context={useRef:()=>({current:0}),useEffect:(fn:()=>void)=>fn(),
    window:{addEventListener:(event:string,fn:any)=>listeners.set(event,fn)},
    deviceTextProvider:()=>provider, TEXT_PROVIDERS:{openai:{label:'O'},'opencode-go':{label:'G'}},
    restoreRememberedApiKey:(p:string)=>p==='openai'?new Promise(resolve=>{pending=resolve}):Promise.resolve('fixture-go'),
    setApiKey:(v:any)=>status.key=v,setApiKeyDraft:(v:any)=>status.draft=v,setApiStatus:(v:any)=>status.state=v,setApiMessage:()=>{},
    fetch:()=>assert.fail('refresh must not probe the provider'),testApiConnection:()=>assert.fail('refresh must not probe the provider')};
  vm.runInNewContext(source,context);
  provider='opencode-go';await listeners.get('dancheong-provider-change')();
  pending!('fixture-old-openai');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(status,{key:'fixture-go',draft:'fixture-go',state:'connected'});
  assert.doesNotMatch(page,/저장된 API 키 연결에 실패해 이 기기에서 삭제/);
});

test('a failed explicit connection test keeps the new credential durably saved',async()=>{
  browser();
  const page=readFileSync('app/page.tsx','utf8');
  const start=page.indexOf('  const handleConnectApi ='),end=page.indexOf('  const handleRememberApiKeyChange =',start);
  const status:any={};
  const ctx=vm.createContext({apiKeyDraft:'fixture-connect-offline',apiStatus:'disconnected',rememberApiKey:true,
    apiKeyOperationRef:{current:0},deviceTextProvider:()=> 'openai',TEXT_PROVIDERS:{openai:{label:'O'}},
    rememberApiKeyOnDevice,forgetRememberedApiKey,
    testApiConnection:async()=>{throw Error('일시 연결 오류')},
    setApiStatus:(v:any)=>status.state=v,setApiMessage:(v:any)=>status.message=v,setApiKey:()=>{},setRememberApiKey:()=>{},setNotice:()=>{},setError:()=>{}});
  await vm.runInContext(page.slice(start,end)+'\nhandleConnectApi();',ctx);
  assert.equal(status.state,'error');
  assert.match(status.message,/암호화하여 기억/);
  assert.equal(await restoreRememberedApiKey('openai'),'fixture-connect-offline');
});

test('embedded common settings cannot overwrite the separately saved VN key',()=>{
  const source=readFileSync('vendor/visual-novel/nexus-entry.mjs','utf8');
  const a=source.indexOf('function embeddedMediaKey'),b=source.indexOf('function embeddedAnchor');
  const state={keys:{openai:'fixture-vn'}},host={settings:{imageApiKey:'fixture-common'}};
  const ctx=vm.createContext({state,host,$:()=>({}),applyProvider:()=>{}});
  vm.runInContext(source.slice(a,b),ctx);
  vm.runInContext('embeddedSettings()',ctx);
  assert.equal(vm.runInContext("embeddedMediaKey('openai')",ctx),'fixture-vn');
  state.keys.openai='';
  assert.equal(vm.runInContext("embeddedMediaKey('openai')",ctx),'fixture-common');
  host.settings.imageApiKey='';
  assert.equal(vm.runInContext("embeddedMediaKey('openai')",ctx),'');
});

test('old multiplayer keys recover only absent canonical records and never replace current or explicitly cleared credentials',async()=>{
 const {indexedDB}=browser();
 await storeDeviceKeys({openai:'fixture-current',gemini:''});
 const legacyFactory=new IDBFactory();
 Object.defineProperty(globalThis,'indexedDB',{value:legacyFactory,configurable:true});
 await storeDeviceKeys({openai:'fixture-old',go:'fixture-recover',gemini:'fixture-deleted',typecast:'fixture-voice'});
 Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,configurable:true});
 (globalThis as any).NexusVNLegacyKeyVault=()=>legacyFactory.open('dancheong-ln-key-vault-v1',1);
 try{assert.deepEqual(await loadDeviceKeys(),{openai:'fixture-current',go:'fixture-recover',gemini:'',typecast:'fixture-voice'});}
 finally{delete (globalThis as any).NexusVNLegacyKeyVault;}
 await storeDeviceKeys({go:'fixture-stale',gemini:'fixture-stale'},{onlyMissing:true});
 assert.equal((await loadDeviceKeys()).go,'fixture-recover');assert.equal((await loadDeviceKeys()).gemini,'');
});
