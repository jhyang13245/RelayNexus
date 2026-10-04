// Static runtime dependencies only. Never sends a portrait or calls inference APIs.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('../public/vn-vision/1.0.1/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('runtime-manifest.json',root),'utf8'));
const valid=(bytes,row)=>bytes.length===row.bytes&&createHash('sha256').update(bytes).digest('hex')===row.sha256;
for(const row of manifest.assets){
  const file=new URL(row.file,root);
  const existing=await fs.readFile(file).catch(()=>null);
  if(existing&&valid(existing,row)){console.log('Verified '+row.file);continue;}
  if(process.argv.includes('--check'))throw Error('Missing or changed local vision dependency: '+row.file+'. Run node scripts/install-vn-vision.mjs');
  const response=await fetch(row.url,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error('Static dependency download failed: '+row.file+' '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());if(!valid(bytes,row))throw Error('Dependency checksum mismatch: '+row.file);
  await fs.mkdir(new URL('./',file),{recursive:true});await fs.writeFile(file,bytes);console.log('Installed verified '+row.file);
}
