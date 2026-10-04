// Maintained integration layer; the imported standalone sources stay intact.
function once(code, before, after){if(code.split(before).length!==2)throw Error('Performance adapter target changed: '+before.slice(0,100));return code.replace(before,after);}
export function adaptPerformance(name, code, version){
  const from = module => `../cortex-vn-${module}.mjs?v=${version}`;
  if(name==='vn-cast.mjs'){
    code=`import {performanceSchema,performanceInstructions,validatePerformance} from '${from('performance')}';\n`+code;
    code=once(code,'  const compact = compactCastRequest(request);',`  const props=request.text.format.schema.properties.beats.items;
  props.properties.performance=performanceSchema;props.required.push('performance');
  request.instructions=request.instructions.replace('Return ONLY JSON with this shape:',performanceInstructions+'\\nReturn ONLY JSON with this shape:');
  const compact = compactCastRequest(request);`);
    code=once(code,'return { expressions, focusId,','return { expressions, focusId, performance:validatePerformance(beat.performance,candidates,selected,expressionSource,eventSource),');
  }
  if(name==='vn-cinema.mjs'){
    code=once(code,"background = '' })", "background = '', cueReady = '' })");
    code=once(code,'if (important && firstReading &&',"if (important && cueReady === 'emphasis' &&");
    code=once(code,'if (actor && !fired.has(',"if (actor && cueReady === 'cutin' && !fired.has(");
    // End-of-line emphasis should not force a second lengthy read of the line.
    code=once(code,'Math.min(6200, Math.max(2400, important.text.length * 95))','Math.min(2200, Math.max(900, important.text.length * 35))');
  }
  if(name==='vn-assets.mjs'){
    code=`import {poseAssetKey,posePrompt} from '${from('performance')}';\n`+code;
    code=once(code,"purpose === 'expression' ? 40 : purpose === 'background' ? 20 : 10","body.purpose === 'expression' ? 40 : purpose === 'background' ? 20 : 10");
    code=code.replaceAll("'vn-identity-revision-1'].includes(row[0])","'vn-identity-revision-1', 'vn-actor-pose-1'].includes(row[0])");
    code=once(code,'  function motionFor(scene, person, page) {',`  function poseFor(scene,person,page){
    if(!getShotsEnabled())return null;
    const actor=scene.direction?.performance?.actors?.find(row=>row.id===person.id);
    const source=spriteKey(scene.scope,person,emotionsFor(scene,page)[person.id]||'neutral');
    const key=poseAssetKey(source,actor);return key?{...actor,source,key}:null;
  }
  function motionFor(scene, person, page) {`);
    code=once(code,'        onChange();\n        if (!generate || scene.castPending || !active()) return;',`        const poses=cast.map(person=>poseFor(scene,person,page)).filter(Boolean).slice(0,1);
        await Promise.all(poses.map(pose=>load(pose.key)));
        onChange();
        if (!generate || scene.castPending || !active()) return;`);
    code=once(code,'        if (getMotionEnabled() && active()) await Promise.all(motions.map(row => {',`        if(getShotsEnabled()&&active()&&!shot&&!beat)await Promise.all(poses.map(pose=>{
          const identity=cache.get(pose.source)?.url;
          return identity?ensure(scene,pose.key,'portrait',async()=>({purpose:'expression',aspect:'portrait',referenceImages:[identity],prompt:artDirection(getStyle())+' '+posePrompt(pose)}),{stageFrame:STAGE_FRAME_VERSION,pose:pose.pose}):null;
        }));
        if (getMotionEnabled() && active()) await Promise.all(motions.map(row => {`);
    code=once(code,"          const base = baseRecord?.url || '';",`          const base = baseRecord?.url || '';
          const pose=poseFor(scene,person,page),poseUrl=pose?cache.get(pose.key)?.url||'':'';`);
    code=once(code,'url: exact || legacy || base, base,','url: poseUrl || exact || legacy || base, pose:poseUrl ? pose.pose : \'standing\', base,');
    code=once(code,'motion: exact ? Object.fromEntries','motion: exact && !poseUrl ? Object.fromEntries');
    code=once(code,'      if (shot) failures.delete(shot.key);',`      if (shot) failures.delete(shot.key);
      for(const person of stageCast(sceneView)){const pose=poseFor(sceneView,person,page);if(pose){failures.delete(pose.key);if(cache.get(pose.key)?.rejected)retryableFrames.add(pose.key);}}`);
  }
  if(name==='vn-storage.mjs'||name==='vn-image-reuse.mjs')code=code.replaceAll('portrait-redraw|identity-revision','actor-pose|portrait-redraw|identity-revision');
  if(name==='vn-voice.mjs'){
    code=`import {deliveryNotes} from '${from('performance')}';\n`+code;
    code=once(code,'const context = JSON.stringify({ speaker: view.speakerName, delivery }).slice(0, 700);',"const context = JSON.stringify({ speaker: view.speakerName, intention:deliveryNotes[view.direction?.performance?.delivery]||'', delivery, preceding:String(before).slice(-120), following:String(after).slice(0,80) }).slice(0, 700);");
    code=once(code,'외쳤|외치|소리쳤|소리치|고함|절규','외쳤|외치|외침|소리쳤|소리치|고함|절규');
    code=once(code,'흐느|울먹|울면서|눈물|떨리는|떨며','흐느|울먹|울면서|울음|눈물|떨리는|떨며');
  }
  if(name==='vn-typeset.mjs'){
    code=once(code,'export function typeset(input) {',"export function typeset(input, dramatic = '') {");
    code=once(code,'  marks.sort((a, b) => a.at - b.at);',`  const dramaticAt=dramatic&&source.indexOf(dramatic);
  if(dramatic&&dramatic.length>=6&&dramatic.length<=110&&dramaticAt>=0&&!marks.some(mark=>dramaticAt<mark.end&&dramaticAt+dramatic.length>mark.at))marks.push({at:dramaticAt,end:dramaticAt+dramatic.length,text:dramatic,dramatic:true});
  marks.sort((a, b) => a.at - b.at);`);
    code=once(code,'segments.push(mark.dots ?', 'segments.push(mark.dramatic ? {text:mark.text,dramatic:true} : mark.dots ?');
    code=once(code,'    if (row.ruby) {',`    if(row.dramatic){const line=doc.createElement('span');line.className='vn-dramatic-line';line.textContent=shown;nodes.push(line);}
    else if (row.ruby) {`);
  }
  if(name==='vn.js'){
    code=`import {createCuePlayer,createPortraitContinuity} from '${from('cue-player')}';
import {createStageBlocking,lightingGrade,deliveryNotes} from '${from('performance')}';
import {createFoley} from '${from('foley')}';
import {createPlaybackContext as createFoleyContext} from './vn-media-session.mjs';\n`+code;
    code=once(code,'const cinema = createCinema(',`let cinematicFrame=null;
const portraitContinuity=createPortraitContinuity();
const sceneBlocking=createStageBlocking();
const foley=createFoley({createContext:createFoleyContext,enabled:()=>state.reading.sound==='on'&&state.screen==='stage'&&!document.hidden&&!document.querySelector('dialog[open]'),speaking:()=>voiceBusy()});
const performancePlayer=createCuePlayer({release:()=>{if(state.screen==='stage'){requestRender();schedulePlayback();}},fire:(cue,frame)=>{
  if(cue.sound!=='none')foley.play(cue.sound,frame.key+cue.at);
  if(cue.kind==='impact'&&!motionReduced())playEffect(frame.direction.fx&&frame.direction.fx!=='none'?frame.direction.fx:'shake');
  if(['cutin','emphasis'].includes(cue.kind)&&cinematicFrame&&!motionReduced())cinema.update({...cinematicFrame,fresh:true,waiting:false,cueOpen:true,cueReady:cue.kind});
}});
const cinema = createCinema(`);
    code=once(code,'      setInlineBuffer(\'\');',`      setInlineBuffer('');
      performancePlayer.progress(count,{voicePhase:voice.phase});`);
    code=once(code,'      textWait.progress(key,count);',`      textWait.progress(key,count);
      performancePlayer.progress(count,{voicePhase:voice.phase});`);
    code=code.replaceAll('isPaused: () => cinema.blocked ||','isPaused: () => cinema.blocked || performancePlayer.blocked ||');
    code=once(code,'function playbackBlocked(full = false) { return cinema.blocked ||', 'function playbackBlocked(full = false) { return cinema.blocked || performancePlayer.blocked ||');
    code=once(code,'onState: phase => { if', 'onState: phase => { queueMicrotask(()=>performancePlayer.progress(state.reveal.length,{voicePhase:phase})); if');
    code=once(code,"  return { cue: near.map(row => String(row.rawText || row.text || '')).join(' ').slice(0, 240),", "  return { cue: [near.map(row => String(row.rawText || row.text || '')).join(' '),deliveryNotes[view?.direction?.performance?.delivery]||''].filter(Boolean).join(' ').slice(0, 240),");
    code=once(code,'  const view = artContinuity.select(rawView,', '  const composedView = artContinuity.select(rawView,');
    code=once(code,'  state.presentedView = view;',`  const view=portraitContinuity.select(composedView,{pageKey:pageKey(page),open:state.cueOpen||initialWait});
  state.presentedView = view;`);
    code=once(code,"  const positions = stagePositions(state.stageOrder.length, { layout: state.reading.layout, narrow, compactLandscape }), width = slotWidth(state.stageOrder.length, narrow);",`  const positions = stagePositions(state.stageOrder.length, { layout: state.reading.layout, narrow, compactLandscape }), width = slotWidth(state.stageOrder.length, narrow);
  const performance=view?.direction?.performance;
  const blocking=sceneBlocking.place({sceneKey:String(state.activeSlug)+':'+String(view?.environment||''),actors:performance?.actors,ids:state.stageOrder,positions,focusId:state.focusId||speakerId,requested:performance?.framing});`);
    code=once(code,"    slot.style.setProperty('--x', String(positions[index]));",`    const placement=blocking[index];
    slot.style.setProperty('--x',String(placement?.x??positions[index]));
    slot.style.setProperty('--scene-depth',String(placement?.depth||1));
    slot.dataset.pose=person.pose||'standing';
    slot.dataset.facing=placement?.facing||'front';`);
    code=once(code,"  stage.dataset.weather = weatherFor(scene?.world);",`  stage.dataset.weather = weatherFor(scene?.world);
  const grade=lightingGrade(stage.dataset.light,stage.dataset.weather,view?.direction?.performance?.lighting);
  stage.dataset.backlit=String(grade.backlit);
  stage.style.setProperty('--actor-brightness',String((grade.red+grade.green+grade.blue)/3*grade.brightness));
  stage.style.setProperty('--actor-warmth',String(Math.max(0,grade.warm)));
  stage.style.setProperty('--actor-saturation',String(grade.saturation));`);
    code=once(code,"  if (direction.fx !== 'none' && !state.firedEffects.has(`${key}:fx`)) { state.firedEffects.add(`${key}:fx`); playEffect(direction.fx); score.effect('impact'); }",'  // Impact is dispatched at its text anchor by performancePlayer.');
    code=once(code,'  cinema.update({ pageKey: pageKey(page),',`  performancePlayer.update({key:pageKey(page),text:typeset(page.rawText||page.text).visible,direction:view?.direction||{},waiting:state.dialogueWaiting,
    fresh:state.cursor>state.readThrough&&!page.isLive&&state.playback!=='skip',enabled:state.reading.cinema==='on',multiplayer:host.multiplayer,
    paused:document.hidden||!$('vn-history').hidden||state.hideText||Boolean(document.querySelector('dialog[open]'))});
  cinematicFrame={ pageKey: pageKey(page),`);
    code=once(code,"eventArt: Boolean(view?.eventBackground || view?.shotKind) });",`eventArt: Boolean(view?.eventBackground || view?.shotKind) };
  cinema.update(cinematicFrame);`);
    code=once(code,'  const selectedTurn = turns[page.turnIndex];',`  const selectedTurn = turns[page.turnIndex];
  $('vn-stage').dataset.dramatic=String(Boolean(view?.direction?.emphasis));`);
    // Keep paragraph offsets and shared-room page IDs unchanged; presentation only.
    code=once(code,"const layout = typeset(String(frame.at(-1)?.text || '…'))", "const layout = typeset(String(frame.at(-1)?.text || '…'),state.presentedView?.direction?.emphasis?.text||'')");
    code=once(code,"if (screen !== 'stage') { cueWindow.reset();", "if (screen !== 'stage') { performancePlayer.reset();portraitContinuity.reset();sceneBlocking.reset();foley.stop();cueWindow.reset();");
    code=once(code,"document.addEventListener('visibilitychange', () => { if (document.hidden) {", "document.addEventListener('visibilitychange', () => { if (document.hidden) { performancePlayer.reset();foley.stop();");
    code=once(code,"window.addEventListener('resize',", "root.addEventListener('pointerdown',()=>foley.resume(),{passive:true});\nwindow.addEventListener('resize',");
    code=once(code,'새 구도로 그린 컷<select','추가 구도·자세 생성<select');
    code=once(code,'켬 · 상반신 / 전신 / 얼굴 / 손','켬 · 구도 / 자세 / 시선 · 추가 비용');
  }
  return code;
}
