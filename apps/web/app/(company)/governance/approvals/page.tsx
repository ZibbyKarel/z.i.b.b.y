import type { Route } from "next";
import { redirect } from "next/navigation";

/** todo-19: Approvals moved to `/activity/approvals`; old links and pins (incl. `?approval=`) land there. */
export default async function GovernanceApprovalsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value ? [value] : []) params.append(key, v);
  }
  const qs = params.toString();
  redirect((qs ? `/activity/approvals?${qs}` : "/activity/approvals") as Route);
}
