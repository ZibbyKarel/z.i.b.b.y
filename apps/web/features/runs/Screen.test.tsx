import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../test/render";
import type { RunView } from "./run";
import { Screen } from "./Screen";

/**
 * Fáze 11 scoping: with an active project the feed renders ONLY runs attributed
 * to it (`TaskRun.projectId`); unattributed runs show only under "Všechny
 * projekty". The heavy child composites (TaskCard/RunDetail) are stubbed — this
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
  ProjectScopeChip: () =>
    active.id !== null ? <span data-testid="project-scope-chip" /> : null,
}));

const RUNS: RunView[] = [
  makeRun("run-alpha", "alpha"),
  makeRun("run-beta", "beta"),
  makeRun("run-global"),
];
vi.mock("./queries/useRunsQuery", () => ({
  useRunsQuery: () => ({ runs: RUNS }),
  useRunGlyphMap: () => new Map(),
}));

vi.mock("./mutations", () => ({
  useStopAgentMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAgentRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePipelineRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
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

describe("Runs Screen — project scoping (Fáze 11)", () => {
  beforeEach(() => {
    active.id = null;
  });

  it("renders every run (attributed or not) under 'Všechny projekty'", () => {
    render(<Screen />);
    expect(screen.getByTestId("task-card-run-alpha")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-run-beta")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-run-global")).toBeInTheDocument();
    expect(screen.queryByTestId("project-scope-chip")).not.toBeInTheDocument();
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
