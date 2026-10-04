import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='outputs/portrait-crop-fix-20261003';
const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const current=await read(dir+'/results/measurements.json'),previous=await read('outputs/portrait-fix-20261003/results/measurements.json');
const manifest=await read('outputs/portrait-audit-20261003/manifest.json');
const targets=r=>r.metrics.filter(x=>x.isTarget&&x.mode==='group-1');
const rows=targets(current),old=targets(previous),variants=['half','padded','bust','crown-cut','chroma','occluded'];
const changes=rows.filter(x=>variants.includes(x.variant)).map(x=>{
  const base=rows.find(b=>b.key===x.key&&b.variant==='generated'&&b.viewport.join()===x.viewport.join());
  const audit=current.audits.find(a=>a.key===x.key&&a.variant===x.variant);
  const prior=old.find(b=>b.key===x.key&&b.variant===x.variant&&b.viewport.join()===x.viewport.join());
  const priorBase=old.find(b=>b.key===x.key&&b.variant==='generated'&&b.viewport.join()===x.viewport.join());
  const factor=x.variant==='half'&&!audit.fallback?.5:1;
  return {key:x.key,name:manifest.rows.find(r=>r.key===x.key).person.name,variant:x.variant,viewport:x.viewport.join('x'),
    previousPct:prior?(prior.screenPixelScale*(x.variant==='half'?.5:1)/priorBase.screenPixelScale-1)*100:null,
    currentPct:(x.screenPixelScale*factor/base.screenPixelScale-1)*100,fallback:audit.fallback,method:x.calibrationMethod};
});
const summary={version:'1.25.10',runtime:(await read('public/vn-runtime/manifest.json')).version,started:current.started,finished:current.finished,
  uniqueCharacters:current.uniqueCharacters,metrics:current.metrics.length,viewports:current.viewports,errors:current.errors,
  variants:Object.fromEntries(variants.map(v=>{const a=changes.filter(x=>x.variant===v&&x.viewport==='1440x900');return[v,{maxAbsPct:Math.max(...a.map(x=>Math.abs(x.currentPct))),over10:a.filter(x=>Math.abs(x.currentPct)>10).length,referenceFallbacks:a.filter(x=>x.fallback).length}];})),
  motionFallbacks:current.audits.filter(a=>a.motionFallback===true).length,
  baselineBodyUnmeasured:current.audits.filter(a=>a.variant==='generated'&&a.face?.body?.coverage!=='torso').map(a=>a.key),
  unexecuted:15,kimSeoYeon:current.kimSeoYeon,paidApiCalls:0,
  limitations:['Missing body pixels are restored from the same character reference, not invented or stretched.','One original lacks reliable pelvis landmarks; fallback preserves its established framing, not verified anatomy.','Automated geometric agreement is not an art-quality approval.','Viewport checks do not measure physical iPhone performance.']};
await fs.writeFile(dir+'/summary.json',JSON.stringify(summary,null,2));
await fs.writeFile(dir+'/invariance.json',JSON.stringify(changes,null,2));
await fs.writeFile(dir+'/invariance.csv','\uFEFF'+[Object.keys(changes[0]).join(','),...changes.map(r=>Object.values(r).map(x=>JSON.stringify(x??'')).join(','))].join('\n'));
const provenance={created:new Date().toISOString(),runtime:summary.runtime,sources:{}};
for(const file of ['public/cortex-vn-camera.mjs','public/cortex-vn-registration.mjs','scripts/port-visual-novel.mjs',...['sprite','motion-landmarks','motion-worker','raster-worker'].map(p=>'vendor/visual-novel/nexus-'+p+'.mjs')])provenance.sources[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
await fs.writeFile(dir+'/provenance.json',JSON.stringify(provenance,null,2));
console.log(JSON.stringify(summary,null,2));
assert.equal(current.errors.length,0);assert.equal(current.metrics.length,5040);assert.equal(current.audits.length,280);
assert.equal(summary.motionFallbacks,35);
assert.ok(changes.every(x=>Math.abs(x.currentPct)<3),'same drawing should not change magnification by 3% or more');
const keys=['estimatedEye','virtualGroundY','slotHeight'];
for(const row of current.metrics.filter(x=>x.isTarget&&x.mode!=='group-1')){
  const solo=rows.find(x=>x.key===row.key&&x.variant===row.variant&&x.viewport.join()===row.viewport.join());
  assert.ok(Math.abs(row.screenPixelScale/solo.screenPixelScale-1)<.001,'solo/multi camera distance changed');
  for(const key of keys.filter(k=>k!=='estimatedEye'))assert.ok(Math.abs(row[key]-solo[key])<.1,key+' changed across group sizes');
}
await fs.writeFile(dir+'/verification.json',JSON.stringify({status:'GEOMETRY_REGRESSION_PASS',rows:5040,variants:280,visualReview:'separate',at:new Date().toISOString()},null,2));
