import {NextResponse} from 'next/server';
import {requireAccountContext} from '../../../../../../lib/account-store';
import {visualOperation} from '../../../../../../lib/multiplayer-visual';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{code:string}>}){
 try{
  const account=await requireAccountContext(),{code}=await params;
  if(Number(request.headers.get('content-length'))>13*1024*1024)throw Error('자산 용량이 너무 큽니다.');
  const text=await request.text();if(text.length>13*1024*1024)throw Error('자산 용량이 너무 큽니다.');
  const result=await visualOperation(account,code,JSON.parse(text));
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'공유 자산 연결을 확인해 주세요.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
