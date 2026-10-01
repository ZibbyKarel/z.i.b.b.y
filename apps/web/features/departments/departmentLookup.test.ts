import { DEPARTMENT_SEED } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { FALLBACK_DEPARTMENT_COLOR, departmentLookup } from "./departmentLookup";

describe("departmentLookup", () => {
  const lookup = departmentLookup(DEPARTMENT_SEED);

  it("resolves a known department from its data", () => {
    expect(lookup.name("dev")).toBe("Development");
    expect(lookup.code("dev")).toBe("DEV");
    expect(lookup.icon("dev")).toBe("code");
  });

  it("degrades an unknown id to a neutral fallback", () => {
    expect(lookup.name("zzz")).toBe("zzz");
    expect(lookup.code("zzz")).toBe("ZZZ");
    expect(lookup.color("zzz")).toBe(FALLBACK_DEPARTMENT_COLOR);
    expect(lookup.icon("zzz")).toBe("grid");
  });
});
