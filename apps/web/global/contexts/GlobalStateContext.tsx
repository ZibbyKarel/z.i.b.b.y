"use client";

import { type ReactNode, createContext, useContext, useState } from "react";
import type { ContextName } from "apps/web/domain";

export interface GlobalStateContextValue {
  context: ContextName;
  setContext: (context: ContextName) => void;
}

export const GlobalStateContext = createContext<GlobalStateContextValue>({
  context: "home",
  setContext: () => {},
});

export function useGlobalStateContext(): GlobalStateContextValue {
  return useContext(GlobalStateContext);
}

export function GlobalStateProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<ContextName>("home");

  return (
    <GlobalStateContext.Provider value={{ context, setContext }}>
      {children}
    </GlobalStateContext.Provider>
  );
}
