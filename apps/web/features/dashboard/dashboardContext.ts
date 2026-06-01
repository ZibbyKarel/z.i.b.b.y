import { createContext, useContext } from "react";
import type { ContextName } from "@zibby/design-system";

interface DashboardContextValue {
  context: ContextName;
}

export const DashboardContext = createContext<DashboardContextValue>({ context: "home" });

export function useDashboardContext(): DashboardContextValue {
  return useContext(DashboardContext);
}
