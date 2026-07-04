import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@zibby/contracts";
import { AgentDetailScreenTestId, DetailScreen } from "./DetailScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const AGENT: Agent = {
  id: "koder",
  name: "Kodér",
  description: "Use this agent when coding",
  model: "sonnet",
  thinking: "medium",
  tools: ["read"],
  category: "Dev",
  instructions: "Write the code.",
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    agent: {
      data: undefined as Agent | undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    update: vi.fn(),
    del: vi.fn(),
    openNewTask: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  useAgentQuery: () => hooks.agent,
  useCategoriesQuery: () => ({ data: [{ name: "Dev", glyph: "code" }] }),
}));
vi.mock("./mutations", () => ({
  useUpdateAgentMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDeleteAgentMutation: () => ({ mutate: hooks.del, isPending: false }),
}));
vi.mock("../pipelines", () => ({
  usePipelinesQuery: () => ({
    data: [{ id: "delivery", name: "Delivery", phases: [{ id: "p1", agent: "Kodér" }] }],
  }),
}));
vi.mock("../tasks", () => ({ useNewTask: () => ({ open: hooks.openNewTask }) }));
vi.mock("../gates", () => ({
  useGateRulesQuery: () => ({ data: [] }),
  useSystemPolicyQuery: () => ({ data: [] }),
}));

describe("agents DetailScreen (N4c grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.update.mockClear();
    hooks.del.mockClear();
    hooks.openNewTask.mockClear();
    hooks.agent = { data: AGENT, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("header carries the top-right actions with accessible names; page IS the edit surface", () => {
    render(<DetailScreen agentId="koder" />);
    expect(screen.getByRole("button", { name: "Uložit změny" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spustit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smazat" })).toBeInTheDocument();
    // Phase 04: a pin toggle sits in the action row next to Run.
    expect(screen.getByRole("button", { name: "Připnout" })).toBeInTheDocument();
    // The backing file is honest in the header, and the used-by panel lists pipelines.
    expect(screen.getByText("~/zibby/agents/koder.agent.md")).toBeInTheDocument();
    expect(screen.getByText(/Delivery/)).toBeInTheDocument();
  });

  it("Save submits the form to the update mutation", async () => {
    render(<DetailScreen agentId="koder" />);
    await userEvent.click(screen.getByTestId(AgentDetailScreenTestId.Save));
    await vi.waitFor(() => {
      expect(hooks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: "koder" },
          body: expect.objectContaining({ instructions: "Write the code." }),
        }),
      );
    });
  });

  it("Delete asks in a CONFIRM dialog, then deletes and navigates back to /agents", async () => {
    hooks.del.mockImplementation((_args, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<DetailScreen agentId="koder" />);
    await userEvent.click(screen.getByTestId(AgentDetailScreenTestId.Delete));
    expect(screen.getByText("Smazat agenta?")).toBeInTheDocument();
    const confirm = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => b !== screen.getByTestId(AgentDetailScreenTestId.Delete));
    await userEvent.click(confirm!);
    expect(hooks.del).toHaveBeenCalledWith(
      { params: { id: "koder" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("Run pre-fills the New Task dialog with the agent as explicit target", async () => {
    render(<DetailScreen agentId="koder" />);
    await userEvent.click(screen.getByTestId(AgentDetailScreenTestId.Run));
    expect(hooks.openNewTask).toHaveBeenCalledWith(undefined, {
      kind: "agent",
      id: "koder",
      name: "Kodér",
      glyph: "bot",
    });
  });
});
