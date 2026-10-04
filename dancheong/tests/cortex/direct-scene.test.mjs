import test from 'node:test';
import assert from 'node:assert/strict';
import {HeadlessCortex,makeModel} from './harness.mjs';

test('direct scene excludes indirect photo candidates without extra author work',async()=>{
 const app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model:makeModel()}).open();
 try{
  const sc=structuredClone(app.scenario),exp=app.win.CortexTurnExperience;
  sc.characters=[{id:'a',name:'민서'},{id:'b',name:'정희'}];
  sc.tone='FUTURE_PLOT_NOT_VISUAL_STYLE';
  const capsule=text=>exp.createImageCapsule({scenario:sc,turn:{id:'scene',status:'COMMITTED',text}});
  const c=capsule('민서는 수아와 탁자 앞에 앉았다. 글씨는 정희가 평소 장보기 목록에 쓰던 것과 같았다. 정희의 메모는 배달 일정을 가리켰다.');
  assert.deepEqual(Array.from(c.characterIds),['a']);
  assert.match(c.prompt,/수아/);
  assert.match(c.prompt,/출연 명단이 아니다/);
  assert.doesNotMatch(c.prompt,/FUTURE_PLOT_NOT_VISUAL_STYLE/);
  assert.deepEqual(Array.from(capsule('정희의 편지를 펼쳤다. 정희는 민서 옆에 앉아 종이를 건넸다.').characterIds),['a','b']);
  assert.equal(capsule('정희는 전화 너머에서 대답했다.').characterIds.length,0);
  assert.equal(capsule('“정희가 메모를 보냈어.”').characterIds.length,0);
 }finally{app.close()}
});

test('direct scene generation makes only the image call and preserves approved prose',async()=>{
 const calls=[];
 const model=makeModel({beforeRespond(entry){calls.push(entry);return {ok:true,status:200,json:async()=>({data:[{b64_json:'aW1hZ2U='}]})}}});
 const app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',model}).open();
 try{
  const prose='빈 탁자 위에 편지가 놓여 있었다.';
  app.api.applyImportedState({scenario:structuredClone(app.scenario),turns:[{id:'one-call',status:'COMMITTED',text:prose}]},{persistState:false});
  app.api._setSettings({apiKey:'test-only-key'});
  await app.settle(100);
  await app.api._generateTurnImage(0);
  await app.settle(100);
  assert.equal(calls.length,1);
  assert.equal(calls[0].kind,'image');
  assert.equal(app.turns[0].imageStatus,'GENERATED');
  assert.equal(app.turns[0].text,prose);
 }finally{app.close()}
});
