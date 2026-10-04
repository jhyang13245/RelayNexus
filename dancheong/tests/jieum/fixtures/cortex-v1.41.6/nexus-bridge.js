/* Dancheong Nexus <-> Cortex Native Runtime Bridge v1.26.3
 * Keeps Package 1.5, Instant Story and legacy packages engine-neutral.
 */
(()=>{
  'use strict';
  const SCHEMA='RELAY_CANONICAL_SESSION_V1',BRIDGE_SCHEMA='CORTEX_NEXUS_NATIVE_BRIDGE_V1',BRIDGE_BUILD='1.32.4';
  const text=(value,fallback='')=>value==null?fallback:String(value).trim();
  const list=value=>Array.isArray(value)?value:(value==null?[]:[value]);
  const clone=value=>{try{return structuredClone(value)}catch{return JSON.parse(JSON.stringify(value))}};
  const hash=value=>{let h=2166136261;for(const ch of text(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};
  const safeId=(value,fallback='id')=>text(value).replace(/[^0-9a-zA-Z._:-]/gu,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')||fallback;
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const uniqueBy=(items,keyFn)=>{const seen=new Set();return items.filter(item=>{const key=keyFn(item);if(seen.has(key))return false;seen.add(key);return true})};
  const pathBase=path=>text(path).replace(/\\/g,'/').replace(/^\.\//,'');

  function walk(value,path='root',key='',out=[]){
    out.push({value,path,key});
    if(value==null||typeof value!=='object')return out;
    if(Array.isArray(value)){value.forEach((item,index)=>walk(item,`${path}[${index}]`,key,out));return out}
    for(const [childKey,item] of Object.entries(value))walk(item,`${path}.${childKey}`,childKey,out);
    return out;
  }

  function referencedJsonPaths(manifest){
    const paths=[];for(const node of walk(manifest)){if(typeof node.value==='string'&&/\.json(?:$|[?#])/iu.test(node.value))paths.push(pathBase(node.value.split(/[?#]/u)[0]));}
    return [...new Set(paths)];
  }

  function runtimeIgnoredJsonPaths(manifest){
    const paths=[];
    for(const node of walk(manifest)){
      const value=node.value;
      if(!value||typeof value!=='object'||Array.isArray(value)||value.runtimeIgnored!==true)continue;
      const path=pathBase(value.path||value.file||value.href);
      if(path&&/\.json$/iu.test(path)&&!path.split('/').includes('..'))paths.push(path);
    }
    return [...new Set(paths)];
  }

  function scoreArray(node,kind,preferred){
    const value=node.value;if(!Array.isArray(value)||!value.length)return -Infinity;
    const sample=value.slice(0,12).filter(item=>item&&typeof item==='object');if(!sample.length)return -Infinity;
    const key=text(node.key).toLowerCase(),path=text(node.path).toLowerCase();let score=preferred.some(ref=>path.includes(ref.toLowerCase()))?5:0;
    if(kind==='events')score+=/(?:event|episode|beat|schedule|사건)/u.test(`${key} ${path}`)?3:0;
    else score+=/(?:character|cast|actor|person|인물|캐릭터)/u.test(`${key} ${path}`)?3:0;
    for(const item of sample){
      if(kind==='events')score+=(item.eventId||item.id?1:0)+(item.title||item.name?1:0)+(item.startTime||item.schedule||item.beats||item.requiredFunctions||item.completionSignals?2:0);
      else score+=(item.characterId||item.id?1:0)+(item.name||item.displayName?2:0)+(item.profile||item.publicProfile||item.role||item.aliases?2:0)-(item.startTime||item.beats||item.completionSignals?3:0);
    }
    return score/sample.length;
  }

  function structuralArrayRole(node,kind){
    const path=text(node?.path).toLowerCase(),sample=list(node?.value).slice(0,12).filter(item=>item&&typeof item==='object');
    if(!sample.length)return 'REJECT';
    if(kind==='events'){
      if(/(?:alternativefulfillment|completionsignals|requiredsignals|requiredfunctions|alternatebeats|scenemarkers|eventclocks|\/clocks\.json|imagetriggers|foreshadow|hidden(?:gmdata|events)|galler|epilogue|checkpoint|clues)/iu.test(path))return 'AUXILIARY';
      const eventLike=sample.filter(item=>(item.id||item.eventId)&&(item.title||item.name||item.description)&&(
        item.startTime||item.timeWindow||item.schedule||item.sequence!=null||item.required===true||item.beats||item.requiredFunctions||item.completionSignals||item.conditions||item.effects||item.onSuccess
      )).length;
      const clockLike=sample.filter(item=>(item.current!=null||item.maximum!=null)&&(item.relatedEventId||item.publicHint)).length;
      return eventLike>=Math.max(1,Math.ceil(sample.length*.5))&&clockLike===0?'ROOT':'REJECT';
    }
    if(/(?:\.images?(?:\[|$)|image[_-]?manifest|visual[_-]?bible|eventclocks|\/clocks\.json|imagetriggers|statuswindow|\.stats(?:\[|$)|\.resources(?:\[|$)|\.routes(?:\[|$)|\.chapters(?:\[|$)|\.endings(?:\[|$)|hidden(?:gmdata|secrets))/iu.test(path))return 'AUXILIARY';
    const personLike=sample.filter(item=>(item.id||item.characterId||item.actorId)&&(item.name||item.displayName)&&(
      item.role||item.profile||item.publicProfile||item.personality||item.goals||item.drives||item.speechStyle||item.isPlayer!=null
    )).length;
    return personLike>=Math.max(1,Math.ceil(sample.length*.5))?'ROOT':'REJECT';
  }

  function normalizeCharacter(raw,index=0){
    const id=safeId(raw?.id||raw?.characterId||raw?.actorId,`actor-${hash(raw?.name||raw?.displayName||index)}`);
    return {id,name:text(raw?.name||raw?.displayName,'인물'),publicProfile:text(raw?.publicProfile||raw?.profile||raw?.description),drives:list(raw?.drives||raw?.goals),fears:list(raw?.fears),aliases:list(raw?.aliases),role:text(raw?.role||raw?.type),reveal:clone(raw?.revealPolicy||raw?.reveal||{}),source:clone(raw)};
  }

  function normalizeRequirement(raw,index=0){const normalized=globalThis.CortexContract?.normalizeGoal?.(raw,index,'bridge')||null;if(normalized)return normalized;return typeof raw==='string'?{id:`requirement-${index+1}`,description:raw,type:'PHYSICAL_FACT',required:true,source:'bridge',alternatives:[]}:{...clone(raw),id:text(raw?.id,`requirement-${index+1}`),description:text(raw?.description||raw?.requiredOutcome||raw?.function||raw?.goal),type:text(raw?.type||raw?.semanticRole,'PHYSICAL_FACT'),required:raw?.required!==false,source:'bridge',alternatives:list(raw?.alternatives||raw?.aliases).filter(value=>typeof value==='string')}}
  function normalizeEvent(raw,index=0){
    const eventIR=globalThis.CortexContract?.compileEventIR?.(raw,index),requirements=eventIR?.completionPolicy?.goals||[],policyConstraints=eventIR?.constraintPolicy?.constraints||[];
    const windowTimes=[...text(raw?.timeWindow).matchAll(/(\d{1,2}:\d{2}(?::\d{2})?)/gu)].map(match=>match[1]),start=text(raw?.startTime||raw?.start||raw?.schedule?.start||windowTimes[0],'00:00:00'),end=text(raw?.endTime||raw?.end||raw?.schedule?.end||windowTimes[1]||raw?.startTime,'00:30:00');
    const id=safeId(raw?.id||raw?.eventId,`event-${hash(JSON.stringify(raw||index))}`),compiledEventIR={...(eventIR||{}),id,identity:{...(eventIR?.identity||{}),id}},source=clone(raw),nextEventId=globalThis.CortexContract?.eventReference?.(raw?.nextEventId||raw?.nextEvent?.id||raw?.nextEvent?.eventId||eventIR?.transitionPolicy?.nextEventId)||'',beats=globalThis.CortexContract?.materializeRuntimeBeats?.(raw,compiledEventIR)||list(raw?.beats);
    delete source.nextEvent;delete source.previousEvent;delete source.parentEvent;delete source.branchCandidates;
    /* compiledEventIR가 단일 권위다. 같은 IR과 정책을 packageMeta.semantic에 다시 복제하면
       100사건 그래프가 선형으로 세 겹 커진다. 패키지가 원래 선언한 semantic 메타만 보존한다. */
    return {...source,id,nextEventId,title:text(raw?.title||raw?.name,'가져온 사건'),summary:text(raw?.summary||raw?.description),startTime:start.length===5?`${start}:00`:start,endTime:end.length===5?`${end}:00`:end,storyDay:Number.isFinite(+raw?.storyDay)?+raw.storyDay:Number.isFinite(+raw?.scheduleDay)?+raw.scheduleDay:Number.isFinite(+raw?.schedule?.day)?+raw.schedule.day:Number.isFinite(+raw?.multiroute?.loopDay)?Math.max(0,+raw.multiroute.loopDay-1):0,canonLocation:text(raw?.canonLocation||raw?.location||raw?.place),canonLocationRef:text(raw?.canonLocationRef),locationAliases:clone(raw?.locationAliases||null),locations:clone(raw?.locations||null),transitionLocationRefs:clone(raw?.transitionLocationRefs||null),observationLocationRefs:clone(raw?.observationLocationRefs||null),beats:list(beats).map((beat,i)=>({...clone(beat),id:safeId(beat?.id,`beat-${i+1}`),goal:text(beat?.goal||beat?.description),phase:text(beat?.phase),status:text(beat?.status,i?'PENDING':'ACTIVE')})),requiredFunctions:list(requirements).map(normalizeRequirement).filter(requirement=>requirement.description),policyConstraints:list(policyConstraints).map(normalizeRequirement).filter(requirement=>requirement.description),compiledEventIR,packageMeta:clone(raw?.packageMeta||{}),presentCharacterIds:list(raw?.presentCharacterIds)};
  }

  function findManifest(jsonFiles){return Object.entries(jsonFiles||{}).filter(([path,value])=>/(^|\/)manifest\.json$/iu.test(path)&&value&&typeof value==='object').sort(([a],[b])=>{const left=pathBase(a),right=pathBase(b),leftRoot=left==='manifest.json'?0:1,rightRoot=right==='manifest.json'?0:1;return leftRoot-rightRoot||left.split('/').length-right.split('/').length||left.length-right.length})[0]?.[1]||{}}
  function exactValue(jsonFiles,paths){for(const wanted of paths.map(pathBase)){const entry=Object.entries(jsonFiles||{}).find(([path])=>pathBase(path)===wanted||pathBase(path).endsWith(`/${wanted}`));if(entry)return entry[1]}return null}
  function childArray(value,keys=[]){if(Array.isArray(value))return value;const root=object(value);for(const key of keys)if(Array.isArray(root[key]))return root[key];return []}
  function packageCatalog(jsonFiles){
    const manifest=findManifest(jsonFiles),preferred=referencedJsonPaths(manifest),nodes=[];for(const [path,value] of Object.entries(jsonFiles||{}))walk(value,path,'',nodes);
    const arrays=nodes.filter(node=>Array.isArray(node.value)),eventCandidates=arrays.map(node=>({...node,role:structuralArrayRole(node,'events'),score:scoreArray(node,'events',preferred)})).filter(node=>node.role==='ROOT'&&node.score>=3).sort((a,b)=>b.score-a.score),characterCandidates=arrays.map(node=>({...node,role:structuralArrayRole(node,'characters'),score:scoreArray(node,'characters',preferred)})).filter(node=>node.role==='ROOT'&&node.score>=3).sort((a,b)=>b.score-a.score);
    const project=object(exactValue(jsonFiles,['project.json'])),eventFile=exactValue(jsonFiles,['events/events.json']),projectEvents=childArray(project,['events']),canonicalEventArrays=[];
    if(childArray(eventFile,['events']).length)canonicalEventArrays.push({path:'events/events.json',value:childArray(eventFile,['events'])});
    if(projectEvents.length)canonicalEventArrays.push({path:'project.json.events',value:projectEvents});
    const chosenEventGroups=canonicalEventArrays.length?canonicalEventArrays:eventCandidates.map(node=>({path:node.path,value:node.value}));
    const playerFile=exactValue(jsonFiles,['characters/player.json','player.json']),npcFile=exactValue(jsonFiles,['characters/npcs.json','characters/characters.json','npcs.json','characters.json']),projectPeople=childArray(project,['characters','npcs','cast']),explicitPeople=[...(playerFile?(Array.isArray(playerFile)?playerFile:[object(playerFile).player||object(playerFile).protagonist||playerFile]):[]),...childArray(npcFile,['characters','npcs','cast']),...projectPeople].filter(person=>person&&typeof person==='object');
    const chosenCharacterGroups=explicitPeople.length?[{path:'DECLARED_CHARACTER_ROOTS',value:explicitPeople}]:characterCandidates.map(node=>({path:node.path,value:node.value}));
    const eventGroups=uniqueBy(chosenEventGroups.map(group=>({path:group.path,eventIds:uniqueBy(group.value.map(normalizeEvent),event=>event.id).map(event=>event.id)})),group=>group.eventIds.join('|')),events=uniqueBy(chosenEventGroups.flatMap(group=>group.value).map(normalizeEvent),event=>event.id),characters=uniqueBy(chosenCharacterGroups.flatMap(group=>group.value).map(normalizeCharacter),character=>character.id);
    const discovered=globalThis.CortexContract?.discoverPackageParts?.(jsonFiles)||{},opening=object(exactValue(jsonFiles,['start/opening.json','opening.json'])),initialFile=exactValue(jsonFiles,['world/initial_state.json','initial_state.json']),initial=object(initialFile||(Object.keys(opening).length?opening:discovered.initial)),world=object(exactValue(jsonFiles,['world/world.json','world.json'])),runtime=exactValue(jsonFiles,['runtime.json','rules/narrative_runtime.json'])||discovered.runtime||null,routeData=object(exactValue(jsonFiles,['routes/route_graph.json','route_graph.json'])),relationships=childArray(exactValue(jsonFiles,['relations/character_relations.json','relationships.json']),['relationships','relations']),resolvedProject=Object.keys(project).length?project:object(discovered.project);
    /* v1.13.0 — 작품별 문체 규칙을 읽는다.
       Studio 는 감독실에서 정한 서술 시점·문장 스타일·대화 스타일·묘사 밀도를
       rules/style.json 으로 내보내는데, 로더가 그 파일을 목록에 넣지 않아 통째로 버려지고 있었다.
       작품이 이미 자기 문체를 선언해 두었는데 엔진이 읽지 않아,
       모든 작품에 같은 문체 지침을 적용하는 상태였다. */
    /* 문체는 두 곳에 나뉘어 있다. rules/style.json 이 집필 규칙이고
       project.json 의 playStyle·tone 은 작품 기본 정보다. 둘을 합쳐야 온전한 문체가 된다.
       충돌하면 명시적 집필 규칙인 style.json 쪽을 남긴다. */
    const styleFile=object(exactValue(jsonFiles,['rules/style.json','style.json','rules/style_rules.json']));
    /* v1.24.0 — 작품별 명칭이 아니라 명시적 의미 계약 경로를 읽는다.
       규칙·능력 파일이 없는 구형 작품은 빈 계약으로 그대로 동작한다. */
    const worldRuleFile=exactValue(jsonFiles,['rules/world_rules.json','rules/world-rules.json','world_rules.json','world-rules.json']),capabilityFile=exactValue(jsonFiles,['rules/capabilities.json','rules/abilities.json','capabilities.json','abilities.json']),imageTriggers=clone(exactValue(jsonFiles,['events/image_triggers.json','image_triggers.json'])||[]),imageTriggerRuntime=clone(exactValue(jsonFiles,['rules/image_trigger_runtime.json','image_trigger_runtime.json'])||null);
    const projectStyle={};
    for(const key of ['playStyle','tone','narrativePerspective','sentenceStyle','dialogueStyle','descriptionDensity'])if(resolvedProject?.[key]!=null&&resolvedProject[key]!=='')projectStyle[key]=resolvedProject[key];
    const style=Object.keys(styleFile).length||Object.keys(projectStyle).length?{...projectStyle,...styleFile}:null;
    return {manifest,preferred,events,characters,initial,opening,world,project:resolvedProject,runtime,routeData,relationships,style,worldRuleFile,capabilityFile,imageTriggers,imageTriggerRuntime,eventGroups,characterGroups:chosenCharacterGroups.map(group=>group.path),jsonPaths:Object.keys(jsonFiles||{})};
  }

  function packageCapabilities(catalog){
    const joined=JSON.stringify({manifest:catalog.manifest,project:catalog.project,runtime:catalog.runtime,characters:catalog.characters,paths:catalog.jsonPaths}),version=text(catalog.manifest?.version||catalog.manifest?.packageVersion),format=text(catalog.manifest?.format||catalog.manifest?.schema||catalog.project?.format),routeKeys=walk({manifest:catalog.manifest,project:catalog.project,runtime:catalog.runtime}).filter(node=>/(?:route|branch|root)/iu.test(node.key));
    return {package15:/1\.5/u.test(version)||/(?:SCENARIOPACK|PACKAGE[_ -]?V?1\.5)/iu.test(joined),instantStoryV2:/(?:INSTANT[_ -]?STORY|INSTANTSTORY)/iu.test(joined)&&/(?:RUNTIME[_ -]?V?2|"version"\s*:\s*"?2)/iu.test(joined),multiRoot:catalog.eventGroups.length>1||routeKeys.some(node=>Array.isArray(node.value)&&node.value.length>1),embeddedStudio:Boolean(catalog.manifest?.editorSource||catalog.jsonPaths.some(path=>/studio\/project-snapshot\.json$/iu.test(path))),revealPolicy:/(?:preRevealAlias|revealPolicy|protectedTerms)/u.test(joined),assetReferences:/(?:assetRef|assets\/|imageRef|coverRef)/u.test(joined),format,version};
  }

  function collectPolicy(catalog){
    const reveal=[],assets=[];for(const node of walk({manifest:catalog.manifest,project:catalog.project,runtime:catalog.runtime,characters:catalog.characters})){
      if(/(?:reveal|protected|preRevealAlias)/iu.test(node.key))reveal.push({path:node.path,value:clone(node.value)});
      if(/(?:assetRef|imageRef|coverRef|portraitRef|backgroundRef)/iu.test(node.key)&&typeof node.value==='string')assets.push({path:node.path,ref:node.value});
    }
    return {reveal,assets:uniqueBy(assets,item=>`${item.path}|${item.ref}`),editorSource:clone(catalog.manifest?.editorSource||null)};
  }

  function routeGraph(catalog){
    const nodes=Object.fromEntries(catalog.events.map(event=>[event.id,event])),routes=[];
    for(const group of catalog.eventGroups)if(group.eventIds.length)routes.push({id:`route-${hash(group.path)}`,sourcePath:group.path,eventIds:[...group.eventIds]});
    const explicit=list(catalog.routeData?.routes||catalog.project?.routes||catalog.project?.package15?.routes||catalog.manifest?.routes||catalog.runtime?.routes||catalog.runtime?.roots).map((route,index)=>({id:safeId(route?.id||route?.routeId||route?.name,`route-${index+1}`),label:text(route?.label||route?.title||route?.name),eventIds:list(route?.eventIds||route?.events||route?.chapterEventIds).map(item=>safeId(item?.id||item?.eventId||item)).filter(id=>nodes[id])})).filter(route=>route.eventIds.length);
    const merged=explicit.length?explicit:routes.length?routes:[{id:'main',label:'Main',eventIds:catalog.events.map(event=>event.id)}];return {nodes,routes:uniqueBy(merged,route=>route.id),roots:uniqueBy(merged.map(route=>route.eventIds[0]).filter(Boolean),id=>id)};
  }

  function initialScalar(value){
    if(typeof value==='string'||typeof value==='number')return text(value);
    const source=object(value);for(const candidate of [source.name,source.title,source.label,source.value,source.id])if(typeof candidate==='string'||typeof candidate==='number'){const found=text(candidate);if(found)return found}return '';
  }

  function initialField(scopes,aliases,accept=()=>true){
    for(const scope of scopes){
      const source=object(scope.value);
      for(const alias of aliases){
        if(!Object.prototype.hasOwnProperty.call(source,alias))continue;
        const value=initialScalar(source[alias]);
        if(value&&accept(value))return {value,source:`${scope.path}.${alias}`};
      }
    }
    return {value:'',source:''};
  }

  function resolveInitialWorld(catalog,activeEvent){
    const opening=object(catalog.opening),initial=object(catalog.initial),project=object(catalog.project),world=object(catalog.world);
    const scopes=[
      {path:'start.opening.initialState.world',value:opening.initialState?.world},
      {path:'start.opening.initialWorld',value:opening.initialWorld},
      {path:'start.opening.world',value:opening.world},
      {path:'initial.snapshot.world',value:initial.snapshot?.world},
      {path:'initial.world',value:initial.world},
      {path:'initial.initialWorld',value:initial.initialWorld},
      {path:'world.initialState.world',value:world.initialState?.world},
      {path:'world.initialState',value:world.initialState},
      {path:'world.initialWorld',value:world.initialWorld},
      {path:'project.initialState.world',value:project.initialState?.world},
      {path:'project.world.initialState',value:project.world?.initialState},
      {path:'start.opening',value:opening},
      {path:'project.opening',value:project.opening}
    ];
    const scopedLocation=initialField(scopes,['location','currentLocation','startLocation','openingLocation','canonLocation','place','zone']),projectLocation=initialField([{path:'project',value:project}],['startLocation','openingLocation','currentLocation']),eventLocation=initialField([{path:'activeEvent',value:activeEvent}],['canonLocation']),location=scopedLocation.value?scopedLocation:projectLocation.value?projectLocation:eventLocation,scopedTime=initialField(scopes,['time','currentTime','startTime','openingTime','worldTime'],value=>/^\d{1,2}:\d{2}(?::\d{2})?$/u.test(value)),projectTime=initialField([{path:'project',value:project}],['startTime','openingTime','currentTime'],value=>/^\d{1,2}:\d{2}(?::\d{2})?$/u.test(value)),time=scopedTime.value?scopedTime:projectTime;
    const eventTimeDeclared=Boolean(text(activeEvent?.timeWindow||activeEvent?.start||activeEvent?.schedule?.start)||(text(activeEvent?.startTime)&&text(activeEvent?.startTime)!=='00:00:00')),eventTime=time.value?time:(eventTimeDeclared?{value:text(activeEvent.startTime),source:'activeEvent.startTime'}:{value:'',source:''}),scopedDay=initialField(scopes,['day','currentDay','startDay'],value=>Number.isFinite(+value)),projectDay=initialField([{path:'project',value:project}],['startDay','currentDay'],value=>Number.isFinite(+value)),day=scopedDay.value?scopedDay:projectDay;
    return {day:day.value?+day.value:Number.isFinite(+activeEvent?.storyDay)?+activeEvent.storyDay:0,time:eventTime.value,location:location.value,sources:{day:day.source,time:eventTime.source,location:location.source}};
  }

  function adaptPackage(jsonFiles,options={}){
    const catalog=packageCatalog(jsonFiles),capabilities=packageCapabilities(catalog),graph=routeGraph(catalog),initial=object(catalog.initial),opening=object(catalog.opening),project=object(catalog.project),declaredRef=opening.protagonistId||opening.playerCharacterId||opening.playerId||opening.protagonist||initial.protagonist||initial.player||initial.snapshot?.player||project.protagonist||project.mainCharacter||project.player,declared=typeof declaredRef==='string'?catalog.characters.find(character=>character.id===safeId(declaredRef)):declaredRef,roleHero=catalog.characters.find(character=>/(?:protagonist|player|main|주인공|플레이어)/iu.test(character.role)||character.source?.isPlayer===true),protagonist=declared&&typeof declared==='object'?normalizeCharacter(declared,0):roleHero||catalog.characters[0]||normalizeCharacter({id:'protagonist',name:'주인공'},0),cast=uniqueBy([protagonist,...catalog.characters],character=>character.id),firstNarrativeEvent=catalog.events.slice().sort((a,b)=>(+a.sequence||Number.MAX_SAFE_INTEGER)-(+b.sequence||Number.MAX_SAFE_INTEGER))[0],requestedActive=safeId(opening.activeEventId||opening.openingEventId||opening.startEventId||opening.eventId||initial.activeEventId||initial.eventId||initial.snapshot?.activeEventId||firstNarrativeEvent?.id||graph.roots[0],'event'),activeEvent=graph.nodes[requestedActive]||firstNarrativeEvent||normalizeEvent({id:requestedActive,title:'가져온 사건'}),initialWorld=resolveInitialWorld(catalog,activeEvent),packageId=safeId(catalog.manifest?.id||catalog.manifest?.packageId||catalog.manifest?.projectId||project.id||project.projectId||options.fileName,`package-${hash(options.fileName||JSON.stringify(catalog.manifest))}`),policy=collectPolicy(catalog),presentIds=list(opening.presentCharacterIds||opening.scene?.presentCharacterIds||initial.presentCharacterIds||initial.scene?.presentCharacterIds||initial.snapshot?.presentCharacterIds||activeEvent.presentCharacterIds||[protagonist.id]),relationships=clone(opening.relationships||initial.relationships||project.relationships||catalog.relationships||[]),resourceState=clone(opening.resources||initial.resources||initial.snapshot?.resources||project.resources||{}),declaredRules=catalog.worldRuleFile||project.worldRuleGraph||project.worldRules||catalog.world?.worldRuleGraph||catalog.world?.worldRules||catalog.runtime?.worldRuleGraph||catalog.runtime?.worldRules||opening.worldRuleGraph||opening.worldRules||[],declaredCapabilities=catalog.capabilityFile||project.capabilityLedger||project.capabilities||project.abilities||catalog.runtime?.capabilityLedger||catalog.runtime?.capabilities||catalog.runtime?.abilities||opening.capabilityLedger||opening.capabilities||opening.abilities||[],worldAuthority=globalThis.CortexWorldAuthority?.compilePackageContract?.({worldRules:declaredRules,capabilities:declaredCapabilities,characters:cast,resources:resourceState})||{worldRuleGraph:{schema:'CORTEX_WORLD_RULE_GRAPH_V1',rules:[]},capabilityLedger:{schema:'CORTEX_CAPABILITY_LEDGER_V1',capabilities:[]},resources:resourceState},sourceFacts={characterCount:cast.filter(character=>character.name!=='주인공').length,eventCount:catalog.events.length,hadWorldLocation:Boolean(initialWorld.sources.location),hadWorldTime:Boolean(initialWorld.sources.time),worldLocationSource:initialWorld.sources.location,worldTimeSource:initialWorld.sources.time,hadEventSummary:catalog.events.some(event=>text(event.summary)),hadRelationships:catalog.relationships.length>0};
    const protagonistInvariants=clone(project.protagonistInvariants||exactValue(jsonFiles,['cortex/protagonist_invariants.json','protagonist_invariants.json'])||catalog.manifest?.protagonistInvariants||null);
    const locationGraph=clone(project.locationGraph||exactValue(jsonFiles,['cortex/location_graph.json','location_graph.json'])||catalog.manifest?.locationGraph||null);/* v1.27.5 — 불변식과 동일한 누락: 엔진은 위치 그래프를 소비할 준비가 돼 있는데 ZIP 수입 경로가 없어 Studio 산출물의 선언이 유실됐다. */
    if(capabilities.instantStoryV2&&!Object.keys(graph.nodes).length){graph.nodes[activeEvent.id]={...activeEvent,requiredFunctions:[],compiledEventIR:{...activeEvent.compiledEventIR,completionPolicy:{...(activeEvent.compiledEventIR?.completionPolicy||{}),goals:[],operator:'ALL',executable:true}}};graph.routes=[{id:'instant-story',label:'Instant Story',eventIds:[activeEvent.id]}];graph.roots=[activeEvent.id]}
    const resolvedPresent=presentIds.filter(id=>cast.some(character=>character.id===safeId(id))).map(safeId);if(!resolvedPresent.length)resolvedPresent.push(protagonist.id);
    /* 표시 문구와 장소 정체성을 분리한다. 문구가 조금 바뀌어도 패키지와 선언 경로가 같으면 같은 장소다. */
    const locationEntityRef=(()=>{const label=text(initialWorld.location);if(!label)return '';
      const nodes=list(locationGraph?.nodes),fallback=()=>`location:${hash(`${packageId}|${initialWorld.sources.location||'initial-world'}`)}`;
      if(!nodes.length)return fallback();
      /* v1.27.6 — 시작 위치 해석: 정규화 완전 일치 → 가장 긴 별칭 포함 일치 → 동률이면 부모 관계로 더 구체적인 쪽.
         그래도 모호하면 임의로 고르지 않고 미결로 남긴다. 넓은 별칭('집')이 구체적 장소('한명진이 살던 집')를 가로채던 문제. */
      const norm=value=>text(value).toLowerCase().replace(/[\s·,.\-—()[\]'"]/gu,''),target=norm(label);
      const refOf=node=>text(node?.locationRef||node?.ref);
      const exact=nodes.filter(node=>[text(node?.label),...list(node?.aliases).map(value=>text(value))].some(name=>name&&norm(name)===target));
      if(exact.length===1)return refOf(exact[0]);
      const scored=[];
      for(const node of nodes){let best=0;for(const name of [text(node?.label),...list(node?.aliases).map(value=>text(value))]){const key=norm(name);if(key&&target.includes(key)&&key.length>best)best=key.length}if(best)scored.push({node,best})}
      if(!scored.length)return '';
      const top=Math.max(...scored.map(row=>row.best)),winners=scored.filter(row=>row.best===top);
      if(winners.length===1)return refOf(winners[0].node);
      const refs=new Set(winners.map(row=>refOf(row.node)));
      const specific=winners.filter(row=>refs.has(text(row.node?.parentRef)));
      return specific.length===1?refOf(specific[0].node):'';
    })();
    const session={schema:SCHEMA,bridge:{schema:BRIDGE_SCHEMA,version:BRIDGE_BUILD},package:{id:packageId,title:text(project.title||project.name||catalog.manifest?.title,options.fileName||'가져온 작품'),format:capabilities.format,version:capabilities.version,capabilities,manifest:clone(catalog.manifest),sourcePaths:{json:catalog.jsonPaths,events:catalog.eventGroups.map(group=>group.path),characters:catalog.characterGroups},sourceFacts,openingContract:clone(opening),runtimeExtension:clone(catalog.runtime),worldRuleGraph:clone(worldAuthority.worldRuleGraph),imageTriggers:clone(catalog.imageTriggers),imageTriggerRuntime:clone(catalog.imageTriggerRuntime),policy},story:{title:text(project.title||project.name||catalog.manifest?.title,options.fileName||'가져온 작품'),genre:text(project.genre),tone:text(project.tone||project.style),summary:text(project.summary||project.synopsis||activeEvent.summary),style:clone(catalog.style||project.style||null)},cast:{protagonistId:protagonist.id,entities:Object.fromEntries(cast.map(character=>[character.id,character]))},eventGraph:graph,state:{world:{day:initialWorld.day,time:initialWorld.time,location:initialWorld.location,locationEntityRef,locationDescription:initialWorld.location},scene:{presentCharacterIds:resolvedPresent},relationships,activeEventId:activeEvent.id,eventRuntime:{},eventMachine:{schema:'CORTEX_EVENT_FSM_V1',activeEventId:activeEvent.id,state:'ACTIVE',eventTurns:0,extensionCount:0},eventLedger:{sealed:[],activeEventId:activeEvent.id},imageTriggerLedger:{schema:'CORTEX_IMAGE_TRIGGER_LEDGER_V1',firedTriggerIds:clone(catalog.imageTriggerRuntime?.stateLedger?.firedTriggerIds||[])},evidenceLedger:[],routeState:{activeRouteId:graph.routes.find(route=>route.eventIds.includes(activeEvent.id))?.id||graph.routes[0]?.id||'main'},revealState:clone(opening.revealState||initial.revealState||{}),capabilityLedger:clone(worldAuthority.capabilityLedger),resources:clone(resourceState),canonLedger:{schema:'CORTEX_CANON_LEDGER_V1',revision:0,entries:[]},carryoverLedger:[]},engines:{selected:'cortex',nexus:{},cortex:{}},history:{turnCount:0},revision:0};
    session.package.protagonistInvariants=protagonistInvariants;
    session.package.locationGraph=locationGraph;
    session.integrity=validateCanonical(session);if(!session.integrity.ok)throw new Error(`PACKAGE_ADAPTER_REJECTED:${session.integrity.issues.join(',')}`);return session;
  }

  /* ZIP 해제 자체는 UI가 담당하고, 패키지 의미 해석은 브리지의 단일 진입점에서 수행한다.
     파일명·작품명별 예외 없이 JSON 경로와 구조만으로 Package 1.5, Instant Story,
     구형 단일 루트를 같은 canonical session으로 변환한다. */
  function adaptArchiveEntries(entries,options={}){
    const decoder=new TextDecoder('utf-8',{fatal:false}),jsonFiles={},invalidJson=[],oversizeJson=[],runtimeIgnoredJson=[],maxJsonBytes=Math.max(1024,+options.maxJsonBytes||384*1024*1024),ignoredPaths=new Set(list(options.runtimeIgnoredPaths).map(pathBase).filter(Boolean)),isIgnored=name=>[...ignoredPaths].some(path=>name===path||name.endsWith(`/${path}`));
    for(const [rawName,rawBytes] of Object.entries(object(entries))){
      const name=text(rawName).replace(/\\/gu,'/');if(!/\.json$/iu.test(name))continue;
      if(isIgnored(pathBase(name))){runtimeIgnoredJson.push(name);continue}
      let bytes;try{bytes=ArrayBuffer.isView(rawBytes)?new Uint8Array(rawBytes.buffer,rawBytes.byteOffset,rawBytes.byteLength):rawBytes instanceof ArrayBuffer?new Uint8Array(rawBytes):new Uint8Array(rawBytes)}catch{invalidJson.push(name);continue}
      if(bytes.byteLength>maxJsonBytes){oversizeJson.push(name);continue}
      try{jsonFiles[name]=JSON.parse(decoder.decode(bytes).replace(/^\uFEFF/u,''))}catch{invalidJson.push(name)}
    }
    if(oversizeJson.length)throw new Error(`PACKAGE_ARCHIVE_JSON_TOO_LARGE:${oversizeJson.join(',')}`);
    if(invalidJson.length)throw new Error(`PACKAGE_ARCHIVE_JSON_INVALID:${invalidJson.join(',')}`);
    const jsonPaths=Object.keys(jsonFiles);if(!jsonPaths.length)throw new Error('PACKAGE_ARCHIVE_JSON_MISSING');
    const canonicalSession=adaptPackage(jsonFiles,{...options,fileName:text(options.fileName,'nexus-package.zip')});
    return {canonicalSession,report:{jsonCount:jsonPaths.length,jsonPaths,invalidJson,oversizeJson,runtimeIgnoredJson,maxJsonBytes}};
  }

  function eventSequence(session){const route=session.eventGraph.routes.find(item=>item.id===session.state.routeState?.activeRouteId)||session.eventGraph.routes.find(item=>item.eventIds.includes(session.state.activeEventId))||session.eventGraph.routes[0];return list(route?.eventIds).map(id=>session.eventGraph.nodes[id]).filter(Boolean)}
  /* v1.31.4 — 영속 런타임 상태의 대칭 보존.
     canonical 세션은 명시 화이트리스트로만 state를 실어 날랐고, v1.29~v1.31에서 늘어난 장부(사건·챕터·사실·개체·신체·불변식)와
     packageV15 진행값은 목록에 없어 저장 → 복원 왕복에서 전부 사라졌다(배포 심사: 재접속 시 장기기억·부상·분기 이력 소실).
     1) PERSISTENT_RUNTIME_KEYS: 반드시 대칭 보존해야 하는 권위·기억 상태. 2) 그 밖의 runtime 키도 잃지 않도록
     state.cortexRuntimeExtra 버킷에 통째로 보존한다(명시 키가 우선). 3) packageV15는 package.runtimeExtension으로 역투영한다. */
  const PERSISTENT_RUNTIME_KEYS=['episodeLedger','chapterLedger','factLedger','entityLedger','systemicPhysicalState','protagonistInvariantLedger','lastEventHandoff','nextTurnContinuityCapsule','commitState','pendingEpisodeSeal','presenceDeltas','resourceLedger','knowledgeLedger','repairDebtLedger','requirementVerdicts','committedEventBeatLedger','capabilityExecutionLedger'];
  const TRANSIENT_RUNTIME_KEYS=new Set(['storyId','packageContract','canonicalBridge','packageV15','canonLedger','eventLedger','eventMachine','imageTriggerLedger','systemicEventState','evidenceLedger','carryoverLedger','sceneContinuity','disclosureLedger','judgePerformanceLedger','judgeAuditLedger']);
  function persistentRuntimeSlice(runtime){const out={};for(const key of PERSISTENT_RUNTIME_KEYS)if(runtime&&runtime[key]!==undefined)out[key]=clone(runtime[key]);return out}
  function extraRuntimeSlice(runtime){const out={};for(const [key,value] of Object.entries(runtime||{}))if(!PERSISTENT_RUNTIME_KEYS.includes(key)&&!TRANSIENT_RUNTIME_KEYS.has(key)&&value!==undefined)out[key]=clone(value);return out}
  const KNOWN_PACKAGE_CONTRACT_KEYS=new Set(['capabilities','eventGraph','activeEventIR','policy','openingContract','routeState','revealState','worldRuleGraph','imageTriggers','imageTriggerRuntime','capabilityLedger','resources']);
  function packageContractExtra(runtime){const out={};for(const [key,value] of Object.entries(runtime?.packageContract||{}))if(!KNOWN_PACKAGE_CONTRACT_KEYS.has(key)&&value!==undefined)out[key]=clone(value);return out}
  /* v1.31.5 — 구 세이브 승격. canonical에 cortexRuntime/cortexRuntimeExtra가 없는 구형(≤1.31.3)이면,
     canonical의 세계·장면·현재 사건 권위는 유지하되 함께 저장된 scenario.runtime에서 영속 장부·확장 필드·packageV15 진행값을 병합한다.
     복원(restore)과 가져오기(applyImportedState)가 같은 함수를 쓴다. 배포 심사: 공개판(v1.29.4) 세이브가 v1.31.4로 열리면
     canonical 우선 선택 때문에 더 완전한 scenario가 버려져 장기기억·신체·분기 이력이 사라졌다. */
  function isLegacyCanonical(session){return session?.schema===SCHEMA&&!session.state?.cortexRuntime&&!session.state?.cortexRuntimeExtra}
  /* v1.36.3 — 판정관이 검증해 만든 공개 SESSION 인물은 정식 패키지 배역표에는 없을 수 있다.
     장면 현재 인물로 커밋된 뒤 저장·가져오기에서 UNKNOWN으로 거부하지 않도록 런타임 인물 장부를 canonical cast로 승격한다. */
  function reconcileCastRecovery(runtime,registered){const prior=runtime?.castReferenceRecovery,resolved=list(prior?.entries).filter(row=>registered.has(row.characterRef));if(resolved.length)runtime.castReferenceRecovery={...prior,status:list(prior.entries).length===resolved.length?'RESOLVED':'PENDING',entries:list(prior.entries).filter(row=>!registered.has(row.characterRef)),history:[...list(prior.history),...resolved.map(row=>({...row,status:'RESOLVED_BY_PERSISTED_REGISTRATION'}))]};return resolved;}
  function promoteRuntimePersonEntities(session,scenario=null){
    if(session?.schema!==SCHEMA)return {session,changed:false,promoted:[]};const next=clone(session),rows=[...list(next.state?.cortexRuntime?.entityLedger?.entities),...list(scenario?.runtime?.entityLedger?.entities)],promoted=[];
    next.cast=next.cast||{protagonistId:'',entities:{}};next.cast.entities=object(next.cast.entities);
    // Restore explicit persisted registrations, including people who already left the scene.
    for(const row of rows){const id=text(row?.entityRef||row?.id),label=text(row?.label||row?.name),kind=text(row?.entityType||row?.type).toUpperCase(),visibility=text(row?.visibility,'PUBLIC').toUpperCase();if(!id||!label||kind!=='PERSON'||visibility!=='PUBLIC'||row.persistence==='TURN_LOCAL'||next.cast.entities[id])continue;next.cast.entities[id]=normalizeCharacter({id,name:label,aliases:list(row?.aliases),publicProfile:'',source:{runtimeEntity:true,creationAuthority:text(row?.creationAuthority),persistence:text(row?.persistence,'SESSION')}});promoted.push(id)}
    const resolvedRecovery=reconcileCastRecovery(next.state?.cortexRuntimeExtra,new Set(Object.keys(next.cast.entities)));
    const unknown=list(next.state?.scene?.presentCharacterIds).filter(id=>!next.cast.entities[id]);
    if(unknown.length){
      next.state.cortexRuntimeExtra=next.state.cortexRuntimeExtra||{};const extra=next.state.cortexRuntimeExtra,prior=list(extra.castReferenceRecovery?.entries),entries=new Map(prior.map(row=>[text(row.characterRef),row])),graph=next.state?.cortexRuntimeExtra?.lastCommitGraph||scenario?.runtime?.lastCommitGraph;
      for(const id of unknown)if(!entries.has(id))entries.set(id,{characterRef:id,status:'UNKNOWN',reason:'MISSING_PERSISTED_PERSON_REGISTRATION',claims:clone(list(graph?.claims).filter(row=>row.actorRef===id||row.targetRef===id)),presenceDeltas:clone(list(graph?.presenceDeltas).filter(row=>row.characterRef===id))});
      extra.castReferenceRecovery={schema:'CORTEX_CAST_REFERENCE_RECOVERY_V1',status:'PENDING',policy:'PRESERVE_EVIDENCE_REPROJECT_IDENTITY_NO_NAME_INFERENCE',entries:[...entries.values()],history:list(extra.castReferenceRecovery?.history)};
      // An unresolved identity is neither registered nor confirmed current. Never fabricate a label from the ref.
      next.state.scene={...next.state.scene,presentCharacterIds:list(next.state.scene.presentCharacterIds).filter(id=>next.cast.entities[id]),presenceStatus:'REPROJECTION_REQUIRED',unresolvedCharacterRefs:[...new Set([...list(next.state.scene.unresolvedCharacterRefs),...unknown])]};
      if(extra.presenceGraph)extra.presenceGraph={...extra.presenceGraph,presentCharacterIds:clone(next.state.scene.presentCharacterIds),status:'REPROJECTION_REQUIRED'};
    }
    const changed=promoted.length>0||unknown.length>0||resolvedRecovery.length>0;if(changed){next.integrity=validateCanonical(next);next.state.cortexRuntimeExtra=next.state.cortexRuntimeExtra||{};next.state.cortexRuntimeExtra.integrity=clone(next.integrity)}return {session:next,changed,promoted,unresolved:unknown}
  }

  function upgradeCanonicalSession(session,scenario){
    if(session?.schema!==SCHEMA)return {session:session||null,upgraded:false,reason:'NOT_CANONICAL'};
    if(!isLegacyCanonical(session)){const repaired=promoteRuntimePersonEntities(session,scenario);return {session:repaired.session,upgraded:repaired.changed,reason:repaired.changed?'RUNTIME_CAST_RECOVERED':'ALREADY_CURRENT',promotedEntityIds:repaired.promoted}}
    const runtime=scenario?.runtime||{},next=clone(session);
    next.state=next.state||{};
    next.state.cortexRuntime=persistentRuntimeSlice(runtime);
    next.state.cortexRuntimeExtra=extraRuntimeSlice(runtime);
    if(runtime.packageV15!==undefined){const previous=next.package?.runtimeExtension;const incoming=clone(runtime.packageV15);next.package=next.package||{};next.package.runtimeExtension=previous&&typeof previous==='object'&&incoming&&typeof incoming==='object'?{...previous,...incoming}:incoming}
    const contractExtra=packageContractExtra(runtime);if(Object.keys(contractExtra).length){next.package=next.package||{};next.package.contractExtra={...(next.package.contractExtra||{}),...contractExtra}}
    next.bridge={...(next.bridge||{}),version:BRIDGE_BUILD,upgradedFrom:text(session.bridge?.version),upgradedAt:new Date().toISOString()};
    const merged=Object.keys(next.state.cortexRuntime).length+Object.keys(next.state.cortexRuntimeExtra).length;
    const repaired=promoteRuntimePersonEntities(next,scenario);return {session:repaired.session,upgraded:true,reason:'LEGACY_CANONICAL_MERGED',mergedKeys:merged,upgradedFrom:text(session.bridge?.version),promotedEntityIds:repaired.promoted};
  }
  function toCortexScenario(session){
    if(session?.schema!==SCHEMA)throw new Error('CANONICAL_SESSION_REQUIRED');const sequence=eventSequence(session),events=sequence.map(event=>clone(event));for(let i=0;i<events.length-1;i++)events[i].nextEvent=events[i+1];const activeIndex=Math.max(0,sequence.findIndex(event=>event.id===session.state.activeEventId)),event=events[activeIndex]||clone(session.eventGraph.nodes[session.state.activeEventId])||normalizeEvent({id:'event',title:'현재 사건'}),entities=Object.values(session.cast.entities),protagonist=clone(session.cast.entities[session.cast.protagonistId]||entities[0]);
    /* v1.13.0 — 작품이 선언한 문체 규칙을 시나리오까지 실어 나른다. */
    return {schema:'CORTEX_SCENARIO_V1111',title:session.story.title,genre:session.story.genre,tone:session.story.tone,summary:session.story.summary,styleRules:clone(session.story.style||null),protagonist,characters:entities.filter(entity=>entity.id!==protagonist.id),relationships:clone(session.state.relationships),scene:clone(session.state.scene),world:clone(session.state.world),locationGraph:clone(session.package?.locationGraph||null),protagonistInvariants:clone(session.package?.protagonistInvariants||null),event,runtime:{...clone(session.state.cortexRuntimeExtra||{}),...persistentRuntimeSlice(session.state.cortexRuntime||{}),storyId:session.package.id,canonLedger:globalThis.CortexContract?.repairCanonLedger?.(session.state.canonLedger)||clone(session.state.canonLedger),eventLedger:clone(session.state.eventLedger||{sealed:[],activeEventId:event.id}),eventMachine:clone(session.state.eventMachine||{schema:'CORTEX_EVENT_FSM_V1',activeEventId:event.id,state:'ACTIVE',eventTurns:0}),imageTriggerLedger:clone(session.state.imageTriggerLedger||{schema:'CORTEX_IMAGE_TRIGGER_LEDGER_V1',firedTriggerIds:[]}),systemicEventState:clone(session.state.eventRuntime||{}),evidenceLedger:clone(session.state.evidenceLedger||[]),carryoverLedger:globalThis.CortexContract?.dedupeCarryover?.(session.state.carryoverLedger)||clone(session.state.carryoverLedger),sceneContinuity:clone(session.state.sceneContinuity||{lastText:'',lastLocation:session.state.world.location,lastWorldTime:session.state.world.time,stateFacts:[]}),disclosureLedger:clone(session.state.disclosureLedger||session.state.eventRuntime?.disclosureLedger||{}),judgePerformanceLedger:clone(session.state.judgePerformanceLedger||{}),judgeAuditLedger:clone(session.state.judgeAuditLedger||{}),packageV15:clone(session.package.runtimeExtension),packageContract:{capabilities:clone(session.package.capabilities),eventGraph:clone(session.eventGraph),activeEventIR:clone(event.compiledEventIR),policy:clone(session.package.policy),openingContract:clone(session.package.openingContract||{}),routeState:clone(session.state.routeState),revealState:clone(session.state.revealState),worldRuleGraph:clone(session.package.worldRuleGraph||{schema:'CORTEX_WORLD_RULE_GRAPH_V1',rules:[]}),imageTriggers:clone(session.package.imageTriggers||[]),imageTriggerRuntime:clone(session.package.imageTriggerRuntime||null),capabilityLedger:clone(session.state.capabilityLedger||{schema:'CORTEX_CAPABILITY_LEDGER_V1',capabilities:[]}),resources:clone(session.state.resources),...clone(session.package.contractExtra||{})},canonicalBridge:{schema:BRIDGE_SCHEMA,sessionRevision:session.revision,packageId:session.package.id,selectedEngine:session.engines.selected},sourcePackage:{fileName:session.package.title,manifest:clone(session.package.manifest),packageVersion:session.package.version,paths:clone(session.package.sourcePaths),importValidation:{sourceFacts:clone(session.package.sourceFacts||{}),issues:clone(session.integrity?.issues||[])}}} ,disclosure:{protectedTerms:session.package.policy.reveal.filter(item=>/protected/iu.test(item.path)).flatMap(item=>list(item.value))}};
  }

  function fromCortexScenario(scenario,turns=[],previous=null){
    let session=previous?.schema===SCHEMA?clone(previous):null;if(!session){const eventNodes={},eventIds=[],seen=new Set();let cursor=scenario?.event;while(cursor&&!seen.has(cursor)&&eventIds.length<256){seen.add(cursor);const event=normalizeEvent(cursor,eventIds.length);eventNodes[event.id]=event;eventIds.push(event.id);cursor=cursor.nextEvent}const entities=[scenario?.protagonist,...list(scenario?.characters)].filter(Boolean).map(normalizeCharacter);session={schema:SCHEMA,bridge:{schema:BRIDGE_SCHEMA,version:BRIDGE_BUILD},package:{id:safeId(scenario?.runtime?.storyId||scenario?.title,'story'),title:text(scenario?.title),format:'CORTEX_SCENARIO',version:BRIDGE_BUILD,locationGraph:clone(scenario?.locationGraph||null),protagonistInvariants:clone(scenario?.protagonistInvariants||null),capabilities:{package15:Boolean(scenario?.runtime?.packageV15),instantStoryV2:false,multiRoot:false,embeddedStudio:false,revealPolicy:true,assetReferences:false},manifest:{},sourcePaths:{json:[],events:[],characters:[]},sourceFacts:{characterCount:entities.length,eventCount:eventIds.length,hadWorldLocation:Boolean(text(scenario?.world?.location)),hadWorldTime:Boolean(text(scenario?.world?.time)),hadEventSummary:Boolean(text(scenario?.event?.summary)),hadRelationships:list(scenario?.relationships).length>0},openingContract:clone(scenario?.runtime?.packageContract?.openingContract||{}),runtimeExtension:clone(scenario?.runtime?.packageV15),worldRuleGraph:clone(scenario?.runtime?.packageContract?.worldRuleGraph||{schema:'CORTEX_WORLD_RULE_GRAPH_V1',rules:[]}),imageTriggers:clone(scenario?.runtime?.packageContract?.imageTriggers||[]),imageTriggerRuntime:clone(scenario?.runtime?.packageContract?.imageTriggerRuntime||null),policy:{reveal:[],assets:[],editorSource:null}},story:{title:text(scenario?.title),genre:text(scenario?.genre),tone:text(scenario?.tone),summary:text(scenario?.summary)},cast:{protagonistId:safeId(scenario?.protagonist?.id,'protagonist'),entities:Object.fromEntries(entities.map(entity=>[entity.id,entity]))},eventGraph:{nodes:eventNodes,routes:[{id:'main',label:'Main',eventIds}],roots:eventIds.slice(0,1)},state:{},engines:{selected:'cortex',nexus:{},cortex:{}},history:{turnCount:0},revision:0}}
    const runtimeEventIds=[],runtimeSeen=new Set();let runtimeCursor=scenario?.event;while(runtimeCursor&&!runtimeSeen.has(runtimeCursor)&&runtimeEventIds.length<256){runtimeSeen.add(runtimeCursor);const runtimeEvent=normalizeEvent(runtimeCursor,runtimeEventIds.length);session.eventGraph.nodes[runtimeEvent.id]={...(session.eventGraph.nodes[runtimeEvent.id]||{}),...runtimeEvent};runtimeEventIds.push(runtimeEvent.id);runtimeCursor=runtimeCursor.nextEvent}const activeRouteId=session.state?.routeState?.activeRouteId||session.eventGraph.routes.find(route=>route.eventIds.includes(safeId(scenario?.event?.id)))?.id||session.eventGraph.routes[0]?.id||'main';let activeRoute=session.eventGraph.routes.find(route=>route.id===activeRouteId);if(!activeRoute){activeRoute={id:activeRouteId,label:'Runtime',eventIds:[]};session.eventGraph.routes.push(activeRoute)}activeRoute.eventIds=[...new Set([...list(activeRoute.eventIds),...runtimeEventIds])];if(!session.eventGraph.roots.length&&runtimeEventIds[0])session.eventGraph.roots=[runtimeEventIds[0]];
    const committedTurns=list(turns).filter(turn=>turn?.status==='COMMITTED').length,scenarioRevision=Math.max(0,+scenario?.runtime?.canonicalBridge?.sessionRevision||0);session.story={...session.story,title:text(scenario?.title,session.story.title),genre:text(scenario?.genre,session.story.genre),tone:text(scenario?.tone,session.story.tone),summary:text(scenario?.summary,session.story.summary),style:clone(scenario?.styleRules||session.story.style||null)};session.package.worldRuleGraph=clone(scenario?.runtime?.packageContract?.worldRuleGraph||session.package.worldRuleGraph||{schema:'CORTEX_WORLD_RULE_GRAPH_V1',rules:[]});session.package.imageTriggers=clone(scenario?.runtime?.packageContract?.imageTriggers||session.package.imageTriggers||[]);session.package.imageTriggerRuntime=clone(scenario?.runtime?.packageContract?.imageTriggerRuntime||session.package.imageTriggerRuntime||null);session.state={...session.state,world:clone(scenario?.world||session.state.world),scene:clone(scenario?.scene||session.state.scene),relationships:clone(scenario?.relationships||session.state.relationships||[]),activeEventId:safeId(scenario?.event?.id||session.state.activeEventId,'event'),eventRuntime:clone(scenario?.runtime?.systemicEventState||session.state.eventRuntime||{}),eventMachine:clone(scenario?.runtime?.eventMachine||session.state.eventMachine||{}),eventLedger:clone(scenario?.runtime?.eventLedger||session.state.eventLedger||{}),imageTriggerLedger:clone(scenario?.runtime?.imageTriggerLedger||session.state.imageTriggerLedger||{schema:'CORTEX_IMAGE_TRIGGER_LEDGER_V1',firedTriggerIds:[]}),evidenceLedger:clone(scenario?.runtime?.evidenceLedger||session.state.evidenceLedger||[]),routeState:clone(scenario?.runtime?.packageContract?.routeState||session.state.routeState||{}),revealState:clone(scenario?.runtime?.packageContract?.revealState||session.state.revealState||{}),disclosureLedger:clone(scenario?.runtime?.disclosureLedger||session.state.disclosureLedger||{}),judgePerformanceLedger:clone(scenario?.runtime?.judgePerformanceLedger||session.state.judgePerformanceLedger||{}),judgeAuditLedger:clone(scenario?.runtime?.judgeAuditLedger||session.state.judgeAuditLedger||{}),capabilityLedger:clone(scenario?.runtime?.packageContract?.capabilityLedger||session.state.capabilityLedger||{schema:'CORTEX_CAPABILITY_LEDGER_V1',capabilities:[]}),resources:clone(scenario?.runtime?.packageContract?.resources||session.state.resources||{}),canonLedger:globalThis.CortexContract?.repairCanonLedger?.(scenario?.runtime?.canonLedger||session.state.canonLedger)||clone(scenario?.runtime?.canonLedger),carryoverLedger:globalThis.CortexContract?.dedupeCarryover?.(scenario?.runtime?.carryoverLedger||session.state.carryoverLedger)||clone(scenario?.runtime?.carryoverLedger),sceneContinuity:clone(scenario?.runtime?.sceneContinuity||session.state.sceneContinuity||{}),cortexRuntime:persistentRuntimeSlice(scenario?.runtime),cortexRuntimeExtra:extraRuntimeSlice(scenario?.runtime)};session.package.locationGraph=clone(scenario?.locationGraph||session.package.locationGraph||null);if(scenario?.runtime?.packageV15!==undefined)session.package.runtimeExtension=clone(scenario.runtime.packageV15);{const contractExtra=packageContractExtra(scenario?.runtime);if(Object.keys(contractExtra).length)session.package.contractExtra=contractExtra}/* v1.31.4 — 기존 세션 갱신에서도 packageV15 진행값(flags·completedEventIds)을 역투영한다 */session.package.protagonistInvariants=clone(scenario?.protagonistInvariants||session.package.protagonistInvariants||null);/* v1.26.0(사용자)/v1.26.3 — 기존 canonical 세션 갱신도 최신 위치 그래프를 보존한다 */session.engines.cortex={...session.engines.cortex,lastBuild:BRIDGE_BUILD,lastTurnCount:committedTurns};session.history.turnCount=committedTurns;session.revision=Math.max(+session.revision||0,scenarioRevision,committedTurns);session=flattenEventReferences(promoteRuntimePersonEntities(session,scenario).session);session.integrity=validateCanonical(session);return session;
  }

  function validateCanonical(session){
    const issues=[],warnings=[],entities=object(session?.cast?.entities),nodes=object(session?.eventGraph?.nodes),present=list(session?.state?.scene?.presentCharacterIds),facts=object(session?.package?.sourceFacts),active=nodes[session?.state?.activeEventId];
    if(session?.schema!==SCHEMA)issues.push('CANONICAL_SCHEMA_MISMATCH');if(!text(session?.package?.id))issues.push('PACKAGE_ID_MISSING');if(!text(session?.story?.title))issues.push('STORY_TITLE_MISSING');if(!text(session?.cast?.protagonistId)||!entities[session?.cast?.protagonistId])issues.push('PROTAGONIST_IDENTITY_MISSING');if(!text(session?.state?.activeEventId)||!active)issues.push('ACTIVE_EVENT_MISSING');for(const id of present)if(!entities[id])issues.push(`SCENE_CHARACTER_UNKNOWN:${id}`);for(const [id,node] of Object.entries(nodes))if(node?.nextEvent&&typeof node.nextEvent==='object')issues.push(`RECURSIVE_EVENT_OBJECT:${id}`);
    if(+facts.characterCount>0&&Object.keys(entities).length<+facts.characterCount)issues.push('CHARACTERS_LOST_DURING_IMPORT');if(+facts.eventCount>0&&Object.keys(nodes).length<+facts.eventCount)issues.push('EVENTS_LOST_DURING_IMPORT');if(facts.hadWorldLocation&&!text(session?.state?.world?.location))issues.push('LOCATION_LOST_DURING_IMPORT');if(facts.hadWorldTime&&!text(session?.state?.world?.time))issues.push('TIME_LOST_DURING_IMPORT');if(facts.hadEventSummary&&!text(active?.summary))issues.push('ACTIVE_EVENT_SUMMARY_LOST');if(facts.hadRelationships&&!list(session?.state?.relationships).length)issues.push('RELATIONSHIPS_LOST_DURING_IMPORT');if(active&&(active.current!=null||active.maximum!=null)&&active.relatedEventId&&!active.requiredFunctions?.length)issues.push('AUXILIARY_CLOCK_SELECTED_AS_EVENT');
    if(!text(session?.state?.world?.location)&&!facts.hadWorldLocation)warnings.push('WORLD_LOCATION_UNDECLARED');if(!text(session?.state?.world?.time)&&!facts.hadWorldTime)warnings.push('WORLD_TIME_UNDECLARED');else if(!/^\d{1,2}:\d{2}(?::\d{2})?$/u.test(text(session?.state?.world?.time)))warnings.push('WORLD_TIME_NONSTANDARD');if(active&&active.compiledEventIR?.identity?.required===true&&active.compiledEventIR?.completionPolicy?.executable!==true)issues.push('ACTIVE_REQUIRED_EVENT_NOT_EXECUTABLE');if(active&&list(active.requiredFunctions).some(item=>!text(item?.description)))issues.push('EVENT_GOAL_TYPE_CORRUPTION');const ruleRefs=list(session?.package?.worldRuleGraph?.rules).map(row=>text(row?.worldRuleRef)),capabilityRows=list(session?.state?.capabilityLedger?.capabilities),capabilityRefs=capabilityRows.map(row=>text(row?.capabilityRef));if(new Set(ruleRefs.filter(Boolean)).size!==ruleRefs.filter(Boolean).length)issues.push('WORLD_RULE_REF_DUPLICATE');if(new Set(capabilityRefs.filter(Boolean)).size!==capabilityRefs.filter(Boolean).length)issues.push('CAPABILITY_REF_DUPLICATE');for(const row of capabilityRows)if(row?.ownerRef&&!entities[row.ownerRef])issues.push(`CAPABILITY_OWNER_UNKNOWN:${row.ownerRef}`);return {ok:issues.length===0,issues:[...new Set(issues)],warnings:[...new Set(warnings)]};
  }

  function flattenEventReferences(session){const next=clone(session);for(const node of Object.values(next?.eventGraph?.nodes||{})){if(node?.nextEvent&&typeof node.nextEvent==='object')node.nextEventId=text(node.nextEvent.id||node.nextEvent.eventId||node.nextEventId);delete node.nextEvent;delete node.previousEvent;delete node.parentEvent}return next}

  function prepareEngineInput(session,engineId){if(session?.schema!==SCHEMA)throw new Error('CANONICAL_SESSION_REQUIRED');if(!['nexus','cortex'].includes(engineId))throw new Error('ENGINE_NOT_SUPPORTED');const integrity=validateCanonical(session);if(!integrity.ok)throw new Error(`CANONICAL_INVALID:${integrity.issues.join(',')}`);return {schema:'RELAY_ENGINE_INPUT_V1',engineId,baseRevision:session.revision,packageId:session.package.id,story:clone(session.story),cast:clone(session.cast),eventGraph:clone(session.eventGraph),policy:clone(session.package.policy),capabilities:clone(session.package.capabilities),state:clone(session.state)};}
  function commitEnginePatch(session,envelope,patch={}){if(session?.schema!==SCHEMA||envelope?.schema!=='RELAY_ENGINE_INPUT_V1')throw new Error('ENGINE_COMMIT_CONTRACT_MISMATCH');if(+envelope.baseRevision!==+session.revision)throw new Error('STALE_ENGINE_PATCH');if(envelope.packageId!==session.package.id)throw new Error('PACKAGE_IDENTITY_MUTATION');const next=clone(session),allowed=['world','scene','relationships','activeEventId','eventRuntime','eventMachine','eventLedger','imageTriggerLedger','evidenceLedger','routeState','revealState','disclosureLedger','judgePerformanceLedger','judgeAuditLedger','capabilityLedger','resources','canonLedger','carryoverLedger','sceneContinuity'];for(const key of allowed)if(Object.prototype.hasOwnProperty.call(patch,key))next.state[key]=clone(patch[key]);next.engines.selected=envelope.engineId;next.engines[envelope.engineId]={...next.engines[envelope.engineId],lastCommitRevision:next.revision+1};next.revision++;if(patch.turnCommitted===true)next.history.turnCount=Math.max(0,+next.history?.turnCount||0)+1;next.integrity=validateCanonical(next);if(!next.integrity.ok)throw new Error(`ENGINE_PATCH_REJECTED:${next.integrity.issues.join(',')}`);return next;}
  function commitTurnEnvelope(session,envelope,turn={}){if(turn?.status!=='COMMITTED')return clone(session);const patch={...(turn.statePatch||{}),turnCommitted:true},next=commitEnginePatch(session,envelope,patch);next.history.lastCommitId=text(turn.commitId,`commit-${next.revision}`);return next}
  function switchEngine(session,target){const envelope=prepareEngineInput(session,target),next=clone(session);next.engines.selected=target;next.engines[target]={...next.engines[target],handoffFrom:session.engines.selected,handoffRevision:session.revision};next.revision++;next.integrity=validateCanonical(next);return {session:next,envelope:{...envelope,baseRevision:next.revision}};}
  function fingerprint(session){return hash(JSON.stringify({packageId:session?.package?.id,cast:Object.keys(object(session?.cast?.entities)).sort(),world:session?.state?.world,activeEventId:session?.state?.activeEventId,routeState:session?.state?.routeState,revealState:session?.state?.revealState,worldRules:session?.package?.worldRuleGraph,capabilities:session?.state?.capabilityLedger,resources:session?.state?.resources,canon:list(session?.state?.canonLedger?.entries).map(entry=>[entry.kind,entry.targetRef,entry.active])}))}

  const api={version:BRIDGE_BUILD,schema:SCHEMA,bridgeSchema:BRIDGE_SCHEMA,build:BRIDGE_BUILD,packageCatalog,packageCapabilities,runtimeIgnoredJsonPaths,adaptPackage,adaptArchiveEntries,toCortexScenario,fromCortexScenario,validateCanonical,flattenEventReferences,PERSISTENT_RUNTIME_KEYS,persistentRuntimeSlice,reconcileCastRecovery,promoteRuntimePersonEntities,upgradeCanonicalSession,isLegacyCanonical,prepareEngineInput,commitEnginePatch,commitTurnEnvelope,switchEngine,fingerprint};Object.freeze(api);Object.defineProperty(globalThis,'CortexNexusBridge',{value:api,writable:false,configurable:false,enumerable:true});
})();
