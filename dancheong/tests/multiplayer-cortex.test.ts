import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto,createHash} from 'node:crypto';
import {publishLivePresentation,readLivePresentation,validateLivePresentation} from '../lib/multiplayer-live';
import {liveBasis,liveDelta,applyLiveDelta} from '../lib/multiplayer-live-wire';

test('one-time pre-gateway repair is payer fenced for all media and cannot repeat new or later uncertain paid jobs',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal',presentation:'visual'});
  await h.store.joinMultiplayerRoom(h.b,room.code);
  await h.db.prepare(h.visual.VISUAL_SCHEMA).run();
  const key='a'.repeat(64);
  for(const fixture of [
   {kind:'cast',status:'uncertain',token:webcrypto.randomUUID(),date:'2020-01-01',repair:true},
   {kind:'image',status:'uncertain',token:webcrypto.randomUUID(),date:'2020-01-01',repair:true},
   {kind:'voice',status:'uncertain',token:webcrypto.randomUUID(),date:'2020-01-01',repair:true},
   {kind:'cast',status:'ready',token:webcrypto.randomUUID(),date:'2020-01-01'},
   {kind:'cast',status:'running',token:webcrypto.randomUUID(),date:'2020-01-01'},
   {kind:'cast',status:'uncertain',token:'vn2-'+webcrypto.randomUUID(),date:'2020-01-01'},
   {kind:'cast',status:'uncertain',token:webcrypto.randomUUID(),date:'2099-01-01'},
   {kind:'image',status:'uncertain',token:'vn2-'+webcrypto.randomUUID(),date:'2020-01-01'},
   {kind:'voice',status:'uncertain',token:'vn2-'+webcrypto.randomUUID(),date:'2020-01-01'},
   {kind:'image',status:'uncertain',token:webcrypto.randomUUID(),date:'2099-01-01'},
   {kind:'voice',status:'uncertain',token:webcrypto.randomUUID(),date:'2099-01-01'},
  ]){
   h.sqlite.prepare('DELETE FROM multiplayer_visual_assets').run();
   h.sqlite.prepare('INSERT INTO multiplayer_visual_assets(room_id,key,kind,status,token,account_id,expires_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(room.id,key,fixture.kind,fixture.status,fixture.token,h.a.id,'2099-01-01',fixture.date);
   const body={action:'claim',key,kind:fixture.kind,turn:0,token:'vn2-'+webcrypto.randomUUID()};
   assert.equal((await h.visual.visualOperation(h.b,room.code,body)).claimed,false);
   assert.equal((await h.visual.visualOperation(h.a,room.code,body)).claimed,Boolean(fixture.repair));
   if(fixture.repair){
    await h.visual.visualOperation(h.a,room.code,{...body,action:'failed'});
    assert.equal((await h.visual.visualOperation(h.a,room.code,{...body,token:'vn2-'+webcrypto.randomUUID()})).claimed,false);
   }
  }
 }finally{h.sqlite.close();}
});

test('live public presentation is bounded, fenced, sequenced, recoverable and never advances canonical state',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal'}),code=room.code;
  await h.store.joinMultiplayerRoom(h.b,code);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,code,'ready',{ready:true,apiKeyReady:true});
  await h.store.updateMultiplayerRoom(h.a,code,'start',{});
  const token=webcrypto.randomUUID();await h.engine.cortexRoomOperation(h.a,code,{action:'begin',token,revision:1});
  const payload={id:'public-beat',seq:1,input:'공개 입력',blocks:[{kind:'text',text:'화면에 표시된 문단',start:0,end:12}],apiKey:'never-copy',privateDraft:'never-copy'};
  const state=()=>h.sqlite.prepare('SELECT * FROM multiplayer_cortex_state WHERE room_id=?').get(room.id) as any;
  const roomRow=()=>h.sqlite.prepare('SELECT * FROM multiplayer_rooms WHERE id=?').get(room.id) as any;
  assert.equal((await publishLivePresentation(h.db,room.id,'b',token,payload)).accepted,false);
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,payload)).accepted,true);
  assert.equal(state().turn,0);assert.equal(state().revision,1);
  const live:any=await readLivePresentation(h.db,room.id,state(),roomRow(),0,'');assert.equal(live.blocks[0].text,payload.blocks[0].text);assert.equal(live.apiKey,undefined);assert.equal(live.privateDraft,undefined);assert.equal(live.token,undefined);
  assert.equal((await readLivePresentation(h.db,room.id,state(),roomRow(),1,live.id))?.unchanged,true);
  assert.equal((await readLivePresentation(h.db,room.id,state(),roomRow(),100,'previous-generation'))?.id,'public-beat');
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,{...payload,seq:2})).accepted,false,'rate bound');
  h.sqlite.prepare("UPDATE multiplayer_cortex_live SET updated_at='2000-01-01'").run();
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,{...payload,seq:2})).accepted,true);
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,payload)).accepted,false,'out of order');
  assert.equal(await readLivePresentation(h.db,room.id,{...state(),claim_expires_at:'2000-01-01'},roomRow(),0,''),null);
  assert.equal(await readLivePresentation(h.db,room.id,state(),{...roomRow(),revision:999},0,''),null);
  await assert.rejects(h.store.getMultiplayerRoom(h.outsider,code,false,{liveAfter:0}));
  const reconnect=await h.store.getMultiplayerRoom(h.b,code,false,{liveAfter:0});assert.equal(reconnect.live.seq,2);
  await h.engine.cortexRoomOperation(h.a,code,{action:'abort',token});
  assert.equal(await readLivePresentation(h.db,room.id,state(),roomRow(),0,''),null);
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,{...payload,seq:3})).accepted,false);
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM multiplayer_cortex_live').get()!.n,0);
  assert.throws(()=>validateLivePresentation({...payload,blocks:[{kind:'html',text:'<script>bad</script>'}]}));
  assert.throws(()=>validateLivePresentation({...payload,blocks:Array(513).fill(payload.blocks[0])}));
  assert.throws(()=>validateLivePresentation({...payload,blocks:[{kind:'text',text:'a'.repeat(24001)}]}));
 }finally{h.sqlite.close()}
});

test('live delta uploads keep claim fencing, recover lost bases and reacknowledge lost full-frame receipts',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal'});await h.store.joinMultiplayerRoom(h.b,room.code);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,room.code,'ready',{ready:true,apiKeyReady:true});await h.store.updateMultiplayerRoom(h.a,room.code,'start',{});
  const token=webcrypto.randomUUID();await h.engine.cortexRoomOperation(h.a,room.code,{action:'begin',token,revision:1});
  const base=validateLivePresentation({id:'public',seq:1,input:'',blocks:[{kind:'text',text:'공개 문단 '.repeat(100)},{kind:'text',text:'다음 문단'}]});
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,base)).accepted,true);
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,base)).accepted,true,'lost acknowledgement is safe to retry');
  const next=structuredClone(base);next.seq=5;next.blocks[1].text+=' 이어지는 내용';const basis=await liveBasis(base),delta=await liveDelta(next,basis);assert.equal(delta.wire,'LIVE_DELTA_V1');
  h.sqlite.prepare("UPDATE multiplayer_cortex_live SET updated_at='2000-01-01'").run();
  assert.equal((await publishLivePresentation(h.db,room.id,'b',token,delta)).accepted,false);
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,delta)).accepted,true);
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,delta)).resync,true,'lost delta ack falls back to full frame');
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,next)).accepted,true);
  const state=h.sqlite.prepare('SELECT * FROM multiplayer_cortex_state').get(),row=h.sqlite.prepare('SELECT * FROM multiplayer_rooms').get();
  const down:any=await readLivePresentation(h.db,room.id,state,row,1,base.id,basis);assert.equal(down.wire,'LIVE_DELTA_V1');assert.deepEqual(applyLiveDelta(base,down),next);
  await h.engine.cortexRoomOperation(h.a,room.code,{action:'abort',token});assert.equal((await publishLivePresentation(h.db,room.id,'a',token,next)).accepted,false);
 }finally{h.sqlite.close()}
});

test('accepted input is visible before any model paragraph, then hands off to live prose and clears on abort',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal'});await h.store.joinMultiplayerRoom(h.b,room.code);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,room.code,'ready',{ready:true,apiKeyReady:true});await h.store.updateMultiplayerRoom(h.a,room.code,'start',{});
  const token=webcrypto.randomUUID(),submissionId=webcrypto.randomUUID(),input='공개 입력\n  두 번째 줄';
  await assert.rejects(h.engine.cortexRoomOperation(h.b,room.code,{action:'begin',token,submissionId,revision:1,input}),/차례/);
  await assert.rejects(h.engine.cortexRoomOperation(h.a,room.code,{action:'begin',token,revision:1,input:'가'.repeat(12001)}),/12,000/);
  await h.engine.cortexRoomOperation(h.a,room.code,{action:'begin',token,submissionId,revision:1,input});
  const received=await h.store.getMultiplayerRoom(h.b,room.code,false,{liveAfter:0});
  assert.equal(received.submission.text,input);assert.equal(received.submission.id,'input-'+submissionId);
  assert.equal((await h.store.getMultiplayerRoom(h.a,room.code,false)).submission.id,received.submission.id);
  assert.equal(received.live.input,input);assert.equal(received.live.id,'submitted-'+submissionId);assert.equal(received.live.blocks.length,0);assert.equal(received.cortex.generating,true);assert.equal(received.cortex.turn,0);assert.equal(received.snapshot,undefined);assert.ok(!JSON.stringify(received).includes(token),'claim credential is never a public presentation ID');
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,{id:'submitted-'+submissionId,seq:1,input,blocks:[]})).accepted,true,'initial-frame retry is idempotent');
  h.sqlite.prepare("UPDATE multiplayer_cortex_live SET updated_at='2000-01-01'").run();
  assert.equal((await publishLivePresentation(h.db,room.id,'a',token,{id:'actual-beat',seq:2,input,blocks:[{kind:'text',text:'첫 문단'}]})).accepted,true);
  assert.equal((await h.store.getMultiplayerRoom(h.b,room.code,false,{liveAfter:1,liveId:received.live.id})).live.blocks[0].text,'첫 문단');
  await h.engine.cortexRoomOperation(h.a,room.code,{action:'abort',token});assert.equal((await h.store.getMultiplayerRoom(h.b,room.code,false,{liveAfter:2})).live,null);
  h.sqlite.prepare("UPDATE multiplayer_room_events SET created_at='2000-01-01' WHERE type='CORTEX_INPUT_ACCEPTED'").run();
  assert.equal((await h.store.getMultiplayerRoom(h.b,room.code,false)).submission,null);
 }finally{h.sqlite.close()}
});

function harness(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(fs.readFileSync('drizzle/0009_useful_kree.sql','utf8'));
 sqlite.exec(fs.readFileSync('drizzle/0010_slippery_wraith.sql','utf8'));
 sqlite.exec(fs.readFileSync('drizzle/0011_open_archangel.sql','utf8'));
 sqlite.exec("ALTER TABLE cortex_session_leases ADD epoch TEXT NOT NULL DEFAULT ''; CREATE TABLE scenario_projects(id TEXT PRIMARY KEY,owner_key TEXT)");
 sqlite.exec(fs.readFileSync('drizzle/0014_quiet_skaar.sql','utf8'));
 let batchQueue=Promise.resolve();
 const db={prepare(sql:string){let values:any[]=[];return{sql,bind(...args:any[]){values=args;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return{results:sqlite.prepare(sql).all(...values)}},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}}}},batch:(stmts:any[])=>{const job=batchQueue.then(async()=>{sqlite.exec('BEGIN');try{const results=[];for(const stmt of stmts)results.push(/^\s*(?:SELECT|WITH|PRAGMA)\b/i.test(stmt.sql)?await stmt.all():await stmt.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}});batchQueue=job.catch(()=>{});return job}};
 const objects=new Map<string,string>();
 let routeOwner='owner-b';
 const simulation={database:async()=>db,requireOwnerKey:async()=>routeOwner,ensureSimulationSchema:async()=>{},getOwnedProject:async(owner:string,id:string)=>owner==='owner-a'&&id==='fresh-work'?{id,title:'새 작품'}:null,getOwnedSession:async()=>null,toProjectSummary:(x:any)=>x,toSessionSummary:(x:any)=>x,safeJsonText:JSON.stringify,compactPreview:()=>''};
 const snapshot={schema:'CORTEX_APP_STATE_V1390',scenario:{title:'테스트'},turns:[],settings:{model:'gpt-5.6-luna'}};
 const cloud={cortexCloudSummary:(x:any)=>({id:x.id,revision:x.revision,turn:x.turn,projectId:x.project_id}),getCortexCloudSession:async(owner:string,id:string)=>owner==='owner-a'&&id==='personal'?{id,owner_key:owner,project_id:'work',snapshot_json:JSON.stringify(snapshot),turn:0}:sqlite.prepare("SELECT * FROM cortex_cloud_sessions WHERE id=? AND owner_key=? AND last_writer_id<>'mp-deleted'").get(id,owner)||null};
 const storage={R2_JSON_POINTER:'{}',runtimeJsonDigest:async(text:string)=>({sha256:createHash('sha256').update(text).digest('hex'),byteLength:Buffer.byteLength(text)}),readRuntimeJsonText:async(row:any)=>objects.get(row.snapshot_r2_key)||row.snapshot_json,readSessionSnapshotText:async()=>'',storeRuntimeJson:async({value}:any)=>{const key=webcrypto.randomUUID(),text=typeof value==='string'?value:JSON.stringify(value);objects.set(key,text);return{key,sha256:createHash('sha256').update(text).digest('hex'),byteLength:Buffer.byteLength(text)}},deleteRuntimeObject:async(key:string)=>{objects.delete(key)}};
 const modules:Record<string,any>={'./simulation-store':simulation,'./runtime-json-store':storage,'./cortex-cloud-store':cloud,'./conversation-memory':{optimizeConversationSnapshot:(x:any)=>x}};
 const load=(name:string)=>{if(modules[name])return modules[name];const exports={};modules[name]=exports;const source=fs.readFileSync(new URL(name.endsWith('.mjs')?name:'../lib/'+name.slice(2)+'.ts',import.meta.url),'utf8');const compiled=ts.transpileModule(source,{fileName:name.endsWith('.mjs')?'module.js':'module.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(compiled,{exports,require:load,process:{env:{NODE_ENV:'test'}},crypto:webcrypto,TextEncoder,Date,console});return exports;};
 Object.assign(simulation,{objectStorage:async()=>({put:async(key:string,text:string)=>objects.set(key,text),get:async(key:string)=>objects.has(key)?{text:async()=>objects.get(key)}:null,delete:async(key:string)=>objects.delete(key)})});
 const store=load('./multiplayer-store'),engine=load('./multiplayer-cortex'),visual=load('./multiplayer-visual'),playback=load('./multiplayer-vn-playback');
 const a={id:'a',ownerKey:'owner-a',displayName:'방장'},b={id:'b',ownerKey:'owner-b',displayName:'참여자'},outsider={id:'c',ownerKey:'owner-c',displayName:'외부인'};
 const route=(path:string)=>{const exports:any={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:(name:string)=>name==='next/server'?{NextResponse:{json:(body:any,opts:any)=>new Response(JSON.stringify(body),{...opts,headers:{'Content-Type':'application/json',...opts?.headers}})}}:load('./'+name.split('/').at(-1)),crypto:webcrypto,Date,URL,TextEncoder,console});return exports};
 return{sqlite,db,store,engine,visual,playback,a,b,outsider,snapshot,objects,snapshots:load('./multiplayer-snapshot'),personal:load('./multiplayer-personal'),route,setOwner:(owner:string)=>{routeOwner=owner}};
}

test('every participant gets a durable personal continuation, solo lease freezes it, and a chosen solo save can host another room',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal'}),code=room.code;
  await h.store.joinMultiplayerRoom(h.b,code);
  const copies=(owner:string)=>h.sqlite.prepare('SELECT * FROM cortex_cloud_sessions WHERE owner_key=? ORDER BY created_at,id').all(owner) as any[];
  assert.equal(copies('owner-a').length,1);assert.equal(copies('owner-b').length,1);assert.equal(copies('owner-c').length,0);
  assert.match(copies('owner-b')[0].project_id,/^cortex-import-/,'guest continuation appears without owning the host project');
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,code,'ready',{ready:true,apiKeyReady:true});
  await h.store.updateMultiplayerRoom(h.a,code,'start',{});
  const image='data:image/png;base64,dGVzdA==',shared={...h.snapshot,turns:[{id:'beat-1',status:'COMMITTED',text:'함께 쓴 첫 비트'}],media:{packageAssets:[{key:'hero',dataUrl:image}]}};
  const commit=async(user:any,revision:number,snapshot:any)=>{const token=webcrypto.randomUUID();await h.engine.cortexRoomOperation(user,code,{action:'begin',token,revision});return h.engine.cortexRoomOperation(user,code,{action:'commit',token,snapshot})};
  await commit(h.a,1,shared);
  assert.equal(copies('owner-b')[0].turn,1);assert.equal(copies('owner-a')[0].snapshot_r2_key,copies('owner-b')[0].snapshot_r2_key,'immutable story bytes reused');
  const row=copies('owner-b')[0],context={params:Promise.resolve({sessionId:row.id})};
  const api=h.route('app/api/cortex/sessions/[sessionId]/route.ts'),lease=h.route('app/api/cortex/sessions/[sessionId]/lease/route.ts');
  const read=await api.GET(new Request('https://test/session'),context);assert.equal(read.status,200);const body=await read.json();assert.equal(body.snapshot.media.packageAssets[0].dataUrl,image);assert.equal(body.snapshot._multiplayerMedia,undefined);
  const leaseBody={action:'acquire',clientId:'client-phone-123456',deviceId:'phone-b'};
  const claimed=await lease.POST(new Request('https://test/lease',{method:'POST',body:JSON.stringify(leaseBody)}),context);assert.equal(claimed.status,200);const epoch=(await claimed.json()).lease.epoch;
  assert.equal(copies('owner-b')[0].last_writer_id,'mp-detached');
  const solo={...body.snapshot,turns:[...shared.turns,{id:'solo',status:'COMMITTED',text:'나 혼자 이어 쓴 다른 이야기'}]};
  const saved=await api.PUT(new Request('https://test/session',{method:'PUT',body:JSON.stringify({snapshot:solo,expectedRevision:row.revision,deviceId:'phone-b',leaseEpoch:epoch})}),context);assert.equal(saved.status,200);
  assert.ok(h.objects.has(row.snapshot_r2_key),'solo save must not delete shared room bytes');
  await commit(h.b,2,{...shared,turns:[...shared.turns,{id:'beat-2',status:'COMMITTED',text:'멀티에서 이어 쓴 두 번째 비트'}]});
  assert.equal(copies('owner-b').length,2,'later multiplayer work is separate, not an overwrite');
  const personal=(await (await api.GET(new Request('https://test/session'),context)).json()).snapshot;assert.equal(personal.turns.at(-1).text,solo.turns.at(-1).text);
  const continued=await h.store.createMultiplayerRoom(h.b,{engine:'cortex',sessionId:row.id});assert.equal(continued.snapshot.turns.at(-1).text,solo.turns.at(-1).text);assert.equal(continued.snapshot.media.packageAssets[0].dataUrl,image);
  h.setOwner('owner-c');assert.equal((await api.GET(new Request('https://test/session'),context)).status,404);h.setOwner('owner-b');
  const follow=copies('owner-b').find(r=>r.last_writer_id.startsWith('mp-follow:')&&r.turn===2);
  await api.DELETE(new Request('https://test/session'),{params:Promise.resolve({sessionId:follow.id})});assert.ok(h.objects.has(follow.snapshot_r2_key),'deleting a personal mirror never deletes another participant’s images');
  await h.personal.ensurePersonalCopies('owner-b');assert.equal((await api.GET(new Request('https://test/session'),{params:Promise.resolve({sessionId:follow.id})})).status,404,'catalog repair does not resurrect a deleted copy');
  await h.store.updateMultiplayerRoom(h.b,code,'leave',{});
  await commit(h.a,3,{...shared,turns:[...shared.turns,{id:'beat-2',status:'COMMITTED',text:'두 번째'},{id:'beat-3',status:'COMMITTED',text:'퇴장 후 진행'}]});
  assert.ok(!copies('owner-b').some(r=>r.turn===3),'departed participant receives no later room content');
 }finally{h.sqlite.close()}
});

test('personal fanout rolls back with the room commit and legacy backfill is scoped, idempotent and indexed',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal'});await h.store.joinMultiplayerRoom(h.b,room.code);
  h.sqlite.exec(fs.readFileSync('drizzle/0015_friendly_hellfire_club.sql','utf8'));
  assert.match(JSON.stringify(h.sqlite.prepare('EXPLAIN QUERY PLAN SELECT id FROM multiplayer_members WHERE owner_key=?').all('owner-b')),/multiplayer_members_owner_idx/);
  h.sqlite.prepare('DELETE FROM cortex_cloud_sessions WHERE owner_key=?').run('owner-b');
  await h.personal.ensurePersonalCopies('owner-c');assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM cortex_cloud_sessions').get()!.n,1);
  await h.personal.ensurePersonalCopies('owner-b');await h.personal.ensurePersonalCopies('owner-b');assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM cortex_cloud_sessions').get()!.n,2);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,room.code,'ready',{ready:true,apiKeyReady:true});await h.store.updateMultiplayerRoom(h.a,room.code,'start',{});
  h.sqlite.exec("CREATE TRIGGER fail_personal BEFORE UPDATE ON cortex_cloud_sessions WHEN NEW.owner_key='owner-b' BEGIN SELECT RAISE(ABORT,'simulated personal write failure'); END");
  const token=webcrypto.randomUUID(),snapshot={...h.snapshot,turns:[{id:'one',status:'COMMITTED',text:'확정될 첫 비트'}]};
  await h.engine.cortexRoomOperation(h.a,room.code,{action:'begin',token,revision:1});
  await assert.rejects(h.engine.cortexRoomOperation(h.a,room.code,{action:'commit',token,snapshot}),/simulated/);
  assert.equal(h.sqlite.prepare('SELECT turn FROM multiplayer_cortex_state').get()!.turn,0);assert.ok(h.sqlite.prepare('SELECT turn FROM cortex_cloud_sessions').all().every(r=>r.turn===0));
  h.sqlite.exec('DROP TRIGGER fail_personal');
  await h.engine.cortexRoomOperation(h.a,room.code,{action:'commit',token,snapshot});
  const count=h.objects.size;await h.engine.cortexRoomOperation(h.a,room.code,{action:'commit',token,snapshot});assert.equal(h.objects.size,count,'idempotent retry does not copy again');
  assert.ok(h.sqlite.prepare('SELECT turn FROM cortex_cloud_sessions').all().every(r=>r.turn===1));
 }finally{h.sqlite.close()}
});

test('long shared updates carry only changed state, retain full fallback, and never trust an unrelated base',async()=>{
 const h=harness();try{
  const host=fs.readFileSync('public/cortex-host.js','utf8'),start=host.indexOf(' function applySharedOperations'),end=host.indexOf(" window.addEventListener('message'",start),context:any={};
  vm.runInNewContext(host.slice(start,end)+'this.apply=applySharedOperations;',context);
  for(const count of [10,50,100,250]){
   const before={schema:'CORTEX_APP_STATE_V1390',scenario:{runtime:{storyId:'synthetic'},world:{location:'처음'},fixed:'world'.repeat(20000)},turns:Array.from({length:count},(_,i)=>({id:String(i),text:'기존 본문 '.repeat(300),status:'COMMITTED',metrics:{i}})),memory:{summary:'지난 이야기',old:['a','b']},media:{generated:[],packageAssets:[]}};
   const stored=await h.snapshots.storeSharedSnapshot(before,{ownerKey:'owner-a',projectId:'p',sessionId:'s',revision:count});
   const row={snapshot_json:stored.inline,snapshot_r2_key:stored.key,snapshot_sha256:stored.sha256,snapshot_byte_length:stored.byteLength,revision:count};
   const base=await h.snapshots.readSharedSnapshot(row),media=base.mediaVersion;
   const {media:unused,...next}=structuredClone(before);next.turns.push({id:String(count),text:'새로 확정된 이야기',status:'COMMITTED',metrics:{i:count}});next.turns[count-2].text+=' 늦게 복구된 대사';next.scenario.world.location='다음 장소';next.memory={summary:'기억 갱신',old:['b']};
   const saved=await h.snapshots.storeSharedSnapshot(next,{ownerKey:'owner-a',projectId:'p',sessionId:'s',revision:count+1},row,media);
   const latest={snapshot_json:saved.inline,snapshot_r2_key:saved.key,snapshot_sha256:saved.sha256,snapshot_byte_length:saved.byteLength,revision:count+1};
   const light=await h.snapshots.readSharedSnapshot(latest,media,{revision:count,version:stored.sha256});assert.ok(light.update);assert.equal(light.snapshot,undefined);
   const {media:ignored,...baseWire}=base.snapshot;const applied=context.apply(baseWire,light.update.operations).next;assert.deepEqual(JSON.parse(JSON.stringify(applied)),next);
   const full=await h.snapshots.readSharedSnapshot(latest,media);assert.deepEqual(JSON.parse(JSON.stringify(full.snapshot)),next);
   assert.ok((await h.snapshots.readSharedSnapshot(latest,media,{revision:count,version:'foreign'})).snapshot);
   assert.ok((await h.snapshots.readSharedSnapshot(latest,'different-media',{revision:count,version:stored.sha256})).snapshot.media);
   const bytes=Buffer.byteLength(JSON.stringify(light.update)),fullBytes=Buffer.byteLength(JSON.stringify(full.snapshot));assert.ok(bytes/fullBytes<.05);console.log(JSON.stringify({sharedUpdateBenchmark:{turns:count,fullBytes,updateBytes:bytes}}));
   h.objects.delete(saved.updateKey);assert.ok((await h.snapshots.readSharedSnapshot(latest,media,{revision:count,version:stored.sha256})).snapshot,'missing optional packet falls back to complete state');
  }
  assert.throws(()=>context.apply({},{operations:[]}),/INVALID/);
  assert.throws(()=>context.apply({},[{path:['__proto__','polluted'],kind:'set',value:true}]),/INVALID/);assert.equal(({} as any).polluted,undefined);
 }finally{h.sqlite.close()}
});

test('ready cancellation between start validation and update keeps the room waiting',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal'}),code=room.code;
  await h.store.joinMultiplayerRoom(h.b,code);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,code,'ready',{ready:true,apiKeyReady:true});
  let release!:()=>void,enter!:()=>void;const gate=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>enter=r),prepare=h.db.prepare.bind(h.db);
  h.db.prepare=(sql:string)=>{const stmt=prepare(sql);if(sql.includes("SET status = 'ACTIVE', current_member_id")){const run=stmt.run;stmt.run=async()=>{enter();await gate;return run()}}return stmt};
  const start=h.store.updateMultiplayerRoom(h.a,code,'start',{});await entered;
  await h.store.updateMultiplayerRoom(h.b,code,'ready',{ready:false,apiKeyReady:true});
  const rejected=assert.rejects(start,/준비 상태/);release();await rejected;
  assert.equal((await h.store.getMultiplayerRoom(h.a,code)).room.status,'WAITING');
 }finally{h.sqlite.close()}
});

test('ten compact commits reuse one embedded media bundle and remain readable by older clients',async()=>{
 const h=harness();try{
  const media={schema:'CORTEX_MEDIA_BACKUP_V1',generated:[],packageAssets:[{key:'hero',dataUrl:'data:image/png;base64,'+'A'.repeat(1024*1024)}]};
  const opened=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',startMode:'new',projectId:'fresh-work',initialSnapshot:{...h.snapshot,media}}),code=opened.room.code;
  await h.store.joinMultiplayerRoom(h.b,code);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,code,'ready',{ready:true,apiKeyReady:true});
  await h.store.updateMultiplayerRoom(h.a,code,'start',{});
  const mediaVersion=opened.mediaVersion,turns:any[]=[];
  for(let i=0;i<10;i++){
   const token=webcrypto.randomUUID(),user=i%2?h.b:h.a;
   await h.engine.cortexRoomOperation(user,code,{action:'begin',token,revision:i+1});
   turns.push({id:String(i),status:'COMMITTED',text:'확정된 본문 '+i});
   const bridge={schema:'CORTEX_OCCURRENCE_BRIDGE_V1',eventId:'next-event',condition:'공개된 발생조건',reason:'NO_MATCH',authority:'AUTHOR',checked:[]};
   const snapshot={...h.snapshot,scenario:{...h.snapshot.scenario,runtime:{occurrenceBridge:bridge}},canonicalSession:{runtime:{occurrenceBridge:bridge}},turns:[...turns]};
   await assert.rejects(()=>h.engine.cortexRoomOperation(user,code,{action:'commit',token,snapshot,mediaUnchanged:'foreign-version'}),/이미지 기준/);
   const saved=await h.engine.cortexRoomOperation(user,code,{action:'commit',token,snapshot,mediaUnchanged:mediaVersion});
   assert.equal(saved.mediaVersion,mediaVersion);
   const light=await h.store.getMultiplayerRoom(h.a,code,true,{media:mediaVersion});
   assert.equal(light.mediaReused,true);assert.equal(light.snapshot.media,undefined);assert.equal(light.snapshot.turns.length,i+1);
   assert.equal(JSON.stringify(light.snapshot.scenario.runtime.occurrenceBridge),JSON.stringify(bridge));
   assert.equal(JSON.stringify(light.snapshot.canonicalSession.runtime.occurrenceBridge),JSON.stringify(bridge));
  }
  const full=await h.store.getMultiplayerRoom(h.b,code,true);
  assert.equal(JSON.stringify(full.snapshot.media),JSON.stringify(media));assert.equal(full.snapshot._multiplayerMedia,undefined);
  assert.equal([...h.objects.values()].filter(x=>x.includes(media.packageAssets[0].dataUrl)).length,1);
  const stored=[...h.objects.values()].reduce((sum,x)=>sum+Buffer.byteLength(x),0);
  assert.ok(stored<1.1*1024*1024,`stored ${stored} bytes`);
 }finally{h.sqlite.close()}
});

test('combined heartbeat keeps incremental chat and avoids redundant membership writes',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal'});
  await h.engine.roomChat(h.a,room.code,{body:'채팅 유지',clientId:webcrypto.randomUUID()});
  let writes=0;const prepare=h.db.prepare.bind(h.db);
  h.db.prepare=(sql:string)=>{const statement=prepare(sql),run=statement.run;statement.run=async()=>{if(sql.startsWith('UPDATE multiplayer_members SET last_seen_at'))writes++;return run()};return statement};
  const first=await h.store.getMultiplayerRoom(h.a,room.code,false,{after:0});
  assert.equal(first.messages[0].body,'채팅 유지');assert.equal(first.snapshot,undefined);
  const next=await h.store.getMultiplayerRoom(h.a,room.code,false,{after:first.messages[0].seq});
  assert.equal(next.messages.length,0);assert.equal(writes,0);
  h.sqlite.exec("UPDATE multiplayer_members SET last_seen_at='2000-01-01T00:00:00.000Z'");
  await h.store.getMultiplayerRoom(h.a,room.code,false,{after:0});assert.equal(writes,1);
  await assert.rejects(()=>h.store.getMultiplayerRoom(h.outsider,room.code,false,{after:0}),/참가/);
 }finally{h.sqlite.close()}
});

test('lobby create and join may omit the story while preserving full reader access',async()=>{
 const h=harness();try{
  const created=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal',summaryOnly:true});
  assert.equal(created.snapshot,undefined);
  const joined=await h.store.joinMultiplayerRoom(h.b,created.room.code,false);assert.equal(joined.snapshot,undefined);
  assert.ok((await h.store.getMultiplayerRoom(h.b,created.room.code,true)).snapshot);
 }finally{h.sqlite.close()}
});

test('legacy inline media is migrated without loss on the first compact commit',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal'});
  const media={generated:[],packageAssets:[{key:'old',dataUrl:'data:image/png;base64,YQ=='}]};
  h.sqlite.prepare('UPDATE multiplayer_cortex_state SET snapshot_json=?,snapshot_r2_key=NULL,snapshot_sha256=NULL').run(JSON.stringify({...h.snapshot,media}));
  const initial=await h.store.getMultiplayerRoom(h.a,room.code,true);assert.equal(initial.mediaVersion,'legacy-1');
  await h.store.joinMultiplayerRoom(h.b,room.code);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,room.code,'ready',{ready:true,apiKeyReady:true});
  await h.store.updateMultiplayerRoom(h.a,room.code,'start',{});
  const token=webcrypto.randomUUID();await h.engine.cortexRoomOperation(h.a,room.code,{action:'begin',token,revision:1});
  const saved=await h.engine.cortexRoomOperation(h.a,room.code,{action:'commit',token,mediaUnchanged:initial.mediaVersion,snapshot:{...h.snapshot,turns:[{status:'COMMITTED',text:'다음 본문'}]}});
  assert.notEqual(saved.mediaVersion,initial.mediaVersion);
  assert.equal(JSON.stringify((await h.store.getMultiplayerRoom(h.b,room.code,true)).snapshot.media),JSON.stringify(media));
 }finally{h.sqlite.close()}
});
test('a fresh room accepts a keyless opening only for an owned work and starts at zero',async()=>{
 const h=harness();try{
  await assert.rejects(()=>h.store.createMultiplayerRoom(h.b,{engine:'cortex',startMode:'new',projectId:'fresh-work',sessionId:'',initialSnapshot:h.snapshot}),/작품/);
  const result=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',startMode:'new',projectId:'fresh-work',sessionId:'',initialSnapshot:h.snapshot});
  assert.equal(result.cortex.turn,0);assert.equal(result.snapshot.turns.length,0);
  assert.match(String(h.sqlite.prepare('SELECT session_id FROM multiplayer_rooms').get().session_id),/^multiplayer-new-/);
 }finally{h.sqlite.close()}
});
test('a fresh Cortex room accepts a device package when an owned cloud session proves the work',async()=>{
 const h=harness();try{
  const result=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',startMode:'new',projectId:'work',sessionId:'personal',initialSnapshot:h.snapshot});
  assert.equal(result.cortex.turn,0);assert.equal(result.snapshot.turns.length,0);
  assert.match(String(h.sqlite.prepare('SELECT session_id FROM multiplayer_rooms').get().session_id),/^multiplayer-new-/);
  await assert.rejects(()=>h.store.createMultiplayerRoom(h.b,{engine:'cortex',startMode:'new',projectId:'work',sessionId:'personal',initialSnapshot:h.snapshot}),/작품/);
 }finally{h.sqlite.close()}
});
test('Cortex rooms isolate personal saves, serialize claims, commit once, and protect chat membership',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{sessionId:'personal',engine:'cortex',visibility:'PRIVATE',maxPlayers:2});const code=room.code;
  await assert.rejects(()=>h.store.getMultiplayerRoom(h.outsider,code,true),/참가/);
  await h.store.joinMultiplayerRoom(h.b,code);
  await assert.rejects(()=>h.store.joinMultiplayerRoom(h.outsider,code),/정원/);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,code,'ready',{ready:true,apiKeyReady:true});
  await h.store.updateMultiplayerRoom(h.a,code,'start',{});
  const token=webcrypto.randomUUID();
  await h.engine.cortexRoomOperation(h.a,code,{action:'begin',token,revision:1});
  await assert.rejects(()=>h.engine.cortexRoomOperation(h.a,code,{action:'begin',token:webcrypto.randomUUID(),revision:1}),/진행 중/);
  await assert.rejects(()=>h.engine.cortexRoomOperation(h.b,code,{action:'begin',token:webcrypto.randomUUID(),revision:1}),/차례/);
  await assert.rejects(()=>h.store.updateMultiplayerRoom(h.a,code,'skip',{}),/생성/);
  await assert.rejects(()=>h.engine.cortexRoomOperation(h.a,code,{action:'commit',token,snapshot:{...h.snapshot,turns:[{status:'STREAMING',text:'진행 중'}]}}),/확정/);
  const next={...h.snapshot,turns:[{id:'one',status:'COMMITTED',text:'완료된 본문',apiLog:[{model:'muse-spark-1.3-contributor',usage:{inputTokens:20,outputTokens:10},cost:{totalUsd:0.01}}]}]};
  const committed=await h.engine.cortexRoomOperation(h.a,code,{action:'commit',token,snapshot:next});assert.equal(committed.revision,2);
  const again=await h.engine.cortexRoomOperation(h.a,code,{action:'commit',token,snapshot:next});assert.equal(again.revision,2);
  const latest=await h.store.getMultiplayerRoom(h.b,code,true);assert.equal(latest.cortex.turn,1);assert.equal(latest.snapshot.turns[0].text,'완료된 본문');assert.equal(h.snapshot.turns.length,0,'personal source stays unchanged');assert.equal(latest.room.members.find((m:any)=>m.isSelf).id,latest.room.currentMemberId);
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM multiplayer_cost_ledger').get()!.n,1);
  const billed=h.sqlite.prepare('SELECT model,base_url,input_tokens,output_tokens,estimated_cost_usd FROM multiplayer_cost_ledger').get()!;
  assert.equal(billed.model,'muse-spark-1.3-contributor');assert.equal(billed.base_url,'https://opencode.ai/zen/go/v1');
  assert.equal(billed.input_tokens,20);assert.equal(billed.output_tokens,10);assert.equal(billed.estimated_cost_usd,0.01);
  await assert.rejects(()=>h.engine.roomChat(h.outsider,code),/참가/);
  const id=webcrypto.randomUUID();await h.engine.roomChat(h.a,code,{body:'<script>비공개 대화</script>',clientId:id});await h.engine.roomChat(h.a,code,{body:'<script>비공개 대화</script>',clientId:id});
  const chat=await h.engine.roomChat(h.b,code);assert.equal(chat.messages.length,1);assert.equal(chat.messages[0].isSelf,false);assert.equal(chat.messages[0].accountId,undefined);assert.equal(JSON.stringify(latest.snapshot).includes('비공개 대화'),false);
  await h.store.updateMultiplayerRoom(h.a,code,'kick',{memberId:latest.room.currentMemberId});
  await assert.rejects(()=>h.engine.roomChat(h.b,code),/참가/);
 }finally{h.sqlite.close()}
});

test('host timer changes preserve the current deadline and live writer, applying to the next committed beat',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{sessionId:'personal',engine:'cortex',turnLimitSeconds:120});
  await h.store.joinMultiplayerRoom(h.b,room.code);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,room.code,'ready',{ready:true,apiKeyReady:true});
  await h.store.updateMultiplayerRoom(h.a,room.code,'start',{});
  const read=()=>h.sqlite.prepare('SELECT * FROM multiplayer_rooms WHERE id=?').get(room.id) as any;
  const before=read(),token=webcrypto.randomUUID();await h.engine.cortexRoomOperation(h.a,room.code,{action:'begin',token,revision:1});
  await assert.rejects(()=>h.store.updateMultiplayerRoom(h.b,room.code,'turn_limit',{turnLimitSeconds:300}),/방장/);
  await assert.rejects(()=>h.store.updateMultiplayerRoom(h.outsider,room.code,'turn_limit',{turnLimitSeconds:300}),/참가/);
  for(const invalid of [0,601,NaN,30.5])await assert.rejects(()=>h.store.updateMultiplayerRoom(h.a,room.code,'turn_limit',{turnLimitSeconds:invalid}),/30~600/);
  await h.store.updateMultiplayerRoom(h.a,room.code,'turn_limit',{turnLimitSeconds:300});
  assert.equal(read().turn_deadline_at,before.turn_deadline_at);assert.equal(read().revision,before.revision);
  const start=Date.now();await h.engine.cortexRoomOperation(h.a,room.code,{action:'commit',token,snapshot:{...h.snapshot,turns:[{status:'COMMITTED',text:'다음 비트'}]}});
  assert.ok(Date.parse(read().turn_deadline_at)>=start+300000);assert.ok(Date.parse(read().turn_deadline_at)<=Date.now()+300000);
  assert.equal(read().turn_limit_seconds,300);
  h.sqlite.prepare("UPDATE multiplayer_rooms SET status='CLOSED'").run();
  await assert.rejects(()=>h.store.updateMultiplayerRoom(h.a,room.code,'turn_limit',{turnLimitSeconds:60}),/종료/);
 }finally{h.sqlite.close()}
});

test('expired writers cannot overwrite a recovered room; key recovery and chat throttling retain Lotus rules',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{sessionId:'personal',engine:'cortex',maxPlayers:2});const code=room.code;
  await h.store.joinMultiplayerRoom(h.b,code);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,code,'ready',{ready:true,apiKeyReady:true});
  await h.store.updateMultiplayerRoom(h.a,code,'start',{});
  const old=webcrypto.randomUUID(),fresh=webcrypto.randomUUID();
  await h.engine.cortexRoomOperation(h.a,code,{action:'begin',token:old,revision:1});
  h.sqlite.exec("UPDATE multiplayer_cortex_state SET claim_expires_at='2000-01-01T00:00:00.000Z'");
  await h.engine.cortexRoomOperation(h.a,code,{action:'begin',token:fresh,revision:1});
  await assert.rejects(()=>h.engine.cortexRoomOperation(h.a,code,{action:'commit',token:old,snapshot:{...h.snapshot,turns:[{status:'COMMITTED',text:'만료된 본문'}]}}),/만료/);
  await h.engine.cortexRoomOperation(h.a,code,{action:'abort',token:fresh});
  const paused=await h.store.updateMultiplayerRoom(h.a,code,'key_failed',{});assert.equal(paused.room.status,'PAUSED_KEY');
  await assert.rejects(()=>h.store.updateMultiplayerRoom(h.a,code,'retry',{}),/키/);
  await h.store.updateMultiplayerRoom(h.a,code,'presence',{apiKeyReady:true});
  const resumed=await h.store.updateMultiplayerRoom(h.a,code,'retry',{});assert.equal(resumed.room.status,'ACTIVE');
  for(let i=0;i<5;i++)await h.engine.roomChat(h.a,code,{body:'대화 '+i,clientId:webcrypto.randomUUID()});
  await assert.rejects(()=>h.engine.roomChat(h.a,code,{body:'초과',clientId:webcrypto.randomUUID()}),/빠르게/);
  assert.equal((await h.engine.roomChat(h.b,code)).messages.length,5);
 }finally{h.sqlite.close()}
});

test('mixed Luna 6 writing and Luna 5.6 judgement retain the correct Go billing identity',()=>{
 const h=harness();try{
  const old={model:'gpt-5.6-luna',provider:'opencode-go-luna'},writer={model:'gpt-6-luna',provider:'opencode-go-luna'};
  assert.deepEqual(JSON.parse(JSON.stringify(h.engine.cortexTurnBillingIdentity([old,writer]))),{model:'gpt-6-luna',baseUrl:'https://opencode.ai/zen/go/v1'});
  assert.deepEqual(JSON.parse(JSON.stringify(h.engine.cortexTurnBillingIdentity([old]))),{model:'gpt-5.6-luna',baseUrl:'https://opencode.ai/zen/go/v1'});
  assert.deepEqual(JSON.parse(JSON.stringify(h.engine.cortexTurnBillingIdentity([{model:'gpt-5.6-luna'},{model:'gpt-6-luna'}]))),{model:'gpt-6-luna',baseUrl:'https://api.openai.com/v1'});
 }finally{h.sqlite.close()}
});

test('VN room mode is creation-only, shared jobs are membership fenced and paid expiry does not auto-regenerate',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal',presentation:'visual'});
  assert.equal(room.settings.presentation,'visual');
  await h.store.joinMultiplayerRoom(h.b,room.code);
  await assert.rejects(()=>h.store.updateMultiplayerRoom(h.a,room.code,'settings',{settings:{presentation:'novel'}}));
  assert.equal((await h.store.getMultiplayerRoom(h.b,room.code,false)).room.settings.presentation,'visual');
  const key=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode('image:sprite'))).toString('hex'),token=webcrypto.randomUUID(),other=webcrypto.randomUUID(),base={key,kind:'image',turn:0};
  await assert.rejects(()=>h.visual.visualOperation(h.outsider,room.code,{action:'read',...base}));
  assert.equal((await h.visual.visualOperation(h.a,room.code,{action:'claim',...base,token})).claimed,true);
  assert.equal((await h.visual.visualOperation(h.b,room.code,{action:'claim',...base,token:other})).claimed,false);
  h.sqlite.prepare("UPDATE multiplayer_visual_assets SET expires_at='2000-01-01'").run();
  assert.equal((await h.visual.visualOperation(h.b,room.code,{action:'lookup',keys:[key]})).rows[0].status,'uncertain');
  assert.equal((await h.visual.visualOperation(h.b,room.code,{action:'claim',...base,token:other})).claimed,false);
  const record={key:'sprite',url:'data:image/webp;base64,YQ==',camera:{head:.2},eventIdentity:['one'],apiKey:'must-not-share'};
  await assert.rejects(()=>h.visual.visualOperation(h.a,room.code,{action:'publish',...base,token,record:{...record,key:'wrong-sprite'}}),/식별자/);
  await assert.rejects(()=>h.visual.visualOperation(h.b,room.code,{action:'publish',...base,token:other,record}));
  await h.visual.visualOperation(h.a,room.code,{action:'publish',...base,token,record});
  const shared=(await h.visual.visualOperation(h.b,room.code,{action:'read',...base})).record;
  assert.equal(shared.url,record.url);assert.equal(shared.apiKey,undefined);assert.deepEqual(Array.from(shared.eventIdentity),['one']);
  assert.equal((await h.visual.visualOperation(h.a,room.code,{action:'publish',...base,token,record})).saved,true);
  assert.equal(h.objects.size,2,'one story snapshot and one shared asset');
  await h.store.updateMultiplayerRoom(h.a,room.code,'kick',{memberId:(await h.store.getMultiplayerRoom(h.b,room.code,false)).room.members.find((m:any)=>m.isSelf).id});
  await assert.rejects(()=>h.visual.visualOperation(h.b,room.code,{action:'read',...base}));
 }finally{h.sqlite.close()}
});

test('all VN paid operations belong to the originating turn author across commit and next-player handoff',async()=>{
 const h=harness();try{
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal',presentation:'visual'}),code=room.code;
  await h.store.joinMultiplayerRoom(h.b,code);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,code,'ready',{ready:true,apiKeyReady:true});
  await h.store.updateMultiplayerRoom(h.a,code,'start',{});
  const turnToken=webcrypto.randomUUID();await h.engine.cortexRoomOperation(h.a,code,{action:'begin',token:turnToken,revision:1});
  const request=(kind:string,id:string,turn:number)=>({action:'claim',key:createHash('sha256').update(kind+':'+id).digest('hex'),kind,turn,token:webcrypto.randomUUID()});
  const pending=request('image','late-portrait',1);
  for(const kind of ['cast','image','voice'])assert.equal((await h.visual.visualOperation(h.b,code,request(kind,'wrong-'+kind,1))).status,'waiting-owner');
  assert.equal((await h.visual.visualOperation(h.a,code,{...request('voice','missing-key',1),canProduce:false})).status,'needs-key');
  assert.equal((await h.visual.visualOperation(h.a,code,pending)).claimed,true);
  const snapshot={...h.snapshot,turns:[{id:'turn-1',status:'COMMITTED',text:'첫 턴'}]};
  await h.engine.cortexRoomOperation(h.a,code,{action:'commit',token:turnToken,snapshot});
  const second=webcrypto.randomUUID();await h.engine.cortexRoomOperation(h.b,code,{action:'begin',token:second,revision:2});
  for(const kind of ['cast','image','voice']){
   assert.equal((await h.visual.visualOperation(h.b,code,request(kind,'late-'+kind,1))).status,'waiting-owner');
   const late=request(kind,'late-'+kind,1);
   assert.equal((await h.visual.visualOperation(h.a,code,late)).claimed,true);
   await h.visual.visualOperation(h.a,code,{...late,action:'release'});
   assert.equal((await h.visual.visualOperation(h.a,code,request(kind,'next-'+kind,2))).status,'waiting-owner');
   const next=request(kind,'next-'+kind,2);
   assert.equal((await h.visual.visualOperation(h.b,code,next)).claimed,true);
   await h.visual.visualOperation(h.b,code,{...next,action:'release'});
  }
  await h.visual.visualOperation(h.a,code,{...pending,action:'publish',record:{key:'late-portrait',url:'data:image/webp;base64,YQ=='}});
  assert.ok((await h.visual.visualOperation(h.b,code,{...pending,action:'read'})).record);
  await assert.rejects(()=>h.visual.visualOperation(h.a,code,{...request('image','unbound',0),turn:undefined}),/원래 턴/);
  assert.equal((await h.visual.visualOperation(h.b,code,request('image','future',100))).status,'waiting-owner');
 }finally{h.sqlite.close()}
});


test('shared VN clock elects first ready, fences simultaneous gestures, finalized-only taps and survives turn handoff',async()=>{
 const h=harness();try{
  h.snapshot.turns=[{id:'prior',status:'COMMITTED',text:'첫 문단입니다.\n두 번째 문단입니다.\n세 번째 문단입니다.'}] as any;
  const {room}=await h.store.createMultiplayerRoom(h.a,{engine:'cortex',sessionId:'personal',presentation:'visual'});
  // Fixture import starts with one canonical turn.
  h.sqlite.prepare('UPDATE multiplayer_cortex_state SET turn=1 WHERE room_id=?').run(room.id);
  await h.store.joinMultiplayerRoom(h.b,room.code);
  for(const user of [h.a,h.b])await h.store.updateMultiplayerRoom(user,room.code,'ready',{ready:true,apiKeyReady:true});
  await h.store.updateMultiplayerRoom(h.a,room.code,'start',{});
  const op=(user:any,action:string,expected:number,turnId='prior')=>h.playback.vnPlaybackOperation(user,room.code,{action,expected,turnId});
  await assert.rejects(op(h.outsider,'ready',0));
  const [a,b]=await Promise.all([op(h.a,'ready',0),op(h.b,'ready',0)]);
  assert.equal(Number(a.accepted)+Number(b.accepted),1);assert.equal(a.playback.seq,1);assert.equal(b.playback.seq,1);
  assert.ok(a.playback.startsAt>=Date.now()+1000);
  // Place the shared clock within the typewriter (not yet fully shown).
  let frame={...a.playback,startsAt:Date.now()-50};
  const set=()=>h.sqlite.prepare('UPDATE multiplayer_vn_playback SET seq=?,payload_json=? WHERE room_id=?').run(frame.seq,JSON.stringify(frame),room.id);
  set();
  const taps=await Promise.all([op(h.a,'reveal',1),op(h.b,'reveal',1)]);
  assert.equal(taps.filter(x=>x.accepted).length,1);assert.equal(taps[0].playback.start,frame.start);
  assert.equal((await op(h.a,'advance',1)).accepted,false,'delayed duplicate cannot become the second tap');
  frame={...taps[0].playback,revealAt:Date.now()-1};set();
  const next=await op(h.b,'advance',frame.seq);assert.equal(next.accepted,true);assert.equal(next.playback.start,'첫 문단입니다.\n'.length);
  assert.equal(h.sqlite.prepare('SELECT turn FROM multiplayer_cortex_state').get()!.turn,1,'presentation never submits a turn');
  assert.equal((await h.store.getMultiplayerRoom(h.b,room.code,false)).playback.seq,next.playback.seq,'status poll carries only one frame');
  // Start a writer stream: its published paragraphs may auto-run, but even a
  // dishonest finalized flag cannot authorize manual taps before commit.
  const token=webcrypto.randomUUID();await h.engine.cortexRoomOperation(h.a,room.code,{action:'begin',token,revision:1});
  const text='새 비트 첫 문장입니다.\n다음 문단입니다.';
  await publishLivePresentation(h.db,room.id,'a',token,{id:'incoming',seq:1,input:'',blocks:[],visual:{text,annotations:[]}});
  const live=await op(h.a,'ready',next.playback.seq,'incoming');assert.equal(live.accepted,true);
  frame={...live.playback,startsAt:Date.now()-50000};set();
  assert.equal((await op(h.b,'advance',frame.seq,'incoming')).accepted,false);
  assert.equal((await op(h.b,'reveal',frame.seq,'incoming')).accepted,false);
  const auto=await op(h.b,'auto',frame.seq,'incoming');assert.equal(auto.accepted,true);
  const saved=await h.engine.cortexRoomOperation(h.a,room.code,{action:'commit',token,snapshot:{...h.snapshot,turns:[...h.snapshot.turns,{id:'incoming',status:'COMMITTED',text}]}});
  assert.equal(saved.turn,2);
  const after=await h.store.getMultiplayerRoom(h.b,room.code,false);
  assert.equal(after.room.currentMemberId,after.room.members.find((m:any)=>m.isSelf)!.id);
  assert.equal(after.playback.start,auto.playback.start,'new input owner does not rewind reading');assert.equal(after.playback.seq,auto.playback.seq);
  assert.equal((await op(h.b,'ready',auto.playback.seq,'incoming')).accepted,false,'reload cannot restart the current turn');
  frame={...auto.playback,startsAt:Date.now()-50000};set();
  const choices=await op(h.b,'auto',frame.seq,'incoming');assert.equal(choices.playback.phase,'choices');
  const deadline=h.sqlite.prepare('SELECT turn_deadline_at,turn_limit_seconds FROM multiplayer_rooms WHERE id=?').get(room.id)!;
  assert.equal(Date.parse(String(deadline.turn_deadline_at)),choices.playback.startsAt+Number(deadline.turn_limit_seconds)*1000,'input timer starts after everyone finishes shared reading');
  const retryToken=webcrypto.randomUUID();await h.engine.cortexRoomOperation(h.b,room.code,{action:'begin',token:retryToken,revision:2});
  await publishLivePresentation(h.db,room.id,'b',retryToken,{id:'aborted',seq:1,input:'',blocks:[],visual:{text:'중단될 공개 문장입니다.',annotations:[]}});
  const aborted=await op(h.b,'ready',choices.playback.seq,'aborted');assert.equal(aborted.accepted,true);
  assert.equal((await op(h.a,'ready',aborted.playback.seq,'incoming')).accepted,false,'active generation cannot rewind to the prior turn');
  await h.engine.cortexRoomOperation(h.b,room.code,{action:'abort',token:retryToken});
  const recovered=await op(h.b,'ready',aborted.playback.seq,'incoming');assert.equal(recovered.accepted,true);assert.equal(recovered.playback.phase,'choices');assert.equal(recovered.playback.start,auto.playback.start,'aborted preview recovers to the input boundary, never ten paragraphs back');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM multiplayer_vn_playback').get()!.n,1);
 }finally{h.sqlite.close()}
});
