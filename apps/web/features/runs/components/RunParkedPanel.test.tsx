import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RunView } from "../run";
import { RunParkedPanel } from "./RunParkedPanel";

const mutate = vi.fn();
vi.mock("../mutations", () => ({
  useResumePipelineRunMutation: () => ({ mutate, isPending: false }),
}));
vi.mock("../queries/useStageRunLogQuery", () => ({
  useStageRunLogQuery: () => ({
    data: { content: "stage starting\nAssertionError: boom\n", nextOffset: 42, done: true },
  }),
}));

const parkedRun: RunView = {
  runId: "delivery_1780000000000",
  kind: "pipeline",
  owner: "delivery",
  status: "parked",
  pct: null,
  title: "",
  prompt: "fáze: review",
  project: "delivery_1780000000000",
  startedAt: "2026-06-12T10:00:00.000Z",
  logBase: null,
  parked: { phaseId: "review", attempts: 3, failureFile: "/runs/x/review.failure.txt" },
};

describe("RunParkedPanel", () => {
  it("shows the failure tail and the parked summary", () => {
    render(<RunParkedPanel run={parkedRun} />);
    expect(screen.getByText(/fáze review · 3 pokusů vyčerpáno/)).toBeInTheDocument();
    expect(screen.getByText(/AssertionError: boom/)).toBeInTheDocument();
  });

  it("resume-with-note fires the mutation with the trimmed note", async () => {
    render(<RunParkedPanel run={parkedRun} />);
    await userEvent.type(
      screen.getByLabelText("Poznámka pro další pokus"),
      "  zkus jiný selektor  ",
    );
    await userEvent.click(screen.getByRole("button", { name: /Pokračovat s poznámkou/ }));
    expect(mutate).toHaveBeenCalledWith({
      params: { runId: "delivery_1780000000000" },
      body: { note: "zkus jiný selektor" },
    });
  });

  it("renders nothing without a parked detail", () => {
    render(<RunParkedPanel run={{ ...parkedRun, parked: undefined }} />);
    expect(screen.queryByText("Zaparkováno — kontext selhání")).not.toBeInTheDocument();
  });
});
