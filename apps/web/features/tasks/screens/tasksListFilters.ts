import type { TaskParentState, TaskSource } from "@zibby/contracts";

export const TASK_STATES: readonly TaskParentState[] = [
  "thinking",
  "working",
  "blocked",
  "error",
  "done",
];
export const TASK_SOURCES: readonly TaskSource[] = [
  "operator",
  "department",
  "channel",
  "automation",
];

/** `/work/tasks` filter state; `""` means "all" and is never written to the URL. */
export interface TaskListFilters {
  company: string;
  project: string;
  department: string;
  state: TaskParentState | "";
  source: TaskSource | "";
}

export const EMPTY_TASK_LIST_FILTERS: TaskListFilters = {
  company: "",
  project: "",
  department: "",
  state: "",
  source: "",
};

const KEYS = Object.keys(EMPTY_TASK_LIST_FILTERS) as (keyof TaskListFilters)[];

function oneOf<T extends string>(list: readonly T[], value: string | null): T | "" {
  return list.find((v) => v === value) ?? "";
}

export function parseTaskListFilters(params: URLSearchParams): TaskListFilters {
  return {
    company: params.get("company") ?? "",
    project: params.get("project") ?? "",
    department: params.get("department") ?? "",
    state: oneOf(TASK_STATES, params.get("state")),
    source: oneOf(TASK_SOURCES, params.get("source")),
  };
}

/** Returns a copy of `base` with the filter keys replaced; defaults are omitted. */
export function writeTaskListFilters(
  base: URLSearchParams,
  filters: TaskListFilters,
): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of KEYS) {
    if (filters[key]) params.set(key, filters[key]);
    else params.delete(key);
  }
  return params;
}
