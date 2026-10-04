import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { findStorySource, loadStorySource } from '../app/multiplayer/story-source';

const id='cortex-import-neoreum:test-work:r2';
const bytes=new Uint8Array([80,75,3,4,10,20]);
const digest=createHash('sha256').update(bytes).digest('hex');

test('missing device ZIP resolves exactly r2, downloads lazily and verifies its fingerprint',async()=>{
 const previous=globalThis.fetch,urls:string[]=[];
 globalThis.fetch=async input=>{const url=String(input);urls.push(url);return url.endsWith('/revisions')?Response.json({revisions:[{revision:3,packageSha256:'a'.repeat(64)},{revision:2,packageVersion:'old',packageSha256:digest,packageBytes:bytes.length}]}):new Response(bytes)};
 try{
  const source=await findStorySource(id,false,async()=>null);assert.equal(source.kind,'revision');assert.equal(urls.length,1,'no ZIP download while selecting');
  assert.notEqual(source.kind,'missing');if(source.kind==='missing')return;
  const file=await loadStorySource(source);assert.deepEqual(new Uint8Array(await file!.arrayBuffer()),bytes);
  assert.deepEqual(urls,['/api/neoreum/works/test-work/revisions','/api/neoreum/works/test-work/revisions/2/download']);
  globalThis.fetch=async()=>new Response(new Uint8Array([80,75,3,4,10,21]));
  await assert.rejects(()=>loadStorySource(source),/무결성/);
 }finally{globalThis.fetch=previous}
});

test('local originals need no network; server originals and unknown legacy installations stay separate',async()=>{
 const file=new File([bytes],'original.zip'),previous=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('unexpected network')};
 try{
  const local=await findStorySource(id,false,async()=>file);assert.equal(local.kind,'device');if(local.kind!=='missing')assert.equal(await loadStorySource(local),file);
  assert.equal((await findStorySource('owned-project',true,async()=>null)).kind,'server');
  assert.equal((await findStorySource('cortex-import-legacy',false,async()=>null)).kind,'missing');
  const controller=new AbortController();controller.abort();await assert.rejects(()=>findStorySource(id,false,async()=>file,controller.signal),{name:'AbortError'});
 }finally{globalThis.fetch=previous}
});

test('unavailable historical revision or missing hash never substitutes latest; connection failures remain retryable',async()=>{
 const previous=globalThis.fetch;
 try{
  for(const revisions of [[{revision:3,packageSha256:digest}],[{revision:2}]]){
   globalThis.fetch=async()=>Response.json({revisions});const source=await findStorySource(id,true,async()=>null);assert.equal(source.kind,'missing');
  }
  globalThis.fetch=async()=>new Response('',{status:503});await assert.rejects(()=>findStorySource(id,false,async()=>null),/다시 시도/);
 }finally{globalThis.fetch=previous}
});
