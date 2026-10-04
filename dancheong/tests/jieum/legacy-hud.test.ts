import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {makeNewStudioProject,normalizeProject,blankStoryEvent} from '../../features/jieum/studio-model';
import {cortexCompatibility} from '../../features/jieum/cortex-engine-contract';
import {exportScenarioPack,extractStudioProjectFromPackage} from '../../features/jieum/studio-export';
import {HeadlessCortex,makeModel} from '../cortex/harness.mjs';
import JSZip from 'jszip';
import {activateCanonAuthoring,compileCanonDesign} from '../../features/jieum/canon-design';
import {hudIssues} from '../../features/jieum/canon-hud';

test('legacy contracts cannot silently activate a destructive canon projection',()=>{
 const p=makeNewStudioProject();p.package15.enabled=true;p.package15.loopPolicy.enabled=true;
 const before=JSON.stringify(p);assert.equal(activateCanonAuthoring(p),p);assert.equal(JSON.stringify(compileCanonDesign(p)),before);
 const fresh=makeNewStudioProject();assert.ok(activateCanonAuthoring(fresh).canonDesign);
});
const stat={id:'cycle',label:'현재 회차',characterId:'player',initial:1,minimum:1,maximum:100,unit:'회차',visible:true,revealWhenChanged:true,mode:'event',increaseWhen:'',decreaseWhen:''};
function runtime(){
 const sc:any={protagonist:{name:'은서'},event:{id:'RESET',nextEvent:{id:'B'}},world:{day:0,time:''},runtime:{packageContract:{eventGraph:{nodes:{RESET:{id:'RESET'},B:{id:'B'}}}},packageV15:{jieum:{revision:1,mode:'hud_only',routes:[],stats:[stat],hudEffects:[{id:'reset',eventId:'RESET',criterion:'실제 되감김',statId:'cycle',amount:1}],timeline:{startDate:'2026-05-11',cycleStatId:'cycle'}}},branchEndingState:{choices:{}}}};
 const records=[{id:'reset',sourceEventId:'RESET',criterion:'실제 되감김',satisfiedEffect:{kind:'increment_flag',flagId:'cycle',value:1}}];
 const ctx:any=vm.createContext({CortexBranchEnding:{contract:()=>({enabled:true,records}),state:(s:any)=>s.runtime.branchEndingState,pending:(s:any)=>records.filter(r=>!s.runtime.branchEndingState.choices[r.id]?.locked),flags:(s:any)=>({cycle:1+(s.runtime.branchEndingState.choices.reset?.status==='SATISFIED'?1:0)})}});
 vm.runInContext(fs.readFileSync('vendor/cortex/jieum-runtime.js','utf8'),ctx);return {sc,j:ctx.CortexJieum};
}
test('HUD-only initialization leaves graph, opening, state and images untouched',()=>{
 const {sc,j}=runtime(),before=JSON.stringify({event:sc.event,world:sc.world,contract:sc.runtime.packageContract});j.initialize(sc);
 assert.equal(JSON.stringify({event:sc.event,world:sc.world,contract:sc.runtime.packageContract}),before);assert.equal(sc.runtime.jieum.baseline,null);assert.equal(j.images(sc,{id:'x'},{id:'RESET'}),null);assert.equal(j.visibleStats(sc).length,0);assert.throws(()=>j.nextRoute(sc,[]),/LOCKED/);
});
test('actual reset is committed once, survives restore and cannot be undone by a later NOT_SATISFIED verdict',()=>{
 const {sc,j}=runtime();j.initialize(sc);const text='시간이 되감겼다. 은서는 5월 11일 아침으로 돌아왔다.';
 sc.runtime.branchEndingState.choices.reset={status:'SATISFIED',turnId:'t1'};
 j.stage(sc,{h0:{status:'CURRENT_ACTUAL',evidence:text},timeline:{kind:'RESET',date:'2026-05-11',evidence:text}},'t1',text);j.commit(sc,{id:'t1'});j.commit(sc,{id:'t1'});
 assert.equal(j.values(sc).cycle,2);assert.equal(sc.runtime.jieum.hudEffectLedger.reset.delta,1);assert.equal(sc.runtime.jieum.timeline.dayWithinLoop,1);assert.equal(sc.runtime.jieum.timeline.lastAppliedResetCommitId,'t1');assert.equal(j.visibleStats(sc).length,1);
 const saved=JSON.parse(JSON.stringify(sc));j.initialize(saved);assert.equal(j.values(saved).cycle,2);assert.equal(saved.runtime.jieum.changes.length,1);
 const request:any={},transport:any={schema:{properties:{},required:[]}};j.extend(request,transport,saved,'다음 문장');assert.equal(request.jieumEventEffects,undefined);
});
test('recollection, other POV and observation numbers cannot increment an authored reset',()=>{
 for(const text of ['은서는 5월 10일을 회상했다.','기기 화면에 관측 9회차가 떴다.','설아는 5월 11일 아침으로 돌아갔다.']){
  const {sc,j}=runtime();j.initialize(sc);sc.runtime.branchEndingState.choices.reset={status:'SATISFIED',turnId:'t'};
  j.stage(sc,{h0:{status:'NOT_CURRENT',evidence:text},timeline:{kind:'IGNORE',date:'2026-05-10',evidence:text}},'t',text);j.commit(sc,{id:'t'});
  assert.equal(j.values(sc).cycle,1);assert.equal(sc.runtime.jieum.timeline,undefined);assert.equal(j.visibleStats(sc).length,0);
 }
});
test('calendar uses only an exact approved date; day changes do not invent a new cycle',()=>{
 const {sc,j}=runtime();j.initialize(sc);
 for(const [id,date,expected] of [['a','2026-05-11',1],['b','2026-05-12',2]]){const text=`은서의 현재 날짜는 ${date}이다.`;j.stage(sc,{timeline:{kind:'CURRENT',date,evidence:text}},id,text);j.commit(sc,{id});assert.equal(sc.runtime.jieum.timeline.dayWithinLoop,expected);}
 const current=JSON.stringify(sc.runtime.jieum.timeline);
 j.stage(sc,{timeline:{kind:'CURRENT',date:'2026-05-10',evidence:'5월 10일을 회상했다.'}},'c','5월 10일을 회상했다.');j.commit(sc,{id:'c'});assert.equal(JSON.stringify(sc.runtime.jieum.timeline),current);
 j.stage(sc,{timeline:{kind:'RESET',date:'2026-05-11',evidence:'미래 5월 11일'}},'d','오늘은 아무 날짜도 없다.');j.commit(sc,{id:'d'});assert.equal(JSON.stringify(sc.runtime.jieum.timeline),current);assert.equal(j.values(sc).cycle,1);assert.equal(sc.world.time,'');
});
test('unknown legacy saves are not assigned a cycle/date from event numbers',()=>{const {sc,j}=runtime();sc.event.id='CH48';j.initialize(sc);assert.equal(sc.runtime.jieum.timeline,undefined);assert.equal(j.visibleStats(sc).length,0);});
test('HUD validation refuses existing nonnumeric flags and altered defaults',()=>{const p=makeNewStudioProject();p.canonHud={revision:1,stats:[{...stat,mode:'event',characterId:p.player.id}],effects:[]};p.package15.flags=[{id:'cycle',label:'계획',valueType:'boolean',defaultValue:false,scope:'session'}];assert.ok(hudIssues(p).length);});

test('malformed HUD contracts fail closed and calendar dates cannot overflow',()=>{
 const p=makeNewStudioProject();assert.throws(()=>normalizeProject({...p,canonHud:{revision:1,stats:[null],effects:[]}}),/형식/);
 p.canonHud={revision:1,stats:[],effects:[],timeline:{startDate:'2026-02-30',cycleStatId:''}};
 assert.ok(hudIssues(p).length);
 const {sc,j}=runtime();sc.runtime.packageV15.jieum.hudEffects[0].eventId='missing';assert.throws(()=>j.initialize(sc),/HUD_EFFECT_INVALID/);
 assert.equal(cortexCompatibility(p).integrationTarget.minimumExtensionRevision,'1.3.0');
 const modern=activateCanonAuthoring(makeNewStudioProject());modern.canonDesign!.stats=[{...stat,mode:'event'}];
 assert.equal(cortexCompatibility(modern).integrationTarget.minimumExtensionRevision,'1.3.0','first-change disclosure also requires the new renderer for modern canon packs');
});
test('a proven reset clears a stale date until the new calendar is explicit',()=>{
 const {sc,j}=runtime();j.stage(sc,{timeline:{kind:'CURRENT',date:'2026-05-12',evidence:'5월 12일'}},'a','오늘은 5월 12일이다.');j.commit(sc,{id:'a'});
 j.stage(sc,{h0:{status:'CURRENT_ACTUAL',evidence:'시간이 되감겼다.'}},'b','시간이 되감겼다.');j.commit(sc,{id:'b'});
 assert.equal(j.values(sc).cycle,2);assert.equal(sc.runtime.jieum.timeline.date,null);assert.equal(sc.runtime.jieum.timeline.dayWithinLoop,null);
 j.stage(sc,{timeline:{kind:'CURRENT',date:'2026-05-11',evidence:'2027-05-11'}},'c','2027-05-11');j.commit(sc,{id:'c'});assert.equal(sc.runtime.jieum.timeline.date,null);
 const request:any={},transport:any={schema:{properties:{},required:[]}};j.extend(request,transport,sc,'다음 본문');assert.equal(request.jieumTimeline.pendingReset.commitId,'b');
 const text='되감겨 돌아온 지금은 5월 11일 아침이었다.';j.stage(sc,{timeline:{kind:'RESET_DATE',date:'2026-05-11',evidence:text}},'d',text);j.commit(sc,{id:'d'});
 assert.equal(j.values(sc).cycle,2);assert.equal(sc.runtime.jieum.timeline.dayWithinLoop,1);assert.equal(sc.runtime.jieum.timeline.lastAppliedResetCommitId,'b');
 j.stage(sc,{timeline:{kind:'RESET_DATE',date:'2026-05-12',evidence:'5월 12일'}},'e','5월 12일');j.commit(sc,{id:'e'});assert.equal(sc.runtime.jieum.timeline.date,'2026-05-11');
});
test('real host commits the independent HUD with one verdict, restores it, and rewinds it',async()=>{
 const p=makeNewStudioProject();p.packageTarget='cortex';p.runtimeMode='intelligent_canon';p.title='회차 검증';p.genre='미스터리';p.startLocation='방';p.player.name='은서';
 p.events=[{...blankStoryEvent(),id:'RESET',name:'되감김',description:'은서가 방에서 시간을 되감는 장면',required:true}];
 p.canonHud={revision:1,stats:[{...stat,mode:'event',characterId:p.player.id}],effects:[{id:'reset',eventId:'RESET',statId:'cycle',criterion:'은서가 실제 시간을 되감았다.',amount:1}],timeline:{startDate:'2026-05-11',cycleStatId:'cycle'}};
 const output=await exportScenarioPack(p,false),zip=await JSZip.loadAsync(await output.blob.arrayBuffer()),files:Record<string,any>={};
 assert.deepEqual(normalizeProject((await extractStudioProjectFromPackage(output.blob)).project).canonHud,p.canonHud);
 for(const [path,f] of Object.entries(zip.files))if(path.endsWith('.json')&&!path.startsWith('studio/'))files[path]=JSON.parse(await f.async('string'));
 assert.equal(files['manifest.json'].integrationTarget.minimumExtensionRevision,'1.3.0');
 const ctx:any=vm.createContext({console,TextEncoder,TextDecoder,URL,crypto,structuredClone,setTimeout,clearTimeout,performance,AbortController});
 const scripts=[...fs.readFileSync('vendor/cortex/Cortex_v1.42.0.html','utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];for(const i of [0,1,3])vm.runInContext(scripts[i][1],ctx);
 const sc=ctx.CortexNexusBridge.toCortexScenario(ctx.CortexNexusBridge.adaptPackage(files));
 const text='시간이 되감겼다. 은서는 5월 11일 아침으로 돌아왔다.\n\n은서는 방을 둘러보며 달라진 흔적을 찾았다.';
 const model=makeModel({writer:()=>text,eventVerdict:(p:any)=>({requirements:p.requirements.map((r:any)=>({requirementRef:r.ref,status:'UNMET',reason:'계속'})),resources:{h0:{status:'CURRENT_ACTUAL',evidence:'시간이 되감겼다.'},timeline:{kind:'RESET',date:'2026-05-11',evidence:'은서는 5월 11일 아침으로 돌아왔다.'}}})});
 const app=await new HeadlessCortex({initialScenario:sc,standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model}).open();
 try{
  app.api._setSettings({apiKey:'fixture-only',typingSpeed:'instant'});const t=await app.turn('시간을 되감는다.');assert.equal(t.status,'COMMITTED');
  assert.equal(app.win.CortexJieum.values(app.scenario).cycle,2);assert.equal(app.scenario.runtime.jieum.timeline.dayWithinLoop,1);
  assert.equal(model.calls.filter((c:any)=>c.kind==='eventVerdict').length,1);
  assert.equal(model.calls.find((c:any)=>c.kind==='eventVerdict').payload.jieumEventEffects.length,1);
  const saved=app.api._export();app.api.applyImportedState(saved,{persistState:false});assert.equal(app.win.CortexJieum.values(app.scenario).cycle,2);
  app.win.confirm=()=>true;await app.api._rewind();assert.equal(app.win.CortexJieum.values(app.scenario).cycle,1);assert.equal(app.scenario.runtime.jieum?.timeline,undefined);
 }finally{app.close();}
});
