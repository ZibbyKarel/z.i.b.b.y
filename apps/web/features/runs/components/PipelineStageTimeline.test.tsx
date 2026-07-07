import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { IconTileTestId } from "@zibby/design-system";
import type { RunView } from "../run";
import { PipelineStageTimeline, PipelineStageTimelineTestId } from "./PipelineStageTimeline";

// The stage log is read on demand from the per-phase endpoint; stub both surfaces
// (the terminal one-shot query and the live SSE tail) so the test needs no backend
// and can assert which phase each row opens — and over which transport (N1 DNA:
// a live log streams, a finished log is a one-shot state read). The pipeline
// definition + agent catalog are stubbed too (Phase 36 resolves each phase's agent
// avatar/name and loop/produces metadata from them) — default to "unknown", so
// most tests read the honest phaseId fallback; a few override to exercise resolution.
const { stageLogMock, stageStreamMock, pipelinesMock, agentsMock } = vi.hoisted(() => ({
  stageLogMock: vi.fn((_id: string, phaseId: string | undefined) => ({
    data: phaseId ? { content: `LOG for ${phaseId}` } : undefined,
    isPending: false,
  })),
  stageStreamMock: vi.fn((_id: string, phaseId: string | null) => ({
    text: phaseId ? `STREAM for ${phaseId}` : "",
    done: false,
  })),
  pipelinesMock: vi.fn(() => ({ data: [] as unknown[] })),
  agentsMock: vi.fn(() => ({ data: [] as unknown[] })),
}));
vi.mock("../queries/useStageRunLogQuery", () => ({ useStageRunLogQuery: stageLogMock }));
vi.mock("../useRunLogStream", () => ({ useStageRunLogStream: stageStreamMock }));
vi.mock("../../pipelines", () => ({ usePipelinesQuery: pipelinesMock }));
vi.mock("../../agents", () => ({ useAgentsQuery: agentsMock }));

const stages: RunView["stageRuns"] = [
  { phaseId: "build", runId: "delivery_1.build_1", attempt: 1, status: "done" },
  { phaseId: "verify", runId: "delivery_1.verify_1", attempt: 1, status: "done" },
];

const timeline = (
  props?: Partial<{
    owner: string;
    stageRuns: RunView["stageRuns"];
    currentStage: string | null;
    live: boolean;
    parked: RunView["parked"];
  }>,
) => (
  <PipelineStageTimeline
    currentStage={props?.currentStage}
    live={props?.live}
    owner={props?.owner ?? "delivery"}
    parked={props?.parked}
    pipelineRunId="delivery_1"
    stageRuns={props?.stageRuns ?? stages}
  />
);

// The whole phase-row header is the log toggle now (Phase 46) — select it by its
// stable testid, not the removed "log" button label.
const logToggles = () => screen.getAllByTestId(PipelineStageTimelineTestId.RowToggle);

/** A 3-phase pipeline definition — "verify" is the qualify gate that loops back to
 * "koder" (mirrors the delivery loop: Kodér ⇄ Code-Review ⇄ Tester). */
const PIPELINE = {
  id: "delivery",
  name: "Delivery",
  lastRun: "—",
  lastState: "done" as const,
  desc: "",
  file: "",
  phases: [
    { id: "build", type: "agent" as const, agent: "koder", produces: "feat/search-filters" },
    {
      id: "verify",
      type: "agent" as const,
      agent: "tester",
      qualify: true,
      loop: { to: "koder", maxRetries: 3, escalate: true, then: "park" },
    },
    { id: "docs", type: "agent" as const, agent: "dokumentator" },
  ],
  outputs: [],
};

const AGENTS = [
  { id: "koder", name: "Kodér", glyph: "code" },
  { id: "tester", name: "Tester", glyph: "flask" },
];

describe("PipelineStageTimeline (36)", () => {
  beforeEach(() => {
    stageLogMock.mockClear();
    stageStreamMock.mockClear();
    pipelinesMock.mockReset().mockReturnValue({ data: [] });
    agentsMock.mockReset().mockReturnValue({ data: [] });
  });

  it("renders one node per phase, falling back to the bare phaseId without a known pipeline", () => {
    render(timeline());
    expect(screen.getByText("build")).toBeInTheDocument();
    expect(screen.getByText("verify")).toBeInTheDocument();
  });

  it("resolves each phase's agent name from the pipeline + agent catalogs", () => {
    pipelinesMock.mockReturnValue({ data: [PIPELINE] });
    agentsMock.mockReturnValue({ data: AGENTS });
    render(timeline());
    expect(screen.getByText("Kodér")).toBeInTheDocument();
    expect(screen.getByText("Tester")).toBeInTheDocument();
    expect(screen.queryByText("build")).not.toBeInTheDocument();
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

  it("has no standalone 'log' button — the whole phase-row header is the toggle", () => {
    render(timeline());
    expect(screen.queryByRole("button", { name: /^log$/i })).not.toBeInTheDocument();
    // Each real phase row exposes a labeled toggle (Law 4) — a real button.
    const [first] = logToggles();
    expect(first).toHaveRole("button");
    expect(first).toHaveAccessibleName();
    expect(first).toHaveAttribute("aria-controls");
  });

  it("reflects open/closed state on the row toggle via aria-expanded", async () => {
    render(timeline());
    const [first] = logToggles();
    expect(first).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(first!);
    expect(first).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(first!);
    expect(first).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles the log from the keyboard — Tab to the row, Enter opens it", async () => {
    render(timeline());
    const [first] = logToggles();
    first!.focus();
    expect(first).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("LOG for build")).toBeInTheDocument();
    expect(first).toHaveAttribute("aria-expanded", "true");
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

  it("folds a phase's earlier attempts into a nested retry block under its one node", () => {
    // The build phase failed once (terminal) and is being retried (live) — ONE node
    // ("build"), its live attempt as the header, the failed attempt folded below it
    // (Phase 36: a retried phase is a single timeline node, not one row per attempt).
    render(
      timeline({
        currentStage: "build",
        live: true,
        stageRuns: [{ phaseId: "build", runId: "delivery_1.build_1", attempt: 1, status: "error" }],
      }),
    );
    expect(screen.getAllByText("build")).toHaveLength(1);
    expect(stageStreamMock).toHaveBeenCalledWith("delivery_1", "build");
    // The folded prior attempt reads its real terminal status ("chyba"), never a
    // fabricated note.
    expect(screen.getByText("pokus 1")).toBeInTheDocument();
    expect(screen.getByText("chyba")).toBeInTheDocument();
  });

  it("shows the loop's maxRetries + loopTo on the retry block when the pipeline definition is known", () => {
    pipelinesMock.mockReturnValue({ data: [PIPELINE] });
    agentsMock.mockReturnValue({ data: AGENTS });
    render(
      timeline({
        stageRuns: [
          { phaseId: "build", runId: "d_1.build_1", attempt: 1, status: "done" },
          { phaseId: "verify", runId: "d_1.verify_1", attempt: 1, status: "done", verdict: "gap" },
          { phaseId: "build", runId: "d_1.build_2", attempt: 2, status: "done" },
          { phaseId: "verify", runId: "d_1.verify_2", attempt: 2, status: "done", verdict: "pass" },
        ],
      }),
    );
    expect(screen.getByText("pokus 1/3")).toBeInTheDocument();
    expect(screen.getByText("vráceno na koder")).toBeInTheDocument();
    // The folded attempt's real verdict is its note, never a fabricated one.
    expect(screen.getByText("Chybí část")).toBeInTheDocument();
  });

  it("shows the escalation line when the run is parked with retries exhausted at this phase", () => {
    pipelinesMock.mockReturnValue({ data: [PIPELINE] });
    render(
      timeline({
        currentStage: "verify",
        parked: { phaseId: "verify", attempts: 3, failureFile: "/x/verify.fail.txt" },
        stageRuns: [
          { phaseId: "build", runId: "d_1.build_1", attempt: 1, status: "done" },
          { phaseId: "verify", runId: "d_1.verify_1", attempt: 1, status: "error" },
        ],
      }),
    );
    expect(
      screen.getByText("vyčerpány pokusy → eskalace → zaparkováno k ranní review"),
    ).toBeInTheDocument();
  });

  it("shows a phase's produced hand-off file once it's done, never while it's still running", () => {
    pipelinesMock.mockReturnValue({ data: [PIPELINE] });
    render(
      timeline({
        stageRuns: [{ phaseId: "build", runId: "d_1.build_1", attempt: 1, status: "done" }],
      }),
    );
    expect(screen.getByText("feat/search-filters")).toBeInTheDocument();
  });

  it("shows a waiting placeholder for a not-yet-reached phase while the run is still open", () => {
    pipelinesMock.mockReturnValue({ data: [PIPELINE] });
    agentsMock.mockReturnValue({ data: AGENTS });
    render(
      timeline({
        currentStage: "verify",
        live: true,
        stageRuns: [{ phaseId: "build", runId: "d_1.build_1", attempt: 1, status: "done" }],
      }),
    );
    // "docs" hasn't run yet, but the run is still open — it shows as a waiting node
    // (named from the pipeline definition — real, not fabricated).
    expect(screen.getByText("čeká na dokončení předchozích fází")).toBeInTheDocument();
    // A placeholder has nothing to open — only the two real stages have a log toggle.
    expect(logToggles()).toHaveLength(2);
  });

  it("shows no waiting placeholder once the run has finished (currentStage cleared)", () => {
    pipelinesMock.mockReturnValue({ data: [PIPELINE] });
    render(
      timeline({
        currentStage: null,
        stageRuns: [
          { phaseId: "build", runId: "d_1.build_1", attempt: 1, status: "done" },
          { phaseId: "verify", runId: "d_1.verify_1", attempt: 1, status: "error" },
        ],
      }),
    );
    expect(screen.queryByText("čeká na dokončení předchozích fází")).not.toBeInTheDocument();
  });

  it("keeps a single stage open — opening another collapses the first", async () => {
    render(
      timeline({
        stageRuns: [
          { phaseId: "build", runId: "delivery_1.build_1", attempt: 1, status: "done" },
          { phaseId: "verify", runId: "delivery_1.verify_1", attempt: 1, status: "running" },
        ],
      }),
    );
    await userEvent.click(logToggles()[0]!);
    expect(screen.getByText("LOG for build")).toBeInTheDocument();

    // The verify row is status "running" → it opens over the SSE tail.
    await userEvent.click(logToggles()[1]!);
    expect(screen.getByText("STREAM for verify")).toBeInTheDocument();
    // The first stage's log is gone — only one open at a time.
    expect(screen.queryByText("LOG for build")).not.toBeInTheDocument();
  });

  it("shows an empty-state when the run has no stages yet", () => {
    render(timeline({ stageRuns: [] }));
    expect(screen.getByText("Tento běh zatím nemá žádné fáze.")).toBeInTheDocument();
    expect(logToggles).toThrow(); // no per-stage log toggles
  });

  it("shows a stage's cost only on the node that carries one, summed across its attempts", () => {
    render(
      timeline({
        stageRuns: [
          { phaseId: "build", runId: "d_1.build_1", attempt: 1, status: "error", costUsd: 0.1 },
          { phaseId: "build", runId: "d_1.build_2", attempt: 2, status: "done", costUsd: 0.19 },
          { phaseId: "verify", runId: "d_1.verify_1", attempt: 1, status: "done" },
        ],
      }),
    );
    expect(screen.getByText("$0.29")).toBeInTheDocument();
    // The costless verify stage shows no dollar figure.
    expect(screen.getAllByText(/^\$/)).toHaveLength(1);
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
    // The current (latest) attempt's verdict is the header chip.
    expect(screen.getByTestId("stage-verdict-pass")).toHaveTextContent("Schváleno");
    // The earlier, folded attempt's verdict is its retry-row note, not its own chip.
    expect(screen.getByText("Chybí část")).toBeInTheDocument();
    // The non-qualify koder stage carries no verdict chip.
    expect(screen.queryByTestId("stage-verdict-drift")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^stage-verdict-/)).toHaveLength(1);
  });

  it("shows the resolved agent's avatar image on the tile when the catalog has one", () => {
    pipelinesMock.mockReturnValue({ data: [PIPELINE] });
    agentsMock.mockReturnValue({
      data: [{ id: "koder", name: "Kodér", glyph: "code", avatar: "/avatars/koder.png" }],
    });
    render(
      timeline({
        stageRuns: [{ phaseId: "build", runId: "d_1.build_1", attempt: 1, status: "done" }],
      }),
    );
    expect(screen.getByTestId(IconTileTestId.Image)).toHaveAttribute("src", "/avatars/koder.png");
  });
});
