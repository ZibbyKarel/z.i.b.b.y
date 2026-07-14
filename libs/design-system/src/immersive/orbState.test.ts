import { describe, expect, it } from "vitest";
import { ORB_MOTION, ORB_STATE, ORB_STATE_COLOR, type OrbState } from "./orbState";

const STATES: OrbState[] = ["idle", "working", "report", "await", "incident", "thinking"];

describe("orbState tables", () => {
  it("defines motion, color and live for every state", () => {
    for (const s of STATES) {
      expect(ORB_MOTION[s]).toBeDefined();
      expect(ORB_STATE_COLOR[s]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(ORB_STATE[s].color).toBe(ORB_STATE_COLOR[s]);
    }
  });

  it("marks idle as the only non-live state", () => {
    expect(ORB_STATE.idle.live).toBe(false);
    for (const s of STATES.filter((x) => x !== "idle")) {
      expect(ORB_STATE[s].live).toBe(true);
    }
  });

  it("keeps the prototype's idle motion values", () => {
    expect(ORB_MOTION.idle).toEqual({ amp: 0.05, speed: 0.18, glow: 0.5, breath: 1.0 });
  });
});
