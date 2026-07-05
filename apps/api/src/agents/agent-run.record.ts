import { AgentIdSchema, type AgentRun, AgentRunSchema, WorkspaceSchema } from "@zibby/contracts";
import { z } from "zod";
import type { BaseRun, KindStrategy, RunSpec } from "../runner/runner-core.types";

/**
 * The on-disk / in-memory record for an agent run. It is a strict superset of the
 * contract's {@link AgentRun}: it adds the runner discriminator (`kind`) and the
 * Phase 6 `pgid`, neither of which is exposed over HTTP. {@link toAgentRun}
 * projects it back down to the exact contract shape.
 */
export const AgentRunRecordSchema = AgentRunSchema.extend({
  // Default so sidecars written before `kind` existed (and the restart-reconcile
  // test, which writes a bare AgentRun) still parse as agent runs.
  kind: z.literal("agent").default("agent"),
  pgid: z.number().int().optional(),
  /**
   * The `traceId` of the request that started the run. A mid-run gate fires long
   * after that request returned (from child output), so the origin is persisted
   * with the run to re-link its background logs — surviving an API restart.
   */
  traceId: z.string().optional(),
  /**
   * Fáze 2b: the agent ids in this run's curated `--agents` delegation catalog
   * (from `ClaudeRunCommandService.buildClaudeCommand`'s `catalogAgentIds`).
   * Internal-only (never over HTTP — {@link toAgentRun} drops it): an orchestrator
   * run's mid-run `evaluateIntent` reads it back to pull each catalog subagent's
   * own `gates`/`requires_approval` into the strictest-union evaluation, since a
   * delegated action otherwise loses the subagent's identity (Zjištění 3a).
   */
  catalogAgentIds: z.array(z.string()).optional(),
});

export type AgentRunRecord = z.infer<typeof AgentRunRecordSchema> & BaseRun;

/** Read the optional workspace off `spec.extra` (set only for git-project agent runs). */
function workspaceFromExtra(extra: RunSpec["extra"]): AgentRunRecord["workspace"] {
  const ws = extra.workspace;
  const parsed = WorkspaceSchema.safeParse(ws);
  return parsed.success ? parsed.data : undefined;
}

/** Project a runner record down to the contract `AgentRun` (drops `kind`/`pgid`). */
export function toAgentRun(rec: AgentRunRecord): AgentRun {
  return AgentRunSchema.parse(rec);
}

/** The strategy that teaches {@link RunnerCore} how to handle the `agent` kind. */
export const agentStrategy: KindStrategy<AgentRunRecord> = {
  schema: AgentRunRecordSchema,
  assemble(base: BaseRun, spec: RunSpec): AgentRunRecord {
    return {
      ...base,
      kind: "agent",
      agentId: AgentIdSchema.parse(spec.extra.agentId),
      title: String(spec.extra.title ?? ""),
      prompt: String(spec.extra.prompt ?? ""),
      project: String(spec.extra.project ?? ""),
      files: Array.isArray(spec.extra.files) ? spec.extra.files.map(String) : [],
      ...(spec.extra.taskId ? { taskId: String(spec.extra.taskId) } : {}),
      ...(spec.extra.traceId ? { traceId: String(spec.extra.traceId) } : {}),
      ...(Array.isArray(spec.extra.catalogAgentIds)
        ? { catalogAgentIds: spec.extra.catalogAgentIds.map(String) }
        : {}),
      ...(workspaceFromExtra(spec.extra) ? { workspace: workspaceFromExtra(spec.extra) } : {}),
    };
  },
};
