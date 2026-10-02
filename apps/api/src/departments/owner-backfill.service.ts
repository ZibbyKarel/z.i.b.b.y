import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { WorkflowsStorageService } from "../workflows/workflows.storage.service";
import { agentOwnersFromWorkflows, workflowOwnerSeed } from "./owner-seed";

/**
 * NS2 F1b — one-shot, idempotent startup backfill that tags every pre-F1
 * workflow / agent with its `department`, mirroring the proven
 * `sweepInlineAvatars` sweep pattern (`agents.storage.service.ts`): a
 * per-entity try/catch, atomic writes via each store's own `update`, never
 * fatal to boot. Idempotent by construction — an already-owned entity is
 * skipped, so re-running on every boot is a no-op once the fleet is tagged.
 *
 * Integrations are NOT backfilled: their federation membership is derived, not
 * stored (see `DepartmentsService.roster`).
 *
 * Runs after each injected store's own directory-ensure: constructor injection
 * gives Nest the dependency edges it needs to run THIS service's
 * `onModuleInit` after theirs.
 */
@Injectable()
export class OwnerBackfillService implements OnModuleInit {
  private readonly logger = new Logger(OwnerBackfillService.name);

  constructor(
    private readonly workflows: WorkflowsStorageService,
    private readonly agents: AgentsStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.backfillWorkflows();
    await this.backfillAgents();
  }

  private async backfillWorkflows(): Promise<void> {
    const all = await this.workflows.list();
    for (const workflow of all) {
      if (workflow.department) continue;
      const owner = workflowOwnerSeed(workflow.id);
      if (!owner) continue;
      await this.tag("workflow", workflow.id, () =>
        this.workflows.update(workflow.id, { department: owner }),
      );
    }
  }

  private async backfillAgents(): Promise<void> {
    const [allAgents, allWorkflows] = await Promise.all([
      this.agents.list(),
      this.workflows.list(),
    ]);
    const owners = agentOwnersFromWorkflows(allWorkflows);
    for (const agent of allAgents) {
      if (agent.department) continue;
      const owner = owners.get(agent.id);
      if (!owner) continue;
      await this.tag("agent", agent.id, () => this.agents.update(agent.id, { department: owner }));
    }
  }

  /** Per-entity try/catch — one bad write is logged and skipped, never fatal to boot. */
  private async tag(kind: string, id: string, write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (error) {
      this.logger.warn(`Skipping owner backfill for ${kind} "${id}": ${String(error)}`);
    }
  }
}
