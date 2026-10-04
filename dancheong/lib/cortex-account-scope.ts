// Account identity comes only from an authenticated server response, never a
// persisted "last account" value. Unknown legacy device data stays quarantined.
export const CORTEX_ACCOUNT_CHANGED='nexus-cortex-account-changed';
const owners=new WeakMap<Window,string>();
const epochs=new WeakMap<Window,number>();
export function cortexAccountEpoch(){return typeof window==='undefined'?0:epochs.get(window)||0}
export function cortexAccountOwner(){return typeof window==='undefined'?'':owners.get(window)||''}
export function setCortexAccountOwner(value:unknown){
 const next=typeof value==='string'&&/^account:[a-zA-Z0-9_-]+$/.test(value)?value:'';
 if(typeof window==='undefined')return;
 const previous=cortexAccountOwner();owners.set(window,next);
 if(previous!==next){epochs.set(window,cortexAccountEpoch()+1);window.dispatchEvent(new CustomEvent(CORTEX_ACCOUNT_CHANGED,{detail:{previous,current:next}}));window.dispatchEvent(new CustomEvent('nexus-cortex-catalog-changed'));}
}
export function accountStorageKey(key:string,owner=cortexAccountOwner()){
 return owner?`${key}:account:${encodeURIComponent(owner)}`:null;
}
export function accountSessionPrefix(id:string,owner=cortexAccountOwner()){
 // Only server-confirmed legacy ownership can reuse a pre-account save slot.
 try{if(owner&&localStorage.getItem('nexus-cortex-legacy-owner:'+id)===owner)return `nexus-cortex:${encodeURIComponent(id)}:`}catch{}
 return `nexus-cortex:${owner?encodeURIComponent(owner)+':':''}${encodeURIComponent(id)}:`;
}
export function bindVerifiedLegacySession(id:string,projectId:string,owner:string){
 if(!owner||owner!==cortexAccountOwner())return;
 try{
  const rows=JSON.parse(localStorage.getItem('nexus-cortex-catalog-v1')||'[]');
  if(!Array.isArray(rows)||!rows.some(r=>r?.id===id&&r.projectId===projectId))return;
  const key='nexus-cortex-legacy-owner:'+id,prior=localStorage.getItem(key);
  if(prior&&prior!==owner)return;
  localStorage.setItem(key,owner);
  const base=accountStorageKey('nexus-cloud-base:'+id,owner)!,old=localStorage.getItem('nexus-cloud-base:'+id);
  if(old&&!localStorage.getItem(base))localStorage.setItem(base,old);
 }catch{/* Preserve the unassigned original if ownership cannot be established. */}
}
export function accountFetch(owner:string,input:RequestInfo|URL,init:RequestInit={}){
 if(!owner)return Promise.reject(new Error('계정 확인 후 다시 열어 주세요.'));
 const headers=new Headers(init.headers);headers.set('X-Cortex-Account',owner);
 return globalThis.fetch(input,{...init,headers});
}
