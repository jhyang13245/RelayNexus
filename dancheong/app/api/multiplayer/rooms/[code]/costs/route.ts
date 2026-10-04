import { NextResponse } from "next/server";

import { requireAccountContext } from "../../../../../../lib/account-store";
import { listMultiplayerCosts } from "../../../../../../lib/multiplayer-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const account = await requireAccountContext();
    const { code } = await context.params;
    return NextResponse.json({ costs: await listMultiplayerCosts(account, code) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "비용 장부를 불러오지 못했습니다." }, { status: 404 });
  }
}

