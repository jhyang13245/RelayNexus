import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {validatePerformance,performanceSchema,cuePlan,poseAssetKey,stageBlocking,createStageBlocking,lightingGrade} from '../../public/cortex-vn-performance.mjs';
import {createCuePlayer,createPortraitContinuity} from '../../public/cortex-vn-cue-player.mjs';
import {typeset,renderTypeset} from '../../public/vn-runtime/vn-typeset.mjs';
import {compactCastRequest,expandCastDecision} from '../../public/cortex-vn-cast-wire.mjs';
import {castRequest} from '../../vendor/visual-novel/public/vn-cast.mjs';
import {createStageAssets} from '../../public/vn-runtime/vn-assets.mjs';
const person={id:'a',name:'검사',aliases:[]}, source='검사는 의자에 앉았다. 검사는 몇 걸음 뒤에서 지켜봤다.';
const performance={actors:[{candidate:'C0',pose:'seated',facing:'left',depth:'far',evidence:'검사는 의자에 앉았다.'}],framing:{kind:'reverse',evidence:'검사는 의자에 앉았다.'},lighting:{kind:'backlit',evidence:'없는 근거입니다'},delivery:{kind:'reassure',evidence:'검사는 의자에 앉았다.'},cues:[{anchor:'문틀을 후려쳤다.',kind:'impact',sound:'paper',when:'text'}],pauseMs:500};
test('performance cannot introduce a person, future proof, or ungrounded lighting',()=>{
 const result=validatePerformance(performance,[person],new Set([0]),source,source+' 종이가 문틀을 후려쳤다.');
 assert.equal(result.actors[0].id,'a');assert.equal(result.lighting,'ambient');
 assert.equal(validatePerformance(performance,[person],new Set(),source,source).actors.length,0);
 assert.equal(validatePerformance(performance,[person],new Set([0]),'검사가 말했다.','검사가 말했다.').actors.length,0);
});
test('mentions and dialogue do not make foley or implicit depth',()=>{
 const data={...performance,actors:[{...performance.actors[0],evidence:'검사는 의자에 앉았다.'}],cues:[{anchor:'문틀을 후려쳤다.',kind:'impact',sound:'paper',when:'text'}]};
 const result=validatePerformance(data,[person],new Set([0]),source,'“문틀을 후려쳤다.”');
 assert.equal(result.cues.length,0);assert.equal(result.actors[0].depth,'same');
});
test('new directing field goes through existing compact request without an extra call',()=>{
 const request=castRequest({scope:'test',candidates:[person],publicText:source},'gpt-6-luna');
 request.text.format.schema.properties.beats.items.properties.performance=performanceSchema;
 const compact=compactCastRequest(request);
 assert.ok(compact.text.format.schema.properties.beats.items.properties.cues.items.anyOf.some(c=>c.properties.field.enum[0]==='performance'));
 const expanded=expandCastDecision({format:'cast-compact-1',proofs:[source],bindings:[],beats:[{beat:'P0',speaker:'',speakerLabel:'',speakerEvidence:-1,onStage:[],cues:[{field:'performance',value:{actors:[],framing:{kind:'hold',evidence:0}}}]}]});
 assert.equal(expanded.beats[0].performance.framing.evidence,source);
});
test('anchored cue waits for its complete phrase, survives repaint and fires once',()=>{
 const fired=[];const player=createCuePlayer({fire:c=>fired.push(c)});
 const text='종이가 문틀을 후려쳤다.',direction={performance:{cues:performance.cues}};
 player.update({key:'a',text,direction,fresh:true,enabled:true});player.progress(3);assert.equal(fired.length,0);
 player.update({key:'a',text,direction,fresh:true,enabled:true});player.progress(text.length);
 player.progress(text.length);assert.equal(fired.length,1);
});
test('late cue cannot replay a passed phrase and a new page cancels old hold',()=>{
 const fired=[];let pending,cleared=0;
 const p=createCuePlayer({fire:c=>fired.push(c),setTimer:f=>(pending=f,1),clearTimer:()=>cleared++,now:()=>10});
 const text='종이가 문틀을 후려쳤다.';
 p.update({key:'a',text,direction:{},enabled:true,fresh:true});p.progress(text.length);
 p.update({key:'a',text,direction:{performance},enabled:true,fresh:true});p.progress(text.length);assert.equal(fired.length,0);
 p.update({key:'b',text,direction:{performance},enabled:true,fresh:true});p.progress(text.length);assert.ok(p.blocked);
 p.update({key:'c',text,direction:{},enabled:true,fresh:true});assert.equal(p.blocked,false);assert.ok(cleared>0);
});
test('voice-end uses voice completion in solo and room glyph clock in multiplayer',()=>{
 for(const multiplayer of [false,true]){
  const hits=[];const p=createCuePlayer({fire:c=>hits.push(c)});
  const d={performance:{cues:[{anchor:'끝.',kind:'cutin',sound:'none',when:'voice-end'}],pauseMs:500}};
  p.update({key:'a',text:'끝.',direction:d,enabled:true,fresh:true,multiplayer});p.progress(2,{voicePhase:'playing'});
  assert.equal(hits.length,multiplayer?1:0);p.progress(2,{voicePhase:'done'});assert.equal(hits.length,1);
  if(multiplayer)assert.equal(p.blocked,false);p.reset();
 }
});
test('fast forward suppresses effect bursts and disabled effects do not block',()=>{
 const hits=[];const p=createCuePlayer({fire:c=>hits.push(c)});
 p.update({key:'a',text:'문틀을 후려쳤다.',direction:{performance},enabled:true,fresh:true});p.progress(10,{jump:true});assert.equal(hits.length,0);assert.equal(p.blocked,false);
});
test('emphasis takes precedence and never loses its text',()=>{
 const text='그 순간 모든 소리가 멎었다.';
 const p=cuePlan({emphasis:{text},performance},text);assert.equal(p.length,1);assert.equal(p[0].kind,'emphasis');
 const layout=typeset(text,text);assert.equal(layout.visible,text);
 const dom=new JSDOM('<p></p>');renderTypeset(dom.window.document.querySelector('p'),layout,4);
 assert.equal(dom.window.document.querySelector('.vn-dramatic-line').textContent,text.slice(0,4));dom.window.close();
});
test('pose cache separates outfits and people while reusing identical directions',()=>{
 const actor={pose:'guard',facing:'left'};
 assert.equal(poseAssetKey('a:uniform',actor),poseAssetKey('a:uniform',{...actor,evidence:'different sentence'}));
 assert.notEqual(poseAssetKey('a:uniform',actor),poseAssetKey('b:uniform',actor));
 assert.notEqual(poseAssetKey('a:uniform',actor),poseAssetKey('a:swimwear',actor));
 assert.equal(poseAssetKey('a',{pose:'standing',facing:'front'}),'');
});
test('same-plane characters preserve height scale and unknown depth cannot enlarge them',()=>{
 const result=stageBlocking([{id:'b',depth:'far'}],['a','b'],[.5,.78],'b','reverse');
 assert.equal(result[0].depth,1);assert.equal(result[1].depth,.94);assert.ok(result.every(r=>r.x>=.15&&r.x<=.93));
 assert.ok(lightingGrade('night','rain').brightness<=1);
});
test('late expression/pose holds until next page; a new speaker can still appear',()=>{
 const c=createPortraitContinuity(),a={id:'a',url:'old',baseKey:'a'};
 c.select({portraits:[a]},{pageKey:'1',open:true});
 let view=c.select({portraits:[{...a,url:'new'},{id:'b',url:'first',baseKey:'b'}]},{pageKey:'1'});
 assert.deepEqual(view.portraits.map(p=>p.url),['old','first']);
 view=c.select({portraits:[{...a,url:'new'}]},{pageKey:'2'});assert.equal(view.portraits[0].url,'new');
});
test('a first completed portrait is never frozen as an empty placeholder',()=>{
 const c=createPortraitContinuity();c.select({portraits:[{id:'a',url:'',baseKey:'a'}]},{pageKey:'1'});
 assert.equal(c.select({portraits:[{id:'a',url:'ready',baseKey:'a'}]},{pageKey:'1'}).portraits[0].url,'ready');
});
test('unsupported and ended poses cannot be carried into continuing dialogue',()=>{
 const data={...performance,actors:[{...performance.actors[0],evidence:'검사는 몇 걸음 뒤에서 지켜봤다.'}]};
 assert.equal(validatePerformance(data,[person],new Set([0]),source,source).actors.length,0);
 assert.equal(validatePerformance(performance,[person],new Set([0]),source+' 검사는 일어섰다.',source).actors.length,0);
});
test('two-shot and establishing framing change spacing without changing physical stature',()=>{
 const two=stageBlocking([],['a','b'],[.5,.8],'a','two-shot');
 const wide=stageBlocking([],['a','b'],[.5,.8],'a','establish');
 assert.ok(two[1].x-two[0].x<.3);assert.ok(wide[1].x-wide[0].x>.3);
 assert.ok([...two,...wide].every(row=>row.depth===1));
});
test('pose art uses the portrait provider, same-person reference, shared turn and cache',async()=>{
 const requests=[],shared=[],stored=new Map(),errors=[];
 const actor={id:'qa-one',name:'검사',publicProfile:'성인 여성 162cm'};
 const scene={scope:'pose-test',environmentKey:'pose-room',mediaTurn:'turn-7',world:{location:'방',time:'12:00'},publicText:'검사는 몸을 기울였다.',castStatus:'ready',characters:[actor],candidates:[actor],direction:{performance:{actors:[{id:actor.id,pose:'lean',facing:'front',evidence:'검사는 몸을 기울였다.'}]}}};
 const original=globalThis.NexusVNSharedAssets;
 globalThis.NexusVNSharedAssets={isShared:()=>false,record:async(type,key,produce,options)=>{shared.push({type,key,options});return produce()},started(){},response(){}};
 try{
  const assets=createStageAssets({getKey:purpose=>{assert.ok(['background','portrait'].includes(purpose));return 'synthetic-key'},getQuality:()=> 'low',getShotsEnabled:()=>true,getCGEnabled:()=>false,getReferences:()=>[],read:async key=>stored.get(key),write:async row=>stored.set(row.key,row),onError:e=>errors.push(e),onChange(){},fetchImage:async(url,init)=>{requests.push(JSON.parse(init.body));return Response.json({imageUrl:'data:image/png;base64,c3ludGhldGlj'})}});
  const page={start:0,text:scene.publicText};await assets.prepare(scene,page);
  const pose=requests.find(row=>row.purpose==='expression'&&row.prompt.includes('leaning forward'));
  assert.ok(pose,errors.join(';'));assert.equal(pose.referenceImages.length,1);
  assert.equal(shared.find(row=>row.key.includes('vn-actor-pose-1'))?.options.turn,'turn-7');
  assert.equal(assets.view(scene,page).portraits[0].pose,'lean');
  const count=requests.length;await assets.prepare(scene,page);assert.equal(requests.length,count);
 }finally{if(original===undefined)delete globalThis.NexusVNSharedAssets;else globalThis.NexusVNSharedAssets=original;}
});

test('camera holds the established reverse shot through dialogue and resets at a new location',()=>{
 const camera=createStageBlocking(), input={sceneKey:'hall',actors:[],ids:['a','b'],positions:[.5,.8],focusId:'a'};
 const initial=camera.place({...input,requested:'reverse'});
 assert.deepEqual(camera.place({...input,requested:'hold',focusId:'b'}),initial);
 assert.deepEqual(camera.place({...input,sceneKey:'room',requested:'hold'}),stageBlocking([],input.ids,input.positions));
 camera.reset();assert.deepEqual(camera.place(input),stageBlocking([],input.ids,input.positions));
});
