import { redirect } from "next/navigation";

/** Legacy route — agents were once called positions. */
export default async function PositionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/workforce/agents/${encodeURIComponent(id)}`);
}
