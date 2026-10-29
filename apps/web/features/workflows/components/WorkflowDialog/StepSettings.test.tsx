import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../../test/render";
import { CommandLineTestId } from "../../../tasks/components/CommandLine/CommandLine";
import { StepSettings } from "./StepSettings";
import type { GraphNode, WorkflowGraph } from "./workflow-graph";

vi.mock("../../../skills", () => ({
  useSkillsQuery: () => ({
    data: [{ id: "security-audit", name: "security-audit", glyph: "spark", desc: "" }],
  }),
}));
vi.mock("../../../marketplaces", () => ({ useMarketplaceSkillsQuery: () => ({ data: [] }) }));

const base = { produces: "out.md", commands: "", model: "sonnet", thinking: "medium", x: 0, y: 0 };
const agentNode = (extra: Partial<GraphNode> = {}): GraphNode =>
  ({ id: "a1", type: "agent", agent: "writer", ...base, ...extra }) as GraphNode;
const toolNode = { id: "t1", type: "tool", agent: "", ...base, commands: "ls" } as GraphNode;

/** Holds the graph in state like WorkflowDialog does, exposing the latest value. */
function renderSteps(nodes: GraphNode[]) {
  const latest: { graph: WorkflowGraph } = { graph: { nodes, flow: [], rework: [] } };
  function Harness() {
    const [graph, setGraph] = useState(latest.graph);
    latest.graph = graph;
    return <StepSettings graph={graph} setGraph={(u) => setGraph(u)} />;
  }
  render(<Harness />);
  const node = () => latest.graph.nodes.find((n) => n.id === "a1");
  const input = () =>
    within(screen.getByTestId("step-prompt-a1")).getByTestId(CommandLineTestId.Input);
  return { node, input };
}

describe("StepSettings — agent prompt", () => {
  it("renders the prompt composer for an agent step only", () => {
    renderSteps([agentNode(), toolNode]);
    expect(screen.getByTestId("step-prompt-a1")).toBeInTheDocument();
    expect(screen.queryByTestId("step-prompt-t1")).not.toBeInTheDocument();
    // No attach affordance in the step editor.
    expect(screen.queryByTestId(CommandLineTestId.Attach)).not.toBeInTheDocument();
  });

  it("typing patches prompt; clearing saves prompt undefined", async () => {
    const user = userEvent.setup();
    const { node, input } = renderSteps([agentNode()]);
    await user.type(input(), "check auth{Shift>}{Enter}{/Shift}twice");
    expect(node()?.prompt).toBe("check auth\ntwice");
    await user.clear(input());
    expect(node()?.prompt).toBeUndefined();
  });

  it("offers no @ picker", async () => {
    const user = userEvent.setup();
    const { input } = renderSteps([agentNode()]);
    await user.type(input(), "@");
    expect(screen.queryByTestId(CommandLineTestId.MentionMenu)).not.toBeInTheDocument();
  });

  it("picking /security-audit patches skill; deleting the token clears it", async () => {
    const user = userEvent.setup();
    const { node, input } = renderSteps([agentNode()]);
    await user.type(input(), "/secu");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-security-audit`));
    expect(node()?.skill).toBe("security-audit");
    expect(node()?.prompt).toBe("/security-audit ");
    await user.clear(input());
    expect(node()?.skill).toBeUndefined();
  });

  it("reopening a saved step shows the text with its skill tag", async () => {
    const user = userEvent.setup();
    const { node, input } = renderSteps([
      agentNode({ prompt: "/security-audit check auth", skill: "security-audit" }),
    ]);
    expect(input()).toHaveValue("/security-audit check auth");
    await user.clear(input());
    expect(node()?.skill).toBeUndefined();
  });
});
