import type { Skill as ContractSkill } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import { apiClient } from "../../../state/api";
import type { Skill } from "../../../domain";

/** Shared cache key for the skill list; exported so mutations can invalidate it. */
export function getSkillsQueryKey() {
  return ["skills"] as const;
}

/**
 * Map the contract `Skill` onto the dashboard's domain `Skill`: defaults the glyph
 * to the skill icon and derives the display-only `file` path the tiles show. This
 * composes around the response-envelope unwrap (the pattern `useLimitsQuery` uses
 * when a domain needs to reshape the body).
 */
function selectSkills(response: { body: ContractSkill[] }): Skill[] {
  return response.body.map((s) => ({
    id: s.id,
    name: s.name ?? s.id,
    glyph: (s.glyph as IconName | undefined) ?? "spark",
    desc: s.desc ?? "",
    file: `~/zibby/skills/${s.id}/SKILL.md`,
  }));
}

/**
 * Live skill catalog from `GET /api/skills`. Returns the TanStack query result
 * directly; `select` unwraps the envelope and reshapes to the domain `Skill`.
 */
export function useSkillsQuery() {
  return apiClient.skills.listSkills.useQuery({
    queryKey: getSkillsQueryKey(),
    select: selectSkills,
  });
}
