import { describe, expect, it } from "vitest";
import {
  MITOSIS_STAGGER,
  MITOSIS_TOTAL_DURATION,
  REGISTRY_ORDER,
  SLOT_COUNT,
  easeOutBack,
  easeOutCubic,
  hubForId,
  hubSlots,
  mitosisProgress,
  octagonSlots,
  slotForId,
} from "./clusterGeometry";

const NODE_RADIUS = 0.85;
const HUB_RADIUS = 0.7;

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("clusterGeometry", () => {
  describe("octagonSlots", () => {
    it("is deterministic — same input, same output, every call", () => {
      expect(octagonSlots(NODE_RADIUS)).toEqual(octagonSlots(NODE_RADIUS));
      expect(octagonSlots(NODE_RADIUS, 8)).toEqual(octagonSlots(NODE_RADIUS, 8));
    });

    it("returns exactly 8 slots by default, matching the registry size", () => {
      const slots = octagonSlots(NODE_RADIUS);
      expect(slots).toHaveLength(8);
      expect(SLOT_COUNT).toBe(8);
      expect(REGISTRY_ORDER).toHaveLength(8);
      expect(REGISTRY_ORDER[0]).toBe("forge");
    });

    it("forge (index 0) is at the BOTTOM — the minimum y, world +y-up convention", () => {
      const slots = octagonSlots(NODE_RADIUS);
      const minY = Math.min(...slots.map((s) => s.y));
      expect(slots[0]!.y).toBeCloseTo(minY, 5);
      expect(slots[0]!.y).toBeCloseTo(-NODE_RADIUS, 5);
      expect(slots[0]!.angle).toBe(90);
    });

    it("spaces slots evenly (45°) in the underlying angle parametrization", () => {
      const slots = octagonSlots(NODE_RADIUS);
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i]!.angle - slots[i - 1]!.angle).toBeCloseTo(45, 5);
      }
    });

    it("forms a REGULAR octagon — every slot sits the same radius from the cluster origin", () => {
      const slots = octagonSlots(NODE_RADIUS);
      for (const slot of slots) {
        expect(distance(slot, { x: 0, y: 0 })).toBeCloseTo(NODE_RADIUS, 5);
      }
    });

    it("supports an arbitrary count (defensive — real app always uses 8)", () => {
      expect(octagonSlots(1, 4)).toHaveLength(4);
      expect(octagonSlots(1, 4)[0]!.angle).toBe(90);
      expect(octagonSlots(1, 4)[1]!.angle).toBe(180);
    });
  });

  describe("hubSlots", () => {
    it("sits on a smaller regular octagon, at the SAME angles as the node ring", () => {
      const nodes = octagonSlots(NODE_RADIUS);
      const hubs = hubSlots(HUB_RADIUS);
      expect(hubs).toHaveLength(nodes.length);
      hubs.forEach((hub, i) => {
        expect(hub.angle).toBe(nodes[i]!.angle);
        expect(distance(hub, { x: 0, y: 0 })).toBeCloseTo(HUB_RADIUS, 5);
      });
    });

    it("the hub ring radius is smaller than the node ring radius (clears the orb, sits inside)", () => {
      expect(HUB_RADIUS).toBeLessThan(NODE_RADIUS);
    });

    it("a node, its hub vertex, and the cluster origin are colinear (the spoke is radial)", () => {
      for (const id of REGISTRY_ORDER) {
        const node = slotForId(id, NODE_RADIUS)!;
        const hub = hubForId(id, HUB_RADIUS)!;
        // Cross product of the two position vectors is ~0 for colinear points
        // through the origin.
        expect(node.x * hub.y - node.y * hub.x).toBeCloseTo(0, 5);
      }
    });
  });

  describe("slotForId / hubForId", () => {
    it("resolves every registry id to a slot matching its registry rank", () => {
      const nodes = octagonSlots(NODE_RADIUS);
      REGISTRY_ORDER.forEach((id, index) => {
        expect(slotForId(id, NODE_RADIUS)).toEqual(nodes[index]);
      });
    });

    it("returns undefined for an id outside the registry", () => {
      expect(slotForId("not-a-real-subsystem" as never, NODE_RADIUS)).toBeUndefined();
      expect(hubForId("not-a-real-subsystem" as never, HUB_RADIUS)).toBeUndefined();
    });
  });

  describe("mitosisProgress (phase 96 — entry animation)", () => {
    const COUNT = 8;

    it("is 0 before its own staggered start, for every non-zero index", () => {
      for (let index = 1; index < COUNT; index++) {
        expect(mitosisProgress(0, index, COUNT)).toBe(0);
      }
    });

    it("is 0 exactly at its staggered start", () => {
      for (let index = 0; index < COUNT; index++) {
        const start = index * MITOSIS_STAGGER;
        expect(mitosisProgress(start, index, COUNT)).toBe(0);
      }
    });

    it("is monotonic increasing (default easing) as elapsed advances", () => {
      for (let index = 0; index < COUNT; index++) {
        let prev = -Infinity;
        for (let t = 0; t <= MITOSIS_TOTAL_DURATION; t += MITOSIS_TOTAL_DURATION / 60) {
          const p = mitosisProgress(t, index, COUNT);
          expect(p).toBeGreaterThanOrEqual(prev);
          prev = p;
        }
      }
    });

    it("clamps to exactly 1 at and after its own end, and never exceeds 1 (default easing)", () => {
      for (let index = 0; index < COUNT; index++) {
        const perOrbDuration = MITOSIS_TOTAL_DURATION - (COUNT - 1) * MITOSIS_STAGGER;
        const end = index * MITOSIS_STAGGER + perOrbDuration;
        expect(mitosisProgress(end, index, COUNT)).toBeCloseTo(1, 6);
        expect(mitosisProgress(end + 5, index, COUNT)).toBe(1);
        expect(mitosisProgress(end + 5, index, COUNT)).toBeLessThanOrEqual(1);
      }
    });

    it("later indices start later (organic ripple, not a synchronized burst)", () => {
      const early = MITOSIS_STAGGER * 0.5;
      expect(mitosisProgress(early, 0, COUNT)).toBeGreaterThan(0);
      for (let index = 1; index < COUNT; index++) {
        expect(mitosisProgress(early, index, COUNT)).toBe(0);
      }
      // A snapshot further in: earlier indices are always at least as far along.
      const mid = MITOSIS_TOTAL_DURATION * 0.4;
      let prevP = Infinity;
      for (let index = 0; index < COUNT; index++) {
        const p = mitosisProgress(mid, index, COUNT);
        expect(p).toBeLessThanOrEqual(prevP);
        prevP = p;
      }
    });

    it("every index reaches 1 by the total duration", () => {
      for (let index = 0; index < COUNT; index++) {
        expect(mitosisProgress(MITOSIS_TOTAL_DURATION, index, COUNT)).toBe(1);
      }
    });

    it("respects custom totalDuration/stagger/easing options", () => {
      expect(mitosisProgress(2, 0, 4, { totalDuration: 2, stagger: 0 })).toBe(1);
      // index 3 of 4, stagger 0.5 → starts at 1.5, perOrbDuration = 2 - 3*0.5 = 0.5
      // → reaches 1 at elapsed = 2, matching the shared totalDuration exactly.
      expect(
        mitosisProgress(2, 3, 4, { totalDuration: 2, stagger: 0.5, easing: (t) => t }),
      ).toBe(1);
      // A custom linear easing (identity) mid-way through its own window.
      expect(
        mitosisProgress(1.75, 3, 4, { totalDuration: 2, stagger: 0.5, easing: (t) => t }),
      ).toBeCloseTo(0.5, 6);
    });

    it("easeOutCubic (the default) stays within [0, 1] for t in [0, 1]", () => {
      for (let t = 0; t <= 1; t += 0.02) {
        const eased = easeOutCubic(t);
        expect(eased).toBeGreaterThanOrEqual(0);
        expect(eased).toBeLessThanOrEqual(1);
      }
      expect(easeOutCubic(0)).toBe(0);
      expect(easeOutCubic(1)).toBe(1);
    });

    it("easeOutBack documents its overshoot bound — peaks around 1.10, returns to exactly 1", () => {
      expect(easeOutBack(0)).toBeCloseTo(0, 6);
      expect(easeOutBack(1)).toBe(1);
      let peak = 0;
      for (let t = 0; t <= 1; t += 0.01) peak = Math.max(peak, easeOutBack(t));
      expect(peak).toBeGreaterThan(1); // the overshoot is intentional (phase 96 "wobble")
      expect(peak).toBeLessThan(1.15); // ...but stays a SUBTLE touch, not a big bounce
    });

    it("mitosisProgress with easeOutBack still lands exactly on 1 at/after its own end", () => {
      const perOrbDuration = MITOSIS_TOTAL_DURATION - (COUNT - 1) * MITOSIS_STAGGER;
      for (let index = 0; index < COUNT; index++) {
        const end = index * MITOSIS_STAGGER + perOrbDuration;
        expect(mitosisProgress(end, index, COUNT, { easing: easeOutBack })).toBeCloseTo(1, 6);
      }
    });
  });
});
