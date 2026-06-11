import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ScheduledTask } from "@zibby/contracts";
import { type RunView, runTitle, scheduledTaskToView } from "../run";
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

describe("TaskCard", () => {
  it("is task-first: the task title is the headline, the target only meta", () => {
    render(
      <TaskCard
        glyph="bot"
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

  it("selects on click", async () => {
    const onSelect = vi.fn();
    render(
      <TaskCard
        glyph="bot"
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

describe("scheduledTaskToView", () => {
  const task: ScheduledTask = {
    id: "task-1",
    title: "Ranní report",
    text: "sestav report",
    paths: [],
    scheduledAt: Date.parse("2026-06-12T06:00:00.000Z"),
    status: "scheduled",
    createdAt: "2026-06-11T10:00:00.000Z",
  };

  it("maps a waiting task with its fire time as startedAt", () => {
    const view = scheduledTaskToView(task);
    expect(view).toMatchObject({
      runId: "task-1",
      kind: "scheduled",
      status: "scheduled",
      title: "Ranní report",
      prompt: "sestav report",
      owner: "",
      logBase: null,
      startedAt: "2026-06-12T06:00:00.000Z",
    });
    expect(runTitle(view as RunView)).toBe("Ranní report");
  });

  it("drops dispatched tasks (their run already feeds the list)", () => {
    expect(scheduledTaskToView({ ...task, status: "dispatched" })).toBeNull();
  });

  it("reads cancelled as interrupted and a failed dispatch as error", () => {
    expect(scheduledTaskToView({ ...task, status: "cancelled" })?.status).toBe(
      "interrupted",
    );
    expect(scheduledTaskToView({ ...task, status: "failed" })?.status).toBe(
      "error",
    );
  });
});
