import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkMusic, musicKey, createMusicSettings} from '../public/vn-work-music.mjs';

const deferred = () => { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}; };
const param = ()=>({value:0,setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}});
const node = ()=>({connect(){},disconnect(){}});
const buffer = (data,sr)=>({numberOfChannels:1,sampleRate:sr,duration:data.length/sr,getChannelData:()=>data});
const blob = new Blob(['fixture'],{type:'audio/mpeg'});

test('stale audio analysis cannot overwrite replacement or disconnected songs', async () => {
// Hold the real engine's decoder while its stored song is disconnected/replaced.
for (const replacement of ['disabled','new-song']) {
  const key = musicKey('test-work','normal'), old = {key,blob,title:'old-song',savedAt:1};
  const records = new Map([[key,old]]), started=deferred(), pending=deferred();
  const data=new Float32Array(44100); for(let i=0;i<data.length;i++)data[i]=Math.sin(i/15)*.1;
  let decodes=0;
  const ctx={state:'running',currentTime:0,destination:node(),createGain:()=>({...node(),gain:param()}),createBufferSource:()=>({...node(),start(){},stop(){}}),decodeAudioData:()=>{if(decodes++===0){started.resolve();return pending.promise}return Promise.resolve(buffer(data,44100))},close:async()=>{}};
  const music=createWorkMusic({enabled:()=>true,volume:()=>1,createContext:()=>ctx,read:async k=>records.get(k),write:async row=>records.set(row.key,row)});
  const first=music.update('test-work','normal'); await started.promise;
  const intended = replacement==='disabled' ? {key,disabled:true} : {key,blob,title:'new-paid-song',savedAt:2,previous:old,analysis:{version:1,gain:1,loop:{start:0,end:1,crossfade:0},grid:null}};
  records.set(key,intended);
  // Exact onChange callback used by the settings save/remove handlers.
  music.invalidate();await new Promise(r=>setTimeout(r,10));
  pending.resolve(buffer(data,44100)); await first; music.dispose();
  const actual=records.get(key);
  assert.deepEqual(actual,intended);
}

});
test('completed paid music stays with requesting work after work change', async () => {
// Minimal DOM stand-in for the actual settings event handler; no provider request.
class El {
  constructor(tag){this.tag=tag;this.children=[];this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.files=[];this.map=new Map();}
  append(...items){this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=items.find(v=>v?.value)?.value||'';}
  querySelector(selector){return this.map.get(selector);}
  querySelectorAll(selector){if(selector==='input:checked')return this.children.flatMap(v=>v.children||[]).filter(v=>v.tag==='input'&&v.checked);return [...this.map.values()].filter(v=>['input','select','button'].includes(v.tag));}
  set innerHTML(value){for(const m of value.matchAll(/<(select|input|button|p|audio|textarea|fieldset)\b[^>]*class="([^"]+)"[^>]*>/g))this.map.set('.'+m[2],new El(m[1]));}
}
globalThis.document={createElement:tag=>new El(tag)};
let activeWork='work-A';const calls=[],writes=[],generating=deferred(),complete=deferred(),parent=new El('div');
createMusicSettings({parent,getWork:()=>activeWork,getGeminiKey:()=> 'test-key',getWorkInfo:()=>({title:activeWork}),onChange(){},read:async()=>null,write:async row=>writes.push(row),generate:async args=>{calls.push(args);generating.resolve();return complete.promise;}});
const box=parent.children[0];box.querySelector('.vn-track-mood').value='normal';
const make=box.querySelector('.vn-ai-generate').onclick(); await generating.promise;
activeWork='work-B';complete.resolve({blob,text:'fixture'});await make;
assert.equal(calls.length,1); assert.equal(writes.length,1); assert.equal(writes[0].key,musicKey('work-A','normal')); delete globalThis.document;


});

