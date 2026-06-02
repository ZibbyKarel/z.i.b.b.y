"use client";

import { type ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DesignSystemProvider } from "@zibby/design-system";
import {
  GlobalStateProvider,
  useGlobalStateContext,
} from "apps/web/global/contexts/GlobalStateContext";

const DesignSystemProviderWrapper: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { context } = useGlobalStateContext();

  return (
    <DesignSystemProvider
      theme="dark"
      tokens={
        // TEMPORARY. THIS WILL BE DYNAMIC LIST IN THE END
        context === "home"
          ? {
              colorAccent: "#f0b429",
              colorAccentDim: "rgba(240,180,41,0.16)",
              colorAccentContrast: "#0a0c10",
              colorAccentGlow: "rgba(240,180,41,0.4)",
              shadowGlowAccent: "0 0 16px rgba(240,180,41,0.4)",
            }
          : {
              colorAccent: "#5b8def",
              colorAccentDim: "rgba(91,141,239,0.16)",
              colorAccentContrast: "#0a0c10",
              colorAccentGlow: "rgba(91,141,239,0.4)",
              shadowGlowAccent: "0 0 16px rgba(91,141,239,0.4)",
            }
      }
    >
      {children}
    </DesignSystemProvider>
  );
};

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
      <GlobalStateProvider>
        <DesignSystemProviderWrapper>{children}</DesignSystemProviderWrapper>
      </GlobalStateProvider>
    </QueryClientProvider>
  );
}
