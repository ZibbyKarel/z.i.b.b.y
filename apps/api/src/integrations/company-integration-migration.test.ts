import type { Integration } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  formatPlan,
  planCompanyIntegrationMigration,
  planGithubCompanyMigration,
  withRoutingRule,
} from "./company-integration-migration";

const jira = (
  id: string,
  projectId: string,
  extra: { projectKey?: string; jql?: string; baseUrl?: string; email?: string } = {},
): Integration => ({
  id,
  kind: "jira",
  projectId,
  enabled: true,
  status: "disconnected",
  hasCredentials: true,
  config: {
    kind: "jira",
    baseUrl: extra.baseUrl ?? "https://x.atlassian.net",
    email: extra.email ?? "a@b.c",
    ...(extra.projectKey ? { projectKey: extra.projectKey } : {}),
    ...(extra.jql ? { jql: extra.jql } : {}),
  },
});

const projects = [
  { id: "p1", companyId: "co" },
  { id: "p2", companyId: "co" },
  { id: "p3", companyId: "other" },
  { id: "p4" },
];

describe("planCompanyIntegrationMigration", () => {
  it("merges >=2 projects of one company on the same baseUrl and derives routing", () => {
    const plan = planCompanyIntegrationMigration(
      [
        jira("b-jira", "p2", { projectKey: "K", jql: "labels = b" }),
        jira("a-jira", "p1", { projectKey: "K" }),
      ],
      projects,
    );
    expect(plan.skipped).toEqual([]);
    const [g] = plan.groups;
    expect(g?.target).toMatchObject({ id: "co-jira", companyId: "co", enabled: true });
    expect(g?.target.config).toEqual({
      kind: "jira",
      baseUrl: "https://x.atlassian.net",
      email: "a@b.c",
    });
    expect(g?.credentialsFrom).toBe("a-jira");
    expect(g?.removeIds).toEqual(["a-jira", "b-jira"]);
    expect(g?.routing.map((r) => [r.projectId, r.rule.match])).toEqual([
      ["p1", { kind: "jira", projectKey: "K" }],
      ["p2", { kind: "jira", projectKey: "K", jql: "labels = b" }],
    ]);
  });

  it("never touches a lone integration, other baseUrls, other companies, github or company-owned", () => {
    const plan = planCompanyIntegrationMigration(
      [
        jira("a", "p1", { projectKey: "K" }),
        jira("b", "p2", { projectKey: "K", baseUrl: "https://y.atlassian.net" }),
        jira("c", "p3", { projectKey: "K" }),
        jira("d", "p4", { projectKey: "K" }),
        { ...jira("e", "p1"), projectId: undefined, companyId: "co" },
      ],
      projects,
    );
    expect(plan).toEqual({ groups: [], skipped: [] });
  });

  it("is idempotent: the post-apply state plans nothing", () => {
    const after = [{ ...jira("co-jira", "p1"), projectId: undefined, companyId: "co" }];
    expect(planCompanyIntegrationMigration(after, projects)).toEqual({ groups: [], skipped: [] });
  });

  it("skips with a reason when the target exists, logins differ or no rule can be derived", () => {
    const base = [jira("a", "p1", { projectKey: "K" }), jira("b", "p2", { projectKey: "K" })];
    const exists = planCompanyIntegrationMigration(
      [...base, { ...jira("co-jira", "p1"), projectId: undefined, companyId: "co" }],
      projects,
    );
    expect(exists.skipped[0]?.reason).toMatch(/already exists/);
    const emails = planCompanyIntegrationMigration(
      [jira("a", "p1", { projectKey: "K" }), jira("b", "p2", { projectKey: "K", email: "z@z.z" })],
      projects,
    );
    expect(emails.skipped[0]?.reason).toMatch(/logins/);
    const keyless = planCompanyIntegrationMigration(
      [jira("a", "p1", { projectKey: "K" }), jira("b", "p2")],
      projects,
    );
    expect(keyless.skipped[0]?.reason).toMatch(/neither/);
    expect(keyless.groups).toEqual([]);
    expect(formatPlan(keyless)).toContain("SKIP");
  });
});

describe("withRoutingRule", () => {
  it("replaces a rule for the same integration and keeps others", () => {
    const rules = withRoutingRule(
      [
        { integrationId: "x", match: { kind: "github" } },
        { integrationId: "co-jira", match: { kind: "jira", projectKey: "OLD" } },
      ],
      { integrationId: "co-jira", match: { kind: "jira", projectKey: "NEW" } },
    );
    expect(rules).toHaveLength(2);
    expect(rules[1]?.match).toEqual({ kind: "jira", projectKey: "NEW" });
  });
});

const gh = (
  id: string,
  projectId: string | undefined,
  repo: string | undefined,
  extra: {
    streams?: ("issues" | "pulls" | "ci")[];
    username?: string;
    includeTeams?: boolean;
  } = {},
): Integration => ({
  id,
  kind: "github",
  ...(projectId ? { projectId } : { companyId: "co" }),
  enabled: true,
  status: "disconnected",
  hasCredentials: true,
  config: {
    kind: "github",
    ...(repo ? { repo } : {}),
    streams: extra.streams ?? ["pulls"],
    username: extra.username ?? "me",
    ...(extra.includeTeams ? { includeTeams: true } : {}),
  },
});

const ghProjects = [
  { id: "web", companyId: "co", gitRemote: "git@github.com:co/web.git" },
  { id: "api", companyId: "co", gitRemote: "https://github.com/co/api" },
  { id: "solo", companyId: "other", gitRemote: "git@github.com:other/solo.git" },
];
const sameToken = new Map([
  ["web-gh", "ghp_secret"],
  ["api-gh", "ghp_secret"],
  ["solo-gh", "ghp_secret"],
]);

describe("planGithubCompanyMigration", () => {
  it("merges same token + username of one company into a repo-less company integration", () => {
    const plan = planGithubCompanyMigration(
      [
        gh("web-gh", "web", "co/web", { streams: ["issues", "pulls"] }),
        gh("api-gh", "api", "co/api", { streams: ["ci"], includeTeams: true }),
        gh("solo-gh", "solo", "other/solo"),
      ],
      ghProjects,
      sameToken,
    );
    expect(plan.skipped).toEqual([]);
    expect(plan.groups).toHaveLength(1);
    const [g] = plan.groups;
    expect(g?.target).toEqual({
      id: "co-github",
      kind: "github",
      companyId: "co",
      enabled: true,
      config: {
        kind: "github",
        streams: ["ci", "issues", "pulls"],
        username: "me",
        includeTeams: true,
      },
    });
    expect(g?.credentialsFrom).toBe("api-gh");
    expect(g?.removeIds).toEqual(["api-gh", "web-gh"]);
    expect(formatPlan({ groups: [], skipped: [] }, plan)).not.toContain("ghp_secret");
  });

  it("does not group different tokens or usernames", () => {
    const tokens = new Map([
      ["web-gh", "T1"],
      ["api-gh", "T2"],
    ]);
    const items = [gh("web-gh", "web", "co/web"), gh("api-gh", "api", "co/api")];
    expect(planGithubCompanyMigration(items, ghProjects, tokens).groups).toEqual([]);
    const users = [gh("web-gh", "web", "co/web"), gh("api-gh", "api", "co/api", { username: "x" })];
    expect(planGithubCompanyMigration(users, ghProjects, sameToken).groups).toEqual([]);
  });

  it("skips a group whose repo doesn't match a project's gitRemote, or was renamed on GitHub", () => {
    const items = [gh("web-gh", "web", "co/web"), gh("api-gh", "api", "co/legacy")];
    const mismatch = planGithubCompanyMigration(items, ghProjects, sameToken);
    expect(mismatch.groups).toEqual([]);
    expect(mismatch.skipped[0]?.reason).toContain("api: gitRemote co/api != repo co/legacy");

    const renamed = planGithubCompanyMigration(
      [gh("web-gh", "web", "co/web"), gh("api-gh", "api", "co/api")],
      ghProjects,
      sameToken,
      new Map([["api-gh", "co/api-v2"]]),
    );
    expect(renamed.groups).toEqual([]);
    expect(renamed.skipped[0]?.reason).toContain("renamed on GitHub to co/api-v2");
  });

  it("skips a company that already owns a github integration", () => {
    const plan = planGithubCompanyMigration(
      [
        gh("web-gh", "web", "co/web"),
        gh("api-gh", "api", "co/api"),
        gh("co-gh", undefined, undefined),
      ],
      ghProjects,
      sameToken,
    );
    expect(plan.groups).toEqual([]);
    expect(plan.skipped[0]?.reason).toContain("already has a company-owned github integration");
  });
});
