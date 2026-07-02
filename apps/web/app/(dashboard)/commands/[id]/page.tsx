import { DetailScreen } from "../../../../features/commands/DetailScreen";

export default async function CommandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailScreen commandId={id} />;
}
