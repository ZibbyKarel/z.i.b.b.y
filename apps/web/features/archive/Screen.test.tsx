import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../test/render";
import type { RunView } from "../runs/run";
import { ArchiveSubsystemFilterTestId } from "./components/ArchiveSubsystemFilter";
import { Screen } from "./Screen";

/**
 * F2 (`docs/plans/hud2chat-F2-archive.md`): the `/archiv` page's own Screen-level
 * wiring — search, the subsystem multi-select, `?run=` deep-link selection, and the
 * honest empty states. Search/subsystem filtering and pagination all run server-side
 * now (`TaskRunsService.listArchivedTaskRuns`/`getArchiveCounts`), so this suite mocks
 * `./queries` and asserts the WIRING (the debounced search value and the subsystem
 * selection reach the query hooks; rows render whatever the (mocked) hook returns) —
 * the actual filter/sort/cursor logic is unit-tested in
 * `apps/api/src/tasks/task-runs.service.test.ts`. `ArchiveRow`/`ArchiveSubsystemFilter`
 * are exercised for real (each already has its own focused unit suite); only
 * `RunDetail` — a heavy, already-tested composite — is stubbed, mirroring the runs
 * `Screen.test.tsx`'s own `vi.mock("./components/RunDetail", …)`.
 */
const { searchParams } = vi.hoisted(() => ({
  searchParams: { value: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    items: [] as RunView[],
    itemsPending: false,
    itemsError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    counts: {} as Record<string, number>,
    total: 0,
    countsPending: false,
    countsError: false,
    pipelines: [] as { id: string; ownerSubsystem?: string }[],
  },
}));
const refetchItems = vi.fn();
const refetchCounts = vi.fn();
const fetchNextPage = vi.fn();
const archiveRunsArgs = vi.fn();
const archiveCountsArgs = vi.fn();

vi.mock("./queries", () => ({
  useArchiveRunsInfiniteQuery: (args: unknown) => {
    archiveRunsArgs(args);
    return {
      data: hooks.items,
      isPending: hooks.itemsPending,
      isError: hooks.itemsError,
      refetch: refetchItems,
      fetchNextPage,
      hasNextPage: hooks.hasNextPage,
      isFetchingNextPage: hooks.isFetchingNextPage,
    };
  },
  useArchiveCountsQuery: (search: string) => {
    archiveCountsArgs(search);
    return {
      data: { counts: hooks.counts, total: hooks.total },
      isPending: hooks.countsPending,
      isError: hooks.countsError,
      refetch: refetchCounts,
    };
  },
}));
vi.mock("../runs/queries/useRunsQuery", () => ({
  useRunGlyphMap: () => new Map(),
  useRunAvatarMap: () => new Map(),
}));
vi.mock("../pipelines", () => ({ usePipelinesQuery: () => ({ data: hooks.pipelines }) }));

vi.mock("../runs/mutations", () => ({
  useStopTaskRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAgentRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePipelineRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useResumeTaskRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../tasks", () => ({
  useCancelScheduledTaskMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../runs/components/RunDetail", () => ({
  RunDetail: ({ run }: { run: RunView }) => <div data-testid={`run-detail-${run.runId}`} />,
}));
// The single-run fallback for a `?run=` this (settled-only) feed doesn't contain —
// e.g. the roadmap item dialog linking an issue to a run still in flight.
// `directRunFor` records the id it was asked for, so a test can assert the query is
// GATED OFF when the feed resolved the selection itself.
const { directRun } = vi.hoisted(() => ({
  directRun: { value: undefined as RunView | undefined },
}));
const directRunFor = vi.fn();
vi.mock("../runs/queries/useTaskRunQuery", () => ({
  useTaskRunQuery: (runId: string | null) => {
    directRunFor(runId);
    return { data: runId === null ? undefined : directRun.value };
  },
}));

function run(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: "r_1",
    kind: "pipeline",
    owner: "delivery",
    status: "done",
    pct: null,
    title: "Ship the release",
    prompt: "",
    project: "billing-svc",
    startedAt: "2020-01-01T08:00:00.000Z",
    logBase: null,
    ...overrides,
  };
}

describe("Archive Screen (F2)", () => {
  beforeEach(() => {
    searchParams.value = new URLSearchParams();
    hooks.items = [];
    hooks.itemsPending = false;
    hooks.itemsError = false;
    hooks.hasNextPage = false;
    hooks.isFetchingNextPage = false;
    hooks.counts = {};
    hooks.total = 0;
    hooks.countsPending = false;
    hooks.countsError = false;
    hooks.pipelines = [{ id: "delivery", ownerSubsystem: "forge" }];
    refetchItems.mockClear();
    refetchCounts.mockClear();
    fetchNextPage.mockClear();
    archiveRunsArgs.mockClear();
    archiveCountsArgs.mockClear();
    directRun.value = undefined;
    directRunFor.mockClear();
  });

  it("renders the (server-sorted) items flat, with no group headings", () => {
    hooks.items = [
      run({ runId: "run-a", title: "Ship the release" }),
      run({ runId: "run-b", kind: "agent", owner: "writer", title: "Agent task" }),
    ];
    hooks.total = 2;
    render(<Screen />);

    expect(screen.getByText("Ship the release")).toBeInTheDocument();
    expect(screen.getByText("Agent task")).toBeInTheDocument();
  });

  it("debounces the search box before it reaches the server query", async () => {
    hooks.items = [run({ runId: "run-a", title: "Ship the release" })];
    hooks.total = 1;
    render(<Screen />);
    archiveRunsArgs.mockClear();

    fireEvent.change(screen.getByLabelText("Hledat v archivu"), {
      target: { value: "billing" },
    });
    expect(archiveRunsArgs).not.toHaveBeenCalledWith(
      expect.objectContaining({ search: "billing" }),
    );

    await waitFor(() =>
      expect(archiveRunsArgs).toHaveBeenCalledWith(expect.objectContaining({ search: "billing" })),
    );
  });

  it("passes the subsystem multi-select's selection through to the server query", () => {
    hooks.items = [run({ runId: "run-a", title: "Forge task" })];
    hooks.total = 1;
    hooks.counts = { forge: 1 };
    render(<Screen />);

    fireEvent.click(screen.getByTestId(ArchiveSubsystemFilterTestId.Trigger));
    const options = screen.getAllByTestId(ArchiveSubsystemFilterTestId.Option);
    const forgeOption = options.find((el) => el.getAttribute("data-subsystem-id") === "forge");
    expect(forgeOption).toBeDefined();
    fireEvent.click(within(forgeOption!).getByText("Forge"));

    expect(archiveRunsArgs).toHaveBeenLastCalledWith(
      expect.objectContaining({ subsystems: ["forge"] }),
    );
  });

  it("selects the run named by ?run= and renders its detail", () => {
    searchParams.value = new URLSearchParams("run=run-b");
    hooks.items = [
      run({ runId: "run-a", title: "Ship the release" }),
      run({ runId: "run-b", title: "Rotate secrets" }),
    ];
    hooks.total = 2;
    render(<Screen />);

    expect(screen.getByTestId("run-detail-run-b")).toBeInTheDocument();
    // Resolved from the feed — the single-run fallback stays gated off.
    expect(directRunFor).toHaveBeenCalledWith(null);
  });

  describe("?run= for a run this (settled-only) feed doesn't contain", () => {
    it("resolves it directly instead of silently selecting the newest archived row", () => {
      searchParams.value = new URLSearchParams("run=live_1");
      hooks.items = [run({ runId: "run-a", title: "Ship the release" })];
      hooks.total = 1;
      directRun.value = run({ runId: "live_1", status: "running", title: "In flight" });
      render(<Screen />);

      expect(screen.getByTestId("run-detail-live_1")).toBeInTheDocument();
      expect(screen.queryByTestId("run-detail-run-a")).not.toBeInTheDocument();
      expect(directRunFor).toHaveBeenCalledWith("live_1");
    });

    it("matches on taskId too, so a queued release's link resolves from the feed", () => {
      searchParams.value = new URLSearchParams("run=task-7");
      hooks.items = [run({ runId: "run-a", taskId: "task-7", title: "Ship the release" })];
      hooks.total = 1;
      render(<Screen />);

      expect(screen.getByTestId("run-detail-run-a")).toBeInTheDocument();
      expect(directRunFor).toHaveBeenCalledWith(null);
    });

    it("shows no detail at all when the id resolves nowhere (never the wrong run)", () => {
      searchParams.value = new URLSearchParams("run=gone");
      hooks.items = [run({ runId: "run-a", title: "Ship the release" })];
      hooks.total = 1;
      render(<Screen />);

      expect(screen.queryByTestId("run-detail-run-a")).not.toBeInTheDocument();
      expect(screen.queryByTestId("run-detail-gone")).not.toBeInTheDocument();
    });
  });

  it("clicking a row selects it and swaps the detail pane", () => {
    hooks.items = [
      run({ runId: "run-a", title: "Ship the release" }),
      run({ runId: "run-b", title: "Rotate secrets" }),
    ];
    hooks.total = 2;
    render(<Screen />);

    expect(screen.getByTestId("run-detail-run-a")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Rotate secrets"));
    expect(screen.getByTestId("run-detail-run-b")).toBeInTheDocument();
    expect(screen.queryByTestId("run-detail-run-a")).not.toBeInTheDocument();
  });

  it("shows the select hint (no run selected) when the archive is empty", () => {
    hooks.items = [];
    hooks.total = 0;
    render(<Screen />);

    expect(screen.getByText("Archiv je zatím prázdný")).toBeInTheDocument();
    expect(screen.getByText("Vyber úlohu vlevo pro zobrazení detailu.")).toBeInTheDocument();
  });

  it("shows the filtered-empty message when the current filter matches nothing, without an empty-archive message", () => {
    hooks.items = [];
    hooks.total = 3; // the archive itself isn't empty — just this search/filter combo
    render(<Screen />);

    expect(screen.getByText("Nic nenalezeno.")).toBeInTheDocument();
    expect(screen.queryByText("Archiv je zatím prázdný")).not.toBeInTheDocument();
  });

  it("shows the loading state while either query is pending", () => {
    hooks.itemsPending = true;
    render(<Screen />);
    expect(screen.getByText("Načítání…")).toBeInTheDocument();
  });

  it("shows the error state (with retry) when either query fails", () => {
    hooks.itemsError = true;
    render(<Screen />);
    expect(screen.getByText("Nepodařilo se načíst")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Zkusit znovu"));
    expect(refetchItems).toHaveBeenCalled();
    expect(refetchCounts).toHaveBeenCalled();
  });

  /**
   * Phase 126e: pins the exact symptom the real `/archiv` bug produced — the items
   * query 404ing (the `/tasks/runs/archive` route-collision fixed in
   * `task-runs.contract.ts`) while the counts query succeeds. `isError` is
   * `itemsError || countsError` (`Screen.tsx`), so a counts-only success still
   * renders the full-page `QueryError`, not a partial page. This is exactly what
   * every OTHER archive test's API-client mocks hid: they never exercised the real
   * route, so a green suite here meant nothing about the live 404.
   */
  it("renders QueryError when only the items query fails and counts succeeds (the real bug's shape)", () => {
    hooks.itemsError = true;
    hooks.countsError = false;
    hooks.counts = { forge: 3 };
    hooks.total = 3;
    render(<Screen />);
    expect(screen.getByText("Nepodařilo se načíst")).toBeInTheDocument();
  });
});
