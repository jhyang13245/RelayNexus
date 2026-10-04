import { NextResponse } from "next/server";

import { requireAccountContext } from "../../../../lib/account-store";
import { joinMultiplayerRoom } from "../../../../lib/multiplayer-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireAccountContext();
    const body = await request.json() as { code?: string;summaryOnly?:boolean };
    const result = await joinMultiplayerRoom(account, String(body.code || "").trim().toUpperCase(),body.summaryOnly!==true);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "방에 참가하지 못했습니다." }, { status: 400 });
  }
}
