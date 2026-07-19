import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chain, ChainRun } from "@zibby/contracts";
import { ImmersiveShellTestId } from "@zibby/design-system";
import { ImmersivePageTestId } from "../../components/layout/ImmersivePage/ImmersivePage";
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
    openNewTask: vi.fn(),
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
}));
vi.mock("../tasks", () => ({ useNewTask: () => ({ open: hooks.openNewTask }) }));
vi.mock("../pipelines", () => ({
  usePipelinesQuery: () => ({ data: [{ id: "nightly-research", name: "Nightly research" }] }),
}));

describe("chains Screen (N4a)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.openNewTask.mockClear();
    hooks.del.mockClear();
    hooks.del.mockReset();
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

  it("Run prefills the New Task dialog with the chain target (top-right primary action)", async () => {
    render(<Screen selectedId="research-then-build" />);
    await userEvent.click(screen.getByTestId(ChainsScreenTestId.Run));
    expect(hooks.openNewTask).toHaveBeenCalledWith(undefined, {
      kind: "chain",
      id: "research-then-build",
      name: "Research → Build",
      glyph: "link",
    });
  });

  it("shows a pin toggle in the chain's action row (Phase 04)", () => {
    render(<Screen selectedId="research-then-build" />);
    expect(screen.getByText("Připnout")).toBeInTheDocument();
  });

  it("empty state offers the create action; the dialog is create-only", async () => {
    hooks.chains = { data: [], isPending: false, isError: false, refetch: vi.fn() };
    hooks.runs = [];
    render(<Screen />);
    const [headerAction] = screen.getAllByRole("button", { name: "Nový řetězec" });
    await userEvent.click(headerAction!);
    expect(screen.getByLabelText("Nový řetězec")).toBeInTheDocument();
  });

  it("Delete asks in a CONFIRM dialog, then deletes and navigates back to /chains (Phase 18.1)", async () => {
    hooks.del.mockImplementation((_args, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    render(<Screen selectedId="research-then-build" />);
    await userEvent.click(screen.getByTestId(ChainsScreenTestId.Delete));
    expect(screen.getByText("Smazat řetězec?")).toBeInTheDocument();
    expect(hooks.del).not.toHaveBeenCalled();

    const confirm = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => b !== screen.getByTestId(ChainsScreenTestId.Delete));
    await userEvent.click(confirm!);
    expect(hooks.del).toHaveBeenCalledWith(
      { params: { id: "research-then-build" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(push).toHaveBeenCalledWith("/chains");
  });

  it("cancelling the chain delete confirm never calls the mutation", async () => {
    render(<Screen selectedId="research-then-build" />);
    await userEvent.click(screen.getByTestId(ChainsScreenTestId.Delete));
    await userEvent.click(screen.getByRole("button", { name: "Zrušit" }));
    expect(hooks.del).not.toHaveBeenCalled();
    expect(screen.queryByText("Smazat řetězec?")).not.toBeInTheDocument();
  });

  // F5 (docs/plans/hud2chat-F5-orchestration.md): one Screen serves both
  // `/chains` (list) and `/chains/[id]` (detail) — `routeId` (the `selectedId`
  // prop, absent on the list route) must drive the immersive header's
  // title/subtitle/actions and, above all, `backHref` — the single most
  // likely defect: it must never loop the detail route's back button back
  // to itself.
  describe("immersive header", () => {
    it("list route: title is the section name, back goes to /chat, actions offer Add", () => {
      render(<Screen />);
      expect(screen.getByTestId(ImmersiveShellTestId.Title)).toHaveTextContent("Řetězce");
      expect(screen.getByTestId(ImmersivePageTestId.Back)).toHaveAttribute("href", "/chat");
      expect(screen.getByRole("button", { name: "Nový řetězec" })).toBeInTheDocument();
    });

    it("detail route: title is the chain's name, back goes to /chains, no Add action", () => {
      render(<Screen selectedId="research-then-build" />);
      expect(screen.getByTestId(ImmersiveShellTestId.Title)).toHaveTextContent("Research → Build");
      expect(screen.getByTestId(ImmersivePageTestId.Back)).toHaveAttribute("href", "/chains");
      expect(screen.queryByRole("button", { name: "Nový řetězec" })).not.toBeInTheDocument();
    });
  });
});
