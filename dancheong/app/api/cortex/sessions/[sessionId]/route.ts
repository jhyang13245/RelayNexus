import { NextResponse } from "next/server";
import {readCortexSnapshot,isMultiplayerCopy} from '../../../../../lib/multiplayer-personal';
import {applyCloudDelta} from '../../../../../lib/cortex-cloud-delta';
import {readSharedSnapshot,storeSharedSnapshot,sharedMediaVersion} from '../../../../../lib/multiplayer-snapshot';

import {
  cortexCloudSummary,
  getCortexCloudSummary,
  getCortexCloudSession,
} from "../../../../../lib/cortex-cloud-store";
import {
  database,
  requireOwnerKey,
  safeJsonText,
} from "../../../../../lib/simulation-store";
import {
  deleteRuntimeObject,
  runtimeJsonDigest,
} from "../../../../../lib/runtime-json-store";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey(_request);
    const { sessionId } = await context.params;
    if (new URL(_request.url).searchParams.get("summary") === "1") {
      const session=await getCortexCloudSummary(ownerKey,sessionId);
      return session?NextResponse.json({session},{headers:{'Cache-Control':'no-store'}}):NextResponse.json({error:'온라인 Cortex 기록이 없습니다.'},{status:404});
    }
    let row = await getCortexCloudSession(ownerKey, sessionId);
    if (!row) return NextResponse.json({ error: "온라인 Cortex 기록이 없습니다." }, { status: 404 });
    let snapshot: Record<string,unknown>;
    try { snapshot = await readCortexSnapshot(row); }
    catch (error) {
      // A concurrent successful PUT may retire the pointer read above. Retry only a
      // different revision, retaining hash validation and returning its matching summary.
      const latest = await getCortexCloudSession(ownerKey, sessionId);
      if (!latest || latest.revision === row.revision) throw error;
      row = latest;
      snapshot = await readCortexSnapshot(row);
    }
    return NextResponse.json(
      { session: cortexCloudSummary(row), snapshot },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cortex 온라인 기록을 불러오지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey(request);
    const { sessionId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    let snapshot = body.snapshot as Record<string, unknown> | undefined;
    const expectedRevision = Number(body.expectedRevision ?? 0);
    const existing = await getCortexCloudSession(ownerKey, sessionId);
    // An unchanged delta needs no R2 read, full parse or hash. It still requires
    // the exact account, revision and unexpired writer epoch before acknowledging.
    if(existing&&existing.revision===expectedRevision&&Array.isArray(body.operations)&&body.operations.length===0){
      const db=await database(),epoch=String(body.leaseEpoch||'');
      const lease=epoch&&await db.prepare(`SELECT epoch FROM cortex_session_leases WHERE id = ? AND owner_key = ? AND device_id = ? AND epoch = ? AND expires_at > ?`)
        .bind(sessionId,ownerKey,String(body.deviceId||'').slice(0,120),epoch,new Date().toISOString()).first();
      if(!lease)return NextResponse.json({code:'CORTEX_LEASE_LOST',error:'이 기기의 사용권을 다시 확인해야 합니다.'},{status:409,headers:{'Cache-Control':'no-store'}});
      return NextResponse.json({session:cortexCloudSummary(existing),unchanged:true},{headers:{'Cache-Control':'no-store'}});
    }
    const split=existing&&(()=>{try{return JSON.parse(existing.snapshot_json).cloudSplit===true}catch{return false}})();
    const reuseMedia=Boolean(split&&Array.isArray(body.operations)&&!(body.operations as any[]).some(op=>op?.path?.[0]==='media'));
    if(body.operations!==undefined){
      if(!existing||existing.revision!==expectedRevision)return NextResponse.json({code:'CORTEX_SYNC_CONFLICT',serverRevision:existing?.revision||0},{status:409});
      try{snapshot=applyCloudDelta(reuseMedia?(await readSharedSnapshot(existing,sharedMediaVersion(existing))).snapshot:await readCortexSnapshot(existing),body.operations as any);}
      catch{return NextResponse.json({error:'변경분을 적용하지 못했습니다. 전체 저장으로 다시 확인해 주세요.',code:'CORTEX_DELTA_INVALID'},{status:400});}
    }
    if (!snapshot || !Array.isArray(snapshot.turns) || !String(snapshot.schema || "").startsWith("CORTEX_")) {
      return NextResponse.json({ error: "Cortex 저장본 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return NextResponse.json({ error: "Cortex 동기화 리비전이 올바르지 않습니다." }, { status: 400 });
    }
    const db = await database(), deviceId = String(body.deviceId || '').slice(0,120), epoch = String(body.leaseEpoch || '');
    const lease = await db.prepare(`SELECT epoch FROM cortex_session_leases WHERE id = ? AND owner_key = ? AND device_id = ? AND epoch = ? AND expires_at > ?`)
      .bind(sessionId, ownerKey, deviceId, epoch, new Date().toISOString()).first();
    if (!epoch || !lease) return NextResponse.json({error:'이 기기의 사용권을 다시 확인해야 합니다. 현재 진행은 기기에 보존되어 있습니다.',code:'CORTEX_LEASE_LOST'}, {status:409,headers:{'Cache-Control':'no-store'}});
    const serverRevision = Number(existing?.revision ?? 0);
    const cloudSnapshot = { ...snapshot };
    delete cloudSnapshot.exportedAt;
    delete cloudSnapshot.storageDiagnostics;
    const snapshotJson = safeJsonText(cloudSnapshot, 80 * 1024 * 1024);
    const digest = await runtimeJsonDigest(snapshotJson);
    if (existing && existing.snapshot_sha256 === digest.sha256 && Number(existing.snapshot_byte_length ?? 0) === digest.byteLength) {
      return NextResponse.json({ session: cortexCloudSummary(existing), unchanged: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (serverRevision !== expectedRevision) {
      return NextResponse.json(
        { error: "다른 기기의 Cortex 기록이 먼저 저장되었습니다.", code: "CORTEX_SYNC_CONFLICT", serverRevision, session: existing ? cortexCloudSummary(existing) : null },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const projectId = String(body.projectId || existing?.project_id || "cortex-import-cloud").slice(0, 200);
    const sourceProjectId = String(body.sourceProjectId || existing?.source_project_id || "").slice(0, 200);
    const name = String(body.name || existing?.name || snapshot.scenario && (snapshot.scenario as Record<string, unknown>).title || "Cortex 이야기").slice(0, 120);
    const turns = snapshot.turns as Array<Record<string, unknown>>;
    const scenario = snapshot.scenario as Record<string, unknown> | undefined;
    const world = scenario?.world as Record<string, unknown> | undefined;
    const lastText = String(turns.at(-1)?.text || "").replace(/\s+/g, " ").trim();
    const turn = turns.length;
    const location = String(world?.location || body.location || "").slice(0, 240);
    const preview = String(body.preview || lastText || "아직 시작하지 않은 이야기").slice(0, 240);
    const nextRevision = serverRevision + 1;
    const pointer = await storeSharedSnapshot(cloudSnapshot,{ownerKey,projectId:`cortex-${projectId}`,sessionId,revision:nextRevision},existing||undefined,reuseMedia?sharedMediaVersion(existing!):undefined,false);
    const inline=JSON.stringify({...JSON.parse(pointer.inline),cloudSplit:true});
    const now = new Date().toISOString();
    try {
      if (existing) {
        const result = await db.prepare(`UPDATE cortex_cloud_sessions SET
          project_id = ?, source_project_id = ?, name = ?, snapshot_json = ?, snapshot_r2_key = ?,
          snapshot_sha256 = ?, snapshot_byte_length = ?, turn = ?, location = ?, preview = ?,
          revision = revision + 1, last_writer_id = ?, updated_at = ?
          WHERE id = ? AND owner_key = ? AND revision = ? AND EXISTS (
            SELECT 1 FROM cortex_session_leases WHERE id = ? AND owner_key = ? AND device_id = ? AND epoch = ? AND expires_at > ?)`)
          .bind(projectId, sourceProjectId, name, inline, pointer.key, pointer.sha256, pointer.byteLength, turn, location, preview, deviceId, now, sessionId, ownerKey, expectedRevision,sessionId,ownerKey,deviceId,epoch,new Date().toISOString()).run();
        if (!result.meta.changes) {
          await deleteRuntimeObject(pointer.key).catch(() => undefined);
          if(pointer.newMediaKey)await deleteRuntimeObject(pointer.newMediaKey).catch(()=>undefined);
          return NextResponse.json({ error: "다른 기기의 Cortex 기록이 먼저 저장되었습니다.", code: "CORTEX_SYNC_CONFLICT" }, { status: 409 });
        }
      } else {
        await db.prepare(`INSERT INTO cortex_cloud_sessions (
          id, owner_key, project_id, source_project_id, name, snapshot_json, snapshot_r2_key,
          snapshot_sha256, snapshot_byte_length, turn, location, preview, revision, last_writer_id,
          created_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM cortex_session_leases WHERE id = ? AND owner_key = ? AND device_id = ? AND epoch = ? AND expires_at > ?)`)
          .bind(sessionId, ownerKey, projectId, sourceProjectId, name, inline, pointer.key, pointer.sha256, pointer.byteLength, turn, location, preview, 1, deviceId, now, now,sessionId,ownerKey,deviceId,epoch,new Date().toISOString()).run().then(result=>{if(!result.meta.changes)throw Error('세션 사용권이 변경되었습니다. 현재 기기의 기록은 보존되어 있습니다.');});
      }
    } catch (error) {
      await deleteRuntimeObject(pointer.key).catch(() => undefined);
      if(pointer.newMediaKey)await deleteRuntimeObject(pointer.newMediaKey).catch(()=>undefined);
      throw error;
    }
    if(!existing||!isMultiplayerCopy(existing))await deleteRuntimeObject(existing?.snapshot_r2_key).catch(() => undefined);
    // A later same-device write may already exist by now. Acknowledge only this
    // request's committed revision, never attach its local bytes to a newer base.
    return NextResponse.json({ session: {id:sessionId,projectId,sourceProjectId:sourceProjectId||undefined,name,turn,location,preview,revision:nextRevision,updatedAt:now} }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cortex 온라인 기록을 저장하지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey(_request);
    const { sessionId } = await context.params;
    const row = await getCortexCloudSession(ownerKey, sessionId);
    if (!row) return NextResponse.json({ deleted: false });
    if(isMultiplayerCopy(row)){
      // Keep only a tombstone so the next catalog refresh does not recreate a
      // deliberately deleted copy of this same room revision.
      await (await database()).prepare("UPDATE cortex_cloud_sessions SET last_writer_id='mp-deleted',snapshot_json='{}',snapshot_r2_key=NULL,snapshot_sha256=NULL,snapshot_byte_length=NULL,name='',preview='',location='',turn=0 WHERE id=? AND owner_key=?").bind(sessionId,ownerKey).run();
    }else{
      await (await database()).prepare("DELETE FROM cortex_cloud_sessions WHERE id = ? AND owner_key = ?").bind(sessionId, ownerKey).run();
      await deleteRuntimeObject(row.snapshot_r2_key).catch(() => undefined);
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cortex 온라인 기록을 삭제하지 못했습니다." }, { status: 500 });
  }
}
