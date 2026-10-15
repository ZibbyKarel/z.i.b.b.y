import type { Company, Integration, Project, Team } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { CompanyNotFoundError } from "../companies/companies.errors";
import { ProjectNotFoundError } from "./projects.errors";
import { TeamNotFoundError } from "../teams/teams.errors";
import { ResolvedProjectService } from "./resolved-project.service";

const project = (over: Partial<Project> & Pick<Project, "id">): Project => ({
  name: over.id,
  path: `/work/${over.id}`,
  ...over,
});

const team = (over: Partial<Team> & Pick<Team, "id">): Team => ({
  name: over.id,
  ...over,
});

const integration = (
  over: Partial<Integration> & Pick<Integration, "id" | "kind">,
): Integration => ({
  name: over.id,
  enabled: true,
  status: "disconnected",
  hasCredentials: false,
  config: { kind: "slack", channels: [] },
  ...over,
});

function build(
  opts: {
    companies?: Company[];
    integrations?: Integration[];
    teams?: Team[];
    projects?: Project[];
  } = {},
) {
  const companies = opts.companies ?? [];
  const integrations = opts.integrations ?? [];
  const teams = opts.teams ?? [];
  const projects = opts.projects ?? [];
  const companiesStore = {
    get: async (id: string) => {
      const found = companies.find((c) => c.id === id);
      if (!found) throw new CompanyNotFoundError(id);
      return found;
    },
  };
  const integrationsStore = { list: async () => integrations };
  // Real `TeamsStorageService.get`/`ProjectsStorageService.get` tolerance
  // (throw a NotFound error for an unknown id) — needed so `findTeam`'s
  // `.catch(() => null)` and `knowledgeBaseFor`'s equivalent are exercised
  // against the same shape the real stores throw, not a generic Error.
  const teamsStore = {
    get: async (id: string) => {
      const found = teams.find((t) => t.id === id);
      if (!found) throw new TeamNotFoundError(id);
      return found;
    },
  };
  const projectsStore = {
    list: async () => projects,
    get: async (id: string) => {
      const found = projects.find((p) => p.id === id);
      if (!found) throw new ProjectNotFoundError(id);
      return found;
    },
  };
  return new ResolvedProjectService(
    companiesStore as never,
    integrationsStore as never,
    teamsStore as never,
    projectsStore as never,
  );
}

describe("ResolvedProjectService", () => {
  it("no companyId: returns the project's own raw data (identity)", async () => {
    const service = build();
    const alpha = project({
      id: "alpha",
      identity: { people: [{ id: "bob", name: "Bob", role: "Engineer" }] },
      budget: { dailyRuns: 3 },
    });
    expect(await service.resolvePeople(alpha)).toEqual(alpha.identity?.people);
    expect(await service.resolveBudget(alpha)).toEqual(alpha.budget);
  });

  it("dangling companyId (company deleted): falls back to the project's own raw data, does not throw", async () => {
    const service = build({ companies: [] }); // no "ghost" company exists
    const alpha = project({
      id: "alpha",
      companyId: "ghost",
      identity: { people: [{ id: "bob", name: "Bob", role: "Engineer" }] },
      budget: { dailyRuns: 3 },
    });
    await expect(service.resolvePeople(alpha)).resolves.toEqual(alpha.identity?.people);
    await expect(service.resolveBudget(alpha)).resolves.toEqual(alpha.budget);
    await expect(service.resolveIntegrations(alpha)).resolves.toEqual([]);
    await expect(service.resolve(alpha)).resolves.toEqual({
      people: alpha.identity?.people,
      budget: alpha.budget,
      integrations: [],
    });
  });

  it("a resolving companyId merges the company's roster/budget/integrations with the project's own", async () => {
    const acme: Company = {
      id: "acme",
      name: "Acme Corp",
      people: [{ id: "alice", name: "Alice", role: "CEO", vip: true }],
      budget: { dailyRuns: 10, weeklyRuns: 50 },
    };
    const service = build({
      companies: [acme],
      integrations: [
        integration({ id: "co-jira", kind: "jira", companyId: "acme" }),
        integration({ id: "proj-slack", kind: "slack", projectId: "alpha" }),
        integration({ id: "unrelated-slack", kind: "slack", projectId: "other" }),
      ],
    });
    const alpha = project({
      id: "alpha",
      companyId: "acme",
      identity: { people: [{ id: "bob", name: "Bob", role: "Engineer" }] },
      budget: { dailyRuns: 3 },
    });

    expect((await service.resolvePeople(alpha)).map((p) => p.id).sort()).toEqual(["alice", "bob"]);
    expect(await service.resolveBudget(alpha)).toEqual({ dailyRuns: 3, weeklyRuns: 50 });
    expect((await service.resolveIntegrations(alpha)).map((i) => i.id).sort()).toEqual([
      "co-jira",
      "proj-slack",
    ]);
  });

  it("resolve() returns all three facets from a single pass", async () => {
    const acme: Company = { id: "acme", name: "Acme Corp", budget: { dailyRuns: 10 } };
    const service = build({ companies: [acme] });
    const alpha = project({ id: "alpha", companyId: "acme" });
    expect(await service.resolve(alpha)).toEqual({
      people: [],
      budget: { dailyRuns: 10 },
      integrations: [],
    });
  });

  describe("resolveCompanyRef (Phase 72)", () => {
    it("returns undefined for a company-less project", async () => {
      const service = build();
      const alpha = project({ id: "alpha" });
      expect(await service.resolveCompanyRef(alpha)).toBeUndefined();
    });

    it("returns undefined for a dangling companyId (company deleted)", async () => {
      const service = build({ companies: [] });
      const alpha = project({ id: "alpha", companyId: "ghost" });
      expect(await service.resolveCompanyRef(alpha)).toBeUndefined();
    });

    it("returns the linked company's id/name when it resolves", async () => {
      const acme: Company = { id: "acme", name: "Acme Corp" };
      const service = build({ companies: [acme] });
      const alpha = project({ id: "alpha", companyId: "acme" });
      expect(await service.resolveCompanyRef(alpha)).toEqual({ id: "acme", name: "Acme Corp" });
    });
  });

  describe("team resolution chain (Phase 3, team knowledge base)", () => {
    const kb = { kind: "vault", path: "/tmp/kb", readOnly: true } as const;

    it("knowledgeBaseFor returns the linked team's knowledge base", async () => {
      const devrel = team({ id: "devrel", knowledgeBase: kb });
      const alpha = project({ id: "alpha", teamId: "devrel" });
      const service = build({ teams: [devrel], projects: [alpha] });
      await expect(service.knowledgeBaseFor("alpha")).resolves.toEqual(kb);
    });

    it("dangling teamId (team deleted): knowledgeBaseFor resolves to null, does not throw", async () => {
      const alpha = project({ id: "alpha", teamId: "ghost" });
      const service = build({ teams: [], projects: [alpha] }); // no "ghost" team exists
      await expect(service.knowledgeBaseFor("alpha")).resolves.toBeNull();
    });

    it("no teamId: knowledgeBaseFor returns null and existing resolve* stay unchanged", async () => {
      const alpha = project({ id: "alpha", budget: { dailyRuns: 3 } });
      const service = build({ projects: [alpha] });
      await expect(service.knowledgeBaseFor("alpha")).resolves.toBeNull();
      expect(await service.resolveBudget(alpha)).toEqual(alpha.budget);
    });

    it("no companyId on the project but the team has one: the team-inherited company reaches resolveBudget", async () => {
      const acme: Company = {
        id: "acme",
        name: "Acme Corp",
        budget: { dailyRuns: 10, weeklyRuns: 50 },
      };
      const devrel = team({ id: "devrel", companyId: "acme" });
      const alpha = project({ id: "alpha", teamId: "devrel", budget: { dailyRuns: 3 } });
      const service = build({ companies: [acme], teams: [devrel] });
      expect(await service.resolveBudget(alpha)).toEqual({ dailyRuns: 3, weeklyRuns: 50 });
    });

    it("an explicit project companyId stays authoritative over the team's company", async () => {
      const acme: Company = { id: "acme", name: "Acme Corp", budget: { dailyRuns: 10 } };
      const shoptet: Company = { id: "shoptet", name: "Shoptet", budget: { dailyRuns: 99 } };
      const devrel = team({ id: "devrel", companyId: "shoptet" });
      const alpha = project({ id: "alpha", companyId: "acme", teamId: "devrel" });
      const service = build({ companies: [acme, shoptet], teams: [devrel] });
      expect(await service.resolveBudget(alpha)).toEqual({ dailyRuns: 10 });
    });
  });

  describe("Phase 128 — company-owned integration fan-out", () => {
    const companyJira = integration({
      id: "co-jira",
      kind: "jira",
      companyId: "co",
      config: { kind: "jira", baseUrl: "https://co.atlassian.net", email: "me@co" },
    });

    it("inheritingProjects: the company's projects (direct or via team), minus a same-kind override", async () => {
      const service = build({
        companies: [{ id: "co", name: "Co" }],
        teams: [team({ id: "t", companyId: "co" })],
        integrations: [
          companyJira,
          integration({
            id: "own-jira",
            kind: "jira",
            projectId: "overrides",
            config: { kind: "jira", baseUrl: "https://own.atlassian.net", email: "me@own" },
          }),
          integration({ id: "own-slack", kind: "slack", projectId: "direct" }),
        ],
        projects: [
          project({ id: "direct", companyId: "co" }),
          project({ id: "via-team", teamId: "t" }),
          project({ id: "overrides", companyId: "co" }),
          project({ id: "elsewhere", companyId: "other" }),
        ],
      });

      const ids = (await service.inheritingProjects(companyJira)).map((p) => p.id);

      expect(ids).toEqual(["direct", "via-team"]);
    });

    it("integrationCompany: the owner company, or the owning project's effective company", async () => {
      const co: Company = { id: "co", name: "Co" };
      const service = build({
        companies: [co],
        projects: [project({ id: "p", companyId: "co" })],
      });
      const own = integration({ id: "own", kind: "jira", projectId: "p" });

      expect(await service.integrationCompany(companyJira)).toEqual(co);
      expect(await service.integrationCompany(own)).toEqual(co);
      expect(await service.inheritingProjects(own)).toEqual([]);
    });
  });
});
