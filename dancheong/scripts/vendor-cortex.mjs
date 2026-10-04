import {adaptVNEngine,buildVN} from './port-visual-novel.mjs';
import fs from 'node:fs';import crypto from 'node:crypto';import vm from 'node:vm';
const source=process.argv[2]||'vendor/cortex/Cortex_v1.42.0.html';
const parts='vendor/cortex/parts';
if(!process.argv[2]&&fs.existsSync(parts)){const names=fs.readdirSync(parts).filter(x=>x.endsWith('.part')).sort();if(names.length!==11||names.some((name,i)=>name!==String(i).padStart(2,'0')+'.part'))throw Error('Incomplete Cortex source parts');const assembled=Buffer.concat(names.map(x=>fs.readFileSync(parts+'/'+x))).toString('utf8');const extensions=['instant-runtime','occurrence-runtime'].map(name=>'<script>'+fs.readFileSync('vendor/cortex/'+name+'.js','utf8')+(name==='occurrence-runtime'?'\n'+fs.readFileSync('vendor/cortex/jieum-runtime.js','utf8'):'')+'</script>').join('\n');fs.writeFileSync(source,assembled.replace('<head>','<head>\n'+extensions));}
const bytes=fs.readFileSync(source),sha=crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync('vendor/cortex',{recursive:true});if(source!=='vendor/cortex/Cortex_v1.42.0.html')fs.writeFileSync('vendor/cortex/Cortex_v1.42.0.html',bytes);
const vnVersion=await buildVN();
const html=adaptVNEngine(bytes.toString('utf8')),wrapped=html.replace('<head>','<head>\n<script src="/cortex-host.js"></script>\n<script src="/cortex-vn-host.js"></script>\n<script src="/jieum-reader.js"></script>\n<script src="/cortex-nexus-view.js"></script>\n<script src="/cortex-nexus-inspector.js"></script>').replace('/cortex-vn-host.js"',`/cortex-vn-host.js?v=${vnVersion}"`).replace('</head>','<link rel="stylesheet" href="/nexus-reader.css"><link rel="stylesheet" href="/cortex-nexus.css"></head>');
fs.writeFileSync('public/cortex.html',wrapped);
fs.writeFileSync('vendor/cortex/manifest.json',JSON.stringify({version:'1.42.0',extensionRevision:'1.3.0',assembly:'scripts/vendor-cortex.mjs',extensions:['instant-runtime.js','occurrence-runtime.js','jieum-runtime.js'],upstreamSha256:'6dfbd01ae4f7774ac06cb3c6960b3e419526b28ba2f673ab5d87dfb99386da84',sha256:sha,bundledStory:false,policy:'Cortex 1.42.0 with explicit Dancheong Instant V2 occurrence-selection and opt-in Jieum canon extensions; unchanged canon execution parity tested against the official standalone engine'},null,2)+'\n');
const scripts=s=>[...s.matchAll(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g)].map(m=>m[0]).filter(s=>!s.includes('src="/cortex-host.js"')&&!s.includes('src="/cortex-vn-host.js?')&&!s.includes('src="/cortex-nexus-view.js"')&&!s.includes('src="/jieum-reader.js"')&&!s.includes('src="/cortex-nexus-inspector.js"'));
if(JSON.stringify(scripts(html))!==JSON.stringify(scripts(wrapped)))throw Error('Engine scripts changed');
for(const script of scripts(html))new vm.Script(script.replace(/^<script(?:\s[^>]*)?>/u,'').replace(/<\/script>$/u,''));
console.log('Cortex adapted runtime verified: '+sha);

fs.writeFileSync('public/nexus-reader.css',fs.readFileSync('app/globals.css','utf8').replace('@import "tailwindcss";',''));
