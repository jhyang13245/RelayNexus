import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {HeadlessCortex,makeModel} from './harness.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cortex-parity-'));
const adapted='vendor/cortex/Cortex_v1.42.0.html';
// The product no longer ships a default story. Compare the engine-only upstream
// artifact with the adapted engine and inject the same explicit fixture per test.
const upstream=Buffer.from(gunzipSync(fs.readFileSync('vendor/cortex/upstream/1.42.0.html.gz')).toString().replace('<!-- CORTEX_UPSTREAM_SHARED_BUILTIN -->',''));
const parityScenario=JSON.parse(fs.readFileSync('tests/fixtures/cortex-173-chronos-2turn.json','utf8')).scenario;
const official=path.join(tmp,'official.html');fs.writeFileSync(official,upstream);
const instrumented=path.join(tmp,'instrumented.html');
fs.writeFileSync(instrumented,fs.readFileSync(adapted,'utf8').replace('globalThis.__DANCHEONG_NEW_ENGINE_TEST__={','globalThis.__DANCHEONG_NEW_ENGINE_TEST__={_streamModelText:streamModelTextV180,_createTypewriter:createTypewriterV180,'));
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const segment={paragraphIndex:1,clockEnd:{day:0,time:'06:44:00'},endLocation:'집',transitionReason:'장면의 실제 경과'};
const payload={segments:[segment],authorObjections:[]};

test('official 1.42.0 baseline is independently pinned; unrelated engine modules are unchanged',()=>{
 assert.equal(createHash('sha256').update(upstream).digest('hex'),'a1df52c7a2993e546d6a7d9367c3e0e729304d3cb0f7a121c026f8aa54249ef9');
 const scripts=s=>[...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 const left=scripts(upstream.toString()),allRight=scripts(fs.readFileSync(adapted,'utf8'));
 const extensions=['instant-runtime','occurrence-runtime'].map(name=>fs.readFileSync('vendor/cortex/'+name+'.js','utf8')+(name==='occurrence-runtime'?'\n'+fs.readFileSync('vendor/cortex/jieum-runtime.js','utf8'):''));
 assert.deepEqual(allRight.slice(0,2),extensions,'Dedicated runtime extensions must match their reviewed source exactly');
 const right=allRight.slice(2);
 assert.equal(left.length,right.length);
 const changed=[];
 for(let i=0;i<left.length;i++)if(left[i]!==right[i]){changed.push(i);assert.ok(/function createStreamDecoder|function migrate\(value\)|function streamModelTextV180|function createTypewriterV180/.test(left[i])||/gpt-image-2\.5-flare|apiCostV1430|input_fidelity|작품을 불러오세요|unconfigured/.test(right[i]),'Only wire, migration, image-cost, empty bootstrap and UI-bearing runtime scripts may differ: '+i)}
 assert.ok(changed.length>0);
});

test('reserved JSON never reaches any streaming chunk and ordinary prose remains lossless',async()=>{
 const app=await new HeadlessCortex({standalonePath:adapted,model:makeModel()}).open();try{
  const engine=app.win.CortexNarrativeSpacetime;
  const fixtures=[
   ['앞 문장.\n'+JSON.stringify(payload)+'\n뒤 문장.','앞 문장.\n\n뒤 문장.',true],
   ['앞 문장.\n'+JSON.stringify(JSON.stringify(payload)).slice(1,-1)+'\n뒤 문장.','앞 문장.\n\n뒤 문장.',true],
   ['앞 문장.\n'+JSON.stringify(payload,null,2),'앞 문장.\n',true],
   ['앞 문장.\n'+JSON.stringify(payload).replace('],"authorObjections"','}],"authorObjections"'),'앞 문장.\n',false],
   ['앞 문장.\n```json\n'+JSON.stringify(payload,null,2)+'\n```\n뒤 문장.','앞 문장.\n\n뒤 문장.',true],
   ['문장.<!--CORTEX_ST_V1 '+JSON.stringify(payload,null,2)+'-->','문장.',true],
   ['문장.\n{"segments":[{"paragraphIndex":1,"clockEnd":','문장.\n',false],
   ['그는 “{안녕}”이라고 말했다.','그는 “{안녕}”이라고 말했다.',false],
   ['화면에는 다음이 있었다.\n{"segments":["서울","부산"]}\n문서 끝.','화면에는 다음이 있었다.\n{"segments":["서울","부산"]}\n문서 끝.',false],
   ['```json\n{"message":"안녕"}\n```','```json\n{"message":"안녕"}\n```',false],
   ['앞.\n{"version":1,"scopes":[],"rationale":"검수"}\n뒤.','앞.\n\n뒤.',false],
  ];
  for(const [input,expected,track]of fixtures)for(const size of [1,2,3,7,23,10000]){
   const decoder=engine.createStreamDecoder({start:{day:0,time:'06:43:00',location:'집'}});let visible='';
   for(let i=0;i<input.length;i+=size){visible+=decoder.push(input.slice(i,i+size));assert.ok(expected.startsWith(visible),`Unexpected visible prefix at chunk ${size}: ${visible.slice(-100)}`)}
   const end=decoder.finish();visible+=end.tail;assert.equal(visible,expected);
   if(track)assert.equal(end.track.segments.length,1);
  }
  const authored={segments:[segment],recommendations:[{label:'현관의 낡은 우산을 들어 안쪽의 젖은 자국을 비교한다.',risk:'LOW'},{label:'부엌의 찻잔 주인이 누구인지 한시우에게 조심스럽게 묻는다.',risk:'MEDIUM'},{label:'밖에서 울린 자전거 벨을 따라 문을 열고 골목으로 나선다.',risk:'HIGH'}]},authorDecoder=engine.createStreamDecoder({start:{day:0,time:'06:43:00',location:'집'}}),authorVisible=authorDecoder.push('문장.<!--CORTEX_ST_V1 '+JSON.stringify(authored)+'-->'),authorDone=authorDecoder.finish();
  assert.equal(authorVisible+authorDone.tail,'문장.');assert.equal(authorDecoder.recommendations().provided,true);assert.deepEqual(authorDecoder.recommendations().candidates,authored.recommendations);
  const bad='본문.\n'+JSON.stringify(payload),saved={turns:[{id:'old',text:bad}],scenario:{world:{day:0,time:'06:44:00'}},adjudicationLog:[{raw:bad}]};
  const clean=app.win.CortexQuality.migrate(saved);
  assert.equal(clean.turns[0].text,'본문.');assert.equal(clean.adjudicationLog[0].raw,bad);assert.equal(saved.turns[0].text,bad);
  assert.equal(clean.protocolMigration.originalFields[0].value,bad);
  assert.equal(JSON.stringify(app.win.CortexQuality.migrate(clean)),JSON.stringify(clean),'migration is idempotent');
 }finally{app.close()}
});

test('final persistence drains the visible typing queue instead of revealing its tail at once',async()=>{
 const app=await new HeadlessCortex({standalonePath:instrumented,model:makeModel()}).open();try{
  app.api._setSettings({typingSpeed:'fast'});
  const turn={text:'abcdefghijkl'.repeat(4),metrics:{turnStartedAt:app.win.performance.now()}};
  const typewriter=app.api._createTypewriter(turn);
  typewriter.push(turn.text);typewriter.close(turn.text);
  const drained=typewriter.flush();
  assert.notEqual(typewriter.displayed(),turn.text);
  await app.settle(32);
  assert.ok(typewriter.displayed().length>0&&typewriter.displayed().length<turn.text.length);
  await drained;
  assert.equal(turn.displayTyping,false);
  assert.equal(turn.displayText,undefined);
 }finally{app.close()}
});

test('natural pacing does not stretch a thin buffer and approved prose finishes before adjudication closes it',async()=>{
 const app=await new HeadlessCortex({standalonePath:instrumented,model:makeModel()}).open();try{
  app.api._setSettings({typingSpeed:'natural'});
  const text='가나다라마바사아자차카타파하'.repeat(12),turn={text,metrics:{turnStartedAt:app.win.performance.now()}};
  const typewriter=app.api._createTypewriter(turn);typewriter.push(text);
  await app.settle(125);
  const liveCount=Array.from(typewriter.displayed()).length;
  assert.ok(liveCount>=3,`thin natural buffer was stretched: ${liveCount}`);
  assert.equal(typewriter.mode(),'LIVE_ADAPTIVE');
  typewriter.approveAll(text);
  assert.equal(typewriter.isProseApproved(),true);
  assert.equal(typewriter.mode(),'APPROVED_FINISH');
  assert.equal(turn.displayTyping,true,'prose approval must not dispose before final close');
  await app.settle(125);
  assert.ok(Array.from(typewriter.displayed()).length-liveCount>=2,'approved prose stopped progressing');
  typewriter.close(text);await typewriter.flush();
  assert.equal(turn.displayTyping,false);assert.equal(turn.displayText,undefined);
 }finally{app.close()}
});

test('Luna and Muse natural share the readable finish pace',async()=>{
 const app=await new HeadlessCortex({standalonePath:instrumented,model:makeModel()}).open();try{
  const run=async model=>{
   app.api._setSettings({model,typingSpeed:'natural'});
   const text='가나다😀'.repeat(12),turn={text,metrics:{turnStartedAt:app.win.performance.now()}},writer=app.api._createTypewriter(turn);
   writer.push(text);writer.approveAll(text);const pace=turn.metrics.typewriterFinishPace;
   await app.settle(35);const shown=writer.displayed();assert.ok(text.startsWith(shown));assert.ok(shown.length>0&&shown.length<text.length);
   writer.close(text);await writer.flush();assert.equal(writer.received(),text);return pace;
  };
  const luna=await run('gpt-5.6-luna'),luna6=await run('gpt-6-luna'),muse=await run('muse-spark-1.3-contributor');assert.deepEqual(luna6,luna);
  assert.equal(luna.delayMs,32);assert.equal(luna.batch,1);assert.deepEqual(muse,luna);
  const source=fs.readFileSync('vendor/cortex/parts/08.part','utf8');assert.doesNotMatch(source,/openingBoost|selectedFinish.batch\*\(luna/u);assert.match(source,/profiles=\{slow:72,natural:34,fast:20,instant:0\}/u);
 }finally{app.close()}
});

test('Luna and Muse natural cap full-buffer cadence and preserve other speed settings',async()=>{
 const app=await new HeadlessCortex({standalonePath:instrumented,model:makeModel()}).open();try{
  for(const model of ['muse-spark-1.3-contributor','gpt-5.6-luna','gpt-6-luna']){
  app.api._setSettings({model,typingSpeed:'natural'});
  const turn={text:'가'.repeat(720),metrics:{turnStartedAt:app.win.performance.now()}},writer=app.api._createTypewriter(turn);
  writer.push(turn.text);await app.settle(250);const count=writer.displayed().length;
  assert.ok(count>0&&count<=9,`full buffer ran too fast: ${count}`);
  writer.approveAll(turn.text);await app.settle(250);assert.ok(writer.displayed().length-count<=9,'approval caused a speed burst');
  writer.close(writer.displayed());await writer.flush();
  for(const [speed,delay,batch]of [['slow',24,1],['fast',16,4],['instant',20,2]]){
   app.api._setSettings({typingSpeed:speed});const t={metrics:{}},w=app.api._createTypewriter(t);assert.equal(t.metrics.typewriterFinishPace.delayMs,delay);assert.equal(t.metrics.typewriterFinishPace.batch,batch);w.push('가나다');w.close('가나다');await w.flush();assert.equal(w.received(),'가나다');
  }
  }
 }finally{app.close()}
});

test('mixed private envelopes never leak, even one character at a time or with broken JSON',async()=>{
 const app=await new HeadlessCortex({standalonePath:adapted,model:makeModel()}).open();try{
  const engine=app.win.CortexNarrativeSpacetime;
  const fixtures=[];
  for(const [open,close] of [['⟦CORTEX_ST_V1 ','-->'],['⟦CORTEX_ST_V1 ','⟧'],['[[CORTEX_ST_V1 ',']]'],['&lt;!--CORTEX_ST_V1 ','--&gt;']]){
   for(const body of [JSON.stringify(payload),JSON.stringify(payload,null,2),'{"segments":[{"paragraphIndex":1}],"audit":{"rationale":"broken", "}}],"recommendations":[]}']){
    fixtures.push(['앞 문장.\n'+open+body+close+'\n뒤 문장.','앞 문장.\n\n뒤 문장.']);
   }
   fixtures.push(['앞 문장.\n'+open+'{"segments":[','앞 문장.\n']);
  }
  fixtures.push(['표지에는 ⟦봄⟧이라고 쓰여 있었다.','표지에는 ⟦봄⟧이라고 쓰여 있었다.']);
  fixtures.push(['본문.⟦CORTEX_ST_V1','본문.']);
  for(const [input,expected]of fixtures)for(const size of [1,2,7,29,512]){
   const d=engine.createStreamDecoder();let visible='';
   for(let i=0;i<input.length;i+=size){visible+=d.push(input.slice(i,i+size));assert.ok(expected.startsWith(visible),`Leaked chunk ${size}: ${visible}`)}
   visible+=d.finish().tail;assert.equal(visible,expected);
  }
 }finally{app.close()}
});

test('saved wire contamination is archived and quote anchors relocate without treating JSON as dialogue',async()=>{
 const app=await new HeadlessCortex({standalonePath:adapted,model:makeModel()}).open();try{
  const wire='⟦CORTEX_ST_V1 '+JSON.stringify(payload)+'-->',first='“먼저 가.”',last='“곧 갈게.”',text='그가 말했다. '+first+'\n'+wire+'\n그녀가 답했다. '+last;
  const annotations=[first,'"segments"',last].map((quoteText,i)=>({offset:text.indexOf(quoteText),quoteText,quoteClosed:true,bindingVersion:2,speakerName:['한서','','은서'][i],characterId:['one','','two'][i],source:i===1?'WRITER_NON_SPEECH_QUOTE':'WRITER_CHARACTER_REF'}));
  const input={scenario:{world:{day:0,time:'07:00:00'}},turns:[{id:'old-wire',status:'COMMITTED',text,dialogueAnnotations:annotations,imageCapsule:{prompt:text}}],adjudicationLog:[{raw:text}],media:{packageAssets:[{key:'story:one',storyId:'story',characterId:'one',dataUrl:'original-image'}]}};
  const snapshot=JSON.stringify(input),clean=app.win.CortexQuality.migrate(input),turn=clean.turns[0];
  assert.equal(turn.text,'그가 말했다. '+first+'\n\n그녀가 답했다. '+last);
  assert.equal(turn.dialogueAnnotations.length,2);
  for(const row of turn.dialogueAnnotations)assert.equal(turn.text.slice(row.offset,row.offset+row.quoteText.length),row.quoteText);
  assert.equal(turn.dialogueAnnotations[1].characterId,'two');assert.doesNotMatch(turn.imageCapsule.prompt,/CORTEX_ST|segments/);
  assert.equal(clean.adjudicationLog[0].raw,text);assert.equal(turn.repairLog.entries[0].before,text);
  assert.ok(clean.protocolMigration.originalFields.some(row=>row.path.endsWith('dialogueAnnotations')&&row.value.length===3));
  assert.equal(JSON.stringify(clean.media),JSON.stringify(input.media));assert.equal(JSON.stringify(input),snapshot);
  assert.equal(JSON.stringify(app.win.CortexQuality.migrate(clean)),JSON.stringify(clean));
 }finally{app.close()}
});

test('official and adapted runtimes preserve event, world, canon and memory on identical responses',async()=>{
 const states=[];
 for(const standalonePath of [official,adapted]){
  const model=makeModel(),app=await new HeadlessCortex({standalonePath,model}).open();try{
   app.api.applyImportedState({scenario:structuredClone(parityScenario),turns:[]},{persistState:false});
   app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
   const sequence=[];
   for(const input of ['주변을 둘러본다.','흔적을 확인한다.','그 뒤의 반응을 살핀다.','다음 행동을 준비한다.']){
    const turn=await app.turn(input);
    sequence.push(JSON.parse(JSON.stringify({text:turn.text,status:turn.status,event:app.scenario.event.id,beat:app.scenario.runtime.activeBeatIndex,world:app.scenario.world,fsm:app.scenario.runtime.systemicEventState,requirements:turn.txn?.requirementVerdicts})));
   }
   // Generated clocks/IDs are not semantic state. Keep all event progress and world fields.
   const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!/(?:At)$/.test(k)).map(([k,v])=>[k,stable(v)])):typeof value==='string'?value.replace(/turn-(?:prose-)?[a-z0-9]+-(\d+)/g,'turn-$1'):value;
   states.push({sequence:stable(sequence),calls:model.calls.map(c=>c.kind)});
  }finally{app.close()}
 }
 assert.deepEqual(states[1],states[0]);
});

test('normal, continuation and repair streams share a non-conflicting contract and live speaker decoding',async()=>{
 let wire='',requests=[];
 const model=makeModel({beforeRespond(entry,body){if(entry.kind!=='writer')return;requests.push(body);
  const frames=[...wire].map(delta=>'data: '+JSON.stringify({type:'response.output_text.delta',delta})+'\n\n');
  frames.push('data: '+JSON.stringify({type:'response.completed',response:{}})+'\n\n');let index=0;
  return {ok:true,body:new ReadableStream({pull(controller){if(index===frames.length)controller.close();else controller.enqueue(new TextEncoder().encode(frames[index++]))}})}
 }});
 const app=await new HeadlessCortex({standalonePath:instrumented,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  const person=app.scenario.protagonist;
  for(const repair of [false,true])for(const prefix of ['', '앞서 공개된 문장.\n\n']){
   const txn={txnId:'wire-'+repair+prefix.length,start:{day:0,time:'06:43:00',location:'집'},writerCommitGraphCatalog:{characters:[{ref:person.id,name:person.name}]}};
   app.api.applyImportedState({scenario:structuredClone(app.scenario),turns:[{id:txn.txnId,text:prefix,status:'STREAMING',txn,metrics:{}}]},{persistState:false});
   const stored=app.turns[0].txn;
   wire=`⟦S:${person.id}⟧“가자.”\n\n쪽지에는 ⟦Q⟧‘돌아와’라고 적혀 있었다.\n`+JSON.stringify(payload);
   let visible='',liveSpeaker=false;
   const result=await app.api._streamModelText({developer:'각 문단 뒤에 <!--CORTEX_ST_V1 {...}-->를 유지한다.',user:'{}',spacetimeTxn:stored,speakerOffset:prefix.length,repair,onDelta(delta){visible+=delta;assert.doesNotMatch(visible,/segments|authorObjections|⟦|CORTEX_ST/);if(visible.includes('“'))liveSpeaker ||= app.turns[0].dialogueAnnotations?.[0]?.characterId===person.id}});
   assert.equal(result,'“가자.”\n\n쪽지에는 ‘돌아와’라고 적혀 있었다.');assert.ok(liveSpeaker);
   assert.equal(app.turns[0].dialogueAnnotations[0].offset,prefix.length);
   assert.equal(app.turns[0].dialogueAnnotations[1].quoteKind,'NON_SPEECH');
   assert.equal(stored.narrativeSpacetimeTrack.segments.length,1);
  }
  for(const body of requests){const prompt=body.input[0].content[0].text;assert.match(prompt,/기존 계약대로 반드시 유지/);assert.doesNotMatch(prompt,/이 마커 외의 분석/)}
 }finally{app.close()}
});
