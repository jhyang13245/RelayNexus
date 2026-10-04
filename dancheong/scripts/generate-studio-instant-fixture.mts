// Optional integration fixture generator. Requires the adjacent Studio checkout.
import { makeProjectForRuntime, blankCharacter } from '../../relay-novel-studio/app/studio-model';
import { exportScenarioPack } from '../../relay-novel-studio/app/studio-export';
import fs from 'node:fs';
const p = makeProjectForRuntime('instant_story');
p.projectId='instant-contract-fixture';p.packageTarget='cortex';p.title='Instant 계약 검증';p.startLocation='작업실';
p.player.id='hero';p.player.name='서준';p.player.gender='남성';p.player.age='18';
const sibling=blankCharacter();sibling.id='sibling';sibling.name='서민';sibling.gender='남성';sibling.age='16';sibling.publicInfo='서준의 남동생이다.';p.npcs=[sibling];
p.opening.openingTime='08:00:00';p.opening.openingLine='서준은 작업실에서 문을 바라봤다.';
p.instantStory.corePrompt='작업실을 배경으로 작은 선택의 인과를 차분하게 묘사한다.';
p.instantStory.startProfiles=[{id:'morning',name:'아침',prologue:p.opening.openingLine,startSituation:'아침 작업실',recommendedReplies:['문을 연다','동생에게 묻는다','기록을 읽는다']},{id:'evening',name:'저녁',prologue:'서준은 어두워진 작업실에서 기다렸다.',startSituation:'저녁 작업실',recommendedReplies:['등을 켠다','창문을 닫는다','기록을 읽는다']}];
p.instantStory.keywordNotes=[{id:'key-note',title:'열쇠',keywords:['열쇠'],priority:10,content:'열쇠는 작업대 위의 파란 상자를 연다.'}];
p.instantStory.statRules=[{id:'trust',label:'신뢰',minimum:0,maximum:10,initial:2,unit:'',increaseWhen:'서로 도와준다',decreaseWhen:'약속을 어긴다',tiers:[{id:'low',minimum:0,maximum:4,prompt:'조심스러운 반응'},{id:'high',minimum:5,maximum:10,prompt:'편안한 반응'}]}];
p.instantStory.endingPolicy={minimumTurn:3,checkInterval:2};
const exported=await exportScenarioPack(p,false);
fs.mkdirSync('tests/fixtures',{recursive:true});
fs.writeFileSync('tests/fixtures/studio-2.2-instant.zip',Buffer.from(await exported.blob.arrayBuffer()));
console.log('Generated synthetic Studio 2.2 Instant package:',exported.blobBytes);
