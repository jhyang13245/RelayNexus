import { NextResponse } from "next/server";

import {
  database,
  getOwnedPackageUpload,
  objectStorage,
  requireOwnerKey,
} from "../../../../../lib/simulation-store";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ uploadId: string }> },
) {
  try {
    const ownerKey = await requireOwnerKey();
    const { uploadId } = await context.params;
    const upload = await getOwnedPackageUpload(ownerKey, uploadId);
    if (!upload) {
      return NextResponse.json(
        { aborted: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    try {
      await (await objectStorage())
        .resumeMultipartUpload(upload.r2_key, upload.r2_upload_id)
        .abort();
    } finally {
      await (await database())
        .prepare("DELETE FROM package_uploads WHERE id = ? AND owner_key = ?")
        .bind(uploadId, ownerKey)
        .run();
    }
    return NextResponse.json(
      { aborted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "패키지 업로드를 정리하지 못했습니다.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
