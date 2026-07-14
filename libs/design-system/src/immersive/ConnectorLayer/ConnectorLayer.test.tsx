import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { resetImmersiveCss } from "../immersive.css";
import { ConnectorLayer, ConnectorLayerTestId, type ConnectorNode } from "./ConnectorLayer";

afterEach(() => resetImmersiveCss());

const nodes: ConnectorNode[] = [
  { id: "codex", x: 40, y: 40, color: "#8b5cf6", live: true },
  { id: "atlas", x: 260, y: 40, color: "#22d3ee", live: false },
  { id: "forge", x: 150, y: 220, color: "#f97316", live: false },
];

describe("ConnectorLayer", () => {
  it("renders a decorative root svg", () => {
    render(<ConnectorLayer center={{ x: 150, y: 130 }} nodes={nodes} />);
    expect(screen.getByTestId(ConnectorLayerTestId.Root)).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("renders one connector group per node", () => {
    render(<ConnectorLayer center={{ x: 150, y: 130 }} nodes={nodes} />);
    for (const n of nodes) {
      expect(
        screen.getByTestId(`${ConnectorLayerTestId.Connector}-${n.id}`),
      ).toBeInTheDocument();
    }
  });

  it("draws only the base stroke for an idle node", () => {
    render(<ConnectorLayer center={{ x: 150, y: 130 }} nodes={nodes} />);
    const group = screen.getByTestId(`${ConnectorLayerTestId.Connector}-atlas`);
    expect(group.querySelectorAll("path")).toHaveLength(1);
  });

  it("adds a live dashed overlay on top of the base stroke for a live node", () => {
    render(<ConnectorLayer center={{ x: 150, y: 130 }} nodes={nodes} />);
    const group = screen.getByTestId(`${ConnectorLayerTestId.Connector}-codex`);
    const paths = group.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[1]).toHaveAttribute("stroke", "#8b5cf6");
    expect(paths[1]).toHaveAttribute("stroke-dasharray", "2 10");
  });

  it("computes the bezier control point from the 0.08 bend factor", () => {
    render(
      <ConnectorLayer
        center={{ x: 0, y: 0 }}
        nodes={[{ id: "n", x: 100, y: 0, color: "#fff", live: false }]}
      />,
    );
    const group = screen.getByTestId(`${ConnectorLayerTestId.Connector}-n`);
    const path = group.querySelector("path");
    // cx=0 cy=0 -> node (100,0): mx=(0+100)/2+(0-0)*0.08=50, my=(0+0)/2-(100-0)*0.08=-8
    expect(path).toHaveAttribute("d", "M 0 0 Q 50 -8 100 0");
  });
});
