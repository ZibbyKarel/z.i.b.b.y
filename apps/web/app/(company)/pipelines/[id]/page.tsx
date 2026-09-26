import { redirect } from "next/navigation";
import { API_URL } from "../../../../state/api";

/**
 * ROUTE-MAP §2 — the old `/pipelines/[id]` resolves its department server-side
 * (the editor now lives at `/org/departments/[dept]/pipelines/[id]`), falling
 * back to `/org` when the pipeline or its department can't be resolved.
 */
export default async function PipelineRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let department: string | undefined;
  try {
    const res = await fetch(`${API_URL}/api/pipelines/${id}`, { cache: "no-store" });
    if (res.ok) {
      const pipeline = (await res.json()) as { department?: string };
      department = pipeline.department;
    }
  } catch {
    department = undefined;
  }
  redirect(department ? `/org/departments/${department}/pipelines/${id}` : "/org");
}
