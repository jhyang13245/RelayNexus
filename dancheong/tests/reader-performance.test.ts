import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readLivePresentation} from '../lib/multiplayer-live';
import {sameReaderRoom} from '../lib/multiplayer-live-timing';
import {cloudDelta,applyCloudDelta} from '../lib/cortex-cloud-delta';
import {sharedOperations} from '../lib/multiplayer-update';
import {JSDOM} from 'jsdom';

const source=fs.readFileSync('public/cortex-host.js','utf8');
const hashCode=source.slice(source.indexOf(' const localContent='),source.indexOf(' const emitReady='))+';globalThis.key=localContent;';
const workerCode=fs.readFileSync('public/cortex-cloud-worker.js','utf8');

test('1,000 beats with no displayed portraits do not repeatedly resolve the public roster',()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'});try{const source=fs.readFileSync('public/cortex-nexus-view.js','utf8');dom.window.eval(source.slice(source.indexOf('window.createNexusSpeakerMedia ='),source.indexOf('// Trigger locations')));
  let resolutions=0;const api={_scenario:()=>({runtime:{storyId:'isolated-test'}})},media=(dom.window as any).createNexusSpeakerMedia(api,()=>{resolutions++;return[]});
  for(let i=0;i<1000;i++)assert.equal(media.images({id:'turn-'+i}).length,0);assert.equal(resolutions,0);
 }finally{dom.window.close()}
});

test('1,000-beat solo and multiplayer deltas preserve every old beat, media and HUD',()=>{
 const before={schema:'CORTEX_FULL_BACKUP_V1',turns:Array.from({length:1000},(_,i)=>({id:'beat-'+i,status:'COMMITTED',text:('기존 비트 '+i+'의 보존할 본문. ').repeat(80),imageUrl:i%3===0?'https://example.test/image-'+i+'.png':'',dialogueAnnotations:[{speaker:'공개 화자',start:0,end:5}]})),media:[{id:'embedded',data:'unchanged'}],scenario:{runtime:{hud:{hp:10}}}};
 const original=JSON.stringify(before),after=structuredClone(before);after.turns.push({...after.turns[999],id:'beat-1000',text:'새로 확정된 본문'});after.scenario.runtime.hud.hp=9;
 for(const delta of [cloudDelta(before,after),sharedOperations(before,after)]){
  assert.ok(delta);assert.deepEqual(applyCloudDelta(before,delta),after);assert.equal(JSON.stringify(before),original);
  assert.ok(Buffer.byteLength(JSON.stringify(delta))<Buffer.byteLength(JSON.stringify(after))/100);
  assert.equal(delta.some(op=>op.path[0]==='media'),false);
 }
 const rewind=structuredClone(after);rewind.turns.length=999;assert.deepEqual(applyCloudDelta(after,cloudDelta(after,rewind)!),rewind);
});

test('worker hash is byte-identical to fallback; durable stamps coalesce work and invalidate edits',async()=>{
 let reads=0,posts=0,record:any={savedAt:'one',storageRevision:1,settings:{apiKey:'excluded-secret',model:'luna',custom:'keep'},turns:[{id:'turn',text:'문단\n  대사',nested:{z:1,a:2}}]};
 const api={_storageStatus:()=>({key:'account/session',revision:record.storageRevision,savedAt:record.savedAt}),_cloudLocalState:async()=>{reads++;return structuredClone(record)}};
 class LocalWorker {
  onmessage:any;onerror:any;
  postMessage(data:any){posts++;assert.equal(JSON.stringify(data).includes('excluded-secret'),false);const self={postMessage:(reply:any)=>this.onmessage({data:reply}),onmessage:null as any};
   const ctx=vm.createContext({self,crypto:webcrypto,TextEncoder});vm.runInContext(workerCode,ctx);void self.onmessage({data});}
  terminate(){}
 }
 const ctx:any=vm.createContext({api,Worker:LocalWorker,crypto:webcrypto,TextEncoder,setTimeout,clearTimeout});vm.runInContext(hashCode,ctx);
 const [a,b]=await Promise.all([ctx.key(),ctx.key()]);assert.equal(a.contentKey,b.contentKey);assert.equal(reads,1);assert.equal(posts,1);
 const fallback:any=vm.createContext({api,crypto:webcrypto,TextEncoder});vm.runInContext(hashCode,fallback);assert.equal((await fallback.key()).contentKey,a.contentKey);
 record={...record,savedAt:'two',storageRevision:2};assert.equal((await ctx.key()).contentKey,a.contentKey,'save-only timestamps are not gameplay');
 record={...record,savedAt:'three',storageRevision:3,turns:[{id:'turn',text:'바뀐 문단'}]};assert.notEqual((await ctx.key()).contentKey,a.contentKey);
 assert.equal(posts,3);
 class BrokenWorker extends LocalWorker{postMessage(){this.onerror()}}
 const broken:any=vm.createContext({api,Worker:BrokenWorker,crypto:webcrypto,TextEncoder,setTimeout,clearTimeout});vm.runInContext(hashCode,broken);assert.equal((await broken.key()).contentKey,(await ctx.key()).contentKey,'worker errors retain exact conflict identity');
});

function sqlDb(sqlite:DatabaseSync,rows:any[]=[]){return {prepare(sql:string){let args:any[]=[];return{bind(...values:any[]){args=values;return this},async first(){const row=sqlite.prepare(sql).get(...args);rows.push({sql,row});return row},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}}},async batch(statements:any[]){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
function moduleFrom(file:string,imports:Record<string,any>){const exports:any={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:(name:string)=>{const found=Object.entries(imports).find(([key])=>name.endsWith(key));if(!found)throw Error('Unexpected import '+name);return found[1]},crypto:webcrypto,Request,Response,URL,Date,TextEncoder});return exports}

test('unchanged multiplayer frames do not transfer payloads and remain identity/claim fenced',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE multiplayer_cortex_live(room_id TEXT,token TEXT,seq INTEGER,payload_json TEXT)');
 const payload={seq:9,id:'current-beat',input:'사용자 입력',blocks:[{kind:'text',text:'공개 본문'.repeat(3000)}]},rows:any[]=[],db=sqlDb(sqlite,rows);
 sqlite.prepare('INSERT INTO multiplayer_cortex_live VALUES(?,?,?,?)').run('room','claim',9,JSON.stringify(payload));
 const state={claim_token:'claim',claim_expires_at:'2099-01-01',claim_room_revision:4,revision:7},room={revision:4,status:'ACTIVE'};
 try{
  assert.equal((await readLivePresentation(db,'room',state,room,9,'current-beat'))?.unchanged,true);assert.equal(rows.at(-1).row.payload_json,null);
  assert.equal((await readLivePresentation(db,'room',state,room,8,'current-beat'))?.id,'current-beat');assert.equal((await readLivePresentation(db,'room',state,room,9,'old-beat'))?.id,'current-beat');
  assert.equal(await readLivePresentation(db,'room',{...state,claim_token:'other'},room,9,'current-beat'),null);
  assert.equal(await readLivePresentation(db,'room',state,{...room,revision:5},9,'current-beat'),null);
  assert.equal(await readLivePresentation(db,'room',{...state,claim_expires_at:'2000-01-01'},room,9,'current-beat'),null);
  sqlite.prepare('UPDATE multiplayer_cortex_live SET payload_json=?').run('{broken');assert.equal(await readLivePresentation(db,'room',state,room,9,'current-beat'),null);
 }finally{sqlite.close()}
});

test('room equality ignores only self presence, not turn, settings, membership or peer presence',()=>{
 const room={currentMemberId:'a',revision:4,settings:{seconds:90},members:[{id:'a',isSelf:true,lastSeenAt:'one'},{id:'b',lastSeenAt:'one'}]};
 const self=structuredClone(room);self.members[0].lastSeenAt='two';assert.equal(sameReaderRoom(room,self),true);
 for(const change of [(v:any)=>v.revision++,(v:any)=>v.currentMemberId='b',(v:any)=>v.settings.seconds=60,(v:any)=>v.members[1].lastSeenAt='two',(v:any)=>v.members.pop()]){const next=structuredClone(room);change(next);assert.equal(sameReaderRoom(room,next),false)}
});

test('combined admission and empty-delta receipts preserve account, revision, epoch and takeover fences without snapshot reads',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`CREATE TABLE cortex_session_leases(id TEXT PRIMARY KEY,owner_key TEXT,device_id TEXT,client_id TEXT,expires_at TEXT,updated_at TEXT,takeover_client_id TEXT,takeover_requested_at TEXT,epoch TEXT);
 CREATE TABLE cortex_cloud_sessions(id TEXT PRIMARY KEY,owner_key TEXT,project_id TEXT,source_project_id TEXT,name TEXT,turn INTEGER,location TEXT,preview TEXT,revision INTEGER,updated_at TEXT,last_writer_id TEXT,snapshot_json TEXT);
 INSERT INTO cortex_cloud_sessions VALUES('session','owner','project','source','제목',300,'장소','미리보기',17,'now','mp-follow:room','large snapshot must not be read');`);
 const rows:any[]=[],db=sqlDb(sqlite,rows),simulation={database:async()=>db,requireOwnerKey:async(r:Request)=>{const owner=r.headers.get('x-owner');if(!owner)throw Error('login required');return owner}},store=moduleFrom('lib/cortex-cloud-store.ts',{'simulation-store':simulation});
 let snapshotReads=0;const imports={'next/server':{NextResponse:{json:Response.json}},'simulation-store':simulation,'cortex-cloud-store':store,'multiplayer-personal':{readCortexSnapshot:async()=>{snapshotReads++;throw Error('unexpected snapshot read')}},'cortex-cloud-delta':{},'multiplayer-snapshot':{},'runtime-json-store':{}};
 const lease=moduleFrom('app/api/cortex/sessions/[sessionId]/lease/route.ts',imports),session=moduleFrom('app/api/cortex/sessions/[sessionId]/route.ts',imports),context={params:Promise.resolve({sessionId:'session'})};
 const request=(body:any,owner='owner')=>new Request('https://test/api',{method:'POST',headers:{'content-type':'application/json','x-owner':owner},body:JSON.stringify(body)});
 const body={action:'acquire',deviceId:'device',clientId:'client-000000000000',exclusive:true,includeSession:true};
 try{
  const admitted=await lease.POST(request(body),context),receipt=await admitted.json();assert.equal(admitted.status,200);assert.equal(receipt.session.revision,17);assert.equal(receipt.session.turn,300);assert.ok(receipt.lease.epoch.startsWith('write:'));
  assert.equal(sqlite.prepare('SELECT last_writer_id FROM cortex_cloud_sessions').get()!.last_writer_id,'mp-detached');
  const summaryRows=rows.filter(r=>r.sql.startsWith('SELECT id,project_id'));assert.equal(summaryRows.length,1);assert.equal('snapshot_json' in summaryRows[0].row,false);
  const summary=await session.GET(new Request('https://test/api?summary=1',{headers:{'x-owner':'owner'}}),context);assert.equal(summary.status,200);assert.equal(snapshotReads,0);
  assert.equal((await session.GET(new Request('https://test/api?summary=1',{headers:{'x-owner':'other'}}),context)).status,404);
  const delta={operations:[],expectedRevision:17,deviceId:'device',leaseEpoch:receipt.lease.epoch};assert.equal((await session.PUT(request(delta),context)).status,200);
  assert.equal((await session.PUT(request({...delta,leaseEpoch:'wrong'}),context)).status,409);
  assert.equal((await session.PUT(request({...delta,deviceId:'other'}),context)).status,409);
  assert.equal((await session.PUT(request({...delta,expectedRevision:16}),context)).status,409);
  assert.equal((await session.PUT(request(delta,'other'),context)).status,409);assert.equal(snapshotReads,0);
  assert.equal((await lease.POST(request({...body,deviceId:'phone',clientId:'phone-000000000000'}),context)).status,409);
  const legacy=await lease.POST(request({...body,action:'renew',epoch:receipt.lease.epoch,includeSession:false}),context);assert.equal('session' in await legacy.json(),false);
  sqlite.prepare("UPDATE cortex_session_leases SET takeover_client_id='phone-000000000000'").run();const conflict=await lease.POST(request({...body,action:'renew',epoch:receipt.lease.epoch}),context);assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'CORTEX_TAKEOVER_REQUESTED');
  sqlite.prepare("UPDATE cortex_session_leases SET expires_at='2000-01-01'").run();assert.equal((await session.PUT(request(delta),context)).status,409);
  sqlite.prepare("UPDATE cortex_cloud_sessions SET last_writer_id='mp-deleted'").run();assert.equal(await store.getCortexCloudSummary('owner','session'),null);assert.equal((await store.listCortexCloudSessions('owner')).length,0);
 }finally{sqlite.close()}
});
