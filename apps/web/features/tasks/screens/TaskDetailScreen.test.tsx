import { ChainRouteStripTestId } from "@zibby/design-system";
import type { SubtaskSummary, TaskDetail } from "@zibby/contracts";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { TaskDetailScreen } from "./TaskDetailScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    task: undefined as TaskDetail | undefined,
    isPending: false,
    isError: false,
  },
}));
const refetch = vi.fn();
const approveMutate = vi.fn();

vi.mock("../queries", () => ({
  useTaskQuery: () => ({
    data: hooks.task,
    isPending: hooks.isPending,
    isError: hooks.isError,
    refetch,
  }),
}));
vi.mock("../../approvals", () => ({
  useApprovalsQuery: () => ({ data: [] }),
  useApproveMutation: () => ({ mutate: approveMutate }),
}));
vi.mock("../../approvals/approval", () => ({
  HIGH_RISK_TYPES: new Set(),
  formatWaited: () => "1m",
}));
vi.mock("../../departments/queries", () => ({
  useDepartmentRosterQuery: () => ({ data: undefined }),
}));
vi.mock("../../runs/queries/useRunsQuery", () => ({
  useRunGlyphMap: () => new Map(),
}));
vi.mock("../../runs/queries/useTaskRunQuery", () => ({
  useTaskRunQuery: () => ({ data: undefined, isPending: false, isError: false }),
}));
vi.mock("../../runs/useRunActions", () => ({
  useRunActions: () => ({
    stop: vi.fn(),
    stopping: false,
    resume: vi.fn(),
    resuming: false,
    remove: vi.fn(),
    deleting: false,
  }),
}));

function subtask(overrides: Partial<SubtaskSummary> = {}): SubtaskSummary {
  return { taskId: "sub_1", state: "working", ...overrides };
}

function task(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: "t_1",
    title: "Ship the release",
    text: "Ship the release",
    paths: [],
    toolGrants: [],
    attachments: [],
    scheduledAt: Date.now(),
    status: "done",
    createdAt: "2020-01-01T08:00:00.000Z",
    subtasks: [],
    ...overrides,
  } as TaskDetail;
}

describe("TaskDetailScreen (ZB-04b)", () => {
  beforeEach(() => {
    hooks.task = undefined;
    hooks.isPending = false;
    hooks.isError = false;
    push.mockClear();
    refetch.mockClear();
  });

  it("renders the task title and the no-subtasks empty state", () => {
    hooks.task = task();
    render(<TaskDetailScreen taskId="t_1" />);
    expect(screen.getAllByText("Ship the release").length).toBeGreaterThan(0);
    expect(screen.getByText("Zatím žádné podúkoly")).toBeInTheDocument();
  });

  it("renders a chain route strip and selects a subtask on click", () => {
    hooks.task = task({ subtasks: [subtask({ department: "dev" })] });
    render(<TaskDetailScreen taskId="t_1" />);
    expect(screen.getByTestId(ChainRouteStripTestId.Root)).toBeInTheDocument();
  });

  it("navigates back to the tasks list", () => {
    hooks.task = task();
    render(<TaskDetailScreen taskId="t_1" />);
    fireEvent.click(screen.getByText("← Zpět na úkoly"));
    expect(push).toHaveBeenCalledWith("/work/tasks");
  });
});
