import type { Project } from './studio-model';
import { eventDesign } from './cortex-event-design';
import type { RuntimePredicate } from './package15-contract';
import { hasLegacyCanonContracts, compileCanonHud } from './canon-hud';

export type CanonBranch = { id: string; kind: 'story' | 'stat'; criterion: string; statId: string; threshold: number; comparison: 'gte' | 'lt'; nextEventId: string };
export type CanonEventSettings = { routeId: string; ending: boolean; authorComment: string; branching: boolean; branches: CanonBranch[]; fallbackEventId: string; effects: Array<{id:string;criterion:string;statId:string;amount:number}> };
export type CanonStat = { id:string;label:string;characterId:string;initial:number;minimum:number;maximum:number;unit:string;visible:boolean;revealWhenChanged?:boolean;mode:'event'|'resource';increaseWhen:string;decreaseWhen:string };
export type CanonDesign = { revision:1; migrationNotes?:string[]; mode:'single'|'unlock'; routes:Array<{id:string;name:string}>; events:Record<string,CanonEventSettings>; stats:CanonStat[]; openingText:string; openingSituation:string; replies:string[]; viewpoint:string; proseStyle:string; extraStyle:string };
export const emptyCanonEvent = (routeId=''):CanonEventSettings => ({routeId,ending:false,authorComment:'',branching:false,branches:[],fallbackEventId:'',effects:[]});
export function assertCanonDesign(value:unknown):asserts value is CanonDesign {
  const d=value as CanonDesign;
  const texts=(o:any,keys:string[])=>o&&keys.every(k=>typeof o[k]==='string');
  const numbers=(o:any,keys:string[])=>o&&keys.every(k=>typeof o[k]==='number'&&Number.isFinite(o[k]));
  const valid=d&&d.revision===1&&['single','unlock'].includes(d.mode)&&texts(d,['openingText','openingSituation','viewpoint','proseStyle','extraStyle'])&&Array.isArray(d.replies)&&d.replies.length===3&&d.replies.every(v=>typeof v==='string')&&Array.isArray(d.routes)&&d.routes.length>0&&d.routes.every(r=>texts(r,['id','name']))&&Array.isArray(d.stats)&&d.stats.every(s=>texts(s,['id','label','characterId','unit','increaseWhen','decreaseWhen'])&&numbers(s,['initial','minimum','maximum'])&&typeof s.visible==='boolean'&&['event','resource'].includes(s.mode))&&d.events&&typeof d.events==='object'&&!Array.isArray(d.events)&&Object.values(d.events).every(e=>texts(e,['routeId','authorComment','fallbackEventId'])&&typeof e.ending==='boolean'&&typeof e.branching==='boolean'&&Array.isArray(e.branches)&&e.branches.every(b=>texts(b,['id','criterion','statId','nextEventId'])&&numbers(b,['threshold'])&&['story','stat'].includes(b.kind)&&['gte','lt'].includes(b.comparison))&&Array.isArray(e.effects)&&e.effects.every(ef=>texts(ef,['id','criterion','statId'])&&numbers(ef,['amount'])))&&(!d.migrationNotes||Array.isArray(d.migrationNotes)&&d.migrationNotes.every(n=>typeof n==='string'));
  if(!valid)throw Error('지음 정사 설정의 형식이 올바르지 않습니다. 원본 작업 파일을 확인하세요.');
}
/** Fold retired descriptive tools into the remaining prose fields once. */
export function activateCanonAuthoring(p:Project):Project {
  if(p.canonDesign || hasLegacyCanonContracts(p) || p.canonHud)return p;
  const people=[p.player,...p.npcs],names=new Map(people.map(c=>[c.id,c.name]));
  const actorNotes=(id:string)=>p.autonomyActors.filter(a=>a.entityId===id).flatMap(a=>[a.shortTermGoal,a.mediumTermGoal,a.longTermGoal,a.currentPlan,a.nextAction,a.knowledge,a.misinformation,a.resources,a.constraints,a.cooperationRules,a.conflictRules]).filter(Boolean).join('\n');
  const person=(c:Project['player'])=>({...c,relationships:[c.relationships,...p.characterRelations.filter(r=>r.sourceId===c.id).map(r=>`${names.get(r.targetId)||r.targetId}: ${r.relationType}. ${r.publicSummary}`)].filter(Boolean).join('\n\n'),hiddenInfo:[c.hiddenInfo,...p.characterRelations.filter(r=>r.sourceId===c.id).map(r=>r.hiddenNotes),actorNotes(c.id)].filter(Boolean).join('\n\n')});
  return {...p,player:person(p.player),npcs:p.npcs.map(person),factions:p.factions.map(f=>({...f,hiddenGoal:[f.hiddenGoal,actorNotes(f.id)].filter(Boolean).join('\n\n')})),canonDesign:canonDesign(p)};
}
export function canonDesign(p:Project):CanonDesign {
  if(p.canonDesign)return p.canonDesign;
  const routes=[{id:'main',name:'첫 번째 이야기'}];
  const initial:CanonDesign = {revision:1,mode:'single',routes,events:Object.fromEntries(p.events.map((e,i)=>[e.id,{...emptyCanonEvent('main'),ending:i===p.events.length-1}])),stats:[],openingText:p.opening.openingLine||'',openingSituation:[p.opening.currentSituation,p.opening.openingLocation,p.opening.openingCharacters,p.opening.openingEvent,p.opening.preHistory,p.opening.knownRisks,p.opening.firstGoal].filter(Boolean).join('\n\n'),replies:[p.opening.recommendedReply1||'',p.opening.recommendedReply2||'',p.opening.recommendedReply3||''],viewpoint:p.style.viewpoint||'3인칭 제한 시점',proseStyle:p.style.sentenceStyle||'작품에 맞게',extraStyle:p.style.additionalRules||''};
  const notes:string[]=[];
  const old=p.package15;
  const live=p.events.filter(e=>e.kind!=='constraint');
  if(old.routes.length){
    initial.mode=old.routes.length>1?'unlock':'single';
    initial.routes=[...old.routes].sort((a,b)=>a.order-b.order).map(r=>({id:r.id,name:r.name}));
    for(const e of live){const route=old.routes.find(r=>r.id===e.multiroute?.routeId||r.id===e.multiroute?.routeEntryFor||r.entryEventId===e.id||old.chapters.some(ch=>(ch.routeId===r.id||r.chapterIds.includes(ch.id))&&ch.eventIds.includes(e.id))||old.endings.some(end=>end.routeId===r.id&&end.terminalEventId===e.id));initial.events[e.id]={...initial.events[e.id],routeId:route?.id||initial.routes[0].id,ending:false};}
    for(const r of initial.routes){const own=live.filter(e=>initial.events[e.id].routeId===r.id);if(own.length)initial.events[own.at(-1)!.id].ending=true;}
    notes.push('기존 루트는 작성 순서에 따른 해금 방식으로 옮겼습니다. 공통 사건의 소속과 각 루트의 마지막 사건을 확인하세요. 원래 루트 설정은 작업 JSON에 보존됩니다.');
  }
  initial.stats=old.flags.filter(f=>f.valueType==='number').map(f=>({id:f.id,label:f.label,characterId:p.player.id,initial:Number(f.defaultValue)||0,minimum:Math.min(0,Number(f.defaultValue)||0),maximum:Math.max(100,Number(f.defaultValue)||0),unit:'',visible:false,mode:'event',increaseWhen:'',decreaseWhen:''}));
  for(const record of old.branchEnding.choiceRecords){const ef=record.satisfiedEffect;if(ef?.kind==='increment_flag'&&initial.events[record.sourceEventId]&&initial.stats.some(s=>s.id===ef.flagId))initial.events[record.sourceEventId].effects.push({id:record.id,criterion:record.criterion,statId:ef.flagId,amount:Number(ef.value)});else if(ef)notes.push(record.name+': 복합 점수 효과는 사건의 점수 변화로 다시 지정하세요.');}
  for(const dec of old.branchEnding.decisions){const dest=initial.events[dec.decisionEventId];if(!dest)continue;dest.branching=true;dest.fallbackEventId=dec.fallback.nextEventId;dest.branches=dec.rules.flatMap(rule=>{const b:CanonBranch={id:rule.id,kind:'story',criterion:'',statId:'',threshold:0,comparison:'gte',nextEventId:rule.nextEventId};const when=rule.when;if('kind' in when&&when.kind==='choice_status'&&when.status==='satisfied'){const record=old.branchEnding.choiceRecords.find(r=>r.id===when.choiceId&&r.sourceEventId===dec.decisionEventId);if(record)return [{...b,criterion:record.criterion}];}const condition='not' in when?when.not:when;if(condition&&'kind' in condition&&condition.kind==='flag_at_least'&&initial.stats.some(s=>s.id===condition.flagId))return [{...b,kind:'stat' as const,statId:condition.flagId,threshold:condition.value,comparison:('not' in when?'lt':'gte') as 'lt'|'gte'}];notes.push(dec.name+' / '+rule.label+': 복합 분기 조건을 다시 지정하세요. 원본은 작업 JSON에 보존됩니다.');return [{...b,criterion:''}];});}
  if(old.flags.some(f=>f.valueType!=='number'))notes.push('숫자가 아닌 기존 상태값은 새 스탯에 자동 변환하지 않았습니다. 사용하는 분기를 확인하세요.');
  initial.migrationNotes=[...new Set(notes)];
  return initial;
}
export function canonIssues(p:Project):Array<{severity:'error';area:string;message:string}> {
  if(!p.canonDesign||p.runtimeMode!=='intelligent_canon')return [];
  const d=canonDesign(p),issues:Array<{severity:'error';area:string;message:string}>=[];
  const add=(area:string,message:string)=>issues.push({severity:'error',area,message});
  const routes=d.mode==='single'?d.routes.slice(0,1):d.routes;
  const statIds=new Set(d.stats.map(s=>s.id));
  if(d.migrationNotes?.length)add('사건','기존 설계에서 옮긴 항목을 확인한 뒤 확인 완료를 눌러 주세요.');
  if(!routes.length||new Set(routes.map(r=>r.id)).size!==routes.length)add('사건','루트 구성을 확인하세요.');
  if(d.stats.length>7||statIds.size!==d.stats.length)add('스탯·자원','수치는 서로 다른 항목으로 최대 7개까지 사용할 수 있습니다.');
  for(const s of d.stats)if(!s.id||!['event','resource'].includes(s.mode)||![p.player,...p.npcs].some(c=>c.id===s.characterId))add('스탯·자원',s.label+': 대상 인물과 변화 방식을 확인하세요.');
  const storyIds=new Set(p.events.filter(e=>e.kind!=='constraint').map(e=>e.id));
  for(const f of p.foreshadowings)if(!storyIds.has(f.plantingScene)||!storyIds.has(f.payoffConditions))add('사건',f.title+': 복선을 심고 회수할 사건을 선택하세요.');
  for(const t of p.imageTriggers.filter(t=>t.enabled)){const e=p.events.find(e=>e.id===t.sourceId);if(!e||t.triggerType==='event_condition_met'&&!eventDesign(e).closureConditions.some(r=>r.id===t.customCondition))add('사건',t.name+': 이미지와 연결할 사건·종결조건을 확인하세요.');}

  for(const s of d.stats)if(!s.label.trim()||![s.initial,s.minimum,s.maximum].every(Number.isFinite)||s.minimum>s.initial||s.initial>s.maximum)add('스탯·자원',`${s.label||'수치'}의 이름과 시작값 범위를 확인하세요.`);
  for(const route of routes){
    const events=p.events.filter(e=>e.kind!=='constraint'&&(d.mode==='single'||d.events[e.id]?.routeId===route.id));
    if(!route.name.trim()||!events.length){add('사건',`${route.name||'새 루트'}에 이름과 첫 사건이 필요합니다.`);continue;}
    const endings=events.filter(e=>d.events[e.id]?.ending);
    if(endings.length!==1||endings[0]?.id!==events.at(-1)?.id)add('사건',`${route.name}: 마지막 사건 하나를 엔딩으로 지정하세요.`);
    const ids=new Set(events.map(e=>e.id));
    for(const e of events){const c=d.events[e.id];if(!c)continue;if(c.ending&&eventDesign(e).occurrenceEnabled)add('사건',e.name+': 엔딩 사건은 발생조건으로 건너뛸 수 없습니다.');
      if(c.branching){if(c.ending)add('사건',`${e.name}: 엔딩과 다음 사건 분기를 동시에 지정할 수 없습니다.`);
        if(!c.branches.length||!ids.has(c.fallbackEventId))add('사건',`${e.name}: 분기와 기본 경로를 지정하세요.`);
        for(const b of c.branches){if(!ids.has(b.nextEventId)||b.nextEventId===e.id)add('사건',`${e.name}: 분기 대상은 같은 루트의 다른 사건이어야 합니다.`);if(b.kind==='story'&&!b.criterion.trim())add('사건',`${e.name}: 이야기 분기 조건을 작성하세요.`);if(b.kind==='stat'&&(!statIds.has(b.statId)||!Number.isFinite(b.threshold)))add('사건',`${e.name}: 분기에 사용할 수치를 선택하세요.`);}
      }
      for(const effect of c.effects)if(!d.stats.some(s=>s.id===effect.statId&&s.mode==='event')||!effect.criterion.trim()||!Number.isFinite(effect.amount))add('사건',`${e.name}: 점수 변화의 조건·수치·변화량을 확인하세요.`);
      if(e.nextEventId&&!ids.has(e.nextEventId))add('사건',`${e.name}: 후속사건이 다른 루트에 있습니다.`);
    }
  }
  if(d.mode==='unlock'&&p.events.some(e=>e.kind!=='constraint'&&!routes.some(r=>r.id===d.events[e.id]?.routeId)))add('사건','소속 루트가 없는 사건을 확인하세요.');
  return issues;
}

/** Authoring is kept intact; only this projection is consumed by Cortex. */
export function compileCanonDesign(p:Project):Project {
  if(!p.canonDesign||p.runtimeMode!=='intelligent_canon'||p.packageTarget!=='cortex')return compileCanonHud(p);
  const d=canonDesign(p),routes=d.mode==='single'?d.routes.slice(0,1):d.routes;
  const choices:Project['package15']['branchEnding']['choiceRecords']=[];
  const decisions:Project['package15']['branchEnding']['decisions']=[];
  const endings:Project['package15']['endings']=[];
  for(const route of routes){const events=p.events.filter(e=>e.kind!=='constraint'&&(d.mode==='single'||d.events[e.id]?.routeId===route.id));
    for(const e of events){const c=d.events[e.id];if(!c)continue;
      for(const ef of c.effects)choices.push({id:ef.id,name:ef.criterion,sourceEventId:e.id,criterion:ef.criterion,evaluationSource:'PUBLIC_PROSE',applyPolicy:'ONCE_PER_EVENT',satisfiedEffect:{kind:'increment_flag',flagId:ef.statId,value:ef.amount}});
      if(c.branching&&!c.ending)decisions.push({id:`decision_${e.id}`,name:e.name,decisionEventId:e.id,matchPolicy:'FIRST_AUTHORED_MATCH',recoveryAttempts:1,unresolvedPolicy:'FALLBACK_WITHOUT_ASSERTING_CONDITION',fallback:{nextEventId:c.fallbackEventId,acceptsUnevaluated:true,narrativeGuidance:'조건 미달과 판정 불가를 구분한다. 조건 실패나 관계 훼손을 날조하지 않고 현재 공개된 상황에서 기본 경로로 이어간다.'},rules:c.branches.map(b=>{let when:RuntimePredicate;if(b.kind==='story'){choices.push({id:b.id,name:b.criterion,sourceEventId:e.id,criterion:b.criterion,evaluationSource:'PUBLIC_PROSE',applyPolicy:'ONCE_PER_EVENT'});when={kind:'choice_status',choiceId:b.id,status:'satisfied'};}else{when={kind:'flag_at_least',flagId:b.statId,value:b.threshold};if(b.comparison==='lt')when={not:when};}return {id:b.id,label:b.criterion||b.statId,when,nextEventId:b.nextEventId};})});
      if(c.ending)endings.push({id:`ending_${route.id}`,routeId:'',name:e.name,type:'normal',priority:0,condition:{completedEventIds:[e.id]},effects:[],returnPolicy:'stay_ended',terminalEventId:e.id,exclusiveGroupId:'jieum'});
    }
  }
  return {...p,events:p.events.map((e,i)=>({...e,sequence:i+1,description:[e.description,...p.foreshadowings.filter(f=>f.plantingScene===e.id).map(f=>'이 장면에 심을 복선: '+[f.title,f.reinforcementPlan,f.payoffResult,f.misdirection,f.notes].filter(Boolean).join('\n')),...p.foreshadowings.filter(f=>f.payoffConditions===e.id).map(f=>'이 장면에서 회수할 복선: '+[f.title,f.payoffResult,f.notes].filter(Boolean).join('\n'))].filter(Boolean).join('\n\n')})),eventClocks:[],autonomyActors:[],autonomySettings:{...p.autonomySettings,enabled:false},opening:{...p.opening,openingLine:d.openingText,currentSituation:d.openingSituation,openingLocation:p.startLocation,openingEvent:d.openingSituation,recommendedReply1:d.replies[0]||'',recommendedReply2:d.replies[1]||'',recommendedReply3:d.replies[2]||''},style:{...p.style,viewpoint:d.viewpoint,sentenceStyle:d.proseStyle,additionalRules:d.extraStyle},package15:{...p.package15,enabled:true,loopPolicy:{...p.package15.loopPolicy,enabled:false},storyMode:'branching',requiredFeatures:['branch_ending_convergence_v1'],optionalFeatures:[],routes:[],chapters:[],endings,flags:d.stats.map(s=>({id:s.id,label:s.label,valueType:'number',defaultValue:s.initial,scope:'session'})),branchEnding:{enabled:true,primaryEndingGroupId:'jieum',choiceRecords:choices,decisions}}};
}
