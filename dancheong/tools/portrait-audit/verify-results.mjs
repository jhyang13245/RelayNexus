import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=path.resolve('outputs/portrait-audit-20261003');
const json=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const m=await json('manifest.json'),r=await json('results/measurements.json'),a=await json('results/analysis.json');
assert.equal(new Set(m.eligible).size,35);
assert.equal(m.generation.generated.length,35);
assert.equal(r.errors.length,0);
assert.equal(r.metrics.length,4410);
assert.equal(r.audits.length,245);
assert.equal(r.metrics.filter(x=>x.isTarget).length,2205);
assert.deepEqual(r.viewports,[[1440,900],[844,390],[390,844]]);
assert.equal(r.kimSeoYeon.heightCm,164);
assert.equal(r.kimSeoYeon.imageValidation,'NOT_RUN_NO_REFERENCE');
const cases=new Set(r.metrics.filter(x=>x.isTarget).map(x=>[x.key,x.variant,x.mode,x.viewport.join('x')].join('|')));
assert.equal(cases.size,2205);
let png=0;
for(const key of m.eligible){
 await fs.access(path.join(root,'generated',key+'.png'));
 for(const viewport of ['1440x900','844x390','390x844'])for(const [variant,mode]of [['reference',1],['generated',1],['generated',3]]){
  await fs.access(path.join(root,'results',`${key}--${variant}--${viewport}--group-${mode}.png`));png++;
 }
}
assert.equal(a.maxSoloMultiScaleChangePct,0);
assert.equal(a.invariance.length,525);
assert(a.invariance.every(x=>Number.isFinite(x.effectiveScaleChangePct)));
for(const name of ['report.html','visual-review.txt','results/measurements.csv','results/invariance.csv','results/provenance.json'])await fs.access(path.join(root,name));
const productionDiff=execFileSync('git',['diff','--','public','scripts','package.json'],{encoding:'utf8'});
assert.equal(productionDiff,'');
const result={checkedAt:new Date().toISOString(),status:'ARTIFACT_COMPLETENESS_OK',generated:35,baseComparisons:png,rows:4410,targetCases:cases.size,productionDiffEmpty:true,visualAcceptance:'FAIL_REQUIRES_CALIBRATION_WORK',note:'Artifact completeness is not a visual-quality pass.'};
await fs.writeFile(path.join(root,'results/artifact-verification.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
