import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {HeadlessCortex,makeModel} from './harness.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cortex-author-cast-')),file=path.join(tmp,'reader.html');
let html=fs.readFileSync('public/cortex.html','utf8').replace('<head>','<head><script>window.Image=class {naturalWidth=320;naturalHeight=180;set src(v){setTimeout(()=>this.onload?.(),0)}decode(){return Promise.resolve()}};</script>');
for(const name of ['cortex-host','jieum-reader','cortex-nexus-view','cortex-nexus-inspector'])html=html.replace(`<script src="/${name}.js"></script>`,()=>'<script>'+fs.readFileSync(`public/${name}.js`,'utf8')+'</script>');
html=html.replace(/<link\b[^>]*>/g,'').replace('globalThis.__DANCHEONG_NEW_ENGINE_TEST__={','globalThis.__DANCHEONG_NEW_ENGINE_TEST__={_stream:streamModelTextV180,_writerContract:continuationContractV180,_render:renderTurns,');
fs.writeFileSync(file,html);test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const base=JSON.parse(fs.readFileSync('tests/fixtures/cortex-173-chronos-2turn.json','utf8')).scenario;
function fixture(){const sc=structuredClone(base);sc.characters=[{id:'NPC_STORM_ARCHER',name:'뇌전의 궁수',aliases:[],source:{role:'Storm Archer · 발명가',publicInfo:'첫 등장 뒤 공개: 전기를 다루는 궁수',hiddenInfo:'PRIVATE_PLOT_NEVER_SEND',images:[{assetPath:'assets/storm.webp',isPrimary:true}]}},{id:'NPC_FUTURE_COLLECTOR',name:'금발의 외국인 수집가',source:{publicInfo:'첫 등장 뒤 공개: 수집가',images:[{assetPath:'assets/collector.webp',isPrimary:true}]}}];sc.event.participants='주인공, Storm Archer(내부 연결용·본문 이름 금지)';sc.runtime.publicAppearanceRefs=[];return sc}
const media=sc=>sc.characters.map(p=>({key:sc.runtime.storyId+':!primary:'+p.id,storyId:sc.runtime.storyId,characterId:p.id,assetKind:'CHARACTER_REFERENCE',ref:p.source.images[0].assetPath,path:p.source.images[0].assetPath,dataUrl:'data:image/png;base64,dGVzdA=='}));

for(const instant of [false,true])test(`live ${instant?'Instant':'canon'} writer cards and multiplayer packets precede commit, including unopened public aliases`,async()=>{
 const sc=fixture();
 let wire='';
 const model=makeModel({beforeRespond(entry){if(entry.kind!=='writer')return;
  const frames=[...wire].map(delta=>'data: '+JSON.stringify({type:'response.output_text.delta',delta})+'\n\n');
  frames.push('data: '+JSON.stringify({type:'response.completed',response:{}})+'\n\n');let i=0;
  return {ok:true,body:new ReadableStream({pull(c){if(i===frames.length)c.close();else c.enqueue(new TextEncoder().encode(frames[i++]))}})};
 }});
 const app=await new HeadlessCortex({initialScenario:sc,standalonePath:file,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  const txn={txnId:'live-speaker',start:{day:0,time:'06:43:00',location:'집'}};
  app.api.applyImportedState({scenario:sc,turns:[{id:txn.txnId,status:'STREAMING',text:'',displayText:'',displayTyping:true,txn,metrics:{}}]},{persistState:false});
  // Exercise both author marker contracts without importing a fake Instant pack.
  if(instant)app.scenario.runtime.instantStory={};
  const turn=app.turns[0];
  wire='⟦S:NPC_STORM_ARCHER|장신 남자⟧“네.”\n\n⟦N:문지기⟧“네.”\n\n⟦Q⟧“출입 금지”';
  const sender=app.win.createNexusMultiplayerLive(app.api),receiver=app.win.createNexusMultiplayerLive({_turns:()=>[],_settings:()=>({typingSpeed:'instant'})});
  let checked=0;
  await app.api._stream({developer:'소설을 이어 쓴다.',user:'{}',spacetimeTxn:turn.txn,onDelta(delta){
   turn.displayText+=delta;app.api._render();
   assert.equal(turn.status,'STREAMING');assert.equal(turn.text,'','final canonical state has not arrived');
   const count=turn.displayText.includes('\n\n“')?2:turn.displayText.startsWith('“')?1:0;
   if(!count)return;
   const names=[...app.win.document.querySelectorAll('.turn:not(.nexus-live-turn) .nexus-dialogue-head strong')].map(n=>n.textContent);
   assert.deepEqual(names,['장신 남자','문지기'].slice(0,count));
   const packet=sender.capture(0);assert.ok(packet);receiver.apply({...packet,seq:++checked});
   assert.deepEqual([...app.win.document.querySelectorAll('.nexus-live-turn .nexus-dialogue-head strong')].map(n=>n.textContent),names);
   assert.doesNotMatch(JSON.stringify(packet),/NPC_STORM|뇌전의 궁수|PRIVATE_PLOT|⟦/);
  }});
  assert.ok(checked>8);assert.equal(model.calls.filter(c=>c.kind==='writer').length,1,'no extra classifier call');
  turn.text=turn.displayText;turn.status='COMMITTED';turn.displayTyping=false;receiver.clear();app.api._render();
  assert.deepEqual([...app.win.document.querySelectorAll('.nexus-dialogue-head strong')].map(n=>n.textContent),['장신 남자','문지기']);
 }finally{await app.settle(350);app.close()}
});

test('writer receives event participants before writing and an anonymous registered speaker renders its own portrait',async()=>{
 const sc=fixture();let wire='장신 남자가 말했다. ⟦S:뇌전의 궁수|장신 남자|PHYSICAL⟧“이쪽이다.”',requests=0;
 const model=makeModel({beforeRespond(entry,body){if(entry.kind!=='writer')return;requests++;const prompt=body.input[0].content[0].text;assert.match(prompt,/Storm Archer\(내부 연결용/);assert.doesNotMatch(prompt,/NPC_STORM_ARCHER|PRIVATE_PLOT_NEVER_SEND/);assert.match(prompt,/⟦N:공개 이름⟧/);assert.match(prompt,/⟦S:등록명\|공개 호칭\|PHYSICAL⟧/);assert.match(prompt,/입상 연결이나 첫 등장만으로 이름이 공개되는 것은 아니다/);
  const frames=[...wire].map(delta=>'data: '+JSON.stringify({type:'response.output_text.delta',delta})+'\n\n');frames.push('data: '+JSON.stringify({type:'response.completed',response:{}})+'\n\n');let i=0;
  return {ok:true,body:new ReadableStream({pull(c){if(i===frames.length)c.close();else c.enqueue(new TextEncoder().encode(frames[i++]))}})};
 }});
 const app=await new HeadlessCortex({initialScenario:sc,initialMedia:media(sc),standalonePath:file,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  assert.equal(app.win.CortexTurnExperience.publicCharacter(sc.characters[0],app.scenario),null);
  assert.equal(app.win.document.querySelector('[data-speaker-portrait="NPC_STORM_ARCHER"]'),null);
  for(let beat=0;beat<2;beat++){
   const txn={txnId:'alias-'+beat,start:{day:0,time:'06:43:00',location:'집'}};
   app.api.applyImportedState({scenario:app.scenario,turns:[...app.turns,{id:txn.txnId,status:'STREAMING',text:'',txn,metrics:{}}]},{persistState:false});
   const turn=app.turns.at(-1);let visible='';
   await app.api._stream({developer:app.api._writerContract(turn.txn,null),user:'{}',spacetimeTxn:turn.txn,onDelta(delta){visible+=delta;turn.text=visible;assert.doesNotMatch(visible,/NPC_|⟦|뇌전의 궁수/);}});
   turn.status='COMMITTED';app.api._render();await app.settle(250);app.api._render();await app.settle(80);
   assert.equal(turn.dialogueAnnotations[0].characterId,'NPC_STORM_ARCHER');assert.equal(turn.dialogueAnnotations[0].speakerName,'장신 남자');assert.equal(turn.dialogueAnnotations[0].source,'WRITER_CHARACTER_ALIAS');assert.equal(turn.dialogueAnnotations[0].presence,'PHYSICAL');
   const figures=[...app.win.document.querySelectorAll('#feed [data-speaker-portrait="NPC_STORM_ARCHER"]')];assert.equal(figures.length,beat+1,JSON.stringify({names:app.scenario.runtime.writerPublicNames,visible:app.win.CortexTurnExperience.publicCharacter(app.scenario.characters[0],app.scenario),annotation:turn.dialogueAnnotations,media:[...app.win.NexusCortexPrimaryMedia.keys()],logs:app.logs}));const last=figures.at(-1);assert.ok(last.querySelector('img'));assert.equal(last.querySelector('strong').textContent,'장신 남자');assert.equal(last.nextElementSibling.className,'nexus-dialogue-row');
   assert.doesNotMatch(app.win.document.getElementById('feed').textContent,/뇌전의 궁수|PRIVATE_PLOT_NEVER_SEND|NPC_STORM/);
   assert.equal(app.win.document.querySelector('[data-speaker-portrait="NPC_FUTURE_COLLECTOR"]'),null);
  }
  assert.equal(requests,2);
  const saved=JSON.parse(JSON.stringify({scenario:app.scenario,turns:app.turns}));delete saved.scenario.runtime.writerPublicNames;
  app.api.applyImportedState(saved,{persistState:false});await app.settle(300);assert.equal(app.win.CortexTurnExperience.publicCharacter(app.scenario.characters[0],app.scenario).name,'장신 남자');assert.equal(app.win.document.querySelectorAll('#feed [data-speaker-portrait="NPC_STORM_ARCHER"]').length,2);
 }finally{app.close()}
});

for(const instant of [false,true])test('name-first '+(instant?'Instant':'canon')+' keeps the written short name through live cards, public portraits, multiplayer and restore',async()=>{
 const sc=fixture();sc.characters[0].name='김민서';sc.event.participants=['NPC_STORM_ARCHER'];
 const wire='민서가 지훈에게 물었다. ⟦N:민서⟧“괜찮아?”\n\n⟦N:지훈⟧“응.”\n\n⟦Q⟧“안내문”';
 const model=makeModel({beforeRespond(entry,body){if(entry.kind!=='writer')return;
  const prompt=body.input[0].content[0].text;assert.match(prompt,/"participants":\["김민서"\]/);assert.doesNotMatch(prompt,/NPC_STORM_ARCHER/);
  const frames=[...wire].map(delta=>'data: '+JSON.stringify({type:'response.output_text.delta',delta})+'\n\n');frames.push('data: '+JSON.stringify({type:'response.completed',response:{}})+'\n\n');let i=0;
  return {ok:true,body:new ReadableStream({pull(c){if(i===frames.length)c.close();else c.enqueue(new TextEncoder().encode(frames[i++]))}})};
 }});
 const app=await new HeadlessCortex({initialScenario:sc,initialMedia:media(sc),standalonePath:file,model}).open();try{
  app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});
  const txn={txnId:'names-only',start:{day:0,time:'06:43:00',location:'집'}};
  app.api.applyImportedState({scenario:sc,turns:[{id:txn.txnId,status:'STREAMING',text:'',displayText:'',displayTyping:true,txn,metrics:{}}]},{persistState:false});
  if(instant)app.scenario.runtime.instantStory={};
  const turn=app.turns[0],sender=app.win.createNexusMultiplayerLive(app.api),receiver=app.win.createNexusMultiplayerLive({_turns:()=>[],_settings:()=>({typingSpeed:'instant'})});let seq=0;
  await app.api._stream({developer:'이어 쓴다.',user:'{}',spacetimeTxn:turn.txn,onDelta(delta){
   turn.text+=delta;turn.displayText=turn.text;app.api._render();
   assert.doesNotMatch(turn.text,/⟦|NPC_/);
   const names=[...app.win.document.querySelectorAll('.turn:not(.nexus-live-turn) .nexus-dialogue-head strong')].map(n=>n.textContent);
   const count=turn.text.includes('“응')?2:turn.text.includes('“괜')?1:0;
   if(count)assert.deepEqual(names.slice(0,count),['민서','지훈'].slice(0,count));
   const packet=sender.capture(0);if(packet){receiver.apply({...packet,seq:++seq});assert.deepEqual([...app.win.document.querySelectorAll('.nexus-live-turn .nexus-dialogue-head strong')].map(n=>n.textContent),names)}
  }});
  assert.equal(turn.dialogueProtocol,'WRITER_INLINE_SPEAKER_V2');
  assert.equal(turn.dialogueAnnotations[0].speakerName,'민서');assert.equal(turn.dialogueAnnotations[0].characterId,'');assert.equal(turn.dialogueAnnotations[0].source,'WRITER_PUBLIC_NAME');
  turn.status='COMMITTED';turn.displayTyping=false;receiver.clear();app.api._render();await app.settle(300);app.api._render();
  assert.deepEqual([...app.win.document.querySelectorAll('.nexus-dialogue-head strong')].map(n=>n.textContent),['민서','지훈']);
  assert.equal(app.win.document.querySelector('[data-speaker-portrait="NPC_STORM_ARCHER"] strong')?.textContent,'민서');
  assert.equal(app.win.document.querySelector('[data-speaker-portrait="NPC_FUTURE_COLLECTOR"]'),null);
  if(instant)delete app.scenario.runtime.instantStory; // synthetic prompt switch is not a complete pack
  const saved=JSON.parse(JSON.stringify({scenario:app.scenario,turns:app.turns}));
  app.api.applyImportedState(saved,{persistState:false});await app.settle(150);
  assert.equal(app.turns[0].dialogueProtocol,'WRITER_INLINE_SPEAKER_V2');
  assert.deepEqual([...app.win.document.querySelectorAll('.nexus-dialogue-head strong')].map(n=>n.textContent),['민서','지훈']);
  assert.equal(model.calls.filter(c=>c.kind==='writer').length,1);
 }finally{await app.settle(100);app.close()}
});

test('generic labels never infer a package identity; explicit secret-image restrictions remain enforced',async()=>{
 const sc=fixture(),app=await new HeadlessCortex({initialScenario:sc,initialMedia:media(sc),standalonePath:file,model:makeModel()}).open();try{
  const indexScenario=structuredClone(sc);indexScenario.characters[0].id='NPC.CAST+(1)';indexScenario.event.participants=['NPC.CAST+(1)',{speaker:'NPC.CAST+(1)'},'XNPC.CAST+(1)X'];
  assert.deepEqual(JSON.parse(JSON.stringify(app.win.CortexTurnExperience.authorCast(indexScenario).participants)),['뇌전의 궁수',{speaker:'뇌전의 궁수'},'XNPC.CAST+(1)X']);
  const prose='금발 남자가 말했다. “가자.”',annotation={offset:prose.indexOf('“'),quoteText:'“가자.”',bindingVersion:2,speakerName:'금발 남자',source:'WRITER_PUBLIC_NAME',characterId:''};
  app.api.applyImportedState({scenario:sc,turns:[{id:'generic',status:'COMMITTED',text:prose,dialogueAnnotations:[annotation]}]},{persistState:false});await app.settle(180);assert.equal(app.win.document.querySelector('#feed [data-speaker-portrait]'),null);
  const secret=app.scenario.characters[0];secret.source.secret=true;annotation.source='WRITER_CHARACTER_ALIAS';annotation.characterId=secret.id;
  app.api.applyImportedState({scenario:app.scenario,turns:[{id:'secret',status:'COMMITTED',text:prose,dialogueAnnotations:[annotation]}]},{persistState:false});await app.settle(180);assert.equal(app.win.CortexTurnExperience.visualDisclosure(app.scenario,secret).referenceMode,'NONE');assert.equal(app.win.document.querySelector('#feed [data-speaker-portrait]'),null);
  assert.equal(app.turns[0].text,prose);
 }finally{app.close()}
});
