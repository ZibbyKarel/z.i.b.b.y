import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { RunView } from "../run";
import { GoalDetailPanel } from "./GoalDetailPanel";

const mutate = vi.fn();
vi.mock("../../goals/mutations", () => ({
  useResumeGoalRunMutation: () => ({ mutate, isPending: false }),
}));

// Phase 27: the iteration log disclosure mounts `RunLogStream`, which tails the child
// run via `useRunLog`. Stub it so the test doesn't need the SSE/polling backend, and
// so we can assert exactly which child runId each row opens.
const { useRunLogMock } = vi.hoisted(() => ({
  useRunLogMock: vi.fn((runId: string) => ({ text: `log-${runId}`, done: true })),
}));
vi.mock("../useRunLog", () => ({ useRunLog: useRunLogMock }));

// Phase 29: a pipeline-maker iteration fetches the maker run (usePipelineRunQuery) and
// renders its stage timeline. Stub both — the timeline itself is unit-tested separately;
// here we only assert the goal panel wires the right maker run id into it.
const { pipelineRunMock } = vi.hoisted(() => ({
  pipelineRunMock: vi.fn(() => ({ data: undefined as unknown })),
}));
vi.mock("../../pipelines/queries", () => ({ usePipelineRunQuery: pipelineRunMock }));
vi.mock("./PipelineStageTimeline", () => ({
  PipelineStageTimeline: (p: { pipelineRunId: string; owner: string }) => (
    <div data-testid="stage-timeline">{`${p.pipelineRunId}:${p.owner}`}</div>
  ),
}));

// One stored goal: maxIterations 5, a daily run-budget of 2.
vi.mock("../../goals/queries", () => ({
  useGoalsQuery: () => ({
    data: [
      {
        id: "g1",
        objective: "do it",
        maker: { kind: "pipeline", id: "delivery" },
        verifier: { kind: "checks" },
        maxIterations: 5,
        budget: { dailyRuns: 2 },
        instructions: "iterate",
      },
    ],
  }),
}));

const ISO = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const iter = (index: number, msAgo: number) => ({
  index,
  makerKind: "pipeline" as const,
  verifier: { kind: "checks" as const, satisfied: false, output: `verdict ${index}` },
  startedAt: ISO(msAgo),
  status: "done" as const,
});

function parkedGoal(reason: RunView["goalParkedReason"]): RunView {
  return {
    runId: "g1_1780000000000",
    kind: "goal",
    owner: "g1",
    status: "parked",
    pct: null,
    title: "",
    prompt: "do it",
    project: "g1_1780000000000",
    startedAt: "2026-06-14T10:00:00.000Z",
    logBase: null,
    goalId: "g1",
    iterations: [iter(0, 60_000), iter(1, 30_000)] as RunView["iterations"],
    goalParked: { iteration: 1, attempts: 2, verdictFile: "/runs/x/iteration-1.verdict.txt" },
    goalParkedReason: reason,
  };
}

describe("GoalDetailPanel (14.1)", () => {
  it("renders a friendly park reason + hint for verifier-scope (not the raw enum)", () => {
    render(<GoalDetailPanel run={parkedGoal("verifier-scope")} />);
    expect(screen.getByText("Verifier nemá scope")).toBeInTheDocument();
    expect(screen.getByText(/Zadej cíli explicitní verifier commands/)).toBeInTheDocument();
    // The raw enum value is never shown to the operator.
    expect(screen.queryByText("verifier-scope")).not.toBeInTheDocument();
  });

  it("labels awaiting-resume (Law 3 restart park) with its hint", () => {
    render(<GoalDetailPanel run={parkedGoal("awaiting-resume")} />);
    expect(screen.getByText("Pozastaveno po restartu — čeká na tvé svolení")).toBeInTheDocument();
    expect(screen.getByText(/Zákon 3/)).toBeInTheDocument();
  });

  it("labels the budget park reason", () => {
    render(<GoalDetailPanel run={parkedGoal("budget")} />);
    expect(screen.getByText("Dosažen run budget cíle")).toBeInTheDocument();
  });

  it("shows a goal-budget bar (windowed runs vs the cap) when a budget is set", () => {
    render(<GoalDetailPanel run={parkedGoal("budget")} />);
    // Two iterations within the last day, dailyRuns: 2 → "2 / 2 dnes".
    expect(screen.getByText("2 / 2 dnes")).toBeInTheDocument();
  });

  it("shows each iteration's maker kind in the timeline (kind lives in the detail)", () => {
    render(<GoalDetailPanel run={parkedGoal("iterations")} />);
    // Both iterations are pipeline makers → the kind label appears per row.
    expect(screen.getAllByText("pipeline").length).toBe(2);
  });

  it("renders no budget bar when no matching goal/budget is found", () => {
    // goalId "absent" → no goal matched → no budget → no bar.
    render(<GoalDetailPanel run={{ ...parkedGoal("iterations"), goalId: "absent" }} />);
    expect(screen.queryByText(/dnes|tento týden/)).not.toBeInTheDocument();
  });
});

// Phase 27 — drill into the folded maker / verifier run log from the goal detail.
describe("GoalDetailPanel (27) — open the folded child run log", () => {
  beforeEach(() => {
    useRunLogMock.mockClear();
    pipelineRunMock.mockClear();
    pipelineRunMock.mockReturnValue({ data: undefined });
  });

  // A running goal (no parked panel, so the only buttons are the per-row log toggles).
  const running = (iterations: RunView["iterations"]): RunView => ({
    ...parkedGoal("iterations"),
    status: "running",
    iterations,
  });

  // An agent-maker iteration with a claude verifier — both spawn pollable child runs.
  const agentIter = (index: number) =>
    ({
      index,
      makerKind: "agent" as const,
      makerRunRef: `maker_${index}`,
      verifier: {
        kind: "claude" as const,
        satisfied: false,
        output: `verdict ${index}`,
        runRef: `verify_${index}`,
      },
      startedAt: ISO(10_000),
      status: "running" as const,
    });

  const logToggles = () => screen.getAllByRole("button", { name: /^log$/i });

  it("mounts no child log stream until a row is expanded", () => {
    render(<GoalDetailPanel run={running([agentIter(0)] as RunView["iterations"])} />);
    expect(useRunLogMock).not.toHaveBeenCalled();
  });

  it("opens the agent maker log (by makerRunRef) on the row's log toggle", async () => {
    render(<GoalDetailPanel run={running([agentIter(0)] as RunView["iterations"])} />);
    await userEvent.click(logToggles()[0]!);
    expect(useRunLogMock).toHaveBeenCalledWith("maker_0");
    expect(screen.getByText("log makera")).toBeInTheDocument();
  });

  it("reveals the claude verifier log + verdict text when expanded", async () => {
    render(<GoalDetailPanel run={running([agentIter(0)] as RunView["iterations"])} />);
    await userEvent.click(logToggles()[0]!);
    expect(useRunLogMock).toHaveBeenCalledWith("verify_0");
    expect(screen.getByText("log verifieru")).toBeInTheDocument();
    expect(screen.getByText("verdikt")).toBeInTheDocument();
  });

  it("opens the pipeline maker's stage timeline (not a note) when expanded", async () => {
    pipelineRunMock.mockReturnValue({
      // usePipelineRunQuery now returns a unified TaskRun: `owner` is the pipeline id.
      data: { runId: "delivery_run_0", owner: "delivery", currentStage: null, status: "done", stageRuns: [] },
    });
    const pipeIter = {
      index: 0,
      makerKind: "pipeline" as const,
      makerRunRef: "delivery_run_0",
      verifier: { kind: "checks" as const, satisfied: true, output: "" },
      startedAt: ISO(10_000),
      status: "done" as const,
    };
    render(<GoalDetailPanel run={running([pipeIter] as RunView["iterations"])} />);
    await userEvent.click(logToggles()[0]!);
    // The maker run id + its pipeline definition id are wired into the timeline.
    expect(screen.getByTestId("stage-timeline")).toHaveTextContent("delivery_run_0:delivery");
    // A pipeline maker mounts no agent-log stream.
    expect(useRunLogMock).not.toHaveBeenCalled();
  });

  it("keeps a single iteration open — opening another collapses the first", async () => {
    render(
      <GoalDetailPanel
        run={running([agentIter(0), agentIter(1)] as RunView["iterations"])}
      />,
    );
    await userEvent.click(logToggles()[0]!);
    expect(useRunLogMock).toHaveBeenCalledWith("maker_0");

    await userEvent.click(logToggles()[1]!);
    expect(useRunLogMock).toHaveBeenCalledWith("maker_1");
    // Only one maker log is mounted at a time.
    expect(screen.getAllByText("log makera")).toHaveLength(1);
  });
});
