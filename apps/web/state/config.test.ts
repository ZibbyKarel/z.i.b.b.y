import { describe, expect, it } from "vitest";
import { sectionForPath } from "./config";

describe("sectionForPath", () => {
  it.each(["/policy/approvals", "/policy/gates", "/policy/patterns"])(
    "maps %s to policy",
    (path) => {
      expect(sectionForPath(path)).toBe("policy");
    },
  );

  it.each([
    ["/automations", "automations"],
    ["/automations/memory-distill", "automations"],
    ["/system/registries", "registries"],
    ["/system/registries/hooks/foo", "registries"],
    ["/system/settings/general", "system"],
    ["/system/settings/status", "system"],
  ])("maps %s to %s", (path, section) => {
    expect(sectionForPath(path)).toBe(section);
  });

  it("keeps existing mappings", () => {
    expect(sectionForPath("/work/projects")).toBe("work");
    expect(sectionForPath("/unknown")).toBe("org");
  });
});
