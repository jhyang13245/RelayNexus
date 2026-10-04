import { requireChatGPTUser } from "@/app/chatgpt-auth";
import ManageClient from "../manage-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 출간작 — 너름" };

export default async function NeoreumManagePage() {
  await requireChatGPTUser("/neoreum/manage");
  return <main className="neoreum-main neoreum-console">
    <header className="neoreum-heading"><div><p>MY PUBLISHED WORKS</p><h1>내 출간작</h1></div><p>현재 계정으로 출간한 작품의 정보·표지·작업 원본과 다음 덧칠을 관리합니다.</p></header>
    <ManageClient />
  </main>;
}
