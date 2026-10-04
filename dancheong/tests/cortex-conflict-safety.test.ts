import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {applyCloudDelta,cloudDelta} from '../lib/cortex-cloud-delta';
import {sharedOperations} from '../lib/multiplayer-update';
import {vnSnapshotManifest} from '../lib/multiplayer-vn-manifest';
const root=process.cwd();
const source=file=>fs.readFileSync(root+'/'+file,'utf8');
function load(file,deps,globals={}){
 const exports={};vm.runInNewContext(ts.transpileModule(source(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>{assert.ok(id in deps,id);return deps[id]},crypto:webcrypto,TextEncoder,TextDecoder,Request,Response,URL,Error,console,owner:undefined,accountStorageKey:()=>null,...globals});return exports;
}
function routeHarness(){
 const sqlite=new DatabaseSync(':memory:'),objects=new Map(),queries=[];
 sqlite.exec(`CREATE TABLE cortex_cloud_sessions(id TEXT PRIMARY KEY,owner_key TEXT,project_id TEXT,source_project_id TEXT,name TEXT,snapshot_json TEXT,snapshot_r2_key TEXT,snapshot_sha256 TEXT,snapshot_byte_length INTEGER,turn INTEGER,location TEXT,preview TEXT,revision INTEGER,last_writer_id TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE cortex_session_leases(id TEXT PRIMARY KEY,owner_key TEXT,device_id TEXT,client_id TEXT,expires_at TEXT,updated_at TEXT,takeover_client_id TEXT DEFAULT '',takeover_requested_at TEXT DEFAULT '',epoch TEXT DEFAULT 'epoch-pc');INSERT INTO cortex_session_leases(id,owner_key,device_id,client_id,expires_at,epoch) VALUES('s','owner','pc','client-pc-123456','2999-01-01','epoch-pc');`);
 const db={prepare(sql){queries.push(sql);let values=[];return {bind(...v){values=v;return this},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}},async first(){return sqlite.prepare(sql).get(...values)}}}};
 db.batch=async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}};
 let getHook=async()=>{};
 const simulation={requireOwnerKey:async()=> 'owner',database:async()=>db,safeJsonText:JSON.stringify,ownerPathHash:async()=> 'owner',objectStorage:async()=>({put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k),get:async k=>{await getHook(k);const text=objects.get(k);return text===undefined?null:{arrayBuffer:async()=>new TextEncoder().encode(text).buffer}}})};
 const storage=load('lib/runtime-json-store.ts',{'./simulation-store':simulation});
 const snapshots=load('lib/multiplayer-snapshot.ts',{'./runtime-json-store':storage,'./multiplayer-update':{sharedOperations},'./multiplayer-vn-manifest':{vnSnapshotManifest}});
 const personal=load('lib/multiplayer-personal.ts',{'./simulation-store':simulation,'./runtime-json-store':storage,'./multiplayer-snapshot':snapshots});
 const row=()=>sqlite.prepare('SELECT * FROM cortex_cloud_sessions WHERE id=? AND owner_key=?').get('s','owner');
 const route=load('app/api/cortex/sessions/[sessionId]/route.ts',{'next/server':{NextResponse:Response},'../../../../../lib/cortex-cloud-delta':{applyCloudDelta},'../../../../../lib/multiplayer-snapshot':snapshots,'../../../../../lib/multiplayer-personal':personal,'../../../../../lib/simulation-store':simulation,'../../../../../lib/runtime-json-store':storage,'../../../../../lib/cortex-cloud-store':{getCortexCloudSession:async(owner,id)=>sqlite.prepare('SELECT * FROM cortex_cloud_sessions WHERE id=? AND owner_key=?').get(id,owner),cortexCloudSummary:r=>({id:r.id,revision:r.revision,turn:r.turn,updatedAt:r.updated_at})}});
 const context={params:Promise.resolve({sessionId:'s'})};
 const put=(revision,label,deviceId='pc')=>route.PUT(new Request('https://test/api/cortex/sessions/s',{method:'PUT',body:JSON.stringify({expectedRevision:revision,deviceId,leaseEpoch:'epoch-pc',projectId:'p',snapshot:{schema:'CORTEX_APP_STATE_V1390',scenario:{title:'synthetic',world:{}},turns:[{id:label,status:'COMMITTED',text:label}]}})}),context);
 const preserve=load('app/api/cortex/sessions/[sessionId]/preserve/route.ts',{'next/server':{NextResponse:Response},'../../../../../../lib/simulation-store':simulation,'../../../../../../lib/runtime-json-store':storage,'../../../../../../lib/cortex-cloud-store':{getCortexCloudSession:async(owner,id)=>sqlite.prepare('SELECT * FROM cortex_cloud_sessions WHERE id=? AND owner_key=?').get(id,owner),cortexCloudSummary:r=>({...r})}});
 const lease=load('app/api/cortex/sessions/[sessionId]/lease/route.ts',{'next/server':{NextResponse:Response},'../../../../../../lib/simulation-store':simulation,'../../../../../../lib/cortex-cloud-store':load('lib/cortex-cloud-store.ts',{'./simulation-store':simulation})});
 return {sqlite,db,objects,queries,row,put,rawPut:body=>route.PUT(new Request('https://test/api/cortex/sessions/s',{method:'PUT',body:JSON.stringify(body)}),context),preserve:body=>preserve.POST(new Request('https://test/preserve',{method:'POST',body:JSON.stringify(body)}),context),lease:body=>lease.POST(new Request('https://test/lease',{method:'POST',body:JSON.stringify(body)}),context),get:()=>route.GET(new Request('https://test/api/cortex/sessions/s'),context),hook:f=>{getHook=f}};
}

test('cloud delta reconstructs append, rewind, HUD and deletion without modifying the base',()=>{
 const before={schema:'CORTEX_FULL_BACKUP_V1',turns:[{id:1,text:'승인된 본문'},{id:2,text:'과거'}],hud:{hp:10,old:1},media:[{url:'data:image/test;base64,unchanged'}]};
 const original=JSON.stringify(before);
 for(const after of [{...before,turns:[...before.turns,{id:3,text:'새 본문'}],hud:{hp:9}}, {...before,turns:before.turns.slice(0,1)}]){
  const operations=cloudDelta(before,after);assert.ok(operations);assert.deepEqual(applyCloudDelta(before,operations),after);assert.ok(!operations.some(op=>op.path[0]==='media'));
 }
 assert.equal(JSON.stringify(before),original);
 for(const operations of [[{path:['__proto__','polluted'],kind:'set',value:1}],[{path:['turns',-1],kind:'set',value:1}],[{path:['turns'],kind:'length',value:99}],[{path:[],kind:'set',value:{}}]])assert.throws(()=>applyCloudDelta(before,operations as any));
});

test('cloud delta reuses stored images, rejects stale bases and leaves empty saves unchanged',async()=>{
 const h=routeHarness();try{
  const snapshot={schema:'CORTEX_FULL_BACKUP_V1',turns:[{id:1,text:'처음'}],media:[{url:'data:image/test;base64,fixture'}]};
  const envelope={deviceId:'pc',leaseEpoch:'epoch-pc',projectId:'p'};
  assert.equal((await h.rawPut({...envelope,expectedRevision:0,snapshot})).status,200);
  const oldMedia=JSON.parse(h.objects.get(h.row().snapshot_r2_key))._multiplayerMedia;
  const after={...snapshot,turns:[...snapshot.turns,{id:2,text:'다음'}]};
  const operations=cloudDelta(snapshot,after);assert.ok(operations);
  assert.equal((await h.rawPut({...envelope,expectedRevision:1,operations})).status,200);
  assert.equal(JSON.parse(h.objects.get(h.row().snapshot_r2_key))._multiplayerMedia.key,oldMedia.key);
  assert.deepEqual((await (await h.get()).json()).snapshot,after);assert.equal(h.objects.size,2);
  assert.equal((await h.rawPut({...envelope,expectedRevision:1,operations})).status,409);
  assert.equal((await h.rawPut({...envelope,expectedRevision:2,operations:[]})).status,200);assert.equal(h.row().revision,2);
  assert.equal((await h.rawPut({...envelope,expectedRevision:2,operations:[{path:['__proto__'],kind:'set',value:{}}]})).status,400);assert.equal(h.row().revision,2);
 }finally{h.sqlite.close()}
});

test('exclusive writer upgrades a legacy lease and serializes same-device tabs without admitting a stale epoch',async()=>{
 const h=routeHarness();try{
  const first=await (await h.lease({action:'acquire',exclusive:true,deviceId:'pc',clientId:'client-pc-123456'})).json();assert.match(first.lease.epoch,/^write:/);assert.notEqual(first.lease.epoch,'epoch-pc');
  assert.equal((await h.put(0,'legacy-stale')).status,409);
  const blocked=await h.lease({action:'acquire',exclusive:true,deviceId:'pc',clientId:'other-tab-123456'});assert.equal(blocked.status,409);assert.equal((await blocked.json()).code,'CORTEX_WRITER_BUSY');
  assert.equal((await h.lease({action:'renew',deviceId:'pc',clientId:'other-tab-123456',epoch:first.lease.epoch})).status,409);
  await h.lease({action:'release',deviceId:'pc',clientId:'client-pc-123456',epoch:first.lease.epoch,handoff:true});
  const next=await (await h.lease({action:'acquire',exclusive:true,deviceId:'pc',clientId:'other-tab-123456'})).json();assert.notEqual(next.lease.epoch,first.lease.epoch);
 }finally{h.sqlite.close()}
});

test('single cloud rejects non-holder, expired epoch and ownership change during object write',async()=>{
 const h=routeHarness();try{
  assert.equal((await h.put(0,'initial')).status,200);
  assert.equal((await h.put(1,'phone','phone')).status,409);assert.equal(h.row().revision,1);
  h.sqlite.exec("UPDATE cortex_session_leases SET epoch='replacement'");
  assert.equal((await h.put(1,'stale')).status,409);assert.equal(h.row().revision,1);
  h.sqlite.exec("UPDATE cortex_session_leases SET epoch='epoch-pc'");
  const prepare=h.db.prepare.bind(h.db);h.db.prepare=sql=>{const stmt=prepare(sql),run=stmt.run;stmt.run=async()=>{if(sql.includes('UPDATE cortex_cloud_sessions SET'))h.sqlite.exec("UPDATE cortex_session_leases SET device_id='phone',epoch='new'");return run()};return stmt};
  assert.equal((await h.put(1,'in-flight')).status,409);assert.equal(h.row().revision,1);assert.equal(h.objects.size,1);
 }finally{h.sqlite.close()}
});
test('same-device acquire shares epoch; stale release cannot delete renewed lease; new device changes epoch',async()=>{
 const h=routeHarness();try{
  const first=await (await h.lease({action:'acquire',deviceId:'pc',clientId:'another-tab-123456'})).json();assert.equal(first.lease.epoch,'epoch-pc');
  await h.lease({action:'release',deviceId:'pc',clientId:'client-pc-123456',epoch:'epoch-pc'});
  assert.equal(h.sqlite.prepare("SELECT expires_at FROM cortex_session_leases").get().expires_at,first.lease.expiresAt);
  h.sqlite.exec("UPDATE cortex_session_leases SET expires_at='2000-01-01'");
  const expired=await h.lease({action:'renew',deviceId:'pc',clientId:'another-tab-123456',epoch:'epoch-pc'});
  assert.equal(expired.status,409);assert.equal((await expired.json()).code,'CORTEX_LEASE_EXPIRED');
  const next=await (await h.lease({action:'acquire',deviceId:'phone',clientId:'phone-client-12345'})).json();assert.notEqual(next.lease.epoch,'epoch-pc');
  assert.equal((await h.put(0,'stale')).status,409);
 }finally{h.sqlite.close()}
});
test('single GET retries a retired object using its matching latest summary',async()=>{
 const h=routeHarness();try{
  await h.put(0,'initial');const old=h.row().snapshot_r2_key;let release,enter;
  const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r);
  h.hook(async key=>{if(key===old){enter();await gate}});
  const read=h.get();await entered;assert.equal((await h.put(1,'next')).status,200);release();
  const response=await read;assert.equal(response.status,200);const result=await response.json();assert.equal(result.session.revision,2);assert.equal(result.snapshot.turns[0].id,'next');
 }finally{h.sqlite.close()}
});
test('a successful upload acknowledges its own revision even when another write finishes before its response',async()=>{
 const h=routeHarness();try{
  await h.put(0,'initial');const old=h.row().snapshot_r2_key,remove=h.objects.delete.bind(h.objects);
  h.objects.delete=key=>{if(key===old)h.sqlite.exec('UPDATE cortex_cloud_sessions SET revision=3');return remove(key)};
  const result=await (await h.put(1,'second')).json();assert.equal(result.session.revision,2);assert.equal(h.row().revision,3);
 }finally{h.sqlite.close()}
});

test('recovery is idempotent and never alters either divergent source or saved branch',async()=>{
 const h=routeHarness();try{
  await h.put(0,'pc');const before=h.row().snapshot_r2_key,recoveryId='recovery-'+webcrypto.randomUUID();
  const body={recoveryId,projectId:'p',snapshot:{schema:'CORTEX_APP_STATE_V1390',turns:[{id:'phone',text:'휴대폰의 다른 진행'}]}};
  assert.equal((await h.preserve(body)).status,200);assert.equal((await h.preserve(body)).status,200);
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM cortex_cloud_sessions').get().n,2);assert.equal(h.row().snapshot_r2_key,before);assert.equal(h.objects.size,2);
 }finally{h.sqlite.close()}
});

function uploadHarness(fetcher){
 const file=source('app/cortex-player.tsx'),start=file.indexOf('    const upload = async'),end=file.indexOf('    const listener =',start),exports={},ref=current=>({current}),events=[],saved=[],values=new Map();
 const ctx={exports,disposed:false,crypto:webcrypto,cloudUploadBusy:ref(false),cloudUploadQueued:ref(false),cloudRevision:ref(1),leaseEpoch:ref('epoch'),ensureLease:ref(async()=>true),resumeSync:ref(false),conflictPending:ref(false),localChangeSequence:ref(0),changedSinceReady:ref(false),cloudNeedsRetry:ref(false),suppressRestoredSummary:ref(false),recovery:ref(null),readerBusy:ref(false),pendingForkSnapshot:ref(null),takeoverPending:ref(false),cloudCheckedRef:ref('s'),showCloudSync:()=>{},markCloudFailure:message=>{throw Error(message)},setSyncConflict:()=>{},setNotice:()=>{},send:(type,payload)=>events.push({type,payload}),saveCortexSession:row=>saved.push(row),setForkRestoring:()=>{},setForkedSession:()=>{},setReadyInfo:()=>{},setCloudCheckedScope:()=>{},projectId:'p',sourceProjectId:'',effectiveSessionName:'test',scope:'s',cortexDeviceId:()=> 'phone',AbortController,TextEncoder,Error,JSON,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},sameCloudContent:(a,b)=>JSON.stringify(a)===JSON.stringify(b),window:{setTimeout:()=>1,clearTimeout:()=>{}},fetch:fetcher};
 Object.assign(ctx,{owner:undefined,accountStorageKey:()=>null,cloudMirror:ref(null),cloudDelta,mutationRunning:ref(false),leaseRelease:ref(()=>{}),cloudExportSequence:ref(0),setSaveProgress:()=>{}});
 vm.runInNewContext(ts.transpileModule(file.slice(start,end)+'exports.upload=upload;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 return {ctx,events,saved,values,upload:exports.upload};
}
test('true divergence waits for a choice; only explicit recovery creates a separate session',async()=>{
 let preserves=0;
 const h=uploadHarness(async(url,opts)=>{
   if(url.endsWith('/preserve')){preserves++;const body=JSON.parse(opts.body);return Response.json({session:{id:body.recoveryId,name:'preserved',turn:1,revision:1}})}
   if(opts.method==='PUT')return Response.json({code:'CORTEX_SYNC_CONFLICT'},{status:409});
   return Response.json({session:{revision:2},snapshot:{turns:[{id:'remote'}]}});
 });
 await h.upload({turns:[{id:'local'}]},1,'now','local-key');
 assert.equal(h.ctx.conflictPending.current,true);assert.equal(h.ctx.recovery.current,null);assert.equal(preserves,0);
 assert.ok(!h.events.some(e=>e.type==='CLOUD_RESTORE'));
 await h.upload({turns:[{id:'local'}]},1);assert.equal(preserves,0,'unsolicited exports cannot branch');
 h.ctx.conflictPending.current=false;h.ctx.recovery.current={scope:'s',id:'recovery-explicit'};
 await h.upload({turns:[{id:'latest-local'}]},1);assert.equal(preserves,1);assert.equal(h.saved.length,1);
 assert.equal(h.ctx.pendingForkSnapshot.current.snapshot.turns[0].id,'latest-local');
});
test('expired upload reacquires the device and retries original revision without branching',async()=>{
 let checks=0;
 const h=uploadHarness(async(url,opts)=>opts.method==='PUT'?Response.json({code:'CORTEX_LEASE_LOST'},{status:409}):Response.json({session:{revision:1},snapshot:{turns:[{id:'old'}]}}));
 h.ctx.ensureLease.current=async()=>{checks++;return true};
 await h.upload({turns:[{id:'new'}]},1);
 assert.equal(checks,2);assert.equal(h.ctx.cloudUploadQueued.current,false,'queued export is scheduled by finally');
 assert.equal(h.ctx.recovery.current,null);assert.equal(h.ctx.conflictPending.current,false);assert.equal(h.ctx.cloudRevision.current,1);
});
test('unchanged sleeping device follows a newer remote revision despite a changed saved timestamp',async()=>{
 let puts=0;
 const h=uploadHarness(async(url,opts)=>{if(opts.method==='PUT')puts++;return Response.json({session:{revision:3},snapshot:{turns:[{id:'new-remote'}]}})});
 h.values.set('nexus-cloud-base:s',JSON.stringify({revision:1,savedAt:'yesterday',contentKey:'same-content'}));h.ctx.resumeSync.current=true;
 await h.upload({turns:[{id:'old-local'}]},1,'today','same-content');
 assert.equal(puts,0);assert.equal(h.ctx.conflictPending.current,false);assert.equal(h.ctx.cloudRevision.current,3);
 assert.equal(h.events.find(e=>e.type==='CLOUD_RESTORE').payload.snapshot.turns[0].id,'new-remote');
});
test('lost acknowledgement of identical content adopts revision without a branch',async()=>{
 const snapshot={turns:[{id:'same'}]};
 const h=uploadHarness(async(url,opts)=>opts.method==='PUT'?Response.json({code:'CORTEX_SYNC_CONFLICT'},{status:409}):Response.json({session:{revision:2},snapshot}));
 assert.equal(await h.upload(snapshot,1,'saved','key'),true);assert.equal(h.ctx.cloudRevision.current,2);assert.equal(h.ctx.conflictPending.current,false);
 assert.equal(JSON.parse(h.values.get('nexus-cloud-base:s')).contentKey,'key');
});
test('resume serializes lease confirmation before any save and does not save under another device',async()=>{
 let requests=0,release;const gate=new Promise(r=>release=r);
 const h=uploadHarness(async()=>{requests++;return Response.json({session:{revision:2}})});h.ctx.ensureLease.current=()=>gate;
 const pending=h.upload({turns:[]},0);await Promise.resolve();assert.equal(requests,0);
 release(false);assert.equal(await pending,false);assert.equal(requests,0);assert.equal(h.ctx.recovery.current,null);
});
test('local change arriving during reconciliation prevents remote overwrite',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const h=uploadHarness(async()=>{await gate;return Response.json({session:{revision:3},snapshot:{turns:[{id:'remote'}]}})});
 h.values.set('nexus-cloud-base:s',JSON.stringify({contentKey:'same'}));h.ctx.resumeSync.current=true;
 const pending=h.upload({turns:[{id:'local'}]},1,'now','same');await Promise.resolve();h.ctx.localChangeSequence.current++;release();await pending;
 assert.ok(!h.events.some(e=>e.type==='CLOUD_RESTORE'));assert.equal(h.ctx.conflictPending.current,false);
});
