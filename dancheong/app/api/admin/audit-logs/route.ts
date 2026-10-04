import { NextResponse } from "next/server";

import { listAuditLogs } from "../../../../lib/account-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 80);
    return NextResponse.json(
      { logs: await listAuditLogs(limit) },
      { headers: { "Cache-Control": "no-store, private, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "감사 로그를 불러오지 못했습니다.";
    const status = message.includes("마스터") ? 403 : 401;
    return NextResponse.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
