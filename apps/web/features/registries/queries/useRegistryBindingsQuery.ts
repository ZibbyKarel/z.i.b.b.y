import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getRegistryBindingsQueryKey() {
  return ["registries", "bindings"] as const;
}

/**
 * ZB-11 — the derived "Bound in" department data (O-09) for the
 * `/system/registries/[kind]` tables and the department detail's registry tabs.
 */
export function useRegistryBindingsQuery() {
  return apiClient.registries.getRegistryBindings.useQuery({
    queryKey: getRegistryBindingsQueryKey(),
    select: selectApiResponseBody,
  });
}
