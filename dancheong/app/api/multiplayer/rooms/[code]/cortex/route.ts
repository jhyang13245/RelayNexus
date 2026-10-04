import { NextResponse } from "next/server";
import { requireAccountContext } from "../../../../../../lib/account-store";
import { cortexRoomOperation } from "../../../../../../lib/multiplayer-cortex";
export async function POST(request:Request,context:{params:Promise<{code:string}>}) {
  try { const account=await requireAccountContext(),{code}=await context.params;return NextResponse.json(await cortexRoomOperation(account,code,await request.json()),{headers:{"Cache-Control":"no-store"}}); }
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"진행 요청에 실패했습니다."},{status:409});}
}
