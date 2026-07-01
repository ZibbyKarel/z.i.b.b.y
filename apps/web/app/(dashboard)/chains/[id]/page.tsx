import { Screen } from "../../../../features/chains/Screen";

export default async function ChainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Screen selectedId={id} />;
}
