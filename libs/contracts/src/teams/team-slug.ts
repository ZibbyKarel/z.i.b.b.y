/**
 * Team code owner id, as written in CODEOWNERS: a GitHub team (`team`, `org/team`) or a GitLab
 * group path (`group/subgroup/…`). A leading `@` is stripped on parse.
 */
export const TEAM_SLUG_RE = /^[A-Za-z0-9][\w.-]*(\/[A-Za-z0-9][\w.-]*)*$/;

/** `qualifyTeamSlug("devrel-team","shoptet")` → `"shoptet/devrel-team"`; an already-qualified slug is unchanged. */
export function qualifyTeamSlug(slug: string, owner: string): string {
  return slug.includes("/") ? slug : `${owner}/${slug}`;
}

/**
 * Does a requested review team (`org/team`, or a GitLab `group/subgroup` path) match a configured
 * code owner id? Case-insensitive; a leading `@` is ignored; a qualified id compares the full
 * path, an unqualified one only the last segment.
 */
export function teamSlugMatches(reviewTeam: string, slug: string): boolean {
  const s = slug.replace(/^@/, "").toLowerCase();
  const r = reviewTeam.toLowerCase();
  return s.includes("/") ? r === s : r.split("/").pop() === s;
}
