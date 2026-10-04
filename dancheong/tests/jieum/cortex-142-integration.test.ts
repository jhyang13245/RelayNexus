import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { makeProjectForPackageTarget, blankStoryEvent, normalizeProject, type Project } from '../../features/jieum/studio-model';
import { eventDesign } from '../../features/jieum/cortex-event-design';
import { exportScenarioPack, extractStudioProjectFromPackage, aiGeneratorPromptFor } from '../../features/jieum/studio-export';
import { cortexCompatibility } from '../../features/jieum/cortex-engine-contract';
import { lintCortexPackage } from '../../features/jieum/cortex-package-lint';
import { HeadlessCortex, makeModel } from './fixtures/cortex-v1.42.0/harness.mjs';

const html = fs.readFileSync(new URL('../../vendor/cortex/Cortex_v1.42.0.html',import.meta.url));
const baseHtml = gunzipSync(fs.readFileSync(new URL('./fixtures/cortex-v1.42.0/engine.html.gz',import.meta.url)));
const enginePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(),'studio-cortex-142-')),'engine.html');
fs.writeFileSync(enginePath,html);
after(() => {fs.unlinkSync(enginePath);fs.rmdirSync(path.dirname(enginePath));});
const engine = (source = html) => {
  const context = vm.createContext({console,TextEncoder,TextDecoder,URL,setTimeout,clearTimeout,structuredClone,crypto,performance,AbortController});
  const scripts = [...source.toString().matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for (const index of source === baseHtml ? [1] : [0,1,3]) vm.runInContext(scripts[index][1],context);
  return context;
};
function fixture(): Project {
  const p=makeProjectForPackageTarget('cortex','intelligent_canon',false);
  p.title='한지 공방';p.player.name='윤서';p.player.id='PC';
  p.disclosure.protectedTerms=['숨겨진인장'];
  p.events=['START','NORMAL','TRUE'].map((id,i) => {
    const e={...blankStoryEvent(i+1),id,required:true,name:['첫 만남','담담한 결말','진실의 결말'][i],description:['공방에서 의뢰인과 편지를 확인한다.','편지를 보관하고 다음 만남을 기약한다.','편지의 출처를 확인하고 함께 복원한다.'][i],nextEventId:'',sequence:99-i};
    e.cortexDesign={...eventDesign(e),occurrenceEnabled:false,closureConditions:[{id:id+'-goal',text:'공방에서 이야기를 나누고 편지를 확인한다.'}]};
    return e;
  });
  p.opening.protagonistId='PC';
  return p;
}
function branching(): Project {
  const p=fixture();p.package15.enabled=true;p.package15.storyMode='branching';
  p.package15.routes=[];p.package15.flags=[{id:'BOND',label:'신뢰',valueType:'number',defaultValue:0,scope:'worldline'}];
  p.package15.requiredFeatures=['branch_ending_convergence_v1'];
  p.package15.endings=['NORMAL','TRUE'].map(id=>({id:'ENDING_'+id,routeId:'',name:id,type:id==='TRUE'?'true':'normal',priority:0,terminalEventId:id,exclusiveGroupId:'primary',condition:{},effects:[],returnPolicy:'stay_ended'}));
  p.package15.branchEnding={enabled:true,primaryEndingGroupId:'primary',choiceRecords:[{id:'SHARE',name:'공유',sourceEventId:'START',criterion:'공개 본문에서 윤서가 의뢰인에게 편지를 건넸다.',evaluationSource:'PUBLIC_PROSE',applyPolicy:'ONCE_PER_EVENT',satisfiedEffect:{kind:'increment_flag',flagId:'BOND',value:1}}],decisions:[{id:'DECISION',name:'결말 분기',decisionEventId:'START',matchPolicy:'FIRST_AUTHORED_MATCH',recoveryAttempts:0,unresolvedPolicy:'FALLBACK_WITHOUT_ASSERTING_CONDITION',rules:[{id:'MATCH',label:'공유함',when:{kind:'flag_at_least',flagId:'BOND',value:1},nextEventId:'TRUE'}],fallback:{nextEventId:'NORMAL',acceptsUnevaluated:true,narrativeGuidance:'이미 공개한 행동과 관계를 보존하고 편지를 보관하는 결말로 잇는다.'}}]};
  return p;
}
async function exported(p:Project) {
  const output=await exportScenarioPack(p,false);
  const zip=await JSZip.loadAsync(await output.blob.arrayBuffer());
  const files:Record<string,any>={};
  for(const [name,file]of Object.entries(zip.files))if(name.endsWith('.json')&&!name.startsWith('studio/'))files[name]=JSON.parse(await file.async('string'));
  return {output,zip,files};
}
test('previous Nexus 1.12.26 Cortex base remains pinned byte for byte',()=>assert.equal(createHash('sha256').update(baseHtml).digest('hex'),'8152470ab76967029d84aabf9c63aa37a54fe672a8e7cd78a6c8267982e8b4f4'));
test('single route preserves array order and constraints without making constraints playable',async()=>{
  const p=fixture();p.events.push({...blankStoryEvent(4),id:'RULE',name:'공방 규칙',kind:'constraint',appliesTo:['START'],rules:['편지는 불에 태우지 않는다.']});
  p.events.push({...blankStoryEvent(5),id:'GLOBAL_RULE',name:'전체 규칙',kind:'constraint',appliesTo:[],rules:['등장인물의 진명을 공개하지 않는다.']});
  const {files,output}=await exported(p),ctx=engine(),session=ctx.CortexNexusBridge.adaptPackage(files),sc=ctx.CortexNexusBridge.toCortexScenario(session);
  assert.deepEqual(files['events/events.json'].map((e:any)=>e.id),['START','NORMAL','TRUE']);
  assert.deepEqual(files['project.json'].events,files['events/events.json']);
  assert.equal(sc.event.id,'START');assert.equal(sc.event.nextEvent.id,'NORMAL');
  assert.match(sc.event.summary,/편지는 불에 태우지 않는다/);
  assert.match(JSON.stringify(sc.event.policyConstraints),/편지는 불에 태우지 않는다/);
  for (const event of files['events/events.json']) assert.match(event.description,/등장인물의 진명을 공개하지 않는다/);
  assert.doesNotMatch(files['events/events.json'][1].description,/편지는 불에 태우지 않는다/);
  assert.equal(sc.event.requiredFunctions.some((r:any)=>r.type==='NEGATIVE_CONSTRAINT'),false);
  assert.match(JSON.stringify(sc.disclosure),/숨겨진인장/);
  const restored=normalizeProject((await extractStudioProjectFromPackage(output.blob)).project);
  assert.equal(restored.events[0].sequence,99);assert.equal(restored.events[3].kind,'constraint');
});
test('multi-route exports explicit route event lists and does not link one route into its sibling',async()=>{
  const p=fixture();p.package15.enabled=true;p.package15.storyMode='multi_route';
  p.events[0].multiroute={scope:'common'};p.events[1].multiroute={scope:'route',routeId:'A'};p.events[2].multiroute={scope:'route',routeId:'B'};
  p.package15.routes=['A','B'].map((id,i)=>({id,name:id,description:'',order:i+1,initiallyUnlocked:true,recommendedPrerequisiteRouteIds:[],entryEventId:i?'TRUE':'NORMAL',lockEventId:i?'TRUE':'NORMAL',chapterIds:[],endingIds:[],revealPolicyIds:[]}));
  const {files}=await exported(p),ctx=engine(),session=ctx.CortexNexusBridge.adaptPackage(files);
  assert.deepEqual(JSON.parse(JSON.stringify(session.eventGraph.routes)).map((r:any)=>({id:r.id,eventIds:r.eventIds})),[{id:'A',eventIds:['START','NORMAL']},{id:'B',eventIds:['START','TRUE']}]);
  assert.equal(files['events/events.json'][1].nextEventId,undefined);
  assert.equal(Object.keys(session.eventGraph.nodes).length,3);
  session.state.routeState.activeRouteId='B';
  const routeB=ctx.CortexNexusBridge.toCortexScenario(session);
  assert.equal(routeB.event.id,'START');assert.equal(routeB.event.nextEvent.id,'TRUE');assert.equal(routeB.event.nextEvent.nextEvent,undefined);
});
test('chapter-only event assignments retain shared opening and isolate route successors',async()=>{
  const p=fixture();p.package15.enabled=true;p.package15.storyMode='multi_route';
  p.events=[p.events[0],{...p.events[1],id:'A1'},{...p.events[1],id:'A2'},{...p.events[2],id:'B1'},{...p.events[2],id:'B2'}];
  p.events.forEach((event,i)=>{event.multiroute={chapterId:i===0?'COMMON':i<3?'CH_A':'CH_B'};});
  p.package15.chapters=[{id:'COMMON',scope:'common',ordinal:1,name:'공통',eventIds:[]},{id:'CH_A',scope:'route',ordinal:2,name:'A장',eventIds:[]},{id:'CH_B',scope:'route',ordinal:2,name:'B장',eventIds:[]}];
  p.package15.routes=['A','B'].map((id,i)=>({id,name:id,description:'',order:i+1,initiallyUnlocked:true,recommendedPrerequisiteRouteIds:[],entryEventId:id+'1',lockEventId:id+'1',chapterIds:['CH_'+id],endingIds:[],revealPolicyIds:[]}));
  const {files}=await exported(p),ctx=engine(),session=ctx.CortexNexusBridge.adaptPackage(files);
  assert.deepEqual(files['routes/route_graph.json'].routes.map((route:any)=>route.eventIds),[['START','A1','A2'],['START','B1','B2']]);
  assert.equal(files['events/events.json'].find((event:any)=>event.id==='A2').nextEventId,undefined);
  session.state.routeState.activeRouteId='B';
  const routeB=ctx.CortexNexusBridge.toCortexScenario(session);
  assert.equal(routeB.event.id,'START');assert.equal(routeB.event.nextEvent.id,'B1');assert.equal(routeB.event.nextEvent.nextEvent.id,'B2');
});
for(const choice of ['SATISFIED','NOT_SATISFIED','UNEVALUATED'])test(`Nexus 1.13.0 Cortex run: ${choice} chooses one ending and survives restoration`,async()=>{
  const {files}=await exported(branching()),ctx=engine(),canonical=ctx.CortexNexusBridge.adaptPackage(files),initial=ctx.CortexNexusBridge.toCortexScenario(canonical);
  const model:any=makeModel();
  model.eventVerdict=(payload:any)=>({requirements:payload.requirements.map((r:any)=>({requirementRef:r.ref,status:'MET',reason:'공개 본문의 행동을 확인했다.'})),earlyClosure:{goalsMet:'YES',sceneActionSettled:'YES',sceneSettled:'YES',handoffReady:'YES',reason:'완료'},...(payload.choices?{choices:Object.fromEntries(payload.choices.map((r:any)=>[r.key,choice]))}:{})});
  const app=await new HeadlessCortex({standalonePath:enginePath,model,initialScenario:initial}).open();
  try {
    app.api._setSettings({apiKey:'fixture-only',typingSpeed:'instant'});
    for(const input of ['편지를 확인한다.','의뢰인과 이야기를 마친다.'])assert.equal((await app.turn(input)).status,'COMMITTED');
    const target=choice==='SATISFIED'?'TRUE':'NORMAL';
    assert.equal(app.scenario.event.id,target);
    assert.equal(app.scenario.runtime.branchEndingState.choices.SHARE.status,choice);
    assert.equal(app.scenario.runtime.packageV15.flags.BOND,choice==='SATISFIED'?1:0);
    const snapshot=app.api._export();app.api.applyImportedState(snapshot,{persistState:false});
    assert.equal(app.scenario.runtime.branchEndingState.choices.SHARE.status,choice);
    await app.turn('다음 만남을 준비한다.');await app.turn('마지막 인사를 건넨다.');
    assert.equal(app.scenario.runtime.branchEndingState.ending.endingId,'ENDING_'+target);
    assert.equal(app.win.document.getElementById('send').disabled,true);
  } finally {app.close();}
});
test('Instant ZIP retains originals and declares the extension absent from the old base engine',async()=>{
  const p=makeProjectForPackageTarget('cortex','instant_story',false);p.instantStory.corePrompt='INSTANT_CORE_SENTINEL';p.instantStory.keywordNotes=[{id:'NOTE',title:'공방',keywords:['공방'],priority:1,content:'INSTANT_NOTE_SENTINEL'}];
  const {files,output,zip}=await exported(p),ctx=engine(baseHtml),sc=ctx.CortexNexusBridge.toCortexScenario(ctx.CortexNexusBridge.adaptPackage(files));
  assert.equal(zip.file('events/events.json'),null);assert.equal(zip.file('rules/narrative_runtime.json'),null);
  assert.equal(JSON.stringify(sc).includes('INSTANT_CORE_SENTINEL'),false);
  assert.equal(files['reports/cortex-compatibility.json'].integrationTarget.minimumExtensionRevision,'1.0.0');
  assert.equal(cortexCompatibility(p).integrationTarget.minimumNexusVersion,'1.13.1');
  assert.doesNotMatch(aiGeneratorPromptFor(p),/기본 3비트|closureConditions/);
  const restored=normalizeProject((await extractStudioProjectFromPackage(output.blob)).project);
  assert.equal(restored.instantStory.corePrompt,p.instantStory.corePrompt);assert.deepEqual(restored.instantStory.keywordNotes,p.instantStory.keywordNotes);
});
test('engine-rejected branch options fail in Studio before producing a broken package',async()=>{
  for(const mutate of [
    (p:Project)=>{p.package15.endings[0].returnPolicy='return_checkpoint';},
    (p:Project)=>{p.package15.branchEnding.decisions[0].rules[0].when={kind:'relation_at_least',characterId:p.player.id,field:'trust',value:1,direction:'protagonist_to_character'};},
    (p:Project)=>{p.package15.branchEnding.decisions[0].fallback.narrativeGuidance='';},
    (p:Project)=>{p.package15.branchEnding.decisions.push({...p.package15.branchEnding.decisions[0],id:'DUPLICATE'});},
    (p:Project)=>{p.package15.branchEnding.choiceRecords[0].satisfiedEffect!.value='one';},
  ]){const p=branching();mutate(p);assert.ok(lintCortexPackage(p).errors>0);await assert.rejects(exportScenarioPack(p,false),/린터 오류/);}
});
