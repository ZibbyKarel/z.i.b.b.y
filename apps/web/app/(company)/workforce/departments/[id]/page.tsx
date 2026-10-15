import { redirect } from "next/navigation";

/** ROUTE-MAP §1: `/workforce/departments/[id]` redirects to its `team` tab. */
export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/workforce/departments/${id}/team`);
}
