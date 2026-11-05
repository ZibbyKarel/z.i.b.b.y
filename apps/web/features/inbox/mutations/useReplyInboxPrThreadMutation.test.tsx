import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";
import { useReplyInboxPrThreadMutation } from "./useReplyInboxPrThreadMutation";

vi.mock("../../../state/api", () => ({
  apiClient: {
    inbox: {
      replyInboxPrThread: {
        // Real useMutation so isPending reflects the onSuccess promise, like production.
        useMutation: (o: { onSuccess: () => unknown }) =>
          useMutation({ mutationFn: async () => ({ status: 200 }), onSuccess: o.onSuccess }),
      },
    },
  },
}));

describe("useReplyInboxPrThreadMutation", () => {
  it("stays pending until the thread and PR queries are refetched", async () => {
    const qc = new QueryClient();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const invalidate = vi.spyOn(qc, "invalidateQueries").mockReturnValue(gate);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useReplyInboxPrThreadMutation(), { wrapper });

    act(() => {
      result.current.mutate({} as never);
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["inbox", "pr-threads"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getInboxPrsQueryKey() });
    expect(result.current.isPending).toBe(true);

    release();
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });
});
