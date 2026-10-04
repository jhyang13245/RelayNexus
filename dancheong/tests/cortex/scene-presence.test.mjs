import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('vendor/cortex/parts/04.part','utf8'),context={structuredClone};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('/* Cortex v1.38.0'),source.lastIndexOf('</script>')),context);
const api=context.CortexTurnExperience;
const scenario={protagonist:{id:'hero',name:'도현'},characters:[{id:'other',name:'민아',source:{images:[{isPrimary:true,assetPath:'mina.png'}]}}],runtime:{storyId:'synthetic-presence'}};
const make=(text,extra={})=>api.createImageCapsule({scenario,turn:{id:'scene',status:'COMMITTED',text,...extra}});
const ids=text=>Array.from(make(text).referenceCharacterIds);

test('another room mention never lends its embedded face to an unregistered current speaker',()=>{
 const text='도현은 침실에서 유진 옆에 앉았다. 유진은 손을 잡았다.\n\n문밖에서는 책장이 넘어갔다. 민아가 여전히 거실에서 공부하고 있다는 사실이, 방 안의 고요를 깨웠다. 유진은 웃었다. “반가워.” 거실의 시계가 한 번 울렸다.';
 const dialogueAnnotations=[{bindingVersion:2,speakerName:'유진',quoteText:'“반가워.”',offset:text.indexOf('“')}];
 const capsule=make(text,{dialogueAnnotations});
 assert.deepEqual(Array.from(capsule.referenceCharacterIds),['hero']);
 assert.deepEqual(Array.from(capsule.excludedReferenceNames),['민아']);
 assert.match(capsule.prompt,/화면 밖에 있는 인물: 민아/);
 assert.match(capsule.prompt,/유진은 웃었다/);
 assert.match(capsule.prompt,/얼굴·머리·복장으로 대신 사용하지 않는다/);
 assert.deepEqual(Array.from(api.selectImageReferences(capsule,[{characterId:'other',ref:'mina.png',dataUrl:'wrong-face'}])),[]);
 assert.equal(dialogueAnnotations[0].speakerName,'유진');
});

test('references retain real co-presence, silent people and arrivals without requiring dialogue',()=>{
 for(const text of [
  '도현은 민아와 거실에서 책을 읽었다.',
  '민아는 거실에서 여전히 공부하고 있었다. 도현은 거실의 탁자에서 기다렸다.',
  '민아는 거실에 남아 책을 읽었다. 도현은 가방의 손잡이를 내려놓았다.',
  '민아는 거실에 남아 책을 읽었다. 도현은 침실의 문을 닫고 거실로 돌아왔다.',
  '민아는 말없이 침실에서 도현 옆에 앉았다.',
  '민아는 문밖을 보았다. 도현은 고개를 들었다.',
  '문밖에서 민아가 들어왔다. 도현은 손을 흔들었다.',
  '민아는 다른 방에서 돌아와 도현 옆에 앉았다.',
  '민아는 거실에 남아 책을 읽었다. 도현은 침실에서 기다렸다. 민아가 방으로 들어왔다.',
  '민아의 편지를 읽었다. 민아는 도현 옆에 앉아 웃었다.',
 ])assert.deepEqual(ids(text),['hero','other'],text);
});

test('departed, explicitly separated and indirectly mentioned people are excluded',()=>{
 for(const text of [
  '민아는 거실에 남아 책을 읽었다. 도현은 침실에서 유진과 대화했다.',
  '도현은 유진과 탁자에 앉았다. 민아는 옆방에서 책을 읽었다.',
  '민아는 도현 옆에 앉아 있었다. 민아는 자리를 떠났다. 도현은 혼자 남았다.',
  '도현은 민아의 편지를 펼쳤다.',
  '도현은 전화를 받았다. 민아는 전화 너머에서 대답했다.',
  '도현은 민아를 떠올렸다.',
 ]){const c=make(text);assert.deepEqual(Array.from(c.referenceCharacterIds),['hero'],text);assert.ok(c.excludedReferenceNames.includes('민아'),text)}
});

test('an offscreen quote annotation does not override narrative absence; scene evidence stays local',()=>{
 const text='도현은 침실에서 기다렸다. 민아는 옆방에서 외쳤다. “잠깐만.”';
 const c=make(text,{dialogueAnnotations:[{bindingVersion:2,speakerName:'민아',characterId:'other',offset:text.indexOf('“'),quoteText:'“잠깐만.”'}]});
 assert.deepEqual(Array.from(c.referenceCharacterIds),['hero']);
 const moved='민아는 도현과 정원에 있었다.\n\n유진이 침실에서 문을 열었다.\n\n유진은 침실의 의자에 앉았다.';
 assert.equal(make(moved).referenceCharacterIds.length,0,'earlier cast must not carry into another final scene');
});

test('version-4 image intentions are invalidated without changing saved images or prose',()=>{
 const turn={id:'scene',status:'COMMITTED',text:'도현은 민아와 만났다.',imageUrl:'preserved-old-image'},input={scenario,turn,canonicalRevision:3};
 const before=JSON.stringify(input),current=api.createImageCapsule(input);
 assert.equal(api.imageCapsuleCurrent(current,input),true);
 assert.equal(api.imageCapsuleCurrent({...current,referenceSelectionVersion:4},input),false);
 assert.equal(JSON.stringify(input),before);
});
