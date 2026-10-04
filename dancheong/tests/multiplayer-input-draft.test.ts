import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {publishInputDraft,readInputDraft} from '../lib/multiplayer-input-draft';
import {createDraftQueue} from '../lib/multiplayer-draft-queue';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('input drafts are bounded, current-player/turn fenced, separate from generation and expire',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`CREATE TABLE multiplayer_cortex_live(room_id TEXT PRIMARY KEY,token TEXT,seq INTEGER,payload_json TEXT,updated_at TEXT);
 CREATE TABLE multiplayer_rooms(id TEXT,revision INTEGER,current_member_id TEXT,status TEXT);
 CREATE TABLE multiplayer_members(id TEXT,room_id TEXT,account_id TEXT,status TEXT);
 CREATE TABLE multiplayer_cortex_state(room_id TEXT,claim_token TEXT,claim_expires_at TEXT);
 INSERT INTO multiplayer_rooms VALUES('room',7,'player','ACTIVE');INSERT INTO multiplayer_members VALUES('player','room','account','READY');INSERT INTO multiplayer_cortex_state VALUES('room',NULL,NULL);`);
 const db={prepare(sql:string){let args:any[]=[];return{bind(...v:any[]){args=v;return this},async run(){return{meta:{changes:sqlite.prepare(sql).run(...args).changes}}},async first(){return sqlite.prepare(sql).get(...args)}}}};
 try{const body={revision:7,expectedSeq:0,text:'한글 입력\n  공백 유지',operationId:crypto.randomUUID()},room={id:'room',revision:7,current_member_id:'player',status:'ACTIVE'},state={};
  assert.equal((await publishInputDraft(db,'room','other',body)).accepted,false);assert.equal((await publishInputDraft(db,'room','account',{...body,revision:6})).accepted,false);
  assert.equal((await publishInputDraft(db,'room','account',body)).accepted,true);assert.equal((await publishInputDraft(db,'room','account',body)).accepted,true);
  let shown=await readInputDraft(db,room,state,0,7);assert.equal(shown?.text,body.text);assert.equal((await readInputDraft(db,room,state,1,7))?.unchanged,true);
  const next={...body,expectedSeq:1,text:'',operationId:crypto.randomUUID()};assert.equal((await publishInputDraft(db,'room','account',next)).accepted,false,'rate bounded');
  sqlite.prepare("UPDATE multiplayer_cortex_live SET updated_at='2000-01-01'").run();assert.equal((await publishInputDraft(db,'room','account',next)).accepted,true);assert.equal((await readInputDraft(db,room,state,0,7))?.text,'');
  const generating={claim_token:'generating',claim_expires_at:'2099-01-01'};sqlite.prepare("UPDATE multiplayer_cortex_state SET claim_token='generating',claim_expires_at='2099-01-01'").run();
  assert.equal((await publishInputDraft(db,'room','account',{...body,expectedSeq:2})).accepted,false);assert.equal(await readInputDraft(db,room,generating,0,7),null);
  assert.equal(await readInputDraft(db,{...room,revision:8},state,0,7),null);assert.equal(await readInputDraft(db,{...room,status:'CLOSED'},state,0,7),null);
  sqlite.prepare("UPDATE multiplayer_cortex_live SET updated_at='2000-01-01'").run();assert.equal(await readInputDraft(db,room,state,0,7),null);
  await assert.rejects(publishInputDraft(db,'room','account',{...body,text:'a'.repeat(12001)}));
 }finally{sqlite.close()}
});
test('many keystrokes coalesce and failed/slow uploads never build a queue',async()=>{
 let now=1000,release:(r:any)=>void=()=>{};const requests:any[]=[];const queue=createDraftQueue(body=>{requests.push(body);return new Promise(resolve=>release=resolve)},()=>now);
 queue.reset(7);for(let i=0;i<100;i++)queue.change('입력 '+i);const first=queue.flush();assert.equal(requests.length,1);assert.equal(requests[0].text,'입력 99');
 queue.change('마지막');now+=1000;await queue.flush();assert.equal(requests.length,1);release({accepted:true,seq:1});await first;
 const second=queue.flush();assert.equal(requests[1].text,'마지막');assert.equal(requests[1].expectedSeq,1);queue.reset(0);release({accepted:true,seq:2});await second;now+=1000;await queue.flush();assert.equal(requests.length,2);
});
test('shared input preserves local draft, whitespace and IME composition and never renders HTML',()=>{
 const dom=new JSDOM('<div><textarea id="input">나의 비공개 대기 초안</textarea></div>',{runScripts:'outside-only'});try{const w=dom.window as any,posts:any[]=[];
  const code=fs.readFileSync('public/cortex-nexus-view.js','utf8');w.eval(code.slice(0,code.indexOf('// Quote identity')));const ui=w.createNexusMultiplayerInput((type:any,data:any)=>posts.push({type,...data})),input=w.document.getElementById('input');
  ui.update({canWrite:false,watch:true,revision:7,memberId:'person',name:'친구'});ui.receive({revision:7,memberId:'person',text:'<img src=x>\n  한글'});assert.equal(input.value,'나의 비공개 대기 초안');assert.equal(input.hidden,true);assert.equal(w.document.querySelector('.nexus-remote-input-body').textContent,'<img src=x>\n  한글');assert.equal(w.document.querySelector('img'),null);assert.equal(posts.length,0);
  ui.update({canWrite:true,watch:false,revision:8});assert.equal(input.hidden,false);assert.equal(w.document.querySelector('.nexus-remote-input').hidden,true);assert.equal(posts.length,1);
  input.dispatchEvent(new w.Event('compositionstart'));input.value='가';input.dispatchEvent(new w.Event('input'));assert.equal(posts.length,1);input.dispatchEvent(new w.Event('compositionend'));assert.equal(posts.at(-1).text,'가');
  ui.update({canWrite:false,watch:false,revision:8});assert.equal(w.document.querySelector('.nexus-input-sharing-notice').hidden,true);
 }finally{dom.window.close()}
});
