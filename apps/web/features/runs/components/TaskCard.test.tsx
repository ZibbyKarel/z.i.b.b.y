import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RunView } from "../run";
import { TaskCard } from "./TaskCard";

const run: RunView = {
  runId: "run-1",
  kind: "agent",
  owner: "architect",
  status: "running",
  pct: 40,
  title: "Zkontrolovat zálohy",
  prompt: "projdi /backups a ověř včerejší snapshot",
  project: "home-ops",
  startedAt: "2026-06-11T10:00:00.000Z",
  logBase: "agents",
};

/** A render-stable "now" so the limit-pause countdown is deterministic. */
const NOW = Date.parse("2026-06-11T10:05:00.000Z");

describe("TaskCard", () => {
  it("is task-first: the task title is the headline, the target only meta", () => {
    render(
      <TaskCard
        glyph="bot"
        now={NOW}
        onSelect={() => {}}
        run={run}
        selected={false}
        startedLabel="před 5 m"
        stateLabel="běží"
      />,
    );
    expect(screen.getByText("Zkontrolovat zálohy")).toBeInTheDocument();
    expect(
      screen.getByText(/projdi \/backups a ověř včerejší snapshot/),
    ).toBeInTheDocument();
    expect(screen.getByText(/architect · home-ops · před 5 m/)).toBeInTheDocument();
    expect(screen.getByText("běží")).toBeInTheDocument();
  });

  it("falls back to the task text as headline when there is no title", () => {
    render(
      <TaskCard
        glyph="bot"
        now={NOW}
        onSelect={() => {}}
        run={{ ...run, title: "" }}
        selected={false}
        startedLabel="před 5 m"
        stateLabel="běží"
      />,
    );
    // The text is promoted to the headline, not repeated as a secondary line.
    expect(
      screen.getAllByText("projdi /backups a ověř včerejší snapshot"),
    ).toHaveLength(1);
  });

  it("renders the task-origin line and the written-back outcome badge", () => {
    render(
      <TaskCard
        glyph="bot"
        now={NOW}
        onSelect={() => {}}
        run={{
          ...run,
          status: "done",
          taskId: "task-9",
          taskTitle: "Oprav rozbitý test",
          taskOutcome: "done",
        }}
        selected={false}
        startedLabel="před 5 m"
        stateLabel="hotovo"
      />,
    );
    expect(screen.getByText(/úkol · Oprav rozbitý test/)).toBeInTheDocument();
    expect(screen.getByText(/úkol → úspěch/)).toBeInTheDocument();
  });

  it("marks a failed task outcome as selhání", () => {
    render(
      <TaskCard
        glyph="bot"
        now={NOW}
        onSelect={() => {}}
        run={{ ...run, status: "error", taskId: "task-9", taskOutcome: "error" }}
        selected={false}
        startedLabel="před 5 m"
        stateLabel="chyba"
      />,
    );
    expect(screen.getByText(/úkol → selhání/)).toBeInTheDocument();
  });

  it("renders a held task's reason caption (Phase 8)", () => {
    render(
      <TaskCard
        glyph="bot"
        now={NOW}
        onSelect={() => {}}
        run={{ ...run, status: "held", heldReason: "daily run cap reached (1/1)", projectId: "alpha" }}
        selected={false}
        startedLabel="teď"
        stateLabel="pozdrženo"
      />,
    );
    expect(screen.getByText(/daily run cap reached/)).toBeInTheDocument();
  });

  it("renders a queued task's waiting-for-slot caption with the project (Phase 8)", () => {
    render(
      <TaskCard
        glyph="bot"
        now={NOW}
        onSelect={() => {}}
        run={{ ...run, status: "queued", projectId: "alpha" }}
        selected={false}
        startedLabel="teď"
        stateLabel="ve frontě"
      />,
    );
    expect(screen.getByText(/alpha/)).toBeInTheDocument();
  });

  it("renders a limit-pause caption that counts down to the window reset (Phase 9)", () => {
    render(
      <TaskCard
        glyph="bot"
        now={NOW}
        onSelect={() => {}}
        run={{ ...run, status: "paused-limit", resumeAt: NOW + 90 * 60 * 1000 }}
        selected={false}
        startedLabel="teď"
        stateLabel="pauza na limitu"
      />,
    );
    // The caption names the pause and a resume time (absolute ~HH:MM within 24 h).
    expect(screen.getByText(/Pauza na limitu/)).toBeInTheDocument();
  });

  it("selects on click", async () => {
    const onSelect = vi.fn();
    render(
      <TaskCard
        glyph="bot"
        now={NOW}
        onSelect={onSelect}
        run={run}
        selected={false}
        startedLabel="před 5 m"
        stateLabel="běží"
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("run-1");
  });
});
