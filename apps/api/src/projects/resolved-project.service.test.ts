import type { Company, Integration, Project } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { CompanyNotFoundError } from "../companies/companies.errors";
import { ResolvedProjectService } from "./resolved-project.service";

const project = (over: Partial<Project> & Pick<Project, "id">): Project => ({
  name: over.id,
  path: `/work/${over.id}`,
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

function build(opts: { companies?: Company[]; integrations?: Integration[] } = {}) {
  const companies = opts.companies ?? [];
  const integrations = opts.integrations ?? [];
  const companiesStore = {
    get: async (id: string) => {
      const found = companies.find((c) => c.id === id);
      if (!found) throw new CompanyNotFoundError(id);
      return found;
    },
  };
  const integrationsStore = { list: async () => integrations };
  return new ResolvedProjectService(companiesStore as never, integrationsStore as never);
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
});
