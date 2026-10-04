/* Reader-only projection. It never generates narrative or mutates stat values. */
window.jieumResourceHudHtml=function(sc){
 const c=window.CortexJieum?.config(sc),st=sc?.runtime?.jieum;
 if(!c||!st)return '';
 const stats=window.CortexJieum.visibleStats?.(sc)||c.stats.filter(s=>s.visible&&!s.revealWhenChanged),timeline=st.timeline;if(!stats.length&&!c.timeline)return '';
 const values=window.CortexJieum.values(sc),hud=document.createElement('section');hud.className='jieum-resource-hud';hud.setAttribute('aria-label','스탯·자원');
 const heading=document.createElement('h3');heading.textContent='스탯·자원';hud.append(heading);
 const list=document.createElement('dl');list.className='jieum-resource-list';
 for(const s of stats){const row=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd'),number=document.createElement('strong');row.className='jieum-resource-row';label.textContent=s.label;number.textContent=String(values[s.id]);value.append(number);if(s.unit){const unit=document.createElement('small');unit.textContent=s.unit;value.append(unit)}row.append(label,value);list.append(row)}
 if(c.timeline){for(const [labelText,valueText] of [['현재 날짜',timeline?.date||'확인 전'],['경과일',Number.isFinite(timeline?.dayWithinLoop)?`${timeline.dayWithinLoop}일째`:'확인 전']]){const row=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');row.className='jieum-resource-row';label.textContent=labelText;value.textContent=valueText;row.append(label,value);list.append(row)}}
 hud.append(list);
 if(st.resourceStatus==='UNCONFIRMED'){const note=document.createElement('p');note.className='jieum-resource-pending';note.textContent='마지막 확인값 · 자원 변화는 다음 본문 판정에서 다시 확인합니다.';hud.append(note)}
 return hud.outerHTML;
};
window.mountJieumReader=function(api,story,inspector,composer){
 const create=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n};
 const intro=create('section','jieum-route-intro'),next=create('section','jieum-route-next');
 story.prepend(intro);composer.before(next);
 let signature='',starting=false;
 return ()=>{
   const sc=api._scenario(),c=window.CortexJieum?.config(sc),st=sc?.runtime?.jieum;
   if(!c||!st||c.mode==='hud_only'){intro.hidden=next.hidden=true;return;}
   const route=c.routes[st.routeIndex],values=window.CortexJieum.values(sc),publicStats=c.stats.filter(s=>s.visible),ending=sc.runtime.branchEndingState?.ending,hasNext=!!c.routes[st.routeIndex+1]&&ending?.terminalEventId===route.endingEventId;
   const sig=JSON.stringify([sc.runtime.storyId,route.id,route.authorComment,publicStats.map(s=>[s.label,s.unit,values[s.id]]),st.resourceStatus,hasNext,starting]);if(sig===signature)return;signature=sig;
   intro.replaceChildren();intro.hidden=!route.authorComment;if(route.authorComment){intro.append(create('small','','시작 전 작가 코멘트'),create('p','',route.authorComment));}
   next.replaceChildren();next.hidden=!hasNext;if(hasNext){next.append(create('h3','','새로운 이야기가 열렸습니다'),create('p','',c.routes[st.routeIndex+1].name));const button=create('button','primary-button','다음 이야기 시작');button.disabled=starting;button.onclick=async()=>{starting=true;button.disabled=true;try{await api._nextJieumRoute();window.dispatchEvent(new Event('cortex-turn-display'));}catch(e){next.append(create('p','',e.message||'저장하지 못했습니다. 다시 시도하세요.'));}finally{starting=false;signature='';window.dispatchEvent(new Event('cortex-turn-display'));}};next.append(button);}
 };
};
