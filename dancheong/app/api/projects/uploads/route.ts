import { NextResponse } from "next/server";

import {
  database,
  ensureSimulationSchema,
  objectStorage,
  ownerPathHash,
  requireOwnerKey,
} from "../../../../lib/simulation-store";

export const runtime = "nodejs";

export const PACKAGE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_CLOUD_PACKAGE_BYTES = 1024 * 1024 * 1024;

export async function POST(request: Request) {
  let multipart:
    | Awaited<ReturnType<Awaited<ReturnType<typeof objectStorage>>["createMultipartUpload"]>>
    | undefined;
  try {
    const ownerKey = await requireOwnerKey();
    const body = await request.json() as { fileName?: string; size?: number };
    const fileName = String(body.fileName ?? "").trim().slice(0, 240);
    const size = Math.floor(Number(body.size));
    if (!fileName.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { error: "ZIP 형식의 ScenarioPack만 온라인에 보관할 수 있습니다." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_CLOUD_PACKAGE_BYTES) {
      return NextResponse.json(
        { error: "ScenarioPack 원본은 최대 1GB까지 온라인에 보관할 수 있습니다." },
        { status: 400 },
      );
    }

    await ensureSimulationSchema();
    const uploadId = crypto.randomUUID();
    const ownerHash = await ownerPathHash(ownerKey);
    const r2Key = `users/${ownerHash}/projects/${uploadId}/scenario-pack.zip`;
    const bucket = await objectStorage();
    multipart = await bucket.createMultipartUpload(r2Key, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: { originalName: fileName, uploadId },
    });
    await (await database())
      .prepare(`INSERT INTO package_uploads (
        id, owner_key, r2_key, r2_upload_id, original_name, size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`) 
      .bind(
        uploadId,
        ownerKey,
        r2Key,
        multipart.uploadId,
        fileName,
        size,
        new Date().toISOString(),
      )
      .run();

    return NextResponse.json(
      {
        uploadId,
        chunkSize: PACKAGE_UPLOAD_CHUNK_BYTES,
        partCount: Math.ceil(size / PACKAGE_UPLOAD_CHUNK_BYTES),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (multipart) {
      try {
        await multipart.abort();
      } catch {
        // An abandoned multipart upload is cleaned up by the storage lifecycle.
      }
    }
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "온라인 패키지 업로드를 시작하지 못했습니다.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
