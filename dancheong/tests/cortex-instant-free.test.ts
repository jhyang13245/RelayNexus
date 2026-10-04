import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HeadlessCortex,makeModel} from './cortex/harness.mjs';
import {installInstantModel} from './cortex/instant-model.mjs';
const emptyHud=()=>({statChanges:[],relationshipChanges:[],world:null,presentCharacterIds:[]});
test('Muse Instant recovers omitted recommendations before returning, retries incomplete JSON and preserves prose',async()=>{
  let calls=0;const labels=['작업대 위 열쇠를 집어 든다.','서준에게 다음 할 일을 묻는다.','동생과 함께 문 밖으로 나간다.'];
  const app=await open({omitRecommendations:true,nextMoves:(req:any)=>{
    calls++;assert.equal(req.model,'muse-spark-1.3-contributor');
    const instructions=req.input[0].content[0].text;
    assert.doesNotMatch(instructions,/CORTEX_ST_V1/);
    if(calls===1)return Response.json({status:'incomplete',output_text:''});
    return Response.json({status:'completed',output_text:JSON.stringify({recommendations:labels.map((label,i)=>({label,risk:['LOW','MEDIUM','HIGH'][i]}))})});
  }});
  try{app.api._setSettings({model:'muse-spark-1.3-contributor'});const turn=await app.turn('계속');
    assert.equal(calls,2);assert.equal(turn.status,'COMMITTED');assert.equal(turn.metrics.authorRecommendations.status,'ACCEPTED');
    assert.deepEqual(Array.from(turn.recommendations,(r:any)=>r.label),labels);
    assert.ok(labels.every(label=>!turn.text.includes(label)));assert.equal(app.api._export().turns.at(-1).recommendations.length,3);
  }finally{app.close()}
});
async function open(options:any={}){
  const model=installInstantModel(makeModel(),options),app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model}).open();
  const bytes=fs.readFileSync('tests/fixtures/studio-2.2-instant.zip'),imported=await app.api.inspectNexusPackage({name:'instant.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)});
  app.api.applyImportedState({canonicalSession:imported.canonicalSession,turns:[]},{persistState:false});app.api._setSettings({apiKey:'fake',typingSpeed:'instant'});return app;
}

test('Instant failed recommendation recovery is retryable without replaying the beat or leaking protected terms',async()=>{
 let fail=true,calls=0;const app=await open({omitRecommendations:true,nextMoves:()=>{
  calls++;return Response.json({status:'completed',output_text:JSON.stringify({recommendations:[{label:fail?'금지이름에게 묻는다.':'열쇠를 확인한다.',risk:'LOW'},{label:'작업대 옆에서 동생에게 묻는다.',risk:'MEDIUM'},{label:'동생과 함께 문 밖으로 나간다.',risk:'HIGH'}]})});
 }});
 try{app.scenario.disclosure.protectedTerms=['금지이름'];const turn=await app.turn('계속'),before=turn.text;
  assert.equal(turn.status,'COMMITTED');assert.equal(turn.metrics.recommendationRecovery.status,'ERROR');assert.equal(turn.recommendations,undefined);assert.equal(calls,2);
  fail=false;await app.api._ensureRecommendations(turn);
  assert.equal(calls,3);assert.equal(turn.metrics.authorRecommendations.status,'ACCEPTED');assert.equal(turn.text,before);assert.equal(app.turns.length,1);assert.doesNotMatch(JSON.stringify(turn.recommendations),/금지이름/);
 }finally{app.close()}
});
test('free writer has no ending/reveal/event judge; old ended saves continue and exact ten-bit window survives',async()=>{
  const calls:string[]=[],app=await open({onCall:(s:string)=>calls.push(s)});
  try{app.scenario.runtime.instantState.ended=true;delete app.scenario.runtime.instantStory.endingPolicy;delete app.scenario.runtime.instantStory.endingSchedule;
    const ctx=app.win.CortexInstant.freeContext(app.scenario,[],'계속',[app.scenario.protagonist]);assert.equal(ctx.endingDue,undefined);assert.equal(ctx.conditionalRelationships,undefined);
    const turn=await app.turn('계속');assert.equal(turn.status,'COMMITTED',turn.diagnostic);assert.equal(app.scenario.runtime.instantState.ended,false);
    assert.deepEqual(calls,['CORTEX_INSTANT_WRITER_V2','CORTEX_INSTANT_PARAGRAPH_V2','CORTEX_INSTANT_HUD_V2']);assert.equal(turn.commitGraph,undefined);assert.equal(app.scenario.runtime.eventLedger.sealed.length,0);
  }finally{app.close()}
});
test('opening appears before later paragraph audit and HUD; held paragraph is never displayed prematurely',async()=>{
  let resolve:any;const gate=new Promise(r=>resolve=r);let auditing=false,hud=false;
  const app=await open({audit:async()=>{auditing=true;await gate;return {verdict:'PASS',reason:'',evidence:''}},hud:()=>{hud=true;return emptyHud()}});
  try{const pending=app.turn('계속');for(let i=0;i<40&&!auditing;i++)await app.settle(10);assert.equal(auditing,true);await app.settle(20);
    const t=app.turns.at(-1);assert.match(t.displayText||t.text,/동생을 도왔다/);assert.doesNotMatch(t.displayText||t.text,/내가 확인/);assert.equal(hud,false);
    resolve();const done=await pending;assert.match(done.text,/내가 확인/);assert.equal(done.status,'COMMITTED');assert.doesNotMatch(done.text,/⟦|CORTEX_|추천/);assert.equal(done.recommendations.length,3);
  }finally{resolve();app.close()}
});
test('HUD manager failure invokes writer once, then uses the grounded writer update',async()=>{
  const roles:string[]=[],app=await open({hud:(_:any,s:string)=>{roles.push(s);if(s==='CORTEX_INSTANT_HUD_V2')return {...emptyHud(),statChanges:[{id:'trust',delta:99,evidence:'없는 근거'}]};return {...emptyHud(),statChanges:[{id:'trust',delta:1,evidence:'동생을 도왔다.'}]};}});
  try{const t=await app.turn('계속');assert.equal(t.status,'COMMITTED');assert.equal(t.metrics.instantHud.status,'WRITER_RECOVERED');assert.equal(app.scenario.runtime.instantState.stats.trust,3);assert.equal(roles.length,2);}finally{app.close()}
});
test('both HUD failures retain all previous values but commit prose, memory count and undo',async()=>{
  const app=await open({hud:()=>{throw Error('HUD down')}});
  try{const before=JSON.stringify(app.scenario.world),t=await app.turn('계속');assert.equal(t.status,'COMMITTED');assert.equal(t.metrics.instantHud.status,'PREVIOUS_VALUES_RETAINED');assert.equal(t.metrics.instantHud.attempts.length,2);assert.equal(app.scenario.runtime.instantState.stats.trust,2);assert.equal(JSON.stringify(app.scenario.world),before);assert.equal(app.scenario.runtime.instantState.turnCount,1);app.win.confirm=()=>true;await app.api._rewind();assert.equal(app.scenario.runtime.instantState.turnCount,0);}finally{app.close()}
});
test('truncated stream preserves already released prose; next input does not retry the prior action',async()=>{
  const app=await open({truncated:true});
  try{const t=await app.turn('열쇠를 놓는다');assert.equal(t.status,'COMMITTED');assert.match(t.text,/동생을 도왔다/);assert.equal(t.metrics.partialPublication,true);assert.equal(app.scenario.runtime.instantState.turnCount,1);assert.equal((await app.turn('그 다음')).status,'COMMITTED');assert.equal(app.scenario.runtime.instantState.turnCount,2);}finally{app.close()}
});
test('audit unavailable delegates narrow review to writer; KEEP preserves prose unchanged',async()=>{
  let edits=0;const app=await open({audit:()=>{throw Error('audit down')},editor:(p:any)=>{edits++;return {decision:'KEEP',text:'이 문자열로 교체하면 안 된다',changesPremise:false,reason:''}}});
  try{const t=await app.turn('계속');assert.equal(t.status,'COMMITTED');assert.match(t.text,/내가 확인/);assert.doesNotMatch(t.text,/이 문자열/);assert.equal(edits,1);}finally{app.close()}
});
test('explicit protected opening is minimally edited before publication, without opening semantic audit',async()=>{
  let edits=0;const app=await open({prose:()=> '금지이름이 문 앞에 섰다.',hud:emptyHud,editor:()=>{edits++;return {decision:'EDIT',text:'낯선 사람이 문 앞에 섰다.',changesPremise:false,reason:'지정 보호어'}}});
  try{app.scenario.disclosure.protectedTerms=['금지이름'];const t=await app.turn('계속');assert.equal(t.status,'COMMITTED');assert.equal(t.text,'낯선 사람이 문 앞에 섰다.');assert.equal(edits,1);}finally{app.close()}
});
test('premise-changing edit regenerates unpublished tail only and keeps the public prefix',async()=>{
  let tail=0,edited=false;const app=await open({prose:(p:any)=>{if(p.schema==='CORTEX_INSTANT_TAIL_V2'){tail++;return '닫힌 문 앞에서 손을 멈췄다.'}return '문은 잠겨 있었다.\n\n문이 활짝 열렸다.'},hud:emptyHud,audit:(p:any)=>({verdict:p.paragraphText.includes('활짝')?'REPAIR':'PASS',category:'FACT_CONTRADICTION',reason:'잠긴 문과 모순',evidence:'문이 활짝 열렸다.',conflictingEvidence:'문은 잠겨 있었다.'}),editor:()=>{edited=true;return {decision:'EDIT',text:'문고리를 돌려도 문은 열리지 않았다.',changesPremise:true,reason:'이후 이동 불가'}}});
  try{const t=await app.turn('계속');assert.equal(t.status,'COMMITTED');assert.equal(edited,true);assert.equal(tail,1);assert.equal(t.text.split('문은 잠겨 있었다.').length,2);assert.match(t.text,/닫힌 문 앞/);assert.doesNotMatch(t.text,/활짝/);}finally{app.close()}
});

test('intermediate audit cannot demand recommendations or a completed turn',async()=>{
  let edits=0;const app=await open({hud:emptyHud,audit:(p:any)=>{
    assert.equal(p.unit,'NON_FINAL_PARAGRAPH_WINDOW');assert.equal(p.continuationExpected,true);
    assert.equal(p.scope.corePrompt,undefined);assert.equal(p.input,'검사실로 간다');
    return {verdict:'REPAIR',category:'OUTPUT_META',reason:'추천 행동 세 가지가 누락되었습니다.',evidence:p.paragraphText,conflictingEvidence:''};
  },editor:()=>{edits++;throw Error('must not call editor')}});
  try{const t=await app.turn('검사실로 간다');assert.equal(t.status,'COMMITTED');assert.equal(edits,0);assert.doesNotMatch(t.text,/^- /m);assert.ok(t.metrics.instantIgnoredReviews.length>0);}finally{app.close()}
});

test('editor-added untitled choices never enter published prose and repairs are counted',async()=>{
  const app=await open({prose:()=> '검사실 문이 열렸다.\n\n안내원이 문 옆으로 비켜섰다.',hud:emptyHud,audit:()=>{throw Error('audit down')},editor:(p:any)=>({decision:'EDIT',text:p.draft+'\n\n- 문을 연다.\n- 안내원에게 묻는다.\n- 복도를 확인한다.',changesPremise:false,reason:'검토'})});
  try{const t=await app.turn('검사실로 간다');assert.equal(t.status,'COMMITTED');assert.match(t.text,/안내원이 문 옆/);assert.doesNotMatch(t.text,/^- /m);assert.equal(t.metrics.instantChoiceLinesRemoved,3);assert.equal(t.recommendations.length,3);}finally{app.close()}
});

test('choice-only window is skipped without preventing the next narrative paragraph',async()=>{
  const app=await open({prose:()=> '문 앞에 도착했다.\n\n- 문으로 들어간다.\n- 창문을 살펴본다.\n- 복도로 돌아간다.\n\n안내원이 이름을 확인하고 의자를 내주었다.',hud:emptyHud});
  try{const t=await app.turn('문으로 들어간다');assert.equal(t.status,'COMMITTED');assert.match(t.text,/의자를 내주었다/);assert.doesNotMatch(t.text,/^- /m);}finally{app.close()}
});

test('choice cleanup preserves in-world lists and does not modify original history',async()=>{
  const app=await open({hud:emptyHud});
  try{
    const api=app.win.CortexInstant;
    const list='게시판에는 다음과 같이 적혀 있었다.\n- 첫째, 문을 닫는다.\n- 둘째, 조명을 끈다.';
    assert.equal(api.cleanChoices(list).text,list);
    const historical='검사실에 들어섰다.\n\n- 문을 연다. 빨리 갈 수 있지만 위험하다.\n- 기다린다. 대신 기회를 놓칠 가능성이 있다.';
    app.scenario.runtime.instantState.turnCount=1;
    const turns=[{id:'history',status:'COMMITTED',input:'들어간다',text:historical}],before=JSON.stringify(turns),packageBefore=JSON.stringify(app.scenario.runtime.instantStory);
    const ctx=api.freeContext(app.scenario,turns,'검사를 받는다',[app.scenario.protagonist]);
    assert.equal(ctx.exampleScenes.length,0);assert.equal(ctx.opening?.firstGoal,undefined);assert.equal(ctx.startProfile?.startSituation,undefined);
    assert.doesNotMatch(ctx.recent[0].text,/^- /m);assert.equal(JSON.stringify(turns),before);assert.equal(JSON.stringify(app.scenario.runtime.instantStory),packageBefore);
  }finally{app.close()}
});

test('writer receives current style guide and no permanently replayed example scene',async()=>{
  let seen=false;const app=await open({hud:emptyHud,onWriter:(ctx:any)=>{seen=true;assert.equal(ctx.writerStyleGuide,'대사는 인물별로 구분하고 경쾌하게.');assert.equal(ctx.exampleScenes.length,0);}});
  try{app.api._setSettings({apiKey:'fake',typingSpeed:'instant',styleGuide:'대사는 인물별로 구분하고 경쾌하게.'});assert.equal((await app.turn('검사실로 간다')).status,'COMMITTED');assert.equal(seen,true);}finally{app.close()}
});

test('HUD supports a grounded location-only update while preserving day and clock',async()=>{
  const app=await open({prose:()=> '검사실에 들어섰다.\n\n안내원이 의자를 내주었다.',hud:()=>({...emptyHud(),world:{day:null,time:null,location:'검사실',evidence:'검사실에 들어섰다.'}})});
  try{const day=app.scenario.world.day,time=app.scenario.world.time,t=await app.turn('검사실로 간다');assert.equal(t.status,'COMMITTED');assert.equal(t.metrics.instantHud.status,'UPDATED');assert.equal(app.scenario.world.location,'검사실');assert.equal(app.scenario.world.day,day);assert.equal(app.scenario.world.time,time);}finally{app.close()}
});

test('HUD recovers stale location from latest enacted history but invalid clock is atomic',async()=>{
  const app=await open({hud:emptyHud});
  try{const api=app.win.CortexInstant,ctx=api.freeContext(app.scenario,[],'검사를 받는다',[app.scenario.protagonist]);ctx.recent=[{text:'검사실에\n들어섰다.'}];
    const before=JSON.stringify(app.scenario),hud={...emptyHud(),world:{day:null,time:null,location:'검사실',evidence:'검사실에 들어섰다.'}};
    assert.equal(api.commitFree(app.scenario,ctx,'의자에 앉았다.','new-turn',hud).world.location,'검사실');
    assert.throws(()=>api.commitFree(app.scenario,ctx,'의자에 앉았다.','new-turn',{...hud,world:{...hud.world,time:'25:10'}}),/HUD_WORLD_TIME/);
    assert.throws(()=>api.commitFree(app.scenario,ctx,'의자에 앉았다.','new-turn',{...hud,world:{...hud.world,evidence:'없는 문장'}}),/HUD_WORLD_EVIDENCE/);
    assert.equal(JSON.stringify(app.scenario),before);
  }finally{app.close()}
});
