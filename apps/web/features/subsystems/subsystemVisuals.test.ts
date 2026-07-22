import { SUBSYSTEMS, SubsystemStateSchema } from "@zibby/contracts";
import { ORB_STATE } from "@zibby/design-system";
import { describe, expect, it } from "vitest";
import { SUBSYSTEM_GLYPH, SUBSYSTEM_ORB_STATE } from "./subsystemVisuals";

describe("subsystemVisuals", () => {
  it("gives every subsystem in the registry its own glyph", () => {
    for (const subsystem of SUBSYSTEMS) {
      expect(SUBSYSTEM_GLYPH[subsystem.id]).toBeTruthy();
    }
  });

  it("never reuses a glyph — each subsystem has to be tellable apart at a glance", () => {
    const glyphs = SUBSYSTEMS.map((subsystem) => SUBSYSTEM_GLYPH[subsystem.id]);
    expect(new Set(glyphs).size).toBe(SUBSYSTEMS.length);
  });

  it("maps every contract state onto a real DS orb state", () => {
    for (const state of SubsystemStateSchema.options) {
      const orbState = SUBSYSTEM_ORB_STATE[state];
      expect(ORB_STATE[orbState]).toBeDefined();
    }
  });

  it("keeps idle the only state whose chrome doesn't animate", () => {
    // The pill's dot glow and the map orb's halo pulse both read `live` off
    // this same table — if a state silently flips, the header and the map flip
    // together, which is the point of routing both through here.
    const live = SubsystemStateSchema.options.filter(
      (state) => ORB_STATE[SUBSYSTEM_ORB_STATE[state]].live,
    );
    expect(live).toEqual(["running", "report", "waiting", "error"]);
  });
});
