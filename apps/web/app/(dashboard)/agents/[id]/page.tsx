import { DetailScreen } from "../../../../features/agents/DetailScreen";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailScreen agentId={id} />;
}
