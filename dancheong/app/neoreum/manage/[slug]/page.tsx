import { requireChatGPTUser } from "@/app/chatgpt-auth";
import ManageClient from "../../manage-client";

export const dynamic = "force-dynamic";

export default async function NeoreumManageWorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireChatGPTUser(`/neoreum/manage/${encodeURIComponent(slug)}`);
  return <main className="neoreum-main neoreum-console">
    <header className="neoreum-heading"><div><p>선택 작품 덧칠 관리</p><h1>작품 편집</h1></div><p>원본 이력은 유지하면서 공개 정보와 최신 패키지를 갱신합니다.</p></header>
    <ManageClient initialSlug={slug} />
  </main>;
}
