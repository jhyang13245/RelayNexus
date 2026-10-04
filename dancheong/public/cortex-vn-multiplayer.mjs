// A public preview is a renderer-only turn. The engine's canonical turns are never mutated.
export function createMultiplayerProjection(api){
 let live=null,last=null,base=null,baseLength=0,projected=null,projectedLive=null;
 return {
  receive(packet){
   if(!packet?.visual){live=null;return;}
   if(last?.id===packet.id&&last.seq>=packet.seq)return;
   last={id:packet.id,seq:packet.seq};
   if(!live||live.id!==packet.id)live={id:packet.id,status:'STREAMING'};
   Object.assign(live,{displayText:packet.visual.text,text:'',dialogueAnnotations:packet.visual.annotations||[],dialogueProtocol:'WRITER_INLINE_NAME_V1'});
  },
  clear(){live=null;last=null;base=null;projected=null;projectedLive=null;},
  turns(){const turns=api._turns();if(!live||turns.at(-1)?.id===live.id)return turns;if(base!==turns||baseLength!==turns.length||projectedLive!==live){base=turns;baseLength=turns.length;projectedLive=live;projected=[...turns,live];}return projected;},
 };
}
export function createInputNotice(element,{now=Date.now,schedule=setTimeout,cancel=clearTimeout}={}){
 const seen=new Set();let timer;
 return row=>{
  if(!row?.id||seen.has(row.id))return;
  seen.add(row.id);if(seen.size>64)seen.delete(seen.values().next().value);
  const remaining=Math.min(10000,Date.parse(row.createdAt)+10000-now());if(!(remaining>0))return;
  cancel(timer);element.replaceChildren();
  const name=element.ownerDocument.createElement('strong'),text=element.ownerDocument.createElement('p');
  name.textContent=String(row.name||'참가자')+' · 입력';text.textContent=String(row.text||'장면 이어가기').slice(0,12000);
  element.append(name,text);element.hidden=false;timer=schedule(()=>{element.hidden=true;},remaining);
 };
}

// Automatic reading never chooses or submits a player's action. At the tail
// every reader waits; only the current player receives the input controls.
export function multiplayerReadStep({hasPage,blocked,revealing,growing,voicePhase,hasNext,busy,awaiting,tailStatus,actions}){
 if(!hasPage||blocked||revealing||growing||['preparing','playing'].includes(voicePhase))return 'wait';
 if(hasNext)return 'advance';
 if(actions||busy||awaiting||['STREAMING','ADJUDICATION_PENDING'].includes(tailStatus))return 'wait';
 return 'choices';
}
