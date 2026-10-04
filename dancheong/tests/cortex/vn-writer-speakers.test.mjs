import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {writerBindings,applyWriterSpeaker} from '../../public/cortex-vn-writer-speakers.mjs';
import {captureScene} from '../../public/vn-runtime/vn-scene.mjs';
import {createCastDirector} from '../../public/vn-runtime/vn-cast.mjs';
import {pagesForTurn} from '../../public/vn-runtime/vn-core.mjs';
const html=fs.readFileSync('public/cortex.html','utf8');
const script=html.slice(html.indexOf('/* Cortex v1.38.0 — compact rewind'),html.indexOf('\n',html.indexOf('  const api={version:VERSION,undoSchema')))+'\n})();';
// Use exactly the production disclosure/alias rules with synthetic characters.
const context=vm.createContext({structuredClone,console});
vm.runInContext(script,context);
const experience=context.CortexTurnExperience;
function fixture(){return {protagonist:{id:'hero',name:'도윤'},world:{location:'현관',time:'09:00:00'},scene:{presentCharacterIds:[]},runtime:{},characters:[
 {id:'one',name:'강민서',source:{publicInfo:'첫 등장 뒤 공개: 검은 외투를 입은 인물',images:[{isPrimary:true,assetPath:'one.webp'}]}},
 {id:'two',name:'이수아',source:{publicInfo:'첫 등장 뒤 공개: 푸른 외투를 입은 인물',images:[{isPrimary:true,assetPath:'two.webp'}]}}
]};}
const annotation=(text,quote,name,id,extra={})=>({offset:text.indexOf(quote),quoteText:quote,speakerName:name,characterId:id,source:'WRITER_CHARACTER_ALIAS',bindingVersion:2,presence:'PHYSICAL',...extra});
function sceneFor(text,annotations,scenario=fixture()){
 const turn={id:'t',status:'COMMITTED',text,dialogueAnnotations:annotations};
 return {scene:captureScene({scope:'synthetic',scenario,turn,experience,timeline:true}),pages:pagesForTurn(turn,0),scenario,turn};
}
const empty={characters:[],castStatus:'checking',speakerId:'',identityIssue:{speakerName:'여자'}};

test('writer identity paints the correct anonymous speaker before direction returns, with no name disclosure',async()=>{
 const text='여자가 문 앞에서 말했다. “이쪽으로 와요.”',a=annotation(text,'“이쪽으로 와요.”','여자','one');
 const {scene,pages,scenario}=sceneFor(text,[a]),page=pages.at(-1);
 let calls=0,release;
 const response=new Promise(resolve=>{release=resolve});
 const director=createCastDirector({getConnection:()=>({key:'test',model:'test',endpoint:'/fake'}),read:async()=>null,write:async()=>{},onChange(){},onError(){},fetchDecision:()=>{calls++;return response;}});
 const result=await Promise.race([director.prepare(scene,{page}),new Promise((_,reject)=>setTimeout(()=>reject(Error('writer binding waited on director')),150))]);
 assert.equal(result.speakerId,'one');assert.equal(result.speakerName,'여자');assert.deepEqual(result.characters.map(p=>p.id),['one']);
 assert.equal(result.characters[0].primaryAssetRef,'one.webp');assert.equal(result.castStatus,'ready');
 assert.equal(scenario.runtime.writerPublicNames,undefined,'scene capture does not mutate saved canon');
 assert.equal(director.view(scene,pages[0]).speakerId,'','future quote does not identify an earlier page');
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,1,'only the existing optional direction request runs');
 release({ok:false,json:async()=>({})});
 assert.equal(director.view(scene,page).speakerName,'여자','direction failure cannot erase the authored speaker');
});
test('two women with the same public label stay bound to their own exact quotes',()=>{
 const text='“네.”\n\n“네.”',a=[annotation(text,'“네.”','여자','one'),{...annotation(text,'“네.”','여자','two'),offset:6}];
 const {scene,pages}=sceneFor(text,a);
 assert.equal(applyWriterSpeaker(scene,pages[0],empty).speakerId,'one');
 assert.equal(applyWriterSpeaker(scene,pages[1],empty).speakerId,'two');
 assert.equal(applyWriterSpeaker(scene,pages[1],{...empty,speakerId:'one',characters:[scene.candidates[0]]}).characters[0].id,'two');
});
test('remote speech, nonspeech and private identities cannot acquire an on-stage portrait',()=>{
 for(const extra of [{presence:'REMOTE'},{presence:'PHYSICAL'}]){
  const text='전화 너머에서 여자가 말했다. “기다려요.”';
  const {scene,pages}=sceneFor(text,[annotation(text,'“기다려요.”','여자','one',extra)]);
  const view=applyWriterSpeaker(scene,pages.at(-1),empty);assert.equal(view.speakerId,'');assert.equal(view.speakerOffScene,true);assert.equal(view.characters.length,0);
 }
 const text='“기다려요.”',sc=fixture();sc.characters[0].source.secret=true;
 const {scene,pages}=sceneFor(text,[annotation(text,text,'여자','one')],sc);
 assert.equal(scene.candidates.some(p=>p.id==='one'),false);assert.equal(applyWriterSpeaker(scene,pages[0],empty).speakerId,'');
});
test('stale, duplicated, unknown or name-only annotations never infer an identity',()=>{
 const text='“안녕.”',base=annotation(text,text,'여자','one');
 for(const annotations of [[{...base,quoteText:'“다른 말.”'}],[base,base],[{...base,characterId:'unknown'}],[{...base,source:'WRITER_PUBLIC_NAME',characterId:''}]]){
  const {scene,pages}=sceneFor(text,annotations);assert.equal(applyWriterSpeaker(scene,pages[0],empty).speakerId,'');
 }
});
test('published streaming prefix and opaque multiplayer reference reuse the same exact binding',()=>{
 const text='“기다려요.”',sc=fixture(),a=annotation(text,text,'여자','one');
 const remote={...a,characterId:undefined,speakerRef:experience.writerSpeakerRef('one'),source:'WRITER_PUBLIC_NAME'};
 const turn={id:'live',status:'STREAMING',text:'',displayText:text.slice(0,3),dialogueAnnotations:[remote]};
 experience.refreshPublicAppearances(sc,[turn]);
 assert.equal(experience.publicCharacter(sc.characters[0],sc).name,'여자');
 assert.equal(experience.visualDisclosure(sc,sc.characters[0]).referenceMode,'PRIMARY');
 const bindings=writerBindings({...turn,text:turn.displayText},sc,experience);
 assert.equal(bindings.length,1);assert.equal(bindings[0].characterId,'one');assert.equal(bindings[0].quoteText,'“기다');
 assert.doesNotMatch(JSON.stringify(remote),/강민서|one/);
});
test('displayed alias persists after appearance, and a spoken introduction permits a name change',()=>{
 const sc=fixture(),first='“안녕.”',t1={status:'COMMITTED',text:first,dialogueAnnotations:[annotation(first,first,'여자','one')]};
 experience.refreshPublicAppearances(sc,[t1]);sc.runtime.publicAppearanceRefs=['one'];
 assert.equal(experience.publicCharacter(sc.characters[0],sc).name,'여자');
 assert.equal(experience.authorCast(sc).characters[1].lastWrittenName,'여자');
 sc.runtime.publicAppearanceRefs=[];
 assert.equal(experience.validAuthoredSpeakerName(sc,sc.characters[0],'강민서','여자가 고개를 들었다.'),false);
 const intro='“저는 강민서예요.”\n\n“반가워요.”',t2={status:'COMMITTED',text:intro,dialogueAnnotations:[annotation(intro,'“반가워요.”','강민서','one')]};
 experience.refreshPublicAppearances(sc,[t1,t2]);
 assert.equal(experience.publicCharacter(sc.characters[0],sc).name,'강민서');
 const restored=structuredClone(sc);delete restored.runtime.writerPublicNames;
 experience.refreshPublicAppearances(restored,[t1,t2]);assert.equal(experience.publicCharacter(restored.characters[0],restored).name,'강민서');
});
