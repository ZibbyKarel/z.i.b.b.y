/** GitHub team slug: `team` or `org/team` (a leading `@`, CODEOWNERS style, is stripped on parse). */
export const TEAM_SLUG_RE = /^[A-Za-z0-9][\w.-]*(\/[A-Za-z0-9][\w.-]*)?$/;

/** `qualifyTeamSlug("devrel-team","shoptet")` → `"shoptet/devrel-team"`; an already-qualified slug is unchanged. */
export function qualifyTeamSlug(slug: string, owner: string): string {
  return slug.includes("/") ? slug : `${owner}/${slug}`;
}

/**
 * Does a GitHub `reviewTeam` (`org/team`) match a configured slug? Case-insensitive; a leading
 * `@` on the slug is ignored; a qualified slug compares the full `org/team`, an unqualified one
 * only the team segment.
 */
export function teamSlugMatches(reviewTeam: string, slug: string): boolean {
  const s = slug.replace(/^@/, "").toLowerCase();
  const r = reviewTeam.toLowerCase();
  return s.includes("/") ? r === s : r.split("/").pop() === s;
}
