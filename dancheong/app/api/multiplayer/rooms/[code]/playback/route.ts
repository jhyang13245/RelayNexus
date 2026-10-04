import {NextResponse} from 'next/server';
import {requireAccountContext} from '../../../../../../lib/account-store';
import {vnPlaybackOperation} from '../../../../../../lib/multiplayer-vn-playback';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{code:string}>}) {
  try {
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin)return NextResponse.json({error:'같은 사이트에서 요청해 주세요.'},{status:403});
    const account=await requireAccountContext(),{code}=await params;
    const text=await request.text();if(text.length>1024)throw Error('공유 읽기 요청이 너무 큽니다.');
    return NextResponse.json(await vnPlaybackOperation(account,code,JSON.parse(text)),{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'공유 읽기 연결을 확인해 주세요.'},{status:400,headers:{'Cache-Control':'no-store'}}); }
}
