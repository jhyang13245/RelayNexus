"use client";
import {useEffect,useMemo,useRef,useState} from "react";
export type ChatMessage={seq:number;clientId?:string;name:string;body:string;createdAt:string;isSelf:boolean};
export function RoomChat({open,onClose,messages,onSend,error,participants}:{open:boolean;onClose:()=>void;messages:ChatMessage[];onSend:(body:string,id:string)=>Promise<void>;error:string;participants:string[]}){
 const dialog=useRef<HTMLDialogElement>(null),list=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),nearBottom=useRef(true),nonce=useRef(crypto.randomUUID());
 const [draft,setDraft]=useState(''),[sending,setSending]=useState(false),[sendError,setSendError]=useState('');
 const inFlight=useRef(false);
 const [pending,setPending]=useState<{id:string;body:string;failed:boolean}|null>(null);
 useEffect(()=>{const el=dialog.current;if(!el)return;if(open){if(!el.open)el.showModal();nearBottom.current=true;const target=window.matchMedia?.('(pointer: coarse)').matches?el.querySelector<HTMLButtonElement>('header button'):input.current;target?.focus({preventScroll:true});}else el.close();},[open]);
 useEffect(()=>{if(open&&nearBottom.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[messages,open]);
 const send=async(retry?:{id:string;body:string})=>{if(inFlight.current||(!retry&&(!draft.trim()||pending?.failed)))return;const outgoing=retry||{id:nonce.current,body:draft};inFlight.current=true;setSending(true);setSendError('');setPending({...outgoing,failed:false});if(!retry){setDraft('');nonce.current=crypto.randomUUID();}nearBottom.current=true;try{await onSend(outgoing.body,outgoing.id);setPending(null);}catch(e){setPending({...outgoing,failed:true});setSendError(e instanceof Error?e.message:'전송에 실패했습니다.');}finally{inFlight.current=false;setSending(false);}};
 useEffect(()=>{if(open&&nearBottom.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[pending,open]);
 const renderedMessages=useMemo(()=>open?messages.map(m=><article key={m.seq} className={m.isSelf?'is-self':''}><div><strong>{m.isSelf?'나':m.name}</strong><time>{new Date(m.createdAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</time></div><p>{m.body}</p></article>):null,[messages,open]);
 return <dialog ref={dialog} className="dancheong-room-chat" aria-labelledby="room-chat-title" onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===dialog.current)onClose()}}>
  <header><div><small>함께 쓰는 이야기</small><h2 id="room-chat-title">참여자 대화</h2></div><button type="button" onClick={onClose} aria-label="대화창 닫기">×</button></header>
  <p className="room-chat-people">{participants.join(' · ')}</p>
  <div className="room-chat-messages" ref={list} onScroll={()=>{const el=list.current;if(el)nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<40}} role="log" aria-live="polite" aria-relevant="additions">
   {!messages.length&&<p className="room-chat-empty">함께할 다음 장면을 이야기해 보세요.<br/><small>대화는 소설 본문이나 작가에게 전달되지 않습니다.</small></p>}
   {renderedMessages}
   {pending&&!messages.some(m=>m.clientId===pending.id)&&<article className="is-self"><div><strong>나</strong><span role="status">{pending.failed?'전송 실패':'전송 중…'}</span></div><p>{pending.body}</p>{pending.failed&&<button type="button" onClick={()=>void send(pending)}>다시 보내기</button>}</article>}
  </div>
  <form onSubmit={e=>{e.preventDefault();void send()}}><label className="sr-only" htmlFor="room-chat-draft">참여자에게 보낼 메시지</label><textarea id="room-chat-draft" ref={input} rows={2} maxLength={1000} value={draft} placeholder="참여자에게 메시지 보내기" onChange={e=>{setDraft(e.target.value);nonce.current=crypto.randomUUID();}} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><button disabled={sending||Boolean(pending?.failed)||!draft.trim()}>{sending?'전송 중':'보내기'}</button></form>
  {(sendError||error)&&<p className="room-chat-error" role="status">{sendError||error}</p>}
 </dialog>;
}
