import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installEventSourceMock } from "../../test/eventSourceMock";
import { getApprovalsQueryKey } from "../approvals/queries/keys";
import { getChainRunsQueryKey } from "../chains/queries/keys";

// `API_URL` gates the provider (no URL → no stream); pin it so the EventSource opens.
vi.mock("../../state/api", () => ({ API_URL: "http://localhost:3333" }));

import { RunEventsProvider } from "./runEvents";

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

  it("an awaiting-approval run transition refreshes the approvals queue (existing path)", () => {
    act(() => {
      mock.last().emit({ scope: "agent-runs", runId: "writer_1", status: "awaiting-approval" });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getApprovalsQueryKey() });
  });

  it("a pipeline-runs event refreshes the chain runs (a chain advances on step transitions)", () => {
    act(() => {
      mock.last().emit({ scope: "pipeline-runs", runId: "delivery_1", status: "done" });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getChainRunsQueryKey() });
  });
});
