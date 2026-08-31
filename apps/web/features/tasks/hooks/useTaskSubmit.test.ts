import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_LOOP_STATE } from "../loop";
import { useTaskSubmit } from "./useTaskSubmit";

/**
 * Task 8 fix round 1: `teamId` is the missing plumbing between `TaskCommandLine`'s
 * mirrored team-tag state and the dispatched create-task body. This hook is the one
 * place both the single-dispatch and loop paths build that body, so it's tested at
 * this level (not just through `TaskCommandLine.test.tsx`) — the UI-level "does a
 * team leak onto the next submission" scenario has no real execution path (every
 * outcome either closes the dialog or swaps in `ScheduledConfirmation`, per
 * `TaskCommandLine.tsx`), so the discriminating "no stale teamId across calls" check
 * belongs here, at the hook's own prop-to-body binding.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const createTask = vi.fn();
vi.mock("../mutations", () => ({
  useCreateTaskMutation: () => ({ mutate: createTask, isPending: false }),
}));

const createGoal = vi.fn();
vi.mock("../../goals", () => ({
  useCreateGoalMutation: () => ({ mutate: createGoal, isPending: false }),
}));

const BASE_ARGS = {
  title: "",
  composedText: "zkontroluj zálohy",
  paths: [],
  output: undefined,
  chosenTarget: null,
  isLoop: false,
  loop: INITIAL_LOOP_STATE,
  now: Date.now(),
  text: "zkontroluj zálohy",
  onClose: vi.fn(),
  setScheduledWhen: vi.fn(),
};

describe("useTaskSubmit — teamId plumbing (Task 8 fix round 1)", () => {
  beforeEach(() => {
    createTask.mockClear();
    createGoal.mockClear();
  });

  it("carries the exact teamId onto the createTask body — not merely that it dispatched", () => {
    const { result } = renderHook(() => useTaskSubmit({ ...BASE_ARGS, teamId: "devrel" }));

    act(() => result.current.handleSubmit(null));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.teamId).toBe("devrel");
  });

  it('omits teamId entirely — not "", not null — when none is passed', () => {
    const { result } = renderHook(() => useTaskSubmit({ ...BASE_ARGS, teamId: undefined }));

    act(() => result.current.handleSubmit(null));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body).not.toHaveProperty("teamId");
  });

  it("does not leak a teamId from a prior render/submission into a later one with none", () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useTaskSubmit>,
      { teamId: string | undefined }
    >((props) => useTaskSubmit({ ...BASE_ARGS, teamId: props.teamId }), {
      initialProps: { teamId: "devrel" },
    });

    act(() => result.current.handleSubmit(null));
    expect(createTask.mock.calls[0]?.[0].body.teamId).toBe("devrel");

    rerender({ teamId: undefined });
    act(() => result.current.handleSubmit(null));

    expect(createTask).toHaveBeenCalledTimes(2);
    expect(createTask.mock.calls[1]?.[0].body).not.toHaveProperty("teamId");
  });

  it("threads teamId through the loop dispatch's createTask body too", () => {
    const loop = {
      ...INITIAL_LOOP_STATE,
      objective: "sleduj limity",
      maker: "agent:builder",
    };
    createGoal.mockImplementation((_vars, opts) => opts?.onSuccess?.({ status: 201, body: {} }));
    const { result } = renderHook(() =>
      useTaskSubmit({ ...BASE_ARGS, isLoop: true, loop, teamId: "devrel" }),
    );

    act(() => result.current.handleSubmit(null));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.teamId).toBe("devrel");
  });
});
