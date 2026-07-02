import { DetailScreen } from "../../../../features/hooks/DetailScreen";

export default async function HookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailScreen hookId={id} />;
}
