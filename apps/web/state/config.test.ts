import { describe, expect, it } from "vitest";
import { sectionForPath } from "./config";

describe("sectionForPath", () => {
  it.each(["/policy/approvals", "/policy/gates", "/policy/patterns"])(
    "maps %s to policy",
    (path) => {
      expect(sectionForPath(path)).toBe("policy");
    },
  );

  it("keeps existing mappings", () => {
    expect(sectionForPath("/work/projects")).toBe("work");
    expect(sectionForPath("/unknown")).toBe("org");
  });
});
