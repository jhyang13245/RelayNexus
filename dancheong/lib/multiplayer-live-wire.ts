// Public presentation only. The canonical story/claim protocol is independent.
export type LivePacket = {id:string;seq:number;input:string;blocks:any[];visual?:{text:string;annotations:any[]}};
export type LiveBasis = {id:string;seq:number;n:number;head:string;tail:string;length:number;text:string;input:string;visual?:{length:number;text:string;annotations:string}};
const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,'0')).join('');
const identity=(b:any)=>b?{...b,text:'',end:0}:null;
export async function liveBasis(packet:LivePacket):Promise<LiveBasis>{
 const tail=packet.blocks.at(-1),[head,shape,text,input]=await Promise.all([hash(packet.blocks.slice(0,-1)),hash(identity(tail)),hash(tail?.text||''),hash(packet.input)]);
 return {id:packet.id,seq:packet.seq,n:packet.blocks.length,head,tail:shape,length:tail?.text?.length||0,text,input,...(packet.visual?{visual:{length:packet.visual.text.length,text:await hash(packet.visual.text),annotations:await hash(packet.visual.annotations)}}:{})};
}
export function parseLiveBasis(value:unknown):LiveBasis|null{
 try{const b=typeof value==='string'?(value.length<=1024?JSON.parse(value):null):value as any;
  if(b?.visual&&(!Number.isSafeInteger(b.visual.length)||b.visual.length<0||b.visual.length>24000||!['text','annotations'].every(k=>/^[a-f0-9]{64}$/.test(b.visual[k]))))return null;
  return b&&typeof b.id==='string'&&b.id.length<=160&&Number.isSafeInteger(b.seq)&&b.seq>0&&Number.isSafeInteger(b.n)&&b.n>=0&&b.n<=512&&Number.isSafeInteger(b.length)&&b.length>=0&&b.length<=24000&&['head','tail','text','input'].every(k=>/^[a-f0-9]{64}$/.test(b[k]))?b:null;
 }catch{return null}
}
export async function liveDelta(packet:LivePacket,basis:unknown):Promise<any>{
 const b=parseLiveBasis(basis);if(!b||b.id!==packet.id||b.seq>=packet.seq||b.n>packet.blocks.length)return packet;
 const from=Math.max(0,b.n-1);if(await hash(packet.blocks.slice(0,from))!==b.head)return packet;
 const tail=packet.blocks[from];let append;
 if(b.n&&tail&&tail.text.length>=b.length&&await hash(identity(tail))===b.tail&&await hash(tail.text.slice(0,b.length))===b.text)append={text:tail.text.slice(b.length),end:tail.end};
 let visual:any=packet.visual?{visual:packet.visual}:{};
 if(packet.visual&&b.visual&&packet.visual.text.length>=b.visual.length&&await hash(packet.visual.text.slice(0,b.visual.length))===b.visual.text){
  visual={visualDelta:{append:packet.visual.text.slice(b.visual.length),...(await hash(packet.visual.annotations)!==b.visual.annotations?{annotations:packet.visual.annotations}:{})}};
 }
 const delta={wire:'LIVE_DELTA_V1',id:packet.id,seq:packet.seq,baseSeq:b.seq,from,...visual,...(append?{append}:{}),blocks:packet.blocks.slice(from+(append?1:0)),...(await hash(packet.input)!==b.input?{input:packet.input}:{})};
 return JSON.stringify(delta).length<JSON.stringify(packet).length?delta:packet;
}
export function applyLiveDelta(base:LivePacket|null,value:any):LivePacket|null{
 if(value?.wire!=='LIVE_DELTA_V1')return value;
 if(!base||base.id!==value.id||base.seq!==value.baseSeq||!Number.isSafeInteger(value.seq)||value.seq<=base.seq||!Number.isSafeInteger(value.from)||value.from<0||value.from>base.blocks.length||!Array.isArray(value.blocks))return null;
 const blocks=base.blocks.slice(0,value.from);
 if(value.append){const tail=base.blocks[value.from];if(!tail||typeof value.append.text!=='string')return null;blocks.push({...tail,text:tail.text+value.append.text,end:value.append.end})}
 blocks.push(...value.blocks);if(blocks.length>512)return null;
 let visual=value.visual;
 if(value.visualDelta){if(!base.visual||typeof value.visualDelta.append!=='string')return null;visual={text:base.visual.text+value.visualDelta.append,annotations:value.visualDelta.annotations||base.visual.annotations};}
 return {id:value.id,seq:value.seq,input:typeof value.input==='string'?value.input:base.input,blocks,...(visual?{visual}:{})};
}
