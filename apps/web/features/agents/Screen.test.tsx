import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@zibby/contracts";
import { Screen } from "./Screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const AGENTS: Agent[] = [
  {
    id: "koder",
    name: "Kodér",
    description: "Use this agent when coding",
    model: "sonnet",
    thinking: "medium",
    tools: ["read"],
    category: "Dev",
    instructions: "Write the code.",
  },
];

const { hooks } = vi.hoisted(() => ({
  hooks: {
    agents: { data: [] as Agent[], isPending: false, isError: false, refetch: vi.fn() },
    create: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  useAgentsQuery: () => hooks.agents,
  useCategoriesQuery: () => ({ data: [{ name: "Dev", glyph: "code" }] }),
}));
vi.mock("./mutations", () => ({
  useCreateAgentMutation: () => ({ mutate: hooks.create, isPending: false }),
  useCreateCategoryMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteCategoryMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../pipelines", () => ({ usePipelinesQuery: () => ({ data: [] }) }));
vi.mock("../gates", () => ({
  useGateRulesQuery: () => ({ data: [] }),
  useSystemPolicyQuery: () => ({ data: [] }),
}));

describe("agents Screen (N4c grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.create.mockClear();
    hooks.agents = { data: AGENTS, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("a card click NAVIGATES to the agent detail route — no dialog", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Otevřít Kodér" }));
    expect(push).toHaveBeenCalledWith("/agents/koder");
    // Nothing dialog-shaped opened.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the header add action opens the CREATE-ONLY dialog (accessible name)", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat agenta" }));
    expect(screen.getByLabelText("Nový agent")).toBeInTheDocument();
    // The dialog's primary action creates — there is no edit/save vocabulary.
    expect(screen.getByRole("button", { name: "Vytvořit agenta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Uložit změny" })).toBeNull();
  });
});
