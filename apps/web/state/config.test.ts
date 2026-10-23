import { describe, expect, it } from "vitest";
import { SECTIONS, sectionForPath } from "./config";

describe("sectionForPath", () => {
  it.each([
    ["/dashboard", "dashboard"],
    ["/dashboard/inbox/issues/p/i", "dashboard"],
    ["/dashboard/briefings", "dashboard"],
    ["/work/automations", "work"],
    ["/work/automations/memory-distill", "work"],
    ["/companies", "companies"],
    ["/teams/x", "companies"],
    ["/projects/x/roadmap", "companies"],
    ["/workforce/agents/e1", "workforce"],
    ["/workforce/departments/dev/team", "workforce"],
    ["/activity/channels", "activity"],
    ["/governance/approvals", "governance"],
    ["/governance/spend", "governance"],
    ["/system/registries", "workforce"],
    ["/system/registries/hooks/foo", "workforce"],
    ["/system/registries/skills/s1", "workforce"],
    ["/system/settings/general", "system"],
  ])("maps %s to %s", (path, section) => {
    expect(sectionForPath(path)).toBe(section);
  });

  it("falls back to dashboard and does not match partial segments", () => {
    expect(sectionForPath("/unknown")).toBe("dashboard");
    expect(sectionForPath("/teamsfoo")).toBe("dashboard");
  });
});

describe("SECTIONS sub-menus", () => {
  it("groups AI and Settings sub-menus", () => {
    const ids = (id: string) => SECTIONS.find((s) => s.id === id)?.tabs.map((t) => t.id);
    expect(ids("workforce")).toEqual(["agents", "skills", "commands", "mcp", "hooks"]);
    expect(ids("system")).toEqual(["general", "runtime", "activity", "status"]);
    expect(SECTIONS.find((s) => s.id === "system")?.href).toBe("/system/settings/general");
  });
});
