/* v1.31.6 — 헤드리스 통합 하네스.
   빌드된 Standalone 전체를 jsdom에 띄우고 fetch만 모킹한다. 함수를 잘라내지 않는다 — 제품이 실제로 실행된다.
   IndexedDB(fake-indexeddb)와 localStorage는 창을 닫았다 다시 열어도(새 JSDOM) 같은 저장소를 공유해 '탭 종료 → 재시작'을 재현한다. */
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';

export function makeModel(overrides = {}) {
  const calls = [];
  const jsonResponse = obj => ({ ok: true, status: 200, body: null, text: async () => JSON.stringify(obj), json: async () => obj });
  const outputText = text => jsonResponse({ output: [{ content: [{ type: 'output_text', text }] }], usage: { input_tokens: 1200, output_tokens: 300, input_tokens_details: { cached_tokens: 800 } } });
  const parseClock = value => { const match=String(value||'').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u);return match?(+match[1])*3600+(+match[2])*60+(+(match[3]||0)):0; };
  const clock = value => { const sec=((Math.floor(+value||0)%86400)+86400)%86400;return [Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(row=>String(row).padStart(2,'0')).join(':'); };
  const writerTrack = (prose,payload={},recommendations=[]) => {
    if (/<!--CORTEX_ST_V1 /u.test(String(prose))) return prose;
    const start=payload?.startState||payload?.current||{},authority=payload?.temporalAuthority||{},startDay=Math.max(0,+start.day||0),startTime=String(start.time||'00:00:00'),waiting=String(authority.eventPhase||'')==='WAITING_FOR_START',endDay=Number.isFinite(+(waiting?authority.maxEndDay:authority.defaultEndDay))?+(waiting?authority.maxEndDay:authority.defaultEndDay):startDay,endTime=String((waiting?authority.maxEndTime:authority.defaultEndTime)||startTime),paragraphs=String(prose).split(/\n\s*\n/u).map(row=>row.trim()).filter(Boolean),locations=payload?.commitGraphCatalog?.locations||payload?.publicLocations||[],lastMention=(source)=>locations.map(row=>({row,at:Math.max(...[row?.label,...(row?.aliases||[])].filter(Boolean).map(label=>String(source).lastIndexOf(label)))})).filter(hit=>hit.at>=0).sort((a,b)=>b.at-a.at)[0]?.row,explicit=lastMention(prose),requested=lastMention(payload?.rawUserInput||''),departing=/아직[^.!?]*(?:닿지|도착하지|들어가지)|(?:쪽으로|향해)\s*(?:걸음을|발걸음을)/u.test(String(prose)),alley=/골목/u.test(String(prose))?'골목':'',alleyNode=locations.find(row=>[row?.label,...(row?.aliases||[])].some(label=>label&&String(label).includes('골목'))),sameRef=explicit?.ref&&String(explicit.ref)===String(start.locationRef||''),finalLocation=departing&&alley?alley:String(sameRef?start.location:explicit?.label||start.location||''),finalLocationRef=departing&&alley?String(alleyNode?.ref||''):String(explicit?.ref||start.locationRef||''),destinationLocation=departing?String(requested?.label||''):finalLocation,destinationLocationRef=departing?String(requested?.ref||''):finalLocationRef,startTick=startDay*86400+parseClock(startTime),endTick=Math.max(startTick,endDay*86400+parseClock(endTime)),count=Math.max(1,paragraphs.length),segments=paragraphs.map((paragraph,index)=>{const a=Math.floor(startTick+(endTick-startTick)*index/count),b=Math.floor(startTick+(endTick-startTick)*(index+1)/count),last=index===count-1,changed=last&&(finalLocationRef&&finalLocationRef!==String(start.locationRef||'')||!finalLocationRef&&finalLocation!==String(start.location||'')),motionState=last?(departing?'IN_TRANSIT':changed?'ARRIVED':'STATIONARY'):'STATIONARY';return {paragraphIndex:index+1,startDay:Math.floor(a/86400),startTime:clock(a),endDay:Math.floor(b/86400),endTime:clock(b),startLocation:String(start.location||''),endLocation:last?finalLocation:String(start.location||''),startLocationRef:String(start.locationRef||''),endLocationRef:last?finalLocationRef:String(start.locationRef||''),motionState,destinationLocation:last?destinationLocation:'',destinationLocationRef:last?destinationLocationRef:'',movementScope:changed||departing?'LOCAL':'UNKNOWN',transitionReason:last&&changed?'본문에 서술된 이동과 현재 위치':waiting?'본문의 대기와 시간 경과':'장면 전개',evidenceQuote:paragraph.replace(/\s+/gu,' ').slice(0,80)}}),track={schema:'CORTEX_NARRATIVE_SPACETIME_TRACK_V1',segments};
    if(Array.isArray(recommendations)&&recommendations.length)track.recommendations=recommendations;
    return `${prose}<!--CORTEX_ST_V1 ${JSON.stringify(track)}-->`;
  };
  const model = {
    calls,
    writer: (payload, req) => { model.turnCounter = (model.turnCounter || 0) + 1; const n = model.turnCounter;
      /* 턴마다 다른 문장 — 실제 작가처럼. 같은 문장을 반복하면 정사 장부의 중복 접기가 발동해 시험이 제품을 오해한다 */
      return `${String(payload?.rawUserInput || '한시우').slice(0, 12)}. 한시우는 ${n}번째로 숨을 골랐다. 현관의 낡은 우산 두 개가 나란히 기대 있었고, 부엌에서는 서로 다른 무늬의 찻잔이 마른 채 놓여 있었다.\n\n그는 그 중 하나를 집어 들었다가 도로 내려놓았다. 밖에서 자전거 벨이 짧게 울렸다. ${n}분이 흘렀다.`; },
    recommendations: () => [
      {label:'현관의 낡은 우산 두 개를 나란히 비교해 남은 흔적을 짚어 본다.',risk:'LOW'},
      {label:'부엌의 서로 다른 찻잔이 누구의 것이었는지 조심스럽게 물어본다.',risk:'MEDIUM'},
      {label:'밖에서 울린 자전거 벨을 따라 문을 열고 직접 골목으로 나가 본다.',risk:'HIGH'}
    ],
    extractor: (payload, prose, req) => {
      /* 추출 계약은 developer 텍스트 끝에 {exampleClaim,...,catalog:compact} JSON을 붙인다 — 실제 형식 그대로 읽는다 */
      const developer = req?.input?.[0]?.content?.[0]?.text || '';
      let tail = {}; try { tail = JSON.parse(developer.slice(developer.lastIndexOf('\n{') + 1)); } catch {}
      const catalog = tail.catalog || payload?.catalog || {};
      const actor = (catalog.characters || [])[0]?.ref || 'character:protagonist';
      const actions = (catalog.actions || []).map(a => typeof a === 'string' ? a : a?.ref).filter(Boolean);
      const action = actions.find(a => /inspect|other/.test(a)) || actions[0] || 'action:other';
      const quote = `${model.turnCounter || 0}분이 흘렀다`;/* 턴마다 다른 실제 인용 */
      const input = String(payload?.rawUserInput || '');
      /* 입력이 카탈로그의 장소를 가리키면 이동 claim을 낸다 — 실제 추출기가 하는 일 */
      const destination = (catalog.locations || []).find(loc => [loc.label, ...(loc.aliases || [])].some(a => a && a.length >= 2 && input.includes(a)));
      const current = catalog.current?.locationRef || '';
      const claims = [{ claimId: 'c1', paragraphIndex: 1, actorRef: actor, actionRef: action, participationMode: 'PHYSICAL_SCENE', presenceMode:'BODY_PRESENT', channelMode:'DIRECT', presenceRationale:'같은 장면에서 육체로 행동한다.', actuality: 'COMMITTED', completionStatus: 'COMPLETED', confidence: 'VERIFIED', evidenceQuote: quote, statement: `한시우가 ${model.turnCounter || 0}번째로 찻잔을 집었다 놓았다` }];
      if (destination && destination.ref !== current && actions.includes('action:move')) claims.push({ claimId: 'c2', paragraphIndex: 1, actorRef: actor, actionRef: 'action:move', sourceLocationRef: current, destinationLocationRef: destination.ref, movementScope: 'LOCAL', participationMode: 'PHYSICAL_SCENE', presenceMode:'BODY_PRESENT', channelMode:'DIRECT', presenceRationale:'같은 장면의 육체 이동이다.', actuality: 'COMMITTED', completionStatus: 'COMPLETED', confidence: 'VERIFIED', evidenceQuote: '밖에서 자전거 벨이 짧게 울렸다' });
      const graph = { schema: 'CORTEX_COMMIT_GRAPH_V2', claims,
        causalEdges: [], inputRealizations: [{ inputQuote: input.slice(0, 20), claimId: destination ? 'c2' : 'c1', status: 'REALIZED' }], temporalRealizations: [], entityDeltas: [], factAssertions: [], locationDeltas: [], presenceDeltas: [], stateDeltas: [], capabilityExecutions: [], resourceDeltas: [], worldRuleEvidence: [], canonRealizations: [], beatRealizations: [], unresolved: [] };
      return `<CORTEX_COMMIT_GRAPH_V2>${JSON.stringify(graph)}</CORTEX_COMMIT_GRAPH_V2>`;
    },
    judge: () => ({ schema: 'CORTEX_CONTINUITY_JUDGE_V1', verdict: 'OK', code: 'NONE', span: [0, 0], claimDecisions: [], continuity: 'KEEP', continuitySpan: [0, 0] }),
    adjudicator: (payload) => ({ schema: 'CORTEX_CANON_ADJUDICATION_V2', invariantThreats: [], verdicts: (payload?.requirements || []).map(r => ({ requirementRef: r.requirementRef, status: 'MET', evidence: [{ sourceRef: 'CURRENT_BEAT', evidenceQuote: '현관의 낡은 우산 두 개가 나란히 기대 있었고' }] })) }),
    preflight: payload => { const legacy=model.judge({...payload,mode:'PARAGRAPH_SAFETY',paragraphText:payload?.draft}); const repair=['WITHHOLD','BREAKING'].includes(String(legacy?.verdict||'')); return {schema:'CORTEX_PREPUBLICATION_SAFETY_V1',decision:repair?'REPAIR':'PASS',code:repair?(legacy?.code||'OTHER_PUBLICATION_RISK'):'NONE',unsafeSurfaces:[]}; },
    unified: (payload, req) => {
      /* v1.36 호환 어댑터: 기존 헤드리스 시나리오가 커스텀 extractor/adjudicator/judge로 만든
         의미 결과를 새 단일 판정관 응답으로 합친다. 제품은 이 셋을 따로 호출하지 않는다. */
      const syntheticReq={...req,input:[{role:'developer',content:[{type:'input_text',text:`통합 판정 시험\n${JSON.stringify({catalog:payload?.catalog||{}})}`}]},...(req?.input||[]).slice(1)]},legacyPayload={...payload,fullTurnText:String(payload?.fullText||''),requirements:(payload?.catalog?.requirements||[]).map(row=>({requirementRef:row.ref,description:row.description,type:row.type})),evidenceSegments:(payload?.evidenceSources||[]).map(row=>({evidenceRef:row.sourceRef,sourceRef:row.sourceRef,text:row.text}))};
      const rawGraph=String(model.extractor(legacyPayload,payload?.fullText||'',syntheticReq)),match=rawGraph.match(/<CORTEX_COMMIT_GRAPH_V2>([\s\S]+)<\/CORTEX_COMMIT_GRAPH_V2>/u);let graph={claims:[]};try{graph=match?JSON.parse(match[1]):JSON.parse(rawGraph)}catch{}
      const finalJudge=model.judge({...legacyPayload,mode:'TURN_FINAL',fullTurnText:payload?.fullText||''}),decisions=new Map((finalJudge?.claimDecisions||[]).map(row=>[row.claimId,row]));
      graph.claims=(graph.claims||[]).map(row=>{const decision=decisions.get(row.claimId);return decision&&decision.actuality!=='COMMITTED'?{...row,actuality:decision.actuality,confidence:'UNCERTAIN'}:row});
      const endpointPeople=new Set((payload.catalog?.characters||[]).filter(row=>row.present).map(row=>row.ref));if(payload.publicState?.protagonistRef)endpointPeople.add(payload.publicState.protagonistRef);for(const row of graph.presenceDeltas||[]){const claim=(graph.claims||[]).find(c=>c.claimId===row.claimId);if(row.status==='ABSENT')endpointPeople.delete(row.characterRef);else if(claim?.participationMode==='PHYSICAL_SCENE'&&(claim.presenceMode==='BODY_PRESENT'||!claim.presenceMode))endpointPeople.add(row.characterRef);}
      for(const row of graph.entityDeltas||[])if(row.persistence==='TURN_LOCAL')endpointPeople.delete(row.entityRef);
      const legacy=model.adjudicator(legacyPayload),sourceByRef=new Map((legacyPayload.evidenceSegments||[]).map(row=>[row.evidenceRef,row.text])),requirements=(legacy?.verdicts||[]).map(row=>({requirementRef:row.requirementRef,status:row.status,evidenceQuotes:(row.evidence||[]).map(e=>e.evidenceQuote||String(sourceByRef.get(e.evidenceRef||e.sourceRef)||'').slice(0,240)).filter(Boolean)}));
      return {schema:'CORTEX_UNIFIED_ADJUDICATION_V1',resolvedPendingTurnIds:(payload.publicState?.interpretation?.pending||[]).map(r=>r.turnId),eventEntry:{status:'ENTERED',reason:'Mock event entry'},handoff:{scenes:[],dependencies:[],resolvedDependencyIds:[]},continuity:{status:'CLEAN',issues:[]},turnDelta:{schema:'CORTEX_TURN_DELTA_V1',scenePresence:graph.scenePresence||{status:'COMPLETE',presentCharacterRefs:[...endpointPeople],evidenceQuote:String(payload.fullText||'').slice(-120)},claims:(graph.claims||[]).map(row=>({claimId:String(row.claimId||''),actorRef:String(row.actorRef||''),actionRef:String(row.actionRef||''),targetRef:String(row.targetRef||''),sourceLocationRef:String(row.sourceLocationRef||''),destinationLocationRef:String(row.destinationLocationRef||''),destinationLocationLabel:String(row.destinationLocationLabel||''),movementScope:['LOCAL','REMOTE'].includes(row.movementScope)?row.movementScope:'UNKNOWN',participationMode:['PHYSICAL_SCENE','REMOTE_LIVE','OFFSCREEN_COMMITTED','MEDIATED_RECORD','NOT_APPLICABLE','UNKNOWN'].includes(row.participationMode)?row.participationMode:'UNKNOWN',presenceMode:['BODY_PRESENT','REMOTE_SOURCE','NONPHYSICAL_MANIFESTATION','PROXY_PRESENT','OFFSCREEN','NOT_APPLICABLE','UNKNOWN'].includes(row.presenceMode)?row.presenceMode:(row.participationMode==='PHYSICAL_SCENE'?'BODY_PRESENT':row.participationMode==='REMOTE_LIVE'?'REMOTE_SOURCE':'UNKNOWN'),channelMode:['DIRECT','PHONE','TEXT','VIDEO','TELEPATHY','MAGIC_PROJECTION','DREAM_LINK','REMOTE_CONTROL','RECORD','OTHER','NONE','UNKNOWN'].includes(row.channelMode)?row.channelMode:(row.participationMode==='PHYSICAL_SCENE'?'DIRECT':'UNKNOWN'),presenceRationale:String(row.presenceRationale||'참여 방식과 현장 육체 존재를 구분했다.'),actuality:['COMMITTED','NONCOMMITTED','UNKNOWN'].includes(row.actuality)?row.actuality:'UNKNOWN',completionStatus:['COMPLETED','PARTIAL','BLOCKED','ATTEMPTED','UNKNOWN'].includes(row.completionStatus)?row.completionStatus:'UNKNOWN',startTime:String(row.startTime||''),endTime:String(row.endTime||''),stateKey:String(row.stateKey||''),stateValue:String(row.stateValue??''),capabilityExecutionRef:String(row.capabilityExecutionRef||row.executionRef||''),evidenceQuote:String(row.evidenceQuote||'')})),stateChanges:(graph.stateDeltas||[]).map(row=>({subjectRef:String(row.subjectRef||''),claimId:String(row.claimId||''),key:String(row.key||''),value:String(row.value??''),evidenceQuote:String(row.evidenceQuote||'')})),entityChanges:(graph.entityDeltas||[]).map(row=>({entityRef:String(row.entityRef||''),label:String(row.label||''),entityType:String(row.entityType||'OTHER'),persistence:['SESSION','TURN_LOCAL','REUSE_EXISTING','IGNORE'].includes(row.persistence)?row.persistence:'SESSION',memoryReason:String(row.memoryReason||'통합 판정관이 다음 문맥에 필요한 엔티티로 판정했다.'),claimId:String(row.claimId||''),evidenceQuote:String(row.evidenceQuote||'')})),factChanges:(graph.factAssertions||[]).map(row=>({subjectRef:String(row.subjectRef||''),predicate:String(row.predicate||''),objectRef:String(row.objectRef||''),value:String(row.value??''),claimId:String(row.claimId||''),evidenceQuote:String(row.evidenceQuote||'')})),locationChanges:(graph.locationDeltas||[]).map(row=>({locationRef:String(row.locationRef||''),label:String(row.label||''),anchorRef:String(row.anchorRef||''),relation:String(row.relation||'ADJACENT_TO'),claimId:String(row.claimId||''),evidenceQuote:String(row.evidenceQuote||'')})),presenceChanges:(graph.presenceDeltas||[]).map(row=>({characterRef:String(row.characterRef||''),status:String(row.status||'PRESENT'),claimId:String(row.claimId||''),evidenceQuote:String(row.evidenceQuote||'')})),capabilityExecutions:(graph.capabilityExecutions||[]).map(row=>({executionRef:String(row.executionRef||''),claimId:String(row.claimId||''),actorRef:String(row.actorRef||''),capabilityRef:String(row.capabilityRef||'')})),resourceChanges:(graph.resourceDeltas||[]).map(row=>({executionRef:String(row.executionRef||''),resourceRef:String(row.resourceRef||''),claimId:String(row.claimId||''),amountDelta:Number(row.amountDelta)||0,evidenceQuote:String(row.evidenceQuote||'')})),temporalRealizations:(graph.temporalRealizations||[]).map(row=>({inputQuote:String(row.inputQuote||''),claimId:String(row.claimId||''),requestedDurationSec:Number(row.requestedDurationSec)||0,requestedDurationText:String(row.requestedDurationText||''),committedDurationSec:Number(row.committedDurationSec)||0,disposition:String(row.disposition||'UNKNOWN')})),inputRealizations:(graph.inputRealizations||[]).map(row=>({inputQuote:String(row.inputQuote||''),claimId:String(row.claimId||''),semanticAlignment:['PRESERVED','PARTIAL','BLOCKED','CONTRADICTED'].includes(String(row.semanticAlignment||''))?String(row.semanticAlignment):'PRESERVED'})),beatRealizations:(graph.beatRealizations||[]).map(row=>({beatRef:String(row.beatRef||''),claimId:String(row.claimId||'')}))},requirements,repairDebt:{required:false,kind:'NONE',instruction:'',resolvedTurnIds:[]}};
    },
    nextEventPlan: payload => ({schema:'CORTEX_NEXT_EVENT_CLOSURE_PLAN_V1',steps:(payload?.requirements||[]).map(row=>({requirementRef:row.requirementRef,cause:`${row.description}의 남은 원인이 드러난다.`,process:`${row.description}이 장면 안에서 진행된다.`,result:`${row.description}이 실제 결과로 성립한다.`})),bridgeToCurrentEvent:'그 결과가 현재 사건의 첫 행동으로 이어진다.',firstParagraphOnly:true}),
    nextEventReview: payload => {const quote=String(payload?.firstParagraph||'').trim().slice(0,Math.min(80,String(payload?.firstParagraph||'').trim().length));return {schema:'CORTEX_NEXT_EVENT_CLOSURE_REVIEW_V1',decision:'PASS',verdicts:(payload?.requirements||[]).map(row=>({requirementRef:row.requirementRef,status:'MET',evidenceQuote:quote})),hasCauseProcessResult:true,bridgesToCurrentEvent:true}},
    capsule: () => ({ summary: '프롤로그의 흐름. 한시우는 집에 남은 두 사람분의 흔적을 확인했다.', majorChoices: ['집을 둘러본다'], characterChanges: [], unresolvedThreads: ['택배의 정체'], importantEntities: ['한명진'], locations: ['한명진의 집'] }),
    ...overrides
  };
  model.fetch = async (url, init) => {
    if(String(url)==='/api/account')return jsonResponse({authenticated:true,account:{id:'synthetic-test-account',status:'ACTIVE'}});
    const body = init?.body ? JSON.parse(init.body) : {};
    const expand=v=>{const table=new Map((v?.sourceTable||[]).map(r=>[r.id,r.text]));const walk=x=>x&&typeof x==='object'?(x.$source?table.get(x.$source):Array.isArray(x)?x.map(walk):Object.fromEntries(Object.entries(x).filter(([k])=>k!=='sourceTable').map(([k,y])=>[k,walk(y)]))):x;return walk(v)};
    const developer = body?.input?.[0]?.content?.[0]?.text || '';
    const userText = body?.input?.[1]?.content?.[0]?.text || '';
    let payload = null; try { payload = expand(JSON.parse(userText)); if(payload.contextOrder)payload.priorPublicText=payload.contextOrder.currentPublishedPrefix||payload.contextOrder.previousPublishedTail; } catch { payload = { raw: userText }; }
    if(body.stream&&payload?.schema==='CORTEX_PROSE_WRITER_V1'&&body.input.length===3)payload.rawUserInput=body.input[2].content[0].text;
    if(payload?.schema==='CORTEX_SCOPED_PUBLICATION_INPUT_V1')payload.priorPublicText=payload.currentPublishedPrefix||payload.previousPublishedTail;
    const format = body?.text?.format?.name || '';
    if(format==='cortex_event_verdict'){const result=model.eventVerdict?model.eventVerdict(payload,body):{requirements:(payload.requirements||[]).map(r=>({requirementRef:r.ref,status:'MET',reason:'Mock public prose verdict'})),earlyClosure:{goalsMet:'YES',sceneActionSettled:'NO',sceneSettled:'NO',handoffReady:'YES',reason:'Mock standard closure'}};const entry={kind:'eventVerdict',format,payload};calls.push(entry);if(model.beforeRespond){const intercepted=await model.beforeRespond(entry,body);if(intercepted)return intercepted;}if(Array.isArray(result?.requirements)&&body.text.format.schema.properties.requirements.type==='object')result.requirements=Object.fromEntries(result.requirements.map(r=>[r.requirementRef,{status:r.status,reason:r.reason}]));return outputText(JSON.stringify(result));}
    if(payload?.kind==='THREE_EVENTS'||payload?.kind==='ARCHIVE'){const entry={kind:'proseMemory',format,payload};calls.push(entry);if(model.beforeRespond){const intercepted=await model.beforeRespond(entry,body);if(intercepted)return intercepted;}return outputText(model.proseMemory?model.proseMemory(payload,body):'공개 원문에서 실제로 일어난 전개를 기억한다.');}
    const kind = String(url).includes('/images') || String(url).endsWith('/api/image') ? 'image' : body.stream ? 'writer' : format === 'cortex_prepublication_safety' ? 'preflight' : format === 'cortex_unified_adjudication' ? 'unified' : format === 'cortex_projection_correction' ? 'projectionCorrection' : format === 'cortex_next_event_closure_plan' ? 'nextEventPlan' : format === 'cortex_next_event_closure_review' ? 'nextEventReview' : format === 'cortex_continuity_judge' ? 'judge' : format === 'cortex_canon_adjudication' ? 'adjudicator' : format === 'cortex_chapter_capsule' ? 'capsule' : /추출기/.test(developer) ? 'extractor' : 'other';
    const entry = { kind, format, developerHead: developer.slice(0, 60), payload };
    calls.push(entry);
    if(format==='cortex_minimal_edit'){entry.kind='minimalEdit';if(model.beforeRespond){const intercepted=await model.beforeRespond(entry,body);if(intercepted)return intercepted;}return outputText(JSON.stringify(model.minimalEdit?model.minimalEdit(payload,body):{decision:'KEEP',reason:'No proven defect.',changesPremise:false,edits:[]}));}
    if (model.beforeRespond) { const intercepted = await model.beforeRespond(entry, body); if (intercepted) return intercepted; }
    switch (kind) {
      case 'writer': {const prose=model.writer(payload,body),recommendations=typeof model.recommendations==='function'?model.recommendations(payload,prose,body):model.recommendations;return outputText(writerTrack(prose,payload,recommendations));}
      case 'preflight': return outputText(JSON.stringify(model.preflight(payload, body)));
      case 'unified': return outputText(JSON.stringify(model.unified(payload, body)));
      case 'projectionCorrection': return outputText(JSON.stringify(model.projectionCorrection?model.projectionCorrection(payload,body):{schema:'CORTEX_PROJECTION_CORRECTION_V1',baseFingerprint:payload.baseFingerprint,referenceRepairs:[],entityRepairs:[],replaceScenePresence:false,scenePresence:payload.baseProjection.scenePresence}));
      case 'nextEventPlan': return outputText(JSON.stringify(model.nextEventPlan(payload, body)));
      case 'nextEventReview': return outputText(JSON.stringify(model.nextEventReview(payload, body)));
      case 'extractor': return outputText(model.extractor(payload, '', body));
      case 'judge': return outputText(JSON.stringify(model.judge(payload)));
      case 'adjudicator': return outputText(JSON.stringify(model.adjudicator(payload)));
      case 'capsule': return outputText(JSON.stringify(model.capsule(payload)));
      case 'image': return { ok: false, status: 404, text: async () => 'no images in headless', json: async () => ({}) };
      default: return outputText('수리된 문단.');
    }
  };
  return model;
}

export class HeadlessCortex {
  constructor({ standalonePath, model, url = "https://cortex.test/?session=test", indexedDB = new IDBFactory(), localStorageSeed = {}, sessionStorageSeed = {}, initialScenario = null, initialMedia = [] }) {
    this.url=url; this.standalonePath = standalonePath; this.model = model; this.indexedDB = indexedDB; this.localStorageSeed = { ...localStorageSeed }; this.sessionStorageSeed = {...sessionStorageSeed}; this.initialScenario=initialScenario;this.initialMedia=initialMedia;this.logs = [];
  }
  async open() {
    const html = fs.readFileSync(this.standalonePath, 'utf8');
    const vc = new VirtualConsole();
    vc.on('error', e => this.logs.push('ERR ' + String(e).slice(0, 400)));
    vc.on('jsdomError', e => this.logs.push('JSDOM ' + String(e?.message || e).slice(0, 400)));
    const sessionSeed=this.sessionStorageSeed;const seed = this.localStorageSeed, model = this.model, idb = this.indexedDB;
    this.dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, url: this.url, virtualConsole: vc,
      beforeParse(window) {
        window.__HEADLESS_NATIVE_LOCAL_STORAGE__=window.localStorage;
        for(const [k,v]of Object.entries(sessionSeed))window.sessionStorage.setItem(k,v);
        window.WebSocket = undefined; // Network-free tests; warmup has a dedicated mock transport suite.
        window.indexedDB = idb; window.IDBKeyRange = IDBKeyRange;
        Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
        window.structuredClone = structuredClone; window.TextDecoder = TextDecoder; window.TextEncoder = TextEncoder;
        for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
        window.fetch = (...args) => model.fetch(...args);
        window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
        window.HTMLDialogElement.prototype.close = function () { this.open = false; };
        window.URL.createObjectURL = () => 'blob:mock'; window.URL.revokeObjectURL = () => {};
      } });
    this.win = this.dom.window;
    /* resources:'usable'이면 <script src="data:..."> (fflate)가 비동기로 로드되고 그 뒤 인라인 스크립트가 실행된다. load까지 기다린다. */
    if (this.win.document.readyState !== 'complete') await new Promise(r => this.win.addEventListener('load', r, { once: true }));
    this.api = this.win.__DANCHEONG_NEW_ENGINE_TEST__;
    await this.api._bootstrap();
    if(this.initialScenario&&!this.api._restoredExistingState()){
      this.api.applyImportedState({scenario:structuredClone(this.initialScenario),turns:[]},{persistState:false});
      if(this.initialMedia.length)await new Promise((resolve,reject)=>{const request=this.win.indexedDB.open('dancheong-cortex-media-v1230',2);request.onupgradeneeded=()=>{const database=request.result;if(!database.objectStoreNames.contains('generated'))database.createObjectStore('generated',{keyPath:'key'});if(!database.objectStoreNames.contains('package-assets')){const store=database.createObjectStore('package-assets',{keyPath:'key'});store.createIndex('storyId','storyId',{unique:false})}};request.onerror=()=>reject(request.error);request.onsuccess=()=>{const database=request.result,transaction=database.transaction('package-assets','readwrite'),store=transaction.objectStore('package-assets');this.initialMedia.forEach(row=>store.put(structuredClone(row)));transaction.oncomplete=()=>{database.close();resolve()};transaction.onerror=()=>reject(transaction.error)}});
      this.win.localStorage.setItem('project-offered','test-fixture');
      await new Promise(resolve=>setTimeout(resolve,550));
    }
    return this;
  }
  get scenario() { return this.api._scenario(); }
  get turns() { return this.api._turns(); }
  async turn(input) {
    this.api._setInput(input);
    await this.api.runTurnV1111();
    const last = this.turns.at(-1);
    return last;
  }
  async settle(ms = 50) { await new Promise(r => setTimeout(r, ms)); }
  /* '탭 종료': 창을 버린다. 저장소는 남는다. localStorage 내용은 다음 창에 넘긴다. */
  close() {
    const nativeLocalStorage=this.win.__HEADLESS_NATIVE_LOCAL_STORAGE__||this.win.localStorage,ls = {}; for (let i = 0; i < nativeLocalStorage.length; i++) { const k = nativeLocalStorage.key(i); ls[k] = nativeLocalStorage.getItem(k); }
    const sessionStorageSeed={};for(let i=0;i<this.win.sessionStorage.length;i++){const k=this.win.sessionStorage.key(i);sessionStorageSeed[k]=this.win.sessionStorage.getItem(k)}
    this.dom.window.close();
    return { sessionStorageSeed,indexedDB: this.indexedDB, localStorageSeed: ls };
  }
}

export async function seedSave(indexedDB, payload, { db = null, store = 'state', key = 'state' } = {}) {
  /* 저장본을 직접 IndexedDB에 넣는다(구 세이브 승격 시험용). DB 이름·스키마는 앱이 만든 것을 따른다. */
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(db);
    req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(store)) d.createObjectStore(store); };
    req.onsuccess = () => { const d = req.result; const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put(payload, key); tx.oncomplete = () => { d.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    req.onerror = () => reject(req.error);
  });
}

export function editResponse(before,after,changesPremise=false,usage=null){return {ok:true,status:200,body:null,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({decision:before===after?'KEEP':'EDIT',reason:'Fixture decision.',changesPremise,edits:before===after?[]:[{before,after}]})}]}],usage})};}
