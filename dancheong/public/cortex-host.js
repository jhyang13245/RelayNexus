/* Host persistence namespace and Nexus integration around the adapted Cortex runtime. */
(()=>{'use strict';
 // Check hosted account access before provider requests, including BYOK browser generation.
 const operatorNativeFetch=window.fetch.bind(window);
 window.fetch=async function(input,init){
  const target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  if(['api.openai.com','opencode.ai'].includes(target.hostname)){
   const access=await operatorNativeFetch('/api/account',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!access.ok)throw Error('계정 이용 상태를 확인해 주세요. 운영자 제한 또는 연결 오류가 있습니다.');
   const identity=await access.json();if(!identity.authenticated)throw Error('단청에 로그인한 뒤 플레이해 주세요.');
  }
  return operatorNativeFetch(input,init);
 };
 document.documentElement.classList.add('nexus-booting');document.documentElement.dataset.nexusHost='1';
 const bootStyle=document.createElement('style');bootStyle.id='nexus-boot-style';bootStyle.textContent='html.nexus-booting{background:#f6f1e7;color:#244c40}html.nexus-booting body{visibility:hidden!important}html.nexus-booting::before,html.nexus-booting::after{position:fixed;z-index:2147483647;left:50%;display:block;transform:translate(-50%,-50%);white-space:nowrap}html.nexus-booting::before{top:46%;content:"단청 · CORTEX";font:800 10px/1.2 ui-monospace,monospace;letter-spacing:.22em;color:#a74736}html.nexus-booting::after{top:51%;content:"이야기를 여는 중  ·  ·  ·";font:600 15px/1.5 Georgia,"Noto Serif KR",serif;letter-spacing:-.02em;color:#244c40}';document.head.append(bootStyle);
 const packageStyle=document.createElement('style');packageStyle.textContent='html.nexus-awaiting-package{background:#f6f1e7;color:#244c40}html.nexus-awaiting-package body{visibility:hidden!important}html.nexus-awaiting-package::before,html.nexus-awaiting-package::after{position:fixed;z-index:2147483647;left:50%;display:block;transform:translate(-50%,-50%);white-space:nowrap}html.nexus-awaiting-package::before{top:46%;content:"단청 · CORTEX";font:800 10px/1.2 ui-monospace,monospace;letter-spacing:.22em;color:#a74736}html.nexus-awaiting-package::after{top:51%;content:"설치한 작품을 불러오는 중  ·  ·  ·";font:600 15px/1.5 Georgia,"Noto Serif KR",serif;letter-spacing:-.02em;color:#244c40}';document.head.append(packageStyle);
 const scope=new URLSearchParams(location.search).get('session')||'cortex-local',account=new URLSearchParams(location.search).get('account')||'',nativeStorage=window.localStorage,legacyOwned=account&&nativeStorage.getItem('nexus-cortex-legacy-owner:'+scope)===account,prefix='nexus-cortex:'+(account&&!legacyOwned?encodeURIComponent(account)+':':'')+encodeURIComponent(scope)+':';
 // Hosted keys belong only to the parent's memory/encrypted vault, never a reader save slot.
 const readerKey='dancheong-cortex-device-api-key-v1';
 for(const k of Object.keys(nativeStorage))if(k.startsWith('nexus-cortex:')&&k.endsWith(':'+readerKey))nativeStorage.removeItem(k);
 const storage={get length(){return Object.keys(nativeStorage).filter(k=>k.startsWith(prefix)).length},key(i){return Object.keys(nativeStorage).filter(k=>k.startsWith(prefix))[i]?.slice(prefix.length)||null},getItem(k){return k===readerKey?null:nativeStorage.getItem(prefix+k)},setItem(k,v){if(k!==readerKey)nativeStorage.setItem(prefix+k,String(v))},removeItem(k){nativeStorage.removeItem(prefix+k)},clear(){Object.keys(nativeStorage).filter(k=>k.startsWith(prefix)).forEach(k=>nativeStorage.removeItem(k))}};
 Object.defineProperty(window,'localStorage',{value:storage});
 const nativeIDB=window.indexedDB,credentialAccount=account&&!account.startsWith('account:')?'account:'+account:account;
 const vaultPrefix='nexus-vn-account:'+encodeURIComponent(credentialAccount)+':';
 // Same signed-in account uses one credential vault in solo and multiplayer.
 // Session snapshots/media keep their existing, independent namespaces.
 window.NexusVNLegacyKeyVault=credentialAccount!==account?()=>nativeIDB.open('nexus-vn-account:'+encodeURIComponent(account)+':dancheong-ln-key-vault-v1',1):null;
 Object.defineProperty(window,'indexedDB',{value:new Proxy(nativeIDB,{get(target,key){if(key==='open')return(name,...args)=>target.open((name==='dancheong-ln-key-vault-v1'?vaultPrefix:prefix)+name,...args);if(key==='deleteDatabase')return name=>target.deleteDatabase((name==='dancheong-ln-key-vault-v1'?vaultPrefix:prefix)+name);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}})});
 const nativeSession=window.sessionStorage;Object.defineProperty(window,'sessionStorage',{value:{get length(){return Object.keys(nativeSession).filter(k=>k.startsWith(prefix)).length},key(i){return Object.keys(nativeSession).filter(k=>k.startsWith(prefix))[i]?.slice(prefix.length)||null},getItem(k){return nativeSession.getItem(prefix+k)},setItem(k,v){nativeSession.setItem(prefix+k,String(v))},removeItem(k){nativeSession.removeItem(prefix+k)},clear(){Object.keys(nativeSession).filter(k=>k.startsWith(prefix)).forEach(k=>nativeSession.removeItem(k))}}});
 const channel='NEXUS_CORTEX_HOST_V1',emit=(type,extra={})=>parent.postMessage({channel,type,...extra},location.origin);let api,importing=false,packageReady=false;
 const cloudAuthority=new URLSearchParams(location.search).get('cloudAuthority')==='1';
 if(cloudAuthority)document.documentElement.setAttribute('data-nexus-lease-locked','');
 let cloudWritePending=null,cloudWriting=false;
 const cloudWrite=async work=>{
  if(!cloudAuthority)return work();
  if(cloudWriting||cloudWritePending)return;
  const requestId=crypto.randomUUID();
  const button=document.getElementById('send');button?.setAttribute('aria-busy','true');
  const allowed=await new Promise(resolve=>{const timer=setTimeout(()=>{if(cloudWritePending?.requestId===requestId){cloudWritePending=null;emit('CLOUD_WRITE_CANCELLED',{requestId});resolve(false)}},180000);cloudWritePending={requestId,resolve:value=>{clearTimeout(timer);cloudWritePending=null;resolve(value)}};emit('CLOUD_WRITE_REQUEST',{requestId})});
  button?.removeAttribute('aria-busy');
  if(!allowed)return;
  cloudWriting=true;
  try{return await work()}finally{cloudWriting=false;clearTimeout(durableTimer);durablePending=false;emit('BUSY',{busy:busy()});emit('CLOUD_WRITE_FINISHED',{requestId})}
 };
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.channel!==channel||event.data.type!=='CLOUD_WRITE_RESULT')return;if(cloudWritePending?.requestId===event.data.requestId)cloudWritePending.resolve(event.data.allowed===true)});
 const mountCloudWrites=()=>{
  if(!cloudAuthority)return;
  for(const name of ['runTurnV1111','_continue','_rewind','_generateTurnImage','_recoverDialogue','_restoreBackup']){const original=api[name];if(original)api[name]=(...args)=>cloudWrite(()=>original(...args));}
  document.addEventListener('click',event=>{const target=event.target.closest?.('#send,#rewindQuickBtn,#rewindBtn,#restoreBackupBtn');if(!target)return;event.preventDefault();event.stopImmediatePropagation();if(target.id==='send')void api.runTurnV1111();else if(target.id==='restoreBackupBtn')void api._restoreBackup();else void api._rewind()},true);
  document.addEventListener('keydown',event=>{if(event.target.id!=='input'||event.key!=='Enter'||event.isComposing||event.keyCode===229)return;const mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(event.ctrlKey||event.metaKey||(!mobile&&!event.shiftKey)){event.preventDefault();event.stopImmediatePropagation();void api.runTurnV1111()}},true);
 };
 // Nexus에서는 사용자 키를 그대로 전달하되 이미지 요청만 동일 출처 서버 경유로 보낸다.
 // Cortex 독립본에는 이 훅이 없어 기존 직접 Image API 경로를 그대로 유지한다.
 window.NexusCortexImageEndpoint='/api/image';
 const isLegacyFallback=()=>{const scenario=api?._scenario(),storyId=String(scenario?.runtime?.storyId||'');return storyId==='default'||storyId==='unconfigured'||scenario?.event?.id==='platform-signal'};
 const isRetiredBundledStory=()=>String(api?._scenario()?.runtime?.storyId||'')==='RN-FATE-SEOUL-CROWN-OF-LIES-20181023-V3'&&storage.getItem('project-offered')==='user-file';
 // A valid restored Cortex save is itself the package authority. Requiring a second localStorage marker can
 // re-import the cached ZIP over a progressed session after mobile storage cleanup or an interrupted install.
 const restoredPackageReady=()=>Boolean(!isLegacyFallback()&&!isRetiredBundledStory()&&(storage.getItem('project-offered')||api?._restoredExistingState?.()));
 let revealedScenario=null;const revealPackage=()=>{packageReady=true;document.documentElement.classList.remove('nexus-booting','nexus-awaiting-package');if(revealedScenario!==api?._scenario()){revealedScenario=api?._scenario();window.dispatchEvent(new Event('nexus-package-ready'))}};
 let readyTask;
 const ready=()=>readyTask||=(async()=>{api=window.__DANCHEONG_NEW_ENGINE_TEST__;if(!api)throw Error('Cortex 초기화 중입니다. 잠시 후 다시 시도해 주세요.');await api._bootstrap();mountCloudWrites();packageReady=restoredPackageReady();if(!packageReady)document.documentElement.classList.add('nexus-awaiting-package');return api})();
 window.NexusVNHostBridge={active:false,account,multiplayer:new URLSearchParams(location.search).get('multiplayer')==='1',settings:{},api:()=>api,isReady:()=>packageReady&&!importing,
  emit,write:async work=>{if(window.NexusVNHostBridge.multiplayer)throw Error('멀티플레이 기록은 방의 차례 진행으로만 변경할 수 있습니다.');let executed=false;const result=await cloudWrite(async()=>{executed=true;return work()});if(!executed)throw Error('계정 저장 확인이 끝나지 않았습니다. 기존 진행은 유지됩니다. 잠시 후 다시 시도해 주세요.');return result},
  workSlug:async()=>{const id=storage.getItem('project-offered')||api?._scenario()?.runtime?.storyId||scope;const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));return 'main-'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('').slice(0,32)},
  applySettings:()=>{if(api)api._setSettings({imageEvery:window.NexusVNHostBridge.settings.imageEvery||0})}};
 window.DancheongVNHost={accountEndpoint:'/api/account',cloudBase:'/api/vn/cloud/'+encodeURIComponent(scope)+'/slots',signIn:'/signin-with-chatgpt?return_to=%2F',signOut:'/signout-with-chatgpt?return_to=%2F'};
 // Read the durable record, not a freshly normalized in-memory export. Reload and
 // export-only saves must not look like new gameplay merely because savedAt changed.
 const localContent=(()=>{
  let cached=null,worker=null,workerFailed=false,sequence=0;const pending=new Map();
  const hashInWorker=content=>{
   if(workerFailed||typeof Worker!=='function')return null;
   try{
    if(!worker){worker=new Worker('/cortex-cloud-worker.js');worker.onmessage=({data})=>{const row=pending.get(data.id);if(!row)return;pending.delete(data.id);clearTimeout(row.timer);data.error?row.reject(Error('HASH_WORKER')):row.resolve(data.key)};worker.onerror=()=>{workerFailed=true;worker?.terminate();worker=null;for(const row of pending.values()){clearTimeout(row.timer);row.reject(Error('HASH_WORKER'))}pending.clear()};}
    return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{const row=pending.get(id);if(!row)return;worker.onerror()},15000);pending.set(id,{resolve,reject,timer});try{worker.postMessage({id,content})}catch{worker.onerror()}});
   }catch{workerFailed=true;return null}
  };
  return async()=>{try{
  const status=api._storageStatus?.(),stamp=status&&!status.blocked&&!status.restoreFailed&&status.savedAt?JSON.stringify([status.key,status.revision,status.savedAt]):'';
  if(stamp&&cached?.stamp===stamp)return await cached.task;
  const task=(async()=>{const saved=await api._cloudLocalState?.();if(!saved)return{};
  const {savedAt,storageRevision,storageRecovery,settings,...content}=saved;
  const {apiKey,baseUrl,model,fontSize,typingSpeed,imageQuality,imageEvery,writerReasoningEffort,...storySettings}=settings||{};
  const value={...content,settings:storySettings},offscreen=hashInWorker(value);
  if(offscreen){try{return {savedAt:String(savedAt||''),contentKey:await offscreen}}catch{/* Exact same hash fallback; never weaken conflict detection. */}}
  const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
  const bytes=new TextEncoder().encode(JSON.stringify(sorted(value)));
  const hash=await crypto.subtle.digest('SHA-256',bytes);return {savedAt:String(savedAt||''),contentKey:'v1:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};
  })();if(stamp)cached={stamp,task};return await task;
 }catch{cached=null;return{}}};})();
 const emitReady=async()=>{const status=api._storageStatus?.()||{},content=await localContent();if(!window.document?.documentElement)return;emit('READY',{sharedUpdates:typeof api._applySharedUpdate==='function',local:{restored:!!api._restoredExistingState?.(),turn:api._turns().length,savedAt:String(status.savedAt||''),...content}})};
 // A failed verdict keeps ADJUDICATION_PENDING so the SAME beat can resume.
 // Its durable status is not a running task; otherwise saving and retrying
 // permanently wait for one another after the engine releases its mutex.
 const busy=()=>importing||cloudWriting||(typeof api?._isBusy==='function'?api._isBusy():!!api?._turns().some(t=>t.status==='STREAMING'));
 let durablePending=false,durableTimer=0;
 const flushDurable=()=>{clearTimeout(durableTimer);if(!durablePending)return;if(!packageReady||busy()){durableTimer=setTimeout(flushDurable,750);return}durablePending=false;emit('DURABLE_CHANGE')};
 window.addEventListener('nexus-cortex-persisted',()=>{durablePending=true;clearTimeout(durableTimer);durableTimer=setTimeout(flushDurable,750)});
 const waitFor=(check,timeout=180000)=>new Promise((resolve,reject)=>{const started=Date.now(),tick=()=>{try{const value=check();if(value!==undefined)return resolve(value)}catch(error){return reject(error)}if(Date.now()-started>=timeout)return reject(Error('패키지 자동 적용 시간이 초과되었습니다.'));setTimeout(tick,50)};tick()});
 async function importFile(file,{replaceFallback=false}={}){if(busy())throw Error('현재 비트를 마친 뒤 패키지를 불러오세요.');importing=true;const dialog=document.getElementById('nexusImportDialog');try{const a=await ready();if(!replaceFallback&&a._turns().length&& !confirm('현재 기록은 이 세션에 있습니다. 다른 작품을 적용하기 전에 Cortex 전체 백업을 저장하셨나요? 계속하면 현재 화면의 작품을 교체합니다.'))return false;dialog.dataset.nexusAutoImport='1';dialog.style.display='none';if(!dialog.open)dialog.showModal();const input=document.getElementById('nexusPackageFile'),apply=document.getElementById('applyNexusPackage'),report=document.getElementById('nexusImportReport'),transfer=new DataTransfer();input.value='';transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await waitFor(()=>{if(report.classList.contains('bad'))throw Error(report.textContent||'패키지 검사에 실패했습니다.');return apply.disabled?undefined:true});apply.click();await waitFor(()=>{if(report.classList.contains('bad'))throw Error(report.textContent||'패키지 적용에 실패했습니다.');return dialog.open?undefined:true});revealPackage();invalidatePrimaryMedia();await ensurePrimaryMediaAliases();return true}finally{delete dialog.dataset.nexusAutoImport;dialog.style.display='';importing=false;if(packageReady)window.dispatchEvent(new Event('nexus-package-ready'))}}
 let firstAppearanceBusy=false,primaryAliasTask=null,primaryAliasScenario=null,primaryAliasReadyScenario=null;
 const reviewedPortraits=new WeakMap();
 window.NexusCortexPrimaryMedia=new Map();
 const invalidatePrimaryMedia=()=>{primaryAliasReadyScenario=null;window.NexusCortexPrimaryMedia=new Map()};
 const assetPath=value=>String(value||'').replace(/\\/gu,'/').replace(/^\.\//u,'').trim();
 const storyPeople=()=>[api?._scenario()?.protagonist,...(api?._scenario()?.characters||[])].filter(Boolean);
 const primarySourcePath=person=>{const images=person?.source?.images||person?.images||[],primary=images.find(image=>image?.isPrimary===true)||images.find(image=>/대표(?:\s*사진|\s*기준)?/u.test(String(image?.label||'')))||images[0];return assetPath(primary?.assetPath||primary?.path||primary?.ref||primary?.assetRef)};
 const primaryAsset=(assets,characterId)=>{const person=storyPeople().find(row=>String(row?.id)===String(characterId)),preferred=primarySourcePath(person),owned=assets.filter(row=>String(row?.characterId)===String(characterId));return owned.find(row=>{const ref=assetPath(row?.ref||row?.path);return preferred&&(ref===preferred||ref.endsWith('/'+preferred)||preferred.endsWith('/'+ref))})||owned[0]};
 const readPackageMedia=()=>api._packageMedia();
 const packageMedia=async()=>{const storyId=String(api?._scenario()?.runtime?.storyId||'');return (await readPackageMedia()).filter(row=>row.storyId===storyId&&row.assetKind==='CHARACTER_REFERENCE'&&row.characterId&&row.dataUrl)};
async function ensurePrimaryMediaAliases(){if(!packageReady)return[];const scenarioAtStart=api._scenario();const mediaScope=String(scenarioAtStart.runtime?.storyId)+'|'+String(scenarioAtStart.runtime?.mediaGeneration||'');if(primaryAliasReadyScenario===mediaScope)return[...window.NexusCortexPrimaryMedia.values()];if(primaryAliasTask){if(primaryAliasScenario===scenarioAtStart)return primaryAliasTask;await primaryAliasTask;return ensurePrimaryMediaAliases()}const storyId=String(scenarioAtStart?.runtime?.storyId||'');if(!storyId)return[];primaryAliasScenario=scenarioAtStart;const task=(async()=>{const rows=await packageMedia(),primaryRows=storyPeople().map(person=>primaryAsset(rows,person.id)).filter(Boolean),aliases=[];for(const row of primaryRows){const key=`${storyId}:!primary:${encodeURIComponent(String(row.characterId))}`;if(!rows.some(item=>item.key===key))aliases.push({...row,key,primaryReference:true,updatedAt:Date.now()})}if(api._scenario()!==scenarioAtStart)return[];if(aliases.length)await api._putPackageMedia(aliases);if(!window.document?.documentElement||api._scenario()!==scenarioAtStart)return[];window.NexusCortexPrimaryMedia=Object.assign(new Map(primaryRows.map(row=>[String(row.characterId),row])),{scope:mediaScope});primaryAliasReadyScenario=mediaScope;window.dispatchEvent(new CustomEvent('nexus-cortex-primary-media'));return primaryRows})();primaryAliasTask=task;try{return await task}finally{if(primaryAliasTask===task){primaryAliasTask=null;primaryAliasScenario=null}}}
 // Portraits are now driven by this beat's explicit writer speaker bindings.
 // Embedded assets only: absence is never an automatic paid-generation request.
 window.NexusCortexPackageMediaReady=ensurePrimaryMediaAliases;
 let blockedImageKey='',lastImageKey=null,imageNoticeShown=false;
 async function ensurePackageFirstAppearances(){
  if(firstAppearanceBusy||busy()||!packageReady)return;firstAppearanceBusy=true;
  try{let changed=false,reviewed=false;for(const turn of api._turns()){const old=turn.packageTriggerImages,prior=reviewedPortraits.get(turn);if(prior&&prior.images===old&&prior.length===(old?.length||0))continue;reviewed=true;const keep=Array.isArray(old)?old.filter(x=>x.source!=='CHARACTER_FIRST_APPEARANCE'):old;if(keep?.length!==old?.length){turn.packageTriggerImages=keep;changed=true;}reviewedPortraits.set(turn,{images:turn.packageTriggerImages,length:turn.packageTriggerImages?.length||0});}if(!reviewed)return;
   document.querySelectorAll('[data-character-first-appearance],[data-portrait-status]').forEach(n=>n.remove());window.NexusCortexSpeakerMedia?.refresh();if(changed)await api.persist();
  }finally{firstAppearanceBusy=false;}
 }
 const importProject=async id=>{id=String(id||'');if(!id||id==='demo-project'||id==='local-project'||id.startsWith('cortex-import-'))throw Error('이 기기에 작품 원본이 남아 있지 않습니다. 서재에서 작품 ZIP을 다시 불러와 주세요.');const response=await fetch('/api/projects/'+encodeURIComponent(id)+'/package',{credentials:'same-origin'});if(!response.ok)throw Error('서재의 원본 ZIP을 자동으로 읽지 못했습니다. 작품 보관함에서 다시 설치해 주세요.');const file=new File([await response.blob()],'ScenarioPack.zip',{type:'application/zip'}),imported=await importFile(file,{replaceFallback:true});if(imported)storage.setItem('project-offered',id);return imported};
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.channel!==channel||e.data.type!=='SETTINGS')return;window.NexusCortexTextProvider=['opencode-go','opencode-go-luna'].includes(e.data.provider)?e.data.provider:'openai';window.NexusCortexTextApiKey=e.data.apiKey||'';window.NexusCortexTextModel=e.data.provider==='opencode-go'?'muse-spark-1.3-contributor':'gpt-6-luna'});

 // The mirror is the last server wire state, not a re-export of normalized/local UI state.
 let sharedMirror=null,sharedPending=null,sharedApplying=false;
 const sharedWire=snapshot=>{const {media,...wire}=snapshot;return JSON.parse(JSON.stringify(wire))};
 function applySharedOperations(base,operations){
  if(!Array.isArray(operations)||operations.length>512)throw Error('SHARED_UPDATE_INVALID');
  let next=base;const changed=new Set();
  for(const operation of operations){
   const {path,kind,value}=operation;
   if(!Array.isArray(path)||!path.length||path.length>48||!['set','delete','length'].includes(kind)||path.some(key=>!['string','number'].includes(typeof key)||['__proto__','prototype','constructor'].includes(String(key))))throw Error('SHARED_UPDATE_INVALID');
   if(path[0]==='turns'){if(typeof path[1]!=='number')throw Error('SHARED_UPDATE_FULL_REQUIRED');changed.add(path[1])}
   const change=(node,depth)=>{
    if(!node||typeof node!=='object')throw Error('SHARED_UPDATE_PATH');
    const key=path[depth],array=Array.isArray(node);
    if(array&&(!Number.isInteger(key)||key<0||key>node.length))throw Error('SHARED_UPDATE_INDEX');
    const copy=array?node.slice():{...node};
    if(depth<path.length-1){if(!Object.prototype.hasOwnProperty.call(node,key))throw Error('SHARED_UPDATE_PATH');copy[key]=change(node[key],depth+1)}
    else if(kind==='set')copy[key]=value;
    else if(kind==='delete'){if(array)throw Error('SHARED_UPDATE_DELETE');delete copy[key]}
    else {if(!Array.isArray(node[key])||!Number.isInteger(value)||value<0||value>node[key].length)throw Error('SHARED_UPDATE_LENGTH');copy[key]=node[key].slice(0,value)}
    return copy;
   };next=change(next,0);
  }
  return {next,changed:[...changed]};
 }
 window.addEventListener('message',async e=>{
  if(e.origin!==location.origin||e.source!==parent||e.data?.channel!==channel)return;
  const data=e.data;
  if(data.type==='MP_COMMITTED'&&sharedPending?.token===data.token){sharedMirror={wire:sharedPending.wire,revision:data.revision,version:data.snapshotVersion};sharedPending=null;return}
  if(data.type!=='SHARED_UPDATE')return;
  if(sharedApplying)return;
  try{
   const a=await ready(),packet=data.update;
   if(sharedMirror&&packet?.revision===sharedMirror.revision&&data.snapshotVersion===sharedMirror.version){emit('SHARED_UPDATE_COMPLETE',{revision:packet.revision});return}
   if(sharedApplying||!sharedMirror||packet?.schema!=='CORTEX_SHARED_UPDATE_V1'||packet.baseRevision!==sharedMirror.revision||packet.baseVersion!==sharedMirror.version||packet.revision!==sharedMirror.revision+1||!data.snapshotVersion)throw Error('SHARED_UPDATE_BASE');
   sharedApplying=true;
   const {next,changed}=applySharedOperations(sharedMirror.wire,packet.operations);
   await a._applySharedUpdate(next,changed);
   sharedMirror={wire:next,revision:packet.revision,version:data.snapshotVersion};
   emit('SHARED_UPDATE_COMPLETE',{revision:packet.revision});
  }catch(error){emit('SHARED_UPDATE_FAILED',{message:String(error.message||error)})}finally{sharedApplying=false}
 });

window.addEventListener('message',async e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.channel!==channel)return;try{const a=await ready();switch(e.data.type){case 'HELLO':{if(document.documentElement.classList.contains('nexus-view-ready'))emitReady();break;}case 'SETTINGS':{window.NexusVNHostBridge.settings={...e.data};const imageEvery=[0,2,5,10,20].includes(+e.data.imageEvery)?+e.data.imageEvery:0,fontSize=['small','medium','large'].includes(e.data.fontSize)?e.data.fontSize:'small',typingSpeed=['slow','natural','fast','instant'].includes(e.data.typingSpeed)?e.data.typingSpeed:'natural',imageQuality=e.data.imageQuality==='medium'?'medium':'low',isMuse=e.data.provider==='opencode-go',writerReasoningEffort=isMuse&&['low','medium','high'].includes(e.data.museReasoningEffort)?e.data.museReasoningEffort:'low';window.NexusCortexTextEndpoint='/api/text/responses';window.NexusCortexTextApiKey=e.data.apiKey||'';window.NexusCortexImageApiKey=e.data.imageApiKey||'';a._setSettings({apiKey:e.data.apiKey||'',model:isMuse?'muse-spark-1.3-contributor':'gpt-6-luna',writerReasoningEffort,baseUrl:['opencode-go','opencode-go-luna'].includes(e.data.provider)?'https://opencode.ai/zen/go/v1':'https://api.openai.com/v1',fontSize,typingSpeed,imageQuality,imageEvery:window.NexusVNHostBridge.active?0:imageEvery});window.dispatchEvent(new Event('nexus-vn-settings'));document.documentElement.dataset.nexusTheme=e.data.theme==='dark'?'dark':'light';document.documentElement.dataset.fontSize=fontSize;const app=document.querySelector('.app');app?.classList.toggle('theme-dark',e.data.theme==='dark');for(const width of ['narrow','normal','wide'])app?.classList.toggle('reading-'+width,e.data.readingWidth===width);break;}case 'CLOUD_RESTORE':{const mirror=e.data.sharedRevision&&e.data.snapshotVersion?{wire:sharedWire(e.data.snapshot),revision:e.data.sharedRevision,version:e.data.snapshotVersion}:null;const input=document.getElementById('input'),draft=input?.value;try{await a._importFull(e.data.snapshot,{reuseMedia:e.data.reuseMedia===true});}finally{if(input&&draft!==undefined)input.value=draft;}sharedMirror=mirror;const restoredAt=String(a._storageStatus?.().savedAt||'');if(e.data.projectId)storage.setItem('project-offered',String(e.data.projectId));revealPackage();invalidatePrimaryMedia();await ensurePrimaryMediaAliases();emit('CLOUD_RESTORE_COMPLETE',{syncEpoch:e.data.syncEpoch,turn:a._turns().length,savedAt:restoredAt,...await localContent()});break;}case 'CLOUD_EXPORT':{const saved=await a.persist?.({notifyHost:false});if(!saved?.ok)throw Error('기기 저장이 완료되지 않았습니다. 현재 기록을 유지합니다.');const content=await localContent(),snapshot=await a._fullExport();emit('CLOUD_SNAPSHOT',{syncEpoch:e.data.syncEpoch,exportId:e.data.exportId,snapshot,turn:snapshot.turns.length,savedAt:String(saved.savedAt||''),contentKey:content.savedAt===String(saved.savedAt||'')?content.contentKey:''});break;}case 'IMPORT_FILE':{const imported=await importFile(e.data.file);if(imported)storage.setItem('project-offered',String(e.data.projectId||'user-file'));break;}case 'OFFER_FILE':{if(restoredPackageReady()){revealPackage();await ensurePrimaryMediaAliases();break;}const imported=await importFile(e.data.file,{replaceFallback:true});if(imported)storage.setItem('project-offered',String(e.data.projectId||'user-file'));break;}case 'OFFER_PROJECT':{if(restoredPackageReady()){revealPackage();await ensurePrimaryMediaAliases();break;}await importProject(e.data.projectId);break;}case 'RESET_FILE':{await cloudWrite(async()=>{const imported=await importFile(e.data.file,{replaceFallback:true});if(imported){storage.setItem('project-offered',String(e.data.projectId||'user-file'));emit('RESET_COMPLETE')}});break;}case 'PREPARE_NEW_FILE':{a._setSettings({apiKey:'',imageEvery:0});if(await importFile(e.data.file,{replaceFallback:true})){storage.setItem('project-offered',String(e.data.projectId||'user-file'));emit('NEW_PROJECT_SNAPSHOT',{snapshot:await a._fullExport()})}break;}case 'PREPARE_NEW_PROJECT':{a._setSettings({apiKey:'',imageEvery:0});if(await importProject(e.data.projectId))emit('NEW_PROJECT_SNAPSHOT',{snapshot:await a._fullExport()});break;}case 'RESET_PROJECT':{await cloudWrite(async()=>{if(await importProject(e.data.projectId))emit('RESET_COMPLETE')});break;}}}catch(error){emit(e.data.type==='CLOUD_EXPORT'?'CLOUD_EXPORT_ERROR':'ERROR',{exportId:e.data.exportId,message:String(error.message||error)})}});
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.channel!==channel||e.data.type!=='LEASE_LOCK')return;const locked=!!e.data.locked,input=document.getElementById('input'),sendButton=document.getElementById('send'),continueButton=document.getElementById('continueBtn');if(input)input.disabled=locked;if(sendButton)sendButton.disabled=locked||busy();if(continueButton)continueButton.disabled=locked||busy();document.documentElement.toggleAttribute('data-nexus-lease-locked',locked)});
 const mountMultiplayer=()=>{
  if(new URLSearchParams(location.search).get('multiplayer')!=='1')return;
  document.documentElement.classList.add('nexus-multiplayer');let allowed=false,running=false;
  const live=window.NexusMultiplayerLive=window.createNexusMultiplayerLive(api);
  const controls=window.createNexusMultiplayerTools(emit),{chat}=controls;
  window.NexusMultiplayerControls=controls;
  window.NexusVNHostBridge.requestTurn=(input,autoContinue)=>{if(!allowed||running)return false;allowed=false;sync();emit('MP_REQUEST',{input,autoContinue});return true;};
  const sharedInput=window.createNexusMultiplayerInput(emit);
  let pressTimer;const clearPress=()=>{clearTimeout(pressTimer);chat.removeAttribute('data-mp-pressed')};chat.addEventListener('pointerdown',()=>{clearPress();chat.setAttribute('data-mp-pressed','')});chat.addEventListener('pointerup',()=>{pressTimer=setTimeout(clearPress,120)});chat.addEventListener('pointercancel',clearPress);chat.addEventListener('pointerleave',clearPress);chat.addEventListener('blur',clearPress);
  const sync=()=>{const input=document.getElementById('input');if(input)input.readOnly=!allowed||running;};
  const request=autoContinue=>{if(!allowed||running)return;const input=autoContinue?'':document.getElementById('input').value.trim();if(!autoContinue&&!input)return;allowed=false;sync();emit('MP_REQUEST',{input,autoContinue});};
  document.addEventListener('click',event=>{const node=event.target.closest?.('#send,.nexus-continue-button,.nexus-beat-rewind,.nexus-beat-image,.nexus-beat-dialogue,#rewindQuickBtn,#importBtn,#resetBtn,.session-refresh-button,#restoreBackupBtn,#applyNexusPackage,#nexusPackageFile');if(!node)return;event.preventDefault();event.stopImmediatePropagation();if(node.matches('#send,.nexus-continue-button'))request(node.matches('.nexus-continue-button'));},true);
  document.addEventListener('keydown',event=>{if(event.target.id!=='input'||event.key!=='Enter')return;event.stopImmediatePropagation();if(event.isComposing||event.keyCode===229)return;const mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(event.ctrlKey||event.metaKey||(!mobile&&!event.shiftKey)){event.preventDefault();request(false)}},true);
  window.addEventListener('message',async event=>{
   const data=event.data;if(event.origin!==location.origin||event.source!==parent||data?.channel!==channel)return;
   if(data.type==='MP_STATE'){allowed=Boolean(data.canWrite);controls.update(data);sync();if(!running)live.reconcile();}
   if(data.type==='MP_CONNECTION')controls.updateConnection(data);
   if(data.type==='MP_INPUT_STATE')sharedInput.update(data);
   if(data.type==='MP_INPUT_DRAFT')sharedInput.receive(data.draft);
   if(data.type==='MP_CHAT_PREVIEWS')controls.preview(data.messages);
   if(data.type==='MP_CHAT_OPEN')controls.setOpen(data.open);
   if(data.type==='MP_FOCUS_CHAT')chat.focus();
   if(data.type==='MP_LIVE'&&!running){window.dispatchEvent(new CustomEvent('nexus-mp-live',{detail:data.presentation}));if(live.apply(data.presentation))emit('MP_LIVE_RECEIVED',{id:data.presentation.id,seq:data.presentation.seq});}
   if(data.type==='MP_LIVE_CLEAR'&&!running){live.clear();window.dispatchEvent(new CustomEvent('nexus-mp-live',{detail:null}));}
   if(data.type!=='MP_EXECUTE'||running)return;
   live.clear();running=true;allowed=false;sync();const before=api._turns().length;
   const submitted={id:'submitted-'+(data.submissionId||crypto.randomUUID()),input:String(data.input||''),blocks:[]};
   let sequence=1,lastPublic=JSON.stringify(submitted);emit('MP_LIVE_PUBLIC',{token:data.token,presentation:{...submitted,seq:sequence}});
   const broadcast=()=>{const shown=live.capture(before);if(!shown)return;const signature=JSON.stringify(shown);if(signature===lastPublic)return;lastPublic=signature;emit('MP_LIVE_PUBLIC',{token:data.token,presentation:{...shown,seq:++sequence}})};
   const liveTimer=setInterval(broadcast,600);
   try{api._setInput(String(data.input||''));if(data.autoContinue)await api._continue();else await api.runTurnV1111();const last=api._turns().at(-1);if(api._turns().length!==before+1||last?.status!=='COMMITTED')throw Error(String(last?.error||last?.diagnostic||'비트가 확정되지 않았습니다. 다시 시도해 주세요.'));const snapshot=data.compactMedia?api._export():await api._fullExport();sharedPending={token:data.token,wire:sharedWire(snapshot)};emit('MP_RESULT',{token:data.token,snapshot,mediaUnchanged:Boolean(data.compactMedia)});}
   catch(error){emit('MP_FAILED',{token:data.token,message:String(error.message||error)})}
   finally{clearInterval(liveTimer);broadcast();running=false;sync();}
  });sync();
 };
 const bootHost=async()=>{try{
  await ready();window.mountNexusCortexView?.(api,emit);window.dispatchEvent(new Event('nexus-reader-mounted'));mountMultiplayer();if(packageReady)revealPackage();else document.documentElement.classList.add('nexus-awaiting-package');emitReady();if(packageReady){const warm=()=>{const task=window.primeNexusReaderImages?window.primeNexusReaderImages(api,ensurePrimaryMediaAliases):ensurePrimaryMediaAliases();void Promise.resolve(task).catch(()=>{})};if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(warm,0));else setTimeout(warm,0)}let lastBusy=null,lastSummary='',lastAutoImageTurn=0;
  const update=()=>{if(!packageReady&&restoredPackageReady())revealPackage();if(!packageReady)return;const isBusy=busy();if(isBusy!==lastBusy){lastBusy=isBusy;emit('BUSY',{busy:isBusy})}if(isBusy)return;const currentKey=api._settings()?.apiKey||'';if(lastImageKey!==currentKey){lastImageKey=currentKey;blockedImageKey='';imageNoticeShown=false;document.querySelectorAll('[data-image-notice]').forEach(node=>node.remove());for(const turn of api._turns())for(const [id,job] of Object.entries(turn.characterPortraitJobs||{}))if(job.status==='ERROR')delete turn.characterPortraitJobs[id]}
   const summary={title:String(api._scenario()?.title||''),turn:api._turns().length,location:document.getElementById('worldLocationBar')?.textContent||'',preview:String(api._turns().at(-1)?.text||'').slice(-160)},fingerprint=JSON.stringify(summary);
   if(fingerprint!==lastSummary){lastSummary=fingerprint;emit('SUMMARY',summary)}
   if(window.NexusVNHostBridge.active)return;void ensurePrimaryMediaAliases().catch(()=>{});void ensurePackageFirstAppearances().catch(()=>{});const every=+api._settings()?.imageEvery||0,turnNo=api._turns().length,last=api._turns().at(-1);if(api._settings()?.apiKey&&blockedImageKey!==api._settings()?.apiKey&&every&&turnNo>0&&turnNo%every===0&&last?.status==='COMMITTED'&&!last.imageUrl&&lastAutoImageTurn!==turnNo){const button=document.querySelector(`[data-turn-image="${turnNo-1}"]`);if(button&&!button.disabled){lastAutoImageTurn=turnNo;button.click();}}
  };update();const observer=new MutationObserver(records=>{if(!window.NexusOnlyLiveMutations?.(records))update()});observer.observe(document.getElementById('feed'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});observer.observe(document.getElementById('send'),{attributes:true,attributeFilter:['disabled']});
  // Lifecycle fields can settle without changing the feed. Only changed values are sent.
  const timer=setInterval(update,500);window.addEventListener('unload',()=>{clearInterval(timer);observer.disconnect()},{once:true});
 }catch(error){document.documentElement.classList.remove('nexus-booting');emit('ERROR',{message:String(error.message||error)})}};
 // A restored image can keep window.load pending indefinitely, especially on mobile.
 // Only parsed markup and the engine restore are prerequisites for the reader.
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootHost,{once:true});else void bootHost();
})();
