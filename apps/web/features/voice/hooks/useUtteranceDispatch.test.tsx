import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUtteranceDispatch } from "./useUtteranceDispatch";

/**
 * Phase 23: the dispatch hook binds the pure parse/run pair to the real mutations.
 * The mutations + router are mocked so we assert the *wiring*: a spoken task goes
 * straight to `createTask` (no composer modal, no navigation) and the ack walks
 * `dispatching → started`; a recognised gate answer routes to approve instead.
 */
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const approve = vi.fn();
const reject = vi.fn();
vi.mock("../../approvals/mutations", () => ({
  useApproveMutation: () => ({ mutate: approve }),
  useRejectMutation: () => ({ mutate: reject }),
}));

const stop = vi.fn();
vi.mock("../../runs/mutations", () => ({
  useStopAgentMutation: () => ({ mutate: stop }),
}));

type CreateOpts = {
  onSuccess?: (res: unknown) => void;
  onError?: (err: unknown) => void;
};
const createTask = vi.fn();
vi.mock("../../tasks/mutations", () => ({
  useCreateTaskMutation: () => ({ mutate: createTask }),
}));

describe("useUtteranceDispatch", () => {
  beforeEach(() => {
    push.mockClear();
    approve.mockClear();
    reject.mockClear();
    stop.mockClear();
    // Default: the dispatch succeeds, asynchronously (mirrors a real mutation so the
    // optimistic `dispatching` ack is observable before `started`).
    createTask.mockReset();
    createTask.mockImplementation((_vars: unknown, opts?: CreateOpts) => {
      Promise.resolve().then(() =>
        opts?.onSuccess?.({
          status: 201,
          body: { outcome: "dispatched", runRef: "zibby_1" },
        }),
      );
    });
  });

  it("dispatches a spoken task straight to the tasks layer (no modal, no navigation)", async () => {
    const onExit = vi.fn();
    const { result } = renderHook(() =>
      useUtteranceDispatch({ approvals: [], liveRuns: [], onExit, onBrief: vi.fn() }),
    );

    act(() => {
      result.current.dispatch("build me a login page");
    });

    expect(createTask).toHaveBeenCalledWith(
      { body: { text: "build me a login page", paths: [] } },
      expect.anything(),
    );
    // Optimistic ack the instant it's understood — echoes the task back.
    expect(result.current.ack).toEqual({
      key: "dispatching",
      values: { task: "build me a login page" },
    });
    // …then upgrades to `started` once the backend accepts it.
    await waitFor(() => expect(result.current.ack).toEqual({ key: "started" }));

    expect(onExit).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("forwards detected paths with the task text", () => {
    const { result } = renderHook(() =>
      useUtteranceDispatch({
        approvals: [],
        liveRuns: [],
        onExit: vi.fn(),
        onBrief: vi.fn(),
      }),
    );
    act(() => {
      result.current.dispatch("refactor ~/proj/app and tidy it");
    });
    expect(createTask).toHaveBeenCalledWith(
      { body: { text: "refactor ~/proj/app and tidy it", paths: ["~/proj/app"] } },
      expect.anything(),
    );
  });

  it("a failed dispatch surfaces the dispatchFailed ack", async () => {
    createTask.mockImplementation((_vars: unknown, opts?: CreateOpts) => {
      Promise.resolve().then(() => opts?.onError?.(new Error("boom")));
    });
    const { result } = renderHook(() =>
      useUtteranceDispatch({
        approvals: [],
        liveRuns: [],
        onExit: vi.fn(),
        onBrief: vi.fn(),
      }),
    );
    act(() => {
      result.current.dispatch("deploy it");
    });
    await waitFor(() =>
      expect(result.current.ack).toEqual({ key: "dispatchFailed" }),
    );
  });

  it("a recognised gate answer approves — it does not create a task", () => {
    const { result } = renderHook(() =>
      useUtteranceDispatch({
        approvals: [{ id: "appr-1" }],
        liveRuns: [],
        onExit: vi.fn(),
        onBrief: vi.fn(),
      }),
    );
    act(() => {
      result.current.dispatch("schválit");
    });
    expect(approve).toHaveBeenCalledWith({ params: { id: "appr-1" }, body: {} });
    expect(createTask).not.toHaveBeenCalled();
    expect(result.current.ack).toEqual({ key: "approved" });
  });

  it("a spoken status question speaks the briefing — it does not create a task", () => {
    const onBrief = vi.fn();
    const { result } = renderHook(() =>
      useUtteranceDispatch({ approvals: [], liveRuns: [], onExit: vi.fn(), onBrief }),
    );
    act(() => {
      result.current.dispatch("co se děje");
    });
    expect(onBrief).toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
    expect(result.current.ack).toEqual({ key: "briefing" });
  });

  it("an empty utterance dispatches nothing", () => {
    const { result } = renderHook(() =>
      useUtteranceDispatch({
        approvals: [],
        liveRuns: [],
        onExit: vi.fn(),
        onBrief: vi.fn(),
      }),
    );
    act(() => {
      result.current.dispatch("   ");
    });
    expect(createTask).not.toHaveBeenCalled();
    expect(result.current.ack).toEqual({ key: "heard" });
  });
});
