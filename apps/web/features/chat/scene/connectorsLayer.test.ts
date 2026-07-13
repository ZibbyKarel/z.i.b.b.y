import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ellipseSlots, hubSlots } from "./clusterGeometry";
import { SEGMENTS_PER_CONNECTOR, createConnectorsLayer } from "./connectorsLayer";

describe("createConnectorsLayer", () => {
  it("builds one LineSegments with exactly N_connectors · segmentsPerConnector · 2 vertices", () => {
    const hub = hubSlots(0.7);
    const nodes = ellipseSlots(3, 2);
    const layer = createConnectorsLayer(hub, nodes);

    expect(layer.object3d).toBeInstanceOf(THREE.LineSegments);
    const position = layer.object3d.geometry.getAttribute("position");
    expect(position.count).toBe(hub.length * SEGMENTS_PER_CONNECTOR * 2);
  });

  it("setNodes updates the position buffer's coordinates", () => {
    const hub = hubSlots(0.7);
    const nodes = ellipseSlots(3, 2);
    const layer = createConnectorsLayer(hub, nodes);
    const position = layer.object3d.geometry.getAttribute("position");
    const before = Array.from(position.array as Float32Array);

    const movedNodes = nodes.map((slot, index) =>
      index === 0 ? { ...slot, x: slot.x + 1, y: slot.y + 1 } : slot,
    );
    layer.setNodes(movedNodes);

    const after = Array.from(position.array as Float32Array);
    expect(after).not.toEqual(before);
    expect(after.length).toBe(before.length);
  });

  it("update() advances a per-connector alpha wave only for live indices, without throwing", () => {
    const hub = hubSlots(0.7);
    const nodes = ellipseSlots(3, 2);
    const layer = createConnectorsLayer(hub, nodes);
    const color = layer.object3d.geometry.getAttribute("color");
    const before = Array.from(color.array as Float32Array);

    const liveFlags = hub.map((_, index) => index === 0);
    layer.update(0.5, liveFlags);

    const after = Array.from(color.array as Float32Array);
    expect(after).not.toEqual(before);
  });

  it("dispose() frees geometry and material without throwing", () => {
    const hub = hubSlots(0.7);
    const nodes = ellipseSlots(3, 2);
    const layer = createConnectorsLayer(hub, nodes);
    expect(() => layer.dispose()).not.toThrow();
  });
});
