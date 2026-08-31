import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_LOOP_STATE } from "../loop";
import { useTaskSubmit } from "./useTaskSubmit";

/**
 * Task 9b: `useTaskSubmit` no longer accepts a `teamId` option — its sole caller,
 * `TaskCommandLine`, dropped the team-tag mirror it used to feed this hook with,
 * since a tagged team doesn't reach a run yet (see `docs/api/teams.md`). The
 * dispatched body must never grow a `teamId` key from this hook; that's the one
 * assertion worth keeping at this level (contract-level `teamId` coverage lives in
 * `libs/contracts/src/tasks/tasks.contract.test.ts`, which this task leaves alone).
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

describe("useTaskSubmit", () => {
  beforeEach(() => {
    createTask.mockClear();
    createGoal.mockClear();
  });

  it("never puts a teamId key on the dispatched createTask body — Task 9b, the option is gone", () => {
    const { result } = renderHook(() => useTaskSubmit(BASE_ARGS));

    act(() => result.current.handleSubmit(null));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body).not.toHaveProperty("teamId");
  });
});
