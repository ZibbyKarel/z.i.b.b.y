import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { DropdownTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../../test/render";
import { CommandLineTestId } from "../../../tasks/components/CommandLine/CommandLine";
import { StepSettings } from "./StepSettings";
import type { GraphNode, WorkflowGraph } from "./workflow-graph";

vi.mock("../../../skills", () => ({
  useSkillsQuery: () => ({
    isSuccess: true,
    data: [
      { id: "security-audit", name: "security-audit", glyph: "spark", desc: "" },
      { id: "tdd", name: "Test Driven", glyph: "spark", desc: "" },
    ],
  }),
}));
const mocks = vi.hoisted(() => ({
  engines: undefined as unknown,
  config: { aiEngine: "claude" } as Record<string, unknown>,
  agents: [] as unknown[],
}));
vi.mock("../../../ai-providers/queries", async (orig) => ({
  ...(await orig<object>()),
  useAiEnginesQuery: () => ({ data: mocks.engines }),
}));
vi.mock("../../../system", async (orig) => ({
  ...(await orig<object>()),
  useSystemConfigQuery: () => ({ data: mocks.config }),
}));
vi.mock("../../../agents/queries", () => ({ useAgentsQuery: () => ({ data: mocks.agents }) }));
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
    const before = input();
    await user.type(before, "/secu");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-skill-security-audit`));
    expect(node()?.skill).toBe("security-audit");
    // The pick must not remount the composer (undo history, caret, focus survive).
    expect(input()).toBe(before);
    expect(before).toHaveFocus();
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

  it("reopens a skill whose name differs from its id with the tag intact", async () => {
    const user = userEvent.setup();
    const { node, input } = renderSteps([agentNode({ prompt: "/Test Driven go", skill: "tdd" })]);
    expect(input()).toHaveValue("/Test Driven go");
    await user.type(input(), "!");
    expect(node()).toMatchObject({ prompt: "/Test Driven go!", skill: "tdd" });
  });

  it("an uninstalled skill never corrupts the saved prompt; the first edit drops it", async () => {
    const user = userEvent.setup();
    const { node, input } = renderSteps([agentNode({ prompt: "/Old Name go", skill: "gone" })]);
    expect(input()).toHaveValue("/Old Name go");
    await user.type(input(), "!");
    expect(node()?.prompt).toBe("/Old Name go!");
    expect(node()?.skill).toBeUndefined();
  });

  it("does not steal focus on mount", () => {
    const { input } = renderSteps([agentNode()]);
    expect(input()).not.toHaveFocus();
  });
});

describe("StepSettings — runs on", () => {
  it("picking an OpenAI model shows hint + include; include patches; clearing drops both", async () => {
    const user = userEvent.setup();
    const { node } = renderSteps([agentNode()]);
    expect(screen.queryByTestId("step-include-a1")).not.toBeInTheDocument();
    expect(screen.getByTestId("step-runs-on-a1")).toBeInTheDocument();
    await user.click(
      within(screen.getByTestId("step-runs-on-a1")).getByTestId(DropdownTestId.Trigger),
    );
    await user.click(await screen.findByRole("option", { name: "OpenAI · gpt-6-luna" }));
    expect(node()?.openaiModel).toBe("gpt-6-luna");
    expect(screen.getByTestId("step-openai-hint-a1")).toBeInTheDocument();
    await user.type(screen.getByTestId("step-include-a1"), "book/plan.json");
    expect(node()?.include).toEqual(["book/plan.json"]);
    await user.click(
      within(screen.getByTestId("step-runs-on-a1")).getByTestId(DropdownTestId.Trigger),
    );
    await user.click(
      await screen.findByRole("option", { name: "Výchozí (agent / globální engine)" }),
    );
    expect(node()?.openaiModel).toBeUndefined();
    expect(node()?.include).toBeUndefined();
  });

  it("Claude Code / opencode are exclusive with OpenAI; opencode takes an exact model", async () => {
    const user = userEvent.setup();
    const pick = async (name: string) => {
      await user.click(
        within(screen.getByTestId("step-runs-on-a1")).getByTestId(DropdownTestId.Trigger),
      );
      await user.click(await screen.findByRole("option", { name }));
    };
    const { node } = renderSteps([agentNode({ openaiModel: "gpt-6-luna", include: ["a.md"] })]);
    await pick("opencode");
    expect(node()).toMatchObject({ engine: "opencode" });
    expect(node()?.openaiModel).toBeUndefined();
    expect(node()?.include).toBeUndefined();
    expect(screen.getByTestId("step-engine-model-a1")).toBeInTheDocument();
    await pick("Claude Code");
    expect(node()?.engine).toBe("claude");
    expect(screen.queryByTestId("step-engine-model-a1")).not.toBeInTheDocument();
    await pick("OpenAI · gpt-6-luna");
    expect(node()?.engine).toBeUndefined();
    expect(node()?.openaiModel).toBe("gpt-6-luna");
  });
});

describe("StepSettings — thinking hint", () => {
  const withOpencode = (variants: string[]) => {
    mocks.engines = { engines: [{ id: "opencode", models: [{ id: "a/m", variants }] }] };
  };
  const hint = () => screen.queryByTestId("step-thinking-hint-a1");

  it("shows when the step's opencode model lacks the thinking level", () => {
    withOpencode(["low"]);
    renderSteps([agentNode({ engine: "opencode", engineModel: "a/m", thinking: "high" })]);
    expect(hint()).toHaveTextContent("high");
  });

  it("is hidden when the model offers the level, on claude, or for an unknown model", () => {
    withOpencode(["high"]);
    renderSteps([agentNode({ engine: "opencode", engineModel: "a/m", thinking: "high" })]);
    expect(hint()).toBeNull();
  });

  it("is hidden on the claude engine", () => {
    withOpencode([]);
    renderSteps([agentNode({ engine: "claude", thinking: "high" })]);
    expect(hint()).toBeNull();
  });

  it("is hidden for a model missing from the list", () => {
    withOpencode([]);
    renderSteps([agentNode({ engine: "opencode", engineModel: "x/unknown", thinking: "high" })]);
    expect(hint()).toBeNull();
  });

  it("uses the agent's exact model when the step has none", () => {
    withOpencode(["low"]);
    mocks.agents = [{ id: "writer", engine: "opencode", engineModel: "a/m" }];
    renderSteps([agentNode({ engine: undefined, thinking: "high" })]);
    expect(hint()).toHaveTextContent("high");
    mocks.agents = [];
  });
});
