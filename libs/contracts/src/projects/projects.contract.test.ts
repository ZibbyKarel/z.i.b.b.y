import { describe, expect, it } from "vitest";
import {
  CreateProjectSchema,
  MergeProjectPrBodySchema,
  MergeProjectPrResultSchema,
  ProjectLocalStateSchema,
  ProjectPersonSchema,
  ProjectPrSchema,
  ProjectSchema,
  ResolvedProjectContextSchema,
  UpdateProjectSchema,
  projectsContract,
} from "../index";

describe("projectsContract", () => {
  it("lists projects under GET /api/projects", () => {
    expect(projectsContract.listProjects.method).toBe("GET");
    expect(projectsContract.listProjects.path).toBe("/api/projects");
  });

  it("creates a project via POST /api/projects with a 409 conflict status", () => {
    expect(projectsContract.createProject.method).toBe("POST");
    expect(projectsContract.createProject.path).toBe("/api/projects");
    expect(projectsContract.createProject.responses).toHaveProperty("201");
    expect(projectsContract.createProject.responses).toHaveProperty("409");
  });

  it("exposes a search route declared before the `:id` route", () => {
    expect(projectsContract.searchProjects.method).toBe("GET");
    expect(projectsContract.searchProjects.path).toBe("/api/projects/search");
    const keys = Object.keys(projectsContract);
    expect(keys.indexOf("searchProjects")).toBeLessThan(keys.indexOf("getProject"));
  });

  it("updates a project via PATCH /api/projects/:id (404)", () => {
    expect(projectsContract.updateProject.method).toBe("PATCH");
    expect(projectsContract.updateProject.path).toBe("/api/projects/:id");
    expect(projectsContract.updateProject.responses).toHaveProperty("404");
  });

  it("deletes a project via DELETE /api/projects/:id (404)", () => {
    expect(projectsContract.deleteProject.method).toBe("DELETE");
    expect(projectsContract.deleteProject.path).toBe("/api/projects/:id");
    expect(projectsContract.deleteProject.responses).toHaveProperty("404");
  });

  it("exposes the resolved (company-merged) context via GET /api/projects/:id/resolved (404) (Phase 72)", () => {
    expect(projectsContract.getResolvedProject.method).toBe("GET");
    expect(projectsContract.getResolvedProject.path).toBe("/api/projects/:id/resolved");
    expect(projectsContract.getResolvedProject.responses).toHaveProperty("200");
    expect(projectsContract.getResolvedProject.responses).toHaveProperty("404");
  });

  it("exposes THIS machine's local-clone state via GET /api/projects/:id/local-state (404) (Phase 76)", () => {
    expect(projectsContract.getProjectLocalState.method).toBe("GET");
    expect(projectsContract.getProjectLocalState.path).toBe("/api/projects/:id/local-state");
    expect(projectsContract.getProjectLocalState.responses).toHaveProperty("200");
    expect(projectsContract.getProjectLocalState.responses).toHaveProperty("404");
  });

  it("exposes clone via POST /api/projects/:id/clone with 404/409/422 (Phase 76)", () => {
    expect(projectsContract.cloneProject.method).toBe("POST");
    expect(projectsContract.cloneProject.path).toBe("/api/projects/:id/clone");
    expect(projectsContract.cloneProject.responses).toHaveProperty("200");
    expect(projectsContract.cloneProject.responses).toHaveProperty("404");
    expect(projectsContract.cloneProject.responses).toHaveProperty("409");
    expect(projectsContract.cloneProject.responses).toHaveProperty("422");
  });

  it("exposes the open-PR overview via GET /api/projects/:id/prs (200/404) (Phase 78)", () => {
    expect(projectsContract.getProjectPrs.method).toBe("GET");
    expect(projectsContract.getProjectPrs.path).toBe("/api/projects/:id/prs");
    expect(projectsContract.getProjectPrs.responses).toHaveProperty("200");
    expect(projectsContract.getProjectPrs.responses).toHaveProperty("404");
  });

  it("exposes merge via POST /api/projects/:id/prs/:number/merge with 404/409/422 (Phase 78)", () => {
    expect(projectsContract.mergeProjectPr.method).toBe("POST");
    expect(projectsContract.mergeProjectPr.path).toBe("/api/projects/:id/prs/:number/merge");
    expect(projectsContract.mergeProjectPr.responses).toHaveProperty("200");
    expect(projectsContract.mergeProjectPr.responses).toHaveProperty("404");
    expect(projectsContract.mergeProjectPr.responses).toHaveProperty("409");
    expect(projectsContract.mergeProjectPr.responses).toHaveProperty("422");
  });
});

describe("ProjectPrSchema (Phase 78)", () => {
  it("round-trips a full PR", () => {
    const pr = {
      number: 42,
      title: "Fix flaky test",
      url: "https://github.com/acme/app/pull/42",
      author: "alice",
      branch: "fix/flaky-test",
      draft: false,
      createdAt: "2026-07-01T09:00:00.000Z",
    };
    expect(ProjectPrSchema.parse(pr)).toEqual(pr);
  });

  it("accepts a PR with only the required fields", () => {
    const parsed = ProjectPrSchema.parse({
      number: 1,
      title: "WIP",
      url: "https://github.com/acme/app/pull/1",
      draft: true,
    });
    expect(parsed.author).toBeUndefined();
    expect(parsed.branch).toBeUndefined();
    expect(parsed.createdAt).toBeUndefined();
  });

  it("rejects a non-integer PR number", () => {
    expect(
      ProjectPrSchema.safeParse({
        number: 1.5,
        title: "x",
        url: "https://x",
        draft: false,
      }).success,
    ).toBe(false);
  });
});

describe("MergeProjectPrBodySchema / MergeProjectPrResultSchema (Phase 78)", () => {
  it("accepts an empty body (bare merge click)", () => {
    expect(MergeProjectPrBodySchema.parse({}).method).toBeUndefined();
  });

  it("accepts each merge method", () => {
    for (const method of ["merge", "squash", "rebase"] as const) {
      expect(MergeProjectPrBodySchema.parse({ method }).method).toBe(method);
    }
  });

  it("rejects an unknown merge method", () => {
    expect(MergeProjectPrBodySchema.safeParse({ method: "fast-forward" }).success).toBe(false);
  });

  it("round-trips a merge result with and without a url", () => {
    expect(MergeProjectPrResultSchema.parse({ merged: true, url: "https://x" })).toEqual({
      merged: true,
      url: "https://x",
    });
    expect(MergeProjectPrResultSchema.parse({ merged: false })).toEqual({ merged: false });
  });
});

describe("ProjectLocalStateSchema (Phase 76)", () => {
  it("round-trips a state present at the canonical path", () => {
    const state = {
      present: true,
      isGitRepo: true,
      resolvedPath: "/Users/op/Projects/alpha",
      source: "path" as const,
      cloneRoot: "/Users/op",
    };
    expect(ProjectLocalStateSchema.parse(state)).toEqual(state);
  });

  it("round-trips a state present at the cloneRoot fallback", () => {
    const state = {
      present: true,
      isGitRepo: true,
      resolvedPath: "/Users/op/alpha",
      source: "cloneRoot" as const,
      cloneRoot: "/Users/op",
    };
    expect(ProjectLocalStateSchema.parse(state)).toEqual(state);
  });

  it("round-trips an absent state (needs clone)", () => {
    const state = {
      present: false,
      isGitRepo: false,
      resolvedPath: null,
      source: "none" as const,
      cloneRoot: "/Users/op",
    };
    expect(ProjectLocalStateSchema.parse(state)).toEqual(state);
  });

  it("rejects an unknown source (closed vocabulary)", () => {
    expect(
      ProjectLocalStateSchema.safeParse({
        present: false,
        isGitRepo: false,
        resolvedPath: null,
        source: "elsewhere",
        cloneRoot: "/x",
      }).success,
    ).toBe(false);
  });
});

describe("Project.gitRemote (Phase 76)", () => {
  it("accepts a project with a gitRemote clone URL", () => {
    const parsed = ProjectSchema.parse({
      id: "alpha",
      name: "Alpha",
      path: "~/Projects/alpha",
      gitRemote: "git@github.com:acme/alpha.git",
    });
    expect(parsed.gitRemote).toBe("git@github.com:acme/alpha.git");
  });

  it("accepts a project without a gitRemote (existing projects keep working)", () => {
    const parsed = ProjectSchema.parse({ id: "alpha", name: "Alpha", path: "~/Projects/alpha" });
    expect(parsed.gitRemote).toBeUndefined();
  });

  it("rejects an empty-string gitRemote", () => {
    expect(
      ProjectSchema.safeParse({ id: "alpha", name: "Alpha", path: "~/x", gitRemote: "" }).success,
    ).toBe(false);
  });

  it("flows through CreateProjectSchema and UpdateProjectSchema", () => {
    expect(
      CreateProjectSchema.safeParse({
        id: "alpha",
        name: "Alpha",
        path: "~/x",
        gitRemote: "https://github.com/acme/alpha.git",
      }).success,
    ).toBe(true);
    expect(
      UpdateProjectSchema.safeParse({ gitRemote: "https://github.com/acme/alpha.git" }).success,
    ).toBe(true);
  });
});

describe("ResolvedProjectContextSchema (Phase 72)", () => {
  it("round-trips a company-less project's own data (no companyId/companyName)", () => {
    const parsed = ResolvedProjectContextSchema.parse({
      people: [{ name: "Jane Doe", role: "CTO" }],
      budget: { dailyRuns: 3 },
      integrations: [],
    });
    expect(parsed.companyId).toBeUndefined();
    expect(parsed.companyName).toBeUndefined();
    expect(parsed.people).toEqual([{ name: "Jane Doe", role: "CTO" }]);
  });

  it("round-trips a company-merged context with companyId/companyName", () => {
    const parsed = ResolvedProjectContextSchema.parse({
      people: [{ id: "alice", name: "Alice", role: "CEO" }],
      budget: { dailyRuns: 3, weeklyRuns: 50 },
      integrations: [],
      companyId: "acme",
      companyName: "Acme Corp",
    });
    expect(parsed.companyId).toBe("acme");
    expect(parsed.companyName).toBe("Acme Corp");
  });

  it("accepts an absent budget (no budget anywhere, company or project)", () => {
    expect(
      ResolvedProjectContextSchema.safeParse({ people: [], integrations: [] }).success,
    ).toBe(true);
  });
});

describe("UpdateProjectSchema companyId (Phase 72 clear semantics)", () => {
  it("accepts a companyId string (link)", () => {
    const parsed = UpdateProjectSchema.parse({ companyId: "acme" });
    expect(parsed.companyId).toBe("acme");
  });

  it("accepts a null companyId (explicit unlink, distinct from absent/undefined)", () => {
    const parsed = UpdateProjectSchema.parse({ companyId: null });
    expect(parsed.companyId).toBeNull();
  });

  it("accepts a patch with no companyId key at all (leave the link alone)", () => {
    const parsed = UpdateProjectSchema.parse({ desc: "moved" });
    expect(parsed.companyId).toBeUndefined();
  });
});

describe("project schema", () => {
  it("accepts a project with id, name and path", () => {
    expect(
      ProjectSchema.safeParse({
        id: "media-vault",
        name: "media-vault",
        path: "~/Projects/media-vault",
        category: "Média & domácnost",
      }).success,
    ).toBe(true);
  });

  it("requires a non-empty path when present", () => {
    expect(ProjectSchema.safeParse({ id: "x", name: "x", path: "" }).success).toBe(false);
  });

  it("accepts a project with no path at all (Phase 98 — machine-local, derived from cloneRoot)", () => {
    const parsed = ProjectSchema.parse({ id: "x", name: "x" });
    expect(parsed.path).toBeUndefined();
  });

  it("rejects an id with a path separator (defense in depth)", () => {
    expect(ProjectSchema.safeParse({ id: "a/b", name: "x", path: "~/x" }).success).toBe(false);
  });

  it("accepts a per-engagement budget (Phase 8.1)", () => {
    expect(
      ProjectSchema.safeParse({
        id: "alpha",
        name: "Alpha",
        path: "~/Projects/alpha",
        budget: { dailyRuns: 2, weeklyRuns: 10, maxConcurrent: 1 },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown budget knob (strict)", () => {
    expect(
      ProjectSchema.safeParse({
        id: "alpha",
        name: "Alpha",
        path: "~/x",
        budget: { dailyTokens: 1000 },
      }).success,
    ).toBe(false);
  });

  it("accepts a per-engagement dollar cap alongside run caps (Phase 12)", () => {
    expect(
      ProjectSchema.safeParse({
        id: "alpha",
        name: "Alpha",
        path: "~/Projects/alpha",
        budget: { dailyRuns: 2, dailyCostCapUsd: 5, weeklyCostCapUsd: 20, monthlyCostCapUsd: 80 },
      }).success,
    ).toBe(true);
  });

  it("accepts a project without a companyId — standalone projects are unaffected (Phase 68)", () => {
    const parsed = ProjectSchema.parse({ id: "alpha", name: "Alpha", path: "~/Projects/alpha" });
    expect(parsed.companyId).toBeUndefined();
  });

  it("accepts a project with a companyId (Phase 68 project <-> company link)", () => {
    const parsed = ProjectSchema.parse({
      id: "alpha",
      name: "Alpha",
      path: "~/Projects/alpha",
      companyId: "acme",
    });
    expect(parsed.companyId).toBe("acme");
  });
});

describe("ProjectPersonSchema (Phase 68 id migration)", () => {
  it("accepts a person without an id (existing on-disk shape keeps validating)", () => {
    const parsed = ProjectPersonSchema.parse({ name: "Jane Doe", role: "CTO" });
    expect(parsed.id).toBeUndefined();
  });

  it("accepts a person with an id (post-backfill shape)", () => {
    const parsed = ProjectPersonSchema.parse({ id: "jane-doe", name: "Jane Doe", role: "CTO" });
    expect(parsed.id).toBe("jane-doe");
  });

  it("rejects an empty-string id", () => {
    expect(
      ProjectPersonSchema.safeParse({ id: "", name: "Jane Doe", role: "CTO" }).success,
    ).toBe(false);
  });
});
