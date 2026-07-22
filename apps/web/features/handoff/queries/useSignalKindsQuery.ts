import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the signal-kind registry catalog. */
export function getSignalKindsQueryKey() {
  return ["handoff-signal-kinds"] as const;
}

/**
 * The full handoff signal-kind registry (`GET /api/handoff-signal-kinds`) — the
 * seeded built-ins plus operator-registered kinds (Slot B1,
 * `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`).
 * Returns the TanStack query result directly; `select` unwraps the ts-rest envelope
 * so `data` is the bare `HandoffSignalKind[]` body. Consumers (the handoff-rule
 * editor and row) scope this down to `from === subsystemId` or look up a single
 * `id` themselves — this hook always returns the whole registry.
 */
export function useSignalKindsQuery() {
  return apiClient.handoff.listSignalKinds.useQuery({
    queryKey: getSignalKindsQueryKey(),
    select: selectApiResponseBody,
  });
}
