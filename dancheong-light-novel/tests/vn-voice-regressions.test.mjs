import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVoice, voiceLine} from '../public/vn-voice.mjs';
import {readableTurnPages} from '../public/vn-core.mjs';
import {createVoicePlayer,analyzeVoice} from '../public/vn-voice-post.mjs';

test('later acting cues never restart or rebill a playing line', async () => {
const source=readFileSync(new URL('../public/vn.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function voiceDelivery('),source.indexOf('function stopPlayback()',source.indexOf('function voiceDelivery(')));
const state={pages:[],cursor:0};const delivery=new Function('state',helper+'\nreturn voiceDelivery;')(state);
const view={castStatus:'ready',speakerId:'n',speakerName:'나디아',direction:{mood:'normal',expressions:{n:'neutral'}},portraits:[{id:'n',profile:'여성'}]};
let requests=0,played=0,pauses=0;
const voice=createVoice({getEnabled:()=>true,getKey:()=> 'test-key',read:async()=>null,write:async()=>{},fetchVoice:async()=>{requests++;return Response.json({audioUrl:'data:audio/mpeg;base64,AAAA'})},makeAudio:()=>({play:async()=>{played++},pause(){pauses++},set currentTime(v){}})});
for(const text of ['“괜찮아.” 나디아가','“괜찮아.” 나디아가 속삭였다.']){
  state.pages=readableTurnPages({id:'turn',status:'STREAMING',displayText:text},0);
  const page=state.pages[0];voice.update(voiceLine(page,view,'test-work','coral',delivery(page,view)));
  for(let i=0;i<100&&voice.phase!=='playing';i++)await new Promise(r=>setTimeout(r,2));
}
assert.equal(pauses,0); voice.stop();assert.equal(requests,1); assert.equal(played,1); });

test('equal-length audio with matching silence tails keeps independent speech bounds', async () => {
// Real distinct PCM WAV fixtures have the same total size and trailing silence.
const sr=16000, n=sr*2;
function wave(start,end){
  const bytes=Buffer.alloc(44+n*2);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(sr,24);bytes.writeUInt32LE(sr*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(n*2,40);
  for(let i=sr*start;i<sr*end;i++)bytes.writeInt16LE(Math.round(9000*Math.sin(i/10)),44+i*2);
  return 'data:audio/wav;base64,'+bytes.toString('base64');
}
const urls=[wave(.2,.6),wave(.9,1.4)],starts=[];
const node=()=>({connect(){},disconnect(){}}),param=()=>({value:0});
const ctx={state:'running',sampleRate:sr,destination:node(),
  decodeAudioData:async bytes=>{const dv=new DataView(bytes),a=new Float32Array((bytes.byteLength-44)/2);for(let i=0;i<a.length;i++)a[i]=dv.getInt16(44+i*2,true)/32768;return{numberOfChannels:1,sampleRate:sr,getChannelData:()=>a};},
  createGain:()=>({...node(),gain:param()}),createBiquadFilter:()=>({...node(),gain:param(),frequency:param(),Q:param()}),createConvolver:()=>node(),
  createBuffer:(_,length)=>({getChannelData:()=>new Float32Array(length)}),createBufferSource:()=>({...node(),start:(at,offset,duration)=>starts.push({offset,duration}),stop(){}})
};
const player=createVoicePlayer({createContext:()=>ctx});
const expected=[];
for(const url of urls){const ab=await(await fetch(url)).arrayBuffer(),b=await ctx.decodeAudioData(ab);const analysis=analyzeVoice([b.getChannelData(0)],sr);expected.push({offset:analysis.start,duration:analysis.end-analysis.start});const audio=player(url);await audio.play();audio.pause();}
assert.notEqual(urls[0],urls[1]); assert.equal(urls[0].length,urls[1].length); assert.equal(urls[0].slice(-128),urls[1].slice(-128)); assert.deepEqual(starts,expected); });

