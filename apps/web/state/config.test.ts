import { describe, expect, it } from "vitest";
import { sectionForPath } from "./config";

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
    ["/workforce/positions", "workforce"],
    ["/workforce/departments/dev/team", "workforce"],
    ["/activity/channels", "activity"],
    ["/governance/approvals", "governance"],
    ["/governance/spend", "governance"],
    ["/system/registries", "system"],
    ["/system/registries/hooks/foo", "system"],
    ["/system/settings/general", "system"],
  ])("maps %s to %s", (path, section) => {
    expect(sectionForPath(path)).toBe(section);
  });

  it("falls back to dashboard and does not match partial segments", () => {
    expect(sectionForPath("/unknown")).toBe("dashboard");
    expect(sectionForPath("/teamsfoo")).toBe("dashboard");
  });
});
