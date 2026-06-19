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
          <DesignSystemProvider theme="dark">
            <BootSplash>{children}</BootSplash>
            <Toaster />
          </DesignSystemProvider>
        </RunEventsProvider>
      </apiClient.ReactQueryProvider>
    </QueryClientProvider>
  );
}
