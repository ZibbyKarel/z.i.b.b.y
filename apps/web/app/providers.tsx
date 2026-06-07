"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DesignSystemProvider } from "@zibby/design-system";
import { type ReactNode, useState } from "react";
import { apiClient } from "../state/api";
import { BootSplash } from "../components/layout/BootSplash/BootSplash";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <apiClient.ReactQueryProvider>
        <DesignSystemProvider theme="dark">
          <BootSplash>{children}</BootSplash>
        </DesignSystemProvider>
      </apiClient.ReactQueryProvider>
    </QueryClientProvider>
  );
}
