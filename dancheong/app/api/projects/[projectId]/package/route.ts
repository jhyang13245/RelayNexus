import { NextResponse } from "next/server";

import {
  getOwnedProject,
  objectStorage,
  requireOwnerKey,
} from "../../../../../lib/simulation-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const ownerKey = await requireOwnerKey();
    const { projectId } = await context.params;
    const project = await getOwnedProject(ownerKey, projectId);
    if (!project?.r2_key) {
      return NextResponse.json(
        { error: "보관된 원본 패키지를 찾지 못했습니다." },
        { status: 404 },
      );
    }
    const object = await (await objectStorage()).get(String(project.r2_key));
    if (!object) {
      return NextResponse.json(
        { error: "보관된 원본 패키지를 찾지 못했습니다." },
        { status: 404 },
      );
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `inline; filename="scenario-pack-${projectId}.zip"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "원본 패키지를 불러오지 못했습니다.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}
