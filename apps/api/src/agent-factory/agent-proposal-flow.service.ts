import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { Agent } from "@zibby/contracts";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service";
import { GateEvaluatorService } from "../gates/gate-evaluator.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** The floor-gated action name a candidate proposal is evaluated against (Phase 4d). */
const PROPOSE_ACTION = "agent.propose_new";

/** Detail max length kept short — the enrichment `summary` is a queue-card line. */
const CONTEXT_MAX_CHARS = 200;

/**
 * A `DiffHunk`-shaped preview line, mirroring `apps/web/features/approvals/approval.ts`
 * (`ApprovalPreview` kind `"diff"`) without importing across the app/api boundary —
 * this is JSON packed into the `Approval.detail` string, read back by the web's
 * `parseApprovalDetail`.
 */
interface FrontmatterPreview {
  summary: string;
  actorKind: "skill";
  glyph: "bot";
  preview: {
    kind: "diff";
    file: string;
    meta: string;
    hunks: Array<{ h: string; lines: Array<["add", string]> }>;
  };
}

/** Build the enrichment JSON packed into the approval's `detail` (Phase 4d). */
function buildEnrichment(agent: Agent): FrontmatterPreview {
  const frontmatterLines = [
    `name: ${agent.name ?? agent.id}`,
    `category: ${agent.category ?? "Proposed"}`,
    `tools: [${(agent.tools ?? []).join(", ")}]`,
    "status: proposed",
    agent.description ? `description: ${agent.description}` : undefined,
  ].filter((l): l is string => Boolean(l));
  return {
    summary: `New agent proposed: "${agent.name ?? agent.id}" — ${agent.description ?? "recurring orchestrator-fallback pattern"}`,
    actorKind: "skill",
    glyph: "bot",
    preview: {
      kind: "diff",
      file: `${agent.id}.md`,
      meta: "candidate agent (proposed)",
      hunks: [{ h: "frontmatter", lines: frontmatterLines.map((l) => ["add", l] as ["add", string]) }],
    },
  };
}

/**
 * The `agent-proposal` approval runner (Phase 4d) — the `ProposedTaskFlowService`
 * template applied to the Agent Factory. `propose()` writes the candidate agent
 * file (`status: "proposed"`, so it never enters a dispatchable catalog —
 * `AgentsStorageService.listActive`/Phase 4c), then evaluates `agent.propose_new`
 * through the gate. The locked floor rule (Phase 4d) guarantees `ask`, so this
 * always parks a Tier-3 approval; a `deny` (a stricter rule, should one ever
 * apply here) discards the candidate outright rather than parking it — the
 * evaluator's verdict is trusted, never bypassed. `resume()` on approve flips
 * the file to `status: "active"` (visible immediately — read-through storage,
 * Fáze 2's Zjištění 2); `cancel()` on reject deletes the candidate file, leaving
 * the approval record itself as the durable trace.
 */
@Injectable()
export class AgentProposalFlowService implements OnModuleInit, ResumableRunner {
  private readonly log: ScopedLogger;

  constructor(
    private readonly approvals: ApprovalsService,
    private readonly gate: GateEvaluatorService,
    private readonly agents: AgentsStorageService,
    logger: LoggerService,
  ) {
    this.log = logger.child(AgentProposalFlowService.name);
  }

  onModuleInit(): void {
    this.approvals.register("agent-proposal", this);
  }

  /** Write the candidate `.md`, gate it, and park a Tier-3 approval (or discard on deny). */
  async propose(candidate: Agent): Promise<void> {
    const written = await this.agents.create({ ...candidate, status: "proposed" });
    const floor = await this.gate.floor();
    const evaluation = this.gate.evaluate(floor, {
      action: PROPOSE_ACTION,
      scope: written.id,
      context: (written.description ?? written.name ?? written.id).slice(0, CONTEXT_MAX_CHARS),
    });

    if (evaluation.decision === "deny") {
      await this.agents.delete(written.id).catch(() => {});
      this.log.info("agent proposal denied by gate; candidate discarded", { id: written.id });
      return;
    }
    if (evaluation.decision !== "ask") {
      // The locked floor guarantees `ask` for `agent.propose_new` — reaching a
      // weaker decision would be a structural regression. Park anyway rather
      // than silently activate: Tier 3 is a floor commitment, never a soft default.
      this.log.warn("agent.propose_new resolved weaker than the floor's ask — parking anyway", {
        id: written.id,
        decision: evaluation.decision,
      });
    }

    await this.approvals.requestApproval({
      runId: written.id,
      kind: "agent-proposal",
      skill: "agent-factory",
      action: PROPOSE_ACTION,
      detail: JSON.stringify(buildEnrichment(written)),
      risk: "medium",
    });
    this.log.info("agent proposal parked for approval", { id: written.id });
  }

  /** Approve → flip the candidate's status to active (read-through storage — no restart needed). */
  async resume(agentId: string): Promise<void> {
    const agent = await this.agents.get(agentId).catch((): Agent | null => null);
    if (!agent || agent.status !== "proposed") {
      this.log.warn("agent-proposal resume skipped (not a pending candidate)", {
        agentId,
        status: agent?.status,
      });
      return;
    }
    await this.agents.update(agentId, { status: "active" });
    this.log.info("agent proposal approved; activated", { agentId });
  }

  /** Reject → delete the candidate file; the approval record remains as the trace. */
  cancel(agentId: string): void {
    void this.agents
      .get(agentId)
      .then((agent) => (agent.status === "proposed" ? this.agents.delete(agentId) : undefined))
      .catch(() => {});
  }
}
