import {foleyScore} from './cortex-vn-foley-score.mjs';
// The app supplies its existing media-session-aware context factory. No remote
// sound files, extra credentials, decoding jobs or timers while idle.
export function createFoley({createContext,enabled=()=>false,speaking=()=>false}={}){
  let context,buffer;
  const live=new Set();
  function stop(){for(const source of live){try{source.stop();}catch{}}live.clear();}
  return {stop,
    resume(){if(enabled()){try{context ||= createContext();void context.resume().catch(()=>{});}catch{}}},
    play(kind,seed=1){
      if(!enabled()||live.size>20)return false;
      const events=foleyScore(kind,seed);if(!events.length)return false;
      try{
        context ||= createContext();
        if(context.state!=='running')return false; // Never replay late after unlock.
        if(!buffer){buffer=context.createBuffer(1,Math.ceil(context.sampleRate*1.5),context.sampleRate);let s=137;
          const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++){s=(Math.imul(s,1664525)+1013904223)>>>0;data[i]=(s/4294967296)*2-1;}}
        const start=context.currentTime+.008;
        for(const e of events){
          const source=e.type==='tone'?context.createOscillator():context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter();
          const pan=context.createStereoPanner?.(),at=start+e.at,end=at+e.duration;
          if(e.type==='tone'){source.type='sine';source.frequency.setValueAtTime(e.frequency,at);source.frequency.exponentialRampToValueAtTime(e.endFrequency,end);}
          else source.buffer=buffer;
          filter.type=e.filter;filter.frequency.setValueAtTime(e.frequency,at);filter.frequency.exponentialRampToValueAtTime(e.endFrequency,end);filter.Q.value=e.q;
          gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(e.gain*(speaking()?.35:.65),at+Math.min(.008,e.duration/4));gain.gain.exponentialRampToValueAtTime(.0001,end);
          source.connect(filter);filter.connect(gain);
          if(pan){pan.pan.value=e.pan;gain.connect(pan);pan.connect(context.destination);}else gain.connect(context.destination);
          live.add(source);source.onended=()=>{live.delete(source);source.disconnect();filter.disconnect();gain.disconnect();pan?.disconnect();};
          source.start(at);source.stop(end+.01);
        }return true;
      }catch{return false;}
    },
    dispose(){stop();buffer=null;void context?.close();context=null;},
  };
}
