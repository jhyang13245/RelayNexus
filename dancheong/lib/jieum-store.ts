import { STUDIO_CORTEX_TARGET } from './studio-cortex-target';

export const JIEUM_DATABASE = 'DancheongJieum';
export const HANDOFF_TTL_MS = 60 * 60 * 1000;
export const MAX_HANDOFF_BYTES = 2 * 1024 * 1024;
export class JieumConflictError extends Error {
  constructor() { super('다른 탭에서 이 작업을 저장했습니다. 현재 작업을 파일로 내보낸 뒤 새로고침해 주세요.'); }
}
export type DraftRecord<T> = { revision: number; project: T; updatedAt: number };
export type HandoffRecord = { id: string; origin: string; createdAt: number; blueprint: unknown };
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(JIEUM_DATABASE, 1);
    request.onupgradeneeded = () => { for (const name of ['drafts','handoffs']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 지음 탭을 닫고 다시 시도해 주세요.'));
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}
export async function loadJieumDraft<T>(): Promise<DraftRecord<T> | null> {
  const db=await open(); return new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts','readonly'), request=tx.objectStore('drafts').get('current');
    tx.oncomplete=()=>{db.close();resolve(request.result ?? null)};
    tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||new Error('작업을 읽지 못했습니다.'))};
  });
}
export async function saveJieumDraft<T>(project:T, expectedRevision:number, handoffId?:string): Promise<number> {
  const db=await open(); return new Promise((resolve,reject)=>{
    const tx=db.transaction(['drafts','handoffs'],'readwrite'), drafts=tx.objectStore('drafts');
    let failure:Error|null=null, revision=expectedRevision+1;
    const request=drafts.get('current');
    request.onsuccess=()=>{
      if((request.result?.revision??0)!==expectedRevision){failure=new JieumConflictError();tx.abort();return}
      const write=()=>{try{drafts.put({revision,project,updatedAt:Date.now()},'current');if(handoffId)tx.objectStore('handoffs').delete(handoffId)}catch(e){failure=e instanceof Error?e:new Error(String(e));tx.abort()}};
      if(handoffId){const delivery=tx.objectStore('handoffs').get(handoffId);delivery.onsuccess=()=>{if(!delivery.result||Date.now()-delivery.result.createdAt>HANDOFF_TTL_MS){failure=new Error('청사진 전달이 만료되었거나 이미 적용됐습니다.');tx.abort();return}write()}}
      else write();
    };
    tx.oncomplete=()=>{db.close();resolve(revision)};
    tx.onabort=tx.onerror=()=>{db.close();reject(failure||tx.error||new Error('작업을 저장하지 못했습니다.'))};
  });
}
export function validateJieumBlueprint(raw:unknown) {
  const b=raw as Record<string,any>;
  if(!b||b.format!=='RELAY_NEXUS_STUDIO_BLUEPRINT_V1'||!b.project||!['instant_story','intelligent_canon'].includes(b.runtimeMode))throw new Error('지원하지 않는 지음 청사진입니다.');
  if(!b.target||Object.entries(STUDIO_CORTEX_TARGET).some(([key,value])=>b.target[key]!==value))throw new Error('현재 Cortex용 청사진이 아닙니다.');
  const json=JSON.stringify(raw);
  if(new TextEncoder().encode(json).byteLength>MAX_HANDOFF_BYTES)throw new Error('청사진이 너무 큽니다. 작업 파일로 가져와 주세요.');
  if(/"(?:apiKey|api_key|authorization|access_token)"\s*:/iu.test(json))throw new Error('인증 정보는 청사진으로 전달할 수 없습니다.');
  return raw;
}
export async function putJieumHandoff(blueprint:unknown, origin:string): Promise<string> {
  validateJieumBlueprint(blueprint);const record:HandoffRecord={id:crypto.randomUUID(),createdAt:Date.now(),origin,blueprint};
  const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('handoffs','readwrite'),store=tx.objectStore('handoffs');
    // Expired deliveries are temporary, not user drafts. Bound their retention on every enqueue.
    let failure:Error|null=null;
    const cursor=store.openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){if(row.value.createdAt<Date.now()-HANDOFF_TTL_MS)row.delete();row.continue();return}const count=store.count();count.onsuccess=()=>{if(count.result>=8){failure=new Error('미적용 청사진이 많습니다. 지음에서 적용하거나 한 시간 후 다시 시도해 주세요.');tx.abort();return}store.put(record,record.id)}};
    tx.oncomplete=()=>{db.close();resolve(record.id)};tx.onabort=tx.onerror=()=>{db.close();reject(failure||tx.error||new Error('청사진 전달을 저장하지 못했습니다.'))};
  });
}
export async function getJieumHandoff(id:string,origin:string):Promise<HandoffRecord> {
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('올바르지 않은 전달 ID입니다.');
  const db=await open();const record=await new Promise<HandoffRecord|undefined>((resolve,reject)=>{
    const tx=db.transaction('handoffs','readonly'),r=tx.objectStore('handoffs').get(id);tx.oncomplete=()=>{db.close();resolve(r.result)};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error)};
  });
  if(!record||record.origin!==origin||Date.now()-record.createdAt>HANDOFF_TTL_MS)throw new Error('청사진 전달이 만료되었거나 이미 적용됐습니다. 홈에서 다시 생성해 주세요.');
  validateJieumBlueprint(record.blueprint);return record;
}
