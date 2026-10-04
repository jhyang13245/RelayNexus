import {cuePlan} from './cortex-vn-performance.mjs';

// One clock follows actual rendered glyphs (the room clock in multiplayer).
// No autonomous polling, network requests, or retries. Future plans can arrive
// late but cannot retroactively fire an already passed cue.
export function createCuePlayer({fire=()=>{},release=()=>{},now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let key='', plan=[], latest={}, count=0, fired=new Set(), timer=0, holdUntil=0, signature='', held=false;
  const clear=()=>{clearTimer(timer);timer=0;holdUntil=0;};
  function reset(){clear();key='';plan=[];fired.clear();signature='';count=0;held=false;latest={};}
  return {
    reset,
    get blocked(){return holdUntil>now();},
    update(input){
      if(input.key!==key){reset();key=input.key;}
      latest={...input,fresh:input.fresh||latest.fresh===true};
      const sig=JSON.stringify([input.direction,input.text]);
      if(sig!==signature){
        signature=sig;plan=cuePlan(input.direction,input.text);
        plan.forEach((cue,i)=>{if(count>0&&cue.at<=count)fired.add(i);});
      }
      if(!input.enabled||!latest.fresh||input.paused)clear();
    },
    progress(value,{voicePhase='idle',jump=false}={}){
      if(!key)return;
      const before=count;count=Math.max(count,Number(value)||0);
      if(!latest.enabled||!latest.fresh||latest.waiting||latest.paused){plan.forEach((cue,i)=>{if(cue.at<=count)fired.add(i);});return;}
      const total=Array.from(latest.text||'').length;
      const eligible=plan.map((cue,i)=>({...cue,i})).filter(cue=>!fired.has(cue.i)&&cue.at<=count);
      // An explicit fast-forward catches up the text, without a burst of sounds.
      const skipped=jump||count-before>32;
      for(const cue of eligible){
        if(cue.when==='voice-end'&&!latest.multiplayer&&['preparing','playing'].includes(voicePhase))continue;
        fired.add(cue.i);
        if(!skipped)fire(cue,latest);
      }
      if(!held&&total&&count>=total){
        held=true;
        const ms=latest.multiplayer||skipped?0:Math.min(1200,latest.direction?.performance?.pauseMs||0);
        if(ms>0){holdUntil=now()+ms;timer=setTimer(()=>{clear();release();},ms);}
      }
    },
  };
}

// Freeze already-visible same-identity art during a sentence; the next page
// admits a ready expression/pose. A newly identified speaker may still appear.
export function createPortraitContinuity(){
  let key='', portraits=new Map();
  return {reset(){key='';portraits.clear();},select(view,{pageKey,open=false}={}){
    if(!view)return view;
    if(key!==pageKey){key=pageKey;portraits.clear();}
    const ids=new Set((view.portraits||[]).map(p=>p.id));
    for(const id of portraits.keys())if(!ids.has(id))portraits.delete(id);
    return {...view,portraits:(view.portraits||[]).map(person=>{
      const old=portraits.get(person.id);
      if(!old||!old.url||open||old.baseKey!==person.baseKey){portraits.set(person.id,person);return person;}
      // Presence, public name and latest errors remain authoritative.
      return {...person,url:old.url,base:old.base,pose:old.pose,motion:old.motion,expression:old.expression,expressionReady:old.expressionReady};
    })};
  }};
}
