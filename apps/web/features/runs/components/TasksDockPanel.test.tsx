import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunView } from "../run";
import { TasksDockPanel, TasksDockPanelTestId } from "./TasksDockPanel";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const base = { owner: "koder", prompt: "", project: "", startedAt: "2026-10-02T10:00:00.000Z" };
const runs: RunView[] = [
  { ...base, runId: "koder_1", kind: "agent", status: "running", title: "Fix", taskId: "task_1" },
  { ...base, runId: "flow_2", kind: "workflow", status: "running", title: "Book" },
  { ...base, runId: "koder_3", kind: "agent", status: "done", title: "Old" },
  { ...base, runId: "q_4", kind: "agent", status: "queued", title: "Waiting" },
] as RunView[];
vi.mock("../queries/useRunsQuery", () => ({
  useRunsQuery: () => ({ runs }),
  useRunGlyphMap: () => new Map(),
}));

const archived: RunView[] = [
  {
    ...base,
    runId: "a_1",
    kind: "agent",
    status: "done",
    title: "Shipped",
    taskId: "task_9",
    prOutput: { url: "https://x/pr/1", additions: 12, deletions: 3 },
  },
  { ...base, runId: "a_2", kind: "agent", status: "error", title: "Broke" },
] as RunView[];
let archiveState: { data?: RunView[]; isPending: boolean; isError: boolean } = {
  data: archived,
  isPending: false,
  isError: false,
};
vi.mock("../queries/useRecentArchivedRunsQuery", () => ({
  getRecentArchivedRunsQueryKey: (n: number) => ["recent", n],
  useRecentArchivedRunsQuery: () => ({ ...archiveState, refetch: vi.fn() }),
}));
vi.mock("../../system", () => ({
  useSystemConfigQuery: () => ({ data: { dockDoneTasksLimit: 5 } }),
}));

const stopMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) =>
  opts?.onSuccess?.(),
);
const resumeMutate = vi.fn();
vi.mock("../mutations", () => ({
  useStopTaskRunMutation: () => ({ mutate: stopMutate, isPending: false }),
  useResumeTaskRunMutation: () => ({ mutate: resumeMutate, isPending: false }),
}));

describe("TasksDockPanel", () => {
  beforeEach(() => {
    push.mockClear();
    stopMutate.mockClear();
    resumeMutate.mockClear();
  });

  it("lists only live runs; a card opens its task detail, else the run detail", async () => {
    const user = userEvent.setup();
    render(<TasksDockPanel />);
    const cards = screen.getAllByTestId(TasksDockPanelTestId.Card);
    expect(cards).toHaveLength(3);
    await user.click(cards[0]!);
    expect(push).toHaveBeenCalledWith("/work/tasks/task_1");
    await user.click(cards[1]!);
    expect(push).toHaveBeenCalledWith("/activity/runs/flow_2");
  });

  it("lists finished runs (incl. errors) with a PR chip, links to the task and the archive", async () => {
    const user = userEvent.setup();
    archiveState = { data: archived, isPending: false, isError: false };
    render(<TasksDockPanel />);
    const done = screen.getAllByTestId(TasksDockPanelTestId.DoneCard);
    expect(done).toHaveLength(2);
    expect(screen.getAllByTestId(TasksDockPanelTestId.DonePr)).toHaveLength(1);
    expect(screen.getByTestId(TasksDockPanelTestId.DonePr)).toHaveTextContent("+12−3");
    await user.click(done[0]!);
    expect(push).toHaveBeenCalledWith("/work/tasks/task_9");
    expect(screen.getByTestId(TasksDockPanelTestId.ArchiveLink)).toHaveAttribute(
      "href",
      "/activity/runs",
    );
  });

  it("shows no finished cards and no archive link when nothing is finished", () => {
    archiveState = { data: [], isPending: false, isError: false };
    render(<TasksDockPanel />);
    expect(screen.queryAllByTestId(TasksDockPanelTestId.DoneCard)).toHaveLength(0);
    expect(screen.queryByTestId(TasksDockPanelTestId.ArchiveLink)).toBeNull();
    archiveState = { data: archived, isPending: false, isError: false };
  });

  it("stops without navigating; restart (agent only) stops then re-runs", async () => {
    const user = userEvent.setup();
    render(<TasksDockPanel />);
    expect(screen.getAllByTestId(TasksDockPanelTestId.Restart)).toHaveLength(1);
    await user.click(screen.getAllByTestId(TasksDockPanelTestId.Stop)[1]!);
    expect(stopMutate).toHaveBeenCalledWith({ params: { runId: "flow_2" }, body: {} });
    expect(resumeMutate).not.toHaveBeenCalled();
    await user.click(screen.getByTestId(TasksDockPanelTestId.Restart));
    expect(resumeMutate).toHaveBeenCalledWith({ params: { runId: "koder_1" }, body: {} });
    expect(push).not.toHaveBeenCalled();
  });
});
