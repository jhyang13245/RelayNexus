import {getOptionalAccountContext} from '../account-store';
const denied=(message:string,status:number,code:string)=>Response.json({error:{message,code}},{status,headers:{'Cache-Control':'no-store','X-VN-Provider-State':'not-started'}});
export async function vnAccess(request:Request){
 try{
  const account=await getOptionalAccountContext();
  if(!account)return denied('단청에 로그인한 뒤 이용해 주세요.',401,'VN_LOGIN_REQUIRED');
  // Solo sends the owner namespace; existing multiplayer readers send its raw
  // account ID. Both must identify this exact authenticated account, never an
  // arbitrary account or an omitted fence.
  const identity=request.headers.get('X-Cortex-Account');
  if(identity!==account.ownerKey&&identity!==account.id)return denied('로그인 계정이 변경되었습니다. 서재에서 다시 열어 주세요.',409,'VN_ACCOUNT_CHANGED');
  if(request.method!=='GET'&&request.headers.get('Origin')!==new URL(request.url).origin)return denied('요청 출처를 확인하지 못했습니다.',403,'VN_ORIGIN_INVALID');
  return null;
 }catch(error){return denied('계정 이용 상태를 확인해 주세요.',(error as {status?:number}).status===403?403:503,'VN_ACCESS_UNAVAILABLE');}
}
