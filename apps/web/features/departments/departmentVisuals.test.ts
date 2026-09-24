import { DEPARTMENTS, DepartmentStateSchema } from "@zibby/contracts";
import { ORB_STATE } from "@zibby/design-system";
import { describe, expect, it } from "vitest";
import { DEPARTMENT_GLYPH, DEPARTMENT_ORB_STATE } from "./departmentVisuals";

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

  it("maps every contract state onto a real DS orb state", () => {
    for (const state of DepartmentStateSchema.options) {
      const orbState = DEPARTMENT_ORB_STATE[state];
      expect(ORB_STATE[orbState]).toBeDefined();
    }
  });

  it("keeps idle the only state whose chrome doesn't animate", () => {
    // The pill's dot glow and the map orb's halo pulse both read `live` off
    // this same table — if a state silently flips, the header and the map flip
    // together, which is the point of routing both through here.
    const live = DepartmentStateSchema.options.filter(
      (state) => ORB_STATE[DEPARTMENT_ORB_STATE[state]].live,
    );
    expect(live).toEqual(["running", "report", "waiting", "error"]);
  });
});
