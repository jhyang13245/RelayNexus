"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { neoreumEngineLabel, type NeoreumWork } from "./types";

const STATE_KEY = "dancheong-neoreum-catalog-state-v1";
type OwnedWork = NeoreumWork & { visibility: "public" | "private" };

export default function NeoreumCatalogClient() {
  const [works, setWorks] = useState<OwnedWork[]>([]);
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async (refresh = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    let timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/neoreum/manage/works?fresh=${refresh ? Date.now() : "catalog"}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "Cache-Control": "no-cache" },
      });
      const payload = await response.json() as { works?: OwnedWork[]; error?: string };
      if (timedOut) throw new Error("작품 조회가 지연되고 있습니다. 다시 시도해 주세요.");
      if (controller.signal.aborted) return;
      if (!response.ok || !Array.isArray(payload.works)) throw new Error(payload.error || "너름 작품을 불러오지 못했습니다.");
      setWorks(payload.works);
    } catch (cause) {
      if (requestRef.current !== controller || (controller.signal.aborted && !timedOut)) return;
      setError(timedOut ? "작품 조회가 지연되고 있습니다. 다시 시도해 주세요." : cause instanceof Error ? cause.message : "너름 작품을 불러오지 못했습니다.");
    } finally {
      clearTimeout(deadline);
      if (requestRef.current === controller && (!controller.signal.aborted || timedOut)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || "{}") as { query?: string; engine?: string; scrollY?: number };
      setQuery(saved.query ?? "");
      setEngine(saved.engine === "CORTEX" || saved.engine === "SCENARIO" ? saved.engine : "ALL");
    } catch {
      // Invalid device-only view state is ignored.
    }
    void load();
    return () => { requestRef.current?.abort(); requestRef.current = null; };
  }, [load]);

  useEffect(() => {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ query, engine })); } catch { /* View preferences are optional. */ }
  }, [engine, query]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return works.filter((work) => {
      const matchesEngine = engine === "ALL" || neoreumEngineLabel(work) === engine;
      const searchable = `${work.title} ${work.subtitle} ${work.description} ${work.genre} ${work.tags.join(" ")}`.toLocaleLowerCase("ko-KR");
      return matchesEngine && (!normalized || searchable.includes(normalized));
    });
  }, [engine, query, works]);

  const featured = visible.find((work) => work.featured) ?? visible[0];
  return <main className="neoreum-main">
    <header className="neoreum-heading">
      <div><p>MY PUBLISHED WORLDS</p><h1>너름</h1></div>
      <div><p>내가 펴낸 세계, 다음 덧칠로 이어가다.</p><Link className="button primary" href="/neoreum/upload">새 작품 출간 ↗</Link></div>
    </header>

    <section className="neoreum-tools" aria-label="작품 검색과 필터">
      <label><span>작품 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 장르, 태그로 찾기" /></label>
      <div className="neoreum-engine-filter" role="group" aria-label="패키지 종류">
        {["ALL", "CORTEX", "SCENARIO"].map((value) => <button key={value} type="button" className={engine === value ? "active" : ""} onClick={() => setEngine(value)}>{value === "ALL" ? "전체" : value}</button>)}
      </div>
      <button className="neoreum-refresh" type="button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? "동기화 중…" : "새로고침 ↻"}</button>
    </section>

    {loading ? <div className="neoreum-message">내 출간작을 읽고 있습니다…</div> : error ? <div className="neoreum-message error">{error}<button onClick={() => void load(true)}>다시 시도</button></div> : <>
      {featured && <section className="neoreum-featured">
        <div className="neoreum-featured-cover"><img src={featured.coverUrl} alt={`${featured.title} 표지`} /><span>MY WORK · 덧칠 v{featured.currentRevision}</span></div>
        <div><small>{neoreumEngineLabel(featured)} · {featured.genre}</small><h2>{featured.title}</h2><h3>{featured.subtitle}</h3><p>{featured.description}</p><div className="neoreum-tags">{featured.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><footer>{featured.visibility === "public" && <Link href={`/neoreum/works/${featured.slug}`}>출간본 보기</Link>}<Link className="primary" href={`/neoreum/manage/${featured.slug}`}>작품 관리 · 다음 덧칠 ↗</Link></footer></div>
      </section>}

      <section className="neoreum-catalog">
        <header><div><small>MY PUBLICATIONS</small><h2>내 출간작</h2></div><span>{visible.length}개</span></header>
        {visible.length ? <div className="neoreum-grid">{visible.map((work) => <article key={work.slug}>
          <Link className="neoreum-card-cover" href={`/neoreum/manage/${work.slug}`}><img src={work.coverUrl} alt={`${work.title} 표지`} loading="lazy" /><span>{neoreumEngineLabel(work)}</span></Link>
          <div><small>{work.genre}{work.visibility === "private" ? " · 비공개" : ""}</small><h3><Link href={`/neoreum/manage/${work.slug}`}>{work.title}</Link></h3><p>{work.subtitle}</p><dl><div><dt>최신 덧칠</dt><dd>v{work.currentRevision}</dd></div><div><dt>패키지</dt><dd>{work.packageVersion}</dd></div><div><dt>누적 덧칠</dt><dd>{work.revisionCount}개</dd></div></dl><footer>{work.visibility === "public" && <Link href={`/neoreum/works/${work.slug}`}>출간본 보기</Link>}<Link href={`/neoreum/manage/${work.slug}`}>작품 관리 ↗</Link></footer></div>
        </article>)}</div> : <div className="neoreum-message">{works.length ? "조건에 맞는 출간작이 없습니다." : "아직 출간한 작품이 없습니다. 지음에서 완성한 패키지로 첫 작품을 출간해 보세요."}</div>}
      </section>
    </>}
  </main>;
}
