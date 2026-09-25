import type { GlobalBudget, Limits, TaskRun } from "@zibby/contracts";
import { SliderTestId } from "@zibby/design-system";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { LedgerSpendScreen, LedgerSpendScreenTestId } from "./LedgerSpendScreen";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    limits: {
      rolling: { usedPct: 10, resetsAt: null },
      weekly: { usedPct: 20, resetsAt: null },
      capturedAt: null,
      stale: false,
    } as Limits,
    config: {} as GlobalBudget,
    runs: [] as TaskRun[],
  },
}));
const mutate = vi.fn();

vi.mock("../../limits", () => ({
  useLimitsQuery: () => ({
    data: hooks.limits,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../budget", () => ({
  useBudgetConfigQuery: () => ({
    data: hooks.config,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateBudgetConfigMutation: () => ({ mutate }),
}));
vi.mock("../../runs/queries/useRunsQuery", () => ({
  useRunsQuery: () => ({
    runs: hooks.runs,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

function run(over: Partial<TaskRun> = {}): TaskRun {
  return {
    runId: "r_1",
    kind: "agent",
    owner: "coder",
    status: "done",
    pct: 100,
    title: "",
    prompt: "",
    project: "",
    startedAt: new Date().toISOString(),
    logBase: "agents",
    ...over,
  } as TaskRun;
}

describe("LedgerSpendScreen (ZB-10 / O-08)", () => {
  beforeEach(() => {
    hooks.limits = {
      rolling: { usedPct: 10, resetsAt: null },
      weekly: { usedPct: 20, resetsAt: null },
      capturedAt: null,
      stale: false,
    };
    hooks.config = {};
    hooks.runs = [];
    mutate.mockClear();
  });

  it("renders the rolling/weekly meters, the threshold sliders and the department table", () => {
    hooks.runs = [run({ department: "dev", costUsd: 1.25 })];

    render(<LedgerSpendScreen />);

    expect(screen.getByTestId(LedgerSpendScreenTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(LedgerSpendScreenTestId.MeterGrid)).toBeInTheDocument();
    expect(screen.getByTestId(LedgerSpendScreenTestId.ThresholdSliders)).toBeInTheDocument();
    expect(screen.getByTestId(LedgerSpendScreenTestId.DepartmentTable)).toBeInTheDocument();
  });

  it("shows the total spent today in the title", () => {
    hooks.runs = [run({ costUsd: 2 }), run({ costUsd: 3 })];

    render(<LedgerSpendScreen />);

    expect(screen.getByText(/5\.00/)).toBeInTheDocument();
  });

  it("moving a threshold slider mutates the budget config", () => {
    hooks.config = { pauseAtRollingPct: 90 };

    render(<LedgerSpendScreen />);

    const sliders = screen.getAllByTestId(SliderTestId.Input);
    fireEvent.change(sliders[0] as HTMLInputElement, { target: { value: "80" } });

    expect(mutate).toHaveBeenCalled();
  });
});
