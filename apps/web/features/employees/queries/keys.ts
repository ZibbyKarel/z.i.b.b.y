/** Shared cache keys for the employee registry (D-015). */
export const employeesRootKey = ["employees"] as const;

export function getEmployeesQueryKey(query?: {
  department?: string;
  agentId?: string;
  status?: string;
}) {
  return [...employeesRootKey, query ?? {}] as const;
}

export function getEmployeeQueryKey(id: string) {
  return [...employeesRootKey, "one", id] as const;
}
