import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { OPERATOR_QUESTION_ACTION } from "@zibby/contracts";
import { SegmentedControlTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardApproval } from "../../approvals/approval";
import type { RunView } from "../run";
import { RunComposerTestId } from "./RunComposer";
import { RunDetail, RunDetailTestId } from "./RunDetail";
import { RunDetailActionsTestId } from "./RunDetailActions";
import { RunDetailHeaderTestId } from "./RunDetailHeader";
import { RunFeedBannersTestId } from "./RunFeedBanners";
import { RunLiveFeedTestId } from "./RunLiveFeed";
import { RunOutputViewTestId } from "./RunOutputView";
import { RunStageRailTestId } from "./RunStageRail";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { queueRef, stubMutation } = vi.hoisted(() => ({
  queueRef: { current: [] as DashboardApproval[] },
  stubMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../approvals", () => ({
  useApprovalsQuery: () => ({ data: queueRef.current }),
  useApproveMutation: stubMutation,
  useRejectMutation: stubMutation,
  useReviseMutation: stubMutation,
  useAnswerApprovalMutation: stubMutation,
}));
vi.mock("../../tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../tasks")>()),
  useNewTask: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false }),
}));
vi.mock("../../workflows", () => ({
  useWorkflowsQuery: () => ({
    data: [{ id: "delivery", phases: [{ id: "plan" }, { id: "build", loop: { maxRetries: 2 } }] }],
  }),
}));
vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: [] }) }));
vi.mock("../../departments/useDepartmentLookup", () => ({
  useDepartmentLookup: () => ({ name: (id: string) => id, code: (id: string) => id }),
}));
vi.mock("../mutations", () => ({
  useAssignRunProjectMutation: stubMutation,
  useOpenTaskRunFolderMutation: stubMutation,
  useSendTaskRunMessageMutation: stubMutation,
}));
vi.mock("../useRunActions", () => ({
  useRunActions: () => ({
    stop: vi.fn(),
    stopping: false,
    pause: vi.fn(),
    pausing: false,
    resume: vi.fn(),
    resuming: false,
    remove: vi.fn(),
    deleting: false,
  }),
}));
vi.mock("../useRunLogStream", () => ({
  useRunLogStream: () => ({ text: "", done: false }),
  useStageRunLogStream: () => ({ text: "", done: false }),
}));
vi.mock("../queries/useStageRunLogQuery", () => ({
  useStageRunLogQuery: () => ({ data: undefined }),
}));
vi.mock("../queries/useRunArtifactQuery", () => ({
  useRunArtifactQuery: () => ({ data: undefined }),
}));
vi.mock("../queries/useTaskRunFilesQuery", () => ({
  useTaskRunFilesQuery: () => ({ data: undefined }),
}));
vi.mock("./GoalDetailPanel", () => ({
  GoalDetailPanel: () => <div data-testid="goal-detail" />,
}));

const workflowRun: RunView = {
  runId: "delivery_42",
  kind: "workflow",
  owner: "delivery",
  status: "running",
  pct: null,
  title: "",
  prompt: "",
  project: "",
  startedAt: "2026-10-20T10:00:00Z",
  logBase: null,
  taskTitle: "Fix the run detail",
  currentStage: "build",
  stageRuns: [],
};

const approval = {
  id: "ap_1",
  runId: "delivery_42.build_1",
  action: "stage-approval",
  skill: "coder",
  risk: "medium",
  requestedAt: "2026-10-20T10:05:00Z",
  summary: "Hand off the build",
  detail: "",
} as unknown as DashboardApproval;

beforeEach(() => {
  queueRef.current = [];
});

describe("RunDetail", () => {
  it("a running workflow renders header, rail, live feed and composer", () => {
    render(<RunDetail run={workflowRun} />);
    expect(screen.getByTestId(RunDetailTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(RunDetailHeaderTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(RunStageRailTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(`${RunStageRailTestId.Stage}-build`)).toBeInTheDocument();
    expect(screen.getByTestId(RunLiveFeedTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(RunComposerTestId.Root)).toBeInTheDocument();
  });

  it("switching to OUTPUT renders the output view", async () => {
    render(<RunDetail run={workflowRun} />);
    await userEvent.click(screen.getByTestId(`${SegmentedControlTestId.Item}-output`));
    expect(screen.getByTestId(RunOutputViewTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(RunLiveFeedTestId.Root)).not.toBeInTheDocument();
  });

  it("an awaiting-approval run with its approval shows the approval banner", () => {
    queueRef.current = [approval];
    render(<RunDetail run={{ ...workflowRun, status: "awaiting-approval" }} />);
    expect(screen.getByTestId(RunFeedBannersTestId.Approval)).toBeInTheDocument();
  });

  it("an operator question shows the question banner and the composer answers it", () => {
    queueRef.current = [{ ...approval, action: OPERATOR_QUESTION_ACTION }];
    render(<RunDetail run={{ ...workflowRun, status: "awaiting-approval" }} />);
    expect(screen.getByTestId(RunFeedBannersTestId.Question)).toBeInTheDocument();
    expect(screen.getByTestId(RunComposerTestId.Send)).toHaveTextContent("ODPOVĚDĚT ↵");
  });

  it("a paused run offers RESUME", () => {
    render(<RunDetail run={{ ...workflowRun, status: "paused" }} />);
    expect(screen.getByTestId(`${RunDetailActionsTestId.Action}-resume`)).toBeInTheDocument();
  });

  it("a goal run renders the goal panel in LIVE", () => {
    render(<RunDetail run={{ ...workflowRun, kind: "goal", owner: "g1" }} />);
    expect(screen.getByTestId("goal-detail")).toBeInTheDocument();
  });
});
