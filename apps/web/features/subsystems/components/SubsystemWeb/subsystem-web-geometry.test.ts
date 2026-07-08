import { SUBSYSTEMS, type SubsystemWithStatus } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  NODE_RADIUS,
  ORB_RADIUS,
  REGISTRY_ORDER,
  SLOT_COUNT,
  WEB_CENTER,
  WEB_RX,
  WEB_RY,
  WEB_RY_RATIO,
  computeSlots,
  layoutSubsystems,
  pathBetween,
  pathFor,
  rimEdges,
  rimPath,
  slotForId,
  spokePath,
} from "./subsystem-web-geometry";

function fixture(overrides: Partial<SubsystemWithStatus> = {}): SubsystemWithStatus {
  const base = SUBSYSTEMS[0]!;
  return {
    id: base.id,
    name: base.name,
    tagline: base.tagline,
    mandate: base.mandate,
    color: base.color,
    heroImage: null,
    state: "klid",
    tier2Count: 0,
    tier3Count: 0,
    ...overrides,
  };
}

describe("subsystem-web-geometry", () => {
  describe("computeSlots", () => {
    it("is deterministic — same input, same output, every call", () => {
      expect(computeSlots()).toEqual(computeSlots());
      expect(computeSlots(8)).toEqual(computeSlots(8));
    });

    it("returns exactly 8 slots by default, matching the registry size", () => {
      const slots = computeSlots();
      expect(slots).toHaveLength(8);
      expect(SLOT_COUNT).toBe(8);
      expect(REGISTRY_ORDER).toHaveLength(8);
    });

    it("spaces slots evenly (45°) starting at the top, clockwise", () => {
      const slots = computeSlots();
      expect(slots[0]!.angle).toBe(-90);
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i]!.angle - slots[i - 1]!.angle).toBeCloseTo(45, 5);
      }
    });

    it("flattens the ellipse: ry ≈ 0.35 × rx", () => {
      expect(WEB_RY).toBeCloseTo(WEB_RX * 0.35, 6);
      expect(WEB_RY_RATIO).toBe(0.35);

      // The leftmost/rightmost slot (angle 0/180) sits at the full horizontal radius
      // from center; the top/bottom slot (angle -90/90) sits at the flattened vertical
      // radius — never the full rx.
      const slots = computeSlots();
      const rightmost = slots.find((s) => s.angle === 0)!;
      const top = slots.find((s) => s.angle === -90)!;
      expect(Math.abs(rightmost.x - WEB_CENTER.x)).toBeCloseTo(WEB_RX, 1);
      expect(Math.abs(top.y - WEB_CENTER.y)).toBeCloseTo(WEB_RY, 1);
      expect(Math.abs(top.y - WEB_CENTER.y)).toBeLessThan(Math.abs(rightmost.x - WEB_CENTER.x));
    });

    it("supports an arbitrary count (defensive — real app always uses 8)", () => {
      expect(computeSlots(4)).toHaveLength(4);
      expect(computeSlots(4)[0]!.angle).toBe(-90);
      expect(computeSlots(4)[1]!.angle).toBe(0);
    });
  });

  describe("orb sizing", () => {
    it("orb radius is 2× node radius (diameter ≈ 2× a node's)", () => {
      expect(ORB_RADIUS).toBe(NODE_RADIUS * 2);
    });
  });

  describe("slotForId", () => {
    it("resolves every registry id to a slot matching its registry rank", () => {
      REGISTRY_ORDER.forEach((id, index) => {
        expect(slotForId(id)).toEqual(computeSlots()[index]);
      });
    });

    it("returns undefined for an id outside the registry", () => {
      expect(slotForId("not-a-real-subsystem" as never)).toBeUndefined();
    });
  });

  describe("layoutSubsystems", () => {
    it("positions are FIXED — independent of input array order", () => {
      const all = SUBSYSTEMS.map((s) => fixture({ id: s.id, name: s.name, color: s.color }));
      const shuffled = [...all].reverse();

      const forward = layoutSubsystems(all);
      const reversed = layoutSubsystems(shuffled);

      // Same subsystem lands at the same (x, y) regardless of input order.
      const byIdForward = new Map(forward.map((p) => [p.id, { x: p.x, y: p.y }]));
      const byIdReversed = new Map(reversed.map((p) => [p.id, { x: p.x, y: p.y }]));
      for (const id of REGISTRY_ORDER) {
        expect(byIdReversed.get(id)).toEqual(byIdForward.get(id));
      }
    });

    it("returns entries in registry order, not input order", () => {
      const shuffled = [...SUBSYSTEMS].reverse().map((s) => fixture({ id: s.id }));
      const positioned = layoutSubsystems(shuffled);
      expect(positioned.map((p) => p.id)).toEqual(REGISTRY_ORDER);
    });

    it("a missing subsystem simply has no entry — doesn't shift the rest", () => {
      const withoutOne = SUBSYSTEMS.filter((s) => s.id !== "sentinel").map((s) =>
        fixture({ id: s.id }),
      );
      const positioned = layoutSubsystems(withoutOne);
      expect(positioned.some((p) => p.id === "sentinel")).toBe(false);
      const forge = positioned.find((p) => p.id === "forge")!;
      expect(forge).toEqual({ ...withoutOne.find((s) => s.id === "forge")!, ...slotForId("forge")! });
    });

    it("drops ids outside the registry", () => {
      const positioned = layoutSubsystems([fixture({ id: "ghost" as never })]);
      expect(positioned).toHaveLength(0);
    });
  });

  describe("rimEdges", () => {
    it("connects every consecutive registry neighbor, wrapping last→first", () => {
      const edges = rimEdges();
      expect(edges).toHaveLength(REGISTRY_ORDER.length);
      REGISTRY_ORDER.forEach((id, i) => {
        expect(edges[i]).toEqual([id, REGISTRY_ORDER[(i + 1) % REGISTRY_ORDER.length]]);
      });
    });
  });

  describe("path helpers", () => {
    it("pathBetween renders a straight-line M/L path", () => {
      expect(pathBetween({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe("M 1 2 L 3 4");
    });

    it("spokePath always starts at the web center", () => {
      const slot = slotForId("forge")!;
      expect(spokePath(slot)).toBe(pathBetween(WEB_CENTER, slot));
      expect(spokePath(slot).startsWith(`M ${WEB_CENTER.x} ${WEB_CENTER.y}`)).toBe(true);
    });

    it("rimPath connects two given points directly", () => {
      const a = slotForId("forge")!;
      const b = slotForId("puls")!;
      expect(rimPath(a, b)).toBe(pathBetween(a, b));
    });

    it("pathFor resolves 'orb' to the center and ids to their fixed slots", () => {
      expect(pathFor("orb", "forge")).toBe(pathBetween(WEB_CENTER, slotForId("forge")!));
      expect(pathFor("forge", "puls")).toBe(pathBetween(slotForId("forge")!, slotForId("puls")!));
      expect(pathFor("orb", "orb")).toBe(pathBetween(WEB_CENTER, WEB_CENTER));
    });

    it("pathFor fails soft on an unknown id", () => {
      expect(pathFor("orb", "ghost" as never)).toBeUndefined();
      expect(pathFor("ghost" as never, "orb")).toBeUndefined();
    });
  });
});
