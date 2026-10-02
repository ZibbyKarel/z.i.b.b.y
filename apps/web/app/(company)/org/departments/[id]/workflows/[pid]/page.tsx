import { Screen } from "../../../../../../../features/workflows/Screen";

export default async function DepartmentWorkflowEditorPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id, pid } = await params;
  return <Screen basePath={`/org/departments/${id}/workflows`} selectedId={pid} />;
}
