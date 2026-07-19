import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getActivityQueryKey } from "../../activity/queries/useActivityQuery";
import { getBriefingQueryKey } from "../queries/useBriefingQuery";

/**
 * Generate a briefing now (`POST /api/briefing/generate`): assembles, persists to
 * the vault and records a `briefing-generated` entry. Invalidates the briefing key
 * (the card re-reads the fresh assembly) and the activity feed (the new entry).
 */
export function useGenerateBriefingMutation() {
  const qc = useQueryClient();
  return apiClient.briefing.generateBriefing.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getBriefingQueryKey() });
      qc.invalidateQueries({ queryKey: getActivityQueryKey() });
    },
  });
}
