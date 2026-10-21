import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SystemConfig, UiSettingsSchema } from "@zibby/contracts";
import { getSystemConfigQueryKey } from "../queries/useSystemConfigQuery";
import { useUiSettings } from "./useUiSettings";

const CONFIG = { chatPersona: "jarvis", ui: UiSettingsSchema.parse({}) } as unknown as SystemConfig;
const mutate = vi.fn();
let loaded: SystemConfig | undefined;

vi.mock("../queries", async () => ({
  ...(await vi.importActual<object>("../queries")),
  useSystemConfigQuery: () => ({ data: loaded }),
}));
vi.mock("../mutations", () => ({ useSetSystemConfigMutation: () => ({ mutate }) }));

function setup(seed: SystemConfig | undefined) {
  loaded = seed;
  const client = new QueryClient();
  if (seed) client.setQueryData(getSystemConfigQueryKey(), { status: 200, body: seed });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useUiSettings(), { wrapper }) };
}

beforeEach(() => {
  mutate.mockReset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("useUiSettings", () => {
  it("returns schema defaults until the config loads, and never writes", () => {
    const { result } = setup(undefined);
    expect(result.current.ui.density).toBe("airy");
    act(() => result.current.setDensity("compact"));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("setDensity PUTs the whole latest config immediately and updates the cache", () => {
    const { result, client } = setup(CONFIG);
    act(() => result.current.setDensity("compact"));
    const expected = { ...CONFIG, ui: { ...CONFIG.ui, density: "compact" } };
    expect(mutate).toHaveBeenCalledWith({ body: expected });
    expect(client.getQueryData(getSystemConfigQueryKey())).toMatchObject({ body: expected });
  });

  it("setBridge coalesces patches for 400ms into one write", () => {
    const { result } = setup(CONFIG);
    act(() => {
      result.current.setBridge({ preset: "REVIEW" });
      result.current.setBridge({ collapsed: { a: true } });
    });
    act(() => void vi.advanceTimersByTime(399));
    expect(mutate).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      body: {
        ...CONFIG,
        ui: {
          ...CONFIG.ui,
          bridge: { ...CONFIG.ui.bridge, preset: "REVIEW", collapsed: { a: true } },
        },
      },
    });
  });

  it("merges into the latest cache, not the render-time snapshot", () => {
    const { result, client } = setup(CONFIG);
    act(() => result.current.setBridge({ preset: "REVIEW" }));
    const newer = { ...CONFIG, chatPersona: "other" } as unknown as SystemConfig;
    client.setQueryData(getSystemConfigQueryKey(), { status: 200, body: newer });
    act(() => void vi.advanceTimersByTime(400));
    expect(mutate.mock.calls[0]?.[0].body.chatPersona).toBe("other");
  });
});
