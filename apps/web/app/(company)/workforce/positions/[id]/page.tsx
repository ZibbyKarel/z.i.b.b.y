import { DetailScreen } from "../../../../../features/agents/DetailScreen";

/** `/workforce/positions/[id]` — a position (agent definition) edit form. */
export default async function PositionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailScreen agentId={id} />;
}
