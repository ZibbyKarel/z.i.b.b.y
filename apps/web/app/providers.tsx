"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DesignSystemProvider } from "@zibby/design-system";
import { type ReactNode, useState } from "react";
import { apiClient } from "../state/api";
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
          {/* ZB-01/O-01/D-014: light is now the default theme (was dark-only).
              `theme="system"` follows the OS preference and re-resolves live;
              a first-run browser with no stored choice and no matchMedia read
              falls back to light via `ThemeScript`'s `fallback` (root layout).
              No header toggle yet: there is no DS `ThemeToggle` component and
              no app-level `ThemeChoice` state to drive it from — both are
              deferred to ZB-11 (Appearance settings), the phase ROUTE-MAP §3
              already assigns them to; see the ZB-01 report for the explicit
              call-out. */}
          <DesignSystemProvider theme="system">
            <BootSplash>{children}</BootSplash>
            <Toaster />
          </DesignSystemProvider>
        </RunEventsProvider>
      </apiClient.ReactQueryProvider>
    </QueryClientProvider>
  );
}
