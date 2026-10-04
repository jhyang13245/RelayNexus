import { NextResponse } from "next/server";

import {
  database,
  getOwnedProject,
  getOwnedProjectThumbnail,
  listLibrary,
  objectStorage,
  ownerPathHash,
  requireOwnerKey,
} from "../../../../../lib/simulation-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

const MAX_THUMBNAIL_BYTES = 6 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const ownedProject = async (ownerKey: string, projectId: string) => {
  const project = await getOwnedProject(ownerKey, projectId);
  if (!project) {
    throw new Error("작품을 찾지 못했습니다.");
  }
  return project;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { projectId } = await context.params;
    await ownedProject(ownerKey, projectId);
    const thumbnail = await getOwnedProjectThumbnail(ownerKey, projectId);
    if (!thumbnail) {
      return NextResponse.json(
        { error: "등록된 작품 썸네일이 없습니다." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const object = await (await objectStorage()).get(String(thumbnail.r2_key));
    if (!object) {
      return NextResponse.json(
        { error: "작품 썸네일 파일을 찾지 못했습니다." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return new Response(object.body, {
      headers: {
        "Content-Type": String(thumbnail.content_type || "image/jpeg"),
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Length": String(object.size),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "썸네일을 불러오지 못했습니다.";
    return NextResponse.json(
      { error: message },
      { status: message === "작품을 찾지 못했습니다." ? 404 : 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { projectId } = await context.params;
    await ownedProject(ownerKey, projectId);
    const form = await request.formData();
    const value = form.get("thumbnail");
    const file = value instanceof File && value.size ? value : null;
    if (!file || !SUPPORTED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "JPG, PNG 또는 WebP 작품 이미지를 선택해 주세요." },
        { status: 400 },
      );
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      return NextResponse.json(
        { error: "작품 썸네일은 6MB 이하여야 합니다." },
        { status: 400 },
      );
    }

    const ownerHash = await ownerPathHash(ownerKey);
    const extension = file.type === "image/png"
      ? "png"
      : file.type === "image/webp" ? "webp" : "jpg";
    const r2Key = `users/${ownerHash}/projects/${projectId}/thumbnail.${extension}`;
    const bucket = await objectStorage();
    const previous = await getOwnedProjectThumbnail(ownerKey, projectId);
    await bucket.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { projectId, purpose: "work-thumbnail" },
    });

    const now = new Date().toISOString();
    await (await database()).prepare(`INSERT INTO project_thumbnails (
      project_id, owner_key, r2_key, content_type, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      owner_key = excluded.owner_key,
      r2_key = excluded.r2_key,
      content_type = excluded.content_type,
      updated_at = excluded.updated_at`)
      .bind(projectId, ownerKey, r2Key, file.type, now)
      .run();

    const previousKey = String(previous?.r2_key ?? "");
    if (previousKey && previousKey !== r2Key) {
      await bucket.delete(previousKey);
    }
    const library = await listLibrary(ownerKey);
    return NextResponse.json(
      { project: library.projects.find((item) => item.id === projectId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "작품 썸네일을 저장하지 못했습니다.";
    return NextResponse.json(
      { error: message },
      { status: message === "작품을 찾지 못했습니다." ? 404 : 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { projectId } = await context.params;
    await ownedProject(ownerKey, projectId);
    const thumbnail = await getOwnedProjectThumbnail(ownerKey, projectId);
    if (thumbnail) {
      await (await objectStorage()).delete(String(thumbnail.r2_key));
      await (await database())
        .prepare("DELETE FROM project_thumbnails WHERE project_id = ? AND owner_key = ?")
        .bind(projectId, ownerKey)
        .run();
    }
    const library = await listLibrary(ownerKey);
    return NextResponse.json(
      { project: library.projects.find((item) => item.id === projectId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "작품 썸네일을 삭제하지 못했습니다.";
    return NextResponse.json(
      { error: message },
      { status: message === "작품을 찾지 못했습니다." ? 404 : 500 },
    );
  }
}
