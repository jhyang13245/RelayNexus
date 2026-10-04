import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { unzipSync, strFromU8 } from 'fflate';
import { characterHeight } from '../../public/vn-runtime/vn-stature.mjs';
const require = createRequire(import.meta.url);
const sharp = require('C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve('outputs/portrait-audit-20261003');
const catalog = JSON.parse(await fs.readFile(path.join(root,'catalog.json'),'utf8'));
const rows = [], seen = new Set();
for (const work of catalog.works) {
  const zip = unzipSync(await fs.readFile(path.join(root,'packages',work.slug+'.zip')));
  const key = Object.keys(zip).find(k=>/(^|\/)characters.json$/.test(k));
  const people = JSON.parse(strFromU8(zip[key]));
  for (const p of people) {
    const primary = p.images?.find(i=>i.isPrimary) || p.images?.[0];
    const person = {id:p.id,name:p.name,age:p.age,gender:p.gender,publicAppearance:p.appearance || p.visualAnchor || '',publicProfile:typeof p.publicProfile === 'string' ? p.publicProfile : typeof p.publicInfo === 'string' ? p.publicInfo : ''};
    if (Number.isFinite(p.heightCm)) person.heightCm=p.heightCm;
    const explicit = [person.publicAppearance,person.publicProfile].join(' ').match(/(?:키|신장|height)\s*[:：]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:cm|센티)/i);
    const row={key:work.slug+'__'+p.id,work:work.slug,title:work.title,revision:work.currentRevision,person,heightCm:characterHeight(person),heightSource:explicit?'public-text':p.heightCm?'numeric-field':'runtime-default',duplicate:seen.has(p.id),reference:null};
    seen.add(p.id);
    if(primary && zip[primary.assetPath]){
      const bytes=zip[primary.assetPath], sha256=crypto.createHash('sha256').update(bytes).digest('hex');
      if(primary.sha256 && sha256!==primary.sha256)throw Error('Image hash mismatch '+row.key);
      const dir=path.join(root,'references',work.slug); await fs.mkdir(dir,{recursive:true});
      const file=p.id.replace(/[^a-zA-Z0-9_-]/g,'_')+path.extname(primary.assetPath);
      await fs.writeFile(path.join(dir,file),bytes);
      const m=await sharp(bytes).metadata();
      row.reference={url:'/data/references/'+work.slug+'/'+file,path:path.join(dir,file),sourceAsset:primary.assetPath,sha256,bytes:bytes.length,width:m.width,height:m.height,hasAlpha:m.hasAlpha};
    }
    // User explicitly requests Kim Seo-yeon at 164 cm. Record the fixture separately from package evidence.
    if(p.name.includes('김서연')){row.packageHeightCm=row.heightCm;row.person.heightCm=164;row.heightCm=164;row.heightSource='user-fixture-164cm';}
    rows.push(row);
  }
}
// Prefer image-bearing edition when demo and full editions share character IDs.
const eligible=rows.filter(r=>r.reference);
for(const r of eligible)r.duplicate=eligible.some(x=>x!==r && x.person.id===r.person.id && eligible.indexOf(x)<eligible.indexOf(r));
const manifest={createdAt:new Date().toISOString(),requestedCharacters:50,rows,eligible:eligible.filter(r=>!r.duplicate).map(r=>r.key),generation:{tool:'conversation-imagegen-only',requestedModel:'GPT 2.5 Flare',requestedReasoning:'low',modelSelectionAvailable:false,generated:[]}};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({total:rows.length,uniqueIds:seen.size,eligible:manifest.eligible.length,works:catalog.works.map(w=>({slug:w.slug,characters:rows.filter(r=>r.work===w.slug).length,references:rows.filter(r=>r.work===w.slug&&r.reference).length})),people:rows.map(r=>({key:r.key,name:r.person.name,height:r.heightCm,heightSource:r.heightSource,ref:!!r.reference,alpha:r.reference?.hasAlpha}))},null,2));
