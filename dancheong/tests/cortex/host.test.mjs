import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {unzipSync,strFromU8} from 'fflate';
import {HeadlessCortex,makeModel} from './harness.mjs';
import {adaptVNEngine} from '../../scripts/port-visual-novel.mjs';
const raw=fs.readFileSync('vendor/cortex/Cortex_v1.42.0.html','utf8'),wrapped=fs.readFileSync('public/cortex.html','utf8'),host=fs.readFileSync('public/cortex-host.js','utf8');
const fixtureScenario=JSON.parse(fs.readFileSync('tests/fixtures/cortex-173-chronos-2turn.json','utf8')).scenario;
fixtureScenario.protagonist.role='플레이어 캐릭터';
fixtureScenario.protagonist.source={images:[{assetPath:'assets/characters/protagonist-primary.png',label:'대표 사진',isPrimary:true}]};
const fixtureEventNodes={};for(let event=fixtureScenario.event;event;event=event.nextEvent)fixtureEventNodes[event.id]=structuredClone(event);
fixtureScenario.runtime.packageContract={eventGraph:{nodes:fixtureEventNodes,routes:[]}};
const fixtureMedia=[{key:`${fixtureScenario.runtime.storyId}:character:${fixtureScenario.protagonist.id}:primary`,storyId:fixtureScenario.runtime.storyId,characterId:fixtureScenario.protagonist.id,ref:'assets/characters/protagonist-primary.png',path:'assets/characters/protagonist-primary.png',label:`${fixtureScenario.protagonist.name} · 대표 사진`,assetKind:'CHARACTER_REFERENCE',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'}];

test('scene generation rebuilds stale capsules and sends all three named primary references in order',async()=>{
 const scenario=structuredClone(fixtureScenario),names=['나디아 알 하다드','미라 바렌','서린'];
 scenario.characters=names.map((name,i)=>({id:'scene-person-'+i,name,aliases:[],source:{images:[{assetPath:'assets/'+i+'-alternate.png'},{isPrimary:true,assetPath:'assets/'+i+'-primary.png'}]}}));
 const images=names.map((_,i)=>'data:image/png;base64,'+Buffer.from('primary-'+i).toString('base64'));
 const media=scenario.characters.flatMap((p,i)=>[{key:'alternate-'+i,storyId:scenario.runtime.storyId,characterId:p.id,ref:'assets/'+i+'-alternate.png',dataUrl:'data:image/png;base64,YWx0'},{key:'primary-'+i,storyId:scenario.runtime.storyId,characterId:p.id,ref:'assets/'+i+'-primary.png',dataUrl:images[i]}]);
 let requests=0;const model=makeModel({beforeRespond:(entry,body)=>{if(entry.kind!=='image')return;requests++;assert.deepEqual(body.referenceImages,images);names.forEach((name,i)=>assert.ok(body.prompt.includes('참조 이미지 '+(i+1)+' = '+name)));assert.match(body.prompt,/서로 바꾸거나 섞거나/);return {ok:true,status:200,json:async()=>({imageUrl:'data:image/jpeg;base64,c2NlbmU=',model:'gpt-image-2.5-flare',referenceCount:3})}}});
 const app=await new HeadlessCortex({initialScenario:scenario,initialMedia:media,standalonePath,model}).open();try{
  const prose='나디아는 미라, 서린과 둥근 탁자 앞에 앉았다.';
  app.api.applyImportedState({scenario,turns:[{id:'three-cast',status:'COMMITTED',text:prose,imageCapsule:{schema:'CORTEX_IMAGE_INTENT_CAPSULE_V4',id:'stale',characterIds:[scenario.protagonist.id],visualReferences:[],prompt:'stale'}}]},{persistState:false});
  app.api._setSettings({apiKey:'fake'});await app.settle(100);await app.api._generateTurnImage(0);
  assert.equal(requests,1);assert.equal(app.turns[0].text,prose);assert.equal(app.turns[0].imageStatus,'GENERATED');assert.equal(app.turns[0].imageReferenceCount,3);
  assert.deepEqual(Array.from(app.turns[0].imageReferenceCharacters,p=>p.name),names);
 }finally{app.close()}
});
test('scene generation binds historical public names without future-speaker leakage or extra model requests',async()=>{
 const scenario=structuredClone(fixtureScenario);scenario.protagonist.source={};scenario.protagonist.name='도현';
 scenario.characters=[{id:'scholar',name:'미라 바렌',aliases:['미라'],source:{images:[{assetPath:'scholar.png',isPrimary:true}]}}];
 const media=[{key:'scholar-primary',storyId:scenario.runtime.storyId,characterId:'scholar',ref:'scholar.png',dataUrl:'data:image/png;base64,c2Nob2xhcg=='}];
 let recording=false;const calls=[];
 const model=makeModel({beforeRespond(entry,body){if(recording)calls.push(entry.kind);if(entry.kind!=='image')return;assert.equal(body.referenceImages.length,1);assert.match(body.prompt,/참조 이미지 1 = 미라 바렌.*미라가 철제문을 잠갔다/);assert.match(body.prompt,/기준 사진이 없는 별도 인물: 도현, 유진/);return {ok:true,status:200,json:async()=>({imageUrl:'data:image/jpeg;base64,c2NlbmU=',referenceCount:1})}}});
 const app=await new HeadlessCortex({initialScenario:scenario,initialMedia:media,standalonePath,model}).open();try{
  const speaker=(id,name)=>({id,status:'COMMITTED',text:'“안녕.”',dialogueProtocol:'WRITER_INLINE_NAME_V1',dialogueAnnotations:[{bindingVersion:2,source:'WRITER_PUBLIC_NAME',speakerName:name,offset:0,quoteText:'“안녕.”'}],recommendations:model.recommendations()});
  const prose='유진은 도현과 미래인물 옆에 있었다.\n\n미라가 철제문을 잠갔다. 도현은 유진과 기다렸다.';
  app.api.applyImportedState({scenario,turns:[speaker('past','유진'),{id:'image-now',status:'COMMITTED',text:prose,dialogueProtocol:'WRITER_INLINE_NAME_V1',recommendations:model.recommendations()},speaker('future','미래인물')]},{persistState:false});
  app.api._setSettings({apiKey:'fake'});await app.settle(350);recording=true;await app.api._generateTurnImage(1);await app.settle(350);
  assert.deepEqual(calls,['image']);assert.equal(app.turns[1].imageStatus,'GENERATED');assert.equal(app.turns[1].text,prose);
  assert.ok(app.turns[1].imageCapsule.subjectBindings.some(p=>p.name==='유진'&&!p.characterId));
  assert.ok(!app.turns[1].imageCapsule.subjectBindings.some(p=>p.name==='미래인물'));
 }finally{app.close()}
});

test('scene generation removes stale offscreen photos with one image request and no writer request',async()=>{
 const scenario=structuredClone(fixtureScenario);scenario.protagonist.name='도현';
 scenario.characters=[{id:'other',name:'민아',source:{images:[{assetPath:'assets/other.png',isPrimary:true}]}}];
 const media=[{key:'other-primary',storyId:scenario.runtime.storyId,characterId:'other',ref:'assets/other.png',dataUrl:'data:image/png;base64,b3RoZXI='}];
 const calls=[],prose='유진은 침실에서 손을 잡았다. “반가워.”\n\n민아가 여전히 거실에서 공부하고 있다는 사실이, 방 안의 고요를 깨웠다. 유진은 웃었다. 거실의 시계가 울렸다.';
 const annotation={bindingVersion:2,speakerName:'유진',quoteText:'“반가워.”',offset:prose.indexOf('“'),source:'WRITER_PUBLIC_NAME'};
 let recording=false;
 const model=makeModel({beforeRespond(entry,body){if(recording)calls.push(entry.kind);if(entry.kind!=='image')return;assert.equal(body.referenceImages.length,0);assert.match(body.prompt,/화면 밖에 있는 인물: 민아/);assert.match(body.prompt,/유진은 웃었다/);return {ok:true,status:200,json:async()=>({imageUrl:'data:image/jpeg;base64,c2NlbmU=',model:'gpt-image-2.5-flare',referenceCount:0})}}});
 const app=await new HeadlessCortex({initialScenario:scenario,initialMedia:media,standalonePath,model}).open();try{
  app.api.applyImportedState({scenario,turns:[{id:'offscreen',status:'COMMITTED',text:prose,dialogueProtocol:'WRITER_INLINE_NAME_V1',dialogueAnnotations:[annotation],recommendations:model.recommendations(),imageCapsule:{schema:'CORTEX_IMAGE_INTENT_CAPSULE_V4',referenceSelectionVersion:4,id:'stale',referenceCharacterIds:['other'],prompt:'stale other reference'}}]},{persistState:false});
  app.api._setSettings({apiKey:'fake'});await app.settle(350);recording=true;await app.api._generateTurnImage(0);await app.settle(350);
  assert.deepEqual(calls,['image']);assert.equal(app.turns[0].imageStatus,'GENERATED');assert.equal(app.turns[0].imageReferenceCount,0);
  assert.equal(app.turns[0].text,prose);assert.equal(app.turns[0].dialogueAnnotations[0].speakerName,'유진');
  assert.equal(app.turns[0].imageCapsule.referenceSelectionVersion,6);
 }finally{app.close()}
});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-cortex-test-')),standalonePath=path.join(temporary,'test.html');
fs.writeFileSync(standalonePath,wrapped.replace('<head>','<head><script>window.Image=class {naturalWidth=320;naturalHeight=180;set src(v){setTimeout(()=>this.onload?.(),0)}decode(){return Promise.resolve()}};</script>').replace('<script src="/cortex-host.js"></script>',()=>'<script>'+host+'</script>').replace('<script src="/jieum-reader.js"></script>',()=>'<script>'+fs.readFileSync('public/jieum-reader.js','utf8')+'</script>').replace('<script src="/cortex-nexus-view.js"></script>',()=>'<script>'+fs.readFileSync('public/cortex-nexus-view.js','utf8')+'</script>').replace('<script src="/cortex-nexus-inspector.js"></script>',()=>'<script>'+fs.readFileSync('public/cortex-nexus-inspector.js','utf8')+'</script>').replace(/<link\b[^>]*>/g,''));
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));

test('idle verdict and persistence checkpoints do not deadlock host saving or retry',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel()}).open();
 try{
  const events=[];app.win.parent.postMessage=message=>events.push(message);
  let running=true;app.api._isBusy=()=>running;
  app.api.applyImportedState({scenario:structuredClone(app.scenario),turns:[{id:'pending-beat',status:'ADJUDICATION_PENDING',text:'보존할 본문',sameTurnResume:{schema:'CORTEX_SAME_TURN_RESUME_V1'},metrics:{lifecycle:{stage:'PERSISTING'}}}]},{persistState:false});
  await app.settle(650);assert.equal(events.filter(e=>e.type==='BUSY').at(-1)?.busy,true,'actual active work remains locked');
  running=false;await app.settle(650);
  assert.equal(events.filter(e=>e.type==='BUSY').at(-1)?.busy,false,'a retryable checkpoint is no longer a running task');
  app.win.dispatchEvent(new app.win.CustomEvent('nexus-cortex-persisted'));
  await app.settle(850);assert.ok(events.some(e=>e.type==='DURABLE_CHANGE'),'unfinished verdict prose can be saved before retry');
  assert.equal(app.turns[0].status,'ADJUDICATION_PENDING');assert.equal(app.turns[0].text,'보존할 본문');
 }finally{app.close()}
});

test('inspector reuses committed cast analysis but invalidates edited prose, dialogue and public names',async()=>{
 const measuredPath=path.join(temporary,'inspector-performance.html');
 fs.writeFileSync(measuredPath,fs.readFileSync(standalonePath,'utf8').replace(/const update=\(\)=>\{(?=\s*const sc=api\._scenario\(\),turns=api\._turns\(\))/,'const update=window.__auditInspectorUpdate=()=>{').replace('experience.publicMentionOffset(row.person,sc,prose)','(window.__castChecks=(window.__castChecks||0)+1,experience.publicMentionOffset(row.person,sc,prose))'));
 const scenario=structuredClone(fixtureScenario);scenario.characters=[{id:'cache-person',name:'검수인물',aliases:[]}];
 const app=await new HeadlessCortex({initialScenario:scenario,standalonePath:measuredPath,model:makeModel()}).open();try{
  const turns=Array.from({length:100},(_,i)=>({id:'cast-cache-'+i,status:'COMMITTED',text:'검수인물이 복도를 걸었다. '.repeat(30),metrics:{}}));
  app.api.applyImportedState({scenario,turns},{persistState:false});await app.settle(150);
  app.win.__auditInspectorUpdate();app.win.__castChecks=0;
  for(let i=0;i<5;i++)app.win.__auditInspectorUpdate();
  assert.equal(app.win.__castChecks,0,'unchanged history must not rescan public mentions');
  app.win.document.querySelector('[data-nexus-tab="cast"]').click();const pane=app.win.document.getElementById('nexus-pane-cast');assert.match(pane.textContent,/검수인물/);
  const latest=app.api._turns().at(-1);latest.text='아무도 없는 복도였다.';app.win.__auditInspectorUpdate();assert.ok(app.win.__castChecks>0&&app.win.__castChecks<10,'edited turn checks: '+app.win.__castChecks);
  app.win.__castChecks=0;latest.dialogueAnnotations=[{speakerName:'검수인물',quoteText:'“안녕.”',bindingVersion:2}];app.win.__auditInspectorUpdate();assert.ok(app.win.__castChecks>0&&app.win.__castChecks<10);
  app.win.__castChecks=0;app.api._scenario().characters[0].aliases.push('공개별명');app.win.__auditInspectorUpdate();assert.ok(app.win.__castChecks>=100);
  app.api.applyImportedState({scenario,turns:[]},{persistState:false});await app.settle(100);app.win.__auditInspectorUpdate();assert.doesNotMatch(pane.textContent,/검수인물/);
 }finally{app.close()}
});

test('multiplayer compact restores reuse local images without staging new copies',async()=>{
 const app=await new HeadlessCortex({initialScenario:structuredClone(fixtureScenario),initialMedia:structuredClone(fixtureMedia),standalonePath,model:makeModel()}).open();
 try{
  await app.settle(250);const backup=await app.api._fullExport();await app.api._importFull(backup);await app.settle(250);
  const scope=app.scenario.runtime.mediaGeneration;
  const count=async()=>{const db=await app.api._openMedia();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('package-assets','readonly'),request=tx.objectStore('package-assets').count();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}finally{db.close()}};
  const before=await count();
  for(let i=0;i<3;i++){const {media,...snapshot}=await app.api._fullExport();await app.api._importFull(snapshot,{reuseMedia:true});await app.settle(100);assert.equal(app.scenario.runtime.mediaGeneration,scope)}
  assert.equal(await count(),before);
  const after=await app.api._fullExport();assert.ok(after.media.packageAssets.some(row=>row.dataUrl===fixtureMedia[0].dataUrl));assert.equal(app.model.calls.length,0);
 }finally{app.close()}
});

test('Go image generation without an OpenAI key opens optional settings notice without a request or prose mutation',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel()}).open();try{
  app.api.applyImportedState({scenario:fixtureScenario,turns:[{id:'image-key-check',status:'COMMITTED',text:'창문 너머로 햇빛이 들었다.'}]},{persistState:false});await app.settle(80);app.api._setSettings({apiKey:'go-test-key'});
  for(const provider of ['opencode-go','opencode-go-luna']){
   app.win.NexusCortexTextProvider=provider;app.win.NexusCortexImageApiKey='';const before=JSON.stringify(app.turns),calls=app.model.calls.length;
   await app.api._generateTurnImage(0);assert.equal(app.model.calls.length,calls);assert.equal(JSON.stringify(app.turns),before);
   const notice=app.win.document.querySelector('.nexus-image-key-notice');assert.ok(notice?.open);assert.match(notice.textContent,/키 없이도 본문 플레이/u);notice.querySelector('button').click();
   app.win.NexusCortexImageApiKey='sk-image-test';assert.equal(app.win.NexusRequireImageApiKey(),true);
  }
  app.win.NexusCortexTextProvider='openai';app.win.NexusCortexImageApiKey='';app.api._setSettings({apiKey:'sk-one-shared-key'});assert.equal(app.win.NexusRequireImageApiKey(),true);
 }finally{app.close()}
});

test('display ticks avoid rescanning 1,000-beat history but new prose, bindings and commits refresh it',async()=>{
 const measuredPath=path.join(temporary,'display-performance.html');
 fs.writeFileSync(measuredPath,fs.readFileSync(standalonePath,'utf8').replace('globalThis.__DANCHEONG_NEW_ENGINE_TEST__={','globalThis.__DANCHEONG_NEW_ENGINE_TEST__={_renderDisplay:()=>renderTurns({displayOnly:true}),').replace('function refreshPublicAppearances(scenario,turns){','function refreshPublicAppearances(scenario,turns){window.appearanceRefreshCount=(window.appearanceRefreshCount||0)+1;'));
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath:measuredPath,model:makeModel()}).open();try{
  const turns=Array.from({length:1000},(_,i)=>({id:'display-'+i,input:'복도를 살핀다.',text:'복도에는 햇살이 들었다. '.repeat(30),status:'COMMITTED',metrics:{}}));
  app.api.applyImportedState({scenario:fixtureScenario,turns},{persistState:false});await app.settle(80);app.api._loadEarlierTurns(50);await app.settle(80);
  const latest=app.api._turns().at(-1);latest.status='STREAMING';latest.displayTyping=true;latest.displayText='복도';app.win.appearanceRefreshCount=0;
  app.api._renderDisplay();await app.settle(30);
  const firstIndex=app.api._renderedTurnRange().start,prior=app.win.document.querySelector(`[data-turn-index="${firstIndex}"] .prose`).firstChild;
  for(let i=0;i<8;i++){latest.displayText+='에 햇살';app.api._renderDisplay();await app.settle(5)}
  assert.equal(app.win.appearanceRefreshCount,1,'display changes must not repeat semantic scans');
  assert.equal(app.win.document.querySelector(`[data-turn-index="${firstIndex}"] .prose`).firstChild,prior);
  assert.equal(app.win.document.querySelector('[data-turn-index="999"] .prose').textContent,latest.displayText);
  latest.text+='새로운 문장.';app.api._renderDisplay();assert.equal(app.win.appearanceRefreshCount,2);
  latest.dialogueAnnotations=[{speakerName:'새 인물',quoteText:'“안녕.”',bindingVersion:2}];app.api._renderDisplay();assert.equal(app.win.appearanceRefreshCount,3);
  latest.status='COMMITTED';latest.displayTyping=false;latest.displayText=undefined;app.api._renderDisplay();assert.equal(app.win.appearanceRefreshCount,4);
  assert.equal(app.api._turns().length,1000);assert.equal(app.api._turns()[0].text,turns[0].text);
 }finally{app.close()}
});
test('restored reader mounts and reports ready before optional image priming',()=>{
 const boot=host.slice(host.indexOf('const bootHost=async'));
 const mountAt=boot.indexOf('window.mountNexusCortexView');
 const readyAt=boot.indexOf('emitReady()');
 const primeAt=boot.indexOf('window.primeNexusReaderImages');
 assert.ok(mountAt>=0&&readyAt>mountAt&&primeAt>readyAt);
 assert.doesNotMatch(boot,/await\s+window\.primeNexusReaderImages/u);
 assert.match(boot,/requestAnimationFrame\(\(\)=>setTimeout\(warm,0\)\)/u);
});

test('host uses Luna 6 for writing and every pinned judge on Go and OpenAI while retaining their reasoning budgets',async()=>{
 const requests=[];const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel({beforeRespond:(entry,body)=>{requests.push(body)}})}).open();try{
  const select=provider=>app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:app.win.location.origin,source:app.win.parent,data:{channel:'NEXUS_CORTEX_HOST_V1',type:'SETTINGS',provider,apiKey:'fake',imageApiKey:'image-fake',typingSpeed:'instant'}}));
  for(const provider of ['opencode-go-luna','openai']){
   requests.length=0;select(provider);await app.settle(100);assert.equal(app.win.NexusCortexTextProvider,provider);assert.equal(app.api._settings().model,'gpt-6-luna');assert.equal(app.api._settings().baseUrl,provider==='openai'?'https://api.openai.com/v1':'https://opencode.ai/zen/go/v1');
   const turn=await app.turn('쪽지를 읽는다.');assert.equal(turn.status,'COMMITTED');assert.ok(turn.text.length>20);assert.equal(turn.recommendations.length,3);
   assert.ok(requests.some(row=>row.model==='gpt-6-luna'&&row.stream));assert.ok(requests.filter(row=>row.stream).every(row=>row.reasoning?.effort==='low'));
   assert.ok(requests.some(row=>!row.stream&&row.reasoning?.effort==='medium'));assert.ok(requests.every(row=>row.model==='gpt-6-luna'));
   assert.equal(turn.metrics.unifiedAdjudication.model,'gpt-6-luna');
  }
 }finally{app.close()}
});

test('approved prose survives disclosure changes, recommendation resemblance, copy and reload verbatim',async()=>{
 const scenario=structuredClone(fixtureScenario);scenario.disclosure={...(scenario.disclosure||{}),protectedTerms:['공개된 이름']};
 const prose='공개된 이름은 종이에 세 가지 행동을 적었다.\n\n1. 문을 연다.\n2. 창문을 살핀다.\n3. 편지를 읽는다.';
 const app=await new HeadlessCortex({initialScenario:scenario,standalonePath,model:makeModel()}).open();try{
  const turn={id:'approved-authority',status:'COMMITTED',text:prose,recommendations:[{text:'문을 연다.'},{text:'창문을 살핀다.'},{text:'편지를 읽는다.'}]};
  app.api.applyImportedState({scenario,turns:[turn]},{persistState:false});await app.settle(500);
  const doc=app.win.document;assert.match(doc.querySelector('.prose').textContent,/공개된 이름/);assert.match(doc.querySelector('.prose').textContent,/3\. 편지를 읽는다\./);assert.doesNotMatch(doc.querySelector('.prose').textContent,/공개 전/);
  let copied='';Object.defineProperty(app.win.navigator,'clipboard',{configurable:true,value:{writeText:async value=>{copied=value}}});doc.querySelector('.nexus-beat-copy').click();await app.settle();assert.equal(copied,prose);
  const capsule=app.win.CortexTurnExperience.createImageCapsule({scenario:app.scenario,turn:app.turns[0]});assert.match(capsule.prompt,/공개된 이름/);assert.doesNotMatch(capsule.prompt,/\[공개 전\]/);
  const saved=await app.api._fullExport();assert.equal(saved.turns[0].text,prose);await app.api._importFull(saved);await app.settle(400);assert.equal(app.turns[0].text,prose);assert.match(doc.querySelector('.prose').textContent,/공개된 이름/);assert.equal(app.model.calls.length,0);
 }finally{app.close()}
});

test('a quoted full-name introduction and unique family-name suffix enable approved speaker portrait without private profile',async()=>{
 const scenario=structuredClone(fixtureScenario),person={id:'quoted-visitor',name:'아다시노 히시리',aliases:[],source:{publicInfo:'첫 등장 뒤 공개: 여성 조사관.',hiddenInfo:'검수용 비공개 임무',images:[{isPrimary:true,assetPath:'assets/quoted-visitor.png'}]}};scenario.characters=[person];
 const media=[{key:scenario.runtime.storyId+':quoted-visitor',storyId:scenario.runtime.storyId,characterId:person.id,assetKind:'CHARACTER_REFERENCE',ref:'assets/quoted-visitor.png',dataUrl:fixtureMedia[0].dataUrl}];
 const prose='“아다시노 히시리 씨입니다.”\n\n히시리는 고개를 끄덕였다.\n\n“반갑습니다.”';
 const app=await new HeadlessCortex({initialScenario:scenario,initialMedia:media,standalonePath,model:makeModel()}).open();try{
  assert.equal(app.win.CortexTurnExperience.publicCharacter(person,app.scenario),null);
  app.api.applyImportedState({scenario,turns:[{id:'quoted-introduction',status:'COMMITTED',text:prose,dialogueAnnotations:[{offset:prose.indexOf('“반갑'),quoteText:'“반갑습니다.”',bindingVersion:2,source:'WRITER_PUBLIC_NAME',speakerName:'히시리',characterId:''}]}]},{persistState:false});await app.settle(1000);
  const exp=app.win.CortexTurnExperience,doc=app.win.document;assert.ok(Array.from(exp.surfaceNames(person,app.scenario)).includes('히시리'));assert.equal(exp.publicCharacter(person,app.scenario).referenceMode,'PRIMARY');assert.ok(doc.querySelector('[data-speaker-portrait="quoted-visitor"] img'));assert.match(doc.querySelector('.nexus-dialogue-head').textContent,/히시리/);assert.match(doc.querySelector('.prose').textContent,/아다시노 히시리/);assert.doesNotMatch(doc.getElementById('feed').textContent,/공개 전|검수용 비공개 임무/);assert.equal(app.turns[0].text,prose);assert.equal(app.model.calls.length,0);
 }finally{app.close()}
});
test('descriptive prefixes cannot reveal a physical-appearance gated package identity; cast follows prose and writer labels',async()=>{
 const sc=structuredClone(fixtureScenario),collector={id:'private-collector',name:'금발의 외국인 수집가',aliases:[],publicProfile:'',source:{publicInfo:'첫 물리 등장 뒤 공개: 정체불명의 외국인 수집가.'}},visitor={id:'named-visitor',name:'나디아 알 하다드',aliases:[],source:{publicInfo:'첫 등장 뒤 공개: 방문 연구자. 비공개: 숨은 조직의 일원.'}},grandmother={id:'grandmother',name:'한명진',publicRole:'외할머니',publicProfile:'고문서 복원가'};
 sc.characters=[collector,visitor,grandmother];
 const media=[...fixtureMedia,...sc.characters.map(p=>({key:sc.runtime.storyId+':'+p.id,storyId:sc.runtime.storyId,characterId:p.id,assetKind:'CHARACTER_REFERENCE',dataUrl:fixtureMedia[0].dataUrl,ref:'assets/'+p.id+'.png'}))];
 const app=await new HeadlessCortex({initialScenario:sc,initialMedia:media,standalonePath,model:makeModel()}).open();try{
  const prose='한명진의 편지가 도착했다. 금발의 여자가 지도를 펼쳤다. 나디아는 유리문을 열었다.\n\n“안녕하세요.”';
  app.api.applyImportedState({scenario:sc,turns:[{id:'privacy-folio',status:'COMMITTED',text:prose,dialogueAnnotations:[{offset:prose.indexOf('“'),quoteText:'“안녕하세요.”',bindingVersion:2,source:'WRITER_PUBLIC_NAME',speakerName:'잠깐 들른 손님',characterId:''}],imageCapsule:{characters:[{id:collector.id,name:collector.name,publicProfile:'누설되면 안 되는 저장 캐시'}]},packageTriggerImages:[{source:'CHARACTER_FIRST_APPEARANCE',characterId:collector.id,url:fixtureMedia[0].dataUrl,label:collector.name}]}]},{persistState:false});
  await app.settle(1000);const exp=app.win.CortexTurnExperience,doc=app.win.document;
  assert.deepEqual(Array.from(exp.surfaceNames(collector,app.scenario)),[collector.name]);
  assert.equal(exp.visualDisclosure(app.scenario,collector).referenceMode,'NONE');assert.equal(exp.publicCharacter(collector,app.scenario),null);
  assert.equal(doc.querySelector('[data-character-first-appearance="private-collector"]'),null);
  assert.equal(app.turns[0].packageTriggerImages.some(x=>x.characterId===collector.id),false);
  doc.querySelector('[data-nexus-tab="cast"]').click();const cast=doc.querySelector('[data-nexus-pane="cast"]');assert.match(cast.textContent,/한명진/);assert.match(cast.textContent,/나디아 알 하다드/);assert.doesNotMatch(cast.textContent,/잠깐 들른 손님/);assert.match(doc.querySelector('.nexus-dialogue-head').textContent,/잠깐 들른 손님/);assert.doesNotMatch(cast.textContent,/수집가|누설|숨은 조직|고문서 복원가|외할머니/);
  assert.ok([...cast.querySelectorAll('.cast-copy')].every(node=>node.childElementCount===1&&node.firstElementChild?.tagName==='STRONG'));
  const playerCard=doc.querySelector('.player-card-top');assert.equal(playerCard.querySelector('h2').textContent,sc.protagonist.name);assert.equal(playerCard.querySelector('p, span'),null);assert.doesNotMatch(playerCard.textContent,/평범한 대학생|PLAYER/);
  const portrait=cast.querySelector('[data-public-character="named-visitor"] img');assert.ok(portrait);assert.equal(portrait.getAttribute('loading'),'eager');assert.equal(portrait.getAttribute('decoding'),'async');assert.equal(portrait.getAttribute('fetchpriority'),'high');assert.equal(doc.querySelector('[data-nexus-pane="images"]').textContent.includes(collector.name),false);
  assert.equal(doc.querySelector('[data-speaker-portrait="grandmother"]'),null,'a letter mention is not a writer-bound utterance');assert.doesNotMatch(doc.getElementById('feed').textContent,/CHARACTER REFERENCE|대표 사진/);
  assert.equal(app.turns[0].text,prose);assert.equal(app.model.calls.length,0);
 }finally{app.close()}
});
test('backup generation scope is honored by host portrait reads and alias writes',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const backup=await app.api._fullExport();backup.turns=[{id:'scoped',status:'COMMITTED',text:fixtureScenario.protagonist.name+'는 문을 열었다.'}];
  await app.api._importFull(backup);await app.settle(900);
  assert.ok(app.scenario.runtime.mediaGeneration);assert.equal(app.win.NexusCortexPrimaryMedia.get(fixtureScenario.protagonist.id)?.dataUrl,fixtureMedia[0].dataUrl);
  assert.equal(app.win.document.querySelector('[data-character-first-appearance] img'),null);
  const exported=await app.api._fullExport();assert.ok(exported.media.packageAssets.some(x=>x.key.includes('!primary:')));assert.ok(exported.media.packageAssets.every(x=>!x.key.startsWith('generation:')));
 }finally{app.close()}
});
test('visible per-beat image button persists failure diagnostics and retries without changing prose',async()=>{
 let requests=0;const model=makeModel({beforeRespond:(entry,body)=>{if(entry.kind!=='image')return;requests++;assert.equal(body.model,'gpt-image-2.5-flare');return requests===1?{ok:false,status:400,json:async()=>({error:'이미지 옵션이 거절됐습니다.',diagnostic:{status:400,code:'invalid_value',parameter:'size',requestId:'req_test'}})}:{ok:true,status:200,json:async()=>({imageUrl:'data:image/jpeg;base64,c2NlbmU=',model:'gpt-image-2',modelFallback:true})}}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  const prose=fixtureScenario.protagonist.name+'는 창가에서 햇빛을 바라보았다.';app.api.applyImportedState({scenario:fixtureScenario,turns:[{id:'scene-retry',status:'COMMITTED',text:prose}]},{persistState:false});app.api._setSettings({apiKey:'fake'});await app.settle(100);
  app.win.document.querySelector('.nexus-beat-image').click();await app.settle(200);assert.equal(app.turns[0].imageStatus,'ERROR');assert.equal(app.turns[0].imageDiagnostic.code,'invalid_value');assert.match(app.win.document.querySelector('.nexus-beat-action-note').textContent,/invalid_value/);
  const saved=await app.api._fullExport();assert.equal(saved.turns[0].imageDiagnostic.requestId,'req_test');app.win.document.querySelector('.nexus-beat-image').click();await app.settle(250);
  assert.equal(requests,2);assert.equal(app.turns[0].text,prose);assert.equal(app.turns[0].imageStatus,'GENERATED');assert.equal(app.turns[0].imageModel,'gpt-image-2');assert.equal(app.turns[0].imageDiagnostic,undefined);assert.equal(app.turns[0].imageModelFallback,true);
 }finally{app.close()}
});
test('first-appearance public surface and unique short name unlock the embedded portrait, not the secret profile',async()=>{
 const scenario=structuredClone(fixtureScenario),person={id:'visitor',name:'미라 바렌',aliases:[],source:{publicInfo:'첫 등장 뒤 공개: 미라 바렌\n\n비공개 설정: 비밀 조직의 수장',images:[{isPrimary:true,assetPath:'assets/mira.png'}]}};scenario.characters.push(person);
 const media=[...fixtureMedia,{key:scenario.runtime.storyId+':visitor',storyId:scenario.runtime.storyId,characterId:person.id,assetKind:'CHARACTER_REFERENCE',ref:'assets/mira.png',dataUrl:'data:image/png;base64,cGljdHVyZQ=='}];
 const app=await new HeadlessCortex({initialScenario:scenario,initialMedia:media,standalonePath,model:makeModel()}).open();try{
  assert.equal(app.win.CortexTurnExperience.publicCharacter(person,app.scenario),null);
  const prose='미라는 지도를 접고 박물관으로 걸어갔다. “감사합니다.”';
  app.api.applyImportedState({scenario,turns:[{id:'visitor-appearance',text:prose,status:'COMMITTED',dialogueAnnotations:[{offset:prose.indexOf('“'),quoteText:'“감사합니다.”',bindingVersion:2,characterId:'visitor',speakerName:'미라 바렌',source:'WRITER_CHARACTER_REF'}]}]},{persistState:false});await app.settle(900);
  const visible=app.win.CortexTurnExperience.publicCharacter(person,app.scenario);assert.equal(visible.name,'미라 바렌');assert.equal(visible.publicProfile,'');assert.equal(visible.referenceMode,'PRIMARY');
  assert.ok(app.win.document.querySelector('[data-speaker-portrait="visitor"] img'));assert.ok(app.win.document.querySelector('.nexus-dialogue-avatar img'));assert.doesNotMatch(app.win.document.getElementById('feed').textContent,/비밀 조직/);assert.equal(app.turns[0].text,prose);
  app.api.applyImportedState({scenario,turns:[]},{persistState:false});assert.equal(app.win.CortexTurnExperience.publicCharacter(person,app.scenario),null);
 }finally{app.close()}
});
test('short aliases require unique identity and word boundaries; explicit secret gates never release from mentions',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel()}).open();try{
  const sc=structuredClone(app.scenario),a={id:'a',name:'미라 바렌',source:{publicInfo:'첫 등장 뒤 공개: 미라 바렌'}},b={id:'b',name:'미라 노엘',source:{publicInfo:'첫 등장 뒤 공개: 미라 노엘'}};sc.characters.push(a,b);
  const exp=app.win.CortexTurnExperience;exp.refreshPublicAppearances(sc,[{status:'COMMITTED',text:'미라는 걸어갔다.'}]);assert.equal(exp.publicCharacter(a,sc),null);assert.equal(exp.publicCharacter(b,sc),null);
  assert.equal(exp.nameOffset('미라벨은 걷는다.','미라'),-1);a.source.revealCondition='사건 3 완료';exp.refreshPublicAppearances(sc,[{status:'COMMITTED',text:'미라 바렌은 걸어갔다.'}]);assert.equal(exp.publicCharacter(a,sc),null);
 }finally{app.close()}
});
test('missing writer bindings recover as a sidecar without prose edits; duplicates and private IDs fail closed',async()=>{
 let calls=0;const prose='미라는 지도를 접었다. “감사합니다.”\n\n“누구세요?”',model=makeModel({beforeRespond:(entry,body)=>{if(entry.format!=='cortex_dialogue_bindings')return;calls++;const payload=JSON.parse(body.input[1].content[0].text);assert.doesNotMatch(JSON.stringify(payload.cast),/숨은왕/);return {ok:true,status:200,body:null,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({quotes:[{index:0,kind:'SPEECH',characterId:'visitor',speakerName:'미라',evidence:'미라는 지도를 접었다.'},{index:0,kind:'SPEECH',characterId:'',speakerName:'다른 사람',evidence:'미라는 지도를 접었다.'},{index:1,kind:'SPEECH',characterId:'secret',speakerName:'숨은왕',evidence:'누구세요?'}]})}]}]})}}});
 const sc=structuredClone(fixtureScenario);sc.characters.push({id:'visitor',name:'미라 바렌',source:{publicInfo:'첫 등장 뒤 공개: 미라 바렌',images:[{assetPath:'pending.png'}]}},{id:'secret',name:'숨은왕',source:{secret:true}});
 const app=await new HeadlessCortex({initialScenario:sc,standalonePath,model}).open();try{
  app.api.applyImportedState({scenario:sc,turns:[{id:'recover',text:prose,status:'COMMITTED'}]},{persistState:false});app.api._setSettings({apiKey:'fake'});
  await Promise.all([app.api._recoverDialogue(app.turns[0]),app.api._recoverDialogue(app.turns[0])]);await app.settle(100);
  assert.equal(calls,1);assert.equal(app.turns[0].text,prose);assert.equal(app.turns[0].dialogueAnnotations.length,1);assert.equal(app.turns[0].dialogueAnnotations[0].characterId,'visitor');assert.equal(app.turns[0].dialogueRecovery.status,'PARTIAL');assert.equal(app.win.document.querySelector('.nexus-dialogue-head strong').textContent,'미라');
 }finally{app.close()}
});
test('legacy manual recovery rejects an ID/name disagreement instead of renaming the prose speaker',async()=>{
 const prose='민서는 지훈을 보며 물었다. “괜찮아?”';
 const model=makeModel({beforeRespond(entry,body){if(entry.format!=='cortex_dialogue_bindings')return;
  const payload=JSON.parse(body.input[1].content[0].text);assert.ok(payload.cast.every(p=>!p.characterId));
  return {ok:true,status:200,json:async()=>({output_text:JSON.stringify({quotes:[{index:0,kind:'SPEECH',characterId:'other',speakerName:'민서',evidence:'민서는 지훈을 보며 물었다.'}]})})};
 }});
 const sc=structuredClone(fixtureScenario);sc.characters.push({id:'writer',name:'김민서'},{id:'other',name:'박지훈'});
 const app=await new HeadlessCortex({initialScenario:sc,standalonePath,model}).open();try{
  app.api.applyImportedState({scenario:sc,turns:[{id:'conflict',text:prose,status:'COMMITTED'}]},{persistState:false});app.api._setSettings({apiKey:'fake'});
  await app.api._recoverDialogue(app.turns[0]);
  assert.equal(app.turns[0].text,prose);assert.equal(app.turns[0].dialogueAnnotations.length,0);
  assert.equal(app.turns[0].dialogueRecovery.status,'PARTIAL');assert.equal(app.win.document.querySelector('.nexus-dialogue-row'),null);
 }finally{await app.settle(350);app.close()}
});

test('name-first turns never automatically reassign an unmarked quote after committing',async()=>{
 const model=makeModel({writer(){return '민서가 고개를 끄덕였다. ⟦N:민서⟧“괜찮아.”\n\n그는 문을 열며 말했다. “여기로 와.”'}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  const turn=await app.turn('문을 확인한다.');await app.settle(120);
  assert.equal(turn.dialogueProtocol,'WRITER_INLINE_SPEAKER_V2');assert.equal(turn.status,'COMMITTED');
  assert.equal(turn.dialogueAnnotations[0].speakerName,'민서');assert.equal(turn.dialogueRecovery,undefined);
  assert.equal(model.calls.some(c=>c.format==='cortex_dialogue_bindings'),false);
 }finally{app.close()}
});

test('optional private backup replay blocks unrevealed speaker identities without rewriting prose',{skip:!process.env.DANCHEONG_REGRESSION_BACKUP},async()=>{
 const zip=unzipSync(fs.readFileSync(process.env.DANCHEONG_REGRESSION_BACKUP)),backup=JSON.parse(strFromU8(zip['backup.json']));
 const app=await new HeadlessCortex({initialScenario:backup.scenario,standalonePath,model:makeModel()}).open();try{
  const before=backup.turns.map(turn=>turn.text);app.api.applyImportedState({scenario:backup.scenario,turns:backup.turns},{persistState:false});await app.settle(1000);
  const experience=app.win.CortexTurnExperience,withheld=(backup.scenario.characters||[]).filter(person=>!experience.publicCharacter(person,app.scenario));assert.ok(withheld.length>0);
  const feed=app.win.document.getElementById('feed');for(const person of withheld){if(!before.some(text=>text.includes(person.name)))assert.equal(feed.textContent.includes(person.name),false,'package-only withheld identity appears in feed');assert.equal([...feed.querySelectorAll('[data-character-first-appearance]')].some(node=>node.dataset.characterFirstAppearance===person.id),false)}
  assert.equal(createHash('sha256').update(JSON.stringify(app.turns.map(turn=>turn.text))).digest('hex'),createHash('sha256').update(JSON.stringify(before)).digest('hex'));assert.equal(app.api._settings().apiKey,'');
 }finally{app.close()}
});

test('optional beat 34 backup retains approved Hishiri prose and restores her primary speaker portrait',{skip:!process.env.DANCHEONG_HISHIRI_BACKUP},async()=>{
 const bytes=new Uint8Array(fs.readFileSync(process.env.DANCHEONG_HISHIRI_BACKUP)),zip=unzipSync(bytes),backup=JSON.parse(strFromU8(zip['backup.json']));
 const app=await new HeadlessCortex({initialScenario:backup.scenario,standalonePath,model:makeModel()}).open();try{
  await app.api._importFull(await app.win.CortexBackupArchive.unpack(bytes));await app.settle(1800);
  const original=backup.turns[33],restored=app.turns[33],id='NPC_MASTER_ADASHINO_HISHIRI',article=app.win.document.querySelector('[data-turn-index="33"]');
  assert.equal(restored.text,original.text);assert.match(article.querySelector('.prose').textContent,/아다시노 히시리/);assert.ok(article.querySelector('[data-speaker-portrait="'+id+'"] img'));assert.ok([...article.querySelectorAll('.nexus-dialogue-head strong')].some(n=>n.textContent.includes('히시리')));
  assert.deepEqual(Array.from(app.turns,t=>t.text),backup.turns.map(t=>t.text));assert.equal(app.api._settings().apiKey,'');assert.equal(app.model.calls.length,0);
 }finally{app.close()}
});
test('optional current backup restores first-appearance package images locally without paid generation',{skip:!process.env.DANCHEONG_MEDIA_BACKUP},async()=>{
 const bytes=new Uint8Array(fs.readFileSync(process.env.DANCHEONG_MEDIA_BACKUP)),zip=unzipSync(bytes),backup=JSON.parse(strFromU8(zip['backup.json']));
 const app=await new HeadlessCortex({initialScenario:backup.scenario,standalonePath,model:makeModel()}).open();try{
  const unpacked=await app.win.CortexBackupArchive.unpack(bytes);await app.api._importFull(unpacked);await app.settle(1400);
  const target=app.scenario.characters.find(p=>p.id===process.env.DANCHEONG_MEDIA_CHARACTER);assert.ok(target);const visible=app.win.CortexTurnExperience.publicCharacter(target,app.scenario);assert.ok(visible);assert.equal(visible.referenceMode,'PRIMARY');
  app.win.document.querySelector('[data-nexus-tab="cast"]').click();const cast=app.win.document.querySelector('[data-nexus-pane="cast"]');assert.ok(cast.textContent.includes(visible.name));
  for(const person of app.scenario.characters){if(app.win.CortexTurnExperience.publicCharacter(person,app.scenario))continue;assert.equal(cast.textContent.includes(person.name),false);assert.equal(app.turns.flatMap(t=>t.packageTriggerImages||[]).some(item=>item.characterId===person.id),false)}
  assert.ok([...app.win.document.querySelectorAll('[data-character-first-appearance] img')].some(img=>img.parentElement.dataset.characterFirstAppearance===target.id),JSON.stringify({primaryCount:app.win.NexusCortexPrimaryMedia?.size,targetReady:Boolean(app.win.NexusCortexPrimaryMedia?.get(target.id)),triggerCount:app.turns.at(-1).packageTriggerImages?.length,logs:app.logs.slice(-3)}));
  assert.equal(createHash('sha256').update(JSON.stringify(app.turns.map(t=>t.text))).digest('hex'),createHash('sha256').update(JSON.stringify(backup.turns.map(t=>t.text))).digest('hex'));assert.equal(app.api._settings().apiKey,'');assert.equal(app.model.calls.filter(c=>c.kind==='image').length,0);
 }finally{app.close()}
});
test('reader tail button, paper notices and mobile Enter remain presentation-only',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel()}).open();try{
  const doc=app.win.document,story=doc.querySelector('.story-scroll'),jump=doc.querySelector('.nexus-jump-bottom'),input=doc.getElementById('input');
  const jumpDock=doc.querySelector('.nexus-jump-dock'),recommendations=doc.querySelector('.cortex-recommendation-strip');
  assert.equal(jump.parentElement,jumpDock);
  assert.equal(jumpDock.parentElement,story.parentElement);
  assert.equal(story.parentElement.nextElementSibling,recommendations);
  assert.equal(story.parentElement.className,'nexus-reading-paper-frame');
  assert.ok(story.parentElement.parentElement.classList.contains('story-column'));
  const readerCss=fs.readFileSync('public/cortex-nexus.css','utf8'),readerView=fs.readFileSync('public/cortex-nexus-view.js','utf8');
  assert.match(readerCss,/\.cortex-native \.choice\{[^}]*white-space:pre-wrap[^}]*tab-size:4/u);assert.match(readerCss,/\.cortex-native \.composer :is\(#send,\.nexus-continue-button\)\{[^}]*height:30px[^}]*font-size:10px/u);
  assert.match(readerView,/choice\.textContent=String\(turn\.input\|\|''\)/u);assert.match(readerView,/readerScroll\.followEnd\(\{submitted:true\}\)/u);
  Object.defineProperties(story,{scrollHeight:{configurable:true,value:2000},clientHeight:{configurable:true,value:500}});
  story.scrollTo=({top})=>{story.scrollTop=Math.min(top,1500)};
  story.scrollTop=200;story.dispatchEvent(new app.win.Event('scroll'));assert.equal(jump.hidden,false);
  jump.click();await app.settle(60);assert.equal(story.scrollTop,1500);assert.equal(jump.hidden,true);assert.notEqual(doc.activeElement,input);
  story.scrollTop=200;doc.getElementById('send').addEventListener('click',event=>event.stopImmediatePropagation(),true);doc.getElementById('send').click();assert.equal(story.scrollTop,1500);assert.equal(app.win.NexusReaderScroll.following,true);
  const node=doc.createElement('div');node.className='notice';node.textContent='저장 알림';doc.getElementById('feed').prepend(node);await app.settle(30);
  assert.equal(node.parentElement.className,'nexus-notices');assert.ok(node.closest('.composer-wrap'));assert.equal(node.getAttribute('role'),'status');node.querySelector('button').click();assert.equal(node.isConnected,false);
  app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:app.win.location.origin,source:app.win.parent,data:{channel:'NEXUS_CORTEX_HOST_V1',type:'NOTICE',message:'동기화 확인'}}));
  assert.equal(doc.querySelector('[data-host-notice]')?.firstChild.textContent,'동기화 확인');
  app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:'https://invalid.example',source:app.win.parent,data:{channel:'NEXUS_CORTEX_HOST_V1',type:'NOTICE',message:'무시'}}));
  assert.equal(doc.querySelector('[data-host-notice]')?.firstChild.textContent,'동기화 확인');
  app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:app.win.location.origin,source:app.win.parent,data:{channel:'NEXUS_CORTEX_HOST_V1',type:'LEASE_LOCK',locked:true}}));
  assert.equal(input.disabled,true);assert.equal(doc.documentElement.hasAttribute('data-nexus-lease-locked'),true);
  app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:app.win.location.origin,source:app.win.parent,data:{channel:'NEXUS_CORTEX_HOST_V1',type:'LEASE_LOCK',locked:false}}));
  assert.equal(input.disabled,false);assert.equal(doc.documentElement.hasAttribute('data-nexus-lease-locked'),false);
  for(const ua of ['Mozilla/5.0 (iPhone)','Mozilla/5.0 (Linux; Android 15)']){
   Object.defineProperty(app.win.navigator,'userAgent',{configurable:true,value:ua});input.value='줄바꿈';const event=new app.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});input.dispatchEvent(event);assert.equal(event.defaultPrevented,false);assert.equal(app.api._turns().length,0);
  }
  Object.defineProperty(app.win.navigator,'userAgent',{configurable:true,value:'desktop'});
  input.value='';
  const composing=new app.win.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});input.dispatchEvent(composing);assert.equal(composing.defaultPrevented,false);
  const desktop=new app.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});input.dispatchEvent(desktop);assert.equal(desktop.defaultPrevented,true);
 }finally{app.close()}
});

test('scene separators follow saved scene boundaries without decorating every beat or mutating canon',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel()}).open();try{
  const scenario=structuredClone(app.scenario);
  const turns=[
   {day:0,time:'08:00',location:'서촌 골목, 문 앞'},
   {day:0,time:'08:05',location:'서촌 골목, 창가'},
   {day:1,time:'08:00',location:'서촌 골목, 창가'},
   {day:1,time:'08:05',location:'북촌 서점'},
   {day:1,time:'14:00',location:'북촌 서점'},
  ].map((start,i)=>({id:'scene-'+i,input:'주변을 본다',text:'장면 본문 '+i,status:'COMMITTED',txn:{start},metrics:{authorRecommendations:{status:'ACCEPTED'}}}));
  app.api.applyImportedState({scenario,turns},{persistState:false});await app.settle(180);
  const doc=app.win.document,markers=[...doc.querySelectorAll('.dancheong-scene-break')];
  assert.equal(markers.length,3);assert.match(markers[0].textContent,/D\+1/);assert.equal(markers[1].textContent,'북촌 서점');assert.match(markers[2].textContent,/14:00/);
  const snapshot=JSON.stringify(app.api._turns());
  for(let i=0;i<3;i++)app.win.dispatchEvent(new app.win.Event('cortex-turn-display'));
  await app.settle(80);assert.equal(doc.querySelectorAll('.dancheong-scene-break').length,3);assert.equal(JSON.stringify(app.api._turns()),snapshot);
  app.api.applyImportedState({scenario,turns:turns.slice(0,2)},{persistState:false});await app.settle(100);
  assert.equal(doc.querySelectorAll('.dancheong-scene-break').length,0);
 }finally{app.close()}
});

test('only completed event receipts receive a closure seal, not failed or diverted events',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel()}).open();try{
  const scenario=structuredClone(app.scenario);
  scenario.runtime.eventLedger={...(scenario.runtime.eventLedger||{}),sealed:[
   {eventId:'finished',title:'완료한 사건',outcome:'SUCCESS'},
   {eventId:'failed',title:'미완료 사건',outcome:'FAILURE'},
   {eventId:'diverted',title:'다른 경로로 전환',outcome:'SUCCESS',closureMode:'ALTERNATIVE'}
  ]};
  app.api.applyImportedState({scenario,turns:[]},{persistState:false});await app.settle(180);
  const doc=app.win.document;doc.querySelector('[data-nexus-tab="events"]').click();const seals=[...doc.querySelectorAll('.dancheong-closure-seal')];
  assert.equal(seals.length,1);assert.match(seals[0].closest('details').textContent,/완료한 사건/);
  assert.equal(doc.querySelectorAll('.event-ended .dancheong-closure-seal,.event-transition .dancheong-closure-seal').length,0);
  assert.equal(doc.querySelectorAll('.event-ended [data-state="checked"],.event-transition [data-state="checked"]').length,0);
 }finally{app.close()}
});

test('Nexus wrapper preserves the validated adapted Cortex source exactly',()=>{
 assert.equal(createHash('sha256').update(raw).digest('hex'),JSON.parse(fs.readFileSync('vendor/cortex/manifest.json','utf8')).sha256);
 assert.equal(wrapped.replace('\n<script src="/jieum-reader.js"></script>','').replace('\n<script src="/cortex-host.js"></script>','').replace(/\n<script src="\/cortex-vn-host\.js(?:\?v=[a-f0-9]+)?"><\/script>/u,'').replace('\n<script src="/cortex-nexus-view.js"></script>','').replace('\n<script src="/cortex-nexus-inspector.js"></script>','').replace('<link rel="stylesheet" href="/nexus-reader.css">','').replace('<link rel="stylesheet" href="/cortex-nexus.css">',''),adaptVNEngine(raw));
 assert.ok(host.includes("document.addEventListener('DOMContentLoaded',bootHost"),'reader bootstrap must not await all image loads');
 assert.ok(host.indexOf('emitReady()')<host.indexOf('window.primeNexusReaderImages'),'embedded portrait preparation must not block reader readiness');
});
test('a fresh Cortex session waits for an installed package instead of opening a demo story',async()=>{
 const app=await new HeadlessCortex({standalonePath,model:makeModel()}).open();try{
  assert.equal(app.scenario.runtime.storyId,'unconfigured');
  assert.equal(app.scenario.event.id,'package-required');
  assert.equal(app.win.document.documentElement.classList.contains('nexus-awaiting-package'),true);
  assert.doesNotMatch(raw+host,/꺼진 안내판|__DANCHEONG_BUILTIN_PACKAGE|_builtinCandidate/u);
 }finally{app.close()}
});
test('every package keeps its opening body visible before the first Cortex turn',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const scenario=structuredClone(app.scenario),opening='모든 작품은 패키지에 기록된 시작본문으로 첫 장면을 연다.';
  scenario.runtime={...(scenario.runtime||{}),packageContract:{...(scenario.runtime?.packageContract||{}),openingContract:{...(scenario.runtime?.packageContract?.openingContract||{}),openingLine:opening}}};
  app.api.applyImportedState({scenario,turns:[]},{persistState:false});await app.settle(100);
  assert.equal(app.win.document.querySelector('.opening-scene .prose')?.textContent?.trim(),opening);
 }finally{app.close()}
});
test('prologue and hero portrait survive the first input, reload and paged history without duplicates',async()=>{
 const scenario=structuredClone(fixtureScenario),opening='첫 문단의  공백도 남긴다.\n\n두 번째 문단에서 이야기가 시작된다.';
 scenario.runtime.packageContract.openingContract={openingLine:opening};
 const indexedDB=new IDBFactory(),model=makeModel();let firstNode,heroNode,app;
 model.beforeRespond=(entry)=>{if(entry.kind==='writer'){assert.equal(app.win.document.querySelector('.opening-scene'),firstNode);assert.equal(firstNode.querySelector('[data-opening-portrait]'),heroNode)}};
 app=await new HeadlessCortex({initialScenario:scenario,initialMedia:fixtureMedia,standalonePath,model,indexedDB}).open();
 const check=()=>{const d=app.win.document;assert.equal(d.querySelectorAll('.opening-scene').length,1);assert.equal(d.querySelector('.opening-scene .prose').textContent,opening);assert.equal(d.querySelectorAll('[data-opening-portrait]').length,1);assert.equal(d.querySelector('#feed > article.turn'),d.querySelector('.opening-scene'));assert.equal(d.querySelector('.turn:not(.opening-scene) [data-speaker-portrait="'+scenario.protagonist.id+'"]'),null)};
 try{
  await app.settle(180);firstNode=app.win.document.querySelector('.opening-scene');heroNode=firstNode.querySelector('[data-opening-portrait]');assert.ok(heroNode?.querySelector('img'));check();
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});const turn=await app.turn('주변을 살펴본다.');assert.equal(turn.status,'COMMITTED');await app.settle(180);check();assert.equal(app.win.document.querySelector('.opening-scene'),firstNode);
  await app.api.persist();app.close();app=await new HeadlessCortex({initialScenario:scenario,initialMedia:fixtureMedia,standalonePath,model,indexedDB}).open();await app.settle(180);check();assert.equal(app.turns.length,1);
  const history=Array.from({length:40},(_,i)=>({id:'opening-history-'+i,status:'COMMITTED',sourceEventId:scenario.event.id,text:'본문 '+(i+1),input:'입력 '+(i+1)}));
  app.api.applyImportedState({scenario:app.scenario,turns:history},{persistState:false});await app.settle(180);check();assert.equal(app.api._renderedTurnRange().start,35);
  app.api._loadEarlierTurns(50);await app.settle(180);check();assert.equal(app.win.document.querySelectorAll('#feed > article.turn:not(.opening-scene)').length,40);assert.equal(app.api._renderedTurnRange().start,0);
  const other=structuredClone(app.scenario);other.runtime.storyId='no-opening-story';other.runtime.packageContract.openingContract={};app.api.applyImportedState({scenario:other,turns:[]},{persistState:false});await app.settle(80);assert.equal(app.win.document.querySelector('.opening-scene'),null);
 }finally{app.close()}
});

test('real vendored runtime commits, restores and isolates sessions without calling a live API',async()=>{
 const indexedDB=new IDBFactory(),model=makeModel();
 const writer=model.writer;model.writer=(...args)=>writer(...args).replaceAll('한시우',fixtureScenario.protagonist.name);
 let app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model,indexedDB}).open();
 try{
  assert.equal(app.api.VERSION,'1.42.0');
  for(const selector of ['.story-column > .topbar','.story-column > .nexus-reading-paper-frame > .story-scroll','.composer-wrap .composer #input','.right-rail #eventInspector','.topbar .reader-tools-menu'])assert.ok(app.win.document.querySelector(selector),selector);
  assert.equal(app.win.document.documentElement.classList.contains('nexus-booting'),false);
  assert.equal(app.win.document.documentElement.classList.contains('nexus-view-ready'),true);
  assert.equal(app.win.document.querySelectorAll('#input').length,1);assert.equal(app.win.document.querySelectorAll('#send').length,1);
  for(const id of ['input','send','exportBtn','restoreBackupBtn','copyPromptBtn','nexusPackageFile','applyNexusPackage','worldClock','worldLocationBar'])assert.ok(app.win.document.getElementById(id),id);
  for(const id of ['legacyZipBtn','savedCopiesBtn','rewindBtn'])assert.equal(app.win.document.getElementById(id),null,id);
  assert.deepEqual([...app.win.document.querySelectorAll('.panel.actions > button')].map(button=>button.textContent.trim()),['공통 세션 내보내기','초기화·되감기 전 기록 복구','마지막 공개 작가 요청 복사']);
  assert.doesNotMatch(app.win.document.querySelector('.app').textContent,/장면 진행 상세|마감 초과/u);
  assert.equal(app.win.document.getElementById('settingsBtn'),null);
  assert.ok([...app.win.document.querySelectorAll('.reader-tools-popover button')].some(button=>button.textContent==='설정'));
  const emitted=[];app.win.addEventListener('message',event=>{if(event.data?.channel==='NEXUS_CORTEX_HOST_V1')emitted.push(event.data)});
  const toolsMenu=app.win.document.querySelector('.reader-tools-menu'),toolsTrigger=toolsMenu.querySelector('.reader-tools-trigger'),toolsPopover=app.win.document.getElementById('cortex-session-tools');assert.equal(toolsPopover.parentElement,app.win.document.body);assert.equal(toolsPopover.hidden,true);toolsTrigger.click();assert.equal(toolsPopover.hidden,false);assert.equal(toolsTrigger.getAttribute('aria-expanded'),'true');
  [...toolsPopover.querySelectorAll('button')].find(button=>button.textContent==='설정').click();await app.settle();assert.equal(toolsPopover.hidden,true);assert.equal(toolsTrigger.getAttribute('aria-expanded'),'false');assert.ok(emitted.some(message=>message.type==='NEXUS_SETTINGS'));
  app.win.confirm=()=>true;toolsTrigger.click();[...toolsPopover.querySelectorAll('button')].find(button=>button.textContent==='세션 초기화').click();await app.settle();assert.ok(emitted.some(message=>message.type==='RESET_SESSION'));
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  const turn=await app.turn('집 안의 흔적을 천천히 살펴본다.');
  assert.ok(turn.text.length>0);assert.notEqual(turn.status,'STREAMING');assert.equal(app.win.document.getElementById('send').disabled,false);
  await app.settle(250);
  assert.equal(app.win.document.querySelector('.turn:not(.opening-scene) [data-speaker-portrait="'+fixtureScenario.protagonist.id+'"]'),null,'hero portrait is opening-only');
  assert.equal(turn.packageTriggerImages?.some(item=>item.source==='CHARACTER_FIRST_APPEARANCE')||false,false);
  assert.ok(app.win.NexusCortexPrimaryMedia.get(fixtureScenario.protagonist.id),'primary asset remains available to avatars and manual image references');
  await app.api.persist();const expected=turn.text;
  const dbs=await indexedDB.databases();assert.ok(dbs.length);assert.ok(dbs.every(r=>r.name.startsWith('nexus-cortex:test:')));
  app.close();
  app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model,indexedDB}).open();
  assert.equal(app.turns[0].text,expected);
  const backup=await app.api._fullExport();assert.ok(backup);
  app.close();app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model,indexedDB,url:'https://cortex.test/?session=another'}).open();
  assert.equal(app.turns.length,0);assert.ok((await indexedDB.databases()).some(r=>r.name.startsWith('nexus-cortex:another:')));
  await app.api._importFull(backup);assert.equal(app.turns[0].text,expected);
  assert.ok(model.calls.some(r=>r.kind==='writer'));
 }finally{app.close()}
});

test('a valid progressed save is never replaced just because the package marker is missing',async()=>{
 const indexedDB=new IDBFactory(),model=makeModel();
 let app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model,indexedDB}).open();
 try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  const committed=await app.turn('복도 끝의 흔적을 확인한다.');
  await app.api.persist();
  const expected=committed.text;
  app.close();
  app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model,indexedDB}).open();
  assert.equal(app.turns[0]?.text,expected);
  assert.equal(app.win.document.documentElement.classList.contains('nexus-awaiting-package'),false,'restored state itself must authorize the package');
 }finally{await app.settle(650);app.close()}
});

test('an isolated recovery save remains active after a new tab loses sessionStorage',async()=>{
 const indexedDB=new IDBFactory(),model=makeModel();
 let app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model,indexedDB}).open();
 try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  await app.turn('첫 번째 단서를 기록한다.');
  const forked=await app.api._forkStorage();assert.equal(forked.ok,true);
  await app.turn('격리 저장본에서 두 번째 단서를 기록한다.');
  await app.api.persist();
  const storage=app.close();
  app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model,indexedDB,localStorageSeed:storage.localStorageSeed}).open();
  assert.match(app.api._storageStatus().key,/^recovered:/u);
  assert.equal(app.turns.length,2);
 }finally{await app.settle(650);app.close()}
});

test('committed dialogue is presented with the Dancheong speaker card and package primary avatar',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const protagonist=app.scenario.protagonist,text=`${protagonist.name}가 낮게 말했다. “지금부터 확인해 보죠.”\n\n복도 저편에서 발소리가 멎었다.`;
  app.api.applyImportedState({scenario:structuredClone(app.scenario),turns:[{id:'dialogue-fixture',input:'확인한다',text,status:'COMMITTED',dialogueAnnotations:[{offset:text.indexOf('“'),quoteText:'“지금부터 확인해 보죠.”',bindingVersion:2,characterId:protagonist.id,speakerName:protagonist.name,source:'WRITER_CHARACTER_REF'}]}]},{persistState:false});for(let attempt=0;attempt<30&&!app.win.document.querySelector('.nexus-dialogue-avatar img');attempt++)await app.settle(100);
  const card=app.win.document.querySelector('.nexus-dialogue-row');assert.ok(card);assert.equal(card.querySelector('.nexus-dialogue-head strong')?.textContent,protagonist.name);assert.match(card.querySelector('.nexus-dialogue-head span')?.textContent||'',/플레이어 캐릭터/u);assert.equal(card.querySelector('.nexus-dialogue-body p')?.textContent,'“지금부터 확인해 보죠.”');assert.match(card.querySelector('.nexus-dialogue-avatar img')?.src||'',/^data:image\//u);assert.equal(app.win.document.querySelectorAll('.nexus-narration').length,2);
 }finally{app.close()}
});
test('writer-bound dialogue cards survive normalized offsets without alternating-speaker inference',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const protagonist=app.scenario.protagonist,hanseo=app.scenario.characters.find(person=>person.name==='박한서'),text=`손이 먼저 나갔다. ${hanseo.name}는 문밖에 섰고 ${protagonist.name}는 베개를 세웠다.\n\n“아침부터 사람 머리를 왜 때려?”\n\n문밖의 ${hanseo.name}가 이마를 문지르며 노려봤다. ${protagonist.name}는 태연한 표정을 만들었다.\n“알람이 너무 시끄러워서.”\n“범인은 네가 늦잠 잔 거거든?”\n“그럼 공범인 알람도 잡아 와.”`,starts=[...text.matchAll(/[“‘「『"'][^“”‘’「」『』"']{0,400}(?:[”’」』"']|$)/gu)].map(match=>match.index);
  app.api.applyImportedState({scenario:structuredClone(app.scenario),turns:[{id:'offset-dialogue',text,status:'COMMITTED',dialogueAnnotations:starts.map((offset,i)=>({offset:offset+3,quoteText:text.slice(offset,text.indexOf('”',offset)+1),bindingVersion:2,characterId:i%2?protagonist.id:hanseo.id,speakerName:i%2?protagonist.name:hanseo.name,source:'WRITER_CHARACTER_REF'}))}]},{persistState:false});await app.settle(100);
  const names=[...app.win.document.querySelectorAll('.nexus-dialogue-head strong')].map(node=>node.textContent),lines=[...app.win.document.querySelectorAll('.nexus-dialogue-body p')].map(node=>node.textContent);
  assert.deepEqual(names,[hanseo.name,protagonist.name,hanseo.name,protagonist.name]);assert.equal(lines.length,4);assert.ok(lines.every(line=>line.startsWith('“')));
 }finally{app.close()}
});
test('printed and displayed quotations never inherit a nearby character as their speaker',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const protagonist=app.scenario.protagonist,text=`사진 아래에는 ‘실종자를 찾습니다’라는 문구가 희미하게 드러났다. ${protagonist.name}의 이름만큼은 선명했다.\n\n전단지 아래에는 ‘마지막 목격 장소 주변 CCTV 확인’이라는 메모가 적혀 있었다.`,first=text.indexOf('‘'),second=text.lastIndexOf('‘');
  const mistaken=[first,second].map(offset=>({schema:'CORTEX_DIALOGUE_SPEAKER_V1',offset,characterId:protagonist.id,speakerName:protagonist.name,source:'WRITER_CHARACTER_REF'}));
  app.api.applyImportedState({scenario:structuredClone(app.scenario),turns:[{id:'written-quote-fixture',input:'사진을 본다',text,status:'COMMITTED',dialogueAnnotations:mistaken}]},{persistState:false});await app.settle(100);
  assert.equal(app.win.document.querySelectorAll('.nexus-dialogue-row').length,0);assert.match(app.win.document.querySelector('.prose')?.textContent||'',/실종자를 찾습니다/u);assert.match(app.win.document.querySelector('.prose')?.textContent||'',/CCTV 확인/u);
 }finally{app.close()}
});

test('dialogue layout preserves prose and displays non-spoken quotations on their own line',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const text='그가 “가자.” 했다.\n\n쪽지에는 ‘돌아와’라고 적혀 있었다.',person=app.scenario.protagonist;
  app.api.applyImportedState({scenario:structuredClone(app.scenario),turns:[{id:'lossless',text,status:'COMMITTED',dialogueAnnotations:[{offset:text.indexOf('“'),characterId:person.id,speakerName:person.name},{offset:text.indexOf('‘'),quoteKind:'NON_SPEECH'}]}]},{persistState:false});await app.settle(100);
  const prose=app.win.document.querySelector('.turn .prose');
  const body=[...prose.querySelectorAll('.nexus-narration,.nexus-dialogue-body > p')].map(n=>n.textContent).join('');
  assert.equal(body,text.replace(/\n+/g,''));
  assert.equal(prose.querySelectorAll('.nexus-dialogue-row').length,1);
  const quote=prose.querySelector('.nexus-written-quote');assert.equal(quote?.textContent,'‘돌아와’');assert.equal(quote.previousElementSibling.textContent,'쪽지에는 ');assert.equal(quote.nextElementSibling.textContent,'라고 적혀 있었다.');
 }finally{app.close()}
});
test('writer speaker metadata renders a dialogue card before the Cortex turn is committed',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const protagonist=app.scenario.protagonist,text='“아직 쓰는 중이야';
  app.api.applyImportedState({scenario:structuredClone(app.scenario),turns:[{id:'streaming-dialogue',input:'말한다',text:'',displayText:text,displayTyping:true,status:'STREAMING',dialogueAnnotations:[{schema:'CORTEX_DIALOGUE_SPEAKER_V1',offset:0,characterId:protagonist.id,speakerName:protagonist.name,source:'WRITER_CHARACTER_REF'}]}]},{persistState:false});await app.settle(100);
  const card=app.win.document.querySelector('.nexus-dialogue-row');assert.ok(card);assert.equal(card.querySelector('.nexus-dialogue-head strong')?.textContent,protagonist.name);assert.equal(card.querySelector('.nexus-dialogue-body p')?.textContent,text);assert.ok(app.win.document.querySelector('.prose .cursor'));
 }finally{app.close()}
});
test('the prose writer classifies a non-spoken quotation before it reaches the live reader',async()=>{
 const model=makeModel({writer(){return `사진 아래에는 ⟦Q⟧‘실종자를 찾습니다’라는 문구가 적혀 있었다. 이름 옆의 날짜는 빗물에 번져 있었다.\n\n주인공은 젖은 전단을 조심스럽게 들어 올려 뒷면까지 확인했다.`}}),app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});const turn=await app.turn('전단을 확인한다.');
  assert.doesNotMatch(turn.text,/⟦Q⟧/u);assert.equal(turn.dialogueAnnotations?.[0]?.source,'WRITER_NON_SPEECH_QUOTE');assert.equal(turn.dialogueAnnotations?.[0]?.quoteKind,'NON_SPEECH');await app.settle(100);assert.equal(app.win.document.querySelectorAll('.nexus-dialogue-row').length,0);
 }finally{app.close()}
});
test('Cortex prose writer emits and stores hidden speaker metadata without leaking markers into canon text',async()=>{
 let speakerId='';const model=makeModel({writer(){return `⟦S:${speakerId}⟧“지금 확인하겠습니다.”\n\n그는 문 쪽으로 몸을 돌렸다.`}}),app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  speakerId=app.scenario.protagonist.id;
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});const turn=await app.turn('확인한다고 말한다.');
  assert.doesNotMatch(turn.text,/⟦[SN]:/u);assert.equal(turn.dialogueAnnotations?.[0]?.source,'WRITER_CHARACTER_REF');assert.equal(turn.dialogueAnnotations[0].bindingVersion,2);assert.equal(turn.dialogueAnnotations[0].quoteText,'“지금 확인하겠습니다.”');assert.ok(model.calls.some(call=>call.kind==='writer'));
  await app.settle(100);assert.equal(app.win.document.querySelector('.nexus-dialogue-head strong')?.textContent,app.scenario.protagonist.name);
 }finally{app.close()}
});
test('streaming the next beat preserves earlier image nodes instead of rebuilding the feed',async()=>{
 const model=makeModel({writer(){return '주인공은 사진에서 시선을 떼고 골목 안쪽으로 한 걸음 옮겼다. 젖은 바닥이 희미한 불빛을 반사했다.\n\n그는 벽면의 흔적을 따라가며 다음 단서를 살폈다.'}}),app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  const scenario=structuredClone(app.scenario),imageUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
  app.api.applyImportedState({scenario,turns:[{id:'image-beat',input:'사진을 확인한다',text:'사진을 확인했다.',status:'COMMITTED',packageTriggerImages:[{triggerId:'fixture-image',label:'대표 사진',url:imageUrl}]}]},{persistState:false});await app.settle(100);
  const original=app.win.document.querySelector('.package-trigger-image img');assert.ok(original);app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});await app.turn('골목 안쪽을 살핀다.');await app.settle(100);
  assert.strictEqual(app.win.document.querySelector('.package-trigger-image img'),original);
 }finally{app.close()}
});
test('Nexus Cortex sends Flare scene images through the same-origin metered route',async()=>{
 let imageRequest=null;const model=makeModel({beforeRespond(entry,body){if(entry.kind!=='image')return undefined;imageRequest=body;const usage={input_tokens:1100,input_tokens_details:{text_tokens:200,image_tokens:900},output_tokens:208,output_tokens_details:{image_tokens:208}};return {ok:true,status:200,headers:new Headers({'content-type':'application/json'}),body:null,json:async()=>({imageUrl:'data:image/jpeg;base64,RkxBUkU=',model:'gpt-image-2.5-flare',referenceCount:(body.referenceImages||[]).length,inputFidelity:(body.referenceImages||[]).length?'default':'none',usage}),text:async()=>''}}}),app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant',imageQuality:'medium'});const turn=await app.turn('복도에 있는 단서를 확인한다.');await app.settle(100);const button=app.win.document.querySelector('.nexus-beat-image');assert.ok(button);button.click();for(let attempt=0;attempt<50&&turn.imageStatus==='GENERATING';attempt++)await app.settle(50);
  assert.ok(imageRequest);assert.equal(imageRequest.model,'gpt-image-2.5-flare');assert.equal(imageRequest.quality,'medium');assert.equal(imageRequest.aspect,'landscape');assert.ok(imageRequest.referenceImages.length<=2);assert.equal(turn.imageModel,'gpt-image-2.5-flare');assert.equal(turn.imageInputFidelity,imageRequest.referenceImages.length?'default':'none');assert.match(turn.imageUrl||'',/^data:image\/jpeg;base64,/u);const imageLog=turn.apiLog.find(call=>call.role.startsWith('IMAGE_'));assert.ok(imageLog);assert.equal(imageLog.model,'gpt-image-2.5-flare');assert.equal(imageLog.cost?.category,'scene_image');assert.equal(imageLog.cost?.measured,true);
 }finally{app.close()}
});
test('Cortex shows only same-turn prose-writer recommendations in the redesigned horizontal action rail',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});const turn=await app.turn('현관 주변을 살핀다.');await app.settle(120);
  let copied='';Object.defineProperty(app.win.navigator,'clipboard',{configurable:true,value:{writeText:async value=>{copied=value}}});
  const actions=app.win.document.querySelector('.story-turn .nexus-beat-actions');assert.ok(actions);assert.equal(actions.querySelectorAll('button').length,4);assert.equal(actions.querySelector('.nexus-beat-diagnostic').getAttribute('aria-label'),'1비트 진단 내보내기');assert.equal(app.win.document.querySelector('.turn-image-action')?.hidden,true);
  assert.ok(actions.firstElementChild.classList.contains('nexus-beat-rewind'));actions.querySelector('.nexus-beat-copy').click();await app.settle();assert.equal(copied,turn.text);assert.match(actions.querySelector('.nexus-beat-copy').textContent,/복사됨/u);
  const strip=app.win.document.querySelector('.cortex-recommendation-strip'),cards=[...strip.querySelectorAll('.cortex-recommendations button')];assert.equal(strip.hidden,false);assert.equal(cards.length,3);assert.equal(cards[0].querySelector('strong').textContent,'현관의 낡은 우산 두 개를 나란히 비교해 남은 흔적을 짚어 본다.');assert.equal(turn.metrics.authorRecommendations.status,'ACCEPTED');assert.ok(turn.recommendations.every(row=>row.source==='SAME_TURN_PROSE_WRITER'));cards[0].click();assert.equal(app.win.document.getElementById('input').value,cards[0].querySelector('strong').textContent);
  assert.match(strip.querySelector('header').textContent,/다음 수 추천/u);assert.doesNotMatch(strip.querySelector('header').textContent,/산문작가의 다음 수/u);assert.ok(cards[0].classList.contains('tone-low'));assert.equal(strip.querySelectorAll('.cortex-recommendation-navigation button').length,2);
  assert.match(fs.readFileSync('public/cortex-nexus.css','utf8'),/\.cortex-native \.prose\{[^}]*font-weight:400[^}]*line-height:2\.05/u);assert.match(fs.readFileSync('public/cortex-nexus.css','utf8'),/\.cortex-native \.nexus-dialogue-body p\{[^}]*font-weight:600[^}]*line-height:1\.85/u);
 }finally{app.close()}
});
test('Instant opening shows the selected profile’s three authored waves before the first turn',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const scenario=app.scenario,labels=['젖은 봉투의 봉인을 살핀다.','무녀에게 멈춘 시계의 사연을 묻는다.','시계탑의 잠긴 문을 직접 연다.'];
  scenario.runtime.instantStory={startProfiles:[{id:'START_WAVES',name:'멈춘 시계',prologue:'시계가 멈췄다.',startSituation:'역전 앞',recommendedReplies:labels}]};
  scenario.runtime.instantState={profileId:'START_WAVES',turnCount:0};
  app.win.dispatchEvent(new app.win.Event('cortex-turn-display'));await app.settle(120);
  const strip=app.win.document.querySelector('.cortex-recommendation-strip'),cards=[...strip.querySelectorAll('.cortex-recommendations button')];assert.equal(strip.hidden,false);assert.deepEqual(cards.map(card=>card.querySelector('strong').textContent),labels);assert.match(cards[0].textContent,/작은파동/u);assert.match(cards[1].textContent,/중간파동/u);assert.match(cards[2].textContent,/큰파동/u);
  cards[1].click();assert.equal(app.win.document.getElementById('input').value,labels[1]);
  const hud=app.win.document.querySelector('[data-instant-status]');assert.ok(hud);const child=hud.firstChild;
  app.win.dispatchEvent(new app.win.Event('cortex-turn-display'));await app.settle(150);
  assert.equal(app.win.document.querySelector('[data-instant-status]'),hud);assert.equal(hud.firstChild,child,'unchanged Instant HUD keeps its existing DOM');
  scenario.runtime.instantState.turnCount=2;app.win.dispatchEvent(new app.win.Event('cortex-turn-display'));await app.settle(150);assert.match(hud.textContent,/2비트/);
 }finally{app.close()}
});
test('recommendation copies never enter streaming prose, while ordinary numbered narration survives',async()=>{
 const app=await new HeadlessCortex({standalonePath,model:makeModel()}).open();try{
  const labels=['문턱의 종이를 집어 글자를 자세히 살핀다','골목의 발자국을 따라 숨은 존재를 찾는다','붉은 실을 당겨 종이의 연결처를 확인한다'];
  const prose='2018년 아침이다.\n\n산길에는 바람이 불었다.\n\n다시 문을 닫았다.';
  const wire=prose+'\n\n'+labels.map(x=>'- '+x).join('\n\n')+'<!--CORTEX_ST_V1 '+JSON.stringify({segments:[],recommendations:labels.map((label,i)=>({label,risk:['HIGH','LOW','MEDIUM'][i]}))})+'-->';
  const decoder=app.win.CortexNarrativeSpacetime.createStreamDecoder({});let visible='';for(const ch of wire){visible+=decoder.push(ch);assert.ok(!labels.some(label=>visible.includes(label)))}visible+=decoder.finish().tail;assert.equal(visible.trim(),prose);
 }finally{app.close()}
});
test('media schema upgrades an empty legacy database and retains unrelated records',async()=>{
 const indexedDB=new IDBFactory();await new Promise((resolve,reject)=>{const req=indexedDB.open('nexus-cortex:test:dancheong-cortex-media-v1230',1);req.onupgradeneeded=()=>req.result.createObjectStore('sentinel');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('sentinel','readwrite');tx.objectStore('sentinel').put('preserved','key');tx.oncomplete=()=>{db.close();resolve()}}});
 const app=await new HeadlessCortex({indexedDB,standalonePath,model:makeModel()}).open();try{const db=await app.api._openMedia();assert.equal(db.version,2);assert.ok(db.objectStoreNames.contains('generated'));assert.ok(db.objectStoreNames.contains('package-assets'));assert.ok(db.transaction('package-assets').objectStore('package-assets').indexNames.contains('storyId'));const value=await new Promise(resolve=>{const req=db.transaction('sentinel').objectStore('sentinel').get('key');req.onsuccess=()=>resolve(req.result)});assert.equal(value,'preserved');db.close()}finally{app.close()}
});
test('continue runs a normal beat and per-beat rewind restores the selected earlier boundary',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel()}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});const first=await app.turn('현관 주변을 살핀다.');await app.settle(50);const baseline=app.turns.length;app.api._setInput('');await app.api._continue();await app.settle(100);assert.equal(app.turns.length,baseline+1);assert.equal(app.turns.at(-1).status,'COMMITTED');assert.match(app.turns.at(-1).input,/이어서 집필/u);
  app.win.confirm=()=>true;await app.api._rewind(first.id);await app.settle(100);assert.equal(app.turns.some(t=>t.id===first.id),false);assert.equal(app.turns.length,baseline-1);assert.ok(app.win.document.querySelector('.nexus-continue-button'));assert.equal(app.win.document.querySelector('.topbar #rewindQuickBtn'),null);
 }finally{app.close()}
});
test('Cortex fails closed when the prose writer omits recommendation metadata',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel({recommendations:()=>[]})}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});const turn=await app.turn('현관 주변을 살핀다.');await app.settle(120);const strip=app.win.document.querySelector('.cortex-recommendation-strip');assert.equal(turn.metrics.authorRecommendations.status,'REJECTED');assert.ok(turn.metrics.authorRecommendations.issues.includes('SIDECAR_MISSING'));assert.equal(turn.recommendations,undefined);assert.equal(strip.hidden,true);assert.equal(strip.querySelectorAll('.cortex-recommendations button').length,0);
 }finally{app.close()}
});
test('Cortex rejects a complete but generic recommendation sidecar instead of polishing it in the UI',async()=>{
 const model=makeModel({recommendations:()=>[{label:'주변을 천천히 살피며 달라진 점과 놓친 단서를 확인한다.',risk:'LOW'},{label:'상황에서 중요한 사실을 상대에게 차분하게 물어본다.',risk:'MEDIUM'},{label:'지금 가장 중요한 일을 직접 행동에 옮겨 상황을 진전시킨다.',risk:'HIGH'}]}),app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});const turn=await app.turn('현관 주변을 살핀다.');await app.settle(120);assert.equal(turn.metrics.authorRecommendations.status,'REJECTED');assert.ok(turn.metrics.authorRecommendations.issues.some(code=>code.startsWith('GENERIC_ACTION:')));assert.equal(app.win.document.querySelector('.cortex-recommendation-strip').hidden,true);
 }finally{app.close()}
});
test('writer-supplied message senders and replies are displayed without UI reinterpretation',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const scenario=structuredClone(app.scenario),hero=scenario.protagonist,other=scenario.characters[0];hero.name='이서연';other.name='정민준';other.source={...(other.source||{}),name:'정민준',preRevealAlias:''};delete other.preRevealAlias;
  const text='민준이 보낸 문장은 짧았다.\n\n“내일 직접 설명해.”\n\n서연은 고개를 끄덕였다.\n\n“알았어.”\n\n“잊지 마.”\n\n“기억할게.”',starts=[...text.matchAll(/“/gu)].map(m=>m.index);
  app.api.applyImportedState({scenario,turns:[{id:'speaker-regression',text,status:'COMMITTED',dialogueAnnotations:starts.map((offset,i)=>({offset,bindingVersion:2,quoteText:text.slice(offset,text.indexOf('”',offset)+1),characterId:i%2?hero.id:other.id,speakerName:i%2?hero.name:other.name,source:'WRITER_CHARACTER_REF'}))}]},{persistState:false});await app.settle(120);
  const cards=[...app.win.document.querySelectorAll('.nexus-dialogue-head strong')].map(n=>n.textContent);assert.deepEqual(cards,['정민준','이서연','정민준','이서연']);
 }finally{app.close()}
});
test('narrative-only names never mount portraits, even when the image capsule lists the hero',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const scenario=structuredClone(app.scenario),text=scenario.protagonist.name+'는 문을 열었다. 다른 인물의 편지가 도착했다.';
  app.api.applyImportedState({scenario,turns:[{id:'mentions-only',text,status:'COMMITTED',imageCapsule:{referenceCharacterIds:[scenario.protagonist.id]}}]},{persistState:false});await app.settle(800);
  assert.equal(app.win.document.querySelectorAll('.prose [data-speaker-portrait]').length,0);assert.equal(app.turns[0].text,text);
 }finally{app.close()}
});

test('missing embedded portraits never trigger paid profile generation',async()=>{
 let imageCalls=0;const model=makeModel({beforeRespond:entry=>{if(entry.kind==='image')imageCalls++}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  const scenario=structuredClone(app.scenario),person=scenario.characters.find(p=>p.name==='박한서'),text='“반갑습니다.”';person.source={...(person.source||{}),images:[]};
  app.api._setSettings({apiKey:'fake'});app.api.applyImportedState({scenario,turns:[{id:'no-portrait',text,status:'COMMITTED',dialogueAnnotations:[{offset:0,quoteText:text,bindingVersion:2,characterId:person.id,speakerName:person.name}]}]},{persistState:false});await app.settle(1000);
  assert.equal(imageCalls,0);assert.equal(app.turns[0].text,text);assert.ok(app.win.document.querySelector('.nexus-dialogue-row'));assert.equal(app.win.document.querySelector('.speaker-beat-image img'),null);
 }finally{app.close()}
});

test('legacy conditional identities cannot leak through forged speaker metadata, roles, avatars or first portraits',async()=>{
 let imageCalls=0;const model=makeModel({beforeRespond:entry=>{if(entry.kind==='image')imageCalls++}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  const scenario=structuredClone(app.scenario),secret={id:'withheld-guide',name:'은빛 종의 안내자',role:'비공개 조직의 지도자',reveal:{},source:{publicInfo:'첫 등장 뒤 공개: 은빛 종의 안내자',hiddenInfo:'다음 사건 전에는 신원 공개 금지',gender:'남성',images:[]}};scenario.characters.push(secret);
  scenario.runtime.disclosureLedger={};app.api._setSettings({apiKey:'fake'});
  const text='여학생은 화면을 보았다.\n“누구 이름이에요?”',offset=text.indexOf('“');
  const turn={id:'forged-identity',text,status:'COMMITTED',dialogueAnnotations:[{offset,characterId:secret.id,speakerName:secret.name,source:'WRITER_CHARACTER_REF'}],characterPortraitJobs:{[secret.id]:{status:'ERROR',error:secret.name+' raw error'}},packageTriggerImages:[{source:'CHARACTER_FIRST_APPEARANCE',characterId:secret.id,label:secret.name,url:'data:image/png;base64,c2VjcmV0'}]};
  app.api.applyImportedState({scenario,turns:[turn]},{persistState:false});await app.settle(1100);
  const experience=app.win.CortexTurnExperience;
  assert.equal(experience.publicCharacter(secret,scenario),null);assert.equal(experience.visualDisclosure(scenario,secret).referenceMode,'NONE');
  assert.doesNotMatch(app.win.document.getElementById('feed').textContent,/은빛 종|비공개 조직|raw error/);assert.equal(imageCalls,0);
  assert.equal(app.win.document.querySelectorAll('.nexus-dialogue-row,[data-character-first-appearance],[data-portrait-status]').length,0);
  assert.ok(app.win.CortexCommitGraph.buildRevealLedger(scenario).privateEntityRefs.includes(secret.id));
  assert.equal(app.turns[0].text,text);assert.equal(app.turns[0].packageTriggerImages.length,0);
  scenario.runtime.disclosureLedger.revealedEntityRefs=[secret.id];assert.equal(experience.publicCharacter(secret,scenario).name,secret.name);
 }finally{app.close()}
});

test('author-only identity index never promotes conditional identities into public catalogs or rendered prose',async()=>{
 let writers=0;const leaks=[];const model=makeModel({beforeRespond:(entry,body)=>{if(entry.kind!=='writer')return;writers++;const text=JSON.stringify(body),start=text.indexOf('[작가 전용 사건 등장인물'),end=text.indexOf('[산문작가가 대사에 직접 붙이는 화자 주석',start);assert.ok(start>=0&&end>start);assert.ok(text.slice(start,end).includes('자주빛 유리의 파수꾼'));assert.ok(!text.includes('비공개 설정'));const publicCatalog=text.slice(0,start)+text.slice(end);if(publicCatalog.includes('자주빛 유리의 파수꾼'))leaks.push('conditional identity in public writer catalog')}});
 const scenario=structuredClone(fixtureScenario);scenario.characters.push({id:'future-watcher',name:'자주빛 유리의 파수꾼',role:'숨겨진 인물',source:{publicInfo:'첫 등장 뒤 공개: 자주빛 유리의 파수꾼',hiddenInfo:'비공개 설정'}});
 const app=await new HeadlessCortex({initialScenario:scenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});const turn=await app.turn('현관 주변을 살핀다.');assert.ok(writers>0);assert.deepEqual(leaks,[]);assert.equal(turn.status,'COMMITTED');assert.ok(!app.win.document.getElementById('feed').textContent.includes('자주빛 유리의 파수꾼'));
 }finally{app.close()}
});

test('unknown public-name annotations need narration evidence and never regain hidden package names',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel()}).open();try{
  const scenario=structuredClone(app.scenario),text='여학생이 물었다.\n“괜찮아요?”\n“네.”',starts=[...text.matchAll(/“/gu)].map(m=>m.index);
  app.api.applyImportedState({scenario,turns:[{id:'walkon',text,status:'COMMITTED',dialogueAnnotations:[{offset:starts[0],characterId:'',speakerName:'여학생',source:'WRITER_PUBLIC_NAME'},{offset:starts[1],characterId:'absent-person',speakerName:'없는 사람',source:'WRITER_CHARACTER_REF'}]}]},{persistState:false});await app.settle(180);
  assert.deepEqual([...app.win.document.querySelectorAll('.nexus-dialogue-head strong')].map(n=>n.textContent),['여학생']);
 }finally{app.close()}
});

test('a declared but unrestored primary asset is never mistaken for a missing profile portrait',async()=>{
 let imageCalls=0;const model=makeModel({beforeRespond:entry=>{if(entry.kind==='image')imageCalls++}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model}).open();try{
  app.api._setSettings({apiKey:'fake'});const scenario=structuredClone(app.scenario);
  app.api.applyImportedState({scenario,turns:[{id:'pending-asset',text:scenario.protagonist.name+'는 현관에 섰다.',status:'COMMITTED'}]},{persistState:false});await app.settle(900);
  assert.equal(imageCalls,0);assert.equal(app.turns[0].characterPortraitJobs,undefined);
  await new Promise((resolve,reject)=>app.api._openMedia().then(db=>{const tx=db.transaction('package-assets','readwrite');tx.objectStore('package-assets').put(fixtureMedia[0]);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}));await app.settle(700);
  assert.equal(imageCalls,0);assert.equal(app.win.document.querySelector('[data-character-first-appearance] img'),null);
 }finally{app.close()}
});

test('denied portraits stop automatic retries across characters and never print provider errors in prose',async()=>{
 let imageCalls=0;const model=makeModel({beforeRespond:entry=>{if(entry.kind!=='image')return;imageCalls++;return {ok:false,status:403,body:null,json:async()=>({error:'Your organization must be verified. PRIVATE_PROVIDER_DETAIL',reason:'IMAGE_ACCESS_REQUIRED'})}}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  const scenario=structuredClone(app.scenario);scenario.characters.push({id:'public-1',name:'정유나',source:{publicAppearance:'회색 외투',images:[]}},{id:'public-2',name:'김도경',source:{publicAppearance:'파란 외투',images:[]}});
  app.api._setSettings({apiKey:'fake'});app.api.applyImportedState({scenario,turns:[{id:'denied',text:'정유나는 문을 열었다.\n김도경은 창가에 섰다.',status:'COMMITTED'}]},{persistState:false});await app.settle(1500);
  assert.equal(imageCalls,0);assert.doesNotMatch(app.win.document.body.textContent,/PRIVATE_PROVIDER_DETAIL|Your organization|대표사진 생성 실패|이미지 생성 권한/);
  assert.equal(app.turns[0].status,'COMMITTED');assert.equal(app.win.document.getElementById('send').disabled,false);
 }finally{app.close()}
});

for(const recoveryModel of ['gpt-6-luna','gpt-5.6-luna','muse-spark-1.3-contributor'])test(`${recoveryModel} canon recovers missing recommendations, including incomplete JSON, without changing prose`,async()=>{
 let repairs=0;const suggestions=[{label:'현관의 낡은 우산 두 개를 나란히 비교해 남은 흔적을 짚어 본다.',risk:'LOW'},{label:'부엌의 서로 다른 찻잔이 누구의 것이었는지 조심스럽게 물어본다.',risk:'MEDIUM'},{label:'밖에서 울린 자전거 벨을 따라 문을 열고 직접 골목으로 나가 본다.',risk:'HIGH'}];
 const model=makeModel({recommendations:()=>[],beforeRespond:(entry,body)=>{if(entry.format!=='author_next_moves')return;repairs++;assert.equal(body.model,recoveryModel==='gpt-5.6-luna'?'gpt-6-luna':recoveryModel);if(recoveryModel==='muse-spark-1.3-contributor')assert.equal(body.reasoning?.effort,'high');assert.doesNotMatch(body.input[0].content[0].text,/CORTEX_ST_V1/);if(recoveryModel==='muse-spark-1.3-contributor'&&repairs===1)return Response.json({status:'incomplete',output_text:'{"recommendations":['});return {ok:true,status:200,body:null,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({recommendations:suggestions})}]}]})}}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant',model:recoveryModel,writerReasoningEffort:recoveryModel==='muse-spark-1.3-contributor'?'high':'low'});const turn=await app.turn('현관을 살핀다.');const prose=turn.text;
  assert.equal(repairs,recoveryModel==='muse-spark-1.3-contributor'?2:1);assert.equal(turn.metrics.authorRecommendations.status,'ACCEPTED');assert.equal(turn.recommendations.length,3);assert.equal(turn.text,prose);assert.ok(suggestions.every(s=>!turn.text.includes(s.label)));
  const tools=app.win.document.querySelector('.reader-tools-popover');assert.equal(tools.querySelector('#rewindQuickBtn'),null);assert.ok([...tools.querySelectorAll('button')].some(b=>b.textContent==='시나리오 저장'));
  await app.settle(500);
 }finally{app.close()}
});

test('reopening a failed canon recommendation automatically restores the three buttons without replaying prose',async()=>{
 let repairs=0;const suggestions=[{label:'현관의 낡은 우산 두 개를 나란히 비교해 남은 흔적을 짚어 본다.',risk:'LOW'},{label:'부엌의 서로 다른 찻잔이 누구의 것이었는지 조심스럽게 물어본다.',risk:'MEDIUM'},{label:'밖에서 울린 자전거 벨을 따라 문을 열고 직접 골목으로 나가 본다.',risk:'HIGH'}];
 const model=makeModel({beforeRespond:(entry,body)=>{if(entry.format!=='author_next_moves')return;repairs++;assert.equal(body.model,'muse-spark-1.3-contributor');return Response.json({status:'completed',output_text:JSON.stringify({recommendations:suggestions})})}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  const prose='현관에는 낡은 우산 두 개가 놓여 있었다. 부엌에는 서로 다른 찻잔이 남아 있었다. 밖에서 자전거 벨이 울렸다.';
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant',model:'muse-spark-1.3-contributor'});
  app.api.applyImportedState({scenario:structuredClone(fixtureScenario),turns:[{id:'restored-recommendations',text:prose,status:'COMMITTED',input:'현관을 살핀다.',metrics:{authorRecommendations:{status:'REJECTED'},recommendationRecovery:{status:'ERROR'}}}]},{persistState:false});
  await app.settle(500);const turn=app.turns.at(-1);
  assert.equal(repairs,1);assert.equal(turn.metrics.recommendationRecovery.status,'ACCEPTED');assert.equal(turn.text,prose);assert.equal(app.turns.length,1);assert.equal(model.calls.filter(c=>c.kind==='writer').length,0);
  const strip=app.win.document.querySelector('.cortex-recommendation-strip');assert.equal(strip.hidden,false);assert.equal(strip.querySelectorAll('.cortex-recommendations button').length,3);
 }finally{app.close()}
});
test('host rejects foreign messages and namespaces clear without clearing Lotus',async()=>{
 const model=makeModel(),app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model,localStorageSeed:{'lotus-record':'keep'}}).open();
 try{
  const before=app.api._settings().apiKey;
  app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:'https://foreign.test',source:app.win,data:{channel:'NEXUS_CORTEX_HOST_V1',type:'SETTINGS',apiKey:'injected'}}));await app.settle();
  assert.equal(app.api._settings().apiKey,before);
  app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:app.win.location.origin,source:app.win.parent,data:{channel:'NEXUS_CORTEX_HOST_V1',type:'SETTINGS',apiKey:'shared-key',typingSpeed:'fast',imageQuality:'medium',imageEvery:5,fontSize:'large'}}));await app.settle();
  assert.deepEqual({apiKey:app.api._settings().apiKey,typingSpeed:app.api._settings().typingSpeed,imageQuality:app.api._settings().imageQuality,imageEvery:app.api._settings().imageEvery,fontSize:app.api._settings().fontSize},{apiKey:'shared-key',typingSpeed:'fast',imageQuality:'medium',imageEvery:5,fontSize:'large'});
  assert.equal(app.win.localStorage.getItem('lotus-record'),null);
  app.win.localStorage.setItem('scope-only','value');assert.equal(app.win.localStorage.getItem('scope-only'),'value');app.win.localStorage.clear();assert.equal(app.win.localStorage.getItem('scope-only'),null);
 }finally{app.close()}
});

test('enabled choice passes through actual judge, branches, persists and ends exclusively',async()=>{
 const m=makeModel();m.eventVerdict=p=>({requirements:p.requirements.map(r=>({requirementRef:r.ref,status:'MET',reason:'완료'})),earlyClosure:{goalsMet:'YES',sceneActionSettled:'YES',sceneSettled:'YES',handoffReady:'YES',reason:'완료'},...(p.choices?{choices:Object.fromEntries(p.choices.map(r=>[r.key,'SATISFIED']))}:{})});
 const a=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:m,localStorageSeed:{'dancheong-cortex-device-api-key-v1':'fake'}}).open();try{a.api._setSettings({apiKey:'fake',typingSpeed:'instant'});const sc=a.scenario,first=sc.event.id,other=sc.event.nextEvent.id,nodes=sc.runtime.packageContract.eventGraph.nodes,terminal=structuredClone(nodes[other]);terminal.id='test-terminal';terminal.title='선택된 결말';nodes[terminal.id]=terminal;
 sc.runtime.packageV15||={};sc.runtime.packageV15.branchEnding={enabled:true,flags:[],records:[{id:'choice',sourceEventId:first,criterion:'현재 장면의 행동이 이루어졌다',evaluationSource:'PUBLIC_PROSE',applyPolicy:'ONCE_PER_EVENT'}],decisions:[{id:'decision',decisionEventId:first,matchPolicy:'FIRST_AUTHORED_MATCH',recoveryAttempts:0,rules:[{when:{kind:'choice_status',choiceId:'choice',status:'satisfied'},nextEventId:terminal.id}],fallback:{nextEventId:other,acceptsUnevaluated:true,narrativeGuidance:'보존'}}],terminalEvents:[{endingId:'ending',terminalEventId:terminal.id,returnPolicy:'stay_ended'}]};
 await a.turn('주변을 둘러본다');await a.turn('행동을 마친다');assert.equal(a.scenario.event.id,terminal.id);assert.equal(a.scenario.runtime.branchEndingState.choices.choice.status,'SATISFIED');await a.settle(200);a.win.document.querySelector('[data-nexus-tab="events"]').click();const checks=[...a.win.document.querySelectorAll('.sealed-event-checklist li[data-state="checked"]')];assert.ok(checks.length);assert.ok(checks.every(item=>item.textContent.includes('✓')));assert.doesNotMatch(a.win.document.querySelector('[data-nexus-pane="events"]').textContent,/UNIFIED_ADJUDICATOR/u);const backup=a.api._export();assert.equal(backup.scenario.runtime.branchEndingState.choices.choice.status,'SATISFIED');await a.turn('마무리한다');await a.turn('결말을 맺는다');assert.equal(a.scenario.runtime.branchEndingState.ending.endingId,'ending');assert.equal(a.win.document.getElementById('send').disabled,true);assert.equal(a.scenario.event.id,terminal.id);
 }finally{a.close()}
});

test('all six Nexus tabs render Cortex data without changing state or making model calls',async()=>{
 const model=makeModel(),app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();
 try{
  const before=JSON.stringify(app.scenario),count=model.calls.length,document=app.win.document;
  for(const key of ['status','events','cast','images','records','cost']){
   const button=document.querySelector(`[data-nexus-tab="${key}"]`);assert.ok(button,key);button.click();
   assert.equal(document.querySelector(`[data-nexus-pane="${key}"]`).hidden,false);
   assert.equal(button.getAttribute('aria-selected'),'true');
  }
  assert.equal(JSON.stringify(app.scenario),before);assert.equal(model.calls.length,count);
  assert.equal(document.querySelectorAll('#input').length,1);assert.equal(document.querySelectorAll('#send').length,1);
  assert.match(document.querySelector('[data-nexus-pane="cost"]').textContent,/DANCHEONG API METER/);
  assert.match(document.querySelector('[data-nexus-pane="cost"]').textContent,/본문 집필/);
  assert.match(document.querySelector('[data-nexus-pane="cost"]').textContent,/장면 이미지/);
  assert.equal(model.calls.some(call=>call.kind==='image'),false);
  const nextTitle=app.scenario.event.nextEvent?.title;
  if(nextTitle)assert.ok(!document.querySelector('[data-nexus-pane="events"]').textContent.includes(nextTitle));
  assert.ok(document.getElementById('restoreBackupBtn'));assert.ok(document.getElementById('mCommit'));
 }finally{app.close()}
});

test('slow generation keeps the reader mounted and shows the original three-dot progress until completion',async()=>{
 let release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const model=makeModel({beforeRespond:async entry=>{if(entry.kind==='writer'){entered();await gate}}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'natural'});const pending=app.turn('문을 열기 전 주변을 살펴본다.');await started;await app.settle(120);
  const d=app.win.document;assert.equal(d.getElementById('nexus-writing-progress').hidden,false);assert.equal(d.querySelectorAll('.world-writing-dots i').length,3);assert.match(d.getElementById('nexus-writing-progress').textContent,/세계가 반응하는 중/);assert.ok(d.querySelector('.story-column .topbar'));assert.ok(d.querySelector('.composer #send'));
  release();await pending;await app.settle(120);const last=app.turns.at(-1),visible=d.querySelector('#feed .prose').textContent,finalText=last.text;assert.equal(d.getElementById('nexus-writing-progress').hidden,!last.displayTyping);assert.ok(finalText.startsWith(visible));assert.ok(visible.length>0);assert.equal(d.getElementById('send').disabled,false);
 }finally{release();app.close()}
});

test('long Nexus sessions render the latest five turns first and reveal history without truncating engine state',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const turns=Array.from({length:40},(_,index)=>({id:`history-${index+1}`,input:`입력 ${index+1}`,text:`장기 세션 본문 ${index+1}.`,status:'COMMITTED',metrics:{authorRecommendations:{status:'ACCEPTED'}},recommendations:[{label:'계속 관찰한다',risk:'LOW',source:'SAME_TURN_PROSE_WRITER'},{label:'조심스럽게 움직인다',risk:'MEDIUM',source:'SAME_TURN_PROSE_WRITER'},{label:'즉시 행동한다',risk:'HIGH',source:'SAME_TURN_PROSE_WRITER'}]}));
  app.api.applyImportedState({scenario:structuredClone(fixtureScenario),turns},{persistState:false});await app.settle(120);
  const d=app.win.document,visible=()=>[...d.querySelectorAll('#feed > article.turn:not(.opening-scene)')];
  assert.equal(app.api._turns().length,40,'engine and memory keep the complete session');assert.equal(visible().length,5);assert.equal(visible()[0].dataset.turnIndex,'35');assert.match(visible()[0].textContent,/본문 36/);assert.equal(app.api._renderedTurnRange().start,35);
  const loader=d.querySelector('.nexus-history-loader');assert.ok(loader);loader.click();await app.settle(120);
  assert.equal(visible().length,15);assert.equal(visible()[0].dataset.turnIndex,'25');assert.match(visible()[0].textContent,/본문 26/);assert.equal(visible().at(-1).dataset.turnId,'history-40');assert.equal(app.api._turns().length,40);
 }finally{app.close()}
});

test('restored generated images stay with their absolute beat, never a visible-window offset',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const turns=Array.from({length:10},(_,index)=>({id:`media-${index+1}`,input:'입력',text:`본문 ${index+1}`,status:'COMMITTED'}));
  Object.assign(turns[4],{imageUrl:'data:image/png;base64,OLD',imageStatus:'GENERATED'});
  Object.assign(turns[8],{imageUrl:'data:image/png;base64,RECENT',imageStatus:'GENERATED'});
  app.api.applyImportedState({scenario:structuredClone(fixtureScenario),turns},{persistState:false});await app.settle(100);
  const d=app.win.document;
  assert.equal(d.querySelector('article[data-turn-index="9"] > .turn-image-panel'),null,'old fifth-beat image must not attach to last visible article');
  assert.equal(d.querySelector('article[data-turn-index="8"] > .turn-image-panel img')?.getAttribute('src'),'data:image/png;base64,RECENT');
  d.querySelector('.nexus-history-loader').click();await app.settle(100);
  assert.equal(d.querySelector('article[data-turn-index="4"] > .turn-image-panel img')?.getAttribute('src'),'data:image/png;base64,OLD');
 }finally{app.close()}
});

test('inspector deduplicates embedded pictures only, preserving generated scenes and per-beat media',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model:makeModel()}).open();try{
  const turns=[1,2,3].map(n=>({id:'gallery-'+n,input:'입력',text:'본문 '+n,status:'COMMITTED',imageUrl:'data:image/png;base64,SAME_SCENE',imageStatus:'GENERATED'}));
  app.api.applyImportedState({scenario:structuredClone(fixtureScenario),turns},{persistState:false});await app.settle(100);
  const media=app.win.NexusCortexSpeakerMedia;
  media.images=turn=>[{url:'data:image/png;base64,EMBEDDED',label:'등장인물'},...(turn.id==='gallery-3'?[{url:'data:image/png;base64,OTHER',label:'다른 내장 사진'}]:[])];
  const before=JSON.stringify(app.api._turns());app.win.dispatchEvent(new app.win.Event('cortex-turn-display'));await app.settle(150);
  app.win.document.querySelector('[data-nexus-tab="images"]').click();const pane=app.win.document.querySelector('[data-nexus-pane="images"]');
  assert.equal(pane.querySelectorAll('img[src="data:image/png;base64,EMBEDDED"]').length,1);
  assert.equal(pane.querySelectorAll('img[src="data:image/png;base64,OTHER"]').length,1);
  assert.equal(pane.querySelectorAll('img[src="data:image/png;base64,SAME_SCENE"]').length,3,'generated scenes are never collapsed across beats');
  assert.equal(app.api._turns().map(t=>media.images(t).length).join(','),'1,1,2','body per-beat image provider remains unchanged');
  assert.equal(JSON.stringify(app.api._turns()),before);
 }finally{app.close()}
});

test('multiplayer intercepts local sends, commits one authorized beat and keeps participant chat out of prose',async()=>{
 const model=makeModel(),app=await new HeadlessCortex({initialScenario:fixtureScenario,initialMedia:fixtureMedia,standalonePath,model,url:'https://cortex.test/?session=mp-test&multiplayer=1'}).open();
 try{
  const events=[];app.win.parent.postMessage=message=>events.push(message);
  const message=(type,data={})=>app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:app.win.location.origin,source:app.win.parent,data:{channel:'NEXUS_CORTEX_HOST_V1',type,...data}}));
  app.api._setSettings({apiKey:'fake',typingSpeed:'natural'});
  app.api._setInput('함께 문을 연다.');app.win.document.getElementById('send').click();await app.settle(40);
  assert.equal(model.calls.length,0);assert.equal(events.some(e=>e.type==='MP_REQUEST'),false);
  app.win.document.getElementById('input').dispatchEvent(new app.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await app.settle(40);assert.equal(model.calls.length,0,'spectator Enter cannot bypass the shared turn gate');
  message('MP_STATE',{canWrite:true,unread:2,label:'내 차례'});
  app.win.document.getElementById('send').click();await app.settle(40);
  assert.equal(events.filter(e=>e.type==='MP_REQUEST').length,1);assert.equal(model.calls.length,0);
  message('MP_EXECUTE',{token:'authorized-test-token',input:'함께 문을 연다.'});
  for(let i=0;i<300&&!events.some(e=>e.type==='MP_RESULT'||e.type==='MP_FAILED');i++)await app.settle(50);
  const result=events.find(e=>e.type==='MP_RESULT');assert.ok(result,JSON.stringify(events.filter(e=>e.type==='MP_FAILED')));
  assert.equal(result.snapshot.turns.length,1);assert.equal(result.snapshot.turns[0].status,'COMMITTED');assert.notEqual(result.snapshot.turns[0].displayTyping,true);assert.ok(!result.snapshot.settings?.apiKey);
  app.win.document.querySelector('.nexus-room-chat-button').click();assert.ok(events.some(e=>e.type==='MP_CHAT'));assert.equal(app.api._turns().length,1);
 }finally{app.close()}
});
test('Muse recommendations accept fenced JSON with an empty shortcut field and keep reasoning out of prose',async()=>{
 const labels=['현관에 기대 놓은 우산을 살펴보고 누가 가져왔는지 물어본다.','부엌에 놓인 찻잔의 무늬를 다시 확인하고 조심스럽게 집어 든다.','자전거 소리가 들린 골목으로 문을 열고 직접 나가 본다.'];let repairs=0;
 const model=makeModel({recommendations:()=>[],beforeRespond:(entry,body)=>{if(entry.format!=='author_next_moves')return;repairs++;assert.equal(body.reasoning.effort,'high');return Response.json({status:'completed',output_text:'',output:[{type:'reasoning',content:[{text:'INTERNAL_REASONING_NOT_FOR_READER'}]},{type:'message',content:[{type:'output_text',text:'```json\n'+JSON.stringify({recommendations:labels})+'\n```'}]}]})}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant',model:'muse-spark-1.3-contributor',writerReasoningEffort:'high'});const turn=await app.turn('현관을 둘러본다.');await app.settle(150);
  assert.equal(repairs,1);assert.equal(turn.metrics.authorRecommendations.status,'ACCEPTED');assert.equal(turn.recommendations.length,3);assert.doesNotMatch(turn.text,/INTERNAL_REASONING|recommendations|```/);assert.ok(labels.every(label=>app.win.document.querySelector('.cortex-recommendation-strip').textContent.includes(label)));
 }finally{app.close()}
});

test('active requirements are opt-in, future waiting cards are absent, and final extension requires acknowledgement',async()=>{
 const model=makeModel(),app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model}).open();try{
  const d=app.win.document;await app.settle(150);d.querySelector('[data-nexus-tab="events"]').click();assert.equal(d.querySelector('.active-event-card .event-contract-sheet'),null);assert.equal(d.querySelector('.event-waiting'),null);
  app.win.dispatchEvent(new app.win.MessageEvent('message',{origin:app.win.location.origin,source:app.win,data:{source:'dancheong-reader-preferences',showCompletionConditions:true}}));await app.settle(150);assert.ok(d.querySelector('.active-event-card .event-contract-sheet'));
  app.scenario.runtime.systemicEventState.phase='EXTENSION_2';app.scenario.runtime.systemicEventState.closureExtensionCount=2;app.api._setSettings({apiKey:'fake'});
  const before=model.calls.length,pending=app.turn('계속 살핀다.');await app.settle(100);assert.ok(d.querySelector('.nexus-extension-notice[open]'));assert.equal(model.calls.length,before);
  d.querySelector('.nexus-extension-notice button').click();await pending;assert.equal(model.calls.length,before);assert.equal(app.turns.length,0);
  const gate=app.win.NexusBeforeCanonTurn();d.querySelector('.nexus-extension-notice button:last-child').click();assert.equal(await gate,true);assert.equal(await app.win.NexusBeforeCanonTurn(),true);assert.equal(d.querySelector('.nexus-extension-notice'),null);
 }finally{app.close()}
});

test('anchored package images stay at their public sentence through rerender and never reveal an unresolved trigger at the bottom',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel()}).open();try{
  const prose='문을 열었다. 편지를 탁자에 펼쳤다. 창밖에서 바람이 불었다.\n\n그는 기다렸다.',quote='편지를 탁자에 펼쳤다.';
  app.api.applyImportedState({scenario:structuredClone(fixtureScenario),turns:[{id:'anchored',status:'COMMITTED',text:prose,packageTriggerImages:[{triggerId:'letter',label:'펼친 편지',url:'data:image/png;base64,dGVzdA==',proseAnchor:{kind:'PUBLIC_QUOTE',quote,offset:prose.indexOf(quote)+quote.length}},{triggerId:'unknown',label:'위치 불명',url:'data:image/png;base64,dGVzdA==',proseAnchor:{kind:'UNRESOLVED'}}]}]},{persistState:false});await app.settle(160);
  const figure=app.win.document.querySelector('[data-package-trigger="letter"]');assert.ok(figure);assert.ok(figure.previousElementSibling.textContent.endsWith(quote));assert.ok(figure.nextElementSibling.textContent.startsWith(' 창밖'));assert.equal(app.win.document.querySelectorAll('#feed .package-trigger-image').length,1);
  app.win.dispatchEvent(new app.win.Event('cortex-turn-display'));await app.settle(160);assert.equal(app.win.document.querySelectorAll('#feed .package-trigger-image').length,1);
  const saved=JSON.parse(JSON.stringify(app.turns[0]));assert.equal(saved.packageTriggerImages[0].proseAnchor.quote,quote);
 }finally{app.close()}
});

test('Muse natural approved display uses a readable one glyph per 32ms',async()=>{
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model:makeModel()}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'natural',model:'muse-spark-1.3-contributor'});const turn=await app.turn('현관을 살핀다.');assert.equal(turn.metrics.typewriterFinishPace.batch,1);assert.equal(turn.metrics.typewriterFinishPace.delayMs,32);
 }finally{app.close()}
});
test('Muse recommendation repair falls back to prompt JSON only when structured output is rejected',async()=>{
 let calls=0;const labels=['현관에 놓인 우산의 손잡이를 살피고 주인을 물어본다.','부엌의 찻잔을 가리키며 마지막으로 쓴 사람이 누구인지 묻는다.','자전거 소리가 들려온 골목으로 직접 걸어 나가 본다.'];
 const model=makeModel({recommendations:()=>[],beforeRespond:(entry,body)=>{if(!body.input?.[0]?.content?.[0]?.text?.includes('publicProse 마지막 장면'))return;calls++;if(calls===1)return new Response('{"error":{"message":"text.format json_schema is not supported"}}',{status:400});assert.equal(body.text,undefined);return Response.json({status:'completed',output_text:JSON.stringify({recommendations:labels})})}});
 const app=await new HeadlessCortex({initialScenario:fixtureScenario,standalonePath,model}).open();try{app.api._setSettings({apiKey:'fake',typingSpeed:'instant',model:'muse-spark-1.3-contributor'});const turn=await app.turn('우산을 살핀다.');assert.equal(calls,2);assert.equal(turn.metrics.recommendationRecovery.responseFormat,'PROMPT_JSON');assert.equal(turn.recommendations.length,3);await app.settle(400)}finally{app.close()}
});
