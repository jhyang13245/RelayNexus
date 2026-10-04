import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../vendor/cortex/instant-runtime.js';
const M=(globalThis as any).CortexInstantMemory;
const turns=(n:number)=>Array.from({length:n},(_,i)=>({id:`t${i+1}`,status:'COMMITTED',input:`행동 ${i+1}`,text:`${i+1}번째 공개 문장.`,sourceEventId:'instant-scene'}));
function summarize(rows:any[],memory:any={}){for(;;){const job=M.nextJob(rows,memory);if(!job||job.kind!=='TEN_BITS')return memory;memory=M.accept(memory,job,`비트 ${job.start}부터 ${job.end}까지의 기록.`,rows);}}

test('Instant keeps ten raw bits, summarizes completed tens, and ignores rejected/streaming rows',()=>{
  assert.equal(M.nextJob(turns(9)),null);
  const rows=turns(25),memory=summarize(rows),p=M.plan([...rows,{id:'bad',status:'REJECTED',text:'거부된 초안'},{status:'STREAMING',text:'미완료 초안'}],memory);
  assert.equal(memory.summaries.length,2);assert.equal(p.recent.length,10);
  assert.equal(p.recent[0].id,'t16');assert.equal(p.recent.at(-1).id,'t25');
  assert.deepEqual(p.summaries.map((r:any)=>[r.start,r.end]),[[1,10]]);
  assert.deepEqual(p.rawFallback.map((r:any)=>r.id),['t11','t12','t13','t14','t15']);
  assert.equal(M.plan(turns(25),{}).rawFallback.length,15);
  assert.throws(()=>M.accept({},M.nextJob(rows),'가'.repeat(1201),rows),/LENGTH/);
});

test('Instant archives only twenty summaries, keeps originals and supports separate 200-bit archives',()=>{
  const rows=turns(410);let memory=summarize(rows);
  assert.equal(M.nextJob(turns(199),summarize(turns(199))),null);
  let job=M.nextJob(rows,memory);assert.equal(job.kind,'TWENTY_SUMMARIES');assert.equal(job.source.length,20);assert.equal(job.start,1);assert.equal(job.end,200);
  assert.throws(()=>M.accept(memory,job,'가'.repeat(5501),rows),/LENGTH/);
  memory=M.accept(memory,job,'가'.repeat(5000),rows);
  job=M.nextJob(rows,memory);assert.equal(job.start,201);assert.equal(job.end,400);
  memory=M.accept(memory,job,'나'.repeat(5000),rows);
  assert.equal(memory.summaries.length,41);assert.equal(memory.archives.length,2);assert.equal(M.nextJob(rows,memory),null);
  const p=M.plan(rows,memory);assert.equal(p.summaries.length,2);assert.equal(p.recent[0].id,'t401');assert.equal(p.rawFallback.length,0);
  assert.equal(M.plan(turns(200),memory).summaries.length,19,'archive overlapping recent ten is not substituted early');
});

test('Instant rewind, changed sources, and stale async summaries never overwrite current memory',()=>{
  const rows=turns(210);let memory=summarize(rows);const job=M.nextJob(rows,memory);
  memory=M.accept(memory,job,'압축 기억',rows);const original=JSON.stringify(memory);
  const changed=structuredClone(rows);changed[0].text='수정된 공개 문장';
  assert.throws(()=>M.accept(memory,job,'늦게 도착한 압축',changed),/SOURCE_CHANGED/);
  const p=M.plan(changed,memory);assert.equal(p.summaries.some((r:any)=>r.end===200&&r.start===1),false);assert.equal(p.rawFallback.length,10);
  const rewound=M.plan(rows.slice(0,15),memory);assert.equal(rewound.recent.length,10);assert.equal(rewound.rawFallback.length,5);
  assert.equal(JSON.stringify(memory),original);
});

test('Canon accumulates three-event summaries without archive jobs up to 250 events',()=>{
  const source=fs.readFileSync('vendor/cortex/parts/04.part','utf8');
  const start=source.indexOf('/* Public prose is the narrative authority.'),end=source.indexOf('/* Studio v2.1:',start);
  const c:any={structuredClone};vm.runInNewContext(source.slice(start,end),c);const P=c.CortexProseMemory;
  const rows=turns(250).map((r,i)=>({...r,sourceEventId:`e${i+1}`}));let memory:any={};let count=0;
  for(;;){const job=P.nextJob(rows,'e250',memory);if(!job)break;assert.equal(job.kind,'THREE_EVENTS');memory=P.accept(memory,job,`세 사건의 기록 ${++count}`,rows);}
  assert.equal(count,83);assert.equal(memory.summaries.length,83);
  const p=P.plan(rows,'e250',memory);assert.equal(p.recentEventIds.length,3);assert.ok(p.summaries.length>=82);
  assert.doesNotMatch(P.nextJob.toString(),/kind:'ARCHIVE'/);
});
