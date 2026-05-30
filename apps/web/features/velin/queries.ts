import { useQuery } from "@tanstack/react-query"
import type { QueryKey } from "@tanstack/react-query"
import type { ContextName } from "@zibby/design-system"
import {
  AGENT_SDK,
  AGENTS,
  APPROVALS,
  BRIEFING,
  CLAUDE_LIMITS,
  PIPELINES,
  RUNNING_AGENTS,
  SYSTEM,
  favSkillsFor,
} from "./fixtures"

// Key factories exported separately so mutations / invalidation can reference
// them without running a hook (per project convention).
export const quotaQueryKey = (): QueryKey => ["velin", "quota"]
export const overviewQueryKey = (ctx: ContextName): QueryKey => ["velin", "overview", ctx]
export const pipelinesQueryKey = (ctx: ContextName): QueryKey => ["velin", "pipelines", ctx]
export const agentsQueryKey = (): QueryKey => ["velin", "agents"]

// In production these hit API routes that read files on disk; here they resolve
// the fixtures so the dashboard is interactive end-to-end.
const settle = <T,>(value: T): Promise<T> => Promise.resolve(value)

export function useQuotaQuery() {
  return useQuery({
    queryKey: quotaQueryKey(),
    queryFn: () => settle({ limits: CLAUDE_LIMITS, credit: AGENT_SDK }),
  })
}

export function useOverviewQuery(ctx: ContextName) {
  return useQuery({
    queryKey: overviewQueryKey(ctx),
    queryFn: () =>
      settle({
        favorites: favSkillsFor(ctx),
        running: RUNNING_AGENTS,
        approvals: APPROVALS,
        briefing: BRIEFING,
        system: SYSTEM,
        credit: AGENT_SDK,
        limits: CLAUDE_LIMITS,
      }),
  })
}

export function usePipelinesQuery(ctx: ContextName) {
  return useQuery({
    queryKey: pipelinesQueryKey(ctx),
    queryFn: () => settle(PIPELINES.filter((p) => p.ctx === ctx)),
  })
}

export function useAgentsQuery() {
  return useQuery({ queryKey: agentsQueryKey(), queryFn: () => settle(AGENTS) })
}
