import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chain, ChainRun } from "@zibby/contracts";
import { ChainsScreenTestId, Screen } from "./Screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const CHAINS: Chain[] = [
  {
    id: "research-then-build",
    name: "Research → Build",
    steps: [{ pipeline: "nightly-research" }, { pipeline: "build-feature" }],
    instructions: "Research topic X.",
  },
  { id: "audit-then-docs", name: "Audit → Docs", steps: [{ pipeline: "audit" }] },
];

const RUNS: ChainRun[] = [
  {
    chainRunId: "research-then-build_1",
    chainId: "research-then-build",
    status: "parked",
    currentStep: 0,
    steps: [
      { index: 0, pipeline: "nightly-research", runRef: "n_1", status: "running" },
      { index: 1, pipeline: "build-feature", status: "pending" },
    ],
    startedAt: "2026-07-02T08:00:00.000Z",
    parkedReason: "step 0 delivered no consumable artifact",
  },
];

const { hooks } = vi.hoisted(() => ({
  hooks: {
    chains: { data: [] as Chain[], isPending: false, isError: false, refetch: vi.fn() },
    runs: [] as ChainRun[],
    start: vi.fn(),
    del: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  useChainsQuery: () => hooks.chains,
  useChainRunsQuery: () => ({ data: hooks.runs }),
}));
vi.mock("./mutations", () => ({
  useCreateChainMutation: () => ({ mutate: hooks.create, isPending: false }),
  useDeleteChainMutation: () => ({ mutate: hooks.del, isPending: false }),
  useStartChainMutation: () => ({ mutate: hooks.start, isPending: false }),
}));
vi.mock("../pipelines", () => ({
  usePipelinesQuery: () => ({ data: [{ id: "nightly-research", name: "Nightly research" }] }),
}));

describe("chains Screen (N4a)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.start.mockClear();
    hooks.chains = { data: CHAINS, isPending: false, isError: false, refetch: vi.fn() };
    hooks.runs = RUNS;
  });

  it("renders chain cards; a card click NAVIGATES to the detail route (grammar)", async () => {
    render(<Screen />);
    const cards = screen.getAllByTestId(ChainsScreenTestId.Card);
    expect(cards).toHaveLength(2);
    await userEvent.click(cards[1]!);
    expect(push).toHaveBeenCalledWith("/chains/audit-then-docs");
  });

  it("shows the selected chain's step flow and its runs with status + parked reason", () => {
    render(<Screen selectedId="research-then-build" />);
    // The name renders on the card AND the detail header.
    expect(screen.getAllByText("Research → Build").length).toBeGreaterThanOrEqual(2);
    const row = screen.getByTestId(ChainsScreenTestId.RunRow);
    expect(row).toHaveTextContent("research-then-build_1");
    expect(row).toHaveTextContent("zaparkováno");
    expect(row).toHaveTextContent("step 0 delivered no consumable artifact");
    expect(row).toHaveTextContent("1. nightly-research");
  });

  it("Run starts the chain via the mutation (top-right primary action)", async () => {
    render(<Screen selectedId="research-then-build" />);
    await userEvent.click(screen.getByTestId(ChainsScreenTestId.Run));
    expect(hooks.start).toHaveBeenCalledWith({ params: { id: "research-then-build" }, body: {} });
  });

  it("empty state offers the create action; the dialog is create-only", async () => {
    hooks.chains = { data: [], isPending: false, isError: false, refetch: vi.fn() };
    hooks.runs = [];
    render(<Screen />);
    const [headerAction] = screen.getAllByRole("button", { name: "Nový řetězec" });
    await userEvent.click(headerAction!);
    expect(screen.getByLabelText("Nový řetězec")).toBeInTheDocument();
  });
});
