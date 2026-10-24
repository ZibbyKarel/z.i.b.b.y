import type { Agent } from "@zibby/contracts";

export interface AgentDepartmentSection {
  /** `null` is the trailing "no department" section (absent or unknown department). */
  departmentId: string | null;
  agents: Agent[];
}

const label = (a: Agent) => a.displayName ?? a.name ?? a.id;

/**
 * Groups agents into department sections in the department list order. Empty
 * departments are dropped; agents whose department is absent or not in the list land
 * in a final `departmentId: null` section so none is ever hidden.
 */
export function groupAgentsByDepartment(
  agents: Agent[],
  departments: { id: string }[],
  /** Sort locale (the UI locale); defaults to the runtime's. */
  locale?: string,
): AgentDepartmentSection[] {
  const collator = new Intl.Collator(locale);
  const byLabel = (a: Agent, b: Agent) => collator.compare(label(a), label(b));
  const known = new Set(departments.map((d) => d.id));
  const sections: AgentDepartmentSection[] = departments
    .map((d) => ({
      departmentId: d.id as string | null,
      agents: agents.filter((a) => a.department === d.id).sort(byLabel),
    }))
    .filter((s) => s.agents.length > 0);
  const orphans = agents.filter((a) => !a.department || !known.has(a.department)).sort(byLabel);
  if (orphans.length > 0) sections.push({ departmentId: null, agents: orphans });
  return sections;
}
