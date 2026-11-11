import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getInboxRootKey } from "../../inbox/queries/useInboxPrsQuery";
import { getInboxPrThreadsQueryKey } from "../../inbox/queries/useInboxPrThreadsQuery";
import { taskRunsRootKey } from "../../runs/queries/keys";
import { getApprovalsQueryKey } from "../queries/keys";
import { invalidateAfterDecision } from "./invalidateAfterDecision";

describe("invalidateAfterDecision", () => {
  afterEach(() => vi.useRealTimers());

  // todo-2: approving a review / address-comments push must refresh the PR detail's threads
  // too, not only the PR list — so the whole `["inbox"]` family is invalidated.
  it("refreshes the queue, the runs and every inbox query, then the inbox again after settle", () => {
    vi.useFakeTimers();
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    invalidateAfterDecision(qc);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getApprovalsQueryKey() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskRunsRootKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getInboxRootKey() });
    invalidate.mockClear();
    vi.advanceTimersByTime(5_000);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getInboxRootKey() });
  });

  it("the inbox root key prefix-matches a PR's threads", () => {
    const threads = getInboxPrThreadsQueryKey("p", 1);
    expect(threads.slice(0, getInboxRootKey().length)).toEqual([...getInboxRootKey()]);
  });
});
