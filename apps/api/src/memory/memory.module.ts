import { Module } from "@nestjs/common";
import { AUTOMATIONS_DIR, AutomationsStorageService } from "../automations/automations.storage.service";
import { CHAINS_DIR, ChainsStorageService } from "../chains/chains.storage.service";
import { CommandsModule } from "../commands/commands.module";
import { CompaniesModule } from "../companies/companies.module";
import { GOALS_DIR, GoalsStorageService } from "../goals/goals.storage.service";
import { HooksModule } from "../hooks/hooks.module";
import {
  INTEGRATIONS_DIR,
  INTEGRATION_STATE_DIR,
  IntegrationsStorageService,
} from "../integrations/integrations.storage.service";
import { McpModule } from "../mcp/mcp.module";
import { PROJECTS_DIR, ProjectsStorageService } from "../projects/projects.storage.service";
import { dataDir } from "../shared/data-dir";
import { SkillsModule } from "../skills/skills.module";
import { EntityMcpController } from "./entity-mcp.controller";
import { GroundingService } from "./grounding.service";
import { MemoryController } from "./memory.controller";
import { MemoryImportService } from "./memory-import.service";
import { VAULT_DIR, VaultService } from "./vault.service";

/**
 * Default vault dir, anchored to `apps/api/data/vault`. The dir is committed with
 * seed notes (north-star, a starter MOC); only the episodic `daily/` subdir is
 * gitignored. Real operation points `VAULT_DIR` at the operator's Obsidian vault.
 */
export function resolveVaultDir(): string {
  return process.env.VAULT_DIR ?? dataDir("vault");
}

/**
 * Phase 106: `EntityMcpController` (`list_entities` + `recall_memory`) needs
 * read access to ten catalogs. Five have leaf modules with no imports of their
 * own (`SkillsModule`/`McpModule`/`CommandsModule`/`HooksModule`/`CompaniesModule`)
 * — imported directly below, zero cycle risk. The other five
 * (projects/chains/integrations/goals/automations) all transitively import
 * `MemoryModule` already (`ProjectsModule` directly; `ChainsModule`/`GoalsModule`
 * via `ProjectsModule`; `IntegrationsModule` via `ProjectsModule` (forwardRef);
 * `AutomationsModule` via `MemoryDistillerModule`, which imports `MemoryModule`
 * directly) — importing THOSE modules here would close a Nest DI cycle. Instead
 * their storage services are re-provided directly (same precedent as
 * `ProjectsModule` re-providing its own `VAULT_DIR` rather than importing
 * `MemoryModule` for it): a second, independent instance, reading the same
 * on-disk directory. `EntityFileStore`/`MarkdownEntityStore` keep no in-memory
 * cache across instances, so two instances never diverge.
 */
@Module({
  imports: [SkillsModule, McpModule, CommandsModule, HooksModule, CompaniesModule],
  controllers: [MemoryController, EntityMcpController],
  providers: [
    { provide: VAULT_DIR, useFactory: resolveVaultDir },
    VaultService,
    MemoryImportService,
    GroundingService,
    { provide: PROJECTS_DIR, useFactory: () => process.env.PROJECTS_DIR ?? dataDir("projects") },
    ProjectsStorageService,
    { provide: CHAINS_DIR, useFactory: () => process.env.CHAINS_DIR ?? dataDir("chains") },
    ChainsStorageService,
    {
      provide: INTEGRATIONS_DIR,
      useFactory: () => process.env.INTEGRATIONS_DIR ?? dataDir("integrations"),
    },
    {
      provide: INTEGRATION_STATE_DIR,
      useFactory: () => process.env.INTEGRATION_STATE_DIR ?? dataDir("integration-state"),
    },
    IntegrationsStorageService,
    { provide: GOALS_DIR, useFactory: () => process.env.GOALS_DIR ?? dataDir("goals") },
    GoalsStorageService,
    {
      provide: AUTOMATIONS_DIR,
      useFactory: () => process.env.AUTOMATIONS_DIR ?? dataDir("automations"),
    },
    AutomationsStorageService,
  ],
  exports: [VaultService, MemoryImportService, GroundingService],
})
export class MemoryModule {}
