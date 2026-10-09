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

  it("never exposes credentials, the autonomy profile, merges, triggers or the gate", () => {
    for (const name of [
      "integrations.setCredentials",
      "projects.setProjectSecrets",
      "projects.updateProjectProfile",
      "projects.mergeProjectPr",
      "tasks.createTask",
      "automations.triggerAutomation",
      "taskRuns.stopTaskRun",
      "projects.deleteProject",
    ]) {
      expect(catalog.has(name)).toBe(false);
    }
    for (const op of catalog.values()) {
      expect(["gates", "gateRules", "mandate", "budget", "approvals"]).not.toContain(op.router);
    }
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
