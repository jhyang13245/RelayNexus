"use client";

import { useMemo, useState } from "react";
import { createSHA256 } from "hash-wasm";
import { optimizeCoverToWebp } from "./neoreum-cover-webp";

type Stage = "idle" | "hashing" | "uploading-cover" | "uploading-package" | "publishing" | "done" | "error";

const stageLabel: Record<Stage, string> = {
  idle: "업로드 대기", hashing: "패키지 무결성 계산", "uploading-cover": "표지 업로드",
  "uploading-package": "패키지 분할 업로드", publishing: "너름 공개 등록", done: "공개 완료", error: "업로드 실패",
};

async function apiJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(payload.error ?? `request_failed_${response.status}`);
    const messages: Record<string, string> = {
      package_contract_verification_failed: "서버가 패키지 계약을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      package_hash_engine_unavailable: "서버의 패키지 무결성 검사기를 사용할 수 없습니다.",
      package_sha256_verification_failed: "업로드된 ZIP의 SHA-256이 원본과 일치하지 않습니다.",
      package_size_verification_failed: "업로드된 ZIP의 크기가 원본과 일치하지 않습니다.",
    };
    throw new Error(messages[code] ?? code);
  }
  return payload;
}

export default function UploadClient() {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [publishedSlug, setPublishedSlug] = useState("");
  const busy = !["idle", "done", "error"].includes(stage);
  const statusText = useMemo(() => stageLabel[stage], [stage]);

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(""); setPublishedSlug(""); setProgress(0);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const packageFile = form.get("package") as File;
    const selectedCover = form.get("cover") as File;
    if (!packageFile?.size || !selectedCover?.size) return;

    try {
      setStage("hashing");
      const coverFile = await optimizeCoverToWebp(selectedCover);
      const hasher = await createSHA256();
      const hashChunk = 4 * 1024 * 1024;
      for (let offset = 0; offset < packageFile.size; offset += hashChunk) {
        hasher.update(new Uint8Array(await packageFile.slice(offset, offset + hashChunk).arrayBuffer()));
        setProgress(Math.round(Math.min(15, ((offset + hashChunk) / packageFile.size) * 15)));
      }
      const packageSha256 = hasher.digest();
      const slug = String(form.get("slug") ?? "").trim().toLowerCase();
      const init = await apiJson("/api/neoreum/uploads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, title: form.get("title"), subtitle: form.get("subtitle"), description: form.get("description"),
          genre: form.get("genre"), tags: String(form.get("tags") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
          visibility: form.get("visibility"), packageBytes: packageFile.size, packageSha256,
          packageContentType: packageFile.type || "application/zip", coverBytes: coverFile.size,
          coverContentType: "image/webp",
        }),
      });

      setStage("uploading-cover"); setProgress(18);
      await apiJson(`/api/neoreum/uploads/${init.uploadId}/cover`, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: coverFile });
      setProgress(22); setStage("uploading-package");
      const parts: { partNumber: number; etag: string }[] = [];
      const partSize = Number(init.partSize);
      const partCount = Math.ceil(packageFile.size / partSize);
      for (let index = 0; index < partCount; index++) {
        const partNumber = index + 1;
        const blob = packageFile.slice(index * partSize, Math.min(packageFile.size, (index + 1) * partSize));
        const part = await apiJson(`/api/neoreum/uploads/${init.uploadId}/parts/${partNumber}`, { method: "PUT", body: blob });
        parts.push({ partNumber, etag: part.etag });
        setProgress(22 + Math.round((partNumber / partCount) * 70));
      }

      setStage("publishing"); setProgress(95);
      await apiJson(`/api/neoreum/uploads/${init.uploadId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parts }) });
      setPublishedSlug(slug); setProgress(100); setStage("done");
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "unknown_upload_error");
      setStage("error");
    }
  }

  return <form className="publisher" onSubmit={publish}>
    <div className="publisher-grid">
      <fieldset><legend>01 · 작품 정보</legend>
        <label>작품명<input name="title" required maxLength={120} placeholder="기성학원" /></label>
        <label>부제<input name="subtitle" maxLength={160} placeholder="첫 번째 공명" /></label>
        <label>너름 주소용 영문 ID<input name="slug" required pattern="[a-z0-9][a-z0-9-]{2,79}" placeholder="giseong-academy" /></label>
        <label>작품 설명<textarea name="description" required maxLength={3000} rows={5} /></label>
        <label>장르<input name="genre" required placeholder="현대 판타지 · 학원 미스터리" /></label>
        <label>태그<input name="tags" placeholder="학원물, 미스터리, 한국어" /></label>
      </fieldset>
      <fieldset><legend>02 · 패키지 및 공개</legend>
        <p>ScenarioPack과 CortexPack을 모두 등록할 수 있습니다. manifest.json에서 엔진과 계약을 자동 판독하며, CortexPack은 Cortex 엔진 전용으로 배포됩니다.</p>
        <label>공개 범위<select name="visibility" defaultValue="public"><option value="public">공개 · 모든 계정의 너름에 표시</option><option value="private">비공개 · 제작자 보관</option></select></label>
        <label className="file-drop">ScenarioPack / CortexPack ZIP<input name="package" type="file" accept=".zip,application/zip" required /><span>최대 1 GB · SHA-256 및 패키지 계약 자동 검증</span></label>
        <label className="file-drop">작품 표지<input name="cover" type="file" accept="image/png,image/jpeg,image/webp" required /><span>PNG · JPG · WebP 선택 가능 · 저장 시 경량 WebP로 자동 최적화</span></label>
      </fieldset>
    </div>
    <div className="publish-status" aria-live="polite"><div><span>{statusText}</span><b>{progress}%</b></div><progress max="100" value={progress} />
      {error && <p className="status-error">{error}</p>}
      {publishedSlug && <p className="status-success">너름 공개가 완료되었습니다. <a href={`/neoreum/manage/${encodeURIComponent(publishedSlug)}`}>등록 작품 편집하기 →</a></p>}
    </div>
    <button className="button button-primary publish-button" type="submit" disabled={busy}>{busy ? "처리 중…" : "작품 검증 후 너름에 공개"}</button>
  </form>;
}
