import { NextResponse } from "next/server";

import { writeAuditLog } from "../../../../../lib/account-store";
import {
  getOwnedSession,
  requireOwnerKey,
} from "../../../../../lib/simulation-store";
import {
  createSessionCheckpoint,
  listSessionCheckpoints,
} from "../../../../../lib/session-checkpoint-store";
import { readSessionSnapshotText } from "../../../../../lib/runtime-json-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { sessionId } = await context.params;
    const session = await getOwnedSession(ownerKey, sessionId);
    if (!session) {
      return NextResponse.json({ error: "세션을 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json(
      { checkpoints: await listSessionCheckpoints(ownerKey, sessionId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "복구 기록을 불러오지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { sessionId } = await context.params;
    const session = await getOwnedSession(ownerKey, sessionId);
    if (!session) {
      return NextResponse.json({ error: "세션을 찾지 못했습니다." }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      label?: string;
      deviceId?: string;
    };
    const checkpoint = await createSessionCheckpoint({
      ownerKey,
      sessionId,
      projectId: String(session.project_id),
      revision: Number(session.revision ?? 1),
      kind: "MANUAL",
      label: body.label?.trim() || `수동 복구 지점 · 턴 ${Number(session.turn ?? 0)}`,
      snapshot: JSON.parse(await readSessionSnapshotText(session)),
      turn: Number(session.turn ?? 0),
      sourceDeviceId: body.deviceId,
    });
    const auditRecorded = await writeAuditLog("session.checkpoint.created", "session", sessionId, {
      checkpointId: checkpoint.id,
      revision: checkpoint.revision,
    }).then(() => true).catch(() => false);
    return NextResponse.json({ checkpoint, auditRecorded }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "복구 지점을 만들지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
