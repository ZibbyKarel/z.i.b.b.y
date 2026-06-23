import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { RunView } from "../run";
import { RunDetail } from "./RunDetail";

// No run is on the approval gate in these cases — an empty queue keeps the header
// in its plain (no severity/risk) form.
vi.mock("../../approvals/queries", () => ({ useApprovalsQuery: () => ({ data: [] }) }));
// A pipeline run's body is the stage timeline; stub it so this test focuses on the
// header + meta strip (the timeline has its own test).
vi.mock("./PipelineStageTimeline", () => ({
  PipelineStageTimeline: () => <div data-testid="stage-timeline" />,
}));
// The output panel's "continue in a new task" reads the New Task provider; these
// header/meta tests render RunDetail in isolation, so stub it with a shared spy.
const { openNewTask } = vi.hoisted(() => ({ openNewTask: vi.fn() }));
vi.mock("../../tasks/TaskContext", () => ({
  useNewTask: () => ({ open: openNewTask, close: vi.fn(), isOpen: false }),
}));

const LONG_DESC =
  "Refaktoruj detail běhu pipeliny tak, aby nezobrazoval název úkolu dvakrát, " +
  "ukázal přiřazenou pipelinu a přidal sbalitelný popis úkolu s tlačítkem zobrazit " +
  "více; po rozbalení nabídni zobrazit méně a dej pozor na zachování všech ostatních " +
  "informací v hlavičce běhu i v časové ose jednotlivých fází.";

const pipelineRun: RunView = {
  runId: "delivery_42",
  kind: "pipeline",
  owner: "delivery",
  status: "running",
  pct: null,
  title: "",
  prompt: "fáze: build",
  project: "z.i.b.b.y",
  startedAt: new Date("2026-06-14T10:00:00Z").toISOString(),
  logBase: null,
  taskTitle: "Oprav detail běhu",
  taskText: LONG_DESC,
  stageRuns: [],
};

const renderDetail = (run: RunView = pipelineRun) =>
  render(
    <RunDetail
      deleting={false}
      glyph="flow"
      now={Date.parse("2026-06-14T10:05:00Z")}
      onDelete={() => {}}
      onStop={() => {}}
      run={run}
      stopping={false}
    />,
  );

describe("RunDetail — pipeline header", () => {
  it("shows the task name once (headline only, not repeated as a meta cell)", () => {
    renderDetail();
    expect(screen.getAllByText("Oprav detail běhu")).toHaveLength(1);
  });

  it("surfaces the assigned pipeline and drops the redundant type cell", () => {
    renderDetail();
    expect(screen.getByText("pipelina")).toBeInTheDocument();
    expect(screen.getByText("delivery")).toBeInTheDocument();
    // "typ" (kind) cell is gone — kind still reads in the mono id line, not a cell.
    expect(screen.queryByText("typ")).not.toBeInTheDocument();
  });

  it("shows a collapsed description that expands and collapses", async () => {
    renderDetail();
    // Collapsed: an ellipsis preview, full text hidden behind "show more".
    expect(screen.queryByText(LONG_DESC)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("zobrazit více"));
    expect(screen.getByText(LONG_DESC)).toBeInTheDocument();
    await userEvent.click(screen.getByText("zobrazit méně"));
    expect(screen.queryByText(LONG_DESC)).not.toBeInTheDocument();
  });
});

describe("RunDetail — task output", () => {
  const doneWithPr: RunView = {
    runId: "writer_7",
    kind: "agent",
    owner: "writer",
    status: "done",
    pct: null,
    title: "",
    prompt: "",
    project: "z.i.b.b.y",
    startedAt: new Date("2026-06-14T10:00:00Z").toISOString(),
    logBase: "agents",
    taskTitle: "Fix the login bug",
    taskText: "Fix the login bug",
    taskOutcome: "done",
    taskOutputKind: "pr",
    taskOutcomeSummary: "PR otevřen: https://github.com/acme/app/pull/42",
  };

  it("opens the PR url from the outcome summary in a new tab", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderDetail(doneWithPr);
    await userEvent.click(screen.getByTestId("open-output"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/acme/app/pull/42",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("continues in a new task with the prior output folded into context", async () => {
    openNewTask.mockClear();
    renderDetail(doneWithPr);
    await userEvent.click(screen.getByTestId("continue-task"));
    expect(openNewTask).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.stringContaining("https://github.com/acme/app/pull/42"),
    );
  });

  it("hides the output panel for a void-output run", () => {
    renderDetail({ ...doneWithPr, taskOutputKind: "void" });
    expect(screen.queryByTestId("open-output")).not.toBeInTheDocument();
    expect(screen.queryByTestId("continue-task")).not.toBeInTheDocument();
  });

  it("hides the output panel while the run is still running", () => {
    renderDetail({ ...doneWithPr, status: "running" });
    expect(screen.queryByTestId("continue-task")).not.toBeInTheDocument();
  });
});
