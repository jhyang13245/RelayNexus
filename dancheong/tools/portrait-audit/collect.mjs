import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';

const root = path.resolve('outputs/portrait-audit-20261003');
await fs.mkdir(path.join(root, 'packages'), { recursive: true });
const origin = 'https://relay-novel-nexus.juno12345.chatgpt.site';
const catalog = await fetch(origin + '/api/neoreum/works').then(r => { if (!r.ok) throw Error(String(r.status)); return r.json(); });
await fs.writeFile(path.join(root, 'catalog.json'), JSON.stringify(catalog, null, 2));
const inventory = [];
for (const work of catalog.works) {
  if (!/^[a-z0-9-]+$/.test(work.slug)) throw Error('Invalid slug');
  const url = new URL(work.downloadUrl);
  if (url.origin !== origin) throw Error('Unexpected download origin');
  const dest = path.join(root, 'packages', work.slug + '.zip');
  let bytes;
  try { bytes = await fs.readFile(dest); } catch {
    const r = await fetch(url); if (!r.ok) throw Error(`${work.slug}: ${r.status}`);
    bytes = Buffer.from(await r.arrayBuffer()); await fs.writeFile(dest, bytes);
  }
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== work.packageSha256 || bytes.length !== work.packageBytes) throw Error('Package mismatch: ' + work.slug);
  const files = unzipSync(bytes), jsonFiles = [];
  for (const [name, data] of Object.entries(files)) {
    if (!name.endsWith('.json')) continue;
    const obj = JSON.parse(strFromU8(data));
    jsonFiles.push({name, keys:Object.keys(obj), bytes:data.length});
    if (/scenario|cortex|package|project|manifest/i.test(name)) await fs.writeFile(path.join(root, 'packages', work.slug + '--' + name.replace(/[^a-zA-Z0-9.-]/g, '_')), data);
  }
  inventory.push({slug:work.slug,title:work.title,revision:work.currentRevision,url:url.href,sha256,bytes:bytes.length,jsonFiles, images:Object.keys(files).filter(x=>/\.(png|jpe?g|webp)$/i.test(x))});
}
await fs.writeFile(path.join(root, 'package-inventory.json'), JSON.stringify(inventory,null,2));
console.log(JSON.stringify(inventory,null,2));
