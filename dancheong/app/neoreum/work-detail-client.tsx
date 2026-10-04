"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatNeoreumBytes, neoreumEngineLabel, type NeoreumRevision, type NeoreumWork } from "./types";

export default function NeoreumWorkDetailClient({ slug }: { slug: string }) {
  const [work, setWork] = useState<NeoreumWork | null>(null);
  const [revisions, setRevisions] = useState<NeoreumRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`/api/neoreum/works/${encodeURIComponent(slug)}`, { signal: controller.signal, cache: "no-store" }),
      fetch(`/api/neoreum/works/${encodeURIComponent(slug)}/revisions`, { signal: controller.signal, cache: "no-store" }),
    ]).then(async ([workResponse, revisionsResponse]) => {
      const workPayload = await workResponse.json() as { work?: NeoreumWork; error?: string };
      const revisionPayload = await revisionsResponse.json() as { revisions?: NeoreumRevision[]; error?: string };
      if (!workResponse.ok || !workPayload.work) throw new Error(workPayload.error || "작품 정보를 불러오지 못했습니다.");
      if (!revisionsResponse.ok || !Array.isArray(revisionPayload.revisions)) throw new Error(revisionPayload.error || "덧칠 기록을 불러오지 못했습니다.");
      setWork(workPayload.work);
      setRevisions(revisionPayload.revisions);
    }).catch((cause) => {
      if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "작품 정보를 불러오지 못했습니다.");
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [slug]);

  const compatibility = useMemo(() => {
    if (!work) return null;
    const engine = neoreumEngineLabel(work);
    const required = work.packageContract.requiredFeatures ?? [];
    return {
      engine,
      label: engine === "CORTEX" ? "Cortex에서 바로 실행 가능" : "단청 ScenarioPack으로 실행 가능",
      required,
    };
  }, [work]);

  if (loading) return <main className="neoreum-main"><div className="neoreum-message">작품 원장과 덧칠 이력을 확인하고 있습니다…</div></main>;
  if (error || !work) return <main className="neoreum-main"><div className="neoreum-message error">{error || "작품을 찾을 수 없습니다."}<Link href="/neoreum">공개 작품으로 돌아가기</Link></div></main>;

  return <main className="neoreum-main neoreum-detail">
    <Link className="neoreum-back" href="/neoreum">← 공개 작품</Link>
    <section className="neoreum-detail-hero">
      <div className="neoreum-detail-cover"><img src={work.coverUrl} alt={`${work.title} 표지`} /><span>덧칠 v{work.currentRevision}</span></div>
      <div className="neoreum-detail-copy">
        <small>{compatibility?.engine} · {work.genre}</small>
        <h1>{work.title}</h1>
        <h2>{work.subtitle}</h2>
        <p>{work.description}</p>
        <div className="neoreum-tags">{work.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="neoreum-compatibility"><i /><div><strong>{compatibility?.label}</strong><span>Package {work.packageVersion} · 최소 단청 {work.minNexusVersion === "not_applicable" ? "제한 없음" : work.minNexusVersion}</span>{compatibility?.required.length ? <small>필수 기능 · {compatibility.required.join(" · ")}</small> : null}</div></div>
        <div className="neoreum-detail-actions"><a className="primary" href={`/?neoreumInstall=${encodeURIComponent(work.slug)}#neoreum`}>내 서재에 추가</a><a href={`/api/neoreum/works/${encodeURIComponent(work.slug)}/download`}>최신 ZIP 받기 ↓</a></div>
      </div>
    </section>

    <section className="neoreum-ledger">
      <header><div><small>WORK LEDGER</small><h2>작품 정보</h2></div><span>다운로드 {work.downloadCount.toLocaleString("ko-KR")}회</span></header>
      <dl>
        <div><dt>대상 엔진</dt><dd>{work.runtime}</dd></div>
        <div><dt>패키지 크기</dt><dd>{formatNeoreumBytes(work.packageBytes)}</dd></div>
        <div><dt>최근 덧칠</dt><dd>{new Date(work.updatedAt).toLocaleDateString("ko-KR")}</dd></div>
        <div><dt>무결성</dt><dd title={work.packageSha256}>SHA-256 검증됨</dd></div>
      </dl>
    </section>

    <section className="neoreum-revisions">
      <header><div><small>PAINT HISTORY</small><h2>덧칠 기록</h2></div><span>{revisions.length}개 보존</span></header>
      <div>{revisions.map((revision) => <article key={revision.revision} className={revision.current ? "current" : ""}>
        <span>v{revision.revision}</span>
        <div><strong>{revision.current ? "현재 덧칠" : `덧칠 v${revision.revision}`}</strong><small>Package {revision.packageVersion} · {formatNeoreumBytes(revision.packageBytes)} · {new Date(revision.createdAt).toLocaleDateString("ko-KR")}</small></div>
        <a href={`/api/neoreum/works/${encodeURIComponent(work.slug)}/revisions/${revision.revision}/download`}>ZIP ↓</a>
      </article>)}</div>
    </section>
  </main>;
}
