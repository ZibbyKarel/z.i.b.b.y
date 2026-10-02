import { Screen } from "../../../../../features/workflows/Screen";

export default async function WorkWorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Screen basePath="/work/workflows" selectedId={id} />;
}
