import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { RunView } from "../run";
import { PipelineStageTimeline } from "./PipelineStageTimeline";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// The stage log is read on demand from the per-phase endpoint; stub both surfaces
// (the terminal one-shot query and the live SSE tail) so the test needs no backend
// and can assert which phase each row opens — and over which transport (N1 DNA:
// a live log streams, a finished log is a one-shot state read).
const { stageLogMock, stageStreamMock } = vi.hoisted(() => ({
  stageLogMock: vi.fn((_id: string, phaseId: string | undefined) => ({
    data: phaseId ? { content: `LOG for ${phaseId}` } : undefined,
    isPending: false,
  })),
  stageStreamMock: vi.fn((_id: string, phaseId: string | null) => ({
    text: phaseId ? `STREAM for ${phaseId}` : "",
    done: false,
  })),
}));
vi.mock("../queries/useStageRunLogQuery", () => ({ useStageRunLogQuery: stageLogMock }));
vi.mock("../useRunLogStream", () => ({ useStageRunLogStream: stageStreamMock }));

const stages: RunView["stageRuns"] = [
  { phaseId: "build", runId: "delivery_1.build_1", attempt: 1, status: "done" },
  { phaseId: "verify", runId: "delivery_1.verify_2", attempt: 2, status: "running" },
];

const timeline = (
  props?: Partial<{
    owner: string;
    stageRuns: RunView["stageRuns"];
    currentStage: string | null;
    live: boolean;
  }>,
) => (
  <PipelineStageTimeline
    currentStage={props?.currentStage}
    live={props?.live}
    owner={props?.owner ?? "delivery"}
    pipelineRunId="delivery_1"
    stageRuns={props?.stageRuns ?? stages}
  />
);

const logToggles = () => screen.getAllByRole("button", { name: /^log$/i });

describe("PipelineStageTimeline (28)", () => {
  beforeEach(() => {
    stageLogMock.mockClear();
    stageStreamMock.mockClear();
    push.mockClear();
  });

  it("renders one row per stage with its phase + retried attempt", () => {
    render(timeline());
    expect(screen.getByText("build")).toBeInTheDocument();
    expect(screen.getByText("verify")).toBeInTheDocument();
    // attempt > 1 is surfaced (the verify stage looped once).
    expect(screen.getByText("pokus 2")).toBeInTheDocument();
  });

  it("fetches no stage log until a row is expanded", () => {
    render(timeline());
    expect(stageLogMock).not.toHaveBeenCalled();
    expect(stageStreamMock).not.toHaveBeenCalled();
  });

  it("opens a stage's log (by phaseId) on its log toggle — terminal stage reads once", async () => {
    render(timeline());
    await userEvent.click(logToggles()[0]!);
    // A terminal (done) stage is immutable state → the one-shot query, never the stream.
    expect(stageLogMock).toHaveBeenCalledWith("delivery_1", "build");
    expect(stageStreamMock).not.toHaveBeenCalled();
    expect(screen.getByText("LOG for build")).toBeInTheDocument();
  });

  it("shows the running phase as a live row and tails it over SSE without a click", () => {
    // A run still executing its first phase: no terminal stages yet, but the live
    // phase row appears and its log is open + streamed (SSE), not interval-polled.
    render(timeline({ currentStage: "build", live: true, stageRuns: [] }));
    expect(screen.getByText("build")).toBeInTheDocument();
    expect(stageStreamMock).toHaveBeenCalledWith("delivery_1", "build");
    expect(stageLogMock).not.toHaveBeenCalled();
    expect(screen.getByText("STREAM for build")).toBeInTheDocument();
  });

  it("surfaces a running phase even when an earlier attempt already failed", () => {
    // The build phase failed once (terminal) and is being retried (live) — both the
    // failed attempt and the live attempt are rows.
    render(
      timeline({
        currentStage: "build",
        live: true,
        stageRuns: [{ phaseId: "build", runId: "delivery_1.build_1", attempt: 1, status: "error" }],
      }),
    );
    // The live attempt is #2 (one past the recorded terminal attempt).
    expect(screen.getByText("pokus 2")).toBeInTheDocument();
    expect(stageStreamMock).toHaveBeenCalledWith("delivery_1", "build");
  });

  it("keeps a single stage open — opening another collapses the first", async () => {
    render(timeline());
    await userEvent.click(logToggles()[0]!);
    expect(screen.getByText("LOG for build")).toBeInTheDocument();

    // The verify row is status "running" → it opens over the SSE tail.
    await userEvent.click(logToggles()[1]!);
    expect(screen.getByText("STREAM for verify")).toBeInTheDocument();
    // The first stage's log is gone — only one open at a time.
    expect(screen.queryByText("LOG for build")).not.toBeInTheDocument();
  });

  it("links to the pipeline definition (a different surface than this run)", async () => {
    render(timeline());
    await userEvent.click(screen.getByRole("button", { name: /pipeline/i }));
    expect(push).toHaveBeenCalledWith("/pipelines/delivery");
  });

  it("shows an empty-state when the run has no stages yet", () => {
    render(timeline({ stageRuns: [] }));
    expect(screen.getByText("Tento běh zatím nemá žádné fáze.")).toBeInTheDocument();
    expect(logToggles).toThrow(); // no per-stage log toggles
  });

  it("hides the definition link when the owner id isn't known yet", () => {
    // A goal's pipeline-maker run still loading → owner "" → no link to /pipelines/.
    render(timeline({ owner: "", stageRuns: [] }));
    expect(screen.queryByRole("button", { name: /pipeline/i })).not.toBeInTheDocument();
  });

  it("renders a verdict chip on a graded qualify stage (Phase 45) and none otherwise", () => {
    render(
      timeline({
        stageRuns: [
          { phaseId: "review", runId: "d_1.review_1", attempt: 1, status: "done", verdict: "gap" },
          { phaseId: "review", runId: "d_1.review_2", attempt: 2, status: "done", verdict: "pass" },
          { phaseId: "koder", runId: "d_1.koder_1", attempt: 1, status: "done" },
        ],
      }),
    );
    expect(screen.getByTestId("stage-verdict-gap")).toHaveTextContent("Chybí část");
    expect(screen.getByTestId("stage-verdict-pass")).toHaveTextContent("Schváleno");
    // The non-qualify koder stage carries no verdict chip.
    expect(screen.queryByTestId("stage-verdict-drift")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^stage-verdict-/)).toHaveLength(2);
  });
});
