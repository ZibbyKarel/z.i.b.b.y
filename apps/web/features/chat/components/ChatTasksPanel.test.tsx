import { renderWithProviders as render, screen } from "../../../test/render";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunView } from "../../runs/run";
import { ChatTaskRowTestId } from "./ChatTaskRow";
import { ChatTasksPanel, ChatTasksPanelTestId } from "./ChatTasksPanel";

// The panel reads the STABLE unified runs feed (not the chat data-layer); stub it
// so each test controls exactly which tasks exist.
const { runsMock } = vi.hoisted(() => ({
  runsMock: vi.fn(() => ({ runs: [] as RunView[] })),
}));
vi.mock("../../runs/queries/useRunsQuery", () => ({
  useRunsQuery: () => runsMock(),
  useRunGlyphMap: () => new Map(),
  useRunAvatarMap: () => new Map(),
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

describe("ChatTasksPanel (Phase 57, selection wiring Phase 100)", () => {
  beforeEach(() => {
    runsMock.mockReset();
  });

  it("lists ALL tasks — not just running — each a selectable row", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_a", title: "Fix login bug", status: "running" }),
        run({ runId: "run_b", title: "Draft release notes", status: "done" }),
        run({ runId: "run_c", title: "Deploy gate", status: "awaiting-approval" }),
      ],
    });
    render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

    const rows = screen.getAllByTestId(ChatTaskRowTestId.Row);
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
    render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

    // running + awaiting-approval are live (rank 0), then scheduled (waiting), then done.
    expect(screen.getByText("Live task")).toBeInTheDocument();
    const titles = screen.getAllByText(/task$/i).map((el) => el.textContent);
    expect(titles).toEqual(["Live task", "Gate task", "Scheduled task", "Done task"]);
  });

  it("shows the quiet empty hint when there are no tasks", () => {
    runsMock.mockReturnValue({ runs: [] });
    render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

    expect(screen.getByTestId(ChatTasksPanelTestId.Empty)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatTasksPanelTestId.List)).not.toBeInTheDocument();
  });

  it("shows the localized header title and a count of every listed task", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_a", title: "Fix login bug", status: "running" }),
        run({ runId: "run_b", title: "Draft release notes", status: "done" }),
      ],
    });
    render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

    // Asserted via testid, not the translated copy: `chat.tasks.title`'s copy is
    // Task 7's to change (cs "Tasky" → "Běžící úlohy"), so this only asserts the
    // header title renders (whatever it currently says), plus the row count.
    expect(screen.getByTestId(ChatTasksPanelTestId.Title)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTasksPanelTestId.Root)).toHaveTextContent("2");
  });

  // Phase 108: no global project scope any more — every project's tasks (and
  // unattributed ones) show together, simultaneously.
  it("shows tasks from every project at once", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_alpha", title: "Alpha task", status: "running", projectId: "alpha" }),
        run({ runId: "run_beta", title: "Beta task", status: "done", projectId: "beta" }),
        run({ runId: "run_none", title: "Loose task", status: "running" }),
      ],
    });
    render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

    expect(screen.getAllByTestId(ChatTaskRowTestId.Row)).toHaveLength(3);
    expect(screen.getByText("Alpha task")).toBeInTheDocument();
    expect(screen.getByText("Beta task")).toBeInTheDocument();
    expect(screen.getByText("Loose task")).toBeInTheDocument();
  });

  describe("Phase 100: selection (replaces the old expand-chevron accordion)", () => {
    it("clicking a row fires onSelectRun with that run's id", () => {
      const onSelectRun = vi.fn();
      runsMock.mockReturnValue({
        runs: [
          run({ runId: "run_a", title: "Task A", status: "running" }),
          run({ runId: "run_b", title: "Task B", status: "running" }),
        ],
      });
      render(<ChatTasksPanel onSelectRun={onSelectRun} selectedRunId={null} />);

      const rows = screen.getAllByTestId(ChatTaskRowTestId.Row);
      fireEvent.click(rows[1]!);
      expect(onSelectRun).toHaveBeenCalledWith("run_b");
    });

    it("marks the row matching `selectedRunId` as selected, and no other row", () => {
      runsMock.mockReturnValue({
        runs: [
          run({ runId: "run_a", title: "Task A", status: "running" }),
          run({ runId: "run_b", title: "Task B", status: "running" }),
        ],
      });
      render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId="run_b" />);

      const rows = screen.getAllByTestId(ChatTaskRowTestId.Row);
      expect(rows[0]?.className).not.toContain("border-accent");
      expect(rows[1]?.className).toContain("border-accent");
    });

    it("there is no separate expand chevron any more — the row itself is the only affordance", () => {
      runsMock.mockReturnValue({
        runs: [run({ runId: "run_a", kind: "agent", title: "Agent task", status: "running" })],
      });
      render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

      expect(screen.queryByTestId("chat-task-row-expand")).not.toBeInTheDocument();
    });
  });
});
