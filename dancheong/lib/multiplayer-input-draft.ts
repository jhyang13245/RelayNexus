// Share one replaceable input, never a transcript or canonical save. Reuse the
// room's ephemeral presentation slot; a generation claim always takes precedence.
export const INPUT_DRAFT_LIMIT=12000;
const key=(revision:number,member:string)=>`draft:${revision}:${member}`;
export async function publishInputDraft(db:any,roomId:string,accountId:string,body:any){
 if(!Number.isSafeInteger(body?.revision)||body.revision<1||!Number.isSafeInteger(body?.expectedSeq)||body.expectedSeq<0||typeof body.text!=='string'||body.text.length>INPUT_DRAFT_LIMIT||typeof body.operationId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(body.operationId))throw Error('입력 공유 형식을 확인해 주세요.');
 const now=new Date().toISOString(),payload=JSON.stringify({kind:'INPUT_DRAFT',text:body.text,operationId:body.operationId});
 const result=await db.prepare(`INSERT INTO multiplayer_cortex_live(room_id,token,seq,payload_json,updated_at)
 SELECT r.id,'draft:'||r.revision||':'||m.id,1,?,? FROM multiplayer_rooms r
 JOIN multiplayer_members m ON m.id=r.current_member_id AND m.room_id=r.id
 JOIN multiplayer_cortex_state s ON s.room_id=r.id
 WHERE r.id=? AND r.revision=? AND m.account_id=? AND m.status NOT IN ('LEFT','KICKED') AND r.status IN ('ACTIVE','SOLO') AND (s.claim_token IS NULL OR s.claim_expires_at<?)
 ON CONFLICT(room_id) DO UPDATE SET token=excluded.token,seq=CASE WHEN multiplayer_cortex_live.token=excluded.token THEN multiplayer_cortex_live.seq+1 ELSE 1 END,payload_json=excluded.payload_json,updated_at=excluded.updated_at
 WHERE (multiplayer_cortex_live.token<>excluded.token OR multiplayer_cortex_live.seq=?) AND (multiplayer_cortex_live.token<>excluded.token OR multiplayer_cortex_live.updated_at<=?)`)
 .bind(payload,now,roomId,body.revision,accountId,now,body.expectedSeq,new Date(Date.now()-800).toISOString()).run();
 const receipt=await db.prepare(`SELECT l.seq,l.payload_json FROM multiplayer_cortex_live l JOIN multiplayer_rooms r ON r.id=l.room_id JOIN multiplayer_members m ON m.id=r.current_member_id AND m.room_id=r.id
 WHERE r.id=? AND r.revision=? AND m.account_id=? AND m.status NOT IN ('LEFT','KICKED') AND l.token='draft:'||r.revision||':'||m.id`).bind(roomId,body.revision,accountId).first();
 return {accepted:Boolean(result.meta.changes||receipt?.payload_json===payload),seq:Number(receipt?.seq||0)};
}
export async function readInputDraft(db:any,room:any,state:any,after:number,revision:number){
 if(!['ACTIVE','SOLO'].includes(String(room.status))||(state.claim_token&&String(state.claim_expires_at)>new Date().toISOString()))return null;
 const row=await db.prepare('SELECT seq,CASE WHEN seq=? AND ?=? THEN NULL ELSE payload_json END AS payload_json,updated_at FROM multiplayer_cortex_live WHERE room_id=? AND token=? AND updated_at>?').bind(after,revision,Number(room.revision),String(room.id),key(Number(room.revision),String(room.current_member_id)),new Date(Date.now()-300000).toISOString()).first();
 if(!row)return null;
 if(row.payload_json===null)return {revision:Number(room.revision),seq:Number(row.seq),memberId:String(room.current_member_id),updatedAt:String(row.updated_at),unchanged:true};
 try{const p=JSON.parse(row.payload_json);if(p.kind!=='INPUT_DRAFT'||typeof p.text!=='string'||p.text.length>INPUT_DRAFT_LIMIT)return null;
  return {revision:Number(room.revision),seq:Number(row.seq),memberId:String(room.current_member_id),updatedAt:String(row.updated_at),...(revision===Number(room.revision)&&after===Number(row.seq)?{unchanged:true}:{text:p.text})};
 }catch{return null}
}
