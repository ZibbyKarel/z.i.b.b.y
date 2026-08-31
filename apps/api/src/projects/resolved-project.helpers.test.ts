import type { Integration, ProjectBudget, ProjectPerson } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  computeResolvedContext,
  mergeBudget,
  mergeIntegrationsByKind,
  mergePeople,
  resolveEffectiveCompanyId,
  resolveKnowledgeBase,
  samePerson,
} from "./resolved-project.helpers";

const person = (over: Partial<ProjectPerson> & { name: string }): ProjectPerson => ({
  role: "Stakeholder",
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

describe("samePerson", () => {
  it("matches by id when both sides have one, even with different names", () => {
    expect(
      samePerson(person({ id: "p1", name: "Alice" }), person({ id: "p1", name: "Alicia" })),
    ).toBe(true);
  });

  it("does not match different ids even with the same name", () => {
    expect(
      samePerson(person({ id: "p1", name: "Alice" }), person({ id: "p2", name: "Alice" })),
    ).toBe(false);
  });

  it("falls back to case-insensitive name match when either side lacks an id", () => {
    expect(samePerson(person({ id: "p1", name: "Alice" }), person({ name: "ALICE" }))).toBe(true);
    expect(samePerson(person({ name: "alice" }), person({ name: "Alice" }))).toBe(true);
  });

  it("name fallback does not match a different name", () => {
    expect(samePerson(person({ name: "Alice" }), person({ name: "Bob" }))).toBe(false);
  });
});

describe("mergePeople", () => {
  it("a project person with a matching id overrides the company person (field-level)", () => {
    const company = [person({ id: "alice", name: "Alice", role: "CEO", vip: true })];
    const project = [person({ id: "alice", name: "Alice", role: "Primary contact" })];
    const result = mergePeople(company, project);
    // role overridden by the project; vip (unset by the project) inherited from company.
    expect(result).toEqual([{ id: "alice", name: "Alice", role: "Primary contact", vip: true }]);
  });

  it("a project person with a new id is added alongside the company roster", () => {
    const company = [person({ id: "alice", name: "Alice", role: "CEO" })];
    const project = [person({ id: "bob", name: "Bob", role: "Engineer" })];
    const result = mergePeople(company, project);
    expect(result.map((p) => p.id)).toEqual(["alice", "bob"]);
  });

  it("company-only people (no project override) are included unchanged", () => {
    const company = [person({ id: "alice", name: "Alice", role: "CEO" })];
    const result = mergePeople(company, []);
    expect(result).toEqual(company);
  });

  it("matches by name when a side lacks an id (mid-backfill), field-merging the override", () => {
    const company = [person({ name: "Jan Novák", role: "Client", vip: true })]; // no id yet
    const project = [person({ id: "jan-novak", name: "Jan Novák", role: "Primary" })];
    const result = mergePeople(company, project);
    expect(result).toEqual([{ id: "jan-novak", name: "Jan Novák", role: "Primary", vip: true }]);
  });

  it("does not mutate its inputs", () => {
    const company = [person({ id: "alice", name: "Alice", role: "CEO" })];
    const project = [person({ id: "alice", name: "Alice", role: "Primary" })];
    mergePeople(company, project);
    expect(company[0]?.role).toBe("CEO");
  });
});

describe("mergeBudget", () => {
  const companyBudget: ProjectBudget = { dailyRuns: 10, weeklyRuns: 50, maxConcurrent: 2 };

  it("field-level merge: project fields win, unset fields inherit the company default", () => {
    const projectBudget: ProjectBudget = { dailyRuns: 3 };
    expect(mergeBudget(companyBudget, projectBudget)).toEqual({
      dailyRuns: 3,
      weeklyRuns: 50,
      maxConcurrent: 2,
    });
  });

  it("is not all-or-nothing: a project setting only one field still inherits the rest", () => {
    const projectBudget: ProjectBudget = { monthlyCostCapUsd: 100 };
    expect(mergeBudget(companyBudget, projectBudget)).toEqual({
      dailyRuns: 10,
      weeklyRuns: 50,
      maxConcurrent: 2,
      monthlyCostCapUsd: 100,
    });
  });

  it("no company budget: the project's own budget passes through unchanged", () => {
    const projectBudget: ProjectBudget = { dailyRuns: 3 };
    expect(mergeBudget(undefined, projectBudget)).toEqual(projectBudget);
  });

  it("no project budget: the company default passes through unchanged", () => {
    expect(mergeBudget(companyBudget, undefined)).toEqual(companyBudget);
  });

  it("neither set: undefined (no budget at all)", () => {
    expect(mergeBudget(undefined, undefined)).toBeUndefined();
  });
});

describe("mergeIntegrationsByKind", () => {
  it("same kind: the project's integration wins, the company's is dropped", () => {
    const company = [integration({ id: "co-slack", kind: "slack" })];
    const project = [integration({ id: "proj-slack", kind: "slack" })];
    expect(mergeIntegrationsByKind(company, project)).toEqual([project[0]]);
  });

  it("different kinds: union of both", () => {
    const company = [integration({ id: "co-jira", kind: "jira" })];
    const project = [integration({ id: "proj-slack", kind: "slack" })];
    const result = mergeIntegrationsByKind(company, project);
    expect(result.map((i) => i.id).sort()).toEqual(["co-jira", "proj-slack"]);
  });

  it("company-only integrations (project has none of that kind) are inherited whole", () => {
    const company = [integration({ id: "co-jira", kind: "jira" })];
    expect(mergeIntegrationsByKind(company, [])).toEqual(company);
  });

  it("project-only integrations (no company) pass through unchanged", () => {
    const project = [integration({ id: "proj-slack", kind: "slack" })];
    expect(mergeIntegrationsByKind([], project)).toEqual(project);
  });
});

describe("computeResolvedContext", () => {
  const project = {
    id: "alpha",
    name: "Alpha",
    path: "/work/alpha",
    identity: { people: [person({ id: "bob", name: "Bob", role: "Engineer" })] },
    budget: { dailyRuns: 3 } as ProjectBudget,
  };

  it("company null (no companyId / dangling): degrades to the project's own raw data (identity)", () => {
    const result = computeResolvedContext(
      project,
      null,
      [],
      [integration({ id: "proj-slack", kind: "slack" })],
    );
    expect(result.people).toEqual(project.identity.people);
    expect(result.budget).toEqual(project.budget);
    expect(result.integrations.map((i) => i.id)).toEqual(["proj-slack"]);
  });

  it("with a company: merges all three facets", () => {
    const company = {
      people: [person({ id: "alice", name: "Alice", role: "CEO", vip: true })],
      budget: { dailyRuns: 10, weeklyRuns: 50 } as ProjectBudget,
    };
    const result = computeResolvedContext(
      project,
      company,
      [integration({ id: "co-jira", kind: "jira" })],
      [integration({ id: "proj-slack", kind: "slack" })],
    );
    expect(result.people.map((p) => p.id).sort()).toEqual(["alice", "bob"]);
    expect(result.budget).toEqual({ dailyRuns: 3, weeklyRuns: 50 });
    expect(result.integrations.map((i) => i.id).sort()).toEqual(["co-jira", "proj-slack"]);
  });
});

const kb = { kind: "vault", path: "/tmp/kb", readOnly: true } as const;

describe("resolveKnowledgeBase", () => {
  it("returns null when the project has no team", () => {
    expect(resolveKnowledgeBase({ id: "p", name: "P" }, null)).toBeNull();
  });

  it("returns null when the team has no knowledge base", () => {
    expect(
      resolveKnowledgeBase({ id: "p", name: "P" }, { id: "devrel", name: "DevRel" }),
    ).toBeNull();
  });

  it("returns the team's knowledge base", () => {
    expect(
      resolveKnowledgeBase(
        { id: "p", name: "P" },
        { id: "devrel", name: "DevRel", knowledgeBase: kb },
      ),
    ).toEqual(kb);
  });
});

describe("resolveEffectiveCompanyId", () => {
  it("prefers an explicit project link over the team's company", () => {
    expect(
      resolveEffectiveCompanyId(
        { id: "p", name: "P", companyId: "acme" },
        {
          id: "devrel",
          name: "DevRel",
          companyId: "shoptet",
        },
      ),
    ).toBe("acme");
  });

  it("falls back to the team's company", () => {
    expect(
      resolveEffectiveCompanyId(
        { id: "p", name: "P" },
        {
          id: "devrel",
          name: "DevRel",
          companyId: "shoptet",
        },
      ),
    ).toBe("shoptet");
  });

  it("returns undefined when neither has one", () => {
    expect(resolveEffectiveCompanyId({ id: "p", name: "P" }, null)).toBeUndefined();
  });
});
