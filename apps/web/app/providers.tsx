"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { apiClient } from "../state/api";
import { AppearanceProvider } from "../state/appearance";
import { RunEventsProvider } from "../features/runs/runEvents";
import { BootSplash } from "../components/layout/BootSplash/BootSplash";
import { Toaster } from "../components/Toaster/Toaster";
import { toastBus } from "../components/Toaster/toastBus";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
        // Always-answerable for writes: one wiring point surfaces every mutation error
        // (network / server / schema-drift — the cases ts-rest throws on) as a toast, so a
        // failed delete / create / toggle is never silent. The copy is localized in Toaster.
        mutationCache: new MutationCache({
          onError: () => toastBus.emit(),
        }),
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <apiClient.ReactQueryProvider>
        <RunEventsProvider>
          {/* ZB-01/O-01/D-014: light is the default theme (was dark-only); a
              first-run browser with no stored choice and no matchMedia read
              falls back to light via `ThemeScript`'s `fallback` (root layout).
              ZB-11: `AppearanceProvider` owns the live `ThemeChoice` +
              reduced-motion state (`/system/settings/appearance` reads and
              writes both via `useAppearance()`) and wraps `DesignSystemProvider`
              itself so the resolved choice always drives the token swap. */}
          <AppearanceProvider>
            <BootSplash>{children}</BootSplash>
            <Toaster />
          </AppearanceProvider>
        </RunEventsProvider>
      </apiClient.ReactQueryProvider>
    </QueryClientProvider>
  );
}
