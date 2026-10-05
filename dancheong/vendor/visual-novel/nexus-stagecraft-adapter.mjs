// Maintained integration layer for stagecraft (typography, action staging,
// 2.5D depth, CG camera, art rule/grade, stingers/motifs, recorded foley,
// waiting presentation). Applied after the performance adapter; the imported
// standalone sources stay intact.
function once(code, before, after){if(code.split(before).length!==2)throw Error('Stagecraft adapter target changed: '+before.slice(0,100));return code.replace(before,after);}
function exactly(code, before, after, count){if(code.split(before).length!==count+1)throw Error('Stagecraft adapter target count changed: '+before.slice(0,100));return code.replaceAll(before,after);}
export function adaptStagecraft(name, code, version){
  const from = module => `../cortex-vn-${module}.mjs?v=${version}`;
  if(name==='vn-cast.mjs'){
    code=`import {stagecraftSchema,stagecraftInstructions,validateStagecraft} from '${from('stagecraft')}';\n`+code;
    code=once(code,"props.properties.performance=performanceSchema;props.required.push('performance');","props.properties.performance=performanceSchema;props.required.push('performance');props.properties.stagecraft=stagecraftSchema;props.required.push('stagecraft');");
    code=once(code,"performanceInstructions+'\\nReturn ONLY JSON with this shape:'","performanceInstructions+stagecraftInstructions+'\\nReturn ONLY JSON with this shape:'");
    code=once(code,'return { expressions, focusId, performance:','return { expressions, focusId, stagecraft:validateStagecraft(beat.stagecraft,eventSource,{focusId,fx:beat.fx}), performance:');
  }
  if(name==='vn-music-direction.mjs'){
    // An explicit battle entrance lands on its beat like tense/eerie on an impact.
    code=once(code,"(pending.dramatic && ['tense', 'eerie'].includes(pending.cue)))","(pending.dramatic && ['tense', 'eerie'].includes(pending.cue)) || pending.cue === 'battle')");
    code=once(code,"export const musicCues = ['keep', 'silence', 'normal', 'warm', 'sad', 'tense', 'eerie', 'memory'];","export const musicCues = ['keep', 'silence', 'normal', 'warm', 'sad', 'tense', 'battle', 'eerie', 'memory'];");
  }
  if(name==='vn-music.mjs'){
    code=once(code,'const MOODS = ["normal", "warm", "sad", "tense", "eerie", "memory"];','const MOODS = ["normal", "warm", "sad", "tense", "battle", "eerie", "memory"];');
    code=once(code,'  tense: { bpm: 112, root: 56,','  battle: { bpm: 152, root: 52, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 0, 8, 10, 0, 0, 5, 7] },\n  tense: { bpm: 112, root: 56,');
    code=once(code,'if (name === "tense" || name === "normal" || name === "warm") {','if (name === "tense" || name === "battle" || name === "normal" || name === "warm") {');
    code=once(code,'const density = name === "tense" ? 0.85 :','const density = name === "battle" ? 0.92 : name === "tense" ? 0.85 :');
    // A low pulse on every beat gives the battle pattern percussion.
    code=once(code,'    for (const b of slot.bass) {','    if (pattern.mood === "battle" && idx % 2 === 0) playTone({ freq: 62, time, dur: 0.11, type: "sine", peak: 0.26 * (0.4 + vol) });\n    for (const b of slot.bass) {');
  }
  if(name==='vn-assets.mjs')code=exactly(code,"String(style || '').trim().slice(0, 600)","String(style || '').trim().slice(0, 820)",2);
  if(name==='vn-music-ai.mjs')code=once(code,"  eerie: { bpm: 60,","  battle: { bpm: 152, text: 'full-scale battle; fast driving percussion ostinato, aggressive low strings and brass stabs, heroic and violent, relentless forward momentum' },\n  eerie: { bpm: 60,");
  if(name==='vn-work-music.mjs'){
    code=once(code,"tense: '긴장·전투', eerie:","tense: '긴장·대치', battle: '전투', eerie:");
    code=once(code,"for (const name of [...new Set([kind, 'normal'])])","for (const name of [...new Set([kind, ...(kind === 'battle' ? ['tense'] : []), 'normal'])])");
  }
  if(name==='vn-typeset.mjs'){
    code=once(code,"export function typeset(input, dramatic = '') {","export function typeset(input, dramatic = '', effects = []) {");
    code=once(code,'  marks.sort((a, b) => a.at - b.at);',`  for(const effect of Array.isArray(effects)?effects:[]){
    const value=String(effect?.text||'');if(!value)continue;
    for(let at=source.indexOf(value);at>=0;at=source.indexOf(value,at+1)){const end=at+value.length;if(!marks.some(mark=>at<mark.end&&end>mark.at)){marks.push({at,end,text:value,fx:effect.style});break;}}
  }
  marks.sort((a, b) => a.at - b.at);`);
    code=once(code,'segments.push(mark.dramatic ?','segments.push(mark.fx ? {text:mark.text,fx:mark.fx} : mark.dramatic ?');
    code=once(code,'    if(row.dramatic){',`    if(row.fx){const span=doc.createElement('span');span.className='vn-fx vn-fx-'+String(row.fx).replace(/[^a-z]/gu,'');
      if(row.fx==='tremble')Array.from(shown).forEach((glyph,index)=>{const part=doc.createElement('span');part.style.setProperty('--g',String(index));part.textContent=glyph;span.append(part);});else span.textContent=shown;nodes.push(span);}
    else if(row.dramatic){`);
  }
  if(name==='vn-reader.mjs'){
    code=once(code,"update({ key, text, speed = 'natural', immediate = false }) {","update({ key, text, speed = 'natural', immediate = false, pace = null }) {");
    code=once(code,'state.key = key; state.text = text; state.glyphs = next; state.speed = speed;','state.key = key; state.text = text; state.glyphs = next; state.speed = speed; state.pace = typeof pace === \'function\' ? pace : null;');
    code=once(code,'state.timer = schedule(step, glyphDelay(state.glyphs[state.length - 1], state.speed));','state.timer = schedule(step, glyphDelay(state.glyphs[state.length - 1], state.speed) * (state.pace?.(state.length) || 1));');
    code=once(code,"glyphDelay(state.glyphs[state.length - 1] || '', speed));","glyphDelay(state.glyphs[state.length - 1] || '', speed) * (state.pace?.(state.length) || 1));");
  }
  if(name==='vn.js'){
    code=`import {createStagecraft} from '${'../cortex-vn-stagecraft-dom.mjs?v='+version}';
import {createStageSound,createSampleFoley,createDuck} from '${from('sound')}';
import {createMusicSync,composeArtStyle,normalizeArtRule,normalizeStagecraftPrefs} from '${from('stagecraft')}';
import {cuePlan as stagecraftCuePlan} from '${from('performance')}';
import {portraitCutin as stagecraftCrop} from './vn-cinema.mjs';
const stageDuck=createDuck();
let stageAudio=null;
const stageAudioContext=()=>stageAudio&&stageAudio.state!=='closed'?stageAudio:(stageAudio=createFoleyContext());
const artRuleKey=slug=>'dancheong-vn-art-rule-v1:'+slug;
const artRules=new Map();
function readArtRule(slug){if(!artRules.has(slug)){let rule;try{rule=normalizeArtRule(JSON.parse(localStorage.getItem(artRuleKey(slug))||'{}'));}catch{rule=normalizeArtRule({});}artRules.set(slug,rule);}return artRules.get(slug);}
function writeArtRule(slug,rule){artRules.delete(slug);try{const value=normalizeArtRule(rule);if(Object.values(value).every(v=>v==='auto'))localStorage.removeItem(artRuleKey(slug));else localStorage.setItem(artRuleKey(slug),JSON.stringify(value));}catch{/* This tab keeps the previous rule. */}}
let stagecraftPrefs=(()=>{try{return normalizeStagecraftPrefs(JSON.parse(localStorage.getItem('dancheong-vn-stagecraft-v1')||'{}'));}catch{return normalizeStagecraftPrefs({});}})();
const musicSync=createMusicSync({onChange:()=>requestRender()});\n`+code;
    // Music engines poll their volume getter; direction moments duck through it.
    code=exactly(code,'state.reading.musicVolume * (voiceBusy() ? .3 : 1)','state.reading.musicVolume * (voiceBusy() ? .3 : 1) * stageDuck.level()',2);
    // One shared audio context for procedural foley, recorded foley and stage sound.
    code=once(code,"const foley=createFoley({createContext:createFoleyContext,enabled:()=>state.reading.sound==='on'&&state.screen==='stage'&&!document.hidden&&!document.querySelector('dialog[open]'),speaking:()=>voiceBusy()});",
      `const foleyEnabled=()=>state.reading.sound==='on'&&state.screen==='stage'&&!document.hidden&&!document.querySelector('dialog[open]');
const foley=createSampleFoley({createContext:stageAudioContext,enabled:foleyEnabled,speaking:()=>voiceBusy(),mode:()=>stagecraftPrefs.sfx,fallback:createFoley({createContext:stageAudioContext,enabled:foleyEnabled,speaking:()=>voiceBusy()})});
const stageSound=createStageSound({createContext:stageAudioContext,musicEnabled:()=>state.reading.music!=='off'&&state.reading.musicVolume>0&&state.screen==='stage'&&!document.hidden&&!document.querySelector('dialog[open]')&&$('vn-stage').dataset.stageMusic!=='silence',sfxEnabled:foleyEnabled,volume:()=>state.reading.musicVolume,speaking:()=>voiceBusy(),duck:stageDuck});
const stagecraft=createStagecraft({stage:$('vn-stage'),visual,reduced:motionReduced,prefs:()=>stagecraftPrefs,palette:()=>readArtRule(state.activeSlug).palette,crop:stagecraftCrop,sound:stageSound,foley});`);
    code=once(code,'fire:(cue,frame)=>{\n  if(cue.sound!==\'none\')foley.play(cue.sound,frame.key+cue.at);',`fire:(cue,frame)=>{
  stagecraft.fire(cue,frame);if(musicSync.release())requestRender();
  if(cue.sound!=='none')foley.play(cue.sound==='impact'&&['heavy_shake','flash_red'].includes(frame.direction.fx)?'heavy':cue.sound,frame.key+cue.at,{weather:$('vn-stage').dataset.weather});`);
    // Impact flashes share one budget with stagecraft's invert/strobe.
    code=once(code,"if(cue.kind==='impact'&&!motionReduced())playEffect(frame.direction.fx&&frame.direction.fx!=='none'?frame.direction.fx:'shake');","if(cue.kind==='impact'&&!motionReduced()){const fx=frame.direction.fx&&frame.direction.fx!=='none'?frame.direction.fx:'shake';playEffect(String(fx).startsWith('flash')&&!stagecraft.flashGate()?'shake':fx);}");
    code=once(code,'getStyle: () => state.artStyle,','getStyle: () => composeArtStyle(state.artStyle, readArtRule(state.activeSlug)),');
    code=once(code,'state.artStyle, state.reading.cg','composeArtStyle(state.artStyle, readArtRule(state.activeSlug)), state.reading.cg');
    // A music change on a beat with a text cue enters with that cue.
    code=once(code,'  score.update(music);\n  void workMusic.update(state.activeSlug, music, scenario?.runtime?.packageContract?.presentation?.music);',
      `  const syncedMusic=musicSync.select({pageKey:pageKey(page),music,cueBound:state.reading.cinema==='on'&&state.cursor>state.readThrough&&!page.isLive&&state.playback!=='skip'&&stagecraftCuePlan(view?.direction||{},typeset(page.rawText||page.text).visible).length>0});
  score.update(syncedMusic);
  $('vn-stage').dataset.stageMusic=syncedMusic;
  void workMusic.update(state.activeSlug, syncedMusic, scenario?.runtime?.packageContract?.presentation?.music);`);
    code=once(code,'  cinema.update(cinematicFrame);',`  cinema.update(cinematicFrame);
  stagecraft.update({pageKey:pageKey(page),scope:sceneScope(),sceneKey:cinematicFrame.sceneKey,paused:document.hidden||!$('vn-history').hidden||state.hideText||Boolean(document.querySelector('dialog[open]'))||root.classList.contains('vn-menu-open'),direction:view?.direction||{},kind:page.kind,composition,fresh:state.cursor>state.readThrough&&!page.isLive&&state.playback!=='skip',
    enabled:state.reading.cinema==='on'&&state.screen==='stage',waiting:state.dialogueWaiting,loading:Boolean(state.awaitingTurn||state.pages.some(row=>row.isLive)),background:state.backgroundDisplayedUrl||'',
    eventArt:view?.eventBackground||'',eventCharacterIds:view?.eventCharacterIds||[],portraits:view?.portraits||[],focusId:state.focusId||view?.speakerId||''});`);
    code=once(code,"const layout = typeset(String(frame.at(-1)?.text || '…'),state.presentedView?.direction?.emphasis?.text||'')","const layout = typeset(String(frame.at(-1)?.text || '…'),state.presentedView?.direction?.emphasis?.text||'',stagecraft.marks(state.presentedView?.direction,String(frame.at(-1)?.text || '')))");
    code=once(code,"reveal.update({ key, text: state.dialogueWaiting ? '' : full, speed: state.api._settings()?.typingSpeed,","reveal.update({ key, text: state.dialogueWaiting ? '' : full, speed: state.api._settings()?.typingSpeed, pace: stagecraft.pace(state.presentedView?.direction, full),");
    code=once(code,"if (screen !== 'stage') { performancePlayer.reset();","if (screen !== 'stage') { stagecraft.reset();stageSound.stop();musicSync.reset();performancePlayer.reset();");
    code=once(code,"document.addEventListener('visibilitychange', () => { if (document.hidden) { performancePlayer.reset();foley.stop();","document.addEventListener('visibilitychange', () => { if (document.hidden) { performancePlayer.reset();foley.stop();stageSound.stop();stagecraft.reset();");
    code=once(code,"root.addEventListener('pointerdown',()=>foley.resume(),{passive:true});",`root.addEventListener('pointerdown',()=>{foley.resume();stageSound.resume();},{passive:true});
const stagecraftSettings=stagecraft.mountSettings(directionPanel,{save:value=>{stagecraftPrefs=normalizeStagecraftPrefs(value);try{localStorage.setItem('dancheong-vn-stagecraft-v1',JSON.stringify(stagecraftPrefs));}catch{/* This tab only. */}requestRender();},
  rule:()=>readArtRule(state.activeSlug)});`);
    // The art rule is saved with the style note, by the same Save button.
    code=once(code,"      state.artStyle = $('vn-art-style').value.trim().slice(0, 600);","      state.artStyle = $('vn-art-style').value.trim().slice(0, 600);\n      if (stagecraftSettings) writeArtRule(state.activeSlug, stagecraftSettings.artRule());");
    code=once(code,"  $('vn-art-style').value = state.artStyle;","  $('vn-art-style').value = state.artStyle; stagecraftSettings?.sync();");
  }
  return code;
}
