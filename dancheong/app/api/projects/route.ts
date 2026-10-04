import { NextResponse } from "next/server";

import {
  compactPreview,
  database,
  ensureSimulationSchema,
  getOwnedPackageUpload,
  listLibrary,
  objectStorage,
  ownerPathHash,
  requireOwnerKey,
  safeJsonText,
} from "../../../lib/simulation-store";
import { PACKAGE_UPLOAD_CHUNK_BYTES } from "./uploads/route";
import { writeAuditLog } from "../../../lib/account-store";
import { createSessionCheckpoint } from "../../../lib/session-checkpoint-store";
import {
  deleteRuntimeObject,
  R2_JSON_POINTER,
  storeRuntimeJson,
} from "../../../lib/runtime-json-store";
import { hydrateProjectImportSnapshot } from "../../../lib/project-import-transfer";

export const runtime = "nodejs";

const MAX_PACKAGE_BYTES = 80 * 1024 * 1024;
const MAX_PACK_JSON = 32 * 1024 * 1024;
const MAX_SNAPSHOT_JSON = 48 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 6 * 1024 * 1024;
const THUMBNAIL_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export async function POST(request: Request) {
  try {
    const ownerKey = await requireOwnerKey();
    const form = await request.formData();
    const fileValue = form.get("file");
    const file = fileValue instanceof File && fileValue.size ? fileValue : null;
    const thumbnailValue = form.get("thumbnail");
    const thumbnail = thumbnailValue instanceof File && thumbnailValue.size
      ? thumbnailValue
      : null;
    const stagedUploadId = String(form.get("stagedUploadId") ?? "").trim();
    if ((!file && !stagedUploadId) || (file && stagedUploadId)) {
      return NextResponse.json(
        { error: "온라인에 보관할 ScenarioPack 원본을 확인하지 못했습니다." },
        { status: 400 },
      );
    }
    if (file && file.size > MAX_PACKAGE_BYTES) {
      return NextResponse.json(
        { error: "80MB를 넘는 ScenarioPack은 분할 온라인 업로드가 필요합니다." },
        { status: 400 },
      );
    }
    if (file && !file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { error: "ZIP 형식의 ScenarioPack만 불러올 수 있습니다." },
        { status: 400 },
      );
    }
    if (thumbnail && (
      !THUMBNAIL_TYPES.has(thumbnail.type) || thumbnail.size > MAX_THUMBNAIL_BYTES
    )) {
      return NextResponse.json(
        { error: "작품 표지는 6MB 이하의 JPG, PNG 또는 WebP여야 합니다." },
        { status: 400 },
      );
    }

    const packJson = safeJsonText(form.get("pack"), MAX_PACK_JSON);
    const snapshotWireJson = safeJsonText(
      form.get("snapshot"),
      MAX_SNAPSHOT_JSON,
    );
    const pack = JSON.parse(packJson) as Record<string, unknown>;
    const snapshotWithoutPack = JSON.parse(snapshotWireJson) as Record<string, unknown>;
    const snapshot = hydrateProjectImportSnapshot(pack, snapshotWithoutPack);
    const snapshotJson = safeJsonText(snapshot, MAX_SNAPSHOT_JSON);
    const player = pack.player as Record<string, unknown> | undefined;
    const state = snapshot.state as Record<string, unknown> | undefined;
    const title = String(pack.title ?? "").trim().slice(0, 160);
    const sourceProjectId = String(pack.projectId ?? "").trim().slice(0, 160);
    if (!title || !sourceProjectId || !player?.name || !state) {
      return NextResponse.json(
        { error: "ScenarioPack의 작품·플레이어·초기 상태 정보가 부족합니다." },
        { status: 400 },
      );
    }

    await ensureSimulationSchema();
    const db = await database();
    const existingProject = await db
      .prepare(`SELECT id, title FROM scenario_projects
        WHERE owner_key = ? AND source_project_id = ?
        LIMIT 1`)
      .bind(ownerKey, sourceProjectId)
      .first<{ id: string; title: string }>();
    if (existingProject) {
      return NextResponse.json(
        {
          error: `‘${existingProject.title}’ 작품이 이미 서재에 있습니다. 새 진행은 작품 안에서 세션을 추가해 주세요.`,
          code: "PROJECT_ALREADY_INSTALLED",
          projectId: existingProject.id,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const projectId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const packageFingerprint = `sha256:${await sha256(packJson)}`;
    const now = new Date().toISOString();
    const ownerHash = await ownerPathHash(ownerKey);
    let r2Key: string | null = null;
    let bucket: Awaited<ReturnType<typeof objectStorage>> | null = null;
    let packPointer: Awaited<ReturnType<typeof storeRuntimeJson>> | null = null;
    let snapshotPointer: Awaited<ReturnType<typeof storeRuntimeJson>> | null = null;
    const thumbnailExtension = thumbnail?.type === "image/png"
      ? "png"
      : thumbnail?.type === "image/webp" ? "webp" : "jpg";
    const thumbnailKey = thumbnail
      ? `users/${ownerHash}/projects/${projectId}/thumbnail.${thumbnailExtension}`
      : null;
    if (stagedUploadId) {
      const staged = await getOwnedPackageUpload(ownerKey, stagedUploadId);
      if (!staged) {
        return NextResponse.json(
          { error: "완료할 온라인 패키지 업로드를 찾지 못했습니다." },
          { status: 404 },
        );
      }
      const partsValue = JSON.parse(String(form.get("stagedParts") ?? "[]")) as unknown;
      const parts = Array.isArray(partsValue)
        ? partsValue.map((part) => {
            const value = part as Record<string, unknown>;
            return {
              partNumber: Number(value.partNumber),
              etag: String(value.etag ?? ""),
            };
          }).filter((part) => Number.isInteger(part.partNumber) && part.partNumber > 0 && part.etag)
        : [];
      const expectedPartCount = Math.ceil(
        Number(staged.size_bytes) / PACKAGE_UPLOAD_CHUNK_BYTES,
      );
      parts.sort((left, right) => left.partNumber - right.partNumber);
      if (
        parts.length !== expectedPartCount ||
        parts.some((part, index) => part.partNumber !== index + 1)
      ) {
        return NextResponse.json(
          { error: "온라인 패키지 조각이 모두 업로드되지 않았습니다." },
          { status: 400 },
        );
      }
      bucket = await objectStorage();
      await bucket
        .resumeMultipartUpload(staged.r2_key, staged.r2_upload_id)
        .complete(parts);
      r2Key = staged.r2_key;
      await db
        .prepare("DELETE FROM package_uploads WHERE id = ? AND owner_key = ?")
        .bind(stagedUploadId, ownerKey)
        .run();
    } else if (file) {
      bucket = await objectStorage();
      r2Key = `users/${ownerHash}/projects/${projectId}/scenario-pack.zip`;
      await bucket.put(r2Key, file.stream(), {
        httpMetadata: { contentType: "application/zip" },
        customMetadata: {
          originalName: file.name.slice(0, 240),
          projectId,
        },
      });
    }

    try {
      if (thumbnail && thumbnailKey) {
        bucket ??= await objectStorage();
        await bucket.put(thumbnailKey, thumbnail.stream(), {
          httpMetadata: { contentType: thumbnail.type },
          customMetadata: { projectId, purpose: "work-thumbnail", source: "story-hub" },
        });
      }
      [packPointer, snapshotPointer] = await Promise.all([
        storeRuntimeJson({
          ownerKey,
          projectId,
          category: "pack",
          revision: 1,
          value: packJson,
        }),
        storeRuntimeJson({
          ownerKey,
          projectId,
          sessionId,
          category: "revision",
          revision: 1,
          value: snapshotJson,
        }),
      ]);
      await db.batch([
        db.prepare(`INSERT INTO scenario_projects (
          id, owner_key, source_project_id, title, genre, player_name,
          package_version, project_revision, package_fingerprint, pack_json,
          pack_r2_key, pack_sha256, pack_byte_length,
          r2_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            projectId,
            ownerKey,
            sourceProjectId,
            title,
            String(pack.genre ?? "").slice(0, 160),
            String(player.name).slice(0, 120),
            String(pack.packageVersion ?? "unknown").slice(0, 40),
            1,
            packageFingerprint,
            R2_JSON_POINTER,
            packPointer.key,
            packPointer.sha256,
            packPointer.byteLength,
            r2Key,
            now,
            now,
          ),
        db.prepare(`INSERT INTO simulation_sessions (
          id, project_id, owner_key, name, snapshot_json,
          snapshot_r2_key, snapshot_sha256, snapshot_byte_length, turn, day,
          location, preview, total_cost_usd, last_mode, created_at,
          revision, project_revision, package_fingerprint, last_writer_id,
          updated_at, last_played_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            sessionId,
            projectId,
            ownerKey,
            "첫 번째 이야기",
            R2_JSON_POINTER,
            snapshotPointer.key,
            snapshotPointer.sha256,
            snapshotPointer.byteLength,
            Number(state.turn ?? 0),
            Number(state.day ?? 0),
            String(state.location ?? "").slice(0, 240),
            compactPreview(snapshot),
            Number(snapshot.totalCostUsd ?? 0),
            snapshot.lastMode === "luna" ? "luna" : "mock",
            now,
            1,
            1,
            packageFingerprint,
            "project-import",
            now,
            now,
          ),
        ...(thumbnail && thumbnailKey
          ? [db.prepare(`INSERT INTO project_thumbnails (
              project_id, owner_key, r2_key, content_type, updated_at
            ) VALUES (?, ?, ?, ?, ?)`)
              .bind(projectId, ownerKey, thumbnailKey, thumbnail.type, now)]
          : []),
      ]);
    } catch (databaseError) {
      await Promise.all([
        deleteRuntimeObject(packPointer?.key).catch(() => undefined),
        deleteRuntimeObject(snapshotPointer?.key).catch(() => undefined),
      ]);
      if (bucket && r2Key) await bucket.delete(r2Key);
      if (bucket && thumbnailKey) await bucket.delete(thumbnailKey);
      throw databaseError;
    }

    try {
      await createSessionCheckpoint({
        ownerKey,
        sessionId,
        projectId,
        revision: 1,
        kind: "INITIAL",
        label: "작품을 불러온 최초 상태",
        snapshot,
        turn: Number(state.turn ?? 0),
        sourceDeviceId: "project-import",
      });
    } catch (checkpointError) {
      await db.batch([
        db.prepare("DELETE FROM project_thumbnails WHERE project_id = ? AND owner_key = ?")
          .bind(projectId, ownerKey),
        db.prepare("DELETE FROM simulation_sessions WHERE id = ? AND owner_key = ?")
          .bind(sessionId, ownerKey),
        db.prepare("DELETE FROM scenario_projects WHERE id = ? AND owner_key = ?")
          .bind(projectId, ownerKey),
      ]);
      await Promise.all([
        deleteRuntimeObject(packPointer?.key).catch(() => undefined),
        deleteRuntimeObject(snapshotPointer?.key).catch(() => undefined),
      ]);
      if (bucket && r2Key) await bucket.delete(r2Key).catch(() => undefined);
      if (bucket && thumbnailKey) await bucket.delete(thumbnailKey).catch(() => undefined);
      throw checkpointError;
    }

    const library = await listLibrary(ownerKey);
    await writeAuditLog("project.created", "project", projectId, {
      title,
      sourceProjectId,
      packageVersion: String(pack.packageVersion ?? "unknown").slice(0, 40),
      sessionId,
    });
    return NextResponse.json(
      {
        project: library.projects.find((item) => item.id === projectId),
        session: library.sessions.find((item) => item.id === sessionId),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "ScenarioPack을 저장하지 못했습니다.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
