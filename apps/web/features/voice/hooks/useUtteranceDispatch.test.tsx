import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUtteranceDispatch } from "./useUtteranceDispatch";

/**
 * The dispatch hook binds the pure parse/run pair to the real mutations. The
 * mutations + router are mocked so we assert the *wiring*:
 * - Phase 23/25: a spoken task is classify-first — high confidence dispatches to
 *   `createTask` (no modal, no navigation); low confidence asks a spoken follow-up
 *   ({@link clarify}) and the next utterance dispatches the combined text (bounded).
 * - a recognised gate answer routes to approve and never classifies.
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

type MutOpts = {
  onSuccess?: (res: unknown) => void;
  onError?: (err: unknown) => void;
};
const classify = vi.fn();
const createTask = vi.fn();
vi.mock("../../tasks/mutations", () => ({
  useClassifyTaskMutation: () => ({ mutate: classify }),
  useCreateTaskMutation: () => ({ mutate: createTask }),
}));

/** A minimal classify verdict at a given confidence (two candidates). */
function routingBody(confidence: number) {
  return {
    target: { kind: "agent", id: "koder", name: "Kodér" },
    confidence,
    reason: "",
    matchedTerms: [],
    candidates: [
      { kind: "agent", id: "koder", name: "Kodér" },
      { kind: "pipeline", id: "delivery", name: "Delivery" },
    ],
    mode: "single",
    proposedGoal: null,
    paths: [],
  };
}

/** Make `classify` resolve (async, like a real mutation) at the given confidence. */
function classifyAt(confidence: number) {
  classify.mockImplementation((_vars: unknown, opts?: MutOpts) => {
    Promise.resolve().then(() =>
      opts?.onSuccess?.({ status: 200, body: routingBody(confidence) }),
    );
  });
}

const options = (over = {}) => ({
  approvals: [],
  liveRuns: [],
  onExit: vi.fn(),
  onBrief: vi.fn(),
  ...over,
});

describe("useUtteranceDispatch", () => {
  beforeEach(() => {
    push.mockClear();
    approve.mockClear();
    reject.mockClear();
    stop.mockClear();
    classify.mockReset();
    createTask.mockReset();
    // Defaults: confident classify, successful dispatch — both async (mirrors real
    // mutations so the optimistic `dispatching` ack is observable before `started`).
    classifyAt(0.85);
    createTask.mockImplementation((_vars: unknown, opts?: MutOpts) => {
      Promise.resolve().then(() =>
        opts?.onSuccess?.({
          status: 201,
          body: { outcome: "dispatched", runRef: "zibby_1" },
        }),
      );
    });
  });

  it("dispatches a confident spoken task to the tasks layer (no modal, no navigation)", async () => {
    const onExit = vi.fn();
    const { result } = renderHook(() =>
      useUtteranceDispatch(options({ onExit })),
    );

    act(() => {
      result.current.dispatch("build me a login page");
    });

    // Optimistic ack the instant it's understood — echoes the task back (visual only).
    expect(result.current.ack).toEqual({
      key: "dispatching",
      values: { task: "build me a login page" },
    });
    // Classify-first, then dispatch, then `started`.
    await waitFor(() => expect(result.current.ack).toEqual({ key: "started" }));
    expect(createTask).toHaveBeenCalledWith(
      { body: { text: "build me a login page", paths: [] } },
      expect.anything(),
    );
    expect(onExit).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("forwards detected paths with the task text", async () => {
    const { result } = renderHook(() => useUtteranceDispatch(options()));
    act(() => {
      result.current.dispatch("refactor ~/proj/app and tidy it");
    });
    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        {
          body: { text: "refactor ~/proj/app and tidy it", paths: ["~/proj/app"] },
        },
        expect.anything(),
      ),
    );
  });

  it("a low-confidence task asks for clarification instead of dispatching blind", async () => {
    classifyAt(0.2);
    const { result } = renderHook(() => useUtteranceDispatch(options()));
    act(() => {
      result.current.dispatch("udělej to s tím");
    });
    await waitFor(() =>
      expect(result.current.ack).toEqual({
        key: "clarify",
        values: { options: "Kodér, Delivery" },
      }),
    );
    expect(createTask).not.toHaveBeenCalled();
  });

  it("the clarification answer dispatches the combined task — no second ask", async () => {
    classifyAt(0.2);
    const { result } = renderHook(() => useUtteranceDispatch(options()));
    act(() => {
      result.current.dispatch("nasaď to");
    });
    await waitFor(() => expect(result.current.ack?.key).toBe("clarify"));

    classify.mockClear();
    act(() => {
      result.current.dispatch("přes Kodér");
    });
    // The answer dispatches the combined text directly — confidence is not re-checked.
    expect(classify).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.ack).toEqual({ key: "started" }));
    expect(createTask).toHaveBeenCalledWith(
      { body: { text: "nasaď to přes Kodér", paths: [] } },
      expect.anything(),
    );
  });

  it("a failed dispatch surfaces the dispatchFailed ack", async () => {
    createTask.mockImplementation((_vars: unknown, opts?: MutOpts) => {
      Promise.resolve().then(() => opts?.onError?.(new Error("boom")));
    });
    const { result } = renderHook(() => useUtteranceDispatch(options()));
    act(() => {
      result.current.dispatch("deploy it");
    });
    await waitFor(() =>
      expect(result.current.ack).toEqual({ key: "dispatchFailed" }),
    );
  });

  it("a recognised gate answer approves — it never classifies or creates a task", () => {
    const { result } = renderHook(() =>
      useUtteranceDispatch(options({ approvals: [{ id: "appr-1" }] })),
    );
    act(() => {
      result.current.dispatch("schválit");
    });
    expect(approve).toHaveBeenCalledWith({ params: { id: "appr-1" }, body: {} });
    expect(classify).not.toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
    expect(result.current.ack).toEqual({ key: "approved" });
  });

  it("a spoken status question speaks the briefing — it does not create a task", () => {
    const onBrief = vi.fn();
    const { result } = renderHook(() =>
      useUtteranceDispatch(options({ onBrief })),
    );
    act(() => {
      result.current.dispatch("co se děje");
    });
    expect(onBrief).toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
    expect(result.current.ack).toEqual({ key: "briefing" });
  });

  it("an empty utterance dispatches nothing", () => {
    const { result } = renderHook(() => useUtteranceDispatch(options()));
    act(() => {
      result.current.dispatch("   ");
    });
    expect(classify).not.toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
    expect(result.current.ack).toEqual({ key: "heard" });
  });
});
