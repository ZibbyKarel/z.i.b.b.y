import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunView } from "./run";

type MutateOptions = { onSuccess?: (res: { body: { runId: string } }) => void };

const { stop, pause, resume, resumed, fake } = vi.hoisted(() => ({
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  resumed: { runId: "run_1" },
  fake: (mutate: (...args: unknown[]) => unknown) => () => ({ mutate, isPending: false }),
}));

vi.mock("./mutations", () => ({
  useStopTaskRunMutation: fake(stop),
  usePauseTaskRunMutation: fake(pause),
  useResumeTaskRunMutation: () => ({
    mutate: (vars: unknown, opts?: MutateOptions) => {
      resume(vars);
      opts?.onSuccess?.({ body: { runId: resumed.runId } });
    },
    isPending: false,
  }),
  useDeleteAgentRunMutation: fake(vi.fn()),
  useDeleteWorkflowRunMutation: fake(vi.fn()),
}));
vi.mock("../tasks", () => ({ useCancelScheduledTaskMutation: fake(vi.fn()) }));

import { useRunActions } from "./useRunActions";

const run = (patch: Partial<RunView>): RunView =>
  ({ runId: "run_1", kind: "workflow", status: "running", ...patch }) as RunView;

describe("useRunActions", () => {
  const onResumed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resumed.runId = "run_1";
  });

  const actions = () => renderHook(() => useRunActions(onResumed, vi.fn())).result.current;

  it("re-runs a done run fresh with body { mode: 'fresh' }", () => {
    resumed.runId = "run_2";
    actions().resume(run({ status: "done" }), { mode: "fresh" });
    expect(resume).toHaveBeenCalledWith({ params: { runId: "run_1" }, body: { mode: "fresh" } });
    expect(onResumed).toHaveBeenCalledWith("run_2");
  });

  it("does not resume a done run without mode fresh", () => {
    actions().resume(run({ status: "done" }));
    expect(resume).not.toHaveBeenCalled();
  });

  it("does not call onResumed when the run resumed in place", () => {
    actions().resume(run({ status: "paused" }), { note: " try again " });
    expect(resume).toHaveBeenCalledWith({
      params: { runId: "run_1" },
      body: { note: "try again" },
    });
    expect(onResumed).not.toHaveBeenCalled();
  });

  it("pauses a running workflow run", () => {
    actions().pause(run({}));
    expect(pause).toHaveBeenCalledWith({ params: { runId: "run_1" }, body: {} });
  });

  it("does not pause an agent run", () => {
    actions().pause(run({ kind: "agent" }));
    expect(pause).not.toHaveBeenCalled();
  });
});
