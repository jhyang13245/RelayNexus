// Exercises the new browser Responses path, not the retained legacy JSON endpoint.
export function installInstantModel(model, options={}) {
  const ordinary=model.fetch;
  model.fetch=async(url,init)=>{
    const req=init?.body?JSON.parse(init.body):{};let payload={};
    try{payload=JSON.parse(req.input?.[1]?.content?.[0]?.text||'{}')}catch{}
    const schema=payload.schema||'';
    if(req.text?.format?.name==='author_next_moves'&&options.nextMoves)return options.nextMoves(req,payload);
    if(!schema.startsWith('CORTEX_INSTANT_'))return ordinary(url,init);
    options.onCall?.(schema,payload,req);
    if(schema==='CORTEX_INSTANT_WRITER_V2'||schema==='CORTEX_INSTANT_TAIL_V2'){
      options.onWriter?.(payload.context);
      if(options.fail?.())throw Error('TEST_TRANSPORT_FAILURE');
      const prose=options.prose?.(payload)||'서준은 동생을 도왔다. 열쇠를 작업대 위에 놓았다.\n\n⟦N:서준⟧“내가 확인할게.”\n⟦N:지나가던 행인⟧“천천히 하세요.”';
      const text=prose+(options.omitRecommendations?'':'<!--CORTEX_ST_V1 '+JSON.stringify({schema:'CORTEX_NARRATIVE_SPACETIME_TRACK_V1',segments:[],recommendations:['열쇠를 살핀다','문을 연다','서민에게 묻는다']})+'-->');
      let wire=[...text].map(delta=>'data: '+JSON.stringify({type:'response.output_text.delta',delta})+'\n\n').join('');
      if(!options.truncated)wire+='data: {"type":"response.completed","response":{"status":"completed"}}\n\n';
      return new Response(wire);
    }
    let result;
    if(schema==='CORTEX_INSTANT_PARAGRAPH_V2')result=await options.audit?.(payload)||{verdict:'PASS',category:'NONE',reason:'',evidence:'',conflictingEvidence:''};
    else if(schema==='CORTEX_INSTANT_EDITOR_V2')result=await options.editor?.(payload)||{decision:'KEEP',text:payload.draft,changesPremise:false,reason:''};
    else result=await options.hud?.(payload,schema)||{statChanges:[{id:'trust',delta:2,evidence:'동생을 도왔다.'}],relationshipChanges:[],world:null,presentCharacterIds:['hero','sibling']};
    return Response.json({status:'completed',output_text:JSON.stringify(result)});
  };
  return model;
}
