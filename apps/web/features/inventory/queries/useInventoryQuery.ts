import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getInventoryQueryKey() {
  return ["inventory"] as const;
}

/** The machine inventory (MCP / skills / plugins / ZIBBY catalog) — state, fetched on mount, no polling. */
export function useInventoryQuery() {
  return apiClient.inventory.getInventory.useQuery({
    queryKey: getInventoryQueryKey(),
    select: selectApiResponseBody,
  });
}
