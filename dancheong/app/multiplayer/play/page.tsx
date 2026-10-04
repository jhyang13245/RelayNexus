"use client";
import { deviceMuseReasoningEffort, deviceTextProvider } from '../../../lib/text-provider';
import {readerDevicePreferences} from '../../../lib/reader-device-preferences';
import {useCallback,useEffect,useRef,useState} from "react";
import {restoreRememberedApiKey,rememberApiKeyOnDevice} from "../../../lib/api-key-vault";
import type {MultiplayerRoomView} from "../../../lib/multiplayer-store";
import {RoomChat,type ChatMessage} from "../room-chat";
import {PlayerKeyDialog} from "../player-key-dialog";
import {RoomSettingsDialog} from "../room-settings-dialog";
import {useMultiplayerPressFeedback} from '../use-press-feedback';
import {applyLiveDelta,liveBasis,liveDelta,type LivePacket,type LiveBasis} from '../../../lib/multiplayer-live-wire';
import {validateLivePresentation} from '../../../lib/multiplayer-live';
import {createRoomClock,roomPollDelay,scheduleRoomPoll,sameReaderRoom} from '../../../lib/multiplayer-live-timing';
import {createDraftQueue} from '../../../lib/multiplayer-draft-queue';
import {multiplayerConnectionLabel,type MultiplayerConnection} from '../../../lib/reader-reliability';
type Envelope={room:MultiplayerRoomView;playback?:any;submission?:{id:string;name:string;text:string;createdAt:string}|null;cortex:{revision:number;turn:number;generating:boolean};live?:any;liveDelta?:number;draft?:any;snapshot?:Record<string,unknown>;update?:Record<string,unknown>;snapshotVersion?:string;mediaVersion?:string;mediaReused?:boolean;messages?:ChatMessage[]};
 const channel='NEXUS_CORTEX_HOST_V1';
export default function CortexMultiplayerPlayer(){
 useMultiplayerPressFeedback();
 const [keyOpen,setKeyOpen]=useState(false);
 const [viewReady,setViewReady]=useState(false);
 const [entry,setEntry]=useState<{mode:'novel'|'visual';account:string}|null>(null);
 const submittedSeen=useRef('');
 const [roomSettingsOpen,setRoomSettingsOpen]=useState(false);
 const chatInitialized=useRef(false),mediaVersion=useRef(''),pendingMediaVersion=useRef(''),pendingReuse=useRef(false),commitRunning=useRef(false),renewing=useRef(false),restoreStarted=useRef(0);
 const sharedUpdates=useRef(false),snapshotVersion=useRef(''),pendingSnapshotVersion=useRef(''),forceFull=useRef(false);
 const draftCursor=useRef({revision:0,seq:0}),draftRecent=useRef(0),draftQueue=useRef<ReturnType<typeof createDraftQueue>|null>(null);
 const liveCursor=useRef({id:'',seq:0}),livePending=useRef<Record<string,any>|null>(null),liveSending=useRef(false);
 const receivedLive=useRef<LivePacket|null>(null),receivedBasis=useRef<LiveBasis|null>(null),sentBasis=useRef<{token:string;basis:LiveBasis}|null>(null),serverClock=useRef(createRoomClock());
 const [liveDelayed,setLiveDelayed]=useState(false);
 const [applying,setApplying]=useState(false);
 const [connection,setConnection]=useState<MultiplayerConnection>('connecting');
 const [wireState,setWireState]=useState('');
 const refreshError=useRef('');
 const wakeRefresh=useRef<()=>void>(()=>{});
 const playbackSending=useRef(false),playbackFrame=useRef<any>(null);
 const lastActivity=useRef(0);
 const frameSession=useRef(crypto.randomUUID()),failure=useRef(''),frame=useRef<HTMLIFrameElement>(null),[code,setCode]=useState(''),[room,setRoom]=useState<MultiplayerRoomView|null>(null),[ready,setReady]=useState(false),[restored,setRestored]=useState(false),[error,setError]=useState(''),[chatError,setChatError]=useState(''),[messages,setMessages]=useState<ChatMessage[]>([]),[chatOpen,setChatOpen]=useState(false),[unread,setUnread]=useState(0),[busy,setBusy]=useState(false),[clock,setClock]=useState(Date.now());
 const revision=useRef(0),pendingRevision=useRef(0),key=useRef(''),token=useRef(''),pending=useRef<Record<string,unknown>|null>(null),refreshing=useRef(false),restoring=useRef(false),lastMessage=useRef(0),chatVisible=useRef(false),seen=useRef(0),latest=useRef<Envelope|null>(null),blockedUntil=useRef(0);
 useEffect(()=>{const changed=()=>{key.current='';setError('선택한 모델의 키를 연결해 주세요.');};window.addEventListener('dancheong-provider-change',changed);return()=>window.removeEventListener('dancheong-provider-change',changed)},[]);
 const send=useCallback((type:string,data:Record<string,unknown>={})=>frame.current?.contentWindow?.postMessage({channel,type,...data},window.location.origin),[]);
 const relayPlayback=useCallback((playback:any)=>{
  if(playback&&playback.seq>(playbackFrame.current?.seq||0))playbackFrame.current=playback;
  send('MP_PLAYBACK',{playback:playbackFrame.current,serverNow:serverClock.current.now()});
 },[send]);
 const json=useCallback(async(path:string,body?:Record<string,unknown>,method='POST')=>{const started=performance.now();const response=await fetch(`/api/multiplayer/rooms/${encodeURIComponent(code)}${path}`,{cache:'no-store',signal:AbortSignal.timeout(body?.action==='commit'||path.startsWith('?story=1')?90000:20000),...(body?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||'연결을 확인해 주세요.');serverClock.current.sample(result.serverTime,started);return result;},[code]);
 useEffect(()=>{const requested=new URLSearchParams(location.search).get('room')?.trim().toUpperCase()||'';if(!/^[A-Z0-9]{6}$/.test(requested))setError('올바른 방 코드를 확인해 주세요.');else setCode(requested);},[]);
 useEffect(()=>{if(!code)return;let cancelled=false;void Promise.all([json('?story=0'),fetch('/api/account',{cache:'no-store',signal:AbortSignal.timeout(15000)}).then(r=>r.json()),restoreRememberedApiKey()]).then(([result,identity,rememberedKey])=>{if(cancelled)return;key.current=rememberedKey||'';if(!identity.id&&!identity.account?.id)throw Error('로그인 계정을 확인해 주세요.');setRoom(result.room);setEntry({mode:result.room.settings.presentation==='visual'?'visual':'novel',account:String(identity.account?.id||identity.id||'')});}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[code,json]);
 const receiveChat=useCallback((rows:ChatMessage[])=>{
  const initial=!chatInitialized.current;chatInitialized.current=true;
  const fresh=rows.filter(m=>m.seq>lastMessage.current);
  if(fresh.length){lastMessage.current=fresh.at(-1)!.seq;setMessages(old=>[...old,...fresh].slice(-500));if(chatVisible.current||initial)seen.current=lastMessage.current;else setUnread(count=>count+fresh.filter(m=>!m.isSelf).length);}
  if(!initial&&!chatVisible.current&&document.visibilityState==='visible'){const previews=fresh.filter(m=>!m.isSelf).map(({seq,name,body})=>({seq,name,body}));if(previews.length)send('MP_CHAT_PREVIEWS',{messages:previews});}
  setChatError('');
 },[send]);
 useEffect(()=>{send('MP_CHAT_OPEN',{open:chatOpen})},[chatOpen,send]);
 // Closed chat piggybacks on the small status response. Open chat and stalled
 // status/large restores retain their independent fast lane and cursor recovery.
 useEffect(()=>{if(!ready||!code)return;let disposed=false;const poll=scheduleRoomPoll(async()=>{if(!chatVisible.current&&!restoring.current&&Date.now()-lastActivity.current<1800)return;try{const result=await json('/chat?after='+lastMessage.current);if(!disposed)receiveChat(result.messages||[])}catch(e){if(!disposed)setChatError(e instanceof Error?e.message:'대화 연결을 확인해 주세요.')}},()=>chatVisible.current?800:1200,()=>document.visibilityState==='visible');const resume=()=>{if(document.visibilityState==='visible')poll.wake();else poll.suspend()};poll.wake();window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);return()=>{disposed=true;poll.stop();window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume)}},[ready,code,json,receiveChat]);
 useEffect(()=>{const queue=createDraftQueue(body=>json('/live',body));draftQueue.current=queue;const timer=setInterval(()=>{if(document.visibilityState==='visible')void queue.flush()},1000);return()=>{queue.reset(0);draftQueue.current=null;clearInterval(timer)}},[json]);
 const refresh=useCallback(async(force=false)=>{
  if(!ready||!code||refreshing.current)return;
  refreshing.current=true;let startedRestore=false;
  try{const result=await json('?story=0'+(token.current?'':'&liveAfter='+liveCursor.current.seq+'&liveId='+encodeURIComponent(liveCursor.current.id)+'&draftAfter='+draftCursor.current.seq+'&draftRevision='+draftCursor.current.revision+(receivedBasis.current?'&liveBasis='+encodeURIComponent(JSON.stringify(receivedBasis.current)):''))+(!chatVisible.current?'&after='+lastMessage.current:'')) as Envelope;latest.current=result;if(result.messages){receiveChat(result.messages);lastActivity.current=Date.now()}setRoom(old=>sameReaderRoom(old,result.room)?old:result.room);setConnection('connected');if(result.submission&&submittedSeen.current!==result.submission.id){submittedSeen.current=result.submission.id;send('MP_SUBMITTED_INPUT',{submission:result.submission,serverNow:serverClock.current.now()});}if(refreshError.current){const prior=refreshError.current;setError(old=>old===prior?'':old);refreshError.current='';}
   setWireState(`${result.cortex.revision}:${result.cortex.turn}:${result.cortex.generating}`);
   if(result.room.settings.presentation==='visual')relayPlayback(result.playback);
   const draft=result.draft;if(draft){draftCursor.current={revision:draft.revision,seq:draft.seq};draftRecent.current=Date.parse(draft.updatedAt);if(!draft.unchanged)send('MP_INPUT_DRAFT',{draft})}else if(draftCursor.current.revision){draftCursor.current={revision:0,seq:0};draftRecent.current=0;send('MP_INPUT_DRAFT',{draft:null})}
   if(token.current||restoring.current)return;
   if(revision.current===result.cortex.revision){
    if(result.live&&result.live.baseRevision===revision.current&&!result.live.unchanged&&result.live.id&&result.live.seq){
     const packet=applyLiveDelta(receivedLive.current,result.live);
     if(packet){const clean=validateLivePresentation(packet),basis=await liveBasis(clean);receivedLive.current=clean;receivedBasis.current=basis;send('MP_LIVE',{presentation:clean});}
     else {receivedLive.current=null;receivedBasis.current=null;liveCursor.current={id:'',seq:0};} // Keep painted text until full-current-beat recovery arrives.
    }
    else if(result.live===null&&!result.cortex.generating&&(receivedLive.current||liveCursor.current.seq)){send('MP_LIVE_CLEAR');liveCursor.current={id:'',seq:0};receivedLive.current=null;receivedBasis.current=null;}
   }
   if(result.room.settings.engine!=='cortex'){location.replace(`/?room=${encodeURIComponent(code)}`);return;}
   if(force||forceFull.current||revision.current!==result.cortex.revision){startedRestore=true;restoring.current=true;restoreStarted.current=Date.now();setApplying(true);
    const incremental=!force&&!forceFull.current&&sharedUpdates.current&&snapshotVersion.current;
    const full=await json('?story=1&media='+encodeURIComponent(mediaVersion.current)+(incremental?'&base='+revision.current+'&snapshotVersion='+encodeURIComponent(snapshotVersion.current):'')) as Envelope;
    if(!full.snapshot&&!full.update)throw Error('공유 본문이 없습니다.');latest.current=full;setRoom(full.room);pendingRevision.current=full.cortex.revision;pendingMediaVersion.current=full.mediaVersion||'';pendingSnapshotVersion.current=full.snapshotVersion||'';
    if(full.update)send('SHARED_UPDATE',{update:full.update,snapshotVersion:full.snapshotVersion});
    else {send('CLOUD_RESTORE',{snapshot:full.snapshot,reuseMedia:full.mediaReused===true,sharedRevision:full.cortex.revision,snapshotVersion:full.snapshotVersion});}
   }
  }catch(e){if(startedRestore){restoring.current=false;setApplying(false);}setConnection(navigator.onLine===false?'offline':'reconnecting');refreshError.current=e instanceof Error?e.message:'공유 기록을 읽지 못했습니다.';setError(refreshError.current);}finally{refreshing.current=false;}
 },[code,ready,json,send,receiveChat,relayPlayback]);
 // One in-flight upload and one replaceable pending frame: slow networks cannot
 // build a per-character queue or delay generation/the canonical commit.
 const publishLive=useCallback(async():Promise<void>=>{
  const queued=livePending.current;if(!queued||queued.token!==token.current||liveSending.current)return;
  liveSending.current=true;
  try{const packet=validateLivePresentation(queued.presentation),presentation=latest.current?.liveDelta===1?await liveDelta(packet,sentBasis.current?.token===queued.token?sentBasis.current?.basis:null):packet;
   if(queued.token!==token.current)return;
   const result=await json('/live',{token:queued.token,presentation});if(queued.token!==token.current)return;
   if(result.resync)sentBasis.current=null;
   if(result.accepted){sentBasis.current={token:queued.token,basis:await liveBasis(packet)};if(livePending.current===queued)livePending.current=null}setLiveDelayed(false)}
  catch{if(queued.token===token.current)setLiveDelayed(true)}finally{liveSending.current=false;if(livePending.current&&livePending.current!==queued&&livePending.current.token===token.current)void publishLive();}
 },[json]);
 useEffect(()=>{const timer=setInterval(()=>{if(livePending.current?.token!==token.current)livePending.current=null;else void publishLive()},800);return()=>clearInterval(timer)},[publishLive]);
 const commit=useCallback(async()=>{
  if(!token.current||!pending.current||commitRunning.current)return;commitRunning.current=true;setBusy(true);
  try{const saved=await json('/cortex',{action:'commit',token:token.current,snapshot:pending.current,...(pendingReuse.current?{mediaUnchanged:mediaVersion.current}:{})});revision.current=saved.revision;snapshotVersion.current=saved.snapshotVersion||'';send('MP_COMMITTED',{token:token.current,revision:saved.revision,snapshotVersion:snapshotVersion.current});mediaVersion.current=saved.mediaVersion||mediaVersion.current;pending.current=null;token.current='';setBusy(false);setError('');void refresh();}
  catch(e){setError((e instanceof Error?e.message:'공유 저장 실패')+' · 저장 재시도를 눌러 주세요.');setBusy(false);}finally{commitRunning.current=false;}
 },[json,refresh,send]);
 const begin=useCallback(async(input:string,autoContinue:boolean,cause='NORMAL')=>{
  if(token.current||restoring.current||forceFull.current||!restored)return;
  if(entry?.mode==='visual'&&(playbackFrame.current?.phase!=='choices'||serverClock.current.now()<playbackFrame.current.startsAt))return;
  if(!key.current){setError('이 기기의 API 키를 연결해 주세요.');setKeyOpen(true);blockedUntil.current=Date.now()+30000;return;}
  const claim=crypto.randomUUID(),submissionId=crypto.randomUUID();token.current=claim;setBusy(true);failure.current='';setError('');
  try{await json('/cortex',{action:'begin',token:claim,revision:revision.current,cause,input,submissionId});send('SETTINGS',{...readerDevicePreferences(),apiKey:key.current,provider:deviceTextProvider(),museReasoningEffort:deviceMuseReasoningEffort(),imageEvery:0,imageQuality:'low'});send('MP_EXECUTE',{token:claim,input,submissionId,autoContinue,compactMedia:Boolean(mediaVersion.current)});}
  catch(e){token.current='';setBusy(false);blockedUntil.current=Date.now()+10000;setError(e instanceof Error?e.message:'진행을 시작하지 못했습니다.');void refresh(true);}
 },[json,restored,send,refresh,entry]);
 useEffect(()=>{
  const handler=(event:MessageEvent)=>{if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||event.data?.channel!==channel)return;const data=event.data;
   if(data.type==='READY'){sharedUpdates.current=data.sharedUpdates===true;setReady(true);}
    if(data.type==='SHARED_UPDATE_FAILED'){restoring.current=false;forceFull.current=true;setApplying(false);wakeRefresh.current();}
   if(data.type==='CLOUD_RESTORE_COMPLETE'||data.type==='SHARED_UPDATE_COMPLETE'){
    if(data.type==='SHARED_UPDATE_COMPLETE'&&data.revision!==pendingRevision.current)return;
    liveCursor.current={id:'',seq:0};receivedLive.current=null;receivedBasis.current=null;send('MP_LIVE_CLEAR');restoring.current=false;forceFull.current=false;setApplying(false);mediaVersion.current=pendingMediaVersion.current;snapshotVersion.current=pendingSnapshotVersion.current;revision.current=pendingRevision.current;setRestored(true);setError(failure.current);send('SETTINGS',{...readerDevicePreferences(),apiKey:entry?.mode==='visual'?key.current:'',provider:deviceTextProvider(),museReasoningEffort:deviceMuseReasoningEffort(),imageEvery:0,imageQuality:'low'});if(entry?.mode==='visual')send('VIEW_MODE',{mode:'visual'});wakeRefresh.current();}
   if(data.type==='VIEW_MODE_ERROR'){setError('비주얼노벨 화면을 열지 못했습니다. 다시 열기를 눌러 주세요.');setViewReady(false);}
   if(data.type==='VIEW_MODE_READY'&&data.mode==='visual'){setViewReady(true);relayPlayback(playbackFrame.current);if(latest.current?.submission)send('MP_SUBMITTED_INPUT',{submission:latest.current.submission,serverNow:serverClock.current.now()});if(receivedLive.current)send('MP_LIVE',{presentation:receivedLive.current});wakeRefresh.current();}
   if(data.type==='MP_CHAT'){void refresh();chatVisible.current=true;setChatOpen(true);setUnread(0);seen.current=lastMessage.current;}
   if(data.type==='NEXUS_SETTINGS')setKeyOpen(true);
   if(data.type==='MP_SETTINGS')setRoomSettingsOpen(true);
   if(data.type==='MP_REQUEST')void begin(String(data.input||''),Boolean(data.autoContinue));
   if(data.type==='MP_INPUT_CHANGED'&&typeof data.text==='string')draftQueue.current?.change(data.text);
   if(data.type==='MP_PLAYBACK_REQUEST'&&entry?.mode==='visual'&&!playbackSending.current){
    playbackSending.current=true;
    void json('/playback',{action:data.action,expected:data.expected,turnId:data.turnId})
      .then(result=>relayPlayback(result.playback)).catch(()=>{/* Existing status poll recovers the current frame; no queued gestures. */})
      .finally(()=>{playbackSending.current=false;send('MP_PLAYBACK_ACK');});
   }
   if(data.type==='MP_LIVE_RECEIVED'&&receivedLive.current?.id===data.id&&receivedLive.current?.seq===data.seq)liveCursor.current={id:data.id,seq:data.seq};
   if(data.type==='MP_LIVE_PUBLIC'&&token.current&&data.token===token.current){livePending.current={token:data.token,presentation:data.presentation};void publishLive();}
   if(data.type==='MP_RESULT'&&data.token===token.current){send('SETTINGS',{...readerDevicePreferences(),apiKey:entry?.mode==='visual'?key.current:'',provider:deviceTextProvider(),museReasoningEffort:deviceMuseReasoningEffort(),imageEvery:0});pending.current=data.snapshot;pendingReuse.current=data.mediaUnchanged===true;void commit();}
   if(data.type==='MP_FAILED'&&data.token===token.current){const oldToken=token.current;void(async()=>{try{await json('/cortex',{action:'abort',token:oldToken});if(/401|invalid_api_key|incorrect api key|authentication|API.?키.*(?:유효|인증|잘못)/i.test(String(data.message))){await json('',{action:'key_failed'},'PATCH');setKeyOpen(true);}}catch{}finally{token.current='';setBusy(false);blockedUntil.current=Date.now()+30000;setError(failure.current=String(data.message||'생성에 실패했습니다.'));void refresh(true);}})();}
   if(data.type==='HOME'){if(token.current)setError('현재 비트 저장을 마친 뒤 이동해 주세요.');else location.href=`/multiplayer?room=${encodeURIComponent(code)}`;}
   if(data.type==='ERROR'){restoring.current=false;forceFull.current=true;setApplying(false);setError(String(data.message||'본문 복원 실패'));}
  };window.addEventListener('message',handler);return()=>window.removeEventListener('message',handler);
 },[begin,code,commit,json,refresh,send,publishLive,entry,relayPlayback]);
 useEffect(()=>{const poll=scheduleRoomPoll(()=>refresh(),()=>{const r=latest.current?.room;const delay=roomPollDelay(Boolean(latest.current?.cortex.generating)||serverClock.current.now()-draftRecent.current<5000,Boolean(token.current),Boolean(r?.status==='ACTIVE'&&r.members.some(m=>m.isSelf&&m.id!==r.currentMemberId)));return r?.settings.presentation==='visual'?800:chatVisible.current?delay:Math.min(delay,1200)},()=>document.visibilityState==='visible');wakeRefresh.current=poll.wake;poll.wake();const offline=()=>setConnection('offline');window.addEventListener('offline',offline);const resume=()=>{if(document.visibilityState!=='visible'){poll.suspend();return}setConnection(old=>old==='offline'?'reconnecting':old);poll.wake();if(pending.current)void commit()};window.addEventListener('online',resume);window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);return()=>{wakeRefresh.current=()=>{};poll.stop();window.removeEventListener('offline',offline);window.removeEventListener('online',resume);window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume)};},[refresh,commit]);
 useEffect(()=>{const id=setInterval(()=>{if(token.current&&!renewing.current){renewing.current=true;void json('/cortex',{action:'renew',token:token.current}).catch(e=>setError(e.message)).finally(()=>{renewing.current=false})}},20000);const tick=setInterval(()=>{if(document.visibilityState==='visible'||(latest.current?.room.status==='ACTIVE'&&latest.current.room.members.some(m=>m.isSelf&&m.id===latest.current?.room.currentMemberId)))setClock(serverClock.current.now());if(restoring.current&&Date.now()-restoreStarted.current>180000)setError('본문 복원이 오래 걸리고 있습니다. 다시 열기를 눌러 공유 기록을 안전하게 불러와 주세요.');},1000);return()=>{clearInterval(id);clearInterval(tick)}},[json]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(token.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);

 const me=room?.members.find(m=>m.isSelf),current=room?.members.find(m=>m.id===room.currentMemberId),canWrite=Boolean(connection==='connected'&&restored&&!forceFull.current&&!applying&&!busy&&!token.current&&room&&['ACTIVE','SOLO'].includes(room.status)&&me?.id===room.currentMemberId&&!latest.current?.cortex.generating);
 const remaining=Math.max(0,Math.ceil((Date.parse(room?.turnDeadlineAt||'')-clock)/1000))||0;
 const catchingUp=applying||Boolean(restored&&latest.current&&revision.current!==latest.current.cortex.revision);
 const connectionLabel=multiplayerConnectionLabel(connection,catchingUp,restored?latest.current?.cortex.turn:undefined);
 useEffect(()=>{if(ready)send('MP_CONNECTION',{phase:connection==='connected'&&catchingUp?'catching-up':connection,label:connectionLabel});},[ready,send,connection,catchingUp,connectionLabel]);
 useEffect(()=>{draftQueue.current?.reset(canWrite?room!.revision:0);send('MP_INPUT_STATE',{canWrite,revision:room?.revision||0,memberId:room?.currentMemberId||'',name:current?.displayName||'참가자',watch:Boolean(restored&&!canWrite&&!busy&&!latest.current?.cortex.generating&&room&&['ACTIVE','SOLO'].includes(room.status)&&me?.id!==room.currentMemberId)})},[canWrite,room,restored,busy,send,current?.displayName,me?.id,wireState]);
 useEffect(()=>{send('MP_STATE',{canWrite,unread,label:busy?(liveDelayed?'본문 생성 중 · 실시간 연결 재시도 중':'본문 생성·실시간 공유 중…'):room?.status==='PAUSED_KEY'?'API 키 복구 대기':room?.status==='CLOSED'?'종료된 이야기':canWrite?`내 차례${room?.status==='SOLO'?'':` · ${remaining}초`}`:latest.current?.cortex.generating?`${current?.displayName||'참가자'}의 본문 함께 읽는 중`:`${current?.displayName||'참가자'}의 차례${room?.status==='ACTIVE'&&room.turnDeadlineAt?` · ${remaining}초`:''}`});},[send,canWrite,unread,busy,liveDelayed,remaining,room,current?.displayName,wireState]);
 useEffect(()=>{if(canWrite&&room?.status==='ACTIVE'&&remaining===0&&room.turnDeadlineAt&&Date.now()>=blockedUntil.current)void begin('',true,'AUTO_TIMEOUT')},[canWrite,room?.status,room?.turnDeadlineAt,remaining,clock,begin]);
 return <main className="cortex-multiplayer-reader" data-reading-mode={entry?.mode}>
  {code&&entry&&<iframe ref={frame} title="단청 멀티플레이 이야기" src={`/cortex.html?session=${encodeURIComponent('multiplayer-'+code+'-'+frameSession.current)}&multiplayer=1&room=${encodeURIComponent(code)}&account=${encodeURIComponent(entry.account)}&view=${entry.mode}`} onLoad={()=>send('HELLO')}/>}
  {(!restored||(entry?.mode==='visual'&&!viewReady))&&!error&&<div className="mp-reader-loading" role="status">공유 이야기를 불러오는 중…</div>}
  {error&&<div className="mp-reader-alert" role="alert"><span>{error}</span>{pending.current?<><button disabled={busy} onClick={()=>void commit()}>저장 재시도</button><button disabled={busy} onClick={()=>{if(!confirm('아직 공유되지 않은 현재 비트를 버리고 마지막 공유 기록을 불러올까요?'))return;const oldToken=token.current;void json('/cortex',{action:'abort',token:oldToken}).catch(()=>{}).finally(()=>{pending.current=null;token.current='';failure.current='';void refresh(true);});}}>공유 기록으로 돌아가기</button></>:<button disabled={busy} onClick={()=>{if(!entry||restoring.current||(entry.mode==='visual'&&!viewReady))location.reload();else void refresh(true)}}>{restoring.current?'다시 열기':'다시 확인'}</button>}<button onClick={()=>setKeyOpen(true)}>내 키 설정</button><a href={`/multiplayer?room=${encodeURIComponent(code)}`} onClick={e=>{if(token.current)e.preventDefault()}}>방 관리</a></div>}
  {room?.status==='PAUSED_KEY'&&room.isHost&&<button className="mp-host-force" onClick={()=>void begin('',true,'HOST_FORCE')}>내 API 키로 대신 진행</button>}
  <RoomChat open={chatOpen} onClose={()=>{chatVisible.current=false;setChatOpen(false);send('MP_FOCUS_CHAT')}} messages={messages} error={chatError} participants={room?.members.filter(m=>!['LEFT','KICKED'].includes(m.status)).map(m=>m.displayName)||[]} onSend={async(body,clientId)=>{const result=await json('/chat',{body,clientId,after:lastMessage.current});receiveChat(result.messages||[])}}/>
  <RoomSettingsDialog open={roomSettingsOpen} onClose={()=>setRoomSettingsOpen(false)} seconds={room?.turnLimitSeconds||120} isHost={Boolean(room?.isHost&&room.status!=='CLOSED')} onSave={async seconds=>{const result=await json('',{action:'turn_limit',turnLimitSeconds:seconds},'PATCH');setRoom(result.room);}}/>
  <PlayerKeyDialog open={keyOpen} onClose={()=>setKeyOpen(false)} onSave={async value=>{const response=await fetch('/api/openai/test',{method:'POST',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:value,provider:deviceTextProvider()})});if(!response.ok)throw Error('API 키 연결을 확인하지 못했습니다. 키와 이용 한도를 확인해 주세요.');await rememberApiKeyOnDevice(value);key.current=value;if(entry?.mode==='visual')send('SETTINGS',{...readerDevicePreferences(),apiKey:value,provider:deviceTextProvider(),museReasoningEffort:deviceMuseReasoningEffort(),imageEvery:0});await json('',{action:'presence',apiKeyReady:true},'PATCH');failure.current='';setError('');blockedUntil.current=Date.now()+10000;await refresh();}}/>
 </main>;
}
