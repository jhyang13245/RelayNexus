// One replaceable pending input, one request, at most once per second.
export function createDraftQueue(upload:(body:any)=>Promise<any>,clock=()=>Date.now()){
 let revision=0,seq=0,text='',sent='',operationId='',dirty=false,running=false,lastAttempt=-Infinity,lastSent=0;
 return {
  reset(value:number){if(value===revision)return;revision=value;seq=0;text=sent='';dirty=false;operationId='';lastAttempt=-Infinity;lastSent=0},
  change(value:string){value=value.slice(0,12000);if(value===text)return;text=value;dirty=true;operationId=crypto.randomUUID()},
  async flush(){if(!revision||running||clock()-lastAttempt<1000||(!dirty&&(!text||clock()-lastSent<30000)))return;
   running=true;lastAttempt=clock();const current={kind:'INPUT_DRAFT',revision,expectedSeq:seq,text,operationId:operationId||crypto.randomUUID()};
   try{const result=await upload(current);if(current.revision!==revision)return;seq=Number(result.seq)||0;if(result.accepted){lastSent=clock();sent=current.text;if(current.text===text&&current.operationId===operationId)dirty=false}}
   catch{ /* Retry the newest input only; never interrupt a story submission. */ }
   finally{running=false}
  },
  get text(){return text},get acknowledged(){return sent}
 };
}
