import { redirect } from "next/navigation";
import { API_URL } from "../../../../state/api";

/**
 * ROUTE-MAP §2 — the old `/workflows/[id]` resolves its department server-side
 * (the editor now lives at `/org/departments/[dept]/workflows/[id]`), falling
 * back to `/org` when the workflow or its department can't be resolved.
 */
export default async function WorkflowRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let department: string | undefined;
  try {
    const res = await fetch(`${API_URL}/api/workflows/${id}`, { cache: "no-store" });
    if (res.ok) {
      const workflow = (await res.json()) as { department?: string };
      department = workflow.department;
    }
  } catch {
    department = undefined;
  }
  redirect(department ? `/org/departments/${department}/workflows/${id}` : "/org");
}
