import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('resources live only below the status API meter and refresh without changing values',async()=>{
 const dom=new JSDOM('<!doctype html><html><head></head><body class="cortex-native"><main id="story"></main><div id="feed"></div><div id="composer"></div><span id="eventPhase">진행 중</span><span id="worldClock">D+0 · 06:40</span><span id="worldLocationBar">대한민국 서울특별시 서초, 한명진이 살던 집</span><aside id="rail"><nav class="inspector-tabs"></nav><div data-inspector-pane="events" id="eventInspector"></div><div data-inspector-pane="diagnostics"><div class="panel"><button id="exportBtn">백업</button></div></div></aside></body></html>',{runScripts:'outside-only',url:'http://localhost'});
 const w=dom.window,d=w.document,sc={protagonist:{id:'hero',name:'한시우',aliases:[]},world:{},runtime:{jieum:{resourceStatus:'CONFIRMED',routeIndex:0},storyId:'hud-test'}};
 const config={routes:[{id:'start'}],stats:[{id:'seal',label:'령주',unit:'획',visible:true},{id:'private',label:'비공개 수치',visible:false}]};let value=0;
 w.CortexJieum={config:()=>config,values:()=>({seal:value,private:99})};
 w.CortexTurnExperience={publicCharacter:p=>p,publicMentionOffset:()=>-1};w.NexusDialogue={resolve:()=>[]};
 const api={_scenario:()=>sc,_turns:()=>[],_settings:()=>({model:'muse-spark-1.3-contributor'})};
 for(const name of ['jieum-reader','cortex-nexus-inspector'])w.eval(fs.readFileSync('public/'+name+'.js','utf8'));
 try{
  w.mountNexusInspector(api,d.getElementById('rail'));w.mountJieumReader(api,d.getElementById('story'),d.getElementById('rail'),d.getElementById('composer'))();
  const hud=()=>d.querySelector('.jieum-resource-hud');assert.equal(d.querySelectorAll('.jieum-resource-hud').length,1);assert.equal(hud().previousElementSibling.className,'engine-meter');assert.equal(hud().closest('[data-nexus-pane]').dataset.nexusPane,'status');assert.equal(hud().querySelector('strong').textContent,'0');assert.ok(!hud().textContent.includes('비공개'));
  for(const tab of ['events','cast','images','records','cost']){d.querySelector('[data-nexus-tab="'+tab+'"]').click();assert.ok(hud().closest('[hidden]'),tab+' must hide resources')}
  d.querySelector('[data-nexus-tab="status"]').click();assert.equal(hud().closest('[hidden]'),null);
  value=2;sc.runtime.jieum.resourceStatus='UNCONFIRMED';w.dispatchEvent(new w.Event('cortex-turn-display'));await new Promise(r=>setTimeout(r,130));assert.equal(hud().querySelector('strong').textContent,'2');assert.ok(hud().querySelector('.jieum-resource-pending'));assert.equal(value,2);
  if(process.env.HUD_VISUAL_QA){
   for(const css of ['nexus-reader','cortex-nexus']){const style=d.createElement('style');style.textContent=fs.readFileSync('public/'+css+'.css','utf8');d.head.append(style)}
   const style=d.createElement('style');style.textContent='body.cortex-native{margin:0;display:block;overflow:auto;background:#ede8da}body>#story,body>#feed,body>#composer,body>span{display:none}#rail.nexus-inspector{display:block!important;position:relative!important;inset:auto!important;transform:none!important;width:min(100%,420px)!important;height:auto!important;margin:auto;box-sizing:border-box}[hidden]{display:none!important}';d.head.append(style);fs.writeFileSync('outputs/resource-hud-qa.html',dom.serialize());
  }
  config.stats=[];w.dispatchEvent(new w.Event('cortex-turn-display'));await new Promise(r=>setTimeout(r,130));assert.equal(hud(),null);
 }finally{dom.window.close()}
});
