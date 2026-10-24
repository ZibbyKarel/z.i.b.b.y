import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getInventoryQueryKey } from "../queries/useInventoryQuery";
import { useInstallSkillMutation } from "./useInstallSkillMutation";

let options: { meta?: unknown; onSettled?: () => void } = {};
vi.mock("../../../state/api", () => ({
  apiClient: {
    inventory: {
      installSkill: {
        useMutation: (o: typeof options) => {
          options = o;
          return {};
        },
      },
    },
  },
}));

describe("useInstallSkillMutation", () => {
  it("is inlineError and invalidates the inventory query when settled", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => useInstallSkillMutation(), { wrapper });
    expect(options.meta).toEqual({ inlineError: true });
    options.onSettled?.();
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: getInventoryQueryKey() }));
  });
});
