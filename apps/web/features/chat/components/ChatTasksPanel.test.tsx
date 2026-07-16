import { renderWithProviders as render, screen, within } from "../../../test/render";
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

  it("lists active tasks (not finished ones) as selectable rows in the active List", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_a", title: "Fix login bug", status: "running" }),
        run({ runId: "run_b", title: "Draft release notes", status: "done" }),
        run({ runId: "run_c", title: "Deploy gate", status: "awaiting-approval" }),
      ],
    });
    render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

    // The finished `done` task is archived — only the two active tasks are rows
    // in the active `List`.
    const list = screen.getByTestId(ChatTasksPanelTestId.List);
    expect(within(list).getAllByTestId(ChatTaskRowTestId.Row)).toHaveLength(2);
    expect(within(list).getByText("Fix login bug")).toBeInTheDocument();
    expect(within(list).getByText("Deploy gate")).toBeInTheDocument();
    expect(within(list).queryByText("Draft release notes")).not.toBeInTheDocument();
  });

  it("orders live tasks (running/awaiting-approval) first, then waiting, within the active list", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_done", title: "Done task", status: "done" }),
        run({ runId: "run_sched", title: "Scheduled task", status: "scheduled" }),
        run({ runId: "run_live", title: "Live task", status: "running" }),
        run({ runId: "run_gate", title: "Gate task", status: "awaiting-approval" }),
      ],
    });
    render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

    // running + awaiting-approval are live (rank 0), then scheduled (waiting); the
    // finished `done` task isn't in the active list at all.
    const list = screen.getByTestId(ChatTasksPanelTestId.List);
    const titles = within(list)
      .getAllByText(/task$/i)
      .map((el) => el.textContent);
    expect(titles).toEqual(["Live task", "Gate task", "Scheduled task"]);
  });

  describe("Phase 123: archive of finished tasks", () => {
    it("moves finished tasks (done/error/interrupted/parked) behind the collapsed Archiv toggle", () => {
      runsMock.mockReturnValue({
        runs: [
          run({ runId: "run_live", title: "Live task", status: "running" }),
          run({ runId: "run_done", title: "Done task", status: "done" }),
          run({ runId: "run_err", title: "Errored task", status: "error" }),
          run({ runId: "run_int", title: "Interrupted task", status: "interrupted" }),
          run({ runId: "run_parked", title: "Parked task", status: "parked" }),
        ],
      });
      render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

      // Header count is active-only.
      expect(screen.getByTestId(ChatTasksPanelTestId.Root)).toHaveTextContent("1");
      const list = screen.getByTestId(ChatTasksPanelTestId.List);
      expect(within(list).getAllByTestId(ChatTaskRowTestId.Row)).toHaveLength(1);

      // Collapsed by default — the toggle shows the archived count, but no archived
      // rows are rendered yet.
      const toggle = screen.getByTestId(ChatTasksPanelTestId.ArchiveToggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveTextContent("4");
      expect(screen.queryByTestId(ChatTasksPanelTestId.ArchiveList)).not.toBeInTheDocument();
      expect(screen.queryByText("Done task")).not.toBeInTheDocument();

      // Expanding reveals all four archived cards.
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const archiveList = screen.getByTestId(ChatTasksPanelTestId.ArchiveList);
      expect(within(archiveList).getAllByTestId(ChatTaskRowTestId.Row)).toHaveLength(4);
      expect(within(archiveList).getByText("Done task")).toBeInTheDocument();
      expect(within(archiveList).getByText("Errored task")).toBeInTheDocument();
      expect(within(archiveList).getByText("Interrupted task")).toBeInTheDocument();
      expect(within(archiveList).getByText("Parked task")).toBeInTheDocument();

      // Collapses back on a second click.
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByTestId(ChatTasksPanelTestId.ArchiveList)).not.toBeInTheDocument();
    });

    it("keeps a paused-limit run ACTIVE — it auto-resumes mid-run, so it is not archived", () => {
      runsMock.mockReturnValue({
        runs: [run({ runId: "run_pl", title: "Rate-limited task", status: "paused-limit" })],
      });
      render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

      const list = screen.getByTestId(ChatTasksPanelTestId.List);
      expect(within(list).getByText("Rate-limited task")).toBeInTheDocument();
      expect(screen.queryByTestId(ChatTasksPanelTestId.ArchiveToggle)).not.toBeInTheDocument();
    });

    it("does not render the Archiv toggle when nothing is archived", () => {
      runsMock.mockReturnValue({
        runs: [run({ runId: "run_a", title: "Task A", status: "running" })],
      });
      render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

      expect(screen.queryByTestId(ChatTasksPanelTestId.ArchiveToggle)).not.toBeInTheDocument();
    });

    it("shows the quiet active-empty hint plus the Archiv toggle when everything is archived", () => {
      runsMock.mockReturnValue({
        runs: [run({ runId: "run_done", title: "Done task", status: "done" })],
      });
      render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

      expect(screen.getByTestId(ChatTasksPanelTestId.ActiveEmpty)).toBeInTheDocument();
      expect(screen.queryByTestId(ChatTasksPanelTestId.List)).not.toBeInTheDocument();
      expect(screen.getByTestId(ChatTasksPanelTestId.ArchiveToggle)).toBeInTheDocument();
      // The overall empty hint only covers "no tasks at all".
      expect(screen.queryByTestId(ChatTasksPanelTestId.Empty)).not.toBeInTheDocument();
    });

    it("selection parity: clicking an archived card fires onSelectRun and reads selected identically", () => {
      const onSelectRun = vi.fn();
      runsMock.mockReturnValue({
        runs: [run({ runId: "run_done", title: "Done task", status: "done" })],
      });
      const { rerender } = render(
        <ChatTasksPanel onSelectRun={onSelectRun} selectedRunId={null} />,
      );

      fireEvent.click(screen.getByTestId(ChatTasksPanelTestId.ArchiveToggle));
      const archiveList = screen.getByTestId(ChatTasksPanelTestId.ArchiveList);
      const row = within(archiveList).getByTestId(ChatTaskRowTestId.Row);
      fireEvent.click(row);
      expect(onSelectRun).toHaveBeenCalledWith("run_done");

      // `rerender` reconciles the same component instance — the archive stays
      // expanded (local `archiveOpen` state isn't reset by a prop change), so the
      // now-selected archived card is visible without clicking the toggle again.
      rerender(<ChatTasksPanel onSelectRun={onSelectRun} selectedRunId="run_done" />);
      const selectedRow = within(screen.getByTestId(ChatTasksPanelTestId.ArchiveList)).getByTestId(
        ChatTaskRowTestId.Row,
      );
      expect(selectedRow.className).toContain("border-accent");
    });
  });

  it("shows the quiet empty hint when there are no tasks", () => {
    runsMock.mockReturnValue({ runs: [] });
    render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

    expect(screen.getByTestId(ChatTasksPanelTestId.Empty)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatTasksPanelTestId.List)).not.toBeInTheDocument();
  });

  it("shows the localized header title and an active-only count", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_a", title: "Fix login bug", status: "running" }),
        run({ runId: "run_b", title: "Draft release notes", status: "done" }),
      ],
    });
    render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

    // Asserted via testid, not the translated copy: `chat.tasks.title`'s copy is
    // Task 7's to change (cs "Tasky" → "Běžící úlohy"), so this only asserts the
    // header title renders (whatever it currently says). The header count is
    // active-only (Phase 123) — one `running` task, the `done` one archived.
    expect(screen.getByTestId(ChatTasksPanelTestId.Title)).toBeInTheDocument();
    const list = screen.getByTestId(ChatTasksPanelTestId.List);
    expect(within(list).getAllByTestId(ChatTaskRowTestId.Row)).toHaveLength(1);
  });

  // Phase 108: no global project scope any more — every project's tasks (and
  // unattributed ones) show together, simultaneously.
  it("shows active tasks from every project at once", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_alpha", title: "Alpha task", status: "running", projectId: "alpha" }),
        run({
          runId: "run_beta",
          title: "Beta task",
          status: "awaiting-approval",
          projectId: "beta",
        }),
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
