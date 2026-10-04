import { NextResponse } from "next/server";

import {
  getOwnedPackageUpload,
  objectStorage,
  requireOwnerKey,
} from "../../../../../../../lib/simulation-store";
import { PACKAGE_UPLOAD_CHUNK_BYTES } from "../../../route";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ uploadId: string; partNumber: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const ownerKey = await requireOwnerKey();
    const { uploadId, partNumber: partText } = await context.params;
    const upload = await getOwnedPackageUpload(ownerKey, uploadId);
    if (!upload) {
      return NextResponse.json(
        { error: "진행 중인 온라인 패키지 업로드를 찾지 못했습니다." },
        { status: 404 },
      );
    }
    const partNumber = Number(partText);
    const partCount = Math.ceil(upload.size_bytes / PACKAGE_UPLOAD_CHUNK_BYTES);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount) {
      return NextResponse.json(
        { error: "패키지 조각 번호가 올바르지 않습니다." },
        { status: 400 },
      );
    }
    const bytes = await request.arrayBuffer();
    const expectedSize = partNumber === partCount
      ? upload.size_bytes - (partNumber - 1) * PACKAGE_UPLOAD_CHUNK_BYTES
      : PACKAGE_UPLOAD_CHUNK_BYTES;
    if (bytes.byteLength !== expectedSize) {
      return NextResponse.json(
        { error: "패키지 조각의 크기가 원본과 일치하지 않습니다." },
        { status: 400 },
      );
    }

    const multipart = (await objectStorage()).resumeMultipartUpload(
      upload.r2_key,
      upload.r2_upload_id,
    );
    const part = await multipart.uploadPart(partNumber, bytes);
    return NextResponse.json(
      { partNumber: part.partNumber, etag: part.etag },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "패키지 조각을 온라인에 저장하지 못했습니다.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
