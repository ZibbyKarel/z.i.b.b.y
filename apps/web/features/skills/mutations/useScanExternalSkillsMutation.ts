import { apiClient } from "../../../state/api";

/**
 * List the SKILL.md folders of a GitHub repo (`POST /api/skills/external/scan`).
 * Read-only on the server, so nothing to invalidate; the install dialog shows
 * the 400/422/502 message inline instead of the global toast.
 */
export function useScanExternalSkillsMutation() {
  return apiClient.externalSkills.scanExternalSkills.useMutation({
    meta: { inlineError: true },
  });
}
