import { PipelinesScreen } from "../../../../features/dashboard/PipelinesScreen";

export default async function PipelineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PipelinesScreen selectedId={id} />;
}
