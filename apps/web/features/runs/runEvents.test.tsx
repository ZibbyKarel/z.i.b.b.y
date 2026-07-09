import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installEventSourceMock } from "../../test/eventSourceMock";
import { getApprovalsQueryKey } from "../approvals/queries/keys";
import { getChainRunsQueryKey } from "../chains/queries/keys";
import { getPipelineRunQueryKey } from "../pipelines/queries/keys";
import { getCiStatusQueryKey } from "../projects/queries/keys";

// `API_URL` gates the provider (no URL → no stream); pin it so the EventSource opens.
vi.mock("../../state/api", () => ({ API_URL: "http://localhost:3333" }));

import { RunEventsProvider, onRunEvent } from "./runEvents";

describe("RunEventsProvider — SSE-driven invalidation (N1)", () => {
  let mock: ReturnType<typeof installEventSourceMock>;
  let qc: QueryClient;
  let invalidate: MockInstance<QueryClient["invalidateQueries"]>;

  beforeEach(() => {
    mock = installEventSourceMock();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidate = vi.spyOn(qc, "invalidateQueries");
    render(
      <QueryClientProvider client={qc}>
        <RunEventsProvider>
          <div />
        </RunEventsProvider>
      </QueryClientProvider>,
    );
  });
  afterEach(() => {
    mock.restore();
  });

  it("an approval-* activity event refreshes the pending approvals queue", () => {
    // An approval born OUTSIDE a run transition (a task held on budget) announces
    // itself only as `approval-requested` activity — without this the gate would
    // wait for the fallback poll.
    act(() => {
      mock.last().emit({ scope: "activity", kind: "approval-requested", at: "2026-07-01" });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getApprovalsQueryKey() });
  });

  it("a non-approval activity event leaves the approvals queue alone", () => {
    act(() => {
      mock.last().emit({ scope: "activity", kind: "task-created", at: "2026-07-01" });
    });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: getApprovalsQueryKey() });
  });

  it("a monitor-alert activity event refreshes the CI status chip family (N4b)", () => {
    act(() => {
      mock.last().emit({ scope: "activity", kind: "monitor-alert", at: "2026-07-02" });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getCiStatusQueryKey() });
  });

  it("an awaiting-approval run transition refreshes the approvals queue (existing path)", () => {
    act(() => {
      mock.last().emit({ scope: "agent-runs", runId: "writer_1", status: "awaiting-approval" });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getApprovalsQueryKey() });
  });

  it("an agent-runs event with a runId invalidates the single-run aggregate too (Fáze 14.4 — the chat run card reads it for agent runs, not just pipeline/chain)", () => {
    act(() => {
      mock.last().emit({ scope: "agent-runs", runId: "writer_1", status: "running" });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getPipelineRunQueryKey("writer_1") });
  });

  it("a pipeline-runs event refreshes the chain runs (a chain advances on step transitions)", () => {
    act(() => {
      mock.last().emit({ scope: "pipeline-runs", runId: "delivery_1", status: "done" });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getChainRunsQueryKey() });
  });

  // Phase 89: the plain subscribe API the subsystem web's particle layer rides.
  describe("onRunEvent (Phase 89 subscribe API)", () => {
    it("delivers a parsed event to every subscribed listener", () => {
      const listener = vi.fn();
      const unsubscribe = onRunEvent(listener);
      act(() => {
        mock.last().emit({ scope: "pipeline-runs", runId: "delivery_1", status: "running" });
      });
      expect(listener).toHaveBeenCalledWith({
        scope: "pipeline-runs",
        runId: "delivery_1",
        status: "running",
      });
      unsubscribe();
    });

    it("delivers events of every scope, unfiltered (consumers decide what's actionable)", () => {
      const listener = vi.fn();
      const unsubscribe = onRunEvent(listener);
      act(() => {
        mock.last().emit({ scope: "activity", kind: "task-created", at: "2026-07-01" });
      });
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it("unsubscribe stops delivery — no leak across unmount", () => {
      const listener = vi.fn();
      const unsubscribe = onRunEvent(listener);
      unsubscribe();
      act(() => {
        mock.last().emit({ scope: "pipeline-runs", runId: "delivery_1", status: "done" });
      });
      expect(listener).not.toHaveBeenCalled();
    });

    it("subscribing does not change the provider's own invalidation behavior (no regression)", () => {
      const unsubscribe = onRunEvent(vi.fn());
      act(() => {
        mock.last().emit({ scope: "pipeline-runs", runId: "delivery_1", status: "done" });
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: getChainRunsQueryKey() });
      unsubscribe();
    });

    it("a listener that throws doesn't stop the provider's own invalidation", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const unsubscribe = onRunEvent(() => {
        throw new Error("boom");
      });
      act(() => {
        mock.last().emit({ scope: "agent-runs", runId: "writer_1", status: "awaiting-approval" });
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: getApprovalsQueryKey() });
      unsubscribe();
      consoleError.mockRestore();
    });
  });
});
