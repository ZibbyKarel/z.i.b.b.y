import { describe, expect, it } from "vitest";
import {
  MITOSIS_STAGGER,
  MITOSIS_TOTAL_DURATION,
  NET_GEOMETRY,
  MINI_ORB_WORLD_RADIUS as REAL_MINI_ORB_WORLD_RADIUS,
  REGISTRY_ORDER,
  SLOT_COUNT,
  easeOutBack,
  easeOutCubic,
  hubForId,
  hubSlots,
  mitosisProgress,
  octagonSlots,
  octagonSlotsAround,
  orbFlightSlots,
  pointToward,
  resolveFlightEndpoints,
  slotForId,
} from "./clusterGeometry";

const NODE_RADIUS = 0.85;
const HUB_RADIUS = 0.7;
// Mirrors sceneController.ts's real ORB_FLIGHT_RADIUS: just outside the central
// orb's glow (ORB_SCALE × 1.25 = 0.46 × 1.25 = 0.575) and inside HUB_RADIUS.
const ORB_FLIGHT_RADIUS = 0.6;

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

  describe("octagonSlotsAround (phase 101 — per-node octagon)", () => {
    it("re-centres the same regular octagon on an arbitrary point", () => {
      const center = { x: 1.5, y: -0.3 };
      const radius = 0.2;
      const around = octagonSlotsAround(center, radius);
      const atOrigin = octagonSlots(radius);
      around.forEach((slot, i) => {
        expect(slot.x).toBeCloseTo(atOrigin[i]!.x + center.x, 6);
        expect(slot.y).toBeCloseTo(atOrigin[i]!.y + center.y, 6);
        expect(slot.angle).toBe(atOrigin[i]!.angle);
        expect(slot.index).toBe(i);
      });
    });

    it("returns exactly `count` (default 8) vertices", () => {
      expect(octagonSlotsAround({ x: 0, y: 0 }, 0.2)).toHaveLength(8);
      expect(octagonSlotsAround({ x: 0, y: 0 }, 0.2, 4)).toHaveLength(4);
    });

    it("honours the given radius — every vertex sits exactly `radius` from `center`", () => {
      const center = { x: 0.4, y: 0.9 };
      const radius = 0.216;
      for (const slot of octagonSlotsAround(center, radius)) {
        expect(distance(slot, center)).toBeCloseTo(radius, 5);
      }
    });

    it("centred at the origin matches octagonSlots itself (modulo signed-zero)", () => {
      const around = octagonSlotsAround({ x: 0, y: 0 }, 0.5);
      const atOrigin = octagonSlots(0.5);
      around.forEach((slot, i) => {
        expect(slot.x).toBeCloseTo(atOrigin[i]!.x, 6);
        expect(slot.y).toBeCloseTo(atOrigin[i]!.y, 6);
        expect(slot.angle).toBe(atOrigin[i]!.angle);
        expect(slot.index).toBe(atOrigin[i]!.index);
      });
    });
  });

  describe("pointToward (phase 101 — short-link endpoint math)", () => {
    it("moves the given distance from `from`, toward `to`", () => {
      const from = { x: 0, y: 0 };
      const to = { x: 10, y: 0 };
      expect(pointToward(from, to, 3)).toEqual({ x: 3, y: 0 });
    });

    it("honours direction along an arbitrary (non-axis-aligned) line", () => {
      const from = { x: 0, y: 0 };
      const to = { x: 3, y: 4 }; // 3-4-5 triangle, hypotenuse length 5
      const point = pointToward(from, to, 5);
      expect(point.x).toBeCloseTo(3, 6);
      expect(point.y).toBeCloseTo(4, 6);
    });

    it("falls back to `from` unchanged when `from` and `to` coincide", () => {
      const p = { x: 1.2, y: -3.4 };
      expect(pointToward(p, p, 0.5)).toEqual({ x: 1.2, y: -3.4 });
    });

    it("shortens a hub→node spoke to the node's near edge, strictly inside the node's own centre", () => {
      const hub = hubForId("forge", HUB_RADIUS)!;
      const node = slotForId("forge", NODE_RADIUS)!;
      const nodeOctagonRadius = 0.05;
      const near = pointToward(node, hub, nodeOctagonRadius);
      expect(distance(near, node)).toBeCloseTo(nodeOctagonRadius, 6);
      expect(distance(near, hub)).toBeLessThan(distance(node, hub));
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

  describe("orbFlightSlots (phase 97 legibility pass — the handoff-flight orb-side ring)", () => {
    it("sits on a smaller regular octagon, at the SAME angles as the hub and node rings", () => {
      const nodes = octagonSlots(NODE_RADIUS);
      const hubs = hubSlots(HUB_RADIUS);
      const orbFlights = orbFlightSlots(ORB_FLIGHT_RADIUS);
      expect(orbFlights).toHaveLength(nodes.length);
      orbFlights.forEach((point, i) => {
        expect(point.angle).toBe(nodes[i]!.angle);
        expect(point.angle).toBe(hubs[i]!.angle);
        expect(distance(point, { x: 0, y: 0 })).toBeCloseTo(ORB_FLIGHT_RADIUS, 5);
      });
    });

    it("sits strictly INSIDE the hub ring, which sits strictly inside the node ring — the flight visibly crosses the whole inner octagon", () => {
      expect(ORB_FLIGHT_RADIUS).toBeLessThan(HUB_RADIUS);
      expect(HUB_RADIUS).toBeLessThan(NODE_RADIUS);
    });

    it("a node, its orb-flight point, and the cluster origin are colinear (the flight rides the radial spoke)", () => {
      for (const id of REGISTRY_ORDER) {
        const node = slotForId(id, NODE_RADIUS)!;
        const index = REGISTRY_ORDER.indexOf(id);
        const orbPoint = orbFlightSlots(ORB_FLIGHT_RADIUS)[index]!;
        expect(node.x * orbPoint.y - node.y * orbPoint.x).toBeCloseTo(0, 5);
      }
    });
  });

  describe("NET_GEOMETRY (phase 107 — hub/node octagon separation + connector)", () => {
    // Asserts against the REAL exported constants sceneController.ts actually
    // draws the WebGL net with — not local copies — so a future retune that
    // breaks the no-overlap invariant fails this test, not just a screenshot.

    it("keeps every node octagon strictly outside the hub octagon (no overlap by construction)", () => {
      expect(NET_GEOMETRY.NODE_RING_RADIUS - NET_GEOMETRY.NODE_OCTAGON_RADIUS).toBeGreaterThan(
        NET_GEOMETRY.HUB_RADIUS,
      );
    });

    it("the node octagon still clears the mini-orb itself (radius bigger than the orb it wraps)", () => {
      expect(NET_GEOMETRY.NODE_OCTAGON_RADIUS).toBeGreaterThan(REAL_MINI_ORB_WORLD_RADIUS);
    });

    it("the connector (hub vertex -> node octagon's near point) is a positive-length OUTWARD segment sitting strictly between the two octagons", () => {
      // index 0 (forge) is the bottom slot — node, hub, and the origin are
      // colinear by construction (see hubSlots's own "colinear" test above),
      // so the near point's distance from the origin is exactly
      // NODE_RING_RADIUS - NODE_OCTAGON_RADIUS for this slot.
      const id = REGISTRY_ORDER[0]!;
      const hub = hubForId(id, NET_GEOMETRY.HUB_RADIUS)!;
      const node = slotForId(id, NET_GEOMETRY.NODE_RING_RADIUS)!;
      const near = pointToward(node, hub, NET_GEOMETRY.NODE_OCTAGON_RADIUS);
      const nearRadius = distance(near, { x: 0, y: 0 });

      expect(nearRadius).toBeGreaterThan(NET_GEOMETRY.HUB_RADIUS);
      expect(nearRadius).toBeLessThan(NET_GEOMETRY.NODE_RING_RADIUS);
    });

    it("the realized gap between the hub vertex and the node octagon's near point is at least NODE_LINK_GAP, for the colinear bottom slot", () => {
      // NODE_RING_RADIUS is rounded UP for a clean margin (see its doc in
      // clusterGeometry.ts), so the realized gap is slightly more than the
      // nominal NODE_LINK_GAP, not exactly equal to it.
      const id = REGISTRY_ORDER[0]!;
      const hub = hubForId(id, NET_GEOMETRY.HUB_RADIUS)!;
      const node = slotForId(id, NET_GEOMETRY.NODE_RING_RADIUS)!;
      const near = pointToward(node, hub, NET_GEOMETRY.NODE_OCTAGON_RADIUS);
      const nearRadius = distance(near, { x: 0, y: 0 });
      const gap = nearRadius - NET_GEOMETRY.HUB_RADIUS;

      expect(gap).toBeGreaterThanOrEqual(NET_GEOMETRY.NODE_LINK_GAP);
      expect(gap).toBeCloseTo(NET_GEOMETRY.NODE_LINK_GAP, 1);
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

  describe("resolveFlightEndpoints (phase 97 — handoff flights)", () => {
    const orbPoint = { x: 0.1, y: 0.2 };
    const node = { x: 0.9, y: 0.8 };

    it("a dispatch (orb → subsystem) starts at the orb-surface point, ends at the mini-orb", () => {
      expect(resolveFlightEndpoints("orb", "forge", orbPoint, node)).toEqual({
        from: orbPoint,
        to: node,
      });
    });

    it("a report (subsystem → orb) starts at the mini-orb, ends at the orb-surface point", () => {
      expect(resolveFlightEndpoints("forge", "orb", orbPoint, node)).toEqual({
        from: node,
        to: orbPoint,
      });
    });

    it("never routes through the orb centre — the orb-surface point is always the orb-side endpoint, never the node", () => {
      const dispatch = resolveFlightEndpoints("orb", "puls", orbPoint, node);
      const report = resolveFlightEndpoints("puls", "orb", orbPoint, node);
      expect(dispatch.from).toBe(orbPoint);
      expect(report.to).toBe(orbPoint);
    });
  });
});
