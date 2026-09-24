import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

const SUBSYSTEMS_POLL_MS = 15_000;

/** Shared cache key for the subsystem-federation registry + status list. */
export function getSubsystemsQueryKey() {
  return ["subsystems"] as const;
}

/**
 * Phase 80 — polls `GET /api/subsystems`: the eight named subsystems
 * (design doc `docs/superpowers/specs/2026-07-08-subsystem-federation-design.md`)
 * plus their current status. Same posture as `useHealthQuery`/`useSelfStatusQuery`
 * — a slowly-changing, one-directional payload, so a plain `refetchInterval` beats
 * SSE (SSE-for-streams/poll-for-state DNA). Phase 89 adds SSE-driven immediacy on
 * top of this; state polling stays the baseline. Returns the TanStack query result
 * directly; `select` unwraps the ts-rest envelope so `data` is the
 * `SubsystemWithStatus[]` body.
 */
export function useSubsystemsQuery() {
  return apiClient.subsystems.getSubsystems.useQuery({
    queryKey: getSubsystemsQueryKey(),
    refetchInterval: SUBSYSTEMS_POLL_MS,
    refetchIntervalInBackground: true,
    select: selectApiResponseBody,
  });
}
