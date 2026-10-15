import { z } from "zod";

/**
 * Phase 128 (D3) — per-project routing rule for a company-owned integration. The
 * project says "items of integration X that look like THIS belong to me".
 * Discriminated by `kind` (the integration's kind).
 */
export const JiraRoutingMatchSchema = z
  .object({
    kind: z.literal("jira"),
    projectKey: z.string().min(1).optional(),
    components: z.array(z.string().min(1)).optional(),
    labels: z.array(z.string().min(1)).optional(),
    jql: z.string().min(1).optional(),
  })
  .refine((m) => m.jql !== undefined || m.projectKey !== undefined, {
    message: "a jira routing match needs a jql or a projectKey",
  });
/** Not required anymore (GitHub routes implicitly by `gitRemote`); kept so stored rules still parse. */
export const GitHubRoutingMatchSchema = z.object({ kind: z.literal("github") });
export const SlackRoutingMatchSchema = z.object({
  kind: z.literal("slack"),
  channels: z.array(z.string().min(1)).min(1),
});

export const RoutingMatchSchema = z.discriminatedUnion("kind", [
  JiraRoutingMatchSchema,
  GitHubRoutingMatchSchema,
  SlackRoutingMatchSchema,
]);
export type RoutingMatch = z.infer<typeof RoutingMatchSchema>;

export const IntegrationRoutingRuleSchema = z.object({
  integrationId: z.string().min(1),
  match: RoutingMatchSchema,
});
export type IntegrationRoutingRule = z.infer<typeof IntegrationRoutingRuleSchema>;

/** Descriptor of an inbound item, as the sync/triage layer sees it. */
export interface RoutingItem {
  integrationId: string;
  kind: "jira" | "github" | "slack";
  jira?: { projectKey: string; components: string[]; labels: string[] };
  github?: { repo: string };
  slack?: { channel: string };
}

/** The slice of a project `matchRouting` needs. */
export interface RoutableProject {
  id: string;
  gitRemote?: string | undefined;
  integrationRouting?: IntegrationRoutingRule[] | undefined;
}

/** `git@github.com:owner/name.git` / `https://github.com/owner/name(.git)` → `owner/name` (lowercased), else null. */
export function repoFromGitRemote(remote: string | undefined): string | null {
  if (!remote) return null;
  const m = /^(?:[\w.-]+@[\w.-]+:|(?:https|ssh):\/\/(?:[^/@]+@)?[^/]+\/)(.+?)(?:\.git)?\/?$/i.exec(
    remote,
  );
  const repo = m?.[1];
  return repo && /^[^/]+\/[^/]+$/.test(repo) ? repo.toLowerCase() : null;
}

const ci = (s: string) => s.trim().toLowerCase();

/**
 * Ids of the projects whose routing rules for `item.integrationId` match `item`.
 * The caller decides what 0 / 1 / ≥2 results mean (D4: ≥2 → triage, never first-match).
 *
 * Jira: `projectKey` must equal the item's; `components` / `labels`, when given,
 * match if the item has ANY of them. A rule carrying a `jql` cannot be evaluated
 * locally, so it matches only when the project is in `jqlMatches` (the sync layer
 * runs the JQL server-side); its other fields then narrow further.
 * GitHub is IMPLICIT (D3): a project matches when its `gitRemote` resolves to the
 * item's repo, with or without a rule. Slack: item channel in `channels`.
 */
export function matchRouting(
  item: RoutingItem,
  projects: RoutableProject[],
  jqlMatches?: ReadonlySet<string>,
): string[] {
  if (item.kind === "github") {
    const repo = item.github ? ci(item.github.repo) : null;
    return projects
      .filter((p) => repo !== null && repoFromGitRemote(p.gitRemote) === repo)
      .map((p) => p.id);
  }
  return projects
    .filter((p) =>
      (p.integrationRouting ?? []).some(
        (rule) =>
          rule.integrationId === item.integrationId && ruleMatches(rule.match, item, p, jqlMatches),
      ),
    )
    .map((p) => p.id);
}

function ruleMatches(
  match: RoutingMatch,
  item: RoutingItem,
  project: RoutableProject,
  jqlMatches: ReadonlySet<string> | undefined,
): boolean {
  if (match.kind !== item.kind) return false;
  switch (match.kind) {
    case "github":
      return false; // handled implicitly in matchRouting
    case "slack":
      return (
        item.slack !== undefined &&
        match.channels.some((c) => ci(c) === ci(item.slack?.channel ?? ""))
      );
    case "jira": {
      const jira = item.jira;
      if (!jira) return false;
      if (match.jql !== undefined && !jqlMatches?.has(project.id)) return false;
      if (match.projectKey !== undefined && ci(match.projectKey) !== ci(jira.projectKey)) {
        return false;
      }
      const anyOf = (wanted: string[] | undefined, have: string[]) =>
        !wanted || wanted.length === 0 || wanted.some((w) => have.some((h) => ci(h) === ci(w)));
      return anyOf(match.components, jira.components) && anyOf(match.labels, jira.labels);
    }
  }
}
