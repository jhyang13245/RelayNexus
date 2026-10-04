import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HeadlessCortex, makeModel } from './harness.mjs';
import { resolveWorkPresentation, publishedEventTurns } from '../../public/cortex-vn-presentation.mjs';
import { captureScene, portraitKey } from '../../public/vn-runtime/vn-scene.mjs';
import { castRequest, createCastDirector, validateCast } from '../../public/vn-runtime/vn-cast.mjs';
import { createStageAssets } from '../../public/vn-runtime/vn-assets.mjs';
import { fullAutoVisuals } from '../../public/vn-runtime/vn-autoplay.mjs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const metadata=read('vendor/visual-novel/public/work-presentation.json');
const identities=read('vendor/visual-novel/nexus-work-identities.json');
const fingerprint=identities['fate-seoul'];
const currentEvent='EV_ACT1_HISHIRI_06_LIGHTNING_USER';
const target='NPC_SERVANT_ARCHER_TESLA';
function fixture() {
  const sc=structuredClone(read('tests/fixtures/cortex-173-chronos-2turn.json').scenario);
  sc.characters=fingerprint.requiredCharacterIds.map((id,index)=>({id,name:index===2?'가려진 원래 이름':'확정 인물 '+index,aliases:[],source:{
    publicInfo:'첫 등장 뒤 공개: 인물 소개',publicAppearance:'검은 코트와 짧은 머리를 한 성인 남성',imageOnFirstAppearance:true,images:[],
  }}));
  sc.event={...sc.event,id:currentEvent};
  sc.runtime.packageContract={eventGraph:{nodes:Object.fromEntries(fingerprint.requiredEventIds.map(id=>[id,{id,title:'test event'}]))}};
  return sc;
}
test('main hashed work scope finds reviewed metadata by exact package identity, never title or one generic role',()=>{
  const sc=fixture();
  assert.equal(resolveWorkPresentation(sc,'main-local-id:edition',metadata,identities),metadata['fate-seoul']);
  const unrelated=fixture();unrelated.title='Fate/Seoul';unrelated.characters.pop();
  assert.deepEqual(resolveWorkPresentation(unrelated,'main-other',metadata,identities),{});
  const incomplete=fixture();delete incomplete.runtime.packageContract.eventGraph.nodes[fingerprint.requiredEventIds[0]];
  assert.deepEqual(resolveWorkPresentation(incomplete,'main-other',metadata,identities),{});
  const ambiguous={...identities,second:identities['fate-seoul']};
  assert.deepEqual(resolveWorkPresentation(sc,'main-other',{...metadata,second:metadata['fate-seoul']},ambiguous),{});
});
test('historical transaction event scope never falls back to the latest event or overwrites explicit source',()=>{
  const input=[{txn:{eventId:'past'}},{sourceEventId:'explicit',txn:{eventId:'other'}},{}];
  assert.deepEqual(publishedEventTurns(input),[{sourceEventId:'past',txn:{eventId:'past'}},input[1],{}]);
  assert.equal(input[0].sourceEventId,undefined);
});
test('registered anonymous man gets his own generated portrait under the main scope and can pass the full-auto visibility gate',async()=>{
  const scenario=fixture(),text='남자는 고개를 저었다. “반대다.”',turn={id:'fixture-turn',sourceEventId:currentEvent,status:'COMMITTED',text};
  const app=await new HeadlessCortex({initialScenario:scenario,standalonePath:'public/cortex.html',model:makeModel()}).open();
  try {
    const experience=app.win.CortexTurnExperience;
    const scene=captureScene({scope:'main-test-package',scenario,turn,priorTurns:[],experience,timeline:true});
    scene.candidates=scene.candidates.filter(person=>person.id!==scene.protagonistId);
    scene.castPages=[{start:0,text}];
    const index=scene.candidates.findIndex(p=>p.id===target);
    assert.ok(index>=0,'registered person must be a visual candidate even without an embedded image');
    const person=scene.candidates[index];
    assert.ok(person.aliases.includes('남자'));
    assert.doesNotMatch(JSON.stringify(castRequest(scene,'gpt-5.6-luna')),/가려진 원래 이름/,'do not disclose the private name to the director');
    const decision={beats:[{beat:'P0',speaker:'C'+index,speakerLabel:'남자',speakerEvidence:'남자는 고개를 저었다.',onStage:[{candidate:'C'+index,evidence:'남자는 고개를 저었다.',identityEvidence:'남자는 고개를 저었다.',identityStatus:'confirmed',presence:'physical'}]}]};
    const beat=validateCast(scene,decision)[0];
    assert.equal(beat.speakerId,target);assert.equal(beat.identityIssue,null);
    const requests=[];
    const director=createCastDirector({getConnection:()=>({key:'fixture',endpoint:'/fixture',model:'gpt-5.6-luna'}),read:async()=>null,write:async()=>{},fetchDecision:async()=>Response.json({output_text:JSON.stringify(decision)})});
    const assets=createStageAssets({castDirector:director,getKey:()=> 'fixture',getQuality:()=> 'low',getReferences:()=>[],onChange(){},read:async()=>null,write:async()=>{},fetchImage:async(_url,init)=>{requests.push(JSON.parse(init.body));return Response.json({imageUrl:'data:image/png;base64,Ymc='})}});
    await assets.prepare(scene,scene.castPages[0]);
    const view=assets.view(scene,scene.castPages[0]);
    assert.equal(view.portraits[0]?.id,target);
    assert.equal(requests.filter(row=>row.purpose==='portrait').length,1);
    assert.doesNotMatch(JSON.stringify(requests),/가려진 원래 이름/);
    const gate=fullAutoVisuals(view,{displayed:view.portraits.map(row=>({id:row.id,url:row.url}))});
    assert.equal(gate.action,'ready');
    const before=portraitKey(scene.scope,person);
    const historical=captureScene({scope:scene.scope,scenario,turn:{...turn,sourceEventId:'UNRELATED_EVENT'},experience,timeline:true});
    assert.ok(!historical.candidates.find(p=>p.id===target)?.aliases.includes('남자'),'generic man must not inherit this image in another event');
    const replay=captureScene({scope:scene.scope,scenario,turn:{...turn,sourceEventId:undefined,txn:{eventId:currentEvent}},experience,timeline:true});
    assert.equal(portraitKey(scene.scope,replay.candidates.find(p=>p.id===target)),before,'legacy event representation must reuse the same image');
    for (const gate of [{secret:true},{revealCondition:'미완료 사건에서만 정체 공개'}]) {
      const guarded=fixture();Object.assign(guarded.characters.find(p=>p.id===target).source,gate);
      const blocked=captureScene({scope:scene.scope,scenario:guarded,turn,experience,timeline:true});
      assert.ok(!blocked.candidates.some(p=>p.id===target),'explicit disclosure restrictions remain authoritative');
    }
    const overridden=fixture();overridden.presentation={eventPublicAliases:[]};
    const excluded=captureScene({scope:scene.scope,scenario:overridden,turn,experience,timeline:true});
    assert.ok(!excluded.candidates.find(p=>p.id===target)?.aliases.includes('남자'),'author can explicitly remove compatibility event labels');
  } finally {app.close()}
});
