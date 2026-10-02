import { renderWithProviders as render, screen } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "@zibby/contracts";
import { IconTileTestId } from "@zibby/design-system";
import { WorkflowCanvas } from "./WorkflowCanvas";
import type { WorkflowGraph } from "./workflow-graph";

const agents: Agent[] = [
  { id: "writer", name: "Writer", glyph: "edit", instructions: "write" },
  { id: "tester", name: "Tester", glyph: "flask", instructions: "test" },
];

const AVATAR_SRC = "data:image/png;base64,avatarbytes";
const agentsWithAvatar: Agent[] = [{ ...agents[0]!, avatar: AVATAR_SRC }, agents[1]!];

// Two agent nodes with a rework back-edge from the 2nd to the 1st (a loop).
const looped: WorkflowGraph = {
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
    {
      id: "w1",
      from: "tester",
      to: "writer",
      maxRetries: 2,
      escalate: true,
      then: "park",
      escalation: [],
    },
  ],
};

const noop = () => {};

describe("WorkflowCanvas — readOnly (detail view)", () => {
  it("renders the nodes statically: no ports, no delete affordances", () => {
    render(
      <WorkflowCanvas readOnly agents={agents} graph={looped} onAddAgent={noop} setGraph={noop} />,
    );
    expect(screen.getAllByTestId("workflow-node")).toHaveLength(2);
    expect(screen.queryByTestId("node-delete")).toBeNull();
    expect(screen.queryByTestId("node-port-out")).toBeNull();
    expect(screen.queryByTestId("node-port-top")).toBeNull();
  });

  it("overlays the live-run attempt count (n/m) on the loop node", () => {
    render(
      <WorkflowCanvas
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
      <WorkflowCanvas
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

  it("fires onNodeClick with the clicked node's id (Phase 85 Roster tab)", async () => {
    const onNodeClick = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowCanvas
        readOnly
        agents={agents}
        graph={looped}
        onAddAgent={noop}
        onNodeClick={onNodeClick}
        setGraph={noop}
      />,
    );
    const nodes = screen.getAllByTestId("workflow-node");
    await user.click(nodes[0] as HTMLElement);
    expect(onNodeClick).toHaveBeenCalledWith("writer");
  });

  it("is not clickable without onNodeClick, and not clickable in the (non-read-only) editor", async () => {
    const onNodeClick = vi.fn();
    const user = userEvent.setup();
    // Editable canvas: onNodeClick is ignored (onNodeDown drives dragging instead).
    render(
      <WorkflowCanvas
        agents={agents}
        graph={looped}
        onAddAgent={noop}
        onNodeClick={onNodeClick}
        setGraph={noop}
      />,
    );
    const nodes = screen.getAllByTestId("workflow-node");
    await user.click(nodes[0] as HTMLElement);
    expect(onNodeClick).not.toHaveBeenCalled();
  });
});
