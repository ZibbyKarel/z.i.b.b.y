import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { RunView } from "../run";
import { PipelineStageTimeline } from "./PipelineStageTimeline";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// The stage log is read on demand from the per-phase endpoint; stub it so the test
// needs no backend and can assert which phase each row opens.
const { stageLogMock } = vi.hoisted(() => ({
  stageLogMock: vi.fn((_id: string, phaseId: string | undefined) => ({
    data: phaseId ? { content: `LOG for ${phaseId}` } : undefined,
    isPending: false,
  })),
}));
vi.mock("../queries/useStageRunLogQuery", () => ({ useStageRunLogQuery: stageLogMock }));

const stages: RunView["stageRuns"] = [
  { phaseId: "build", runId: "delivery_1.build_1", attempt: 1, status: "done" },
  { phaseId: "verify", runId: "delivery_1.verify_2", attempt: 2, status: "running" },
];

const timeline = (props?: Partial<{ owner: string; stageRuns: RunView["stageRuns"] }>) => (
  <PipelineStageTimeline
    owner={props?.owner ?? "delivery"}
    pipelineRunId="delivery_1"
    stageRuns={props?.stageRuns ?? stages}
  />
);

const logToggles = () => screen.getAllByRole("button", { name: /^log$/i });

describe("PipelineStageTimeline (28)", () => {
  beforeEach(() => {
    stageLogMock.mockClear();
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
  });

  it("opens a stage's log (by phaseId) on its log toggle", async () => {
    render(timeline());
    await userEvent.click(logToggles()[0]!);
    expect(stageLogMock).toHaveBeenCalledWith("delivery_1", "build");
    expect(screen.getByText("LOG for build")).toBeInTheDocument();
  });

  it("keeps a single stage open — opening another collapses the first", async () => {
    render(timeline());
    await userEvent.click(logToggles()[0]!);
    expect(screen.getByText("LOG for build")).toBeInTheDocument();

    await userEvent.click(logToggles()[1]!);
    expect(screen.getByText("LOG for verify")).toBeInTheDocument();
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
});
