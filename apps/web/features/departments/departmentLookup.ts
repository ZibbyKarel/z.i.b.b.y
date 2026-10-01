import type { Department, DepartmentId } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";

/** Neutral fallback colour (a DS token) for an id the registry doesn't know. */
export const FALLBACK_DEPARTMENT_COLOR = "var(--color-foreground-faint)";
const FALLBACK_ICON: IconName = "grid";

export interface DepartmentLookup {
  /** The departments, in org-chart order as the API returns them. */
  list: readonly Department[];
  get: (id: string) => Department | undefined;
  name: (id: string) => string;
  code: (id: string) => string;
  color: (id: string) => string;
  /** DS icon for the department (its `icon`), `grid` when unknown. */
  icon: (id: string) => IconName;
}

/**
 * Pure lookup over the departments the API returned. An unknown id degrades to
 * `{ name: id, code: ID, neutral colour, grid icon }` instead of throwing, so a
 * record that references a since-removed department still renders.
 */
export function departmentLookup(list: readonly Department[]): DepartmentLookup {
  const byId = new Map<string, Department>(list.map((d) => [d.id, d]));
  const get = (id: string) => byId.get(id);
  return {
    list,
    get,
    name: (id) => get(id)?.name ?? id,
    code: (id) => get(id)?.code ?? id.toUpperCase(),
    color: (id) => get(id)?.color ?? FALLBACK_DEPARTMENT_COLOR,
    icon: (id) => (get(id)?.icon as IconName | undefined) ?? FALLBACK_ICON,
  };
}

export type { DepartmentId };
