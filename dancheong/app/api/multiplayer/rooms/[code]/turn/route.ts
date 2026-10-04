import { NextResponse } from "next/server";

import { requireAccountContext } from "../../../../../../lib/account-store";
import { saveMultiplayerTurn } from "../../../../../../lib/multiplayer-store";
import type { MultiplayerCallCause } from "../../../../../../lib/multiplayer-policy";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const account = await requireAccountContext();
    const { code } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const result = await saveMultiplayerTurn(account, code, {
      cause: String(body.cause || "NORMAL") as MultiplayerCallCause,
      expectedRevision: Number(body.expectedRevision),
      snapshot: body.snapshot as Record<string, unknown>,
      usage: body.usage as Record<string, unknown> | undefined,
    });
    return NextResponse.json(result, { status: result.conflict ? 409 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "멀티플레이 턴을 저장하지 못했습니다." }, { status: 400 });
  }
}

