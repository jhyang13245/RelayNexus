import {NextResponse} from 'next/server';
import {database,requireOwnerKey,safeJsonText} from '../../../../../../lib/simulation-store';
import {getCortexCloudSession,cortexCloudSummary} from '../../../../../../lib/cortex-cloud-store';
import {storeRuntimeJson,deleteRuntimeObject,R2_JSON_POINTER} from '../../../../../../lib/runtime-json-store';

// Recovery creates an independent record only. It cannot overwrite the source or an
// existing branch, and is deliberately usable after the source device lease was lost.
export async function POST(request:Request,context:{params:Promise<{sessionId:string}>}) {
  try {
    const ownerKey=await requireOwnerKey(request),{sessionId}=await context.params;
    const body=await request.json() as Record<string,unknown>;
    const id=String(body.recoveryId||''),snapshot=body.snapshot as Record<string,unknown>;
    if(!/^recovery-[0-9a-f-]{36}$/i.test(id)||id===sessionId||!snapshot||!Array.isArray(snapshot.turns)||!String(snapshot.schema||'').startsWith('CORTEX_'))return NextResponse.json({error:'보존할 기록 형식이 올바르지 않습니다.'},{status:400});
    const existing=await getCortexCloudSession(ownerKey,id);
    if(existing)return NextResponse.json({session:cortexCloudSummary(existing)});
    const source=await getCortexCloudSession(ownerKey,sessionId);
    const projectId=String(body.projectId||source?.project_id||'cortex-import-cloud').slice(0,200),now=new Date().toISOString();
    const value={...snapshot};delete value.exportedAt;delete value.storageDiagnostics;
    const pointer=await storeRuntimeJson({ownerKey,projectId:`cortex-${projectId}`,sessionId:id,category:'revision',revision:1,value:safeJsonText(value,80*1024*1024)});
    const name=String(body.name||source?.name||'Cortex 이야기').slice(0,100)+' · 충돌 보존';
    try {
      const result=await (await database()).prepare(`INSERT OR IGNORE INTO cortex_cloud_sessions
        (id,owner_key,project_id,source_project_id,name,snapshot_json,snapshot_r2_key,snapshot_sha256,snapshot_byte_length,turn,location,preview,revision,last_writer_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`).bind(id,ownerKey,projectId,String(body.sourceProjectId||source?.source_project_id||'').slice(0,200),name,R2_JSON_POINTER,pointer.key,pointer.sha256,pointer.byteLength,snapshot.turns.length,'',String((snapshot.turns.at(-1) as Record<string,unknown>)?.text||'').slice(-240),String(body.deviceId||'unknown').slice(0,120),now,now).run();
      if(!result.meta.changes)await deleteRuntimeObject(pointer.key);
    } catch(error){await deleteRuntimeObject(pointer.key).catch(()=>{});throw error;}
    const saved=await getCortexCloudSession(ownerKey,id);
    if(!saved)throw Error('보존한 기록을 확인하지 못했습니다. 원본은 변경하지 않았습니다.');
    return NextResponse.json({session:cortexCloudSummary(saved)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'기록 보존 실패. 현재 기기의 기록을 유지합니다.'},{status:500});}
}
