import { describe, expect, it } from "vitest";
import { ProjectPersonSchema, ProjectSchema, projectsContract } from "../index";

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

  it("requires a non-empty path", () => {
    expect(ProjectSchema.safeParse({ id: "x", name: "x", path: "" }).success).toBe(false);
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
