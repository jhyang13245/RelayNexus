import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const hosting=JSON.parse(fs.readFileSync('dist/.openai/hosting.json','utf8'));
if(hosting.project_id!=='appgprj_6a86ecd0dc588191bf0c0f62aad4eb55'||hosting.d1!=='DB'||hosting.r2!=='BUCKET')throw Error('Nexus site bindings changed');
const worker=await import(pathToFileURL(path.resolve('dist/server/index.js')).href);
if(typeof worker.default?.fetch!=='function')throw Error('Missing Worker fetch');
function validateAssetSizes(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())validateAssetSizes(file);else if(fs.statSync(file).size>25*1024*1024)throw Error('Public asset exceeds hosting 25 MiB limit: '+file)}}
validateAssetSizes('dist/client');
for(const file of ['face_landmarker.task','pose_landmarker_lite.task','vision_bundle.mjs','wasm/vision_wasm_module_internal.js','wasm/vision_wasm_module_internal.wasm']){
  const name='vn-vision/1.0.1/'+file;
  if(!fs.readFileSync('dist/client/'+name).equals(fs.readFileSync('public/'+name)))throw Error('Mismatched local portrait detector: '+name);
}
for(const file of ['cortex-vn-host.js','cortex-vn-stagecraft.mjs','cortex-vn-stagecraft-dom.mjs','cortex-vn-sound.mjs','cortex-vn-stagecraft.css','vn-sfx/manifest.json','cortex-vn-camera.mjs','cortex-vn-registration.mjs','cortex-vn-layout.css','cortex-vn-layout.mjs','cortex-vn-cast-wire.mjs','cortex-vn-writer-speakers.mjs','cortex-vn-clock.mjs','cortex-vn-shared.mjs','cortex-vn-multiplayer.mjs',...fs.readdirSync('public/vn-runtime').filter(name=>fs.statSync('public/vn-runtime/'+name).isFile()).map(name=>'vn-runtime/'+name)])if(!fs.readFileSync('dist/client/'+file).equals(fs.readFileSync('public/'+file)))throw Error('Mismatched VN asset: '+file);
for(const file of ['cortex.html','cortex-host.js','cortex-cloud-worker.js','cortex-nexus.css','nexus-reader.css','cortex-nexus-view.js','cortex-nexus-inspector.js'])if(!fs.readFileSync('dist/client/'+file).equals(fs.readFileSync('public/'+file)))throw Error('Mismatched runtime asset: '+file);
console.log('Validated Nexus Worker, original bindings and Cortex assets.');
