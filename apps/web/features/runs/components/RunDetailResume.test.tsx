import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { MenuButtonTestId } from "@zibby/design-system";
import type { RunView } from "../run";
import { RunDetail } from "./RunDetail";

/** Opens the header's kebab menu and returns the resume row (or null if absent). */
async function openResumeItem() {
  await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
  return screen.queryByTestId(`${MenuButtonTestId.Item}-resume`);
}

// The header/action tests here don't exercise the gate, the log, or the output panel —
// stub every side dependency so the render is just the header + its action cluster.
vi.mock("../../approvals/queries", () => ({ useApprovalsQuery: () => ({ data: [] }) }));
vi.mock("./RunLogStream", () => ({ RunLogStream: () => <div data-testid="run-log" /> }));
vi.mock("../../tasks/TaskContext", () => ({
  useNewTask: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false }),
}));
vi.mock("../queries/useRunArtifactQuery", () => ({
  useRunArtifactQuery: () => ({ data: undefined }),
}));
vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: [] }) }));
vi.mock("../mutations", () => ({
  useAssignRunProjectMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

/** A minimal agent run that ended in error — the shape the Resume button targets. */
const erroredAgentRun: RunView = {
  runId: "resumer_1700000000000_123",
  kind: "agent",
  owner: "resumer",
  status: "error",
  pct: 40,
  title: "Oprav login",
  prompt: "oprav přihlašování",
  project: "z.i.b.b.y",
  startedAt: new Date("2026-07-07T10:00:00Z").toISOString(),
  logBase: "agents",
};

const renderRun = (run: RunView, onResume?: () => void) =>
  render(
    <RunDetail
      deleting={false}
      glyph="bot"
      now={Date.parse("2026-07-07T10:05:00Z")}
      onDelete={() => {}}
      onResume={onResume}
      onStop={() => {}}
      resuming={false}
      run={run}
      stopping={false}
    />,
  );

describe("RunDetail — Resume an errored agent run (Phase 49)", () => {
  it("shows a context-preserving 'Pokračovat' row when a session id was captured", async () => {
    const onResume = vi.fn();
    renderRun({ ...erroredAgentRun, sessionId: "sess-1" }, onResume);
    const item = await openResumeItem();
    expect(item).not.toBeNull();
    expect(item).toHaveTextContent("Pokračovat");
    await userEvent.click(item!);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("labels a fresh re-run 'Spustit znovu' when no session id was captured", async () => {
    renderRun(erroredAgentRun, () => {});
    const item = await openResumeItem();
    expect(item).toHaveTextContent("Spustit znovu");
  });

  it("also offers the row for an interrupted agent run", async () => {
    renderRun({ ...erroredAgentRun, status: "interrupted" }, () => {});
    expect(await openResumeItem()).toBeInTheDocument();
  });

  it("does not offer the row for a done agent run", async () => {
    renderRun({ ...erroredAgentRun, status: "done" }, () => {});
    expect(await openResumeItem()).not.toBeInTheDocument();
  });

  it("does not offer the row for an errored pipeline run (agent-only in v1)", async () => {
    renderRun({ ...erroredAgentRun, kind: "pipeline", logBase: null }, () => {});
    expect(await openResumeItem()).not.toBeInTheDocument();
  });

  it("hides the row when no onResume handler is wired", async () => {
    renderRun({ ...erroredAgentRun, sessionId: "sess-1" });
    expect(await openResumeItem()).not.toBeInTheDocument();
  });
});
