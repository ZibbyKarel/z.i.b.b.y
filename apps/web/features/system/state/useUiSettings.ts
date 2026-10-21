"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type Density,
  type SystemConfig,
  type UiSettings,
  UiSettingsSchema,
} from "@zibby/contracts";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { useSetSystemConfigMutation } from "../mutations";
import { getSystemConfigQueryKey, useSystemConfigQuery } from "../queries";

const BRIDGE_DEBOUNCE_MS = 400;
const DEFAULT_UI: UiSettings = UiSettingsSchema.parse({});

type BridgePatch = Partial<UiSettings["bridge"]>;

/**
 * Operator UI preferences (`SystemConfig.ui`). Writes merge into the LATEST cached
 * config — the PUT replaces the whole document — and update the cache optimistically.
 * `setDensity` writes at once; `setBridge` coalesces patches for 400 ms (drag storms).
 */
export function useUiSettings() {
  const queryClient = useQueryClient();
  const { data } = useSystemConfigQuery();
  const { mutate } = useSetSystemConfigMutation();
  const pending = useRef<BridgePatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The cache holds the raw `{ status, body }` envelope (select runs per observer).
  const latest = useCallback((): SystemConfig | undefined => {
    const raw = queryClient.getQueryData(getSystemConfigQueryKey());
    return raw ? selectApiResponseBody(raw as never) : undefined;
  }, [queryClient]);

  const write = useCallback(
    (patch: (ui: UiSettings) => UiSettings) => {
      const config = latest();
      if (!config) return;
      const next: SystemConfig = { ...config, ui: patch(config.ui) };
      queryClient.setQueryData(getSystemConfigQueryKey(), (old: unknown) =>
        old && typeof old === "object" && "body" in old ? { ...old, body: next } : old,
      );
      mutate({ body: next });
    },
    [latest, queryClient, mutate],
  );

  const flush = useCallback(() => {
    timer.current = null;
    const patch = pending.current;
    pending.current = {};
    write((ui) => ({ ...ui, bridge: { ...ui.bridge, ...patch } }));
  }, [write]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        flush();
      }
    },
    [flush],
  );

  const setDensity = useCallback(
    (density: Density) => write((ui) => ({ ...ui, density })),
    [write],
  );

  const setBridge = useCallback(
    (patch: BridgePatch) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, BRIDGE_DEBOUNCE_MS);
    },
    [flush],
  );

  return { ui: data?.ui ?? DEFAULT_UI, setDensity, setBridge };
}
