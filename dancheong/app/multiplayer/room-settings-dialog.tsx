"use client";
import { useEffect, useRef, useState } from 'react';

export function RoomSettingsDialog({open,onClose,seconds,isHost,onSave}:{open:boolean;onClose:()=>void;seconds:number;isHost:boolean;onSave:(seconds:number)=>Promise<void>}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [draft,setDraft]=useState(seconds),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{if(open){setDraft(seconds);setMessage('');dialog.current?.showModal();}else dialog.current?.close();},[open]);
  return <dialog ref={dialog} className="mp-key-dialog" aria-labelledby="mp-room-settings-title" onCancel={event=>{event.preventDefault();if(!saving)onClose();}}>
    <form onSubmit={event=>{event.preventDefault();if(saving||!isHost)return;setSaving(true);setMessage('');void onSave(draft).then(()=>setMessage('저장했습니다. 다음 비트부터 적용됩니다.')).catch(error=>setMessage(error.message||'설정을 저장하지 못했습니다.')).finally(()=>setSaving(false));}}>
      <h2 id="mp-room-settings-title">멀티 설정</h2>
      <p>현재 차례의 남은 시간은 유지되며, 변경한 제한시간은 다음 비트부터 적용됩니다.</p>
      <label>턴 제한시간 (초)<input type="number" min={30} max={600} step={1} required value={draft} disabled={saving||!isHost} onChange={event=>setDraft(Number(event.target.value))}/></label>
      <p>{isHost?'30초부터 10분까지 설정할 수 있습니다.':'방장만 변경할 수 있습니다.'}</p>
      {message&&<p role="status">{message}</p>}
      <div><button type="button" disabled={saving} onClick={onClose}>닫기</button>{isHost&&<button disabled={saving}>{saving?'저장 중…':'다음 비트부터 적용'}</button>}</div>
    </form>
  </dialog>;
}
