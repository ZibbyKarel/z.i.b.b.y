import {
  type ArchiveSort,
  ArchiveSortSchema,
  type RunKind,
  RunKindSchema,
  type TaskRunStatus,
  TaskRunStatusSchema,
} from "@zibby/contracts";
import { RUN_STATUS_GROUPS, type RunStatusGroupKey } from "../runs/statusGroups";

/**
 * todo-14: the `/activity/runs` table's filter + sort state. It lives ONLY in the URL
 * (`?q=&state=&department=&project=&kind=&sort=&dir=`), so a pinned link reproduces the
 * table and going to a run detail and back keeps it. `""` = default, never written.
 * Default sort (`""`) is newest-started first.
 */
export interface RunsListFilters {
  q: string;
  state: RunStatusGroupKey | "";
  department: string;
  project: string;
  kind: RunKind | "";
  sort: ArchiveSort | "";
  dir: "asc" | "desc" | "";
}

export const EMPTY_RUNS_LIST_FILTERS: RunsListFilters = {
  q: "",
  state: "",
  department: "",
  project: "",
  kind: "",
  sort: "",
  dir: "",
};

const KEYS = Object.keys(EMPTY_RUNS_LIST_FILTERS) as (keyof RunsListFilters)[];
const STATE_KEYS = RUN_STATUS_GROUPS.map((g) => g.key);

function oneOf<T extends string>(list: readonly T[], value: string | null): T | "" {
  return list.find((v) => v === value) ?? "";
}

export function parseRunsListFilters(params: URLSearchParams): RunsListFilters {
  return {
    q: params.get("q") ?? "",
    state: oneOf(STATE_KEYS, params.get("state")),
    department: params.get("department") ?? "",
    project: params.get("project") ?? "",
    kind: oneOf(RunKindSchema.options, params.get("kind")),
    sort: oneOf(ArchiveSortSchema.options, params.get("sort")),
    dir: oneOf(["asc", "desc"] as const, params.get("dir")),
  };
}

/** A copy of `base` with the filter keys replaced; defaults are omitted. */
export function writeRunsListFilters(
  base: URLSearchParams,
  filters: RunsListFilters,
): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of KEYS) {
    if (filters[key]) params.set(key, filters[key]);
    else params.delete(key);
  }
  return params;
}

/** The sort a header click on `key` leads to: same column flips, a new one starts desc
 *  (title asc). Landing back on the default (started desc) clears both params. */
export function nextSort(
  current: Pick<RunsListFilters, "sort" | "dir">,
  key: ArchiveSort,
): Pick<RunsListFilters, "sort" | "dir"> {
  const activeKey = current.sort || "started";
  const activeDir = current.dir || "desc";
  const dir =
    key === activeKey ? (activeDir === "desc" ? "asc" : "desc") : key === "title" ? "asc" : "desc";
  return key === "started" && dir === "desc" ? { sort: "", dir: "" } : { sort: key, dir };
}

/** The statuses the server is asked for: a group's members, or every status (all runs). */
export function statusesForState(state: RunsListFilters["state"]): TaskRunStatus[] {
  if (!state) return [...TaskRunStatusSchema.options];
  return RUN_STATUS_GROUPS.find((g) => g.key === state)?.statuses ?? [];
}

/** A deep link into the runs table with the given filters (e.g. the Overview KPIs). */
export function runsListHref(patch: Partial<RunsListFilters>): string {
  const qs = writeRunsListFilters(new URLSearchParams(), {
    ...EMPTY_RUNS_LIST_FILTERS,
    ...patch,
  }).toString();
  return qs ? `/activity/runs?${qs}` : "/activity/runs";
}
