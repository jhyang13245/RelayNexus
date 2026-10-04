import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import vm from 'node:vm';import {JSDOM} from 'jsdom';
const read=p=>fs.readFileSync(p,'utf8');

test('actual multiplayer reader hides listener suggestions, routes touches through shared playback and retains solo controls',()=>{
 const source=read('public/vn-runtime/vn.js');
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,replaceChildren(){this.cleared=true}});return nodes.get(id)};
 const state={actions:true,cursor:2},host={multiplayer:true},multiplayerState={canWrite:false};
 const ctx=vm.createContext({host,state,multiplayerState,multiplayerTouch:()=>{state.tapped=true},$:node,stopPlayback:()=>{throw Error('solo only')},sound:{play:()=>{}},publicRecommendations:()=>{throw Error('must not expose recommendations')}});
 for(const [start,end] of [['function renderActions() {','function resetReader() {'],['function nextPage(fromPlayback = false) {','async function submit('],['function togglePlayback(mode) {','function setTextHidden(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),ctx);
 vm.runInContext("renderActions();nextPage();prevPage();togglePlayback('skip');toggleFullPlayback();",ctx);
 assert.equal(node('vn-actions').hidden,true);assert.equal(node('vn-suggestions').cleared,true);assert.equal(node('vn-compose').hidden,true);assert.equal(state.cursor,2);assert.equal(state.tapped,true);
 host.multiplayer=false;assert.throws(()=>vm.runInContext('nextPage()',ctx),/solo only/);
});
test('VN mobile reader styles retain the standalone cascade order',()=>{
 const manifest=JSON.parse(read('public/vn-runtime/manifest.json'));
 assert.deepEqual(manifest.styles,['vn.css','vn-reader.css','vn-saves.css','vn-cinema.css','vn-event-progress.css','vn-account.css','vn-storage.css']);
});
test('VN port retains every v13.19 source module and every local dependency',()=>{
 const manifest=JSON.parse(read('vendor/visual-novel/manifest.json'));
 assert.equal(manifest.sourceVersion,'13.19.0');assert.ok(Object.keys(manifest.files).length>=90);
 for(const [name,hash]of Object.entries(manifest.files)){
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync('vendor/visual-novel/public/'+name)).digest('hex'),hash,name);
  const output=read('public/vn-runtime/'+name);
  for(const match of output.matchAll(/(?:from\s+|import\(|new URL\()['"]\.\/(vn-[^'"?]+\.mjs)/gu))assert.ok(fs.existsSync('public/vn-runtime/'+match[1]),name+' -> '+match[1]);
  if(name!=='vn.js'&&/\.(?:m?js)$/.test(name))assert.ok(!/dancheong-light-novel\.juno12345\.chatgpt\.site/.test(output),'no independent-site runtime dependency');
 }
});
test('main owns navigation, canonical imports, secrets, and renderer lifetime',()=>{
 const host=read('public/cortex-vn-host.js'),entry=read('vendor/visual-novel/nexus-entry.mjs'),ported=read('public/vn-runtime/vn.js');
 assert.match(host,/NexusVNHandlesTextReveal=false/);assert.match(host,/VN_VIEW_INACTIVE/);assert.match(host,/X-Cortex-Account/);
 assert.match(entry,/voice.reset\(\).*workMusic.stop\(\).*ambience.stop\(\).*score.stop\(\)/);
 assert.doesNotMatch(entry,/savedSnapshot\(|_importFull\(|_bootstrap\(|fetchCatalog\(/);
 assert.match(ported,/host.write\(async \(\) => loadEmbeddedRecord/);
 assert.match(ported,/record.slug !== state.activeSlug/);
 assert.match(ported,/if \(!host.active \|\| !host.isReady\(\)\) return/);
});

test('visual entry preloads without running the renderer and acknowledges only the completed request',async()=>{
 const dom=new JSDOM('<html><head></head><body><div class="app"></div></body></html>',{url:'https://test/cortex.html?view=visual',pretendToBeVisual:true,runScripts:'outside-only'});
 const w=dom.window,events=[],calls=[];let ready=false,imports=0,release;
 const activation=new Promise(resolve=>{release=resolve});
 w.fetch=async(url)=>{calls.push(String(url));return {ok:true,json:async()=>({version:'test',styles:['vn.css']})}};
 w.Response=Response;w.Headers=Headers;
 const append=w.document.head.append.bind(w.document.head);w.document.head.append=(node)=>{append(node);if(node.rel==='stylesheet')queueMicrotask(()=>node.onload?.())};
 w.NexusVNHostBridge={active:false,account:'test',isReady:()=>ready,emit:(type,data)=>events.push({type,...data}),applySettings(){}};
 w.testRendererImport=async()=>{imports++;return {renderer:{activate:()=>activation,deactivate(){},anchor(){return null}}}};
 // Replace only the module-loader boundary; execute the actual host lifecycle.
 const source=read('public/cortex-vn-host.js').replace("import('/vn-runtime/'+(manifest.entry||'vn.js')+'?v='+manifest.version)",'window.testRendererImport()').replace("import('/cortex-vn-layout.mjs?v='+manifest.version)",'Promise.resolve({createVNLayout:()=>({start(){},stop(){}})})');
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 const request=(mode,requestId)=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:w,data:{channel:'NEXUS_CORTEX_HOST_V1',type:'VIEW_MODE',mode,requestId}}));
 try{
  new vm.Script(source).runInContext(dom.getInternalVMContext());await tick();
  assert.deepEqual(calls,['/vn-runtime/manifest.json']);assert.equal(imports,0,'preload must not start media generation or restore a save');
  assert.equal(w.document.querySelector('link[rel="modulepreload"]')?.getAttribute('href'),'/vn-runtime/vn.js?v=test');
  request('visual','first');await tick();assert.equal(imports,0,'wait for the authorized package');
  ready=true;w.dispatchEvent(new w.Event('nexus-package-ready'));await tick();
  assert.equal(imports,1);assert.equal(events.length,0,'not ready while activate is pending');
  request('novel','second');release();await tick();await tick();
  assert.deepEqual(events,[{type:'VIEW_MODE_READY',mode:'novel',requestId:'second'}],'a superseded activation never reveals the wrong screen');
  request('visual','third');await tick();await tick();
  assert.deepEqual(events.at(-1),{type:'VIEW_MODE_READY',mode:'visual',requestId:'third'});
  assert.equal(imports,1,'hot switching reuses the renderer');assert.equal(calls.length,1);
 }finally{w.close()}
});
