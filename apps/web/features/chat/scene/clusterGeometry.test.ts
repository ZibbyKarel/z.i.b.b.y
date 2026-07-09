import { describe, expect, it } from "vitest";
import {
  REGISTRY_ORDER,
  SLOT_COUNT,
  hubForId,
  hubSlots,
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
});
