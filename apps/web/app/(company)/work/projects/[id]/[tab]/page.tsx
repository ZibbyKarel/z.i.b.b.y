import { notFound } from "next/navigation";
import { ProjectDetailScreen } from "../../../../../../features/projects/screens/ProjectDetailScreen";
import { PROJECT_TABS, type ProjectTab } from "../../../../../../features/projects/projectTabs";

function asProjectTab(value: string): ProjectTab | null {
  return (PROJECT_TABS as readonly string[]).includes(value) ? (value as ProjectTab) : null;
}

export default async function WorkProjectTabPage({
  params,
}: {
  params: Promise<{ id: string; tab: string }>;
}) {
  const { id, tab } = await params;
  const projectTab = asProjectTab(tab);
  if (!projectTab) notFound();
  return <ProjectDetailScreen projectId={id} tab={projectTab} />;
}
