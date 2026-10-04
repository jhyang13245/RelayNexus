import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const project=path.resolve('.'), audit=path.join(project,'tools/portrait-audit'), data=path.join(project,'outputs/portrait-audit-20261003');
const port=Number(process.env.PORTRAIT_AUDIT_PORT||5442);
const results=path.resolve(process.env.PORTRAIT_AUDIT_RESULTS||path.join(data,'results'));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.wasm':'application/wasm'};
const inside=(root,file)=>file===root||file.startsWith(root+path.sep);
await fs.mkdir(results,{recursive:true});
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:'+port), name=decodeURIComponent(url.pathname);
 if(req.method==='POST'&&name==='/result'){
  if(req.headers.origin!==`http://127.0.0.1:${port}`)throw Error('Origin rejected');
  let length=0,parts=[];for await(const chunk of req){length+=chunk.length;if(length>40e6)throw Error('Too large');parts.push(chunk);}
  const row=JSON.parse(Buffer.concat(parts));if(!/^[a-zA-Z0-9_.-]+\.(json|png)$/.test(row.name))throw Error('Invalid result filename');
  const bytes=row.name.endsWith('.png')?Buffer.from(row.data.split(',')[1],'base64'):JSON.stringify(row.data,null,2);
  await fs.writeFile(path.join(results,row.name),bytes);res.end('saved');return;
 }
 if(req.method!=='GET')throw Error('GET only');
 let root,relative;
 if(name.startsWith('/reports/portrait-fix-20261003/')){root=path.join(project,'outputs/portrait-fix-20261003');relative=name.slice('/reports/portrait-fix-20261003/'.length);}
 else if(name.startsWith('/reports/portrait-audit-20261003/')){root=data;relative=name.slice('/reports/portrait-audit-20261003/'.length);}
 else if(name==='/probe-worker.mjs'){root=path.join(project,'vendor/visual-novel');relative='nexus-motion-worker.mjs';}
 else if(name==='/vn-motion-geometry.mjs'){root=path.join(project,'public/vn-runtime');relative='vn-motion-geometry.mjs';}
 else if(name.startsWith('/data/results/')){root=results;relative=name.slice('/data/results/'.length);}
 else if(name.startsWith('/data/')){root=data;relative=name.slice(6);}
 else if(name.startsWith('/vn-runtime/')||name.startsWith('/vn-vision/')||/^\/cortex-vn-[a-z-]+\.(mjs|css)$/.test(name)){root=path.join(project,'public');relative=name.slice(1);}
 else{root=audit;relative=name==='/'?'index.html':name.slice(1);}
 const file=path.resolve(root,relative);if(!inside(root,file))throw Error('Path rejected');
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; font-src 'self' data:");
 res.end(await fs.readFile(file));
 }catch(e){res.statusCode=404;res.end(String(e.message));}}).listen(port,'127.0.0.1',()=>console.log(`Portrait audit http://127.0.0.1:${port} — local static files; no API proxy`));
