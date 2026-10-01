import { useMemo } from "react";
import { DEPARTMENTS } from "@zibby/contracts";
import { type DepartmentLookup, departmentLookup } from "./departmentLookup";
import { useDepartmentsQuery } from "./queries";

/**
 * The departments registry as a lookup, read from the departments query.
 * ponytail: until the first response lands (and when the API is unreachable) it
 * falls back to the deprecated seed constant so selects aren't empty; the query
 * result replaces it as soon as it arrives.
 */
export function useDepartmentLookup(): DepartmentLookup {
  const { data } = useDepartmentsQuery();
  return useMemo(() => departmentLookup(data ?? DEPARTMENTS), [data]);
}
