/* Presentation only. Reuse the existing engine elements and their handlers. */
// Explicit export allowlist: never copy settings, prompts, raw responses or saves.
window.NexusBeatDiagnostics = function(turn,index,{includeProse=false,secrets=[]}={}) {
 const redact=value=>{let s=String(value||'');for(const secret of secrets)if(typeof secret==='string'&&secret.length>=4)s=s.split(secret).join('[REDACTED]');return s.replace(/\b(?:sk-|sk_)[A-Za-z0-9_-]{8,}/g,'[REDACTED]').replace(/\bBearer\s+[^\s"'<>]+/gi,'[REDACTED]').replace(/((?:api[_ -]?key|authorization|access[_ -]?token|password)\s*["']?\s*[:=]\s*["']?)[^\s,"'<>]+/gi,'$1[REDACTED]');};
 const code=value=>{const s=redact(value);return /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(s)?s:''};
 const num=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value*100)/100:null;
 const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT[\d:.+-]+Z?$/.test(value)?value:null;
 const errors=[turn?.error,turn?.diagnostic,turn?.imageError,turn?.imageDiagnostic?.code].filter(x=>typeof x==='string').flatMap(x=>redact(x).match(/\b(?:API_|CORTEX_|IMAGE_|HTTP_|VERDICT_|OCCURRENCE_)[A-Z0-9_]{1,64}\b/g)||[]);
 const requests=(Array.isArray(turn?.apiLog)?turn.apiLog:[]).slice(-100).map(row=>({model:code(row.model),provider:code(row.provider),role:code(row.role),reasoning:code(row.reasoningEffort),status:code(row.status),startedAt:date(row.startedAt),httpStatus:num(row.httpStatus),headersMs:num(row.headersMs),firstDeltaMs:num(row.firstDeltaMs),totalMs:num(row.totalMs),inputChars:num(row.inputChars),stream:row.stream===true}));
 const report={schema:'DANCHEONG_BEAT_DIAGNOSTIC_V1',exportedAt:new Date().toISOString(),beat:index+1,status:code(turn?.status),proseIncluded:includeProse===true,requests,errors:[...new Set(errors)],image:{status:code(turn?.imageStatus),model:code(turn?.imageModel),httpStatus:num(turn?.imageDiagnostic?.status),referenceCount:num(turn?.imageReferenceCount),references:(Array.isArray(turn?.imageReferenceCharacters)?turn.imageReferenceCharacters:[]).slice(0,16).map((r,i)=>({index:i+1,name:redact(r?.name).slice(0,160)}))},timing:{stage:code(turn?.metrics?.lifecycle?.stage)}};
 if(includeProse===true)report.prose=redact(turn?.text).slice(0,200000);
 return report;
};
window.openNexusBeatDiagnostics = function(api,turn,index,opener) {
 document.getElementById('nexusBeatDiagnosticDialog')?.remove();
 const dialog=document.createElement('dialog');dialog.id='nexusBeatDiagnosticDialog';dialog.className='nexus-beat-diagnostic-dialog';dialog.setAttribute('aria-labelledby','nexusBeatDiagnosticTitle');
 dialog.innerHTML='<form method="dialog"><header><div><small>비트 진단</small><h2 id="nexusBeatDiagnosticTitle"></h2></div><button class="diagnostic-close" aria-label="진단 창 닫기" value="close">×</button></header><p>이 비트의 오류 코드, 요청 시간, 모델과 이미지 참조 정보를 JSON 파일로 내려받습니다. 서버로 자동 전송하지 않습니다.</p><label><input type="checkbox" name="includeProse"> 이 비트 본문 포함 <span>선택</span></label><p class="diagnostic-privacy">기본은 본문 제외입니다. API 키·요청 프롬프트·다른 비트는 제외합니다. 공유 전에 파일 내용을 확인해 주세요.</p><footer><span class="diagnostic-result" role="status"></span><button type="button" class="diagnostic-download">진단 내보내기</button></footer></form>';
 dialog.querySelector('h2').textContent=`${index+1}비트 진단 내보내기`;
 dialog.querySelector('.diagnostic-download').onclick=()=>{
  const result=dialog.querySelector('.diagnostic-result');
  try{const report=window.NexusBeatDiagnostics(turn,index,{includeProse:dialog.querySelector('input').checked,secrets:[api._settings?.().apiKey,window.NexusCortexTextApiKey,window.NexusCortexImageApiKey]}),url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`dancheong-beat-${String(index+1).padStart(3,'0')}-diagnostic.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);result.textContent='다운로드를 시작했습니다.';}catch{result.textContent='파일 준비에 실패했습니다. 다시 시도해 주세요.';}
 };
 dialog.addEventListener('close',()=>{dialog.remove();if(opener?.isConnected)opener.focus()},{once:true});document.body.append(dialog);dialog.showModal();
};
window.NexusOnlyLiveMutations=records=>records.length>0&&records.every(record=>record.target.closest?.('.nexus-live-turn')||([...record.addedNodes,...record.removedNodes].length>0&&[...record.addedNodes,...record.removedNodes].every(n=>n.nodeType===1&&n.matches('.nexus-live-turn'))));
window.createNexusMultiplayerTools = function(emit) {
  const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n};
  const tools=make('div','nexus-multiplayer-tools'),status=make('div','nexus-turn-chip'),tag=make('span','nexus-turn-tag','함께 쓰기'),label=make('span','nexus-turn-label','공유 기록을 확인하는 중…');
  status.append(tag,label);status.setAttribute('role','status');
  const connection=make('span','nexus-connection-label');connection.hidden=true;status.append(connection);
  const dock=make('div','nexus-chat-dock'),stack=make('div','nexus-chat-bubbles'),chat=make('button','nexus-room-chat-button');
  chat.type='button';chat.setAttribute('aria-haspopup','dialog');chat.setAttribute('aria-expanded','false');chat.setAttribute('aria-label','참여자 대화 열기');
  chat.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z"/><path d="M7 9h8M7 13h5"/></svg><span>대화</span>';
  const badge=make('span','nexus-chat-unread');badge.hidden=true;chat.append(badge);
  stack.setAttribute('aria-live','polite');stack.setAttribute('aria-relevant','additions');
  dock.append(stack,chat);tools.append(status,dock);document.querySelector('.nexus-reading-paper-frame')?.append(tools);
  let open=false,lastSeq=0;const timers=new Map();
  const remove=node=>{const ids=timers.get(node)||[];ids.forEach(clearTimeout);timers.delete(node);node.remove()};
  const clear=()=>{for(const node of [...timers.keys()])remove(node)};
  const openChat=()=>{clear();emit('MP_CHAT')};chat.onclick=openChat;
  const preview=messages=>{
    const oldPositions=new Map([...stack.children].map(n=>[n,n.getBoundingClientRect().top]));
    for(const m of Array.isArray(messages)?messages:[]){
      if(!Number.isSafeInteger(m.seq)||m.seq<=lastSeq)continue;lastSeq=m.seq;
      if(open||m.isSelf||document.visibilityState==='hidden')continue;
      const node=make('button','nexus-chat-bubble');node.type='button';node.setAttribute('aria-label',`${String(m.name||'참여자').slice(0,160)}의 메시지 · 대화 열기`);
      node.append(make('strong','',String(m.name||'참여자').slice(0,160)),make('span','',String(m.body||'').slice(0,1000)));node.onclick=openChat;stack.append(node);
      const fade=setTimeout(()=>{node.classList.add('is-leaving');timers.get(node)?.push(setTimeout(()=>remove(node),700))},10000);timers.set(node,[fade]);
      while(stack.children.length>4)remove(stack.firstElementChild);
    }
    if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)for(const [node,top] of oldPositions){if(node.isConnected){const delta=top-node.getBoundingClientRect().top;if(delta&&node.animate)node.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:220,easing:'ease-out'})}}
  };
  const update=data=>{
    const text=String(data.label||'공유 이야기');if(label.textContent!==text)label.textContent=text;status.title=text;
    status.classList.toggle('is-own-turn',Boolean(data.canWrite));tag.textContent=data.canWrite?'YOUR TURN':'MULTIPLAYER';
    const count=Math.max(0,Math.floor(Number(data.unread)||0));badge.hidden=!count;badge.textContent=count>99?'99+':String(count);chat.setAttribute('aria-label',count?`참여자 대화 열기 · 읽지 않은 메시지 ${count}개`:'참여자 대화 열기');
  };
  const updateConnection=data=>{const text=String(data.label||'');connection.hidden=!text;if(connection.textContent!==text)connection.textContent=text;connection.dataset.phase=String(data.phase||'');};
  const setOpen=value=>{open=Boolean(value);chat.setAttribute('aria-expanded',String(open));if(open)clear()};
  const onVisibility=()=>{if(document.visibilityState==='hidden')clear()};document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('pagehide',clear);
  return {chat,label,update,updateConnection,preview,setOpen,clear};
};
window.createNexusMultiplayerInput = function(emit){
 const input=document.getElementById('input'),box=document.createElement('section'),heading=document.createElement('div'),body=document.createElement('div'),notice=document.createElement('div');
 box.className='nexus-remote-input';box.hidden=true;heading.className='nexus-remote-input-heading';body.className='nexus-remote-input-body';body.tabIndex=0;box.append(heading,body);input.before(box);
 notice.className='nexus-input-sharing-notice';notice.textContent='입력 중인 내용이 참가자에게 공유됩니다.';notice.hidden=true;input.after(notice);
 let state={},draft=null,composing=false;
 const share=()=>{if(state.canWrite&&!composing)emit('MP_INPUT_CHANGED',{text:input.value.slice(0,12000)})};
 const paint=()=>{const watch=Boolean(state.watch);box.hidden=!watch;input.hidden=watch;notice.hidden=!state.canWrite;
  if(!watch)return;const title=`${state.name||'참가자'} · 작성 중 (전송 전)`;if(heading.textContent!==title)heading.textContent=title;
  const text=draft?.revision===state.revision&&draft?.memberId===state.memberId?String(draft.text||''):'';
  if(body.textContent!==(text||'입력을 기다리는 중…')){const atEnd=body.scrollHeight-body.scrollTop-body.clientHeight<4;body.textContent=text||'입력을 기다리는 중…';if(atEnd)body.scrollTop=body.scrollHeight}body.classList.toggle('is-empty',!text);
 };
 input.addEventListener('compositionstart',()=>{composing=true});input.addEventListener('compositionend',()=>{composing=false;share()});input.addEventListener('input',share);
 return {update(value){const changed=state.canWrite!==value.canWrite||state.revision!==value.revision;state=value;paint();if(changed)share()},receive(value){draft=value;paint()}};
};
// Multiplayer transports only these already-painted public blocks, never model
// buffers, annotations, prompts, package profiles or state. No remote HTML/URLs.
window.createNexusMultiplayerLive = function(api) {
  let current=null,article=null,lastSeq=0,lastId='',lastBlocks=[],lastPacket=null,frame=0,lastTick=0,arrived=0,credit=0;
  const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n};
  const transaction=fn=>window.NexusReaderScroll?window.NexusReaderScroll.transaction(fn):fn();
  const stream=fn=>window.NexusReaderScroll?.stream?window.NexusReaderScroll.stream(fn):transaction(fn);
  const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;lastTick=0;credit=0};
  const clear=()=>{stop();if(!article&&!current)return;return transaction(()=>{article?.remove();article=null;current=null;lastSeq=0;lastId='';lastBlocks=[];lastPacket=null})};
  const capture=index=>{
    const turn=api._turns()[index],node=document.querySelector(`#feed > article.turn[data-turn-index="${index}"]`),prose=node?.querySelector(':scope > .prose');
    if(!turn||!prose||turn.status==='REJECTED')return null;
    const blocks=[];
    for(const n of prose.children){
      if(n.hidden||n.getAttribute('aria-hidden')==='true')continue;
      if(n.matches('p.nexus-narration'))blocks.push({kind:'text',text:n.textContent,start:+n.dataset.readerStart||0,end:+n.dataset.readerEnd||0});
      else if(n.matches('.nexus-dialogue-row')){const p=n.querySelector('.nexus-dialogue-body > p');if(p)blocks.push({kind:'dialogue',text:p.textContent,name:n.querySelector('.nexus-dialogue-head strong')?.textContent||'',role:n.querySelector('.nexus-dialogue-head span')?.textContent||'',start:+p.dataset.readerStart||0,end:+p.dataset.readerEnd||0});}
      else if(n.matches('figure.speaker-beat-image')&&n.dataset.state==='READY'&&n.querySelector('img'))blocks.push({kind:'portrait',text:'',name:n.querySelector('figcaption strong')?.textContent||'',portrait:n.dataset.speakerPortrait||''});
    }
    const choice=node.querySelector(':scope > .choice');
    const visualText=typeof turn.displayText==='string'?turn.displayText:'';
    const visual=window.NexusVNHostBridge?.active?{text:visualText.slice(0,24000),annotations:(turn.dialogueAnnotations||[]).filter(a=>!a.bindingInvalid&&typeof a.speakerName==='string'&&visualText.slice(a.offset,a.offset+String(a.quoteText||'').length)===a.quoteText).map(a=>({offset:a.offset,quoteText:a.quoteText,speakerName:a.speakerName,...(a.characterId&&/^WRITER_CHARACTER_(?:ALIAS|REF)$/u.test(a.source||'')&&a.bindingVersion===2?{speakerRef:window.CortexTurnExperience.writerSpeakerRef(a.characterId)}:{}),...(['PHYSICAL','REMOTE'].includes(a.presence)?{presence:a.presence}:{}),...(a.quoteKind==='NON_SPEECH'?{quoteKind:'NON_SPEECH'}:{})}))}:null;
    return {id:String(turn.id),input:choice&&!choice.hidden?choice.textContent:'',blocks,...(visual?{visual}:{})};
  };
  const blockNode=b=>{
    let n,p;
    if(b.kind==='portrait'){
      n=make('figure','turn-image-panel character-first-appearance speaker-beat-image');n.style.aspectRatio='16 / 9';n.dataset.speakerPortrait=b.portrait||'';
      const asset=window.NexusCortexPrimaryMedia?.get(b.portrait);
      if(asset?.dataUrl){const img=make('img','');img.src=asset.dataUrl;img.alt=b.name;img.width=1600;img.height=900;n.append(img)}
      else n.setAttribute('aria-label','인물 이미지 준비 중');
      const caption=make('figcaption','turn-image-caption');caption.append(make('strong','',b.name));n.append(caption);
    }else if(b.kind==='dialogue'){
      n=make('div','nexus-dialogue-row');n.append(make('div','nexus-dialogue-avatar',String(b.name||'·').slice(0,1)));
      const body=make('div','nexus-dialogue-body'),head=make('div','nexus-dialogue-head');head.append(make('strong','',b.name));if(b.role)head.append(make('span','',b.role));p=make('p','',b.text);body.append(head,p);n.append(body);
    }else {n=p=make('p','nexus-narration',b.text)}
    if(p){p.dataset.readerStart=String(b.start||0);p.dataset.readerEnd=String(b.end||0)}
    return n;
  };
  const textNode=n=>n?.matches('p')?n:n?.querySelector('.nexus-dialogue-body > p');
  const sameShape=(a,b)=>a&&a.kind===b.kind&&a.name===b.name&&a.role===b.role&&a.portrait===b.portrait&&a.start===b.start;
  const paint=budget=>{
    if(!lastPacket||!article?.isConnected)return false;
    let pending=false;
    stream(()=>{
      const prose=article.querySelector('.prose');let i=0;
      for(const target of lastPacket.blocks){
        const prior=lastBlocks[i],old=prose.children[i],same=sameShape(prior,target);
        if(same&&old&&prior.text===target.text&&prior.end===target.end){i++;continue}
        const prefix=same&&target.text.startsWith(prior.text)?prior.text:'';
        const available=Math.max(0,Math.floor(budget));let end=prior&&(!same||!target.text.startsWith(prior.text))?target.text.length:Math.min(target.text.length,prefix.length+available);
        // Do not split an emoji/surrogate pair across frames.
        if(end<target.text.length&&end>0&&/[\uD800-\uDBFF]/.test(target.text[end-1]))end++;
        const b={...target,text:target.text.slice(0,end),end:Math.min(target.end||0,(target.start||0)+end)};
        if(target.kind==='portrait')Object.assign(b,target);
        budget-=Math.max(0,b.text.length-prefix.length);
        if(!same||!old){const next=blockNode(b);if(old)old.replaceWith(next);else prose.append(next)}
        else {const p=textNode(old);if(p){if(p.textContent!==b.text){if(p.firstChild?.nodeType===3)p.firstChild.data=b.text;else p.textContent=b.text}if(p.dataset.readerEnd!==String(b.end||0))p.dataset.readerEnd=String(b.end||0)}}
        lastBlocks[i++]=b;
        if(b.text!==target.text){pending=true;break}
      }
      while(prose.children.length>i)prose.lastElementChild.remove();lastBlocks.length=i;
      current={id:lastPacket.id,status:'STREAMING',displayText:lastBlocks.map(b=>b.text||'').join('\n\n')};
    });
    return pending;
  };
  const instant=()=>typeof requestAnimationFrame!=='function'||api._settings?.().typingSpeed==='instant'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const tick=now=>{
    frame=0;if(!lastPacket||document.visibilityState==='hidden')return;
    if(lastTick&&now-lastTick<32){frame=requestAnimationFrame(tick);return}
    const elapsed=lastTick?Math.min(now-lastTick,100):32;lastTick=now;
    const remaining=lastPacket.blocks.reduce((n,b,i)=>n+Math.max(0,b.text.length-(lastBlocks[i]?.text.length||0)),0);
    credit+=elapsed*Math.max(.045,remaining/650);
    const budget=instant()||now-arrived>1600?Infinity:Math.floor(credit);credit-=Math.floor(credit);
    if(paint(budget))frame=requestAnimationFrame(tick);else {lastTick=0;credit=0}
  };
  const apply=packet=>{
    if(!packet||!Array.isArray(packet.blocks)||packet.blocks.length>512||typeof packet.id!=='string'||!Number.isSafeInteger(packet.seq))return;
    if(api._turns().some(t=>t.id===packet.id))return; // A committed beat always wins.
    if(lastId===packet.id&&packet.seq<=lastSeq&&article?.isConnected)return true;
    transaction(()=>{
      if(!article?.isConnected||lastId!==packet.id){article?.remove();article=make('article','story-turn nexus-live-turn');article.dataset.turnId=packet.id;
        article.append(make('div','turn-meta','함께 읽는 중'),make('div','choice user-choice',packet.input||''),make('div','prose'));document.getElementById('feed').append(article);lastBlocks=[];}
      const choice=article.querySelector('.choice');choice.hidden=!packet.input;if(choice.textContent!==(packet.input||''))choice.textContent=packet.input||'';
      const label=packet.blocks.some(b=>b.text)?'함께 읽는 중':'입력 전송 완료 · 첫 문단 준비 중',meta=article.querySelector('.turn-meta');if(meta.textContent!==label)meta.textContent=label;
      lastPacket=packet;lastId=packet.id;lastSeq=packet.seq;arrived=performance.now();
    });
    if(instant()){paint(Infinity);stop()}else if(!frame){paint(1);frame=requestAnimationFrame(tick)}
    return true;
  };
  // Replace in the same layout transaction, carrying decoded portraits into the
  // committed article. No wait for the presentation queue and no canonical writes.
  const handoff=work=>transaction(()=>{
    const portraits=new Map([...(article?.querySelectorAll('figure[data-speaker-portrait]')||[])].map(n=>[n.dataset.speakerPortrait,n.querySelector('img')]));
    const result=work();
    const committed=[...document.querySelectorAll('#feed article:not(.nexus-live-turn)')].find(n=>n.dataset.turnId===lastId);
    for(const n of committed?.querySelectorAll('figure[data-speaker-portrait]')||[]){const img=portraits.get(n.dataset.speakerPortrait),next=n.querySelector('img');if(img&&next&&img.src===next.src){next.replaceWith(img);portraits.delete(n.dataset.speakerPortrait)}}
    clear();return result;
  });
  window.addEventListener('nexus-cortex-primary-media',()=>{for(const n of article?.querySelectorAll('figure[data-speaker-portrait]')||[]){const asset=window.NexusCortexPrimaryMedia?.get(n.dataset.speakerPortrait);if(asset?.dataUrl&&!n.querySelector('img')){const img=make('img','');img.src=asset.dataUrl;img.width=1600;img.height=900;img.alt=n.querySelector('strong')?.textContent||'';n.prepend(img);n.removeAttribute('aria-label')}}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stop();else if(lastPacket&&!frame)frame=requestAnimationFrame(tick)});
  const reconcile=()=>{if(lastPacket&&!article?.isConnected)apply(lastPacket)};
  return {capture,apply,clear,handoff,reconcile,get current(){return current}};
};
// Quote identity is evidence-bound; proximity and alternating speakers are not evidence.
window.NexusDialogue = (() => {
  function scan(source) {
    const pairs = { '“':'”', '‘':'’', '「':'」', '『':'』', '"':'"', "'":"'" }, found = [];
    for (let start=0;start<source.length;start++) {
      const opening=source[start], close=pairs[opening];
      if (!close || source[start-1]==='\\' || (opening==="'" && /[\p{L}\p{N}]/u.test(source[start-1]||''))) continue;
      let end=start+1; while(end<source.length && (source[end]!==close || source[end-1]==='\\')) end++;
      const closed=end<source.length; found.push({0:source.slice(start,closed?end+1:end),index:start,closed});start=end;
    }
    return found;
  }
  const normalize = value => String(value || '').replace(/\s+/gu, ' ').trim();
  const validLabel = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100 && !/[<>⟦⟧|\r\n]/u.test(value) && !/^(?:NPC_|CHARACTER_|sha256:)/iu.test(value.trim());
  function align(source, annotations, quotes, { streaming = false } = {}) {
    const aligned = new Map(), used = new Set();
    const pending = [], conflicts = new Set();
    const sameQuote = (q, quote) => {
      const visible = normalize(q[0]);
      return !quote || visible === quote || (!q.closed && quote.startsWith(visible));
    };
    // Reserve exact anchors before considering legacy/edited-text relocation.
    // A later, identical utterance must never borrow the first speaker's quote.
    for (const annotation of annotations) {
      if (annotation.bindingInvalid) continue;
      const offset = Number(annotation.offset), quote = normalize(annotation.quoteText);
      const exact = quotes.filter(q => Number.isInteger(offset) && offset >= 0 && offset <= source.length && Math.abs(q.index - offset) <= 16 && !source.slice(Math.min(offset, q.index), Math.max(offset, q.index)).trim() && sameQuote(q, quote));
      if (exact.length === 1) {
        const start = exact[0].index;
        if (used.has(start)) { aligned.delete(start); conflicts.add(start); }
        else { aligned.set(start, annotation); used.add(start); }
      } else pending.push(annotation);
    }
    for (const annotation of pending) {
      const offset = Number(annotation.offset), quote = normalize(annotation.quoteText);
      // Typewriter display can trail the decoded writer buffer by many paragraphs.
      if (!quote || (streaming && (!Number.isInteger(offset) || offset >= source.length))) continue;
      let candidates = quotes.filter(q => !used.has(q.index) && !conflicts.has(q.index) && sameQuote(q, quote));
      if (typeof annotation.prefixText === 'string') {
        const prefix = normalize(annotation.prefixText);
        candidates = candidates.filter(q => {
          const before = normalize(source.slice(Math.max(0, q.index - 100), q.index));
          return prefix ? before.endsWith(prefix) : !before;
        });
      }
      if (candidates.length === 1) { aligned.set(candidates[0].index, annotation); used.add(candidates[0].index); }
    }
    return aligned;
  }
  function written(before, after) {
    return /(?:문구|글귀|메모|쪽지|편지|팻말|간판|자막|문서|신문|공지|낙서|화면)[^.!?。！？]{0,35}(?:적혀|쓰여|인쇄|새겨|표시|문구|알림)/u.test(before)
      || /^(?:\s|[,，])*(?:이?라는\s*(?:문구|글귀|문장|글자|메모|쪽지|내용|표시|기록|말)|라고\s*(?:적혀|쓰여|적힌|쓰인|표시))/u.test(after)
      || /(?:속으로|마음속으로|생각했다|떠올렸다)\s*[.:]?\s*$/u.test(before);
  }
  function resolve(source, annotations, rows, allowName, options = {}) {
    const quotes = scan(source), narration = quotes.reduceRight((text,q)=>text.slice(0,q.index)+' '+text.slice(q.index+q[0].length),source), roster = [...rows];
    const addName = a => { const name = String(a.speakerName || '').trim(); if (!validLabel(a.speakerName) || (a.bindingVersion !== 2 && !narration.includes(name)) || !allowName(name) || roster.some(row => row.names.includes(name))) return; roster.push({ person: {}, visible: { name, role: '' }, names: [name] }); };
    for (const a of annotations) if (!a.characterId && a.source === 'WRITER_PUBLIC_NAME') addName(a);
    const aligned = align(source, annotations, quotes, options);
    return quotes.map((q, index) => {
      const start = q.index, end = start + q[0].length, prior = index ? quotes[index - 1].index + quotes[index - 1][0].length : 0;
      const before = source.slice(Math.max(prior, start - 220), start), after = source.slice(end, Math.min(quotes[index + 1]?.index ?? source.length, end + 120));
      const annotation = aligned.get(start), authored = annotation?.bindingVersion === 2 && /^WRITER_(?:CHARACTER_REF|CHARACTER_ALIAS|PUBLIC_NAME)$/u.test(annotation?.source || '');
      const nonSpeech = annotation?.quoteKind === 'NON_SPEECH' || annotation?.source === 'WRITER_NON_SPEECH_QUOTE' || (!authored && written(before, after));
      const id = String(annotation?.characterId || ''), name = normalize(annotation?.speakerName);
      const matching = roster.filter(row => id ? [row.person?.id, row.person?.ref, row.visible?.id].some(v => v != null && String(v) === id) && (!name || row.names.some(value=>normalize(value)===name)) : name && row.names.some(value => normalize(value) === name));
      const bound = matching.length === 1 ? matching[0] : null;
      // The explicit public label can paint immediately, before the committed
      // character registry catches up. This fallback grants NO package identity,
      // profile or image access; image selection still requires the public roster.
      const literal = authored && validLabel(annotation.speakerName) && allowName(name)
        ? { person: {}, visible: { name, role: '', referenceMode: 'NONE' }, names: [name] } : null;
      // A roster match supplies optional media/profile identity, never a new
      // speaker label. Preserve the name written with this exact utterance.
      const explicit = bound && authored && validLabel(annotation.speakerName) ? {...bound,visible:{...bound.visible,name:annotation.speakerName.trim()}} : bound || literal;
      const blocked = Boolean(annotation && (id || name || annotation.source === 'WRITER_UNRESOLVED') && !explicit);
      const row = nonSpeech || blocked ? null : explicit;
      return { start, end, text: q[0], row, nonSpeech, evidence: row ? 'WRITER_QUOTE_BINDING' : 'UNRESOLVED' };
    });
  }
  return { resolve, align, scan };
})();

// Reader-owned follow state. Rendering, images and engine scroll requests cannot re-enable it.
window.createNexusReaderScroll = function(story, feed, jump, current) {
  let following = true, anchor = null, frame = 0, depth = 0, pointer = null, adjusting = false, intentUntil = 0, lastDisplay = '', lastTurn = '';
  let ownedScrollTop = null, submittedFrom = null;
  const writeScroll = top => { story.scrollTop = top; ownedScrollTop = story.scrollTop; };
  const viewport = () => story.getBoundingClientRect();
  const pieces = () => [...feed.querySelectorAll('[data-reader-start]')];
  const rangeAt = (node, offset) => { const text = node.firstChild; if (!text || text.nodeType !== 3) return null; const range = document.createRange(); range.setStart(text, Math.min(offset, text.length)); range.setEnd(text, Math.min(offset + 1, text.length)); return range; };
  function capture() {
    const top = viewport().top + 2, nodes = pieces(), node = nodes.find(n => n.getBoundingClientRect().bottom > top);
    if (!node) return { scrollTop: story.scrollTop };
    let offset = 0, rect = node.getBoundingClientRect();
    // Keep the actual line at the viewport edge, not a height percentage of a changing paragraph.
    if (rect.top < top && typeof document.createRange === 'function') {
      let lo = 0, hi = (node.textContent || '').length;
      while (lo < hi) { const mid = (lo + hi) >> 1, r = rangeAt(node, mid); if (!r?.getBoundingClientRect) break; if (r.getBoundingClientRect().bottom <= top) lo = mid + 1; else hi = mid; }
      offset = lo;
    }
    // Capture and restore the same glyph box, including paragraphs below the viewport edge.
    // Mixing a paragraph box with its first glyph box accumulates a font-dependent 1px drift.
    const measured = rangeAt(node, offset); if (measured?.getBoundingClientRect) rect = measured.getBoundingClientRect();
    return { turn: node.closest('[data-turn-id]')?.dataset.turnId, offset: +node.dataset.readerStart + offset, y: rect.top - viewport().top, scrollTop: story.scrollTop };
  }
  function restore() {
    if (!anchor) return;
    const node = pieces().find(n => n.closest('[data-turn-id]')?.dataset.turnId === anchor.turn && +n.dataset.readerStart <= anchor.offset && +n.dataset.readerEnd > anchor.offset);
    adjusting = true;
    if (node) { const r = rangeAt(node, anchor.offset - +node.dataset.readerStart), rect = r?.getBoundingClientRect ? r.getBoundingClientRect() : node.getBoundingClientRect(), delta = rect.top - viewport().top - anchor.y; if(Math.abs(delta)>.75)writeScroll(story.scrollTop + delta); }
    else if(Math.abs(story.scrollTop-anchor.scrollTop)>.75)writeScroll(anchor.scrollTop);
    adjusting = false;
  }
  const syncJump = () => {
    const atEnd = Math.max(0, story.scrollHeight - story.scrollTop - story.clientHeight) <= 2;
    jump.hidden = atEnd;
    if (jump.parentElement?.classList.contains('nexus-jump-dock')) jump.parentElement.hidden = atEnd;
    jump.setAttribute('aria-label', following ? '본문 맨 아래로' : '최신 본문으로 · 자동 따라가기 재개');
  };
  function settle() {
    frame = 0; const turn = current(), id = String(turn?.id || ''), text = String(turn?.displayText ?? turn?.text ?? ''), running = turn?.status === 'STREAMING' || turn?.displayTyping === true;
    const grew = id !== lastTurn ? Boolean(text) : text.length > lastDisplay.length && text.startsWith(lastDisplay);
    // Submission mounts the input card before any prose arrives. Follow that layout too,
    // but never let a delayed submission override a subsequent manual scroll.
    if (following && (submittedFrom !== null || (running && (grew || !text)))) { adjusting = true; writeScroll(Math.max(0,story.scrollHeight-story.clientHeight)); adjusting = false; }
    else restore();
    if (submittedFrom !== null && id !== submittedFrom) submittedFrom = null;
    lastDisplay = text; lastTurn = id; anchor = following&&running ? {scrollTop:story.scrollTop} : capture(); syncJump();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(settle); }
  function pause() { following = false; submittedFrom = null; ownedScrollTop = null; intentUntil = performance.now() + 1200; anchor = capture(); syncJump(); }
  const begin = () => { if (!depth++) { if(frame){cancelAnimationFrame(frame);frame=0} anchor = capture(); } };
  const end = () => { depth = Math.max(0, depth - 1); schedule(); };
  const transaction = work => { begin(); try { return work(); } finally { end(); } };
  // Live typing at the bottom needs only a tail scroll, not a whole-feed glyph
  // search + forced layout on every animation frame. Manual reading keeps anchors.
  const stream = work => { if(!following)return transaction(work);depth++;try{return work()}finally{end()} };
  story.addEventListener('wheel', event => { if (event.deltaY || event.deltaX) pause(); }, { passive: true });
  story.addEventListener('touchstart', event => { const p = event.touches[0]; pointer = p ? { x: p.clientX, y: p.clientY } : null; }, { passive: true });
  story.addEventListener('touchmove', event => { const p = event.touches[0]; if (pointer && p && Math.hypot(p.clientX - pointer.x, p.clientY - pointer.y) > 3) pause(); }, { passive: true });
  story.addEventListener('pointerdown', event => { pointer = { x: event.clientX, y: event.clientY }; if (event.clientX >= viewport().right - 16) pause(); }, { passive: true });
  story.addEventListener('pointermove', event => { if (event.buttons && pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 3) pause(); }, { passive: true });
  story.addEventListener('keydown', event => { if (!event.target.closest('input,textarea,select,[contenteditable="true"]') && ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) pause(); });
  story.addEventListener('scroll', () => {
    const owned = ownedScrollTop !== null && Math.abs(story.scrollTop-ownedScrollTop)<.75;
    ownedScrollTop = null;
    const userScroll = !owned && !adjusting && !depth && performance.now() < intentUntil;
    if (userScroll) {
      // Keep touch momentum eligible; layout/commit transactions never re-enable follow.
      intentUntil = performance.now() + 1200;
      if (Math.max(0, story.scrollHeight - story.scrollTop - story.clientHeight) <= 2) following = true;
    }
    if (!adjusting && !depth && (!frame || userScroll)) anchor = capture();
    syncJump();
  }, { passive: true });
  const followEnd = (options = {}) => { following = true; intentUntil = 0; writeScroll(Math.max(0,story.scrollHeight-story.clientHeight)); anchor = capture(); const t = current(); lastTurn = String(t?.id || ''); lastDisplay = String(t?.displayText ?? t?.text ?? ''); submittedFrom = options.submitted === true ? lastTurn : null; syncJump(); schedule(); };
  jump.onclick = followEnd;
  new MutationObserver(schedule).observe(feed, { childList: true, subtree: true, characterData: true });
  if (typeof ResizeObserver === 'function') { const observer = new ResizeObserver(schedule); observer.observe(story); observer.observe(feed); }
  feed.addEventListener('load', schedule, true); window.addEventListener('resize', schedule);
  const controller = { capture, restoreAnchor(value){if(!value?.turn)return;following=false;submittedFrom=null;anchor={...value,y:2,scrollTop:story.scrollTop};restore();syncJump()}, transaction, stream, schedule, pause, followEnd, reanchor(){anchor=capture();syncJump()}, get following() { return following; } };
  anchor = capture(); syncJump(); return controller;
};
// Prime only the first three public image resources that the reader will show.
// The entire entry budget, including the local asset lookup, is bounded by six seconds.
window.primeNexusReaderImages = async function(api,prepareMedia,{waitMs=6000}={}) {
  let timer;const scenario=api._scenario();
  const work=async()=>{
    await prepareMedia();
    if(api._scenario()!==scenario)return;
    const sc=api._scenario(),experience=window.CortexTurnExperience,turns=api._turns(),sources=[];
    const rows=[sc.protagonist,...(sc.characters||[])].filter(Boolean).map(person=>({person,visible:experience.publicCharacter(person,sc)})).filter(r=>r.visible).map(r=>({...r,names:[r.visible.name,...(r.visible.aliases||[])]}));
    const add=url=>{if(url&&sources.length<3&&!sources.includes(url))sources.push(url)};
    const portrait=row=>row?.visible.referenceMode==='PRIMARY'?window.NexusCortexPrimaryMedia?.get(String(row.person.id))?.dataUrl:null;
    if(!turns.length)add(portrait(rows.find(r=>r.person.id===sc.protagonist?.id)));
    for(const turn of turns.slice(-5)){
      if(sources.length===3)break;
      const source=String(turn.text||''),records=window.NexusDialogue.resolve(source,turn.dialogueAnnotations||[],rows,()=>false,{streaming:turn.status==='STREAMING'});
      for(const record of records)if(!record.nonSpeech&&record.row?.person.id!==sc.protagonist?.id)add(portrait(record.row));
      add(turn.imageUrl);
    }
    const cache=Object.assign(new Map(),{scope:String(sc.runtime?.storyId)+'|'+String(sc.runtime?.mediaGeneration||'')});window.NexusCortexPrimedImages=cache;
    await Promise.all(sources.map(url=>new Promise(resolve=>{const img=new Image();let done=false;const finish=ok=>{if(done)return;done=true;img.onload=img.onerror=null;if(ok)cache.set(url,{width:img.naturalWidth,height:img.naturalHeight});resolve()};img.onload=()=>{if(img.decode)img.decode().then(()=>finish(true),()=>finish(img.naturalWidth>0));else finish(true)};img.onerror=()=>finish(false);img.src=url;if(img.complete&&img.naturalWidth>0)img.onload()})));
  };
  try{await Promise.race([work(),new Promise(resolve=>{timer=setTimeout(resolve,waitMs)})]);}catch{/* Artwork is optional; a readable restored story is not. */}finally{clearTimeout(timer)}
};
// Presentation gate only: generation, auditing and canonical text keep running.
window.createNexusSpeakerMedia = function(api,rows,{waitMs=6000}={}) {
  let version=0,scope='',states=new WeakMap(),opening=null;
  const decoded=new Map();
  const notify=()=>{version++;window.dispatchEvent(new CustomEvent('cortex-turn-display'));};
  const checkScope=()=>{const sc=api._scenario(),key=String(sc.runtime?.storyId)+'|'+String(sc.runtime?.mediaGeneration||'');if(key!==scope){scope=key;states=new WeakMap();opening=null;decoded.clear();if(window.NexusCortexPrimaryMedia?.scope&&window.NexusCortexPrimaryMedia.scope!==key)window.NexusCortexPrimaryMedia=new Map();}};
  const load=asset=>{
    if(decoded.has(asset.dataUrl))return decoded.get(asset.dataUrl);
    const primed=window.NexusCortexPrimedImages;if(primed?.scope===scope&&primed.has(asset.dataUrl))return Promise.resolve(primed.get(asset.dataUrl));
    const task=new Promise(resolve=>{const img=new Image();let ended=false;const done=ok=>{if(ended)return;ended=true;clearTimeout(timer);img.onload=img.onerror=null;resolve(ok?{width:img.naturalWidth,height:img.naturalHeight}:null);};const timer=setTimeout(()=>done(false),waitMs);img.onload=()=>{if(img.decode)img.decode().then(()=>done(true),()=>done(img.naturalWidth>0));else done(true)};img.onerror=()=>done(false);img.src=asset.dataUrl;if(img.complete&&img.naturalWidth>0)img.onload();});
    decoded.set(asset.dataUrl,task);if(decoded.size>16)decoded.delete(decoded.keys().next().value);void task.then(result=>{if(!result&&decoded.get(asset.dataUrl)===task)decoded.delete(asset.dataUrl)});return task;
  };
  const start=(row,offset)=>{
    const entry={row,offset,status:'PENDING',figure:null,deadline:performance.now()+waitMs,asset:null};
    const finish=(status,asset,dimensions)=>{if(entry.status!=='PENDING')return;clearTimeout(timer);entry.status=status;entry.asset=asset;entry.dimensions=dimensions;entry.readyAt=performance.now()+20;notify();};
    const timer=setTimeout(()=>finish('TIMED_OUT'),waitMs);
    const find=()=>window.NexusCortexPrimaryMedia?.get(String(row.person.id));
    const prepare=async()=>{let asset=find();if(!asset){await window.NexusCortexPackageMediaReady?.();asset=find();}if(!asset?.dataUrl)return finish('MISSING');const dimensions=await load(asset);finish(dimensions?'READY':'FAILED',dimensions?asset:null,dimensions);};
    void prepare().catch(()=>finish('FAILED'));return entry;
  };
  const entries=(turn,source)=>{
    checkScope();let state=states.get(turn);if(!state){state={entries:[],signature:''};states.set(turn,state)}
    const annotations=turn.dialogueAnnotations||[],signature=source+'|'+JSON.stringify(annotations)+'|'+JSON.stringify(rows().map(r=>r.visible));
    if(signature!==state.signature){state.signature=signature;state.source=source;const found=window.NexusDialogue.resolve(source,annotations,rows(),()=>false,{streaming:turn.status==='STREAMING'}),seen=new Set(),next=[];
      for(const record of found){const row=record.row,id=row?.person?.id;if(!id||id===api._scenario().protagonist?.id||record.nonSpeech||row.visible.referenceMode!=='PRIMARY'||seen.has(id))continue;seen.add(id);let entry=state.entries.find(e=>e.row.person.id===id&&e.offset===record.start);if(!entry)entry=start(row,record.start);next.push(entry)}
      state.entries=next;
    }return state.entries;
  };
  const figure=entry=>{
    if(!entry.figure){const f=document.createElement('figure');f.className='turn-image-panel character-first-appearance speaker-beat-image';f.dataset.speakerPortrait=entry.row.person.id;f.style.aspectRatio='16 / 9';entry.figure=f;}
    const f=entry.figure;if(f.dataset.state!==entry.status){f.dataset.state=entry.status;f.replaceChildren();if(entry.status==='READY'){const img=document.createElement('img');img.src=entry.asset.dataUrl;img.alt=entry.row.visible.name;img.loading='eager';img.decoding='sync';img.width=entry.dimensions.width;img.height=entry.dimensions.height;const caption=document.createElement('figcaption');caption.className='turn-image-caption';const name=document.createElement('strong');name.textContent=entry.row.visible.name;caption.append(name);f.append(img,caption)}else if(entry.status==='PENDING'){f.setAttribute('aria-label','인물 이미지 준비 중');}else{f.classList.add('portrait-unavailable');f.setAttribute('aria-label','인물 이미지를 불러오지 못했습니다');}}
    return f;
  };
  const gate=(turn,source,shown,proposed)=>{const list=entries(turn,source);for(const entry of list){if(entry.offset>proposed)break;if(entry.status==='PENDING'||entry.status==='READY'&&performance.now()<entry.readyAt)return Math.max(shown,Math.min(proposed,entry.offset));}return proposed;};
  const decorate=(node,turn,source)=>{
    const state=states.get(turn),list=turn.displayTyping&&state?state.entries:entries(turn,source);
    for(const entry of list){if(entry.status==='MISSING'){entry.figure?.remove();continue;}const reaches=entry.offset<=source.length||!String(state?.source||'').slice(source.length,entry.offset).trim();if(!reaches||['FAILED','TIMED_OUT'].includes(entry.status)&&!entry.figure)continue;const f=figure(entry),anchor=[...node.querySelectorAll('[data-reader-start]')].find(n=>+n.dataset.readerStart===entry.offset);if(anchor){const card=anchor.closest('.nexus-dialogue-row')||anchor;if(card.previousElementSibling!==f)card.before(f)}else if(reaches&&f.parentNode!==node)node.append(f);}
  };
  const refresh=()=>{
    checkScope();const sc=api._scenario(),row=rows().find(r=>r.person.id===sc.protagonist?.id&&r.visible.referenceMode==='PRIMARY'),node=document.querySelector('.opening-scene > .prose');
    if(!node||!row)return;
    if(opening?.status==='MISSING'){opening.figure?.remove();if(window.NexusCortexPrimaryMedia?.has(String(row.person.id)))opening=null;else return;}
    opening||=start(row,0);
    if(opening.figure||!['MISSING','FAILED','TIMED_OUT'].includes(opening.status)){const f=figure(opening);f.dataset.openingPortrait='true';if(node.previousElementSibling!==f)node.before(f);}
  };
  const prefetch=()=>{checkScope();for(const row of rows().filter(r=>r.visible.referenceMode==='PRIMARY').slice(0,16)){const asset=window.NexusCortexPrimaryMedia?.get(String(row.person.id));if(asset?.dataUrl)void load(asset);}};
  window.addEventListener('nexus-cortex-primary-media',()=>{prefetch();notify()});
  const images=turn=>{checkScope();const ready=(states.get(turn)?.entries||[]).filter(e=>e.status==='READY'&&e.figure?.isConnected);if(!ready.length)return [];const visible=new Set(rows().filter(r=>r.visible.referenceMode==='PRIMARY').map(r=>r.person.id));return ready.filter(e=>visible.has(e.row.person.id)).map(e=>({url:e.asset.dataUrl,label:e.row.visible.name}));};
  return {gate,decorate,refresh,prefetch,images,get version(){return version},waitMs};
};
// Trigger locations are stored with the beat. Rehydration must not append them
// at the end of the session, and an unverified location must not be guessed.
window.NexusPlaceTriggerImages = function(node,turn,source,scenario){
  const figures=window.NexusPlaceTriggerImages.figures||(window.NexusPlaceTriggerImages.figures=new WeakMap());
  const entries=(turn.packageTriggerImages||[]).filter(item=>item.url&&item.proseAnchor&&window.CortexTurnExperience.publicPackageImage(scenario,item,turn));
  for(const item of entries){
    const anchor=item.proseAnchor;if(anchor.kind==='UNRESOLVED')continue;
    let offset=anchor.offset;
    if(anchor.kind==='PUBLIC_QUOTE'){
      const first=source.indexOf(anchor.quote);if(first<0||source.indexOf(anchor.quote,first+1)>=0)continue;
      offset=first+(anchor.before?0:anchor.quote.length);
    }
    if(!Number.isInteger(offset)||offset<0||offset>source.length)continue;
    const existing=[...node.querySelectorAll('[data-package-trigger]')].find(el=>el.dataset.packageTrigger===item.triggerId);if(existing)continue;
    let f=figures.get(item);if(!f){f=document.createElement('figure');f.className='turn-image-panel package-trigger-image anchored-trigger-image';f.dataset.packageTrigger=item.triggerId;const img=document.createElement('img');img.src=item.url;img.alt=String(item.label||'장면 이미지');img.loading='lazy';img.decoding='async';f.append(img);figures.set(item,f)}
    f.dataset.readerImageOffset=String(offset);
    const previous=[...node.querySelectorAll('[data-reader-image-offset]')].filter(el=>+el.dataset.readerImageOffset===offset).at(-1);if(previous){previous.after(f);continue;}
    const pieces=[...node.querySelectorAll('[data-reader-start]')],target=pieces.find(el=>+el.dataset.readerStart<=offset&&+el.dataset.readerEnd>=offset)||pieces.find(el=>+el.dataset.readerStart>=offset);
    if(!target){if(offset===0)node.prepend(f);continue;}
    const card=target.closest('.nexus-dialogue-row');
    if(offset<=+target.dataset.readerStart)(card||target).before(f);
    else if(card||offset>=+target.dataset.readerEnd)(card||target).after(f);
    else {
      // Split only a plain narration node; dialogue cards remain whole.
      const start=+target.dataset.readerStart,end=+target.dataset.readerEnd,cut=offset-start,tail=target.cloneNode(false),value=target.textContent;
      target.textContent=value.slice(0,cut);target.dataset.readerEnd=String(offset);delete target.dataset.paragraphEnd;
      tail.textContent=value.slice(cut);tail.dataset.readerStart=String(offset);tail.dataset.readerEnd=String(end);target.after(f,tail);
    }
  }
};
window.mountNexusCortexView = function(api, emit) {
  const $ = id => document.getElementById(id);
  const icons={book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v15h4.5a2.5 2.5 0 0 1 2.5 2.5z"/>',panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',send:'<path d="m21 3-7.5 18-3.6-7-6.9-3.5z"/><path d="m9.9 14 4-4"/>',undo:'<path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/>',copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',check:'<path d="m5 12 4 4L19 6"/>',image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/>',spark:'<path d="m12 3-1.4 4.1L6.5 8.5l4.1 1.4L12 14l1.4-4.1 4.1-1.4-4.1-1.4z"/><path d="m5 15-.8 2.2L2 18l2.2.8L5 21l.8-2.2L8 18l-2.2-.8z"/>'};
  const icon=name=>'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
  const app = document.querySelector('.app');
  if (app.dataset.nexusView) return;
  app.dataset.nexusView = '1';
  document.querySelectorAll('head > style').forEach(style => { style.disabled = true; if(style.sheet)style.sheet.disabled = true; });
  app.className = 'app app-shell cortex-native reading-comfort font-medium';
  const oldHeader = app.querySelector('.top');
  const layout = app.querySelector('.layout');
  const story = app.querySelector('.story');
  const inspector = $('inspector');
  const composer = app.querySelector('.composer');
  const world = app.querySelector('.worldbar');
  const column = document.createElement('section');
  column.className = 'story-column';
  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = '<div class="topbar-title"><small>단청 · INTERACTIVE NOVEL</small><h1></h1></div><div class="topbar-actions"><button type="button" class="library-home-button" data-nexus-home>서재</button><div class="reader-tools-menu"><button type="button" class="reader-tools-trigger">더 많은 도구</button><div class="reader-tools-popover" id="cortex-session-tools" hidden><header><small>SESSION TOOLS</small><strong>필요할 때만 펼치는 도구</strong></header></div></div></div>';
  header.querySelector('[data-nexus-home]').innerHTML=icon('book')+'<span>서재</span>';header.querySelector('[data-nexus-home]').setAttribute('aria-label','서재');
  const toolsMenu=header.querySelector('.reader-tools-menu'),toolsTrigger=header.querySelector('.reader-tools-trigger'),tools=header.querySelector('.reader-tools-popover');
  toolsTrigger.innerHTML=icon('panel')+'<span>더 많은 도구</span>';toolsTrigger.setAttribute('aria-label','더 많은 도구 열기');toolsTrigger.setAttribute('aria-controls',tools.id);toolsTrigger.setAttribute('aria-haspopup','menu');toolsTrigger.setAttribute('aria-expanded','false');tools.setAttribute('role','menu');tools.classList.add('reader-tools-portal');document.body.append(tools);
  // iOS의 iframe 안에서는 native <details>와 header overflow가 겹치면 open이어도 메뉴가 보이지 않는다.
  // 팝오버를 body 포털로 옮기고 버튼 상태와 위치를 직접 소유한다.
  const placeTools=()=>{const rect=toolsTrigger.getBoundingClientRect(),viewportHeight=window.visualViewport?.height||window.innerHeight;tools.style.top=Math.max(8,rect.bottom+8)+'px';tools.style.right=Math.max(8,window.innerWidth-rect.right)+'px';tools.style.maxHeight=Math.max(180,viewportHeight-rect.bottom-20)+'px'};
  const setToolsOpen=open=>{tools.hidden=!open;toolsTrigger.setAttribute('aria-expanded',String(open));if(open)placeTools()};
  toolsTrigger.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setToolsOpen(tools.hidden)});
  document.addEventListener('pointerdown',event=>{if(!tools.hidden&&!toolsMenu.contains(event.target)&&!tools.contains(event.target))setToolsOpen(false)});
  window.addEventListener('resize',()=>{if(!tools.hidden)placeTools()});
  header.querySelector('[data-nexus-home]').onclick = () => emit('HOME');
  const actions = header.querySelector('.topbar-actions');
  const rewind = $('rewindQuickBtn');rewind.hidden=true;const engineControls=document.createElement('div');engineControls.hidden=true;engineControls.append(rewind);document.body.append(engineControls);
  for (const id of ['importBtn']) { const button=$(id); if(!button)continue;button.className='checkpoint-button'; tools.append(button); }
  const legacySettings=$('settingsBtn'),legacyDialog=$('settingsDialog');legacySettings.remove();legacyDialog.showModal=()=>emit('NEXUS_SETTINGS',{tab:'connection'});
  const runTool=action=>event=>{event.preventDefault();event.stopPropagation();setToolsOpen(false);action()};
  const saveScenario=document.createElement('button');saveScenario.type='button';saveScenario.className='checkpoint-button';saveScenario.textContent='시나리오 저장';saveScenario.onclick=runTool(()=>$('exportBtn').click());tools.append(saveScenario);
  const nexusSettings = document.createElement('button'); nexusSettings.type='button'; nexusSettings.className='settings-icon-button';nexusSettings.textContent='설정'; nexusSettings.onclick=runTool(()=>emit('NEXUS_SETTINGS')); tools.append(nexusSettings);
  if(new URLSearchParams(location.search).get('multiplayer')==='1'){const multiplayerSettings=document.createElement('button');multiplayerSettings.type='button';multiplayerSettings.className='settings-icon-button';multiplayerSettings.textContent='멀티 설정';multiplayerSettings.onclick=runTool(()=>emit('MP_SETTINGS'));tools.append(multiplayerSettings);}
  const resetSession=document.createElement('button');resetSession.type='button';resetSession.className='session-refresh-button';resetSession.textContent='세션 초기화';resetSession.onclick=runTool(()=>{if(confirm('현재 진행 기록을 지우고 이 작품의 시작 장면으로 되돌릴까요?'))emit('RESET_SESSION')});tools.append(resetSession);
  const version=$('runtimeVersionLabel'); version.className='nexus-runtime-version'; tools.append(version);
  oldHeader.remove();
  world.className='worldbar scene-meta';
  story.classList.add('story-scroll');
  const chapter=document.createElement('div');chapter.className='chapter-heading';
  for(const node of [...story.children])if(node.id!=='feed')chapter.append(node);
  const kicker=chapter.querySelector('.event-kicker');if(kicker)kicker.textContent='CURRENT CHAPTER';
  story.prepend(chapter);$('feed').classList.add('story-content');
  composer.className='composer-wrap';composer.querySelector('.compose-box').className='compose-box composer';composer.querySelector('.compose-actions').classList.add('composer-bottom');$('send').className='send-button';$('send').innerHTML=icon('send')+'<span>완료</span>';$('send').setAttribute('aria-label','입력 완료');$('input').placeholder='주인공의 행동이나 대사를 입력하세요…';
  inspector.querySelector('.drawer-head b').textContent='이야기 정보';
  const drawer=$('drawerBtn');drawer.className='drawer-toggle mobile-icon-button state-button';drawer.innerHTML=icon('panel');drawer.setAttribute('aria-label','이야기 정보 패널 열기');actions.append(drawer);
  const close=inspector.querySelector('.drawer-close');close.textContent='×';close.setAttribute('aria-label','패널 닫기');
  const preserveSendIcon=()=>{const button=$('send'),t=api._turns().at(-1),raw=button.querySelector('span')?.textContent||button.textContent;const label=button.disabled&&['STREAMING','ADJUDICATION_PENDING'].includes(t?.status)?'진행 중':raw==='정사 전개 →'||raw==='진행 중'?'완료':raw;if(!button.querySelector('svg')){button.replaceChildren();button.insertAdjacentHTML('afterbegin',icon('send'));button.append(document.createElement('span'))}if(button.querySelector('span').textContent!==label)button.querySelector('span').textContent=label};
  new MutationObserver(preserveSendIcon).observe($('send'),{childList:true,attributes:true,attributeFilter:['disabled']});
  const recovery=$('recoveryNotice');
  const continueButton=document.createElement('button');continueButton.type='button';continueButton.className='nexus-continue-button';continueButton.innerHTML=icon('spark')+'<span>이어서 진행</span>';continueButton.title='현재 장면에서 산문작가가 다음 비트를 이어 씁니다.';$('send').before(continueButton);
  continueButton.addEventListener('click',()=>{if(continueButton.disabled)return;void api._continue()});
  const syncContinue=()=>{continueButton.disabled=$('send').disabled||Boolean($('input').value.trim());};new MutationObserver(syncContinue).observe($('send'),{attributes:true,attributeFilter:['disabled']});$('input').addEventListener('input',syncContinue);syncContinue();
  const paperFrame=document.createElement('div');paperFrame.className='nexus-reading-paper-frame';
  const paperOrnaments=document.createElement('div');paperOrnaments.className='nexus-reading-ornaments';paperOrnaments.setAttribute('aria-hidden','true');
  paperFrame.append(paperOrnaments,story);
  column.append(header,world,paperFrame,recovery,composer);app.prepend(column);app.append(inspector,$('drawerScrim'));layout.remove();
  // Reserve one stable line beneath the world bar; status never overlaps scrolling prose.
  const cloudStatusSlot=document.createElement('div');cloudStatusSlot.className='nexus-cloud-status-slot';cloudStatusSlot.setAttribute('aria-hidden','true');world.after(cloudStatusSlot);
  const reportCloudPosition=()=>{const rect=cloudStatusSlot.getBoundingClientRect();emit('CLOUD_STATUS_POSITION',{top:rect.top+2,right:Math.max(12,innerWidth-rect.right+16)})};
  if(typeof ResizeObserver==='function'){const cloudPositionObserver=new ResizeObserver(reportCloudPosition);for(const el of [column,header,world])cloudPositionObserver.observe(el);}
  window.addEventListener('resize',reportCloudPosition);reportCloudPosition();
  // Keep notices outside the prose and inside the reader's own width/viewport.
  const notices=document.createElement('section');notices.className='nexus-notices';notices.setAttribute('aria-label','알림');composer.prepend(notices);notices.append(recovery);
  const showNotice=(node)=>{node.classList.add('nexus-paper-notice');node.setAttribute('role','status');const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='nexus-notice-close';dismiss.textContent='×';dismiss.setAttribute('aria-label','알림 닫기');dismiss.onclick=()=>node.remove();node.append(dismiss);notices.append(node)};
  const relayNotices=()=>{for(const node of [...$('feed').querySelectorAll(':scope > .notice')])showNotice(node)};
  new MutationObserver(relayNotices).observe($('feed'),{childList:true});relayNotices();
  window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='NEXUS_CORTEX_HOST_V1'||event.data.type!=='NOTICE')return;notices.querySelector('[data-host-notice]')?.remove();if(!event.data.message)return;const node=document.createElement('div');node.dataset.hostNotice='true';node.textContent=String(event.data.message);showNotice(node)});
  // Capture before the standalone engine's Enter handler. Do not prevent the native newline.
  const mobileInput=()=>/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  $('input').addEventListener('keydown',event=>{if(event.key==='Enter'&&(mobileInput()||event.isComposing||event.keyCode===229))event.stopImmediatePropagation()},true);
  const syncInputHint=()=>{const hint=$('streamState');if(mobileInput()&&hint.textContent==='Enter 전송 · Shift+Enter 줄바꿈')hint.textContent='Enter 줄바꿈 · 완료 버튼으로 전송'};
  new MutationObserver(syncInputHint).observe($('streamState'),{childList:true});syncInputHint();
  window.mountNexusInspector(api,inspector);
  window.NexusRequireImageApiKey=()=>{
    const go=['opencode-go','opencode-go-luna'].includes(window.NexusCortexTextProvider);
    if(go?Boolean(window.NexusCortexImageApiKey):Boolean(api._settings()?.apiKey?.trim()))return true;
    if(document.querySelector('.nexus-image-key-notice'))return false;
    const dialog=document.createElement('dialog');dialog.className='nexus-extension-notice nexus-image-key-notice';dialog.setAttribute('aria-labelledby','image-key-notice-title');
    const heading=document.createElement('h2');heading.id='image-key-notice-title';heading.textContent='이미지 생성 API 설정이 필요합니다';
    const copy=document.createElement('p');copy.textContent='설정 → API 연결에서 OpenAI API Key를 입력해 주세요. 이미지 생성은 선택 사항이며, 키 없이도 본문 플레이는 계속할 수 있습니다.';
    const actions=document.createElement('div'),close=document.createElement('button'),settings=document.createElement('button');close.type=settings.type='button';close.textContent='닫기';settings.textContent='API 설정 열기';
    close.onclick=()=>{dialog.close();dialog.remove()};settings.onclick=()=>{dialog.close();dialog.remove();emit('NEXUS_SETTINGS',{tab:'connection'})};dialog.addEventListener('cancel',()=>dialog.remove());actions.append(close,settings);dialog.append(heading,copy,actions);document.body.append(dialog);dialog.showModal();return false;
  };
  // Cortex publishes into its own typewriter buffer. Only the viewport and status are adapted here.
  const writing=document.createElement('div');writing.id='nexus-writing-progress';writing.className='world-writing-progress';writing.hidden=true;writing.setAttribute('role','status');writing.setAttribute('aria-live','polite');writing.innerHTML='<div class="world-writing-primary"><span class="world-writing-dots" aria-hidden="true"><i></i><i></i><i></i></span><strong>세계가 반응하는 중</strong></div><div class="world-writing-stage"><span></span></div>';story.append(writing);
  const jumpDock=document.createElement('div');jumpDock.className='nexus-jump-dock';jumpDock.hidden=true;
  const jump=document.createElement('button');jump.type='button';jump.className='nexus-jump-bottom';jump.hidden=true;jump.setAttribute('aria-label','본문 맨 아래로');jump.title='본문 맨 아래로';jump.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6"/></svg>';jumpDock.append(jump);paperFrame.append(jumpDock);
  const readerScroll=window.NexusReaderScroll=window.createNexusReaderScroll(story,$('feed'),jump,()=>window.NexusMultiplayerLive?.current||api._turns().at(-1));
  const restoreReaderAnchor=readerScroll.restoreAnchor;
  readerScroll.restoreAnchor=value=>{
    const index=api._turns().findIndex(turn=>turn.id===value?.turn),range=api._renderedTurnRange?.();
    if(index>=0&&range&&index<range.start){api._loadEarlierTurns?.(range.start-index);syncHistoryControl();}
    restoreReaderAnchor(value);
  };
  const followTail=()=>readerScroll.schedule();
  // An explicit completion submit is also an explicit request to follow the new beat.
  // Register on document capture so multiplayer's later click interceptor cannot swallow it.
  document.addEventListener('click',event=>{if(event.target.closest?.('#send')&&!$('send').disabled)readerScroll.followEnd({submitted:true})},true);
  let historyReady=false,historyLoading=false,lastStoryScroll=0,historyIntentUntil=0,historyTouchY=null;
  const syncHistoryControl=()=>{
    const range=api._renderedTurnRange?.()||{start:0,total:api._turns().length};let button=$('feed').querySelector(':scope > .nexus-history-loader');
    if(range.start<=0){button?.remove();return}
    if(!button){button=document.createElement('button');button.type='button';button.className='nexus-history-loader';button.addEventListener('click',()=>loadEarlierHistory());const first=$('feed').querySelector(':scope > article.turn:not(.opening-scene)');if(first)first.before(button);else $('feed').prepend(button)}
    const label=`이전 본문 ${Math.min(10,range.start)}비트 보기`;if(button.textContent!==label)button.textContent=label;if(button.disabled!==historyLoading)button.disabled=historyLoading;
  };
  const loadEarlierHistory=()=>{
    if(historyLoading||!(api._renderedTurnRange?.().start>0))return;historyLoading=true;syncHistoryControl();
    const anchorNode=$('feed').querySelector(':scope > article.turn:not(.opening-scene)'),anchorY=anchorNode?.getBoundingClientRect().top;
    readerScroll.transaction(()=>api._loadEarlierTurns?.(10));if(anchorNode&&Number.isFinite(anchorY)){const delta=anchorNode.getBoundingClientRect().top-anchorY;if(Math.abs(delta)>.75)story.scrollTop+=delta;readerScroll.reanchor()}
    historyLoading=false;syncHistoryControl();readerScroll.schedule();requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!anchorNode?.isConnected||!Number.isFinite(anchorY))return;const delta=anchorNode.getBoundingClientRect().top-anchorY;if(Math.abs(delta)>.75)story.scrollTop+=delta;readerScroll.reanchor()}));
  };
  const historyIntent=()=>{historyIntentUntil=performance.now()+700};
  story.addEventListener('wheel',event=>{if(event.deltaY<0)historyIntent()},{passive:true});
  story.addEventListener('touchstart',event=>{historyTouchY=event.touches[0]?.clientY??null},{passive:true});
  story.addEventListener('touchmove',event=>{const y=event.touches[0]?.clientY;if(historyTouchY!==null&&y!=null&&y>historyTouchY+3)historyIntent();historyTouchY=y??historyTouchY},{passive:true});
  story.addEventListener('pointerdown',event=>{if(event.clientX>=story.getBoundingClientRect().right-16)historyIntent()},{passive:true});
  story.addEventListener('keydown',event=>{if(['ArrowUp','PageUp','Home'].includes(event.key))historyIntent()});
  story.addEventListener('scroll',()=>{const upward=story.scrollTop<lastStoryScroll-1;lastStoryScroll=story.scrollTop;if(historyReady&&performance.now()<historyIntentUntil&&upward&&story.scrollTop<180)loadEarlierHistory()},{passive:true});
  // The standalone engine's document scroll belongs to the embedded story viewport here.
  window.scrollTo=()=>readerScroll.schedule();
  const syncWriting=()=>{const t=api._turns().at(-1),pending=t?.status==='ADJUDICATION_PENDING'&&!$('send').disabled,running=t?.status==='STREAMING'||t?.displayTyping===true||(t?.status==='ADJUDICATION_PENDING'&&!pending);writing.hidden=!running&&!pending;writing.classList.toggle('is-paused',pending);const heading=pending?'판정 보완을 기다리는 중':'세계가 반응하는 중',stage=pending?'입력창의 다시 시도로 이어갈 수 있어요.':t?.status==='ADJUDICATION_PENDING'?'공개된 본문으로 비트를 확정하고 있어요.':t?.displayTyping===true&&t?.status==='COMMITTED'?'확정된 문단을 표시하고 있어요.':t?.displayText||t?.text?'공개된 문단에 맞춰 이야기를 이어가고 있어요.':'첫 문단을 준비하고 있어요.';if(writing.querySelector('strong').textContent!==heading)writing.querySelector('strong').textContent=heading;if(writing.querySelector('.world-writing-stage span').textContent!==stage)writing.querySelector('.world-writing-stage span').textContent=stage;story.setAttribute('aria-busy',String(running));if(running||pending)followTail()};
  new MutationObserver(records=>{if(!window.NexusOnlyLiveMutations(records))syncWriting()}).observe($('feed'),{childList:true,subtree:true});
  new MutationObserver(syncWriting).observe($('send'),{attributes:true,attributeFilter:['disabled']});
  syncWriting();
  const title=header.querySelector('h1');
  const sceneBoundary=(node,turn,index)=>{
    const previous=api._turns()[index-1],a=previous?.txn?.start,b=turn?.txn?.start;
    const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
    const place=value=>normalize(value).split(/[,，·]/)[0];
    const minutes=value=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(value||''));return m?+m[1]*60+(+m[2]):null};
    const ta=minutes(a?.time),tb=minutes(b?.time),dayChanged=a&&b&&Number.isFinite(+a.day)&&Number.isFinite(+b.day)&&+b.day>+a.day;
    const moved=a&&b&&place(a.location)&&place(b.location)&&place(a.location)!==place(b.location);
    const elapsed=a&&b&&ta!==null&&tb!==null&&+a.day===+b.day&&tb-ta>=240;
    let marker=node.querySelector(':scope > .dancheong-scene-break');
    if(!a||!b||!(dayChanged||moved||elapsed)){marker?.remove();return}
    const label=[dayChanged?'D+'+b.day:elapsed?b.time:'',normalize(b.location)].filter(Boolean).join(' · ');
    if(!marker){
      marker=document.createElement('div');marker.className='dancheong-scene-break';marker.setAttribute('role','separator');
      const markerLabel=document.createElement('span');markerLabel.className='dancheong-scene-label';
      const band=document.createElement('span');band.className='dancheong-scene-band';band.setAttribute('aria-hidden','true');
      const left=document.createElement('i'),knot=document.createElement('img'),right=document.createElement('i');left.className='dancheong-scene-band-left';right.className='dancheong-scene-band-right';knot.src='/dancheong-scene-knot.png';knot.alt='';
      band.append(left,knot,right);marker.append(markerLabel,band);node.prepend(marker);
    }
    marker.setAttribute('aria-label',label);const markerLabel=marker.querySelector('.dancheong-scene-label');if(markerLabel&&markerLabel.textContent!==label)markerLabel.textContent=label;
  };
  const people=()=>[api._scenario()?.protagonist,...(api._scenario()?.characters||[])].filter(Boolean);
  const publicPerson=person=>window.CortexTurnExperience.publicCharacter(person,api._scenario());
  const speakerRows=()=>people().flatMap(person=>{const visible=publicPerson(person);if(!visible)return [];const names=[visible.name,...(visible.aliases||[])].map(value=>String(value||'').trim()).filter(value=>value.length>=1),short=String(visible.name||'');if(/^[가-힣]{3,4}$/u.test(short)&&people().filter(p=>String(publicPerson(p)?.name||'').endsWith(short.slice(1))).length===1)names.push(short.slice(1));return names.length?[{person,visible,names:[...new Set(names)].sort((a,b)=>b.length-a.length)}]:[]});
  const dialogueNode=(row,line)=>{const wrap=document.createElement('div');wrap.className='nexus-dialogue-row';const avatar=document.createElement('div');avatar.className='nexus-dialogue-avatar';const characterId=String(row?.person?.id||row?.visible?.id||''),photo=row?.visible?.referenceMode==='PRIMARY'?window.NexusCortexPrimaryMedia?.get(characterId):null;if(photo?.dataUrl){const img=document.createElement('img');img.src=photo.dataUrl;img.alt='';avatar.append(img)}else avatar.textContent=String(row?.visible?.name||'·').trim().slice(0,1);const body=document.createElement('div');body.className='nexus-dialogue-body';const head=document.createElement('div');head.className='nexus-dialogue-head';const name=document.createElement('strong');name.textContent=row?.visible?.name||'이름 없는 인물';head.append(name);const role=String(row?.visible?.role||'').trim();if(role){const badge=document.createElement('span');badge.textContent=role.length>18?role.slice(0,18)+'…':role;head.append(badge)}const copy=document.createElement('p');copy.textContent=line;body.append(head,copy);wrap.append(avatar,body);return wrap};
  const renderLiteraryProse=(node,turn)=>{
    if(!node)return;
    const source=(typeof turn?.displayText==='string'?turn.displayText:String(turn?.text||'')),annotations=Array.isArray(turn?.dialogueAnnotations)?turn.dialogueAnnotations:[],photoVersion=window.NexusCortexPrimaryMedia?.size||0,signature=source+'|'+photoVersion+'|'+JSON.stringify(annotations)+'|'+String(turn?.displayTyping===true)+'|'+JSON.stringify(people().map(publicPerson));
    const media=window.NexusCortexSpeakerMedia,mediaSignature=signature+'|'+media.version+'|'+JSON.stringify((turn.packageTriggerImages||[]).map(item=>[item.triggerId,item.assetKey,Boolean(item.url),item.proseAnchor]));
    if(node.dataset.nexusLiterarySignature===mediaSignature){media.decorate(node,turn,source);window.NexusPlaceTriggerImages(node,turn,source,api._scenario());return;}
    const rows=speakerRows(),fragment=document.createDocumentFragment();let searchFrom=0;
    const records=window.NexusDialogue.resolve(source,annotations,rows,()=>true,{streaming:turn.status==='STREAMING'||turn.displayTyping===true}),byStart=new Map(records.map(record=>[record.start,record]));
    const position=(element,start,end)=>{element.dataset.readerStart=String(start);element.dataset.readerEnd=String(end);return element};
    for(const paragraph of source.split(/\n{1,}/u).map(value=>value.trim()).filter(Boolean)){
      const paragraphOffset=source.indexOf(paragraph,searchFrom);searchFrom=Math.max(searchFrom,paragraphOffset+paragraph.length);
      if(fragment.childNodes.length)fragment.append(document.createTextNode('\n\n'));
      const quotes=window.NexusDialogue.scan(paragraph);
      if(!quotes.length){const p=document.createElement('p');p.className='nexus-narration';p.textContent=paragraph;p.dataset.paragraphEnd=String(searchFrom);fragment.append(position(p,paragraphOffset,searchFrom));continue}
      let cursor=0;
      const narration=(value,at=cursor)=>{if(!value)return;if(!value.trim()){fragment.append(document.createTextNode(value));return}const p=document.createElement('p');p.className='nexus-narration';p.textContent=value;fragment.append(position(p,paragraphOffset+at,paragraphOffset+at+value.length))};
      for(const match of quotes){
        const start=match.index||0,globalStart=Math.max(0,paragraphOffset)+start;
        // Only the writer's quote binding selects a speaker; surrounding narrative never does.
        const record=byStart.get(globalStart),speaker=record?.row;
        if(record?.nonSpeech){narration(paragraph.slice(cursor,start));const quote=document.createElement('p');quote.className='nexus-narration nexus-written-quote';quote.textContent=match[0];fragment.append(position(quote,globalStart,globalStart+match[0].length));cursor=start+match[0].length}
        else if(speaker){narration(paragraph.slice(cursor,start));const card=dialogueNode(speaker,match[0]);card.dataset.speakerEvidence=record.evidence;position(card.querySelector('.nexus-dialogue-body > p'),globalStart,globalStart+match[0].length);fragment.append(card);cursor=start+match[0].length}
      }
      narration(paragraph.slice(cursor));
      if(fragment.lastElementChild)fragment.lastElementChild.dataset.paragraphEnd=String(searchFrom);
    }
    if(turn?.displayTyping===true){const cursor=document.createElement('span');cursor.className='cursor';cursor.setAttribute('aria-label','본문 생성 중');fragment.append(cursor)}
    node.replaceChildren(fragment);node.dataset.nexusLiterarySignature=mediaSignature;media.decorate(node,turn,source);window.NexusPlaceTriggerImages(node,turn,source,api._scenario());
  };
  const copyText=async value=>{try{await navigator.clipboard.writeText(value);return true}catch{const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();let copied=false;try{copied=document.execCommand('copy')}catch{}area.remove();return copied}};
  const turnActions=(node,turn,index)=>{
    const nativeImage=node.querySelector(':scope > .turn-image-action'),status=String(turn?.imageStatus||''),signature=[turn?.status,status,Boolean(turn?.imageUrl),Boolean(nativeImage),$('rewindQuickBtn').disabled,api._turns().length,String(turn?.text||'').length,JSON.stringify(turn?.dialogueRecovery),JSON.stringify(turn?.imageDiagnostic),JSON.stringify(turn?.dialogueAnnotations)].join('|');
    let bar=node.querySelector(':scope > .nexus-beat-actions');
    if(bar?.dataset.signature===signature)return;
    bar?.remove();bar=document.createElement('div');bar.className='nexus-beat-actions';bar.dataset.signature=signature;bar.setAttribute('role','group');bar.setAttribute('aria-label',`비트 ${index+1} 본문 작업`);
    if(turn?.status==='COMMITTED'){const undo=document.createElement('button');undo.type='button';undo.className='nexus-beat-rewind';undo.innerHTML=icon('undo')+'<span>되돌리기</span>';undo.disabled=$('rewindQuickBtn').disabled;undo.addEventListener('click',()=>void api._rewind(turn.id));bar.append(undo)}
    const copy=document.createElement('button');copy.type='button';copy.className='nexus-beat-copy';copy.innerHTML=icon('copy')+'<span>복사</span>';copy.addEventListener('click',async()=>{const ok=await copyText(String(turn?.text||''));copy.innerHTML=icon(ok?'check':'copy')+`<span>${ok?'복사됨':'다시 복사'}</span>`;window.setTimeout(()=>{if(copy.isConnected)copy.innerHTML=icon('copy')+'<span>복사</span>'},1600)});bar.append(copy);
    const diagnostic=document.createElement('button');diagnostic.type='button';diagnostic.className='nexus-beat-diagnostic';diagnostic.textContent='진단';diagnostic.setAttribute('aria-label',`${index+1}비트 진단 내보내기`);diagnostic.setAttribute('aria-haspopup','dialog');diagnostic.onclick=()=>window.openNexusBeatDiagnostics(api,turn,index,diagnostic);bar.append(diagnostic);
    if(turn?.status==='COMMITTED'){
      const imageButton=document.createElement('button');imageButton.type='button';imageButton.className='nexus-beat-image';const failed=status==='ERROR',loading=status==='GENERATING',done=Boolean(turn?.imageUrl);imageButton.disabled=loading||done;imageButton.classList.toggle('is-error',failed);imageButton.innerHTML=icon('image')+`<span>${done?'이미지 있음':loading?'생성 중':failed?'이미지 재시도':'이미지 추가'}</span>`;imageButton.title=failed?String(turn?.imageError||'이미지 생성을 다시 시도합니다.'):done?'이 비트에는 장면 이미지가 있습니다.':'이 비트의 장면 이미지를 생성합니다.';imageButton.addEventListener('click',()=>{void api._generateTurnImage(index)});bar.append(imageButton);
      if(failed){const note=document.createElement('small');note.className='nexus-beat-action-note';note.textContent=String(turn.imageError||'이미지 생성 실패')+(turn.imageDiagnostic?' · '+[turn.imageDiagnostic.status,turn.imageDiagnostic.code,turn.imageDiagnostic.parameter].filter(Boolean).join(' / '):'');bar.append(note)}
    }
    if(turn?.status==='COMMITTED'&&api._missingDialogue(turn).length){const repair=document.createElement('button');repair.type='button';repair.className='nexus-beat-dialogue';repair.disabled=turn.dialogueRecovery?.status==='GENERATING';repair.textContent=repair.disabled?'화자 확인 중':'대사 카드 복구';repair.title='본문은 바꾸지 않고 작가 모델로 누락된 화자 주석만 확인합니다. API 사용료가 발생합니다.';repair.onclick=()=>void api._recoverDialogue(turn);bar.append(repair);if(turn.dialogueRecovery?.status==='ERROR'){const note=document.createElement('small');note.className='nexus-beat-action-note';note.textContent=turn.dialogueRecovery.error;bar.append(note)}}
    const prose=node.querySelector(':scope > .prose');if(prose)prose.after(bar);else node.append(bar);
    if(nativeImage)nativeImage.hidden=true;
  };
  const publicRecommendations=()=>{
    const turns=api._turns?.()||[],last=turns.at(-1);
    if(!last){
      const current=api._scenario?.(),instant=current?.runtime?.instantStory,state=current?.runtime?.instantState;
      const profiles=Array.isArray(instant?.startProfiles)?instant.startProfiles:[],profile=profiles.find(row=>row?.id===state?.profileId)||profiles[0],labels=Array.isArray(profile?.recommendedReplies)?profile.recommendedReplies.slice(0,3).map(value=>String(value||'').trim()):[];
      return labels.length===3&&labels.every(Boolean)?labels.map((label,index)=>({label,risk:['LOW','MEDIUM','HIGH'][index],source:'START_PROFILE'})):[];
    }
    const jieum=window.CortexJieum?.config(api._scenario());if(!last&&jieum&&!(api._scenario().runtime.jieum?.routeIndex>0)){const labels=jieum.replies||[];return labels.length===3&&labels.every(s=>String(s).trim())?labels.map((label,i)=>({label,risk:['LOW','MEDIUM','HIGH'][i],source:'START_PROFILE'})):[];}
    const rows=Array.isArray(last?.recommendations)?last.recommendations:[];
    if(last?.status!=='COMMITTED'||last?.metrics?.authorRecommendations?.status!=='ACCEPTED'||rows.length!==3)return [];
    return rows.every(row=>row?.source==='SAME_TURN_PROSE_WRITER'&&String(row?.label||'').trim())?[...rows].sort((a,b)=>({LOW:0,MEDIUM:1,HIGH:2}[a.risk]??3)-({LOW:0,MEDIUM:1,HIGH:2}[b.risk]??3)):[];
  };
  const recommendations=document.createElement('section');recommendations.className='cortex-recommendation-strip';recommendations.hidden=true;recommendations.innerHTML='<header><div class="cortex-recommendation-heading"><span class="cortex-recommendation-seal" aria-hidden="true"><i>수</i></span><div><small>NEXT MOVE</small><strong>다음 수 추천</strong></div></div><div class="cortex-recommendation-navigation"><span>장면에서 이어지는 세 갈래</span><button type="button" data-recommendation-prev aria-label="이전 추천">‹</button><button type="button" data-recommendation-next aria-label="다음 추천">›</button></div></header><div class="cortex-recommendations"></div>';composer.before(recommendations);
  const recommendationList=recommendations.querySelector('.cortex-recommendations'),recommendationPrev=recommendations.querySelector('[data-recommendation-prev]'),recommendationNext=recommendations.querySelector('[data-recommendation-next]');
  const syncRecommendationPager=()=>{const overflow=recommendationList.scrollWidth>recommendationList.clientWidth+2;recommendations.classList.toggle('has-overflow',overflow);recommendationPrev.disabled=!overflow||recommendationList.scrollLeft<2;recommendationNext.disabled=!overflow||recommendationList.scrollLeft+recommendationList.clientWidth>=recommendationList.scrollWidth-2};
  const moveRecommendations=direction=>{recommendationList.scrollBy?.({left:direction*Math.max(220,recommendationList.clientWidth*.78),behavior:'smooth'});window.setTimeout(syncRecommendationPager,260)};recommendationPrev.addEventListener('click',()=>moveRecommendations(-1));recommendationNext.addEventListener('click',()=>moveRecommendations(1));recommendationList.addEventListener('scroll',syncRecommendationPager,{passive:true});window.addEventListener('resize',syncRecommendationPager);
  const syncRecommendations=()=>{const latest=api._turns?.().at(-1),running=latest&&(latest.status==='STREAMING'||latest.displayTyping===true||latest.status==='ADJUDICATION_PENDING'),rows=running?[]:publicRecommendations(),list=recommendationList,signature=`${latest?.id||'START'}|`+rows.map(row=>`${row.label}:${row.risk}`).join('|');recommendations.hidden=!rows.length;if(list.dataset.signature===signature){syncRecommendationPager();return}list.dataset.signature=signature;const riskLabel={LOW:'작은<br>파동',MEDIUM:'중간<br>파동',HIGH:'큰<br>파동'};list.replaceChildren(...rows.map((row,index)=>{const button=document.createElement('button');button.type='button';button.className=`cortex-recommendation-card tone-${String(row.risk||'').toLowerCase()}`;button.setAttribute('aria-label',`${index+1}번 추천 행동: ${row.label}`);button.innerHTML=`<span class="cortex-recommendation-rail"><b>${String(index+1).padStart(2,'0')}</b><i>${riskLabel[row.risk]||row.risk}</i></span><span class="cortex-recommendation-copy"><strong></strong></span><span class="cortex-recommendation-arrow" aria-hidden="true">↗</span>`;button.querySelector('strong').textContent=row.label;button.addEventListener('click',()=>{api._setInput?.(row.label);$('input').value=row.label;$('input').dispatchEvent(new Event('input',{bubbles:true}));$('input').focus()});return button}));requestAnimationFrame(syncRecommendationPager)};
  const recommendationStatus=document.createElement('div');recommendationStatus.className='cortex-recommendation-status';recommendationStatus.hidden=true;composer.before(recommendationStatus);
  const requestedRecommendations=new WeakSet();
  const syncRecommendationStatus=()=>{
    const turn=api._turns().at(-1),missing=turn?.status==='COMMITTED'&&(turn.metrics?.authorRecommendations?.status!=='ACCEPTED'||!Array.isArray(turn.recommendations)||turn.recommendations.length!==3);
    recommendationStatus.hidden=!missing;if(!missing)return;
    if(!requestedRecommendations.has(turn)&&api._settings?.().apiKey){requestedRecommendations.add(turn);void api._ensureRecommendations?.(turn).finally(()=>syncRecommendationStatus())}
    const state=turn.metrics?.recommendationRecovery?.status||'WAITING',signature=turn.id+'|'+state;if(recommendationStatus.dataset.signature===signature)return;recommendationStatus.dataset.signature=signature;recommendationStatus.replaceChildren();
    const label=document.createElement('span');label.textContent=state==='GENERATING'?'다음 수 추천을 작성하고 있습니다.':'다음 수 추천을 준비하지 못했습니다.';recommendationStatus.append(label);
    if(state!=='GENERATING'){const retry=document.createElement('button');retry.type='button';retry.textContent='추천 다시 작성';retry.onclick=()=>{void api._ensureRecommendations?.(turn).finally(()=>syncRecommendationStatus());syncRecommendationStatus()};recommendationStatus.append(retry)}
  };
  const syncJieum=window.mountJieumReader?.(api,story,inspector,composer)||(()=>{});
  let presentationObserver;
  const decorate=affected=>readerScroll.transaction(()=>{
    window.NexusCortexSpeakerMedia?.refresh();
    syncJieum();
    syncRecommendationStatus();
    const next=String(api._scenario()?.title||'단청');if(title.textContent!==next)title.textContent=next;
    $('feed').querySelector('.opening-scene')?.classList.add('story-turn');
    (affected instanceof Set?[...affected].filter(node=>node.isConnected):$('feed').querySelectorAll('.turn:not(.opening-scene)')).forEach((node,visibleIndex)=>{node.classList.add('story-turn');const index=node.dataset.turnIndex==null?visibleIndex:Number(node.dataset.turnIndex),turn=api._turns()[index];if(turn){node.dataset.turnId=String(turn.id);const choice=node.querySelector('.choice');if(choice){if(choice.textContent!==String(turn.input||''))choice.textContent=String(turn.input||'');choice.hidden=turn.inputMode==='AUTO_CONTINUE'||turn.input==='현재 장면의 마지막 순간에서 자연스럽게 이어서 집필한다. 플레이어의 새로운 중대한 선택이나 대사를 임의로 확정하지 않고, 이미 시작된 행동과 주변 인물·환경의 반응을 이어 쓴다.'}renderLiteraryProse(node.querySelector('.prose'),turn);turnActions(node,turn,index)}});
    $('feed').querySelectorAll('.choice').forEach(node=>node.classList.add('user-choice'));
    $('feed').querySelectorAll('.turn:not(.opening-scene)').forEach((node,visibleIndex)=>{const index=node.dataset.turnIndex==null?visibleIndex:Number(node.dataset.turnIndex);sceneBoundary(node,api._turns()[index],index)});
    syncHistoryControl();
    syncRecommendations();
    // Synchronous mutations above are already decorated; do not revisit all history.
    presentationObserver?.takeRecords();
  });
  window.NexusCortexSpeakerMedia=window.createNexusSpeakerMedia(api,speakerRows);
  window.NexusCortexSpeakerMedia.prefetch();
  decorate();window.NexusCortexSpeakerMedia.refresh();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{jump.click();lastStoryScroll=story.scrollTop;historyReady=true}));
  // The engine still owns the turn text and controls; this rebuilds only its reading presentation.
  let decorationFrame=0,allDirty=false;const dirtyTurns=new Set();
  const scheduleDecoration=records=>{
    if(window.NexusOnlyLiveMutations(records))return;
    for(const record of records){
      const target=record.target.nodeType===1?record.target:record.target.parentElement,turn=target?.closest?.('article.turn:not(.opening-scene)');
      if(turn&&turn.dataset.turnIndex!=null)dirtyTurns.add(turn);
      else {for(const node of record.addedNodes||[]){if(node.nodeType===1&&node.matches('article.turn:not(.opening-scene)')&&node.dataset.turnIndex!=null)dirtyTurns.add(node);else allDirty=true}if(record.removedNodes?.length)allDirty=true;}
    }
    if(!decorationFrame)decorationFrame=requestAnimationFrame(()=>{decorationFrame=0;const affected=allDirty?null:new Set(dirtyTurns);allDirty=false;dirtyTurns.clear();decorate(affected)});
  };
  presentationObserver=new MutationObserver(scheduleDecoration);presentationObserver.observe($('feed'),{childList:true,subtree:true});
  window.addEventListener('cortex-turn-display',event=>{
    const index=event.detail?.index,turn=api._turns().at(-1),node=$('feed').querySelector(`:scope > .turn[data-turn-index="${api._turns().length-1}"]`);
    // Only pure display ticks take this path. Pending external mutations or semantic
    // events (new bindings/media, commit, restore) still receive a complete refresh.
    if(event.detail?.displayOnly===true&&index===api._turns().length-1&&turn&&node&&!presentationObserver.takeRecords().length){readerScroll.transaction(()=>{renderLiteraryProse(node.querySelector('.prose'),turn);presentationObserver.takeRecords()})}
    else decorate();
    syncWriting();
  });
  new MutationObserver(decorate).observe(rewind,{attributes:true,attributeFilter:['disabled']});
  window.addEventListener('nexus-cortex-primary-media',decorate);
  document.documentElement.classList.remove('nexus-booting');
  document.documentElement.classList.add('nexus-view-ready');
};
