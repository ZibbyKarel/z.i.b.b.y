import type { DepartmentId } from "@zibby/contracts";
import type { Workflow } from "../../domain";

export interface WorkflowGroup {
  /** Owning department, `null` for the unowned group. */
  department: DepartmentId | null;
  label: string;
  workflows: Workflow[];
}

const byCs = (a: string, b: string) => a.localeCompare(b, "cs");

/**
 * Groups workflows by owning department for the `/work/workflows` grid. A workflow
 * with no department, or one the registry doesn't know, lands in the unowned group,
 * which is always last and omitted when empty. Groups and members sort by name (cs).
 */
export function groupWorkflowsByDepartment(
  workflows: Workflow[],
  departmentName: (id: DepartmentId) => string | undefined,
  unownedLabel: string,
): WorkflowGroup[] {
  const groups = new Map<DepartmentId, WorkflowGroup>();
  const unowned: Workflow[] = [];
  for (const w of workflows) {
    const label = w.department ? departmentName(w.department) : undefined;
    if (!w.department || label === undefined) {
      unowned.push(w);
      continue;
    }
    const group = groups.get(w.department) ?? { department: w.department, label, workflows: [] };
    group.workflows.push(w);
    groups.set(w.department, group);
  }
  const sorted = [...groups.values()].sort((a, b) => byCs(a.label, b.label));
  if (unowned.length > 0)
    sorted.push({ department: null, label: unownedLabel, workflows: unowned });
  for (const g of sorted) g.workflows.sort((a, b) => byCs(a.name, b.name));
  return sorted;
}
