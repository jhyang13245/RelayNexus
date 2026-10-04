/* Instant prose memory: storage batches, never narrative events or progression gates. */
(function(root){
  'use strict';
  const list=v=>Array.isArray(v)?v:[], clone=v=>JSON.parse(JSON.stringify(v)), chars=v=>[...v].length;
  const schema='CORTEX_INSTANT_PROSE_MEMORY_V1';
  function fingerprint(value){let a=2166136261,b=5381;for(const c of JSON.stringify(value)){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0)}return (a>>>0).toString(16)+(b>>>0).toString(16)}
  function committed(turns){return list(turns).filter(t=>t.status==='COMMITTED'&&typeof t.text==='string'&&t.text.trim()).map((t,i)=>({id:t.id||`legacy-bit-${i+1}`,input:typeof t.input==='string'?t.input:'',text:t.text}));}
  function batches(turns){const all=committed(turns),out=[];for(let i=0;i+10<=all.length;i+=10){const source=all.slice(i,i+10);out.push({start:i+1,end:i+10,sourceKey:fingerprint(source),source});}return out;}
  function records(turns,memory={}){const all=batches(turns);return list(memory.summaries).filter(r=>typeof r.text==='string'&&r.text.trim()&&chars(r.text)<=1200&&all.some(b=>b.start===r.start&&b.end===r.end&&b.sourceKey===r.sourceKey));}
  function archives(turns,memory={}){const all=committed(turns);return list(memory.archives).filter(r=>typeof r.text==='string'&&r.text.trim()&&chars(r.text)<=5500&&r.start>=1&&(r.start-1)%200===0&&r.end===r.start+199&&r.end<=all.length&&fingerprint(all.slice(r.start-1,r.end))===r.sourceKey);}
  function plan(turns,memory={}){
    const all=committed(turns),cut=Math.max(0,all.length-10),covered=new Set(),summaries=[];
    const candidates=[...archives(turns,memory),...records(turns,memory)].filter(r=>r.end<=cut);
    candidates.sort((a,b)=>(b.end-b.start)-(a.end-a.start));
    for(const r of candidates){if(covered.has(r.start))continue;for(let i=r.start;i<=r.end;i++)covered.add(i);summaries.push({start:r.start,end:r.end,text:r.text});}
    summaries.sort((a,b)=>a.start-b.start);
    return {schema,summaries,recent:clone(all.slice(-10)),rawFallback:clone(all.slice(0,cut).filter((_,i)=>!covered.has(i+1)))};
  }
  function nextJob(turns,memory={}){
    const all=committed(turns),valid=records(turns,memory),archived=archives(turns,memory);
    for(const batch of batches(turns))if(!valid.some(r=>r.start===batch.start&&r.sourceKey===batch.sourceKey))return {kind:'TEN_BITS',...batch,maxChars:1200};
    for(let start=1;start+199<=all.length;start+=200){const end=start+199,sourceKey=fingerprint(all.slice(start-1,end));if(archived.some(r=>r.start===start&&r.sourceKey===sourceKey))continue;const source=valid.filter(r=>r.start>=start&&r.end<=end).sort((a,b)=>a.start-b.start);if(source.length===20)return {kind:'TWENTY_SUMMARIES',start,end,sourceKey,inputKey:fingerprint(source),source:clone(source),targetChars:5000,maxChars:5500};}
    return null;
  }
  function accept(memory={},job,result,turns){
    const text=typeof result==='string'?result.trim():'',all=committed(turns);
    if(!['TEN_BITS','TWENTY_SUMMARIES'].includes(job?.kind)||!text||chars(text)>(job.kind==='TEN_BITS'?1200:5500))throw Error('INSTANT_MEMORY_LENGTH_INVALID');
    const span=job.kind==='TEN_BITS'?10:200;
    if(job.start<1||(job.start-1)%span!==0||job.end!==job.start+span-1||job.end>all.length||fingerprint(all.slice(job.start-1,job.end))!==job.sourceKey)throw Error('INSTANT_MEMORY_SOURCE_CHANGED');
    if(job.kind==='TWENTY_SUMMARIES'){const source=records(turns,memory).filter(r=>r.start>=job.start&&r.end<=job.end).sort((a,b)=>a.start-b.start);if(source.length!==20||fingerprint(source)!==job.inputKey)throw Error('INSTANT_MEMORY_SOURCE_CHANGED');}
    const next={...clone(memory),schema,summaries:records(turns,memory),archives:archives(turns,memory)},key=job.kind==='TEN_BITS'?'summaries':'archives';
    next[key]=[...next[key].filter(r=>r.start!==job.start),{start:job.start,end:job.end,sourceKey:job.sourceKey,text}];return next;
  }
  function instruction(job){return `소설 장기기억 요약 담당이다. ${job.kind==='TEN_BITS'?'확정된 10비트 공개 원문을 한국어 서술형으로 1,200자 이내에 요약한다.':'10비트 단위 요약 20개를 약 5,000자(권장 4,500~5,500자, 최대 5,500자)의 한국어 서술형으로 통합한다.'} 실제 인과관계, 인물의 구별, 중요한 대화·정보·약속과 미해결 사항을 보존한다. 의도·추측·전언을 실행·소유·확정 사실로 바꾸지 않는다. 모호함은 유지한다. 사용자 입력이나 미래 설정을 실제 일어난 사실로 추가하지 않는다. 사건이나 진행 단계를 만들지 않는다. ID·상태표·메타정보 없이 요약문만 출력한다.`;}
  root.CortexInstantMemory=Object.freeze({schema,committed,plan,nextJob,accept,instruction});
})(globalThis);

/* Shared, dependency-free Instant V2 contract. Loaded by the browser and server. */
(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x)), list=x=>Array.isArray(x)?x:[], str=x=>typeof x==='string'?x:'', obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{}, norm=x=>str(x).normalize('NFKC').toLowerCase(), clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const storyClock=text=>{const value=str(text),digital=value.match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?:\D|$)/u),korean=value.match(/(?:^|\D)([01]?\d|2[0-3])\s*시\s*([0-5]?\d)\s*분/u),m=digital||korean;return m?`${String(+m[1]).padStart(2,'0')}:${String(+m[2]).padStart(2,'0')}:${digital&&m[3]?m[3]:'00'}`:''};
  const fail=code=>{throw new Error('INSTANT_PACKAGE_REJECTED:'+code)};
  const read=(files,path)=>Object.entries(files).find(([key])=>key.replace(/\\/g,'/').replace(/^\.\//,'')===path||key.endsWith('/'+path))?.[1];
  const isInstant=files=>read(files,'manifest.json')?.runtimeMode==='instant_story'||!!read(files,'rules/instant_story_runtime.json');
  function fromFiles(files){
    const manifest=obj(read(files,'manifest.json')), project=obj(read(files,'project.json')), runtime=obj(read(files,'rules/instant_story_runtime.json'));
    if(!isInstant(files))return null;
    const supported=['instant_story_runtime_v2','status_relationship_display_v1','protagonist_invariants_v1'];
    const unknown=list(manifest.requiredFeatures).filter(x=>!supported.includes(x));if(unknown.length)fail('UNSUPPORTED_FEATURE:'+unknown.join(','));
    if(runtime.format!=='RELAY_NOVEL_INSTANT_STORY_RUNTIME_V2'||runtime.schemaVersion!=='2.0'||runtime.featureId!=='instant_story_runtime_v2'||runtime.exclusiveRuntime!==true||runtime.enabled!==true||runtime.fallback!=='reject_if_unsupported')fail('RUNTIME_V2_REQUIRED');
    if(!/^[a-f0-9]{64}$/i.test(runtime.sourcePackageSha256||''))fail('SOURCE_HASH_MISSING');
    if(Object.keys(files).some(path=>/(?:^|\/)(?:events|routes|loops|actors)\//.test(path)&&!path.includes('studio/')))fail('MIXED_RUNTIME');
    const source=obj(project.instantStory);if(!Object.keys(source).length)fail('RUNTIME_SOURCE_MISSING');
    const config=clone(runtime), cacheStatus={};
    for(const key of ['corePrompt','promptPreset','exampleScenes','startProfiles','statRules','contextBudget','deepPathTriggers','endingPolicy'])if(JSON.stringify(runtime[key])!==JSON.stringify(source[key]))fail('RUNTIME_SOURCE_MISMATCH:'+key);
    const derived=(name,format,rebuild)=>{const doc=obj(read(files,'runtime/'+name+'.json'));const valid=doc.format===format&&doc.schemaVersion==='2.0'&&doc.sourcePackageSha256===runtime.sourcePackageSha256;cacheStatus[name]=valid?'VERIFIED':'REBUILT_FROM_PROJECT';return valid?clone(doc):{format,...rebuild()}};
    config.contextIndex=derived('context_index','RELAY_NOVEL_INSTANT_CONTEXT_INDEX_V1',()=>({characters:[project.player,...list(project.npcs)].filter(Boolean).map(p=>({id:p.id,searchTerms:[p.name,p.preRevealAlias].filter(Boolean)}))}));
    config.keywordIndex=derived('keyword_index','RELAY_NOVEL_INSTANT_KEYWORD_INDEX_V1',()=>({notes:list(source.keywordNotes).map(n=>({...n,normalizedKeywords:list(n.keywords).map(norm)}))}));
    config.mediaLookup=derived('media_lookup','RELAY_NOVEL_INSTANT_MEDIA_LOOKUP_V1',()=>({entries:[]}));
    config.endingSchedule=derived('ending_schedule','RELAY_NOVEL_INSTANT_ENDING_SCHEDULE_V1',()=>({...source.endingPolicy,endingIds:[],loopEnabled:false}));
    // Preserve old schedule metadata for round-trip export; the free reader never executes it.
    if(list(config.mediaLookup.entries).length)fail('MEDIA_LOOKUP_ENTRIES_UNSUPPORTED');
    config.cacheStatus=cacheStatus;
    config.statusWindow=clone(read(files,'rules/status_window.json')||project.statusWindow||{});
    config.protagonistInvariants=clone(read(files,'cortex/protagonist_invariants.json')||read(files,'invariants.json')||project.protagonistInvariants||{});
    config.disclosure=clone(read(files,'disclosure.json')||project.disclosure||{protectedTerms:[]});
    config.worldRules=clone(read(files,'world/world.json')||project.world||{});
    config.privateContext={world:str(obj(project.gmData).worldTruthLedger),characters:[project.player,...list(project.npcs)].filter(p=>str(p?.hiddenInfo).trim()).map(p=>({id:p.id,name:p.name,hiddenInfo:p.hiddenInfo})),policy:'MOTIVATION_AND_CAUSALITY_ONLY; NEVER_QUOTE_CONFIRM_OR_EXPLAIN'};
    config.source=clone(source);
    validate(config,{free:true});
    return config;
  }
  const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x)??'null';
  async function verifySource(files){
    if(!isInstant(files))return;
    const m=read(files,'manifest.json'),p=read(files,'project.json'),r=read(files,'rules/instant_story_runtime.json');
    const input={packageVersion:m.packageVersion,engineVersion:m.engineVersion,project:p,runtimeMode:'instant_story',narrativeRuntime:null,package15:null,instantStory:p.instantStory};
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(input))))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==r.sourcePackageSha256)fail('SOURCE_HASH_MISMATCH');
  }
  function validate(c,{free=false}={}){
    if(c?.format!=='RELAY_NOVEL_INSTANT_STORY_RUNTIME_V2'||!c.enabled||!c.exclusiveRuntime)fail('RUNTIME_V2_REQUIRED');
    if(!str(c.corePrompt).trim())fail('CORE_PROMPT_MISSING');
    const b=c.contextBudget||{},g=c.generation||{};
    for(const [key,min,max] of [['maxDynamicPromptChars',4000,24000],['recentTurns',1,8],['activeCharacters',1,12],['activeKeywordNotes',0,3],['semanticMemories',0,24],['relevantMedia',0,12]])if(!Number.isInteger(b[key])||b[key]<min||b[key]>max)fail('BUDGET:'+key);
    if(!Number.isInteger(g.ordinaryTurnMaxOutputTokens)||g.ordinaryTurnMaxOutputTokens<1200||g.ordinaryTurnMaxOutputTokens>16000)fail('OUTPUT_BUDGET');
    if(!['none','low','medium','high'].includes(g.reasoningEffort))fail('REASONING_EFFORT');
    const e=c.endingSchedule||c.endingPolicy;if(!free&&(!Number.isInteger(e?.minimumTurn)||e.minimumTurn<0||!Number.isInteger(e?.checkInterval)||e.checkInterval<1))fail('ENDING_SCHEDULE');
    const ids=new Set();for(const s of list(c.statRules)){if(!s.id||ids.has(s.id)||![s.minimum,s.maximum,s.initial].every(Number.isFinite)||s.minimum>s.maximum||s.initial<s.minimum||s.initial>s.maximum)fail('STAT_RULE');ids.add(s.id);for(const t of list(s.tiers))if(!Number.isFinite(t.minimum)||!Number.isFinite(t.maximum)||t.minimum>t.maximum)fail('STAT_TIER')}
    return c;
  }
  function initial(config,profileId=''){
    const profiles=list(config.startProfiles),profile=profileId?profiles.find(p=>p.id===profileId):profiles[0];if(profileId&&!profile)fail('START_PROFILE_UNKNOWN');
    return {schema:'CORTEX_INSTANT_STATE_V1',turnCount:0,profileId:profile?.id||'',stats:Object.fromEntries(list(config.statRules).map(s=>[s.id,s.initial])),activeKeywordIds:[],relationships:{},ended:false,lastEndingCheckTurn:null,committedTurnIds:[]};
  }
  function adapt(files,options,normalizeCharacter){
    const config=fromFiles(files),manifest=obj(read(files,'manifest.json')),project=obj(read(files,'project.json')),opening=clone(read(files,'start/opening.json')||project.opening||{}),state=initial(config,options.startProfileId),profile=list(config.startProfiles).find(p=>p.id===state.profileId);
    const hero=normalizeCharacter(read(files,'characters/player.json')||project.player),people=[hero,...list(read(files,'characters/npcs.json')||project.npcs).map(normalizeCharacter)];
    if(profile?.prologue)opening.openingLine=profile.prologue;
    const id=manifest.id||manifest.projectId||project.projectId;if(!id||!hero.name)fail('IDENTITY_MISSING');
    const world={day:0,time:opening.openingTime||storyClock(profile?.startSituation)||storyClock(opening.currentSituation)||'08:00:00',location:opening.openingLocation||project.startLocation||''};
    const result={schema:'RELAY_CANONICAL_SESSION_V1',bridge:{schema:'CORTEX_NEXUS_NATIVE_BRIDGE_V1',version:'1.32.4'},package:{id,title:project.title||manifest.title,version:manifest.packageVersion||'1.5',format:manifest.format,manifest:clone(manifest),capabilities:{instantStoryV2:true,package15:false},instantStory:config,openingContract:opening,policy:{reveal:[],assets:[]},sourceFacts:{characterCount:people.length,eventCount:0},sourcePaths:{json:Object.keys(files),events:[],characters:['characters/player.json','characters/npcs.json']}},story:{title:project.title||manifest.title,genre:project.genre||'',tone:project.tone||'',summary:profile?.startSituation||opening.currentSituation||'',style:clone(read(files,'rules/style.json')||project.style||{})},cast:{protagonistId:hero.id,entities:Object.fromEntries(people.map(p=>[p.id,p]))},eventGraph:{nodes:{},routes:[],roots:[]},state:{world,scene:{presentCharacterIds:list(opening.presentCharacterIds).filter(id=>people.some(p=>p.id===id))},relationships:[],instant:state},engines:{selected:'cortex',nexus:{},cortex:{}},history:{turnCount:0},revision:0,integrity:{ok:true,issues:[],warnings:[]}};
    if(!result.state.scene.presentCharacterIds.includes(hero.id))result.state.scene.presentCharacterIds.unshift(hero.id);return result;
  }
  function toScenario(session){
    const entities=Object.values(session.cast.entities),hero=session.cast.entities[session.cast.protagonistId],config=clone(session.package.instantStory);
    return {schema:'CORTEX_SCENARIO_V1111',title:session.story.title,genre:session.story.genre,tone:session.story.tone,summary:session.story.summary,styleRules:clone(session.story.style||{}),protagonistInvariants:clone(config.protagonistInvariants),protagonist:clone(hero),characters:clone(entities.filter(p=>p.id!==hero.id)),world:clone(session.state.world),scene:clone(session.state.scene),relationships:[],disclosure:clone(session.state.disclosure||config.disclosure),event:{id:'instant-scene',title:'자유 전개',summary:'',requiredFunctions:[],beats:[],status:'ACTIVE'},runtime:{...clone(session.state.instantRuntime||{}),storyId:session.package.id,instantStory:config,instantState:clone(session.state.instant||initial(config)),canonLedger:clone(session.state.canonLedger||{schema:'CORTEX_CANON_LEDGER_V1',revision:0,entries:[]}),eventLedger:{sealed:[]},packageContract:{openingContract:clone(session.package.openingContract),capabilities:{instantStoryV2:true},eventGraph:{nodes:{},routes:[],roots:[]}},canonicalBridge:{packageId:session.package.id,sessionRevision:session.revision,selectedEngine:'cortex'}}};
  }
  function fromScenario(sc,turns,previous){
    if(!previous?.package?.instantStory)fail('CANONICAL_INSTANT_CONFIG_MISSING');const next=clone(previous);
    const extra={};for(const key of ['disclosureLedger','sceneContinuity','imageTriggerLedger','proseMemory','instantMemory'])if(sc.runtime[key])extra[key]=clone(sc.runtime[key]);
    next.state={...next.state,world:clone(sc.world),scene:clone(sc.scene),disclosure:clone(sc.disclosure||{}),instant:clone(sc.runtime.instantState),canonLedger:clone(sc.runtime.canonLedger||{}),instantRuntime:extra};next.cast.entities=Object.fromEntries([sc.protagonist,...list(sc.characters)].map(p=>[p.id,clone(p)]));next.package.instantStory=clone(sc.runtime.instantStory);next.history.turnCount=list(turns).filter(t=>t.status==='COMMITTED').length;next.revision=Math.max(next.revision||0,next.history.turnCount);return next;
  }
  function context(sc,turns,input,publicCast,{free=false}={}){
    const c=validate(sc.runtime.instantStory,{free}),s=sc.runtime.instantState||initial(c),b=c.contextBudget;if(s.ended&&!free)fail('STORY_ENDED');
    const notes=list(c.keywordIndex?.notes).filter(n=>list(n.normalizedKeywords).some(k=>norm(input).includes(norm(k)))).sort((a,b)=>(b.priority||0)-(a.priority||0)).slice(0,b.activeKeywordNotes);
    const present=new Set(list(sc.scene?.presentCharacterIds)),index=new Map(list(c.contextIndex?.characters).map(r=>[r.id,r]));
    const relevance=p=>p.id===sc.protagonist.id?3:present.has(p.id)?2:list(index.get(p.id)?.searchTerms).some(k=>norm(input).includes(norm(k)))?1:0;
    const people=publicCast.filter(Boolean).slice().sort((a,b)=>relevance(b)-relevance(a)).slice(0,b.activeCharacters);
    const memory=root.CortexInstantMemory.plan(turns,sc.runtime.instantMemory),recent=memory.recent.map(t=>({input:t.input,text:t.text}));
    const schedule=c.endingSchedule||c.endingPolicy,turnNumber=s.turnCount+1,endingDue=!free&&turnNumber>=schedule.minimumTurn&&(turnNumber-schedule.minimumTurn)%schedule.checkInterval===0;
    const relationships=visibleRelationships(sc),conditionalRelationships=list(c.statusWindow?.relationshipDisplay?.entries).filter(r=>r.visibility==='conditional'&&!s.relationships?.[r.id]?.revealed).map(r=>({id:r.id,revealRule:r.revealRule}));
    const result={mode:'instant_story',corePrompt:c.corePrompt,preset:c.promptPreset,worldRules:c.worldRules,privateContext:clone(c.privateContext||{}),invariants:c.protagonistInvariants,style:sc.styleRules,opening:sc.runtime.packageContract?.openingContract,startProfile:list(c.startProfiles).find(p=>p.id===s.profileId)||null,exampleScenes:list(c.exampleScenes).slice(0,3),characters:people,activeKeywordNotes:notes,stats:list(c.statRules).map(r=>{const current=s.stats[r.id]??r.initial,{tiers:_tiers,initial:_initial,...rule}=r;return {...rule,current,activeTiers:list(r.tiers).filter(t=>current>=t.minimum&&current<=t.maximum)}}),relationships:relationships.map(r=>({...r,current:s.relationships?.[r.id]||null})),conditionalRelationships,memories:b.semanticMemories?list(s.memories).slice(-b.semanticMemories):[],recent,world:clone(sc.world),turnNumber,endingDue,input};
    if(s.turnCount===0&&result.world?.time==='08:00:00'){const inferred=storyClock(result.startProfile?.startSituation)||storyClock(result.opening?.currentSituation);if(inferred)result.world.time=inferred;}
    // Runtime/editor metadata and repeated opening prose are not new story context.
    // Work on copies: package source, backup bytes and the chosen budget stay intact.
    if(result.opening)result.opening=clone(result.opening);
    if(result.startProfile){result.startProfile=clone(result.startProfile);delete result.startProfile.recommendedReplies;if(result.opening?.openingLine===result.startProfile.prologue)delete result.opening.openingLine;}
    result.characters=result.characters.map(p=>{const copy={...p};for(const key of ['visualDisclosure','referenceMode','allowedAssetRefs'])delete copy[key];return copy});
    // A progressed story already carries its opening in saved history. Keep the
    // authored situation/rules, but do not send the prologue again on every turn.
    if(s.turnCount>0){if(result.opening)delete result.opening.openingLine;if(result.startProfile)delete result.startProfile.prologue;}
    // Never cut serialized JSON, authored rules or the current input. Example
    // scenes are style references; discard them before actual story memories.
    // Studio 2.2 also exports canon-only guidance here; preserve it in the package,
    // but never apply the fixed-beat rules to an exclusive Instant writer.
    if(result.style){result.style=clone(result.style);delete result.style.cortexAuthoringGuidance}
    // The engine's fixed memory window is separate from the authored dynamic-setting budget.
    // Never silently drop any of the ten recent bits or unsummarized older prose.
    result.memories=memory.summaries.map(r=>r.text);
    if(memory.rawFallback.length)result.olderPublicProse=memory.rawFallback.map(t=>({input:t.input,text:t.text}));
    if(free){
      delete result.endingDue;delete result.conditionalRelationships;result.mode='instant_free_prose';
      // Examples teach the first response's style, but never become story facts or
      // permanent live objectives on later turns.
      result.exampleScenes=s.turnCount===0?result.exampleScenes.map(scene=>({...scene,authority:'STYLE_ONLY_NEVER_STORY_FACT'})):[];
      if(result.opening){const o=result.opening;result.opening=s.turnCount>0?{preHistory:o.preHistory}:{preHistory:o.preHistory,currentSituation:o.currentSituation,openingLine:o.openingLine};}
      if(s.turnCount>0&&result.startProfile)result.startProfile={id:result.startProfile.id,name:result.startProfile.name};
      result.recent=result.recent.map(t=>({...t,text:cleanChoices(t.text,'',{historical:true}).text}));
      if(result.olderPublicProse)result.olderPublicProse=result.olderPublicProse.map(t=>({...t,text:cleanChoices(t.text,'',{historical:true}).text}));
      result.worldAuthority='LAST_KNOWN_HUD; latest enacted public prose overrides stale location, never a proposed choice';
    }
    const dynamicSize=()=>{const {recent,memories,olderPublicProse,...dynamic}=result;return JSON.stringify(dynamic).length};
    while(dynamicSize()>b.maxDynamicPromptChars&&result.exampleScenes.length)result.exampleScenes.pop();
    if(dynamicSize()>b.maxDynamicPromptChars){const error=new Error('INSTANT_PACKAGE_REJECTED:CONTEXT_BUDGET_EXCEEDED');error.contextBudget={required:dynamicSize(),maximum:b.maxDynamicPromptChars};throw error;}return result;
  }
  function apply(sc,context,response,turnId){
    const before=sc.runtime.instantState||initial(sc.runtime.instantStory);if(list(before.committedTurnIds).includes(turnId))return clone(before);
    if(before.turnCount+1!==context.turnNumber)fail('STALE_TURN');
    const next=clone(before),seen=new Set();
    for(const change of list(response.statChanges)){const rule=list(sc.runtime.instantStory.statRules).find(r=>r.id===change.id);if(!rule||seen.has(change.id)||!Number.isFinite(change.delta)||!str(change.evidence).trim()||!response.narration.includes(change.evidence))fail('STAT_CHANGE_UNGROUNDED');seen.add(change.id);next.stats[rule.id]=clamp((next.stats[rule.id]??rule.initial)+change.delta,rule.minimum,rule.maximum)}
    for(const change of list(response.relationshipChanges)){const rule=context.relationships.find(r=>r.id===change.id);if(!rule||seen.has('rel:'+change.id)||!Number.isFinite(change.delta)||!str(change.evidence).trim()||!response.narration.includes(change.evidence))fail('RELATIONSHIP_CHANGE_UNGROUNDED');seen.add('rel:'+change.id);const min=rule.stat?.minimum??-100,max=rule.stat?.maximum??100,old=next.relationships[rule.id]||{};next.relationships[rule.id]={...old,sentence:change.sentence,symbol:change.symbol,current:clamp((old.current??rule.stat?.current??0)+change.delta,min,max)}}
    if(response.ending?.ended&&(!context.endingDue||!str(response.ending.evidence).trim()||!response.narration.includes(response.ending.evidence)))fail('ENDING_NOT_DUE_OR_UNGROUNDED');
    next.turnCount=context.turnNumber;next.activeKeywordIds=context.activeKeywordNotes.map(n=>n.id);if(context.endingDue)next.lastEndingCheckTurn=context.turnNumber;
    for(const row of list(response.relationshipReveals)){if(!context.conditionalRelationships.some(r=>r.id===row.id)||!str(row.evidence).trim()||!response.narration.includes(row.evidence))fail('RELATIONSHIP_REVEAL_UNGROUNDED');next.relationships[row.id]={...(next.relationships[row.id]||{}),revealed:true}}
    next.metCharacterIds=[...new Set([...list(next.metCharacterIds),...list(response.presentCharacterIds)])];
    next.memories=[...list(next.memories),...list(response.memoryQuotes).filter(q=>str(q).trim()&&response.narration.includes(q))].slice(-48);
    next.ended=response.ending?.ended===true;next.committedTurnIds=[...list(next.committedTurnIds),turnId].slice(-256);return next;
  }
  function visibleRelationships(sc){const s=sc.runtime.instantState,met=new Set([...list(s.metCharacterIds),...list(sc.scene?.presentCharacterIds)]);return list(sc.runtime.instantStory.statusWindow?.relationshipDisplay?.entries).filter(r=>r.visibility==='public'||r.visibility==='met_only'&&met.has(r.entityId)||s.relationships?.[r.id]?.revealed)}
  function failureInfo(error){
    const code=str(error?.message),budget=error?.contextBudget;
    if(code==='INSTANT_PACKAGE_REJECTED:CONTEXT_BUDGET_EXCEEDED')return {stage:'INSTANT_CONTEXT',title:'Instant 설정 분량 확인',summary:'현재 설정과 입력이 작품의 한 턴 분량 한도를 초과했습니다. 입력과 이전 진행은 보존했습니다.',cause:Number.isInteger(budget?.required)&&Number.isInteger(budget?.maximum)?`필요 ${budget.required.toLocaleString()}자 · 설정 한도 ${budget.maximum.toLocaleString()}자`:code,action:'같은 입력을 반복하면 해결되지 않습니다. 입력을 줄이거나 지음의 Instant Story → 컨텍스트 예산에서 한도를 조정한 패키지를 사용하세요.'};
    if(code==='INSTANT_WORLD_INVALID')return {stage:'INSTANT_COMMIT',title:'시간·장소 갱신 확인',summary:'본문은 표시하기 전에 취소했고 입력과 이전 진행은 보존했습니다.',cause:code,action:'작가가 현재 시간이나 장소를 실행 형식에 맞지 않게 반환했습니다. 같은 문제가 반복되면 패키지의 시작 시각을 확인해 주세요.'};
    return {stage:'INSTANT_COMMIT',title:'Instant 진행 보류',summary:'이번 임시 본문과 수치 변경을 취소했습니다. 이전 진행과 입력은 보존되어 있습니다.',cause:code,action:'같은 입력으로 다시 시도하세요.'};
  }
  // Legacy ending/reveal receipts remain readable, never required for free prose.
  // Validate a HUD candidate atomically before it touches any shared state.
  function freeContext(sc,turns,input,cast){return context(sc,turns,input,cast,{free:true})}
  function cleanChoices(value,prior='',{historical=false}={}){
    let removed=0;const source=str(value);
    const text=source.replace(/(?:^[ \t]*(?:[-*•]|\d+[.)])[ \t]+[^\n]+(?:\n|$)){2,}/gm,(block,at)=>{
      const lines=block.trim().split('\n'),prefix=(prior+'\n'+source.slice(0,at)).slice(-220);
      const heading=/(?:추천\s*(?:답변|행동|선택)|선택지)\s*[:：]?\s*$/u.test(prefix);
      const tradeoffs=lines.filter(l=>/(?:수\s*있(?:지만|으나)|대신|위험|가능성)/u.test(l)).length>=2;
      const actions=lines.every(l=>/[가-힣]+다(?:[.!?]|\s*$)/u.test(l));
      const diegetic=/(?:메모|게시판|목록|수첩|쪽지|문서|적혀|기록했|써\s*있)[^\n]*[.：:]?\s*$/u.test(prefix)||/[“「『][^”」』]*$/u.test(prefix);
      if(!heading&&(!actions||diegetic||historical&&!tradeoffs))return block;
      removed+=lines.length;return '';
    }).replace(/\n{3,}/g,'\n\n').trim();
    return {text,removed};
  }
  function commitFree(sc,ctx,prose,id,hud=null){
    const candidate=hud||{statChanges:[],relationshipChanges:[],presentCharacterIds:[],world:null};
    const publicIds=new Set(list(ctx.characters).map(p=>p.id));
    if(!Array.isArray(candidate.statChanges)||!Array.isArray(candidate.relationshipChanges)||!Array.isArray(candidate.presentCharacterIds))fail('HUD_SHAPE');
    if(candidate.presentCharacterIds.some(ref=>!publicIds.has(ref)))fail('HUD_UNKNOWN_CHARACTER');
    const next=apply(sc,{...ctx,endingDue:false,conditionalRelationships:[]},{...candidate,narration:prose,ending:{ended:false},relationshipReveals:[],memoryQuotes:[]},id);
    let world=clone(sc.world);
    if(candidate.world){const w=candidate.world,e=str(w.evidence).normalize('NFKC').replace(/\s+/gu,' ').trim(),ground=(prose+'\n'+str(list(ctx.recent).at(-1)?.text)).normalize('NFKC').replace(/\s+/gu,' ');
      if(!e||!ground.includes(e))fail('HUD_WORLD_EVIDENCE');
      if(w.day!=null){if(!Number.isInteger(w.day)||w.day<0)fail('HUD_WORLD_DAY');world.day=w.day;}
      if(w.time!=null){const time=str(w.time).trim();if(!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time))fail('HUD_WORLD_TIME');world.time=time.length===5?time+':00':time;}
      if(w.location!=null){if(!str(w.location).trim())fail('HUD_WORLD_LOCATION');world.location=w.location.trim();}
    }
    next.executionMode='FREE_PROSE_V2';
    return {state:next,world,presentCharacterIds:hud?clone(candidate.presentCharacterIds):clone(sc.scene?.presentCharacterIds||[])};
  }
  root.CortexInstant=Object.freeze({revision:'2.0.0',fromFiles,isInstant,verifySource,validate,initial,adapt,toScenario,fromScenario,context,freeContext,cleanChoices,apply,commitFree,visibleRelationships,failureInfo});
})(globalThis);
