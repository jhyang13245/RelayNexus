import test from 'node:test';
import assert from 'node:assert/strict';
import {HeadlessCortex,makeModel} from './harness.mjs';

test('scene references follow public writer speakers, aliases and authored primary photos, not stale rosters',async()=>{
 const app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model:makeModel()}).open();try{
  const sc=structuredClone(app.scenario),exp=app.win.CortexTurnExperience;
  const person=(id,name,aliases=[])=>({id,name,aliases,source:{images:[{assetPath:id+'/alternate.png'},{assetPath:id+'/primary.png',isPrimary:true}]}});
  sc.characters=[person('nadia','나디아 알 하다드',['나디아']),person('mira','미라 바렌',['미라']),person('rin','서린',[]),{id:'secret',name:'금발의 외국인 수집가',secret:true}];
  sc.scene.presentCharacterIds=[sc.protagonist.id];
  const text='나디아는 미라, 서린과 마주 섰다. 금발 여자가 멀리 지나갔다.\n\n“어서 와요.”';
  const turn={id:'multi',status:'COMMITTED',text,dialogueAnnotations:[{bindingVersion:2,speakerName:'나디아',characterId:'nadia',offset:text.indexOf('“'),quoteText:'“어서 와요.”'}]};
  const capsule=exp.createImageCapsule({scenario:sc,turn});
  assert.deepEqual(Array.from(capsule.characterIds),['nadia','mira','rin']);
  assert.equal(capsule.referenceSelectionVersion,6);
  const rows=sc.characters.slice(0,3).flatMap(p=>[{characterId:p.id,ref:p.id+'/alternate.png',dataUrl:'alternate:'+p.id},{characterId:p.id,ref:p.id+'/primary.png',dataUrl:'primary:'+p.id}]);
  const selected=exp.selectImageReferences(capsule,rows);
  assert.deepEqual(Array.from(selected,x=>x.dataUrl),['primary:nadia','primary:mira','primary:rin']);
  assert.deepEqual(Array.from(selected,x=>x.publicName),['나디아 알 하다드','미라 바렌','서린']);
  assert.throws(()=>exp.selectImageReferences(capsule,rows.filter(x=>x.ref!=='nadia/primary.png')),/기준 사진/);
  const quoteOnly={...turn,text:'“어서 와요.”',dialogueAnnotations:[{...turn.dialogueAnnotations[0],offset:0}]};
  assert.deepEqual(Array.from(exp.createImageCapsule({scenario:sc,turn:quoteOnly}).characterIds),['nadia']);
  quoteOnly.dialogueAnnotations[0].characterId='secret';
  assert.equal(exp.createImageCapsule({scenario:sc,turn:quoteOnly}).characterIds.length,0);
  const mentioned={...turn,text:'“나디아가 편지를 보냈대.”',dialogueAnnotations:[]};
  assert.equal(exp.createImageCapsule({scenario:sc,turn:mentioned}).characterIds.length,0);
  sc.characters.push(person('other-nadia','나디아 카림',['나디아']));
  assert.equal(exp.createImageCapsule({scenario:sc,turn:{...turn,text:'나디아는 걸었다.',dialogueAnnotations:[]}}).characterIds.length,0);
  const masked={id:'masked',name:'비밀 정체',secret:true,preRevealAlias:'가면 손님',preRevealImage:'masked/safe.png',source:{images:[{isPrimary:true,assetPath:'masked/secret.png'}]}};
  sc.characters.push(masked);
  const maskedCapsule=exp.createImageCapsule({scenario:sc,turn:{id:'mask',status:'COMMITTED',text:'가면 손님이 문을 열었다.'}});
  assert.deepEqual(Array.from(exp.selectImageReferences(maskedCapsule,[{characterId:'masked',ref:'masked/secret.png',dataUrl:'secret'},{characterId:'masked',ref:'masked/safe.png',dataUrl:'safe'}]),r=>r.dataUrl),['safe']);
  assert.doesNotMatch(maskedCapsule.prompt,/비밀 정체/);
 }finally{app.close()}
});
