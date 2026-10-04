import type { RelayAccountContext } from "./account-store";
import { database } from "./simulation-store";
import { requireMultiplayerMembership } from "./multiplayer-store";
import { activeMembers, nextTurnMember, roomStatusForMemberCount, type TurnMember } from "./multiplayer-policy";
import { deleteRuntimeObject } from "./runtime-json-store";
import {sharedMediaVersion,storeSharedSnapshot} from './multiplayer-snapshot';
import {readMultiplayerChat} from './multiplayer-chat-read';
import {personalCopyStatements,personalCopyMetadata} from './multiplayer-personal';
import {publishLivePresentation} from './multiplayer-live';

const expires = () => new Date(Date.now()+180_000).toISOString();
const validToken = (v:unknown) => typeof v === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(v);
const MUSE_MODEL = "muse-spark-1.3-contributor";
const LUNA_MODEL = "gpt-6-luna";
const LEGACY_LUNA_MODEL = "gpt-5.6-luna";
export function cortexTurnBillingIdentity(calls: unknown) {
  const models=(Array.isArray(calls)?calls:[]).map(call=>String(call&&typeof call==="object"&&"model" in call?(call as {model?:unknown}).model||"":"")).filter(Boolean);
  const model=models.includes(MUSE_MODEL)?MUSE_MODEL:models.includes(LUNA_MODEL)?LUNA_MODEL:models.includes(LEGACY_LUNA_MODEL)?LEGACY_LUNA_MODEL:models.find(value=>!value.startsWith("gpt-image-"))||"Cortex";
  const goLuna=[LUNA_MODEL,LEGACY_LUNA_MODEL].includes(model)&&(Array.isArray(calls)?calls:[]).some(call=>call?.model===model&&call?.provider==='opencode-go-luna');
  return model===MUSE_MODEL||goLuna
    ? {model,baseUrl:"https://opencode.ai/zen/go/v1"}
    : {model,baseUrl:"https://api.openai.com/v1"};
}
export function validateCortexSharedSnapshot(snapshot:any, priorTurn:number) {
  if(!snapshot || !String(snapshot.schema||"").startsWith("CORTEX_") || !Array.isArray(snapshot.turns) || snapshot.turns.length!==priorTurn+1)throw new Error("확정된 다음 비트 한 개만 공유할 수 있습니다.");
  const last=snapshot.turns.at(-1);
  if(!last || last.status!=="COMMITTED" || last.displayTyping===true || typeof last.text!=="string" || !last.text.trim())throw new Error("본문 확정이 끝나지 않았습니다.");
  // _fullExport contains sanitized settings, never a participant's credential.
  if(snapshot.settings?.apiKey || snapshot.apiKey)throw new Error("연결 설정은 공유 저장에 포함할 수 없습니다.");
  return snapshot as Record<string,unknown>;
}

export async function cortexRoomOperation(account:RelayAccountContext,code:string,body:Record<string,any>) {
  const access=await requireMultiplayerMembership(account,code),db=await database(),roomId=String(access.room.id),now=new Date().toISOString();
  const state=await db.prepare("SELECT * FROM multiplayer_cortex_state WHERE room_id=?").bind(roomId).first() as Record<string,any>|null;
  if(!state)throw new Error("Cortex 멀티플레이 방이 아닙니다.");
  const token=String(body.token||"");
  if(!validToken(token))throw new Error("진행 요청 식별자가 올바르지 않습니다.");
  if(body.action==="begin") {
    if(body.input!==undefined&&(typeof body.input!=='string'||body.input.length>12000))throw Error('공유 입력은 12,000자 이내로 작성해 주세요.');
    if(body.input!==undefined&&(!validToken(body.submissionId)||body.submissionId===token))throw Error('입력 표시 식별자가 올바르지 않습니다.');
    const cause=body.cause==="HOST_FORCE" ? "HOST_FORCE" : body.cause==="AUTO_TIMEOUT" ? "AUTO_TIMEOUT" : "NORMAL";
    if(cause==="HOST_FORCE") {
      if(String(access.room.host_account_id)!==account.id || access.room.status!=="PAUSED_KEY")throw new Error("키 복구 대기 중인 방장만 대신 진행할 수 있습니다.");
    } else if(!["ACTIVE","SOLO"].includes(String(access.room.status)) || String(access.room.current_member_id)!==String(access.member.id))throw new Error("현재는 다른 참가자의 차례입니다.");
    if(cause==="AUTO_TIMEOUT" && (!access.room.turn_deadline_at || String(access.room.turn_deadline_at)>now))throw new Error("아직 입력 시간이 남아 있습니다.");
    if(Number(body.revision)!==Number(state.revision))throw new Error("최신 공유 기록을 먼저 불러와 주세요.");
    if(state.claim_token===token && state.claim_account_id===account.id && String(state.claim_expires_at)>now)return {token,revision:Number(state.revision)};
    const result=await db.prepare(`UPDATE multiplayer_cortex_state SET claim_token=?,claim_account_id=?,claim_expires_at=?,claim_room_revision=?,claim_cause=?
      WHERE room_id=? AND revision=? AND (claim_token IS NULL OR claim_expires_at < ?)
      AND EXISTS(SELECT 1 FROM multiplayer_rooms WHERE id=? AND revision=?)`)
      .bind(token,account.id,expires(),Number(access.room.revision),cause,roomId,Number(body.revision),now,roomId,Number(access.room.revision)).run();
    if(!result.meta.changes)throw new Error("다른 창에서 진행 중이거나 방 상태가 변경되었습니다.");
    await db.prepare("DELETE FROM multiplayer_cortex_live WHERE room_id=? AND token LIKE 'draft:%'").bind(roomId).run().catch(()=>{});
    // Publish accepted input before model preparation. Old clients may omit it.
    // The writer's live queue retries this same frame if preview publication fails.
    if(typeof body.input==='string')await publishLivePresentation(db,roomId,account.id,token,{id:'submitted-'+body.submissionId,seq:1,input:body.input,blocks:[]}).catch(()=>{});
    if(typeof body.input==='string')await db.prepare("INSERT INTO multiplayer_room_events(id,room_id,actor_account_id,actor_display_name,type,detail_json,created_at) VALUES(?,?,?,?,'CORTEX_INPUT_ACCEPTED',?,?) ON CONFLICT(id) DO NOTHING")
      .bind('input-'+body.submissionId,roomId,account.id,account.displayName,JSON.stringify({input:body.input}),now).run().catch(()=>{});
    return {token,revision:Number(state.revision)};
  }
  // The last token is a receipt: a repeated commit after a dropped response cannot advance twice.
  if(body.action==="commit" && state.last_commit_token===token)return {saved:true,revision:Number(state.revision),turn:Number(state.turn),mediaVersion:sharedMediaVersion(state),snapshotVersion:state.snapshot_sha256};
  if(state.claim_token!==token || state.claim_account_id!==account.id || String(state.claim_expires_at)<=now)throw new Error("진행 권한이 만료되었습니다. 최신 공유 기록을 다시 불러와 주세요.");
  if(body.action==="renew") {
    await db.prepare("UPDATE multiplayer_cortex_state SET claim_expires_at=? WHERE room_id=? AND claim_token=? AND claim_account_id=? AND claim_expires_at>?").bind(expires(),roomId,token,account.id,now).run();
    return {renewed:true};
  }
  if(body.action==="abort") {
    await db.prepare("UPDATE multiplayer_cortex_state SET claim_token=NULL,claim_account_id=NULL,claim_expires_at=NULL WHERE room_id=? AND claim_token=? AND claim_account_id=?").bind(roomId,token,account.id).run();
    await db.prepare('DELETE FROM multiplayer_cortex_live WHERE room_id=? AND token=?').bind(roomId,token).run().catch(()=>{});
    return {released:true};
  }
  if(body.action!=="commit")throw new Error("지원하지 않는 진행 요청입니다.");
  const snapshot=validateCortexSharedSnapshot(body.snapshot,Number(state.turn));
  const json=JSON.stringify(snapshot);
  if(new TextEncoder().encode(json).byteLength>80*1024*1024)throw new Error("공유 기록 용량이 너무 큽니다.");
  const revision=Number(state.revision)+1;
  const calls=(snapshot.turns as any[]).at(-1)?.apiLog||[];
  const cost=calls.reduce((sum:any,c:any)=>({input:sum.input+Math.max(0,Number(c.usage?.inputTokens)||0),cached:sum.cached+Math.max(0,Number(c.usage?.cachedTokens)||0),output:sum.output+Math.max(0,Number(c.usage?.outputTokens)||0),usd:sum.usd+Math.max(0,Number(c.cost?.totalUsd)||0)}),{input:0,cached:0,output:0,usd:0});
  const billing=cortexTurnBillingIdentity(calls);
  const pointer=await storeSharedSnapshot(snapshot,{ownerKey:String(access.room.host_owner_key),projectId:String(access.room.project_id),sessionId:`multiplayer-${roomId}`,revision},state,typeof body.mediaUnchanged==='string'?body.mediaUnchanged:undefined);
  const members:TurnMember[]=access.members.map((m:Record<string,unknown>)=>({id:String(m.id),accountId:String(m.account_id),seat:Number(m.seat),status:m.status as TurnMember['status']}));
  const next=nextTurnMember(members,String(access.room.current_member_id)),status=roomStatusForMemberCount(activeMembers(members).length);
  const condition="room_id=? AND claim_token=? AND claim_account_id=? AND revision=? AND claim_expires_at>? AND EXISTS(SELECT 1 FROM multiplayer_rooms WHERE id=? AND revision=?)";
  const args=[roomId,token,account.id,Number(state.revision),new Date().toISOString(),roomId,Number(state.claim_room_revision)];
  const results=await db.batch([
    db.prepare(`UPDATE multiplayer_cortex_state SET snapshot_json=?,snapshot_r2_key=?,snapshot_sha256=?,snapshot_byte_length=?,revision=?,turn=?,last_commit_token=?,claim_token=NULL,claim_account_id=NULL,claim_expires_at=NULL,updated_at=? WHERE ${condition}`)
      .bind(pointer.inline,pointer.key,pointer.sha256,pointer.byteLength,revision,Number(state.turn)+1,token,now,...args),
    // Read the deadline policy inside the commit transaction, including a host
    // change made while the large snapshot was being uploaded.
    db.prepare(`UPDATE multiplayer_rooms SET status=?,current_member_id=?,turn_deadline_at=CASE WHEN ?='ACTIVE' THEN strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+' || turn_limit_seconds || ' seconds') ELSE NULL END,key_recovery_deadline_at=NULL,paused_reason='',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM multiplayer_cortex_state WHERE room_id=? AND last_commit_token=? AND revision=?)`)
      .bind(status,next?.id||null,status,new Date().toISOString(),now,roomId,Number(state.claim_room_revision),roomId,token,revision),
    db.prepare(`INSERT INTO multiplayer_room_events (id,room_id,actor_account_id,actor_display_name,type,detail_json,created_at) SELECT ?,?,?,?,'CORTEX_TURN_COMMITTED',?,? WHERE EXISTS(SELECT 1 FROM multiplayer_cortex_state WHERE room_id=? AND last_commit_token=? AND revision=?)`)
      .bind(token,roomId,account.id,account.displayName,JSON.stringify({turn:Number(state.turn)+1,cause:state.claim_cause}),now,roomId,token,revision),
    db.prepare(`INSERT INTO multiplayer_cost_ledger (id,room_id,story_turn,payer_account_id,payer_display_name,cause,model,base_url,input_tokens,cached_input_tokens,output_tokens,estimated_cost_usd,success,recorded_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,1,? WHERE EXISTS(SELECT 1 FROM multiplayer_cortex_state WHERE room_id=? AND last_commit_token=? AND revision=?)`)
      .bind(token,roomId,Number(state.turn)+1,account.id,account.displayName,String(state.claim_cause||'NORMAL'),billing.model,billing.baseUrl,cost.input,cost.cached,cost.output,cost.usd,now,roomId,token,revision),
    ...personalCopyStatements(db,roomId,{snapshot_json:pointer.inline,snapshot_r2_key:pointer.key,snapshot_sha256:pointer.sha256,snapshot_byte_length:pointer.byteLength,revision,turn:Number(state.turn)+1,updated_at:now},personalCopyMetadata(snapshot)),
  ]);
  if(!results[0].meta.changes){await deleteRuntimeObject(pointer.key).catch(()=>{});if(pointer.updateKey)await deleteRuntimeObject(pointer.updateKey).catch(()=>{});throw new Error("방 상태가 변경되어 저장하지 않았습니다. 현재 기록을 다시 확인해 주세요.");}
  await db.prepare('DELETE FROM multiplayer_cortex_live WHERE room_id=? AND token=?').bind(roomId,token).run().catch(()=>{});
  // Keep the preceding object for in-flight readers; do not delete a snapshot another device is restoring.
  return {saved:true,revision,turn:Number(state.turn)+1,mediaVersion:JSON.parse(pointer.inline).mediaVersion,snapshotVersion:pointer.sha256};
}

export function validateChatBody(value:unknown) {
  if(typeof value!=="string")throw new Error("메시지를 입력해 주세요.");
  const body=value.trim();if(!body || body.length>1000)throw new Error("메시지는 1~1,000자로 입력해 주세요.");return body;
}
export async function roomChat(account:RelayAccountContext,code:string,input?:Record<string,unknown>,after=0) {
  const access=await requireMultiplayerMembership(account,code),db=await database(),roomId=String(access.room.id);
  if(input){
    if(access.room.status==="CLOSED")throw new Error("종료된 방에는 메시지를 보낼 수 없습니다.");
    const body=validateChatBody(input.body),id=String(input.clientId||"");if(!validToken(id))throw new Error("메시지 식별자가 올바르지 않습니다.");
    const duplicate=await db.prepare("SELECT seq FROM multiplayer_chat_messages WHERE room_id=? AND account_id=? AND client_id=?").bind(roomId,account.id,id).first();
    if(!duplicate){
      const result=await db.prepare(`INSERT INTO multiplayer_chat_messages (room_id,account_id,client_id,display_name,body,created_at)
        SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM multiplayer_chat_messages WHERE room_id=? AND account_id=? AND created_at>?)<5 ON CONFLICT(room_id,account_id,client_id) DO NOTHING`)
        .bind(roomId,account.id,id,account.displayName.slice(0,160),body,new Date().toISOString(),roomId,account.id,new Date(Date.now()-10000).toISOString()).run();
      if(!result.meta.changes)throw new Error("메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 보내 주세요.");
    }
  }
  return {messages:await readMultiplayerChat(db,roomId,account.id,after)};
}
