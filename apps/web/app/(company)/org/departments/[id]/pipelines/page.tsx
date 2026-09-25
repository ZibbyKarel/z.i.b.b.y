import { DepartmentScreen } from "../../../../../../features/departments/screens/DepartmentScreen";

/**
 * A literal `pipelines/` directory (needed to host the `[pid]` editor route)
 * shadows the sibling `[tab]` dynamic segment for this exact path (Next.js
 * matches the literal segment first) — so it needs its own thin page.tsx
 * rendering the same tab.
 */
export default async function DepartmentPipelinesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DepartmentScreen departmentId={id} tab="pipelines" />;
}
