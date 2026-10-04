import type { ReactNode } from "react";
import { getOptionalAccountContext } from "@/lib/account-store";
import NeoreumChrome from "./neoreum-chrome";
import "./neoreum.css";

export const dynamic = "force-dynamic";

export default async function NeoreumLayout({ children }: { children: ReactNode }) {
  const account = await getOptionalAccountContext().catch(() => null);
  return <NeoreumChrome accountName={account?.displayName ?? "GUEST"}>{children}</NeoreumChrome>;
}
