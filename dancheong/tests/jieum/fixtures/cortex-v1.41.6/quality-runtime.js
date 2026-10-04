/* Protocol and diagnostic helpers. No lexical narrative verdicts. */
(()=>{'use strict';
 const copy=v=>JSON.parse(JSON.stringify(v)),arr=v=>Array.isArray(v)?v:[];
 function prose(value){return globalThis.CortexNarrativeSpacetime.parseText(String(value??'')).visible}
 function migrate(value){
   const root=copy(value);let removed=0;
   function visit(v,key=''){
     if(key==='adjudicationLog'||key==='sameTurnResume'||key==='repairLog'||key==='media'||key==='settings')return v;
     if(typeof v==='string'){const parsed=globalThis.CortexNarrativeSpacetime.parseText(v);if(parsed.protocol?.seen){removed++;return parsed.visible}}
     if(Array.isArray(v))return v.map(x=>visit(x));
     if(v&&typeof v==='object'){if(v.schema==='CORTEX_CAUSAL_CONNECTION_LEDGER_V1')v.history=connectionHistory(v.history);for(const k of Object.keys(v))v[k]=visit(v[k],k);}
     return v;
   }
   visit(root);recoverReferences(root);recoverStateKeys(root);if(removed)root.protocolMigration={schema:'CORTEX_PROTOCOL_MIGRATION_V1',removedFields:removed};return root;
 }
 // Reserved transport handles are not persistent identities. Keep their unbound records diagnostic-only.
 function recoverReferences(root){
   const records=[],known=new Set([...Object.keys(root.canonicalSession?.cast?.entities||root.cast?.entities||{}),...arr(root.scenario?.characters).map(r=>r.id),root.scenario?.protagonist?.id].filter(Boolean));const refKey=k=>/(?:Ref|Refs|CharacterIds)$/.test(k)||k==='ref';
   function walk(v,path='',key=''){
     if(['media','settings','repairLog','adjudicationLog','sameTurnResume','identityReferenceRecovery','identityBindingLog','package','sourcePackage','eventGraph'].includes(key))return v;
     if(typeof v==='string'&&refKey(key)&&/^person:\d+$/.test(v)&&!known.has(v)){records.push({path,unresolvedRef:v});return ''}
     if(Array.isArray(v))return v.map((x,i)=>walk(x,path+'.'+i,key)).filter(x=>!refKey(key)||x!=='');
     if(v&&typeof v==='object')for(const k of Object.keys(v))v[k]=walk(v[k],path+'.'+k,k);return v;
   }
   walk(root);if(records.length){const repaired=new Set(records.map(r=>'SCENE_CHARACTER_UNKNOWN:'+r.unresolvedRef));function clearStale(v){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(['media','settings','package','sourcePackage','repairLog','adjudicationLog','sameTurnResume'].includes(k))continue;if(k==='issues'&&Array.isArray(x))v[k]=x.filter(issue=>!repaired.has(issue));else clearStale(x)}}clearStale(root);root.identityReferenceRecovery={schema:'CORTEX_UNBOUND_IDENTITY_RECOVERY_V1',policy:'PUBLIC_PROSE_PRESERVED_IDENTITY_UNRESOLVED',entries:[...arr(root.identityReferenceRecovery?.entries),...records]};
     if(root.scenario){root.scenario.runtime||={};root.scenario.runtime.identityReferenceRecovery=copy(root.identityReferenceRecovery)}
     if(root.canonicalSession?.state){root.canonicalSession.state.cortexRuntimeExtra||={};root.canonicalSession.state.cortexRuntimeExtra.identityReferenceRecovery=copy(root.identityReferenceRecovery)}
   }return root;
 }
 function quarantineHandles(raw,knownRefs=[]){
   const known=new Set(knownRefs);
   const delta=raw.turnDelta||{},unbound=v=>{if(!v||typeof v!=='object')return false;return Object.entries(v).some(([k,x])=>typeof x==='string'&&/(?:Ref|Refs)$/.test(k)&&/^person:\d+$/.test(x)&&!known.has(x))},badClaims=new Set(arr(delta.claims).filter(unbound).map(r=>r.claimId)),records=[];
   for(const [key,rows]of Object.entries(delta))if(Array.isArray(rows))delta[key]=rows.filter(row=>{if(unbound(row)||badClaims.has(row.claimId)){records.push({collection:key,record:copy(row)});return false}return true});
   if(records.length)raw.coverageComplete=false;return {raw,records};
 }
 function handles(catalog){
   const forward=new Map(),reverse=new Map();arr(catalog.characters).forEach((row,i)=>{if(row.ref){const h='person:'+String(i+1).padStart(3,'0');forward.set(row.ref,h);reverse.set(h,row.ref)}});
   const refKey=k=>/(?:Ref|Refs)$/.test(k)||k==='ref';
   function map(v,m,key=''){if(typeof v==='string')return refKey(key)?m.get(v)||v:v;if(Array.isArray(v))return v.map(x=>map(x,m,key));if(v&&typeof v==='object'){const row={...v};if(row.subjectRef&&row.key)row.key=stateProperty(row.subjectRef,row.key);if(row.actorRef&&row.stateKey)row.stateKey=stateProperty(row.actorRef,row.stateKey);return Object.fromEntries(Object.entries(row).map(([k,x])=>[k,map(x,m,k)]));}return v}
   return {encode:v=>map(v,forward),decode:v=>map(v,reverse),count:forward.size};
 }
 function openingContract(){return '첫 문단은 사용자 요청의 핵심 의도·반응·작은 착수를 2~3문장으로 완결한다. 만남·획득·도착 같은 복합 결과는 뒤에서 전개한다. 입력을 완료 사실로 복창하지 않는다. 한국어 약 60~100자는 부드러운 목표이며 필수 인과와 문맥 완결이 우선이다. 시간·날씨·장소 표제나 상태 나열로 시작하지 않는다. 배경 설명·회상·추가 소재·긴 결론은 뒤 문단에 분산한다. 문단 직후 빈 줄을 출력한다. 길이만으로 문장을 자르거나 다시 쓰지 않는다.'}
 function repairContract(style='',options={}){return [continuityContract(),'너는 공개 전 국소 문단 수리 담당이다. 전달된 repairCode의 문제만 고친다.',
 '사용자 입력은 조정 가능한 요청이며 이미 실행된 사실이 아니다. 입력과 다르다는 이유만으로 수리하지 않는다. 앞의 공개 본문은 확정되어 있다. 그 내용을 반복하거나 변경하지 말고 뒤에 이어질 미공개 본문과 자연스럽게 연결한다. 미공개 뒷부분은 문맥 참고이며 공개된 사실로 취급하지 않는다.',
 '수리에서도 최신 priorPublicText의 공개 결과가 비트 시작 위치·내부 장부보다 우선한다. 사건 전체 목표를 이 문단에서 달성시키는 일은 수리 범위가 아니다. priorPublicText에서 이미 끝난 행동을 새로 삽입하지 않는다. publicRepairs 또는 recentPublicRepairs의 승인된 공개 문구가 정정한 사실을 후속 문단에서 원래 오해로 되돌리지 않는다. 비유·의인화·익살·생략은 문맥이 이해되면 문장 오류가 아니다. 길다는 이유로 재작성하지 않는다. 첫 문단 수리인 경우 하나의 행동·반응을 2~3문장으로 마무리하고 나머지 설명을 덧붙이지 않는다.',
 'CONTINUITY_BREAK는 앞뒤 인과·위치·행동의 명백한 모순을 수정한다. ORDER_VIOLATION은 성급한 후행 행동을 유보한다. 그 외 코드는 해당 누설·메타·언어 문제를 수정한다. 비공개 정보를 추측해 보충하지 않는다.',
 '대상 문단의 길이·문장 수·문체·사용자 의도를 가능한 한 보존한다. 전체 비트의 최소 분량은 적용하지 않는다. 대상 문단만 출력하며 제목·설명은 쓰지 않는다. 별도 시공간 마커 계약이 있으면 그 비공개 기록만 함께 출력한다.',style,options.opening?openingContract():''].filter(Boolean).join('\n')}
 function finalizeRepairMetrics(turn){const entries=arr(turn.repairLog?.entries),accepted=entries.filter(row=>row.status==='ACCEPTED'),indices=new Set(accepted.map(row=>row.paragraphIndex).filter(Number.isInteger)),count=paragraphs(turn.text,turn.id).length;turn.metrics||={};turn.metrics.proseRepairApplied=accepted.length>0;if(turn.metrics.paragraphPipeline)Object.assign(turn.metrics.paragraphPipeline,{repairScope:'WHOLE_BEAT',repairs:accepted.length,repairAttempts:entries.length,zeroRepairPass:accepted.length===0,paragraphRepairRate:indices.size/Math.max(1,count)});if(turn.metrics.commitGraph)Object.assign(turn.metrics.commitGraph,{repairAttempted:entries.length>0,repairAccepted:accepted.length>0,zeroRepairPass:accepted.length===0,paragraphRepairRate:indices.size/Math.max(1,count)});}
 const labels={CONTINUITY_BREAK:'문맥 연결 교정',ORDER_VIOLATION:'진행 순서 교정',LANGUAGE_BREAK:'문장 언어 교정',META_LEAK:'내부 문구 교정',CONTROL_TOKEN_LEAK:'내부 문구 교정'};
 function repairLabel(code){return labels[code]||'공개 전 문단 교정'}
 function paragraphs(value,turnId='turn'){return prose(value).split(/\n\s*\n/u).map(x=>x.trim()).filter(Boolean).map((text,i)=>({paragraphId:turnId+':p'+(i+1),paragraphIndex:i+1,text}))}
 function reconcileTrack(track,value,turnId,start={}){
   const publicRows=paragraphs(value,turnId),segments=arr(track?.segments).filter(s=>{const row=publicRows[s.paragraphIndex-1];return row&&s.paragraphId===row.paragraphId}).map(s=>({...s}));
   const result=globalThis.CortexNarrativeSpacetime.normalize({segments},{start,turnId,source:'FINAL_PUBLIC_PARAGRAPHS'});
   result.segments.forEach((s,i)=>s.paragraphId=segments[i].paragraphId);
   result.complete=publicRows.length>0&&segments.length===publicRows.length&&publicRows.every(row=>segments.filter(s=>s.paragraphId===row.paragraphId).length===1)&&!result.issues.length;
   result.coveredParagraphs=segments.length;result.publicParagraphs=publicRows.length;return result;
 }

 // Keep author text; do not present engine-generated semantic annotations as author rules.
 function eventContract(event={}){
   const generated=new Set(['conditions','cancelConditions','effects','onSuccess','onFailure','description','summary','requiredItems','requiredDialogue','completionSignals']);
   const readingRow=r=>generated.has(String(r?.source||'').split(':')[0])?{description:r.description}:copy(r);
   const fields={};for(const k of ['conditions','cancelConditions','effects','onSuccess','onFailure','description','summary','requiredItems','requiredDialogue','completionSignals','requiredFunctions','policyConstraints'])
     if(event[k]!=null)fields[k]=k==='requiredFunctions'?arr(event[k]).filter(r=>r.source!=='ORIGINAL_EVENT_CONTRACT').map(readingRow):k==='policyConstraints'?arr(event[k]).map(readingRow):copy(event[k]);
   return {schema:'CORTEX_EVENT_SOURCE_CONTRACT_V1',eventId:String(event.id||''),fields};
 }
 function ensureEventContract(event){
   if(!event||!event.id||!['conditions','effects','onSuccess','onFailure','requiredDialogue','requiredItems'].some(k=>event[k]))return event;
   const id=event.id+':source-outcomes';
   event.requiredFunctions=arr(event.requiredFunctions);
   if(!event.requiredFunctions.some(r=>(r.id||r.ref)===id))event.requiredFunctions.push({id,description:'원본 사건 계약에서 요구한 주체·행위·결과·선행 순서가 실제로 성립했는지 확인한다. 단순 명칭 목록으로 생략된 필수 결과도 포함한다. 원본이 허용한 대체 달성·미개봉·거절 경로는 인정한다. 원본에 없는 의무를 추가하지 않는다. 이미 공개된 금지 위반은 반복하거나 불가능한 달성을 요구하지 말고 별도 수습으로 기록한다.',type:'WORLD_STATE',required:true,completionRole:'OUTCOME',completionRequired:true,source:'ORIGINAL_EVENT_CONTRACT',enforced:true});
   return event;
 }
 function continuityContract(){return [
 '첫 문단은 감사 없이 공개된다. 이후에는 그 공개 문단을 실제 전개의 출발점으로 받아 인과관계를 살려 정사와 연결한다. 이탈을 자동 취소하지 않는다. 꿈·환상·착각은 금지가 아니지만 우선순위가 낮고 설득력 있는 수습일 때 선택한다.',
 '조건에 후보 목록·수량·선택 범위가 있으면 먼저 그 제한이 적용되는 집합과 사건/비트/문단 범위를 구분해 집필한다. 사건 전체 제한은 앞 비트에서 이미 사용한 후보도 누적하여 지킨다. 목록 일부만 요구하면 그 일부를 선택해 충분히 묘사하고 다른 후보를 장식으로 추가하지 않는다. 특정 후보 집합의 개수 제한을 일반 사물·표현 전체의 금지로 확장하지 않는다. 물건 수, 종류 수, 행위 횟수, 언급 횟수는 원본이 정한 단위대로 구분한다.',
 '현재 사용자 입력은 이전의 의도·계획·보류 결정을 바꾸는 직접적인 계기가 될 수 있다. 별도의 외부 사건을 요구하지 않는다. 의도 변경과 이미 실행한 사실의 취소는 다르다. 새 입력도 이미 이루어진 행동·물건 소유·위치·타인의 동의를 소급 변경하지는 않는다.',
 '인물마다 직접 얻은 정보와 기존 공개 배경에서 아는 것을 구분한다. 독자나 다른 인물만 본 정보로 NPC가 상대의 목적·소지품·비밀을 알아맞히지 않는다. 기존 기억·관계는 새 관찰이나 추론으로 발명하지 않는다. 의미 있는 전달 장면이 있으면 새로운 인지가 가능하다.',
 '시간의 기준은 실제 행동이다. 두 시간 행동을 완료했다면 두 시간이 흐른다. 예정 종료 시각에 맞추려고 실제 행동 경과를 압축하지 않는다. 숨은 시공간 세그먼트의 clockEnd에 문단 종료의 실제 날짜 번호와 시각을 기록한다. 회상의 과거 시각이나 병렬 장면의 시각을 주인공 현재 시각으로 바꾸지 않는다. 본문의 실제 현재 시각과 같은 값을 쓰며 경과 초는 엔진이 계산한다.',
 'interpretation이 PENDING이면 시작 스냅샷은 마지막 확인 기록이지 현재 사실이 아니다. pendingTexts와 최신 공개 본문을 이어 쓰며 과거 위치로 돌아가거나 완료한 행동을 재연하지 않는다. 기록 복구를 위한 재확인 장면을 만들지 않는다.',
 'eventProgress.goalsAlreadyMet이면 사건 목표는 이미 달성됐다. 첫 비트 달성 후에도 둘째 비트는 사용자 입력을 반영해 자유롭게 이어 쓰고 완료한 행동을 반복하지 않는다. 입력이 약하면 스스로 개연성 있는 반응·마무리·이동을 집필한다. betweenEvents이면 이전 사건은 끝났다. 수용한 이탈의 존재·능력·사건과 결과를 유지하며 다음 사건의 접점을 만든다. 매 비트 반복되는 미스터리 암시 대신 행동의 결과·관계·정보 중 의미 있는 변화를 쓴다. 필요한 시간 경과와 연결 장면은 자율적으로 집필한다.',
 '중요한 이동 수단·소지품 사용은 확보 경로를 짧게 연결한다. 원본·사진·기억은 접근 가능한 내용이 다르다. 사용자가 물은 장소·시각·방법·문구는 다음 선택에 필요한 실제 내용을 답하며, 알 수 없으면 모름과 확인 경로를 쓴다. 확인했다는 동작만으로 답을 대신하지 않는다.',
 '사건 종료 예정 시각을 우선 존중하여 남은 시간에 맞는 행동 규모를 집필한다. 긴 이동·대화·새 갈등으로 시간을 불필요하게 넘기지 않는다. 그러나 실제로 공개한 시간은 되돌리거나 멈추지 않는다. 이미 예정 시간을 넘겼다면 이후 행동에도 실제 필요한 시간이 흐른다. 원본의 절대 마감은 예정 배정과 구분하여 초과의 결과·가능한 우회를 보여 주며, 일정 숫자를 맞추기 위해 순간이동·0초 행동·허위 완료를 쓰지 않는다.',
 '사건은 기본 3비트와 필요시 2연장 비트이며 최소 2비트부터 종결한다. 3비트를 채우려고 끝난 장면을 반복하지 않는다. 첫 비트에는 사용자 행동과 장면 경험을 충분히 집필하며 종결조건을 서둘러 몰아넣지 않는다. 자연스럽게 매듭지어진 장면은 억지로 늘리지 않는다. 종결을 얻으려 사용자 행동·중요한 반응·인과 과정을 생략하지 않는다.',
 '계획·사건 성공 표시는 실제 사실이 아니다. 원본 조건의 주체·행동·결과·선행 순서·선택 범위·금지·고정 정보를 보존한다. 조건 요약이나 물품·명칭 목록이 원본 조건을 대체하지 않는다. source-outcomes는 원본이 실제 요구하는 필수 결과만 판정하며 정보 공개만 요구한 사건에 소유·진실 입증을 추가하지 않는다.',
 '존재, 독자에게 공개, 특정 인물의 인지, 소유·확보, 동의, 권한, 행위 완료는 서로 다른 사실이다. 새 행동을 가능하게 하는 중요한 전제가 이전 공개 본문 또는 이번 초안에서 실제 성립해야 한다. 아직 확인되지 않은 전제는 미확정이며 부정 사실이 아니다. 계획이나 내부 기록만으로 완료시키지 않는다. 일상적인 생략을 모두 문제 삼지 말고 기존 상태와 충돌하거나 중요한 결과를 가능하게 하는 누락에 집중한다.',
 '새 사실을 쓰는 것은 허용된다. 이전에 없던 정보라도 이번 초안의 관찰·확인·전달·이동·인계가 성립시키면 신규 사실이다. 반대로 사용자 입력의 소지·인지·완료 전제를 그대로 사실로 쓰면 안 된다. 공개 이력에 없다는 이유만으로 신규 사실을 삭제하지 말고, 구체적인 기존 사실·세계 제약과의 충돌 또는 중요한 성립 과정의 누락을 구분한다.',
 '중요한 지식은 내용뿐 아니라 누가 어떻게 알았는지를 보존한다. 직접 관찰, 타인의 보고, 기록의 표시, 추정, 미확인은 다르다. 날짜를 시각으로 정밀화하거나 기록에서 본 내용을 기관의 확인·타인의 발언으로 바꾸지 않는다. 새로운 확인이 실제 서술되면 그 출처를 추가할 수 있다. connections.knowledge는 공개 근거가 있는 지식의 출처이며 인물의 보고·추측을 객관적 진실로 승격하지 않는다.',
 '작품이 내용을 지정한 문서·발언·메시지·계약·날짜·지시는 고정 자료다. 직접 인용은 지정 원문을 보존하고 요약·회상도 대상·조건·시한·긍정/부정을 바꾸지 않는다. 인물의 오해는 자료 자체와 구별한다. 자료를 전달받았다고 인물이 이미 발견·소지·인지했다고 쓰지 않는다. 공개 조건을 지켜 필요한 부분만 드러내며 숨은 조건을 본문에 설명하지 않는다.',
 '다른 인물 시점·병렬 장면·회상·전언·영상은 허용한다. 현재 보여주는 장면의 장소와 각 인물의 실제 위치·인지 상태를 분리한다. 독자가 본 내용이 주인공에게 자동 전달되지 않는다. 타인의 이동이나 장면 전환만으로 주인공을 이동시키지 않는다.',
 '원본 계약과 이미 공개된 정사가 어긋나면 과거 공개 본문과 그에 근거한 사용자 선택을 보존한다. 원문으로 슬쩍 바꾸거나 인계·지식 습득을 내부 기록에서 발명하지 않는다. 이후 설명 가능한 인과를 실제 집필하여 수습한다. 새 배후·위조·능력을 수습 편의상 임의로 확정하지 않는다.',
 '사용자 선택은 조정할 수 있지만 정사 복귀만을 위해 스스로 겁쟁이라 자책하거나 갑자기 마음을 바꾸게 하지 않는다. 명시적 거절·보류·이탈을 우선 실제 행동으로 반영하고 그 결과 위에 사건을 연결한다. 번복은 이미 드러난 동기·새로 겪은 사유·대가로 납득 가능해야 한다. 일시 보류와 영구 거절은 다르며 원본의 대체 경로도 활용한다.',
 '비유·의인화·익살은 물리 상태의 사실 주장과 구분한다. 표현 취향이나 더 안전하게 읽힐 가능성만으로 수리하지 않는다. 공개된 사건 사실과 고정 인용문은 보존하되 우연한 어색한 단위·말버릇까지 후속 문장에 반복할 의무는 없다. 자연스러운 표현으로 이어 쓰되 과거 공개 문장은 소급 수정하지 않는다.'
 ].join('\n');}
 function stateProperty(subject,key){
   let value=String(key||''),prefix=String(subject||'')+':';
   if(subject)while(value.startsWith(prefix))value=value.slice(prefix.length);
   return value;
 }
 function canonicalState(state={},subjects=[]){
   const known=[...new Set(subjects.filter(Boolean))].sort((a,b)=>b.length-a.length),out={},changes=[];
   for(const [key,value]of Object.entries(state)){
     const subject=known.find(ref=>key.startsWith(ref+':'));
     const target=subject?subject+':'+stateProperty(subject,key):key;
     if(target!==key)changes.push({key,target,value});else out[key]=copy(value);
   }
   // Existing insertion order preserves the most recent explicit qualified correction.
   for(const row of changes)out[row.target]=copy(row.value);
   return {state:out,changes:changes.map(({key,target})=>({key,target}))};
 }
 function recoverStateKeys(root){
   const visit=(v,key='')=>{
     if(!v||typeof v!=='object'||['media','settings','repairLog','adjudicationLog','sameTurnResume','package','sourcePackage','eventGraph'].includes(key))return;
     if(v.commitState&&typeof v.commitState==='object'){
       const refs=[...Object.keys(v.commitState).flatMap(k=>{const pieces=k.split(':');return pieces.length>2&&pieces[0]===pieces[1]?[pieces[0]]:[]}),...arr(root.scenario?.characters).map(r=>r.id),root.scenario?.protagonist?.id,...Object.keys(root.canonicalSession?.cast?.entities||{})].filter(Boolean);
       const result=canonicalState(v.commitState,refs);if(result.changes.length){v.commitState=result.state;v.stateKeyRecovery={schema:'CORTEX_STATE_KEY_RECOVERY_V1',changes:result.changes};}
     }
     for(const [k,x]of Object.entries(v))if(k!=='stateKeyRecovery')visit(x,k);
   };visit(root);
 }
 function connectionHistory(rows){return arr(rows).map(row=>{
   if(!row.resolvedAtTurnId||row.resolution)return copy(row);
   return {...copy(row),openedEvidence:copy(row.openedEvidence||{reason:row.reason||'',evidenceQuote:row.evidenceQuote||'',turnId:row.sourceTurnId||''}),reason:'',evidenceQuote:'',resolution:{outcome:'LEGACY_UNVERIFIED',reason:'',evidenceQuote:'',turnId:row.resolvedAtTurnId,evidenceStatus:'UNAVAILABLE'}};
 });}
 function connectionLedger(prior={},handoff={},turnId=''){
   const outcomes=new Map(arr(handoff.dependencies).filter(r=>r.status==='ESTABLISHED').map(r=>[r.id,{id:r.id,outcome:'SATISFIED',reason:r.reason,evidenceQuote:r.evidenceQuote}]));
   for(const row of arr(handoff.resolutions))if(row.id)outcomes.set(row.id,copy(row));
   const resolved=new Set([...arr(handoff.resolvedDependencyIds),...outcomes.keys()]),items=new Map(arr(prior.dependencies).map(row=>[row.id,copy(row)])),history=connectionHistory(prior.history);
   for(const id of resolved)if(items.has(id)){
     const old=items.get(id),result=outcomes.get(id),hasEvidence=Boolean(result?.reason&&result?.evidenceQuote);
     history.push({...old,status:result?.outcome==='OBSOLETE'?'OBSOLETE':'RESOLVED',reason:result?.reason||'',evidenceQuote:result?.evidenceQuote||'',openedEvidence:copy(old.openedEvidence||{reason:old.reason||'',evidenceQuote:old.evidenceQuote||'',turnId:old.sourceTurnId||''}),resolution:{outcome:result?.outcome||'LEGACY_UNVERIFIED',reason:result?.reason||'',evidenceQuote:result?.evidenceQuote||'',turnId,evidenceStatus:hasEvidence?'MODEL_REPORTED':'UNAVAILABLE'},resolvedAtTurnId:turnId});items.delete(id);
   }
   for(const row of arr(handoff.dependencies))if(row.id&&row.status!=='ESTABLISHED'&&!resolved.has(row.id)){
     const old=items.get(row.id);items.set(row.id,{...copy(row),openedEvidence:copy(old?.openedEvidence||{reason:old?.reason||row.reason||'',evidenceQuote:old?.evidenceQuote||row.evidenceQuote||'',turnId:old?.sourceTurnId||turnId}),sourceTurnId:turnId});
   }
   const knowledge=new Map(arr(prior.knowledge).map(row=>[row.id,copy(row)])),knowledgeHistory=arr(prior.knowledgeHistory).map(copy);
   for(const row of arr(handoff.knowledgeChanges))if(row.id){const old=knowledge.get(row.id);if(old)knowledgeHistory.push(copy(old));knowledge.set(row.id,{...copy(row),sourceTurnId:turnId});}
   return {schema:'CORTEX_CAUSAL_CONNECTION_LEDGER_V1',dependencies:[...items.values()],history,knowledge:[...knowledge.values()],knowledgeHistory,scenes:copy(handoff.scenes||[]),updatedTurnId:turnId};
 }
 // Historical audit records stay in saves; writers receive all active facts, not stale resolution reasons.
 function connectionContext(ledger={}){return {schema:ledger.schema||'CORTEX_CAUSAL_CONNECTION_LEDGER_V1',dependencies:copy(ledger.dependencies||[]).map(({openedEvidence,...row})=>row),knowledge:copy(ledger.knowledge||[]),scenes:copy(ledger.scenes||[]),updatedTurnId:ledger.updatedTurnId||''};}

 function publicRepairContext(entries=[],publishedText=''){return arr(entries).filter(row=>row.status==='ACCEPTED'&&['OPENING','PARAGRAPH'].includes(row.kind)&&row.after&&String(publishedText).includes(row.after)).map(row=>({paragraphIndex:row.paragraphIndex,text:row.after}));}
 globalThis.CortexQuality=Object.freeze({publicRepairContext,eventContract,ensureEventContract,continuityContract,stateProperty,canonicalState,recoverStateKeys,connectionLedger,connectionContext,prose,migrate,recoverReferences,quarantineHandles,handles,openingContract,repairContract,repairLabel,finalizeRepairMetrics,paragraphs,reconcileTrack});
})();
