import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve('outputs/portrait-audit-20261003'),m=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')),byKey=new Map();
for(const f of (await fs.readdir(root)).filter(f=>/^generation-(log|batch-\d+)\.json$/.test(f)).sort())for(const r of JSON.parse(await fs.readFile(path.join(root,f),'utf8')))byKey.set(r.key,r);
await fs.mkdir(path.join(root,'generated'),{recursive:true});
for(const [key,r]of byKey){if(!m.eligible.includes(key))throw Error('Unknown character');const bytes=await fs.readFile(r.source);const file=key+'.png';await fs.writeFile(path.join(root,'generated',file),bytes);r.url='/data/generated/'+file;r.sha256=crypto.createHash('sha256').update(bytes).digest('hex');r.modelVerified=false;r.reasoningVerified=false;}
m.generation.generated=[...byKey.values()];await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(m,null,2));console.log({generated:m.generation.generated.length});
