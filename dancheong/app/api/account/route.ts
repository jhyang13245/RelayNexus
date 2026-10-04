import { NextResponse } from "next/server";

import {
  accountPayload,
  anonymousAccountPayload,
  getOptionalAccountContext,
} from "../../../lib/account-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const account = await getOptionalAccountContext();
    return NextResponse.json(
      account ? accountPayload(account) : anonymousAccountPayload(),
      { headers: { "Cache-Control": "no-store, private, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "Relay ID 계정 정보를 불러오지 못했습니다.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
