import { describe, expect, it, vi } from "vitest";
import type { Agent } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../../../test/render";
import { AgentNode, type AgentNodeProps } from "./AgentNode";
import type { GraphNode } from "./workflow-graph";

vi.mock("../../../system", async (orig) => ({
  ...(await orig<object>()),
  useSystemConfigQuery: () => ({
    data: { aiEngine: "claude", opencodeTierModels: { sonnet: "tier/mapped" }, opencodeModel: "" },
  }),
}));

const agent = (extra: Partial<Agent>): Agent =>
  ({ id: "writer", name: "Writer", glyph: "edit", instructions: "w", ...extra }) as Agent;

const node = (extra: Partial<GraphNode> = {}): GraphNode => ({
  id: "n1",
  type: "agent",
  agent: "writer",
  produces: "o.md",
  commands: "",
  model: "sonnet",
  thinking: "medium",
  x: 0,
  y: 0,
  ...extra,
});

function renderNode(n: GraphNode, agents: Agent[]) {
  const noop = vi.fn();
  const props: AgentNodeProps = {
    node: n,
    agents,
    pending: null,
    hover: null,
    dragging: false,
    hasOutgoing: false,
    readOnly: true,
    onPortDown: noop,
    onNodeDown: noop,
    onDelete: noop,
    onCycleModel: noop,
    onCycleThink: noop,
    onSetProduces: noop,
    onPortEnter: noop,
    onPortLeave: noop,
    onNodeEnter: noop,
    onNodeLeave: noop,
  };
  render(<AgentNode {...props} />);
}

describe("AgentNode — model badge", () => {
  it("shows the agent's exact opencode model when the step has none", () => {
    renderNode(node(), [agent({ engine: "opencode", engineModel: "anthropic/exact-model" })]);
    expect(screen.getByText("exact-model")).toBeInTheDocument();
    expect(screen.queryByText(/mapped/)).toBeNull();
  });

  it("the step's own model wins over the agent's", () => {
    renderNode(node({ engine: "opencode", engineModel: "a/step-model" }), [
      agent({ engine: "opencode", engineModel: "anthropic/exact-model" }),
    ]);
    expect(screen.getByText("step-model")).toBeInTheDocument();
  });

  it("falls back to the tier mapping without any exact model", () => {
    renderNode(node(), [agent({ engine: "opencode" })]);
    expect(screen.getByText(/mapped/)).toBeInTheDocument();
  });
});
