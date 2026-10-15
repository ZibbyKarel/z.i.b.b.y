import type { Integration, IntegrationRoutingRule, JiraConfig, Project } from "@zibby/contracts";

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
 * GitHub stays per-repo and is not migrated.
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

/** Replace any existing rule for the same integration, keep the rest. */
export function withRoutingRule(
  existing: IntegrationRoutingRule[] | undefined,
  rule: IntegrationRoutingRule,
): IntegrationRoutingRule[] {
  return [...(existing ?? []).filter((r) => r.integrationId !== rule.integrationId), rule];
}

/** Human-readable dry-run output. */
export function formatPlan(plan: MigrationPlan): string {
  const lines: string[] = [];
  for (const g of plan.groups) {
    lines.push(
      `MERGE company "${g.companyId}" (${g.baseUrl}) -> new integration "${g.target.id}"`,
      `  credentials copied from "${g.credentialsFrom}"`,
      `  remove: ${g.removeIds.join(", ")}`,
    );
    for (const r of g.routing)
      lines.push(`  route ${r.projectId}: ${JSON.stringify(r.rule.match)}`);
  }
  for (const s of plan.skipped) {
    lines.push(`SKIP company "${s.companyId}" [${s.integrationIds.join(", ")}]: ${s.reason}`);
  }
  if (lines.length === 0) lines.push("Nothing to migrate.");
  return lines.join("\n");
}
