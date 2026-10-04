"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";

type NavigationResult = void | boolean | Promise<void | boolean>;
type Props = {
  active?: "home" | "jieum" | "neoreum";
  cortexMode?: boolean;
  accountName: string;
  onAccount: () => void;
  onSettings: () => void;
  signOutHref?: string;
  onNavigate?: (href: string) => NavigationResult;
};

const WARM_ROUTES = ["/", "/jieum", "/neoreum", "/multiplayer"];

export function NexusSiteNav({ active = "home", cortexMode = true, accountName, onAccount, onSettings, signOutHref, onNavigate }: Props) {
  const home = active === "home";
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState("");
  const jump = (id: string) => home ? `#${id}` : `/#${id}`;

  useEffect(() => {
    setPendingHref("");
    WARM_ROUTES.forEach((route) => router.prefetch(route));
  }, [pathname, router]);

  useEffect(() => {
    if (!pendingHref) return;
    const timeout = window.setTimeout(() => setPendingHref(""), 8000);
    return () => window.clearTimeout(timeout);
  }, [pendingHref]);

  const runNavigation = (href: string) => {
    const targetPath = href.split(/[?#]/u)[0] || pathname;
    if (targetPath !== pathname) setPendingHref(href);
    if (!onNavigate) {
      router.push(href);
      return;
    }
    void Promise.resolve(onNavigate(href))
      .then((didNavigate) => { if (didNavigate === false) setPendingHref(""); })
      .catch(() => setPendingHref(""));
  };

  const handleLink = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const targetPath = href.split(/[?#]/u)[0] || pathname;
    if (targetPath !== pathname) setPendingHref(href);
    if (!onNavigate) return;
    event.preventDefault();
    runNavigation(href);
  };

  const link = (href: string, label: string, selected = false) => <Link
    href={href}
    prefetch={true}
    className={selected ? "active" : ""}
    aria-current={selected ? "page" : undefined}
    onClick={(event) => handleLink(event, href)}
  >{label}</Link>;

  return <>
    {pendingHref && <span className="library-route-progress" role="status" aria-live="polite"><span className="sr-only">화면 전환 중</span></span>}
    <nav className="library-nav" aria-label="단청 메인 메뉴">
      <button className="library-brand" type="button" onClick={() => home ? window.scrollTo({ top: 0, behavior: "smooth" }) : runNavigation("/")}><span className="library-brand-mark"><i>단</i></span><span><strong>단청</strong><small>INTERACTIVE NOVEL</small></span></button>
      <div className="library-nav-links">{link(jump("continue"), "홈", home)}{link(jump("bookshelf"), "내 서재")}{link("/jieum", "지음", active === "jieum")}{link("/neoreum", "너름", active === "neoreum")}{link("/multiplayer", "멀티플레이")}</div>
      <div className="library-nav-actions"><button type="button" className="library-search" onClick={() => home ? document.querySelector<HTMLInputElement>("#library-search-input")?.focus() : runNavigation("/#bookshelf")} aria-label="서재 검색">⌕</button><button type="button" className="library-account" onClick={onAccount}><i>{accountName.slice(0, 1).toUpperCase()}</i><span>{accountName}</span></button><button type="button" className="library-settings" onClick={onSettings} aria-label="설정 열기" title="설정">⚙</button>{signOutHref&&<a className="library-signout" href={signOutHref} aria-label="로그아웃" title="로그아웃"><span aria-hidden="true">↪</span><b>로그아웃</b></a>}</div>
    </nav>
    <nav className="library-mobile-nav" aria-label="단청 모바일 메뉴">{link(jump("continue"), "홈", home)}{link(jump("bookshelf"), "내 서재")}{link("/jieum", "지음", active === "jieum")}{link("/neoreum", "너름", active === "neoreum")}{link("/multiplayer", "멀티")}</nav>
  </>;
}
