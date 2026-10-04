import {NextResponse} from 'next/server';
import {requireAccountContext} from '../../../../../../lib/account-store';
import {requireMultiplayerMembership} from '../../../../../../lib/multiplayer-store';
import {database} from '../../../../../../lib/simulation-store';
import {LIVE_MAX_BYTES,publishLivePresentation} from '../../../../../../lib/multiplayer-live';
import {publishInputDraft} from '../../../../../../lib/multiplayer-input-draft';

export async function POST(request:Request,context:{params:Promise<{code:string}>}) {
  try {
    const account=await requireAccountContext(),{code}=await context.params;
    const access=await requireMultiplayerMembership(account,code);
    // Bound bytes before parsing, including chunked requests with no Content-Length.
    const reader=request.body?.getReader();if(!reader)throw Error('공유 본문이 없습니다.');
    const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIVE_MAX_BYTES+1024){await reader.cancel();throw Error('공유 표시 용량을 초과했습니다.');}chunks.push(value)}}finally{reader.releaseLock()}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
    const body=JSON.parse(new TextDecoder().decode(bytes));
    if(body.kind==='INPUT_DRAFT')return NextResponse.json(await publishInputDraft(await database(),String(access.room.id),account.id,body),{headers:{'Cache-Control':'no-store'}});
    if(typeof body.token!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(body.token))throw Error('진행 요청 식별자가 올바르지 않습니다.');
    return NextResponse.json(await publishLivePresentation(await database(),String(access.room.id),account.id,body.token,body.presentation),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'실시간 표시 연결 실패'},{status:409})}
}
