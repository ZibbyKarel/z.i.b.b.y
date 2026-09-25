import { redirect } from "next/navigation";

/** ROUTE-MAP §1: `/org/departments/[id]` redirects to its `team` tab. */
export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/org/departments/${id}/team`);
}
