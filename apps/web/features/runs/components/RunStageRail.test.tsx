import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { RunView } from "../run";
import type { StageRailRow } from "../runDetailModel";
import { RunStageRail, RunStageRailTestId } from "./RunStageRail";

const { symbolOfMock, workflowsMock } = vi.hoisted(() => ({
  symbolOfMock: vi.fn((_id?: string) => ({ glyph: "bot" as const })),
  workflowsMock: vi.fn(),
}));
vi.mock("../../agents", () => ({ useAgentSymbol: () => symbolOfMock }));
vi.mock("../../workflows/queries", () => ({ useWorkflowsQuery: workflowsMock }));

const run: RunView = {
  runId: "delivery_42",
  kind: "workflow",
  owner: "delivery",
  status: "running",
  pct: null,
  title: "Fix login",
  prompt: "",
  project: "",
  startedAt: "2026-10-20T10:00:00Z",
  logBase: null,
  stageRuns: [],
};

const row = (phaseId: string, over: Partial<StageRailRow> = {}): StageRailRow => ({
  phaseId,
  n: "01",
  name: phaseId,
  state: "idle",
  stateKey: "queued",
  meta: "—",
  retries: 0,
  current: false,
  ...over,
});

const rows = [
  row("phase1", { n: "01", state: "done", stateKey: "done", meta: "01:42" }),
  row("phase2", { n: "02", state: "working", stateKey: "running", meta: "01:05", current: true }),
  row("phase3", { n: "03" }),
];

function renderRail(over: Partial<RunView> = {}, onSelect = vi.fn(), onOpenFolder = vi.fn()) {
  render(
    <RunStageRail
      onOpenFolder={onOpenFolder}
      onSelect={onSelect}
      rows={rows}
      run={{ ...run, ...over }}
      selectedPhaseId={null}
    />,
  );
  return { onSelect, onOpenFolder };
}

const stage = (id: string) => screen.getByTestId(`${RunStageRailTestId.Stage}-${id}`);

describe("RunStageRail", () => {
  beforeEach(() => {
    symbolOfMock.mockClear();
    workflowsMock.mockReturnValue({ data: undefined });
  });

  it("resolves a workflow stage's symbol from the phase's agent, not the phase id", () => {
    workflowsMock.mockReturnValue({
      data: [{ id: "delivery", phases: [{ id: "phase1", agent: "koder" }, { id: "phase2" }] }],
    });
    renderRail();
    expect(symbolOfMock).toHaveBeenCalledWith("koder");
    expect(symbolOfMock).toHaveBeenCalledWith("phase2"); // no agent → falls back to the row id
  });

  it("renders one row per stage and marks the current one selected by default", () => {
    renderRail();
    expect(screen.getAllByTestId(new RegExp(`^${RunStageRailTestId.Stage}-`))).toHaveLength(3);
    expect(stage("phase2")).toHaveAttribute("aria-current", "true");
    expect(stage("phase1")).not.toHaveAttribute("aria-current");
  });

  it("clicking a row selects its phase", async () => {
    const { onSelect } = renderRail();
    await userEvent.click(stage("phase2"));
    expect(onSelect).toHaveBeenCalledWith("phase2");
  });

  it("no classification → no ROUTED; checkpoints render", () => {
    renderRail({
      checkpoints: [{ phaseId: "phase1", sha: "abcdef1234", at: "2026-10-20T10:01:00Z" }],
    });
    expect(screen.queryByTestId(RunStageRailTestId.Routed)).not.toBeInTheDocument();
    expect(screen.getByTestId(RunStageRailTestId.Checkpoint)).toHaveTextContent("abcdef1");
  });

  it("a classified run shows the route trace", () => {
    renderRail({
      classification: {
        stage1: { kind: "workflow", id: "delivery", name: "Delivery" },
        confidence: 0.91,
        reason: "fits",
        matchedTerms: [],
      },
    });
    expect(screen.getByTestId(RunStageRailTestId.Routed)).toHaveTextContent("Delivery · 91%");
  });

  it("open folder fires for workflow runs, absent for agent runs", async () => {
    const { onOpenFolder } = renderRail();
    await userEvent.click(screen.getByTestId(RunStageRailTestId.OpenFolder));
    expect(onOpenFolder).toHaveBeenCalledOnce();
  });

  it("agent kind → no open folder", () => {
    renderRail({ kind: "agent" });
    expect(screen.queryByTestId(RunStageRailTestId.OpenFolder)).not.toBeInTheDocument();
  });
});
