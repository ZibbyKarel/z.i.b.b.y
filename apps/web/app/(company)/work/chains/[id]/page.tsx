import { ChainDetailScreen } from "../../../../../features/chains/screens/ChainDetailScreen";

export default async function WorkChainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChainDetailScreen chainId={id} />;
}
