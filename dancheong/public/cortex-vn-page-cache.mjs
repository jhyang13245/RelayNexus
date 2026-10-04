// Completed history is immutable between engine events. Polling checks only
// the live tail; explicit engine events invalidate the fast path. Weak keys
// release replaced/imported turns, and no second full-text JSON copy is kept.
export function createCachedPages(parse) {
  const cache=new WeakMap();let previousTurns=null,previousLength=-1,tail=null,parts=[],pages=[],dirty=true;
  const stamp=(turn,index)=>({index,id:turn.id,status:turn.status,text:turn.status==='COMMITTED'?turn.text:turn.displayText??turn.sameTurnResume?.publicText,
    annotations:JSON.stringify((turn.dialogueAnnotations||[]).map(r=>r&&[r.offset,r.quoteText,r.speakerName,r.characterId,r.speakerRef,r.presence,r.quoteKind,r.bindingInvalid]))});
  const same=(a,b)=>a&&b&&a.index===b.index&&a.id===b.id&&a.status===b.status&&a.text===b.text&&a.annotations===b.annotations;
  const collect=turns=>{
    const last=turns.length?stamp(turns.at(-1),turns.length-1):null;
    if(!dirty&&turns===previousTurns&&turns.length===previousLength&&(same(last,tail)||!last&&!tail))return pages;
    const next=turns.map((turn,index)=>{const key=index===turns.length-1?last:stamp(turn,index);let item=cache.get(turn);if(!same(item?.key,key)){item={key,pages:parse(turn,index)};cache.set(turn,item);}return item.pages;});
    if(next.length!==parts.length||next.some((part,i)=>part!==parts[i])){parts=next;pages=parts.flat();}
    previousTurns=turns;previousLength=turns.length;tail=last;dirty=false;return pages;
  };
  collect.invalidate=()=>{dirty=true;};return collect;
}
