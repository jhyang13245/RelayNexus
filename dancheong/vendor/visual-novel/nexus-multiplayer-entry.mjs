let multiplayerProjection=null,multiplayerProxy=null,multiplayerState={canWrite:false},multiplayerReadStep;
let roomTimeline=null,roomGlyphSchedule,roomRevealCount,roomHold,roomFrame=null,roomRequestAt=0,roomRequestPending=false,roomPaintTimer=0,roomPaintSchedule=null,roomPainting=false,roomAligned=false;
let roomReadyTurn='',roomReadySince=0,roomAutoAttempt='',roomAutoRetry=0;
function multiplayerApi(api){
  if(!multiplayerProxy)multiplayerProxy=new Proxy(api,{get(target,key){
    if(key==='_turns')return ()=>multiplayerProjection.turns();
    if(['_rewind','_restoreBackup','_importFull','_reset','_import'].includes(key))return async()=>{throw Error('공유 기록은 방에서 관리합니다.');};
    return Reflect.get(target,key);
  }});
  return multiplayerProxy;
}
async function setupMultiplayer(){
  const [{createSharedAssets},multiplayer,timeline]=await Promise.all([
    import('../cortex-vn-shared.mjs'),import('../cortex-vn-multiplayer.mjs'),import('../cortex-vn-timeline.mjs')]);
  roomTimeline=timeline.createRoomTimeline();roomGlyphSchedule=timeline.glyphSchedule;roomRevealCount=timeline.revealCount;roomHold=timeline.paragraphHold;
  const {createMultiplayerProjection,createInputNotice}=multiplayer;multiplayerReadStep=multiplayer.multiplayerReadStep;
  multiplayerProjection=createMultiplayerProjection(host.api());
  const code=new URLSearchParams(location.search).get('room');
  globalThis.NexusVNSharedAssets=createSharedAssets({notice:toast,request:async body=>{
    const response=await fetch(`/api/multiplayer/rooms/${encodeURIComponent(code)}/visual`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'공유 자산 연결 오류');return result;
  }});
  const notice=document.createElement('aside');notice.className='vn-mp-input-notice';notice.hidden=true;notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');root.append(notice);
  let clockOffset=0;
  const showInput=createInputNotice(notice,{now:()=>Date.now()+clockOffset});
  window.addEventListener('nexus-mp-live',event=>{event.detail?multiplayerProjection.receive(event.detail):multiplayerProjection.clear();sync(true);});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='NEXUS_CORTEX_HOST_V1')return;
    const data=event.data;
    if(data.type==='MP_PLAYBACK'){roomTimeline.receive(data);if(host.active){sync();scheduleMultiplayerPlayback();}}
    if(data.type==='MP_PLAYBACK_ACK'){roomRequestPending=false;}
    if(data.type==='MP_SUBMITTED_INPUT'){clockOffset=Number(data.serverNow||Date.now())-Date.now();showInput(data.submission);}
    if(data.type==='MP_STATE'){
      const changed=multiplayerState.canWrite!==Boolean(data.canWrite);multiplayerState=data;
      $('vn-input').readOnly=!data.canWrite;
      if(!data.canWrite){$('vn-input').value='';state.customInputOpen=false;}
      if(data.canWrite)state.awaitingTurn=false;
      if(changed)sync(true);
    }
    if(data.type==='MP_EXECUTE'){state.awaitingTurn=true;state.generationStarted=Date.now();}
    if(['MP_COMMITTED','MP_LIVE_CLEAR'].includes(data.type))state.awaitingTurn=false;
  });
}
function installMultiplayerUI(){
  $('vn-dialogue-box').setAttribute('aria-label','함께 읽는 본문 · 판정 완료 후 터치로 전체 표시, 다시 터치로 다음 문단');
  const tools=host.multiplayer&&window.NexusMultiplayerControls;
  if(tools){root.append(tools.chat.closest('.nexus-multiplayer-tools'));}
  for(const node of [slotButton,menuSlotButton,quickSaveButton,quickLoadButton,fullAutoButton,...root.querySelectorAll('#vn-account')])if(node)node.hidden=true;
  const nav=root.querySelector('.vn-topbar nav'),settings=document.createElement('button');settings.type='button';settings.textContent='방 설정';settings.onclick=()=>host.emit('MP_SETTINGS');nav.append(settings);
  const guard=event=>{
    if(event.target.closest?.('#vn-quick-save,#vn-quick-load,#vn-full-auto,#vn-auto,#vn-skip,#vn-next,#vn-prev,#vn-choice-back,#vn-dialogue-bypass,[data-slot-action]')){event.preventDefault();event.stopImmediatePropagation();}
  };root.addEventListener('click',guard,true);
  // Status text can wrap, disappear or grow a retry button on narrow screens.
  // Measure only when its size/visibility changes, never on the story poll.
  let layoutFrame=0;
  const lift=()=>{if(!layoutFrame)layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;root.style.setProperty('--vn-mp-status-height',`${visualStatus.hidden?0:Math.ceil(visualStatus.getBoundingClientRect().height)}px`);});};
  const resize=new ResizeObserver(lift);resize.observe(visualStatus);
  new MutationObserver(lift).observe(visualStatus,{attributes:true,attributeFilter:['hidden']});lift();
  // Draft sharing uses the existing coalesced, composition-aware parent queue.
  let composing=false;const input=$('vn-input'),share=()=>{if(multiplayerState.canWrite&&!composing)host.emit('MP_INPUT_CHANGED',{text:input.value.slice(0,12000)});};
  input.addEventListener('compositionstart',()=>{composing=true});input.addEventListener('compositionend',()=>{composing=false;share()});input.addEventListener('input',share);
  // This is the room cache's art direction. Personal style edits must not buy divergent sprites.
  state.artStyle='';
  $('vn-art-style').disabled=true;$('vn-art-style').closest('label').hidden=true;
  $('vn-style-guide').disabled=true;$('vn-style-guide').closest('label').hidden=true;
}

function multiplayerPlaybackStep(){
  return multiplayerReadStep({hasPage:Boolean(state.pages[state.cursor]),blocked:playbackBlocked(true),
    revealing:Boolean(state.reveal.timer),growing:state.pages[state.cursor]?.isGrowing,
    voicePhase:voice.phase,hasNext:state.cursor<state.pages.length-1,busy:busy(),awaiting:state.awaitingTurn,
    tailStatus:state.api?._turns().at(-1)?.status,actions:state.actions});
}
function roomRequest(action,turnId){
  const now=performance.now();
  // At most one request and no backlog. A lost acknowledgment is retried only
  // against the same current sequence, so it cannot replay a touch on a new page.
  if(roomRequestPending&&now-roomRequestAt<22000||['ready','auto'].includes(action)&&now-roomRequestAt<900)return;
  roomRequestPending=true;roomRequestAt=now;
  host.emit('MP_PLAYBACK_REQUEST',{action,turnId,expected:roomTimeline?.frame?.seq||0});
}
function alignMultiplayerPlayback(){
  if(!host.multiplayer||!roomTimeline)return true;
  const pending=roomTimeline.frame;
  if(pending&&roomTimeline.now()>=pending.startsAt)roomFrame=pending;
  if(!roomFrame)return true;
  const matches=p=>p?.turnId===roomFrame.turnId&&p.start===roomFrame.start;
  const index=matches(state.pages[state.cursor])?state.cursor:state.pages.findIndex(matches);
  // A live preview may disappear briefly during canonical import. Keep the
  // painted surface until that exact paragraph is restored, never rewind to
  // the start of the latest turn (often ten paragraphs earlier).
  if(index<0){roomAligned=false;return false;}
  roomAligned=true;
  if(state.cursor!==index){voice.stop();stopReleasedVoice();state.cursor=index;state.following=false;}
  const choices=roomFrame.phase==='choices';
  if(state.actions!==choices){state.actions=choices;state.customInputOpen=false;}
  return true;
}
function roomPageStarted(page){return roomAligned&&roomFrame?.turnId===page?.turnId&&roomFrame.start===page?.start&&roomTimeline.now()>=roomFrame.startsAt;}
function renderMultiplayerText({key,text}){
  clearTimeout(roomPaintTimer);roomPaintTimer=0;
  const reveal=state.reveal,page=state.pages[state.cursor];
  if(!roomPaintSchedule||roomPaintSchedule.text!==text)roomPaintSchedule={text,...roomGlyphSchedule(text)};
  // Reuse the original typesetter's DOM paint, but own its clock in multiplayer.
  reveal.key=key;reveal.text=text;reveal.glyphs=roomPaintSchedule.glyphs;
  function paint(){
    roomPaintTimer=0;if(!host.active||document.hidden||key!==pageKey(state.pages[state.cursor]))return;
    const now=roomTimeline.now(),started=roomPageStarted(page);
    const count=started?roomRevealCount(roomPaintSchedule,now-roomFrame.startsAt,Boolean(roomFrame.revealAt&&now>=roomFrame.revealAt)):0;
    reveal.length=count;const element=reveal.element;
    if(element&&(element.vnCount!==count||element.vnLayout!==reveal.layout)){
      element.vnCount=count;element.vnLayout=reveal.layout;renderTypeset(element,reveal.layout,count);
      textWait.progress(key,count);
    }
    $('vn-stage').classList.toggle('is-revealing',count<reveal.glyphs.length);
    if(count===reveal.glyphs.length&&started){state.readThrough=Math.max(state.readThrough,state.cursor);reveal.timer=0;}
    else {roomPaintTimer=setTimeout(paint,32);reveal.timer=roomPaintTimer;}
  }
  paint();
}
function multiplayerTouch(){
  if(!host.active||!roomAligned||!roomFrame||roomTimeline.frame?.seq!==roomFrame.seq||roomFrame.phase!=='reading')return;
  if(state.hideText)return setTextHidden(false);
  const page=state.pages[state.cursor],turn=page?.turnIndex>=0?state.api._turns()[page.turnIndex]:{status:'COMMITTED'};
  if(!page||page.isLive||page.isGrowing||turn?.status!=='COMMITTED')return;
  roomRequest(state.reveal.length<state.reveal.glyphs.length?'reveal':'advance',page.turnId);
}
function scheduleMultiplayerPlayback(){
  if(!host.active||!roomTimeline||document.hidden||roomPainting)return;
  state.playback='auto';clearTimeout(state.playbackTimer);state.playbackTimer=0;
  const latest=state.pages.at(-1),frame=roomTimeline.frame;
  if(frame&&roomTimeline.now()<frame.startsAt)state.playbackTimer=setTimeout(()=>{state.playbackTimer=0;scheduleMultiplayerPlayback();},Math.max(1,frame.startsAt-roomTimeline.now()));
  if(latest&&(!frame||frame.turnId!==latest.turnId)){
    if(roomReadyTurn!==latest.turnId){roomReadyTurn=latest.turnId;roomReadySince=performance.now();}
    const first=state.pages.find(p=>p.turnId===latest.turnId),view=assets.view(pageScene(first),first);
    const ready=view?.castStatus==='ready'&&!dialogueWait(first,view,{enabled:true,decoded:Boolean(view.portraits?.some(p=>p.id===view.speakerId&&p.url)),eventDecoded:Boolean(view.eventBackground),bypass:false});
    if(ready||performance.now()-roomReadySince>=5000)roomRequest('ready',latest.turnId);
  }
  const oldCursor=state.cursor,oldActions=state.actions,oldSeq=roomFrame?.seq;
  if(!alignMultiplayerPlayback())return;
  if(oldCursor!==state.cursor||oldActions!==state.actions||oldSeq!==roomFrame?.seq){
    roomPainting=true;try{cinema.dismiss();renderPage();}finally{roomPainting=false;}
  }
  const page=state.pages[state.cursor];if(!page)return;
  if(!frame||frame.turnId!==latest?.turnId)return;
  if(frame.seq!==roomFrame?.seq||frame.phase!=='reading'||page.isGrowing)return;
  if(page.isLive&&page===latest)return;
  const text=typeset(page.rawText||page.text).visible,schedule=roomGlyphSchedule(text);
  const end=frame.revealAt||frame.startsAt+schedule.duration;
  if(roomTimeline.now()>=end+roomHold(text)-1200){
    // Transient failures retry at a bounded rate. Active reading has one state
    // poll; no extra per-character/per-asset presentation polls are installed.
    if(roomAutoAttempt!==String(frame.seq)||performance.now()>=roomAutoRetry){roomAutoAttempt=String(frame.seq);roomAutoRetry=performance.now()+2400;roomRequest('auto',frame.turnId);}
  }
  // Derived renderer caches have no authority over saves or paid assets.
  // Bound them during long rooms; old entries can be reconstructed on demand.
  for(const cache of [state.speakerNames,state.preparedBeats,state.dialogueBypass])while(cache?.size>512)cache.delete(cache.keys().next().value);
  while(state.stageScenes.size>32)state.stageScenes.delete(state.stageScenes.keys().next().value);
}
