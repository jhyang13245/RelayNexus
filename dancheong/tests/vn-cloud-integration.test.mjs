import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createCloudService, cloudAccountKey } from '../lib/vn/vn-cloud-service.ts';
import { readFileSync } from 'node:fs';
import { createCloudClient, cloudPayload } from '../public/vn-runtime/vn-cloud.mjs';
import { makeSlot } from '../public/vn-runtime/vn-saves.mjs';
import { hostServices } from '../public/vn-runtime/vn-host.mjs';
import { createCloudObjects } from '../lib/vn/vn-cloud-objects.ts';
import { makeBackup } from '../public/vn-runtime/vn-backup.mjs';
function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../drizzle/0016_visual_novel_slots.sql', import.meta.url), 'utf8'));
  let user = { userId: 'account-a', displayName: 'Synthetic A' }, loseCommit = false;
  const objects = new Map();
  const db = { prepare(query) { return { bind(...params) { const stmt = sql.prepare(query); return {
    async first() { const row = stmt.get(...params); if (loseCommit && query.startsWith('INSERT')) { loseCommit = false; throw Error('commit response lost'); } return row || null; },
    async all() { return { results: stmt.all(...params) }; },
    async run() { return stmt.run(...params); },
  }; } }; } };
  const bucket = { async put(key, stream) { const blob = await new Response(stream).blob(); objects.set(key, blob); return { size: blob.size }; }, async get(key) { const blob = objects.get(key); return blob ? { body: blob.stream() } : null; }, async delete(key) { objects.delete(key); } };
  const handle = createCloudService({ getUser: async () => user, getBindings: () => ({ db, bucket }) });
  const media = createCloudObjects({ getUser: async () => user, getBindings: () => ({ db, bucket }) });
  return { sql, objects, handle, media, setUser(value) { user = value; }, loseCommit() { loseCommit = true; } };
}
const account = await cloudAccountKey('account-a');
const checksum = 'a'.repeat(64);
function put(slot='slot-1', revision='0', mutation=crypto.randomUUID(), owner=account, extra={}) {
  return new Request(`https://site.test/api/cloud/slots/${slot}`, { method:'PUT', body:'file', headers:{ Origin:'https://site.test', 'X-VN-Cloud':'1', 'X-VN-Account':owner, 'If-Match':revision, 'Idempotency-Key':mutation, 'Content-Length':'4', 'X-VN-Checksum':checksum, 'X-VN-Summary':encodeURIComponent(JSON.stringify({slug:'test-work',title:'Synthetic',apiKey:'must drop'})), ...extra } });
}
test('cloud owns records by authenticated account, blocks CSRF and stale account operations', async () => {
  const f=fixture(); assert.equal((await f.handle(put(),'slot-1')).status,200);
  f.setUser({userId:'account-b',displayName:'B'});
  const listed=await (await f.handle(new Request('https://site.test/api/cloud/slots'))).json(); assert.equal(listed.slots.length,0);
  assert.equal((await f.handle(put(),'slot-1')).status,409);
  assert.equal((await f.handle(put('slot-1','0',crypto.randomUUID(),listed.account,{Origin:'https://evil.test'}),'slot-1')).status,403);
  f.setUser(null); assert.equal((await f.handle(new Request('https://site.test/api/cloud/slots'))).status,401); f.sql.close();
});
test('cloud CAS retains winner, handles idempotency and uncertain committed writes without deleting the live blob', async () => {
  const f=fixture(), mutation=crypto.randomUUID();
  f.loseCommit(); const response=await f.handle(put('slot-1','0',mutation),'slot-1'); assert.equal(response.status,200);
  const first=await response.json(); assert.equal(first.repeated,true); assert.equal(f.objects.size,1); assert.equal(first.slot.apiKey,undefined);
  assert.equal((await f.handle(put('slot-1','0',mutation),'slot-1')).status,200); assert.equal(f.objects.size,1);
  const results=await Promise.all([f.handle(put('slot-1',first.slot.revision),'slot-1'),f.handle(put('slot-1',first.slot.revision),'slot-1')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const list=await (await f.handle(new Request('https://site.test/api/cloud/slots'))).json(), row=list.slots[0];
  const loaded=await f.handle(new Request('https://site.test/api/cloud/slots/slot-1',{headers:{'X-VN-Account':account,'If-Match':row.revision}}),'slot-1');
  assert.equal(await loaded.text(),'file'); assert.equal(loaded.headers.get('cache-control'),'private, no-store');
  assert.equal((await f.handle(put('slot-1','0'),'slot-1')).status,409); assert.equal(f.objects.size,2); f.sql.close();
});
test('cloud archive round trip preserves work edition/bookmark but strips credentials', async () => {
  const record=makeSlot({slot:1,slug:'test-work',title:'Synthetic',snapshot:{scenario:{runtime:{storyId:'story'}},turns:[],settings:{apiKey:'private',typingSpeed:'slow'}},presentation:{values:[null,null,null,null,null],openingArt:'',actions:false}});
  const payload=await cloudPayload(record); let requests=0;
  const client=createCloudClient({fetchImpl:async (url,init)=>{ requests++; if (!init.headers) return Response.json({account,displayName:'A',slots:[]}); return new Response(url.includes('/objects/') ? payload.objects.get(url.split('/').at(-1)) : payload.blob); }});
  await client.list(); const restored=await client.get({slot:'slot-1',revision:'r',checksum:payload.checksum,format:payload.summary.format});
  assert.equal(restored.slug,record.slug); assert.equal(restored.snapshot.settings.apiKey,undefined); assert.equal(restored.snapshot.settings.typingSpeed,'slow'); assert.ok(requests>2);
  assert.equal(hostServices({cloudBase:'https://evil.test'}).cloudBase,'/api/cloud/slots'); assert.equal(hostServices({cloudBase:'/vn/api/cloud'}).cloudBase,'/vn/api/cloud');
});

test('incremental cloud uploads commit last, reuse media across slots, and restore legacy saves', async () => {
  const f = fixture(); let uploads = 0, fail = false;
  const client = createCloudClient({ endpoint: 'https://site.test/api/cloud/slots', fetchImpl: async (url, init = {}) => {
    const body = init.body, length = body instanceof Blob ? body.size : typeof body === 'string' ? Buffer.byteLength(body) : 0;
    const request = new Request(url, { ...init, headers: { ...init.headers, ...(body ? { Origin: 'https://site.test', 'Content-Length': String(length) } : {}) } });
    if (url.includes('/objects')) { if (init.method === 'PUT') { uploads++; if (fail) return Response.json({ error: 'interrupted' }, { status: 400 }); } return f.media(request, url.split('/objects/')[1]); }
    return f.handle(request, url.split('/slots/')[1]);
  }});
  const record = makeSlot({ slot: 1, slug: 'test-work', presentation:{values:[null,null,null,null,null],openingArt:'',actions:false}, snapshot: { scenario: { runtime: { storyId: 'story' }, image: 'data:image/png;base64,YWJj' }, turns: [] } });
  await client.list(); const payload = await cloudPayload(record);
  fail = true; await assert.rejects(client.put('slot-1', payload)); assert.equal((await client.list()).slots.length, 0);
  fail = false; const first = await client.put('slot-1', payload); const count = uploads;
  const second = await client.put('slot-2', payload); assert.equal(uploads, count); assert.equal(second.format, 'manifest-v2');
  const restored = await client.get(first); assert.equal(restored.snapshot.scenario.image, record.snapshot.scenario.image);
  // Cross-account object probing and writes are denied.
  f.setUser({ userId: 'different', displayName: 'B' });
  const key = [...payload.objects.keys()][0]; assert.equal((await f.media(new Request(`https://site.test/api/cloud/slots/objects/${key}`, { headers: { 'X-VN-Account': account } }), key)).status,409);
  f.setUser({userId:'account-a',displayName:'A'});
  const old = await makeBackup(record), checksum = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await old.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const legacy = await client.put('slot-3', { blob: old, checksum, summary: { slug:'test-work', format:'json' } });
  assert.equal((await client.get(legacy)).slug,'test-work'); f.sql.close();
});

test('manifest with missing media cannot replace an existing slot', async () => {
  const f = fixture(), first = await (await f.handle(put(), 'slot-1')).json();
  const manifest = new Blob([JSON.stringify({ schema:'DANCHEONG_VN_CLOUD_V2', record:{},costs:{},assets:[],objects:[{hash:'b'.repeat(64),bytes:3}] })]);
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256',await manifest.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const request = new Request('https://site.test/api/cloud/slots/slot-1',{method:'PUT',body:manifest,headers:{Origin:'https://site.test','X-VN-Cloud':'1','X-VN-Account':account,'If-Match':first.slot.revision,'Idempotency-Key':crypto.randomUUID(),'Content-Length':String(manifest.size),'X-VN-Checksum':sha,'X-VN-Summary':encodeURIComponent(JSON.stringify({slug:'test-work',format:'manifest-v2'}))}});
  assert.equal((await f.handle(request,'slot-1')).status,409);
  assert.equal((await (await f.handle(new Request('https://site.test/api/cloud/slots'))).json()).slots[0].revision,first.slot.revision); f.sql.close();
});
