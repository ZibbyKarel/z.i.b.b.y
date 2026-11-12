import { apiClient } from "../../../state/api";

/**
 * "Opravit CI" on a red base branch (`POST /api/project-ci/:projectId/fix`): the API creates a
 * task whose output is a PR — ZIBBY opens it itself (Tier-2), the operator merges. Always an
 * explicit operator click.
 */
export function useFixProjectCiMutation() {
  return apiClient.projectCi.fixProjectCi.useMutation();
}
