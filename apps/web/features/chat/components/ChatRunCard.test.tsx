import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { RunView } from "../../runs/run";
import { ChatRunCard, ChatRunCardTestId } from "./ChatRunCard";

// The card reads the same unified aggregate the runs screen does; stub it so each
// test controls exactly what shape (agent/workflow) comes back.
const { workflowRunMock } = vi.hoisted(() => ({
  workflowRunMock: vi.fn((_runRef: string | null) => ({ data: undefined as RunView | undefined })),
}));
vi.mock("../../workflows", () => ({ useWorkflowRunQuery: workflowRunMock }));

// The expanded detail delegates to the runs screen's own timeline/steps
// components — both are unit-tested separately, so stub them here and assert only
// that ChatRunCard picks the right one with the right props.
vi.mock("../../runs/components/WorkflowStageTimeline", () => ({
  WorkflowStageTimeline: (p: { workflowRunId: string; owner: string }) => (
    <div data-testid="stage-timeline">{`${p.workflowRunId}:${p.owner}`}</div>
  ),
}));

const baseRun: RunView = {
  runId: "delivery_1",
  kind: "agent",
  owner: "writer",
  status: "running",
  pct: 50,
  title: "",
  prompt: "",
  project: "",
  startedAt: new Date().toISOString(),
  logBase: "agents",
};

describe("ChatRunCard (14.3)", () => {
  beforeEach(() => {
    workflowRunMock.mockReset();
  });

  it("shows a compact loading row while the run aggregate hasn't arrived yet", () => {
    workflowRunMock.mockReturnValue({ data: undefined });
    render(<ChatRunCard runRef="delivery_1" />);
    expect(screen.getByTestId(ChatRunCardTestId.Loading)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatRunCardTestId.Header)).not.toBeInTheDocument();
  });

  it("renders collapsed by default: state badge + link, no detail", () => {
    workflowRunMock.mockReturnValue({ data: baseRun });
    render(<ChatRunCard runRef="delivery_1" />);
    expect(screen.getByTestId(ChatRunCardTestId.Header)).toHaveTextContent("běží");
    expect(screen.getByTestId(ChatRunCardTestId.Link)).toHaveAttribute(
      "href",
      "/archiv?run=delivery_1",
    );
    expect(screen.queryByTestId(ChatRunCardTestId.Detail)).not.toBeInTheDocument();
  });

  it("an agent run (no stages/steps) shows no progress caption and no detail on expand", async () => {
    workflowRunMock.mockReturnValue({ data: baseRun });
    const user = userEvent.setup();
    render(<ChatRunCard runRef="delivery_1" />);
    await user.click(screen.getByTestId(ChatRunCardTestId.Toggle));
    expect(screen.queryByTestId(ChatRunCardTestId.Detail)).not.toBeInTheDocument();
  });

  it("a workflow run shows the current stage + done/total progress, and expands into the stage timeline", async () => {
    const run: RunView = {
      ...baseRun,
      kind: "workflow",
      owner: "delivery",
      currentStage: "verify",
      stageRuns: [
        { phaseId: "build", runId: "delivery_1.build_1", attempt: 1, status: "done" },
        { phaseId: "verify", runId: "delivery_1.verify_1", attempt: 1, status: "running" },
      ],
    };
    workflowRunMock.mockReturnValue({ data: run });
    const user = userEvent.setup();
    render(<ChatRunCard runRef="delivery_1" />);

    expect(screen.getByTestId(ChatRunCardTestId.Header)).toHaveTextContent("verify · 1/2");
    expect(screen.queryByTestId("stage-timeline")).not.toBeInTheDocument();

    await user.click(screen.getByTestId(ChatRunCardTestId.Toggle));
    expect(screen.getByTestId(ChatRunCardTestId.Detail)).toBeInTheDocument();
    expect(screen.getByTestId("stage-timeline")).toHaveTextContent("delivery_1:delivery");
  });

  it("clicking the run link does not expand the card (stopPropagation)", async () => {
    workflowRunMock.mockReturnValue({
      data: {
        ...baseRun,
        kind: "workflow",
        owner: "delivery",
        stageRuns: [{ phaseId: "build", runId: "delivery_1.build_1", attempt: 1, status: "done" }],
      },
    });
    const user = userEvent.setup();
    render(<ChatRunCard runRef="delivery_1" />);
    await user.click(screen.getByTestId(ChatRunCardTestId.Link));
    expect(screen.queryByTestId(ChatRunCardTestId.Detail)).not.toBeInTheDocument();
  });

  it("renders the routing target's identity chip in the header when one is given", () => {
    workflowRunMock.mockReturnValue({ data: baseRun });
    render(
      <ChatRunCard
        runRef="delivery_1"
        target={{ kind: "workflow", id: "delivery", name: "Delivery", glyph: "flow" }}
      />,
    );
    expect(screen.getByTestId(ChatRunCardTestId.Header)).toHaveTextContent("Delivery");
  });
});
