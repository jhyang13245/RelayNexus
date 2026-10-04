import {makeProjectForPackageTarget,blankStoryEvent,normalizeProject,validateProject,type Project} from './studio-model';
import {canonDesign,emptyCanonEvent} from './canon-design';
import {eventDesign} from './cortex-event-design';

type Mode='intelligent_canon'|'instant_story';
type Schema={type:string;properties?:Record<string,Schema>;required?:string[];additionalProperties?:boolean;items?:Schema;enum?:unknown[];minItems?:number;maxItems?:number};
const str:Schema={type:'string'},num:Schema={type:'number'},bool:Schema={type:'boolean'};
const obj=(properties:Record<string,Schema>):Schema=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const arr=(items:Schema,maxItems:number,minItems=0):Schema=>({type:'array',items,maxItems,minItems});
const choice=(...values:string[]):Schema=>({type:'string',enum:values});
const character=obj({id:str,name:str,publicInfo:str,appearance:str,hiddenInfo:str});
const stat=obj({id:str,label:str,characterId:str,initial:num,minimum:num,maximum:num,unit:str,visible:bool,mode:choice('event','resource'),increaseWhen:str,decreaseWhen:str});
const example=obj({id:str,userInput:str,narration:str,recommendations:arr(str,3,3)});
const keyword=obj({id:str,title:str,keywords:arr(str,5,1),priority:num,content:str});
const event=obj({id:str,name:str,description:str,required:bool,otherViewpoint:bool,viewpoint:str,occurrenceEnabled:bool,occurrence:str,closureConditions:arr(obj({id:str,text:str}),6,1),constraints:str,unmet:str,nextEventId:str,branches:arr(obj({id:str,kind:choice('story','stat'),criterion:str,statId:str,threshold:num,comparison:choice('gte','lt'),nextEventId:str}),4),fallbackEventId:str,effects:arr(obj({id:str,criterion:str,statId:str,amount:num}),7)});
export function jieumDraftSchema(mode:Mode):Schema {
  return obj({title:str,genre:str,startDate:str,startLocation:str,world:str,privateWorld:str,fixedRules:str,reference:str,player:character,npcs:arr(character,12),factions:arr(obj({id:str,name:str,publicInfo:str,hiddenInfo:str}),5),opening:obj({prologue:str,situation:str,time:str,replies:arr(str,3,3)}),viewpoint:choice('3인칭 제한 시점','1인칭 주인공 시점','3인칭 관찰자 시점','전지적 작가 시점'),proseStyle:choice('작품에 맞게','현실주의 소설','문학적 소설','장르소설','비주얼 노벨','라이트 노벨'),extraStyle:str,stats:arr(stat,7),...(mode==='intelligent_canon'?{routes:arr(obj({id:str,name:str,authorComment:str,events:arr(event,12,1)}),4,1)}:{examples:arr(example,3),keywords:arr(keyword,20)})});
}
export function jieumDraftInstruction(mode:Mode){return `당신은 단청 지음의 작품 초안 작가다. 사용자의 구상을 한국어로 바로 편집할 수 있는 작품으로 만든다.
사용자가 지정한 이름·인원수·설정·전개는 보존한다. 빈 정보는 구상과 충돌하지 않게 보완하며 추가 질문이나 '미정' 남발을 하지 않는다. 주인공의 선택과 대사를 대신 확정하지 않는다.
세계관은 world 자유문 하나로 모으고 privateWorld에 숨은 진실과 공개 조건을 작성한다. 정치·종교 등의 별도 항목이나 엔진 기술 설정은 만들지 않는다.
캐릭터는 이름, publicInfo에 성격·말투·능력·목표·관계를 함께 쓰고 appearance에 외형, hiddenInfo에 비공개 동기와 공개 조건을 분리한다. 요청하지 않은 나이·성별·출신·직업을 억지로 채울 필요 없다. 인물 수는 요청 우선이며 없으면 장면 규모에 맞게 2~5명의 핵심 인물을 만든다.
opening.prologue는 공개 가능한 첫 장면 산문 2~4문단, situation은 시작 직전 상태다. time은 HH:mm:ss, startDate는 YYYY-MM-DD이다. replies는 작은 파동·중간 파동·큰 파동 순서의 서로 다른 행동 3개다. 비밀의 정답이나 플레이어가 모르는 정보를 누설하지 않는다.
서술 시점과 문장 스타일은 구상에 어울리게 선택한다. 비주얼 노벨은 짧은 지문과 대화, 라이트 노벨은 경쾌한 서술과 인물 반응에 중점을 둔다. 어떤 시점도 비공개 설정을 자동 공개하지 않는다.
수치는 요청되거나 분기에 꼭 필요할 때만 최대 7개. 이름과 실제 characterId, 시작값·최소·최대, 단위를 지정한다. event는 조건마다 사건당 한 번 고정 증감하는 점수, resource는 본문의 실제 사용·획득 수량이다. visible은 독자 표시 여부다. 불필요한 HUD·관계 표를 생성하지 않는다.
${mode==='intelligent_canon'?`routes에 기본 한 루트, 4~7개의 순차 사건을 만든다. 사용자가 후속 루트를 요청한 경우만 추가하고 바로 앞 엔딩 감상 후 해금된다. 각 루트의 마지막 사건이 자동으로 엔딩이 된다. authorComment는 다음 루트 시작 전 독자가 읽을 안내이며 스포일러를 넣지 않는다.
사건은 description과 공개된 본문으로 판정할 구체적인 closureConditions를 중심으로 쓴다. 필수사건·다른 인물 시점·발생조건은 필요에 따라 지정한다. 사건시계·시간루프·키워드·자율세계엔진·3비트 표는 만들지 않는다.
branches는 요청된 분기만. story는 같은 사건에서 드러난 행동으로 판단할 criterion, stat은 같은 작품에 등록된 수치와 기준값으로 판단한다. nextEventId와 fallbackEventId는 같은 루트의 뒤쪽 사건 ID만 가리킨다. 분기끼리 같은 id를 쓰지 않는다. 분기 없으면 배열을 비우고 후속 ID는 빈 문자열로 순차 진행한다. 마지막 사건에는 다음 사건이나 분기가 없다.
effects는 event 방식 점수에만 사용하고 criterion·statId·부호 있는 amount를 쓴다. resource에는 effects를 만들지 않는다. 엔딩까지 완결 가능한 구조를 만든다.`:`고정 사건·분기·엔딩을 만들지 않는다. 인물 목표와 배경에서 자유롭게 이야기가 이어지게 한다. stats의 mode는 resource로 한다. examples는 문체를 보여줄 예시 최대 3개이며 이미 일어난 사실이 아니다. keywords는 특정 장면에서만 필요한 설정이며 없어도 된다.`}
모든 ID는 서로 구별되는 짧은 영문·숫자 식별자다. 내장 이미지는 사용자가 나중에 올린다. 최종 출력 전에 중복 ID·참조·인물수·스포일러·루트 종결을 점검한다.`;}

function check(value:any,s:Schema,path='초안'):void {
  if(s.type==='object'){if(!value||typeof value!=='object'||Array.isArray(value))throw Error(path+': 객체가 필요합니다.');for(const [k,child] of Object.entries(s.properties!))check(value[k],child,path+'.'+k);if(Object.keys(value).some(k=>!s.properties![k]))throw Error(path+': 지원하지 않는 항목입니다.');}
  else if(s.type==='array'){if(!Array.isArray(value)||value.length<(s.minItems||0)||value.length>(s.maxItems||Infinity))throw Error(path+': 항목 수를 확인하세요.');value.forEach((v,i)=>check(v,s.items!,path+'['+i+']'));}
  else if(typeof value!==s.type||(s.type==='number'&&!Number.isFinite(value))||s.enum&&!s.enum.includes(value))throw Error(path+': 값이 올바르지 않습니다.');
}
/** The model supplies prose and author choices; deterministic code supplies engine defaults. */
export function projectFromGeneratedDraft(raw:unknown,mode:Mode):Project {
  check(raw,jieumDraftSchema(mode));const draft=raw as any,p=makeProjectForPackageTarget('cortex',mode,false);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(draft.opening.time))throw Error('도입부 날짜와 시각이 올바르지 않습니다.');
  const ids=[draft.player.id,...draft.npcs.map((c:any)=>c.id),...draft.factions.map((f:any)=>f.id),...draft.stats.map((s:any)=>s.id)];
  if(draft.routes)for(const r of draft.routes){ids.push(r.id);for(const e of r.events){ids.push(e.id,...e.branches.map((b:any)=>b.id),...e.effects.map((ef:any)=>ef.id));}}
  if(ids.some((id:any)=>!id?.trim())||new Set(ids).size!==ids.length)throw Error('초안의 인물·사건·수치 ID가 중복되거나 비어 있습니다.');
  const person=(c:any,isPlayer:boolean)=>({...p.player,...c,isPlayer,importance:isPlayer?'protagonist':'major',visualAnchor:c.appearance});
  let project=normalizeProject({...p,title:draft.title,genre:draft.genre,startDate:draft.startDate,startLocation:draft.startLocation,world:{...p.world,overview:draft.world,fixedCanon:draft.fixedRules},gmData:{...p.gmData,worldTruthLedger:draft.privateWorld},aiWorldContext:{...p.aiWorldContext,enabled:!!draft.reference,premise:draft.reference},player:person(draft.player,true),npcs:draft.npcs.map((c:any)=>person(c,false)),factions:draft.factions.map((f:any)=>({...f,officialGoal:f.publicInfo,hiddenGoal:f.hiddenInfo})),opening:{...p.opening,openingLine:draft.opening.prologue,currentSituation:draft.opening.situation,openingLocation:draft.startLocation,openingTime:draft.opening.time,recommendedReply1:draft.opening.replies[0],recommendedReply2:draft.opening.replies[1],recommendedReply3:draft.opening.replies[2]},style:{...p.style,viewpoint:draft.viewpoint,sentenceStyle:draft.proseStyle,additionalRules:draft.extraStyle}});
  if(mode==='intelligent_canon'){
    project.events=draft.routes.flatMap((r:any)=>r.events.map((e:any)=>{const b=blankStoryEvent();return {...b,id:e.id,name:e.name,description:e.description,required:e.required,nextEventId:e.nextEventId,cortexDesign:{...eventDesign(b),otherViewpoint:e.otherViewpoint,viewpoint:e.viewpoint,occurrenceEnabled:e.occurrenceEnabled,occurrence:e.occurrence,closureConditions:e.closureConditions,constraints:e.constraints,unmet:e.unmet}};}));
    const d=canonDesign(project);d.mode=draft.routes.length>1?'unlock':'single';d.routes=draft.routes.map((r:any)=>({id:r.id,name:r.name}));d.stats=draft.stats;d.events=Object.fromEntries(draft.routes.flatMap((r:any)=>r.events.map((e:any,i:number)=>[e.id,{...emptyCanonEvent(r.id),ending:i===r.events.length-1,authorComment:i===0?r.authorComment:'',branching:e.branches.length>0,branches:e.branches,fallbackEventId:e.fallbackEventId,effects:e.effects}])));project.canonDesign=d;
  }else{
    project.events=[];project.instantStory={...project.instantStory,enabled:true,corePrompt:draft.world,startProfiles:[{id:'START_1',name:'도입부',prologue:draft.opening.prologue,startSituation:draft.opening.situation,recommendedReplies:draft.opening.replies}],statRules:draft.stats.map((s:any)=>({...s,tiers:[]})),exampleScenes:draft.examples,keywordNotes:draft.keywords};
  }
  const errors=validateProject(project).filter(i=>i.severity==='error');if(errors.length)throw Error('생성된 초안의 연결을 확인하지 못했습니다: '+errors.slice(0,3).map(e=>e.message).join(' '));
  return project;
}
