import { useCallback } from "react";
import { useDepartmentLookup } from "../departments/useDepartmentLookup";
import { type AgentSymbol, agentSymbol } from "./agentSymbol";
import { useAgentsQuery } from "./queries";

/**
 * Resolver `(id or name) → AgentSymbol` over the agents + departments caches.
 * Unknown agents get the neutral `bot` symbol with no colour.
 */
export function useAgentSymbol(): (idOrName?: string) => AgentSymbol {
  const { data: agents } = useAgentsQuery();
  const { list: departments } = useDepartmentLookup();
  return useCallback(
    (idOrName) =>
      agentSymbol(
        idOrName ? agents?.find((a) => a.id === idOrName || a.name === idOrName) : undefined,
        departments,
      ),
    [agents, departments],
  );
}
