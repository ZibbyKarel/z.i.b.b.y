import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunView } from "../run";
import { RunningRail, RunningRailTestId } from "./RunningRail";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const base = { owner: "koder", prompt: "", project: "", startedAt: "2026-10-02T10:00:00.000Z" };
const runs: RunView[] = [
  { ...base, runId: "koder_1", kind: "agent", status: "running", title: "Fix", taskId: "task_1" },
  { ...base, runId: "flow_2", kind: "workflow", status: "running", title: "Book" },
  { ...base, runId: "koder_3", kind: "agent", status: "done", title: "Old" },
] as RunView[];
vi.mock("../queries/useRunsQuery", () => ({
  useRunsQuery: () => ({ runs }),
  useRunGlyphMap: () => new Map(),
}));

const stopMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) =>
  opts?.onSuccess?.(),
);
const resumeMutate = vi.fn();
vi.mock("../mutations", () => ({
  useStopTaskRunMutation: () => ({ mutate: stopMutate, isPending: false }),
  useResumeTaskRunMutation: () => ({ mutate: resumeMutate, isPending: false }),
}));

describe("RunningRail", () => {
  beforeEach(() => {
    push.mockClear();
    stopMutate.mockClear();
    resumeMutate.mockClear();
  });

  it("lists only live runs; a card opens its task detail, else the run detail", async () => {
    const user = userEvent.setup();
    render(<RunningRail />);
    const cards = screen.getAllByTestId(RunningRailTestId.Card);
    expect(cards).toHaveLength(2);
    await user.click(cards[0]!);
    expect(push).toHaveBeenCalledWith("/work/tasks/task_1");
    await user.click(cards[1]!);
    expect(push).toHaveBeenCalledWith("/activity/runs/flow_2");
  });

  it("stops without navigating; restart (agent only) stops then re-runs", async () => {
    const user = userEvent.setup();
    render(<RunningRail />);
    expect(screen.getAllByTestId(RunningRailTestId.Restart)).toHaveLength(1);
    await user.click(screen.getAllByTestId(RunningRailTestId.Stop)[1]!);
    expect(stopMutate).toHaveBeenCalledWith({ params: { runId: "flow_2" }, body: {} });
    expect(resumeMutate).not.toHaveBeenCalled();
    await user.click(screen.getByTestId(RunningRailTestId.Restart));
    expect(resumeMutate).toHaveBeenCalledWith({ params: { runId: "koder_1" }, body: {} });
    expect(push).not.toHaveBeenCalled();
  });
});
