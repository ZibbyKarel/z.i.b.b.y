import {
  type GitHubConfig,
  type Integration,
  type IntegrationRoutingRule,
  type JiraConfig,
  type Project,
  repoFromGitRemote,
} from "@zibby/contracts";

/** One merge: ≥2 project-owned Jira integrations of one company on the same `baseUrl`. */
export interface MigrationGroup {
  companyId: string;
  baseUrl: string;
  /** The new company-owned integration (entity-file shape, no volatile fields). */
  target: {
    id: string;
    kind: "jira";
    companyId: string;
    name?: string;
    enabled: boolean;
    config: { kind: "jira"; baseUrl: string; email: string };
  };
  /** Old integration whose credential file is copied to `target.id`. */
  credentialsFrom: string;
  /** Old project-owned integrations deleted on apply (entity + credentials + sync state). */
  removeIds: string[];
  /** Routing rule generated for each project, from its old config. */
  routing: { projectId: string; rule: IntegrationRoutingRule }[];
}

export interface MigrationSkip {
  companyId: string;
  baseUrl: string;
  integrationIds: string[];
  reason: string;
}

export interface MigrationPlan {
  groups: MigrationGroup[];
  skipped: MigrationSkip[];
}

const norm = (url: string) => url.trim().replace(/\/+$/, "").toLowerCase();

/**
 * Pure planner (Phase 128, D11). Groups project-owned jira integrations by
 * (project's `companyId`, `baseUrl`); only groups with ≥2 distinct projects are
 * planned — a lone integration is never touched. Skips (with a reason) groups
 * whose target id already exists, whose logins differ, or where an old config
 * has neither `projectKey` nor `jql` (no routing rule can be derived).
 * Idempotent: once applied, no such group remains, so a re-run plans nothing.
 * GitHub is planned separately by {@link planGithubCompanyMigration}.
 */
export function planCompanyIntegrationMigration(
  integrations: Integration[],
  projects: Pick<Project, "id" | "companyId">[],
): MigrationPlan {
  const companyOf = new Map(projects.map((p) => [p.id, p.companyId]));
  const existingIds = new Set(integrations.map((i) => i.id));
  const buckets = new Map<string, { companyId: string; items: Integration[] }>();

  for (const integration of [...integrations].sort((a, b) => a.id.localeCompare(b.id))) {
    if (integration.config.kind !== "jira" || integration.projectId === undefined) continue;
    const companyId = companyOf.get(integration.projectId);
    if (!companyId) continue;
    const key = `${companyId}\u0000${norm(integration.config.baseUrl)}`;
    const bucket = buckets.get(key) ?? { companyId, items: [] };
    bucket.items.push(integration);
    buckets.set(key, bucket);
  }

  const plan: MigrationPlan = { groups: [], skipped: [] };
  for (const { companyId, items } of buckets.values()) {
    if (new Set(items.map((i) => i.projectId)).size < 2) continue;
    const configs = items.map((i) => i.config as JiraConfig);
    const first = items[0] as Integration;
    const firstConfig = configs[0] as JiraConfig;
    const ids = items.map((i) => i.id);
    const skip = (reason: string) =>
      plan.skipped.push({ companyId, baseUrl: firstConfig.baseUrl, integrationIds: ids, reason });

    const targetId = `${companyId}-jira`;
    if (existingIds.has(targetId)) {
      skip(`integration "${targetId}" already exists`);
      continue;
    }
    if (new Set(configs.map((c) => c.email.toLowerCase())).size > 1) {
      skip("integrations use different logins (email), credentials cannot be shared");
      continue;
    }
    if (configs.some((c) => c.projectKey === undefined && c.jql === undefined)) {
      skip("an integration has neither projectKey nor jql, no routing rule can be derived");
      continue;
    }

    plan.groups.push({
      companyId,
      baseUrl: firstConfig.baseUrl,
      target: {
        id: targetId,
        kind: "jira",
        companyId,
        ...(first.name !== undefined ? { name: first.name } : {}),
        enabled: items.some((i) => i.enabled),
        config: { kind: "jira", baseUrl: firstConfig.baseUrl, email: firstConfig.email },
      },
      credentialsFrom: first.id,
      removeIds: ids,
      routing: items.map((i, idx) => {
        const c = configs[idx] as JiraConfig;
        return {
          projectId: i.projectId as string,
          rule: {
            integrationId: targetId,
            match: {
              kind: "jira" as const,
              ...(c.projectKey !== undefined ? { projectKey: c.projectKey } : {}),
              ...(c.jql !== undefined ? { jql: c.jql } : {}),
            },
          },
        };
      }),
    });
  }
  return plan;
}

/** One GitHub merge (phase 129, G3): ≥2 project-owned integrations sharing token + username. */
export interface GithubMigrationGroup {
  companyId: string;
  /** The new company-owned integration: no `repo`, each project's comes from its gitRemote. */
  target: {
    id: string;
    kind: "github";
    companyId: string;
    name?: string;
    enabled: boolean;
    config: GitHubConfig;
  };
  credentialsFrom: string;
  removeIds: string[];
  /** project id → the repo it now resolves to (for the dry-run output). */
  repos: { projectId: string; repo: string }[];
}

export interface GithubMigrationPlan {
  groups: GithubMigrationGroup[];
  skipped: MigrationSkip[];
}

/**
 * Pure planner (phase 129, G3). Groups project-owned GitHub integrations by
 * (project's `companyId`, token, `username`); `tokens` maps integration id →
 * token and is only compared for equality, never emitted. A group of ≥2 distinct
 * projects merges into `<companyId>-github` without `repo` (streams = union,
 * includeTeams = OR) provided every project's `gitRemote` resolves to its old
 * integration's `repo`. `canonicalRepos` (integration id → GitHub's current
 * `full_name`, looked up by the caller) catches a renamed repo: a stale name is a
 * mismatch too, since the gitRemote would then route by the old name. Skipped with
 * a reason: a mismatch, an existing target id, or a company that already owns a
 * GitHub integration. Integrations without a token are left alone.
 */
export function planGithubCompanyMigration(
  integrations: Integration[],
  projects: Pick<Project, "id" | "companyId" | "gitRemote">[],
  tokens: ReadonlyMap<string, string>,
  canonicalRepos: ReadonlyMap<string, string> = new Map(),
): GithubMigrationPlan {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const existingIds = new Set(integrations.map((i) => i.id));
  const companiesWithGithub = new Set(
    integrations.filter((i) => i.kind === "github" && i.companyId).map((i) => i.companyId),
  );
  // Token values only ever serve as bucket keys; the index keeps them out of the key.
  const tokenIndex = new Map<string, number>();
  const buckets = new Map<string, { companyId: string; items: Integration[] }>();
  for (const integration of [...integrations].sort((a, b) => a.id.localeCompare(b.id))) {
    if (integration.config.kind !== "github" || integration.projectId === undefined) continue;
    const companyId = byId.get(integration.projectId)?.companyId;
    const token = tokens.get(integration.id);
    if (!companyId || !token) continue;
    if (!tokenIndex.has(token)) tokenIndex.set(token, tokenIndex.size);
    const key = `${companyId}\u0000${tokenIndex.get(token)}\u0000${integration.config.username.toLowerCase()}`;
    const bucket = buckets.get(key) ?? { companyId, items: [] };
    bucket.items.push(integration);
    buckets.set(key, bucket);
  }

  const plan: GithubMigrationPlan = { groups: [], skipped: [] };
  for (const { companyId, items } of buckets.values()) {
    if (new Set(items.map((i) => i.projectId)).size < 2) continue;
    const ids = items.map((i) => i.id);
    const skip = (reason: string) =>
      plan.skipped.push({ companyId, baseUrl: "github.com", integrationIds: ids, reason });
    const targetId = `${companyId}-github`;
    if (companiesWithGithub.has(companyId)) {
      skip(`company "${companyId}" already has a company-owned github integration`);
      continue;
    }
    if (existingIds.has(targetId)) {
      skip(`integration "${targetId}" already exists`);
      continue;
    }
    const mismatches: string[] = [];
    const repos: { projectId: string; repo: string }[] = [];
    for (const i of items) {
      const repo = ((i.config as GitHubConfig).repo ?? "").toLowerCase();
      const remote = repoFromGitRemote(byId.get(i.projectId as string)?.gitRemote);
      const canonical = canonicalRepos.get(i.id)?.toLowerCase();
      if (remote !== repo) {
        mismatches.push(`${i.projectId}: gitRemote ${remote ?? "(none)"} != repo ${repo}`);
      } else if (canonical !== undefined && canonical !== repo) {
        mismatches.push(`${i.projectId}: repo ${repo} was renamed on GitHub to ${canonical}`);
      } else {
        repos.push({ projectId: i.projectId as string, repo });
      }
    }
    if (mismatches.length > 0) {
      skip(`repo does not match the project's gitRemote (${mismatches.join("; ")})`);
      continue;
    }
    const configs = items.map((i) => i.config as GitHubConfig);
    const first = items[0] as Integration;
    const streams = [...new Set(configs.flatMap((c) => c.streams))];
    const includeTeams = configs.some((c) => c.includeTeams === true);
    plan.groups.push({
      companyId,
      target: {
        id: targetId,
        kind: "github",
        companyId,
        ...(first.name !== undefined ? { name: first.name } : {}),
        enabled: items.some((i) => i.enabled),
        config: {
          kind: "github",
          streams,
          username: (configs[0] as GitHubConfig).username,
          ...(includeTeams ? { includeTeams } : {}),
        },
      },
      credentialsFrom: first.id,
      removeIds: ids,
      repos,
    });
  }
  return plan;
}

/** Replace any existing rule for the same integration, keep the rest. */
export function withRoutingRule(
  existing: IntegrationRoutingRule[] | undefined,
  rule: IntegrationRoutingRule,
): IntegrationRoutingRule[] {
  return [...(existing ?? []).filter((r) => r.integrationId !== rule.integrationId), rule];
}

/** Human-readable dry-run output. */
export function formatPlan(plan: MigrationPlan, github?: GithubMigrationPlan): string {
  const lines: string[] = [];
  for (const g of github?.groups ?? []) {
    lines.push(
      `MERGE company "${g.companyId}" (github) -> new integration "${g.target.id}" (no repo; streams ${g.target.config.streams.join(",")})`,
      `  credentials copied from "${g.credentialsFrom}"`,
      `  remove: ${g.removeIds.join(", ")}`,
    );
    for (const r of g.repos) lines.push(`  ${r.projectId}: repo ${r.repo} (from gitRemote)`);
  }
  for (const g of plan.groups) {
    lines.push(
      `MERGE company "${g.companyId}" (${g.baseUrl}) -> new integration "${g.target.id}"`,
      `  credentials copied from "${g.credentialsFrom}"`,
      `  remove: ${g.removeIds.join(", ")}`,
    );
    for (const r of g.routing)
      lines.push(`  route ${r.projectId}: ${JSON.stringify(r.rule.match)}`);
  }
  for (const s of [...plan.skipped, ...(github?.skipped ?? [])]) {
    lines.push(`SKIP company "${s.companyId}" [${s.integrationIds.join(", ")}]: ${s.reason}`);
  }
  if (lines.length === 0) lines.push("Nothing to migrate.");
  return lines.join("\n");
}
