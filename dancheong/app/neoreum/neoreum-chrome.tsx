"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { NexusSiteNav } from "@/app/components/nexus-site-nav";

export default function NeoreumChrome({ accountName, children }: { accountName: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const scrollRoot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (scrollRoot.current) scrollRoot.current.scrollTop = 0; }, [pathname]);
  const navigate = (href: string) => router.push(href);
  const worksActive = pathname.startsWith("/neoreum/manage");
  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/jieum");
    router.prefetch("/neoreum");
    router.prefetch("/neoreum/upload");
  }, [router]);
  return <div className="neoreum-site" ref={scrollRoot}>
    <NexusSiteNav
      active="neoreum"
      accountName={accountName}
      onAccount={() => navigate("/?panel=account")}
      onSettings={() => navigate("/?panel=settings")}
    />
    <nav className="neoreum-subnav" aria-label="너름 메뉴">
      <Link href="/neoreum" prefetch={true} className={pathname === "/neoreum" ? "active" : ""}>너름 홈</Link>
      <Link href="/neoreum/manage" prefetch={true} className={worksActive ? "active" : ""}>내 출간작</Link>
      <Link href="/neoreum/upload" prefetch={true} className={pathname === "/neoreum/upload" ? "active" : ""}>새 작품 출간</Link>
    </nav>
    {children}
  </div>;
}
