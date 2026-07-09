import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import type { RunView } from "../../runs/run";

// `RunDetail` is a heavy composite (approval gate, log stream, stage timeline,
// cost/duration, its own confirm dialogs) with its own dedicated test suite —
// stubbed here so this suite proves only the column's own chrome (close, the
// mobile "open full page" fallback, and that the run's props reach it), not
// RunDetail's internals.
interface RunDetailStubProps {
  run: RunView;
  onStop: () => void;
  onDelete: () => void;
  onResume?: () => void;
}
vi.mock("../../runs/components/RunDetail", () => ({
  RunDetail: ({ run, onStop, onDelete, onResume }: RunDetailStubProps) => (
    <div data-run-id={run.runId} data-testid="run-detail-stub">
      <button onClick={onStop} type="button">
        stop
      </button>
      <button onClick={onDelete} type="button">
        delete
      </button>
      <button onClick={onResume} type="button">
        resume
      </button>
    </div>
  ),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ChatTaskDetailColumn, ChatTaskDetailColumnTestId } from "./ChatTaskDetailColumn";

function run(overrides: Partial<RunView>): RunView {
  const base: RunView = {
    runId: "run_a",
    kind: "agent",
    owner: "writer",
    status: "running",
    pct: null,
    title: "Fix login bug",
    prompt: "",
    project: "",
    startedAt: new Date().toISOString(),
    logBase: "agents",
  };
  return { ...base, ...overrides };
}

describe("ChatTaskDetailColumn (Phase 100)", () => {
  it("renders RunDetail for the selected run", () => {
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );

    expect(screen.getByTestId("run-detail-stub")).toHaveAttribute("data-run-id", "run_a");
  });

  it("the close button fires onClose", () => {
    const onClose = vi.fn();
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={onClose}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );

    fireEvent.click(screen.getByTestId(ChatTaskDetailColumnTestId.Close));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the 'open full page' fallback navigates to /runs?run=<id>", () => {
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({ runId: "run_z" })}
        stopping={false}
      />,
    );

    fireEvent.click(screen.getByTestId(ChatTaskDetailColumnTestId.OpenFull));
    expect(push).toHaveBeenCalledWith("/runs?run=run_z");
  });

  it("forwards stop/delete/resume through to RunDetail", () => {
    const onStop = vi.fn();
    const onDelete = vi.fn();
    const onResume = vi.fn();
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={vi.fn()}
        onDelete={onDelete}
        onResume={onResume}
        onStop={onStop}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );

    fireEvent.click(screen.getByText("stop"));
    fireEvent.click(screen.getByText("delete"));
    fireEvent.click(screen.getByText("resume"));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
