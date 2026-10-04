import { requireChatGPTUser } from "@/app/chatgpt-auth";
import NeoreumCatalogClient from "./catalog-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 출간작 — 너름" };

export default async function NeoreumPage() {
  await requireChatGPTUser("/neoreum");
  return <NeoreumCatalogClient />;
}
