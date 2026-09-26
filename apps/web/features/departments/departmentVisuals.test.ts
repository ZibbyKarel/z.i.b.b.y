import { DEPARTMENTS } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { DEPARTMENT_GLYPH } from "./departmentVisuals";

describe("departmentVisuals", () => {
  it("gives every department in the registry its own glyph", () => {
    for (const department of DEPARTMENTS) {
      expect(DEPARTMENT_GLYPH[department.id]).toBeTruthy();
    }
  });

  it("never reuses a glyph — each department has to be tellable apart at a glance", () => {
    const glyphs = DEPARTMENTS.map((department) => DEPARTMENT_GLYPH[department.id]);
    expect(new Set(glyphs).size).toBe(DEPARTMENTS.length);
  });
});
