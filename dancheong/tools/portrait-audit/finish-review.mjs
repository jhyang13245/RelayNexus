import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve('outputs/portrait-audit-20261003');
const m=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const file=path.join(root,'results/measurements.json');
const r=JSON.parse(await fs.readFile(file,'utf8'));
// Correct an audit-only metadata label. Preserve the browser's original result.
// No image, DOM measurement, camera frame, or production module is changed.
if(!r.metadataCorrections){
 await fs.copyFile(file,path.join(root,'results/measurements-browser-original.json'));
 const audits=new Map(r.audits.map(a=>[a.key+'/'+a.variant,a]));
 for(const row of r.metrics){delete row.detector;row.calibrationMethod=audits.get(row.key+'/'+row.variant)?.method||'none';}
 r.metadataCorrections=['Replaced detector (incorrect geometry-property test) with calibrationMethod from savedCamera.method. landmarks means a mesh was available, not that pixel fallback was necessarily bypassed.'];
 await fs.writeFile(file,JSON.stringify(r,null,2));
}
const framePath='tools/portrait-audit/frame.mjs';
let frame=await fs.readFile(framePath,'utf8');
frame=frame.replace("detector:a.camera?.geometry?'mesh':'pixel-or-fallback'","calibrationMethod:a.camera?.method||'none'");
await fs.writeFile(framePath,frame);
const rows=m.rows.filter(x=>m.eligible.includes(x.key));
const xml=s=>s.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
for(let start=0;start<rows.length;start+=12){
 const batch=rows.slice(start,start+12),ops=[];
 for(let i=0;i<batch.length;i++){
  const row=batch[i],left=i%3*480,top=Math.floor(i/3)*330;
  ops.push({input:await sharp(path.join(root,`results/${row.key}--generated--1440x900--group-1.png`)).resize(480,300).toBuffer(),left,top});
  ops.push({input:Buffer.from(`<svg width="480" height="30"><rect width="480" height="30" fill="#f2f5f7"/><text x="8" y="21" font-size="16">${start+i+1}. ${xml(row.person.name)} / ${row.heightCm}cm</text></svg>`),left,top:top+300});
 }
 await sharp({create:{width:1440,height:Math.ceil(batch.length/3)*330,channels:3,background:'#152335'}}).composite(ops).png().toFile(path.join(root,`rendered-contact-${Math.floor(start/12)+1}.png`));
}
console.log('Preserved original measurements, corrected metadata, wrote 3 rendered contact sheets.');
