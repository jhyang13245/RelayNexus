import { NextResponse } from "next/server";
import { requireAccountContext } from "../../../../../../lib/account-store";
import { roomChat } from "../../../../../../lib/multiplayer-cortex";
type Context={params:Promise<{code:string}>};
async function handle(request:Request,context:Context,write=false){
  try{const account=await requireAccountContext(),{code}=await context.params,body=write?await request.json():undefined;return NextResponse.json(await roomChat(account,code,body,Number(body?.after??new URL(request.url).searchParams.get("after")??0)),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"대화를 불러오지 못했습니다."},{status:400});}
}
export const GET=(request:Request,context:Context)=>handle(request,context);
export const POST=(request:Request,context:Context)=>handle(request,context,true);
