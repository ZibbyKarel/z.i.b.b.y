import { describe, expect, it, vi } from "vitest";
import { Form, useFormContext } from "@zibby/forms";
import { renderWithProviders as render, screen } from "../../../test/render";
import { AgentEditBasics } from "./AgentEditBasics";
import { type AgentEditValues, toFormValues } from "./agentEditValues";

const mocks = vi.hoisted(() => ({
  engines: undefined as unknown,
  config: { aiEngine: "claude" } as Record<string, unknown>,
}));
vi.mock("../../ai-providers/queries", async (orig) => ({
  ...(await orig<object>()),
  useAiEnginesQuery: () => ({ data: mocks.engines }),
}));
vi.mock("../../system", async (orig) => ({
  ...(await orig<object>()),
  useSystemConfigQuery: () => ({ data: mocks.config }),
}));
vi.mock("../../departments/useDepartmentLookup", () => ({
  useDepartmentLookup: () => ({ list: [], get: () => undefined }),
}));

function Basics() {
  return <AgentEditBasics categories={[]} control={useFormContext<AgentEditValues>().control} />;
}

function open(overrides: Partial<AgentEditValues>) {
  render(
    <Form<AgentEditValues>
      formOptions={{
        defaultValues: {
          ...toFormValues({ id: "a", name: "a", glyph: "bot", instructions: "x" }),
          ...overrides,
        },
      }}
      onSubmit={vi.fn()}
    >
      <Basics />
    </Form>,
  );
}

const withOpencode = (variants: string[]) => {
  mocks.engines = { engines: [{ id: "opencode", models: [{ id: "a/m", variants }] }] };
};
const hint = () => screen.queryByTestId("agent-thinking-hint");

describe("AgentEditBasics — thinking hint", () => {
  it("shows when the agent's opencode model lacks the thinking level", () => {
    withOpencode(["low"]);
    open({ engine: "opencode", engineModel: "a/m", thinking: "high" });
    expect(hint()).toHaveTextContent("high");
  });

  it("is hidden when the model offers the level", () => {
    withOpencode(["high"]);
    open({ engine: "opencode", engineModel: "a/m", thinking: "high" });
    expect(hint()).toBeNull();
  });

  it("is hidden on the claude engine", () => {
    withOpencode([]);
    open({ engine: "claude", thinking: "high" });
    expect(hint()).toBeNull();
  });

  it("follows the global opencode engine when the agent has no override", () => {
    withOpencode(["low"]);
    mocks.config = { aiEngine: "opencode" };
    open({ engine: "", engineModel: "a/m", thinking: "high" });
    expect(hint()).toHaveTextContent("high");
    mocks.config = { aiEngine: "claude" };
  });
});
