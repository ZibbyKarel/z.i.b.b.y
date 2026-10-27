import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { RunView } from "../run";
import type { StageRailRow } from "../runDetailModel";
import { RailItemTestId } from "@zibby/design-system";
import { RunStageRail, RunStageRailTestId } from "./RunStageRail";

const { symbolOfMock, workflowsMock, agentsMock } = vi.hoisted(() => ({
  agentsMock: vi.fn(),
  symbolOfMock: vi.fn((_id?: string) => ({ glyph: "bot" as const })),
  workflowsMock: vi.fn(),
}));
vi.mock("../../agents", () => ({ useAgentSymbol: () => symbolOfMock }));
vi.mock("../../agents/queries", () => ({ useAgentsQuery: agentsMock }));
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

function renderRail(over: Partial<RunView> = {}, onSelect = vi.fn()) {
  render(
    <RunStageRail
      onSelect={onSelect}
      rows={rows}
      run={{ ...run, ...over }}
      selectedPhaseId={null}
    />,
  );
  return { onSelect };
}

const stage = (id: string) => screen.getByTestId(`${RunStageRailTestId.Stage}-${id}`);

describe("RunStageRail", () => {
  beforeEach(() => {
    symbolOfMock.mockClear();
    workflowsMock.mockReturnValue({ data: undefined });
    agentsMock.mockReturnValue({ data: undefined });
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

  it("only the working stage is flagged running", () => {
    renderRail();
    expect(stage("phase2")).toHaveAttribute("data-running", "true");
    expect(stage("phase1")).not.toHaveAttribute("data-running");
    expect(stage("phase3")).not.toHaveAttribute("data-running");
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

  describe("model badge", () => {
    const model = (id: string) => screen.getByTestId(`${RunStageRailTestId.Model}-${id}`);

    it("shows phase model, agent fallback, then the default label", () => {
      workflowsMock.mockReturnValue({
        data: [
          {
            id: "delivery",
            phases: [
              { id: "phase1", agent: "coder", model: "sonnet" },
              { id: "phase2", agent: "reviewer" },
            ],
          },
        ],
      });
      agentsMock.mockReturnValue({ data: [{ id: "reviewer", model: "opus" }] });
      renderRail();
      expect(model("phase1")).toHaveTextContent("sonnet");
      expect(model("phase2")).toHaveTextContent("opus");
      expect(model("phase3")).toHaveTextContent("výchozí");
    });

    it("is the first child of the row's meta", () => {
      renderRail();
      const meta = stage("phase1").querySelector(`[data-testid="${RailItemTestId.Meta}"]`);
      expect(meta?.firstElementChild).toBe(model("phase1"));
    });

    it("uses the agent's model for a single agent run", () => {
      agentsMock.mockReturnValue({ data: [{ id: "coder", model: "haiku" }] });
      render(
        <RunStageRail
          onSelect={vi.fn()}
          rows={[row("delivery_42")]}
          run={{ ...run, kind: "agent", owner: "coder" }}
          selectedPhaseId={null}
        />,
      );
      expect(model("delivery_42")).toHaveTextContent("haiku");
    });
  });
});
