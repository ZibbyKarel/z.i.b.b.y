import { renderWithProviders as render, screen } from "../../../../test/render";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Chain, SUBSYSTEMS, type SubsystemWithStatus } from "@zibby/contracts";
import type { Pipeline } from "../../../../domain";
import type { RunView } from "../../../runs/run";
import { AktivitaTab, AktivitaTabTestId } from "./AktivitaTab";

const FORGE: SubsystemWithStatus = {
  ...SUBSYSTEMS.find((s) => s.id === "forge")!,
  state: "idle",
  tier2Count: 0,
  tier3Count: 0,
};

function pipelineFixture(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    id: "delivery",
    name: "Delivery",
    lastRun: "—",
    lastState: "done",
    desc: "build → verify",
    file: "f",
    outputs: [],
    phases: [
      {
        id: "koder",
        type: "agent",
        agent: "writer",
        consumes: "task.md",
        produces: "implementation.md",
        model: "sonnet",
        thinking: "medium",
      },
    ],
    ...overrides,
  };
}

function chainFixture(overrides: Partial<Chain> = {}): Chain {
  return {
    id: "forge-chain",
    name: "Forge Chain",
    steps: [{ pipeline: "delivery" }],
    ...overrides,
  };
}

function runFixture(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: "run-1",
    kind: "pipeline",
    owner: "delivery",
    status: "running",
    pct: null,
    title: "Run 1",
    prompt: "",
    project: "",
    startedAt: new Date().toISOString(),
    logBase: null,
    ...overrides,
  };
}

const { hooks, push } = vi.hoisted(() => ({
  hooks: {
    pipelines: [] as Pipeline[],
    chains: [] as Chain[],
    runs: [] as RunView[],
  },
  push: vi.fn(),
}));

vi.mock("../../../pipelines", () => ({ usePipelinesQuery: () => ({ data: hooks.pipelines }) }));
vi.mock("../../../chains", () => ({ useChainsQuery: () => ({ data: hooks.chains }) }));
vi.mock("../../../runs", () => ({
  useRunsQuery: () => ({ runs: hooks.runs }),
  useRunGlyphMap: () => new Map(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// TaskCard is the heavy presentational composite (state chip, progress bar, …) —
// stubbed to a plain clickable row so this suite proves AktivitaTab's own
// scoping/expand logic, not TaskCard's rendering (mirrors the runs Screen's own
// `vi.mock("./components/TaskCard", …)`).
vi.mock("../../../runs/components/TaskCard", () => ({
  TaskCard: ({ run, onSelect }: { run: RunView; onSelect: (id: string) => void }) => (
    <button data-testid={`task-card-${run.runId}`} onClick={() => onSelect(run.runId)}>
      {run.title}
    </button>
  ),
}));
vi.mock("../../../runs/components/PipelineStageTimeline", () => ({
  PipelineStageTimeline: ({ pipelineRunId }: { pipelineRunId: string }) => (
    <div data-run-id={pipelineRunId} data-testid="stage-timeline-stub" />
  ),
}));
vi.mock("../../../runs/components/ChainStepsPanel", () => ({
  ChainStepsPanel: ({ run }: { run: RunView }) => (
    <div data-run-id={run.runId} data-testid="chain-steps-stub" />
  ),
}));

describe("AktivitaTab (Phase 86)", () => {
  beforeEach(() => {
    hooks.pipelines = [];
    hooks.chains = [];
    hooks.runs = [];
    push.mockReset();
  });

  it("scopes runs to pipelines/chains owned by the subsystem — unowned and agent runs excluded", () => {
    hooks.pipelines = [
      pipelineFixture({ id: "delivery", ownerSubsystem: "forge" }),
      pipelineFixture({ id: "other", ownerSubsystem: "loom" }),
      pipelineFixture({ id: "untagged" }),
    ];
    hooks.chains = [
      chainFixture({ id: "forge-chain", ownerSubsystem: "forge" }),
      chainFixture({ id: "loom-chain", ownerSubsystem: "loom" }),
    ];
    hooks.runs = [
      runFixture({ runId: "run-delivery", kind: "pipeline", owner: "delivery", title: "Delivery Run" }),
      runFixture({ runId: "run-other", kind: "pipeline", owner: "other", title: "Other Run" }),
      runFixture({
        runId: "run-untagged",
        kind: "pipeline",
        owner: "untagged",
        title: "Untagged Run",
      }),
      runFixture({
        runId: "run-forge-chain",
        kind: "chain",
        owner: "forge-chain",
        title: "Forge Chain Run",
      }),
      runFixture({
        runId: "run-loom-chain",
        kind: "chain",
        owner: "loom-chain",
        title: "Loom Chain Run",
      }),
      runFixture({ runId: "run-agent", kind: "agent", owner: "writer", title: "Agent Run" }),
    ];

    render(<AktivitaTab subsystem={FORGE} />);

    expect(screen.getByTestId("task-card-run-delivery")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-run-forge-chain")).toBeInTheDocument();
    expect(screen.queryByTestId("task-card-run-other")).toBeNull();
    expect(screen.queryByTestId("task-card-run-untagged")).toBeNull();
    expect(screen.queryByTestId("task-card-run-loom-chain")).toBeNull();
    expect(screen.queryByTestId("task-card-run-agent")).toBeNull();
  });

  it("expanding a running pipeline run mounts PipelineStageTimeline with its runId; collapsing unmounts it", () => {
    hooks.pipelines = [pipelineFixture({ id: "delivery", ownerSubsystem: "forge" })];
    hooks.runs = [
      runFixture({ runId: "run-delivery", kind: "pipeline", owner: "delivery", status: "running" }),
    ];

    render(<AktivitaTab subsystem={FORGE} />);

    expect(screen.queryByTestId("stage-timeline-stub")).toBeNull();

    fireEvent.click(screen.getByTestId("task-card-run-delivery"));
    const stub = screen.getByTestId("stage-timeline-stub");
    expect(stub).toHaveAttribute("data-run-id", "run-delivery");

    fireEvent.click(screen.getByTestId("task-card-run-delivery"));
    expect(screen.queryByTestId("stage-timeline-stub")).toBeNull();
  });

  it("expanding an errored chain run mounts ChainStepsPanel with its runId; collapsing unmounts it", () => {
    hooks.chains = [chainFixture({ id: "forge-chain", ownerSubsystem: "forge" })];
    hooks.runs = [
      runFixture({
        runId: "run-forge-chain",
        kind: "chain",
        owner: "forge-chain",
        status: "error",
      }),
    ];

    render(<AktivitaTab subsystem={FORGE} />);

    fireEvent.click(screen.getByTestId("task-card-run-forge-chain"));
    const stub = screen.getByTestId("chain-steps-stub");
    expect(stub).toHaveAttribute("data-run-id", "run-forge-chain");

    fireEvent.click(screen.getByTestId("task-card-run-forge-chain"));
    expect(screen.queryByTestId("chain-steps-stub")).toBeNull();
  });

  it("a completed (non-expandable) run navigates to the run detail page instead of expanding inline", () => {
    hooks.pipelines = [pipelineFixture({ id: "delivery", ownerSubsystem: "forge" })];
    hooks.runs = [
      runFixture({ runId: "run-delivery", kind: "pipeline", owner: "delivery", status: "done" }),
    ];

    render(<AktivitaTab subsystem={FORGE} />);

    fireEvent.click(screen.getByTestId("task-card-run-delivery"));

    expect(push).toHaveBeenCalledWith("/runs?run=run-delivery");
    expect(screen.queryByTestId("stage-timeline-stub")).toBeNull();
    expect(screen.queryByTestId("chain-steps-stub")).toBeNull();
  });

  it("shows an honest translated empty state when the subsystem owns no runs", () => {
    render(<AktivitaTab subsystem={FORGE} />);

    expect(screen.getByText("Zatím žádná aktivita")).toBeInTheDocument();
    expect(screen.queryByTestId(AktivitaTabTestId.List)).toBeNull();
  });

  it("links to the global runs page", () => {
    render(<AktivitaTab subsystem={FORGE} />);

    expect(screen.getByTestId(AktivitaTabTestId.AllRunsLink)).toHaveAttribute("href", "/runs");
  });
});
