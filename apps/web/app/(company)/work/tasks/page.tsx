import { redirect } from "next/navigation";
import { runsListHrefFromParams } from "../../../../features/archive/runsListFilters";

/** todo-14: the Tasks list merged into Activity → Runs; old links and pins land there with
 *  the filters the runs table supports (`company`, `project`, `department`, …) kept. */
export default async function WorkTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value ? [value] : []) params.append(key, v);
  }
  redirect(runsListHrefFromParams(params));
}
