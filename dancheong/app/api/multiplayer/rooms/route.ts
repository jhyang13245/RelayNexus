import { NextResponse } from "next/server";

import { requireAccountContext } from "../../../../lib/account-store";
import { createMultiplayerRoom, listMultiplayerRooms, listPublicMultiplayerRooms } from "../../../../lib/multiplayer-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const account = await requireAccountContext();
    const [rooms, publicRooms] = await Promise.all([
      listMultiplayerRooms(account),
      listPublicMultiplayerRooms(),
    ]);
    return NextResponse.json({ rooms, publicRooms }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "멀티플레이 방을 불러오지 못했습니다." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireAccountContext();
    const body = await request.json() as Record<string, unknown>;
    const result = await createMultiplayerRoom(account, {
      engine: body.engine === "cortex" ? "cortex" : "lotus",
      presentation: body.presentation === 'visual' ? 'visual' : 'novel',
      sessionId: String(body.sessionId || ""),
      projectId: String(body.projectId || ''),
      startMode: body.startMode === 'new' ? 'new' : 'existing',
      initialSnapshot: body.initialSnapshot,
      summaryOnly:body.summaryOnly===true,
      name: String(body.name || ""),
      maxPlayers: Number(body.maxPlayers || 4),
      turnLimitSeconds: Number(body.turnLimitSeconds || 120),
      visibility: body.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
      settings: body.settings as never,
    });
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "멀티플레이 방을 만들지 못했습니다." }, { status: 400 });
  }
}
