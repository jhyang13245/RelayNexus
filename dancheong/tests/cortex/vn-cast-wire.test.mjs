import test from 'node:test';
import assert from 'node:assert/strict';
import {compactCastRequest,expandCastDecision} from '../../public/cortex-vn-cast-wire.mjs';
import {castRequest as originalRequest,validateCast} from '../../vendor/visual-novel/public/vn-cast.mjs';
import {castRequest,createCastDirector,castKey} from '../../public/vn-runtime/vn-cast.mjs';

const people=[{id:'harin',name:'하린',referenceMode:'PRIMARY',publicProfile:'동행인',hiddenInfo:'PRIVATE'},
  {id:'doyun',name:'도윤',referenceMode:'PRIMARY',publicProfile:'친구'}];
const proof='하린과 도윤은 나란히 문 앞에 섰다.';
const scene={scope:'wire-fixture',candidates:people,previousText:proof,
  publicText:'하린이 말했다. “여기야.” 도윤이 고개를 끄덕였다.',
  castPages:[{start:0,text:'하린이 말했다.'},{start:9,text:'“여기야.”',quoted:true},{start:16,text:'도윤이 고개를 끄덕였다.'}]};
function wire(){return {format:'cast-compact-1',proofs:[proof,'하린이 말했다.'],
  bindings:people.map((_,i)=>({candidate:`C${i}`,evidence:0,identityEvidence:0,identityStatus:'confirmed',presence:'physical'})),
  beats:scene.castPages.map((p,i)=>({beat:`P${p.start}`,speaker:i===1?'C0':'',speakerLabel:i===1?'하린':'',speakerEvidence:i===1?1:-1,onStage:[0,1],cues:[]}))};}

test('compact request retains every public input and all original semantic instructions, without changing models or effort',()=>{
  for(const model of ['gpt-5.6-luna','muse-spark-1.3-contributor']){
    const old=originalRequest(scene,model),request=castRequest(scene,model);
    assert.deepEqual(JSON.parse(request.input),JSON.parse(old.input));
    assert.ok(request.input.startsWith('{"references":'),'stable public roster leads the cacheable input prefix');
    assert.equal(request.model,model);assert.deepEqual(request.reasoning,old.reasoning);
    assert.equal(request.stream,false);assert.equal(request.max_output_tokens,old.max_output_tokens);
    // The only intended wording change is the added battle music cue.
    assert.ok(request.instructions.replace('|tense|battle|','|tense|').startsWith(old.instructions.split('Return ONLY JSON with this shape:')[0]));
    assert.doesNotMatch(request.input,/PRIVATE/);
    if(model.startsWith('muse'))assert.equal(request.text,undefined);
    else {
      assert.equal(request.text.format.strict,true);
      const cues=request.text.format.schema.properties.beats.items.properties.cues.items.anyOf;
      for(const name of ['eventEvidence','shotEvidence'])assert.equal(cues.find(cue=>cue.properties.field.enum[0]===name).properties.value.type,'integer');
      const visit=s=>{if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));Object.values(s.properties).forEach(visit);}if(s.items)visit(s.items);s.anyOf?.forEach(visit);};
      visit(request.text.format.schema);
    }
  }
});

test('shared exact proofs and cast rows preserve dialogue timing, presence and all directing cues',()=>{
  const data=wire();data.beats[1].cues=[{field:'shot',value:'close'},{field:'expressions',value:[{candidate:'C0',expression:'serious',evidence:1}]}];
  const result=expandCastDecision(data),beats=validateCast(scene,result);
  assert.deepEqual(beats.map(b=>b.characters.map(p=>p.id)),[['harin','doyun'],['harin','doyun'],['harin','doyun']]);
  assert.equal(beats[1].speakerId,'harin');assert.equal(beats[1].direction.shot,'close');
  assert.equal(beats[1].direction.expressions.harin,'serious');assert.equal(beats[2].direction.shot,'medium','omission does not inherit a closeup');
  const {onStage,...one}=result.beats[0];assert.deepEqual(onStage,result.beats[1].onStage);
  onStage[0].evidence='changed';assert.equal(result.beats[1].onStage[0].evidence,proof,'expanded rows do not alias each other');
});

test('future, remote, uncertain and unrelated identity evidence remain withheld after decompression',()=>{
  const future=wire();future.proofs[0]='도윤이 고개를 끄덕였다.';
  const earlier=validateCast(scene,expandCastDecision(future));assert.deepEqual(earlier[0].characters,[]);
  for(const change of [row=>row.presence='remote',row=>row.identityStatus='uncertain']){
    const data=wire();data.beats.forEach(beat=>{beat.speaker='';beat.speakerLabel='';});change(data.bindings[0]);
    assert.ok(validateCast(scene,expandCastDecision(data)).every(beat=>!beat.characters.some(person=>person.id==='harin')));
  }
  const sc={...scene,candidates:[{id:'relative',name:'할머니',referenceMode:'PRIMARY'}],previousText:'할머니는 오래전 실종되었다.',publicText:'교수가 교실 앞에 섰다.',castPages:[{start:0,text:'교수가 교실 앞에 섰다.'}]};
  const wrong={...wire(),proofs:[sc.publicText,sc.previousText],bindings:[{candidate:'C0',evidence:0,identityEvidence:1,identityStatus:'confirmed',presence:'physical'}],beats:[{beat:'P0',speaker:'C0',speakerLabel:'교수',speakerEvidence:0,onStage:[0],cues:[]}]};
  const beat=validateCast(sc,expandCastDecision(wrong))[0];assert.deepEqual(beat.characters,[]);assert.equal(beat.speakerName,'교수');assert.equal(beat.speakerId,'');
});

test('bad indexes, duplicate cues and cast-field overrides cannot weaken validation',()=>{
  for(const mutate of [
    d=>d.beats[0].onStage=[99],d=>d.bindings[0].evidence=99,d=>d.bindings[0].identityEvidence='verbatim',
    d=>d.beats[0].cues=[{field:'onStage',value:[]}],
    d=>d.beats[0].cues=[{field:'mood',value:'sad'},{field:'mood',value:'normal'}],
    d=>d.beats[0].cues=[{field:'eventEvidence',value:99}],
  ]){const data=wire();mutate(data);assert.throws(()=>expandCastDecision(data));}
  const forged=wire();forged.proofs[0]='하린과 도윤이 등장했다는 가짜 근거.';
  assert.throws(()=>validateCast(scene,expandCastDecision(forged)));
});

test('event and wardrobe proof references round trip through the original semantic validators',()=>{
  const text='하린은 푸른 원피스 수영복을 입고 바다에서 헤엄쳤다. 하린이 막대기를 휘둘러 종이 다발을 두 동강 냈다.';
  const sc={...scene,publicText:text,castPages:[{start:0,text}]},data=wire();data.beats=data.beats.slice(0,1);data.proofs.push(text);
  const cues={wardrobe:[{candidate:'C0',kind:'swimwear',detail:'푸른 원피스 수영복',evidence:2}],cg:true,eventEvidence:2,eventFocus:'막대기가 종이 다발을 두 동강 내는 순간',eventParticipants:['C0'],eventCastComplete:true,artShot:'none',shotEvidence:2,music:{cue:'silence',evidence:2}};
  data.beats[0].cues=Object.entries(cues).map(([field,value])=>({field,value}));
  const expanded=expandCastDecision(data);
  assert.equal(expanded.beats[0].shotEvidence,text);assert.equal(expanded.beats[0].wardrobe[0].evidence,text);
  const result=validateCast(sc,expanded)[0];assert.equal(result.direction.cg,true);assert.deepEqual(result.direction.event.characterIds,['harin']);assert.equal(result.characters[0].wardrobe.kind,'swimwear');
});

test('repeated ordinary beats use substantially less output without deleting evidence',t=>{
  const data=wire();data.beats=Array.from({length:8},(_,i)=>({...structuredClone(data.beats[i%3]),beat:`P${i}`}));
  const expanded=expandCastDecision(data),full=Buffer.byteLength(JSON.stringify(expanded)),compact=Buffer.byteLength(JSON.stringify(data));
  assert.ok(compact/full<.5,`compact ${compact}, full ${full}`);
  t.diagnostic(`Synthetic eight-beat response: ${full} → ${compact} bytes (${Math.round((1-compact/full)*100)}% less); not a live latency measurement.`);
});

test('validated cast releases preparation before slow cache writes; duplicate requests and saved decisions reuse results',async()=>{
  let release,writeStarted=false,calls=0;const wait=new Promise(r=>release=r),records=new Map();
  const options={getConnection:()=>({key:'synthetic',model:'gpt-5.6-luna',endpoint:'/fixture'}),read:async key=>records.get(key),
    write:async row=>{writeStarted=true;await wait;records.set(row.key,row);},fetchDecision:async()=>{calls++;return Response.json({output_text:JSON.stringify(wire())});}};
  const director=createCastDirector(options);
  try{
    const views=await Promise.race([Promise.all([director.prepare(scene),director.prepare(scene,{page:scene.castPages[1]})]),new Promise((_,reject)=>setTimeout(()=>reject(Error('cache write blocked readiness')),500))]);
    assert.equal(writeStarted,true);assert.equal(views[1].speakerId,'harin');assert.equal(calls,1);
    release();await new Promise(r=>setImmediate(r));
    assert.equal(records.get(castKey(scene)).decision.beats[1].onStage[0].evidence,proof);
    const cached=await createCastDirector(options).prepare(scene,{page:scene.castPages[1]});assert.equal(cached.speakerId,'harin');assert.equal(calls,1);
  }finally{release();}
});
