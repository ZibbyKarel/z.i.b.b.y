import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunView } from "../../runs/run";
import { ChatRunningTaskRowTestId } from "./ChatRunningTaskRow";
import { ChatRunningTasks, ChatRunningTasksTestId } from "./ChatRunningTasks";

// The rail reads the STABLE unified runs feed (not the chat data-layer); stub it
// and the active-project scope so each test controls exactly which runs are live
// and under which engagement.
const { runsMock, activeProjectMock } = vi.hoisted(() => ({
  runsMock: vi.fn(() => ({ runs: [] as RunView[] })),
  activeProjectMock: vi.fn(() => ({
    activeProjectId: null as string | null,
    setActiveProject: vi.fn(),
  })),
}));
vi.mock("../../runs/queries/useRunsQuery", () => ({
  useRunsQuery: () => runsMock(),
  useRunGlyphMap: () => new Map(),
  useRunAvatarMap: () => new Map(),
}));
vi.mock("../../projects", () => ({
  useActiveProject: () => activeProjectMock(),
}));

function run(overrides: Partial<RunView>): RunView {
  const base: RunView = {
    runId: "r_1",
    kind: "agent",
    owner: "writer",
    status: "running",
    pct: null,
    title: "",
    prompt: "",
    project: "",
    startedAt: new Date().toISOString(),
    logBase: "agents",
  };
  return { ...base, ...overrides };
}

describe("ChatRunningTasks (Phase 44)", () => {
  beforeEach(() => {
    runsMock.mockReset();
    activeProjectMock.mockReset();
    activeProjectMock.mockReturnValue({ activeProjectId: null, setActiveProject: vi.fn() });
  });

  it("lists only active runs (running/pending/awaiting-approval) and links each to /runs", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_a", title: "Fix login bug", status: "running" }),
        run({ runId: "run_b", title: "Draft release notes", status: "done" }),
        run({ runId: "run_c", title: "Deploy gate", status: "awaiting-approval" }),
      ],
    });
    render(<ChatRunningTasks />);

    const rows = screen.getAllByTestId(ChatRunningTaskRowTestId.Link);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("href", "/runs?run=run_a");
    expect(rows[1]).toHaveAttribute("href", "/runs?run=run_c");
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    // The `done` run is history, not "running" — it must not appear on the rail.
    expect(screen.queryByText("Draft release notes")).not.toBeInTheDocument();
  });

  it("shows the quiet empty hint when nothing is running", () => {
    runsMock.mockReturnValue({ runs: [run({ status: "done" })] });
    render(<ChatRunningTasks />);

    expect(screen.getByTestId(ChatRunningTasksTestId.Empty)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatRunningTasksTestId.List)).not.toBeInTheDocument();
  });

  it("scopes to the active project (a real project shows only its own runs)", () => {
    activeProjectMock.mockReturnValue({ activeProjectId: "alpha", setActiveProject: vi.fn() });
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_alpha", title: "Alpha task", status: "running", projectId: "alpha" }),
        run({ runId: "run_beta", title: "Beta task", status: "running", projectId: "beta" }),
        run({ runId: "run_none", title: "Loose task", status: "running" }),
      ],
    });
    render(<ChatRunningTasks />);

    const rows = screen.getAllByTestId(ChatRunningTaskRowTestId.Link);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/runs?run=run_alpha");
    expect(screen.getByText("Alpha task")).toBeInTheDocument();
    expect(screen.queryByText("Beta task")).not.toBeInTheDocument();
  });

  it("scopes to unattributed runs when no project is active (Bez projektu)", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_loose", title: "Loose task", status: "running" }),
        run({ runId: "run_alpha", title: "Alpha task", status: "running", projectId: "alpha" }),
      ],
    });
    render(<ChatRunningTasks />);

    const rows = screen.getAllByTestId(ChatRunningTaskRowTestId.Link);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/runs?run=run_loose");
  });
});
