// One bounded batch of asset receipts, independent of canonical turn transport.
// Only the claim owner executes a producer, using its own device credentials.
export function createSharedAssets({request,visible=()=>!document.hidden,notice=()=>{}}){
 const jobs=new Map(),waiting=new Map(),paid=new Map(),synced=new Set();let timer=0,polling=false,cursor=0;
 const remember=id=>{synced.add(id);if(synced.size>1024)synced.delete(synced.values().next().value);};
 const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 function schedule(){if(!timer&&waiting.size)timer=setTimeout(poll,1200);}
 async function poll(){
  timer=0;if(polling)return;polling=true;
  const all=[...waiting.keys()],keys=all.slice(cursor,cursor+16);cursor=cursor+16>=all.length?0:cursor+16;
  try{if(visible()&&keys.length){const {rows=[]}=await request({action:'lookup',keys});for(const row of rows){if(['ready','uncertain'].includes(row.status)){const callbacks=waiting.get(row.key)||[];waiting.delete(row.key);callbacks.forEach(done=>done(row.status));}}}}
  catch{/* Story transport continues while media reconnects. */}
  finally{polling=false;schedule();}
 }
 const wait=hash=>new Promise(resolve=>{
  const callbacks=waiting.get(hash)||[];let timer;
  const done=value=>{clearTimeout(timer);resolve(value)};callbacks.push(done);waiting.set(hash,callbacks);
  timer=setTimeout(()=>{const list=waiting.get(hash)?.filter(x=>x!==done);if(list?.length)waiting.set(hash,list);else waiting.delete(hash);resolve('pending')},150000);schedule();
 });
 async function record(kind,key,produce,{canProduce=true,turn}={}){
  const id=kind+':'+key;if(jobs.has(id))return jobs.get(id);
  const task=(async()=>{
   const hash=await digest(id),base={key:hash,kind,turn},token='vn2-'+crypto.randomUUID();
   let prior=await request({action:'read',...base});if(prior.record){remember(id);return prior.record;}
   let claim=await request({action:'claim',...base,token,canProduce});
   if(claim?.status==='needs-key'){notice('이 턴의 인물·이미지·음성 생성에 사용할 내 API 키를 설정해 주세요. 다른 참가자의 키로 대체하지 않습니다.');return null;}
   // Room concurrency can be busy with unrelated work. Retry only the unpaid claim.
   for(let i=0;claim?.status==='queued'&&i<30;i++){
    await new Promise(resolve=>setTimeout(resolve,1500));if(!visible())return null;
    claim=await request({action:'claim',...base,token,canProduce});
   }
   if(claim?.claimed){
    let value;
    try{value=await produce();}catch(error){await request({action:paid.has(id)?'failed':'release',...base,token}).catch(()=>{});throw error;}
    if(!value){await request({action:paid.has(id)?'failed':'release',...base,token}).catch(()=>{});return null;}
    // Upload retries never invoke the paid producer again. Same token is idempotent.
    for(let attempt=0;attempt<3;attempt++)try{await request({action:'publish',...base,token,record:value});remember(id);return value;}catch{if(attempt===2){notice('이미지는 이 기기에 보관됐지만 방 공유가 지연되고 있습니다.');return value;}await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
   }
   const status=claim?.status==='ready'?'ready':claim?.status==='uncertain'?'uncertain':await wait(hash);
   if(status==='ready'){const result=await request({action:'read',...base});if(result.record)remember(id);return result.record;}
   if(status==='uncertain')notice('공유 이미지·음성 요청 결과를 확인하지 못했습니다. 중복 결제를 막기 위해 자동 재생성하지 않습니다.');
   return null;
  })().catch(()=>null).finally(()=>{jobs.delete(id);paid.delete(id)});jobs.set(id,task);return task;
 }
 return {record,isShared:(kind,key)=>synced.has(kind+':'+key),
  started(kind,key){const id=kind+':'+key;paid.set(id,(paid.get(id)||0)+1)},
  response(kind,key,response){
   // Only our authenticated gateway can prove an upstream call never began.
   // A timeout, lost response or provider error remains uncertain. Count each
   // attempt so a later unpaid failure cannot erase an earlier unknown charge.
   if(response?.ok||response?.headers?.get('X-VN-Provider-State')!=='not-started')return;
   const id=kind+':'+key,n=(paid.get(id)||0)-1;if(n>0)paid.set(id,n);else paid.delete(id);
  },get pending(){return jobs.size}};
}
