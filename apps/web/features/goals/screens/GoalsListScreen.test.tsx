import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoalCardTestId } from "@zibby/design-system";
import type { Goal, TaskRun } from "@zibby/contracts";
import { renderWithProviders as render } from "../../../test/render";
import { GoalsListScreen } from "./GoalsListScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const goal: Goal = {
  id: "ship-feature",
  objective: "Ship feature Y green",
  maker: { kind: "pipeline", id: "delivery" },
  verifier: { kind: "checks" },
  maxIterations: 10,
  instructions: "Keep going.",
  projectId: "client-portal",
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    goals: [] as Goal[],
    goalsPending: false,
    goalsError: false,
    runs: [] as TaskRun[],
    runsPending: false,
  },
}));

const resumeMutate = vi.fn();
const stopMutate = vi.fn();

vi.mock("../queries", () => ({
  useGoalsQuery: () => ({
    data: hooks.goals,
    isPending: hooks.goalsPending,
    isError: hooks.goalsError,
    refetch: vi.fn(),
  }),
}));
vi.mock("../mutations", () => ({
  useResumeGoalRunMutation: () => ({ mutate: resumeMutate }),
}));
vi.mock("../../projects", () => ({
  useProjectsQuery: () => ({ data: [{ id: "client-portal", name: "Client Portal" }] }),
}));
vi.mock("../../runs", () => ({
  useRunsQuery: () => ({ runs: hooks.runs, isPending: hooks.runsPending }),
  useStopTaskRunMutation: () => ({ mutate: stopMutate }),
}));

beforeEach(() => {
  hooks.goals = [];
  hooks.goalsPending = false;
  hooks.goalsError = false;
  hooks.runs = [];
  hooks.runsPending = false;
  push.mockClear();
  resumeMutate.mockClear();
  stopMutate.mockClear();
});

describe("GoalsListScreen (ZB-06)", () => {
  it("renders a GoalCard per goal, with the project name in the eyebrow", () => {
    hooks.goals = [goal];
    render(<GoalsListScreen />);
    expect(screen.getByTestId(GoalCardTestId.Title)).toHaveTextContent("Ship feature Y green");
    expect(screen.getByTestId(GoalCardTestId.Eyebrow)).toHaveTextContent("CLIENT PORTAL");
  });

  it("opens the goal detail on the card's Open action", async () => {
    hooks.goals = [goal];
    render(<GoalsListScreen />);
    await userEvent.click(screen.getByTestId(GoalCardTestId.Open));
    expect(push).toHaveBeenCalledWith("/work/goals/ship-feature");
  });

  it("shows resume only for a parked run, and calls the resume mutation", async () => {
    hooks.goals = [goal];
    hooks.runs = [
      {
        runId: "run-1",
        kind: "goal",
        goalId: "ship-feature",
        status: "parked",
        owner: "ship-feature",
        title: "",
        prompt: "",
        startedAt: "2026-01-01T00:00:00.000Z",
        iterations: [],
      } as unknown as TaskRun,
    ];
    render(<GoalsListScreen />);
    await userEvent.click(screen.getByTestId(GoalCardTestId.Resume));
    expect(resumeMutate).toHaveBeenCalledWith({ params: { runId: "run-1" }, body: {} });
  });

  it("shows the empty state when there are no goals", () => {
    render(<GoalsListScreen />);
    expect(screen.getByText("Zatím žádné cíle")).toBeInTheDocument();
  });
});
