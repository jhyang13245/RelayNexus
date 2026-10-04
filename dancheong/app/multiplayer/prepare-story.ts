const channel='NEXUS_CORTEX_HOST_V1';
// Import the authored package in a fresh, keyless runtime. Never reset a player's save.
export function prepareNewSharedStory(projectId:string,projectFile?:File|null):Promise<Record<string,unknown>> {
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');frame.hidden=true;frame.title='새 이야기 준비';
    let sent=false;
    const scope='multiplayer-prepare-'+crypto.randomUUID(),prefix='nexus-cortex:'+encodeURIComponent(scope)+':';
    const cleanup=()=>{
      clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();
      // Only this disposable importer namespace; installed works and player saves are untouched.
      try{Object.keys(localStorage).filter(k=>k.startsWith(prefix)).forEach(k=>localStorage.removeItem(k));}catch{}
      if(indexedDB.databases)void indexedDB.databases().then(rows=>{for(const row of rows)if(row.name?.startsWith(prefix))indexedDB.deleteDatabase(row.name)}).catch(()=>{});
    };
    const receive=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.channel!==channel)return;
      if(event.data.type==='READY'&&!sent){sent=true;frame.contentWindow?.postMessage(projectFile?{channel,type:'PREPARE_NEW_FILE',projectId,file:projectFile}:{channel,type:'PREPARE_NEW_PROJECT',projectId},location.origin)}
      if(event.data.type==='NEW_PROJECT_SNAPSHOT'){cleanup();resolve(event.data.snapshot)}
      if(event.data.type==='ERROR'){cleanup();reject(new Error(event.data.message||'작품을 준비하지 못했습니다.'))}
    };
    const timer=setTimeout(()=>{cleanup();reject(new Error('작품 준비 시간이 초과되었습니다. 다시 시도해 주세요.'))},180000);
    window.addEventListener('message',receive);
    frame.src=`/cortex.html?session=${encodeURIComponent(scope)}`;
    document.body.append(frame);
  });
}
