import { ActivityRunDetailScreen } from "../../../../../features/runs/screens/ActivityRunDetailScreen";

export default async function ActivityRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <ActivityRunDetailScreen runId={runId} />;
}
