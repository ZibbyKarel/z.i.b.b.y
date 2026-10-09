import { describe, expect, it } from "vitest";
import { SELF_API_ALLOWLIST, buildSelfApiCatalog } from "./self-api.catalog";

describe("buildSelfApiCatalog", () => {
  const catalog = buildSelfApiCatalog();

  it("resolves every allowlisted entry to a real non-DELETE route", () => {
    const expected = Object.values(SELF_API_ALLOWLIST).reduce(
      (n, routes) => n + Object.keys(routes).length,
      0,
    );
    expect(catalog.size).toBe(expected);
    for (const op of catalog.values()) {
      expect(op.method).not.toBe("DELETE");
      expect(op.path.startsWith("/api/")).toBe(true);
    }
  });

  it("covers the operator's scope with the right tiers", () => {
    expect(catalog.get("integrations.updateIntegration")?.tier).toBe("write");
    expect(catalog.get("projects.listProjects")?.tier).toBe("read");
    expect(catalog.get("system.putConfig")?.tier).toBe("write");
    expect(catalog.get("machine.updateMachineConfig")?.tier).toBe("write");
    expect(catalog.get("automations.updateAutomation")?.tier).toBe("write");
    expect(catalog.get("teams.createTeam")?.tier).toBe("write");
    expect(catalog.get("projects.getProject")?.pathParams).toEqual(["id"]);
  });

  it("never exposes credentials, merges, triggers or the gate by route name", () => {
    for (const name of [
      "integrations.setCredentials",
      "projects.setProjectSecrets",
      "projects.updateProjectProfile",
      "projects.mergeProjectPr",
      "tasks.createTask",
      "automations.triggerAutomation",
      "taskRuns.stopTaskRun",
      "projects.deleteProject",
      "workflows.createWorkflow",
    ]) {
      expect(catalog.has(name)).toBe(false);
    }
    for (const op of catalog.values()) {
      expect(["gates", "gateRules", "mandate", "budget", "approvals"]).not.toContain(op.router);
    }
  });

  it("restricts body fields so a write route cannot reach the autonomy profile, gates or scheduler", () => {
    for (const route of ["updateProject", "createProject"]) {
      const keys = catalog.get(`projects.${route}`)?.allowKeys;
      expect(keys).toBeDefined();
      for (const bad of ["autonomy_policy", "budget", "checks", "env", "plugins", "prOpenMode"]) {
        expect(keys).not.toContain(bad);
      }
    }
    expect(catalog.get("projects.updateProject")?.allowKeys).not.toContain("gitRemote");
    expect(catalog.get("projects.updateProject")?.allowKeys).not.toContain("path");
    expect(catalog.get("system.putConfig")?.denyPaths).toEqual(
      expect.arrayContaining([
        "goalAutoResume",
        "limitResumeMax",
        "automationTickMs",
        "roadmapTickMs",
      ]),
    );
    expect(catalog.get("integrations.updateIntegration")?.denyPaths).toEqual(
      expect.arrayContaining(["config.baseUrl", "config.imapHost", "config.smtpHost"]),
    );
    expect(catalog.get("workflows.updateWorkflow")?.allowKeys).not.toContain("phases");
    expect(catalog.get("companies.updateCompany")?.allowKeys).not.toContain("budget");
    for (const route of ["createAutomation", "updateAutomation"]) {
      const op = catalog.get(`automations.${route}`);
      expect(op?.forceBody).toEqual({ approval: "ask" });
      expect(op?.denyPaths).not.toContain("approval");
      expect(op?.denyPaths).toContain("target.toolGrants");
    }
    for (const route of ["createProject", "updateProject"]) {
      expect(catalog.get(`projects.${route}`)?.denyPaths).toContain("identity.people.vip");
    }
    for (const route of ["createCompany", "updateCompany"]) {
      expect(catalog.get(`companies.${route}`)?.denyPaths).toContain("people.vip");
    }
    expect(catalog.get("projects.updateProject")?.allowKeys).not.toContain("companyId");
    expect(catalog.get("projects.createProject")?.allowKeys).toContain("companyId");
  });

  it("walks array elements when validating denyPaths and validates forceBody", () => {
    expect(() =>
      buildSelfApiCatalog(undefined, {
        companies: { updateCompany: { tier: "write", denyPaths: ["people.vipp"] } },
      }),
    ).toThrow(/denyPaths/);
    expect(() =>
      buildSelfApiCatalog(undefined, {
        automations: { updateAutomation: { tier: "write", forceBody: { aproval: "ask" } } },
      }),
    ).toThrow(/forceBody/);
    expect(() =>
      buildSelfApiCatalog(undefined, {
        automations: { updateAutomation: { tier: "write", forceBody: { approval: "nope" } } },
      }),
    ).toThrow(/forceBody/);
  });

  it("throws at build time on an allowKeys or denyPaths typo", () => {
    expect(() =>
      buildSelfApiCatalog(undefined, {
        teams: { updateTeam: { tier: "write", allowKeys: ["nme"] } },
      }),
    ).toThrow(/allowKeys/);
    expect(() =>
      buildSelfApiCatalog(undefined, {
        integrations: { updateIntegration: { tier: "write", denyPaths: ["config.baseUrll"] } },
      }),
    ).toThrow(/denyPaths/);
  });

  it("throws at build time when the allowlist names a denied route", () => {
    expect(() =>
      buildSelfApiCatalog(undefined, { projects: { updateProjectProfile: "write" } }),
    ).toThrow(/denied/);
    expect(() => buildSelfApiCatalog(undefined, { gateRules: { listGateRules: "read" } })).toThrow(
      /denied/,
    );
  });

  it("throws when an entry is a DELETE or does not exist", () => {
    expect(() => buildSelfApiCatalog(undefined, { teams: { deleteTeam: "write" } })).toThrow(
      /DELETE/,
    );
    expect(() => buildSelfApiCatalog(undefined, { teams: { nope: "read" } })).toThrow(/unknown/);
  });
});
