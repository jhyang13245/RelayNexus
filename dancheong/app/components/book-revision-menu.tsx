"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type Option = { id: string; revision?: number | null; sessions: number; legacy: boolean };
export function BookRevisionMenu({ title, options, selectedId, latestRevision, installedLatest, busy, onSelect, onInstall }: {
  title: string; options: Option[]; selectedId: string; latestRevision?: number;
  installedLatest: boolean; busy: boolean; onSelect: (id: string) => void; onInstall?: () => void;
}) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = (restoreFocus = false) => { setPosition(null); if (restoreFocus) trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!position) return;
    const focus = requestAnimationFrame(() => (panel.current?.querySelector<HTMLButtonElement>("button[aria-pressed=true]") ?? panel.current?.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true }));
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setPosition(null); trigger.current?.focus({ preventScroll: true }); } };
    const scroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) setPosition(null); };
    const resize = () => setPosition(null);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(focus); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", resize); };
  }, [position]);
  return <>
    <button ref={trigger} type="button" className="book-options-trigger" aria-label={`${title} 덧칠 관리`} aria-haspopup="dialog" aria-expanded={Boolean(position)} disabled={busy} onClick={() => {
      if (position) { close(); return; }
      const rect = trigger.current!.getBoundingClientRect(), width = Math.min(280, innerWidth - 24);
      const below = innerHeight - rect.bottom - 18, above = rect.top - 18, upwards = below < 360 && above > below;
      setPosition({ width, left: Math.max(12, Math.min(rect.right - width, innerWidth - width - 12)), maxHeight: Math.min(360, upwards ? above : below), ...(upwards ? { bottom: innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) });
    }}><svg width="18" height="22" viewBox="0 0 18 22" fill="currentColor" aria-hidden="true"><circle cx="9" cy="4" r="1.6"/><circle cx="9" cy="11" r="1.6"/><circle cx="9" cy="18" r="1.6"/></svg></button>
    {position && createPortal(<div ref={panel} className="book-revision-menu" style={position} role="dialog" aria-label={`${title} 덧칠 선택`}>
      <header><span>덧칠 관리</span><button type="button" aria-label="덧칠 메뉴 닫기" onClick={() => close(true)}>×</button></header>
      <p className="book-revision-menu-title">{title}</p>
      {latestRevision && onInstall && !installedLatest && <button type="button" className="book-revision-download" disabled={busy} onClick={() => { close(); onInstall(); }}>덧칠 받기 <span>v{latestRevision} ↓</span></button>}
      <p className="book-revision-menu-label">설치된 덧칠</p>
      <div className="book-revision-options">{options.map(option => <button key={option.id} type="button" aria-pressed={selectedId === option.id} disabled={busy} onClick={() => { close(); onSelect(option.id); }}>
        <span><strong>{option.revision ? `덧칠 v${option.revision}` : "기존 설치본"}{option.legacy && option.revision ? " · 이전 설치" : ""}</strong><small>세션 {option.sessions}개{option.revision === latestRevision ? " · 최신" : ""}</small></span><b aria-hidden="true">{selectedId === option.id ? "✓" : ""}</b>
      </button>)}</div>
      <footer>덧칠별 이야기는 따로 보관됩니다.</footer>
    </div>, document.body)}
  </>;
}
