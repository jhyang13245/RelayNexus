(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  // Opening is an authored starting point, not a condition the player must prove.
  // Check session progress as well as the declared entry so later candidates and
  // restored mid-story sessions retain their occurrence checks.
  function isOpeningEvent(sc,turns=[]){
    const runtime=sc?.runtime||{},id=sc?.event?.id;
    if(!id||runtime.instantStory||(runtime.eventLedger?.sealed||[]).length||(runtime.occurrenceDecisions||[]).length||turns.some(t=>t?.status==='COMMITTED'))return false;
    const route=runtime.packageV15?.jieum?.routes?.[runtime.jieum?.routeIndex||0],opening=runtime.packageContract?.openingContract||{};
    const declared=route?.eventIds?.[0]||opening.activeEventId||opening.openingEventId||opening.startEventId||opening.eventId;
    return !declared||String(declared)===String(id);
  }
  async function select(scenario,evaluate){
    const sc=clone(scenario),records=[...(sc.runtime.occurrenceDecisions||[])],visited=new Set();
    delete sc.runtime.noEligibleEvent;
    const accepted=()=>({scenario:sc,selected:true,changed:sc.event.id!==scenario.event.id||records.length!==(scenario.runtime.occurrenceDecisions||[]).length||!!scenario.runtime.noEligibleEvent});
    // Candidate checks are advisory when no eligible successor can be chosen.
    // Keep the original successor and world; the author must narrate the bridge.
    const fallback=(reason)=>{
      const kept=clone(scenario);delete kept.runtime.noEligibleEvent;
      kept.runtime.occurrenceBridge={schema:'CORTEX_OCCURRENCE_BRIDGE_V1',eventId:kept.event.id,condition:String(kept.event.cortexDesign?.occurrence||''),reason,authority:'WRITING_TARGET_NOT_PROOF',checked:records.slice((scenario.runtime.occurrenceDecisions||[]).length)};
      return {scenario:kept,selected:true,changed:true,bridging:true};
    };
    if(sc.runtime.occurrenceBridge?.eventId===sc.event?.id)return {...accepted(),bridging:true};
    while(sc.event){
      const event=sc.event,design=event.cortexDesign;
      if(visited.has(event.id)||visited.size>=512)return fallback('OCCURRENCE_EVENT_CYCLE');visited.add(event.id);
      if(!design?.occurrenceEnabled)return accepted();
      if(!String(design.occurrence||'').trim())return fallback('OCCURRENCE_CONDITION_EMPTY');
      if(records.some(r=>r.eventId===event.id&&r.verdict==='TRUE'))return accepted();
      let verdict;try{verdict=await evaluate(event,sc)}catch(error){return fallback(String(error?.message||'OCCURRENCE_CHECK_FAILED'))}
      if(!['TRUE','FALSE'].includes(verdict?.verdict)||!String(verdict.evidence||'').trim())return fallback('OCCURRENCE_UNCERTAIN');
      records.push({eventId:event.id,verdict:verdict.verdict,evidence:verdict.evidence,authority:'PUBLISHED_STATE_ONLY'});sc.runtime.occurrenceDecisions=records;
      if(verdict.verdict==='TRUE')return accepted();
      const route=sc.runtime.packageV15?.jieum?.routes?.[sc.runtime.jieum?.routeIndex||0];
      const terminal=event.id===route?.endingEventId||(sc.runtime.packageV15?.branchEnding?.terminalEvents||[]).some(row=>row.terminalEventId===event.id);
      if(terminal)return fallback('NO_ELIGIBLE_SUCCESSOR');
      const next=event.nextEvent||sc.runtime.packageContract?.eventGraph?.nodes?.[event.nextEventId];
      if(!next||(route&&!route.eventIds.includes(next.id)))return fallback('NO_ELIGIBLE_SUCCESSOR');
      sc.event=clone(next);sc.runtime.eventLedger={...(sc.runtime.eventLedger||{}),activeEventId:sc.event.id};
      sc.runtime.systemicEventState={schema:'CORTEX_EVENT_STATE_V8',activeEventId:sc.event.id,phase:'ACTIVE',eventBeats:0,eventTurns:0,minTurns:3,closureExtensionCount:0};
      sc.runtime.eventMachine={schema:'CORTEX_EVENT_FSM_V3',activeEventId:sc.event.id,state:'ACTIVE',eventBeats:0,eventTurns:0,extensionCount:0};
      sc.runtime.evidenceLedger=[];sc.runtime.requirementVerdicts={schema:'CORTEX_REQUIREMENT_VERDICT_V4',eventId:sc.event.id,verdicts:{},records:{}};
    }
    throw Error('OCCURRENCE_EVENT_MISSING');
  }
  function writerBridge(sc){
    const bridge=sc?.runtime?.occurrenceBridge;
    return bridge?.eventId===sc?.event?.id?{eventId:bridge.eventId,condition:bridge.condition,authority:'WRITING_TARGET_NOT_PROOF'}:null;
  }
  const writerInstruction='occurrenceBridge가 있을 때만 적용한다. 발생조건을 만족하는 후속 사건을 선택하지 못해 현재 사건 안에서 연결 과정을 집필한다. condition은 이미 성립한 사실이 아닌 집필 목표다. 최신 공개 본문과 startState 및 사용자 행동에서 출발하여 필요한 시간 경과·대기·이동·연락·인물 행동을 개연성 있게 서술해 조건에 도달한 뒤 사건 본내용을 진행한다. 경과를 본문에 쓰지 않고 시계나 장소만 바꾸거나, 아직 도착하지 않은 물건이 이미 도착했다고 전제하지 않는다. 이미 공개 본문에서 충족한 조건은 반복하지 않는다. 플레이어가 하지 않은 동의·선택을 대신 확정하거나 과거 선택·세계 규칙을 뒤집지 않는다. 조건을 문자 그대로 실현할 수 없으면 작품이 허용한 대체 경로와 현재 선택의 결과를 살려 이어 쓴다. 발생조건 미충족이나 판정 실패를 이유로 독자에게 진행 불가 안내를 출력하지 않는다. 엔딩·루트 해금·종결조건의 달성을 임의로 선언하지 않는다.';
  root.CortexOccurrence=Object.freeze({revision:'1.1.0',select,isOpeningEvent,writerBridge,writerInstruction});
})(globalThis);
