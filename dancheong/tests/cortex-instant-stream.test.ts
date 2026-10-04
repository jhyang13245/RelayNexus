import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {unzipSync,strFromU8} from 'fflate';
import {createCortexInstantStream,normalizeInstantWorld} from '../lib/cortex-instant-stream';
import {HeadlessCortex,makeModel} from './cortex/harness.mjs';
import {installInstantModel} from './cortex/instant-model.mjs';
import '../vendor/cortex/occurrence-runtime.js';
import {createDemoPreset} from '../features/jieum/demo-presets';
import {exportScenarioPack} from '../features/jieum/studio-export';
import {inspectInstantContext} from '../features/jieum/instant-context-preflight';
const R=(globalThis as any).CortexInstant;
const files=()=>Object.fromEntries(Object.entries(unzipSync(fs.readFileSync('tests/fixtures/studio-2.2-instant.zip'))).filter(([p])=>p.endsWith('.json')).map(([p,v])=>[p,JSON.parse(strFromU8(v))]));
const make=()=>{const f=files(),session=R.adapt(f,{},(p:any)=>({...p,source:p,publicProfile:p.publicInfo})),scenario=R.toScenario(session);return {f,session,scenario}};
const valid=()=>({dialogue:[],narration:'서준은 동생을 도왔다. 열쇠를 작업대 위에 놓았다.',recommendations:['열쇠를 살핀다','문을 연다','서민에게 묻는다'],statChanges:[{id:'trust',delta:2,evidence:'동생을 도왔다.'}],relationshipChanges:[],memoryQuotes:['열쇠를 작업대 위에 놓았다.'],ending:{ended:false,evidence:''},world:{day:0,time:'08:00:10',location:'작업실',evidence:'작업대 위에 놓았다.'},presentCharacterIds:['hero','sibling']});
const mock=(result:any,completed=true)=>async (_url:any,init:any)=>{const body=JSON.parse(init.body);if(!body.stream)return Response.json({status:'completed',output_text:'{"reject":false}'});const text=JSON.stringify(result),wire=[...text].map(delta=>`data: ${JSON.stringify({type:'response.output_text.delta',delta})}\n\n`).join('')+(completed?'data: {"type":"response.completed","response":{"status":"completed"}}\n\n':'');return new Response(wire)};
const withDialogue=()=>({...valid(),narration:valid().narration+'\n“내가 확인할게.”\n“천천히 하세요.”',dialogue:[{quoteText:'“내가 확인할게.”',characterId:'hero',speakerName:'서준',quoteKind:'SPEECH'},{quoteText:'“천천히 하세요.”',characterId:'',speakerName:'지나가던 행인',quoteKind:'SPEECH'}]});

test('Instant context deduplicates opening prose without changing authored rules, input or package',()=>{
  const {scenario:sc}=make();
  const profile=sc.runtime.instantStory.startProfiles[0];
  profile.prologue='변하지 않을 오프닝. '.repeat(70);profile.recommendedReplies=['추천 입력만'];
  sc.runtime.packageContract.openingContract.openingLine=profile.prologue;
  const before=JSON.stringify(sc),cast=[{...sc.protagonist,allowedAssetRefs:['private/internal.png'],referenceMode:'PRIMARY',visualDisclosure:'PUBLIC'}],input='열쇠를 본다';
  const ctx=R.context(sc,[],input,cast);
  assert.equal(JSON.stringify(ctx).split(profile.prologue).length-1,1);
  assert.equal(ctx.startProfile.recommendedReplies,undefined);assert.equal(ctx.characters[0].allowedAssetRefs,undefined);
  assert.deepEqual(ctx.worldRules,sc.runtime.instantStory.worldRules);assert.equal(ctx.input,input);assert.equal(JSON.stringify(sc),before);
  sc.runtime.instantState.turnCount=1;
  const later=R.context(sc,[{status:'COMMITTED',input:'첫 행동',text:'이미 실행한 행동과 결과.'}],'계속',cast);
  assert.equal(later.startProfile.prologue,undefined);assert.equal(later.opening.openingLine,undefined);assert.equal(later.recent.at(-1).text,'이미 실행한 행동과 결과.');
});

test('context overflow is a configuration error with counts, no upstream call, and no retry-only advice',async()=>{
  const {scenario:sc}=make();sc.runtime.instantStory.corePrompt='필수 설정'.repeat(6000);
  let calls=0;
  const wire=await createCortexInstantStream({scenario:sc,turns:[],input:'계속',turnId:'over-budget',apiKey:'sk-test',publicCast:[sc.protagonist]},(async()=>{calls++;throw Error('must not call')}) as typeof fetch).text();
  assert.equal(calls,0);assert.match(wire,/CONTEXT_BUDGET_EXCEEDED/);assert.match(wire,/"contextBudget":\{"required":\d+,"maximum":\d+\}/);assert.match(wire,/같은 입력을 반복하면 해결되지 않습니다/);assert.doesNotMatch(wire,/event: narration_commit|event: done/);
});

test('Instant world accepts minute precision, ignores ungrounded metadata, and rejects grounded malformed time',async()=>{
  const {scenario:sc}=make(),grounded={...valid(),narration:'검사실 시계가 12시 18분을 가리켰다.',statChanges:[],memoryQuotes:[],presentCharacterIds:['hero'],world:{day:0,time:'12:18',location:'검사실',evidence:'12시 18분'}};
  assert.equal(normalizeInstantWorld(grounded,sc.world).time,'12:18:00');
  assert.deepEqual(normalizeInstantWorld({...grounded,world:{day:-1,time:'정오',location:'',evidence:''}},sc.world),{...sc.world,evidence:''});
  assert.throws(()=>normalizeInstantWorld({...grounded,world:{...grounded.world,time:'정오'}},sc.world),/INSTANT_WORLD_INVALID/);
  const wire=await createCortexInstantStream({scenario:sc,turns:[],input:'검사실로 간다',turnId:'minute-time',apiKey:'test',publicCast:[sc.protagonist,...sc.characters]},mock(grounded) as typeof fetch).text();
  assert.match(wire,/event: done/);assert.match(wire,/"time":"12:18:00"/);
});

test('Jieum preflight distinguishes oversized context from unfinished runtime without altering source',()=>{
  const f=files(),prompt='필수 설정'.repeat(6000);
  f['project.json'].instantStory.corePrompt=prompt;f['rules/instant_story_runtime.json'].corePrompt=prompt;
  const original=JSON.stringify(f),report=inspectInstantContext(f);
  assert.equal(report.status,'BASE_CONTEXT_EXCEEDED');assert.ok(report.probes.some(p=>!p.fits&&p.kind==='base'));assert.equal(JSON.stringify(f),original);
  f['rules/instant_story_runtime.json'].enabled=false;assert.equal(inspectInstantContext(f).status,'RUNTIME_INVALID');
});

test('Jieum full Instant demo exports a shared context preflight and executes its first action',async()=>{
  const summary=await exportScenarioPack(createDemoPreset('giseong_instant_story'),false);
  const entries=unzipSync(new Uint8Array(await summary.blob.arrayBuffer()));
  const report=JSON.parse(strFromU8(entries['reports/instant-context-preflight.json'])),runtimeProject=JSON.parse(strFromU8(entries['project.json'])),editorProject=JSON.parse(strFromU8(entries['studio/project-snapshot.json'])).project;
  assert.equal(report.status,'READY');assert.ok(report.probes.length>=4);assert.ok(runtimeProject.instantStory.contextBudget.maxDynamicPromptChars>=Math.max(...report.probes.map((probe:any)=>probe.requiredChars)));assert.equal(editorProject.instantStory.contextBudget.maxDynamicPromptChars,10000);assert.deepEqual(Object.keys(runtimeProject.world),['overview']);assert.match(runtimeProject.player.publicInfo,/\[외형 특징\]/u);
  const model:any=makeModel(),fallback=model.fetch;let requests=0;
  model.fetch=(url:any,init:any)=>{
    if(!String(url).includes('/api/simulate/stream'))return fallback(url,init);
    requests++;const body=JSON.parse(init.body);
    return Promise.resolve(createCortexInstantStream(body,mock({...valid(),narration:'복도 끝에서 안내 방송이 울렸다.',dialogue:[],statChanges:[],memoryQuotes:[],presentCharacterIds:[body.scenario.protagonist.id],world:{...body.scenario.world,evidence:''}}) as typeof fetch));
  };
  installInstantModel(model,{onWriter:()=>requests++,prose:()=> '복도 끝에서 안내 방송이 울렸다.',hud:()=>({statChanges:[],relationshipChanges:[],world:null,presentCharacterIds:[]})});
  const app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model}).open();
  try{const bytes=new Uint8Array(await summary.blob.arrayBuffer()),imported=await app.api.inspectNexusPackage({name:'instant.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer});app.api.applyImportedState({canonicalSession:imported.canonicalSession,turns:[]},{persistState:false});assert.equal(app.scenario.world.time,'12:18:00');app.api._setSettings({apiKey:'test',typingSpeed:'instant'});const turn=await app.turn('능력 측정을 위해 검사실로 향한다.');assert.equal(turn.status,'COMMITTED',turn.diagnostic);assert.equal(requests,1);assert.equal(app.scenario.runtime.instantState.turnCount,1)}finally{app.close()}
});

test('optional supplied Instant backup resumes all rejected inputs within its original budget', {skip:!process.env.DANCHEONG_INSTANT_BACKUP}, async()=>{
  const bytes=fs.readFileSync(process.env.DANCHEONG_INSTANT_BACKUP!);
  const backup=JSON.parse(strFromU8(unzipSync(bytes)['backup.json']));
  const original=JSON.stringify(backup);
  const app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model:makeModel()}).open();
  try{const sc=backup.scenario,cast=[sc.protagonist,...sc.characters].map((p:any)=>app.win.CortexTurnExperience.publicCharacter(p,sc)).filter(Boolean);
    for(const turn of backup.turns){const ctx=R.context(sc,backup.turns,turn.input,cast);assert.ok(JSON.stringify(ctx).length<=sc.runtime.instantStory.contextBudget.maxDynamicPromptChars);assert.equal(ctx.input,turn.input);assert.deepEqual(ctx.worldRules,sc.runtime.instantStory.worldRules);assert.deepEqual(ctx.invariants,sc.runtime.instantStory.protagonistInvariants);if(sc.title.includes('기성학원'))assert.equal(ctx.world.time,'12:18:00')}
    const wire=await createCortexInstantStream({scenario:sc,turns:backup.turns,input:backup.turns[0].input,turnId:'backup-resume',apiKey:'test',publicCast:cast},mock({...valid(),narration:'복도 끝에서 안내 방송이 울렸다.',dialogue:[],statChanges:[],memoryQuotes:[],presentCharacterIds:[sc.protagonist.id],world:{...sc.world,evidence:''}}) as typeof fetch).text();assert.match(wire,/event: done/);if(sc.title.includes('기성학원'))assert.match(wire,/"world":\{"day":0,"time":"12:18:00"/);assert.equal(JSON.stringify(backup),original);
  }finally{app.close()}
});
test('Instant compatibility sidecars preserve literal names; invalid quote anchors abort',async()=>{
  const {scenario:sc}=make(),body={scenario:sc,turns:[],input:'열쇠를 놓는다',turnId:'speaker-a',apiKey:'sk-test',publicCast:[sc.protagonist,...sc.characters]};
  const text=await createCortexInstantStream(body,mock(withDialogue()) as typeof fetch).text();
  assert.match(text,/event: done/);assert.match(text,/"bindingVersion":2/);assert.match(text,/"speakerName":"지나가던 행인"/);assert.match(text,/"source":"WRITER_PUBLIC_NAME"/);
  for(const change of [{speakerName:'NPC_SECRET'},{quoteText:'“원문에 없는 문장.”'}]){
    const bad=withDialogue();Object.assign(bad.dialogue[0],change);const failed=await createCortexInstantStream(body,mock(bad) as typeof fetch).text();assert.match(failed,/event: turn_abort/);assert.doesNotMatch(failed,/event: narration_commit/);
  }
  for(const characterId of ['','missing','sibling']){
    const result=withDialogue();result.dialogue[0].characterId=characterId;
    const wire=await createCortexInstantStream(body,mock(result) as typeof fetch).text();
    assert.match(wire,/event: done/);
    const sidecar=JSON.parse(wire.split('event: turn_sidecar\ndata: ')[1].split('\n\n')[0]),a=sidecar.result.dialogueAnnotations[0];
    assert.equal(a.speakerName,'서준');assert.equal(a.source,'WRITER_PUBLIC_NAME');assert.equal(a.characterId,characterId?'':'hero');
  }
});
test('actual Studio ZIP source hash, exclusive runtime and cache recovery',async()=>{const {f,session}=make();await R.verifySource(f);assert.equal(session.eventGraph.roots.length,0);assert.equal(session.package.instantStory.corePrompt,f['project.json'].instantStory.corePrompt);f['runtime/keyword_index.json'].sourcePackageSha256='0'.repeat(64);assert.equal(R.fromFiles(f).cacheStatus.keyword_index,'REBUILT_FROM_PROJECT');f['project.json'].title='changed';await assert.rejects(()=>R.verifySource(f),/SOURCE_HASH_MISMATCH/);f['manifest.json'].requiredFeatures.push('unsupported');assert.throws(()=>R.fromFiles(f),/UNSUPPORTED_FEATURE/)});
test('keyword activation, stat clamping, idempotency and scheduled endings',()=>{const {scenario:sc}=make(),cast=[sc.protagonist,...sc.characters];let ctx=R.context(sc,[],'문을 본다',cast);assert.equal(ctx.activeKeywordNotes.length,0);ctx=R.context(sc,[],'열쇠를 본다',cast);assert.equal(ctx.activeKeywordNotes.length,1);assert.equal(ctx.endingDue,false);const response=valid();response.statChanges[0].delta=100;const next=R.apply(sc,ctx,response,'a');assert.equal(next.stats.trust,10);sc.runtime.instantState=next;assert.deepEqual(R.apply(sc,ctx,response,'a'),next);ctx=R.context(sc,[],'계속',cast);assert.equal(ctx.stats[0].activeTiers[0].id,'high');assert.throws(()=>R.apply(sc,ctx,{...valid(),ending:{ended:true,evidence:'동생을 도왔다.'}},'b'),/ENDING_NOT_DUE/);sc.runtime.instantState.turnCount=2;ctx=R.context(sc,[],'계속',cast);assert.equal(ctx.endingDue,true)});
test('SSE only publishes complete validated narration and state',async()=>{const {scenario:sc}=make(),body={scenario:sc,turns:[],input:'열쇠를 놓는다',turnId:'turn-a',apiKey:'sk-test',publicCast:[sc.protagonist,...sc.characters]};const text=await createCortexInstantStream(body,mock(valid()) as typeof fetch).text();assert.match(text,/event: done/);assert.match(text,/"trust":4/);assert.ok(text.indexOf('narration_commit')>text.indexOf('turn_ack'));assert.equal(sc.runtime.instantState.turnCount,0);for(const [result,completed]of [[valid(),false],[{...valid(),statChanges:[{id:'trust',delta:1,evidence:'없는 내용'}]},true],[{...valid(),narration:'작가 추천\n1. 비밀을 읽는다'},true]] as const){const failed=await createCortexInstantStream(body,mock(result,completed) as typeof fetch).text();assert.match(failed,/event: turn_abort/);assert.doesNotMatch(failed,/event: done|event: narration_commit/)} });
test('whole app ZIP import, Instant turn, abort, rewind and durable restart',async()=>{
  const model:any=makeModel(),ordinary=model.fetch;let fail=false;
  model.fetch=(url:any,init:any)=>String(url).includes('/api/simulate/stream')?Promise.resolve(createCortexInstantStream(JSON.parse(init.body),mock(withDialogue(),!fail) as typeof fetch)):ordinary(url,init);
  installInstantModel(model,{fail:()=>fail});
  let app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model}).open();
  try{
    const bytes=fs.readFileSync('tests/fixtures/studio-2.2-instant.zip');
    const imported=await app.api.inspectNexusPackage({name:'test.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)});
    app.api.applyImportedState({canonicalSession:imported.canonicalSession,turns:[]},{persistState:false});app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
    const first=await app.turn('열쇠를 놓는다');assert.equal(first.status,'COMMITTED',JSON.stringify(first));assert.equal(app.scenario.runtime.instantState.stats.trust,4);assert.equal(app.scenario.runtime.eventLedger.sealed.length,0);assert.equal(first.recommendations.length,3);
    fail=true;const rejected=await app.turn('실패 시험');assert.equal(rejected.status,'REJECTED');assert.equal(rejected.text,'');assert.equal(app.scenario.runtime.instantState.turnCount,1);
    const saved=app.close();app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model,...saved}).open();assert.equal(app.scenario.runtime.instantState.stats.trust,4);assert.equal(app.scenario.runtime.instantStory.statRules[0].id,'trust');assert.equal(app.turns[0].dialogueAnnotations[1].speakerName,'지나가던 행인');assert.equal(app.turns[0].dialogueAnnotations[0].quoteText,'“내가 확인할게.”');
    app.win.confirm=()=>true;await app.api._rewind();assert.equal(app.scenario.runtime.instantState.turnCount,0);assert.equal(app.scenario.runtime.instantState.stats.trust,2);
  }finally{app.close()}
});
test('Instant ten-bit memory is generated in the actual app, persisted, restored and used by writer context',async()=>{
  const model:any=makeModel(),ordinary=model.fetch;let memoryCalls=0,contextSeen:any;
  model.fetch=(url:any,init:any)=>{
    const body=init?.body?JSON.parse(init.body):{};
    if(String(url).includes('/api/simulate/stream'))return Promise.resolve(createCortexInstantStream(body,(async(u:any,o:any)=>{const req=JSON.parse(o.body);if(req.stream)contextSeen=JSON.parse(req.input[1].content);return mock(withDialogue())(u,o);}) as typeof fetch));
    let job:any;try{job=JSON.parse(body.input?.[1]?.content?.[0]?.text||'{}')}catch{}
    if(job?.kind==='TEN_BITS'){memoryCalls++;return Promise.resolve({ok:true,status:200,json:async()=>({status:'completed',output_text:'서준은 동생을 돕고 열쇠를 작업대에 놓았다. 약속은 아직 미해결이다.'})});}
    return ordinary(url,init);
  };
  installInstantModel(model,{onWriter:(ctx:any)=>contextSeen=ctx});
  let app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model}).open();
  try{
    const bytes=fs.readFileSync('tests/fixtures/studio-2.2-instant.zip'),imported=await app.api.inspectNexusPackage({name:'test.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)});
    app.api.applyImportedState({canonicalSession:imported.canonicalSession,turns:[]},{persistState:false});app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
    for(let i=0;i<10;i++)assert.equal((await app.turn(`기억 검수 ${i+1}`)).status,'COMMITTED');
    for(let i=0;i<40&&!app.scenario.runtime.instantMemory?.summaries?.length;i++)await app.settle(50);
    assert.equal(memoryCalls,1);assert.equal(app.scenario.runtime.instantMemory.summaries.length,1);
    await app.settle(100);
    const saved=app.close();app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model,...saved}).open();
    assert.equal(app.scenario.runtime.instantMemory.summaries[0].end,10);
    for(let i=10;i<21;i++)assert.equal((await app.turn(`기억 검수 ${i+1}`)).status,'COMMITTED');
    assert.equal(contextSeen.recent.length,10);assert.equal(contextSeen.recent[0].input,'기억 검수 11');assert.equal(contextSeen.memories.length,1);
    app.win.confirm=()=>true;await app.api._rewind();assert.equal(app.scenario.runtime.instantState.turnCount,20);
  }finally{app.close()}
});

test('occurrence selects eligible successors and falls back without fabricating completion',async()=>{
  const O=(globalThis as any).CortexOccurrence,sc={world:{location:'작업실'},event:{id:'a',cortexDesign:{occurrenceEnabled:true,occurrence:'문이 열림'},nextEvent:{id:'b',cortexDesign:{occurrenceEnabled:true,occurrence:'작업실 안에 있다'}}},runtime:{eventLedger:{sealed:[]}}};
  const selected=await O.select(sc,async(e:any)=>({verdict:e.id==='a'?'FALSE':'TRUE',evidence:'작업실'}));assert.equal(selected.scenario.event.id,'b');assert.deepEqual(selected.scenario.world,sc.world);assert.equal(selected.scenario.runtime.eventLedger.sealed.length,0);assert.equal(sc.event.id,'a');assert.equal(selected.scenario.runtime.occurrenceDecisions.length,2);
  const fallback=await O.select(sc,async()=>({verdict:'UNKNOWN',evidence:''}));assert.equal(fallback.selected,true);assert.equal(fallback.scenario.event.id,'a');assert.equal(fallback.scenario.runtime.occurrenceBridge.reason,'OCCURRENCE_UNCERTAIN');assert.deepEqual(fallback.scenario.world,sc.world);assert.equal(fallback.scenario.runtime.eventLedger.sealed.length,0);assert.equal(sc.event.id,'a');
});
test('public facts survive source normalization; recommendation tails never become history',async()=>{
  const app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model:makeModel()}).open();
  try{
    const {session}=make(),sc=R.toScenario(session),person=app.win.CortexTurnExperience.publicCharacter(sc.characters[0],sc);assert.equal(person.gender,'남성');assert.equal(person.age,'16');assert.match(person.publicProfile,/남동생/);
    const clean=app.win.CortexCleanRecommendationProse,prose='그는 창문 너머로 작업실을 바라봤다.',menu='\n\n1. 작업대 위에 놓인 열쇠를 자세히 살핀다\n2. 문 앞에 서 있는 동생에게 다가간다\n3. 창문 너머로 보이는 사람에게 말을 건넨다';
    assert.equal(clean(prose+menu,[]),prose);assert.equal(clean(prose+'\n1. 책 세 권\n2. 작은 열쇠\n3. 낡은 상자',[]),prose+'\n1. 책 세 권\n2. 작은 열쇠\n3. 낡은 상자');assert.equal(clean('그는 “1. 확인한다”라고 읽었다.',[]),'그는 “1. 확인한다”라고 읽었다.');
    const ctx=R.context(sc,[],'계속', [sc.protagonist,...sc.characters]);assert.equal(ctx.style.cortexAuthoringGuidance,undefined);assert.equal(ctx.characters.length,2);
  }finally{app.close()}
});
test('conditional relationship reveal stays hidden until grounded and remains revealed after update',()=>{
  const {scenario:sc}=make();sc.runtime.instantStory.statusWindow.relationshipDisplay.entries=[{id:'rel',entityId:'sibling',visibility:'conditional',revealRule:'서로 도와준 뒤',displayParts:['sentence','stat','symbol'],stat:{minimum:0,maximum:5,current:0}}];
  let ctx=R.context(sc,[],'도와준다',[sc.protagonist,...sc.characters]);assert.equal(ctx.relationships.length,0);let response:any={...valid(),relationshipReveals:[{id:'rel',evidence:'동생을 도왔다.'}]};sc.runtime.instantState=R.apply(sc,ctx,response,'a');assert.equal(R.visibleRelationships(sc).length,1);
  ctx=R.context(sc,[],'도와준다',[sc.protagonist,...sc.characters]);response={...valid(),relationshipChanges:[{id:'rel',delta:10,sentence:'서로 도왔다',symbol:'+',evidence:'동생을 도왔다.'}]};sc.runtime.instantState=R.apply(sc,ctx,response,'b');assert.equal(sc.runtime.instantState.relationships.rel.current,5);assert.equal(R.visibleRelationships(sc).length,1);
});
test('whole canon app bridges unknown candidates and still selects eligible alternatives',async()=>{
  for(const unknown of [true,false]){
    const sc=JSON.parse(fs.readFileSync('tests/fixtures/cortex-173-chronos-2turn.json','utf8')).scenario;
    sc.runtime.eventLedger={...(sc.runtime.eventLedger||{}),sealed:[{id:'previous-event',outcome:'SUCCESS'}]};
    const next=structuredClone(sc.event);next.id='after-skipped';delete next.cortexDesign;sc.event.nextEvent=next;sc.event.cortexDesign={schema:'STUDIO_EVENT_DESIGN_V2',occurrenceEnabled:true,occurrence:'주인공이 외부에 있다'};
    const skippedId=sc.event.id;
    const model=makeModel({beforeRespond:(entry:any)=>{if(entry.format!=='cortex_event_occurrence')return;const answer={verdict:unknown?'UNKNOWN':'FALSE',evidence:unknown?'':sc.world.location};return {ok:true,status:200,body:null,json:async()=>({output_text:JSON.stringify(answer)})}}});
    const app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model,initialScenario:sc}).open();
    try{
      app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});const turn=await app.turn('주변을 살핀다');assert.equal(turn.status,'COMMITTED');
      assert.equal(turn.sourceEventId,unknown?skippedId:'after-skipped');
      assert.ok(!app.scenario.runtime.eventLedger.sealed.some((e:any)=>e.id===skippedId));
      const saved=app.api._export().canonicalSession.state.cortexRuntimeExtra;
      if(unknown){assert.equal(saved.occurrenceBridge.eventId,skippedId);assert.equal(saved.occurrenceBridge.condition,'주인공이 외부에 있다');assert.equal(saved.occurrenceDecisions?.some((r:any)=>r.verdict==='TRUE')||false,false)}
      else{assert.equal(saved.occurrenceDecisions[0].verdict,'FALSE');assert.equal(saved.occurrenceBridge,undefined)}
    }finally{app.close()}
  }
});
