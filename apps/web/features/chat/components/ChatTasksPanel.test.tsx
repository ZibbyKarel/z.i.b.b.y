import { renderWithProviders as render, screen } from "../../../test/render";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunView } from "../../runs/run";
import { ChatTaskRowTestId } from "./ChatTaskRow";
import { ChatTasksPanel, ChatTasksPanelTestId } from "./ChatTasksPanel";

// Phase 92: the per-kind live views are heavy composites with their own data
// fetching — stubbed so this suite proves the panel's own expand/collapse wiring
// (which view mounts, with which runId, and that only one mounts at a time), not
// their internals (mirrors AktivitaTab's own test suite, phase 86).
vi.mock("../../runs/components/RunLogStream", () => ({
  RunLogStream: ({ runId }: { runId: string }) => (
    <div data-run-id={runId} data-testid="run-log-stream-stub" />
  ),
}));
vi.mock("../../runs/components/PipelineStageTimeline", () => ({
  PipelineStageTimeline: ({ pipelineRunId }: { pipelineRunId: string }) => (
    <div data-run-id={pipelineRunId} data-testid="stage-timeline-stub" />
  ),
}));
vi.mock("../../runs/components/ChainStepsPanel", () => ({
  ChainStepsPanel: ({ run }: { run: RunView }) => (
    <div data-run-id={run.runId} data-testid="chain-steps-stub" />
  ),
}));

// The panel reads the STABLE unified runs feed (not the chat data-layer); stub it
// and the active-project scope so each test controls exactly which tasks exist and
// under which engagement.
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

describe("ChatTasksPanel (Phase 57)", () => {
  beforeEach(() => {
    runsMock.mockReset();
    activeProjectMock.mockReset();
    activeProjectMock.mockReturnValue({ activeProjectId: null, setActiveProject: vi.fn() });
  });

  it("lists ALL tasks in scope — not just running — each linking to /runs", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_a", title: "Fix login bug", status: "running" }),
        run({ runId: "run_b", title: "Draft release notes", status: "done" }),
        run({ runId: "run_c", title: "Deploy gate", status: "awaiting-approval" }),
      ],
    });
    render(<ChatTasksPanel />);

    const rows = screen.getAllByTestId(ChatTaskRowTestId.Link);
    // The finished `done` task is history, but this panel is a full task view now.
    expect(rows).toHaveLength(3);
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    expect(screen.getByText("Draft release notes")).toBeInTheDocument();
    expect(screen.getByText("Deploy gate")).toBeInTheDocument();
  });

  it("orders live tasks (running/awaiting-approval) first, then waiting, then finished", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_done", title: "Done task", status: "done" }),
        run({ runId: "run_sched", title: "Scheduled task", status: "scheduled" }),
        run({ runId: "run_live", title: "Live task", status: "running" }),
        run({ runId: "run_gate", title: "Gate task", status: "awaiting-approval" }),
      ],
    });
    render(<ChatTasksPanel />);

    const rows = screen.getAllByTestId(ChatTaskRowTestId.Link);
    // running + awaiting-approval are live (rank 0), then scheduled (waiting), then done.
    expect(rows[0]).toHaveAttribute("href", "/runs?run=run_live");
    expect(rows[1]).toHaveAttribute("href", "/runs?run=run_gate");
    expect(rows[2]).toHaveAttribute("href", "/runs?run=run_sched");
    expect(rows[3]).toHaveAttribute("href", "/runs?run=run_done");
  });

  it("shows the quiet empty hint when the scope has no tasks", () => {
    runsMock.mockReturnValue({ runs: [] });
    render(<ChatTasksPanel />);

    expect(screen.getByTestId(ChatTasksPanelTestId.Empty)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatTasksPanelTestId.List)).not.toBeInTheDocument();
  });

  it("scopes to the active project (a real project shows only its own tasks)", () => {
    activeProjectMock.mockReturnValue({ activeProjectId: "alpha", setActiveProject: vi.fn() });
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_alpha", title: "Alpha task", status: "running", projectId: "alpha" }),
        run({ runId: "run_beta", title: "Beta task", status: "done", projectId: "beta" }),
        run({ runId: "run_none", title: "Loose task", status: "running" }),
      ],
    });
    render(<ChatTasksPanel />);

    const rows = screen.getAllByTestId(ChatTaskRowTestId.Link);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/runs?run=run_alpha");
    expect(screen.getByText("Alpha task")).toBeInTheDocument();
    expect(screen.queryByText("Beta task")).not.toBeInTheDocument();
  });

  it("scopes to unattributed tasks when no project is active (Bez projektu)", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_loose", title: "Loose task", status: "done" }),
        run({ runId: "run_alpha", title: "Alpha task", status: "running", projectId: "alpha" }),
      ],
    });
    render(<ChatTasksPanel />);

    const rows = screen.getAllByTestId(ChatTaskRowTestId.Link);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/runs?run=run_loose");
  });

  describe("Phase 92: inline expansion", () => {
    it("expands an agent row to RunLogStream with its runId; the row link is untouched", () => {
      runsMock.mockReturnValue({
        runs: [run({ runId: "run_agent", kind: "agent", title: "Agent task", logBase: "agents" })],
      });
      render(<ChatTasksPanel />);

      expect(screen.queryByTestId("run-log-stream-stub")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId(ChatTaskRowTestId.Expand));
      const stub = screen.getByTestId("run-log-stream-stub");
      expect(stub).toHaveAttribute("data-run-id", "run_agent");
      // The row's own navigation link is unchanged by expanding.
      expect(screen.getByTestId(ChatTaskRowTestId.Link)).toHaveAttribute(
        "href",
        "/runs?run=run_agent",
      );
    });

    it("expands a pipeline row to PipelineStageTimeline with its runId", () => {
      runsMock.mockReturnValue({
        runs: [run({ runId: "run_pipe", kind: "pipeline", title: "Pipeline task" })],
      });
      render(<ChatTasksPanel />);

      fireEvent.click(screen.getByTestId(ChatTaskRowTestId.Expand));
      expect(screen.getByTestId("stage-timeline-stub")).toHaveAttribute(
        "data-run-id",
        "run_pipe",
      );
    });

    it("expands a chain row to ChainStepsPanel with its runId", () => {
      runsMock.mockReturnValue({
        runs: [run({ runId: "run_chain", kind: "chain", title: "Chain task" })],
      });
      render(<ChatTasksPanel />);

      fireEvent.click(screen.getByTestId(ChatTaskRowTestId.Expand));
      expect(screen.getByTestId("chain-steps-stub")).toHaveAttribute(
        "data-run-id",
        "run_chain",
      );
    });

    it("done/parked rows expand too — the finished log still renders", () => {
      runsMock.mockReturnValue({
        runs: [run({ runId: "run_done", kind: "agent", title: "Done task", status: "done" })],
      });
      render(<ChatTasksPanel />);

      fireEvent.click(screen.getByTestId(ChatTaskRowTestId.Expand));
      expect(screen.getByTestId("run-log-stream-stub")).toHaveAttribute(
        "data-run-id",
        "run_done",
      );
    });

    it("second expand collapses the first (accordion) — only one view mounted at a time", () => {
      runsMock.mockReturnValue({
        runs: [
          run({ runId: "run_a", kind: "agent", title: "Task A", status: "running" }),
          run({ runId: "run_b", kind: "pipeline", title: "Task B", status: "running" }),
        ],
      });
      render(<ChatTasksPanel />);

      const chevrons = screen.getAllByTestId(ChatTaskRowTestId.Expand);
      fireEvent.click(chevrons[0]!);
      expect(screen.getByTestId("run-log-stream-stub")).toHaveAttribute("data-run-id", "run_a");
      expect(screen.queryByTestId("stage-timeline-stub")).not.toBeInTheDocument();

      fireEvent.click(chevrons[1]!);
      expect(screen.queryByTestId("run-log-stream-stub")).not.toBeInTheDocument();
      expect(screen.getByTestId("stage-timeline-stub")).toHaveAttribute("data-run-id", "run_b");
    });

    it("clicking the expanded chevron again collapses it and unmounts the view", () => {
      runsMock.mockReturnValue({
        runs: [run({ runId: "run_agent", kind: "agent", title: "Agent task", status: "running" })],
      });
      render(<ChatTasksPanel />);

      const chevron = screen.getByTestId(ChatTaskRowTestId.Expand);
      fireEvent.click(chevron);
      expect(screen.getByTestId("run-log-stream-stub")).toBeInTheDocument();

      fireEvent.click(chevron);
      expect(screen.queryByTestId("run-log-stream-stub")).not.toBeInTheDocument();
    });

    it("a goal/scheduled row renders no chevron at all (no inline view exists for it)", () => {
      runsMock.mockReturnValue({
        runs: [
          run({ runId: "run_goal", kind: "goal", title: "Goal task", status: "running" }),
          run({ runId: "run_sched", kind: "scheduled", title: "Scheduled task", status: "scheduled" }),
        ],
      });
      render(<ChatTasksPanel />);

      expect(screen.queryByTestId(ChatTaskRowTestId.Expand)).not.toBeInTheDocument();
    });
  });
});
