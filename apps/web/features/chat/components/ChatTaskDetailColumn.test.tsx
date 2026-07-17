import { fireEvent } from "@testing-library/react";
import { Dialog } from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render as bareRender, renderWithProviders as render, screen } from "../../../test/render";
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

import {
  ChatTaskDetailColumn,
  ChatTaskDetailColumnTestId,
  PANEL_EXIT_MS,
  backdropStyle,
  panelTransitionStyle,
} from "./ChatTaskDetailColumn";

afterEach(() => {
  vi.useRealTimers();
});

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

describe("ChatTaskDetailColumn (Phase 100, frame Phase 122)", () => {
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

  it("the close button fires onClose after the exit transition", () => {
    vi.useFakeTimers();
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
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PANEL_EXIT_MS);
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

  describe("modal backdrop and animation (phase 126)", () => {
    it("renders fully open once mounted (not stuck in the entering state)", () => {
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
      const panel = screen.getByTestId(ChatTaskDetailColumnTestId.Panel);
      expect(panel).toHaveStyle({ opacity: "1", transform: "scale(1) translateY(0)" });
    });

    it("blurs and dims the backdrop", () => {
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
      const backdrop = screen.getByTestId(ChatTaskDetailColumnTestId.Root);
      expect(backdrop.style.backdropFilter).toBe("blur(14px) saturate(140%)");
      expect(backdrop.style.background).toBe("rgba(11, 14, 19, 0.55)");
    });

    it("closes when clicking the backdrop itself, after the exit transition", () => {
      vi.useFakeTimers();
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

      fireEvent.click(screen.getByTestId(ChatTaskDetailColumnTestId.Root));
      expect(onClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(PANEL_EXIT_MS);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close when clicking inside the panel", () => {
      vi.useFakeTimers();
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

      fireEvent.click(screen.getByTestId(ChatTaskDetailColumnTestId.Panel));
      vi.advanceTimersByTime(PANEL_EXIT_MS);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("collapses to a fade-only transition under prefers-reduced-motion", () => {
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
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

      const panel = screen.getByTestId(ChatTaskDetailColumnTestId.Panel);
      expect(panel.style.transform).toBe("");
      expect(panel.style.transition).toBe("opacity 220ms cubic-bezier(0.16, 1, 0.3, 1)");
      vi.unstubAllGlobals();
    });
  });

  describe("backdropStyle / panelTransitionStyle (pure)", () => {
    it("backdropStyle fades in 180ms ease-out open, 140ms ease-in closing", () => {
      expect(backdropStyle("open")).toMatchObject({
        opacity: 1,
        transition: "opacity 180ms ease-out",
      });
      expect(backdropStyle("closing")).toMatchObject({
        opacity: 0,
        transition: "opacity 140ms ease-in",
      });
    });

    it("panelTransitionStyle scales+translates+fades open, hides entering/closing", () => {
      expect(panelTransitionStyle("open", false)).toMatchObject({
        opacity: 1,
        transform: "scale(1) translateY(0)",
        transition:
          "opacity 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      });
      expect(panelTransitionStyle("entering", false)).toMatchObject({
        opacity: 0,
        transform: "scale(0.96) translateY(8px)",
      });
      expect(panelTransitionStyle("closing", false).transition).toBe(
        "opacity 140ms ease-in, transform 140ms ease-in",
      );
    });

    it("drops transform entirely under reduced motion", () => {
      const style = panelTransitionStyle("open", true);
      expect(style.transform).toBeUndefined();
      expect(style.transition).toBe("opacity 220ms cubic-bezier(0.16, 1, 0.3, 1)");
    });
  });

  describe("focus trap and scroll lock (phase 126)", () => {
    it("wraps Tab focus from the last focusable element back to the first", () => {
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

      screen.getByTestId(ChatTaskDetailColumnTestId.OpenFull).focus();
      fireEvent.keyDown(document, { key: "Tab" });

      expect(document.activeElement).toBe(screen.getByTestId(ChatTaskDetailColumnTestId.Close));
    });

    it("wraps Shift+Tab from the first focusable element back to the last", () => {
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

      screen.getByTestId(ChatTaskDetailColumnTestId.Close).focus();
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

      expect(document.activeElement).toBe(screen.getByTestId(ChatTaskDetailColumnTestId.OpenFull));
    });

    it("locks body scroll while open and restores it on unmount", () => {
      const { unmount } = render(
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
      expect(document.body.style.overflow).toBe("hidden");

      unmount();
      expect(document.body.style.overflow).toBe("");
    });

    it("cedes Escape to a nested DS Dialog and keeps scroll locked until this modal itself closes", () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      const { unmount } = render(
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
      expect(document.body.style.overflow).toBe("hidden");

      const { unmount: unmountDialog } = bareRender(
        <Dialog open title="Nested">
          nested
        </Dialog>,
      );
      expect(document.body.style.overflow).toBe("hidden");

      fireEvent.keyDown(document, { key: "Escape" });
      vi.advanceTimersByTime(PANEL_EXIT_MS);
      expect(onClose).not.toHaveBeenCalled();

      unmountDialog();
      expect(document.body.style.overflow).toBe("hidden");

      unmount();
      expect(document.body.style.overflow).toBe("");
    });

    it("closes on Escape after the exit transition", () => {
      vi.useFakeTimers();
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

      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(PANEL_EXIT_MS);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
