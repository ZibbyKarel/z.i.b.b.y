import { DetailScreen } from "../../../../../features/agents/DetailScreen";

/** `/workforce/agents/[id]` — an agent definition edit form. */
export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailScreen agentId={id} />;
}
