import { requireChatGPTUser } from "@/app/chatgpt-auth";
import UploadClient from "../upload-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "새 작품 출간 — 너름" };

export default async function NeoreumUploadPage() {
  await requireChatGPTUser("/neoreum/upload");
  return <main className="neoreum-main neoreum-console">
    <header className="neoreum-heading"><div><p>새 작품을 원장에 잇기</p><h1>새 작품 출간</h1></div><p>표지와 패키지를 검증해 너름의 첫 덧칠로 기록합니다.</p></header>
    <UploadClient />
  </main>;
}
