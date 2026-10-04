import {database} from './simulation-store';
import {requireMultiplayerMembership} from './multiplayer-store';
import {readRuntimeJsonText} from './runtime-json-store';
import {vnSnapshotManifest,vnTurnManifest} from './multiplayer-vn-manifest';
import {VN_SYNC_LEAD} from '../public/cortex-vn-timeline.mjs';
import type {RelayAccountContext} from './account-store';

export const VN_PLAYBACK_SCHEMA = `CREATE TABLE IF NOT EXISTS multiplayer_vn_playback (
 room_id TEXT PRIMARY KEY NOT NULL, seq INTEGER NOT NULL, payload_json TEXT NOT NULL)`;
export async function readVNPlayback(db:any, roomId:string) {
  const row = await db.prepare('SELECT payload_json FROM multiplayer_vn_playback WHERE room_id=?').bind(roomId).first();
  return row ? JSON.parse(row.payload_json) : null;
}
async function manifest(db:any, roomId:string, state:any, turnId:string) {
  const now = new Date().toISOString();
  if (state.claim_token && state.claim_expires_at > now) {
    const live = await db.prepare('SELECT payload_json FROM multiplayer_cortex_live WHERE room_id=? AND token=?').bind(roomId,state.claim_token).first();
    const packet = live && JSON.parse(live.payload_json);
    if (packet?.id === turnId && packet.visual?.text) return vnTurnManifest({id:packet.id,displayText:packet.visual.text,dialogueAnnotations:packet.visual.annotations},Number(state.turn)+1,false);
  }
  let pointer:any; try { pointer = JSON.parse(state.snapshot_json); } catch { pointer = {}; }
  if (pointer.vnReading) return pointer.vnReading;
  // Existing rooms are upgraded once, with an exact snapshot-version fence.
  // Paragraph changes thereafter never download the full history or package art.
  const snapshot = JSON.parse(await readRuntimeJsonText(state,{inline:'snapshot_json',key:'snapshot_r2_key',sha256:'snapshot_sha256',byteLength:'snapshot_byte_length'}));
  const value = vnSnapshotManifest(snapshot);
  if (value) await db.prepare('UPDATE multiplayer_cortex_state SET snapshot_json=? WHERE room_id=? AND revision=? AND snapshot_json=?')
    .bind(JSON.stringify({...pointer,vnReading:value}),roomId,state.revision,state.snapshot_json).run();
  return value;
}
export async function vnPlaybackOperation(account:RelayAccountContext, code:string, body:any) {
  const access = await requireMultiplayerMembership(account,code), db = await database(), roomId = String(access.room.id);
  const settings = JSON.parse(String(access.room.settings_json || '{}'));
  if (settings.engine !== 'cortex' || settings.presentation !== 'visual' || !['ACTIVE','SOLO','PAUSED_KEY'].includes(String(access.room.status))) throw Error('진행 중인 비주얼노벨 방에서만 사용할 수 있습니다.');
  if (!['ready','auto','reveal','advance'].includes(body.action) || !Number.isSafeInteger(body.expected) || body.expected < 0 || typeof body.turnId !== 'string' || body.turnId.length > 160) throw Error('공유 읽기 요청을 확인해 주세요.');
  const state = await db.prepare('SELECT * FROM multiplayer_cortex_state WHERE room_id=?').bind(roomId).first();
  if (!state) throw Error('공유 기록을 찾지 못했습니다.');
  const [current, book] = await Promise.all([readVNPlayback(db,roomId),manifest(db,roomId,state,body.turnId)]);
  const response = (accepted=false, playback=current) => ({accepted,playback,serverTime:Date.now()});
  if ((current?.seq || 0) !== body.expected || !book || book.turnId !== body.turnId) return response();
  const now = Date.now(), manual = ['reveal','advance'].includes(body.action);
  if (manual && !book.finalized) return response(); // Never trust a client's COMMITTED flag.
  let next:any;
  if (body.action === 'ready') {
    if (current?.turnId === book.turnId) return response();
    const recovered = current && current.turn > book.turn;
    if(recovered && (!book.finalized || book.turn!==Number(state.turn) || state.claim_token&&String(state.claim_expires_at)>new Date().toISOString()))return response();
    next = {turnId:book.turnId,turn:book.turn,start:book.pages[0].start,startsAt:now+VN_SYNC_LEAD,revealAt:0,phase:'reading'};
    if(recovered)Object.assign(next,{start:book.pages.at(-1).start,phase:'choices'});
  } else {
    if (!current || current.turnId !== book.turnId || current.phase !== 'reading' || now < current.startsAt) return response();
    const index = book.pages.findIndex((p:any) => p.start === current.start), page = book.pages[index];
    if (!page) return response();
    const end = current.revealAt || current.startsAt + page.reveal;
    if (body.action === 'reveal') {
      if (current.revealAt || now >= end) return response();
      next = {...current,revealAt:now+200};
    } else {
      if (body.action === 'advance' ? now < end : now < end + page.hold - VN_SYNC_LEAD) return response();
      if (page.growing || (!book.finalized && index === book.pages.length - 1)) return response();
      const following = book.pages[index+1];
      next = {...current,start:following?.start ?? current.start,startsAt:Math.max(now+VN_SYNC_LEAD,manual?0:end+page.hold),revealAt:0,phase:following?'reading':'choices'};
    }
  }
  next.seq = (current?.seq || 0) + 1;
  // Compare-and-swap also fences membership, room revision and story revision:
  // simultaneous taps can never skip two paragraphs or advance a story turn.
  const results = await db.batch([db.prepare(`INSERT INTO multiplayer_vn_playback(room_id,seq,payload_json)
    SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM multiplayer_cortex_state s JOIN multiplayer_rooms r ON r.id=s.room_id JOIN multiplayer_members m ON m.room_id=r.id
      WHERE r.id=? AND r.revision=? AND s.revision=? AND m.account_id=? AND m.status NOT IN ('LEFT','KICKED')
      AND (?=1 OR (s.claim_token=? AND s.claim_expires_at>?)))
    ON CONFLICT(room_id) DO UPDATE SET seq=excluded.seq,payload_json=excluded.payload_json WHERE multiplayer_vn_playback.seq=?`)
    .bind(roomId,next.seq,JSON.stringify(next),roomId,access.room.revision,state.revision,account.id,book.finalized?1:0,state.claim_token||'',new Date().toISOString(),body.expected),
    // Give the next player the full input interval after shared reading ends.
    // This doesn't increment story/room revisions or acquire the writer lease.
    ...(next.phase==='choices'?[db.prepare(`UPDATE multiplayer_rooms SET turn_deadline_at=strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+' || turn_limit_seconds || ' seconds')
      WHERE id=? AND status='ACTIVE' AND revision=? AND EXISTS(SELECT 1 FROM multiplayer_vn_playback WHERE room_id=? AND seq=? AND payload_json=?)`)
      .bind(new Date(next.startsAt).toISOString(),roomId,access.room.revision,roomId,next.seq,JSON.stringify(next))]:[]),
  ]);
  return response(Boolean(results[0].meta.changes),await readVNPlayback(db,roomId));
}
