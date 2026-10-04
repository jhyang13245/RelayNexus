import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {JIEUM_VERSION} from '../../features/jieum/jieum-version';
import JSZip from 'jszip';
import * as jieum from '../../features/jieum/studio-export';
import * as studio from './fixtures/studio-2.3.2/studio-export';
import {normalizeProject,reviveProjectImageUrls} from '../../features/jieum/studio-model';
import {createDemoPreset} from '../../features/jieum/demo-presets';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
function semantic(p:any){return JSON.parse(JSON.stringify(p,(key,v)=>['dataUrl','sourceBlob'].includes(key)?undefined:v))}
for(const id of ['giseong_instant_story','giseong_full_fit'] as const)test('Studio 2.3.2 ↔ Jieum semantic and original-image roundtrip: '+id,async()=>{
 const p=createDemoPreset(id);p.packageTarget='cortex';
 p.player.images=[{id:'ROUNDTRIP',fileName:'original.png',mimeType:'image/png',dataUrl:'',sourceBlob:new Blob([new Uint8Array(2*1024*1024).fill(173)],{type:'image/png'}),isPrimary:true,label:'원본',addedAt:'2026-09-11'}];
 const original=await studio.exportScenarioPack(p,false),imported=normalizeProject((await jieum.extractStudioProjectFromPackage(original.blob)).project);
 const exported=await jieum.exportScenarioPack(imported,false),zip=await JSZip.loadAsync(await exported.blob.arrayBuffer());
 const manifest=JSON.parse(await zip.file('manifest.json')!.async('string')),snapshotBytes=await zip.file(jieum.EMBEDDED_PROJECT_SNAPSHOT_PATH)!.async('uint8array'),snapshot=JSON.parse(new TextDecoder().decode(snapshotBytes));
 assert.equal(manifest.authoringProduct,'dancheong-jieum');assert.equal(snapshot.jieumVersion,JIEUM_VERSION);assert.equal(snapshot.studioVersion,'2.3.2');
 assert.equal(manifest.editorSource.sha256,hash(snapshotBytes));assert.equal(manifest.editorSource.byteLength,snapshotBytes.length);
 const restored=normalizeProject((await studio.extractStudioProjectFromPackage(exported.blob)).project);
 assert.deepEqual(semantic(restored),semantic(imported));
 assert.equal(hash(new Uint8Array(await restored.player.images[0].sourceBlob!.arrayBuffer())),hash(new Uint8Array(await p.player.images[0].sourceBlob!.arrayBuffer())));
 const sourceZip=await JSZip.loadAsync(await original.blob.arrayBuffer());const assetNames=Object.keys(zip.files).filter(n=>n.startsWith('assets/')&&!n.endsWith('/')&&!n.endsWith('manifest.json'));
 for(const name of assetNames){assert.equal(hash(await zip.file(name)!.async('uint8array')),hash(await sourceZip.file(name)!.async('uint8array')))}
});
