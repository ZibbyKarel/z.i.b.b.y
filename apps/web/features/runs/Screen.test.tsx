import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders as render, screen } from "../../test/render";
import type { RunView } from "./run";
import { Screen } from "./Screen";

/**
 * Phase 24 scoping: the top-bar project is the single, always-set scope. A real
 * project renders ONLY runs attributed to it (`TaskRun.projectId`); `null`
 * ("Bez projektu") renders ONLY unattributed runs. There is no "show everything"
 * branch. The heavy child composites (TaskCard/RunDetail) are stubbed — this
 * suite proves the Screen-level filtering, not the cards.
 */
const { active } = vi.hoisted(() => ({
  active: { id: null as string | null },
}));
vi.mock("../projects", () => ({
  useProjectsQuery: () => ({
    data: [
      { id: "alpha", name: "Alpha" },
      { id: "beta", name: "Beta" },
    ],
  }),
  useActiveProject: () => ({ activeProjectId: active.id, setActiveProject: vi.fn() }),
  ProjectScopeChip: () => <span data-testid="project-scope-chip" />,
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

describe("Runs Screen — project scoping (Phase 24)", () => {
  beforeEach(() => {
    active.id = null;
    query.runs = RUNS;
    query.isPending = false;
    query.isError = false;
    refetch.mockClear();
  });

  it("renders only unattributed runs under 'Bez projektu' (default)", () => {
    render(<Screen />);
    expect(screen.queryByTestId("task-card-run-alpha")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-card-run-beta")).not.toBeInTheDocument();
    expect(screen.getByTestId("task-card-run-global")).toBeInTheDocument();
    // The chip is always shown — there is no "show everything" state to hide under.
    expect(screen.getByTestId("project-scope-chip")).toBeInTheDocument();
  });

  it("renders only the attributed runs with an active project, plus the scope chip", () => {
    active.id = "alpha";
    render(<Screen />);
    expect(screen.getByTestId("task-card-run-alpha")).toBeInTheDocument();
    // The other project's run and the unattributed run are scoped out.
    expect(screen.queryByTestId("task-card-run-beta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-card-run-global")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-scope-chip")).toBeInTheDocument();
  });
});

describe("Runs Screen — honest load states (Phase 18.2)", () => {
  beforeEach(() => {
    active.id = null;
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
