import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getSubsystemsQueryKey } from "../queries/useSubsystemsQuery";

/**
 * Acknowledge a subsystem's Tier-2 reports (`POST /api/subsystems/:id/seen`) — the
 * web calls this when the operator opens the subsystem's drawer (phase 84).
 * Resets its `hlaseni` window; Tier-3 (`ceka`) items are untouched (they resolve
 * only through the approvals flow).
 */
export const useMarkSubsystemSeenMutation = makeInvalidatingMutation(
  apiClient.subsystems.markSubsystemSeen.useMutation,
  getSubsystemsQueryKey,
);
