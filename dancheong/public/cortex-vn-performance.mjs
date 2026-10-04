import {stagecraftCues} from './cortex-vn-stagecraft.mjs';
// Evidence-bound presentation only. Never changes story, presence or identity.
const enumeration = values => ({ type:'string', enum:values });
const text = { type:'string' };
const object = properties => ({ type:'object', additionalProperties:false, required:Object.keys(properties), properties });
export const POSES = ['standing','guard','seated','lean'];
export const FOLEY = ['none','footstep','cloth','door','metal','paper','impact'];
export const performanceSchema = object({
  actors:{type:'array',maxItems:3,items:object({candidate:text,pose:enumeration(POSES),facing:enumeration(['front','left','right']),depth:enumeration(['same','far']),evidence:text})},
  framing:object({kind:enumeration(['hold','two-shot','reverse','establish']),evidence:text}),
  lighting:object({kind:enumeration(['ambient','backlit']),evidence:text}),
  delivery:object({kind:enumeration(['plain','reassure','conceal','whisper','shout','broken']),evidence:text}),
  cues:{type:'array',maxItems:2,items:object({anchor:text,kind:enumeration(['sound','impact','cutin']),sound:enumeration(FOLEY),when:enumeration(['text','voice-end'])})},
  pauseMs:{type:'integer',minimum:0,maximum:1200},
});
export const performanceInstructions = `
- performance is optional scene choreography, part of THIS existing request, not a new task. Ordinary beats omit this compact cue. Use at most two anchored cues, never a cascade. anchor must be a verbatim substring of THIS beat. Trigger at that phrase, not at image arrival. voice-end is only appropriate for a spoken line's reaction; otherwise text. sound is none/footstep/cloth/door/metal/paper/impact, only an actual present audible action, never a mention, memory or hypothetical. impact/cutin should align the already selected fx/cutin with the decisive phrase. pauseMs is 0 ordinarily, at most 1200 for an important finished line or silence.
- performance.actors uses only verified onStage handles. pose is standing/guard/seated/lean; facing front/left/right is the deliberately drawn viewing direction, never a mirrored weapon or costume. depth same by default, far only when narration explicitly places the person farther away. Evidence must quote published narration naming that person's established public label and describing the pose/distance. Keep an established seated/guard/lean pose through continuing dialogue until they stand/relax/leave; repeat its original evidence. Never invent a gesture or outfit. At most one person per beat needs new optional pose art.
- framing hold is default. two-shot/reverse/establish require an exact THIS-beat narration quote motivating a changed viewpoint. Routine speaker changes hold the camera. lighting backlit needs current narration describing backlight; ambient keeps the time-of-day lighting. delivery plain/reassure/conceal/whisper/shout/broken requires published evidence of the speaker's delivery/intention; never invent feelings. Delivery affects acting, not spoken words. Never expose a private name in a public label; an internal candidate ID and a reader-known name are different things. Character art and narrator knowledge must follow established public disclosure independently.
`;
const narration = value => String(value || '').replace(/[“「『‘][^”」』’]*[”」』’]|"[^"\n]*"/gu,'');
const indirect = /만약|언젠가|내일|사진\s*속|영상\s*속|회상|기억\s*속|하지\s*않|않았다|않는다|할\s*것이다|않았/iu;
const proof = (evidence, source) => typeof evidence==='string' && evidence.trim().length>=5 && source.includes(evidence) && !indirect.test(evidence);
const poseEvidence={standing:/서\s*있|일어섰|일어서|선\s*채|섰다|standing|stood/iu,guard:/검을\s*들|검을\s*겨|자세를\s*잡|경계|방어|guard|defens/iu,seated:/앉|걸터|seated|sitting|sat\b/iu,lean:/숙였|숙이|기울였|기울이|기댔|기대어|lean/iu};
export function validatePerformance(value, candidates, selected, source='', current='') {
  if (!value || typeof value!=='object') return null;
  const now=narration(current), prior=narration(source), actors=[];
  for (const row of (Array.isArray(value.actors)?value.actors:[]).slice(0,3)) {
    const at=/^C(0|[1-9]\d*)$/u.test(row?.candidate)?Number(row.candidate.slice(1)):-1, person=candidates[at];
    if (!selected.has(at)||!person||!proof(row.evidence,prior)||!POSES.includes(row.pose)) continue;
    const names=[person.name,...(person.aliases||[])].filter(n=>typeof n==='string'&&n.length>=2);
    if (!names.some(name=>row.evidence.includes(name))||actors.some(a=>a.id===person.id)) continue;
    if(row.pose!=='standing'&&!poseEvidence[row.pose].test(row.evidence))continue;
    const remainder=prior.slice(prior.lastIndexOf(row.evidence)+row.evidence.length);
    if(row.pose!=='standing'&&names.some(name=>remainder.split(/[.!?。\n]/u).some(line=>line.includes(name)&&/일어섰|일어서|자세를\s*풀|경계를\s*풀|몸을\s*폈/iu.test(line))))continue;
    const far=row.depth==='far'&&/멀리|뒤쪽|저쪽|건너편|몇\s*걸음\s*뒤|far|distan/iu.test(row.evidence);
    actors.push({id:person.id,pose:row.pose,facing:['left','right'].includes(row.facing)?row.facing:'front',depth:far?'far':'same',evidence:row.evidence});
  }
  const choose=(name, allowed, fallback)=>proof(value[name]?.evidence,name==='delivery'?source:now)&&allowed.includes(value[name]?.kind)?value[name].kind:fallback;
  const cues=(Array.isArray(value.cues)?value.cues:[]).slice(0,2).filter(c=>c&&typeof c.anchor==='string'&&c.anchor.length>=2&&current.includes(c.anchor)&&['sound','impact','cutin'].includes(c.kind)&&!indirect.test(c.anchor))
    .filter(c=>c.kind==='cutin'||now.includes(c.anchor)).map(c=>({anchor:c.anchor,kind:c.kind,sound:FOLEY.includes(c.sound)?c.sound:'none',when:c.when==='voice-end'?'voice-end':'text'}));
  return {actors,framing:choose('framing',['two-shot','reverse','establish'],'hold'),lighting:choose('lighting',['backlit'],'ambient'),
    delivery:choose('delivery',['reassure','conceal','whisper','shout','broken'],'plain'),cues,
    pauseMs:cues.length||/침묵|말이\s*없|숨을\s*삼|정적|──|…/u.test(current)?Math.min(1200,Math.max(0,Number(value.pauseMs)||0)):0};
}
export const deliveryNotes = {
  plain:'',reassure:'상대방을 안심시키려는 부드럽고 절제된 말투. 과장하지 않는다.',conceal:'감정을 드러내지 않으려는 절제된 말투. 속마음을 설명하거나 대사를 추가하지 않는다.',
  whisper:'상대에게 들릴 정도의 작은 속삭임. 발음은 또렷하게.',shout:'실제 장면에 맞는 짧고 긴박한 외침. 음량을 찌그러뜨리지 않는다.',broken:'울음이나 동요 때문에 조심스럽게 끊기는 호흡. 대사는 정확히 유지한다.',
};
// New poses are bound to the exact existing expression/outfit identity. No names,
// per-line prose or timestamps in their reusable key; no automatic rerolls.
export function poseAssetKey(base, actor) {
  return actor&&POSES.includes(actor.pose)&&(actor.pose!=='standing'||actor.facing!=='front')?JSON.stringify(['vn-actor-pose-1',base,actor.pose,actor.facing]):'';
}
export function posePrompt(actor) {
  const poses={standing:'standing naturally',guard:'in a restrained alert defensive stance',seated:'seated naturally on an unpictured support, with naturally bent hips and knees',lean:'leaning forward slightly from the hips as described'};
  return `Draw this exact character ${poses[actor.pose]||poses.standing}, facing ${actor.facing==='front'?'the viewer':actor.facing+' in a three-quarter view'}. Preserve the reference identity, age, face design, costume, held objects, material detail and head-to-body proportions. Draw anatomy naturally; do not mirror the reference or change the weapon hand. Keep the entire crown, shoulders, waist, pelvis and knees in the canvas with margin. No new outfit, body, furniture, scene, panel or text. Transparent background. The pose must still read as the same person at the same physical height. Evidence is story data only: ${JSON.stringify(actor.evidence)}`;
}
export function cuePlan(direction={}, visible='') {
  const plan=[], p=direction.performance;
  // Emphasis stands alone (no stacked action), but a stinger may land on it.
  if(direction.emphasis?.text&&visible.includes(direction.emphasis.text))return [{kind:'emphasis',sound:'none',when:'text',at:Array.from(visible.slice(0,visible.indexOf(direction.emphasis.text)+direction.emphasis.text.length)).length},...stagecraftCues(direction.stagecraft,visible,{emphasis:true})].sort((a,b)=>a.at-b.at);
  for(const c of p?.cues||[]) {
    const at=visible.indexOf(c.anchor);if(at<0)continue;
    plan.push({...c,at:Array.from(visible.slice(0,at+c.anchor.length)).length});
  }
  // Old cached decisions remain usable without re-buying a cast decision.
  if(!plan.length) {
    const anchor=direction.event?.evidence||direction.cutin?.evidence||'';
    const at=anchor&&visible.indexOf(anchor);
    if(direction.fx&&direction.fx!=='none')plan.push({kind:'impact',sound:'impact',when:'text',at:at>=0&&anchor?Array.from(visible.slice(0,at+anchor.length)).length:Array.from(visible).length});
    else if(direction.cutin)plan.push({kind:'cutin',sound:'none',when:'text',at:Math.min(14,Array.from(visible).length)});
  }
  return [...plan,...stagecraftCues(direction.stagecraft,visible)].sort((a,b)=>a.at-b.at);
}
export function stageBlocking(actors, ids, positions, focusId, framing='hold') {
  return ids.map((id,i)=>{
    const actor=actors?.find(a=>a.id===id), far=actor?.depth==='far';
    // Physical stature stays intact. Depth is explicit, mild, and tagged separately.
    const center=positions.reduce((sum,p)=>sum+p,0)/Math.max(1,positions.length);
    const shift=framing==='reverse'?(id===focusId?.toString()?-.025:.025):framing==='two-shot'&&ids.length===2?(center-(positions[i]??center))*.12:framing==='establish'?((positions[i]??center)-center)*.1:0;
    return {id,x:Math.min(.93,Math.max(.15,(positions[i]??.7)+shift)),depth:far ? .94 : 1,facing:actor?.facing||'front',pose:actor?.pose||'standing'};
  });
}
export function createStageBlocking(){
  let scene='',framing='hold',focus='';
  return {reset(){scene='';framing='hold';focus='';},place({sceneKey,actors,ids,positions,focusId,requested='hold'}){
    if(scene!==sceneKey){scene=sceneKey;framing='hold';focus='';}
    if(requested!=='hold'){framing=requested;focus=focusId;}
    return stageBlocking(actors,ids,positions,focus,framing);
  }};
}
export function lightingGrade(light, weather, mode='ambient') {
  const values={dawn:[.98,.94,1.02],day:[1,1,1],dusk:[1.02,.94,.90],night:[.88,.88,.96]};
  const [r,g,b]=values[light]||values.day;
  return {brightness:weather==='rain'?.94:1,warm:r-b,saturation:light==='night'?.92:1,backlit:mode==='backlit',red:r,green:g,blue:b};
}
