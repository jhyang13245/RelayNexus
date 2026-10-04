import {database} from './simulation-store';
import {readRuntimeJsonText} from './runtime-json-store';
import {readSharedSnapshot} from './multiplayer-snapshot';

type Row=Record<string,any>;
type DB=Awaited<ReturnType<typeof database>>;
const fields={inline:'snapshot_json',key:'snapshot_r2_key',sha256:'snapshot_sha256',byteLength:'snapshot_byte_length'};
export function isMultiplayerCopy(row:Row){try{return JSON.parse(row.snapshot_json).multiplayerCopy===true}catch{return false}}
export async function readCortexSnapshot(row:Row){
 const split=(()=>{try{return JSON.parse(row.snapshot_json).cloudSplit===true}catch{return false}})();
 return isMultiplayerCopy(row)||split?(await readSharedSnapshot(row)).snapshot:JSON.parse(await readRuntimeJsonText(row,fields));
}

// Only server-owned room pointers reach this function. Immutable story/media bytes
// are shared, while ownership and the personal continuation are separate D1 rows.
// Run inside the same transaction as the room commit: failed commits copy nothing.
export function personalCopyStatements(db:DB,roomId:string,state:Row,meta:{title:string;location?:string;preview?:string;sourceProjectId?:string},ownerKey=''){
 const inline=JSON.stringify({...JSON.parse(String(state.snapshot_json)),multiplayerCopy:true});
 const marker="'mp-follow:' || m.id";
 const members=`SELECT m.id,m.owner_key FROM multiplayer_members m WHERE m.room_id=? AND m.status NOT IN ('LEFT','KICKED') AND (?='' OR m.owner_key=?)`;
 const fence='EXISTS(SELECT 1 FROM multiplayer_cortex_state s WHERE s.room_id=? AND s.revision=? AND s.snapshot_sha256=?)';
 const args=[roomId,Number(state.revision),state.snapshot_sha256];
 const now=String(state.updated_at),title=String(meta.title||'함께 쓴 이야기').slice(0,92)+' · 멀티 이어하기';
 const active=`EXISTS(SELECT 1 FROM multiplayer_members m WHERE m.room_id=? AND m.owner_key=cortex_cloud_sessions.owner_key AND cortex_cloud_sessions.last_writer_id=${marker} AND m.status NOT IN ('LEFT','KICKED') AND (?='' OR m.owner_key=?))`;
 return [
  db.prepare(`UPDATE cortex_cloud_sessions SET snapshot_json=?,snapshot_r2_key=?,snapshot_sha256=?,snapshot_byte_length=?,turn=?,location=?,preview=?,revision=revision+1,updated_at=?
   WHERE owner_key IN(SELECT owner_key FROM multiplayer_members WHERE room_id=?) AND ${active} AND ${fence} AND snapshot_sha256<>? AND NOT EXISTS(SELECT 1 FROM cortex_session_leases l WHERE l.id=cortex_cloud_sessions.id AND l.owner_key=cortex_cloud_sessions.owner_key AND l.expires_at>?)`)
   .bind(inline,state.snapshot_r2_key,state.snapshot_sha256,state.snapshot_byte_length,Number(state.turn),String(meta.location||'').slice(0,240),String(meta.preview||'').slice(0,240),now,roomId,roomId,ownerKey,ownerKey,...args,state.snapshot_sha256,new Date().toISOString()),
  db.prepare(`INSERT INTO cortex_cloud_sessions (id,owner_key,project_id,source_project_id,name,snapshot_json,snapshot_r2_key,snapshot_sha256,snapshot_byte_length,turn,location,preview,revision,last_writer_id,created_at,updated_at)
   SELECT 'mp-'||m.id||'-'||?,m.owner_key,
    CASE WHEN r.project_id LIKE 'cortex-import-%' OR EXISTS(SELECT 1 FROM cortex_cloud_sessions c WHERE c.owner_key=m.owner_key AND c.project_id=r.project_id) OR EXISTS(SELECT 1 FROM scenario_projects p WHERE p.id=r.project_id AND p.owner_key=m.owner_key) THEN r.project_id ELSE 'cortex-import-multiplayer-'||r.project_id END,
    ?,?,?,?,?,?,?,?,?,1,${marker},?,?
   FROM (${members}) m JOIN multiplayer_rooms r ON r.id=?
   WHERE ${fence} AND NOT EXISTS(SELECT 1 FROM cortex_cloud_sessions c WHERE c.owner_key=m.owner_key AND c.last_writer_id=${marker})
   ON CONFLICT(id) DO NOTHING`)
   .bind(Number(state.revision),String(meta.sourceProjectId||'').slice(0,200),title,inline,state.snapshot_r2_key,state.snapshot_sha256,state.snapshot_byte_length,Number(state.turn),String(meta.location||'').slice(0,240),String(meta.preview||'').slice(0,240),now,now,roomId,ownerKey,ownerKey,roomId,...args),
 ];
}

export function personalCopyMetadata(snapshot:Row){return {title:String(snapshot.scenario?.title||'함께 쓴 이야기'),sourceProjectId:String(snapshot.scenario?.runtime?.storyId||''),location:String(snapshot.scenario?.world?.location||''),preview:String(snapshot.turns?.at(-1)?.text||'함께 쓴 이야기를 싱글로 이어갈 수 있습니다.').replace(/\s+/g,' ').slice(-240)}}

// First visit after deployment/join: one bounded metadata repair per missing room,
// never on every heartbeat and never copying a large image bundle per participant.
export async function ensurePersonalCopies(ownerKey:string,roomId?:string){
 const db=await database();
 const rows=await db.prepare(`SELECT s.*,r.name FROM multiplayer_members m JOIN multiplayer_rooms r ON r.id=m.room_id JOIN multiplayer_cortex_state s ON s.room_id=m.room_id
  WHERE m.owner_key=? AND m.status NOT IN ('LEFT','KICKED') AND (?='' OR m.room_id=?)
  AND NOT EXISTS(SELECT 1 FROM cortex_cloud_sessions c WHERE c.owner_key=m.owner_key AND (c.last_writer_id='mp-follow:'||m.id OR c.id='mp-'||m.id||'-'||s.revision))`)
  .bind(ownerKey,roomId||'',roomId||'').all<Row>();
 for(const state of rows.results||[]){
  const stored=JSON.parse(await readRuntimeJsonText(state,fields));
  await db.batch(personalCopyStatements(db,String(state.room_id),state,personalCopyMetadata(stored),ownerKey));
 }
}
