import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { RunView } from "../run";
import { RunDetail } from "./RunDetail";

// Phase 18.1: Stop/Delete are destructive — both must ask via ConfirmDeleteDialog
// before the mutation fires. Kept in its own file (not RunDetail.test.tsx) since a
// concurrent session has unrelated WIP in that file (cost/duration metadata).
vi.mock("../../approvals/queries", () => ({ useApprovalsQuery: () => ({ data: [] }) }));
vi.mock("./PipelineStageTimeline", () => ({
  PipelineStageTimeline: () => <div data-testid="stage-timeline" />,
}));
vi.mock("../../tasks/TaskContext", () => ({
  useNewTask: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false }),
}));
vi.mock("../queries/useRunArtifactQuery", () => ({
  useRunArtifactQuery: () => ({ data: undefined }),
}));
vi.mock("../../pipelines", () => ({ usePipelineRunQuery: () => ({ data: undefined }) }));

const runningRun: RunView = {
  runId: "koder_1",
  kind: "agent",
  owner: "koder",
  status: "running",
  pct: null,
  title: "",
  prompt: "",
  project: "",
  startedAt: new Date("2026-07-06T10:00:00Z").toISOString(),
  logBase: "agents",
};

const scheduledRun: RunView = {
  ...runningRun,
  runId: "sched_1",
  status: "scheduled",
};

function renderDetail(run: RunView, onStop = vi.fn(), onDelete = vi.fn()) {
  render(
    <RunDetail
      deleting={false}
      glyph="bot"
      now={Date.parse("2026-07-06T10:05:00Z")}
      onDelete={onDelete}
      onStop={onStop}
      run={run}
      stopping={false}
    />,
  );
  return { onStop, onDelete };
}

describe("RunDetail — destructive-action confirm dialogs (Phase 18.1)", () => {
  it("Stop asks for confirmation before calling onStop", async () => {
    const { onStop } = renderDetail(runningRun);
    await userEvent.click(screen.getByText("Zastavit běh"));
    expect(screen.getByText("Zastavit běh?")).toBeInTheDocument();
    expect(onStop).not.toHaveBeenCalled();

    // The dialog's confirm button shares its label with the trigger button — it's
    // the last one rendered (the dialog mounts after the header).
    const buttons = screen.getAllByRole("button", { name: "Zastavit běh" });
    await userEvent.click(buttons[buttons.length - 1]!);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("cancelling Stop's confirm dialog never calls onStop", async () => {
    const { onStop } = renderDetail(runningRun);
    await userEvent.click(screen.getByText("Zastavit běh"));
    await userEvent.click(screen.getByText("Zrušit"));
    expect(onStop).not.toHaveBeenCalled();
    expect(screen.queryByText("Zastavit běh?")).not.toBeInTheDocument();
  });

  it("Delete asks for confirmation before calling onDelete", async () => {
    const { onDelete } = renderDetail({ ...runningRun, status: "done" });
    await userEvent.click(screen.getByText("Smazat"));
    expect(screen.getByText("Smazat běh?")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    const buttons = screen.getAllByRole("button", { name: "Smazat" });
    await userEvent.click(buttons[buttons.length - 1]!);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("a scheduled task's Delete reads as Cancel task, with matching confirm copy", async () => {
    const { onDelete } = renderDetail(scheduledRun);
    await userEvent.click(screen.getByText("Zrušit task"));
    expect(screen.getByText("Zrušit naplánovaný task?")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button", { name: "Zrušit task" });
    await userEvent.click(buttons[buttons.length - 1]!);
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
