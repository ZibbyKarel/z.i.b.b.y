import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { agentOwnersFromPipelines, integrationOwnerSeed, pipelineOwnerSeed } from "./owner-seed";

/**
 * NS2 F1b — one-shot, idempotent startup backfill that tags every pre-F1
 * pipeline / agent / integration with its `ownerSubsystem`, mirroring
 * the proven `sweepInlineAvatars` sweep pattern (`agents.storage.service.ts`):
 * a per-entity try/catch, atomic writes via each store's own `update`, never
 * fatal to boot. Idempotent by construction — an already-owned entity is
 * skipped, so re-running on every boot is a no-op once the fleet is tagged.
 *
 * Runs after each injected store's own directory-ensure: constructor injection
 * gives Nest the dependency edges it needs to run THIS service's
 * `onModuleInit` after theirs.
 */
@Injectable()
export class OwnerBackfillService implements OnModuleInit {
  private readonly logger = new Logger(OwnerBackfillService.name);

  constructor(
    private readonly pipelines: PipelinesStorageService,
    private readonly agents: AgentsStorageService,
    private readonly integrations: IntegrationsStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.backfillPipelines();
    await this.backfillAgents();
    await this.backfillIntegrations();
  }

  private async backfillPipelines(): Promise<void> {
    const all = await this.pipelines.list();
    for (const pipeline of all) {
      if (pipeline.ownerSubsystem) continue;
      const owner = pipelineOwnerSeed(pipeline.id);
      if (!owner) continue;
      await this.tag("pipeline", pipeline.id, () =>
        this.pipelines.update(pipeline.id, { ownerSubsystem: owner }),
      );
    }
  }

  private async backfillAgents(): Promise<void> {
    const [allAgents, allPipelines] = await Promise.all([
      this.agents.list(),
      this.pipelines.list(),
    ]);
    const owners = agentOwnersFromPipelines(allPipelines);
    for (const agent of allAgents) {
      if (agent.ownerSubsystem) continue;
      const owner = owners.get(agent.id);
      if (!owner) continue;
      await this.tag("agent", agent.id, () =>
        this.agents.update(agent.id, { ownerSubsystem: owner }),
      );
    }
  }

  private async backfillIntegrations(): Promise<void> {
    const all = await this.integrations.list();
    for (const integration of all) {
      if (integration.ownerSubsystem) continue;
      await this.tag("integration", integration.id, () =>
        this.integrations.update(integration.id, { ownerSubsystem: integrationOwnerSeed() }),
      );
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
