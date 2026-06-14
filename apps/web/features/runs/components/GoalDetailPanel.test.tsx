import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import type { RunView } from "../run";
import { GoalDetailPanel } from "./GoalDetailPanel";

const mutate = vi.fn();
vi.mock("../../goals/mutations", () => ({
  useResumeGoalRunMutation: () => ({ mutate, isPending: false }),
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

  it("renders no budget bar when no matching goal/budget is found", () => {
    // goalId "absent" → no goal matched → no budget → no bar.
    render(<GoalDetailPanel run={{ ...parkedGoal("iterations"), goalId: "absent" }} />);
    expect(screen.queryByText(/dnes|tento týden/)).not.toBeInTheDocument();
  });
});
