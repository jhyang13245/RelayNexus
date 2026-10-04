import {requireAccountContext} from '../account-store';
import {getCortexCloudSession} from '../cortex-cloud-store';
import {createCloudService} from './vn-cloud-service';
import {createCloudObjects} from './vn-cloud-objects';
export async function handleVNCloud(request:Request,session:string,objects:boolean,key?:string){
 try{
  const account=await requireAccountContext();
  if(request.headers.get('X-Cortex-Account')!==account.ownerKey)return Response.json({error:'로그인 계정이 바뀌었습니다.'},{status:409});
  if(!/^[a-zA-Z0-9_-]{1,160}$/u.test(session))return Response.json({error:'잘못된 세션입니다.'},{status:400});
  if(!await getCortexCloudSession(account.ownerKey,session))return Response.json({error:'현재 계정의 단청 세션을 찾지 못했습니다.'},{status:404});
  const {env}=await import('cloudflare:workers');
  const dependencies={getUser:async()=>({userId:account.id+':main-session:'+session,displayName:account.displayName}),getBindings:()=>({db:env.DB,bucket:env.BUCKET})};
  return objects?createCloudObjects(dependencies)(request,key):createCloudService(dependencies)(request,key);
 }catch(error){return Response.json({error:'계정 또는 클라우드 저장 상태를 확인해 주세요.'},{status:(error as {status?:number}).status||503});}
}
