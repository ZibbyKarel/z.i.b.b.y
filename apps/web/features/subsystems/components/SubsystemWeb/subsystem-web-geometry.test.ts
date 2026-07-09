import { SUBSYSTEMS, type SubsystemWithStatus } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  HUB_RADIUS,
  NODE_RADIUS,
  ORB_RADIUS,
  REGISTRY_ORDER,
  SLOT_COUNT,
  WEB_CENTER,
  WEB_RADIUS,
  computeHubVertices,
  computeSlots,
  hubEdges,
  hubVertexForId,
  hubVertexForIndex,
  layoutSubsystems,
  pathBetween,
  pathFor,
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

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

    it("forge (index 0) is at the bottom — max y, angle +90°", () => {
      const slots = computeSlots();
      expect(slots[0]!.angle).toBe(90);
      expect(REGISTRY_ORDER[0]).toBe("forge");
      const maxY = Math.max(...slots.map((s) => s.y));
      expect(slots[0]!.y).toBe(maxY);
    });

    it("spaces slots evenly (45°), clockwise, starting at the bottom", () => {
      const slots = computeSlots();
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i]!.angle - slots[i - 1]!.angle).toBeCloseTo(45, 5);
      }
    });

    it("forms a REGULAR octagon — every slot sits the same radius from the centre", () => {
      const slots = computeSlots();
      for (const slot of slots) {
        expect(distance(slot, WEB_CENTER)).toBeCloseTo(WEB_RADIUS, 1);
      }
    });

    it("supports an arbitrary count (defensive — real app always uses 8)", () => {
      expect(computeSlots(4)).toHaveLength(4);
      expect(computeSlots(4)[0]!.angle).toBe(90);
      expect(computeSlots(4)[1]!.angle).toBe(180);
    });
  });

  describe("orb / hub sizing", () => {
    it("orb radius is 2× node radius (diameter ≈ 2× a node's)", () => {
      expect(ORB_RADIUS).toBe(NODE_RADIUS * 2);
    });

    it("the hub ring clears the orb with margin, and sits inside the node ring", () => {
      expect(HUB_RADIUS).toBeGreaterThan(ORB_RADIUS);
      expect(HUB_RADIUS).toBeLessThan(WEB_RADIUS);
    });
  });

  describe("computeHubVertices / hubVertexForIndex / hubVertexForId", () => {
    it("sits on a smaller regular octagon, at the same angles as the node ring", () => {
      const slots = computeSlots();
      const hubs = computeHubVertices();
      expect(hubs).toHaveLength(slots.length);
      hubs.forEach((hub, i) => {
        expect(hub.angle).toBe(slots[i]!.angle);
        expect(distance(hub, WEB_CENTER)).toBeCloseTo(HUB_RADIUS, 1);
      });
    });

    it("hubVertexForIndex/hubVertexForId resolve to the same ring computed above", () => {
      const hubs = computeHubVertices();
      hubs.forEach((hub, i) => {
        expect(hubVertexForIndex(i)).toEqual(hub);
      });
      REGISTRY_ORDER.forEach((id, index) => {
        expect(hubVertexForId(id)).toEqual(hubs[index]);
      });
    });

    it("returns undefined for an id outside the registry", () => {
      expect(hubVertexForId("not-a-real-subsystem" as never)).toBeUndefined();
    });

    it("a node, its hub vertex, and the centre are colinear (the spoke is radial)", () => {
      for (const id of REGISTRY_ORDER) {
        const node = slotForId(id)!;
        const hub = hubVertexForId(id)!;
        // Cross product of (node - centre) and (hub - centre) is ~0 for colinear points.
        const nx = node.x - WEB_CENTER.x;
        const ny = node.y - WEB_CENTER.y;
        const hx = hub.x - WEB_CENTER.x;
        const hy = hub.y - WEB_CENTER.y;
        expect(nx * hy - ny * hx).toBeCloseTo(0, 1);
      }
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

  describe("hubEdges", () => {
    it("connects every consecutive registry neighbor, wrapping last→first — a closed 8-edge ring", () => {
      const edges = hubEdges();
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

    it("spokePath ends at the hub vertex, not the centre", () => {
      const node = slotForId("forge")!;
      const hub = hubVertexForId("forge")!;
      expect(spokePath(node, hub)).toBe(pathBetween(node, hub));
      expect(spokePath(node, hub).endsWith(`L ${hub.x} ${hub.y}`)).toBe(true);
      // Never reaches the centre.
      expect(spokePath(node, hub)).not.toContain(`${WEB_CENTER.x} ${WEB_CENTER.y}`);
    });

    it("pathFor resolves 'orb' to the counterpart node's HUB vertex, ids to their fixed slots", () => {
      expect(pathFor("orb", "forge")).toBe(pathBetween(hubVertexForId("forge")!, slotForId("forge")!));
      expect(pathFor("forge", "orb")).toBe(pathBetween(slotForId("forge")!, hubVertexForId("forge")!));
      expect(pathFor("forge", "puls")).toBe(pathBetween(slotForId("forge")!, slotForId("puls")!));
    });

    it("a dispatch/report ride never passes through the centre", () => {
      const dispatch = pathFor("orb", "puls")!;
      const report = pathFor("puls", "orb")!;
      expect(dispatch).not.toContain(`${WEB_CENTER.x} ${WEB_CENTER.y}`);
      expect(report).not.toContain(`${WEB_CENTER.x} ${WEB_CENTER.y}`);
    });

    it("pathFor fails soft on an unknown id, or the now-meaningless 'orb'-to-'orb'", () => {
      expect(pathFor("orb", "ghost" as never)).toBeUndefined();
      expect(pathFor("ghost" as never, "orb")).toBeUndefined();
      expect(pathFor("orb", "orb")).toBeUndefined();
    });
  });
});
