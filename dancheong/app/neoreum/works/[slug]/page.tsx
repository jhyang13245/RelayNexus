import NeoreumWorkDetailClient from "../../work-detail-client";

export const dynamic = "force-dynamic";

export default async function NeoreumWorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <NeoreumWorkDetailClient slug={slug} />;
}
