import assert from 'node:assert/strict';
import test,{beforeEach} from 'node:test';
import {IDBFactory} from 'fake-indexeddb';
import {loadJieumDraft,saveJieumDraft,putJieumHandoff,getJieumHandoff,validateJieumBlueprint,JieumConflictError,HANDOFF_TTL_MS,MAX_HANDOFF_BYTES} from '../../lib/jieum-store';
import {nexusBlueprint} from './fixtures/nexus-blueprint';
import {normalizeProject,reviveProjectImageUrls,makeNewStudioProject} from '../../features/jieum/studio-model';
beforeEach(()=>{globalThis.indexedDB=new IDBFactory()});
const origin='https://example.test';
test('draft commit persists real Blobs and survives a new object URL after reload',async()=>{
 const p=makeNewStudioProject();p.player.images=[{id:'IMG',fileName:'qa.png',mimeType:'image/png',dataUrl:'blob:expired',sourceBlob:new Blob(['original']),label:'원본',isPrimary:true,addedAt:'2026-09-11'}];
 assert.equal(await loadJieumDraft(),null);assert.equal(await saveJieumDraft(p,0),1);
 const record=await loadJieumDraft<typeof p>();assert.equal(await record!.project.player.images[0].sourceBlob!.text(),'original');
 const revived=reviveProjectImageUrls(normalizeProject(record!.project));
 assert.match(revived.player.images[0].dataUrl,/^blob:/);assert.notEqual(revived.player.images[0].dataUrl,'blob:expired');
 URL.revokeObjectURL(revived.player.images[0].dataUrl);
});
test('two tabs cannot silently overwrite the same draft revision',async()=>{
 await saveJieumDraft({title:'original'},0);
 const results=await Promise.allSettled([saveJieumDraft({title:'tab-A'},1),saveJieumDraft({title:'tab-B'},1)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.ok(rejected.reason instanceof JieumConflictError);
 assert.equal((await loadJieumDraft())?.revision,2);
});
test('handoff remains available until draft AND consumption commit successfully',async()=>{
 const id=await putJieumHandoff(nexusBlueprint(),origin);
 await getJieumHandoff(id,origin);await getJieumHandoff(id,origin);
 await saveJieumDraft({title:'keep'},0);
 await assert.rejects(saveJieumDraft({title:'stale'},0,id),JieumConflictError);
 assert.equal((await getJieumHandoff(id,origin)).id,id);
 await assert.rejects(saveJieumDraft({cannotClone:()=>{}},1,id));
 assert.equal((await getJieumHandoff(id,origin)).id,id);assert.equal((await loadJieumDraft<{title:string}>())?.project.title,'keep');
 await saveJieumDraft({title:'applied'},1,id);
 await assert.rejects(getJieumHandoff(id,origin),/만료/);
 await assert.rejects(saveJieumDraft({title:'replay'},2,id),/만료/);
 assert.equal((await loadJieumDraft<{title:string}>())?.project.title,'applied');
});
test('handoff rejects mismatched origin, target, secrets and oversized payload',async()=>{
 const b=nexusBlueprint('instant_story'),id=await putJieumHandoff(b,origin);
 await assert.rejects(getJieumHandoff(id,'https://elsewhere.test'),/만료/);
 assert.throws(()=>validateJieumBlueprint({...b,target:{...b.target,minimumTargetVersion:'1.0.0'}}),/Cortex/);
 assert.throws(()=>validateJieumBlueprint({...b,apiKey:'not-a-real-key'}),/인증/);
 assert.throws(()=>validateJieumBlueprint({...b,sourcePrompt:'a'.repeat(MAX_HANDOFF_BYTES)}),/너무 큽/);
});
test('temporary transfers expire and queue size is bounded without deleting drafts',async()=>{
 const now=Date.now;const id=await putJieumHandoff(nexusBlueprint(),origin);
 try{Date.now=()=>now()+HANDOFF_TTL_MS+1;await assert.rejects(getJieumHandoff(id,origin),/만료/);await putJieumHandoff(nexusBlueprint(),origin)}finally{Date.now=now}
 for(let i=0;i<7;i++)await putJieumHandoff(nexusBlueprint(),origin);
 await assert.rejects(putJieumHandoff(nexusBlueprint(),origin),/미적용/);
 assert.equal(await loadJieumDraft(),null);
});
