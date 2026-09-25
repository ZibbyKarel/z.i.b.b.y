import { Screen } from "../../../../../../../features/pipelines/Screen";

export default async function DepartmentPipelineEditorPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id, pid } = await params;
  return <Screen basePath={`/org/departments/${id}/pipelines`} selectedId={pid} />;
}
