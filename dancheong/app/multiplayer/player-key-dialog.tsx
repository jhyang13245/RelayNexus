"use client";
import { useEffect, useRef, useState } from "react";
import { TextProviderSelector } from '../text-provider-selector';

export function PlayerKeyDialog({open,onClose,onSave}:{open:boolean;onClose:()=>void;onSave:(key:string)=>Promise<void>}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [draft,setDraft]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const changed=()=>{setDraft('');setError('')};window.addEventListener('dancheong-provider-change',changed);return()=>window.removeEventListener('dancheong-provider-change',changed)},[]);
  useEffect(()=>{if(open){setDraft('');setError('');if(!dialog.current?.open)dialog.current?.showModal();}else dialog.current?.close();},[open]);
  return <dialog ref={dialog} className="mp-key-dialog" aria-labelledby="mp-key-title" onCancel={event=>{event.preventDefault();if(!saving)onClose();}}>
    <form onSubmit={event=>{event.preventDefault();if(saving)return;setSaving(true);setError('');void onSave(draft.trim()).then(onClose).catch(e=>setError(e.message||'키를 확인하지 못했습니다.')).finally(()=>setSaving(false));}}>
      <h2 id="mp-key-title">내 기기 API 키 연결</h2>
      <p>내 차례에 사용할 키입니다. 방 참가자에게 공유되지 않으며 이 기기에 암호화해 보관합니다.</p>
      <TextProviderSelector disabled={saving}/>
      <label>선택한 모델의 API 키<input autoComplete="off" type="password" value={draft} disabled={saving} onChange={e=>setDraft(e.target.value)} required /></label>
      {error&&<p role="alert">{error}</p>}
      <div><button type="button" disabled={saving} onClick={onClose}>닫기</button><button disabled={saving||!draft.trim()}>{saving?'연결 확인 중…':'연결하고 저장'}</button></div>
    </form>
  </dialog>;
}
