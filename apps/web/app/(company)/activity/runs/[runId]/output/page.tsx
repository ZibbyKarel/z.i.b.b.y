import { RunOutputScreen } from "../../../../../../features/runs/screens/RunOutputScreen";

export default async function ActivityRunOutputPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <RunOutputScreen runId={runId} />;
}
