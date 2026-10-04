import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve('outputs/portrait-audit-20261003');
const m=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const groups=[...new Set(m.rows.map(r=>r.work))].map(w=>m.rows.filter(r=>r.work===w&&r.reference&&!r.duplicate));
const rows=[];while(groups.some(g=>g.length))for(const g of groups)if(g.length)rows.push(g.shift());
await fs.writeFile(path.join(root,'generation-order.json'),JSON.stringify(rows.map(r=>r.key),null,2));
for(let start=0;start<rows.length;start+=9){const ops=[];for(let i=0;i<9&&start+i<rows.length;i++){const r=rows[start+i],left=i%3*400,top=Math.floor(i/3)*330;ops.push({input:await sharp(r.reference.path).resize(400,300,{fit:'contain',background:'#242933'}).png().toBuffer(),left,top});ops.push({input:Buffer.from(`<svg width="400" height="30"><rect width="400" height="30" fill="#fff"/><text x="8" y="21" font-size="16">${start+i+1}. ${r.person.name.replaceAll('&','&amp;')} / ${r.heightCm}cm</text></svg>`),left,top:top+300});}await sharp({create:{width:1200,height:990,channels:3,background:'#111'}}).composite(ops).png().toFile(path.join(root,`reference-contact-${start/9+1}.png`));}
