import { Screen } from "../../../../features/pipelines/Screen";

export default async function PipelineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Screen selectedId={id} />;
}
