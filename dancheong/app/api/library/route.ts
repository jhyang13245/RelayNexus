import { NextResponse } from "next/server";

import { listCumulativeCostMeter } from "../../../lib/cost-meter-store";
import { listLiveReliabilityAttempts } from "../../../lib/live-reliability-store";
import { listLibrary, requireOwnerKey } from "../../../lib/simulation-store";

export const runtime = "nodejs";

export async function GET(request?: Request) {
  try {
    const ownerKey = await requireOwnerKey();
    const library = await listLibrary(ownerKey);
    if (request && new URL(request.url).searchParams.get("summary") === "1") {
      return NextResponse.json(library, { headers: { "Cache-Control": "no-store" } });
    }
    const [costMeterTurns, liveReliabilityAttempts] = await Promise.all([
      listCumulativeCostMeter(ownerKey),
      listLiveReliabilityAttempts(ownerKey),
    ]);
    return NextResponse.json({ ...library, costMeterTurns, liveReliabilityAttempts }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "작품 보관함을 불러오지 못했습니다.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}
