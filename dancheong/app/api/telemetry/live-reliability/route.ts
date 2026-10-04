import { NextResponse } from "next/server";

import type { LiveReliabilityEntry } from "../../../../lib/live-reliability";
import { recordLiveReliabilityAttempt } from "../../../../lib/live-reliability-store";
import {
  getOwnedProject,
  getOwnedSession,
  requireOwnerKey,
} from "../../../../lib/simulation-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ownerKey = await requireOwnerKey();
    const entry = await request.json() as LiveReliabilityEntry;
    if (!entry?.id || !entry.projectId || !entry.sessionId || !entry.createdAt) {
      return NextResponse.json({ error: "실시간 계측 식별자가 누락되었습니다." }, { status: 400 });
    }
    const [project, session] = await Promise.all([
      getOwnedProject(ownerKey, entry.projectId),
      getOwnedSession(ownerKey, entry.sessionId),
    ]);
    if (!project || !session || String(session.project_id) !== entry.projectId) {
      return NextResponse.json({ error: "계측 대상 작품 또는 세션을 찾지 못했습니다." }, { status: 404 });
    }
    await recordLiveReliabilityAttempt(ownerKey, entry);
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "실시간 계측을 저장하지 못했습니다.",
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
