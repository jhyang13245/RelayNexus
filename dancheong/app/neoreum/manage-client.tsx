"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSHA256 } from "hash-wasm";
import { optimizeCoverToWebp } from "./neoreum-cover-webp";

type ManagedWork = {
  slug: string; title: string; subtitle: string; description: string; genre: string; tags: string[];
  runtime: string; minNexusVersion: string; uploaderEmail: string; visibility: string; status: string;
  hasCustomCover: boolean; coverUrl: string; coverContentType: string; updatedAt: string; currentRevision: number; revisionCount: number;
  packageVersion: string; packageContract: { projectId?: string; packageTarget?: string; engineScope?: string; format?: string; targetEngine?: string; minimumTargetVersion?: string; contractRevision?: string; requiredFeatures?: string[]; compatibilityStatus?: string; compatibilitySchema?: string };
};

type EditorSourceState =
  | { status: "idle" | "checking" }
  | { status: "available"; studioVersion: string; byteLength: number; sha256: string; packageVersion: string; feature: string; format: string; standalone: boolean }
  | { status: "legacy" }
  | { status: "corrupt"; error: string }
  | { status: "error"; error: string };

const STUDIO_ORIGIN = "https://relay-novel-studio.juno12345.chatgpt.site";

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
      revision_requires_cortex_package: "이 작품은 Cortex 전용입니다. CortexPack ZIP을 선택해 주세요.",
      revision_project_id_mismatch: "선택한 ZIP은 현재 작품과 프로젝트 ID가 다릅니다.",
    };
    throw new Error(messages[code] ?? code);
  }
  return payload;
}
export default function ManageClient({ initialSlug = "" }: { initialSlug?: string }) {
  const [managedWorks, setManagedWorks] = useState<ManagedWork[]>([]);
  const [selectedWorkSlug, setSelectedWorkSlug] = useState(initialSlug);
  const [loading, setLoading] = useState(true);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverStatus, setCoverStatus] = useState("");
  const [coverVersion, setCoverVersion] = useState(0);
  const [infoBusy, setInfoBusy] = useState(false);
  const [infoStatus, setInfoStatus] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [revisionProgress, setRevisionProgress] = useState(0);
  const [revisionStatus, setRevisionStatus] = useState("");
  const [editorSource, setEditorSource] = useState<EditorSourceState>({ status: "idle" });
  const [studioHandoffBusy, setStudioHandoffBusy] = useState(false);
  const [studioHandoffStatus, setStudioHandoffStatus] = useState("");
  const migratedCoverRef = useRef(new Set<string>());
  const selectedWork = useMemo(() => managedWorks.find((work) => work.slug === selectedWorkSlug) ?? null, [managedWorks, selectedWorkSlug]);

  async function refreshManagedWorks(preferredSlug?: string) {
    const data = await apiJson("/api/neoreum/manage/works", { method: "GET" });
    const works = Array.isArray(data.works) ? data.works as ManagedWork[] : [];
    setManagedWorks(works);
    setSelectedWorkSlug((current) => preferredSlug && works.some((work) => work.slug === preferredSlug)
      ? preferredSlug : works.some((work) => work.slug === current) ? current : works[0]?.slug ?? "");
  }

  useEffect(() => {
    void Promise.resolve().then(() => refreshManagedWorks(initialSlug)).catch(() => setInfoStatus("등록 작품 목록을 불러오지 못했습니다.")).finally(() => setLoading(false));
  }, [initialSlug]);

  useEffect(() => {
    if (loading || coverBusy || infoBusy || revisionBusy || deleteBusy) return;
    const legacyCover = managedWorks.find((work) => work.hasCustomCover && work.coverContentType !== "image/webp" && !migratedCoverRef.current.has(work.slug));
    if (!legacyCover) return;
    migratedCoverRef.current.add(legacyCover.slug);
    void (async () => {
      setCoverBusy(true);
      setCoverStatus(`‘${legacyCover.title}’ 표지를 WebP로 최적화하고 있습니다…`);
      try {
        const response = await fetch(`${legacyCover.coverUrl}${legacyCover.coverUrl.includes("?") ? "&" : "?"}migrate=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("기존 표지를 불러오지 못했습니다.");
        const blob = await response.blob();
        const source = new File([blob], `${legacyCover.slug}-cover`, { type: blob.type });
        const webp = await optimizeCoverToWebp(source);
        await apiJson(`/api/neoreum/works/${legacyCover.slug}/cover`, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: webp });
        setCoverVersion(Date.now());
        await refreshManagedWorks(selectedWorkSlug || legacyCover.slug);
        setCoverStatus(`‘${legacyCover.title}’ 표지를 WebP로 최적화했습니다.`);
      } catch (cause) {
        setCoverStatus(`기존 표지 최적화 실패: ${cause instanceof Error ? cause.message : "unknown_error"}`);
      } finally {
        setCoverBusy(false);
      }
    })();
  }, [managedWorks, loading, coverBusy, infoBusy, revisionBusy, deleteBusy, selectedWorkSlug]);

  useEffect(() => {
    if (!selectedWorkSlug) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => { setEditorSource({ status: "checking" }); setStudioHandoffStatus(""); });
    void fetch(`/api/neoreum/manage/works/${selectedWorkSlug}/editor-source`, { signal: controller.signal })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (data.status === "available") setEditorSource({ status: "available", studioVersion: data.studioVersion, byteLength: data.byteLength, sha256: data.sha256, packageVersion: data.packageVersion, feature: data.feature, format: data.format, standalone: Boolean(data.standalone) });
        else if (data.status === "legacy") setEditorSource({ status: "legacy" });
        else if (data.status === "corrupt") setEditorSource({ status: "corrupt", error: data.error ?? "editor_source_integrity_failed" });
        else if (!response.ok) setEditorSource({ status: "error", error: data.error ?? `request_failed_${response.status}` });
        else setEditorSource({ status: "legacy" });
      })
      .catch((cause) => { if (cause?.name !== "AbortError") setEditorSource({ status: "error", error: "editor_source_check_failed" }); });
    return () => controller.abort();
  }, [selectedWorkSlug, selectedWork?.updatedAt]);

  function selectWork(slug: string) {
    setSelectedWorkSlug(slug); setCoverStatus(""); setInfoStatus(""); setRevisionStatus(""); setRevisionProgress(0);
  }

  function downloadUrl(kind: "editor" | "package") {
    if (!selectedWork) return "#";
    return kind === "editor" ? `/api/neoreum/manage/works/${selectedWork.slug}/editor-source/download` : `/api/neoreum/manage/works/${selectedWork.slug}/package/download`;
  }

  function downloadVerifiedEditorSource() {
    if (editorSource.status !== "available" || !editorSource.standalone) return;
    const link = document.createElement("a"); link.href = downloadUrl("editor"); link.click();
    setStudioHandoffStatus("검증된 Studio 작업 JSON 다운로드를 시작했습니다.");
  }

  async function openInStudio() {
    if (!selectedWork || editorSource.status !== "available" || studioHandoffBusy) return;
    if (!editorSource.standalone) { openLegacyPackageInStudio(); return; }
    const studioWindow = window.open(`${STUDIO_ORIGIN}/?relayCoreHandoff=embedded_studio_project_v1`, "_blank");
    setStudioHandoffBusy(true); setStudioHandoffStatus("검증된 작업 JSON을 준비하고 있습니다…");
    try {
      const response = await fetch(downloadUrl("editor"));
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `request_failed_${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], `${selectedWork.slug}-studio-project.json`, { type: "application/json" });
      let accepted = false;
      const receive = (event: MessageEvent) => {
        if (event.origin !== STUDIO_ORIGIN) return;
        if (event.data?.type === "RELAY_NOVEL_STUDIO_READY_V1") studioWindow?.postMessage({ type: "RELAY_CORE_STUDIO_EDITOR_SOURCE_V1", format: "RELAY_NOVEL_STUDIO_PROJECT_SNAPSHOT_V1", file }, STUDIO_ORIGIN);
        if (event.data?.type === "RELAY_NOVEL_STUDIO_IMPORT_ACCEPTED_V1") accepted = true;
      };
      window.addEventListener("message", receive);
      for (const delay of [600, 1400, 2600]) window.setTimeout(() => studioWindow?.postMessage({ type: "RELAY_CORE_STUDIO_EDITOR_SOURCE_V1", format: "RELAY_NOVEL_STUDIO_PROJECT_SNAPSHOT_V1", file }, STUDIO_ORIGIN), delay);
      await new Promise((resolve) => window.setTimeout(resolve, 4200));
      window.removeEventListener("message", receive);
      if (accepted) setStudioHandoffStatus("Studio가 작업 원본을 인수했습니다.");
      else {
        const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = file.name; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        setStudioHandoffStatus("Studio를 열었습니다. 자동 인수가 지원되지 않아 작업 JSON도 함께 다운로드했습니다. Studio의 불러오기에서 선택하세요.");
      }
    } catch (cause) {
      setStudioHandoffStatus(`Studio 전달 실패: ${cause instanceof Error ? cause.message : "unknown_error"}`);
    } finally { setStudioHandoffBusy(false); }
  }

  function openLegacyPackageInStudio() {
    window.open(STUDIO_ORIGIN, "_blank", "noopener");
    const link = document.createElement("a"); link.href = downloadUrl("package"); link.click();
    setStudioHandoffStatus("Studio와 원본 ZIP 다운로드를 열었습니다. Studio의 패키지 ZIP 불러오기에서 선택하세요.");
  }

  async function updateWorkInfo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWork || infoBusy || deleteBusy) return;
    const form = new FormData(event.currentTarget);
    setInfoBusy(true); setInfoStatus("작품 정보를 저장하고 있습니다…");
    try {
      await apiJson(`/api/neoreum/manage/works/${selectedWork.slug}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("manageTitle"), subtitle: form.get("manageSubtitle"),
          description: form.get("manageDescription"), genre: form.get("manageGenre"),
          tags: String(form.get("manageTags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
          visibility: form.get("manageVisibility"),
        }),
      });
      await refreshManagedWorks(selectedWork.slug);
      setInfoStatus("작품 정보가 저장되었습니다. 공개 작품은 너름과 Nexus 카탈로그에 즉시 반영됩니다.");
    } catch (cause) {
      setInfoStatus(`정보 저장 실패: ${cause instanceof Error ? cause.message : "unknown_error"}`);
    } finally { setInfoBusy(false); }
  }

  async function replaceCover(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedCover = form.get("registeredCover") as File;
    if (!selectedWork || !selectedCover?.size || coverBusy) return;
    setCoverBusy(true); setCoverStatus("표지를 WebP로 최적화하고 있습니다…");
    try {
      const cover = await optimizeCoverToWebp(selectedCover);
      await apiJson(`/api/neoreum/works/${selectedWork.slug}/cover`, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: cover });
      formElement.reset(); setCoverVersion(Date.now());
      await refreshManagedWorks(selectedWork.slug);
      setCoverStatus("새 표지가 너름과 Nexus 카탈로그에 반영되었습니다.");
    } catch (cause) {
      setCoverStatus(`표지 등록 실패: ${cause instanceof Error ? cause.message : "unknown_error"}`);
    } finally { setCoverBusy(false); }
  }

  async function deleteCover() {
    if (!selectedWork || coverBusy || !window.confirm(`‘${selectedWork.title}’의 표지를 삭제하고 기본 표지로 바꿀까요?`)) return;
    setCoverBusy(true); setCoverStatus("표지를 삭제하고 있습니다…");
    try {
      await apiJson(`/api/neoreum/works/${selectedWork.slug}/cover`, { method: "DELETE" });
      setCoverVersion(Date.now()); await refreshManagedWorks(selectedWork.slug);
      setCoverStatus("표지가 삭제되었습니다. 작품과 패키지는 그대로 유지됩니다.");
    } catch (cause) {
      setCoverStatus(`표지 삭제 실패: ${cause instanceof Error ? cause.message : "unknown_error"}`);
    } finally { setCoverBusy(false); }
  }

  async function publishRevision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWork || revisionBusy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const packageFile = form.get("revisionPackage") as File;
    if (!packageFile?.size) return;
    setRevisionBusy(true); setRevisionProgress(0); setRevisionStatus("패키지 SHA-256을 계산하고 있습니다…");
    try {
      const hasher = await createSHA256();
      const hashChunk = 4 * 1024 * 1024;
      for (let offset = 0; offset < packageFile.size; offset += hashChunk) {
        hasher.update(new Uint8Array(await packageFile.slice(offset, offset + hashChunk).arrayBuffer()));
        setRevisionProgress(Math.round(Math.min(18, ((offset + hashChunk) / packageFile.size) * 18)));
      }
      const init = await apiJson("/api/neoreum/uploads/revision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        slug: selectedWork.slug, packageBytes: packageFile.size,
        packageSha256: hasher.digest(), packageContentType: packageFile.type || "application/zip",
      }) });
      setRevisionStatus(`덧칠 v${init.nextRevision} 패키지를 분할 업로드하고 있습니다…`);
      const parts: { partNumber: number; etag: string }[] = [];
      const partSize = Number(init.partSize);
      const partCount = Math.ceil(packageFile.size / partSize);
      for (let index = 0; index < partCount; index++) {
        const partNumber = index + 1;
        const blob = packageFile.slice(index * partSize, Math.min(packageFile.size, (index + 1) * partSize));
        const part = await apiJson(`/api/neoreum/uploads/${init.uploadId}/parts/${partNumber}`, { method: "PUT", body: blob });
        parts.push({ partNumber, etag: part.etag });
        setRevisionProgress(18 + Math.round((partNumber / partCount) * 76));
      }
      const complete = await apiJson(`/api/neoreum/uploads/${init.uploadId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parts }) });
      setRevisionProgress(100); formElement.reset(); await refreshManagedWorks(selectedWork.slug);
      setRevisionStatus(`덧칠 v${complete.revision} 등록 완료 · Nexus에는 이 덧칠이 최신본으로 배포됩니다.`);
    } catch (cause) {
      setRevisionStatus(`덧칠 등록 실패: ${cause instanceof Error ? cause.message : "unknown_error"}`);
    } finally { setRevisionBusy(false); }
  }

  async function deleteWork() {
    if (!selectedWork || deleteBusy || infoBusy || coverBusy || revisionBusy) return;
    if (!window.confirm(`‘${selectedWork.title}’ 작품을 완전히 삭제할까요?\n\n작품 정보, 표지, 모든 덧칠 패키지와 다운로드 기록이 삭제되며 복구할 수 없습니다.`)) return;
    setDeleteBusy(true); setInfoStatus("작품과 모든 덧칠 데이터를 삭제하고 있습니다…");
    try {
      const deletedTitle = selectedWork.title;
      await apiJson(`/api/neoreum/manage/works/${selectedWork.slug}`, { method: "DELETE" });
      await refreshManagedWorks(); setCoverStatus(""); setRevisionStatus("");
      setInfoStatus(`‘${deletedTitle}’ 작품이 너름에서 완전히 삭제되었습니다.`);
    } catch (cause) {
      setInfoStatus(`작품 삭제 실패: ${cause instanceof Error ? cause.message : "unknown_error"}`);
    } finally { setDeleteBusy(false); }
  }

  if (loading) return <div className="manager-loading">등록 작품을 불러오고 있습니다…</div>;

  return <>
    <section className="cover-publisher cover-manager work-manager">
      <div className="cover-manager-heading"><p>PUBLISHED WORK MANAGER</p><h2>내 출간작</h2><span>현재 계정으로 출간한 작품만 표시됩니다. 작품을 선택해 정보와 덧칠을 관리하세요.</span></div>
      {selectedWork ? <div className="cover-preview-card">
        <img src={`${selectedWork.coverUrl}${selectedWork.coverUrl.includes("?") ? "&" : "?"}v=${coverVersion || encodeURIComponent(selectedWork.updatedAt)}`} alt={`${selectedWork.title} 현재 표지`} />
        <div><small>{selectedWork.visibility === "public" ? "PUBLIC" : "PRIVATE"} · 덧칠 v{selectedWork.currentRevision}</small><strong>{selectedWork.title}</strong><span>{selectedWork.subtitle || "부제 없음"}</span></div>
      </div> : <div className="cover-empty">아직 출간한 작품이 없습니다. 새 작품 출간에서 첫 작품을 등록하세요.</div>}
      {!!managedWorks.length && <div className="work-selector" aria-label="편집할 작품">
        <div className="work-selector-heading"><b>출간 작품</b><span>{managedWorks.length}개 · 카드를 눌러 전환</span></div>
        <div className="work-picker-list">{managedWorks.map((work) => {
          const cortex = work.packageContract.packageTarget === "cortex" || work.packageContract.targetEngine?.includes("cortex");
          return <button key={work.slug} type="button" className={work.slug === selectedWorkSlug ? "active" : ""} onClick={() => selectWork(work.slug)} disabled={coverBusy || infoBusy || revisionBusy || deleteBusy} aria-pressed={work.slug === selectedWorkSlug}>
            <img src={`${work.coverUrl}${work.coverUrl.includes("?") ? "&" : "?"}thumb=1`} alt="" />
            <span><strong>{work.title}</strong><small>덧칠 v{work.currentRevision} · {cortex ? "CORTEX" : "SCENARIO"}</small></span>
          </button>;
        })}</div>
      </div>}

      {selectedWork && <form key={`info-${selectedWork.slug}-${selectedWork.updatedAt}`} className="work-info-form" onSubmit={updateWorkInfo}>
        <div className="manager-section-title"><span>01</span><div><strong>작품 정보 편집</strong><small>주소용 작품 ID와 덧칠 기록은 유지됩니다.</small></div></div>
        <div className="work-info-grid">
          <label>작품명<input name="manageTitle" required maxLength={120} defaultValue={selectedWork.title} disabled={infoBusy || deleteBusy} /></label>
          <label>부제<input name="manageSubtitle" maxLength={160} defaultValue={selectedWork.subtitle} disabled={infoBusy || deleteBusy} /></label>
          <label className="wide-field">작품 설명<textarea name="manageDescription" required maxLength={3000} rows={5} defaultValue={selectedWork.description} disabled={infoBusy || deleteBusy} /></label>
          <label>장르<input name="manageGenre" required maxLength={160} defaultValue={selectedWork.genre} disabled={infoBusy || deleteBusy} /></label>
          <label>태그<input name="manageTags" defaultValue={selectedWork.tags.join(", ")} disabled={infoBusy || deleteBusy} /></label>
          <label>공개 범위<select name="manageVisibility" defaultValue={selectedWork.visibility} disabled={infoBusy || deleteBusy}><option value="public">공개 · 공개 작품 목록에 게시</option><option value="private">비공개 · 제작자 보관</option></select></label>
        </div>
        <div className="editor-source-status"><b>패키지 자동 판독</b><p>{selectedWork.runtime} · 패키지 {selectedWork.packageVersion}</p><p>최소 요구 엔진: {selectedWork.packageContract.targetEngine || "legacy"} {selectedWork.packageContract.minimumTargetVersion || selectedWork.minNexusVersion}</p>{selectedWork.packageContract.engineScope === "cortex_only" && <span className="engine-scope-badge">CORTEX ENGINE ONLY</span>}{selectedWork.packageContract.compatibilitySchema && <code>{selectedWork.packageContract.compatibilitySchema}</code>}</div>
        <button className="button button-primary info-save-button" type="submit" disabled={infoBusy || deleteBusy}>{infoBusy ? "저장 중…" : "작품 정보 저장"}</button>
      </form>}

      <form className="cover-controls" onSubmit={replaceCover}>
        <div className="manager-section-title"><span>02</span><div><strong>표지 관리</strong><small>새 표지로 교체하거나 기본 표지로 되돌립니다.</small></div></div>
        <label className="file-drop">새 표지 선택<input name="registeredCover" type="file" accept="image/png,image/jpeg,image/webp" required disabled={!selectedWork || coverBusy} /><span>PNG · JPG · WebP 선택 가능 · 저장 시 경량 WebP로 자동 최적화</span></label>
        <div className="cover-buttons"><button className="button button-primary" type="submit" disabled={!selectedWork || coverBusy}>{coverBusy ? "처리 중…" : "새 표지로 교체"}</button><button className="button danger-button" type="button" onClick={deleteCover} disabled={!selectedWork || coverBusy || !selectedWork.hasCustomCover}>표지 삭제</button></div>
      </form>
      {coverStatus && <p className="cover-status" aria-live="polite">{coverStatus}</p>}
    </section>

    <section className={`editor-source-panel editor-${editorSource.status}`}>
      <div className="manager-section-title"><span>03</span><div><strong>Studio 편집 원본</strong><small>실행 자료와 분리된 내장 작업 JSON을 검증하고 추출합니다.</small></div></div>
      <div className="editor-source-status" aria-live="polite">
        {editorSource.status === "idle" && <><b>작품을 선택하세요</b><p>선택한 작품의 최신 덧칠을 검사합니다.</p></>}
        {editorSource.status === "checking" && <><b>편집 원본 무결성 검증 중…</b><p>manifest, byteLength, SHA-256을 확인하고 있습니다.</p></>}
        {editorSource.status === "available" && <><b>{editorSource.standalone ? "독립 작업 JSON 사용 가능" : "완전 편집 패키지 사용 가능"}</b><p>Studio {editorSource.studioVersion} · Package {editorSource.packageVersion} · {new Intl.NumberFormat("ko-KR").format(editorSource.byteLength)} bytes</p>{!editorSource.standalone && <p>V2 작업 원본은 이미지가 ZIP assets/에 분리되어 있어 원본 ZIP으로 Studio에 불러옵니다.</p>}<code>{editorSource.sha256}</code></>}
        {editorSource.status === "legacy" && <><b>완전 편집 원본 없음</b><p>구형 패키지입니다. Studio는 project.json과 assets/를 조합해 가능한 범위만 복원할 수 있습니다.</p></>}
        {editorSource.status === "corrupt" && <><b>패키지 손상 · 편집 원본 제공 차단</b><p>내장 작업 JSON의 길이 또는 SHA-256 검증에 실패했습니다. 실행 패키지 정책과는 별도로 편집 원본만 차단됩니다.</p><code>{editorSource.error}</code></>}
        {editorSource.status === "error" && <><b>편집 원본 확인 실패</b><p>잠시 후 작품을 다시 선택해 확인하세요.</p><code>{editorSource.error}</code></>}
      </div>
      <div className="editor-source-actions">
        <button className="button button-primary" type="button" onClick={downloadVerifiedEditorSource} disabled={editorSource.status !== "available" || !editorSource.standalone}>독립 작업 JSON 추출</button>
        <button className="button button-ghost" type="button" onClick={openInStudio} disabled={editorSource.status !== "available" || studioHandoffBusy}>{studioHandoffBusy ? "Studio 전달 중…" : "Studio에서 편집"}</button>
        <a className="button editor-package-link" href={downloadUrl("package")}>원본 ZIP 받기</a>
        {editorSource.status === "legacy" && <button className="button button-ghost" type="button" onClick={openLegacyPackageInStudio}>구형 ZIP을 Studio에서 열기</button>}
      </div>
      {studioHandoffStatus && <p className="editor-handoff-status" aria-live="polite">{studioHandoffStatus}</p>}
    </section>

    <form className="revision-publisher" onSubmit={publishRevision}>
      <div className="revision-heading"><p>PACKAGE 덧칠</p><h2>새 덧칠 등록</h2><span>작품 정보와 표지는 유지하고 새 패키지를 다음 덧칠로 등록합니다. 이전 패키지도 보존됩니다.</span></div>
      <div className="revision-current">{selectedWork ? <><small>선택 작품</small><strong>{selectedWork.title}</strong><span>현재 덧칠 v{selectedWork.currentRevision} · 총 {selectedWork.revisionCount}개 보존</span></> : <span>편집할 작품을 먼저 선택하세요.</span>}</div>
      <div className="revision-fields"><label className="file-drop">새 ScenarioPack / CortexPack ZIP<input name="revisionPackage" type="file" accept=".zip,application/zip" required disabled={!selectedWork || revisionBusy} /><span>최대 1 GB · Cortex 작품은 CortexPack만 허용 · 프로젝트 ID 검증 · 이전 덧칠 보존</span></label></div>
      <div className="revision-action"><button className="button button-primary" type="submit" disabled={!selectedWork || revisionBusy}>{revisionBusy ? "덧칠 등록 중…" : `덧칠 v${(selectedWork?.currentRevision ?? 0) + 1} 등록`}</button><progress max="100" value={revisionProgress} />{revisionStatus && <p aria-live="polite">{revisionStatus}</p>}</div>
    </form>

    <section className="work-danger-zone standalone-danger">
      <div><strong>작품 완전 삭제</strong><span>작품 정보, 표지, 모든 덧칠 패키지와 다운로드 기록을 삭제합니다.</span></div>
      <button className="button danger-button" type="button" onClick={deleteWork} disabled={!selectedWork || deleteBusy || infoBusy || coverBusy || revisionBusy}>{deleteBusy ? "삭제 중…" : "작품 삭제"}</button>
    </section>
    {infoStatus && <p className="info-status standalone-status" aria-live="polite">{infoStatus}</p>}
  </>;
}
