import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useSetQuickActionsMutation } from "./useSetQuickActionsMutation";

const d = vi.hoisted(() => ({
  onSuccess: undefined as ((r: unknown) => void) | undefined,
}));

vi.mock("../../../state/api", () => ({
  apiClient: {
    quickActions: {
      putQuickActions: {
        useMutation: (o: { onSuccess: (r: unknown) => void }) => {
          d.onSuccess = o.onSuccess;
          return {};
        },
      },
    },
  },
}));

describe("useSetQuickActionsMutation", () => {
  it("writes the saved list into the cache, then invalidates", () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useSetQuickActionsMutation(), { wrapper });
    const saved = { status: 200, body: [{ id: "a", label: "A", text: "t" }] };
    d.onSuccess?.(saved);
    expect(qc.getQueryData(["quick-actions"])).toEqual(saved);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["quick-actions"] });
  });
});
