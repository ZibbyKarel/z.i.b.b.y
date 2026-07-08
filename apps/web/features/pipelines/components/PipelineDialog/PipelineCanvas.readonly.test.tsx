import { renderWithProviders as render, screen } from "../../../../test/render";
import { describe, expect, it } from "vitest";
import type { Agent } from "@zibby/contracts";
import { IconTileTestId } from "@zibby/design-system";
import { PipelineCanvas } from "./PipelineCanvas";
import type { PipelineGraph } from "./pipeline-graph";

const agents: Agent[] = [
  { id: "writer", name: "Writer", glyph: "edit", instructions: "write" },
  { id: "tester", name: "Tester", glyph: "flask", instructions: "test" },
];

const AVATAR_SRC = "data:image/png;base64,avatarbytes";
const agentsWithAvatar: Agent[] = [
  { ...agents[0]!, avatar: AVATAR_SRC },
  agents[1]!,
];

// Two agent nodes with a rework back-edge from the 2nd to the 1st (a loop).
const looped: PipelineGraph = {
  nodes: [
    {
      id: "writer",
      type: "agent",
      agent: "writer",
      produces: "draft.md",
      commands: "",
      model: "opus",
      thinking: "high",
      x: 60,
      y: 200,
    },
    {
      id: "tester",
      type: "agent",
      agent: "tester",
      produces: "report.md",
      commands: "",
      model: "sonnet",
      thinking: "medium",
      x: 360,
      y: 200,
    },
  ],
  flow: [{ id: "e1", from: "writer", to: "tester" }],
  rework: [
    { id: "w1", from: "tester", to: "writer", maxRetries: 2, escalate: true, then: "park", escalation: [] },
  ],
};

const noop = () => {};

describe("PipelineCanvas — readOnly (detail view)", () => {
  it("renders the nodes statically: no ports, no delete affordances", () => {
    render(
      <PipelineCanvas readOnly agents={agents} graph={looped} onAddAgent={noop} setGraph={noop} />,
    );
    expect(screen.getAllByTestId("pipeline-node")).toHaveLength(2);
    expect(screen.queryByTestId("node-delete")).toBeNull();
    expect(screen.queryByTestId("node-port-out")).toBeNull();
    expect(screen.queryByTestId("node-port-top")).toBeNull();
  });

  it("overlays the live-run attempt count (n/m) on the loop node", () => {
    render(
      <PipelineCanvas
        readOnly
        agents={agents}
        attempts={{ tester: 2 }}
        graph={looped}
        onAddAgent={noop}
        setGraph={noop}
      />,
    );
    // tester is the rework source → maxAttempts = maxRetries + 1 = 3.
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("renders the phase agent's avatar as the node's IconTile image, glyph as fallback", () => {
    render(
      <PipelineCanvas
        readOnly
        agents={agentsWithAvatar}
        graph={looped}
        onAddAgent={noop}
        setGraph={noop}
      />,
    );
    // writer has an avatar → its node shows an IconTile image with that src.
    const images = screen.getAllByTestId(IconTileTestId.Image);
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", AVATAR_SRC);
    // tester has no avatar → its node keeps rendering the glyph fallback (no image).
  });
});
