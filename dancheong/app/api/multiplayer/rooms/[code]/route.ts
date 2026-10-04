import { NextResponse } from "next/server";

import { requireAccountContext } from "../../../../../lib/account-store";
import { getMultiplayerRoom, updateMultiplayerRoom } from "../../../../../lib/multiplayer-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const account = await requireAccountContext();
    const { code } = await context.params;
    const query=new URL(request.url).searchParams,includeStory = query.get("story") === "1";
    const result=await getMultiplayerRoom(account, code, includeStory,{after:query.has('after')?Number(query.get('after')):undefined,liveAfter:query.has('liveAfter')?Number(query.get('liveAfter')):undefined,liveId:query.get('liveId')||'',liveBasis:query.get('liveBasis'),draftAfter:query.has('draftAfter')?Number(query.get('draftAfter')):undefined,draftRevision:Number(query.get('draftRevision')||0),media:query.get('media')||'',updateBase:query.has('base')?{revision:Number(query.get('base')),version:query.get('snapshotVersion')||''}:undefined});
    return NextResponse.json({...result,serverTime:Date.now(),liveDelta:1}, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "방을 불러오지 못했습니다." }, { status: 404 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const account = await requireAccountContext();
    const { code } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateMultiplayerRoom(account, code, String(body.action || ""), body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "방 상태를 바꾸지 못했습니다." }, { status: 400 });
  }
}
