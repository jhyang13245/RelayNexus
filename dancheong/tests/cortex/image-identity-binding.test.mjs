import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('vendor/cortex/parts/04.part','utf8'),context={structuredClone};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('/* Cortex v1.38.0'),source.lastIndexOf('</script>')),context);
const api=context.CortexTurnExperience;
const person=(id,name,aliases=[])=>({id,name,aliases,source:{images:[{isPrimary:true,assetPath:id+'.png'}]}});
const scenario={protagonist:{id:'hero',name:'도현'},characters:[person('guard','수호자'),person('scholar','미라 바렌',['미라'])],runtime:{storyId:'synthetic-image-identity'}};
const turn=text=>({id:'current',status:'COMMITTED',text});
const speaking=(name,extra={})=>({id:'earlier',status:'COMMITTED',text:'“안녕하세요.”',dialogueAnnotations:[{bindingVersion:2,speakerName:name,offset:0,quoteText:'“안녕하세요.”',...extra}]});
const make=(text,priorTurns=[])=>api.createImageCapsule({scenario,turn:turn(text),priorTurns});
const rows=scenario.characters.map(p=>({characterId:p.id,ref:p.id+'.png',dataUrl:'image:'+p.id}));

test('photo number, public alias and action stay bound to the same subject',()=>{
 const c=make('도현은 탁자 앞에 섰다. 유진은 도현의 손을 놓았다.\n\n미라가 철제문을 잠그는 동안, 수호자는 도현 앞에 무릎을 굽혔다. 유진은 의자에서 기다렸다.',[speaking('유진')]);
 const selected=api.selectImageReferences(c,rows),prompt=api.imageRequestPrompt(c,selected);
 assert.deepEqual(Array.from(selected,r=>r.publicName),['수호자','미라 바렌']);
 const guard=prompt.split('\n').find(line=>line.startsWith('참조 이미지 1 ='));
 const scholar=prompt.split('\n').find(line=>line.startsWith('참조 이미지 2 ='));
 assert.match(guard,/수호자.*무릎을 굽혔다/);
 assert.doesNotMatch(guard,/잠그는/);
 assert.match(scholar,/미라 바렌.*본문 이름: 미라.*철제문을 잠그는/);
 assert.doesNotMatch(scholar,/무릎을 굽혔다/);
 assert.match(prompt,/기준 사진이 없는 별도 인물: 도현, 유진/);
 assert.match(prompt,/다른 참조 인물의 별명으로 해석하지 않는다/);
 assert.match(prompt,/한 사람의 사진을 두 명에게 복제하지 않는다/);
});

test('ending focus does not replay a previous farewell under a different face',()=>{
 const farewell='유진은 도현의 손을 잡고 작별했다. 문을 닫자 그녀의 발소리가 멀어졌다.';
 const ending='미라가 철제문을 잠갔다. 수호자는 도현 앞에 섰다. 검은 제복의 안내원이 문으로 들어왔다.';
 const c=make(farewell+'\n\n'+ending,[speaking('유진')]),prompt=api.imageRequestPrompt(c,api.selectImageReferences(c,rows));
 assert.match(prompt,/검은 제복의 안내원/);
 assert.doesNotMatch(prompt,/손을 잡고 작별했다|그녀의 발소리/);
 assert.match(prompt,/마지막 문단 끝의 한 순간/);
 assert.ok(c.subjectBindings.every(p=>p.actionEvidence.every(s=>!s.includes('작별'))));
});

test('shared voices beyond a barrier do not admit either reference, including possessives',()=>{
 const c=make('도현은 유진과 기다렸다.\n\n철제문 너머에서는 수호자의 낮은 목소리와 미라가 통신 상태를 확인하는 소리가 희미하게 들렸다. 유진은 고개를 들었다.');
 assert.deepEqual(Array.from(c.referenceCharacterIds),['hero']);
 assert.deepEqual(Array.from(c.excludedReferenceNames).sort(),['미라','수호자'].sort());
 assert.equal(api.selectImageReferences(c,rows).length,0);
 for(const text of ['문 너머에서 미라가 들어왔다. 도현은 목소리를 낮췄다.','미라는 문밖을 보았다. 도현의 목소리가 들렸다.','미라는 도현 옆에서 무전을 들었다.']){
  assert.ok(make(text).referenceCharacterIds.includes('scholar'),text);
 }
});

test('literal names use bounded, anchored published dialogue, never a stale identity ID',()=>{
 const valid=speaking('유진'),invalid=speaking('가짜',{offset:3}),nonSpeech=speaking('기록자',{quoteKind:'NON_SPEECH'});
 const prior=[speaking('오래된이름'),...Array.from({length:8},()=>speaking('다른사람')),valid,invalid,nonSpeech];
 const c=make('유진은 가짜와 기록자, 오래된이름을 지나 도현 앞에 섰다.',prior);
 assert.ok(c.subjectBindings.some(p=>p.name==='유진'&&!p.characterId));
 for(const name of ['가짜','기록자','오래된이름'])assert.ok(!c.subjectBindings.some(p=>p.name===name),name);
 const wrongId=speaking('유진',{characterId:'scholar'});
 const alias=make('도현은 유진과 미라 옆에 앉았다.',[wrongId]);
 assert.ok(alias.subjectBindings.some(p=>p.name==='유진'&&!p.characterId),'literal name must not steal the stale ID photo');
 assert.equal(alias.subjectBindings.find(p=>p.characterId==='scholar').name,'미라 바렌');
});

test('dialogue-only endings retain just the immediately preceding scene context',()=>{
 const text='먼 과거의 장면.\n\n미라는 도현과 탁자에 앉았다.\n\n“반가워요.”';
 const c=make(text);
 assert.match(c.prompt,/미라는 도현과 탁자/);
 assert.doesNotMatch(c.prompt,/먼 과거/);
 assert.deepEqual(Array.from(c.referenceCharacterIds),['hero','scholar']);
});

test('pronouns and a quoted written list retain their immediate antecedent, not older scenes',()=>{
 for(const ending of ['그녀는 고개를 끄덕였다.','1. 문을 연다.\n2. 창문을 살핀다.']){
  const c=make('먼 과거의 장면.\n\n미라는 종이에 행동을 적었다.\n\n'+ending);
  assert.match(c.prompt,/미라는 종이에 행동을 적었다/);
  assert.doesNotMatch(c.prompt,/먼 과거/);
  assert.ok(c.prompt.includes(ending));
 }
});

test('public masks and ambiguous aliases never acquire a hidden photo',()=>{
 const sc=structuredClone(scenario);
 sc.characters.push({id:'masked',name:'숨겨진이름',secret:true,preRevealAlias:'가면 손님',preRevealImage:'safe.png',source:{images:[{isPrimary:true,assetPath:'secret.png'}]}});
 const c=api.createImageCapsule({scenario:sc,turn:turn('가면 손님은 도현 옆에 섰다.')});
 const selected=api.selectImageReferences(c,[{characterId:'masked',ref:'safe.png',dataUrl:'safe'},{characterId:'masked',ref:'secret.png',dataUrl:'secret'}]);
 assert.deepEqual(Array.from(selected,r=>r.dataUrl),['safe']);
 assert.doesNotMatch(api.imageRequestPrompt(c,selected),/숨겨진이름|secret\.png/);
 sc.characters.push(person('another-scholar','미라 카림',['미라']));
 const ambiguous=api.createImageCapsule({scenario:sc,turn:turn('미라는 탁자에 앉았다.')});
 assert.equal(ambiguous.referenceCharacterIds.length,0);
 assert.equal(api.selectImageReferences(ambiguous,rows).length,0);
});

test('v5 intentions rebuild without changing story, annotations or stored generated media',()=>{
 const current={...turn('도현은 미라와 기다렸다.'),imageUrl:'old-generated',imageAssetKey:'existing-key',dialogueAnnotations:[]};
 const input={scenario,turn:current,canonicalRevision:8},before=JSON.stringify(input),c=api.createImageCapsule(input);
 assert.equal(c.referenceSelectionVersion,6);
 assert.equal(api.imageCapsuleCurrent(c,input),true);
 assert.equal(api.imageCapsuleCurrent({...c,referenceSelectionVersion:5},input),false);
 assert.equal(JSON.stringify(input),before);
});
