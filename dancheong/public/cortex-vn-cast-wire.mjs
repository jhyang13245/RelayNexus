// Transport compression only. The original cast validator remains the authority
// for identity, physical presence, timing, wardrobe and every directing cue.
const FORMAT = 'cast-compact-1';
const proofFields = new Set(['evidence','identityEvidence','speakerEvidence','shotEvidence','eventEvidence']);
const defaults = {
  expressions:[], wardrobe:[], shot:'medium', artShot:'none', shotEvidence:'', cutin:'none',
  composition:{mode:'stage',evidence:''}, emphasis:{kind:'none',text:''}, transition:'none',
  fx:'none', mood:'normal', music:{cue:'keep',evidence:''}, cg:false, eventEvidence:'',
  eventFocus:'', eventParticipants:[], eventCastComplete:false,
  performance:null, stagecraft:null,
};
const cueFields = new Set(['focus',...Object.keys(defaults)]);
const integer = {type:'integer',minimum:0};
const proof = {type:'integer',minimum:-1,description:'Index in proofs; -1 means empty evidence.'};
const object = properties => ({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
function proofSchema(schema) {
  if (schema.type === 'object') return object(Object.fromEntries(Object.entries(schema.properties).map(([key,value])=>[key,proofFields.has(key)?proof:proofSchema(value)])));
  if (schema.type === 'array') return {...schema,items:proofSchema(schema.items)};
  return schema;
}
export function compactCastRequest(request) {
  // Muse intentionally has no strict text.format; its base schema is supplied
  // separately by the integration before the provider-specific omission.
  const schema=request.text?.format?.schema;
  if (!schema) throw Error('Cast schema is required before transport adaptation.');
  const fields=schema.properties.beats.items.properties;
  const wire=object({
    format:{type:'string',enum:[FORMAT]},
    proofs:{type:'array',items:{type:'string'},maxItems:512},
    bindings:{type:'array',items:proofSchema(fields.onStage.items),maxItems:128},
    beats:{type:'array',items:object({
      beat:fields.beat,speaker:fields.speaker,speakerLabel:fields.speakerLabel,speakerEvidence:proof,
      onStage:{type:'array',items:integer},
      cues:{type:'array',items:{anyOf:[...cueFields].filter(field=>fields[field]).map(field=>object({field:{type:'string',enum:[field]},value:proofFields.has(field)?proof:proofSchema(fields[field])}))}},
    })},
  });
  const marker='Return ONLY JSON with this shape:';
  const at=request.instructions.indexOf(marker);
  if(at<0)throw Error('Cast output contract changed.');
  const instructions=request.instructions.slice(0,at)+`Return ONLY compact JSON with exactly this shape:
{"format":"${FORMAT}","proofs":["exact complete published evidence"],"bindings":[{"candidate":"C0","evidence":0,"identityEvidence":0,"identityStatus":"confirmed","presence":"physical"}],"beats":[{"beat":"P0","speaker":"C0","speakerLabel":"public label","speakerEvidence":0,"onStage":[0],"cues":[]}]}
This is only an encoding of ALL rules above, never a shortcut to identity or presence. Put each distinct exact quote ONCE in proofs. Every evidence/identityEvidence/speakerEvidence/shotEvidence/eventEvidence field, including nested cue values, is an integer index into proofs; -1 means empty evidence. Never paraphrase a proof. Put each distinct onStage binding ONCE in bindings. A beat's onStage lists binding indexes, NOT candidate indexes. Reuse a binding only while its evidence actually supports presence at that beat; a later proof cannot justify an earlier appearance. Speaker and focus still use C handles. Include EVERY beat in original order, even empty/narration beats.
cues is a sparse array of {"field":"field name","value":the value} for directing fields. Omitted fields expand to ${JSON.stringify(defaults)}, with focus defaulting to that beat's speaker. Specify any nondefault value, including a sustained mood/shot, explicitly on each applicable beat. Do not inherit a prior event, camera effect or emphasis by omission. Empty cues is correct for ordinary scenes. Use the directing fields and value shapes described above; each field can occur at most once. For example {"field":"expressions","value":[{"candidate":"C0","expression":"sad","evidence":0}]} or {"field":"music","value":{"cue":"silence","evidence":0}}. Cast identity, presence, appearance timing and evidence validation are unchanged.`;
  const data=JSON.parse(request.input),{references,...context}=data;
  return {...request,instructions,input:JSON.stringify({references,...context}),
    text:{format:{type:'json_schema',name:'compact_physical_cast_timeline',strict:true,schema:wire}}};
}
function unpackProofs(value, proofs, field='') {
  if(proofFields.has(field)){
    if(value===-1)return '';
    if(!Number.isInteger(value)||value<0||value>=proofs.length)throw Error('Invalid cast proof reference.');
    return proofs[value];
  }
  if(Array.isArray(value))return value.map(item=>unpackProofs(item,proofs));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,unpackProofs(item,proofs,key)]));
  return value;
}
export function expandCastDecision(value) {
  // Existing saved/legacy decisions still pass the very same semantic validator.
  if(value?.format===undefined)return value;
  if(value.format!==FORMAT||!Array.isArray(value.proofs)||value.proofs.length>512||value.proofs.some(text=>typeof text!=='string')
    ||!Array.isArray(value.bindings)||value.bindings.length>128||!Array.isArray(value.beats))throw Error('Invalid compact cast response.');
  const bindings=value.bindings.map(binding=>{
    if(!binding||typeof binding!=='object'||!/^C(0|[1-9]\d*)$/u.test(binding.candidate)
      ||!['confirmed','uncertain'].includes(binding.identityStatus)||!['physical','remote','mentioned','uncertain'].includes(binding.presence)
      ||!Object.hasOwn(binding,'evidence')||!Object.hasOwn(binding,'identityEvidence'))throw Error('Invalid cast binding.');
    return unpackProofs(binding,value.proofs);
  });
  return {beats:value.beats.map(beat=>{
    if(!beat||typeof beat.beat!=='string'||typeof beat.speaker!=='string'||typeof beat.speakerLabel!=='string'
      ||!Object.hasOwn(beat,'speakerEvidence')||!Array.isArray(beat.onStage)||!Array.isArray(beat.cues))throw Error('Invalid compact beat.');
    const row={...structuredClone(defaults),focus:beat.speaker,beat:beat.beat,speaker:beat.speaker,speakerLabel:beat.speakerLabel,
      speakerEvidence:unpackProofs(beat.speakerEvidence,value.proofs,'speakerEvidence'),
      onStage:beat.onStage.map(index=>{if(!Number.isInteger(index)||index<0||index>=bindings.length)throw Error('Invalid cast binding reference.');return structuredClone(bindings[index]);})};
    const seen=new Set();
    for(const cue of beat.cues){
      if(!cue||!cueFields.has(cue.field)||seen.has(cue.field)||!Object.hasOwn(cue,'value'))throw Error('Invalid directing cue.');
      seen.add(cue.field);row[cue.field]=unpackProofs(cue.value,value.proofs,cue.field);
    }
    return row;
  })};
}
