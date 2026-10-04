import {applyLiveDelta,liveDelta} from './multiplayer-live-wire';
// One bounded, replaceable public presentation per room. Never a canonical save.
export const LIVE_MAX_BYTES = 96 * 1024;
export function validateLivePresentation(value: any) {
  const string = (v: unknown, max: number) => {
    if (typeof v !== 'string' || v.length > max) throw Error('공유 표시 형식이 올바르지 않습니다.');
    return v;
  };
  const offset = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 100000 ? Number(v) : 0;
  if (!value || !Number.isSafeInteger(value.seq) || value.seq < 1 || value.seq > 1000000 || !Array.isArray(value.blocks) || value.blocks.length > 512) throw Error('공유 표시 범위를 초과했습니다.');
  const result = {seq:value.seq, id:string(value.id,160), input:string(value.input,12000), blocks:value.blocks.map((b:any) => {
    if (!b || !['text','dialogue','portrait'].includes(b.kind)) throw Error('지원하지 않는 본문 표시입니다.');
    return {kind:b.kind, text:string(b.text,24000), name:string(b.name||'',160), role:string(b.role||'',160), portrait:string(b.portrait||'',160), start:offset(b.start), end:offset(b.end)};
  })};
  if(value.visual){
    const text=string(value.visual.text,24000);
    const annotations=(Array.isArray(value.visual.annotations)?value.visual.annotations:[]).slice(0,128).filter((a:any)=>Number.isSafeInteger(a?.offset)&&a.offset>=0&&typeof a.quoteText==='string'&&a.quoteText.length<=4000&&text.slice(a.offset,a.offset+a.quoteText.length)===a.quoteText&&typeof a.speakerName==='string'&&a.speakerName.length<=100).map((a:any)=>({offset:a.offset,quoteText:a.quoteText,speakerName:a.speakerName,source:a.quoteKind==='NON_SPEECH'?'WRITER_NON_SPEECH_QUOTE':'WRITER_PUBLIC_NAME',bindingVersion:2,...(/^w:[a-z0-9]{1,7}:[a-z0-9]{1,7}$/.test(a.speakerRef||'')?{speakerRef:a.speakerRef}:{}),...(['PHYSICAL','REMOTE'].includes(a.presence)?{presence:a.presence}:{}),...(a.quoteKind==='NON_SPEECH'?{quoteKind:'NON_SPEECH'}:{})}));
    Object.assign(result,{visual:{text,annotations}});
  }
  if (!result.id || new TextEncoder().encode(JSON.stringify(result)).byteLength > LIVE_MAX_BYTES) throw Error('공유 표시 용량을 초과했습니다.');
  return result;
}

export async function publishLivePresentation(db:any, roomId:string, accountId:string, token:string, value:unknown) {
  let baseSeq:number|null=null;
  if((value as any)?.wire==='LIVE_DELTA_V1'){
    // Read only this claimant's public frame. Never use a previous writer's basis.
    const row=await db.prepare('SELECT payload_json,seq FROM multiplayer_cortex_live WHERE room_id=? AND token=?').bind(roomId,token).first();
    const base=row?validateLivePresentation(JSON.parse(row.payload_json)):null;
    const next=applyLiveDelta(base,value);if(!next)return {accepted:false,resync:true};
    baseSeq=base!.seq;value=next;
  }
  const payload=validateLivePresentation(value),now=new Date().toISOString();
  // Atomic fencing: a late upload cannot survive abort, turn advance, membership change,
  // lease expiry or a newer sequence. At most two writes/second even from old clients.
  const result=await db.prepare(`INSERT INTO multiplayer_cortex_live (room_id,token,seq,payload_json,updated_at)
    SELECT room_id,?, ?, ?, ? FROM multiplayer_cortex_state s
    WHERE s.room_id=? AND s.claim_token=? AND s.claim_account_id=? AND s.claim_expires_at>?
      AND EXISTS(SELECT 1 FROM multiplayer_rooms r WHERE r.id=s.room_id AND r.revision=s.claim_room_revision AND r.status IN ('ACTIVE','SOLO','PAUSED_KEY'))
    ON CONFLICT(room_id) DO UPDATE SET token=excluded.token,seq=excluded.seq,payload_json=excluded.payload_json,updated_at=excluded.updated_at
    WHERE (? IS NULL OR multiplayer_cortex_live.seq=?) AND (multiplayer_cortex_live.token<>excluded.token OR (multiplayer_cortex_live.seq<excluded.seq AND multiplayer_cortex_live.updated_at<=?))`)
    .bind(token,payload.seq,JSON.stringify(payload),now,roomId,token,accountId,now,baseSeq,baseSeq,new Date(Date.now()-500).toISOString()).run();
  if(result.meta.changes)return {accepted:true};
  // Lost HTTP acknowledgements must not keep resending a final frame forever.
  // Re-acknowledge only byte-identical public content under the still-valid claim.
  const receipt=await db.prepare(`SELECT l.seq,l.payload_json FROM multiplayer_cortex_live l JOIN multiplayer_cortex_state s ON s.room_id=l.room_id JOIN multiplayer_rooms r ON r.id=s.room_id
    WHERE l.room_id=? AND l.token=? AND s.claim_token=? AND s.claim_account_id=? AND s.claim_expires_at>? AND r.revision=s.claim_room_revision AND r.status IN ('ACTIVE','SOLO','PAUSED_KEY')`).bind(roomId,token,token,accountId,now).first();
  return {accepted:Boolean(receipt&&Number(receipt.seq)===payload.seq&&receipt.payload_json===JSON.stringify(payload)),...(baseSeq!==null&&receipt&&Number(receipt.seq)!==baseSeq?{resync:true}:{})};
}

export async function readLivePresentation(db:any,roomId:string,state:any,room:any,after:number,id:string,basis?:unknown) {
  if(!state.claim_token || String(state.claim_expires_at)<=new Date().toISOString() || Number(state.claim_room_revision)!==Number(room.revision) || !['ACTIVE','SOLO','PAUSED_KEY'].includes(String(room.status)))return null;
  // Return only a receipt when the spectator already acknowledged this frame.
  // Keep the token + exact public id check: sequence numbers alone are not identity.
  const row=await db.prepare("SELECT seq,CASE WHEN seq=? AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json,'$.id')=? ELSE 0 END THEN NULL ELSE payload_json END AS payload_json FROM multiplayer_cortex_live WHERE room_id=? AND token=?").bind(after,id,roomId,state.claim_token).first();
  if(!row)return null;
  if(row.payload_json===null)return {unchanged:true,baseRevision:Number(state.revision)};
  try{const payload=validateLivePresentation(JSON.parse(row.payload_json));return payload.id===id&&Number(row.seq)<=after?{unchanged:true,baseRevision:Number(state.revision)}:{...await liveDelta(payload,basis),baseRevision:Number(state.revision)}}catch{return null}
}
