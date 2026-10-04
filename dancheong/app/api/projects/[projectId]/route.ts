import { NextResponse } from "next/server";

import {
  database,
  getOwnedProject,
  getOwnedProjectThumbnail,
  objectStorage,
  requireOwnerKey,
} from "../../../../lib/simulation-store";
import { writeAuditLog } from "../../../../lib/account-store";
import { deleteProjectRuntimeObjects } from "../../../../lib/runtime-json-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { projectId } = await context.params;
    const project = await getOwnedProject(ownerKey, projectId);
    if (!project) {
      return NextResponse.json(
        { error: "작품을 찾지 못했습니다." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const thumbnail = await getOwnedProjectThumbnail(ownerKey, projectId);

    const db = await database();
    await db.batch([
      db.prepare(
        "DELETE FROM session_checkpoints WHERE project_id = ? AND owner_key = ?",
      ).bind(projectId, ownerKey),
      db.prepare(
        "DELETE FROM simulation_sessions WHERE project_id = ? AND owner_key = ?",
      ).bind(projectId, ownerKey),
      db.prepare(
        "DELETE FROM scenario_projects WHERE id = ? AND owner_key = ?",
      ).bind(projectId, ownerKey),
      db.prepare(
        "DELETE FROM project_thumbnails WHERE project_id = ? AND owner_key = ?",
      ).bind(projectId, ownerKey),
    ]);

    const r2Key = String(project.r2_key ?? "");
    let packageDeleted = true;
    if (r2Key) {
      try {
        await (await objectStorage()).delete(r2Key);
      } catch {
        packageDeleted = false;
      }
    }
    const thumbnailR2Key = String(thumbnail?.r2_key ?? "");
    let thumbnailDeleted = true;
    if (thumbnailR2Key) {
      try {
        await (await objectStorage()).delete(thumbnailR2Key);
      } catch {
        thumbnailDeleted = false;
      }
    }
    let runtimeDeleted = true;
    await deleteProjectRuntimeObjects(ownerKey, projectId).catch(() => {
      runtimeDeleted = false;
    });

    await writeAuditLog("project.deleted", "project", projectId, {
      title: String(project.title ?? ""),
      sourceProjectId: String(project.source_project_id ?? ""),
      packageDeleted,
      thumbnailDeleted,
      runtimeDeleted,
    });

    return NextResponse.json(
      {
        deleted: true,
        projectId,
        sourceProjectId: String(project.source_project_id ?? ""),
        packageDeleted,
        thumbnailDeleted,
        runtimeDeleted,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "작품을 삭제하지 못했습니다.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
