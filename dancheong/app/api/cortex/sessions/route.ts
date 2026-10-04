import { NextResponse } from "next/server";

import { listCortexCloudSessions } from "../../../../lib/cortex-cloud-store";
import { requireOwnerKey } from "../../../../lib/simulation-store";
import {ensurePersonalCopies} from '../../../../lib/multiplayer-personal';

export const runtime = "nodejs";

export async function GET(request?: Request) {
  try {
    const ownerKey = await requireOwnerKey(request);
    let multiplayerSyncPending=false;
    try{await ensurePersonalCopies(ownerKey)}catch{multiplayerSyncPending=true;console.error('Multiplayer personal catalog repair will retry on the next refresh');}
    return NextResponse.json(
      { ownerKey,sessions: await listCortexCloudSessions(ownerKey),multiplayerSyncPending },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cortex 온라인 기록을 불러오지 못했습니다." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}
