import { NextResponse } from "next/server";

import {
  accountPayload,
  anonymousAccountPayload,
  getOptionalAccountContext,
} from "../../../lib/account-store";

export const runtime = "nodejs";

export async function POST() {
  try {
    const account = await getOptionalAccountContext();
    if (!account) {
      return NextResponse.json(
        { ready: false, ...anonymousAccountPayload() },
        {
          status: 401,
          headers: { "Cache-Control": "no-store, private, max-age=0" },
        },
      );
    }
    return NextResponse.json(
      { ready: true, ...accountPayload(account) },
      { headers: { "Cache-Control": "no-store, private, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ready: false, error: error instanceof Error ? error.message : "계정 저장소를 준비하지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
