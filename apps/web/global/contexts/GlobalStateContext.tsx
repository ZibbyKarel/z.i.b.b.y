"use client";

import { type ReactNode, createContext, useContext } from "react";
import { useSearchParams } from "next/navigation";
import type { ContextName } from "apps/web/domain";

export interface GlobalStateContextValue {
  context: ContextName;
}

export const GlobalStateContext = createContext<GlobalStateContextValue>({
  context: "home",
});

export function useGlobalStateContext(): GlobalStateContextValue {
  return useContext(GlobalStateContext);
}

export function GlobalStateProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const rawCtx = params.get("ctx") ?? "home";
  const context: ContextName = rawCtx === "work" ? "work" : "home";

  return (
    <GlobalStateContext.Provider value={{ context }}>
      {children}
    </GlobalStateContext.Provider>
  );
}
