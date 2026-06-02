"use client";

import { type ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DesignSystemProvider } from "@zibby/design-system";
import { apiClient } from "../state/api";

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
        <DesignSystemProvider theme="dark">{children}</DesignSystemProvider>
      </apiClient.ReactQueryProvider>
    </QueryClientProvider>
  );
}
