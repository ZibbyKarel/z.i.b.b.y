import { ProjectDetailScreen } from "../../../../../features/projects/screens/ProjectDetailScreen";

/** `/work/projects/[id]` → the `overview` tab (ROUTE-MAP §1). */
export default async function WorkProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectDetailScreen projectId={id} tab="overview" />;
}
