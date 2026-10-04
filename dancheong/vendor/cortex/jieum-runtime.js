/* Opt-in Jieum canon authoring contract. Base Cortex packages are unchanged. */
(function(root){'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x)),list=x=>Array.isArray(x)?x:[];
 const config=sc=>sc?.runtime?.packageV15?.jieum||null;
 function initialize(sc){const c=config(sc);if(!c||sc.runtime.jieum)return sc;
   validate(c,sc.runtime.packageContract?.eventGraph?.nodes||{});
   const baseline=c.mode==='hud_only'?null:copy(sc);sc.runtime.jieum={routeIndex:0,seen:[],archives:[],baseline,resourceValues:Object.fromEntries(c.stats.filter(s=>s.mode==='resource').map(s=>[s.id,s.initial])),changes:[],pending:[],firstEventSeen:[],hudEventValues:Object.fromEntries(c.stats.filter(s=>s.mode==='event').map(s=>[s.id,s.initial])),hudEffectLedger:{},revealedStats:[],resourceStatus:'READY'};
   if(c.mode!=='hud_only')restrict(sc,0);return sc;
 }
 function validate(c,nodes){
   if(c.revision!==1||!Array.isArray(c.stats)||!Array.isArray(c.routes)||(c.mode!=='hud_only'&&!c.routes.length))throw Error('JIEUM_CONTRACT_INVALID');
   const ids=new Set(),assigned=new Set(),statIds=new Set();
   for(const r of c.routes){if(!r||ids.has(r.id)||!Array.isArray(r.eventIds)||!r.eventIds.length||r.endingEventId!==r.eventIds.at(-1))throw Error('JIEUM_ROUTE_INVALID');ids.add(r.id);for(const id of r.eventIds){if(assigned.has(id)||!nodes[id])throw Error('JIEUM_ROUTE_EVENT_INVALID');assigned.add(id)}}
   for(const s of c.stats){if(!s||typeof s.id!=='string'||!s.id||statIds.has(s.id)||![s.initial,s.minimum,s.maximum].every(Number.isFinite)||s.initial<s.minimum||s.initial>s.maximum||!['resource','event'].includes(s.mode))throw Error('JIEUM_STAT_INVALID');statIds.add(s.id)}
   if(c.mode==='hud_only'){
     if(!Array.isArray(c.hudEffects))throw Error('JIEUM_HUD_EFFECT_INVALID');const effects=new Set();
     for(const e of c.hudEffects){if(!e||typeof e.id!=='string'||!e.id||effects.has(e.id)||!nodes[e.eventId]||!c.stats.some(s=>s.id===e.statId&&s.mode==='event')||typeof e.criterion!=='string'||!e.criterion.trim()||!Number.isFinite(e.amount))throw Error('JIEUM_HUD_EFFECT_INVALID');effects.add(e.id)}
     if(c.timeline&&(dateNumber(c.timeline.startDate)===null||typeof c.timeline.cycleStatId!=='string'||c.timeline.cycleStatId&&!c.stats.some(s=>s.id===c.timeline.cycleStatId&&s.mode==='event')))throw Error('JIEUM_TIMELINE_INVALID');
   }
 }
 function restrict(sc,index){const c=config(sc),r=c.routes[index],b=sc.runtime.packageV15.branchEnding,ids=new Set(r.eventIds);
   if(b){b.records=b.records.filter(x=>ids.has(x.sourceEventId));b.decisions=b.decisions.filter(x=>ids.has(x.decisionEventId));b.terminalEvents=b.terminalEvents.filter(x=>ids.has(x.terminalEventId));}
   const graph=sc.runtime.packageContract.eventGraph;graph.routes=[{id:r.id,eventIds:r.eventIds}];
   const chain=new Map();for(let e=sc.event;e&&!chain.has(e.id);e=e.nextEvent)chain.set(e.id,e);
   const build=(id,seen=new Set())=>{if(!id)return null;if(seen.has(id)||!ids.has(id))throw Error('JIEUM_ROUTE_LINK_INVALID');const node=chain.get(id)||graph.nodes[id],e=copy(node),i=r.eventIds.indexOf(id),nextId=id===r.endingEventId?'':node.nextEventId||node.nextEvent?.id||r.eventIds[i+1]||'';e.nextEvent=build(nextId,new Set([...seen,id]));e.nextEventId=nextId;return e;};const next=build(r.eventIds[0]);
   sc.event=next;sc.runtime.eventLedger={sealed:[],activeEventId:next.id};sc.runtime.systemicEventState={schema:'CORTEX_EVENT_STATE_V8',activeEventId:next.id,phase:'ACTIVE',eventBeats:0,eventTurns:0,minTurns:3,closureExtensionCount:0};sc.runtime.eventMachine={schema:'CORTEX_EVENT_FSM_V3',activeEventId:next.id,state:'ACTIVE',eventBeats:0,eventTurns:0,extensionCount:0};
 }
 function nextRoute(sc,turns){initialize(sc);const state=sc.runtime.jieum,c=config(sc),index=state.routeIndex+1,current=c.routes[state.routeIndex];
   if(c.mode==='hud_only')throw Error('JIEUM_ROUTE_LOCKED');
   if(!c.routes[index]||sc.runtime.branchEndingState?.ending?.terminalEventId!==current.endingEventId)throw Error('JIEUM_ROUTE_LOCKED');
   const next=copy(state.baseline),seen=[...new Set([...state.seen,current.id])],archives=[...state.archives,{routeId:current.id,turns:copy(turns)}];
   next.runtime.jieum={routeIndex:index,seen,archives,baseline:copy(state.baseline),resourceValues:Object.fromEntries(c.stats.filter(s=>s.mode==='resource').map(s=>[s.id,s.initial])),changes:[],pending:[],firstEventSeen:[],resourceStatus:'READY'};
   restrict(next,index);next.runtime.packageContract.openingContract={...next.runtime.packageContract.openingContract,initialPrologue:'',openingLine:'',initialPublicProse:''};
   next.scene={...next.scene,currentSituation:c.routes[index].startSituation||next.event.description};
   return next;
 }
 function values(sc){const c=config(sc);if(!c)return {};const flags=root.CortexBranchEnding?.contract(sc)?.enabled?root.CortexBranchEnding.flags(sc):{};return Object.fromEntries(c.stats.map(s=>[s.id,s.mode==='resource'?(sc.runtime.jieum?.resourceValues[s.id]??s.initial):Math.max(s.minimum,Math.min(s.maximum,(c.mode==='hud_only'?sc.runtime.jieum?.hudEventValues?.[s.id]:flags[s.id])??s.initial))]));}
 function visibleStats(sc){const c=config(sc),v=values(sc),revealed=list(sc.runtime.jieum?.revealedStats);return list(c?.stats).filter(s=>s.visible&&(!s.revealWhenChanged||revealed.includes(s.id)||v[s.id]!==s.initial));}
 function writerContext(sc){const c=config(sc);if(!c)return null;initialize(sc);const v=values(sc),publicIds=new Set(visibleStats(sc).map(s=>s.id));return {privateWorld:c.privateWorld,privateCharacters:c.privateCharacters,world:c.world,reference:c.reference,stats:c.stats.map(s=>({...s,visible:publicIds.has(s.id),current:v[s.id]})),instruction:'수치는 현재 저장값이다. HUD 공개는 등장인물의 지식이나 회상 권한이 아니다. 사건별 점수의 변화량을 임의로 정하지 않는다. 자원은 규칙과 잔량 안에서 사용·획득하며 실제 수량을 본문에 분명히 쓴다. visible=false인 수치와 변화량을 본문이나 추천답변에 표시하지 않는다. 비공개 설정은 인과와 동기의 참고일 뿐이며 공개 조건 전에는 인용·해설·확인하거나 추천답변으로 누설하지 않는다. 지정하지 않은 나이·출신·성별·직업은 필요할 때 문맥에 맞게 정하고 이후 유지한다. 플레이어의 의사와 대사를 대신 결정하지 않는다.'};}
 const instruction='jieumResources가 있으면 currentTurnProse에서 이번에 실제 발생한 자원 증감만 판정한다. 이전 원문은 중복 적용하지 않는다. 계획·회상·가정은 제외한다. 각 delta는 부호 있는 실제 수량이고 evidence는 currentTurnProse의 짧은 연속 인용문이다. 양도는 등록된 양쪽 자원에 각각 반영한다. 자원별 status는 KNOWN 또는 UNCERTAIN이다. 변화가 없으면 KNOWN, delta 0, evidence 빈 문자열이다. 변화는 있지만 수량이나 대상이 불명확하면 UNCERTAIN, delta 0이다. 사건 종결 판정과 독립적으로 답한다.';
 function extend(request,transport,sc,text){
   const c=config(sc),stats=list(c?.stats).filter(s=>s.mode==='resource'),proofs=hudPending(sc);
   if(!stats.length&&!proofs.length&&!c?.timeline)return;
   initialize(sc);const v=values(sc);request.currentTurnProse=[...list(sc.runtime.jieum.unconfirmedText),text].join('\n\n');request.currentBeatProse=text;
   request.jieumResources=stats.map(s=>({...s,current:v[s.id]}));
   request.unconfirmedResourceProse=list(sc.runtime.jieum.unconfirmedText);
   const properties=Object.fromEntries(stats.map((_,i)=>['r'+i,{type:'object',additionalProperties:false,required:['status','delta','evidence'],properties:{status:{type:'string',enum:['KNOWN','UNCERTAIN']},delta:{type:'number'},evidence:{type:'string'}}}]));
   if(proofs.length){request.jieumEventEffects=proofs.map((r,i)=>({key:'h'+i,criterion:r.criterion}));request.jieumEventEffectInstruction='이번 currentBeatProse에서 조건이 실제 성립한 경우만 CURRENT_ACTUAL과 연속 인용 evidence를 쓴다. 회상·타인 시점·가정·계획·인용·장치 표시·과거 비트는 NOT_CURRENT이다.';proofs.forEach((r,i)=>{properties['h'+i]={type:'object',additionalProperties:false,required:['status','evidence'],properties:{status:{type:'string',enum:['CURRENT_ACTUAL','NOT_CURRENT','UNCERTAIN']},evidence:{type:'string'}}}});}
   if(c?.timeline){request.jieumTimeline={protagonist:sc.protagonist?.name,previous:sc.runtime.jieum.timeline||null,pendingReset:pendingReset(sc),instruction:'현재 주인공이 실제 있는 장면의 명시된 날짜만 CURRENT, 실제 시간 되감김이면 RESET이다. 회상·다른 인물 시점·계획·기기의 관측 번호·인용은 IGNORE. 날짜가 명시되지 않으면 IGNORE. pendingReset이 있을 때 되감김 직후의 현재 장면이 실제 복귀한 그날의 날짜임을 확인하면 RESET_DATE로 답한다. 단순한 나중 날짜나 회상 속 복귀일은 RESET_DATE가 아니다. date는 YYYY-MM-DD, evidence는 currentBeatProse의 날짜가 포함된 짧은 연속 인용이다. 회차는 계산하지 않는다.'};properties.timeline={type:'object',additionalProperties:false,required:['kind','date','evidence'],properties:{kind:{type:'string',enum:['CURRENT','RESET','RESET_DATE','IGNORE']},date:{type:'string'},evidence:{type:'string'}}};}
   transport.schema.properties.resources={type:'object',additionalProperties:false,required:Object.keys(properties),properties};transport.schema.required.push('resources');
 }
 function hudPending(sc){return list(config(sc)?.hudEffects).filter(r=>r.eventId===sc.event?.id&&!sc.runtime.jieum?.hudEffectLedger?.[r.id]);}
 function stage(sc,raw,turnId,text){const c=config(sc);if(!c)return;initialize(sc);sc.runtime.jieum.pending={turnId,raw:copy(raw||{}),proofIds:hudPending(sc).map(r=>r.id),currentText:text,text:[...(sc.runtime.jieum.unconfirmedText||[]),text].join("\n\n")};}
 function commit(sc,turn){const c=config(sc);if(!c)return;initialize(sc);const st=sc.runtime.jieum,pending=st.pending;
   if(st.changes.some(x=>x.turnId===turn.id)||pending?.turnId!==turn.id)return;
   const stats=c.stats.filter(s=>s.mode==='resource'),deltas=[],problems=[];
   const effects=list(c.hudEffects);st.hudEventValues||={};st.hudEffectLedger||={};
   list(pending.proofIds).forEach((id,i)=>{const effect=effects.find(e=>e.id===id),proof=pending.raw['h'+i],stat=c.stats.find(s=>s.id===effect?.statId);if(!effect||!stat||st.hudEffectLedger[id])return;const evidence=String(proof?.evidence||'').trim();if(proof?.status==='CURRENT_ACTUAL'&&evidence&&pending.currentText.includes(evidence)){const before=st.hudEventValues[stat.id]??stat.initial,after=before+effect.amount;if(!Number.isFinite(after)||after<stat.minimum||after>stat.maximum)return;st.hudEventValues[stat.id]=after;st.hudEffectLedger[id]={turnId:turn.id,evidence,statId:stat.id,delta:effect.amount,before,after};}});
   stats.forEach((s,i)=>{const raw=pending.raw['r'+i],before=st.resourceValues[s.id]??s.initial,after=before+(raw?.delta||0);
     if(!raw||raw.status!=='KNOWN'||!Number.isFinite(raw.delta)||(raw.delta!==0&&(!raw.evidence?.trim()||!pending.text.includes(raw.evidence)))||after<s.minimum||after>s.maximum){problems.push(s.id);return;}
     deltas.push({id:s.id,before,after,delta:raw.delta,evidence:raw.evidence});
   });
   // A transfer must commit both sides or neither. The visible prose is retained.
   if(!problems.length)for(const row of deltas)st.resourceValues[row.id]=row.after;
   st.unconfirmedText=problems.length?[pending.text]:[];st.resourceStatus=problems.length?'UNCONFIRMED':'READY';st.changes.push({turnId:turn.id,deltas:problems.length?[]:deltas,problems});st.pending=[];
   commitTimeline(sc,turn,pending);
   turn.jieumResources={status:st.resourceStatus,values:copy(values(sc)),problems};
   st.revealedStats=[...new Set([...list(st.revealedStats),...visibleStats(sc).map(s=>s.id)])];
 }
 function dateNumber(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;const n=Date.parse(date+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===date?n:null;}
 function choicesFor(sc){return sc.runtime.jieum?.hudEffectLedger||{};}
 function pendingReset(sc){const t=sc.runtime.jieum?.timeline;if(!t?.lastAppliedResetCommitId||t.cycleStart)return null;const proof=Object.values(choicesFor(sc)).find(p=>p.turnId===t.lastAppliedResetCommitId&&p.statId===config(sc).timeline.cycleStatId&&p.delta===1);return proof?{commitId:proof.turnId,evidence:proof.evidence}:null;}
 function commitTimeline(sc,turn,pending){
   const c=config(sc);if(!c.timeline)return;
   const st=sc.runtime.jieum,prior=st.timeline,raw=pending.raw.timeline,date=dateNumber(raw?.date),start=dateNumber(c.timeline.startDate),evidence=String(raw?.evidence||'').trim();
   const cycleId=c.timeline.cycleStatId,cycle=cycleId?values(sc)[cycleId]:null;
   const changedReset=list(pending.proofIds).some(id=>choicesFor(sc)[id]?.turnId===turn.id&&choicesFor(sc)[id]?.statId===cycleId&&choicesFor(sc)[id]?.delta===1);
   // A proven reset invalidates the old calendar even if the new date is not yet explicit.
   if(changedReset){st.timeline={date:null,dayWithinLoop:null,cycleStart:null,cycle,repeatDisclosed:true,lastAppliedResetCommitId:turn.id,lastCommitId:turn.id};turn.jieumTimeline=copy(st.timeline);}
   if(!['CURRENT','RESET','RESET_DATE'].includes(raw?.kind)||date===null||start===null||!evidence||!pending.currentText.includes(evidence))return;
   const [year,month,day]=raw.date.split('-').map(Number);
   const dates=[...evidence.matchAll(/(?<!\d)(?:(\d{4})[년./-]\s*)?(\d{1,2})[월./-]\s*(\d{1,2})(?:일|(?=\D|$))/g)];
   if(!dates.some(m=>(!m[1]||Number(m[1])===year)&&Number(m[2])===month&&Number(m[3])===day))return;
   if(raw.kind==='RESET'&&(!cycleId||!changedReset))return;
   if(raw.kind==='RESET_DATE'&&(!pendingReset(sc)||changedReset||prior?.date&&prior.date!==raw.date))return;
   if(changedReset&&raw.kind!=='RESET')return;
   if(raw.kind==='CURRENT'&&prior?.date&&date<dateNumber(prior.date))return;
   const cycleStart=['RESET','RESET_DATE'].includes(raw.kind)?raw.date:prior?.lastAppliedResetCommitId?prior.cycleStart:prior?.cycleStart||c.timeline.startDate,origin=dateNumber(cycleStart);
   if(origin!==null&&date<origin)return;
   st.timeline={date:raw.date,dayWithinLoop:origin===null?null:Math.floor((date-origin)/86400000)+1,cycleStart,cycle:cycle??prior?.cycle??null,repeatDisclosed:!!prior?.repeatDisclosed||raw.kind==='RESET',lastAppliedResetCommitId:raw.kind==='RESET'?turn.id:prior?.lastAppliedResetCommitId||null,lastCommitId:turn.id};
   turn.jieumTimeline=copy(st.timeline);
 }
 // Ask for literal public prose, never an inferred keyword or a private identity.
 function imageMoments(sc){return list(sc.runtime?.packageContract?.imageTriggers).filter(t=>t.enabled!==false&&t.sourceId===sc.event?.id&&['event_condition_met','event_success'].includes(t.triggerType)&&!(t.once&&list(sc.runtime.imageTriggerLedger?.firedTriggerIds).includes(t.id)));}
 function extendImages(request,transport,sc,prose){const triggers=imageMoments(sc);if(!triggers.length)return;
   request.currentImageTurnProse=prose;request.imageMoments=triggers.map((t,i)=>({key:'image'+i,triggerType:t.triggerType,condition:t.triggerType==='event_success'?'현재 사건의 종결을 실제 실현한 순간':list(sc.event?.requiredFunctions).find(r=>r.ref===t.customCondition||r.ref?.endsWith(':'+t.customCondition))?.description||t.customCondition}));
   request.imageMomentInstruction='imageMoments 각각의 조건이 currentImageTurnProse에서 실제 실현되었다면 그 순간의 짧은 연속 문장을 원문 그대로 imageMoments 출력에 복사한다. 이전 비트·예정·추측은 제외하며 현재 본문에서 위치를 특정할 수 없으면 빈 문자열이다. 본문 수정이나 새 문장은 금지한다.';
   transport.schema.properties.imageMoments={type:'object',additionalProperties:false,required:triggers.map((_,i)=>'image'+i),properties:Object.fromEntries(triggers.map((_,i)=>['image'+i,{type:'string'}]))};transport.schema.required.push('imageMoments');
 }
 function imageAnchor(turn,trigger,quote=''){
   const prose=String(turn.text||'');
   if(trigger.triggerType==='event_start'){const end=prose.search(/\n\s*\n/u);return {kind:'EVENT_START',offset:trigger.outputPosition==='after_scene'?(end<0?prose.length:end):0};}
   const text=String(quote||'').trim(),start=text?prose.indexOf(text):-1;
   if(start<0||prose.indexOf(text,start+1)>=0)return {kind:'UNRESOLVED'};
   return {kind:'PUBLIC_QUOTE',quote:text,offset:trigger.outputPosition==='before_scene'?start:start+text.length,before:trigger.outputPosition==='before_scene'};
 }
 function images(sc,turn,previous){const c=config(sc);if(!c||c.mode==='hud_only')return null;initialize(sc);const st=sc.runtime.jieum,source=turn.sourceEventId||previous.id,first=!st.firstEventSeen.includes(source);if(first)st.firstEventSeen.push(source);
   const fired=new Set(list(sc.runtime.imageTriggerLedger?.firedTriggerIds)),records=turn.adjudicationLog?.entries?.[0],refs=records?.requirementMap||[],response=records?.response,images=[];
   for(const t of list(sc.runtime.packageContract.imageTriggers)){if(t.enabled===false||(t.once&&fired.has(t.id))||t.sourceId!==source)continue;
     const ended=list(sc.runtime.packageV15.completedEventIds).includes(source),mapping=refs.find(x=>x.ref===t.customCondition||x.ref.endsWith(':'+t.customCondition)),verdict=mapping?response?.requirements?.[mapping.key]:null;
     const met=turn.metrics?.unifiedAdjudication?.requirements?.some(r=>(r.requirementRef===t.customCondition||r.requirementRef.endsWith(':'+t.customCondition))&&['MET','ALTERNATIVE_MET'].includes(r.status));void verdict;
     if(!(t.triggerType==='event_start'&&first||t.triggerType==='event_success'&&ended||t.triggerType==='event_condition_met'&&met))continue;
     const asset=list(t.attachedImages)[0];if(!asset?.assetPath)continue;
     const quote=records?.imageMomentKeys?.find(row=>row.id===t.id)?.key,proseAnchor=imageAnchor(turn,t,response?.imageMoments?.[quote]);
     images.push({triggerId:t.id,label:t.name,assetKey:`${sc.runtime.storyId}:trigger:${t.id}`,assetPath:asset.assetPath,outputPosition:t.outputPosition||'after_scene',proseAnchor});fired.add(t.id);
   }sc.runtime.imageTriggerLedger={schema:'CORTEX_IMAGE_TRIGGER_LEDGER_V1',firedTriggerIds:[...fired]};if(images.length)turn.packageTriggerImages=images;return images;
 }
 root.CortexJieum=Object.freeze({config,validate,initialize,nextRoute,values,visibleStats,writerContext,instruction,extend,stage,commit,images,imageMoments,extendImages,imageAnchor});
})(globalThis);
