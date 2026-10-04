// Server-to-server operator bridge. Never imported into a browser bundle.
export async function operatorService(request: Request, env: { DB: D1Database; RELAY_OPERATOR_SECRET?: string; RELAY_MASTER_EMAILS?: string }) {
  const reply = (body: unknown, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (!env.RELAY_OPERATOR_SECRET || supplied.length < 32) return reply({error:'Unauthorized'},401);
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [a,b] = await Promise.all([digest(supplied),digest(env.RELAY_OPERATOR_SECRET)]);
  let mismatch = 0; for(let i=0;i<a.length;i++) mismatch |= a[i]^b[i];
  if(mismatch) return reply({error:'Unauthorized'},401);
  const masters = new Set((env.RELAY_MASTER_EMAILS || '').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean));
  try {
    if(request.method === 'GET') {
      const url=new URL(request.url), page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0));
      const q=(url.searchParams.get('q')||'').slice(0,160), filter=url.searchParams.get('status')||'';
      const status=['ACTIVE','SUSPENDED'].includes(filter)?filter:'';
      const where="(? = '' OR instr(lower(email || ' ' || display_name || ' ' || id), lower(?)) > 0) AND (? = '' OR status = ?)";
      const total=await env.DB.prepare(`SELECT count(*) AS count FROM relay_accounts WHERE ${where}`).bind(q,q,status,status).first<{count:number}>();
      const rows=await env.DB.prepare(`SELECT id,email,display_name,role,status,created_at,updated_at,last_seen_at,
        (SELECT count(*) FROM simulation_sessions s WHERE s.owner_key='account:'||a.id) AS sessions
        FROM relay_accounts a WHERE ${where} ORDER BY created_at DESC,id LIMIT 50 OFFSET ?`).bind(q,q,status,status,Math.floor(page)*50).all();
      return reply({accounts:rows.results.map((r:any)=>({...r,protectedAccount:masters.has(String(r.email).toLowerCase())})),total:total?.count||0,page:Math.floor(page),pageSize:50,source:'dancheong',fetchedAt:new Date().toISOString()});
    }
    if(request.method !== 'PATCH') return reply({error:'Method not allowed'},405);
    const body:any=await request.json();
    if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['id','status','role','reason','expectedUpdatedAt','actorId','actorName'].includes(k)) ||
      typeof body.id!=='string' || typeof body.reason!=='string' || body.reason.trim().length<2 || body.reason.length>500 || typeof body.expectedUpdatedAt!=='string' ||
      typeof body.actorId!=='string' || body.actorId.length>160 || typeof body.actorName!=='string' || body.actorName.length>160 ||
      (body.status!==undefined&&!['ACTIVE','SUSPENDED'].includes(body.status)) || (body.role!==undefined&&!['MASTER','USER'].includes(body.role)) || (!body.status&&!body.role)) return reply({error:'변경 값과 사유를 확인해 주세요.'},400);
    const target:any=await env.DB.prepare('SELECT * FROM relay_accounts WHERE id=?').bind(body.id).first();
    if(!target) return reply({error:'가입자를 찾지 못했습니다.'},404);
    if(masters.has(String(target.email).toLowerCase())) return reply({error:'보호된 운영자는 변경할 수 없습니다.'},403);
    // Preserve every existing master: elevated authority is not granted or removed through this bridge.
    if(target.role==='MASTER' || body.role==='MASTER') return reply({error:'최고 운영자 권한은 서버 설정에서만 관리합니다.'},403);
    const next={status:body.status||target.status,role:body.role||target.role};
    const now=new Date().toISOString();
    const result=await env.DB.batch([
      env.DB.prepare('UPDATE relay_accounts SET status=?,role=?,updated_at=? WHERE id=? AND updated_at=? AND role<>?').bind(next.status,next.role,now,body.id,body.expectedUpdatedAt,'MASTER'),
      env.DB.prepare(`INSERT INTO admin_audit_logs (id,actor_account_id,actor_display_name,actor_role,action,target_type,target_id,detail_json,created_at)
        SELECT ?,?,?,'MASTER','account.operator_updated','account',?,?,? WHERE changes()=1`).bind(crypto.randomUUID(),'relay-id:'+body.actorId,body.actorName,body.id,JSON.stringify({reason:body.reason,from:{status:target.status,role:target.role},to:next,source:'relay-id'}),now)
    ]);
    if(result[0].meta.changes!==1) return reply({error:'다른 변경이 있습니다. 목록을 새로고침해 주세요.'},409);
    return reply({ok:true});
  } catch { return reply({error:'단청 가입자 저장소 처리에 실패했습니다.'},503); }
}
