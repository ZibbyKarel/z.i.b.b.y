import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders as render, screen, within } from "../../test/render";
import type { RunView } from "./run";
import { Screen } from "./Screen";

/**
 * Phase 108: there is no global project view-scope any more — the runs feed
 * always shows every project's runs at once. Per-project drill-down is restored
 * via an explicit `?project=<id>` URL param (the pre-Phase-24 mechanism):
 * present, it filters to that project and shows a clearable filter tag; absent,
 * every run shows. The heavy child composites (TaskCard/RunDetail) are stubbed —
 * this suite proves the Screen-level filtering, not the cards.
 */
const { searchParams } = vi.hoisted(() => ({
  searchParams: { value: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

vi.mock("../projects", () => ({
  useProjectsQuery: () => ({
    data: [
      { id: "alpha", name: "Alpha" },
      { id: "beta", name: "Beta" },
    ],
  }),
}));

const RUNS: RunView[] = [
  makeRun("run-alpha", "alpha"),
  makeRun("run-beta", "beta"),
  makeRun("run-global"),
];

const { query } = vi.hoisted(() => ({
  query: { runs: [] as RunView[], isPending: false, isError: false },
}));
const refetch = vi.fn();
vi.mock("./queries/useRunsQuery", () => ({
  useRunsQuery: () => ({
    runs: query.runs,
    isPending: query.isPending,
    isError: query.isError,
    refetch,
  }),
  useRunGlyphMap: () => new Map(),
  useRunAvatarMap: () => new Map(),
}));

vi.mock("./mutations", () => ({
  useStopTaskRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAgentRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePipelineRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useResumeTaskRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../tasks", () => ({
  useCancelScheduledTaskMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./components/TaskCard", () => ({
  TaskCard: ({ run }: { run: RunView }) => <div data-testid={`task-card-${run.runId}`} />,
}));
vi.mock("./components/RunDetail", () => ({ RunDetail: () => null }));

function makeRun(id: string, projectId?: string): RunView {
  return {
    runId: id,
    kind: "agent",
    owner: "koder",
    status: "done",
    pct: 100,
    title: `Task ${id}`,
    prompt: "",
    project: "",
    startedAt: "2026-07-05T08:00:00.000Z",
    logBase: "agents",
    ...(projectId !== undefined ? { projectId } : {}),
  };
}

describe("Runs Screen — every project at once (Phase 108)", () => {
  beforeEach(() => {
    searchParams.value = new URLSearchParams();
    query.runs = RUNS;
    query.isPending = false;
    query.isError = false;
    refetch.mockClear();
  });

  it("shows runs from every project simultaneously by default — no filter tag", () => {
    render(<Screen />);
    expect(screen.getByTestId("task-card-run-alpha")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-run-beta")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-run-global")).toBeInTheDocument();
    expect(screen.queryByTestId("runs-project-filter")).not.toBeInTheDocument();
  });

  it("filters to the ?project= param and shows a clearable filter tag naming it", () => {
    searchParams.value = new URLSearchParams("project=alpha");
    render(<Screen />);
    expect(screen.getByTestId("task-card-run-alpha")).toBeInTheDocument();
    expect(screen.queryByTestId("task-card-run-beta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-card-run-global")).not.toBeInTheDocument();

    const filterTag = screen.getByTestId("runs-project-filter");
    expect(filterTag).toHaveTextContent("Alpha");
  });

  it("the filter tag's clear control links back to /runs", () => {
    searchParams.value = new URLSearchParams("project=alpha");
    render(<Screen />);
    const filterTag = screen.getByTestId("runs-project-filter");
    expect(within(filterTag).getByRole("link")).toHaveAttribute("href", "/runs");
  });
});

describe("Runs Screen — honest load states (Phase 18.2)", () => {
  beforeEach(() => {
    searchParams.value = new URLSearchParams();
    query.runs = [];
    query.isPending = false;
    query.isError = false;
    refetch.mockClear();
  });

  it("shows the loading state while the feed is pending, not the empty-feed message", () => {
    query.isPending = true;
    render(<Screen />);
    expect(screen.getByText("Načítání…")).toBeInTheDocument();
    expect(screen.queryByText("Žádné běhy")).not.toBeInTheDocument();
  });

  it("shows the error state (with retry) when the feed fails — never an empty feed", () => {
    query.isError = true;
    render(<Screen />);
    expect(screen.getByText("Nepodařilo se načíst")).toBeInTheDocument();
    expect(screen.queryByText("Žádné běhy")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Zkusit znovu"));
    expect(refetch).toHaveBeenCalled();
  });
});
