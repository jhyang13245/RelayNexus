import {requireMultiplayerMembership} from './multiplayer-store';
import {database,objectStorage} from './simulation-store';
import {roomPresentation} from './multiplayer-presentation';
import type {RelayAccountContext} from './account-store';

export const VISUAL_SCHEMA = `CREATE TABLE IF NOT EXISTS multiplayer_visual_assets (
 room_id TEXT NOT NULL, key TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
 token TEXT NOT NULL, account_id TEXT NOT NULL, expires_at TEXT NOT NULL,
 object_key TEXT, bytes INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
 PRIMARY KEY(room_id,key))`;
const validKey=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const tokenOK=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(v);
// All built-in multiplayer cast/image/voice transports used the raw account ID.
// Every corresponding /api/vn route ran vnAccess before contacting a provider.
// Thus finished legacy jobs BEFORE this pre-deployment cutoff were unpaid.
// Never reclaim ready/running/new-protocol jobs or later uncertain outcomes.
const LEGACY_MEDIA_ACCESS_FIX='2026-09-28T17:52:36.000Z';
export function visualRecord(value:any,kind:string){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.key!=='string'||value.key.length>100000)throw Error('자산 형식을 확인해 주세요.');
 const allowed=['key','url','policy','decision','savedAt','purpose','provider','model','speakerId','voice','voiceName','stageFrame','frameReview','camera','chromaVersion','matteColor','rejected','rejectedImageUrl','motionPolicy','characterId','heightCm','scope','expression','wardrobe','sourceKey','eventIdentity'];
 const record=Object.fromEntries(allowed.filter(k=>k in value).map(k=>[k,value[k]]));
 if(kind==='cast') { if(typeof record.policy!=='string'||!record.decision||typeof record.decision!=='object')throw Error('인물 판정 형식을 확인해 주세요.'); }
 else if(!record.rejected&&!new RegExp(kind==='voice'?'^data:audio/(?:mpeg|mp3|wav|x-wav|ogg|opus|webm|aac|mp4);base64,':'^data:image/(?:png|jpeg|webp);base64,').test(record.url||''))throw Error('자산 미디어 형식을 확인해 주세요.');
 const text=JSON.stringify(record);
 if(/"(?:apiKey|authorization|access_token|refresh_token|password)"\s*:/iu.test(text)||new TextEncoder().encode(text).byteLength>12*1024*1024)throw Error('자산에 연결 정보가 있거나 용량이 너무 큽니다.');
 return text;
}
// Media claims never hold the story's turn lease. Expired paid jobs are uncertain,
// not automatically taken over: a lost provider response is not proof of no charge.
export async function visualOperation(account:RelayAccountContext,code:string,body:any){
 const access=await requireMultiplayerMembership(account,code),db=await database(),roomId=String(access.room.id);
 const settings=JSON.parse(String(access.room.settings_json||'{}'));
 if(roomPresentation(settings.engine,settings.presentation)!=='visual')throw Error('비주얼노벨 방에서만 사용할 수 있습니다.');
 if(process.env.NODE_ENV!=='production')await db.prepare(VISUAL_SCHEMA).run();
 const now=new Date().toISOString();
 if(body.action==='lookup'){
  if(!Array.isArray(body.keys)||body.keys.length>16||!body.keys.every(validKey))throw Error('자산 조회 범위를 확인해 주세요.');
  if(!body.keys.length)return {rows:[]};
  const rows=await db.prepare(`SELECT key,status,expires_at,bytes FROM multiplayer_visual_assets WHERE room_id=? AND key IN (${body.keys.map(()=>'?').join(',')})`).bind(roomId,...body.keys).all();
  return {rows:(rows.results||[]).map((r:any)=>({key:r.key,status:r.status==='running'&&r.expires_at<now?'uncertain':r.status,bytes:r.bytes}))};
 }
 if(!validKey(body.key))throw Error('자산 식별자를 확인해 주세요.');
 if(body.action==='read'){
  const row=await db.prepare("SELECT object_key FROM multiplayer_visual_assets WHERE room_id=? AND key=? AND status='ready'").bind(roomId,body.key).first() as any;
  if(!row?.object_key)return {record:null};
  const object=await (await objectStorage()).get(row.object_key);if(!object)throw Error('공유 자산을 다시 확인해 주세요.');
  return {record:JSON.parse(await object.text())};
 }
 if(access.room.status==='CLOSED'||!tokenOK(body.token))throw Error('자산 준비 권한이 없습니다.');
 const kind=String(body.kind||'');if(!['cast','image','voice'].includes(kind))throw Error('지원하지 않는 자산입니다.');
 if(body.action==='claim'){
  // The originating story turn owns all paid work, even when readers advance
  // at different speeds. Committed billing receipts survive the turn handoff.
  const turn=body.turn;
  if(!Number.isSafeInteger(turn)||turn<0)throw Error('자산의 원래 턴을 확인할 수 없습니다. 화면을 새로 열어 주세요.');
  const state=await db.prepare('SELECT turn,claim_account_id,claim_expires_at FROM multiplayer_cortex_state WHERE room_id=?').bind(roomId).first() as any;
  let payer='';
  if(state&&turn<=Number(state.turn)){
   const receipt=await db.prepare('SELECT payer_account_id FROM multiplayer_cost_ledger WHERE room_id=? AND story_turn=? AND success=1 ORDER BY recorded_at DESC LIMIT 1').bind(roomId,turn).first() as any;
   // Opening/imported history predates this room's turn ledger and belongs to its host.
   payer=String(receipt?.payer_account_id||access.room.host_account_id);
  }else if(state&&turn===Number(state.turn)+1&&String(state.claim_expires_at)>now)payer=String(state.claim_account_id||'');
  if(payer!==account.id)return {claimed:false,status:'waiting-owner'};
  if(body.canProduce===false)return {claimed:false,status:'needs-key'};
  // No credential is stored here. Only this turn's payer may reserve new work.
  await db.prepare(`INSERT INTO multiplayer_visual_assets(room_id,key,kind,status,token,account_id,expires_at,updated_at)
   SELECT ?,?,?,'running',?,?,?,? WHERE (SELECT COUNT(*) FROM multiplayer_visual_assets WHERE room_id=? AND status='running' AND expires_at>?)<3
   AND EXISTS(SELECT 1 FROM multiplayer_cortex_state s JOIN multiplayer_rooms r ON r.id=s.room_id WHERE s.room_id=? AND
    ((?<=s.turn AND COALESCE((SELECT payer_account_id FROM multiplayer_cost_ledger WHERE room_id=s.room_id AND story_turn=? AND success=1 ORDER BY recorded_at DESC LIMIT 1),r.host_account_id)=?)
     OR (?=s.turn+1 AND s.claim_account_id=? AND s.claim_expires_at>?)))
   ON CONFLICT(room_id,key) DO UPDATE SET status='running',token=excluded.token,expires_at=excluded.expires_at,updated_at=excluded.updated_at
   WHERE multiplayer_visual_assets.kind=excluded.kind
    AND multiplayer_visual_assets.status='uncertain' AND multiplayer_visual_assets.object_key IS NULL
    AND multiplayer_visual_assets.account_id=excluded.account_id
    AND multiplayer_visual_assets.updated_at<? AND multiplayer_visual_assets.token NOT LIKE 'vn2-%'
    AND excluded.token LIKE 'vn2-%'`).bind(roomId,body.key,kind,body.token,account.id,new Date(Date.now()+300000).toISOString(),now,roomId,now,roomId,turn,turn,account.id,turn,account.id,now,LEGACY_MEDIA_ACCESS_FIX).run();
  const row=await db.prepare('SELECT status,token,account_id,expires_at FROM multiplayer_visual_assets WHERE room_id=? AND key=?').bind(roomId,body.key).first() as any;
  return {claimed:row?.status==='running'&&row.token===body.token&&row.account_id===account.id&&row.expires_at>now,status:row?.status||'queued'};
 }
 const row=await db.prepare('SELECT * FROM multiplayer_visual_assets WHERE room_id=? AND key=?').bind(roomId,body.key).first() as any;
 if(!row||row.token!==body.token||row.account_id!==account.id||row.kind!==kind)throw Error('자산 준비 권한이 변경되었습니다.');
 if(body.action==='publish'&&row.status==='ready')return {saved:true};
 if(row.status!=='running')throw Error('완료된 자산 요청입니다.');
 if(body.action==='release'){
  await db.prepare("DELETE FROM multiplayer_visual_assets WHERE room_id=? AND key=? AND token=? AND status='running'").bind(roomId,body.key,body.token).run();return {released:true};
 }
 if(body.action==='failed'){
  await db.prepare("UPDATE multiplayer_visual_assets SET status='uncertain',updated_at=? WHERE room_id=? AND key=? AND token=? AND status='running'").bind(now,roomId,body.key,body.token).run();return {saved:true};
 }
 if(body.action!=='publish')throw Error('지원하지 않는 자산 요청입니다.');
 const text=visualRecord(body.record,kind),bytes=new TextEncoder().encode(text).byteLength;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(kind+':'+body.record.key))),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(digest!==body.key)throw Error('자산 내용과 요청 식별자가 일치하지 않습니다.');
 const objectKey=`multiplayer/${roomId}/visual/${body.key}-${body.token}.json`;
 await (await objectStorage()).put(objectKey,text,{httpMetadata:{contentType:'application/json'}});
 const result=await db.prepare("UPDATE multiplayer_visual_assets SET status='ready',object_key=?,bytes=?,updated_at=? WHERE room_id=? AND key=? AND token=? AND account_id=? AND status='running' AND EXISTS(SELECT 1 FROM multiplayer_members WHERE room_id=? AND account_id=? AND status NOT IN ('LEFT','KICKED'))")
 .bind(objectKey,bytes,now,roomId,body.key,body.token,account.id,roomId,account.id).run();
 if(!result.meta.changes){await (await objectStorage()).delete(objectKey);throw Error('자산 공유 권한이 만료되었습니다.');}
 return {saved:true};
}
